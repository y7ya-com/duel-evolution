// The deck editor's fields (screens/deck.js), read over read.js's helpers. Offsets: htmlui-deck-fields.md (shared
// notes), each from the yo2-decomp src/Deck header that pins it (YO2_AT) or the function named. The art itself comes
// from the controls' raw parts (screens/deck.js sets parts: true); this adds the state the HTML needs to know what
// it shows (cards, counts, view, drag) and the true rects of windows that lay out outside their nominal one.
import { APP } from '../read.js';

export default h => {
  const { u8, u32, i32, f32, ptr, vec, generic, label, children, cls, name, spr, swf } = h;
  const cards = (a, at) => vec(a, 4).map(p => u32(u32(p) + at));   // a vector<Card*> -> the cards' ids
  const panelRect = (w, frameOf) => {
    const p = ptr(w + 0x398), bar = p && ptr(p + 0x36c), fr = p && frameOf(p);
    if (!bar || !fr) return {};
    const x = f32(bar + 0x494), y = f32(bar + 0x498);
    return { x, y, w: f32(bar + 0x49c), h: f32(fr + 0x3cc) + f32(fr + 0x3d4) - y };
  };
  // the scene around the windows (DeckEntry.cpp init), on each deck window (the bridge's backdrop goes to the first): the
  // root element "deckScene" (CDeckScene +0x74, every deck window's CTask parent) holds the background (BG, deck_bg_01 at 2x), the title strip (deck_title_0N: Edit Deck / Card Swap /
  // Trade) and the five side buttons (CSwfEngine LoadBtn..ExitBtn at (0, 40 + 27 i)); the game's mouse (CApp +0x164 /
  // +0x168, as read.js's cursor) for the buttons' hover look (the swf's own frame isn't readable)
  const scene = root => {
    if (!root || name(root) !== 'deckScene') return null;
    const kids = children(root), sp = kids.filter(k => cls(k) === 'CSpriteElm').map(spr);
    return { bg: sp.find(e => /deck_bg/.test(e.tex)) || null, title: sp.find(e => /deck_title/.test(e.tex)) || null,
      menu: kids.filter(k => cls(k) === 'CSwfEngine' && /Btn$/.test(name(k))).map(swf),
      mouse: u32(APP) ? [i32(u32(APP) + 0x164), i32(u32(APP) + 0x168)] : null };
  };
  return {
    controls: {
      // DeckWindow.h:355-367: grids 0x400 (main, side, extra, missing: vector<CWindowTaskDeckCard*>), tab[2] 0x3e4,
      // front tab 0x3fc (== tab[0] -> the Main view), expanded 0x468, counts 0x480..0x48c
      CWindowTaskDeck: c => ({
        view: u32(c + 0x3fc) === ptr(c + 0x3e4) ? 'main' : 'extra', expanded: !!u8(c + 0x468),
        counts: { main: i32(c + 0x480), side: i32(c + 0x484), extra: i32(c + 0x488), missing: i32(c + 0x48c) },
        grids: Object.fromEntries(['main', 'side', 'extra', 'missing'].map((k, i) => [k, cards(c + 0x400 + 0x10 * i, 0x3a0)])),
      }),
      // DeckWindow.h:222-226: card 0x3a0, dragging 0x3a4, enabled 0x3ae; 50 x 72 at 0x388 (init 0x00946670)
      CWindowTaskDeckCard: c => ({ card: u32(c + 0x3a0), dragging: !!u8(c + 0x3a4), w: f32(c + 0x388), h: f32(c + 0x38c) }),
      // KabanWindowList.h:374-380: rowCount 0x418, category 0x434 (0 normal .. 6 all), top 0x438
      // hits: the cards in `shown` (0x404, the filtered list; SortItems {vtbl, vector<CSortBase 0x10>}). `all` (0x3f0)
      // lists every card in the game, owned or not: no total from it
      CWindowTaskKabanList: c => ({ rowCount: i32(c + 0x418), category: i32(c + 0x434), top: i32(c + 0x438),
        hits: vec(c + 0x404 + 4, 0x10).length }),
      // KabanWindowList.h:301-306: card 0x4f8 (<= 0 empty), color 0x4fd (the frame sheet), 256 x 56 at 0x4e0
      CWindowTaskKabanListBtn: c => ({ card: i32(c + 0x4f8), color: u8(c + 0x4fd), w: f32(c + 0x4e0), h: f32(c + 0x4e4) }),
      // KabanWindow.h:310: the drag cursor's card 0x388
      CWindowTaskKabanCard: c => ({ card: u32(c + 0x388) }),
      // KabanWindow.h:200: cards owned in all
      CWindowTaskKabanNumber: c => ({ count: i32(c + 0x39c) }),
      // DeckWindow.h:271 maxLine 0x4c8; KabanWindowList.h:425 maxTop 0x4c8, total 0x4d0
      CWindowTaskDeckScroll: c => ({ ...generic(c), maxLine: i32(c + 0x4c8) }),
      CWindowTaskKabanScroll: c => ({ ...generic(c), maxTop: i32(c + 0x4c8), total: i32(c + 0x4d0) }),
    },
    windows: {
      // both panels sit in a (0, 0) 336 x 144 window and lay out in screen pixels (their posX/posY stay 0): the true
      // rect runs from the header bar (DeckBar x/y/width 0x494..0x49c, DeckParts.h:157-158) down to the bottom frame
      // (FrameThin rect 0x3c8): the deck's side frame (CWindowTaskDeck 0x384[1], DeckWindow.h:356), the trunk's
      // frame (CWindowTaskKaban 0x39c, KabanWindowList.h:474).
      CWindowModelDeck: w => ({ ...panelRect(w, p => ptr(p + 0x384 + 0xc)), scene: scene(u32(w + 8)) }),
      CWindowModelKaban: w => ({ ...panelRect(w, p => ptr(p + 0x39c)), scene: scene(u32(w + 8)) }),
      // CWindowModelCardDetail (decomp 0x005f68b0 / 0x005f7860): mode 0x3f8 (0 full, 1 text, 2 bar, 3 picture), the top
      // 0x430 (bottom-anchored), heights per mode 0x3fc[4], w 248. CCardDetailViewDlg: shown card 0x43c, the power
      // text 0x494 (a raw CTextElm). The big card and its race / attribute / level icons are queued by the dialog
      // itself (decomp 0x0075f7f0, 0x0075f370), not elements: the engine keeps drawing them, the DOM leaves holes.
      CCardDetailViewDlg: w => {
        const mode = i32(w + 0x3f8), card = i32(w + 0x43c), top = f32(w + 0x430), pic = (mode === 0 || mode === 3) && card >= 0;
        const p = ptr(w + 0x494);
        return { y: top, w: 248, h: i32(w + 0x3fc + 4 * mode), mode, card, scene: scene(u32(w + 8)),
          holes: pic ? [{ x: 8, y: 24, w: 232, h: 290 }, ...[8, 24, 40].map(x => ({ x, y: 712 - top, w: 16, h: 16 }))] : [],
          labels: p ? [label(p)] : [] };
      },
    },
    // DeckWindow.h:93-101: the drag every deck screen shares, *(0x012b3230): state 1 a deck card / 2 a trunk card,
    // from, grid (1 main, 2 side, 3 extra), card, index
    snapshot: () => {
      const p = u32(0x012b3230);
      return { deckDrag: p ? { state: i32(p + 4), from: i32(p + 8), grid: i32(p + 0xc), card: i32(p + 0x10), index: i32(p + 0x14) } : null };
    },
  };
};
