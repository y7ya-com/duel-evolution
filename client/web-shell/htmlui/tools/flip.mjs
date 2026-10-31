// The flip test: the live game reaches a window, its frame is captured as the ENGINE draws it, the window is switched
// to HTML (yo2Html.toggle) and the same state is captured again; the two are diffed over the window's rect.
// The pairs are the owner's before/after captures. Konami-derived output: keep it local (never in git).
//
//   python3.12 -I tools/stack.py 8799 &        (or let flip start it: --stack)
//   node tools/flip.mjs <outdir> <route> [--dpr=2] [--keep] [--ship=<dir>] [--htmlui=on] [--boot] [--phone]
// --ship: the page as a DRY ship-client.sh made it (game.mjs SHIP); --htmlui=on: the R2 htmlui.json switch on.
// --boot: no flip; the route, then <outdir>/boot-<tag>.png, .json (snapshot, owned windows, console errors).
// --phone: an 844 x 390 touch phone at 3x.
// --cursor: no plain flip; the CSS cursor against the engine's in the route's CURSOR poses (hover a button, over text,
// a button held down, the click ripple: not diffed, its timing differs): <outdir>/<cls>-cursor-<pose>@<dpr>x-
// {engine,css,cursor,heat}.png, report-cursor@<dpr>x.json. --uicheck [--at=x,y]: only the cursor changes with it on.
// route: a name from ROUTES below (the clicks that reach a screen and the window classes to flip there).
// Writes <outdir>/<cls>@<dpr>x-{engine,html,heat}.png and report.json ({cls: {identical, within2, max, px}}).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));

// A route with player: 'NAME' gets a test character in slot 0 with a starter deck (stack.py --player).
// [action, ...] steps: on cls (HTML from here), shot name (a capture), wheel x y deltaY, type x y text (no Enter), click x y (game px), rhold x y ms (the right button held ms), say x y text (typed into the
// chat line at x, y, then Enter), leave x y scene (click until the scene is no longer that one, up to 4
// tries), wait ms,
// scene id ms (until that scene), window cls ms (until shown)
// Sadie's shop from Beginner's Lobby A (Store[2]): walked by the runtime (rc walkto), Sadie, the category menu
const SHOP_STEPS = [['scene', 4, 90000], ['wait', 3000],
    ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 4000],
    ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10], ['wait', 8000], ['click', 511, 670], ['wait', 3000],
    // off the stairs onto the hall floor first (the spawn varies; from some, the walker finds no path), then the
    // runtime's walker (BFS over the map's collision colours): the mat under the stairs, the shop's exit
    ['rwalk', [[300, 560, 3500]]], ['rc', 'walkto 1200 880 1500'], ['rc', 'walkto exit 2 1500'], ['scene', 14, 120000], ['wait', 4000],
    // the shop's reader (read/shop.js) loads with its screens: on once, then back to the engine for the flip
    ['js', "['CShopCategoryWindow', 'CShopPackWindow', 'CShopPricePlate', 'CShopMileagePlate', 'CShopConfirmWindow'].forEach(c => yo2Html.toggle(c, true))"],
    ['wait', 3000],
    ['js', "['CShopCategoryWindow', 'CShopPackWindow', 'CShopPricePlate', 'CShopMileagePlate', 'CShopConfirmWindow'].forEach(c => yo2Html.toggle(c, false))"],
    // the runtime's input from here on: once RC input has moved the mouse it holds it (rt/user32.cpp: "never real
    // input"), so a page click would land where walkto left the cursor
    ['rc', 'click 712 226'], ['task', 'CShopCategoryWindow', 20000], ['wait', 4000]];
// Booster Packs; a switch takes a click only once the mouse has been over it (move, then click): pack 4's price tag
// into the cart (200MP), Confirm: the confirm window
const SHOP_PACKS = [...SHOP_STEPS, ['rc', 'move 530 395'], ['wait', 1000], ['rc', 'click 530 395'], ['task', 'CShopPackWindow', 20000],
    ['wait', 2500]];
const SHOP_CONFIRM = [...SHOP_PACKS, ['rc', 'move 630 300'], ['wait', 800], ['rc', 'click 630 300'], ['wait', 1500],
    ['rc', 'move 900 504'], ['wait', 800], ['rc', 'click 900 504'], ['task', 'CShopConfirmWindow', 20000], ['wait', 2500]];
// My Room to the lobby (as SHOP_STEPS): the red door held, the first place, the item popup's OK
const LOBBY_STEPS = [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 560, 342, 7],
  ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10], ['wait', 12000], ['click', 511, 670],
  ['wait', 3000]];
