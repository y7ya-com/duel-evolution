// The deck editor scene (CDeckScene, client/src/Deck/DeckEntryMain.cpp) on main's deck screen: the rewrite's deck editor
// state as main's windows (deck.ts), and the engine's handling of the mouse on them: a press on a trunk row or a deck card
// shows it in the detail and picks it up, a release over a grid or the trunk drops it (DeckEntryMain.cpp's drop rules:
// the rewrite's deckCard / deckReorder), the side buttons open the Load / Save / Structure Deck lists and clear or leave,
// the tabs switch Main / Fusion. main's own additions run as on main: its trunk search hands the filter to "the game"
// (Module.yo2KabanFilter), its scroller wheels the trunk. The mouse is the DOM's (deck-dom.ts: the cards and buttons as
// elements over main's windows, each calling one of the actions below).
import type { CardView, ClientCommand, ClientView, DeckView, DeckZone } from '../contracts';
import { deckPlacementReason } from '../helpers';
import { parseDeckImport, MAX_DECK_IMPORT_BYTES } from '../deck';
import { deckProblems } from '../extra/deck-check';
import { Ids, WindowBuilder } from './snapshot';
import { wrapDialogText } from './dialog-text';
import type { HtmlControl, WindowSpec } from './snapshot';
import { deckUi, detailWindow, kabanWindow, deckWindow, fileListWindow, trunkCards, copiesLeft, isFusion, isMonster, raceOf, attrOf, TRUNK_ROWS, SIDE_BUTTONS } from './deck';
import type { DeckContext, DeckDialog, DeckFrom, DeckUi, FileButton, KabanFilter } from './deck';
import type { PowerIcons } from './deck-dom';
import { peekView as craftPeek, onChange as craftOnChange } from '@htmlui/crafting/api.js';
import { cardState } from '@htmlui/crafting/model.js';
import dialogInput1 from './templates/dialog-input1.json';
import dialogYesNo from './templates/dialog-yesno.json';
import dialogOk from './templates/dialog-ok.json';

export interface DeckSceneOptions {
  state(): ClientView;
  send(command: ClientCommand): void;
  /** Redraw main's windows (the editor's own state changed). */
  rerender(): void;
  /** A refusal for the player (the rewrite's notice; the scene shows it in main's OK dialog too). */
  notice(message: string): void;
  leave(): void;
  /** A file the player picked to import (the rewrite's file input). */
  pickFile(accept: string, then: (file: File) => void): void;
  /** The crafting view (main's crafting/api.js: Shards, per card owned / craftable / rarity), null before it answers. */
  craftView?(): CraftView | null;
  /** Listen for crafting view changes (a Craft or a Dismantle in main's crafting bar). -> unsubscribe */
  onCraft?(cb: (view: CraftView | null) => void): () => void;
}
/** main's crafting view (crafting/api.js), the part the trunk's Show row reads. */
export interface CraftView { shards?: number; values?: { craft?: Record<string, number>; dismantle?: Record<string, number> }; cards?: Record<string, { owned?: number; craftable?: boolean; rarity?: string }> }
/** Shard costs to craft one copy (shard pricing v5) when the crafting view has not named its own. */
export const CRAFT_COST_FALLBACK: Record<string, number> = { SR: 4500, UR: 8000 };
/** Whether the Shards craft a copy of this card now: crafting/model.js cardState's rule on the crafting view (craftable,
 * fewer than 3 owned, the rarity's cost paid). No view: nothing is craftable. */
export function craftableNow(c: CardView, view: CraftView | null | undefined): boolean {
  if (!view?.cards || c.passcode === undefined) return false;
  const values = view.values?.craft ? view : { ...view, values: { ...view.values, craft: CRAFT_COST_FALLBACK } };
  return !!(cardState(values, c.passcode) as { craft?: { ok?: boolean } } | null)?.craft?.ok;
}

const named = (cs: HtmlControl[], cls: string, label?: string) => cs.find(c => c.cls === cls && (label === undefined || c.label === label));

