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

export default ({ u8, u32, i32, vec }) => {
  const sm = u32(SCENE_MNG);
  if (sm) online = onlineAfter(online, scene = i32(sm + 0x7c));
  return {
    windows: {
      CChatWindow: w => ({ mode: i32(w + 0x414), online: online !== false, world: scene > SIGN_IN_LAST,
        pairs: vec(w + 0x3e0, 0x1c).map(t => ({ tab: u32(t + 8), log: u32(t + 4), visible: !!u8(t) })) }),
    },
  };
};
