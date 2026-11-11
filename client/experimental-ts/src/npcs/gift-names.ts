// The names "You got <item>" (CWindowModelItemGet) can show for an NPC gift's PBIN bits (0x5205's bit list). The
// server sends bits only (persist.ts pendingAdd: classes 1/2/3 avatar parts, 7 challenge rights, 8 recipes, 10
// titles). Titles are named client-side from the server's own title table (features/titles.ts TITLES); a recipe
// is named when the deck recipe catalogue knows its bit. Avatar parts and challenge rights have no name table in the
// rewrite's gamedata: they stay unnamed (PARITY-GAPS.md).
import { TITLES } from '../features/titles';

const TITLE_NAMES = new Map<number, string>(TITLES.map(([bit, name]) => [bit, name]));

export function giftItemName(bit: number, recipeName?: (bit: number) => string | undefined): string | null {
  if (!Number.isInteger(bit) || bit < 0) return null;
  return TITLE_NAMES.get(bit) ?? recipeName?.(bit) ?? null;
}
