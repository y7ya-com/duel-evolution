// The game's window tree, read straight out of wasm memory (guest address == wasm address): CONTRACT.md's Snapshot.
// Pure: read(dv, frame, scene) takes a DataView over the memory and touches nothing else, so read_test.mjs runs it on
// a synthetic image. Offsets come from src/System/window/*.h, src/System/yo2Element.h, yo2Task.h and vc6.h, where
// each is pinned by YO2_AT against the exe; the comments name the field.
import VT from './vtables.js';

export const FACTORY = 0x0126fa8c;   // g_windowFactory (CWindowTaskFactory*)
export const SCENE_MNG = 0x01271790;   // CSceneMng::s_instance: sceneId_ (+0x7c) is the current scene (src/System/yo2SceneManager.h)
export const APP = 0x012711ac;       // g_app (CApp*): its mouseMng_ (+0xc4c) is the CMouseManager the cursor hangs off

// Read extensions (read/<group>.js, owned by the screen session that needs them): ext(h) -> { controls: {cls: c =>
// fields}, windows: {cls: w => fields}, snapshot: () => fields }, called each read with the helpers h below.
const EXT = [];
export const extend = ext => { EXT.push(ext); };
const SJIS = new TextDecoder('shift_jis');   // the game's ANSI code page (cp932): instance names, paths

