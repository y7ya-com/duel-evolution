// The Duel Log (duelText.ts; duellog.ts is the replay record): plain-English lines from duelcore's events (summons, activations, chains, negations, dice and coins,
// destruction, attacks, damage and LP, phases), for the client's "Duel Log" chat tab (ovr/duellog.c). Only public
// information: a face-down card is "a set card" until it is face-up or in the Graveyard, and nobody's hand is named.
// Lines are ASCII (the 2008 chat line is single-byte) and at most 120 characters.
type Ev = Record<string, any>;   // a duelcore event (engine/core.ts Json, read loosely)

const LOC_MZONE = 0x04, LOC_SZONE = 0x08, LOC_GRAVE = 0x10, LOC_REMOVED = 0x20;
const POS_FACEUP = 0x05;
const REASON_DESTROY = 0x1, REASON_BATTLE = 0x20;
const PHASES: Record<number, string> = { 0x04: "Main Phase 1",   // Draw and Standby left out: every turn, rarely news
  0x08: "Battle Phase", 0x100: "Main Phase 2", 0x200: "End Phase" };
export const LINE_MAX = 120;

export interface CardText { name(code: number): string; stats(code: number): { atk: number; def: number } }

interface Link { who: number; name: string; destroyed: string[]; negated: boolean }

export class DuelLog {
  private turn = 0;
  private lp: [number, number];
  private chain: Link[] = [];
  private solving = 0;
  private hintCard = 0;
  private roll: string | null = null;   // the dice line just written, joined to a negation that follows it
  /** Field cards by "player:location:sequence" -> [code, position] (ATTACK names no code). */
  private field = new Map<string, [number, number]>();

  constructor(readonly names: [string, string], readonly cards: CardText, lp = 8000) { this.lp = [lp, lp]; }

  private who(p: number): string { return this.names[p & 1]; }
  private card(code: number): string { return this.cards.name(code) || "a card"; }
  /** A card's name when its face is public where it is: face-up, or in the Graveyard. */
  private seen(code: number, loc: number, pos: number): string {
    return code && (loc === LOC_GRAVE || (pos & POS_FACEUP) !== 0) ? this.card(code) : "a set card";
  }
  private at(c: Ev): [number, number] | undefined { return this.field.get(`${c.controller}:${c.location}:${c.sequence}`); }
  private put(c: Ev, v: [number, number] | undefined): void {
    if (!(c.location & (LOC_MZONE | LOC_SZONE))) return;
    const k = `${c.controller}:${c.location}:${c.sequence}`;
    if (v) this.field.set(k, v); else this.field.delete(k);
  }
  /** "<player>'s <card>" for a field card: its name when face-up, else "set card". */
  private owned(c: Ev): string {
    const v = this.at(c), n = v ? this.seen(v[0], c.location, v[1]) : "a set card";
    return `${this.who(c.controller)}'s ${n === "a set card" ? "set card" : n}`;
  }

  private lpLine(p: number, what: string, d: number): string {
    const a = this.lp[p & 1], b = Math.max(0, a + d);
    this.lp[p & 1] = b;
    return `${this.who(p)} ${what} (LP ${a} -> ${b})`;
  }

  /** The lines for one batch of duelcore events; a failure costs the log, never the duel. */
  feed(evs: readonly Ev[]): string[] {
    try { return this.lines(evs); } catch { return []; }
  }

