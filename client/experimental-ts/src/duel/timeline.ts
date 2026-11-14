import { visibleCards } from './model';
import type { DuelCard, DuelState, Player, PresentationEvent, Zone } from './types';

export const TIMING_EVIDENCE = {
  cardFrames: { frames: 8, evidence: 'source', source: 'client/src/duel/SceneCard.cpp CCard::step: anim += 0x20 until 0x100' },
  flashFrames: { frames: 32, evidence: 'source', source: 'client/src/duel/SceneCard.h popCounterBadge/popLockBadge; step decrements 0x200 by 0x10' },
  lpFrames: { frames: 32, evidence: 'source', source: 'the LP gauge (yo2.exe 0x7cefc0 / 0x7cf070, CDuelScene + 0xa9c): a change shows its number for 32 frames (+8 a frame to 0x100) before the gauge counts it, 100 LP a frame (10 under 100, 1 under 10); lpCountFrames' },
  attackFrames: { frames: 16, evidence: 'policy', source: 'Provisional attack emphasis; original attack animation sequence not established' },
  chainFrames: { frames: 16, evidence: 'policy', source: 'Provisional chain emphasis; original chain animation sequence not established' },
} as const;

export interface CardPlacement {
  uid: number; owner: Player; player: Player; zone: Zone; index: number;
  faceUp: boolean; defense: boolean; passcode: number | null; handCount: number;
}
interface DisplayFrame { cards: CardPlacement[]; lp: [number, number] }
interface Batch {
  sequence: number; from: DisplayFrame; to: DisplayFrame;
  events: PresentationEvent[]; duration: number; elapsed: number;
  /** Frames an LP change's number holds before the gauge counts it. */
  hold: number;
}
export interface TimelineCard {
  uid: number; from: CardPlacement | null; to: CardPlacement | null;
  progress: number; eased: number; opacity: number;
}
export interface TimelineEffect { event: PresentationEvent; progress: number }
export interface TimelineSample {
  cards: TimelineCard[]; lp: [number, number]; effects: TimelineEffect[];
  pending: boolean; queuedBatches: number; retainedCards: number;
  acknowledgedThrough: number; consumedEvents: number; skippedEvents: number;
}
export interface TimelineOptions {
  maxBatches?: number; maxRetainedCards?: number; reducedMotion?: boolean;
  lpFrames?: number; attackFrames?: number; chainFrames?: number;
}

/** The LP gauge's count (yo2.exe 0x7cf070): each 30 Hz frame it takes 100 LP off what is left to count, 10 when less
 *  than 100 is left, 1 under 10, so the count runs at a fixed rate (1800 LP: 18 frames, 600 ms; filmed on live,
 *  v2hand-me opp2: 1800 in ~600 ms, 1500 in ~500 ms). */
export function lpGaugeStep(left: number): number { return left >= 100 ? 100 : left >= 10 ? 10 : left > 0 ? 1 : 0; }
/** Frames the gauge takes to count `amount` LP. */
export function lpCountFrames(amount: number): number {
  const a = Math.abs(Math.trunc(amount)); return Math.floor(a / 100) + Math.floor(a % 100 / 10) + a % 10;
}
/** What is left to count of `amount` after `frames` frames of counting. */
export function lpLeft(amount: number, frames: number): number {
  let left = Math.abs(Math.trunc(amount));
  const hundreds = Math.min(Math.max(0, Math.floor(frames)), Math.floor(left / 100)); left -= hundreds * 100; frames -= hundreds;
  while (frames-- >= 1 && left > 0) left -= lpGaugeStep(left);
  return left;
}

/** A battle's damage: live's gauge shows the number at the hit (CBattleManager state 7) but counts only once the engine's
 *  own LP command comes, after the hit state's 32 frames and the battle's close: ~42 frames from the hit on its films
 *  (v2hand-me opp2: 1.47 s and 1.44 s, batk: 1.35 s). The hit is 8 frames into the attack (16 for the opponent's,
 *  whose sword turns first: duel-fx ATTACK). */
export const BATTLE_COUNT_FRAMES = 42;
const attackHit = (e: PresentationEvent) => e.player === 1 ? 16 : 8;
const ATTACKS = ['engine:19', 'engine:1a', 'engine:17'];
const TURN_EVENTS = /^engine:(?:0[4c-f]|1[01])$/;

