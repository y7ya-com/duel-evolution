import type { DuelPromptView } from './contracts';

/** A card-name declaration (Prohibition, ...), as the original's card list window for it (CWindowDeckList kinds
 * 0x4b..0x4e with its search box, CWindowTaskListSearch: client/src/duel/SceneDeckList.cpp): every card the list mode
 * allows, in the original name order, narrowed to the names that hold the search text as it is typed. Picking a
 * candidate declares it; Announce declares the typed name (or passcode). The server still decides what is declarable. */

/** How many matches the list shows at once (the rest are reached by typing more of the name). */
export const ANNOUNCE_SHOWN = 60;

export function matchDeclarable(list: readonly { id: string; label: string }[], search: string): { id: string; label: string }[] {
  const key = search.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return [...list];
  // A passcode typed whole names its card; otherwise the names that hold the text (the original's wcontains).
  if (/^\d{4,9}$/.test(key)) { const exact = list.filter(c => c.id === key); if (exact.length) return exact; }
  return list.filter(c => c.label.toLowerCase().replace(/\s+/g, ' ').includes(key));
}

export interface AnnounceOptions { busy: boolean; declare(text: string): void }

export class AnnouncePanel {
  private search = new Map<string, string>();

  render(prompt: DuelPromptView, options: AnnounceOptions): HTMLElement {
    for (const id of this.search.keys()) if (id !== prompt.id) this.search.delete(id);
    const list = prompt.declarable ?? [];
    const form = document.createElement('form'); form.className = 'de-announce';
    const row = document.createElement('div'); row.className = 'de-row';
    const input = document.createElement('input'); input.dataset.key = `prompt-announcement:${prompt.id}`; input.name = input.dataset.key;
    input.placeholder = 'Search card names'; input.setAttribute('aria-label', 'Card announcement'); input.maxLength = 120; input.autocomplete = 'off';
    input.value = this.search.get(prompt.id) ?? '';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'gold'; submit.textContent = 'Announce'; submit.disabled = options.busy;
    row.append(input, submit);
    const count = document.createElement('p'); count.className = 'de-note de-announce-count'; count.setAttribute('aria-live', 'polite');
    const choices = document.createElement('div'); choices.className = 'de-announce-list'; choices.setAttribute('role', 'listbox'); choices.setAttribute('aria-label', 'Declarable cards');
    const fill = () => {
      const found = matchDeclarable(list, input.value), shown = found.slice(0, ANNOUNCE_SHOWN);
      choices.replaceChildren(...shown.map(c => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = c.label; b.disabled = options.busy;
        b.dataset.key = `prompt-declare:${prompt.id}:${c.id}`; b.setAttribute('role', 'option');
        b.onclick = () => options.declare(c.id);
        return b;
      }));
      count.textContent = !list.length ? '' : !found.length ? 'No card name holds that text.'
        : found.length > shown.length ? `${found.length} cards: showing the first ${shown.length}. Type more of the name to narrow the list.`
        : `${found.length} card${found.length === 1 ? '' : 's'}.`;
    };
    input.oninput = () => { this.search.set(prompt.id, input.value); fill(); };
    form.onsubmit = e => { e.preventDefault(); options.declare(input.value); };
    fill();
    form.append(row, count, choices);
    return form;
  }
}

export const ANNOUNCE_CSS = `
.de-announce { display:flex; flex-direction:column; gap:.35rem; }
.de-announce-list { display:flex; flex-wrap:wrap; gap:4px; max-height:11.5em; overflow:auto; }
.de-announce-list button { font-size:12px; padding:2px 6px; }
.de-announce-count { margin:0; }
.de-duel-instruction { position:absolute; left:50%; top:${262 / 768 * 100}%; transform:translate(-50%,-50%); z-index:9; pointer-events:none; max-width:70%;
  padding:.2em .9em; font:bold 14px/1.3 Arial,'Segoe UI',sans-serif; color:#fff; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  background:rgba(8,40,86,.82); border:1px solid #7fc4ff; border-radius:3px; text-shadow:0 1px 1px #000; }
`;
