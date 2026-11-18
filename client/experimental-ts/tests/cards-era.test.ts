import { describe, expect, it, vi } from 'vitest';
import { EraCards, eraConfigFromPage, loadEraCards } from '../src/cards/era';
import { AssetManager } from '../src/assets';
import { CardCatalog } from '../src/catalog';
import { createEraMiddleware, eraBase } from '../tools/era-assets.mjs';

// Synthetic stand-ins only: the shape live's ship-client.sh injects into yo2rc.html, not its wording.
const config = { base: 'c-0123456789abcdef/', cards: {
  248: { pc: 26202165, face: 'merge/data/card/26202165.png', text: { E: 'Printed English', G: 'Printed German', J: '' } },
  1710: { pc: 40737112, face: 'merge/data/card/40737112.png', text: { E: 'Printed DMoC' } },
} };
const page = (c: unknown) => `<!doctype html><script>var Module={};</script>\n<script>Module.yo2EraCards=${JSON.stringify(c).replace(/</g, '\\u003c')};</script>\n<script id="pick">x()</script>`;
const PAGE = 'https://v2.example/yo2rc.html';
const png = Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64'));
const jpeg = [255,216,255,192,0,11,8,0,2,0,3,1,1,17,0,255,218,0,8,1,1,0,0,63,0];

describe('2008 card configuration (live yo2rc.html Module.yo2EraCards)', () => {
  it('reads the injected object, and none from a page without it', () => {
    expect(eraConfigFromPage(page(config))).toEqual(config);
    expect(eraConfigFromPage('<!doctype html><title>v2</title>')).toBeNull();
    expect(() => eraConfigFromPage('<script>Module.yo2EraCards={"base":')).toThrow('unterminated');
    expect(() => eraConfigFromPage('<script>Module.yo2EraCards={base:1};</script>')).toThrow('JSON');
  });
  it('keys by passcode and YO2 id, resolves faces and thumbnails against the page, and falls back to English', () => {
    const era = new EraCards(config, PAGE);
    expect(era.size).toBe(2);
    const sangan = era.byPasscode(26202165)!;
    expect(sangan).toMatchObject({ id: 248, passcode: 26202165,
      face: 'https://v2.example/c-0123456789abcdef/merge/data/card/26202165.png', mini: 'https://v2.example/c-0123456789abcdef/merge/data/mini/26202165.png' });
    expect(era.byId(1710)?.passcode).toBe(40737112);
    expect(era.byId(249)).toBeUndefined(); expect(era.byPasscode(1)).toBeUndefined();
    expect(era.text(26202165, 'G')).toBe('Printed German');
    expect(era.text(26202165, 'J')).toBe('Printed English');   // an empty wording is no wording
    expect(era.text(40737112, 'F')).toBe('Printed DMoC');
    expect(era.text(1)).toBeUndefined();
  });
  it.each([
    [{ ...config, base: 'https://evil.example/' }, 'base'],
    [{ ...config, base: '../c-1/' }, 'base'],
    [{ ...config, base: '/c-1/' }, 'base'],
    [{ base: 'c-1/', cards: { 0: config.cards[248] } }, 'card id'],
    [{ base: 'c-1/', cards: { 248: { ...config.cards[248], face: 'merge/data/card/1.png' } } }, 'face'],
    [{ base: 'c-1/', cards: { 248: { ...config.cards[248], face: '../../x.png' } } }, 'face'],
    [{ base: 'c-1/', cards: { 248: { ...config.cards[248], text: { G: 'x' } } } }, 'English'],
    [{ base: 'c-1/', cards: { 248: config.cards[248], 249: config.cards[248] } }, 'duplicate'],
  ])('refuses a malformed configuration %#', (bad, message) => expect(() => new EraCards(bad, PAGE)).toThrow(message));
  it('loads the page (null without the configuration; a failed or non-page answer throws)', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/yo2rc.html')
      ? new Response(page(config), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : new Response('<p>spa</p>', { headers: { 'Content-Type': 'text/html' } }));
    expect((await loadEraCards(PAGE, { fetch: fetcher }))?.size).toBe(2);
    expect(await loadEraCards('https://v2.example/other', { fetch: fetcher })).toBeNull();
    await expect(loadEraCards(PAGE, { fetch: async () => new Response('', { status: 502 }) })).rejects.toThrow('502');
    await expect(loadEraCards(PAGE, { fetch: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }) })).rejects.toThrow('not a page');
  });
});

