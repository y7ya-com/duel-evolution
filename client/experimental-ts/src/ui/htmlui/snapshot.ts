// The rewrite as main's engine, for main's Legacy HTML UI (client/web-shell/htmlui, CONTRACT.md): its screens draw a
// plain-object Snapshot of each window, so the rewrite builds those snapshots itself from its own state. A window's
// layout comes from a template (a window main captured from the game, mock/*.json in the repo, or layout numbers
// derived from main's captures); the rewrite fills its texts, rows, states and values. Pure: no DOM here.

/** A control as CONTRACT.md's Snapshot has it (base fields plus its family's). */
export interface HtmlControl {
  id: number; cls: string; name: string; parent: number;
  x: number; y: number; w: number; h: number; z: number; alpha: number;
  shown: boolean; enabled: boolean; focused: boolean;
  [field: string]: unknown;
}
export interface HtmlWindow {
  id: number; cls: string; x: number; y: number; w: number; h: number; z: number; wz: number;
  drawn: { x: number; y: number; w: number; h: number } | null; alpha: number; shown: boolean;
  modal: boolean; topmost: boolean; active: boolean; controls: HtmlControl[]; extras: { id: number; cls: string }[];
  [field: string]: unknown;
}
export interface HtmlSnapshot { v: 1; frame: number; scene: number; mouse: null; focus: number; windows: HtmlWindow[]; tasks: HtmlWindow[]; cursor: null; backdrop?: { shown: boolean; ids: number[] }; /** main's read/chat.js: the avatars All Chat's bubbles stand over. */ chatAvatars?: { pid: number; name: string; x: number; y: number }[] }

/** What a control does in the rewrite: the api calls main's screens make, mapped to ClientApp commands. */
export interface ControlHandlers {
  /** api.click: a button, a tab, a row (a list's row: the game point main's screen presses, its row's centre). */
  click?(gamePoint?: [number, number]): void;
  /** api.setText: an input's value (every edit). */
  text?(value: string): void;
  /** api.char(13) while it has the focus: an input's Enter. */
  enter?(): void;
  /** api.setValue: a scroll bar's value (the Move list's wheel). */
  value?(v: number): void;
  /** The pointer came over it (a pass-mode window's control: its element took the pointer, layer.ts onOver). */
  over?(): void;
  /** data-key and aria-label put on the element main's screen draws for it (tests and assistive technology). */
  key?: string; label?: string;
  /** Whether the pointer gives it hover / pressed looks (buttons, tabs, icons). */
  hover?: boolean;
  /** api.wheel: a notch on a list (main's native scrollers wheel the engine's list a line at a time). */
  wheel?(delta: number): void;
  /** The pointer came over it (true) or left it (false): what the engine does on mouse-over (the shop's description). */
  pointer?(over: boolean): void;
  /** The engine's hover by the point: the pointer over its rect counts as over it even where main's screen lets the
   * pointer through to the engine's canvas (the shop's pack art: a picture the engine draws over the price plate). */
  area?: boolean;
}
export interface WindowSpec { win: HtmlWindow; handlers: Map<number, ControlHandlers>; /** after each draw: what the rewrite adds in the window's own root */ after?: (root: HTMLElement) => void }
/** The topmost control flagged `area` whose rect (game px) holds the point, shown and with a pointer handler. */
export function areaAt(specs: readonly WindowSpec[], x: number, y: number): number {
  for (let i = specs.length - 1; i >= 0; i--) {
    const { win: w, handlers } = specs[i]!;
    for (const c of w.controls) {
      if (c.shown === false || !handlers.get(c.id)?.area) continue;
      const cx = w.x + c.x, cy = w.y + c.y;
      if (x >= cx && x < cx + c.w && y >= cy && y < cy + c.h) return c.id;
    }
  }
  return 0;
}


/** Stable ids per key (a guest address in the game): the screens key their DOM by id, so a control keeps its element
 * (and an input its focus) from one snapshot to the next. Multiples of 8, as addresses are. */
export class Ids {
  private map = new Map<string, number>(); private next = 0x1000000;
  of(key: string): number { let id = this.map.get(key); if (id === undefined) { id = this.next; this.next += 8; this.map.set(key, id); } return id; }
}

const BUTTONS = /^CWindowTask(TextSwitch|Switch|ButtonMain|ButtonDuel|PictureSwitch|ResultNext|Tab|Icon(Hide|Show|Expand|Shrink))$/;
/** Controls the pointer gives a hover / pressed look (the engine's CWindowTaskSwitch family, the tabs and icons). */
export const hoverable = (c: HtmlControl): boolean => BUTTONS.test(c.cls);

