// The game's own text tables in the chosen language (CStringDB: data/common/yo2text_?.idx / .bin; the duel dialog
// table data/bin#/dlg_indx_? / dlg_text_?), as CSystemConfigManager::applyLanguage reloads them. A label the rewrite
// gives main's screens is the original's English string (yo2text_e); its id there names the same string in the chosen
// language's table, so the label follows the language as the engine's windows do on live. Strings the original lacks
// (the rewrite's own, REWRITE_TEXT) stay English until they are translated.
import type { GameLanguage } from './language';
import type { WindowSpec } from '../ui/htmlui/snapshot';

/** CStringDB: u32 little-endian offsets into the .bin; a string ends at its NUL or where the next one begins. */
export function decodeStringTable(idx: Uint8Array, bin: Uint8Array, encoding: string): string[] {
  if (idx.length % 4 || idx.length > 4 * 1024 * 1024 || bin.length > 16 * 1024 * 1024) throw new Error('Unexpected game text table size');
  const view = new DataView(idx.buffer, idx.byteOffset, idx.byteLength), decoder = new TextDecoder(encoding), out: string[] = [];
  const count = idx.length / 4;
  for (let id = 0; id < count; id++) {
    const at = view.getUint32(id * 4, true); if (at >= bin.length) { out.push(''); continue; }
    const next = id + 1 < count ? view.getUint32(id * 4 + 4, true) : bin.length, nul = bin.indexOf(0, at);
    const end = Math.min(nul < 0 ? bin.length : nul, next > at ? next : bin.length, at + 16384);
    out.push(decoder.decode(bin.subarray(at, end)).replace(/\s+$/, ''));
  }
  return out;
}

/** The original duel dialog table (dlg_indx_? u32 offsets into UTF-16LE dlg_text_?), colour codes (@n) removed. */
export function decodeDialogTable(index: Uint8Array, text: Uint8Array): Map<number, string> {
  if (index.length % 4 || index.length > 64 * 1024 || text.length > 4 * 1024 * 1024) throw new Error('Unexpected duel dialog table size');
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength), decoder = new TextDecoder('utf-16le'), out = new Map<number, string>();
  for (let id = 0; id < index.length / 4 && id < 4096; id++) {
    const start = view.getUint32(id * 4, true); if (start >= text.length) continue;
    let end = start; while (end + 1 < text.length && (text[end] || text[end + 1])) end += 2;
    const value = decoder.decode(text.subarray(start, end)).replace(/@\d/g, '').trim();
    if (value) out.set(id, value);
  }
  return out;
}

/** Strings the rewrite's screens say that the original's tables lack (its own messages and fallbacks): English for now,
 * kept in one place so each can be translated later (`translations[language][key]`). */
export const REWRITE_TEXT = {
  addedEnglish: 'Words the original game lacks stay in English.',
  languageFollows: 'Card names, card text, pack names, menus, NPC dialogue and duel texts follow this choice',
  needsData: 'Other languages need the original game data.',
  waitingOpponent: 'Waiting for an opponent',
  searchingOpponent: 'Searching for an opponent',
  closeDuel: 'Close the duel you created?',
  closeBeforeMove: 'Close your duel before moving.',
  password: 'Password',
  enterPassword: 'Enter your password',
  wrongPassword: 'The password is incorrect.',
  noTournament: 'No tournament',
  entryOpen: 'Entry open',
  openTournament: 'Open the Main Menu\'s Tournament to take part.',
  win: 'Win', loss: 'Loss', draw: 'Draw', all: 'All',
  autoduel: 'Autoduel', duelRoom: 'Duel Room', invitation: 'Invitation', tournament: 'Tournament', ranked: 'Ranked',
  serverDeclined: 'The server declined that action.',
} as const;
export type RewriteTextKey = keyof typeof REWRITE_TEXT;
/** Translations of REWRITE_TEXT by language letter; none yet (each falls back to its English). */
export const REWRITE_TRANSLATIONS: Partial<Record<GameLanguage, Partial<Record<RewriteTextKey, string>>>> = {};

const fold = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The English table's index (string → its first id) and the chosen language's table. */
export class UiText {
  private byEnglish = new Map<string, number>();
  private byFolded = new Map<string, number>();
  private english: readonly string[] = [];
  private local: readonly string[] | null = null;
  language: GameLanguage = 'E';
  /** `english`: yo2text_e; `local`: the chosen language's table (null or English: labels as they are). */
  install(english: readonly string[], local: readonly string[] | null, language: GameLanguage): void {
    if (english !== this.english) {
      const exact = new Map<string, number>(), folded = new Map<string, number>();
      english.forEach((s, id) => { const t = s.trim(); if (!t) return; if (!exact.has(t)) exact.set(t, id); const f = fold(t); if (!folded.has(f)) folded.set(f, id); });
      this.english = english; this.byEnglish = exact; this.byFolded = folded;
    }
    this.local = language === 'E' ? null : local; this.language = this.local ? language : 'E';
  }
  get active(): boolean { return !!this.local; }
  /** The original's id of an English string (exact, else ignoring case and spacing). */
  id(english: string): number | undefined { const t = english.trim(); return this.byEnglish.get(t) ?? this.byFolded.get(fold(t)); }
  /** The chosen language's string for an id; undefined in English or when that table lacks it. */
  text(id: number): string | undefined { const s = this.local?.[id]; return s?.trim() ? s : undefined; }
  /** The label in the chosen language: the same id's string, else (per line) as it is. Leading / trailing space kept. */
  t(english: string): string {
    if (!this.local || !english.trim()) return english;
    const whole = this.lookup(english); if (whole !== undefined) return whole;
    if (!english.includes('\n')) return english;
    return english.split('\n').map(line => this.lookup(line) ?? line).join('\n');
  }
  /** A REWRITE_TEXT string in the chosen language (its translation when there is one, else its English). */
  rewrite(key: RewriteTextKey): string { return REWRITE_TRANSLATIONS[this.language]?.[key] ?? REWRITE_TEXT[key]; }
  private lookup(english: string): string | undefined {
    const id = this.id(english); if (id === undefined) return undefined;
    const local = this.text(id); if (local === undefined) return undefined;
    const lead = /^\s*/.exec(english)![0], trail = /\s*$/.exec(english)![0];
    // main's captures write some labels in capitals ('TRADE'); the original's own string there is too
    const upper = english.trim() === english.trim().toUpperCase() && english.trim() !== this.english[id]?.trim();
    return lead + (upper ? local.trim().toUpperCase() : local.trim()) + trail;
  }
}

// What a player typed or chose (inputs, names in lists, decks) is never translated: only the words the screens show.
const TYPED = /Input|Edit|TextField|Listbox|FileList|Kaban|ChatLog|Textlist/;
/** Puts every label the rewrite gives main's screens through the chosen language (label / text / title / items). */
export function localizeSpecs(specs: readonly WindowSpec[], text: UiText): void {
  if (!text.active) return;
  for (const { win } of specs) {
    if (typeof win.title === 'string') win.title = text.t(win.title);
    for (const c of win.controls) {
      if (TYPED.test(c.cls)) continue;
      if (typeof c.label === 'string') c.label = text.t(c.label);
      if (typeof c.text === 'string') c.text = text.t(c.text);
      if (typeof c.title === 'string') c.title = text.t(c.title);
      if (Array.isArray(c.items)) c.items = c.items.map(item => typeof item === 'string' ? text.t(item) : item);
    }
  }
}