export class DeckScene {
  readonly ui: DeckUi = deckUi();
  private ids = new Ids();
  private shownNotice = '';
  private poolKey: unknown = null; private pool: CardView[] = []; private byPc = new Map<number, CardView>(); private order = new Map<number, number>();
  private trunkKey = ''; private trunk: CardView[] = []; private craftVer = 0; private unCraft: () => void;

  constructor(private o: DeckSceneOptions) {
    // main's search panel hands its filter to the game: here, to the trunk list (its f.pool, the engine's id list, is
    // the engine's: the rewrite filters its own catalogue by f.show / f.rarity)
    const g = globalThis as { Module?: Record<string, unknown> };
    g.Module ??= {};
    g.Module.yo2KabanFilter = (_list: number, f: KabanFilter & { pool?: unknown }) => { const { pool: _pool, ...filter } = f; this.ui.filter = filter; this.ui.top = 0; this.o.rerender(); };
    // the trunk can widen past the owned cards (main's Filters popup shows Show and Rarity only then)
    g.Module.yo2KabanPool = 1;
    // a Craft or a Dismantle (main's crafting bar): the trunk re-filters (Craftable now changed) and the rewrite's
    // collection, trunk counts and Shards are read again from the server
    const peek = o.craftView ?? (() => craftPeek() as CraftView | null);
    this.craftView = peek;
    let seen: unknown = peek();
    this.unCraft = (o.onCraft ?? (cb => craftOnChange(cb as (v: unknown) => void)))(view => {
      if (view === seen) return; seen = view; this.craftVer++; this.trunkKey = '';
      if (this.o.state().scene === 'deck') this.o.send({ type: 'refresh', scene: 'deck' });
      this.o.rerender();
    });
  }
  private craftView: () => CraftView | null;
  /** Stop following the crafting view. */
  dispose(): void { this.unCraft(); }

  // ---------------------------------------------------------------- the cards
  private refresh(view: ClientView): void {
    const editor = view.deckEditor; if (!editor) return;
    if (this.poolKey !== editor.collection) {
      this.poolKey = editor.collection;
      const owned = new Map(editor.collection.map(c => [c.passcode, c.owned ?? 0]));
      const all = editor.allCards?.length ? editor.allCards : editor.collection;
      // the card box's order (the catalogue's: the original's card numbers), the owned counts on every card
      this.order = new Map(all.map((c, i) => [c.passcode ?? -1, i]));
      this.byPc = new Map(all.map(c => [c.passcode ?? -1, { ...c, owned: owned.get(c.passcode) ?? 0 }]));
      for (const c of editor.collection) if (c.passcode !== undefined && !this.byPc.has(c.passcode)) this.byPc.set(c.passcode, c);
      // every collectible card (the Show row's All / Missing / Craftable): the owned ones and the deck-legal rest
      this.pool = [...this.byPc.values()].filter(c => (c.owned ?? 0) > 0 || c.deckAllowed !== false);
      this.trunkKey = '';
    }
    const key = `${this.craftVer}:${JSON.stringify(this.ui.filter)}`;
    if (key !== this.trunkKey) {
      this.trunkKey = key; const craft = this.craftView();
      this.trunk = trunkCards(this.pool, this.ui.filter, c => this.order.get(c.passcode ?? -1) ?? 1e9, c => craftableNow(c, craft));
    }
  }
  card = (pc: number): CardView | undefined => this.byPc.get(pc);
  /** The trunk as listed now (its rows' cards in order). */
  trunkList(): readonly CardView[] { return this.trunk; }

