import { describe, expect, it } from 'vitest';
import { stockDialog, wrapDialogText } from '../src/ui/htmlui/windows';
import { Ids } from '../src/ui/htmlui/snapshot';

const texts = (kind: 'yesno' | 'ok' | 'error', text: string) => {
  const spec = stockDialog({ ids: new Ids() }, 'd', kind, text, [{ from: 'OK', key: 'ok', click: () => {} }]);
  return spec.win.controls.filter(c => (c.cls === 'CWindowTaskTextField' || c.cls === 'CWindowTaskText') && typeof c.text === 'string' && c.text.length > 3);
};

describe('stock dialogs wrap every message to their box', () => {
  it('breaks a long error (main\'s CWindowModelDialogError, 320 px field) at spaces within 34 columns', () => {
    const long = 'The gateway did not answer in time and the connection to the game server could not be opened again.';
    for (const c of texts('error', long)) {
      const lines = String(c.text).split('\n');
      expect(lines.length).toBeGreaterThan(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(34);
      expect(lines.join(' ')).toBe(long);
    }
  });
  it('wraps notices (Ok) and questions (Yes / No) to their own widths and keeps the text\'s own breaks', () => {
    const ok = texts('ok', 'x '.repeat(80).trim());
    for (const c of ok) for (const l of String(c.text).split('\n')) expect(l.length).toBeLessThanOrEqual(50);
    expect(wrapDialogText('First line\nSecond line', 320)).toBe('First line\nSecond line');
    expect(wrapDialogText('Short', 320)).toBe('Short');
  });
  it('cuts a word wider than the box and counts full-width characters twice', () => {
    expect(wrapDialogText('a'.repeat(40), 320).split('\n')).toEqual(['a'.repeat(34), 'a'.repeat(6)]);
    for (const l of wrapDialogText('接続'.repeat(20), 320).split('\n')) expect([...l].length).toBeLessThanOrEqual(17);
  });
});
