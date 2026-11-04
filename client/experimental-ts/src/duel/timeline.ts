import { visibleCards } from './model';
import type { DuelCard, DuelState, Player, PresentationEvent, Zone } from './types';

export const TIMING_EVIDENCE = {
  cardFrames: { frames: 8, evidence: 'source', source: 'client/src/duel/SceneCard.cpp CCard::step: anim += 0x20 until 0x100' },
  flashFrames: { frames: 32, evidence: 'source', source: 'client/src/duel/SceneCard.h popCounterBadge/popLockBadge; step decrements 0x200 by 0x10' },
  lpFrames: { frames: 12, evidence: 'policy', source: 'Provisional client interpolation; original complete LP timing not established' },
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
    if (from.lp[0] !== to.lp[0] || from.lp[1] !== to.lp[1]) duration = Math.max(duration, this.lpFrames);
    for (const e of events) {
      if (['engine:19', 'engine:1a', 'engine:17'].includes(e.type)) duration = Math.max(duration, this.attackFrames);
      if (['engine:12', 'engine:13'].includes(e.type)) duration = Math.max(duration, this.chainFrames);
      if (['engine:30', 'engine:3c'].includes(e.type)) duration = Math.max(duration, TIMING_EVIDENCE.flashFrames.frames);
    }
    this.enqueuedThrough = next.sequence;
    this.queue.push({ sequence: next.sequence, from, to, events, duration, elapsed: 0 });
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
    const lpProgress = head?.duration ? Math.min(1, head.elapsed / this.lpFrames) : 1;
    const lp = [0, 1].map(p => Math.round(from.lp[p] + (to.lp[p] - from.lp[p]) * lpProgress)) as [number, number];
    return { cards, lp, effects: (head?.events ?? []).map(event => ({ event: cloneEvent(event), progress })),
      pending: this.pending, queuedBatches: this.queue.length, retainedCards: this.retainedCards(),
      acknowledgedThrough: this.acknowledged, consumedEvents: this.consumed, skippedEvents: this.skipped };
  }
}
