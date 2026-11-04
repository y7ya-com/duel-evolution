/** The original lobby menu bar (CMenubar: the Menu, Duel and Move keys and the message strip) and the Main Menu
 * window (CMainMenu: a title bar over a column of yellow menu keys) in place of a page navigation bar. The caller
 * builds the entries (their labels, data keys and disabled states stay its own); this module only arranges them. */
type Lease = { url: string; release(): void };
export type LoadArchiveImage = (path: string, signal: AbortSignal) => Promise<Lease>;
/** The menubar keys' picture: 80 x 32 cells, columns normal / hover / its window open; rows Menu, Duel, (Duel), Move. */
export const MENU_ICON_PATH = 'data/common/window/menuicon_02_c01.png';

export interface MenuBarView {
  /** The Main Menu's entries, in order. */
  items: readonly HTMLButtonElement[];
  /** The message strip's content (connection, player and status). */
  status: HTMLElement;
  /** The lobby's own keys: Duel opens the duel rooms, Move the area list. */
  world?: { duel?: () => void; move?: () => void };
}

export class MenuBar {
  private open = false;
  private lease: Lease | null = null;
  private readonly abort = new AbortController();
  private toggle: HTMLButtonElement | null = null;
  private window: HTMLElement | null = null;
  constructor(private readonly host: HTMLElement, load?: LoadArchiveImage) {
    if (load) void load(MENU_ICON_PATH, this.abort.signal).then(lease => {
      if (this.abort.signal.aborted || !/^(blob:|data:image\/|https?:)/.test(lease.url)) { lease.release(); return; }
      this.lease = lease; this.host.style.setProperty?.('--de-menu-icons', `url("${lease.url.replaceAll('"', '%22')}")`); this.host.dataset.menuArt = 'true';
    }).catch(() => { /* the keys keep their drawn captions */ });
  }
  get isOpen(): boolean { return this.open; }
  render(nav: HTMLElement, view: MenuBarView): void {
    nav.replaceChildren();
    const keys = document.createElement('div'); keys.className = 'de-menubar-keys';
    const toggle = key('menu', 'Menu', 'Main Menu', 'main-menu'); this.toggle = toggle;
    toggle.setAttribute('aria-haspopup', 'true'); toggle.setAttribute('aria-controls', 'de-main-menu');
    toggle.onclick = () => this.setOpen(!this.open, true);
    keys.append(toggle);
    if (view.world) {
      const duel = key('duel', 'Duel', 'Duel Menu', 'menubar-duel'), move = key('move', 'Move', 'Move', 'menubar-move');
      duel.disabled = !view.world.duel; move.disabled = !view.world.move;
      duel.onclick = () => { this.setOpen(false); view.world?.duel?.(); };
      move.onclick = () => { this.setOpen(false); view.world?.move?.(); };
      keys.append(duel, move);
    }
    const strip = document.createElement('div'); strip.className = 'de-menubar-message'; strip.append(view.status);
    const menu = document.createElement('section'); menu.className = 'de-main-menu'; menu.id = 'de-main-menu'; menu.hidden = !this.open;
    menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Main Menu'); this.window = menu;
    const bar = document.createElement('div'), heading = document.createElement('h2'), close = document.createElement('button');
    bar.className = 'de-window-title'; heading.textContent = 'Main Menu';
    close.type = 'button'; close.className = 'de-close-box'; close.dataset.key = 'main-menu-close'; close.setAttribute('aria-label', 'Close Main Menu');
    close.onclick = () => this.setOpen(false, true);
    bar.append(heading, close);
    const list = document.createElement('div'); list.className = 'de-main-menu-keys';
    for (const item of view.items) {
      if (!/\bde-menu-key\b/.test(item.className)) item.className = `${item.className} de-menu-key`.trim();
      item.addEventListener('click', () => { if (!item.disabled) this.setOpen(false); });
      list.append(item);
    }
    menu.append(bar, list);
    menu.onkeydown = event => {
      const enabled = Array.from(list.querySelectorAll('button')).filter(b => !b.disabled), at = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (step) { event.preventDefault(); enabled[(at + step + enabled.length) % enabled.length]?.focus(); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); enabled[event.key === 'Home' ? 0 : enabled.length - 1]?.focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.setOpen(false, true); }
    };
    toggle.setAttribute('aria-expanded', String(this.open)); toggle.dataset.open = String(this.open);
    nav.append(keys, strip, menu);
  }
  /** Escape anywhere in the client closes an open Main Menu first. */
  escape(): boolean { if (!this.open) return false; this.setOpen(false, true); return true; }
  dispose(): void { this.abort.abort(); this.lease?.release(); this.lease = null; this.toggle = this.window = null; this.host.style.removeProperty?.('--de-menu-icons'); delete this.host.dataset.menuArt; }
  private setOpen(open: boolean, focus = false): void {
    this.open = open;
    if (this.window) this.window.hidden = !open;
    if (this.toggle) { this.toggle.setAttribute('aria-expanded', String(open)); this.toggle.dataset.open = String(open); }
    if (!focus) return;
    if (open) Array.from(this.window?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(b => !b.disabled && b.dataset.key !== 'main-menu-close')?.focus({ preventScroll: true });
    else this.toggle?.focus({ preventScroll: true });
  }
}

/** A menubar key: the original picture when it is loaded, else its caption drawn by CSS. The caption is not text
 * content, so the key's name (its aria-label) never collides with an entry of the same word. */
function key(kind: 'menu' | 'duel' | 'move', caption: string, name: string, dataKey: string): HTMLButtonElement {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'de-menubar-key'; b.dataset.kind = kind; b.dataset.key = dataKey;
  b.dataset.caption = caption; b.setAttribute('aria-label', name);
  return b;
}
