// The scene-load overlay (live: client/web-shell/loader.js on the runtime's scene "begin"/"end"): the menu backdrop
// with the menu_mark_a01 ring movie and "Loading…", faded in only when a load outlasts the game's own fade (0.35 s),
// with a Reload button after 45 s. loader.js drives the engine's canvas and Module, so the rewrite draws the same look
// itself: the ring is the start screens' StartScene logo (the same movie), the backdrop the original's abmake_bg
// pair from the archive. Pointer-transparent except Reload.
import { StartScene } from './start-scene';
import type { ArchiveLoader } from '../duel-fx';

export const SHOW_AFTER_MS = 350;
export const STUCK_MS = 45_000;

export interface SceneLoadEvents { begin(name: string): () => void }

/** Times scene loads (cold vs warm in the dev log) and tells the overlay when one is slow. */
export class SceneLoadTracker implements SceneLoadEvents {
  private readonly active = new Map<number, { name: string; at: number }>();
  private id = 0;
  constructor(private readonly onChange: (loading: string | null, since: number) => void, private readonly log?: (name: string, ms: number) => void, private readonly now: () => number = () => performance.now()) {}
  get loading(): string | null { const first = this.active.values().next(); return first.done ? null : first.value.name; }
  begin(name: string): () => void {
    const id = ++this.id, at = this.now();
    this.active.set(id, { name, at });
    if (this.active.size === 1) this.onChange(name, at);
    return () => {
      if (!this.active.delete(id)) return;
      this.log?.(name, this.now() - at);
      if (!this.active.size) this.onChange(null, 0);
    };
  }
  track<T>(name: string, work: Promise<T>): Promise<T> { const end = this.begin(name); void work.then(end, end); return work; }
}

export class SceneLoadingOverlay {
  readonly element: HTMLDivElement;
  private ring: StartScene | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly status: HTMLDivElement;
  private button: HTMLButtonElement | null = null;
  private backdrop = false;
  constructor(private readonly load: ArchiveLoader | null, private readonly reducedMotion: () => boolean = () => false, private readonly reload: () => void = () => location.reload()) {
    const box = this.element = document.createElement('div');
    box.className = 'de-scene-loading'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); box.hidden = true;
    Object.assign(box.style, { position: 'absolute', inset: '0', zIndex: '50', pointerEvents: 'none', opacity: '0', transition: 'opacity .15s ease-out .35s',
      background: '#0b1d3a', backgroundSize: '100% 100%', containerType: 'size' });
    this.status = document.createElement('div');
    Object.assign(this.status.style, { position: 'absolute', left: '0', right: '0', top: '82%', textAlign: 'center', color: '#fff',
      font: '600 2.1cqh/1.2 system-ui, sans-serif', textShadow: '0 1px 3px rgba(0,0,0,.6)', letterSpacing: '.02em' });
    this.status.textContent = 'Loading…';
    box.append(this.status);
  }
  /** loading: the scene being loaded, or null when done. */
  set(loading: string | null): void {
    if (loading) {
      if (this.showTimer || !this.element.hidden) return;
      // Fast loads (warm caches) never flash the overlay.
      this.showTimer = setTimeout(() => { this.showTimer = null; this.show(); }, SHOW_AFTER_MS);
      return;
    }
    if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
    this.hide();
  }
  private show(): void {
    const box = this.element;
    this.paintBackdrop();
    if (this.load && !this.ring) { this.ring = new StartScene(this.load); box.prepend(this.ring.element); }
    this.ring?.show({ logo: true, portrait: null, reducedMotion: this.reducedMotion() });
    this.status.textContent = 'Loading…';
    box.hidden = false; void box.offsetWidth; box.style.opacity = '1';
    this.stuckTimer = setTimeout(() => this.showStuck(), STUCK_MS - SHOW_AFTER_MS);
  }
  private hide(): void {
    if (this.stuckTimer) { clearTimeout(this.stuckTimer); this.stuckTimer = null; }
    this.button?.remove(); this.button = null;
    this.ring?.show({ logo: false, portrait: null, reducedMotion: true });
    this.element.style.opacity = '0'; this.element.hidden = true;
  }
  private paintBackdrop(): void {
    if (this.backdrop || !this.load) return; this.backdrop = true;
    const signal = new AbortController().signal, box = this.element;
    // abmake_bg_02's checker over abmake_bg_01 (loader.js: bg_01 at 2x under the 256 px checker).
    void Promise.all(['data/menu/abmake_bg_02.png', 'data/menu/abmake_bg_01.png'].map(p => this.load!(p, signal).catch(() => null))).then(([checker, base]) => {
      const layers = [checker && `url("${checker.url}") 0 0 / 25% auto repeat`, base && `url("${base.url}") 0 0 / 100% 100% no-repeat`].filter(Boolean);
      if (layers.length) box.style.background = layers.join(', ') + ', #0b1d3a';
    });
  }
  private showStuck(): void {
    this.stuckTimer = null;
    this.status.textContent = 'This is taking longer than usual.';
    const b = this.button = document.createElement('button');
    b.type = 'button'; b.textContent = 'Reload';
    Object.assign(b.style, { position: 'absolute', left: '50%', top: '88%', transform: 'translateX(-50%)', pointerEvents: 'auto',
      font: '600 2cqh system-ui, sans-serif', padding: '.4em 1.4em', border: '0', borderRadius: '999px', background: '#fff', color: '#123', cursor: 'pointer' });
    b.onclick = () => this.reload();
    this.element.append(b);
  }
  dispose(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    if (this.stuckTimer) clearTimeout(this.stuckTimer);
    this.ring?.dispose(); this.element.remove();
  }
}
