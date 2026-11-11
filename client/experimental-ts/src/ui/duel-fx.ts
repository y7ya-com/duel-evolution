import type { DuelCue, DuelCuePlace, DuelView } from './contracts';
import { fieldCardPosition } from './helpers';
import { parseSwfText, SwfInstance, type SwfColor, type SwfMovie } from '../duel/swf-text';

/** The duel's effects layer with the original art: summon / set / flip / activation / attack / destruction / tribute
 * movies and sprites, LP damage digits, phase-name and turn banners, chain-link plaques, coin and die tosses and the
 * field-spell title. Everything is drawn on one 1024×768 canvas over the board (the original screen's coordinates).
 * Cues come from the duel view (src/duel/cues.ts); each id plays once. With reduced motion nothing moves: banners,
 * digits, plaques and toss results are shown still for a moment and the movies are not played.
 * Original sources: data/y/duel/effect (SWF text movies and sheet lists), data/y/duel/phase_name, data/y/duel/font
 * (damage00/01: 12 glyphs of 16×40, "0123456789+-"), data/y/duel/chain (cha_ani appear frames, cha_hyou plaque
 * frames, chain_font 10 digits of 10×22), data/y/duel/field (fie_*_fe titles, field.txt order). */

export type ArchiveLoader = (path: string, signal: AbortSignal) => Promise<{ url: string; release(): void }>;
export interface DuelFxOptions { now?: () => number; requestFrame?: (cb: FrameRequestCallback) => number; cancelFrame?: (id: number) => void }

const E = 'data/y/duel/effect/';
const PHASE_ART: Record<NonNullable<DuelCue['phase']>, string> = { draw: 'dr', standby: 'st', main1: 'm1', battle: 'ba', main2: 'm2', end: 'en' };
/** Original field-theme kinds (src/duel/theme.ts) in data/y/duel/field/field.txt order; titles are fie_<name>_fe.png. */
const FIELD_TITLES = ['mori', 'kouya', 'yama', 'sougen', 'umi', 'yami', 'sanctu', 'gaia', 'water', 'burn', 'desert', 'shine', 'dark', 'fusion', 'shine', 'umi', 'kouya', 'dark', 'sanctu', 'desert', 'fusion', 'yami'];
const MAX_ANIMS = 24, MAX_TINTS = 96, MAX_ART = 256;
/** The "Now Thinking" movies (blue: the player's, pink: the opponent's) and where their 160×64 frame goes on the
 * 1024×768 screen: under each LP plate, measured against live's duel screen. */
const THINKING = { 0: 'data/y/duel/field/duel_thinkicon_a01_c01_j.txt', 1: 'data/y/duel/field/duel_thinkicon_a01_c02_j.txt' } as const;
const THINKING_AT = { 0: { x: -15, y: 52 }, 1: { x: 1024 - 160 + 15, y: 52 } } as const;
/** One frame of the original's 60 Hz game loop. */
const FRAME = 1000 / 60;
/** CBattleManager state 4 (client/src/duel/SceneBattleManager.cpp): aim 8 frames, flight to frame 16, then the hit; the
 * attack movie (duel_ef_attack_a) runs on at its own rate, at most this long. */
export const ATTACK = { aim: 8 * FRAME, hit: 16 * FRAME, movie: 700 };
const BANNERS = new Set<DuelCue['kind']>(['phase', 'turn', 'field']);

interface Anim { cue: DuelCue; start: number; duration: number; draw(ctx: CanvasRenderingContext2D, t: number): void }
interface Art { image: HTMLImageElement | null; failed: boolean; lease: { release(): void } | null }
type Point = { x: number; y: number; w: number; h: number };

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - (1 - t) * (1 - t);

