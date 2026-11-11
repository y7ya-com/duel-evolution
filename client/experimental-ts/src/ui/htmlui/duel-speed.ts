// The duel speed button, as main's client/web-shell/duelspeed.js puts it on live: a page element, not one of the
// 1024×768 screen's windows. It sits in the PAGE's top right corner (8 px in, beside the page's full-screen button when
// there is one: right 8 + 40), so on a desktop wider than 4:3 it stands in the margin beside the game, never on it; its
// look is the game's swich_01 9-slice (main's ui.js) at the canvas's whole-step scale. Shown in the duel scenes
// (duelspeed.js DUEL: janken, the duel, its end and the result); a click cycles 1× → 1.5× → 2×.
import { DUEL_SPEEDS, loadDuelSpeed, nextDuelSpeed } from './duel-dialogs';

const W = 48, H = 24, FONT = 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif';
type Tile = { src(x: number, y: number): void };
interface UiModule { loadGlyphs(base?: string): Promise<unknown>; nine(parent: HTMLElement, sheet: unknown, ox: number, oy: number, x: number, y: number, w: number, h: number): Tile[]; SHEET: { button: unknown } }

export class DuelSpeedButton {
  speed = loadDuelSpeed();
  private btn: HTMLButtonElement | null = null;
  private cap: HTMLSpanElement | null = null;
  private loading: Promise<void> | null = null;
  private shown = false;
  private disposed = false;
  constructor(private readonly deps: { stage(): HTMLElement | null; changed(speed: number): void }) {}

  /** Show or hide it (the duel scenes); its first showing builds it. */
  show(on: boolean): void {
    if (this.disposed || typeof document === 'undefined') return;
    this.shown = on;
    if (on && !this.btn) { this.loading ??= this.make().catch(e => console.warn('duelspeed:', e)); void this.loading.then(this.place); }
    else this.place();
  }
  private title(): string { return `Duel speed: ${this.speed}×${this.speed === 1 ? ' (original)' : ''}. Click to change`; }
  private async make(): Promise<void> {
    const ui = await import('@html-ui/ui.js') as unknown as UiModule;
    await ui.loadGlyphs(new URL('/ui/', location.href).href);
    if (this.disposed) return;
    if (!document.getElementById('de-duelspeed-css')) {
      const css = document.createElement('style'); css.id = 'de-duelspeed-css';
      css.textContent = `
        #duelspeed { position:fixed; z-index:60000; top:max(8px, env(safe-area-inset-top)); width:${W}px; height:${H}px;
                     padding:0; border:0; background:none; cursor:pointer; transform-origin:top right; }
        #duelspeed[hidden] { display:none; }
        #duelspeed .sp { position:absolute; overflow:hidden; pointer-events:none; }
        #duelspeed .sp > b { position:absolute; left:0; top:0; transform-origin:0 0; }
        #duelspeed .cap { position:absolute; left:0; top:${(H - 16) / 2}px; width:${W}px; text-align:center;
                          font:14.3px/16px ${FONT}; color:#000; pointer-events:none; white-space:pre; }`;
      document.head.append(css);
    }
    const btn = document.createElement('button'); btn.id = 'duelspeed'; btn.type = 'button'; btn.tabIndex = -1;
    btn.dataset.key = 'duel-speed';
    const tiles = ui.nine(btn, ui.SHEET.button, 0, 0, 0, 0, W, H);
    const set = (st: number) => tiles.forEach((t, i) => t.src(st * 24 + (i % 3) * 8, Math.floor(i / 3) * 8));   // 0 normal 1 hover 2 pressed
    const cap = document.createElement('span'); cap.className = 'cap'; btn.append(cap); this.cap = cap;
    let over = false, down = false;
    const look = () => set(down && over ? 2 : over ? 1 : 0);
    btn.addEventListener('pointerenter', () => { over = true; look(); });
    btn.addEventListener('pointerleave', () => { over = down = false; look(); });
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); down = true; look(); });
    btn.addEventListener('pointerup', () => { down = false; look(); });
    btn.addEventListener('click', e => { e.stopPropagation(); this.speed = nextDuelSpeed(this.speed); this.label(); this.deps.changed(this.speed); });
    document.body.append(btn); this.btn = btn; this.label();
    addEventListener('resize', this.place);
    document.addEventListener('fullscreenchange', this.place);
  }
  private label(): void {
    if (!this.btn || !this.cap) return;
    this.cap.textContent = `${this.speed}×`; this.btn.title = this.title(); this.btn.setAttribute('aria-label', this.btn.title);
  }
  /** Beside the page's full-screen button (or in its place where there is none), at the stage's whole-step scale. */
  private place = (): void => {
    const btn = this.btn; if (!btn) return;
    const k = (this.deps.stage()?.getBoundingClientRect().width || 1024) / 1024, fs = document.getElementById('de-fs');
    btn.style.right = fs && !fs.hidden ? 'calc(max(8px, env(safe-area-inset-right)) + 40px)' : 'max(8px, env(safe-area-inset-right))';
    btn.style.transform = `scale(${Math.max(1, Math.floor(k))})`;   // whole steps: a fractional scale seams the 9-slice
    btn.hidden = !this.shown;
  };
  dispose(): void {
    this.disposed = true; this.btn?.remove(); this.btn = null;
    if (typeof removeEventListener === 'function') removeEventListener('resize', this.place);
    globalThis.document?.removeEventListener('fullscreenchange', this.place);
  }
}
export { DUEL_SPEEDS };
