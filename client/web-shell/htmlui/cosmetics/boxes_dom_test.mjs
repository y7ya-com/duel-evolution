// The box shop's DOM in headless Chrome (skin.html as the page, fetch stubbed with synthetic data, the waist-up tables
// and pictures synthetic through a stubbed yo2Lazy): the showcase (the band, the price tags in the shop digits, the
// banner, the strip with rarity frames, the preview on the waist-up bust, the pity bars, Open Box), the
// boxes' keys, the insufficient-MP line, the reveal (its phases, skipping, a new / duplicate / single-body result,
// equip), reduced motion, the contents sheet, and screens/shop.js's strip() (the engine labels it drops while the boxes
// are open).   node client/web-shell/htmlui/cosmetics/boxes_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
import { WM_CSV, WW_CSV } from './waistup_fixture.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 20000 + process.pid % 10000;   // its own server: never another session's
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9650 + process.pid % 40 });   // off the tools' 9440-9579 (launch() clears its port first)
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);

const v = (gender, worlds) => ({ gender, bit: 1, number: 1, worlds });
const item = (id, rarity, extra = {}) => ({ id, name: 'Item ' + id, kind: 'hair', rarity, slot: 1, variants: [v('male', [0, 1]), v('female', [0, 1])],
  bodies: ['male', 'female'], owned: false, copies: 0, compatible: true, baseChance: 10, ...extra });
const box = (id, price, pool, pity = { superMisses: 2, ultraMisses: 5 }, ultraAt = 15) => ({ id, name: `Box ${id}`, price, superAt: 8, ultraAt, available: true,
  configuredOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, baseOdds: { common: 55, rare: 30, super: 11, ultra: 4 },
  nextOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, pity: { ...pity, superAt: 8, ultraAt }, pool,
  poolByRarity: Object.fromEntries(['common', 'rare', 'super', 'ultra'].map(r => [r, { count: pool.filter(i => i.rarity === r).length }])) });
const single = item('s1', 'super', { bodies: ['male'], notice: 'The female version of this item is still being made.', variants: [v('male', [0])] });
const LOOK = [0, 0, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0];
const INFO = { available: true, wallet: { total: 6200, bound: 5000, earned: 1200 }, nextRequestId: '0',
  appearance: { gender: 'male', world: 0, parts: LOOK, looks: { 0: LOOK, 1: LOOK } },
  boxes: [box('head', 500, [item('c1', 'common', { owned: true }), item('c2', 'common'), item('r1', 'rare'), single,
      item('u1', 'ultra', { variants: [{ gender: 'male', bit: 1, number: 10, worlds: [0, 1] }, { gender: 'female', bit: 1, number: 5, worlds: [0, 1] }] })]),
    box('dueldisk', 1000, [item('d1', 'common'), item('d2', 'ultra')], { superMisses: 1, ultraMisses: 9 }, 10), box('outfit', 1500, [item('o1', 'common'), item('o2', 'ultra')])],
  catalog: [], inventory: [] };

