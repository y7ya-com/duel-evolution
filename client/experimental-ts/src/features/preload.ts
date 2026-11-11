// What to warm next (live: lazyfs.js prefetches the menu and deck-editor regions and the neighbouring maps; GET
// /api/de/prefetch/duel names the NPC's deck when a duel is about to start). Everything here runs at idle priority
// through IdlePrefetcher except the duel's art, which is urgent. Learned per-scene paths come from SceneManifest.
import type { IdlePrefetcher, SceneManifest } from '../assets/prefetch';

export interface PreloadAssets {
  prefetchScene(path: string, signal?: AbortSignal): Promise<void>;
  prefetchCard(passcode: number, signal?: AbortSignal): Promise<void>;
}
export interface PreloadOptions {
  assets: PreloadAssets;
  prefetcher: IdlePrefetcher;
  manifest?: SceneManifest;
  /** Map id -> the map ids its exits lead to. */
  neighbours?: (mapId: number) => readonly number[];
  /** Every archive path a map draws (world/scene.ts scenePaths), for maps the manifest has not seen yet. */
  mapPaths?: (mapId: number, signal: AbortSignal) => Promise<readonly string[]>;
  /** GET /api/de/prefetch/duel: the NPC deck's passcodes, or null (204). */
  duelDeck?: (signal: AbortSignal) => Promise<readonly number[] | null>;
}
/** Constant art of the deck editor and the shop (src/ui/htmlui deck/shop windows). '?' is the language letter. */
export const DECK_ART = ['data/deck/deck_bg_01.png', 'data/deck/deckbar_01_c03.png', 'data/deck/deckbar_01_c02.png', 'data/deck/decktab_01_c02.png', 'data/deck/deck_font_01_c01.png',
  'data/deck/deck_title_01_?.png', 'data/deck/deck_moji_01_?.png', 'data/deck/deck_tabmoji_01_?.png', 'data/deck/deck_cardcount_01_?.png'] as const;
export const SHOP_ART = ['data/shop/shop_win_01_c01.png', 'data/shop/shop_win_00_01c.png', 'data/shop/icon_seigen_01.png', 'data/shop/shop_money_01_c01.png',
  'data/shop/shop_avatar_01_c01.png', 'data/shop/shop_avatar_02_c01.png', 'data/shop/shop_avatar_03_c01.png', 'data/shop/shop_avatar_04_c01.png',
  'data/shop/shop_arrow_04_c01.png', 'data/shop/shop_arrow_10_c01.png'] as const;
/** The scenes a player usually opens next from each scene. */
const NEXT: Readonly<Record<string, readonly string[]>> = { title: ['characters'], characters: ['lobby'], lobby: ['deck', 'shop'], deck: ['lobby'], shop: ['lobby', 'deck'], duel: ['lobby'] };

export class Preloader {
  private scene = ''; private area = -1;
  private duelAsked = false;
  private language: string;
  constructor(private readonly options: PreloadOptions, language = 'e') { this.language = language.toLowerCase(); }
  setLanguage(letter: string): void { this.language = letter.toLowerCase(); }
  /** The manifest key a merge.dat read belongs to. */
  manifestKey(): string { return this.scene === 'lobby' && this.area >= 0 ? `map:${this.area}` : this.scene; }
  record(path: string): void { if (this.scene) this.options.manifest?.record(this.manifestKey(), path); }
  observe(scene: string, area: number | null, phase: string | null): void {
    const a = area ?? -1;
    if (phase && ['preparing-duel', 'rock-paper-scissors', 'choose-first'].includes(phase)) this.duelSoon(); else if (phase !== 'duel') this.duelAsked = false;
    if (scene === this.scene && a === this.area) return;
    this.scene = scene; this.area = a;
    const p = this.options.prefetcher;
    p.cancel('map:'); // neighbours of the map just left
    if (scene === 'lobby' && a >= 0) for (const to of this.options.neighbours?.(a) ?? []) {
      this.warmScene(`map:${to}`);
      const mapPaths = this.options.mapPaths;
      if (mapPaths) p.schedule(`map:${to}`, async signal => { for (const path of await mapPaths(to, signal)) p.schedule(`map:${to}:${path}`, s => this.options.assets.prefetchScene(path, s)); });
    }
    for (const next of NEXT[scene] ?? []) this.warmScene(next);
  }
  private art(scene: string): readonly string[] {
    const learned = this.options.manifest?.paths(scene) ?? [];
    const fixed = scene === 'deck' ? DECK_ART : scene === 'shop' ? SHOP_ART : [];
    return [...new Set([...fixed.map(p => p.replace('?', this.language)), ...learned])];
  }
  private warmScene(scene: string): void {
    for (const path of this.art(scene)) this.options.prefetcher.schedule(`${scene.startsWith('map:') ? scene + ':' : 'art:'}${path}`, s => this.options.assets.prefetchScene(path, s));
  }
  /** Pack pictures once the shop's catalogue is known. */
  warmPaths(paths: readonly string[]): void { for (const path of paths) this.options.prefetcher.schedule(`art:${path}`, s => this.options.assets.prefetchScene(path, s)); }
  /** A duel is about to start: the NPC deck's card art, urgent (once per duel). */
  duelSoon(): void {
    const fetchDeck = this.options.duelDeck; if (this.duelAsked || !fetchDeck) return;
    this.duelAsked = true;
    this.options.prefetcher.schedule(`duel:${Date.now()}`, async signal => {
      const cards = await fetchDeck(signal);
      for (const pc of cards ?? []) this.options.prefetcher.schedule(`card:${pc}`, s => this.options.assets.prefetchCard(pc, s), { urgent: true });
    }, { urgent: true });
  }
}

/** Decodes the /api/de/prefetch/duel body: { npc, cards: number[], fields, ids: 'passcode' }; anything else is nothing. */
export function decodeDuelPrefetch(value: unknown): number[] | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { cards?: unknown; ids?: unknown };
  if (v.ids !== 'passcode' || !Array.isArray(v.cards)) return null;
  return v.cards.filter((c): c is number => Number.isSafeInteger(c) && c > 0 && c < 0xffffff00).slice(0, 200);
}