export class DuelFx {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly abort = new AbortController();
  private readonly art = new Map<string, Art>();
  private readonly movies = new Map<string, SwfMovie | null>();
  private readonly tints = new Map<string, HTMLCanvasElement>();
  private anims: Anim[] = [];
  /** Chain links shown on their cards until they resolve (or the chain/turn ends). */
  private chain = new Map<number, { at: DuelCuePlace; start: number; leaving: number | null }>();
  private seen = 0;
  private duel: DuelView | null = null;
  private reduced = false;
  private frame = 0;
  private disposed = false;
  readonly played: Record<string, number> = {};
  private readonly clock: () => number;
  /** The duel speed (main's duelspeed.js: 1x the 2008 pacing, 1.5x, 2x): the effects' clock runs this much faster.
   * A virtual clock, so a change mid-animation carries on from where it is instead of jumping. */
  private speedK = 1; private base = 0; private virt = 0;
  private now(): number { const t = this.clock(); return this.virt + (t - this.base) * this.speedK; }
  get speed(): number { return this.speedK; }
  set speed(k: number) { const v = this.now(); this.base = this.clock(); this.virt = v; this.speedK = k > 0 ? k : 1; }
  private readonly requestFrame: (cb: FrameRequestCallback) => number;
  private readonly cancelFrame: (id: number) => void;

