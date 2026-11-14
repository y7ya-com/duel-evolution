import type { CardView, DuelCardView, DuelView } from './contracts';
import { DuelFx, type ArchiveLoader } from './duel-fx';
import { WaistUpComposer, blinkSchedule, canvasUrl, type EyeFrame, type Expression } from './duel-portrait';
import { fieldCardPosition } from './helpers';
import { npcWaistUpCanvases, type NpcWaistUpFrame } from './npc-waistup';

/** The original duel screen's furniture around the field, with its art: the two waist-up portraits between the backdrop
 * and the zone frames (the opponent's on the right: the `_r` pose as drawn; the player's on the left: the `_l` pose
 * mirrored, so both face the field; measured against captures of the original), the card
 * information box at the bottom left (name, [race/kind/attribute], text, race and attribute icons, level, ATK/DEF:
 * data/y/duel/card/icon_syuzoku.png 21 × 16 px in YO2 race order, icon_zokusei.png 10 × 16 px, icon_star_01.png) and
 * the effects layer (src/ui/duel-fx.ts). The nodes persist across renders: a render re-attaches them to the new board. */

const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast', 'Beast-Warrior',
  'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ATTRIBUTES = ['light', 'dark', 'water', 'fire', 'earth', 'wind', 'divine'];
/** Where a duelist's waist-up portrait composed from parts sits (yo2.exe's CWaistUpAvatar, the same in the NPC talk,
 * janken, the duel and its result): the 768 x 768 composition at full size, top at 0, its base at the side's home,
 * 874 on the right and 150 on the left (0x009ebd70), plus the look's offset (0x009eb7b0: 345 for the male wm_data
 * look, 326 for the female ww_data, away from the side's edge). The left one is mirrored about its base, so the base
 * is its right edge. Measured live (the engine's sprites): the player (male) 495 mirrored, a female NPC from parts
 * (Miss Shadow) 548. Returns the composition's left edge on the 1024 x 768 screen. */
export function portraitLeft(side: 0 | 1, female: boolean): number {
  const offset = female ? 326 : 345;
  return side === 1 ? 874 - offset : 150 + offset - 768;
}

const CSS = `
/* the card box where live's duel screen has it: the bottom left beside the chat (0, 608, 248 x 128), as live draws it
   (livetour2 50-card-commands): the blue icon bar with its ▲ key, a light frame, five 16 px lines (the name in olive,
   [race/kind/ATTRIBUTE] in green, the text in black) beside the text field's scroll bar, the race / attribute / level
   icons and " 4 ATK1600/DEF1400" under them; empty while no card is shown. Sizes in game px (--px). */
.de-duel-board>.de-duel-info { left:0; top:${608 / 768 * 100}%; width:${248 / 1024 * 100}%; height:${128 / 768 * 100}%; }
:is(.de-duel-board,.de-janken-scene)>.de-duel-portrait { position:absolute; inset:auto; top:0; width:${768 / 1024 * 100}%; height:100%; pointer-events:none; z-index:0; }
.de-duel-portrait>img { position:absolute; inset:0; width:100%; height:100%; display:block; }
.de-duel-fx { position:absolute; inset:0; pointer-events:none; z-index:7; }
.de-duel-fx>.de-duel-fx-layer { position:absolute; inset:0; }
.de-duel-fx.front { z-index:41; }
.de-duel-fx>.de-duel-fx-dim { position:absolute; inset:0; background:#000; opacity:0; pointer-events:none; }
.de-duel-board>.de-duel-stats { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:6; }
.de-duel-stats>i { position:absolute; width:${7 / 1024 * 100}%; height:${16 / 768 * 100}%; background-repeat:no-repeat; }
.de-duel-info { position:absolute; z-index:8; container-type:inline-size; pointer-events:auto; --px:calc(100cqw / 248); }
.de-duel-info[hidden] { display:none; }
.de-duel-info>div { position:absolute; }
.de-duel-info-frame { inset:calc(24 * var(--px)) 0 0; background:rgba(120,214,232,.55); box-shadow:inset 0 0 0 1px rgba(255,255,255,.6); }
.de-duel-info-frame>div { position:absolute; inset:0 calc(7 * var(--px)) calc(7 * var(--px)); background:rgba(232,236,238,.78); }
.de-duel-info-bar { left:0; top:0; width:100%; height:calc(24 * var(--px)); opacity:.7; }
.de-duel-info .de-crop { position:absolute; overflow:hidden; }
.de-duel-info .de-crop>img { position:absolute; max-width:none; image-rendering:pixelated; }
.de-duel-info-key { left:calc(229 * var(--px)); top:0; width:calc(16 * var(--px)); height:calc(24 * var(--px)); }
.de-duel-info-lines { left:calc(8 * var(--px)); top:calc(24 * var(--px)); width:calc(216 * var(--px)); height:calc(80 * var(--px)); overflow:hidden; }
.de-duel-info-run { position:relative; font:calc(16 * var(--px))/calc(16 * var(--px)) Arial,'Segoe UI',sans-serif; letter-spacing:.08em; color:#000; }
.de-duel-info-name { color:#6f6f00; white-space:nowrap; overflow:hidden; }
.de-duel-info-kind { color:#009f00; }
.de-duel-info-text { word-break:break-word; }
.de-duel-info-sb { left:calc(224 * var(--px)); top:calc(24 * var(--px)); width:calc(16 * var(--px)); height:calc(80 * var(--px)); }
.de-duel-info-sb>.up, .de-duel-info-sb>.down { cursor:pointer; }
.de-duel-info-stats { left:calc(8 * var(--px)); top:calc(104 * var(--px)); height:calc(16 * var(--px)); display:flex; align-items:center; white-space:nowrap; font:calc(16 * var(--px))/1 Arial,'Segoe UI',sans-serif; letter-spacing:.08em; color:#000; }
.de-duel-info-icon { width:calc(16 * var(--px)); height:calc(16 * var(--px)); overflow:hidden; position:relative; flex:none; }
.de-duel-info-icon img { position:absolute; top:0; height:100%; }
.de-duel-info-star { width:calc(19 * var(--px)); height:calc(16 * var(--px)); flex:none; }
.de-duel-info-stats span { margin-left:calc(7 * var(--px)); }
`;

