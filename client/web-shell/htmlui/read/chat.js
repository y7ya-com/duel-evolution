// The chat window's own state (CWindowModelChatWindow, src/System/window/yo2WindowChat.h), over read.js's helpers:
// mode_ +0x414 (0 tall, 1 short, 2 collapsed: its △ / ▽ step 1 -> 0 -> 2 -> 1) and tabs_ +0x3e0, a vector of Tab
// (0x1c: visible u8, list +4, tab +8), so each tab's log is known. Order alone can't pair them: the Duel Log tab
// (ovr/duellog.c) is made last and laid out second.
// online: whether the player is in the online world, where the chat belongs (owner: no chat on the title, in Free Duel
// or the title's Deck Editor). Every online sign-in goes through My Room; Free mode (ovr/freemode.c) goes from Select
// Player straight to the deck scene or the Free Duel lobby, and the title ends it. null: not known yet (the reader
// started after the sign-in), taken as online. world: in a game scene (past the title and the sign-in, whose scenes
// keep a chat window too): only there is the engine's chat folded, never pressed during the sign-in.
import { SCENE_MNG } from '../read.js';

const MY_ROOM = 10, SIGN_IN_LAST = 7;   // SceneId (src/System/yo2SceneManager.h): 1 patcher ... 4 title ... 7 Select Player
export const onlineAfter = (online, scene) => scene >= 1 && scene <= SIGN_IN_LAST ? false : scene === MY_ROOM ? true : online;
let online = null, scene = 0;

// The players' avatars on the map (live-chat.js: speech bubbles over them): each CPlChibiAvatar under the scene's root
// task (CSceneMng +0x70), its pid (+0xec) and its name label's place (+0xb8; its sprite +0x94), never map-grid guesses
export function chatAvatars(h, root) {
  const out = [], seen = new Set();
  const walk = (task, depth) => {
    if (!task || seen.has(task) || seen.size >= 2048 || depth > 10) return;
    seen.add(task);
    const type = h.cls(task);
    if (type === 'CPlChibiAvatar') {
      const label = h.ptr(task + 0xb8), elm = h.ptr(task + 0x94), pid = h.i32(task + 0xec);
      if (pid > 0 && label && elm && h.vis(label) && h.vis(elm) && !h.locked(task)) {
        const at = h.at(label);
        if (Number.isFinite(at.wx) && Number.isFinite(at.wy)) out.push({ pid, x: at.wx, y: at.wy - 8 });
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
  return {
    // chatOnline: in the online world past the sign-in (the server's chat stream is there); chatAvatars: who stands where
    snapshot: () => ({ chatOnline: online !== false && scene > SIGN_IN_LAST,
      chatAvatars: online !== false && sm ? chatAvatars(h, h.ptr(sm + 0x70)) : [] }),
    windows: {
      CChatWindow: w => ({ mode: i32(w + 0x414), online: online !== false, world: scene > SIGN_IN_LAST,
        pairs: vec(w + 0x3e0, 0x1c).map(t => ({ tab: u32(t + 8), log: u32(t + 4), visible: !!u8(t) })) }),
    },
  };
};