await b.ev(`(async () => {
  document.body.innerHTML = '<div id="root" style="position:absolute;left:264px;top:0;width:760px;height:600px"></div><div id="plate" style="position:absolute;left:795px;top:390px;width:229px;height:128px"></div>';
  window.__info = ${JSON.stringify(INFO)}; window.__reward = null; window.__calls = [];
  window.fetch = async (u, o) => {
    u = String(u); __calls.push([u.replace(/^.*\\/api\\/de/, ''), o?.body ? JSON.parse(o.body) : null]);
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (u.endsWith('/open')) {
      await new Promise(r => setTimeout(r, 50));
      const r = __reward;
      if (r.error) return { ok: false, status: 409, json: async () => r };
      __info = { ...__info, nextRequestId: String(+__info.nextRequestId + 1), wallet: { ...__info.wallet, total: __info.wallet.total - 500, earned: __info.wallet.earned - 500 } };
      return ok({ ...__info, requestId: JSON.parse(o.body).requestId, reward: r });
    }
    if (u.endsWith('/equip')) return ok({ ...__info, equipped: { id: JSON.parse(o.body).id, world: 0, parts: [] } });
    if (u.endsWith('/cosmetics')) return ok(__info);
    return { ok: false, status: 404, json: async () => ({}) };
  };
  // lazyfs.js's yo2Lazy (as wardrobe_dom_test.mjs): the synthetic waist-up tables, a coloured shape per picture
  const csv = { 'data/avatar/wu/wm_data.csv': ${JSON.stringify(WM_CSV)}, 'data/avatar/wu/ww_data.csv': ${JSON.stringify(WW_CSV)} };
  const png = async name => {
    if (csv[name]) return new TextEncoder().encode(csv[name]);
    const c = new OffscreenCanvas(128, 128), g = c.getContext('2d');
    let hsh = 0; for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = 'hsl(' + hsh % 360 + ' 70% 50%)'; g.fillRect(40, 30, 48, 70);
    return new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
  };
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: n => /^data\\/(avatar\\/(chibi|wu)|map\\/map_switch)\\//.test(n) }, entry: async n => png(n) } };
  window.__B = await import('/htmlui/cosmetics/boxes.js');
  window.__wallets = [];
  window.__ctl = __B.mountBoxes(document.getElementById('root'), { onWallet: w => { __wallets.push(w); __B.drawWallet(document.getElementById('plate'), w); } });
})()`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, f = 'e => e.textContent') => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (${f})(e) : null; })()`);
const qa = (sel, f = 'e => e.textContent') => b.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(${f})`);
const click = sel => b.ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
// the alignment checks (align.js) on the screen that is up: centred groups and column stacks within 1 game px
const aligned = async (screen, label = screen) => {
  const r = await b.ev(`import('/htmlui/cosmetics/align.js').then(m => m.checkAlign())`);
  assert.equal(r.screen, screen, label);
  const bad = r.checks.filter(c => !c.ok);
  assert.deepEqual(bad, [], label + ': ' + JSON.stringify(bad));
  assert.ok(r.checks.length >= 8, label + ': measured');
};
await sleep(300);

// ---- the showcase: the band (the selected item), the title, three price tags, the banner, the strip, the pity line
assert.equal(await q('.bx-title'), 'Cosmetic Boxes');
assert.deepEqual(await qa('.bx-tab .nm'), ['Head & Hair', 'Outfit', 'Duel Disk']);
assert.equal(await q('.bx-tab[data-on] .nm'), 'Head & Hair');
assert.deepEqual(await qa('.bx-tab .pr .sa-num', 'e => e.getAttribute("aria-label")'), ['500 MP', '1500 MP', '1000 MP'], 'prices in the shop digits');
assert.equal(await qa('.bx-tab[data-on] .sa-num i').then(x => x.length), 5, '"500MP": five glyphs');
assert.equal(await q('.bx-head .sa-banner', 'e => e.style.backgroundImage'), 'var(--sa-bnHead)');
assert.ok(await q('.bx-head .sa-frame', 'e => !!e'));
assert.deepEqual(await qa('.bx-cell', 'e => e.dataset.id'), ['u1', 's1', 'r1', 'c1', 'c2'], 'rarest first, five to the page');
assert.deepEqual(await qa('.bx-cell .de-rf', 'e => e.dataset.rarity'), ['ultra', 'super', 'rare', 'common', 'common'], 'rarity on the art frame');
assert.equal(await qa('.bx-cell .tag').then(x => x.join('|')), 'Item u1|Item s1|Item r1|Item c1|Item c2');
assert.equal(await q('.bx-cell[data-on]', 'e => e.dataset.id'), 'u1');
assert.deepEqual(await qa('.bx-band > div'), ['Item u1', 'Ultra Rare hair']);
// the pity bars: one per guarantee, the tier's name, a segment per open (the misses filled), the count; no sentences
assert.deepEqual(await qa('.bx-pity .pm', 'e => [e.dataset.key, e.textContent, e.querySelectorAll(".bar > i").length, e.querySelectorAll(".bar > i[data-on]").length, e.hasAttribute("data-next")]'),
  [['super', 'Super Rare2/8', 8, 2, false], ['ultra', 'Ultra Rare5/15', 15, 5, false]]);