export const ROUTES = {
  // signed out (--cookie= empty): ONLINE opens the login scene, where rt/session.cpp turns CWindowLogin into the sign-in panel
  signin: { signedOut: true, steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['window', 'CWindowLogin', 30000], ['wait', 2500]], flip: ['CWindowLogin'] },
  // past Select Player (--uicheck): the character picker (Create Player on the empty row 1), My Room (the test
  // character's row: into the game)
  create: { steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['click', 600, 384], ['wait', 6000]], flip: [] },
  // the starter-deck picker (starter.js; shipped pages only, --ship): a character that never claimed one, into My Room
  starter: { player: 'Starter Tester', deck: 0, steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 600, 344, 7], ['wait', 20000]], flip: [] },
  myroom: { player: 'Duelist B', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 600, 344, 7], ['wait', 15000]], flip: [] },
  // the game cursor poses (--cursor), game px: [name, x, y, held]. Empty slots: no click lands on a character
  select: { cursor: [['button-hover', 868, 508], ['text', 690, 272], ['row-hover', 600, 344], ['button-pressed', 868, 508, true], ['click-effect', 690, 272, 'click']],
    steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500]], flip: ['CWindowPlayerSelect'] },
  // a player with a character (htmlui-select): LV text, Delete, the waist-up avatar's passthrough
  'select-player': { player: 'Duelist B', cursor: [['button-hover', 868, 508], ['text', 690, 272], ['row-hover', 600, 344], ['button-pressed', 868, 508, true], ['click-effect', 690, 272, 'click']],
    steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500]], flip: ['CWindowPlayerSelect'] },
  // the lobby's chat: Chat Tester's My Room, the red door held with the right button (its room menu), Lobby, the NPC
  // popup's OK
  chat: { player: 'Chat Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 600, 344, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10],
    ['wait', 8000], ['click', 511, 670], ['wait', 3000], ['window', 'CChatWindow', 30000], ['wait', 2000],
    ['say', 636, 720, 'hello lobby'], ['say', 636, 720, 'a longer line to see how the log wraps a message that runs past the width of the chat window, then keeps going for a while'],
    ['wait', 2000]], flip: ['CChatWindow'],
    // the pointer on a tab, on the log, on the input line, then a tab held
    cursor: [['tab-hover', 400, 619], ['log', 500, 660], ['input', 636, 720], ['tab-pressed', 400, 619, true]] },
  // the chat route, then the Main Menu (the menu bar's first button) open over the chat's left end (--pair: stacking)
  get 'chat-menu'() { return { ...ROUTES.chat, steps: [...ROUTES.chat.steps, ['click', 43, 747], ['wait', 2500]] }; },
  // then Friend List: its window (the engine's, unless switched on) over the menu and the chat
  get 'chat-menu-dialog'() { return { ...ROUTES.chat, steps: [...ROUTES['chat-menu'].steps, ['click', 141, 633], ['wait', 3000]] }; },
  // Card Swap: Beginner's Lobby A (as chat), then the trade scene (0x26) once a second player's request is accepted
  // (a partner on the same stack sends REQTRADE; Yes on the offer). The deck windows there are the trade's: no search
  trade: { player: 'Trade Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 600, 344, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10],
    ['wait', 8000], ['click', 511, 670], ['wait', 3000], ['window', 'CChatWindow', 30000], ['scene', 0x26, 900000], ['wait', 6000]],
    flip: ['CWindowModelKaban', 'CWindowModelDeck'] },
  // a player with a character: row 0 -> My Room (scene 10), the menu, Edit Deck (yo2-speed's recomp-menus.md coordinates)
  // the social windows from My Room's Main Menu (43,747; entries every 26 px from Edit Deck at 140,422)
  ...Object.fromEntries([['profile', 448, 'CWindowModelProfile'], ['dmail', 552, 'CWindowModelDMail'], ['ignore', 630, 'CWindowModelBlacklist'],
    ['friends', 656, 'CWindowModelFriendlist'], ['teams', 682, 'CWindowModelTeamlist']].map(([n, y, cls]) =>
    [n, { player: 'Social Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
      ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 3000], ['click', 43, 747], ['wait', 1500], ['click', 140, y], ['wait', 4000]], flip: [cls] }])),
  // My Room as Social Tester (the bottom bar, the chat line)
  'myroom-social': { player: 'Social Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 4000]], flip: [] },
  // the chat's proof (owner: no censoring, no cooldown, word wrap, native scrolling): the lobby chat with a line of
  // taboo_e.txt's words, a long line and a dozen more sent back to back; the engine's, then HTML's at the bottom,
  // scrolled up, a new line while up, back at the bottom
  chatproof: { player: 'Chat Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 600, 344, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10],
    ['wait', 8000], ['click', 511, 670], ['wait', 3000], ['window', 'CChatWindow', 30000], ['wait', 2000],
    ['say', 636, 720, 'but come on, the black box bear'],
    ['say', 636, 720, 'a long message to show how the chat wraps by words: it keeps going past the width of the window and then some more'],
    ...Array.from({ length: 10 }, (_, i) => ['say', 636, 720, `line ${i + 1}`]),
    ['wait', 2000], ['shot', 'engine'], ['on', 'CChatWindow'], ['wait', 1500], ['shot', 'html-bottom'],
    ['wheel', 500, 660, -160], ['wait', 800], ['shot', 'html-scrolled-up'],
    ['say', 636, 720, 'a new line while scrolled up'], ['wait', 1500], ['shot', 'html-new-while-up'],
    ['wheel', 500, 660, 4000], ['wait', 800], ['shot', 'html-back-bottom']], flip: [] },
  // a duel's Duel Log tab (ovr/duellog.c; the lines from a server with duel/duelText.ts and phase2-duel's dev NPC
  // challenge: PARITY_SRC=<its server> STACK_VARS=DEV:1,NPC_CHALLENGE:2): a room (the red door's first), Create Duel on
  // the bar's duel disk, the NPC's request accepted, Rock; in the duel the Duel Log tab, the engine's then HTML's
  duel: { player: 'Duel Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000],
    ['wait', 2500], ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000],
    ['leave', 504, 214, 10], ['wait', 10000], ['click', 512, 671], ['wait', 6000], ['shot', 'room'],
    ['click', 125, 750], ['wait', 2000], ['click', 624, 420], ['wait', 2000], ['shot', 'create'], ['click', 385, 543], ['wait', 5000],
    ['shot', 'request'], ['click', 504, 404], ['wait', 15000], ['shot', 'rps'], ['leave', 250, 680, 30], ['leave', 250, 680, 30], ['wait', 3000], ['click', 512, 290], ['scene', 28, 120000],
    ['wait', 20000], ['click', 375, 620], ['wait', 3000], ['shot', 'duellog-engine'], ['on', 'CChatWindow'], ['wait', 2000],
    ['shot', 'duellog-html']], flip: [] },
  // the social windows' proof (owner: before / after with open, close and typing): from My Room's Main Menu, the window
  // as the engine draws it, then in HTML, then its Close (or OK) pressed: the HTML button closes it in the game.
  // D-Mail: Write Mail too (the mail form, CWindowModelDMailSend, then in HTML)
  ...Object.fromEntries([['profile', 448, 'CWindowModelProfile', [512, 562]], ['dmail', 552, 'CWindowModelDMail', [512, 621]],
    ['ignore', 630, 'CWindowModelBlacklist', [512, 467]], ['friends', 656, 'CWindowModelFriendlist', [737, 467]],
    ['teams', 682, 'CWindowModelTeamlist', [737, 467]], ['comment', 503, 'CWindowModelSetComment', [596, 462]],
    // the Ignore list's Add to Ignore List: its name dialog over the list
    ['ignoreadd', 630, 'CWindowModelBlacklistInput', [588, 413], ['CWindowModelBlacklist', 711, 467]],
    ].map(([n, y, cls, close, via]) => ['sp-' + n, { player: 'Social Tester',
    steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 560, 342, 7],
      ['scene', 10, 90000], ['wait', 3000], ['click', 43, 747], ['wait', 1500], ['shot', 'menu'], ['click', 140, y],
      ...(via ? [['window', via[0], 30000], ['wait', 2500], ['click', via[1], via[2]]] : []), ['window', cls, 30000], ['wait', 2500],
      ['shot', 'open-engine'], ['snap', 'open'], ['on', cls], ['wait', 1500], ['shot', 'open-html'],
      ...(n === 'dmail' ? [['click', 322, 180], ['window', 'CWindowModelDMailSend', 20000], ['wait', 2500], ['shot', 'write-engine'],
        ['on', 'CWindowModelDMailSend'], ['wait', 1500], ['shot', 'write-html'], ['type', 420, 208, 'Duel later?'],
        ['type', 500, 300, 'Hi! Want to duel later tonight? My deck is finally ready, and I would like to test it against yours.'],
        ['wait', 1500], ['shot', 'typed-html']] : [['click', ...close], ['wait', 2500], ['shot', 'closed-html']])],
    flip: [] }])),
  deck: { player: 'Deck Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 3000], ['click', 43, 747], ['wait', 1500], ['click', 140, 422],
    ['window', 'CWindowModelKaban', 90000], ['wait', 4000]], flip: ['CWindowModelDeck', 'CWindowModelKaban', 'CCardDetailViewDlg'] },
  // the deck editor's file list: the deck route, then SAVE DECK (the side button at 0, 67)
  'deck-files': { player: 'Deck Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 3000], ['click', 43, 747], ['wait', 1500], ['click', 140, 422],
    ['window', 'CWindowModelKaban', 90000], ['wait', 4000], ['click', 60, 80], ['window', 'CWindowModelFileList', 30000], ['wait', 2000]],
    flip: ['CWindowModelFileList'] },
  // the lobby (htmlui-select): My Room's red door held, the first place (the academy), the item popup's OK (a click
  // on the floor when there is none), then the Main Menu from the bar: the menu, the place banner and the bar
  lobby: { player: 'Lobby Tester', steps: [...LOBBY_STEPS, ['click', 43, 747], ['window', 'CMainMenu', 30000], ['wait', 4000]],
    flip: ['CMainMenu', 'CWindowModelPlace', 'CWindowModelMenu'] },
  // the bar's door: the Move list (where to go; Svelte only: --svelte=lobby)
  'lobby-move': { player: 'Lobby Tester', steps: [...LOBBY_STEPS, ['click', 200, 752], ['window', 'CWindowModelMove', 30000], ['wait', 3000]],
    flip: ['CWindowModelMove'] },
  // character creation (htmlui-select): Create Player on the empty row, a name (new per run), OK, Hair Colour open
  get avatar() {
    const name = 'Flip ' + [...(Date.now() % 26 ** 5).toString(26).padStart(5, '0')].map(d => String.fromCharCode(97 + parseInt(d, 26))).join('');
    return { steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['click', 600, 384],
      ['wait', 5000], ['type', 512, 383, name], ['click', 427, 436], ['scene', 9, 90000], ['wait', 6000], ['click', 512, 130], ['wait', 2500]],
      flip: ['CWindowDialogAvatarSwitch'] };
  },
  'shop-menu': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: SHOP_STEPS, flip: ['CShopCategoryWindow', 'CShopMileagePlate'] },
  'shop-cards': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: [...SHOP_STEPS, ['rc', 'move 530 200'], ['wait', 1000],
    ['rc', 'click 530 200'], ['task', 'CShopCardWindow', 20000], ['wait', 2500]], flip: ['CShopCardWindow', 'CShopPricePlate'] },
  'shop-avatar': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: [...SHOP_STEPS, ['rc', 'move 530 490'], ['wait', 1000],
    ['rc', 'click 530 490'], ['task', 'CShopAvatarWindow', 20000], ['wait', 2500]], flip: ['CShopAvatarWindow'] },
  'shop-packs': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: SHOP_PACKS, flip: ['CShopPackWindow', 'CShopPricePlate'] },
  'shop-confirm': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: SHOP_CONFIRM, flip: ['CShopConfirmWindow'] },
  // Yes: bought (the local stack's test player), the pack opens: the reveal scene (24) and its card detail
  'shop-open': { player: 'Shop Tester', query: 'RC_INPUT_FILE=/rcin.txt', steps: [...SHOP_CONFIRM, ['rc', 'move 393 562'],
    ['wait', 800], ['rc', 'click 393 562'], ['scene', 24, 30000], ['wait', 4000]], flip: ['CCardDetailViewDlg'] },
  // the lobby (Beginner's Lobby A, as the chat route), then Sadie's shop: walked to by clicks on the map
  shop: { player: 'Shop Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10],
    ['wait', 8000], ['click', 511, 670], ['wait', 3000]], flip: [] },
};

