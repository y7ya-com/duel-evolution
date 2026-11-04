import type { CardView } from './ui/contracts';
import type { CardDetailsCatalog } from './cards';
import type { OriginalCardTextCatalog } from './cards/original-text';
export interface CatalogEntry {
  passcode: number; name: string; description?: string; type?: string; level?: number;
  attack?: number; defense?: number; extra?: boolean; limit?: number; mergePath?: string;
  race?: string; attribute?: string;
  descriptionSource?: 'cards.cdb' | 'original-en';
}
/** Display metadata only. Legality and card identity are always decided by the server. */
export class CardCatalog {
  private cards = new Map<number, CatalogEntry>();
  install(input: unknown): void {
    if (!Array.isArray(input) || input.length > 100000) throw new Error('Invalid card catalog');
    const next = new Map<number, CatalogEntry>();
    for (const value of input) {
      if (!value || typeof value !== 'object') throw new Error('Invalid card metadata');
      const c = value as CatalogEntry;
      if (!Number.isSafeInteger(c.passcode) || c.passcode <= 0 || typeof c.name !== 'string' || c.name.length > 512) throw new Error('Invalid card identity');
      if (c.description !== undefined && (typeof c.description !== 'string' || c.description.length > 32768)) throw new Error('Invalid card description');
      if (c.type !== undefined && typeof c.type !== 'string') throw new Error('Invalid card type');
      for (const key of ['level', 'attack', 'defense', 'limit'] as const) if (c[key] !== undefined && !Number.isSafeInteger(c[key])) throw new Error('Invalid card statistic');
      if (c.extra !== undefined && typeof c.extra !== 'boolean') throw new Error('Invalid card zone');
      next.set(c.passcode, { ...c });
    }
    this.cards = next; this.sortedNames = null;
  }
  card(passcode: number, owned?: number): CardView {
    const c = this.cards.get(passcode);
    return { id: String(passcode), passcode, name: c?.name ?? `Card ${passcode}`, ...(c ?? {}), ...(owned === undefined ? {} : { owned }) };
  }
  installDetails(details: CardDetailsCatalog): void {
    const next = new Map(this.cards);
    for (const c of details.entries) {
      const old = next.get(c.passcode), entry: CatalogEntry = { ...old, passcode:c.passcode, name:c.name };
      for (const key of ['description','type','race','attribute','level','attack','defense','extra','limit'] as const) {
        if (c[key] !== undefined) Object.assign(entry, { [key]:c[key] });
      }
      next.set(c.passcode,entry);
    }
    this.cards = next; this.sortedNames = null;
  }
  installOriginalTexts(texts: OriginalCardTextCatalog): void {
    const next = new Map(this.cards);
    for (const c of texts.entries) next.set(c.passcode,{...next.get(c.passcode),passcode:c.passcode,name:c.name,description:c.description,descriptionSource:'original-en'});
    this.cards = next; this.sortedNames = null;
  }
  get size(): number { return this.cards.size; }
  allCards(): CardView[] { return [...this.cards.keys()].map(pc => this.card(pc)); }
  /** Card declarations: the passcode a typed name (case and spacing ignored) or passcode names; the first art of a name. */
  named(text: string): number | null {
    const key = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (/^\d{1,9}$/.test(key)) return Number(key);
    for (const c of this.cards.values()) if (c.name.toLowerCase().replace(/\s+/g, ' ') === key) return c.passcode;
    return null;
  }
  /** Each card name once, sorted: suggestions for a card declaration. */
  names(): string[] { return this.sortedNames ??= [...new Set([...this.cards.values()].map(c => c.name))].sort((a, b) => a.localeCompare(b)); }
  private sortedNames: string[] | null = null;
  get mergePaths(): Record<string, string> { return Object.fromEntries([...this.cards.values()].filter(c => c.mergePath).map(c => [String(c.passcode), c.mergePath!])); }
}

/** Stream a supplied display catalog with an explicit bound before parsing JSON. */
export async function readCatalog(response: Response, signal?: AbortSignal, maxBytes = 8 * 1024 * 1024): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('Invalid catalog budget');
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('Card display catalog is unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Card display catalog is empty');
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    if (Number(response.headers.get('content-length')) > maxBytes) throw new RangeError('Card display catalog exceeds budget');
    const pieces: Uint8Array[] = []; let length = 0;
    while (true) {
      const part = await reader.read(); signal?.throwIfAborted();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes) throw new RangeError('Card display catalog exceeds budget');
      pieces.push(part.value);
    }
    const bytes = new Uint8Array(length); let at = 0;
    for (const p of pieces) { bytes.set(p, at); at += p.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
}
