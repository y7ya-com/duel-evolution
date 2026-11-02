// The Modern UI's chat (svelte/modern/Chat.svelte) through the layer in headless Chrome (mock.html?modern=1), fed
// snapshots as the engine would: unread counts on other tabs, new lines adding rows (the rows on screen are the same
// elements: nothing re-renders), the jump pill while reading back, Hide / Show playing the engine's △ / ▽ to its
// collapsed and short heights (and remembered), Enter opening it at the line, Esc leaving the line, no Duel Log tab, the
// game's names in plain case, and no shade on the dock below.   npm run build && node svelte/modern_chat_dom_test.mjs [captures dir]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), out = process.argv[2];
const PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the chat window as read (read/chat.js: mode, pairs): engine heights 128 short, 32 collapsed (8 lower), 560 tall
const ctl = (id, cls, x) => ({ id, cls: 'CWindowTask' + cls, name: 'n', parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true, enabled: true, alpha: 1, ...x });
function chat({ id = 1, mode = 1, tabs = ['All Chat', 'Proximity Chat', 'TRADE', 'Team'], active = 0, items = [] } = {}) {
  const ts = tabs.map((l, i) => ctl(100 + i, 'Tab', { x: 8 + i * 72, w: 72, h: 24, label: l, active: i === active }));
  const ls = ts.map((t, i) => ctl(200 + i, 'Textlist', { x: 8, y: 24, w: 760, h: 80, items: items[i] || [], shown: i === active }));
  const h = [560, 128, 32][mode];
  return { v: 1, scene: 12, focus: 0, tasks: [], windows: [{ id, cls: 'CChatWindow', x: 248, y: 632 - (h - 128) + (mode === 2 ? 8 : 0), w: 776, h,
    z: 1, wz: 1, shown: true, alpha: 1, mode, pairs: ts.map((t, i) => ({ tab: t.id, log: ls[i].id, visible: true })),
    controls: [...ts, ...ls, ctl(300, 'Input', { y: h - 32, w: 776, h: 32, value: '', maxLen: 128 }), ctl(301, 'IconExpand', { x: 757, w: 16, h: 24 }),
      ctl(302, 'IconHide', { x: 757, w: 16, h: 24 })] }] };
}
const LINES = ['[System] Welcome to Duelist Academy.', '@0Duelist B:hello lobby', 'Duelist B:anyone up for a duel? I have a new deck to test',
  'raMon:sure, give me a minute', 'raMon:building my side deck first', 'Kaiba Fan:gg',
  'Duelist B:a longer line to see how the log wraps a message that runs past the width of the chat window, then keeps going for a while'];