const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [out, routeName] = args.filter(a => !a.startsWith('--'));
const route = ROUTES[routeName];
if (route && opt('flip')) route.flip = opt('flip').split(',');   // --flip=A,B: flip these windows instead of the route's
// --steps='[["click",60,80],["snap","after"]]': more steps after the route's (a JSON list of them)
if (route && opt('steps')) route.steps = [...route.steps, ...JSON.parse(opt('steps'))];
if (!out || !route) { console.error('flip.mjs <outdir> <route>; routes:', Object.keys(ROUTES).join(' ')); process.exit(2); }
const phone = args.includes('--phone'), boot = args.includes('--boot');
// --slot=N / FLIP_SLOT=N (0-3): one of several flips side by side, each with its own ports: stack.py 8800+10N (and its
// bridge, see stack.py), game.mjs 8801+10N, the browser's DevTools 9440+N. Without a slot: 8799 / 8942 / pid-based.
const SLOT = opt('slot') ?? process.env.FLIP_SLOT;
const dpr = +(opt('dpr') || (phone ? 3 : 1)), GAME = +(process.env.GAME_PORT || (SLOT != null ? 8801 + 10 * SLOT : 8942));
mkdirSync(out, { recursive: true });
const kids = [];
process.on('exit', () => kids.forEach(k => k.kill()));
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(1));   // so the line above runs

