// The title's OPTIONS window (COptionDlg) as the engine draws it on live: main's Legacy UI never drew it (the engine
// does, over the title), so the rewrite draws it from the original art like the engine: the window's picture
// (option_dai_01_c01), each picture switch's sprite for its look (normal, hover, pressed, checked: CWindowTaskPictureSwitch),
// the volume slider's rail and thumb (option_icon_01_c00), the white 16-pixel texts and the OK / Cancel captions (main's
// textBox, as every other window's text). Its snapshot is options.ts titleOptionsWindow; registered in layer.ts EXTRA.
import { textBox } from '@htmlui/controls/basic.js';
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
  classes: ['COptionDlg'],
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
    paint(s.back, String(w.back ?? ''), [0, 0]);
    const seen = new Set<number>();
    for (const c of w.controls) {
      if (c.parent || !c.shown) continue;
      seen.add(c.id);
      if (c.cls === 'CWindowTaskText') {
        const sig = `t:${c.text}`; let it = s.items.get(c.id);
        if (it?.sig !== sig) { it?.el.remove(); const el = document.createElement('div'); el.className = 'opt-dlg-text'; el.dataset.name = c.name; Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
          textBox(el, String(c.text ?? ''), { w: c.w, align: Number(c.align ?? 1), px: Number(c.fontSize ?? 16), color: c.color as number[], white: true }); root.append(el); it = { el, sig }; s.items.set(c.id, it); }
      } else if (c.cls === 'CWindowTaskPictureSwitch') {
        let it = s.items.get(c.id);
        if (!it) {
          const el = document.createElement('button'); el.type = 'button'; el.className = 'opt-dlg-pick';
          Object.assign(el.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
          const sprite = document.createElement('i'); sprite.className = 'opt-dlg-sprite'; el.append(sprite);
          if (c.label) textBox(el, String(c.label), { y: 4, w: c.w, align: 1, color: [1, 1, 1, 1], white: true });
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