  // ---------------------------------------------------------------- the windows
  /** main's windows for the editor (none outside the deck scene), back to front. */
  windows(): WindowSpec[] {
    const view = this.o.state(); if (view.scene !== 'deck' || !view.deckEditor) { this.ui.files = null; this.ui.dialog = null; this.ui.drag = null; return []; }
    this.refresh(view);
    const deck = view.deckEditor.current, ui = this.ui;
    if (ui.shown && !this.byPc.has(ui.shown)) ui.shown = 0;
    const ctx: DeckContext = { ids: this.ids, ui, deck, card: this.card, trunk: this.trunk, busy: !!view.busy };
    const kaban = kabanWindow(ctx), deckW = deckWindow(ctx);
    // the trunk wheels a line a notch (main's scroller: api.wheel on the list)
    const list = kaban.win.controls.find(c => c.cls === 'CWindowTaskKabanList');
    if (list) kaban.handlers.set(list.id, { hover: false, wheel: d => { this.scroll(d > 0 ? 1 : -1); } });
    const out = [detailWindow(ctx), kaban, deckW];
    const files = this.filesWindow(view); if (files) out.push(files);
    const dialog = this.dialogWindow(); if (dialog) out.push(dialog);
    return out;
  }
  /** What the stage draws under the detail: its card and a monster's power icons; the card being dragged. */
  stageView(): { detail: { passcode: number; power: PowerIcons | null } | null; drag: { passcode: number; at: [number, number] } | null } {
    const c = this.ui.shown ? this.card(this.ui.shown) : undefined;
    const detail = this.ui.detail === 0 ? { passcode: c?.passcode ?? 0, power: c && isMonster(c) ? { race: raceOf(c), attr: attrOf(c), level: c.level ?? 0 } : null } : null;
    const d = this.ui.drag;
    return { detail, drag: d?.moved ? { passcode: d.passcode, at: d.at } : null };
  }
  private scroll(lines: number): void {
    const max = Math.max(0, this.trunk.length - TRUNK_ROWS), top = Math.max(0, Math.min(max, this.ui.top + lines));
    if (top !== this.ui.top) { this.ui.top = top; this.o.rerender(); }
  }

