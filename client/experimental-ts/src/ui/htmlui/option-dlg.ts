// Windows the engine draws on live that main's Legacy UI never drew (the title's OPTIONS, COptionDlg; the Duel Log's
// top, CWindowModelDuellogTop): the rewrite draws them from the original art like the engine: the window's picture
// (option_dai_01_c01), each picture switch's sprite for its look (normal, hover, pressed, checked: CWindowTaskPictureSwitch),
// the volume slider's rail and thumb (option_icon_01_c00), the white 16-pixel texts and the OK / Cancel captions (main's
// textBox, as every other window's text; a text's `shadow` the engine's ShadowText copy under it; a text with `scroll`
// wraps in its box and scrolls there), the duel buttons in main's duel look (skin.js duelButton). Their snapshots are
// options.ts titleOptionsWindow and duellog.ts duellogWindow; registered in layer.ts EXTRA.
import { textBox, renderControl } from '@htmlui/controls/basic.js';
import { duelButton, duelWindow } from '@htmlui/controls/skin.js';
import { pictureUrl } from './pictures';
import type { HtmlControl, HtmlWindow } from './snapshot';

type Sprite = { tex: string; src: [number, number, number, number] };
type Slider = HtmlControl & { value: number; max: number; travel: number; tex: string; rail: number[]; railY: number; thumb: number[][] };
interface State { back: HTMLElement; items: Map<number, { el: HTMLElement; sig: string }>; hover: number; pressed: number; drag: boolean; win: HtmlWindow | null }

const CSS = `.opt-dlg-back, .opt-dlg-sprite { position: absolute; background-repeat: no-repeat; }
.opt-dlg-pick { position: absolute; padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer; overflow: hidden; }
.opt-dlg-pick:disabled { cursor: default; }
.opt-dlg-pick:focus-visible, .opt-dlg-slider:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.opt-dlg-pick > .opt-dlg-sprite { left: 0; top: 0; width: 100%; height: 100%; }
.opt-dlg-slider { position: absolute; cursor: pointer; touch-action: none; }
.opt-dlg-text { position: absolute; pointer-events: none; }`;
const css = () => { if (!document.getElementById('opt-dlg-css')) { const st = document.createElement('style'); st.id = 'opt-dlg-css'; st.textContent = CSS; document.head.append(st); } };

/** An element showing one sprite of an archive texture (its url once loaded). */
function paint(el: HTMLElement, tex: string, src: readonly number[]): void {
  const pos = `${-src[0]!}px ${-src[1]!}px`;
  if (el.dataset.tex !== tex) { el.dataset.tex = tex; void pictureUrl({ archive: tex }).then(url => { if (url && el.dataset.tex === tex) el.style.backgroundImage = `url("${url}")`; }); }
  el.style.backgroundPosition = pos;
}
const lookOf = (c: HtmlControl, hover: boolean, pressed: boolean): string =>
  !c.enabled || c.state === 'disabled' ? (c.checked ? 'checked' : 'normal') : pressed ? 'pressed' : c.checked ? 'checked' : hover ? 'hover' : 'normal';