function bounded(value: number | undefined, fallback: number, max: number): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Invalid timeline budget/timing');
  return n;
}
function capture(state: DuelState): DisplayFrame {
  return { cards: visibleCards(state).map((card: DuelCard) => ({ uid: card.uid, owner: card.owner,
    player: card.player, zone: card.zone, index: card.index, faceUp: card.faceUp, defense: card.defense,
    passcode: card.passcode, handCount: state.sides[card.player].hand.length })),
    lp: [state.sides[0].lp, state.sides[1].lp] };
}
function samePose(a: CardPlacement, b: CardPlacement): boolean {
  return a.player === b.player && a.zone === b.zone && a.index === b.index && a.faceUp === b.faceUp &&
    a.defense === b.defense && a.handCount === b.handCount;
}
function visibleZone(card: CardPlacement): boolean { return card.zone === 'monster' || card.zone === 'spell' || card.zone === 'hand'; }
function cardMotion(from: DisplayFrame, to: DisplayFrame): boolean {
  const previous = new Map(from.cards.map(c => [c.uid, c]));
  for (const next of to.cards) {
    const before = previous.get(next.uid);
    if ((!before && visibleZone(next)) || before && !samePose(before, next) &&
      (visibleZone(before) || visibleZone(next) || before.zone !== next.zone || before.player !== next.player)) return true;
    previous.delete(next.uid);
  }
  return [...previous.values()].some(visibleZone);
}
function cloneEvent(event: PresentationEvent): PresentationEvent { return { ...event, params: [...event.params] }; }

/** A deterministic, bounded visual clock. It never mutates or delays authoritative duel reduction.
 * Feed every previous/next packet state in order; advance in simulation frames, not wall-clock timestamps.
 * Overflow and skip are explicit fast-forward operations: all event IDs are consumed/acknowledged,
 * the latest state is retained, and skippedEvents records effects that were not visually played.
 */
export class DuelTimeline {
  private display: DisplayFrame;
  private queue: Batch[] = [];
  private enqueuedThrough: number;
  private acknowledged = 0;
  private consumed = 0;
  private skipped = 0;
  private reducedMotion: boolean;
  private readonly maxBatches: number;
  private readonly maxCards: number;
  private readonly lpFrames: number;
  private readonly attackFrames: number;
  private readonly chainFrames: number;
  private battle: { hit: number; after: number } | null = null;

  constructor(initial: DuelState, options: TimelineOptions = {}) {
    this.display = capture(initial); this.enqueuedThrough = initial.sequence; this.acknowledged = initial.sequence;
    this.maxBatches = bounded(options.maxBatches, 32, 256); this.maxCards = bounded(options.maxRetainedCards, 8192, 131072);
    this.lpFrames = bounded(options.lpFrames, TIMING_EVIDENCE.lpFrames.frames, 120);
    this.attackFrames = bounded(options.attackFrames, TIMING_EVIDENCE.attackFrames.frames, 120);
    this.chainFrames = bounded(options.chainFrames, TIMING_EVIDENCE.chainFrames.frames, 120);
    this.reducedMotion = options.reducedMotion ?? false;
  }

  get pending(): boolean { return this.queue.length > 0; }
  get acknowledgedThrough(): number { return this.acknowledged; }

