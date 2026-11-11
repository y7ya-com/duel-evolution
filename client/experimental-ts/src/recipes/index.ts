import type { DeckView } from '../ui/contracts';

/** 0x3114: server persist.pbinBytes, LSB first within each byte. */
export const RECIPE_PBIN_BYTES = 128;
export interface DeckRecipe extends DeckView { id: string }
interface RecipeRecord extends DeckRecipe { recipeBit: number | null }
const capacities = { main: 80, side: 15, extra: 30 } as const;
const invalid = (): never => { throw new Error('Invalid recipe catalog'); };

/** Private generated records only; no game data is bundled with this module.
 * Recipe cards are original YDC lists. Starter claim legalDeck substitutions are a
 * separate server product and must be installed from the claim response instead. */
export class RecipeCatalog {
  private records: readonly RecipeRecord[] = [];
  static fromJSON(input: unknown): RecipeCatalog { const c = new RecipeCatalog(); c.install(input); return c; }
  get size(): number { return this.records.length; }
  clear(): void { this.records = []; }
  /** Atomic, bounded install. Unknown rights stay unavailable, including in free mode. */
  install(input: unknown): void {
    if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
    const data = input as Record<string, unknown>;
    if (data.version !== 1 || data.deckSource !== 'original-ydc' || !Array.isArray(data.recipes) || data.recipes.length > 192) invalid();
    const records: RecipeRecord[] = [], ids = new Set<string>(), bits = new Set<number>();
    for (const raw of data.recipes as unknown[]) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
      const r = raw as Record<string, unknown>;
      if (typeof r.id !== 'string' || !/^[1-9]\d{0,8}$/.test(r.id) || ids.has(r.id)) invalid();
      if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 512 || /[\u0000-\u001f\u007f]/.test(r.name)) invalid();
      const bit = r.recipeBit;
      if (bit !== null && (typeof bit !== 'number' || !Number.isSafeInteger(bit) || bit < 1 || bit >= RECIPE_PBIN_BYTES * 8 || bits.has(bit))) invalid();
      const entry: RecipeRecord = { id: r.id as string, name: r.name as string, recipeBit: bit as number | null, main: [], side: [], extra: [] };
      for (const zone of ['main', 'side', 'extra'] as const) {
        const cards = r[zone];
        if (!Array.isArray(cards) || cards.length > capacities[zone] || cards.some(pc => !Number.isSafeInteger(pc) || pc <= 0 || pc >= 0xffffff00)) invalid();
        entry[zone] = [...cards as number[]];
      }
      ids.add(entry.id); if (bit !== null) bits.add(bit as number); records.push(entry);
    }
    this.records = records;
  }
  /** The recipe a PBIN bit grants (an NPC's gifted recipe: CWindowModelItemGet names it), if the catalogue has it. */
  nameOfBit(bit: number): string | undefined { return this.records.find(r => r.recipeBit === bit)?.name; }
  /** Native 0x00983c80 tests right+1 for pack types 1/4. Free mode changes
   * the trunk, not PBIN (server h_getpbin); it does not grant every recipe.
   * Missing/truncated/oversized PBIN is unknown, never proof of ownership. */
  available(pbin: Uint8Array | null, _freeMode = false): DeckRecipe[] {
    if (!(pbin instanceof Uint8Array) || pbin.byteLength !== RECIPE_PBIN_BYTES) return [];
    return this.records.filter(r => r.recipeBit !== null && (pbin[r.recipeBit >> 3] & (1 << (r.recipeBit & 7))) !== 0)
      .map(r => ({ id: r.id, name: r.name, main: [...r.main], side: [...r.side], extra: [...r.extra] }));
  }
}