const shots = [];
for (const dpr of out ? [1, 2] : [1]) {
  const b = await launch({ dpr });
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=chat&modern=1`);
  // the page as the game's: yo2Html.snapshot() the last snapshot (macro.js waitFor reads it), api calls logged
  await b.ev(`(() => { localStorage.clear(); const r = window.__render; window.__render = s => { window.__last = s; r(s); };
    window.yo2Html = { snapshot: () => window.__last, modernScreens: new Map([['CChatWindow', 1]]) };
    document.body.style.background = 'linear-gradient(160deg, #8ec5f0, #c9b7e8 60%, #f0c9d8)'; })()`);
  const render = async s => { await b.ev(`window.__render(${JSON.stringify(s)})`); await sleep(60); };
  const q = js => b.ev(`(() => { const c = document.querySelector('#htmlui .mu'); ${js} })()`);
  const clicks = () => b.logs.filter(l => l.startsWith('log: api.click')).map(l => +l.split(' ').pop());
  const shot = async name => {
    if (!out) return;
    mkdirSync(out, { recursive: true });
    const f = path.join(out, `${name}@${dpr}x.png`);
    writeFileSync(f, await b.shot({ x: 232, y: 420, width: 792, height: 348 }));
    shots.push(f);
  };

  // history, then new lines: All in view gets them, TRADE counts one unread; the rows already there stay the same elements
  await render(chat({ items: [LINES.slice(0, 5), [], ['Trader:WTS Blue-Eyes']] }));
  assert.deepEqual(await q(`return [...c.querySelectorAll('[role=tab]')].map(t => t.textContent.trim())`), ['All', 'Proximity', 'Trade', 'Team']);
  // its shade rises only: nothing of it falls on the dock under it
  assert.match(await q(`return getComputedStyle(c.querySelector('.chat')).filter`), /drop-shadow\(rgba\(6, 24, 64, 0\.28\) 0px -6px 6px\)/);
  await q(`c.querySelectorAll('.log p').forEach(p => p.dataset.mark = 1)`);
  await render(chat({ items: [LINES, [], ['Trader:WTS Blue-Eyes', 'Trader:also Dark Magician']] }));
  assert.deepEqual(await q(`return [...c.querySelectorAll('.log p')].map(p => !!p.dataset.mark)`), [true, true, true, true, true, false, false], 'new lines only add rows');
  assert.equal(await q(`return c.querySelector('[role=tab]:nth-child(3) .count')?.textContent`), '1', 'TRADE: one unread');
  assert.equal(await q(`return c.querySelector('[role=tab]:nth-child(1) .count')`), null, 'the tab in view: none');
  // grouped: raMon's two lines show the name once (the second's name is for screen readers only)
  assert.deepEqual(await q(`return [...c.querySelectorAll('.log p')].map(p => p.classList.contains('cont'))`), [false, false, true, false, true, false, false]);
  assert.ok(await q(`const l = c.querySelector('.log'); return l.scrollHeight - l.scrollTop - l.clientHeight < 2`), 'at the bottom');
  // the time a line arrived, on hover (history has none)
  assert.deepEqual(await q(`return [...c.querySelectorAll('.log p')].map(p => !!p.querySelector('time'))`), [false, false, false, false, false, true, true]);
  const last = await q(`const r = c.querySelector('.log p:last-child').getBoundingClientRect(); return [r.x + r.width - 20, r.y + 6]`);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: last[0], y: last[1] });
  await sleep(200);
  await shot('1-open-hover');

  // reading back: new lines don't move the view, the pill counts them and jumps to the latest
  await q(`c.querySelector('.log').scrollTop = 0`);
  await sleep(100);
  await render(chat({ items: [[...LINES, 'raMon:ready', 'raMon:room 3'], [], ['Trader:WTS Blue-Eyes', 'Trader:also Dark Magician']] }));
  assert.equal(await q(`return c.querySelector('.log').scrollTop`), 0, 'still where the player was reading');
  assert.match(await q(`return c.querySelector('.jump')?.textContent.trim()`), /^2 new$/);
  await shot('2-reading-back');
  await q(`c.querySelector('.jump').click()`);
  await sleep(700);
  assert.equal(await q(`return c.querySelector('.jump')`), null, 'the pill gone at the latest');

  // a tab chosen: the engine's tab pressed, its unread cleared
  await q(`c.querySelector('[role=tab]:nth-child(3)').click()`);
  await sleep(50);
  assert.equal(clicks().at(-1), 102, 'TRADE pressed in the engine');
  assert.equal(await q(`return c.querySelector('[role=tab]:nth-child(3) .count')`), null);
  await render(chat({ active: 2, items: [[...LINES, 'raMon:ready', 'raMon:room 3'], [], ['Trader:WTS Blue-Eyes', 'Trader:also Dark Magician']] }));
  assert.equal(await q(`return c.querySelector('.composer input').placeholder`), 'Message Trade');
  await q(`c.querySelector('[role=tab]:nth-child(1)').click()`);
  await render(chat({ items: [[...LINES, 'raMon:ready', 'raMon:room 3'], [], ['Trader:WTS Blue-Eyes', 'Trader:also Dark Magician']] }));

  // Hide: short -> collapsed is △ then ▽ (through tall); the bar shows at once, remembered
  const n0 = clicks().length;
  await q(`c.querySelector('.hide').click()`);
  await sleep(150);
  assert.ok(await q(`return !!c.querySelector('.bar') && !c.querySelector('.chat')`), 'the bar at once');
  assert.deepEqual(clicks().slice(n0), [301], '△ first');
  await render(chat({ mode: 0, items: [[...LINES, 'raMon:ready', 'raMon:room 3']] }));
  await sleep(250);
  assert.deepEqual(clicks().slice(n0), [301, 302], 'then ▽');
  await render(chat({ mode: 2, items: [[...LINES, 'raMon:ready', 'raMon:room 3']] }));
  await sleep(150);
  assert.equal(await b.ev(`localStorage.getItem('yo2.chatOpen')`), '0');
  // while hidden every new line is unread, the latest shows on the bar
  await render(chat({ mode: 2, items: [[...LINES, 'raMon:ready', 'raMon:room 3', 'Kaiba Fan:anyone for TRADE?']] }));
  assert.equal(await q(`return c.querySelector('.bar .count')?.textContent`), '1');
  assert.match(await q(`return c.querySelector('.bar .peek').textContent`), /Kaiba Fan.*anyone for TRADE\?/);
  await shot('3-hidden');
  // a new chat window (another scene) comes up short: it is hidden again (△ ▽)
  const n1 = clicks().length;
  await render(chat({ id: 9, mode: 1, items: [['Duelist B:new room']] }));
  await sleep(250);
  assert.deepEqual(clicks().slice(n1), [301], 'remembered: hidden again');
  await render(chat({ id: 9, mode: 0, items: [['Duelist B:new room']] }));
  await sleep(250);
  await render(chat({ id: 9, mode: 2, items: [['Duelist B:new room']] }));
  await sleep(100);

  // Enter (nothing focused): shown again (collapsed -> short is △), the line focused; Esc leaves the line
  const n2 = clicks().length;
  await b.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(150);
  assert.deepEqual(clicks().slice(n2, n2 + 1), [301], '△');
  await render(chat({ id: 9, mode: 1, items: [['Duelist B:new room']] }));
  await sleep(150);
  assert.ok(await q(`return document.activeElement === c.querySelector('.composer input')`), 'at the line');
  await b.ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  assert.ok(await q(`return document.activeElement !== c.querySelector('.composer input')`), 'Esc leaves it');
  assert.equal(await b.ev(`localStorage.getItem('yo2.chatOpen')`), '1');

  // a chat its scene makes collapsed (the deck editor's) stays collapsed, though the player's choice is open
  const n4 = clicks().length;
  await render(chat({ id: 11, mode: 2, tabs: [], items: [] }));
  await sleep(300);
  assert.ok(await q(`return !!c.querySelector('.bar')`), 'the deck scene: the bar');
  assert.deepEqual(clicks().slice(n4), [], 'nothing pressed');
  // the deck editor's chat has its △ off (the engine keeps it shut): a status strip, no Show button, Enter does nothing
  const shut = chat({ id: 11, mode: 2, tabs: [], items: [] });
  shut.windows[0].controls.find(k => k.cls.endsWith('IconExpand')).enabled = false;
  await render(shut);
  await sleep(150);
  assert.ok(await q(`return !!c.querySelector('.bar.still[role=status]') && !c.querySelector('button.bar')`), 'a strip, not a button');
  await b.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(200);
  assert.deepEqual(clicks().slice(n4), [], 'Enter: nothing pressed');

  // the duel screen: the game adds its Duel Log tab (second); it is not shown, the rest are
  await render(chat({ id: 9, tabs: ['All Chat', 'Duel Log', 'Proximity Chat', 'TRADE', 'Team'], items: [['Duelist B:new room', 'Jaden:good luck!'],
    ['Turn 1: Duelist B draws.']] }));
  await sleep(100);
  assert.deepEqual(await q(`return [...c.querySelectorAll('[role=tab]')].map(t => t.textContent.trim())`), ['All', 'Proximity', 'Trade', 'Team']);
  assert.equal(await q(`return c.querySelector('.log p:last-child span').textContent`), 'good luck!');
  await shot('4-duel');

  // out of the online world (the title, Free Duel, the title's Deck Editor): nothing of the chat shows, no bar, no tab, no
  // count, and the engine's chat is folded (short -> collapsed: △ ▽), the player's open choice kept
  // the title and the sign-in keep a chat window too: offline there, nothing shows and nothing is pressed (the pointer
  // is the player's: Select Player)
  const n6 = clicks().length, signIn = chat({ id: 14, mode: 1, items: [] });
  Object.assign(signIn.windows[0], { online: false, world: false });
  await render(signIn);
  await sleep(300);
  assert.equal(await q(`return c.children.length`), 0, 'sign-in: nothing');
  assert.deepEqual(clicks().slice(n6), [], 'sign-in: nothing pressed');
  const n5 = clicks().length, off = s => { s.windows[0].online = false; return s; };
  await render(off(chat({ id: 12, mode: 1, items: [['Duelist B:offline?']] })));
  await sleep(250);
  assert.equal(await q(`return c.children.length`), 0, 'offline: nothing');
  assert.deepEqual(clicks().slice(n5), [301], 'folded: △ first');
  await render(off(chat({ id: 12, mode: 0, items: [['Duelist B:offline?']] })));
  await sleep(250);
  await render(off(chat({ id: 12, mode: 2, items: [['Duelist B:offline?', 'Duelist B:still?']] })));
  await sleep(150);
  assert.deepEqual(clicks().slice(n5), [301, 302], 'then ▽');
  assert.equal(await q(`return c.children.length`), 0, 'collapsed offline: still nothing');
  await b.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(200);
  assert.deepEqual(clicks().slice(n5), [301, 302], 'Enter offline: nothing');
  assert.equal(await b.ev(`localStorage.getItem('yo2.chatOpen')`), '1', 'the choice kept');
  // online again (signed in, My Room): open again as the player left it
  await render(chat({ id: 13, mode: 1, items: [['Duelist B:back online']] }));
  await sleep(150);
  assert.ok(await q(`return !!c.querySelector('.chat')`), 'online: the chat');

  if (b.logs.some(l => /exception|error/i.test(l))) console.log(b.logs.filter(l => /exception|error/i.test(l)).join('\n'));
  assert.ok(!b.logs.some(l => /exception|svelte/i.test(l)), 'no page errors');
  b.close();
}
console.log('modern_chat_dom_test ok', shots.length ? shots.join(' ') : '');
process.exit(0);
