// The 2008 printed faces and wording of the cards whose duel effects are the 2008 ones (server/src/duel/engine/
// era2008.json: Sangan, Dark Magician of Chaos, Crush Card Virus, ...). Live builds them at ship time from the owner's
// original merge.dat (infra/ship-client.sh runs client/tools/era2008_assets.py), publishes them under a hashed folder
// beside its page (c-<hash>/merge/data/card/<passcode>.png, .../mini/<passcode>.png) and injects
// `Module.yo2EraCards={base,cards}` into yo2rc.html, cards keyed by YO2 card id: {pc, text:{E,F,G,I,S,J,K}, face}.
// lazyfs.js then serves those faces over card.dat's modern art and htmlui read/deck.js shows that wording.
// The rewrite reads the same configuration from live's yo2rc.html (on v2 through the front, infra/v2/worker.ts) and
// its published files: it ships no game data of its own and always shows what live's page shows.
import type { GameLanguage } from '../features/language';

export interface EraCard {
  /** YO2 card id (cards.json `i`), the key of live's configuration. */
  readonly id: number;
  readonly passcode: number;
  /** The printed wording per original language letter (all seven on live). */
  readonly texts: Readonly<Partial<Record<GameLanguage, string>>>;
  /** Absolute URLs of the printed face and its thumbnail. */
  readonly face: string;
  readonly mini: string;
}

const MARK = 'Module.yo2EraCards=';
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_CARDS = 4096;
/** The original's seven language letters (features/language.ts GAME_LANGUAGES), era2008_assets.py's text keys. */
const LETTERS = new Set<string>('JEGFISK');
function invalid(message: string): never { throw new Error(`Invalid 2008 card configuration: ${message}`); }
const uint = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

/** The `Module.yo2EraCards=` object of live's yo2rc.html (ship-client.sh writes it as one ASCII JSON line, `<` escaped,
 * so `;</script>` ends it). null: the page has none (a build without legacy cards, or not live's page at all). */
export function eraConfigFromPage(html: string): unknown {
  const at = html.indexOf(MARK);
  if (at < 0) return null;
  const end = html.indexOf(';</script>', at);
  if (end < 0) invalid('unterminated');
  try { return JSON.parse(html.slice(at + MARK.length, end)); } catch { invalid('not JSON'); }
}

export class EraCards {
  private readonly byCode = new Map<number, EraCard>();
  private readonly byYo2Id = new Map<number, EraCard>();
  /** `pageUrl` resolves the configuration's base folder, as lazyfs does against the page. */
  constructor(config: unknown, pageUrl: string) {
    if (!config || typeof config !== 'object') invalid('not an object');
    const { base, cards } = config as { base?: unknown; cards?: unknown };
    // a relative folder under the page's own directory: no scheme, no host, no climbing out
    if (typeof base !== 'string' || !/^(?:[\w-][\w.-]*\/)+$/.test(base)) invalid('base');
    const page = new URL(pageUrl), root = new URL(base, page);
    if (root.origin !== page.origin) invalid('base origin');
    if (!cards || typeof cards !== 'object' || Array.isArray(cards)) invalid('cards');
    const entries = Object.entries(cards as Record<string, unknown>);
    if (entries.length > MAX_CARDS) invalid('card count');
    for (const [key, value] of entries) {
      const id = Number(key);
      if (!/^\d{1,4}$/.test(key) || !uint(id, 1, 4095) || !value || typeof value !== 'object') invalid('card id');
      const { pc, text, face } = value as { pc?: unknown; text?: unknown; face?: unknown };
      if (!uint(pc, 1, 0xfffffffe)) invalid('passcode');
      const m = typeof face === 'string' ? /^merge\/data\/card\/(\d{1,10})\.(png|jpg)$/.exec(face) : null;
      if (!m || Number(m[1]) !== pc) invalid('face');
      if (!text || typeof text !== 'object') invalid('text');
      const texts: Partial<Record<GameLanguage, string>> = {};
      for (const [letter, wording] of Object.entries(text as Record<string, unknown>)) {
        if (!LETTERS.has(letter)) continue;
        if (typeof wording !== 'string' || wording.length > 32768) invalid('text');
        if (wording.trim()) texts[letter as GameLanguage] = wording;
      }
      if (!texts.E) invalid('English text');
      if (this.byCode.has(pc)) invalid('duplicate passcode');
      const card: EraCard = Object.freeze({ id, passcode: pc, texts: Object.freeze(texts),
        face: new URL(face as string, root).href, mini: new URL(`merge/data/mini/${pc}.${m[2]}`, root).href });
      this.byCode.set(pc, card); this.byYo2Id.set(id, card);
    }
  }
  get size(): number { return this.byCode.size; }
  get entries(): readonly EraCard[] { return [...this.byCode.values()]; }
  byPasscode(passcode: number): EraCard | undefined { return this.byCode.get(passcode); }
  byId(id: number): EraCard | undefined { return this.byYo2Id.get(id); }
  /** The printed wording in a language, else its English (read/deck.js: the language's, then the native table's). */
  text(passcode: number, language: GameLanguage = 'E'): string | undefined {
    const t = this.byCode.get(passcode)?.texts;
    return t && (t[language] ?? t.E);
  }
}

/** Reads live's page (yo2rc.html) and its legacy card configuration. null: the page names none. */
export async function loadEraCards(pageUrl: string, options: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<EraCards | null> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const res = await fetcher(pageUrl, { credentials: 'same-origin', ...(options.signal ? { signal: options.signal } : {}) });
  if (!res.ok) throw new Error(`2008 card configuration: ${res.status}`);
  if (!/^text\/html\b/i.test(res.headers.get('content-type') ?? '')) throw new Error('2008 card configuration: not a page');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_PAGE_BYTES) throw new Error('2008 card configuration: page too large');
  const config = eraConfigFromPage(new TextDecoder().decode(bytes));
  return config === null ? null : new EraCards(config, res.url || pageUrl);
}
