// The deck editor's fields (screens/deck.js), read over read.js's helpers. Offsets: htmlui-deck-fields.md (shared
// notes), each from the yo2-decomp src/Deck header that pins it (YO2_AT) or the function named. The art itself comes
// from the controls' raw parts (screens/deck.js sets parts: true); this adds the state the HTML needs to know what
// it shows (cards, counts, view, drag) and the true rects of windows that lay out outside their nominal one.
import { APP } from '../read.js';

// The card database for the modern deck editor (globalThis.yo2Deck), read from the exe's own tables, never a data file
// in git. The yaneSDK CFile globals (src/duel/CardDB.cpp, DuelText.cpp: data at +0x18, a 4-byte header skipped when
// +0x34 is set, size at +0x1c): CARD_Prop 0x012a1140 (2 words per prop index, the deck's card ids; CardDB.h has the bit
// fields), CARD_Indx 0x012a1280 (8 bytes per index: the name's offset, then the text's), CARD_Name 0x012a12c0 and
// CARD_Desc 0x012a1240 (UTF-16; DLG_* the same for the game's other text), the limit list 0x01295038 ({yo2 id, konami id, copies u8}, 12 B; count 0x012a1038;
// cardLimitOf: 3 when not listed). The tables never change once loaded and the heap never grows (a fixed 2 GB), so an
// entry is read when asked for. The trunk (CWindowTaskKabanList `all` +0x3f0: {vtbl, card, count, order} per card) is
// read each frame into trunk: Map card -> copies left; `pool` (its signature) in the snapshot says when it changed.
let db = null;
function cardDb({ u8, u32, i32 }) {
  const data = o => { const p = u32(o + 0x18); return p && p + (u8(o + 0x34) ? 4 : 0); };
  const size = o => u32(o + 0x1c) - (u8(o + 0x34) ? 4 : 0);
  const PROP = 0x012a1140, INDX = 0x012a1280, NAME = 0x012a12c0, DESC = 0x012a1240, LIMITS = 0x01295038, NLIMIT = 0x012a1038;
  const wz = a => { let s = ''; for (let c; s.length < 2048 && (c = u32(a) & 0xffff); a += 2) s += String.fromCharCode(c); return s; };
  const text = (tab, k) => {
    const p = data(tab), ix = data(INDX);
    return p && ix ? wz(p + u32(ix + 8 * k + (tab === DESC ? 4 : 0))) : '';
  };
  const cache = new Map();
  let all = null, sig = '';
  const out = {
    v: 0,
    trunk: new Map(),
    ready: () => !!data(PROP) && !!data(NAME),
    count: () => (data(PROP) ? size(PROP) >>> 3 : 0),
    // CardDB.h: word 0 = internal id (14 bits) | ATK/10 << 14 (9 bits, 0x1ff "?") | DEF/10 << 23; word 1 = kind << 1
    // (5 bits) | attribute << 6 (4: 8 spell, 9 trap) | level << 10 | icon << 14 (3) | race << 17 (5)
    card(id) {
      let c = cache.get(id);
      if (c || !(id > 0 && id < out.count())) return c || null;
      const p = data(PROP) + 8 * id, w0 = u32(p), w1 = u32(p + 4), stat = v => (v === 0x1ff ? -1 : v * 10);
      let limit = 3;
      for (let i = 0, n = Math.min(u32(NLIMIT), 0x1000); i < n; i++) if (u32(LIMITS + 12 * i) === id) { limit = u8(LIMITS + 12 * i + 8); break; }
      c = { id, kid: w0 & 0x3fff, name: text(NAME, id), atk: stat((w0 >>> 14) & 0x1ff), def: stat(w0 >>> 23), kind: (w1 >>> 1) & 0x1f,
        attr: (w1 >>> 6) & 0xf, level: (w1 >>> 10) & 0xf, icon: (w1 >>> 14) & 7, race: (w1 >>> 17) & 0x1f, limit };
      cache.set(id, c);
      return c;
    },
    desc: id => (id > 0 && id < out.count() ? text(DESC, id) : ''),
    // the game's dialogue text n (DuelText.cpp textById: DLG_Indx 0x012a11c0, 4 bytes each, into DLG_Text 0x012a1180):
    // an attribute's name is n = attr + 0x212, a race's race + 500
    dlg: n => { const p = data(0x012a1180), ix = data(0x012a11c0); return p && ix && n >= 0 && n < size(0x012a11c0) >>> 2 ? wz(p + u32(ix + 4 * n)) : ''; },
    // every card with a name (prop index 0 is no card)
    cards: () => (all ||= out.ready() ? Array.from({ length: out.count() - 1 }, (_, i) => out.card(i + 1)).filter(c => c.name) : null),
    readTrunk(list) {   // this frame's trunk counts; its signature for the snapshot
      const f = u32(list + 0x3f0 + 8), l = u32(list + 0x3f0 + 0xc);
      let s = 0, n = 0;
      for (let p = f; f && p < l && n < 8192; p += 16, n++) s = (Math.imul(s, 31) + u32(p + 4) * 7 + i32(p + 8)) | 0;
      const k = n + ':' + s;
      if (k !== sig) {
        sig = k;
        out.trunk = new Map();
        for (let p = f; f && p < l && out.trunk.size < 8192; p += 16) out.trunk.set(u32(p + 4), i32(p + 8));
        out.v++;
      }
      return k;
    },
  };
  globalThis.yo2Deck = out;
  return out;
}

