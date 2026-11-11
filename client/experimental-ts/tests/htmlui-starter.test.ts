import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@html-ui/ui.js', () => ({}));
vi.mock('@web-shell/starter.js', () => ({}));
import { StarterPicker } from '../src/ui/htmlui/starter';
import type { StarterDeckChoice } from '../src/ui/contracts';

// main's web-shell/starter.js as the picker sees it: show() opens, its own OK / Later close it
interface Opts { claim(id: number): Promise<{ ok: boolean }>; later(): void }
const fake = () => { const api = { open: false, shows: 0, opts: null as Opts | null,
  async show(_d: unknown, opts: Opts) { api.open = true; api.shows++; api.opts = opts; }, close() { api.open = false; } }; return api; };
const decks = [{ id: 1 }] as unknown as StarterDeckChoice[];
const tick = () => new Promise(r => setTimeout(r, 0));

describe('main\'s starter deck picker over the rewrite', () => {
  let api: ReturnType<typeof fake>;
  beforeEach(() => { api = fake(); Object.assign(globalThis, { document: {}, yo2Starter: api, location: { href: 'http://x/' } }); });
  afterEach(() => { delete (globalThis as Record<string, unknown>).document; delete (globalThis as Record<string, unknown>).yo2Starter; delete (globalThis as Record<string, unknown>).location; });
  const picker = (ok = true) => new StarterPicker({ host: () => ({} as HTMLElement), claim: async () => ({ ok }), later: () => {} });

  it('stays shut after a claim while the server still says claimable (over the Main Menu)', async () => {
    const p = picker(); p.sync(5, decks); await tick(); await tick();
    expect(api.shows).toBe(1);
    expect((await api.opts!.claim(1)).ok).toBe(true);
    api.close();   // its own OK
    for (let i = 0; i < 3; i++) { p.sync(5, decks); await tick(); }
    expect(api.shows).toBe(1);
  });
  it('stays shut after Later, also across a reconnect that drops the character for a moment', async () => {
    const p = picker(); p.sync(5, decks); await tick(); await tick();
    api.opts!.later(); api.close();
    p.sync(null, undefined); p.sync(5, decks); await tick(); await tick();
    expect(api.shows).toBe(1);
    // another character may still choose
    p.sync(6, decks); await tick(); await tick();
    expect(api.shows).toBe(2);
  });
  it('opens again after a refused claim is closed', async () => {
    const p = picker(false); p.sync(5, decks); await tick(); await tick();
    expect((await api.opts!.claim(1)).ok).toBe(false);
    api.close(); p.sync(5, decks); await tick(); await tick();
    expect(api.shows).toBe(2);
  });
});
