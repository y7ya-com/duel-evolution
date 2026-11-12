// live's connection note (client/web-shell/loader.js, on a drop of the game's /net socket): no dialog and no veil, a
// small dark box at the page's bottom right, "Connection lost: reconnecting…" ("…reconnecting to the duel…" in a duel's
// scenes), there while the game reconnects in place and gone once it is back, never sooner than 1.5 s after the drop.
// The same element and style as loader.js's note, on <body>.
export const NET_NOTE_STYLE = 'position:fixed;right:12px;bottom:12px;z-index:7;box-sizing:border-box;max-width:300px;padding:10px 12px;' +
  'border-radius:10px;background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.35 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.6)';
export const netNoteText = (duel: boolean): string => duel ? 'Connection lost: reconnecting to the duel…' : 'Connection lost: reconnecting…';
const SHOWN_AT_LEAST_MS = 1500;

export class NetNote {
  private note: HTMLElement | null = null;
  private since = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly now: () => number = () => Date.now()) {}
  /** The connection's state now: reconnecting (in a duel or not), or back. */
  set(reconnecting: boolean, duel: boolean): void {
    if (reconnecting) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (!this.note) {
        if (typeof document === 'undefined' || !document.body) return;
        this.since = this.now();
        const n = this.note = document.createElement('div');
        n.setAttribute('role', 'status'); n.dataset.key = 'net-reconnecting'; n.style.cssText = NET_NOTE_STYLE;
        document.body.append(n);
      }
      // the drop's own text (loader.js sets it once, on the drop)
      if (!this.note.textContent) this.note.textContent = netNoteText(duel);
      return;
    }
    if (!this.note || this.timer) return;
    const left = this.since + SHOWN_AT_LEAST_MS - this.now();
    if (left <= 0) this.remove(); else this.timer = setTimeout(() => { this.timer = null; this.remove(); }, left);
  }
  private remove(): void { this.note?.remove(); this.note = null; }
  dispose(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; this.remove(); }
}
