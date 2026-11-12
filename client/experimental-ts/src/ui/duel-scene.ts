import type { CardView, DuelCardView, DuelView } from './contracts';
import { DuelFx, type ArchiveLoader } from './duel-fx';
import { WaistUpComposer, blinkSchedule, canvasUrl, type EyeFrame, type Expression } from './duel-portrait';
import { fieldCardPosition } from './helpers';

/** The original duel screen's furniture around the field, with its art: the two waist-up portraits between the backdrop
 * and the zone frames (the opponent's on the right: the `_r` pose as drawn; the player's on the left: the `_l` pose
 * mirrored, so both face the field; measured against captures of the original), the card
 * information box at the bottom left (name, [race/kind/attribute], text, race and attribute icons, level, ATK/DEF:
 * data/y/duel/card/icon_syuzoku.png 21 × 16 px in YO2 race order, icon_zokusei.png 10 × 16 px, icon_star_01.png) and
 * the effects layer (src/ui/duel-fx.ts). The nodes persist across renders: a render re-attaches them to the new board. */

const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast', 'Beast-Warrior',
  'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ATTRIBUTES = ['light', 'dark', 'water', 'fire', 'earth', 'wind', 'divine'];
/** Where the composed 768×768 portrait sits on the 1024×768 screen, measured from captures of the original. */
export const PORTRAIT_PLACE: Record<0 | 1, { x: number; y: number }> = { 0: { x: -230, y: 26 }, 1: { x: 562, y: 24 } };
/** The original draws the 768-pixel composition at about 0.9 (eye spacing 52-54 px on the 1024×768 screen). */
export const PORTRAIT_SCALE = 0.9;