  enqueue(previous: DuelState, next: DuelState): TimelineSample {
    if (next.sequence <= this.enqueuedThrough || previous.sequence !== this.enqueuedThrough || next.sequence <= previous.sequence) {
      throw new Error('Timeline states must be enqueued exactly once in packet order');
    }
    const from = capture(previous), to = capture(next);
    const events = next.events.filter(e => e.sequence > previous.sequence).map(cloneEvent);
    // Old queue entries dropped from the reducer have already been ingested by this timeline.
    // Only fresh events lost inside one oversized packet need explicit skipped accounting here.
    const upstreamSkipped = Math.max(0, next.droppedPresentationEvents - previous.droppedPresentationEvents - previous.events.length);
    // Every freshly produced event is consumed eventually, including an upstream overflow explicitly reported by the reducer.
    this.consumed += upstreamSkipped; this.skipped += upstreamSkipped;
    let duration = cardMotion(from, to) && events.length ? TIMING_EVIDENCE.cardFrames.frames : 0;
    // an LP change: its number rolls in and holds (lpFrames; a battle's from its hit, BATTLE_COUNT_FRAMES), then the
    // gauge counts it at its fixed rate
    const attack = events.find(e => ATTACKS.includes(e.type)), lpChange = from.lp[0] !== to.lp[0] || from.lp[1] !== to.lp[1];
    let hold = this.lpFrames;
    if (lpChange && !this.reducedMotion) {
      if (attack) hold = Math.max(hold, attackHit(attack) + BATTLE_COUNT_FRAMES);
      else if (this.battle) hold = Math.max(hold, this.battle.hit + BATTLE_COUNT_FRAMES - this.battle.after);
      duration = Math.max(duration, hold + Math.max(...[0, 1].map(p => lpCountFrames(to.lp[p] - from.lp[p]))));
    }
    for (const e of events) {
      if (ATTACKS.includes(e.type)) duration = Math.max(duration, this.attackFrames);
      if (['engine:12', 'engine:13'].includes(e.type)) duration = Math.max(duration, this.chainFrames);
      if (['engine:30', 'engine:3c'].includes(e.type)) duration = Math.max(duration, TIMING_EVIDENCE.flashFrames.frames);
    }
    // an attack whose damage comes in a later packet: its hit, and the frames played since the attack began
    if (lpChange || events.some(e => TURN_EVENTS.test(e.type))) this.battle = null;
    else if (attack) this.battle = { hit: attackHit(attack), after: duration };
    else if (this.battle) this.battle.after += duration;
    this.enqueuedThrough = next.sequence;
    this.queue.push({ sequence: next.sequence, from, to, events, duration, elapsed: 0, hold });
    if (this.reducedMotion || this.queue.length > this.maxBatches || this.retainedCards() > this.maxCards) this.skip();
    else this.advance(0);
    return this.sample();
  }

  private retainedCards(): number { return this.queue.reduce((n, b) => n + b.from.cards.length + b.to.cards.length, 0); }
  private complete(batch: Batch, skip: boolean): void {
    this.display = batch.to; this.acknowledged = batch.sequence; this.consumed += batch.events.length;
    if (skip && batch.duration > 0) this.skipped += batch.events.length;
  }

  advance(frames: number): TimelineSample {
    if (!Number.isFinite(frames) || frames < 0) throw new Error('Timeline frames must be finite and non-negative');
    let remaining = frames;
    while (this.queue.length) {
      const head = this.queue[0], required = Math.max(0, head.duration - head.elapsed);
      if (required > remaining) { head.elapsed += remaining; break; }
      remaining -= required; this.queue.shift(); this.complete(head, false);
    }
    return this.sample();
  }

  skip(): TimelineSample {
    while (this.queue.length) this.complete(this.queue.shift()!, true);
    return this.sample();
  }
  setReducedMotion(value: boolean): TimelineSample {
    this.reducedMotion = value;
    if (value) return this.skip();
    return this.sample();
  }
  sample(): TimelineSample {
    const head = this.queue[0], from = head?.from ?? this.display, to = head?.to ?? this.display;
    const progress = head && head.duration ? Math.min(1, head.elapsed / head.duration) : 1;
    const cardProgress = head?.duration ? Math.min(1, head.elapsed / TIMING_EVIDENCE.cardFrames.frames) : 1;
    const eased = Math.sin(cardProgress * Math.PI / 2);
    const before = new Map(from.cards.map(c => [c.uid, c])), after = new Map(to.cards.map(c => [c.uid, c]));
    const cards = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b).map(uid => {
      const a = before.get(uid), b = after.get(uid);
      return { uid, from: a ? { ...a } : null, to: b ? { ...b } : null, progress: cardProgress, eased,
        opacity: !a ? cardProgress : !b ? 1 - cardProgress : 1 };
    });
    const counted = head?.duration ? Math.floor(head.elapsed) - head.hold : Infinity;
    const lp = [0, 1].map(p => {
      const change = to.lp[p] - from.lp[p]; if (!change || counted === Infinity) return to.lp[p];
      return to.lp[p] - Math.sign(change) * lpLeft(change, Math.max(0, counted));
    }) as [number, number];
    return { cards, lp, effects: (head?.events ?? []).map(event => ({ event: cloneEvent(event), progress })),
      pending: this.pending, queuedBatches: this.queue.length, retainedCards: this.retainedCards(),
      acknowledgedThrough: this.acknowledged, consumedEvents: this.consumed, skippedEvents: this.skipped };
  }
}
