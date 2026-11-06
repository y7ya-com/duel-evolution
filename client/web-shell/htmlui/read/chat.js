// The chat window's own state (CWindowModelChatWindow, src/System/window/yo2WindowChat.h), over read.js's helpers:
// mode_ +0x414 (0 tall, 1 short, 2 collapsed: its △ / ▽ step 1 -> 0 -> 2 -> 1) and tabs_ +0x3e0, a vector of Tab
// (0x1c: visible u8, list +4, tab +8), so each tab's log is known. Order alone can't pair them: the Duel Log tab
// (ovr/duellog.c) is made last and laid out second.
// online: whether the player is in the online world, where the chat belongs (owner: no chat on the title, in Free Duel
// or the title's Deck Editor). Every online sign-in goes through My Room; Free mode (ovr/freemode.c) goes from Select
// Player straight to the deck scene or the Free Duel lobby, and the title ends it. null: not known yet (the reader
// started after the sign-in), taken as online. world: in a game scene (past the title and the sign-in, whose scenes
// keep a chat window too): only there is the engine's chat folded, never pressed during the sign-in.
import { SCENE_MNG, APP } from '../read.js';

const MY_ROOM = 10, SIGN_IN_LAST = 7;   // SceneId (src/System/yo2SceneManager.h): 1 patcher ... 4 title ... 7 Select Player
export const onlineAfter = (online, scene) => scene >= 1 && scene <= SIGN_IN_LAST ? false : scene === MY_ROOM ? true : online;
let online = null, scene = 0;

// The lobby's player avatars for the chat's speech bubbles (chat-bubbles.js): CPlChibiAvatar's pid (+0xec) and its name
// label (+0xb8, a CTextElm), placed where the label is drawn (y: the team's label's, if it shows one). Only avatars
// the engine shows (the label and the body element +0x94 visible, no hidden ancestor).
export function chatAvatars(h, root) {
  const out = [], seen = new Set();
  const walk = (task, depth) => {
    if (!task || seen.has(task) || seen.size >= 2048 || depth > 10) return;
    seen.add(task);
    const type = h.cls(task);
    if (type === 'CPlChibiAvatar') {
      const label = h.ptr(task + 0xb8), elm = h.ptr(task + 0x94), pid = h.i32(task + 0xec);
      if (pid > 0 && label && elm && h.vis(label) && h.vis(elm) && !h.locked(task)) {
        // the team's label (+0xc4) above the name, when it has text: the bubble goes over both
        const team = h.ptr(task + 0xc4), up = team && h.vis(team) && h.wstr(team + 0x410).replace(/[@＠]\d/g, '').trim() ? h.at(team) : null;
        const at = h.at(label), y = up && Number.isFinite(up.wy) ? Math.min(at.wy, up.wy) : at.wy;
        if (Number.isFinite(at.wx) && Number.isFinite(y)) out.push({ pid, name: h.wstr(label + 0x410), x: at.wx, y });
      }
      return;
    }
    if (/^(CSpriteElm|CTextElm|CSwf)/.test(type)) return;
    for (const child of h.children(task)) walk(child, depth + 1);
  };
  walk(root, 0);
  return out;
}

export default h => {
  const { u8, u32, i32, vec } = h;
  const sm = u32(SCENE_MNG);
  if (sm) online = onlineAfter(online, scene = i32(sm + 0x7c));
  // CNetLobby::inTeam (+0x11e0) through CApp::lobby_ (+0xc6c): the game sends nothing typed on the Team tab without it
  const inTeam = () => { const app = u32(APP), lobby = app && u32(app + 0xc6c); return lobby ? !!u8(lobby + 0x11e0) : null; };
  return {
    snapshot: () => ({ chatAvatars: online !== false && sm ? chatAvatars(h, h.ptr(sm + 0x70)) : [] }),
    windows: {
      CChatWindow: w => ({ mode: i32(w + 0x414), online: online !== false, world: scene > SIGN_IN_LAST, inTeam: inTeam(),
        pairs: vec(w + 0x3e0, 0x1c).map(t => ({ tab: u32(t + 8), log: u32(t + 4), visible: !!u8(t) })) }),
    },
  };
};
