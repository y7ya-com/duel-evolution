import type { DuelState, Player, PresentationEvent } from './types';
import type { TimelineSample } from './timeline';

/** IDs are source playSe calls; filenames are matching zero-based data/etc/se.txt lines.
 * `volume` is that line's second column (0..127), the original per-file effect volume. */
export const DUEL_SOUND_EVIDENCE = {
  attack: { id: 0x10000006, path: 'se/attack.wav', volume: 122, source: 'SceneBattleManager.cpp draw: SE_ATTACK_SWING, counter == 0x90' },
  impact: { id: 0x10000009, path: 'se/damage.wav', volume: 125, source: 'SceneBattleManager.cpp update: conditional SE_ATTACK_HIT after battle flags/damage' },
  summon: { id: 0x1000000e, path: 'se/reborn.wav', volume: 125, source: 'EngineCmd6.cpp engCmdSummon (0x2d), RUN_SUMMON view 0x35 / reborn.wav' },
  damage: { id: 0x10000009, path: 'se/damage.wav', volume: 125, source: 'LP gauge 0x007cefc0, signed amount negative, sound call0x007cf004' },
  recover: { id: 0x1000001b, path: 'se/life_up.wav', volume: 126, source: 'LP gauge 0x007cefc0, signed amount nonnegative, sound call0x007cf004' },
  turn: { id: 0x10000005, path: 'se/turn_change.wav', volume: 120, source: 'View6→0x007d46c0→0x007d4720 player changed→sound call0x007d4762' },
  battlePhase: { id: 0x10000011, path: 'se/battle_turn.wav', volume: 125, source: 'View5 phase3→0x007d3d90→sound call0x007d3dea' },
  move: { id: 0x1000000f, path: 'se/card_move.wav', volume: 122, source: 'View 0x19 (dispatcher 0x0073de88): subkind P0>>16 in {0,1,3,4} → table 0x00741ca8 → sound call 0x0073dfd2' },
  destroy: { id: 0x10000008, path: 'se/card_normal_brake.wav', volume: 126, source: 'EngineCmd3.cpp engCmdDestroy (0x31) CARD_BREAK view 0x1e; break.txt effect 0x007a46b0, push 0x10000008 at 0x007a487a' },
  battleDestroy: { id: 0x10000007, path: 'se/card_attacked_brake.wav', volume: 122, source: 'explosion.txt / duel_ef_break_a effects 0x007a4ce0, 0x007b1120, push 0x10000007 at 0x007a4e4b / 0x007b1414 (a card broken by battle)' },
  tribute: { id: 0x1000000c, path: 'se/ikenie.wav', volume: 123, source: 'yo2SummonManager.cpp 0x007ee020, push 0x1000000c at 0x007ee0a7 (0x46 tribute)' },
  activate: { id: 0x1000000d, path: 'se/magic_active.wav', volume: 120, source: 'activation effects 0x007a3e90 / 0x007a44a0 / 0x007b4580: SE13 when their counter is 0 (0x12 chain set)' },
  chain: { id: 0x1000001a, path: 'se/chain.wav', volume: 123, source: 'chain.txt plaque 0x00763610, push 0x1000001a at 0x0076374e; not for the first link' },
  coin: { id: 0x10000019, path: 'se/coin.wav', volume: 127, source: '0x007ab4f0, push 0x10000019 at 0x007ab5ee: at each coin\'s relative counter 0 (0x5c)' },
  dice: { id: 0x10000018, path: 'se/dice.wav', volume: 127, source: '0x007aa990, push 0x10000018 at 0x007aafa1: counter == 0x100 and == 0x180, the die\'s two landings (0x5d)' },
} as const;
/** Relative linear gain for a se.txt volume (127 = 1). The original's conversion of this
 * value into DirectSound attenuation is not verified; this is a proportional scale only. */
