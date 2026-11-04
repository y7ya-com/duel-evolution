import type { DuelState, Location, Player, PresentationEvent, Zone } from './types';
import type { DuelCue, DuelCuePlace } from '../ui/contracts';

/** Presentation cues for the duel effects layer (summon, attack, destroy, LP damage, phase names, coin, dice, chain
 * links...). They are read from the server's presentation commands (the original's EngineCmd handlers, see
 * client/src/duel/EngineCmd5.cpp / EngineCmd6.cpp for the parameter layouts) and never change duel state.
 * A cue is released when the visual timeline reaches the packet it came with, so it plays with its card motion. */
const ZONES: Record<Zone, DuelCuePlace['zone']> = { monster: 'monster', spell: 'spell', hand: 'hand', deck: 'deck', extra: 'extra', grave: 'graveyard', banish: 'banished' };
const PHASES: Record<number, NonNullable<DuelCue['phase']>> = { 0x0c: 'draw', 0x0d: 'standby', 0x0e: 'main1', 0x0f: 'battle', 0x10: 'main2', 0x11: 'end' };
const MAX_PENDING = 256, MAX_RELEASED = 48;

export interface CueResolver {
  /** 'monster' | 'spell' | 'trap' of a known passcode. */
  cardKind?(passcode: number): DuelCue['cardKind'] | undefined;
  /** The original field theme (1..) of a field spell passcode. */
  fieldKind?(passcode: number): number | null | undefined;
}

function place(at: Location | undefined | null): DuelCuePlace | undefined {
  return at ? { controller: at.player, zone: ZONES[at.zone], index: at.index } : undefined;
}
/** A field slot of the original's numbering: 0..4 monsters, 5..9 spells/traps, 10 the field spell zone. */
function slot(player: Player, n: number): DuelCuePlace | undefined {
  if (n >= 0 && n <= 4) return { controller: player, zone: 'monster', index: n };
  if (n >= 5 && n <= 10) return { controller: player, zone: 'spell', index: n - 5 };
  return undefined;
}

export class DuelCueQueue {
  private pending: { after: number; cue: DuelCue }[] = [];
  private released: DuelCue[] = [];
  private nextId = 1;

  constructor(private readonly resolver: CueResolver = {}) {}

  /** Read the presentation events of one reduced packet. `previous` must be the state before it. */
  collect(previous: DuelState, next: DuelState): void {
    const events = next.events.filter(e => e.sequence > previous.sequence);
    const seen = new Set<string>();
    for (const e of events) {
      const cue = this.cue(previous, next, e);
      if (!cue) continue;
      // One packet can carry the same summon twice (the move and its summon view): play it once.
      const key = `${cue.kind}:${cue.at?.controller}:${cue.at?.zone}:${cue.at?.index}`;
      if (['summon', 'set', 'flip', 'destroy'].includes(cue.kind) && seen.has(key)) continue;
      seen.add(key);
      this.pending.push({ after: previous.sequence, cue });
    }
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
  }

  /** Cues whose packet the timeline has reached. Returns the same array until something new is released. */
  release(acknowledgedThrough: number): readonly DuelCue[] {
    const due = this.pending.filter(p => p.after <= acknowledgedThrough);
    if (!due.length) return this.released;
    this.pending = this.pending.filter(p => p.after > acknowledgedThrough);
    this.released = [...this.released, ...due.map(p => p.cue)].slice(-MAX_RELEASED);
    return this.released;
  }

  /** A new duel: drop everything queued, but never reuse cue ids (the effects layer only plays ids it has not seen). */
  reset(): void { this.pending = []; this.released = []; }

