// The names "You got <item>!" (CWindowModelItemGet) shows for an NPC gift's PBIN bits (0x5205's bit list). The server
// sends bits only (persist.ts pendingAdd: classes 1/2/3 avatar parts, 7 challenge rights, 8 recipes, 10 titles), so
// the rewrite names them from the game data it already has:
// - titles (class 10): the server's title table (features/titles.ts TITLES);
// - challenge rights (class 7, bits 592..594): the famous NPC each one unlocks (server persist.ts CHALLENGE_RIGHT:
//   NPC 54 Seto Kaiba, 66 Alexis Rhodes, 75 Yami Marik; their names from gamedata npc_profiles.json);
// - recipes (class 8): the deck recipe catalogue's recipeBit (deck-recipes.json, RecipeCatalog.nameOfBit);
// - avatar parts (classes 1..3): the cosmetics data Change Avatar and the Wardrobe load (/api/de/cosmetics: each
//   item's variants carry their PBIN bit; a variant's own name wins, else the item's).
import { TITLES } from '../features/titles';
import type { CosmeticsState } from '../features/online';

const TITLE_NAMES = new Map<number, string>(TITLES.map(([bit, name]) => [bit, name]));
export const CHALLENGE_RIGHTS: Readonly<Record<number, string>> = { 592: 'Seto Kaiba', 593: 'Alexis Rhodes', 594: 'Yami Marik' };
export const challengeRightName = (bit: number): string | undefined => CHALLENGE_RIGHTS[bit] ? `the Right to Challenge ${CHALLENGE_RIGHTS[bit]}` : undefined;

export interface GiftNameSources {
  /** a recipe's name by its PBIN bit */
  recipeName?: (bit: number) => string | undefined;
  /** the cosmetics catalogue and inventory (their variants' PBIN bits) */
  cosmetics?: Partial<Pick<CosmeticsState, 'catalog' | 'inventory' | 'freeItems'>> | null;
}
/** An avatar part's name by its PBIN bit, from the cosmetics data. */
export function avatarPartName(bit: number, cosmetics: GiftNameSources['cosmetics']): string | undefined {
  if (!cosmetics || bit < 0) return undefined;
  for (const item of [...cosmetics.inventory ?? [], ...cosmetics.catalog ?? [], ...cosmetics.freeItems ?? []] as { name: string; variants: { bit: number; name?: string }[] }[]) {
    const v = item.variants.find(x => x.bit === bit);
    if (v) return v.name || item.name;
  }
  return undefined;
}
export function giftItemName(bit: number, sources: GiftNameSources | ((bit: number) => string | undefined) = {}): string | null {
  if (!Number.isInteger(bit) || bit < 0) return null;
  const s: GiftNameSources = typeof sources === 'function' ? { recipeName: sources } : sources;
  const recipe = s.recipeName?.(bit);
  return TITLE_NAMES.get(bit) ?? challengeRightName(bit) ?? recipe ?? avatarPartName(bit, s.cosmetics) ?? null;
}
