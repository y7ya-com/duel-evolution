export interface NpcDialogueData { version: 1; lines: Record<string, Record<string, { text: string; textId: number; style: number }>>; presentTexts?: Record<string, string>; bios?: Record<string, string>; }
/** CNpcListMenu::conditionText (@yo2 0x0089e250, client/src/Lobby/yo2NpcListMenu.cpp): the yo2text id of the text on the
 * NPC's card in its talk, one per three NPCs (levels 4 / 6 / 8) from 0x33 to 0x5f; others have none. */
const BIO_TEXTS = [0x22c6, 0x22c5, 0x22c7, 0x22c8, 0x22c9, 0x22ca, 0x22cd, 0x22ce, 0x22cf, 0x22d0, 0x22d1, 0x22d2, 0x22d4, 0x22d3, 0x22d5];
export const npcBioTextId = (npc: number): number | undefined => npc >= 0x33 && npc <= 0x5f ? BIO_TEXTS[Math.floor((npc - 0x33) / 3)] : undefined;
const PRESENT_TEXT_IDS = new Set([0x63e2, 0x655e, 0x6aae].flatMap(base => Array.from({ length: 5 }, (_, i) => base + i)));
/** Runtime-only private strings. No original wording is embedded in tracked source. */
export class NpcDialogueCatalog {
  private lines: NpcDialogueData['lines'] = {};
  private presentTexts: Record<string, string> = {};
  private bios: Record<string, string> = {};
  install(input: unknown): void {
    const data = input as NpcDialogueData;
    if (!data || data.version !== 1 || !data.lines || typeof data.lines !== 'object' || Array.isArray(data.lines) || Object.keys(data.lines).length > 120) throw new Error('Invalid NPC dialogue data');
    const lines: NpcDialogueData['lines'] = {}; let totalCharacters = 0;
    for (const [npc, row] of Object.entries(data.lines)) {
      if (!/^[1-9]\d{0,4}$/.test(npc) || !row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length > 100) throw new Error('Invalid NPC dialogue row');
      const entry: NpcDialogueData['lines'][string] = {};
      for (const [line, value] of Object.entries(row)) {
        if (!/^(0|[1-9]\d?)$/.test(line) || !value || typeof value.text !== 'string' || value.text.length > 16384 || !Number.isInteger(value.textId) || value.textId < 1 || !Number.isInteger(value.style)) throw new Error('Invalid NPC dialogue line');
        if ((totalCharacters += value.text.length) > 8 * 1024 * 1024) throw new Error('NPC dialogue budget exceeded');
        entry[line] = { ...value };
      }
      lines[npc] = entry;
    }
    const presentTexts: Record<string, string> = {};
    if (data.presentTexts !== undefined) {
      if (!data.presentTexts || typeof data.presentTexts !== 'object' || Array.isArray(data.presentTexts) || Object.keys(data.presentTexts).length > 15) throw new Error('Invalid NPC eligibility text data');
      for (const [id, text] of Object.entries(data.presentTexts)) {
        if (!/^[1-9]\d*$/.test(id) || !PRESENT_TEXT_IDS.has(Number(id)) || typeof text !== 'string' || text.length > 16384 || (totalCharacters += text.length) > 8 * 1024 * 1024) throw new Error('Invalid NPC eligibility text');
        presentTexts[id] = text;
      }
    }
    const bios: Record<string, string> = {};
    if (data.bios !== undefined) {
      if (!data.bios || typeof data.bios !== 'object' || Array.isArray(data.bios) || Object.keys(data.bios).length > BIO_TEXTS.length) throw new Error('Invalid NPC card text data');
      for (const [id, text] of Object.entries(data.bios)) {
        if (!BIO_TEXTS.includes(Number(id)) || typeof text !== 'string' || text.length > 16384 || (totalCharacters += text.length) > 8 * 1024 * 1024) throw new Error('Invalid NPC card text data');
        bios[id] = text;
      }
    }
    this.lines = lines; this.presentTexts = presentTexts; this.bios = bios;
  }
  /** The text on the NPC's card in its talk (English), or null. */
  bio(npc: number): string | null { const id = npcBioTextId(npc); return id === undefined ? null : this.bios[String(id)] ?? null; }
  resolve(npc: number, line: number): string | null { return this.lines[String(npc)]?.[String(line)]?.text ?? null; }
  /** The line's first yo2text id (its five strings follow it). */
  textId(npc: number, line: number): number | undefined { return this.lines[String(npc)]?.[String(line)]?.textId; }
  resolveText(textId: number): string | null { return this.presentTexts[String(textId)] ?? null; }
  clear(): void { this.lines = {}; this.presentTexts = {}; this.bios = {}; }
}
/** An NPC balloon line as live shows it: the engine's "@@s" (CFukiDictionary's player placeholder) is the player's name. */
export const npcLineText = (text: string, playerName: string): string => text.replace(/@@s/g, playerName);