// opts.parts: window ids whose controls also get `parts` (their raw sprite / text / swf children)
export function read(dv, frame = 0, scene = 0, opts = {}) {
  const u8 = a => dv.getUint8(a), u32 = a => dv.getUint32(a, true), i32 = a => dv.getInt32(a, true);
  const f32 = a => dv.getFloat32(a, true);
  const ptr = a => u32(a + 4);                        // CTaskPtr<T>: task_ at +4
  const wstr = a => {                                 // vc6::wstring {alloc, ptr, len, res}
    const p = u32(a + 4), n = Math.min(u32(a + 8), 4096);
    let s = '';
    for (let i = 0; p && i < n; i++) s += String.fromCharCode(dv.getUint16(p + 2 * i, true));
    return s;
  };
  const vec = (a, size) => {                          // vc6::vector {alloc, first, last, end}
    const out = [], f = u32(a + 4), l = u32(a + 8);
    for (let p = f; f && p < l && out.length < 4096; p += size) out.push(p);
    return out;
  };
  const list = a => {                                 // vc6::list {alloc, head, size}: circular, head a sentinel
    const out = [], head = u32(a + 4);
    for (let n = head && u32(head); n && n !== head && out.length < 4096; n = u32(n)) out.push(u32(n + 8));
    return out;
  };
  const cls = o => { const v = o && VT[u32(o)]; return v && v[1] === 0 ? v[0] : '?'; };
  const outer = sub => { const v = sub && VT[u32(sub)]; return v ? sub - v[1] : 0; };   // a subobject's object
  const shown = e => !!u8(e + 0xc4) && !u8(e + 0xc6);   // CElement disp_, hiddenByParent_
  const alpha = e => f32(e + 0x174);                     // CElement inheritColor4_[3]: what is drawn

  // a CTextElm's text: sprite_ (+0x340) . tex_ (+0x8c) . text_ (+0x44)
  const elmText = t => t ? wstr(t + 0x410) : '';
  const children = t => list(t + 0x0c);              // CTask::children_
  const textCtl = t => t ? {   // CWindowTaskText
    text: elmText(ptr(t + 0x368)), align: i32(ptr(t + 0x368) + 0x74c) || 0, fontSize: i32(t + 0x380),
    lineGap: i32(t + 0x384), firstLine: ptr(t + 0x368) ? i32(ptr(t + 0x368) + 0x750) : 0,
    pageLines: ptr(t + 0x368) ? i32(ptr(t + 0x368) + 0x754) : 0,
    color: ptr(t + 0x368) ? [0, 4, 8, 12].map(o => f32(ptr(t + 0x368) + 0xa4 + o)) : [0, 0, 0, 1],
  } : { text: '' };
  const str = a => {                                  // vc6::string, cp932
    const p = u32(a + 4), n = Math.min(u32(a + 8), 512);
    return p && n ? SJIS.decode(new Uint8Array(dv.buffer, p, n).slice()) : '';
  };
  const name = t => str(t + 0x4c);                    // CTask instName (setInstName)
  const vis = e => shown(e) && !(u32(e + 0x20) & 2);   // + the task flag the game sets with hiding (no mouse)
  // any lock bit on it or an ancestor (CTask lockFlags_ +0x20): no TM_MAIN for that subtree, so nothing of it is drawn
  // (the shop hides this way, never through disp_)
  const locked = t => { for (let d = 0; t && d < 32; d++, t = u32(t + 8)) if (u32(t + 0x20)) return true; return false; };
  // an element's place: local (parent-relative: inheritTransform) and world (worldPos_ +0xc8, as last drawn)
  // a: the alpha it is drawn with (inheritColor4_[3]: its colour times its parents')
  const at = e => ({ x: f32(e + 0x70), y: f32(e + 0x74), z: f32(e + 0x78), wx: f32(e + 0xc8), wy: f32(e + 0xcc), wz: f32(e + 0xd0), a: f32(e + 0x174) });
  // a CSpriteElm: texName_ (+0x358, raw: a '?' language letter is the loader's), the source rect (CElement rect_
  // +0x94: setTexture makes w/h the image's), scale (+0x88: a stretched piece), colour (+0xa4)
  const spr = e => e ? { id: e, name: name(e), tex: str(e + 0x358), src: [0, 4, 8, 12].map(o => i32(e + 0x94 + o)),
    ...at(e), sx: f32(e + 0x88), sy: f32(e + 0x8c), rgba: [0, 4, 8, 12].map(o => f32(e + 0xa4 + o)),
    col: [0, 4, 8, 12].map(o => f32(e + 0x168 + o)), shown: vis(e) } : null;   // col: inheritColor4_, its colour x its parents' (what is drawn)
  const label = e => ({ id: e, name: name(e), text: wstr(e + 0x410), ...at(e), shown: vis(e) });   // a CTextElm
  const swf = e => ({ id: e, name: name(e), ...at(e), shown: vis(e) });                            // a CSwfEngine
  const rectF = (c, o) => ({ x: f32(c + o), y: f32(c + o + 4), w: f32(c + o + 8), h: f32(c + o + 12) });
  const rectI = (c, o) => ({ x: i32(c + o), y: i32(c + o + 4), w: i32(c + o + 8), h: i32(c + o + 12) });
  const STATE = ['normal', 'hover', 'pressed', 'normal'];   // PRESSED_OUTSIDE looks normal
  const sw = (c, stateAt) => ({ state: u8(c + 0x350) ? STATE[i32(c + stateAt)] || 'normal' : 'disabled' });
  const caption = c => { const t = textCtl(ptr(ptr(c + 0x5a4) + 0x36c)); return { label: t.text, align: t.align ?? 1 }; };   // TextSwitch caption_ -> ShadowText text_

  // per class: geometry (window-local) and the family's fields; subclasses fall back along BASE
  const F = {
    CWindowTaskText: c => !c ? { text: '' } : ({ x: f32(c + 0x374), y: f32(c + 0x378),
      w: ptr(c + 0x368) ? f32(ptr(c + 0x368) + 0x3c4) : 0, h: ptr(c + 0x368) ? f32(ptr(c + 0x368) + 0x3c8) : 0, ...textCtl(c) }),
    CWindowTaskShadowText: c => ({ ...F.CWindowTaskText(ptr(c + 0x36c)), x: i32(c + 0x38c), y: i32(c + 0x390) }),
    CWindowTaskTextField: c => ({ ...textCtl(ptr(c + 0x384)), ...rectF(c, 0x390) }),
    CWindowTaskSwitch: c => ({ ...rectF(c, 0x3d4), label: '', ...sw(c, 0x3e8), checked: !!u8(c + 0x3ec) }),
    CWindowTaskTextSwitch: c => ({ ...F.CWindowTaskSwitch(c), ...caption(c) }),
    CWindowTaskPictureSwitch: c => ({ ...rectF(c, 0x3a8), label: textCtl(ptr(c + 0x39c)).text, ...sw(c, 0x3bc),
      checked: !!u8(c + 0x3c0),
      art: { normal: spr(ptr(c + 0x36c)), hover: spr(ptr(c + 0x378)), pressed: spr(ptr(c + 0x384)), checked: spr(ptr(c + 0x390)) } }),
    CWindowTaskCheckbox: c => ({ x: f32(c + 0x70), y: f32(c + 0x74), w: f32(c + 0x380), h: f32(c + 0x384),
      checked: !!u8(c + 0x388) }),
    CWindowTaskTab: c => {
      const t = ptr(c + 0x38c), col = t ? [0, 4, 8].map(o => f32(t + 0xa4 + o)) : [0, 0, 0];
      return { ...rectF(c, 0x3bc), label: elmText(t), active: col[2] > col[0] };   // setLook: selected = blue text
    },
    CWindowTaskInput: c => ({ ...rectF(c, 0x3c8), value: wstr(c + 0x39c), password: !!u8(c + 0x3f4),
      caret: { col: i32(c + 0x3dc), line: i32(c + 0x3e0) }, caretOn: !!u8(c + 0x3fc), maxLen: i32(c + 0x3f0),
      multiLine: !!u8(c + 0x3d8) }),
    CWindowTaskListbox: c => ({ ...rectI(c, 0x3ac), items: vec(c + 0x39c, 16).map(wstr), selected: i32(c + 0x3c0),
      marks: vec(c + 0x3d0, 1).map(a => !!u8(a)), top: i32(c + 0x3c4), topLine: i32(c + 0x3c8),
      rows: ptr(c + 0x36c) ? i32(ptr(c + 0x36c) + 0x3a8) : 0 }),
    CWindowTaskScrollBase: c => {
      const h = /ScrollH$/.test(cls(c)), len = f32(c + 0x468);
      return { x: f32(c + 0x460), y: f32(c + 0x464), w: h ? len : 16, h: h ? 16 : len, value: i32(c + 0x478),
        max: i32(c + 0x47c), page: i32(c + 0x498), thumb: { pos: f32(c + 0x470), len: f32(c + 0x474) }, length: len,
        horizontal: h, shown: shown(c) && !!u8(c + 0x4bc) };
    },
    CWindowTaskFrameThin: c => ({ ...rectF(c, 0x3c8), style: i32(c + 0x3d8) }),
    CWindowTaskFrameBottomThick: c => ({ ...rectF(c, 0x410), band: f32(c + 0x420), style: i32(c + 0x424) }),
    CWindowTaskFramePlane: c => ({ ...rectF(c, 0x3d4), style: i32(c + 0x3e4) }),
    CWindowTaskPictureFrame: c => rectF(c, 0x3f8),
    CWindowTaskBackPlane: c => rectF(c, 0x374),
    CWindowTaskThinChop: c => rectF(c, 0x3a4),
    CWindowTaskBackStripe: c => ({ ...rectF(c, 0x394), rows: i32(c + 0x3a8), selected: i32(c + 0x3ac) }),
    CWindowTaskIconbar: c => ({ ...rectF(c, 0x38c), active: !!u8(c + 0x39c) }),
    CWindowTaskIconHide: c => ({ ...rectF(c, 0x374), pressed: !!u8(c + 0x384) }),
    CWindowTaskMenubar: c => ({ x: f32(c + 0x70), y: f32(c + 0x74), w: 0, h: 0, message: wstr(c + 0x39c),
      scroll: f32(c + 0x3ac) }),
  };
  const BASE = {   // class -> the reader it shares (exe subclasses with the same layout up to these fields)
    CWindowTaskButtonMain: 'CWindowTaskTextSwitch', CWindowTaskButtonDuel: 'CWindowTaskTextSwitch',
    CWindowTaskResultNext: 'CWindowTaskTextSwitch', CWindowTaskCardWindow: 'CWindowTaskPictureSwitch',
    CWindowTaskActiveListbox: 'CWindowTaskListbox', CWindowTaskTextlist: 'CWindowTaskListbox',
    CNoBackList: 'CWindowTaskListbox', CWindowTaskDueldiskRearrengeListbox: 'CWindowTaskListbox',
    CWindowTaskScroll: 'CWindowTaskScrollBase', CWindowTaskScrollH: 'CWindowTaskScrollBase',
    CWindowTaskScrollBalloon: 'CWindowTaskScrollBase', CWindowTaskDeckScroll: 'CWindowTaskScrollBase',
    CWindowTaskKabanScroll: 'CWindowTaskScrollBase', CWindowResultScroll: 'CWindowTaskScrollBase',
    CWindowTaskIconExpand: 'CWindowTaskIconHide', CWindowTaskIconShrink: 'CWindowTaskIconHide',
    CWindowTaskInputDuel: 'CWindowTaskInput', CWindowTaskBalloonFrame: 'CWindowTaskPictureFrame',
    CWindowTaskDuelConfigFrame: 'CWindowTaskPictureFrame', CWindowTaskDuellogFrame: 'CWindowTaskPictureFrame',
    CWindowTaskFramePlace: 'CWindowTaskPictureFrame', CWindowTaskDueldiskRearrengeFrame: 'CWindowTaskPictureFrame',
  };
  const h = { u8, u32, i32, f32, ptr, wstr, str, vec, list, cls, outer, shown, vis, locked, alpha, name, at, spr, label, swf,
    textCtl, rectF, rectI, children: t => list(t + 0x0c),
    generic: c => { const k = cls(c), f = F[k] || (k.startsWith('CWindowTaskListbox') ? F.CWindowTaskListbox : F[BASE[k]]); return f ? f(c) : {}; } };
  const exts = EXT.map(e => e(h)), XC = Object.assign({}, ...exts.map(e => e.controls)),
    XW = Object.assign({}, ...exts.map(e => e.windows)), XT = Object.assign({}, ...exts.map(e => e.tasks));
  const fam = k => XC[k] || F[k] || (k.startsWith('CWindowTaskListbox') ? F.CWindowTaskListbox : F[BASE[k]]);
  // a control's raw parts: its CTask children (and theirs, 4 deep) that are sprites, text or swf, not controls
  const parts = c => {
    const out = { sprites: [], labels: [], swfs: [] };
    const walk = (t, d) => {
      for (const k of children(t)) {
        if (ctlSet.has(k) || byTask.has(k)) continue;   // its own controls / tasks are listed by themselves
        const n = cls(k);
        if (n === 'CSpriteElm') out.sprites.push(spr(k));
        else if (n === 'CTextElm') out.labels.push(label(k));
        else if (n === 'CSwfEngine') out.swfs.push(swf(k));
        if (d < 4) walk(k, d + 1);
      }
    };
    walk(c, 0);
    return out;
  };

  // the game's mouse cursor: g_app's CMouseManager. Its sprites are CSpriteElm leaves, whatever builds them: the hand
  // (CHandCursorTask: 11 CSwfEngine animations, data/common/m_cursor, each CSwfEngine > Offset > CSwfSprite >
  // CSwfShape > CSpriteElm) or the arrow (CArrowCursorTask::m_picCursor, mausuk_01_c00.png). The engine draws it last
  // (priority 10000); the bridge draws it above the DOM windows. Each sprite as drawn: worldPos_ (+0xc8), worldScale_
  // (+0xd4), inheritColor4_ (+0x168) and inheritAddColor_ (+0x178), drawMode_ (+0x188) (src/System/yo2Element.h);
  // drawn: disp_ and not hiddenByParent_ on it and every element up to the manager
  const app = u32(APP), mgr = app && u32(app + 0xc4c);
  // mx, my: the mouse in game pixels (CApp's CMyMouseEx at +0x148: x_ +0x1c, y_ +0x20; src/System/yo2MouseTask.h)
  const cursor = mgr && cls(mgr) === 'CMouseManager' ? { id: mgr, shown: vis(mgr) && !locked(mgr), mx: i32(app + 0x164), my: i32(app + 0x168), sprites: [] } : null;
  if (cursor) (function walk(t, d, on) {
    for (const k of children(t)) {
      const drawn = on && shown(k);
      // wsx, wsy: the scale it is drawn at, world_'s _11 / _22 (+0xe0 / +0xf4): the click ripple grows through its
      // matrix while worldScale_ (+0xd4) stays 1 (read from that, the ripple slid up-left at a fixed size)
      if (cls(k) === 'CSpriteElm') cursor.sprites.push({ ...spr(k), shown: drawn, wsx: f32(k + 0xe0), wsy: f32(k + 0xf4),
        col: [0, 4, 8, 12].map(o => f32(k + 0x168 + o)), add: [0, 4, 8, 12].map(o => f32(k + 0x178 + o)), mode: i32(k + 0x188) });
      if (d < 8) walk(k, d + 1, drawn);
    }
  })(mgr, 0, true);
  const drawOrder = (a, b) => a.wz - b.wz || a.z - b.z;
  // where a window actually draws: the box around its shown, drawn top-level controls at their world positions (as
  // last drawn: the deck scene's chat window says y 608 but draws its bar at 712), parked ones left out (the game parks
  // a hidden part at 99999), or null (it draws nothing). ponytail: one box (a label's text box can overstate it);
  // per-control rects if a window ever needs a finer hole
  const PARKED = 9999;
  // A text control counts only its lines (its box can be far taller: the file list's "always hidden" row count reads
  // shown with a box past the dialog's frame), an empty or invisible one not at all.
  const inkH = c => c.text === undefined ? c.h
    : c.text ? Math.min(c.h, c.text.split('\n').length * (c.fontSize || 16) + (c.lineGap || 0)) : 0;
  const drawnBox = w => {
    const cs = byWin.get(w).filter(c => !c.parent && c.shown && c.alpha > 0 && c.wz > 0 && c.w > 0 && inkH(c) > 0 &&
      Math.max(c.x, c.y, c.wx, c.wy) < PARKED);
    if (!cs.length) return null;
    const x0 = Math.min(...cs.map(c => c.wx)), y0 = Math.min(...cs.map(c => c.wy));
    return { x: x0, y: y0, w: Math.max(...cs.map(c => c.wx + c.w)) - x0, h: Math.max(...cs.map(c => c.wy + inkH(c))) - y0 };
  };
  // a window's box (CWindowTaskModel +0x380): x, y, w, h; a window that never sets its size (CWindowLogin as
  // rt/session.cpp rearranges it reads 0 x 0) gets its frame control's, else its shown top-level controls' extent
  // (a label's text box can be far bigger than its text: the 2008 login labels are 256 x 256)
  const box = w => {
    const r = rectF(w, 0x380);
    // where the window really is: a drawn, unparked top-level control's world position less its local one (the deck
    // scene's chat says y 608 but draws at 712: its rect is stale), else the rect
    // (local: the element's own pos_ +0x70 / +0x74, which worldPos_ is relative to; not a family's x / y: a ShadowText's
    // are its text's offset, 20 or 150, while its world position is the container's: the banner moved off-screen)
    const o = byWin.get(w).find(c => !c.parent && c.shown && c.wz > 0 && Math.max(c.x, c.y, c.wx, c.wy) < 9999);
    if (o) r.x = o.wx - f32(o.id + 0x70), r.y = o.wy - f32(o.id + 0x74);
    if (r.w > 0 && r.h > 0) return r;
    const cs = byWin.get(w).filter(c => !c.parent && c.shown && c.w > 0 && c.h > 0), f = cs.find(c => /Frame/.test(c.cls));
    if (f) return { ...r, w: f.x + f.w, h: f.y + f.h };
    return { ...r, w: Math.max(0, ...cs.map(c => c.x + c.w)), h: Math.max(0, ...cs.map(c => c.y + c.h)) };
  };
  // the scene as the game holds it, so a bridge that started after a scene change still knows it (Module.onYo2Scene
  // tells only listeners already added: on a loaded machine the title came before start() and scene stayed 0)
  const sm = u32(SCENE_MNG);
  if (sm) scene = i32(sm + 0x7c);
  const fac = u32(FACTORY);
  if (!fac) return { v: 1, frame, scene, mouse: null, focus: 0, windows: [], tasks: [], cursor };
  const wins = list(fac + 0x10), winSet = new Set(wins);
  const byWin = new Map(wins.map(w => [w, []])), byTask = new Map();
  let focus = 0;
  const ctls = vec(fac, 4).map(u32), ctlSet = new Set(ctls);
  for (const c of ctls) {
    // the owner: mediator_ (+0x344) is an IWindowTaskMediator subobject of a window or of a parent control
    let parent = 0, o = c;
    for (let d = 0; d < 8; d++) {
      const up = outer(u32(o + 0x344));
      if (!up || winSet.has(up) || !ctlSet.has(up)) { o = up; break; }   // a window, or another task (the shop's)
      if (!parent) parent = up;
      o = up;
    }
    if (!o) continue;
    const k = cls(c), f = fam(k), base = {
      id: c, cls: k, name: name(c) || str(c + 0x354), parent,
      x: f32(c + 0x70), y: f32(c + 0x74), w: 0, h: 0, z: f32(c + 0x34c), alpha: alpha(c), shown: shown(c) && !locked(c),
      wx: f32(c + 0xc8), wy: f32(c + 0xcc), wz: f32(c + 0xd0),   // where it was last drawn (worldPos_)
      enabled: !!u8(c + 0x350), focused: !!u8(c + 0x351),
    };
    if (base.focused) focus = c;
    const ctl = f ? { ...base, ...f(c) } : { ...base, unknown: true };
    if (opts.parts?.has(o)) ctl.parts = parts(c);
    // owned by a window, or (the shop) by another task: grouped under it in `tasks`
    (winSet.has(o) ? byWin : byTask.set(o, byTask.get(o) || []) && byTask).get(o).push(ctl);
  }
  const windows = wins.map(w => ({
    id: w, cls: cls(w), ...box(w), z: f32(w + 0x34c), alpha: alpha(w),
    shown: shown(w) && !locked(w),
    modal: !!u8(w + 0x350), topmost: !!u8(w + 0x35c), active: !!u8(w + 0x351),
    // draw order: as the engine drew them, back to front: worldPos_ z (+0xd0; the frame 51153 < field < buttons <
    // labels 51157 at Select Player), z_ (+0x34c: body 0, buttons 2, labels 3) only between equals. z_ alone misses
    // what a window places through pos_.z: Select Player's level texts (z_ 0, drawn over their rows), ChangeAvatar's,
    // FindMenu's, ShopConfirm's. ponytail: a control shown for the first time this frame has no world z yet (0) and
    // sorts to the back for that one frame
    controls: byWin.get(w).reverse().sort(drawOrder),
    // wz: how deep the engine draws the window, its frontmost drawn control's world z (0: none drawn yet); the
    // factory's list is not the draw order (the deck's chat bar is listed after its panels and drawn under them)
    wz: Math.max(0, ...byWin.get(w).filter(c => c.shown && c.wz > 0).map(c => c.wz)),
    drawn: drawnBox(w),
    // the window's own CTask children that are not controls (waist-up avatars, sprites): passthrough candidates
    extras: children(w).filter(t => !ctlSet.has(t)).map(t => cls(t) === 'CSpriteElm' ? { ...spr(t), cls: 'CSpriteElm' } : { id: t, cls: cls(t) }),
    ...XW[cls(w)]?.(w),
  })).reverse();                                // back to front
  // the non-window owners (the shop's CShop* tasks), shaped like windows so a screen can claim them; w/h from a read
  // extension's tasks table (a task has no rect of its own)
  const tasks = [...byTask].map(([t, cs]) => ({ id: t, cls: cls(t), ...at(t), w: 0, h: 0, alpha: alpha(t),
    shown: shown(t) && !locked(t), controls: cs.reverse().sort(drawOrder), extras: [],
    ...(opts.parts?.has(t) && { parts: parts(t) }), ...XT[cls(t)]?.(t) }));
  return { v: 1, frame, scene, mouse: null, focus, windows, tasks, cursor, ...Object.assign({}, ...exts.map(e => e.snapshot?.())) };
}
