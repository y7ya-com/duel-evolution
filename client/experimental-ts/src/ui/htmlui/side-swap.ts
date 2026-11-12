// Card Swap between a match's games (CCardSwapScene: its members a CWindowModelDeck, a CCardDetailViewDlg, a swap icon,
// an OK dialog and a CJankenTimer), as live shows it (de-scratch/duelwin/live/end/b-16.png, captured from a real match):
// the deck screen's left column (the "CARD SWAP" strip, LOAD / SAVE / STRUCTURE / CLEAR DECK greyed, EXIT lit) with the
// card detail under it, the Deck window (its counts, Main / Fusion tabs, the main grid, the Side row) cut to stop at the
// chat window (its Side band at y 480, the side cards 512..600), no trunk, and the side deck clock at the top right (a
// pink plate, 880..1020 x 0..32: an hourglass and mm:ss). A card is moved by a double-click / right-click (main <->
// side: the original's "Return card to Side Deck." / "Return card to Main Deck.") or dragged onto the other grid; EXIT
// takes the deck into the next game, once its Main and Side counts are the original's. At 0:00 the server goes on with
// the deck it has. Built from the deck editor's own windows (deck.ts), drawn by main's deck module; the cards and the
// mouse are the deck screen's card layer (deck-dom.ts, its own instance).
import type { CardView, DeckView } from '../contracts';
import { sideboardDifference } from '../deck';
import { attrOf, deckUi, deckWindow, detailWindow, isMonster, raceOf, type DeckFrom } from './deck';
import type { DeckDomScene, PowerIcons } from './deck-dom';
import { cardSwapMenu } from './card-swap-menu';
import { peekTable } from '@htmlui/crafting/cards.js';
import { WindowBuilder, type HtmlWindow, type Ids, type WindowSpec } from './snapshot';

export interface SideSwapState { deck: DeckView; original: DeckView; round: number; deadline?: number | null; ready: boolean; error?: string }
export interface SideSwapDeps {
  card(passcode: number): CardView | undefined;
  move(passcode: number, from: 'main' | 'side', index: number): void;
  submit(): void;
  rerender(): void;
  /** A refusal to say (the deck screen's OK dialog). */
  notice(text: string): void;
  now?(): number;
}
/** The Card Swap windows are marked so the deck editor's card layer leaves them to Card Swap's own. */
export const isSideSwap = (w: HtmlWindow): boolean => w.sideSwap === true;
/** How far up the Side band and everything under the main grid move from the editor's layout (584 -> 480). */
const SIDE_UP = 104;

/** The Deck window cut to live's Card Swap height: the side band, the side cards and the frames' bottoms 104 px up,
 * the main grid's plane and frame shorter by as much. */
export function compactDeck(spec: WindowSpec): WindowSpec {
  type Part = { wy: number; sy?: number; name?: string };
  const lift = (p: Part) => { if (p.wy >= 584 && p.wy < 712) p.wy -= SIDE_UP; };
  for (const c of spec.win.controls) {
    const parts = c.parts as { sprites?: Part[]; labels?: Part[] } | undefined;
    const top = Number(c.wy ?? c.y);
    if (c.name === 'CWindowTaskTextFieldの背景' && c.cls === 'CWindowTaskBackPlane') {
      c.h = Number(c.h) - SIDE_UP;
      for (const s of parts?.sprites ?? []) s.sy = Number(c.h) / 8;
      continue;
    }
    if (c.name === 'frameMain') {
      c.h = Number(c.h) - SIDE_UP;
      for (const s of parts?.sprites ?? []) { if (s.wy >= 584 && s.wy < 720) s.wy -= SIDE_UP; else if (/左中央|右中央/.test(s.name ?? '')) s.sy = (Number(c.h) - 16) / 8; }
      continue;
    }
    if (top >= 584 && top < 712) { c.wy = top - SIDE_UP; c.y = Number(c.y) - SIDE_UP; }
    for (const s of parts?.sprites ?? []) lift(s);
    for (const l of parts?.labels ?? []) lift(l);
  }
  return spec;
}

export class SideSwap implements DeckDomScene {
  readonly ui = deckUi();
  private state: SideSwapState | null = null;
  constructor(private d: SideSwapDeps) {}

  /** The scene's windows for this swap (back to front), none outside it. */
  windows(ids: Ids, state: SideSwapState | null): WindowSpec[] {
    this.state = state; if (!state) { this.ui.drag = null; return []; }
    const ctx = { ids, ui: this.ui, deck: state.deck, card: (pc: number) => this.d.card(pc), trunk: [], busy: state.ready, yo2: (pc: number) => peekTable()?.id(pc) ?? 0, owned: 0 };
    const out = [cardSwapMenu(ids, { exit: () => this.exit(), disabled: state.ready, key: 'swap-exit' }), detailWindow(ctx), compactDeck(deckWindow(ctx)), this.clock(ids, state)];
    for (const s of out) s.win.sideSwap = true;
    return out;
  }
  /** What the card layer draws in the detail: the big picture and a monster's power icons. */
  detailView(): { passcode: number; power: PowerIcons | null } | null {
    if (this.ui.detail !== 0) return null;
    const c = this.ui.shown ? this.d.card(this.ui.shown) : undefined;
    return { passcode: c?.passcode ?? 0, power: c && isMonster(c) ? { race: raceOf(c), attr: attrOf(c), level: c.level ?? 0 } : null };
  }
  dragView(): { passcode: number; at: [number, number] } | null { const g = this.ui.drag; return g?.moved ? { passcode: g.passcode, at: g.at } : null; }