let origin = opt('server'), cookie = opt('cookie');
if (!origin) {   // our own stack
  const st = spawn('python3.12', ['-I', path.join(here, 'stack.py'), String(SLOT != null ? 8800 + 10 * SLOT : 8799), ...(route.player ? ['--player', route.player] : []), ...(route.deck != null ? ['--deck', String(route.deck)] : [])],
    { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...(SLOT != null && { FLIP_SLOT: String(SLOT) }) } });
  kids.push(st);
  const line = await new Promise((ok, no) => { readline.createInterface({ input: st.stdout }).once('line', ok); st.once('exit', c => no(new Error('stack.py exited ' + c))); });
  ({ origin, cookie } = JSON.parse(line));
}
if (route.signedOut) cookie = '';   // the sign-in panel shows only to a signed-out player
kids.push(spawn('node', [path.join(here, 'game.mjs'), String(GAME)], { env: { ...process.env, SERVER: origin, COOKIE: cookie,
  ...(opt('ship') && { SHIP: path.resolve(opt('ship')) }), ...(opt('htmlui') && { HTMLUI: opt('htmlui') }) }, stdio: 'inherit' }));
await sleep(500);

// --scrollbars (and --bars): native scroll bars shown in the captures (headless hides them otherwise)
const b = await launch({ dpr, mobile: phone, ...(phone && { width: 844, height: 390 }), ...(SLOT != null && { port: 9440 + +SLOT }),
  scrollbars: args.includes('--scrollbars') || args.includes('--bars') });
if (opt('throttle')) await b.send('Emulation.setCPUThrottlingRate', { rate: +opt('throttle') });   // --throttle=4: a slow machine
// --nocursor: the engine's cursor; route.query: the route's own (a local page takes any ENV: RC_INPUT_FILE below)
// --svelte=deck,chat: those screen groups from their Svelte build (gen/, npm run build first)
const q = [args.includes('--nocursor') && 'HTML_CURSOR=0', opt('svelte') && `HTML_SVELTE=${opt('svelte')}`, route.query].filter(Boolean).join('&');
// --ui=A,B: those classes in HTML from the first frame (?HTML_UI=), not only after the route as --on does
await b.go(opt('ship') ? `http://127.0.0.1:${GAME}/?${q}` : `http://127.0.0.1:${GAME}/?HTML_UI=${opt('ui') || '0'}&${q}`, 'window.yo2Html && Module.yo2Presents > 30');
const snap = () => b.ev('JSON.stringify(window.yo2Html.snapshot())').then(JSON.parse);
// --watch: every animation frame, is an HTML window visible while a scene loads or the loader's box is up? (the owner:
// the chat came up before the place had loaded). Printed at the end as the bad samples' count and the first few.
if (args.includes('--watch')) await b.ev(`(() => {
  window.__watch = { n: 0, bad: [] };
  let switching = false;
  Module.onYo2Scene = (kind, from, to) => { switching = kind === 'begin'; };
  const tick = () => {
    const host = document.getElementById('htmlui-host'), ld = document.getElementById('loading');
    const loading = switching || (ld && ld.style.display !== 'none');
    const shown = host && !host.hidden ? [...host.querySelectorAll('.win')].filter(w => w.style.visibility !== 'hidden').length : 0;
    window.__watch.n++;
    if (loading && shown && window.__watch.bad.length < 20) window.__watch.bad.push([Math.round(performance.now()), switching, ld?.style.display, shown]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
const until = async (what, ms, test) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (await test()) return;
  writeFileSync(path.join(out, 'stuck.png'), await b.shot());
  writeFileSync(path.join(out, 'console.txt'), b.logs.join('\n'));
  throw new Error('timed out: ' + what + '\n' + b.logs.slice(-20).join('\n'));
};
const toClient = async (x, y) => b.ev(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768]; })()`);
const mouse = (type, [x, y], button = 'left') => b.send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0, clickCount: 1 });

const click = async (x, y) => { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p); await sleep(200); await mouse('mouseReleased', p); await sleep(500); };
for (const [a, x, y, z] of route.steps) {
  if (a === 'wait') await sleep(x);
  if (a === 'click') await click(x, y);
  if (a === 'say') {   // the chat line at x, y takes the text z and Enter, typed as key events (the game's own input)
    await click(x, y);
    for (const ch of z) { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(40); }
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(1500);
  }
  if (a === 'type') {   // the field at x, y takes the text z, typed as key events (no Enter)
    await click(x, y);
    for (const ch of z) { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(40); }
    await sleep(800);
  }
  if (a === 'on') { await b.ev(`window.yo2Html.toggle(${JSON.stringify(x)}, true)`); await sleep(1000); }   // a class in HTML from here on
  if (a === 'shot') writeFileSync(path.join(out, x + '.png'), await b.shot());   // a named full-page capture
  if (a === 'snap') writeFileSync(path.join(out, x + '.json'), JSON.stringify(await snap(), null, 1));   // the snapshot here
  if (a === 'dom') writeFileSync(path.join(out, x + '.html'), await b.ev(`document.getElementById('htmlui-host')?.outerHTML || ''`));   // the HTML layer here
  if (a === 'wheel') { const p = await toClient(x, y); await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p[0], y: p[1], deltaX: 0, deltaY: z }); await sleep(600); }
  // rwalk [[x, y, ms], ...]: the avatar walks while the right button is held, toward the cursor (README "walkto"): held
  // from the first point, the cursor moved along the rest, each held ms
  if (a === 'rwalk') {
    let p = await toClient(...x[0]);
    await mouse('mouseMoved', p); await sleep(300); await mouse('mousePressed', p, 'right'); await sleep(x[0][2]);
    for (const [px, py, ms] of x.slice(1)) { p = await toClient(px, py); await mouse('mouseMoved', p, 'right'); await sleep(ms); }
    await mouse('mouseReleased', p, 'right'); await sleep(1000);
  }
  if (a === 'js') await b.ev(x);   // an expression in the page (e.g. switch a screen's classes on to load its reader)
  // rc 'cmd': one line of the runtime's scripted input (recomp README: walkto, clicknpc, ...) appended to the
  // route's RC_INPUT_FILE (query RC_INPUT_FILE=/rcin.txt), which the game reads every 5 frames
  if (a === 'rc') await b.ev(`(() => { let t = ''; try { t = FS.readFile('/rcin.txt', { encoding: 'utf8' }); } catch {} FS.writeFile('/rcin.txt', t + ${JSON.stringify(x)} + '\\n'); })()`);
  if (a === 'task') await until('task ' + x, y, async () => (await snap())?.tasks?.some(t => t.cls === x && t.shown));
  if (a === 'rhold') { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p, 'right'); await sleep(z); await mouse('mouseReleased', p, 'right'); await sleep(500); }
  if (a === 'leave') for (let i = 0; i < 4; i++) {
    await click(x, y);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && (await snap())?.scene === z) await sleep(250);
    if ((await snap())?.scene !== z) break;
  }
  if (a === 'scene') await until('scene ' + x, y, async () => (await snap())?.scene === x);
  if (a === 'window') await until('window ' + x, y, async () => { const s = await snap(); return s && (!x || s.windows.some(w => w.cls === x && w.shown)); });
}
// --on=A,B: those classes in HTML too, from here on (another screen's window over the route's: the chat over the deck)
await b.ev('performance.setResourceTimingBufferSize(5000)');   // the boot's 250 would drop what follows
for (const c of (opt('on') || '').split(',').filter(Boolean)) await b.ev(`window.yo2Html.toggle(${JSON.stringify(c)}, true)`);
// what the page fetched at a URL ending in /undefined (a name never set), with what asked for it; printed on exit
const undefinedFetches = () => b.ev(`performance.getEntriesByType('resource').filter(e => /\\/undefined($|[?#])/.test(e.name)).map(e => e.initiatorType + ' ' + e.name)`);
if (args.includes('--watch')) { const w = await b.ev('window.__watch'); console.log('watch:', JSON.stringify({ frames: w.n, bad: w.bad.length, first: w.bad.slice(0, 5) })); }
await mouse('mouseMoved', opt('pointer') ? await toClient(...opt('pointer').split(',').map(Number)) : [2, 2]);   // the pointer off the UI (--pointer=x,y: there, e.g. on a tab with --nocursor)

