import type { DuelPrompt } from './types';

export interface TextAlternative { card: number; text: string }
export interface DuelTextData {
  v: 1; legacyOptions: Record<string, TextAlternative[]>;
  legacyPrompts: Record<string, TextAlternative[]>; cardNames: Record<string, string>;
}
const normal = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Generated display data only. Installing text never grants an action or changes response values. */
export class DuelTextCatalog {
  private options = new Map<number, TextAlternative[]>();
  private prompts = new Map<number, TextAlternative[]>();
  private names = new Map<number, string>();
  install(input: unknown): void {
    if (!input || typeof input !== 'object' || (input as { v?: unknown }).v !== 1) throw new Error('Invalid duel text version');
    const data = input as Record<string, unknown>; let bytes = 0;
    const text = (value: unknown, limit: number): string => {
      if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('Invalid duel text');
      bytes += value.length * 2; if (bytes > 4 * 1024 * 1024) throw new Error('Duel text budget exceeded');
      return value.replace(/\r\n/g, '\n').trim();
    };
    const entries = (value: unknown, limit: number): [string, unknown][] => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid duel text table');
      const rows = Object.entries(value); if (rows.length > limit) throw new Error('Duel text table exceeds its limit');
      for (const [key] of rows) if (!/^\d+$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) > 0xffffffff) throw new Error('Invalid duel text identifier');
      return rows;
    };
    const alternatives = (value: unknown) => new Map(entries(value, 4096).map(([key, items]) => {
      if (!Array.isArray(items) || items.length > 64) throw new Error('Invalid duel text alternatives');
      const out = items.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new Error('Invalid duel text alternative');
        const row = item as Record<string, unknown>;
        if (!Number.isSafeInteger(row.card) || Number(row.card) < 0 || Number(row.card) > 0xffffffff) throw new Error('Invalid duel text card');
        return { card: Number(row.card), text: text(row.text, 4096) };
      });
      return [Number(key), out] as const;
    }));
    // Validate everything before replacing the current usable catalog.
    const options = alternatives(data.legacyOptions), prompts = alternatives(data.legacyPrompts);
    const names = new Map(entries(data.cardNames, 100000).map(([key, value]) => [Number(key), text(value, 512)]));
    this.options = options; this.prompts = prompts; this.names = names;
  }
  private resolve(table: Map<number, TextAlternative[]>, id: number, card?: number): string | null {
    const values = table.get(id); if (!values?.length) return null;
    if (card) { const own = values.find(v => v.card === card); if (own) return own.text; }
    const system = values.find(v => v.card === 0); if (system) return system.text;
    const unique = new Map(values.map(v => [normal(v.text), v.text]));
    return unique.size === 1 ? unique.values().next().value ?? null : null;
  }
  option(id: number, card?: number): string | null { return this.resolve(this.options, id, card); }
  prompt(id: number, card?: number): string | null { return this.resolve(this.prompts, id, card); }
  cardName(card: number): string | null { return this.names.get(card) ?? null; }
}

/** Meanings are backed by translator consts names and explicit handlers, rather than legacy IDs guessed as OCG IDs. */
const PROMPT_MEANINGS: Record<number, string> = {
  6: 'Surrender this duel?', 7: 'Respond to this effect?', 8: 'Respond to this card?', 18: 'Choose monsters to Tribute.',
  207: 'Choose Ritual materials.', 235: 'Choose cards to discard.', 241: 'Declare a monster type.', 242: 'Declare an attribute.',
  244: 'Choose a card from your opponent’s hand.', 250: 'Activate this card’s effect?', 259: 'Choose an effect.',
  260: 'Choose a card type.', 269: 'Confirm this action?', 274: 'Choose a card on the field.', 280: 'Declare a Level.',
  286: 'Choose a Ritual Monster.', 289: 'Choose Ritual materials from the Deck.', 301: 'Choose an LP amount.',
  317: 'Choose the number of counters.', 326: 'Choose a battle position.', 328: 'Activate this card’s effect from your hand?',
  329: 'Activate this card’s effect from your Graveyard?', 594: 'Choose a number.',
};

export function describePrompt(prompt: DuelPrompt, texts: DuelTextCatalog, contextPasscode?: number): { title: string; optionLabels: Map<number, string> } {
  const subject = prompt.text.find(t => t.kind === 4)?.value ?? contextPasscode;
  const textIds = prompt.text.filter(t => t.kind === 0 || t.kind === 2).map(t => t.value);
  let title = textIds.map(id => texts.prompt(id, subject) ?? PROMPT_MEANINGS[id]).find(Boolean) ?? prompt.title;
  const name = subject ? texts.cardName(subject) : null;
  if (name && prompt.kind === 'yesno') title = `${name}: ${title}`;
  if (prompt.kind === 'discard') title = `Choose ${prompt.min} card${prompt.min === 1 ? '' : 's'} to discard.`;
  const optionLabels = new Map<number, string>();
  if (prompt.kind === 'option') for (let i = 0; i < prompt.items.length; i++) {
    const item = prompt.items[i];
    if (item.owner !== 2) continue;
    optionLabels.set(i, texts.option(item.rawId, subject) ?? `Option ${i + 1} — text ${item.rawId} unavailable`);
  }
  return { title, optionLabels };
}