function isMonster(card: CardView): boolean { return !!card.type?.startsWith('Monster') || card.attack !== undefined && !/^(Spell|Trap)/.test(card.type ?? ''); }
export function cardKindLine(card: CardView): string {
  if (!isMonster(card)) return '';
  const kinds = (card.type ?? '').split('/').map(s => s.trim()).filter(s => s && s !== 'Monster' && s !== 'Normal');
  const attribute = typeof card.attribute === 'string' && card.attribute ? card.attribute.toUpperCase() : '';
  return `[${[typeof card.race === 'string' && card.race ? card.race : '', ...kinds, attribute].filter(Boolean).join('/')}]`;
}

/** Whose decision the duel waits on (the original's "Now Thinking" plate): the player's while it has a question or
 * commands, else the turn's duelist's; none at the end or with nothing to wait for. A spectator
 * sees the side whose clock runs. */
export function thinkingSide(duel: DuelView): 0 | 1 | null {
  if (duel.ended || !duel.turn) return null;
  if (duel.spectating) return duel.timer && !duel.timer.paused ? duel.timer.player : null;
  if (duel.prompt || duel.actions?.length) return 0;
  // between questions (the server answering, an effect playing) the plate stays with the turn's duelist: the server's
  // own pauses never flick it across
  return duel.turnPlayer;
}

export interface DuelPresentationOptions { random?: () => number; setTimer?: (cb: () => void, ms: number) => unknown; clearTimer?: (id: unknown) => void }

export class DuelPresentation {
  readonly fx: DuelFx;
  /** Each side's portrait frames (eyes open, half shut, shut: one <img> each, the shown one visible) and its blink timer. */
  private readonly faces: [{ frames: Partial<Record<EyeFrame, HTMLImageElement>>; timer: unknown }, { frames: Partial<Record<EyeFrame, HTMLImageElement>>; timer: unknown }] = [{ frames: {}, timer: null }, { frames: {}, timer: null }];
  private reduced = false;
  private readonly random: () => number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private readonly portraits: [HTMLElement, HTMLElement];
  private readonly portraitKeys: [string, string] = ['', ''];
  private readonly composer: WaistUpComposer | null;
  private readonly abort = new AbortController();
  private readonly info: HTMLElement;
  /** ATK/DEF under face-up monsters in the original's duel_fontm digits (7×16, "0123456789/"): one element per glyph,
   * the sheet its background. */
  private readonly statsLayer: HTMLElement;
  private statsKey = '';
  private statsFont: { url: string; width: number; height: number; release(): void } | null = null;
  private readonly style: HTMLStyleElement;
  private duel: DuelView | null = null;
  private shown: string | null = null;
  private hovered: string | null = null;
  private infoKey = '';
  /** A famous NPC's picture set per side (npc-waistup.ts npcWaistUpSet: Alexis Rhodes a03), its own picture in place of
   * a look composed from parts; set by the app for an NPC duel. */
  npcSets: [string | null, string | null] = [null, null];

