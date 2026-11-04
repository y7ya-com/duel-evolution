import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CardCatalog, readCatalog } from '../src/catalog';
describe('bounded private display catalog', () => {
  it('does not manufacture names or copy limits for unknown cards', () => {
    const c = new CardCatalog(); expect(c.card(123, 2)).toEqual({ id: '123', passcode: 123, name: 'Card 123', owned: 2 });
  });
  it('installs atomically and retains the previous catalog on invalid metadata', () => {
    const c = new CardCatalog(); c.install([{ passcode: 123, name: 'Example', extra: true }]);
    expect(() => c.install([{ passcode: 123, name: 'Changed' }, { passcode: -1, name: 'Invalid' }])).toThrow();
    expect(c.card(123).name).toBe('Example');
  });
  it('rejects excessive content length before reading and cancels the body', async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { headers: { 'content-type': 'application/json', 'content-length': '1000' } });
    await expect(readCatalog(response, undefined, 100)).rejects.toThrow('budget'); expect(cancelled).toBe(true);
  });
  it('enforces actual bytes even when content length is absent', async () => {
    await expect(readCatalog(new Response(' '.repeat(500), { headers: { 'content-type': 'application/json' } }), undefined, 100)).rejects.toThrow('budget');
  });
  it('parses within bounds and aborts a stalled reader', async () => {
    expect(await readCatalog(Response.json([{ passcode: 1, name: 'A' }]))).toEqual([{ passcode: 1, name: 'A' }]);
    const controller = new AbortController(), response = new Response(new ReadableStream(), { headers: { 'content-type': 'application/json' } });
    const reading = readCatalog(response, controller.signal); controller.abort();
    await expect(reading).rejects.toThrow();
  });
});

const generated = resolve(import.meta.dirname, '../public/card-catalog.json');
it.skipIf(!existsSync(generated))('accepts every generated display row, including cards without source names', () => {
  const c = new CardCatalog(); c.install(JSON.parse(readFileSync(generated, 'utf8')));
  expect(c.size).toBeGreaterThan(3000); expect(c.card(501000005).name).toBe('Card 501000005');
});
