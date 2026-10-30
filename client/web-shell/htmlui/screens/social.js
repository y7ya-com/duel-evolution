// The profile / mail / friends / teams windows (Game: CWindowModelProfile, Friendlist, Blacklist, Teamlist, FriendEnum,
// DMail, DMailSend, BlacklistInput, SetComment), owned as the chat is (screens/chat.js's owned(): real <button>s, a real
// <input> / <textarea> per field committing through setText, selectable list text, the wheel on lists). The owner's
// Skin rule: the duel-style frame, its well, buttons and list rows are CSS (controls/skin.js duelWindow, duelButton,
// stripes; colours sampled from the engine); text is Arial (textBox); the rest the generic renderers.
import { owned } from './chat.js';
const ui = await import('../../ui.js').catch(() => null);   // null under node
const basic = ui && await import('../controls/basic.js');
const skin = ui && await import('../controls/skin.js');

const DRAW = {
  FrameDuel: (el, c, api, win) => skin.duelWindow(el, { w: win.w, h: win.h }),
  // the window's caption: its colour (white glyphs tinted: white, the profile's green) over a black copy 1 px down-right
  ShadowText(el, c) {
    const t = basic.textBox(el, c.text || '', { x: c.x, y: c.y, w: c.w, align: c.align, color: c.color, white: true });
    t.style.textShadow = '1px 1px 0 #000';
  },
  ButtonDuel(el, c, api) {
    const b = skin.duelButton(el, { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, state: c.state === 'disabled' ? 'disabled' : null });
    b.addEventListener('click', () => api.click(c.id));
  },
  // the profile's rows (32 high from the well's top): every other one darker
  BackPlane(el, c) {
    const r = skin.plane(el, c);
    r.className = 'yo2-row';
    if (Math.round((c.y - 32) / c.h) % 2 === 0) r.dataset.dark = '';
  },
  Listbox(el, c, api) {
    skin.stripes(el, c);
    api.renderControl(c, el);
  },
  Scroll: (el, c) => skin.scrollbar(el, { x: c.x, y: c.y, length: c.length, pos: c.thumb.pos, len: c.thumb.len }),
};

function draw(c, el, api, win) {
  const fam = c.cls.replace(/^CWindowTask/, '');
  if (/Input(Duel)?$/.test(fam)) return api.renderControl(c, el, { noText: true });   // the text is ownInput's
  return DRAW[fam] ? DRAW[fam](el, c, api, win) : api.renderControl(c, el);
}

export default owned(['CWindowModelProfile', 'CWindowModelFriendlist', 'CWindowModelBlacklist', 'CWindowModelTeamlist',
  'CWindowModelFriendEnum', 'CWindowModelDMail', 'CWindowModelDMailSend', 'CWindowModelBlacklistInput',
  'CWindowModelSetComment'], draw,
  // D-Mail draws its frame and boxes itself (one 512 x 512 picture): those as CSS
  (win, el) => { if (win.cls === 'CWindowModelDMail') skin.mailWindow(el, { w: win.w, h: win.h }); });