  constructor(private readonly load: ArchiveLoader | null, options: DuelPresentationOptions = {}) {
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? (id => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.fx = new DuelFx(load);
    this.composer = load ? new WaistUpComposer(load) : null;
    this.portraits = [0, 1].map((side): HTMLElement => {
      const c = document.createElement('div'); c.className = `de-duel-portrait side-${side}`; c.setAttribute('aria-hidden', 'true');
      c.style.left = `${portraitLeft(side as 0 | 1, false) / 1024 * 100}%`; c.hidden = true;
      // The art faces left: the player's portrait is the mirrored composition of the other pose.
      if (side === 0) c.style.transform = 'scaleX(-1)';
      return c;
    }) as [HTMLElement, HTMLElement];
    this.info = document.createElement('aside'); this.info.className = 'de-duel-info'; this.info.setAttribute('aria-label', 'Card information'); this.info.hidden = !load;
    this.buildInfo();
    this.style = document.createElement('style'); this.style.textContent = CSS;
    this.statsLayer = document.createElement('div'); this.statsLayer.className = 'de-duel-stats'; this.statsLayer.setAttribute('aria-hidden', 'true');
    // the sheet's lease is kept while the layer may show it (its URL is the glyphs' background)
    load?.('data/y/duel/font/duel_fontm.png', this.abort.signal).then(lease => {
      const img = new Image();
      img.onload = () => { if (this.abort.signal.aborted) { lease.release(); return; } this.statsFont = { url: lease.url, width: img.naturalWidth, height: img.naturalHeight, release: () => lease.release() }; this.statsKey = ''; if (this.duel) this.drawStats(); };
      img.onerror = () => lease.release(); img.src = lease.url;
    }, () => {});
  }

  /** Attach to a freshly rendered board. */
  mount(board: HTMLElement, duel: DuelView, reducedMotion: boolean): void {
    board.append(this.style);
    if (this.load) {
      const bg = board.querySelector('.de-duel-bg');
      if (bg) bg.after(...this.portraits); else board.prepend(...this.portraits);
      board.append(this.statsLayer, this.fx.element);
    }
    // the card information box (its text is the card's; its icons wait for the art)
    board.append(this.info);
    board.addEventListener('pointerover', e => {
      const id = (e.target as Element | null)?.closest?.('[data-key^="field-card:"]')?.getAttribute('data-key')?.slice('field-card:'.length);
      // (the card pointed at again after the box showed another - a question's card, a cue's - is shown again)
      if (id && (id !== this.hovered || this.shown !== id || this.pinned)) { this.hovered = id; this.shown = id; this.pinned = null; this.renderInfo(); }
    });
    this.update(duel, reducedMotion);
  }
  update(duel: DuelView, reducedMotion: boolean): void {
    if (duel !== this.duel && duel.cues !== this.duel?.cues) {
      // The last card a cue points at (summoned, activated, attacking) is what the box shows until the pointer picks another.
      const last = [...(duel.cues ?? [])].reverse().find(c => c.at && ['summon', 'activate', 'flip', 'attack'].includes(c.kind) && c.id > (this.lastCue ?? 0));
      if (last?.at) {
        const card = duel.cards.find(c => c.controller === last.at!.controller && c.zone === last.at!.zone && c.index === last.at!.index && c.faceUp);
        if (card) this.shown = card.id;
      }
      this.lastCue = duel.cues?.[duel.cues.length - 1]?.id ?? this.lastCue;
    }
    this.duel = duel;
    if (reducedMotion !== this.reduced) { this.reduced = reducedMotion; for (const side of [0, 1] as const) this.blink(side); }
    this.renderInfo();
    if (!this.load) return;
    this.fx.update(duel, reducedMotion);
    // live's "Now Thinking" plate pulses under the LP plate of the side the duel waits on: the opponent's (pink) and the
    // player's own (blue, top left: de-scratch/duelwin/live t1a..t7a)
    this.fx.thinking = thinkingSide(duel);
    // the loser's face at the duel's end (live: the result screen's sweating, gritted-teeth portrait)
    const loser = duel.ended === 'Victory' ? 1 : duel.ended === 'Defeat' ? 0 : -1;
    for (const side of [0, 1] as const) this.portrait(side, duel.players[side].parts, side === loser ? 'lose' : 'normal');
    if (!duel.ended) for (const side of [0, 1] as const) void this.portraitFrames(side, duel.players[side].parts, this.npcSets[side], 'lose');
    this.drawStats();
  }
  private lastCue: number | null = null;
  dispose(): void {
    this.composed.clear();
    for (const side of [0, 1] as const) { const face = this.faces[side]; if (face.timer !== null) this.clearTimer(face.timer); face.timer = null; this.dropFrames(side); }
    for (const l of this.leases.splice(0)) l.release();
    this.abort.abort(); this.statsLayer.remove(); this.statsLayer.replaceChildren(); this.statsFont?.release(); this.statsFont = null; this.fx.dispose(); this.info.remove(); for (const p of this.portraits) p.remove();
  }

  private drawStats(): void {
    const font = this.statsFont; if (!font || !this.duel) return;
    const shown = this.duel.cards.filter(c => c.zone === 'monster' && c.faceUp && c.attack !== undefined && c.attack !== null);
    const key = shown.map(c => `${c.id}:${c.attack}:${c.defense}:${Math.round(c.motion?.x ?? -1)}:${Math.round(c.motion?.y ?? -1)}:${c.controller}:${c.index}`).join('|');
    if (key === this.statsKey) return;
    this.statsKey = key;
    const glyphs: HTMLElement[] = [], url = `url("${font.url}")`, size = `${font.width / 7 * 100}% ${font.height / 16 * 100}%`;
    for (const card of shown) {
      const p = fieldCardPosition(card, 0), x = card.motion?.x ?? p.x, y = (card.motion?.y ?? p.y) + 42;
      // "1800 / 1600": the slash with a few pixels of space each side, centred under the card.
      const atk = String(card.attack), def = card.defense === undefined || card.defense === null ? '?' : String(card.defense);
      const width = (atk.length + def.length + 1) * 7 + 8;
      let at = x - width / 2;
      const glyph = (ch: string) => {
        const g = '0123456789/'.indexOf(ch);
        if (g >= 0) {
          const i = document.createElement('i');
          Object.assign(i.style, { left: `${at / 1024 * 100}%`, top: `${(y - 8) / 768 * 100}%`, backgroundImage: url, backgroundSize: size, backgroundPosition: `${font.width > 7 ? g * 7 / (font.width - 7) * 100 : 0}% 0%` });
          glyphs.push(i);
        }
        at += 7;
      };
      for (const ch of atk) glyph(ch); at += 4; glyph('/'); at += 4; for (const ch of def) glyph(ch);
    }
    this.statsLayer.replaceChildren(...glyphs);
  }
  /** A side's eye frames go (a new look, or the duel screen's end): their pictures with them. */
  private dropFrames(side: 0 | 1): void {
    const face = this.faces[side];
    for (const img of Object.values(face.frames)) { if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src); img.remove(); }
    face.frames = {};
  }
  /** The two portraits for the rock-paper-scissors scene (janken-scene.ts), with the duelists' looks. */
  jankenPortraits(players: readonly { parts?: Uint8Array | undefined }[] | null): HTMLElement[] {
    if (!this.load || !players) return [];
    for (const side of [0, 1] as const) this.portrait(side, players[side]?.parts);
    // with the scene's CSS (the portraits' place and size), which the duel board carries otherwise
    return [this.style, ...this.portraits];
  }
  /** Each side's composed portrait frames by look and expression, kept for the duel (the end's faces are made while it
   * goes on: composed at the end, from parts not yet loaded, they had held the end under the scene-loading veil). */
  private readonly composed = new Map<string, Promise<Partial<Record<EyeFrame, HTMLCanvasElement>>>>();
  private portraitFrames(side: 0 | 1, parts: Uint8Array | undefined, set: string | null, expression: Expression): Promise<Partial<Record<EyeFrame, HTMLCanvasElement>>> | null {
    if (set ? !this.load : !parts || !this.composer) return null;
    const key = `${side}:${set ? `npc:${set}` : Array.from(parts!).join('.')}:${expression}`;
    let frames = this.composed.get(key);
    if (!frames) {
      if (this.composed.size >= 8) this.composed.delete(this.composed.keys().next().value!);
      frames = set ? npcPortraitFrames(this.load!, set, expression, this.abort.signal) : this.composer!.composeFrames(parts!, side === 0 ? 1 : 0, this.abort.signal, expression);
      this.composed.set(key, frames); frames.catch(() => { if (this.composed.get(key) === frames) this.composed.delete(key); });
    }
    return frames;
  }
  private portrait(side: 0 | 1, parts: Uint8Array | undefined, expression: Expression = 'normal'): void {
    const box = this.portraits[side], set = this.npcSets[side];
    const key = set ? `npc:${set}:${expression}` : parts ? `${Array.from(parts).join('.')}:${expression}` : '';
    if (key === this.portraitKeys[side]) return;
    this.portraitKeys[side] = key;
    const face = this.faces[side]; if (face.timer !== null) this.clearTimer(face.timer); face.timer = null;
    if (!set && (!parts || !this.composer) || set && !this.load) { this.dropFrames(side); box.hidden = true; return; }
    // a famous NPC's own picture: where its talk shows it (live keeps the one picture from the talk to the result), on
    // the whole screen (its art reaches past the portrait's box), unmirrored
    Object.assign(box.style, set ? { left: '0', top: '0', width: '100%', height: '100%', transform: '' }
      : { left: `${portraitLeft(side, parts![0] === 1) / 1024 * 100}%`, top: '', width: '', height: '', transform: side === 0 ? 'scaleX(-1)' : '' });
    const frames = this.portraitFrames(side, parts, set, expression)!;
    void frames.then(async composed => {
      if (this.portraitKeys[side] !== key || !composed[1]) return;
      // each frame a picture of its own, decoded before it can show, so a blink never waits on one
      const frames: Partial<Record<EyeFrame, HTMLImageElement>> = {};
      await Promise.all(([1, 2, 3] as const).map(async f => {
        const c = composed[f]; if (!c) return;
        const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.style.visibility = 'hidden'; img.src = await canvasUrl(c);
        await img.decode().catch(() => {}); frames[f] = img;
      }));
      if (this.portraitKeys[side] !== key || this.abort.signal.aborted || !frames[1]) { for (const img of Object.values(frames)) URL.revokeObjectURL(img.src); return; }
      this.dropFrames(side); face.frames = frames; box.append(...Object.values(frames)); box.dataset.parts = key.replace(/:.*$/, ''); box.dataset.expression = expression;
      this.showEyes(side, 1); box.hidden = false;
      this.blink(side);
    }).catch(() => { box.hidden = true; });
  }
  private showEyes(side: 0 | 1, frame: EyeFrame): void {
    const box = this.portraits[side], frames = this.faces[side].frames, shown = frames[frame] ? frame : 1;
    if (!frames[shown]) return;
    for (const [f, img] of Object.entries(frames)) img.style.visibility = Number(f) === shown ? '' : 'hidden';
    box.dataset.eyes = String(frame);
  }
  /** The portrait blinks as the original's does (duel-portrait.ts blinkSchedule); with reduced motion its eyes stay open. */
  private blink(side: 0 | 1): void {
    const face = this.faces[side];
    if (face.timer !== null) { this.clearTimer(face.timer); face.timer = null; }
    if (!face.frames[1]) return;
    this.showEyes(side, 1);
    if (this.reduced || !face.frames[2] || !face.frames[3]) return;
    const steps = blinkSchedule(this.random);
    const next = (i: number) => {
      if (i >= steps.length) { this.portraits[side].dataset.blinks = String(Number(this.portraits[side].dataset.blinks ?? 0) + 1); this.blink(side); return; }
      const [frame, ms] = steps[i]!;
      this.showEyes(side, frame);
      face.timer = this.setTimer(() => next(i + 1), ms);
    };
    next(0);
  }