  constructor(private readonly load: ArchiveLoader | null, options: DuelFxOptions = {}) {
    this.element = document.createElement('div'); this.element.className = 'de-duel-fx'; this.element.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas'); this.canvas.width = 1024; this.canvas.height = 768; this.element.append(this.canvas);
    this.ctx = this.canvas.getContext?.('2d') ?? null;
    this.clock = options.now ?? (() => performance.now()); this.base = this.virt = this.clock();
    this.requestFrame = options.requestFrame ?? (cb => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? (id => cancelAnimationFrame(id));
  }

  /** New duel view: play its unseen cues. Ids only grow within a client, so a lower id means a new client session. */
  update(duel: DuelView, reducedMotion: boolean): void {
    if (this.disposed) return;
    if (!this.duel) this.preload();
    this.duel = duel; this.reduced = reducedMotion;
    const cues = duel.cues ?? [];
    if (cues.length && cues[cues.length - 1]!.id < this.seen) this.seen = 0;
    for (const cue of cues) if (cue.id > this.seen) { this.seen = cue.id; this.play(cue); }
    this.element.dataset.played = Object.entries(this.played).map(([k, n]) => `${k}:${n}`).join(' ');
    this.schedule();
  }
  /** A new duel: drop running effects and chain plaques. */
  clear(): void { this.anims = []; this.chain.clear(); this.bannerFree = 0; this.schedule(); }
  dispose(): void {
    this.disposed = true; this.abort.abort(); if (this.frame) this.cancelFrame(this.frame); this.frame = 0;
    for (const a of this.art.values()) { a.lease?.release(); if (a.image) a.image.removeAttribute('src'); }
    this.art.clear(); this.tints.clear(); this.movies.clear(); this.anims = []; this.chain.clear();
  }

  // ---- assets ----
  private image(path: string): HTMLImageElement | null {
    const known = this.art.get(path);
    if (known) return known.image;
    if (!this.load || this.art.size >= MAX_ART) return null;
    const entry: Art = { image: null, failed: false, lease: null }; this.art.set(path, entry);
    this.load(path, this.abort.signal).then(lease => {
      if (this.disposed) { lease.release(); return; }
      entry.lease = lease;
      const image = new Image(); image.decoding = 'async';
      image.onload = () => { entry.image = image; this.schedule(); };
      image.onerror = () => { entry.failed = true; };
      image.src = lease.url;
    }, () => { entry.failed = true; });
    return null;
  }
  private movie(path: string): SwfMovie | null {
    if (this.movies.has(path)) return this.movies.get(path) ?? null;
    if (!this.load) return null;
    this.movies.set(path, null);
    this.load(path, this.abort.signal).then(async lease => {
      try {
        const bytes = await (await fetch(lease.url)).arrayBuffer();
        let text: string; try { text = new TextDecoder('shift_jis').decode(bytes); } catch { text = new TextDecoder().decode(bytes); }
        const movie = parseSwfText(text);
        // a file table's '?' is the language letter (duel_thinkicon_n03_c01_?.png): the English art, as live's client is
        movie.files = movie.files.map(f => f.replace('?', 'e'));
        for (const file of movie.files) this.image(path.replace(/[^/]+$/, '') + file);
        if (!this.disposed) this.movies.set(path, movie);
      } finally { lease.release(); }
    }).catch(() => {});
    return null;
  }
  /** Everything the common effects draw, fetched when the duel screen first appears so the first summon or attack is not
   * lost to loading (a few dozen small archive entries). */
  private preload(): void {
    const sides = ['b', 'r'];
    this.want(`${E}duel_ef_attack_a.txt`, `${E}duel_ef_break_a.txt`, `${E}duel_ef_break_a_yoko.txt`, `${E}duel_ef_kouka_mon_a.txt`, `${E}duel_ef_kouka_mgc_a.txt`,
      `${E}duel_ef_kouka_trp_a.txt`, `${E}eff_rainbow.png`, `${E}card_pika_h.png`, 'data/y/duel/font/damage00.png', 'data/y/duel/font/damage01.png',
      ...['y', 'b'].flatMap(c => [`${E}eff_set_${c}.png`, `${E}eff_star0_${c}.png`, `${E}eff_star1_${c}.png`]),
      ...sides.flatMap(c => [...Object.values(PHASE_ART).map(p => `data/y/duel/phase_name/e_${p}_${c}.png`), `data/y/duel/phase_name/nex_e_${c}.png`,
        ...Array.from({ length: 8 }, (_, i) => `data/y/duel/phase_name/nex_e_${c}${i + 1}.png`)]));
  }
  /** Preload what an effect needs so its first frame is not lost. */
  private want(...paths: string[]): void { for (const p of paths) p.endsWith('.txt') ? this.movie(p) : this.image(p); }

  // ---- geometry ----
  private where(at: DuelCuePlace | undefined): Point {
    if (!at) return { x: 512, y: 318, w: 58, h: 84 };
    const handCount = at.zone === 'hand' ? (this.duel?.cards ?? []).filter(c => c.controller === at.controller && c.zone === 'hand').length : 0;
    const p = fieldCardPosition({ id: '', name: '', controller: at.controller, zone: at.zone, index: at.index, faceUp: true }, handCount);
    return { x: p.x, y: p.y, w: p.width, h: p.height };
  }
  /** Where a player's LP digits go: under their LP plate (the player's at the top left, the opponent's top right). */
  private lpPoint(player: 0 | 1): Point { return { x: player ? 840 : 184, y: 92, w: 0, h: 0 }; }

  // ---- cues ----
  /** When the banner line (phase names, next turn, field titles) is free again: banners play one after another. */
  private bannerFree = 0;
  private push(cue: DuelCue, duration: number, draw: Anim['draw']): void {
    this.played[cue.kind] = (this.played[cue.kind] ?? 0) + 1;
    let start = this.now();
    if (BANNERS.has(cue.kind)) {
      // Phases the server sends back to back show in turn; far behind (a fast opponent turn), the line catches up.
      if (this.bannerFree - start > 1600) { this.anims = this.anims.filter(a => !BANNERS.has(a.cue.kind)); this.bannerFree = start; }
      start = Math.max(start, this.bannerFree); this.bannerFree = start + duration * 0.7;
    }
    this.anims.push({ cue, start, duration, draw });
    if (this.anims.length > MAX_ANIMS) this.anims.splice(0, this.anims.length - MAX_ANIMS);
  }
  private play(cue: DuelCue): void {
    const mine = cue.player === 0, side = mine ? 'b' : 'r';
    switch (cue.kind) {
      case 'start': this.clear(); return;
      case 'phase': {
        if (!cue.phase) return;
        const base = `data/y/duel/phase_name/e_${PHASE_ART[cue.phase]}_${side}`, sparkle = cue.phase === 'battle' ? Array.from({ length: 7 }, (_, i) => `${base}${i + 1}.png`) : [];
        this.want(`${base}.png`, ...sparkle);
        return this.push(cue, this.reduced ? 900 : 1100, (ctx, t) => this.banner(ctx, `${base}.png`, sparkle, t, this.reduced ? 900 : 1100, mine ? 412 : 233));
      }
      case 'turn': {
        this.chain.clear();
        const base = `data/y/duel/phase_name/nex_e_${side}`, frames = Array.from({ length: 8 }, (_, i) => `${base}${i + 1}.png`);
        this.want(`${base}.png`, ...frames);
        return this.push(cue, 1200, (ctx, t) => this.banner(ctx, `${base}.png`, frames, t, 1200, 318));
      }
      case 'damage': case 'recover': {
        const sheet = `data/y/duel/font/damage0${cue.kind === 'damage' ? 0 : 1}.png`; this.want(sheet);
        const text = `${cue.kind === 'damage' ? '-' : '+'}${cue.value ?? 0}`, at = this.lpPoint(cue.player);
        return this.push(cue, 1400, (ctx, t) => {
          const k = this.reduced ? 1 : clamp(t / 180), out = clamp((t - 1100) / 300), scale = this.reduced ? 1 : 1.6 - 0.6 * ease(k);
          ctx.globalAlpha = 1 - out; this.digits(ctx, sheet, text, at.x, at.y - (this.reduced ? 0 : 14 * ease(clamp(t / 1400))), scale, 16, 40, '0123456789+-');
        });
      }
      case 'attack': {
        const movie = `${E}duel_ef_attack_a.txt`, arrow = `${E}duel_ef_attackIcon_a.png`, hit = `${E}duel_ef_attackIcon_a_hit.png`; this.want(movie, arrow, hit);
        const from = this.where(cue.at);
        // CBattleManager::draw: a direct attack hits the defending player's side (y 0x40 or 0x218), scaled by the attacker's ATK.
        const atk = this.duel?.cards.find(c => c.controller === cue.at?.controller && c.zone === 'monster' && c.index === cue.at?.index)?.attack ?? 1000;
        const to = cue.direct ? { x: 512, y: cue.player === 0 ? 0x40 : 0x218, w: 0, h: 0 } : this.where(cue.target);
        const scale = cue.direct ? atk < 1000 ? 1 : atk < 2000 ? 2 : 3 : 1;
        if (this.reduced) return this.push(cue, 600, (ctx, t) => this.ring(ctx, to, t / 600, '#ffd24a'));
        // State 4 of CBattleManager (its counter +0x10 a frame to 0x200, 32 frames): the attacker's arrow turns to the
        // target (frames 0..8), flies there on a 1 - cos ease (8..16), then the hit: the movie starts at the target,
        // turned the way the arrow flew, and the hit mark shows (full for 8 frames, fading over 8).
        const up = (ax: number, ay: number, bx: number, by: number) => Math.atan2(bx - ax, -(by - ay));
        const flight = up(from.x, from.y, to.x, to.y), opponent = cue.player === 1;
        return this.push(cue, ATTACK.hit + ATTACK.movie, (ctx, t) => {
          if (t < ATTACK.aim) {
            const k = t / ATTACK.aim, rot = opponent ? Math.PI - Math.atan2(to.x - from.x, to.y - from.y) * k : flight * k;
            this.sprite(ctx, arrow, from.x, from.y, rot, 1);
          } else if (t < ATTACK.hit) {
            const e = 1 - Math.cos((t - ATTACK.aim) / (ATTACK.hit - ATTACK.aim) * Math.PI / 2);
            const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
            this.sprite(ctx, arrow, x, y, Math.hypot(to.x - x, to.y - y) > 1 ? up(x, y, to.x, to.y) : flight, 1);
          } else {
            this.playMovie(ctx, movie, t - ATTACK.hit, to.x, to.y, scale, flight);
            const f = (t - ATTACK.hit) / FRAME;
            if (f < 16) this.sprite(ctx, hit, to.x, to.y, flight, clamp(2 - f / 8));
          }
        });
      }
      case 'destroy': case 'tribute': {
        const yoko = cue.defense ? '_yoko' : '';
        const movie = cue.kind === 'tribute' ? `data/y2/duel/effect/duel_ef_ikenie_a${yoko}.txt` : `${E}duel_ef_break_a${yoko}.txt`;
        this.want(movie); const at = this.where(cue.at);
        if (this.reduced) return this.push(cue, 500, (ctx, t) => this.ring(ctx, at, t / 500, '#ff6a3a'));
        return this.push(cue, 900, (ctx, t) => this.playMovie(ctx, movie, t, at.x, at.y, 1));
      }
      case 'activate': {
        const kind = cue.cardKind === 'spell' ? 'mgc' : cue.cardKind === 'trap' ? 'trp' : 'mon';
        const movie = `${E}duel_ef_kouka_${kind}_a.txt`; this.want(movie);
        if (cue.link && cue.at) {
          this.chain.set(cue.link, { at: cue.at, start: this.now(), leaving: null });
          this.want(...Array.from({ length: 15 }, (_, i) => `data/y/duel/chain/cha_ani_e${String(i + 1).padStart(2, '0')}.png`),
            ...Array.from({ length: 9 }, (_, i) => `data/y/duel/chain/cha_hyou_e${i + 1}.png`), 'data/y/duel/chain/chain_font.png');
        }
        const at = this.where(cue.at);
        if (this.reduced) return this.push(cue, 500, (ctx, t) => this.ring(ctx, at, t / 500, kind === 'mon' ? '#ffcf3a' : '#5ad0ff'));
        return this.push(cue, 700, (ctx, t) => this.playMovie(ctx, movie, t, at.x, at.y, 1));
      }
      case 'chain-run': {
        const link = cue.link === undefined ? undefined : this.chain.get(cue.link);
        if (link) link.leaving = this.now();
        this.played[cue.kind] = (this.played[cue.kind] ?? 0) + 1;
        return;
      }
      case 'summon': {
        const at = this.where(cue.at), rainbow = `${E}eff_rainbow.png`, stars = [`${E}eff_star0_y.png`, `${E}eff_star1_y.png`]; this.want(rainbow, ...stars);
        return this.push(cue, this.reduced ? 400 : 700, (ctx, t) => this.sparkle(ctx, at, t, this.reduced ? 400 : 700, rainbow, stars));
      }
      case 'set': {
        const at = this.where(cue.at), c = cue.at?.zone === 'monster' ? 'y' : 'b';
        const ring = `${E}eff_set_${c}.png`, stars = [`${E}eff_star0_${c}.png`, `${E}eff_star1_${c}.png`]; this.want(ring, ...stars);
        return this.push(cue, this.reduced ? 400 : 600, (ctx, t) => this.sparkle(ctx, at, t, this.reduced ? 400 : 600, ring, stars));
      }
      case 'flip': {
        const at = this.where(cue.at), flash = `${E}card_pika_h.png`; this.want(flash);
        return this.push(cue, 450, (ctx, t) => { const img = this.image(flash); if (!img) return; ctx.globalAlpha = 1 - clamp(t / 450); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(img, at.x - at.w / 2, at.y - at.h / 2, at.w, at.h); });
      }
      case 'coin': {
        const sheet = `${E}duel_ef_coin.png`, shadow = `${E}duel_ef_coin_kage.png`; this.want(sheet, shadow);
        const faces = cue.values?.length ? cue.values : [1], at = cue.at ? this.where(cue.at) : { x: 512, y: 318, w: 0, h: 0 };
        return this.push(cue, this.reduced ? 1400 : 2200, (ctx, t) => this.coins(ctx, sheet, faces, at, t));
      }
      case 'dice': {
        const spin = `${E}dice_random.png`, face = `${E}dice_decide${clamp(cue.value ?? 1, 1, 6)}.png`; this.want(spin, face);
        const at = cue.at ? this.where(cue.at) : { x: 512, y: 318, w: 0, h: 0 };
        return this.push(cue, this.reduced ? 1400 : 2000, (ctx, t) => this.die(ctx, spin, face, at, t));
      }
      case 'field': {
        const name = FIELD_TITLES[(cue.value ?? 0) - 1]; if (!name) return;
        const title = `data/y/duel/field/fie_${name}_fe.png`; this.want(title);
        return this.push(cue, 1800, (ctx, t) => this.banner(ctx, title, [], t, 1800, 318));
      }
    }
  }

  // ---- drawing ----
  private schedule(): void {
    if (this.disposed || this.frame || !this.ctx) return;
    this.frame = this.requestFrame(() => { this.frame = 0; this.draw(); });
  }
  /** Whose "Now Thinking" plate shows (data/y/duel/field/duel_thinkicon_a01_c0{1,2}_j.txt, a 30-frame loop at 30 fps):
   * the side whose decision the duel waits on, under its LP plate (the player's at the top left, the opponent's mirrored
   * at the top right), or none. */
  private thinkingSide: 0 | 1 | null = null; private thinkingFrom = 0;
  set thinking(side: 0 | 1 | null) {
    if (side === this.thinkingSide) return;
    this.thinkingSide = side; this.thinkingFrom = this.now();
    if (side !== null) this.movie(THINKING[side]);
    this.element.dataset.thinking = side === null ? '' : String(side);
    this.schedule();
  }
  get thinking(): 0 | 1 | null { return this.thinkingSide; }
  private draw(): void {
    const ctx = this.ctx; if (!ctx || this.disposed) return;
    const now = this.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1024, 768);
    this.anims = this.anims.filter(a => now - a.start < a.duration);
    let animating = this.anims.length > 0;
    if (this.thinkingSide !== null) {
      // the loop runs on the page's clock (the duel speed does not hurry a plate); reduced motion holds its lit frame
      const side = this.thinkingSide, path = THINKING[side], movie = this.movie(path), loop = movie ? movie.frameCount * 1000 / movie.frameRate : 1000;
      const t = this.reduced ? loop / 2 : (this.clock() - this.thinkingFrom) % loop;
      try { this.playMovie(ctx, path, t, THINKING_AT[side].x, THINKING_AT[side].y, 1); } catch { /* a broken asset never stops the duel */ }
      animating = animating || !this.reduced || !movie;
    }
    for (const [link, c] of this.chain) {
      if (c.leaving !== null && now - c.leaving > 450) { this.chain.delete(link); continue; }
      animating = this.plaque(ctx, link, c, now) || animating;
    }
    for (const a of this.anims) {
      if (now < a.start) continue;
      ctx.save();
      try { a.draw(ctx, now - a.start); } catch { /* a broken asset never stops the duel */ }
      ctx.restore();
    }
    const active = [...new Set([...this.anims.filter(a => now >= a.start).map(a => a.cue.kind), ...this.chain.size ? ['chain'] : []])].join(' ');
    if (this.element.dataset.active !== active) this.element.dataset.active = active;
    if (animating) this.schedule();
  }
  /** A banner (phase name, next turn, field title): slides in from the left with two after-images, holds, fades. Its
   * frames (battle sparkle, turn shine) play over the hold. */
  private banner(ctx: CanvasRenderingContext2D, path: string, frames: string[], t: number, duration: number, y: number): void {
    const img = this.image(path); if (!img) return;
    const inT = 220, outT = 260, x = 512 - img.width / 2;
    if (this.reduced) { ctx.globalAlpha = 1 - clamp((t - duration + 200) / 200); ctx.drawImage(img, x, y - img.height / 2); return; }
    const k = ease(clamp(t / inT)), out = clamp((t - duration + outT) / outT);
    for (const ghost of [2, 1]) {
      const g = ease(clamp((t - ghost * 40) / inT));
      if (g >= 1) continue;
      ctx.globalAlpha = 0.35 / ghost; ctx.drawImage(img, x - (1 - g) * 420, y - img.height / 2);
    }
    ctx.globalAlpha = k * (1 - out);
    ctx.drawImage(img, x - (1 - k) * 420 + out * 120, y - img.height / 2);
    if (frames.length && t > inT && out === 0) {
      const f = frames[Math.floor((t - inT) / 66) % frames.length]!, shine = this.image(f);
      if (shine) ctx.drawImage(shine, x, y - shine.height / 2);
    }
  }
  /** Glyph-strip digits (damage00/01, chain_font), centred on x. */
  private digits(ctx: CanvasRenderingContext2D, path: string, text: string, x: number, y: number, scale: number, w: number, h: number, glyphs: string): void {
    const img = this.image(path); if (!img) return;
    const total = text.length * w * scale;
    [...text].forEach((ch, i) => {
      const g = glyphs.indexOf(ch); if (g < 0) return;
      ctx.drawImage(img, g * w, 0, w, h, x - total / 2 + i * w * scale, y - h * scale / 2, w * scale, h * scale);
    });
  }
  /** The chain-link plaque on its card: cha_ani grows it in (15 frames), cha_hyou shimmers, chain_font the number. */
  private plaque(ctx: CanvasRenderingContext2D, link: number, c: { at: DuelCuePlace; start: number; leaving: number | null }, now: number): boolean {
    const at = this.where(c.at), t = now - c.start;
    const appear = this.reduced ? 14 : Math.min(14, Math.floor(t / 33));
    const path = appear < 14 ? `data/y/duel/chain/cha_ani_e${String(appear + 1).padStart(2, '0')}.png` : `data/y/duel/chain/cha_hyou_e${this.reduced ? 1 : Math.floor(t / 80) % 9 + 1}.png`;
    const img = this.image(path) ?? this.image('data/y/duel/chain/cha_hyou_e1.png');
    ctx.save();
    ctx.globalAlpha = c.leaving === null ? 1 : 1 - clamp((now - c.leaving) / 450);
    if (img) ctx.drawImage(img, at.x - img.width / 2, at.y - 30 - img.height / 2);
    if (appear >= 14) this.digits(ctx, 'data/y/duel/chain/chain_font.png', String(link), at.x, at.y + 4, 1.4, 10, 22, '0123456789');
    ctx.restore();
    return !this.reduced || c.leaving !== null;
  }
  /** summon.txt / set.txt: the rainbow (or set ring) over the card, stars bursting out of it. */
  private sparkle(ctx: CanvasRenderingContext2D, at: Point, t: number, duration: number, ring: string, stars: string[]): void {
    const k = clamp(t / duration), img = this.image(ring);
    ctx.globalCompositeOperation = 'lighter';
    if (img) {
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
      const s = this.reduced ? 1 : 0.8 + 0.4 * k, w = Math.max(at.w, img.width * 0.8) * s, h = Math.max(at.h, img.height * 0.8) * s;
      ctx.drawImage(img, at.x - w / 2, at.y - h / 2, w, h);
    }
    if (this.reduced) return;
    for (let i = 0; i < 10; i++) {
      const star = this.image(stars[i % stars.length]!); if (!star) continue;
      const angle = i / 10 * Math.PI * 2 + 0.3, r = 12 + ease(k) * 60;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(star, at.x + Math.cos(angle) * r - star.width / 2, at.y + Math.sin(angle) * r * 1.2 - star.height / 2);
    }
  }
  private ring(ctx: CanvasRenderingContext2D, at: Point, k: number, color: string): void {
    ctx.globalAlpha = 1 - clamp(k); ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.strokeRect(at.x - (at.w || 60) / 2 - 3, at.y - (at.h || 84) / 2 - 3, (at.w || 60) + 6, (at.h || 84) + 6);
  }
  /** A sprite centred on (x, y), turned `rot` radians (0 points up) at `alpha`. */
  private sprite(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, rot: number, alpha: number): void {
    const img = this.image(path); if (!img || alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
  }
  /** coin_new.txt: duel_ef_coin is 14 frames of 50×50 (0 the puzzle face = heads, 7 the eye = tails). */
  private coins(ctx: CanvasRenderingContext2D, sheet: string, faces: number[], at: Point, t: number): void {
    const img = this.image(sheet), shadow = this.image(sheet.replace('duel_ef_coin', 'duel_ef_coin_kage')); if (!img) return;
    const spin = this.reduced ? 0 : 1300, spacing = 60;
    faces.forEach((face, i) => {
      const x = at.x - (faces.length - 1) * spacing / 2 + i * spacing, settled = t >= spin;
      const lift = settled ? 0 : Math.sin(clamp(t / spin) * Math.PI) * 90;
      const frame = settled ? face ? 0 : 7 : Math.floor(t / 40) % 14;
      ctx.globalAlpha = 1 - clamp((t - (this.reduced ? 1200 : 2000)) / 200);
      if (shadow) ctx.drawImage(shadow, 0, 0, shadow.width / 4, shadow.height, x - 25, at.y + 18, 50, shadow.height);
      ctx.drawImage(img, frame * 50, 0, 50, 50, x - 25, at.y - 25 - lift, 50, 50);
    });
  }
  /** dice.txt: dice_random's 6 tumbling frames, then dice_decide<n> (the face). */
  private die(ctx: CanvasRenderingContext2D, spin: string, face: string, at: Point, t: number): void {
    const rolling = this.reduced ? 0 : 1000, fade = 1 - clamp((t - (this.reduced ? 1200 : 1800)) / 200);
    ctx.globalAlpha = fade;
    if (t < rolling) {
      const img = this.image(spin); if (!img) return;
      const w = img.width / 6, f = Math.floor(t / 60) % 6, hop = Math.abs(Math.sin(t / rolling * Math.PI * 3)) * 40 * (1 - t / rolling);
      ctx.drawImage(img, f * w, 0, w, img.height, at.x - w / 2, at.y - img.height / 2 - hop, w, img.height);
    } else {
      const img = this.image(face); if (!img) return;
      ctx.drawImage(img, at.x - img.width, at.y - img.height, img.width * 2, img.height * 2);
    }
  }
  /** One original SWF movie at its frame rate around (x, y). Missing pieces draw nothing. */
  private playMovie(ctx: CanvasRenderingContext2D, path: string, t: number, x: number, y: number, scale: number, rot = 0): void {
    const movie = this.movie(path); if (!movie || t < 0) return;
    const frame = Math.floor(t * movie.frameRate / 1000);
    if (frame >= movie.frameCount) return;
    const instance = new SwfInstance(movie, movie.timeline, false);
    for (let i = 0; i <= frame && !instance.ended; i++) instance.step();
    const items: Parameters<SwfInstance['draw']>[0] = [];
    instance.draw(items);
    const dir = path.replace(/[^/]+$/, '');
    for (const item of items) {
      const file = movie.files[item.bitmap]; if (!file) continue;
      const img = this.image(dir + file); if (!img) continue;
      const source = this.tinted(img, dir + file, item.color);
      ctx.save();
      // The movie's own placement: scaled and turned about its origin (CSwfEngine scale_ and rot_.z), at (x, y).
      const cos = Math.cos(rot) * scale / 20, sin = Math.sin(rot) * scale / 20;
      ctx.setTransform(cos, sin, -sin, cos, x, y);
      const m = item.clipMatrix, b = item.clip;
      ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty); ctx.beginPath(); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.clip();
      ctx.setTransform(cos, sin, -sin, cos, x, y);
      const f = item.matrix; ctx.transform(f.a, f.b, f.c, f.d, f.tx, f.ty);
      ctx.globalAlpha = clamp(item.color.mult[3] + item.color.add[3] / 255);
      if (ctx.globalAlpha > 0) ctx.drawImage(source, 0, 0);
      ctx.restore();
    }
  }
  /** SWF colour transforms on RGB (canvas has no per-channel multiply/add): a cached recoloured copy. */
  private tinted(img: HTMLImageElement, key: string, color: SwfColor): CanvasImageSource {
    const [mr, mg, mb] = color.mult, [ar, ag, ab] = color.add;
    if (Math.abs(mr - 1) < 0.02 && Math.abs(mg - 1) < 0.02 && Math.abs(mb - 1) < 0.02 && ar < 3 && ag < 3 && ab < 3) return img;
    const q = (v: number) => Math.round(v * 16) / 16, id = `${key}|${q(mr)},${q(mg)},${q(mb)},${Math.round(ar / 8)},${Math.round(ag / 8)},${Math.round(ab / 8)}`;
    const cached = this.tints.get(id); if (cached) { this.tints.delete(id); this.tints.set(id, cached); return cached; }
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); if (!g) return img;
    g.drawImage(img, 0, 0);
    try {
      const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        px[i] = clamp(px[i]! * q(mr) + ar, 0, 255); px[i + 1] = clamp(px[i + 1]! * q(mg) + ag, 0, 255); px[i + 2] = clamp(px[i + 2]! * q(mb) + ab, 0, 255);
      }
      g.putImageData(data, 0, 0);
    } catch { return img; }
    this.tints.set(id, c);
    if (this.tints.size > MAX_TINTS) this.tints.delete(this.tints.keys().next().value!);
    return c;
  }
}
