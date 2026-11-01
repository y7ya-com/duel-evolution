// The chat window's own state (CWindowModelChatWindow, src/System/window/yo2WindowChat.h), over read.js's helpers:
// mode_ +0x414 (0 tall, 1 short, 2 collapsed: its △ / ▽ step 1 -> 0 -> 2 -> 1) and tabs_ +0x3e0, a vector of Tab
// (0x1c: visible u8, list +4, tab +8), so each tab's log is known. Order alone can't pair them: the Duel Log tab
// (ovr/duellog.c) is made last and laid out second.
export default ({ u8, u32, i32, vec }) => ({
  windows: {
    CChatWindow: w => ({ mode: i32(w + 0x414),
      pairs: vec(w + 0x3e0, 0x1c).map(t => ({ tab: u32(t + 8), log: u32(t + 4), visible: !!u8(t) })) }),
  },
});