  private cue(previous: DuelState, next: DuelState, e: PresentationEvent): DuelCue | null {
    const m = /^engine:([0-9a-f]+)$/.exec(e.type); if (!m) return null;
    const cmd = parseInt(m[1]!, 16), p = e.params, who = e.player;
    const make = (kind: DuelCue['kind'], extra: Partial<DuelCue> = {}): DuelCue => ({ id: this.nextId++, kind, player: who, ...extra });
    const now = e.card === undefined ? undefined : next.cards[e.card], before = e.card === undefined ? undefined : previous.cards[e.card];
    const kindOf = (passcode: number | null | undefined, hidden?: DuelCue['cardKind'] | null) => (passcode != null ? this.resolver.cardKind?.(passcode) : undefined) ?? hidden ?? undefined;
    const withKind = (card: typeof now) => { const k = kindOf(card?.passcode, card?.hiddenKind); return k ? { cardKind: k } : {}; };
    if (PHASES[cmd]) return make('phase', { phase: PHASES[cmd] });
    switch (cmd) {
      case 0x01: return make('start');
      case 0x04: return make('turn', { player: (who ^ 1) as Player });
      case 0x2c: { const at = slot(who, p[1] ?? -1); return at ? make('summon', { at }) : null; }
      case 0x2d: case 0x48: { const at = place(now) ?? slot((p[0]! & 1) as Player, (p[0]! >>> 1) & 31); return at ? make('summon', { at, ...withKind(now) }) : null; }
      case 0x4f: case 0x50: {
        const at = place(now); if (!at) return null;
        const faceUp = !!(p[1]! & 0x4000);
        return make(cmd === 0x4f ? faceUp ? 'summon' : 'set' : faceUp ? 'activate' : 'set', { at, ...withKind(now) });
      }
      case 0x35: { const at = slot(who, p[0]!) ?? place(now); return at && !(p[2]! & 8) ? make('flip', { at, ...withKind(now) }) : null; }
      case 0x12: {
        const card = next.cards[p[1]!] ?? now, at = place(card) ?? slot(who, p[0]!);
        return at ? make('activate', { at, link: p[2], ...withKind(card) }) : null;
      }
      case 0x13: return make('chain-run', { link: p[2] });
      case 0x19: {
        const at = slot(who, p[0]!), target = slot((p[1]! & 1) as Player, (p[1]! >>> 8) & 255);
        return at ? make('attack', { at, ...(target ? { target } : { direct: true }) }) : null;
      }
      case 0x1a: { const at = slot(who, p[0]!); return at ? make('attack', { at, direct: true }) : null; }
      case 0x31: case 0x32: case 0x46: {
        // The destroyed card's slot before it moved (its own uid, or the slot the command names).
        const field = before && (before.zone === 'monster' || before.zone === 'spell') ? place(before) : slot(who, cmd === 0x32 ? p[0]! : p[0]! & 255);
        if (!field || field.zone === 'hand') return null;
        return make(cmd === 0x46 ? 'tribute' : 'destroy', { at: field, ...(before?.defense && field.zone === 'monster' ? { defense: true } : {}), ...withKind(before) });
      }
      case 0x25: return p[0] ? make('damage', { value: p[0] }) : null;
      case 0x24: return p[0] ? make('recover', { value: p[0] }) : null;
      case 0x5c: {
        // P0 = j | zone << 1 | n << 6 | called << 14 (the tossing card's slot); P2 bit k set: coin k is heads
        // (server/src/duel/translator/translator.ts _m_TOSS_COIN).
        const count = Math.max(1, Math.min(5, (p[0]! >>> 6) & 0xff || 1)), at = slot((p[0]! & 1) as Player, (p[0]! >>> 1) & 31);
        return make('coin', { ...(at ? { at } : {}), values: Array.from({ length: count }, (_, k) => (p[2]! >>> k) & 1) });
      }
      // P0 = the rolling card's slot, P1 = 1..6 (translator _m_TOSS_DICE).
      case 0x5d: { const at = slot(who, p[0]!); return p[1] ? make('dice', { ...(at ? { at } : {}), value: p[1] }) : null; }
      case 0x14: {
        const kind = p[0] ? this.resolver.fieldKind?.(p[0]) : 0;
        return kind ? make('field', { value: kind }) : null;
      }
      default: return null;
    }
  }
}
