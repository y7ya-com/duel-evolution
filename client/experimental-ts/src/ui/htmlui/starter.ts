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
  private opening = false; private shown = false; private abort: AbortController | null = null; private who: number | null = null;
  /** Characters that chose Later or claimed a deck on this page (main: until the next page load): the picker stays shut
   * for them though the server's claimable flag lags the claim or the character drops out for a reconnect. */
  private readonly done = new Set<number>();
  private claiming: Promise<{ ok: boolean; message?: string }> | null = null;
  constructor(private readonly deps: StarterHost) {}
  /** Each render: open the picker while the character may claim one (once, until Later); close it on leaving the
   * character (another one, sign-out). `who` is the character, null for none. */
  sync(who: number | null, decks: StarterDeckChoice[] | undefined): void {
    if (typeof document === 'undefined') return;
    if (who !== this.who) { this.who = who; this.close(); }
    const api = (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter;
    if (this.shown && api && !api.open) this.shown = false;   // closed by its own OK
    if (who === null || !decks?.length || this.shown || this.opening || this.done.has(who)) return;
    this.opening = true; void this.open(decks).catch(e => console.warn('starter:', e)).finally(() => { this.opening = false; });
  }
  private async open(decks: StarterDeckChoice[]): Promise<void> {
    const [ui] = await Promise.all([import('@html-ui/ui.js'), import('@web-shell/starter.js')]);
    const api = (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter; if (!api) return;
    const abort = this.abort = new AbortController(), cover = this.deps.coverUrl;
    await api.show(decks, {
      ui, art: new URL('/ui/', location.href).href, host: this.deps.host(),
      ...(cover ? { coverUrl: (d: StarterDeckChoice) => cover(d.cover, abort.signal) } : {}),
      // one claim at a time: a second press of "Yes, take it" (a double click lands on the button before its busy view
      // replaces it) answers with the first claim's result, never a second claim the server refuses as already claimed
      claim: (id: number) => this.claiming ??= (async () => {
        const who = this.who;
        try { const r = await this.deps.claim(id); if (r.ok && who !== null) this.done.add(who); return r; }
        finally { this.claiming = null; }
      })(),
      later: () => { if (this.who !== null) this.done.add(this.who); this.shown = false; this.deps.later(); },
    });
    this.shown = api.open;
  }
  close(): void {
    this.abort?.abort(); this.abort = null;
    if (this.shown) (globalThis as unknown as { yo2Starter?: Yo2Starter }).yo2Starter?.close();
    this.shown = false;
  }
}