describe('2008 printed wording in the catalog', () => {
  it('replaces the description of the listed cards in the language shown, names and other cards untouched', () => {
    const catalog = new CardCatalog();
    catalog.install([{ passcode: 26202165, name: 'Sangan', description: 'Modern' }, { passcode: 40737112, name: 'DMoC', description: 'Modern DMoC' }, { passcode: 5, name: 'Other', description: 'Other text' }]);
    const era = new EraCards(config, PAGE);
    catalog.installEraTexts(era);
    expect(catalog.card(26202165)).toMatchObject({ name: 'Sangan', description: 'Printed English', descriptionSource: 'original-e' });
    expect(catalog.card(5).description).toBe('Other text');
    catalog.installEraTexts(era, 'G');
    expect(catalog.card(26202165).description).toBe('Printed German');
    expect(catalog.card(40737112).description).toBe('Printed DMoC');
  });
});

describe('2008 printed faces in the asset manager', () => {
  const faces = () => vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u === 'https://v2.example/c-0123456789abcdef/merge/data/card/26202165.png') return new Response(Uint8Array.from(png));
    if (u === 'https://v2.example/c-0123456789abcdef/merge/data/mini/26202165.png') return new Response(Uint8Array.from(jpeg));
    if (u.includes('/c-0123456789abcdef/')) return new Response(null, { status: 404 });
    throw new Error(`archive read ${u}`);   // every other card goes to card.dat (not reached here)
  });
  it('serves the legacy face over card.dat by passcode, by YO2 id and as the thumbnail, never reading the archives', async () => {
    const fetcher = faces(), manager = new AssetManager({ baseUrl: '/game/', cardsBaseUrl: '/cards/', fetch: fetcher, eraCards: new EraCards(config, PAGE) });
    const art = await manager.loadCard(26202165);
    expect(art.value.mimeType).toBe('image/png'); expect(art.value.width).toBe(1); art.release();
    expect([...(await manager.readCardArt(248))!.subarray(0, 4)]).toEqual(png.slice(0, 4));
    const mini = await manager.loadMini(26202165);
    expect(mini.value.mimeType).toBe('image/jpeg'); mini.release();   // the bytes name the format, not the file name
    await manager.prefetchCard(26202165);
    await expect(manager.loadCard(40737112)).rejects.toThrow('404');
    expect(fetcher.mock.calls.every(([u]) => String(u).includes('/c-0123456789abcdef/'))).toBe(true);
    manager.dispose();
  });
  it('leaves every card on card.dat without the configuration', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const manager = new AssetManager({ baseUrl: '/game/', cardsBaseUrl: '/cards/', fetch: fetcher, eraCards: null });
    await expect(manager.loadCard(26202165)).rejects.toThrow();
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/^\/cards\/merge\/data\/card\.dat/);
    manager.dispose();
  });
});

describe('development middleware for the 2008 card files', () => {
  const run = (mw: ReturnType<typeof createEraMiddleware>, url: string, method = 'GET') => new Promise<{ status: number; next?: boolean; type?: string }>(done => {
    const res = { headersSent: false, status: 0, type: '', writeHead(s: number, h: Record<string, string>) { this.status = s; this.type = h['Content-Type'] ?? ''; this.headersSent = true; }, end() { done({ status: res.status, type: res.type }); }, destroy() {} };
    mw({ url, method }, res, () => done({ status: 0, next: true }));
  });
  it('forwards only the page and the hashed faces to the host beside game/', async () => {
    expect(eraBase('https://original.example/game/')).toBe('https://original.example/');
    const fetcher = vi.fn(async () => new Response('x'));
    const mw = createEraMiddleware({ baseUrl: 'https://original.example/', fetch: fetcher });
    expect(await run(mw, '/yo2rc.html')).toEqual({ status: 200, type: 'text/html; charset=utf-8' });
    expect(await run(mw, '/c-0123456789abcdef/merge/data/mini/26202165.png')).toEqual({ status: 200, type: 'image/png' });
    expect(fetcher.mock.calls.map(c => String((c as unknown[])[0]))).toEqual(['https://original.example/yo2rc.html', 'https://original.example/c-0123456789abcdef/merge/data/mini/26202165.png']);
    expect(await run(mw, '/c-0123456789abcdef/merge/data/card/../../x.png')).toEqual({ status: 0, next: true });
    expect(await run(mw, '/c-xyz/merge/data/card/1.png')).toEqual({ status: 0, next: true });
    expect(await run(mw, '/yo2rc.html?x=1')).toMatchObject({ status: 404 });
    expect(await run(mw, '/yo2rc.html', 'POST')).toMatchObject({ status: 405 });
  });
});
