// main's Legacy HTML UI modules (client/web-shell/htmlui, plain ES modules: CONTRACT.md), imported in place through
// the '@htmlui' alias (vite.config.mjs, vitest.config.mjs). Only what the rewrite calls is typed here.
interface HtmlUiApi {
  click(id: number, gamePoint?: [number, number]): Promise<boolean>;
  hover(id: number): boolean;
  key(vk: number, down?: boolean): void;
  char(code: number): void;
  setText(id: number, value: string): void;
  setValue(id: number, value: number): void;
  wheel(id: number, delta: number, gamePoint?: [number, number]): boolean;
  scroll(): void;
  text(id: number): string;
  art(path: string): string;
  owned?: boolean;
  renderControl?(c: unknown, el: HTMLElement, opts?: unknown): HTMLElement | null;
  syncWindow?(root: HTMLElement, win: unknown, st: Map<number, unknown>): void;
}
interface HtmlUiScreen {
  classes: string[];
  mode?: 'pass' | 'owned';
  clip?: boolean;
  /** The root's pointer-events (bridge.js: a screen's own, else 'auto' when owned). */
  rootInput?: string;
  parts?: boolean;
  passthrough?: (x: unknown, parent?: unknown) => boolean;
  mount?(win: unknown, root: HTMLElement, api: HtmlUiApi): unknown;
  update?(win: unknown, prev: unknown, root: HTMLElement, api: HtmlUiApi, state: unknown): void;
  unmount?(root: HTMLElement, state: unknown): void;
  hide?(win: unknown, snap: unknown): number[];
  backdrop?(win: unknown, el: HTMLElement, api: HtmlUiApi, state: unknown, snap: unknown): void;
}
declare module '@htmlui/bridge.js' {
  export function makeLayer(host: HTMLElement, screens: { get(cls: string): HtmlUiScreen | undefined; has(cls: string): boolean }, art?: string):
    Promise<{ layer: HTMLElement; render(snap: unknown, owned: Set<number>, api: HtmlUiApi): void }>;
}
declare module '@htmlui/backdrop.js' {
  export function backdrop(canvas: HTMLElement): { frame(snap: { backdrop?: { shown: boolean } } | null): void };
}
declare module '@htmlui/screens/chat.js' {
  const screen: HtmlUiScreen; export default screen;
  export function owned(classes: string[], draw: (c: unknown, el: HTMLElement, api: HtmlUiApi, win: unknown) => unknown, background?: (win: unknown, el: HTMLElement) => void): HtmlUiScreen;
}
declare module '@htmlui/screens/deck.js' {
  const screen: HtmlUiScreen; export default screen;
  /** One window's drawing list: its items back to front, the holes the engine draws through, the items under them. */
  export function plan(win: unknown, editor?: boolean): { items: { id: number; z: number; rect: { x: number; y: number; w: number; h: number }; draw(el: HTMLElement): void }[];
    holes: { z: number; rect: { x: number; y: number; w: number; h: number } }[]; co: number[] };
  /** The deck scene's brushed-metal ground (CDeckScene's deck_bg_01 as CSS): Card Swap's too. */
  export function deckBackdrop(el: HTMLElement): HTMLElement;
}
declare module '@htmlui/screens/*.js' { const screen: HtmlUiScreen; export default screen; }
declare module '@htmlui/mock/*.json' {
  const snapshot: { windows: { cls: string; x: number; y: number; w: number; h: number; controls: Record<string, unknown>[] }[] };
  export default snapshot;
}