// the diff runs in the page: both captures decoded, compared over the rect, a heat map drawn (grey same, yellow
// within 2, red more)
const DIFF = `async (a, b, w, h) => {
  const load = async u => { const i = await createImageBitmap(await (await fetch(u)).blob()); const c = new OffscreenCanvas(w, h).getContext('2d'); c.drawImage(i, 0, 0); return c.getImageData(0, 0, w, h).data; };
  const [A, B] = await Promise.all([load(a), load(b)]), heat = new ImageData(w, h);
  let same = 0, near = 0, max = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
    max = Math.max(max, d); if (!d) same++; if (d <= 2) near++;
    const g = (A[i] + A[i + 1] + A[i + 2]) / 6 | 0;
    heat.data.set(!d ? [g, g, g, 255] : d <= 2 ? [255, 220, 0, 255] : [255, 0, 0, 255], i);
  }
  const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(heat, 0, 0);
  const blob = await c.convertToBlob(), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const n = A.length / 4;
  return { identical: +(100 * same / n).toFixed(2), within2: +(100 * near / n).toFixed(2), max, px: n - same, heat: btoa(s) };
}`;
if (boot) {   // the shipped page through the route: what it shows and what the bridge owns, no flip
  await sleep(1500);
  const tag = `${phone ? 'phone' : 'desktop'}-${opt('htmlui') || 'off'}`;
  writeFileSync(path.join(out, `boot-${tag}.png`), await b.shot());
  // --moving=x,y,w,h (game px): is that region animating? two captures 0.7 s apart, the pixels that changed
  let moving;
  if (opt('moving')) {
    const [mx, my, mw, mh] = opt('moving').split(',').map(Number), [cx, cy] = await toClient(mx, my), [cx1, cy1] = await toClient(mx + mw, my + mh);
    const clip = { x: cx, y: cy, width: cx1 - cx, height: cy1 - cy }, a1 = await b.shot(clip);
    await sleep(700);
    const a2 = await b.shot(clip);
    writeFileSync(path.join(out, 'moving-a.png'), a1); writeFileSync(path.join(out, 'moving-b.png'), a2);
    moving = (await b.ev(`(${DIFF})('data:image/png;base64,${a1.toString('base64')}', 'data:image/png;base64,${a2.toString('base64')}', ${Math.round(clip.width * dpr)}, ${Math.round(clip.height * dpr)})`)).px;
  }
  const s = await snap(), wins = await b.ev(`[...document.querySelectorAll('#htmlui-host .win')].length`);
  const cursor = (await b.ev(`getComputedStyle(document.getElementById('canvas')).cursor`)).replace(/base64,[^"]+/, 'base64,...');
  // what the page fetched for the HTML UI (atlases, glyphs, screen modules: none with htmlui.json off) and its long tasks
  const loads = await b.ev(`performance.getEntriesByType('resource').map(e => e.name).filter(n => /\\/(ui\\/(clamp\\/|glyphs)|htmlui\\/(screens|read)\\/)/.test(n)).length`);
  // the bridge's own cost per frame (the whole Module.onYo2Frame: read, cursor, tables), over 3 s
  const frameMs = await b.ev(`(async () => {
    const f = Module.onYo2Frame, ts = [];
    Module.onYo2Frame = (a, h) => { const t = performance.now(); f(a, h); ts.push(performance.now() - t); };
    await new Promise(r => setTimeout(r, 3000));
    Module.onYo2Frame = f;
    ts.sort((a, b) => a - b);
    return { n: ts.length, median: +ts[ts.length >> 1]?.toFixed(3), p99: +ts[Math.floor(ts.length * 0.99)]?.toFixed(3), max: +ts[ts.length - 1]?.toFixed(3) };
  })()`);
  const longTasks = await b.ev(`new Promise(ok => new PerformanceObserver((l, o) => { o.disconnect(); ok(l.getEntries().map(e => Math.round(e.duration)).sort((a, b) => b - a).slice(0, 6)); }).observe({ type: 'longtask', buffered: true }))`);
  const errors = b.logs.filter(l => /^(error|exception)/.test(l) || /htmlui/.test(l));
  writeFileSync(path.join(out, `boot-${tag}.json`), JSON.stringify({ scene: s?.scene, windows: s?.windows.map(w => w.cls), htmlWindows: wins, cursor, htmluiLoads: loads, longTasks, frameMs, errors }, null, 1));
  if (args.includes('--dump')) writeFileSync(path.join(out, `snapshot-${tag}.json`), JSON.stringify(s, null, 1));   // --dump: the whole snapshot
  console.log(tag, JSON.stringify({ scene: s?.scene, htmlWindows: wins, htmluiLoads: loads, longTasks, frameMs, cursor: cursor.slice(0, 24), moving, errors: errors.length }));
  b.close(); process.exit(0);
}
const report = {};
// --cursor: the CSS cursor (cursor.js) against the engine's, per pose. A headless capture never shows the OS cursor,
// so: the engine's cursor captured (yo2Html.cursor(false)), then the CSS one's image and hotspot read back from the
// computed style and drawn over a capture without it (where the OS puts it: hotspot at the mouse, 1 image px per
// device px); both isolated (the backdrop animates), the window drawn in HTML, diffed.
const CURSOR_IMG = String.raw`async (css, px, py, w, h, bare, dpr) => {
  const m = /url\("?((?:data|blob):[^")]+)"?\)(?: ([\d.]+)(?:x|dppx))?\)? ([\d.]+) ([\d.]+)/.exec(css);
  if (!m) return { error: 'no image cursor: ' + css.slice(0, 80) };
  const res = +(m[2] || 1), hx = +m[3], hy = +m[4];
  const img = await createImageBitmap(await (await fetch(m[1])).blob());
  const base = await createImageBitmap(await (await fetch(bare)).blob());
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.drawImage(img, Math.round(px * dpr) - Math.floor(hx * res), Math.round(py * dpr) - Math.floor(hy * res), img.width * dpr / res, img.height * dpr / res);
  const blob = await c.convertToBlob(), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const cb = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
  let cs = ''; for (let i = 0; i < cb.length; i += 0x8000) cs += String.fromCharCode(...cb.subarray(i, i + 0x8000));
  return { png: btoa(s), res, hx, hy, iw: img.width, ih: img.height, cursorPng: btoa(cs) };
}`;
if (args.includes('--cursor')) {
  const btn = (type, p, held) => b.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: held ? 1 : 0, clickCount: 1 });
  const cssOf = sel => b.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).cursor`);
  for (const cls of route.flip) for (const [pose, x, y, held] of route.cursor || []) {
    const w = (await snap()).windows.find(v => v.cls === cls && v.shown);
    if (!w) { report[pose] = { error: 'not shown' }; continue; }
    const [x0, y0] = await toClient(w.x, w.y), [x1, y1] = await toClient(w.x + w.w + 48, w.y + w.h + 48);
    const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, p = await toClient(x, y);
    const tog = v => b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, ${v})`);
    await tog(false); await b.ev(`window.yo2Html.isolate(${JSON.stringify(cls)})`);
    await btn('mouseMoved', p); await sleep(500);
    if (held === 'click') { await btn('mousePressed', p, true); await sleep(60); await btn('mouseReleased', p); await sleep(100); }
    else if (held) { await btn('mousePressed', p, true); await sleep(400); }
    const wait = held === 'click' ? 0 : 600;
    // engine window + engine cursor; engine window + CSS cursor; HTML window + CSS cursor
    await b.ev('window.yo2Html.cursor(false)'); await sleep(wait);
    const engine = await b.shot(clip);
    await b.ev('window.yo2Html.cursor(true)'); await sleep(wait);
    const bare = await b.shot(clip);
    await tog(true); await sleep(wait);
    const bareHtml = await b.shot(clip);
    // the CSS cursor wherever the pointer is: the canvas, an HTML window's control, the page
    const css = { canvas: await cssOf('#canvas'), html: await cssOf('#htmlui-host .win *'), body: await cssOf('body') };
    const s = await snap();
    if (held) { const off = await toClient(2, 2); await btn('mouseMoved', off, true); await sleep(300); await btn('mouseReleased', off); await sleep(300); }
    await b.ev('window.yo2Html.isolate(null)'); await tog(false);
    const pw = Math.round(clip.width * dpr), ph = Math.round(clip.height * dpr);
    const put = png => b.ev(`(${CURSOR_IMG})(${JSON.stringify(css.canvas)}, ${p[0] - clip.x}, ${p[1] - clip.y}, ${pw}, ${ph}, 'data:image/png;base64,${png.toString('base64')}', ${dpr})`);
    const c = await put(bare), ch = await put(bareHtml);
    const base = path.join(out, `${cls}-cursor-${pose}@${dpr}x`);
    if (c.error) { report[pose] = { error: c.error, css }; console.log(pose, c.error); continue; }
    writeFileSync(base + '-engine.png', engine);
    writeFileSync(base + '-bare.png', bare);
    writeFileSync(base + '-css.png', Buffer.from(c.png, 'base64'));
    writeFileSync(base + '-css-html.png', Buffer.from(ch.png, 'base64'));
    writeFileSync(base + '-cursor.png', Buffer.from(c.cursorPng, 'base64'));
    const r = held === 'click' ? {} : await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${c.png}', ${pw}, ${ph})`);
    if (r.heat) writeFileSync(base + '-heat.png', Buffer.from(r.heat, 'base64'));
    delete r.heat;
    report[pose] = { ...r, at: [x, y], held: held || false, same: css.canvas === css.html && css.html === css.body,
      hot: [c.hx, c.hy], res: c.res, size: [c.iw, c.ih], cursor: s.cursor && { mx: s.cursor.mx, my: s.cursor.my } };
    console.log(pose, JSON.stringify({ identical: r.identical, within2: r.within2, max: r.max, px: r.px, same: report[pose].same, hot: [c.hx, c.hy], res: c.res }));
  }
  writeFileSync(path.join(out, `report-cursor@${dpr}x.json`), JSON.stringify(report, null, 1));
  b.close(); process.exit(0);
}
// --anim [--at=x,y]: does the CSS cursor follow the game's cursor animation? The pointer parked (the hand's idle
// animation), then a click (the ripple): every ~30 ms the game's cursor state (the sprites it draws) and the CSS
// cursor, for 8 s + 2 s. Reports the states seen, whether each got its own CSS cursor and how many frames the CSS one
// lagged; anim@<dpr>x.png: the distinct cursor images in order, anim@<dpr>x.json: the timeline.
if (args.includes('--anim')) {
  const [ax, ay] = (opt('at') || '690,272').split(',').map(Number), p = await toClient(ax, ay);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  await sleep(1000);
  const sample = ms => b.ev(`(async () => {
    const out = [], t0 = performance.now();
    while (performance.now() - t0 < ${ms}) {
      const c = window.yo2Html.snapshot()?.cursor, st = c ? c.sprites.filter(q => q.shown && q.a > 0).map(q => q.tex.slice(q.tex.lastIndexOf('/') + 1) + '@' + (q.wx - c.mx) + ',' + (q.wy - c.my) + '/' + q.a.toFixed(2) + '/' + q.wsx.toFixed(2)).join(' ') : '';
      out.push([Math.round(performance.now() - t0), st, window.yo2Html.cursorCss()]);
      await new Promise(r => setTimeout(r, 30));
    }
    return out;
  })()`);
  const idle = await sample(8000);
  const clickAndSample = async () => {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1 });
    await sleep(60);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1 });
    return sample(2000);
  };
  const click = await clickAndSample(), click2 = await clickAndSample();   // the second: every state already built
  const tl = [...idle, ...click.map(([t, st, css]) => [t + 8060, st, css]), ...click2.map(([t, st, css]) => [t + 10120, st, css])];
  // a third click, captured every ~50 ms around the click point (the ripple is DOM, so a capture shows it; the OS
  // cursor never shows headless): ripple@<dpr>x-<n>.png
  {
    const [cx, cy] = p, clip = { x: cx - 48, y: cy - 48, width: 96, height: 96 };
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
    for (let n = 0; n < 10; n++) { writeFileSync(path.join(out, `ripple@${dpr}x-${n}.png`), await b.shot(clip)); await sleep(40); }
  }
  // per state: the CSS value it settled on (its last); a sample lags when its CSS is not its state's own yet
  const own = new Map(); for (const [, st, css] of tl) own.set(st, css);   // by the end every state has its own
  const lagging = part => part.filter(([, st, css]) => css !== own.get(st)).length;
  const states = [...new Set(tl.map(x => x[1]))], csss = [...new Set(tl.map(x => x[2]))];
  const urls = csss.map(v => /url\("?([^")]+)"?\)/.exec(v || '')?.[1]).filter(Boolean);
  const strip = await b.ev(`(async () => {
    const im = await Promise.all(${JSON.stringify(urls)}.map(async u => createImageBitmap(await (await fetch(u)).blob())));
    const W = Math.max(1, ...im.map(i => i.width)), H = Math.max(1, ...im.map(i => i.height)), c = new OffscreenCanvas(W * Math.max(1, im.length), H), g = c.getContext('2d');
    g.fillStyle = '#4a90b8'; g.fillRect(0, 0, c.width, c.height); im.forEach((i, n) => g.drawImage(i, n * W, 0));
    const buf = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  writeFileSync(path.join(out, `anim@${dpr}x.png`), Buffer.from(strip, 'base64'));
  writeFileSync(path.join(out, `anim@${dpr}x.json`), JSON.stringify(tl.map(([t, st, css]) => [t, st, csss.indexOf(css)]), null, 0));
  const changes = (k) => tl.filter((x, i) => i && x[k] !== tl[i - 1][k]).length;
  console.log('anim', JSON.stringify({ samples: tl.length, states: states.length, cssValues: csss.length, stateChanges: changes(1), cssChanges: changes(2),
    lagging1stClick: lagging(click), lagging2ndClick: lagging(click2), clickSamples: click.length, statesWithoutOwnCss: states.filter(st => !own.get(st)).length, idleStates: new Set(idle.map(x => x[1])).size, clickStates: new Set(click.map(x => x[1])).size }));
  b.close(); process.exit(0);
}
// --uicheck: nothing but the cursor changes with the CSS cursor on (the engine's hidden by its element, never by
// texture): the whole screen with the engine's cursor and with the CSS one, the pointer at UICHECK x,y; every window
// engine-drawn. Expected: only the cursor's box differs.
// --bars: the engine's scroll bars as native boxes (scrollbars.js): every shown bar on the route's screen, then the
// first one driven both ways (its box scrolled to the end: the game's value follows; the game's wheel over its rows:
// the box follows), and both looks (bars-<route>@<dpr>x-{engine,native}.png)
if (args.includes('--bars')) {
  const bars = async () => (await snap()).windows.flatMap(w => w.controls.filter(c => c.thumb !== undefined && c.shown && c.max > 0)
    .map(c => ({ win: w.cls, cls: c.cls, id: c.id, value: c.value, max: c.max, page: c.page, x: c.wx, y: c.wy, w: c.w, h: c.h })));
  const box = id => b.ev(`(() => { const e = [...document.querySelectorAll('#htmlui-bars > div')]; return { n: e.length, top: e[0]?.scrollTop, range: e[0] ? e[0].scrollHeight - e[0].clientHeight : 0 }; })()`);
  await b.ev('window.yo2Html.scrollbars(false)'); await sleep(800);
  writeFileSync(path.join(out, `bars-${routeName}@${dpr}x-engine.png`), await b.shot());
  await b.ev('window.yo2Html.scrollbars(true)'); await sleep(800);
  writeFileSync(path.join(out, `bars-${routeName}@${dpr}x-native.png`), await b.shot());
  const found = await bars(), r = { bars: found, boxes: await box() };
  // the box on top, and its bar's width (0: the platform's overlay scroll bars, drawn only while scrolling)
  r.probe = await b.ev(`(() => { const e = document.querySelector('#htmlui-bars > div'); if (!e) return null; const k = e.getBoundingClientRect();
    const at = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
    return { top: at === e || e.contains(at), at: at?.id || at?.className || at?.tagName, bar: e.offsetWidth - e.clientWidth,
      canvasZ: getComputedStyle(document.getElementById('canvas')).zIndex }; })()`);
  const f = found[0];
  if (f) {
    // the rows, not only the bar's value: the screen must change when the box moves (rowsPx: pixels changed against
    // the start) and come back to the start when it returns (backPx ~ 0)
    const W = Math.round(1024 * dpr), H = Math.round(768 * dpr), start = await b.shot();
    const px = async a => (await b.ev(`(${DIFF})('data:image/png;base64,${start.toString('base64')}', 'data:image/png;base64,${a.toString('base64')}', ${W}, ${H})`)).px;
    await b.ev(`(() => { const e = document.querySelector('#htmlui-bars > div'); e.scrollTop = e.scrollHeight; })()`); await sleep(1000);
    const end = await b.shot();
    writeFileSync(path.join(out, `bars-${routeName}@${dpr}x-end.png`), end);
    r.toEnd = { game: (await bars())[0]?.value, max: f.max, rowsPx: await px(end) };
    await b.ev(`(() => { const e = document.querySelector('#htmlui-bars > div'); e.scrollTop = e.scrollHeight / 2; })()`); await sleep(1000);
    r.toHalf = { game: (await bars())[0]?.value, rowsPx: await px(await b.shot()) };
    await b.ev(`(() => { const e = document.querySelector('#htmlui-bars > div'); e.scrollTop = 0; })()`); await sleep(1000);
    r.toTop = { game: (await bars())[0]?.value, backPx: await px(await b.shot()) };
    // the game's own wheel over its rows (left of the bar), as a player's on the canvas
    const p = await toClient(f.x - 60, f.y + f.h / 2);
    await mouse('mouseMoved', p); await sleep(300);
    for (let i = 0; i < 3; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p[0], y: p[1], deltaX: 0, deltaY: 120 }); await sleep(300); }
    await sleep(800);
    r.wheel = { game: (await bars())[0]?.value, box: await box() };
  }
  console.log('bars:', JSON.stringify(r));
  writeFileSync(path.join(out, `bars-${routeName}@${dpr}x.json`), JSON.stringify(r, null, 1));
  b.close(); process.exit(0);
}
// --pair: the whole screen with the HTML UI (as --ui= or the page's switches set it) and with the engine drawing every
// window, pair-<route>@<dpr>x-{html,engine,heat}.png: windows over windows (stacking) as the engine has them
if (args.includes('--pair')) {
  // --css=RULES: a style added first (e.g. the old stacking back, for a before shot)
  if (opt('css')) await b.ev(`document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(opt('css'))} }))`);
  await sleep(1000);
  const html = await b.shot();
  await b.ev('window.yo2Html.set("0")'); await sleep(1200);
  const engine = await b.shot();
  const W = Math.round(1024 * dpr), H = Math.round(768 * dpr), base = path.join(out, `pair-${routeName}@${dpr}x`);
  const r = await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${html.toString('base64')}', ${W}, ${H})`);
  writeFileSync(base + '-html.png', html); writeFileSync(base + '-engine.png', engine);
  writeFileSync(base + '-heat.png', Buffer.from(r.heat, 'base64'));
