import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetNote, NET_NOTE_STYLE, netNoteText } from '../src/ui/htmlui/net-note';

/** A <body> that keeps what is appended (live's note goes on the page, not into the game's windows). */
function page() {
  const body: { kids: Record<string, unknown>[]; append(n: Record<string, unknown>): void } = { kids: [], append(n) { this.kids.push(n); n.remove = () => { body.kids = body.kids.filter(k => k !== n); }; } };
  const createElement = () => { const attrs: Record<string, string> = {}; return { dataset: {} as Record<string, string>, style: { cssText: '' }, textContent: '', attrs, setAttribute(k: string, v: string) { attrs[k] = v; } }; };
  vi.stubGlobal('document', { body, createElement });
  return body;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("live's connection note (loader.js)", () => {
  it('shows a lost connection at the bottom right until the game is back, never less than 1.5 s', () => {
    vi.useFakeTimers(); let t = 0; const body = page(), note = new NetNote(() => t);
    note.set(true, true);
    expect(body.kids).toHaveLength(1);
    const n = body.kids[0] as { textContent: string; style: { cssText: string }; dataset: Record<string, string>; attrs: Record<string, string> };
    expect(n.textContent).toBe('Connection lost: reconnecting to the duel…'); expect(n.style.cssText).toBe(NET_NOTE_STYLE);
    expect(n.attrs.role).toBe('status'); expect(n.dataset.key).toBe('net-reconnecting');
    note.set(true, false); expect(body.kids).toHaveLength(1); expect(n.textContent).toBe(netNoteText(true));   // the drop's own text
    t = 500; note.set(false, false); expect(body.kids).toHaveLength(1);
    vi.advanceTimersByTime(999); expect(body.kids).toHaveLength(1); vi.advanceTimersByTime(1); expect(body.kids).toHaveLength(0);
    t = 5000; note.set(true, false); expect((body.kids[0] as { textContent: string }).textContent).toBe('Connection lost: reconnecting…');
    t = 7000; note.set(false, false); expect(body.kids).toHaveLength(0);
    note.dispose();
  });
});
