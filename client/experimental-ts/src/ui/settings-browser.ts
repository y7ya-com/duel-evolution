/** Fullscreen is presentation state owned by the browser, never saved game state. */
export interface FullscreenState { supported: boolean; active: boolean; pending: boolean; error: string | null; }
export interface FullscreenAdapter {
  supported(): boolean;
  active(): boolean;
  request(): Promise<void>;
  exit(): Promise<void>;
  subscribe(change: () => void, refused: () => void): () => void;
}
const unsupported = 'Fullscreen is unavailable here. Open the game in a browser tab, or allow fullscreen in the embedding page.';
function refused(exiting: boolean): string { return exiting ? 'Could not leave fullscreen. Press Escape or use your browser’s fullscreen control.' : 'Fullscreen was refused. Click Enter Fullscreen again, or open the game in a browser tab with fullscreen permission.'; }

export function browserFullscreenAdapter(target: HTMLElement, page: Document = document): FullscreenAdapter {
  return {
    supported: () => page.fullscreenEnabled === true && typeof target.requestFullscreen === 'function' && typeof page.exitFullscreen === 'function',
    active: () => page.fullscreenElement === target,
    request: () => target.requestFullscreen(),
    exit: () => page.exitFullscreen(),
    subscribe: (change, failed) => {
      if (typeof page.addEventListener !== 'function') return () => {};
      page.addEventListener('fullscreenchange', change); page.addEventListener('fullscreenerror', failed);
      return () => { page.removeEventListener('fullscreenchange', change); page.removeEventListener('fullscreenerror', failed); };
    },
  };
}

/** toggle() must be called directly from a trusted click; it invokes the API synchronously.
 * Constructing, restoring settings, and disposing never request or force fullscreen. */
export class BrowserDisplaySettings {
  private pending = false;
  private error: string | null = null;
  private exiting = false;
  private closed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly adapter: FullscreenAdapter, private readonly changed: () => void = () => {}) {
    this.unsubscribe = adapter.subscribe(() => { if (!this.closed) { this.error = null; this.changed(); } }, () => { if (!this.closed && this.pending) { this.error = refused(this.exiting); this.changed(); } });
  }
  get state(): FullscreenState { return { supported: this.adapter.supported(), active: this.adapter.active(), pending: this.pending, error: this.error }; }
  get unavailableMessage(): string { return unsupported; }
  async toggle(): Promise<void> {
    if (this.closed || this.pending) return;
    if (!this.adapter.supported()) { this.error = unsupported; this.changed(); return; }
    this.exiting = this.adapter.active(); this.pending = true; this.error = null; this.changed();
    try { await (this.exiting ? this.adapter.exit() : this.adapter.request()); }
    catch { if (!this.closed) this.error = refused(this.exiting); }
    finally { if (!this.closed) { this.pending = false; this.changed(); } }
  }
  dispose(): void { if (!this.closed) { this.closed = true; this.pending = false; this.unsubscribe(); } }
}