const CSS = `
/* the card box where live's duel screen has it: the bottom left beside the chat, over the bar (6 lines of the engine's
   16 px Arial: name, kind, 3 of text, the stats) */
.de-duel-board>.de-duel-info { top:${614 / 768 * 100}%; height:${120 / 768 * 100}%; left:${4 / 1024 * 100}%; width:${248 / 1024 * 100}%; font:15px/16px Arial,'Segoe UI',sans-serif; letter-spacing:.03em; }
:is(.de-duel-board,.de-janken-scene)>.de-duel-portrait { position:absolute; inset:auto; width:${768 * PORTRAIT_SCALE / 1024 * 100}%; height:${768 * PORTRAIT_SCALE / 768 * 100}%; pointer-events:none; z-index:0; }
.de-duel-portrait>img { position:absolute; inset:0; width:100%; height:100%; display:block; }
.de-duel-fx { position:absolute; inset:0; pointer-events:none; z-index:7; }
.de-duel-fx>.de-duel-fx-layer { position:absolute; inset:0; }
.de-duel-board>.de-duel-stats { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:6; }
.de-duel-stats>i { position:absolute; width:${7 / 1024 * 100}%; height:${16 / 768 * 100}%; background-repeat:no-repeat; }
.de-duel-info { position:absolute; left:${6 / 1024 * 100}%; top:${496 / 768 * 100}%; width:${240 / 1024 * 100}%; height:${122 / 768 * 100}%; z-index:8;
  box-sizing:border-box; padding:.35em .5em; overflow-x:hidden; overflow-y:auto; scrollbar-width:auto; pointer-events:auto; font:13px/1.25 Arial,'Segoe UI',sans-serif; color:#2a2f38;
  background:linear-gradient(180deg,rgba(236,246,255,.9),rgba(214,232,250,.86)); border:1px solid #6fb3ea; border-radius:3px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }
.de-duel-info[hidden] { display:none; }
.de-duel-info-name { color:#8a7d1e; letter-spacing:.02em; }
.de-duel-info-kind { color:#62862a; }
/* live: the whole text, its scroll bar at the box's right (no cut with an ellipsis) */
.de-duel-info-text { word-break:break-word; }
.de-duel-info-stats { display:flex; margin-top:.2em; align-items:center; gap:2px; white-space:nowrap; font-weight:bold; }
.de-duel-info-icon { width:16px; height:16px; overflow:hidden; position:relative; flex:none; }
.de-duel-info-icon img { position:absolute; top:0; height:16px; }
.de-duel-info-star { width:19px; height:16px; flex:none; }
.de-duel-info-stats span { margin-left:4px; }
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

  constructor(private readonly load: ArchiveLoader | null, options: DuelPresentationOptions = {}) {
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? (id => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.fx = new DuelFx(load);
    this.composer = load ? new WaistUpComposer(load) : null;
    this.portraits = [0, 1].map((side): HTMLElement => {
      const c = document.createElement('div'); c.className = `de-duel-portrait side-${side}`; c.setAttribute('aria-hidden', 'true');
      const at = PORTRAIT_PLACE[side as 0 | 1]; c.style.left = `${at.x / 1024 * 100}%`; c.style.top = `${at.y / 768 * 100}%`; c.hidden = true;
      // The art faces left: the player's portrait is the mirrored composition of the other pose.
      if (side === 0) c.style.transform = 'scaleX(-1)';
      return c;
    }) as [HTMLElement, HTMLElement];
    this.info = document.createElement('aside'); this.info.className = 'de-duel-info'; this.info.setAttribute('aria-label', 'Card information'); this.info.hidden = true;
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
      if (id && id !== this.hovered) { this.hovered = id; this.shown = id; this.pinned = null; this.renderInfo(); }
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
    // live lights "Now Thinking" for the other side while it decides (the player's own plate stays grey)
    const thinking = thinkingSide(duel); this.fx.thinking = duel.spectating ? thinking : thinking === 1 ? 1 : null;
    // the loser's face at the duel's end (live: the result screen's sweating, gritted-teeth portrait)
    const loser = duel.ended === 'Victory' ? 1 : duel.ended === 'Defeat' ? 0 : -1;
    for (const side of [0, 1] as const) this.portrait(side, duel.players[side].parts, side === loser ? 'lose' : 'normal');
    this.drawStats();
  }
  private lastCue: number | null = null;
  dispose(): void {
    for (const side of [0, 1] as const) { const face = this.faces[side]; if (face.timer !== null) this.clearTimer(face.timer); face.timer = null; this.dropFrames(side); }
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
  private portrait(side: 0 | 1, parts: Uint8Array | undefined, expression: Expression = 'normal'): void {
    const box = this.portraits[side], key = parts ? `${Array.from(parts).join('.')}:${expression}` : '';
    if (key === this.portraitKeys[side]) return;
    this.portraitKeys[side] = key;
    const face = this.faces[side]; if (face.timer !== null) this.clearTimer(face.timer); face.timer = null;
    if (!parts || !this.composer) { this.dropFrames(side); box.hidden = true; return; }
    void this.composer.composeFrames(parts, side === 0 ? 1 : 0, this.abort.signal, expression).then(async composed => {
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
  private renderInfo(): void {
    const onField = this.shown ? this.duel?.cards.find(c => c.id === this.shown) : undefined;
    const card: CardView | undefined = this.pinned ?? (onField && (onField.faceUp || onField.controller === 0 && onField.passcode !== undefined) ? onField : undefined);
    const visible = card && card.name && card.name !== 'Hidden card' ? card : undefined;
    const key = visible ? `${visible.id}:${visible.passcode}:${visible.attack}:${visible.defense}` : '';
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.info.replaceChildren();
    this.info.hidden = !visible;
    if (!visible) return;
    this.info.dataset.cardId = visible.id;
    const div = (cls: string, text: string) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
    this.info.append(div('de-duel-info-name', visible.name));
    const kind = cardKindLine(visible); if (kind) this.info.append(div('de-duel-info-kind', kind));
    this.info.append(div('de-duel-info-text', visible.description ?? ''));
    this.info.append(this.stats(visible));
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
