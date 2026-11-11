import { GAME_LANGUAGES, gameLanguage, type GameLanguage } from '../../features/language';
import type { ClientView } from '../contracts';
import { REWRITE_TEXT } from '../../features/ui-text';

/** Options → Language: the original's seven language flags (Japanese, English, German, French / Italian, Spanish,
 * Korean), each named in its own language; the chosen one is pressed and named on the section line. */
export function renderLanguageSettings(state: ClientView, choose: (language: GameLanguage) => void): HTMLElement {
  const current = state.settings.language ?? 'E', status = state.languageStatus;
  const root = document.createElement('section'); root.className = 'de-settings-row de-language'; root.dataset.key = 'options-language';
  const heading = document.createElement('h3'); heading.textContent = 'Language';
  const selected = document.createElement('span'); selected.className = 'de-language-current'; selected.textContent = gameLanguage(current).name;
  heading.append(' ', selected); root.append(heading);
  const group = document.createElement('div'); group.className = 'de-row de-language-flags'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Game text language');
  for (const language of GAME_LANGUAGES) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = language.name; b.lang = language.lang;
    b.title = language.english; b.dataset.key = `language:${language.code}`; b.setAttribute('aria-pressed', String(language.code === current));
    b.disabled = !!status?.loading || !status?.available && language.code !== 'E';
    b.onclick = () => choose(language.code); group.append(b);
  }
  root.append(group);
  const note = (text: string, cls = 'de-note') => { const p = document.createElement('p'); p.className = cls; p.textContent = text; root.append(p); return p; };
  if (status?.loading) note(`Loading ${gameLanguage(status.loading).english} game text…`).setAttribute('role', 'status');
  else if (!status?.available) note('Other languages need the original game data.');
  else note(`${REWRITE_TEXT.languageFollows}${status.missing ? ` (${status.missing} cards are not in these tables and stay in English)` : ''}. ${REWRITE_TEXT.addedEnglish}`);
  if (status?.error) note(status.error, 'de-error').setAttribute('role', 'alert');
  return root;
}
