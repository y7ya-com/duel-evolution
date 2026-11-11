// Every dialog the rewrite raises carries its message already broken into lines: main's dialog.js draws a stock
// dialog's text unwrapped (white-space: pre), and the original's messages carry their own breaks where the rewrite's and
// the server's do not.
/** A dialog's text broken into lines that fit `width` game px (the field breaks lines only where the text does, as the
 * original's messages carry their own breaks; the rewrite's and the server's do not): at spaces, a word wider than the
 * line cut. The stock dialogs' 16 px font: 34 Latin characters fill the error box's 320 px (main's language error),
 * a full-width (CJK) character twice one. Breaks already in the text are kept. */
export function wrapDialogText(text: string, width: number): string {
  const per = 320 / 34, cols = (s: string) => [...s].reduce((n, c) => n + (c.codePointAt(0)! >= 0x2e80 ? 2 : 1), 0);
  const max = Math.max(4, Math.floor(width / per));
  return text.split('\n').map(para => {
    const lines: string[] = [];
    for (let word of para.split(' ')) {
      const last = lines.length ? lines[lines.length - 1]! : undefined;
      if (last !== undefined && cols(last + ' ' + word) <= max) { lines[lines.length - 1] = last + ' ' + word; continue; }
      while (cols(word) > max) { let cut = '', n = 0; for (const c of word) { const w = cols(c); if (n + w > max) break; cut += c; n += w; } lines.push(cut); word = word.slice(cut.length); }
      lines.push(word);
    }
    return lines.join('\n');
  }).join('\n');
}
/** A message wrapped for a box and its line count (at most `max`), for a dialog sized to its text. */
export function dialogLines(text: string, width: number, max = 4): { text: string; n: number } {
  const wrapped = wrapDialogText(text, width);
  return { text: wrapped, n: Math.max(1, Math.min(max, wrapped.split('\n').length)) };
}