const s1 = await snap();   // and every button caption not plain black, or with its shadow shown
  const tinted = s1.windows.flatMap(w => w.controls.filter(c => c.label && (c.color?.slice(0, 3).some(v => v > 0) || c.shadow)).map(c => [w.cls, c.cls, c.label, c.color, c.shadow]));
  console.log('pair:', JSON.stringify({ identical: r.identical, within2: r.within2, windows: s1.windows.filter(w => w.shown).map(w => [w.cls, w.z]), tinted }));
  b.close(); process.exit(0);
}
if (args.includes('--uicheck')) {
  const [ux, uy] = (opt('at') || '700,600').split(',').map(Number), p = await toClient(ux, uy);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  await b.ev('window.yo2Html.set("0")'); await sleep(800);
  const ui = async () => { await b.ev('window.yo2Html.isolate(null)'); return b.shot(); };
  await b.ev('window.yo2Html.cursor(false)'); await sleep(600);
  const engine = await ui();
  await b.ev('window.yo2Html.cursor(true)'); await sleep(600);
  const css = await ui(), s = await snap();
  const W = Math.round(1024 * dpr), H = Math.round(768 * dpr);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-engine.png`), engine);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-css.png`), css);
  const r = await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${css.toString('base64')}', ${W}, ${H})`);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-heat.png`), Buffer.from(r.heat, 'base64'));
  delete r.heat;
  console.log('uicheck', routeName, 'scene', s.scene, JSON.stringify(r), 'windows', s.windows.filter(w => w.shown).map(w => w.cls).join(' '));
  b.close(); process.exit(0);
}
for (const cls of route.flip) {
  const s0 = await snap(), w = [...s0.windows, ...s0.tasks || []].find(v => v.cls === cls && v.shown);   // a task too (the shop)
  if (!w) { report[cls] = { error: 'not shown' }; continue; }
  const [x0, y0] = await toClient(w.x, w.y), [x1, y1] = await toClient(w.x + w.w, w.y + w.h);
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // isolated: the window alone on an empty canvas in both captures (the backdrops animate, and the frame is 70 %)
  await b.ev(`window.yo2Html.isolate(${JSON.stringify(cls)})`);
  await sleep(600);   // a few frames: the hide table applies from the next Present
  const engine = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, true)`);
  // the first class on loads the layer (screens, atlases) lazily: wait for it, then a few frames
  for (let t = 0; t < 100 && !(await b.ev(`!!document.getElementById('htmlui-host')`)); t++) await sleep(100);
  await sleep(600);
  const html = await b.shot(clip);
  const hostStyle = await b.ev(`document.getElementById('htmlui-host')?.getAttribute('style')`);
  if (/hidden/.test(hostStyle || '')) console.log('flip: the HTML layer is hidden:', hostStyle);
  writeFileSync(path.join(out, `${cls}-dom.html`), await b.ev(`document.getElementById('htmlui-host').outerHTML`));
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, false); window.yo2Html.isolate(null)`);
  // the owner's before/after: the same state over the real backdrop (not diffed)
  await sleep(600);
  const before = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, true)`);
  await sleep(600);
  const after = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, false)`);
  const base = path.join(out, `${cls}@${dpr}x`);
  writeFileSync(base + '-engine.png', engine);
  writeFileSync(base + '-html.png', html);
  writeFileSync(base + '-before.png', before);
  writeFileSync(base + '-after.png', after);
  const pw = Math.round(clip.width * dpr), ph = Math.round(clip.height * dpr);
  const r = await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${html.toString('base64')}', ${pw}, ${ph})`);
  writeFileSync(base + '-heat.png', Buffer.from(r.heat, 'base64'));
  delete r.heat;
  report[cls] = { ...r, rect: [w.x, w.y, w.w, w.h], snapshot: w };
  console.log(cls, JSON.stringify({ identical: r.identical, within2: r.within2, max: r.max, px: r.px }));
}
writeFileSync(path.join(out, `report@${dpr}x.json`), JSON.stringify(report, null, 1));
console.log('undefined fetches:', JSON.stringify(await undefinedFetches()));
writeFileSync(path.join(out, `full@${dpr}x.png`), await b.shot());
if (!args.includes('--keep')) { b.close(); process.exit(0); }
console.log('kept open: Ctrl-C to stop');