export const optionDlgScreen: HtmlUiScreen = {
  classes: ['COptionDlg', 'CWindowModelDuellogTop', 'CWindowModelDuellogList', 'CWindowModelDuellogServerSelect'],
  mode: 'owned',
  mount(win, root) {
    css();
    const w = win as HtmlWindow, back = document.createElement('div'); back.className = 'opt-dlg-back';
    Object.assign(back.style, { left: '0', top: '0', width: w.w + 'px', height: w.h + 'px' });
    root.append(back);
    return { back, items: new Map(), hover: 0, pressed: 0, drag: false, win: null } satisfies State;
  },
  update(win, _prev, root, api, st) {
    const w = win as HtmlWindow, s = st as State; s.win = w;
    if (w.back) paint(s.back, String(w.back), [0, 0]);
    // a duel-style window's frame (main's skin.js duelWindow) or a plain one (`plain`: its border and body colours)
    const frame = w.controls.some(c => !c.parent && c.cls === 'CWindowTaskFrameDuel'), plain = w.plain as { border: string; body: string } | undefined;
    if ((frame || plain) && s.back.dataset.frame !== `${w.w}x${w.h}`) {
      s.back.dataset.frame = `${w.w}x${w.h}`; s.back.replaceChildren();
      if (frame) duelWindow(s.back, { w: w.w, h: w.h });
      else if (plain) Object.assign(s.back.style, { boxSizing: 'border-box', border: `4px solid ${plain.border}`, background: plain.body, borderRadius: '2px' });
    }
    const seen = new Set<number>();
    // a switch's help (the Duel Log's plates): shown in the window's help text while the pointer is on the switch
    const help = w.controls.find(k => k.id === s.hover && typeof k.help === 'string')?.help as string | undefined;
    for (const c0 of w.controls) {
      const c = c0.helpSlot ? { ...c0, text: help ?? c0.text } : c0;
      if (c.parent || !c.shown) continue;
      seen.add(c.id);
      if (c.cls === 'CWindowTaskText' || c.cls === 'CWindowTaskShadowText') {
        const sh = c.shadow as { dx: number; dy: number; color: number[] } | undefined, scroll = !!c.scroll;
        const sig = `t:${c.text}:${c.color}:${sh ? `${sh.dx},${sh.dy}` : ''}:${scroll}`; let it = s.items.get(c.id);
        if (it?.sig !== sig) { it?.el.remove(); const el = document.createElement('div'); el.className = 'opt-dlg-text'; el.dataset.name = c.name; Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
          if (scroll) Object.assign(el.style, { overflowY: 'auto', overflowX: 'hidden', pointerEvents: 'auto', scrollbarWidth: 'thin' });
          const t = textBox(el, String(c.text ?? ''), { w: scroll ? c.w - 4 : c.w, align: Number(c.align ?? 1), px: Number(c.fontSize ?? 16), color: c.color as number[], white: true, wrap: scroll });
          if (scroll) t.style.position = 'relative';
          if (sh) t.style.textShadow = `${sh.dx}px ${sh.dy}px 0 rgba(${sh.color.slice(0, 3).map(v => Math.round(v * 255)).join(',')},${sh.color[3] ?? 1})`;
          root.append(el); it = { el, sig }; s.items.set(c.id, it); }
      } else if (c.cls === 'CWindowTaskFrameDuel') {
        continue;
      } else if (c.cls === 'CWindowTaskBackPlane' && c.band) {
        // a band of the well (the Duel Log list's dark header)
        let it = s.items.get(c.id); const sig = `p:${c.x},${c.y},${c.w},${c.h}`;
        if (it?.sig !== sig) { it?.el.remove(); const el = document.createElement('div'); Object.assign(el.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', background: String(c.band), pointerEvents: 'none' });
          root.insertBefore(el, s.back.nextSibling); it = { el, sig }; s.items.set(c.id, it); }
      } else if (c.cls === 'CWindowTaskListbox') {
        // a list's rows: 16-pixel striped rows (live's Duel Log list), the chosen one lit; a row pressed is the list's
        // click at that row's game point
        const items = (c.items as string[] | undefined) ?? [], rows = Number(c.rows ?? items.length), sig = `l:${JSON.stringify(items)}:${c.selected}:${rows}`;
        let it = s.items.get(c.id);
        if (it?.sig !== sig) {
          it?.el.remove(); const el = document.createElement('div'), id = c.id, wx = w.x + c.x, wy = w.y + c.y;
          Object.assign(el.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', overflow: 'hidden' }); el.setAttribute('role', 'list');
          for (let i = 0; i < rows; i++) {
            const r = document.createElement(items[i] ? 'button' : 'div');
            Object.assign(r.style, { position: 'absolute', left: '0', top: `${16 * i}px`, width: '100%', height: '16px', margin: '0', padding: '0', border: '0', textAlign: 'left',
              background: i === c.selected ? '#3d6fd8' : i % 2 ? '#d3d6de' : '#e4e6ec', cursor: items[i] ? 'pointer' : 'default' });
            if (items[i]) { textBox(r, items[i]!, { x: 4, w: c.w - 8, color: i === c.selected ? [1, 1, 1, 1] : [0, 0, 0, 1], white: i === c.selected }); (r as HTMLButtonElement).type = 'button'; r.addEventListener('click', () => { void api.click(id, [wx + 8, wy + 16 * i + 8]); }); }
            el.append(r);
          }
          root.append(el); it = { el, sig }; s.items.set(c.id, it);
        }
      } else if (!['CWindowTaskPictureSwitch', 'CWindowTaskSlider', 'CWindowTaskButtonDuel'].includes(c.cls)) {
        // the rest (a switch, an input, a close box): main's generic renderers, the window's own fallback
        const sig = `g:${JSON.stringify([c.x, c.y, c.w, c.h, c.label, c.text, c.state, c.checked, c.value])}`; let it = s.items.get(c.id);
        if (it?.sig !== sig) {
          it?.el.remove(); const holder = document.createElement('div'); holder.style.position = 'absolute'; holder.style.inset = '0'; holder.style.pointerEvents = 'none';
          const el = renderControl(c, holder, { ...api, owned: true });
          if (!el && !/Switch|Button|Tab|Icon/.test(c.cls)) {
            // a plane or a thin frame with no renderer (the operation menu's): its box
            const d = document.createElement('div'); Object.assign(d.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px',
              background: /Frame/.test(c.cls) ? '#6c88c9' : 'rgba(255,255,255,.9)', border: /Frame/.test(c.cls) ? '2px solid #2b3f75' : '0', boxSizing: 'border-box' }); holder.append(d);
          } else if (!el) { const b = document.createElement('button'); b.type = 'button'; b.textContent = String(c.label ?? '×'); const id = c.id; b.addEventListener('click', () => { void api.click(id); });
            Object.assign(b.style, { position: 'absolute', left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', padding: '0', font: 'bold 12px Arial', lineHeight: `${c.h}px` }); holder.append(b); }
          for (const k of holder.querySelectorAll<HTMLElement>('button, input')) k.style.pointerEvents = 'auto';
          root.append(holder); it = { el: holder, sig }; s.items.set(c.id, it);
        }
      } else if (c.cls === 'CWindowTaskButtonDuel') {
        const sig = `b:${c.label}:${c.w}:${c.state}`; let it = s.items.get(c.id);
        if (it?.sig !== sig) { it?.el.remove(); const id = c.id, el = duelButton(root, { x: c.x, y: c.y, w: c.w, h: c.h, label: String(c.label ?? ''), state: c.state === 'disabled' ? 'disabled' : null });
          el.addEventListener('click', () => { void api.click(id); }); it = { el, sig }; s.items.set(c.id, it); }
      } else if (c.cls === 'CWindowTaskPictureSwitch') {
        let it = s.items.get(c.id);
        if (!it) {
          const el = document.createElement('button'); el.type = 'button'; el.className = 'opt-dlg-pick';
          Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
          const sprite = document.createElement('i'); sprite.className = 'opt-dlg-sprite'; el.append(sprite);
          if (c.label) textBox(el, String(c.label), { y: Number(c.labelY ?? 4), w: c.w, align: 1, color: [1, 1, 1, 1], white: true });
          const id = c.id, again = () => { if (s.win) optionDlgScreen.update!(s.win, null, root, api, s); };
          el.addEventListener('pointerenter', () => { s.hover = id; again(); });
          el.addEventListener('pointerleave', () => { if (s.hover === id) s.hover = 0; if (s.pressed === id) s.pressed = 0; again(); });
          el.addEventListener('pointerdown', e => { if (e.button === 0) { s.pressed = id; again(); } });
          el.addEventListener('pointerup', () => { if (s.pressed === id) { s.pressed = 0; again(); } });
          el.addEventListener('click', () => { void api.click(id); });
          root.append(el); it = { el, sig: '' }; s.items.set(c.id, it);
        }
        const el = it.el as HTMLButtonElement, art = c.art as Record<string, Sprite>, look = art[lookOf(c, s.hover === c.id, s.pressed === c.id)] ?? art.normal;
        el.disabled = !c.enabled; el.dataset.look = lookOf(c, s.hover === c.id, s.pressed === c.id);
        el.setAttribute('aria-pressed', c.checked ? 'true' : 'false');
        if (look) paint(el.firstElementChild as HTMLElement, look.tex, look.src);
      } else if (c.cls === 'CWindowTaskSlider') {
        const sl = c as Slider; let it = s.items.get(c.id);
        if (!it) {
          const el = document.createElement('div'); el.className = 'opt-dlg-slider'; el.dataset.name = c.name; el.tabIndex = 0; el.setAttribute('role', 'slider');
          Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
          const rail = document.createElement('i'), thumb = document.createElement('i'); rail.className = thumb.className = 'opt-dlg-sprite';
          el.append(rail, thumb);
          const id = c.id, again = () => { if (s.win) optionDlgScreen.update!(s.win, null, root, api, s); };
          const cur = () => s.win?.controls.find(k => k.id === id) as Slider | undefined;
          // the thumb's left edge follows the pointer (game px: the layer's own scale)
          const at = (e: PointerEvent) => { const k = cur(); if (!k) return; const r = el.getBoundingClientRect(), scale = r.width / k.w || 1;
            api.setValue(id, Math.round(((e.clientX - r.left) / scale - 8) / (k.travel / k.max))); };
          el.addEventListener('pointerenter', () => { s.hover = id; again(); });
          el.addEventListener('pointerleave', () => { if (s.hover === id) s.hover = 0; again(); });
          el.addEventListener('pointerdown', e => { if (e.button !== 0) return; s.drag = true; s.pressed = id; el.setPointerCapture?.(e.pointerId); at(e); again(); });
          el.addEventListener('pointermove', e => { if (s.drag) at(e); });
          const end = () => { if (!s.drag) return; s.drag = false; s.pressed = 0; again(); };
          el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
          el.addEventListener('keydown', e => { const k = cur(); if (!k) return;
            const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
            if (d) { e.preventDefault(); api.setValue(id, k.value + d); } });
          root.append(el); it = { el, sig: '' }; s.items.set(c.id, it);
        }
        const [rail, thumb] = it.el.children as unknown as HTMLElement[];
        Object.assign(rail!.style, { left: '0', top: sl.railY + 'px', width: sl.rail[2] + 'px', height: sl.rail[3] + 'px' }); paint(rail!, sl.tex, sl.rail);
        const t = sl.thumb[s.pressed === c.id ? 2 : s.hover === c.id ? 1 : 0]!;
        Object.assign(thumb!.style, { left: Math.round(sl.value * sl.travel / sl.max) + 'px', top: '0', width: t[2] + 'px', height: t[3] + 'px' }); paint(thumb!, sl.tex, t);
        it.el.setAttribute('aria-valuemin', '0'); it.el.setAttribute('aria-valuemax', String(sl.max)); it.el.setAttribute('aria-valuenow', String(sl.value));
        it.el.setAttribute('aria-label', 'Sound volume');
      }
    }
    for (const [id, it] of s.items) if (!seen.has(id)) { it.el.remove(); s.items.delete(id); }
  },
  unmount(root, st) { (st as State).items.clear(); root.replaceChildren(); },
};