assert.deepEqual(await qa('.bx-pity .pm', 'e => e.getAttribute("aria-valuenow") + "/" + e.getAttribute("aria-valuemax")'), ['2/8', '5/15']);
assert.equal(await q('.bx-pity .pm[data-key=ultra]', 'e => e.style.getPropertyValue("--c")'), '#e8b42a', "the tier's colour");
assert.doesNotMatch(await q('.bx-main'), /guarantee|within|in a row|open in/i, 'no pity sentences');
assert.equal(await q('.bx-why'), null, 'no reason while Open can be pressed');
assert.equal(await q('.bx-open', 'e => [e.textContent, e.disabled, e.dataset.tone]').then(JSON.stringify), '["Open Box",false,"go"]');
assert.deepEqual(await qa('.bx-main .sa-btn2'), ['Contents & odds'], 'the Wardrobe is the overworld menu\'s now');
assert.equal(await q('.bx-wd'), null);
assert.equal(await qa('.bx-main [class*=chip], .bx-main .de-sex, .bx-new').then(x => x.length), 0, 'no chips, glyph badges or stickers');
assert.doesNotMatch(await q('.bx-main'), /♂|♀|★/);
assert.match(await q('#plate .bx-wallet .tot .sa-num', 'e => e.getAttribute("aria-label")'), /^6200 MP$/);
assert.match(await q('#plate .bx-wallet .ern'), /Earned/);
assert.match(await q('#plate .bx-wallet .ern .sa-num', 'e => e.getAttribute("aria-label")'), /^1200 MP$/);
await aligned('showcase');
// ---- the preview: a click tries the item on the player's waist-up bust, tagged Preview; nothing is called or saved
assert.equal(await q('.bx-pv', 'e => e.hidden'), true, 'no preview until a click');
const calls0 = (await b.ev('__calls')).length;
await click('.bx-cell[data-id=u1]');
assert.equal(await q('.bx-pv', 'e => [e.hidden, e.dataset.mode, e.dataset.id].join()'), 'false,bust,u1');
assert.equal(await q('.bx-pv .pv-tag'), 'Preview');
assert.equal(await q('.bx-cell[data-id=u1]', 'e => e.getAttribute("aria-pressed")'), 'true');
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return; throw new Error('timed out: ' + js); };
await until(`document.querySelector('.bx-pv .pv-wu').dataset.state === 'ready'`);
assert.equal(await q('.bx-pv .pv-wu', 'e => e.dataset.look.slice(0, 4)'), '000a', 'the hair (slot 1: 10) on the saved look');
assert.match(await q('.bx-pv .pv-wu', 'e => e.dataset.layers'), /wm_h1_11_c01/, 'the bust drawn with the hair');
assert.equal((await b.ev('__calls')).length, calls0, 'a preview calls nothing (no equip)');
assert.deepEqual(await b.ev('__info.appearance.parts'), INFO.appearance.parts);
await aligned('showcase', 'the showcase, previewing');
// a second click on it clears it
await click('.bx-cell[data-id=u1]');
assert.equal(await q('.bx-pv', 'e => e.hidden'), true, 'a second click clears it');
// a click elsewhere clears it (the pointer's down anywhere else: the game's canvas, a tab, the panel)
await click('.bx-cell[data-id=u1]');
assert.equal(await q('.bx-pv', 'e => e.hidden'), false);
await b.ev(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
assert.equal(await q('.bx-pv', 'e => e.hidden'), true, 'a click elsewhere clears it');
// a single-body item: dimmed for a body that can't wear it (not for this male body), the short WIP notice in the band
await click('.bx-cell[data-id=s1]');
assert.equal(await q('.bx-cell[data-on]', 'e => e.dataset.id'), 's1');
assert.deepEqual(await qa('.bx-band > div'), ['Item s1', 'Super Rare hair', 'Female version coming soon']);
assert.equal(await q('.bx-cell[data-id=s1] .de-rf', 'e => e.hasAttribute("data-dim")'), false);
assert.equal(await q('.bx-pv', 'e => e.dataset.mode'), 'bust', 'the male body wears it: on the bust');
await b.ev(`document.querySelector('.bx-main').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await q('.bx-pv', 'e => e.hidden'), true, 'Esc clears it');
// the arrows have one page here: hidden
assert.equal(await q('.bx-next', 'e => e.disabled'), true);
// the tabs: a click and the keyboard wrap round the three boxes; a box beyond the earned MP is disabled with one line why
await click('.bx-tab:nth-child(2)');
assert.equal(await q('.bx-tab[data-on] .nm'), 'Outfit');
assert.equal(await q('.bx-open', 'e => e.disabled'), true);
assert.equal(await q('.bx-why'), 'Needs 300 more earned MP');
await aligned('showcase', 'the showcase, insufficient MP');
assert.equal(await q('.bx-head .sa-banner', 'e => e.style.backgroundImage'), 'var(--sa-bnOutfit)');
await b.ev(`document.querySelector('.bx-tab[data-on]').focus(); document.querySelector('.bx-tab[data-on]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
assert.equal(await q('.bx-tab[data-on] .nm'), 'Duel Disk');
assert.equal(await b.ev('document.activeElement.classList.contains("bx-tab")'), true, 'focus follows the tab');
// the disk box's ultra guarantee at 10, one open away: that bar glows, its last segment due
assert.deepEqual(await qa('.bx-pity .pm', 'e => [e.textContent, e.hasAttribute("data-next"), !!e.querySelector(".bar > i:last-child[data-due]")]'),
  [['Super Rare1/8', false, false], ['Ultra Rare9/10', true, true]]);
await aligned('showcase', 'the showcase, a guarantee due');
assert.equal(await q('.bx-head .sa-banner', 'e => e.style.backgroundImage'), 'var(--sa-bnDisk)');
await b.ev(`document.querySelector('.bx-tab[data-on]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
assert.equal(await q('.bx-tab[data-on] .nm'), 'Head & Hair');

// ---- the reveal: a new ultra. Anticipation (the box's banner), then the card, then the result with its buttons
await b.ev(`__reward = ${JSON.stringify({ ...INFO.boxes[0].pool[4], duplicate: false, owned: true })}`);
await click('.bx-open');
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'wait');
assert.equal(await q('.bx-rv .wait .sa-banner', 'e => e.style.backgroundImage'), 'var(--sa-bnHead)');
assert.equal(await q('.bx-open', 'e => e.textContent'), 'Opening…');
await sleep(400);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'wait', 'still anticipating (about 1.5 s for an ultra)');
assert.equal(await q('.bx-rv', 'e => e.dataset.tempo'), 'special');
await sleep(1400);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'card');
await sleep(1500);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-card', 'e => e.dataset.rarity'), 'ultra');
assert.equal(await q('.bx-card .de-rf', 'e => e.dataset.rarity'), 'ultra');
assert.ok(await q('.bx-card .sheen', 'e => !!e'), "the ultra's one flourish: the gold sheen");
assert.equal(await q('.bx-rv .after .nm'), 'Item u1');
assert.equal(await q('.bx-rv .after .rl'), 'Ultra Rare hair');
assert.equal(await q('.bx-rv .news'), 'New');
assert.equal(await qa('.bx-rv .pt, .bx-rv .rays, .bx-rv .shine, .bx-rv .skip').then(x => x.length), 0, 'no rays, no confetti, no hints');
assert.deepEqual(await qa('.bx-rv button', 'e => e.textContent'), ['Equip', 'Open another', 'Done']);
assert.deepEqual(await qa('.bx-rv .sa-pill', 'e => e.dataset.tone || ""'), ['go', 'hi', ''], 'orange primary, cyan secondaries');
assert.deepEqual(__lastOpen(await b.ev('__calls')), ['/cosmetics/open', { boxId: 'head', requestId: '0' }]);
await aligned('reveal', 'the reveal, new');
// one column: the card, the news plate and the four pills at the card's width
assert.deepEqual(await qa('.bx-card, .bx-rv .news, .bx-rv .sa-pill', 'e => e.getBoundingClientRect().width'), [228, 228, 228, 228, 228]);
assert.match(await q('#plate .bx-wallet .tot .sa-num', 'e => e.getAttribute("aria-label")'), /^5700 MP$/, 'the wallet follows the open');
// equip: the server's answer, then the note that others see it
await click('.bx-rv .equip');
await sleep(100);
assert.equal(await q('.bx-rv .equip'), 'Equipped');
assert.equal(await q('.bx-rv .status'), '', 'the button says it: no sentence');
assert.deepEqual((await b.ev('__calls')).at(-1), ['/cosmetics/equip', { id: 'u1', world: 0 }]);
await click('.bx-rv .done');
assert.equal(await q('.bx-rv'), null);

// a duplicate common, skipped with a click: straight to the result, the duplicate line in its plate
await b.ev(`__reward = ${JSON.stringify({ ...INFO.boxes[0].pool[0], duplicate: true, owned: true, copies: 1 })}`);
await click('.bx-open');
await sleep(120);
await click('.bx-rv');
await sleep(50);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-rv', 'e => e.dataset.tempo'), 'quick');
assert.equal(await q('.bx-card .sheen'), null);
assert.equal(await q('.bx-rv .news'), 'Duplicate ×2');
assert.equal(await q('.bx-rv .again', 'e => e.disabled'), true, 'two opens left 200 earned MP: no third');
assert.match(await q('.bx-rv .after'), /Needs 300 more earned MP$/);
await sleep(400);   // the card's entrance (a scale) settled: measured at rest
await aligned('reveal', 'the reveal, a duplicate, insufficient MP');
// Escape closes it
await b.ev(`document.querySelector('.bx-rv').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await q('.bx-rv'), null);

// a single-body item the player can't wear, with reduced motion: no anticipation, the notice, equip disabled
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await b.ev(`__info = { ...__info, appearance: { gender: 'female', world: 0 }, wallet: { total: 6200, bound: 5000, earned: 1200 } }; __reward = ${JSON.stringify({ ...single, duplicate: false, owned: true, compatible: false })}`);   // a female body: a male-only item
await b.ev('__ctl.refresh()'); await sleep(100);
assert.equal(await q('.bx-cell[data-id=s1] .de-rf', 'e => e.hasAttribute("data-dim")'), true, 'dimmed for the female body: nothing more');
// its preview for this body: the item's art and the short body notice, not the bust
await b.ev(`__info.boxes[0].pool[3].compatible = false`); await b.ev('__ctl.refresh()'); await sleep(100);
await click('.bx-cell[data-id=s1]');
assert.equal(await q('.bx-pv', 'e => [e.hidden, e.dataset.mode].join()'), 'false,art');
assert.equal(await q('.bx-pv .pv-note'), 'Female version coming soon');
assert.ok(await q('.bx-pv .pv-art .de-rf[data-rarity=super] .de-art', 'e => !!e'), 'the art in its rarity frame');
assert.equal(await q('.bx-pv .pv-tag'), 'Preview');
await aligned('showcase', "the showcase, previewing what this body can't wear");
await click('.bx-open');
await sleep(150);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-pv', 'e => e.hidden'), true, 'opening a box clears the preview');
assert.equal(await q('.bx-rv .notice'), 'Female version coming soon');
assert.equal(await q('.bx-rv .equip', 'e => [e.disabled, e.textContent].join()'), "true,Can't wear yet");
assert.equal(await q('.bx-rv .after .rl'), 'Super Rare hair');
await aligned('reveal', "the reveal, can't wear yet");
await click('.bx-rv .done');
await b.send('Emulation.setEmulatedMedia', { features: [] });

// an error from the server: the reveal goes, the reason as the one line
await b.ev(`__reward = { error: 'in-duel', status: 409 }`);
await click('.bx-open');
await sleep(200);
assert.equal(await q('.bx-rv'), null);
assert.match(await q('.bx-why'), /during a duel/);
assert.equal(await q('.bx-why', 'e => e.getAttribute("role")'), 'alert');

// ---- contents & odds: the yellow list window, rarest first, chances, ownership, bodies
await click('.bx-link');
assert.equal(await q('.bx-title'), 'Box Contents');
assert.ok(await q('.bx-sheet', 'e => e.classList.contains("sa-yellow")'));
assert.deepEqual(await qa('.bx-band > div'), ['Box head', '1/5 owned']);
assert.deepEqual(await qa('.bx-sheet .hd .sa-t'), ['Item', 'Chance', 'Owned']);
assert.deepEqual(await qa('.bx-grp .c-nm'), ['Ultra Rare', 'Super Rare', 'Rare', 'Common']);
assert.deepEqual(await qa('.bx-grp .c-pc'), ['4%', '11%', '30%', '55%']);
assert.equal(await qa('.bx-row').then(x => x.length), 5);
assert.deepEqual(await qa('.bx-row[data-owned] .c-ow'), ['Owned']);
assert.equal(await q('.bx-row:has(.de-rf[data-rarity=super]) .c-bd'), 'Male only');
assert.deepEqual(await qa('.bx-row .c-bd').then(x => x.filter(Boolean)), ['Male only'], 'the body only where it matters');
assert.equal(await q('.bx-rules'), null, 'no rules text');
assert.deepEqual(await qa('.bx-contents .bx-pity .pm .ct'), ['2/8', '5/15'], 'the pity bars under the sheet');
assert.equal(await q('.bx-list', 'e => getComputedStyle(e).overflowY'), 'auto');
assert.equal(await qa('.bx-sidebtn').then(x => x.join('|')), 'Back');
assert.equal(await q('.bx-open', 'e => !!e'), true, 'Open Box stays on its pill');
await aligned('contents');
await b.ev(`document.querySelector('.bx-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await q('.bx-title'), 'Cosmetic Boxes');

// ---- nothing of it outside its window's frame: every piece inside the 1024 x 600 the root may use
const out = await b.ev(`[...document.querySelectorAll('.bx-main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > 1024.5 || r.bottom > 600.5 || r.left < 257.5); }).map(e => e.className)`);
assert.deepEqual(out, []);

// ---- screens/shop.js strip(): the Confirm label goes (Wardrobe is drawn there), Back's only on the contents sheet
const stripped = await b.ev(`import('/htmlui/screens/shop.js').then(m => {
  const t = (id, x, y, text) => ({ id, cls: 'CWindowTaskText', x, y, wx: x, wy: y, text });
  const win = { cls: 'CShopAvatarWindow', controls: [t(1, 807, 496, 'Confirm'), t(2, 807, 556, 'Back'), { id: 3, cls: 'CWindowTaskShadowText', x: 807, y: 496, wx: 0, wy: 0 }] };
  const ids = w => w.controls.map(c => c.id).join();
  return [ids(m.strip(win, true, 'showcase')), ids(m.strip(win, true, 'contents')), ids(m.strip(win, false)),
    m.strip({ cls: 'CShopMileagePlate', controls: [t(4, 807, 397, '8400MP')] }, true).controls.length];
})`);
assert.deepEqual(stripped, ['2', '', '1,2,3', 0]);

console.log('cosmetics/boxes dom ok');
if (b.logs.some(l => /^exception/.test(l))) { console.log(b.logs.join('\n')); process.exitCode = 1; }
b.close();
process.exit();

function __lastOpen(calls) { return calls.filter(c => c[0].endsWith('/open')).at(-1); }
