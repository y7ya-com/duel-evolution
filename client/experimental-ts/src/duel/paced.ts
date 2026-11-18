/** What the duel screen shows of a packet besides its board: its Duel Log lines, its information box ("... has
 * disconnected", a time-out), the clock it set, a Field Spell's background and audio. Live's engine shows each command
 * as it plays it, after the effects before it have finished, so each of these waits until the visual timeline
 * (timeline.ts) reaches its packet: `after` is the sequence of the packet before it, released once the timeline has
 * played that one (acknowledgedThrough), as the cues are (cues.ts DuelCueQueue.release). Bounded: past `max` entries the
 * oldest are released at once rather than held. */
export class PacedQueue<T> {
  private queue: { after: number; value: T }[] = [];
  constructor(private readonly max = 512) {
    if (!Number.isInteger(max) || max < 1) throw new Error('Invalid paced queue budget');
  }
  get size(): number { return this.queue.length; }
  push(after: number, value: T): void { this.queue.push({ after, value }); }
  /** The values whose packet the timeline has reached, in the order they were pushed (and any over the budget). */
  take(acknowledgedThrough: number): T[] {
    if (!this.queue.length) return [];
    let n = 0;
    while (n < this.queue.length && (this.queue[n]!.after <= acknowledgedThrough || this.queue.length - n > this.max)) n++;
    return n ? this.queue.splice(0, n).map(e => e.value) : [];
  }
  /** Everything still held, released now (a new duel, a skip). */
  flush(): T[] { return this.queue.splice(0).map(e => e.value); }
  clear(): void { this.queue = []; }
}