  // ---------------------------------------------------------------- the editor's actions (deck-dom.ts: the DOM's mouse)
  private live(): { view: ClientView; deck: DeckView | null } | null {
    const view = this.o.state(); if (view.scene !== 'deck' || this.ui.files || this.ui.dialog) return null;   // the lists and dialogs are modal
    this.refresh(view); return { view, deck: view.deckEditor?.current ?? null };
  }
  /** A press on a trunk row (index: the trunk's, -1 for a row) or a deck card: shows it in the detail and picks it up. */
  pick(from: DeckFrom, index: number, passcode: number, at: [number, number]): void {
    if (!this.live() || !(passcode > 0)) return;
    this.ui.shown = passcode; this.ui.drag = { passcode, from, index: from === 'trunk' ? -1 : index, at, start: at, moved: false }; this.o.rerender();
  }
  /** The pointer while a card is held (game pixels: where the dragged card is drawn). */
  dragTo(at: [number, number]): void {
    const d = this.ui.drag; if (!d) return;
    d.at = at;
    if (!d.moved && Math.hypot(at[0] - d.start[0], at[1] - d.start[1]) > 4) d.moved = true;
    if (d.moved) this.o.rerender();
  }
  /** The held card let go over a zone (null: nowhere), on the card at `index` of it (null: the zone's free space). */
  dropOn(to: DeckFrom | null, index: number | null): void {
    const d = this.ui.drag; this.ui.drag = null; if (!d) return;
    const live = this.live();
    if (live && (d.moved || to !== d.from || index !== null && index !== d.index)) this.drop(d.passcode, d.from, d.index, to, index, live.deck);
    this.o.rerender();
  }
  /** A double-click / right-click move (main's quick move): a trunk card into the deck, a deck card back to the trunk. */
  quick(from: DeckFrom, index: number, passcode: number): void {
    const live = this.live(); if (!live || !(passcode > 0)) return;
    this.ui.shown = passcode; this.ui.drag = null;
    if (from === 'trunk') this.drop(passcode, 'trunk', -1, this.ui.view === 'extra' ? 'extra' : 'main', null, live.deck);
    else this.drop(passcode, from, index, 'trunk', null, live.deck);
    this.o.rerender();
  }
  /** The scene's side buttons (Load, Save, Structure Deck, Clear, Exit). */
  sideButton(button: string): void { const live = this.live(); if (live) this.side(button, live.view); }
  /** The deck panel's Main / Fusion tabs. */
  tab(view: 'main' | 'extra'): void { if (this.live() && this.ui.view !== view) { this.ui.view = view; this.o.rerender(); } }
  /** The detail's collapse arrow. */
  /** A row of the Load / Save / Structure Deck list (the list's index): chosen (its light stripe). */
  fileRow(i: number): void { if (this.ui.files && i >= 0) { this.ui.files.selected = i; this.o.rerender(); } }
  toggleDetail(): void { if (this.live()) { this.ui.detail = this.ui.detail === 0 ? 2 : 0; this.o.rerender(); } }
  /** The hovered side button (its look, main's backdrop), null: none. */
  hover(button: string | null): void {
    const i = button ? SIDE_BUTTONS.indexOf(button as typeof SIDE_BUTTONS[number]) : -1, at: [number, number] | null = i < 0 ? null : [88, 40 + 27 * i + 13];
    if (JSON.stringify(at) !== JSON.stringify(this.ui.mouse)) { this.ui.mouse = at; this.o.rerender(); }
  }
  /** The trunk's wheel (a line a notch). */
  wheel(lines: number): void { if (this.live()) this.scroll(lines); }
  // DeckEntryMain.cpp's end of a drag: a trunk card onto a grid (a Fusion monster goes to the Fusion Deck), a deck card
  // back to the trunk, between Main and Side, or to another place in its grid (the card dropped on, else the end)
  private drop(pc: number, from: DeckFrom, index: number, to: DeckFrom | null, at: number | null, deck: DeckView | null): void {
    if (!to || !deck) return;
    const c = this.card(pc);
    if (from === 'trunk') {
      if (to === 'trunk' || !c) return;
      const zone: DeckZone = isFusion(c) ? 'extra' : to === 'side' ? 'side' : to === 'extra' ? 'extra' : 'main';
      if (zone === 'extra' && !isFusion(c)) return this.refuse('This card belongs in the Main or Side Deck.');
      const reason = deckPlacementReason(c, zone, deck); if (reason) return this.refuse(reason);
      this.o.send({ type: 'deckCard', passcode: pc, from: 'collection', to: zone });
      if (zone === 'extra' && this.ui.view !== 'extra') this.ui.view = 'extra';
      return;
    }
    if (to === 'trunk') { this.o.send({ type: 'deckCard', passcode: pc, from, to: 'collection', index }); return; }
    if (to === from) {
      const n = deck[from].length, target = Math.max(0, Math.min(n - 1, at ?? n - 1));
      if (target !== index) this.o.send({ type: 'deckReorder', zone: from, fromIndex: index, toIndex: target });
      return;
    }
    if (from === 'extra' || to === 'extra') return this.refuse(from === 'extra' ? 'Fusion cards stay in the Fusion Deck.' : 'This card belongs in the Main or Side Deck.');
    this.o.send({ type: 'deckCard', passcode: pc, from, to, index });
  }
  private refuse(message: string): void { this.o.notice(message); }
  /** A notice the rewrite shows (a refused move, a failed save): main's OK dialog over the editor, once per message. */
  notice(message: string): void {
    if (!message || message === this.shownNotice || this.o.state().scene !== 'deck') { if (!message) this.shownNotice = ''; return; }
    this.shownNotice = message; this.ui.dialog = { kind: 'ok', text: message };
  }

