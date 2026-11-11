// The starter deck chooser is main's (client/web-shell/starter.js: the deck grid, a deck's card list, "Choose this
// deck", the confirm, Later), opened over the rewrite's stage through yo2Starter.show(decks, opts): the claim is the
// rewrite's claimStarter command and Later closes it until the next sign-in, as on main until the next page load.
import type { StarterDeckChoice } from '../contracts';

export interface StarterHost {
  /** The element the picker covers (main: the game's #canvas). */
  host: () => HTMLElement;
  claim(id: number): Promise<{ ok: boolean; message?: string }>;
  later(): void;
  coverUrl?(passcode: number, signal: AbortSignal): Promise<string>;
}
interface Yo2Starter { show(decks: StarterDeckChoice[], opts: object): unknown; close(): void; open: boolean }

export class StarterPicker {
  private opening = false; private shown = false; private declined = false; private abort: AbortController | null = null; private who: number | null = null;
  constructor(private readonly deps: StarterHost) {}
  /** Each render: open the picker while the character may claim one (once, until Later); close it on leaving the
   * character (another one, sign-out). `who` is the character, null for none. */
  sync(who: number | null, decks: StarterDeckChoice[] | undefined): void {
    if (typeof document === 'undefined') return;
    if (who !== this.who) { this.who = who; this.declined = false; this.close(); }
    const api = (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter;
    if (this.shown && api && !api.open) this.shown = false;   // closed by its own OK
    if (who === null || !decks?.length || this.shown || this.opening || this.declined) return;
    this.opening = true; void this.open(decks).catch(e => console.warn('starter:', e)).finally(() => { this.opening = false; });
  }
  private async open(decks: StarterDeckChoice[]): Promise<void> {
    const [ui] = await Promise.all([import('@html-ui/ui.js'), import('@web-shell/starter.js')]);
    const api = (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter; if (!api) return;
    const abort = this.abort = new AbortController(), cover = this.deps.coverUrl;
    await api.show(decks, {
      ui, art: new URL('/ui/', location.href).href, host: this.deps.host(),
      ...(cover ? { coverUrl: (d: StarterDeckChoice) => cover(d.cover, abort.signal) } : {}),
      claim: (id: number) => this.deps.claim(id),
      later: () => { this.declined = true; this.shown = false; this.deps.later(); },
    });
    this.shown = api.open;
  }
  close(): void {
    this.abort?.abort(); this.abort = null;
    if (this.shown) (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter?.close();
    this.shown = false;
  }
}
