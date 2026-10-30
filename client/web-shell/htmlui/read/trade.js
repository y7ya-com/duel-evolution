// The trade (scene 0x26), TP (0x28) and present (0x27) windows' true rects, over read.js's helpers. Offsets:
// htmlui-shop-fields.md §3 (shared notes), from yo2-decomp src/Deck (TradeWindow.h, TpEntry.h, DeckParts.h) and the
// functions named. Like the deck models, these sit at (0, 0) with a nominal 336 x 144 rect and lay out in screen
// pixels; the art itself comes from the controls' parts (screens/trade.js draws them as screens/deck.js does).
export default h => {
  const { u8, u32, i32, f32, ptr } = h;
  return {
    controls: {
      // TradeWindow.h:80-84: offers 0x384 (partner) / 0x394 (mine), counts 0x410 / 0x414, my ready 0x419
      CWindowTaskTrade: c => ({ otherCount: i32(c + 0x410), mineCount: i32(c + 0x414), ready: !!u8(c + 0x419) }),
      // TradeWindow.h:44-45 (TpCard the same layout): card 0x394, dragging 0x398
      CWindowTaskTradeCard: c => ({ card: i32(c + 0x394), dragging: !!u8(c + 0x398) }),
      CWindowTaskTpCard: c => ({ card: i32(c + 0x394), dragging: !!u8(c + 0x398) }),
      // decomp 0x98c340: chosen count 0x440
      CWindowTaskTp: c => ({ count: i32(c + 0x440) }),
    },
    windows: {
      // CWindowTaskCardArea's updatePos writes only the element's 0x70 / 0x74, never 0x380 (DeckParts.h:237, 0x0091f960):
      // its own x, y, w, h at 0x464..0x470; mode 0x478 (1 trade mine, 2 trade partner, 3 present, 4 TP)
      CWindowTaskCardArea: w => ({ x: f32(w + 0x464), y: f32(w + 0x468), w: f32(w + 0x46c), h: f32(w + 0x470), mode: i32(w + 0x478) }),
      // CWindowModelTrade 0x398: the panel (raw pointer, decomp 0x994d60); its two areas (248, 0) and (248, 320), 488 x 288
      CWindowModelTrade: w => u32(w + 0x398) ? { x: 248, y: 0, w: 488, h: 608 } : {},
      // CWindowModelTp 0x398: the panel; guide (248, 0) 488 x 150 over the area (248, 150) 488 x 558 (decomp 0x9884e0)
      CWindowModelTp: w => ptr(w + 0x398) ? { x: 248, y: 0, w: 488, h: 708 } : {},
    },
  };
};