export function duelSoundGain(volume: number): number {
  if (!Number.isInteger(volume) || volume < 0 || volume > 127) throw new Error('Invalid duel sound volume');
  return volume / 127;
}
/** When a frame-timed sound plays after its cue starts, in the rewrite's duel-fx timeline (ui/duel-fx.ts, live's films
 * L-dice1 / L-coin3). The original's die lands twice (at 0x100 and 0x180 of its roll): in the fx it comes down in the
 * field's middle at 870 ms and its roll there ends at 1150. Each coin sounds at its own relative counter 0: its toss,
 * 500 ms after the last coin's. The chain plaque and the activation effect start with their cue. */
export const DUEL_SOUND_DELAYS = { dice: [870, 1150], coinStagger: 500 } as const;
export interface DuelSoundCue {
  readonly sequence: number; readonly ordinal: number; readonly player: Player;
  readonly kind: keyof typeof DUEL_SOUND_EVIDENCE;
  readonly id: number; readonly path: string;
  /** se.txt per-file volume (0..127) and its relative gain; see duelSoundGain. */
  readonly volume: number; readonly gain: number;
  /** Milliseconds after the cue's effect starts (frame-timed sounds); absent = at once. */
  readonly delay?: number;
}
export interface DuelAudioOptions { maxQueuedCues?: number; maxCuesPerSample?: number; muted?: boolean; reducedMotion?: boolean; }
export interface DuelAudioCounters { enqueued: number; emitted: number; muted: number; dropped: number; skipped: number; }
function limit(n: number | undefined, fallback: number, max: number): number {
  const value = n ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error('Invalid duel audio budget');
  return value;
}
function sequence(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid duel audio sequence'); return n;
}
const MOVE_COMMANDS = new Set(['engine:3d', 'engine:3f', 'engine:40', 'engine:41', 'engine:4f', 'engine:50']);
function hitFlag(n: number): boolean { return !!(n & 2) || (n & 0x1c) === 4; }

/** Pure cue director. Feed packet states once, then consume each displayed timeline
 * sample. Returned cues are already consumed, including muted/unavailable playback;
 * never retry them after a late browser audio activation. Owns no audio manager,
 * timers, media elements, asset leases, or unbounded event history. */