  // the side deck clock: live's pink plate at the top right, the time left as mm:ss
  private clock(ids: Ids, state: SideSwapState): WindowSpec {
    const left = state.deadline ? Math.max(0, Math.ceil((state.deadline - (this.d.now?.() ?? Date.now())) / 1000)) : 0;
    const text = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    const b = new WindowBuilder(ids, 'swap-clock', 'CJankenTimer', { x: 880, y: 0, w: 140, h: 32 }, { z: 51400, time: text, left });
    const spec = b.spec();
    spec.after = root => {
      let plate = root.querySelector<HTMLElement>('.swap-clock');
      if (!plate) {
        plate = document.createElement('div'); plate.className = 'swap-clock'; plate.setAttribute('role', 'timer');
        Object.assign(plate.style, { position: 'absolute', left: '0', top: '0', width: '140px', height: '32px', boxSizing: 'border-box', borderRadius: '0 0 0 4px',
          background: 'linear-gradient(#ff8fc4, #f0549c 45%, #d63a83)', borderBottom: '2px solid #9b2a5e', borderLeft: '2px solid #9b2a5e' });
        const glass = document.createElement('div'); Object.assign(glass.style, { position: 'absolute', left: '6px', top: '4px', width: '18px', height: '24px', background: '#5e5a3e', border: '1px solid #2c2a1a',
          clipPath: 'polygon(0 0, 100% 0, 100% 12%, 55% 50%, 100% 88%, 100% 100%, 0 100%, 0 88%, 45% 50%, 0 12%)' });
        const digits = document.createElement('div'); digits.className = 'swap-clock-time';
        Object.assign(digits.style, { position: 'absolute', left: '32px', top: '6px', width: '100px', height: '20px', borderRadius: '10px', background: '#4a4a4a', border: '1px solid #fff',
          color: '#fff', font: 'bold 16px/20px "Courier New", monospace', letterSpacing: '4px', textAlign: 'center' });
        plate.append(glass, digits); root.append(plate);
      }
      const t = plate.querySelector('.swap-clock-time')!; if (t.textContent !== text) t.textContent = text;
      plate.setAttribute('aria-label', `Card Swap time left ${text}`);
    };
    return spec;
  }
  private exit(): void {
    const s = this.state; if (!s || s.ready) return;
    const issue = sideboardDifference(s.deck, s.original);
    if (issue) { this.d.notice(issue); return; }
    this.d.submit();
  }
  private moveCard(from: DeckFrom, index: number, passcode: number): void {
    if (!this.state || this.state.ready || (from !== 'main' && from !== 'side')) return;
    if (this.state.deck[from][index] !== passcode) return;
    this.d.move(passcode, from, index);
  }

  card(passcode: number): CardView | undefined { return this.d.card(passcode); }
  pick(zone: DeckFrom, index: number, passcode: number, at: [number, number]): void {
    this.ui.shown = passcode;
    if (zone === 'main' || zone === 'side') this.ui.drag = { passcode, from: zone, index, at, start: at, moved: false };
    this.d.rerender();
  }
  dragTo(at: [number, number]): void {
    const g = this.ui.drag; if (!g) return;
    g.at = at; if (!g.moved && Math.hypot(at[0] - g.start[0], at[1] - g.start[1]) > 4) g.moved = true;
    if (g.moved) this.d.rerender();
  }
  dropOn(zone: DeckFrom | null): void {
    const g = this.ui.drag; this.ui.drag = null;
    if (g?.moved && zone && zone !== g.from && (zone === 'main' || zone === 'side')) this.moveCard(g.from, g.index, g.passcode);
    this.d.rerender();
  }
  /** A double-click / right-click: main -> side, side -> main. */
  quick(zone: DeckFrom, index: number, passcode: number): void { this.ui.drag = null; this.moveCard(zone, index, passcode); }
  tab(view: 'main' | 'extra'): void { if (this.ui.view !== view) { this.ui.view = view; this.d.rerender(); } }
  toggleDetail(): void { this.ui.detail = this.ui.detail === 0 ? 2 : 0; this.d.rerender(); }
  sideButton(name: string): void { if (name === 'ExitBtn') this.exit(); }
  wheel(): void {}
  hover(): void {}
  fileRow(): void {}
}
/** The zones Card Swap's card layer drops on: the main grid and the side row lifted to live's layout. */
export const SIDE_SWAP_ZONES = { main: [256, 88, 472, 392], side: [256, 512, 472, 88], extra: [256, 88, 472, 512] } as const;
