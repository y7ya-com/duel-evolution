/** A card-name declaration (Prohibition, ...), as the original's card list window for it (CWindowDeckList kinds
 * 0x4b..0x4e with its search box, CWindowTaskListSearch: client/src/duel/SceneDeckList.cpp): every card the list mode
 * allows, in the original name order, narrowed to the names that hold the search text as it is typed (its dialog:
 * htmlui/duel-dialogs.ts). The server still decides what is declarable. */

/** How many matches the list shows at once (the rest are reached by typing more of the name). */
export const ANNOUNCE_SHOWN = 60;

export function matchDeclarable(list: readonly { id: string; label: string }[], search: string): { id: string; label: string }[] {
  const key = search.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return [...list];
  // A passcode typed whole names its card; otherwise the names that hold the text (the original's wcontains).
  if (/^\d{4,9}$/.test(key)) { const exact = list.filter(c => c.id === key); if (exact.length) return exact; }
  return list.filter(c => c.label.toLowerCase().replace(/\s+/g, ' ').includes(key));
}
