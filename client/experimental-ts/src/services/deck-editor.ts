import type { CardView, DeckView, DeckZone } from '../ui/contracts';

export type CardSource = DeckZone | 'collection';
export interface DeckHint { code: 'capacity' | 'owned' | 'limit' | 'zone' | 'unknown-card'; passcode?: number; zone?: DeckZone; message: string; }
export type EditResult = { ok: true; hints: DeckHint[] } | { ok: false; reason: string; hints: DeckHint[] };
const zones: readonly DeckZone[] = ['main', 'side', 'extra'];
// Storage bounds from server/src/game/decks.ts; deliberately no modern 60/15 assumptions.
export const DECK_CAPACITY: Readonly<Record<DeckZone, number>> = { main: 80, side: 15, extra: 30 };
const clone = (d: DeckView): DeckView => ({ name: d.name, main: [...d.main], side: [...d.side], extra: [...d.extra] });
const equal = (a: DeckView, b: DeckView) => a.name === b.name && zones.every(z => a[z].length === b[z].length && a[z].every((pc, i) => pc === b[z][i]));
const validName = (n: string) => n.trim() !== '' && [...n].length <= 40 && !/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(n);

/** Pure local editor. Hints describe inventory/zone concerns, never prove server legality.
 * Loading and saving existing decks never gate on hints. Each edit is atomic and deterministic. */
export class DeckEditor {
  private value: DeckView;
  private epoch = 0;
  get generation(): number { return this.epoch; }
  private baseline: DeckView;
  private cards = new Map<number, CardView>();
  constructor(deck: DeckView, collection: readonly CardView[] = []) {
    this.value = clone(deck); this.baseline = clone(deck); this.setCollection(collection);
  }
  get deck(): DeckView { return clone(this.value); }
  get dirty(): boolean { return !equal(this.value, this.baseline); }
  setCollection(collection: readonly CardView[]): void {
    this.cards = new Map(collection.filter(c => c.passcode !== undefined).map(c => [c.passcode!, { ...c }]));
  }
  /** Loading preserves order, unknown cards, and legacy zone sizes without normalization. */
  load(deck: DeckView): void { this.epoch++; this.value = clone(deck); this.baseline = clone(deck); }
  reset(): void { this.value = clone(this.baseline); }
  /** Pass the exact submitted snapshot after a successful save. Later edits remain dirty. */
  markSaved(submitted: DeckView): void { this.baseline = clone(submitted); }
  rename(name: string): EditResult {
    if (!validName(name)) return { ok: false, reason: 'Use a nonempty, file-safe name of at most 40 characters.', hints: this.hints() };
    this.value.name = name; return { ok: true, hints: this.hints() };
  }
  /** Replace the draft atomically while retaining the last saved baseline. */
  replace(deck: DeckView): EditResult {
    const reject = (reason: string): EditResult => ({ ok: false, reason, hints: this.hints() });
    if (!deck || typeof deck !== 'object' || typeof deck.name !== 'string' || !validName(deck.name)) return reject('Invalid deck name.');
    for (const zone of zones) {
      if (!Array.isArray(deck[zone]) || deck[zone].length > DECK_CAPACITY[zone]
        || !deck[zone].every(pc => Number.isSafeInteger(pc) && pc > 0 && pc < 0xffffff00)) return reject(`Invalid ${zone} card list or storage capacity.`);
    }
    this.value = clone(deck); return { ok: true, hints: this.hints() };
  }
  reorder(zone: DeckZone, fromIndex: number, toIndex: number): EditResult {
    if (!zones.includes(zone) || ![fromIndex, toIndex].every(i => Number.isSafeInteger(i) && i >= 0 && i < this.value[zone].length))
      return { ok: false, reason: 'That card position is no longer available.', hints: this.hints() };
    const next = clone(this.value), [card] = next[zone].splice(fromIndex, 1);
    next[zone].splice(toIndex, 0, card); this.value = next;
    return { ok: true, hints: this.hints() };
  }
  count(passcode: number): number { return zones.reduce((n, z) => n + this.value[z].filter(pc => pc === passcode).length, 0); }
  available(passcode: number): number | undefined {
    const owned = this.cards.get(passcode)?.owned; return owned === undefined ? undefined : Math.max(0, owned - this.count(passcode));
  }
  move(passcode: number, from: CardSource, to: CardSource, index?: number): EditResult {
    const reject = (reason: string): EditResult => ({ ok: false, reason, hints: this.hints() });
    if (!Number.isSafeInteger(passcode) || passcode <= 0) return reject('Invalid card passcode.');
    if (from === to || (from !== 'collection' && !zones.includes(from)) || (to !== 'collection' && !zones.includes(to))) return reject('Choose different valid zones.');
    const next = clone(this.value);
    if (from !== 'collection') {
      const at = index ?? next[from].indexOf(passcode);
      if (!Number.isInteger(at) || at < 0 || next[from][at] !== passcode) return reject('That card is no longer at the selected position.');
      next[from].splice(at, 1);
    }
    if (to !== 'collection') {
      if (next[to].length >= DECK_CAPACITY[to]) return reject(`${to} storage capacity reached.`);
      const c = this.cards.get(passcode);
      // Only additions consume an owned copy. Moving/removing legacy cards remains possible.
      if (from === 'collection' && c?.owned !== undefined && this.count(passcode) >= c.owned) return reject('No unused owned copies.');
      if (from === 'collection' && c?.limit !== undefined && this.count(passcode) >= c.limit) return reject('Card copy-limit hint reached.');
      if (c?.extra === true && to !== 'extra' || c?.extra === false && to === 'extra') return reject('Card belongs in a different zone.');
      next[to].push(passcode);
    }
    this.value = next; return { ok: true, hints: this.hints() };
  }
  hints(): DeckHint[] {
    const out: DeckHint[] = [], counts = new Map<number, number>();
    for (const z of zones) {
      if (this.value[z].length > DECK_CAPACITY[z]) out.push({ code: 'capacity', zone: z, message: `${z} exceeds server storage capacity.` });
      for (const pc of this.value[z]) {
        counts.set(pc, (counts.get(pc) ?? 0) + 1);
        const c = this.cards.get(pc);
        if (c && (c.extra === true && z === 'main' || c.extra === false && z === 'extra')) out.push({ code: 'zone', zone: z, passcode: pc, message: 'Check this card’s zone with the server.' });
      }
    }
    for (const [pc, count] of counts) {
      const c = this.cards.get(pc);
      if (!c) out.push({ code: 'unknown-card', passcode: pc, message: 'Card metadata is unavailable.' });
      if (c?.owned !== undefined && count > c.owned) out.push({ code: 'owned', passcode: pc, message: 'Deck uses more copies than known inventory.' });
      if (c?.limit !== undefined && count > c.limit) out.push({ code: 'limit', passcode: pc, message: 'Deck exceeds the supplied copy-limit hint.' });
    }
    return out;
  }
}