  /** Show a card in the box (live's card information box: a card the player asked about, a card a list or a question
   * refers to); one not on the field stays until the pointer picks another card. */
  showCard(card: CardView | null): void {
    if (!card) return;
    if (this.duel?.cards.some(c => c.id === card.id)) { this.shown = card.id; this.pinned = null; } else this.pinned = card;
    this.renderInfo();
  }
  private pinned: CardView | null = null;
  // the box's furniture (live's CCardDetailViewDlg in the duel): kept, only its lines and stats change
  private lines = document.createElement('div'); private run = document.createElement('div'); private statsRow = document.createElement('div');
  private thumb: HTMLElement | null = null; private scrollTop = 0;
  /** A crop (sx, sy, sw, sh) of an archive sheet (sheetW x sheetH) placed at x, y, w, h game px in the box. */
  private crop(path: string, sheetW: number, sheetH: number, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number): HTMLElement {
    const box = document.createElement('div'), g = (v: number) => `calc(${v} * var(--px))`; box.className = 'de-crop';
    Object.assign(box.style, { left: g(x), top: g(y), width: g(w), height: g(h) });
    const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.style.visibility = 'hidden';
    Object.assign(img.style, { width: `${sheetW / sw * 100}%`, height: `${sheetH / sh * 100}%`, left: `${-sx / sw * 100}%`, top: `${-sy / sh * 100}%` });
    this.load?.(path, this.abort.signal).then(lease => { img.onload = () => { img.style.visibility = ''; }; img.src = lease.url; this.leases.push(lease); }, () => {});
    box.append(img); return box;
  }
  private leases: { release(): void }[] = [];
  private buildInfo(): void {
    if (!this.load) return;
    const div = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };
    const frame = div('de-duel-info-frame'); frame.append(document.createElement('div'));
    const bar = div('de-duel-info-bar'), BAR = 'data/common/window/iconbar_01_c01.png';
    bar.append(this.crop(BAR, 72, 24, 0, 0, 8, 24, 0, 0, 8, 24), this.crop(BAR, 72, 24, 8, 0, 8, 24, 8, 0, 232, 24), this.crop(BAR, 72, 24, 16, 0, 8, 24, 240, 0, 8, 24));
    const key = this.crop('data/common/window/icon_01_c01.png', 48, 96, 0, 48, 16, 24, 229, 0, 16, 24); key.className += ' de-duel-info-key'; key.setAttribute('aria-hidden', 'true');
    this.lines.className = 'de-duel-info-lines'; this.run.className = 'de-duel-info-run'; this.lines.append(this.run);
    this.lines.addEventListener('wheel', e => { e.preventDefault(); this.scrollBy(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    // the text field's scroll bar (scroll_01_c00: the track 48,0 stretched, the arrows 0,0 / 0,16, the thumb 0,32..56)
    const sb = div('de-duel-info-sb'), SB = 'data/common/window/scroll_01_c00.png';
    const up = this.crop(SB, 64, 120, 0, 0, 16, 16, 0, 0, 16, 16), down = this.crop(SB, 64, 120, 0, 16, 16, 16, 0, 64, 16, 16);
    up.className += ' up'; down.className += ' down'; up.onclick = () => this.scrollBy(-1); down.onclick = () => this.scrollBy(1);
    const thumb = div('de-crop'); thumb.style.cssText = 'left:0;width:calc(16 * var(--px));height:calc(16 * var(--px))';
    thumb.append(this.crop(SB, 64, 120, 0, 32, 16, 8, 0, 0, 16, 8), this.crop(SB, 64, 120, 0, 48, 16, 8, 0, 8, 16, 8));
    this.thumb = thumb;
    sb.append(this.crop(SB, 64, 120, 48, 0, 16, 16, 0, 0, 16, 80), up, down, thumb);
    this.statsRow.className = 'de-duel-info-stats';
    this.info.append(frame, bar, key, this.lines, sb, this.statsRow);
    this.placeThumb();
  }
  /** The text a line (16 px) a step, within the lines past the box's five. */
  private scrollBy(lines: number): void {
    const line = Math.max(1, this.lines.clientHeight / 5), max = Math.max(0, Math.ceil(this.run.offsetHeight / line - 0.01) - 5);
    const top = Math.max(0, Math.min(max, this.scrollTop + lines)); if (top === this.scrollTop) return;
    this.scrollTop = top; this.run.style.top = `calc(${-16 * top} * var(--px))`; this.placeThumb(max);
  }
  private placeThumb(max = 0): void { if (this.thumb) this.thumb.style.top = `calc(${16 + (max > 0 ? Math.round(32 * this.scrollTop / max) : 0)} * var(--px))`; }
  private renderInfo(): void {
    const onField = this.shown ? this.duel?.cards.find(c => c.id === this.shown) : undefined;
    const card: CardView | undefined = this.pinned ?? (onField && (onField.faceUp || onField.controller === 0 && onField.passcode !== undefined) ? onField : undefined);
    const visible = card && card.name && card.name !== 'Hidden card' ? card : undefined;
    const key = visible ? `${visible.id}:${visible.passcode}:${visible.attack}:${visible.defense}` : '';
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.scrollTop = 0; this.run.style.top = '0'; this.placeThumb();
    // without the art: the plain box, only while a card shows
    if (!this.load) { this.info.replaceChildren(); this.info.hidden = !visible; this.info.append(this.run); }
    this.run.replaceChildren(); this.statsRow.replaceChildren();
    if (!visible) { delete this.info.dataset.cardId; return; }
    this.info.dataset.cardId = visible.id;
    const div = (cls: string, text: string) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
    this.run.append(div('de-duel-info-name', visible.name));
    const kind = cardKindLine(visible); if (kind) this.run.append(div('de-duel-info-kind', kind));
    this.run.append(div('de-duel-info-text', visible.description ?? ''));
    const stats = this.stats(visible);
    if (this.load) this.statsRow.append(...Array.from(stats.childNodes)); else this.info.append(stats);
  }
  private icon(sheet: string, index: number): HTMLElement {
    const box = document.createElement('span'); box.className = 'de-duel-info-icon';
    const img = document.createElement('img'); img.alt = ''; img.style.left = `${-index * 16}px`; box.append(img);
    this.load?.(`data/y/duel/card/${sheet}`, this.abort.signal).then(lease => { img.src = lease.url; img.onload = img.onerror = () => lease.release(); }, () => box.remove());
    return box;
  }
  private stats(card: CardView): HTMLElement {
    const row = document.createElement('div'); row.className = 'de-duel-info-stats';
    if (isMonster(card)) {
      const race = RACES.indexOf(String(card.race ?? '')), attribute = ATTRIBUTES.indexOf(String(card.attribute ?? '').toLowerCase());
      if (race >= 0) row.append(this.icon('icon_syuzoku.png', race));
      if (attribute >= 0) row.append(this.icon('icon_zokusei.png', attribute));
      const star = document.createElement('img'); star.className = 'de-duel-info-star'; star.alt = '';
      this.load?.('data/y/duel/card/icon_star_01.png', this.abort.signal).then(lease => { star.src = lease.url; star.onload = star.onerror = () => lease.release(); }, () => star.remove());
      const text = document.createElement('span');
      text.textContent = `${card.level ?? '?'} ATK${card.attack ?? '?'}/DEF${card.defense ?? '?'}`;
      row.append(star, text);
    } else row.append(this.icon('icon_zokusei.png', /^Trap/.test(card.type ?? '') ? 8 : 7));
    return row;
  }
}

/** A famous NPC's picture (npc-waistup.ts: the csv's tiles where live's CWaistUpNpc puts them, 874 - x, 0 at full size,
 * unmirrored), each eye frame a 1024 x 768 canvas, the screen: frames 1..3 the eyes open, half shut and shut, 4..6 the
 * same for the beaten face (gritted teeth, a sweat drop). */
export async function npcPortraitFrames(load: ArchiveLoader, set: string, expression: Expression, signal: AbortSignal): Promise<Partial<Record<EyeFrame, HTMLCanvasElement>>> {
  const first = expression === 'lose' ? 3 : 0;
  const [f1, f2, f3] = await npcWaistUpCanvases(load, set, [1 + first, 2 + first, 3 + first] as NpcWaistUpFrame[], signal);
  return { 1: f1, 2: f2, 3: f3 };
}
