export interface NpcDialogueData { version: 1; lines: Record<string, Record<string, { text: string; textId: number; style: number }>>; presentTexts?: Record<string, string>; }
const PRESENT_TEXT_IDS = new Set([0x63e2, 0x655e, 0x6aae].flatMap(base => Array.from({ length: 5 }, (_, i) => base + i)));
/** Runtime-only private strings. No original wording is embedded in tracked source. */
export class NpcDialogueCatalog {
  private lines: NpcDialogueData['lines'] = {};
  private presentTexts: Record<string, string> = {};
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
    this.lines = lines; this.presentTexts = presentTexts;
  }
  resolve(npc: number, line: number): string | null { return this.lines[String(npc)]?.[String(line)]?.text ?? null; }
  resolveText(textId: number): string | null { return this.presentTexts[String(textId)] ?? null; }
  clear(): void { this.lines = {}; this.presentTexts = {}; }
}