export class DuelAudioDirector {
  private queue: DuelSoundCue[] = [];
  private enqueuedThrough: number;
  private acknowledged: number;
  private skippedEvents = 0;
  private attack: { player: Player; targetPlayer: Player; targetField: boolean; destroyed?: boolean } | null = null;
  private battleGauge: [number, number] = [0, 0];
  private deckLeft: [number, number] = [0, 0];
  private muted: boolean;
  private reducedMotion: boolean;
  private closed = false;
  private readonly maxQueued: number;
  private readonly maxSample: number;
  private counts: DuelAudioCounters = { enqueued: 0, emitted: 0, muted: 0, dropped: 0, skipped: 0 };
  constructor(initialSequence = 0, options: DuelAudioOptions = {}) {
    this.enqueuedThrough = this.acknowledged = sequence(initialSequence);
    this.maxQueued = limit(options.maxQueuedCues, 64, 1024); this.maxSample = limit(options.maxCuesPerSample, 8, 16);
    this.muted = options.muted ?? false; this.reducedMotion = options.reducedMotion ?? false;
  }
  get pendingCues(): number { return this.queue.length; }
  get counters(): Readonly<DuelAudioCounters> { return { ...this.counts }; }
  enqueue(previous: DuelState, next: DuelState): void {
    if (this.closed) return;
    if (previous.sequence !== this.enqueuedThrough || next.sequence <= previous.sequence) throw new Error('Duel audio states must be enqueued once in packet order');
    const events = next.events.filter(e => e.sequence > previous.sequence);
    // Draw 0x55 stops when the deck runs out, so its card_move count is bounded by the cards left.
    this.deckLeft = [previous.sides[0].deck.length, previous.sides[1].deck.length];
    for (let ordinal = 0; ordinal < events.length; ordinal++) {
      const event = events[ordinal];
      for (const { kind, player = event.player, delay } of this.cues(event)) {
        this.counts.enqueued++;
        if (this.queue.length >= this.maxQueued) { this.queue.shift(); this.counts.dropped++; }
        const { id, path, volume } = DUEL_SOUND_EVIDENCE[kind];
        this.queue.push({ sequence: event.sequence, ordinal, player, kind, id, path, volume, gain: duelSoundGain(volume), ...(delay ? { delay } : {}) });
      }
    }
    this.enqueuedThrough = next.sequence;
  }
  private cues(event: PresentationEvent): { kind: DuelSoundCue['kind']; player?: Player; delay?: number }[] {
    const p = event.params;
    // 0x31 CARD_BREAK from a field slot (P0 low byte 0..10; 11+ are the hand and piles): broken by battle while an
    // attack that destroyed something is still open (0x17 with destroyed flags, until 0x1c), otherwise a normal break.
    if (event.type === 'engine:31') return (p[0] & 0xff) <= 10 ? [{ kind: this.attack?.destroyed ? 'battleDestroy' : 'destroy' }] : [];
    if (event.type === 'engine:46') return [{ kind: 'tribute' }];
    if (event.type === 'engine:12') return p[2] > 1 ? [{ kind: 'activate' }, { kind: 'chain' }] : [{ kind: 'activate' }];
    if (event.type === 'engine:5c') {
      const n = Math.max(1, Math.min(5, (p[0] >>> 6) & 0xff || 1));
      return this.reducedMotion ? [{ kind: 'coin' }] : Array.from({ length: n }, (_, i) => i ? { kind: 'coin' as const, delay: i * DUEL_SOUND_DELAYS.coinStagger } : { kind: 'coin' as const });
    }
    if (event.type === 'engine:5d') return p[1] ? this.reducedMotion ? [{ kind: 'dice' }] : DUEL_SOUND_DELAYS.dice.map(delay => ({ kind: 'dice' as const, delay })) : [];
    if (event.type === 'engine:19' || event.type === 'engine:1a') {
      this.attack = { player: event.player, targetPlayer: (event.type === 'engine:19' ? p[1] & 1 : event.player ^ 1) as Player,
        targetField: event.type === 'engine:19' && ((p[1] >>> 8) & 255) < 5 };
      this.battleGauge = [0, 0]; return [{ kind: 'attack' }];
    }
    if (event.type === 'engine:17') {
      if (!this.attack || this.attack.player !== event.player) return [];
      const flags = p[2] ?? 0, attacker = (flags >>> (8 * event.player)) & 255, defender = (flags >>> (8 * (event.player ^ 1))) & 255;
      this.attack.destroyed = !!((attacker | defender) & 2);   // translator _m_BATTLE: bit 2 = that side was destroyed
      // The battle manager starts the same LP gauge used by commands24/25.
      // Subsequent equal-amount LP commands finish that gauge without a second sound.
      this.battleGauge = [0, 0]; const result: { kind: DuelSoundCue['kind']; player: Player }[] = [];
      for (const i of [0, 1] as const) if (p[i] > 0) {
        let player = i === this.attack.player ? i : this.attack.targetPlayer;
        if ((flags >>> (8 * i)) & 8) player = (player ^ 1) as Player;
        this.battleGauge[player] = p[i]; result.push({ kind: 'damage', player });
      }
      if (result.length) return result;
      return hitFlag(attacker) || this.attack.targetField && hitFlag(defender) ? [{ kind: 'impact' }] : [];
    }
    if (event.type === 'engine:24' || event.type === 'engine:25') {
      const alreadyPlayed = event.type === 'engine:25' && p[0] > 0 && this.battleGauge[event.player] === p[0];
      this.battleGauge[event.player] = 0;
      return alreadyPlayed ? [] : [{ kind: event.type === 'engine:24' || p[0] === 0 ? 'recover' : 'damage' }];
    }
    if (event.type === 'engine:55') {
      // engCmdDraw issues one view 0x19 subkind0 per drawn card (EngineCmd5.cpp step1, repeated P1 times).
      const n = Math.max(0, Math.min(p[1] ?? 0, this.deckLeft[event.player])); this.deckLeft[event.player] -= n;
      return Array.from({ length: n }, () => ({ kind: 'move' as const }));
    }
    // View 0x19 subkind0: moves 0x3d / 0x3f / 0x40 / 0x41; subkind1/4: 0x4f face-up summon / set;
    // subkind3/4: 0x50 face-up / face-down spell-trap placement. 0x2d uses subkind2 (no card_move).
    if (MOVE_COMMANDS.has(event.type)) return [{ kind: 'move' }];
    if (['engine:1', 'engine:4', 'engine:5', 'engine:15', 'engine:1c'].includes(event.type)) { this.attack = null; this.battleGauge = [0, 0]; }
    return event.type === 'engine:2d' ? [{ kind: 'summon' }] : event.type === 'engine:4' ? [{ kind: 'turn', player: (event.player ^ 1) as Player }]
      : event.type === 'engine:f' ? [{ kind: 'battlePhase' }] : [];
  }
  consumeSample(sample: Pick<TimelineSample, 'effects' | 'acknowledgedThrough' | 'skippedEvents'>): DuelSoundCue[] {
    if (this.closed) return [];
    const ack = sequence(sample.acknowledgedThrough), skipped = sequence(sample.skippedEvents);
    if (ack < this.acknowledged || ack > this.enqueuedThrough || skipped < this.skippedEvents) throw new Error('Duel audio timeline sample is out of order');
    const skip = skipped > this.skippedEvents && !this.reducedMotion;
    const visible = new Set(sample.effects.map(e => e.event.sequence)), output: DuelSoundCue[] = [], future: DuelSoundCue[] = [];
    for (const cue of this.queue) {
      const started = visible.has(cue.sequence), completed = cue.sequence <= ack;
      if (!started && !completed) { future.push(cue); continue; }
      if (skip && completed && !started) { this.counts.skipped++; continue; }
      if (this.muted) { this.counts.muted++; continue; }
      if (output.length >= this.maxSample) { this.counts.dropped++; continue; }
      output.push(cue); this.counts.emitted++;
    }
    this.queue = future; this.acknowledged = ack; this.skippedEvents = skipped;
    return output;
  }
  setMuted(value: boolean): void { this.muted = value; }
  /** Reduced motion changes cue compression at acknowledgements, independently of mute. */
  setReducedMotion(value: boolean): void { this.reducedMotion = value; }
  reset(initialSequence = 0): void {
    if (this.closed) return;
    this.enqueuedThrough = this.acknowledged = sequence(initialSequence); this.skippedEvents = 0;
    this.queue = []; this.attack = null; this.battleGauge = [0, 0]; this.counts = { enqueued: 0, emitted: 0, muted: 0, dropped: 0, skipped: 0 };
  }
  dispose(): void { this.closed = true; this.queue = []; this.attack = null; this.battleGauge = [0, 0]; }
}

/** SceneDuelScene.cpp fieldBgm kind switch. This accepts the original scene's kind,
 * not a passcode/internal ID; deriving kind from a card is deliberately separate. */
export function fieldAudioSlot(kind: number, baseSlot: number): number {
  if (!Number.isInteger(kind) || kind < 0 || !Number.isInteger(baseSlot) || baseSlot < 11 || baseSlot > 20) throw new Error('Invalid duel field audio selection');
  const slots = [baseSlot, 34, 35, 32, 33, 31, 30, 43, 37, 38, 42, 41, 39, 40, 36];
  return kind === 0x16 ? 44 : slots[kind] ?? 45;
}
