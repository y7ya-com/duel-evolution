// A touch tap on main's screens: a finger down and up without moving clicks the control under it exactly once.
// The browser's own click after a tap is not to be trusted here: main's pass-mode screens (duel.js's dialogs, result.js,
// avatar.js, shop.js, trade.js) redraw a control on each look, so the hover a finger's pointerover gives and the
// pressed look its pointerdown gives replace the element the finger is on. The release then goes to an element no
// longer in the page (a touch pointer is captured by the element it went down on), the host never hears it, and the
// browser's click lands on the elements' common ancestor or nowhere. So the layer takes a touch tap itself: on the
// release it clicks the element under the finger (the control's current element) once, and the browser's own click
// for that tap, when one follows, is dropped. Text fields keep the browser's own tap (focus, the soft keyboard).
export interface TapPointer { pointerId: number; pointerType: string; button: number; clientX: number; clientY: number; target: EventTarget | null }
export interface TapEnv {
  /** The element under a point (document.elementFromPoint). */
  at(x: number, y: number): Element | null;
  /** Inside the layer's host. */
  inside(el: Element): boolean;
  /** Clicks this element at that point (the layer's own click: one event the screen's listeners and the layer hear). */
  click(el: Element, x: number, y: number): void;
  now(): number;
}
/** How far a finger may move and still tap (CSS px), and how long the browser's own click may lag the release. */
export const TAP_SLOP = 10, TAP_CLICK_WINDOW_MS = 800;
const TYPED = /^(INPUT|TEXTAREA|SELECT)$/;
const typed = (el: Element | null): boolean => {
  for (let e = el; e; e = e.parentElement) { if (TYPED.test(e.tagName) || (e as HTMLElement).isContentEditable) return true; }
  return false;
};

export class TouchTaps {
  private down: { id: number; x: number; y: number; target: Element | null; moved: boolean } | null = null;
  private swallow: { until: number; x: number; y: number } | null = null;
  private clicking = false;
  constructor(private env: TapEnv) {}
  /** A touch going down in the host: a tap begins. Any other pointer ends a pending swallow (a mouse is not a finger). */
  pointerDown(e: TapPointer): void {
    if (e.pointerType !== 'touch') { this.swallow = null; this.down = null; return; }
    if (e.button !== 0 && e.button !== -1) return;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target instanceof Element ? e.target : null, moved: false };
  }
  pointerMove(e: TapPointer): void {
    const d = this.down; if (!d || e.pointerId !== d.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) d.moved = true;
  }
  pointerCancel(e: TapPointer): void { if (this.down?.id === e.pointerId) this.down = null; }
  /** The finger lifts: true when this was a tap the layer clicked (the caller then skips its own release handling). */
  pointerUp(e: TapPointer): boolean {
    const d = this.down; if (!d || e.pointerId !== d.id || e.pointerType !== 'touch') return false;
    this.down = null;
    if (d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return false;
    // the element under the finger now (the control's current element); else the one it went down on, if still shown
    let el = this.env.at(e.clientX, e.clientY);
    if (!el || !this.env.inside(el)) el = d.target && d.target.isConnected && this.env.inside(d.target) ? d.target : null;
    if (!el || typed(el)) return false;
    this.swallow = { until: this.env.now() + TAP_CLICK_WINDOW_MS, x: e.clientX, y: e.clientY };
    this.clicking = true;
    try { this.env.click(el, e.clientX, e.clientY); } finally { this.clicking = false; }
    return true;
  }
  /** A click reaching the page (window, capture): false when it is the browser's own click for a tap already clicked
   * (the caller stops it). The layer's own click passes. */
  pass(e: { clientX: number; clientY: number }): boolean {
    if (this.clicking) return true;
    const s = this.swallow; if (!s) return true;
    if (this.env.now() > s.until) { this.swallow = null; return true; }
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP * 3) return true;
    this.swallow = null;   // one browser click per tap
    return false;
  }
  /** While the layer's own tap click runs. */
  get active(): boolean { return this.clicking; }
}
