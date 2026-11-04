import type { AssetLease } from '../assets';
import { decodeOriginalCardTextTables } from '../cards/original-text';
import { loadPackCatalog, type PackInfo } from '../shop/packs';

/** The original Options' seven languages, in its flag order (yo2SystemConfig.cpp language index 0..6). The letter is
 * the resource substitution the loader uses for `?` in table names (CARD_Name_?, PACK_Name_?, yo2text_?). */
export const GAME_LANGUAGES = Object.freeze([
  { code: 'J', lang: 'ja', name: '日本語', english: 'Japanese', encoding: 'shift_jis' },
  { code: 'E', lang: 'en', name: 'English', english: 'English', encoding: 'windows-1252' },
  { code: 'G', lang: 'de', name: 'Deutsch', english: 'German', encoding: 'windows-1252' },
  { code: 'F', lang: 'fr', name: 'Français', english: 'French', encoding: 'windows-1252' },
  { code: 'I', lang: 'it', name: 'Italiano', english: 'Italian', encoding: 'windows-1252' },
  { code: 'S', lang: 'es', name: 'Español', english: 'Spanish', encoding: 'windows-1252' },
  { code: 'K', lang: 'ko', name: '한국어', english: 'Korean', encoding: 'euc-kr' },
] as const);
export type GameLanguage = typeof GAME_LANGUAGES[number]['code'];
export function isGameLanguage(value: unknown): value is GameLanguage { return GAME_LANGUAGES.some(l => l.code === value); }
export function gameLanguage(code: GameLanguage) { return GAME_LANGUAGES.find(l => l.code === code)!; }

interface Assets { readScene(path: string, signal?: AbortSignal): Promise<AssetLease> }
export interface LocalizedCardText { readonly passcode: number; readonly name: string; readonly description: string }
export interface LocalizedGameText { readonly language: GameLanguage; readonly cards: readonly LocalizedCardText[]; readonly packs: ReadonlyMap<number, PackInfo>; readonly missing: number }

async function read(assets: Assets, path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const lease = await assets.readScene(path, signal);
  try { return lease.value.bytes.slice(); } finally { lease.release(); }
}

/** CSystemConfigManager::applyLanguage reloads card text, pack text and pack information for the chosen letter; a card
 * the language's tables lack keeps its English wording (the duel resources' English fallback). Identity is never
 * taken from the localized tables: rows join the verified passcode ↔ internal id mapping of the English dataset. */
export async function loadGameLanguage(assets: Assets, language: GameLanguage, identities: Iterable<{ passcode: number; internalId: number }>, signal?: AbortSignal): Promise<LocalizedGameText> {
  if (!isGameLanguage(language)) throw new Error('Unsupported language');
  const letter = language.toLowerCase();
  const [properties, index, names, descriptions, packs] = await Promise.all([
    read(assets, 'data/bin#/card_prop.bin', signal), read(assets, `data/bin#/card_indx_${letter}.bin`, signal),
    read(assets, `data/bin#/card_name_${letter}.bin`, signal), read(assets, `data/bin#/card_desc_${letter}.bin`, signal),
    loadPackCatalog(assets, signal, language, gameLanguage(language).encoding),
  ]);
  signal?.throwIfAborted();
  const byId = decodeOriginalCardTextTables({ properties, index, names, descriptions });
  const cards: LocalizedCardText[] = []; let missing = 0;
  for (const { passcode, internalId } of identities) {
    const text = byId.get(internalId);
    if (text) cards.push(Object.freeze({ passcode, name: text.name, description: text.description })); else missing++;
  }
  if (!cards.length) throw new Error(`No ${gameLanguage(language).english} card text was found`);
  return Object.freeze({ language, cards: Object.freeze(cards), packs, missing });
}
