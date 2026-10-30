// The game's window tree, read straight out of wasm memory (guest address == wasm address): CONTRACT.md's Snapshot.
// Pure: read(dv, frame, scene) takes a DataView over the memory and touches nothing else, so read_test.mjs runs it on
// a synthetic image. Offsets come from src/System/window/*.h, src/System/yo2Element.h, yo2Task.h and vc6.h, where
// each is pinned by YO2_AT against the exe; the comments name the field.
import VT from './vtables.js';

export const FACTORY = 0x0126fa8c;   // g_windowFactory (CWindowTaskFactory*)

export function read(dv, frame = 0, scene = 0) {
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
  const str = a => {                                  // vc6::string (the game's ANSI code page: paths are ASCII)
    const p = u32(a + 4), n = Math.min(u32(a + 8), 512);
    let r = '';
    for (let i = 0; p && i < n; i++) r += String.fromCharCode(u8(p + i));
    return r;
  };
  // a CSpriteElm: its texture (texName_ +0x358) and the CD3DSprite it draws (sprite_ +0x340: dst_ +0x04, src_ +0x14)
  const spr = e => {
    const d = e && u32(e + 0x340);
    return e && d ? { tex: str(e + 0x358), x: f32(e + 0x70), y: f32(e + 0x74), w: i32(d + 0x0c), h: i32(d + 0x10),
      u: i32(d + 0x14), v: i32(d + 0x18), sw: i32(d + 0x1c), sh: i32(d + 0x20), shown: shown(e) } : null;
  };
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
      marks: vec(c + 0x3d0, 1).map(a => !!u8(a)), top: i32(c + 0x3c4),
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
  const fam = k => F[k] || (k.startsWith('CWindowTaskListbox') ? F.CWindowTaskListbox : F[BASE[k]]);

  const fac = u32(FACTORY);
  if (!fac) return { v: 1, frame, scene, mouse: null, focus: 0, windows: [] };
  const wins = list(fac + 0x10), winSet = new Set(wins);
  const byWin = new Map(wins.map(w => [w, []]));
  let focus = 0;
  const ctls = vec(fac, 4).map(u32), ctlSet = new Set(ctls);
  for (const c of ctls) {
    // the owner: mediator_ (+0x344) is an IWindowTaskMediator subobject of a window or of a parent control
    let parent = 0, o = c;
    for (let d = 0; d < 8; d++) {
      const up = outer(u32(o + 0x344));
      if (!up || winSet.has(up)) { o = up; break; }
      if (!parent) parent = up;
      o = up;
    }
    if (!winSet.has(o)) continue;
    const k = cls(c), f = fam(k), base = {
      id: c, cls: k, name: wstr(c + 0x354), parent,
      x: f32(c + 0x70), y: f32(c + 0x74), w: 0, h: 0, z: f32(c + 0x34c), alpha: alpha(c), shown: shown(c),
      enabled: !!u8(c + 0x350), focused: !!u8(c + 0x351),
    };
    if (base.focused) focus = c;
    byWin.get(o).push(f ? { ...base, ...f(c) } : { ...base, unknown: true });
  }
  const windows = wins.map(w => ({
    id: w, cls: cls(w), ...rectF(w, 0x380), z: f32(w + 0x34c), alpha: alpha(w),
    shown: shown(w) && !(u32(w + 0x20) & 4),   // CTask lockFlags_ bit 2: hidden, no TM_MAIN
    modal: !!u8(w + 0x350), topmost: !!u8(w + 0x35c), active: !!u8(w + 0x351),
    controls: byWin.get(w).reverse(),           // the factory keeps them front to back
    // the window's own CTask children that are not controls (waist-up avatars, sprites): passthrough candidates
    extras: children(w).filter(t => !ctlSet.has(t)).map(t => cls(t) === 'CSpriteElm' ? { id: t, cls: 'CSpriteElm', ...spr(t) } : { id: t, cls: cls(t) }),
  })).reverse();                                // back to front
  return { v: 1, frame, scene, mouse: null, focus, windows };
}