export default h => {
  const { u8, u32, i32, f32, ptr, vec, str, generic, label, children, cls, name, spr, swf } = h;
  const cards = (a, at) => vec(a, 4).map(p => u32(u32(p) + at));   // a vector<Card*> -> the cards' ids
  // the card table (*(0x12a1140 + 0x18): 8 bytes a card by its id, the exe's bit fields, KabanWindowList.h card::): a
  // monster's attribute ((w1 >> 6) & 0xf) is < 8 (FUN_007177f0). Live: Mystic Tomato 2, a spell 8, a trap 9
  const monster = id => { const t = u32(0x12a1140 + 0x18); return id > 0 && !!t && ((u32(t + id * 8 + 4) >> 6) & 0xf) < 8; };
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
  db ||= cardDb(h);
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
        hits: vec(c + 0x404 + 4, 0x10).length, pool: db.readTrunk(c) }),
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
      // The power strip (that text and the attribute / race / level icons) is a monster's only: the engine draws it per
      // card, and its text element keeps the last monster's text and its shown flag through a spell or trap (owner,
      // live: "1 ATK 100/DEF 100" under Premature Burial). So all of it follows the card shown now: monster
      CCardDetailViewDlg: w => {
        const mode = i32(w + 0x3f8), card = i32(w + 0x43c), top = f32(w + 0x430), pic = (mode === 0 || mode === 3) && card >= 0;
        const p = ptr(w + 0x494), mon = card >= 0 && monster(card);
        return { y: top, w: 248, h: i32(w + 0x3fc + 4 * mode), mode, card, monster: mon, scene: scene(u32(w + 8)),
          holes: pic ? [{ x: 8, y: 24, w: 232, h: 290 }, ...(mon ? [8, 24, 40].map(x => ({ x, y: 712 - top, w: 16, h: 16 })) : [])] : [],
          labels: p && mon ? [label(p)] : [] };
      },
    },
    // DeckWindow.h:93-101: the drag every deck screen shares, *(0x012b3230): state 1 a deck card / 2 a trunk card,
    // from, grid (1 main, 2 side, 3 extra), card, index
    // the deck being edited: CDeckManager (DAT_012b28c4, DeckManager.h) fileName_ +0x5ac ("deck.ydc")
    snapshot: () => {
      const p = u32(0x012b3230), dm = u32(0x012b28c4);
      return { deckName: dm ? str(dm + 0x5ac) : '', deckDrag: p ? { state: i32(p + 4), from: i32(p + 8), grid: i32(p + 0xc), card: i32(p + 0x10), index: i32(p + 0x14) } : null };
    },
  };
};