/** One window under construction: its controls added in draw order, each with its handlers. */
export class WindowBuilder {
  readonly win: HtmlWindow; readonly handlers = new Map<number, ControlHandlers>();
  constructor(private ids: Ids, readonly key: string, cls: string, rect: { x: number; y: number; w: number; h: number }, fields: Partial<HtmlWindow> = {}) {
    this.win = { id: ids.of(key), cls, ...rect, z: 0, wz: 0, drawn: { ...rect }, alpha: 1, shown: true, modal: false, topmost: false, active: true, controls: [], extras: [], ...fields };
  }
  /** A control at window-local x, y (CONTRACT.md fields; `name` doubles as its key in the window). */
  add(cls: string, name: string, rect: { x: number; y: number; w: number; h: number }, fields: Record<string, unknown> = {}, handlers?: ControlHandlers): HtmlControl {
    const c: HtmlControl = { id: this.ids.of(`${this.key}/${name}`), cls, name, parent: 0, ...rect, z: this.win.controls.length, alpha: 1, shown: true, enabled: true, focused: false, ...fields };
    this.win.controls.push(c);
    if (handlers) { this.handlers.set(c.id, handlers); if (handlers.hover === undefined && hoverable(c)) handlers.hover = true; }
    return c;
  }
  /** A captured window's controls (main's mock/*.json), re-keyed to this window: top-level controls only, unless kept. */
  fromTemplate(template: { controls: Record<string, unknown>[] }, keepChildren = false): HtmlControl[] {
    const byOld = new Map<number, number>(), out: HtmlControl[] = [];
    for (const raw of template.controls) {
      const c = structuredClone(raw) as unknown as HtmlControl;
      if (c.parent && !keepChildren) continue;
      const id = this.ids.of(`${this.key}/t${c.id}`); byOld.set(c.id, id); c.id = id; out.push(c);
    }
    for (const c of out) c.parent = c.parent ? byOld.get(c.parent) ?? 0 : 0;
    this.win.controls.push(...out);
    return out;
  }
  on(c: HtmlControl, handlers: ControlHandlers): HtmlControl { this.handlers.set(c.id, handlers); if (handlers.hover === undefined && hoverable(c)) handlers.hover = true; return c; }
  spec(): WindowSpec { return { win: this.win, handlers: this.handlers }; }
}

/** The pointer's looks on the snapshot (the engine sets them in each switch's onMain): hover over the control under
 * the pointer, pressed while the button is held on it; a disabled control keeps 'disabled'. */
export function applyPointer(specs: readonly WindowSpec[], hover: number, pressed: number, looks: (win: HtmlWindow) => boolean = () => true): void {
  for (const { win, handlers } of specs) if (looks(win)) {
    // a swf button tracks the game's mouse itself (the shop's pills, read/shop.js `mouse`): the point of the hovered one
    if ('mouse' in win) { const at = win.controls.find(c => c.id === hover && Array.isArray(c.mouseAt))?.mouseAt as number[] | undefined; win.mouse = at ? [at[0], at[1], pressed === hover ? 1 : 0] : null; }
    for (const c of win.controls) {
      if (!handlers.get(c.id)?.hover || !('state' in c) && !c.cls.includes('Tab') && !c.cls.includes('Icon')) continue;
      if (c.cls.includes('Icon')) { c.pressed = c.id === pressed; continue; }
      if (c.state === 'disabled' || !c.enabled) continue;
      c.state = c.id === pressed ? 'pressed' : c.id === hover ? 'hover' : 'normal';
      // a picture switch shows one of its four sprites (CWindowTaskPictureSwitch): pressed, checked, hover, normal
      const art = c.art as Record<string, { shown: boolean } | null> | undefined;
      if (art) { const look = c.state === 'pressed' ? 'pressed' : c.checked ? 'checked' : c.state === 'hover' ? 'hover' : 'normal'; for (const [k, v] of Object.entries(art)) if (v) v.shown = k === look; }
    }
  }
}

/** '1' -> 'Lv01': the level as Select Player shows it (main's capture: 'Lv01'). */
export const levelText = (level: number | undefined): string => level === undefined ? '' : `Lv${String(Math.max(0, Math.min(99, Math.trunc(level)))).padStart(2, '0')}`;
