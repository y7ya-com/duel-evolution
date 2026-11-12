#!/usr/bin/env node
// tools/htmlui-templates.mjs [--check]: the layout templates the rewrite's windows take from main's captures
// (client/web-shell/htmlui/mock/*.json), cut to what src/ui/htmlui reads, into src/ui/htmlui/templates/ (committed;
// run this again after main's captures change; --check fails when the committed copies are stale).
//
// Every consumer takes a capture's first window and reads its cls, x, y, w, h and controls (WindowBuilder.fromTemplate
// clones the controls; lobby.ts / windows.ts / options.ts / deck-scene.ts / trade.ts), so a template keeps only those:
// the capture's frame, mouse, cursor, tasks and notes go. Per template, what its consumer provably never reads:
//  - duelsetup-move: no control (lobby.ts moveWindow builds its own; only the window's place is the capture's)
//  - playerselect-live: no child control (windows.ts playerSelect clones without children: fromTemplate(t))
//  - lobby-card: no picture parts on the top-level text switches and the thin frame's (playerCard,
//    discordCard and npcCard set every top-level CWindowTaskTextSwitch's parts to undefined; the thin frame's parts
//    are replaced whenever the card is not the capture's own size and place, and npcCard / discordCard always are)
// The rendered windows are unchanged: tests/htmlui-templates.test.ts builds each window from the capture and from
// the template and compares them.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = resolve(root, '../web-shell/htmlui/mock'), OUT = resolve(root, 'src/ui/htmlui/templates');
export const TEMPLATES = ['dialog-error', 'dialog-input1', 'dialog-ok', 'dialog-yesno', 'duelsetup-config', 'duelsetup-find', 'duelsetup-findmenu',
  'duelsetup-menu', 'duelsetup-move', 'duelsetup-plist', 'duelsetup-wait', 'lobby-card', 'playerselect-live'];
const top = c => !c.parent;
const RULES = {
  'duelsetup-move': () => [],
  'playerselect-live': cs => cs.filter(top),
  'lobby-card': cs => cs.map(c => top(c) && c.cls === 'CWindowTaskTextSwitch' ? { ...c, parts: undefined } : c),
};
export function slim(name, capture) {
  const w = capture.windows[0];
  const controls = (RULES[name] ?? (cs => cs))(w.controls);
  return { windows: [{ cls: w.cls, x: w.x, y: w.y, w: w.w, h: w.h, controls }] };
}
const text = name => JSON.stringify(slim(name, JSON.parse(readFileSync(resolve(MOCK, `${name}.json`), 'utf8')))) + '\n';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'); let stale = 0;
  mkdirSync(OUT, { recursive: true });
  for (const name of TEMPLATES) {
    const file = resolve(OUT, `${name}.json`), next = text(name);
    if (check) { if (!existsSync(file) || readFileSync(file, 'utf8') !== next) { console.error(`stale: ${file}`); stale++; } }
    else writeFileSync(file, next);
  }
  if (stale) process.exitCode = 1;
}