  private lines(evs: readonly Ev[]): string[] {
    const out: string[] = [];
    const say = (s: string) => { out.push(s.length > LINE_MAX ? s.slice(0, LINE_MAX - 3) + "..." : s); };
    for (const e of evs) {
      if (e.ev !== "msg") continue;
      const t = e.type as string;
      if (t !== "HINT" && t !== "TOSS_DICE" && t !== "CHAIN_NEGATED" && t !== "CHAIN_DISABLED") this.roll = null;
      switch (t) {
        case "NEW_TURN": say(`Turn ${++this.turn} - ${this.who(e.player)}'s turn`); break;
        case "NEW_PHASE": if (PHASES[e.phase]) say(PHASES[e.phase]); break;
        case "SUMMONING": case "SPSUMMONING": case "FLIPSUMMONING": {
          const how = t === "SUMMONING" ? "Normal Summoned" : t === "SPSUMMONING" ? "Special Summoned" : "Flip Summoned";
          this.put(e, [e.code, e.position]);
          const s = this.cards.stats(e.code);
          // a Special Summon in face-down Defense Position (Swap Frog, ...) names nothing, like a Set
          if (!(e.position & POS_FACEUP)) say(`${this.who(e.controller)} ${how} a face-down monster`);
          else say(`${this.who(e.controller)} ${how} ${this.card(e.code)} (${s.atk}/${s.def})`);
          break;
        }
        case "SET": this.put(e, [e.code, e.position]); say(`${this.who(e.controller)} Set ${e.location === LOC_MZONE ? "a monster" : "a card"}`); break;
        case "CHAINING": {
          const l: Link = { who: e.controller, name: this.card(e.code), destroyed: [], negated: false };
          this.chain.push(l);
          say(`${this.who(l.who)} activated ${l.name}`);
          break;
        }
        case "CHAIN_SOLVING": this.solving = e.chain_size; break;
        case "CHAIN_SOLVED": {
          const l = this.chain[e.chain_size - 1];
          if (l && l.negated) for (const d of l.destroyed) say(`${d} was destroyed`);
          else if (l && l.destroyed.length >= 2) say(`${l.name} destroyed ${l.destroyed.length} cards: ${l.destroyed.join(", ")}`);
          else if (l && l.destroyed.length === 1) say(`${l.destroyed[0]} was destroyed by ${l.name}`);
          else if (l && this.chain.length > 1) say(`${l.name} resolved`);
          this.solving = 0;
          break;
        }
        case "CHAIN_NEGATED": case "CHAIN_DISABLED": {
          const l = this.chain[e.chain_size - 1];
          if (!l) break;
          l.negated = true;
          const neg = `${this.who(l.who)}'s ${l.name} was negated`;
          if (this.roll && out[out.length - 1] === this.roll) out[out.length - 1] = `${this.roll} -> ${neg}`;
          else say(neg);
          this.roll = null;
          break;
        }
        case "CHAIN_END": this.chain = []; this.solving = 0; break;
        case "HINT": if (e.hint_type === 10) this.hintCard = e.hint; break;   // HINT_CARD: this card's effect applies
        case "TOSS_DICE": {
          const n = (e.results as number[]).join(" and ");
          const by = this.hintCard ? `${this.who(e.player)}'s ${this.card(this.hintCard)}` : this.who(e.player);
          say(`Turn ${this.turn} - ${by} rolled a ${n}`);
          this.roll = out[out.length - 1];
          break;
        }
        case "TOSS_COIN": say(`Coin toss: ${(e.results as unknown[]).map((r) => (r ? "Heads" : "Tails")).join(", ")}`); break;
        case "MOVE": {
          const f = e.from, to = e.to;
          this.put(f, undefined);
          this.put(to, [e.card, to.position]);
          if (!(f.location & (LOC_MZONE | LOC_SZONE)) || !(to.location & (LOC_GRAVE | LOC_REMOVED)) || !(e.reason & REASON_DESTROY)) break;
          const name = this.seen(e.card, to.location, to.position);
          const l = this.solving ? this.chain[this.solving - 1] : null;
          if (l) l.destroyed.push(name);
          else say(`${name} was destroyed${e.reason & REASON_BATTLE ? " by battle" : ""}`);
          break;
        }
        case "POS_CHANGE": this.put(e, [e.code, e.position]); break;
        case "SWAP": {
          const a = this.at(e.card1), b = this.at(e.card2);
          this.put(e.card1, b);
          this.put(e.card2, a);
          break;
        }
        case "ATTACK": {
          const a = e.card, tg = e.target && e.target.location ? e.target : null;
          say(tg ? `${this.owned(a)} attacks ${this.owned(tg)}` : `${this.owned(a)} attacks directly`);
          break;
        }
        case "DAMAGE": say(this.lpLine(e.player, `took ${e.amount} damage`, -e.amount)); break;
        case "RECOVER": say(this.lpLine(e.player, `gained ${e.amount} LP`, e.amount)); break;
        case "PAY_LPCOST": say(this.lpLine(e.player, `paid ${e.amount} LP`, -e.amount)); break;
        case "LPUPDATE": if (e.lp !== this.lp[e.player & 1]) say(this.lpLine(e.player, "LP set", e.lp - this.lp[e.player & 1])); break;
        case "WIN": say(e.player === 0 || e.player === 1 ? `${this.who(e.player)} wins the duel` : "The duel is a draw"); break;
      }
      if (t !== "HINT") this.hintCard = 0;
    }
    return out;
  }
}