  // ---------------------------------------------------------------- the side buttons
  private side(button: string, view: ClientView): void {
    // LOAD / SAVE / STRUCTURE DECK open when pressed, as live's: while a request is out (the deck screen's own refresh
    // as it opens, after a reload) the list shows with its buttons greyed until the reply (filesWindow's busy)
    const editor = view.deckEditor, ui = this.ui; if (!editor) return;
    if (view.busy && !['LoadBtn', 'SaveBtn', 'RecipeBtn'].includes(button)) return;
    if (button === 'LoadBtn') ui.files = { mode: 'load', selected: Math.max(-1, editor.decks.findIndex(d => d.name === editor.current?.name)) };
    else if (button === 'SaveBtn') ui.files = { mode: 'save', selected: Math.max(-1, editor.decks.findIndex(d => d.name === editor.current?.name)) };
    else if (button === 'RecipeBtn') ui.files = { mode: 'recipe', selected: -1 };
    else if (button === 'ClearBtn') { const current = editor.current; if (current) ui.dialog = { kind: 'confirm', text: 'Remove every card from this deck? Save to keep the change.', yes: () => this.o.send({ type: 'replaceDeck', deck: { name: current.name, main: [], side: [], extra: [] }, source: 'clear' }) }; }
    else if (button === 'ExitBtn') { this.o.leave(); return; }
    this.o.rerender();
  }

  // ---------------------------------------------------------------- the Load / Save / Structure Deck lists
  private filesWindow(view: ClientView): WindowSpec | null {
    const f = this.ui.files, editor = view.deckEditor; if (!f || !editor) return null;
    const close = () => { this.ui.files = null; this.o.rerender(); };
    const pick = (i: number) => { if (this.ui.files) { this.ui.files.selected = i; this.o.rerender(); } };
    const confirm = (text: string, yes: () => void) => { this.ui.dialog = { kind: 'confirm', text, yes }; this.o.rerender(); };
    const busy = !!view.busy, current = editor.current;
    const btn = (label: string, key: string, run: (() => void) | null): FileButton => ({ label, key, run: busy ? null : run });
    if (f.mode === 'recipe') {
      const recipes = editor.recipes ?? [], r = recipes[f.selected];
      const apply = r ? () => { const deck = { name: current?.name ?? r.name, main: [...r.main], side: [...r.side], extra: [...r.extra] }; close(); this.o.send({ type: 'replaceDeck', deck, source: 'recipe' }); } : null;
      return fileListWindow(this.ids, 'STRUCTURE DECK', recipes.map(x => ({ label: x.name })), f.selected, 0, pick,
        [null, null, btn('OK', 'deck-files-ok', apply && (() => editor.dirty ? confirm('Replace the deck being edited with this structure deck?', apply) : apply())), btn('Cancel', 'deck-files-cancel', close)]);
    }
    if (f.mode === 'export') {
      const formats = [['ydc', 'YDC (the original deck file)'], ['ydk', 'YDK'], ['json', 'JSON']] as const, chosen = formats[f.selected];
      return fileListWindow(this.ids, 'EXPORT DECK', formats.map(([, label]) => ({ label })), f.selected, 0, pick,
        [null, null, btn('OK', 'deck-files-ok', chosen && current ? () => { close(); this.o.send({ type: 'exportDeck', format: chosen[0] }); } : null), btn('Cancel', 'deck-files-cancel', close)]);
    }
    const decks = editor.decks, rows = decks.map(d => ({ label: d.name })), chosen = decks[f.selected];
    if (current && !decks.some(d => d.name === current.name)) rows.push({ label: `${current.name} (not saved)` });
    const del = chosen ? () => confirm(`Delete the deck “${chosen.name}”?`, () => { this.ui.files = null; this.o.send({ type: 'deleteDeck', name: chosen.name }); }) : null;
    if (f.mode === 'load') {
      const load = chosen ? () => { close(); this.o.send({ type: 'selectDeck', name: chosen.name }); } : null;
      return fileListWindow(this.ids, 'LOAD DECK', rows, f.selected, Math.max(0, f.selected - 7), pick, [
        btn('Import', 'deck-files-import', () => this.importFile()), btn('Export', 'deck-files-export', current ? () => { this.ui.files = { mode: 'export', selected: 1 }; this.o.rerender(); } : null),
        btn('OK', 'deck-files-ok', load && (() => editor.dirty && chosen!.name !== current?.name ? confirm('Load this deck? The changes to the deck being edited are not saved.', load) : load())),
        btn('Cancel', 'deck-files-cancel', close)]);
    }
    // save: over the chosen deck (the deck being edited: saved; another: overwritten, after a question), or Save New
    const save = (as?: 'copy' | 'overwrite') => { close(); this.o.send({ type: 'saveDeck', ...(as ? { as } : {}) }); this.checkAfterSave(); };
    const over = chosen && current ? () => {
      if (chosen.name === current.name) return save();
      confirm(`Overwrite the deck “${chosen.name}” with this deck?`, () => { this.o.send({ type: 'renameDeck', name: chosen.name }); save('overwrite'); });
    } : null;
    return fileListWindow(this.ids, 'SAVE DECK', rows, f.selected, Math.max(0, f.selected - 7), pick, [
      btn('Save New', 'deck-files-new', () => { this.ui.dialog = { kind: 'name', name: '' }; this.o.rerender(); }), btn('Delete', 'deck-files-delete', del),
      btn('OK', 'deck-files-ok', over), btn('Cancel', 'deck-files-cancel', close)]);
  }
  private saveNew(name: string): void {
    const view = this.o.state(), editor = view.deckEditor; if (!editor) return;
    if (editor.decks.some(d => d.name === name)) { this.ui.dialog = { kind: 'ok', text: `A deck named “${name}” already exists. Choose another name.` }; return; }
    this.ui.files = null; this.ui.dialog = null;
    if (editor.current) { this.o.send({ type: 'renameDeck', name }); this.o.send({ type: 'saveDeck', as: 'copy' }); }
    else { this.o.send({ type: 'newDeck', name }); this.o.send({ type: 'saveDeck' }); }
    this.checkAfterSave();
  }
  // the deck check (the server's duel rules, extra/deck-check.ts) after a save: a deck a duel won't take says why
  private checkAfterSave(): void {
    const deck = this.o.state().deckEditor?.current; if (!deck) return;
    const problems = deckProblems(deck, pc => this.card(pc));
    if (problems.length) this.ui.dialog = { kind: 'ok', text: `This deck can't be used in a duel yet. ${problems.slice(0, 3).map(p => p.message).join(' ')}${problems.length > 3 ? ` …and ${problems.length - 3} more.` : ''}` };
  }
  // the rewrite's deck files (YDC / YDK / JSON), as its editor imported them
  private importFile(): void {
    this.o.pickFile('.ydc,.ydk,.json,.txt', file => {
      const view = this.o.state(), editor = view.deckEditor; if (!editor || view.scene !== 'deck') return;
      const fail = (e: unknown) => { this.ui.dialog = { kind: 'ok', text: e instanceof Error ? e.message : 'Could not read the deck file.' }; this.o.rerender(); };
      const legacy = /\.ydc$/i.test(file.name);
      if (legacy && file.size !== 250) return fail(new Error('A native YDC deck must contain exactly 250 bytes.'));
      if (file.size > MAX_DECK_IMPORT_BYTES) return fail(new Error('Deck file exceeds 64 KiB.'));
      const hint = [...file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')].slice(0, 40).join('') || 'Imported Deck';
      const go = (send: () => void) => { this.ui.files = null; if (editor.dirty) { this.ui.dialog = { kind: 'confirm', text: 'Replace the deck being edited with the imported deck?', yes: send }; this.o.rerender(); } else { send(); this.o.rerender(); } };
      if (legacy) void file.arrayBuffer().then(buffer => { if (buffer.byteLength !== 250) throw new Error('A native YDC deck must contain exactly 250 bytes.'); go(() => this.o.send({ type: 'importLegacyDeck', bytes: new Uint8Array(buffer), name: hint })); }).catch(fail);
      else void file.text().then(text => { const deck = parseDeckImport(text, hint); go(() => this.o.send({ type: 'replaceDeck', deck, source: 'import' })); }).catch(fail);
    });
  }

  // ---------------------------------------------------------------- the dialogs (main's dialog.js: its captured windows)
  private dialogWindow(): WindowSpec | null {
    const d = this.ui.dialog; if (!d) return null;
    const close = () => { this.ui.dialog = null; this.o.rerender(); };
    if (d.kind === 'name') {
      const t = dialogInput1.windows[0]!, b = new WindowBuilder(this.ids, 'deck-name', t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51503 });
      const cs = b.fromTemplate(t, true), ok = () => { const name = d.name.trim(); if (name) this.saveNew(name); this.o.rerender(); };
      const text = named(cs, 'CWindowTaskText'); if (text) Object.assign(text, { text: 'Enter a name for the deck', x: 0, y: 8, w: 336, align: 1 });
      const input = named(cs, 'CWindowTaskInput'); if (input) { Object.assign(input, { x: 8, y: 56, w: 320, value: d.name, focused: true, maxLen: 40 }); b.on(input, { key: 'deck-name', label: 'Deck name', text: v => { d.name = v; this.o.rerender(); }, enter: ok }); }
      const okB = named(cs, 'CWindowTaskTextSwitch', 'OK'), cancel = named(cs, 'CWindowTaskTextSwitch', 'Cancel');
      if (okB) { okB.state = d.name.trim() ? 'normal' : 'disabled'; b.on(okB, { key: 'deck-name-ok', click: ok }); }
      if (cancel) b.on(cancel, { key: 'deck-name-cancel', click: close });
      return b.spec();
    }
    const template = d.kind === 'confirm' ? dialogYesNo : dialogOk, t = template.windows[0]!;
    const b = new WindowBuilder(this.ids, `deck-${d.kind}`, t.cls, { x: t.x, y: t.y, w: t.w, h: t.h }, { modal: true, z: 51553 });
    const cs = b.fromTemplate(t, true), field = named(cs, 'CWindowTaskTextField'), inner = cs.find(c => c.parent === field?.id && c.cls === 'CWindowTaskText');
    // wrapped to the box it is drawn in (main's dialog.js draws the text unwrapped), as messageDialog does
    const text = wrapDialogText(d.text, inner?.w ?? field?.w ?? t.w - 16);
    if (field) field.text = text;
    for (const c of cs) if (c.parent === field?.id && c.cls === 'CWindowTaskText') c.text = text;
    const on = (label: string, key: string, run: () => void) => { const c = named(cs, 'CWindowTaskTextSwitch', label); if (c) b.on(c, { key, click: run }); };
    if (d.kind === 'confirm') { on('Yes', 'deck-dialog-yes', () => { this.ui.dialog = null; d.yes(); this.o.rerender(); }); on('No', 'deck-dialog-no', close); }
    else on('OK', 'deck-dialog-ok', close);
    return b.spec();
  }
  dialog(): DeckDialog | null { return this.ui.dialog; }
  /** What the editor holds now, by name (tests and assistive tools: main's windows draw it as pictures). */
  inspect(): DeckInspection | null {
    const view = this.o.state(), editor = view.deckEditor; if (view.scene !== 'deck' || !editor) return null;
    this.refresh(view);
    const deck = editor.current, name = (pc: number) => this.card(pc)?.name ?? `Card ${pc}`, ui = this.ui;
    return { deck: deck?.name ?? '', decks: editor.decks.map(d => d.name), dirty: !!editor.dirty, view: ui.view, top: ui.top,
      main: deck?.main.map(name) ?? [], side: deck?.side.map(name) ?? [], extra: deck?.extra.map(name) ?? [],
      trunk: this.trunk.map(c => ({ passcode: c.passcode ?? 0, name: c.name, owned: c.owned ?? 0, left: copiesLeft(c, deck ?? null) })),
      shown: ui.shown ? name(ui.shown) : '', files: ui.files ? ui.files.mode : null, dialog: ui.dialog ? ui.dialog.kind === 'name' ? 'name' : ui.dialog.text : null,
      recipes: editor.recipes?.map(r => r.name) ?? [] };
  }
}
export interface DeckInspection { deck: string; decks: string[]; dirty: boolean; view: 'main' | 'extra'; top: number; main: string[]; side: string[]; extra: string[];
  trunk: { passcode: number; name: string; owned: number; left: number }[]; shown: string; files: string | null; dialog: string | null; recipes: string[] }
