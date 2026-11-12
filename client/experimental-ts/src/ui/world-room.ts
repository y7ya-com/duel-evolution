// My Room's furniture the area map's scene table leaves out (data/Map/FieldMapData.txt has Map_r01's bare shelf frame
// and bed only): what the room scene (CMyRoomScene, client/src/MyRoom) adds on top, drawn with PixiJS in the world.
// - the duel disk shelf (CDuelDiskShelf::onInit 0x008176e0, MyRoom/yo2DuelDiscShelf.cpp): five glass boards
//   (Map_r01_0301_obj.png) at (52, 45 / 109 / 172 / 236 / 299), on the top one the two disk switches (Map_disk_a01_01
//   at +154, +0; Map_disk_d01_01 at +77, +51) and the disk case (Mapdisk_case_01 at +0, +102). The boards below hold
//   the disks the player put on display (none for a new character: not drawn here).
// - the TV (CMyRoomTv, 0x008303c0: its element at (401, 24)) playing its programmes one after another, round and round:
//   0x00829d90 picks them by the event running (CGameMng +0x458 / +0x460); with none, the NPC duels advert
//   (tv_cpu01) then the game's own reel (tv_01). Each is an SWF dump with colour fades (AvatarMovie with colors).
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import { AvatarMovie } from '../avatars';
import type { AvatarLayer } from '../avatars';

export const SHELF_BOARD = 'data/Map/Map_r01/Map_r01_0301_obj.png';
export const SHELF_BOARDS: readonly (readonly [number, number])[] = [[52, 45], [52, 109], [52, 172], [52, 236], [52, 299]];
/** The top board's switches and the case: picture, offset from the top board. */
export const SHELF_ITEMS: readonly (readonly [string, number, number])[] = [
  ['data/Map/Map_switch/Map_disk_a01_01.png', 154, 0], ['data/Map/Map_switch/Map_disk_d01_01.png', 77, 51], ['data/Map/Map_switch/Mapdisk_case_01.png', 0, 102]];
/** The TV's screen element (CMyRoomTv's position). */
export const TV_AT = { x: 401, y: 24 } as const;
/** CMyRoomTv's programmes by index (0x00831360's switch). */
export const TV_PROGRAMMES: readonly string[] = ['data/tv/tv_01/room_tv_01.txt', 'data/tv/tv_gans01/room_tv_gans01.txt', 'data/tv/tv_trial01/room_tv_trial01.txt',
  'data/tv/tv_ematch01/room_tv_evol01.txt', 'data/tv/tv_anniv01/room_tv_anniv01.txt', 'data/tv/tv_tourna01/room_tv_tourna01.txt',
  'data/tv/tv_reserv01/room_tv_treserv01.txt', 'data/tv/tv_cpu01/room_tv_cpu01.txt', 'data/tv/tv_ultima01/room_tv_ult01.txt'];
/** With no event: the NPC duels advert, then the reel (0x0082a06f). */
export const TV_DEFAULT_PLAYLIST: readonly number[] = [7, 0];

export interface RoomArt { texture: Texture; release(): void }
export interface RoomPropsDeps {
  loadArt(path: string, signal: AbortSignal): Promise<RoomArt>;
  readText(path: string, signal: AbortSignal): Promise<string>;
  /** The game's language letter for a picture's '?' (room_tv_cpu_m_01_?.png). */
  language?: string;
  playlist?: readonly number[];
  makeCanvas?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;
}
interface Programme { movie: AvatarMovie; images: Map<number, CanvasImageSource>; arts: RoomArt[] }

/** The room's props: `shelf` (sorted with the room's objects) and `tv` (over the floor tiles); step() each frame. */
export class RoomProps {
  readonly shelf = new Container();
  readonly tv = new Container();
  private readonly abort = new AbortController();
  private readonly arts: RoomArt[] = [];
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private source: CanvasSource | null = null;
  private programmes: (Programme | null)[] = [];
  private playing = 0; private started = 0; private shown = -1;
  private closed = false;
  constructor(private readonly deps: RoomPropsDeps, private readonly now: () => number = () => performance.now()) {
    this.shelf.label = 'myroom-shelf'; this.tv.label = 'myroom-tv'; this.tv.position.set(TV_AT.x, TV_AT.y);
    void this.loadShelf(); void this.loadTv();
  }
  private async art(path: string): Promise<RoomArt | null> {
    try { const a = await this.deps.loadArt(path, this.abort.signal); if (this.closed) { a.release(); return null; } this.arts.push(a); return a; }
    catch (e) { if (!this.closed) console.warn('my room art', path, e); return null; }
  }
  private async loadShelf(): Promise<void> {
    const [board, ...items] = await Promise.all([this.art(SHELF_BOARD), ...SHELF_ITEMS.map(([p]) => this.art(p))]);
    if (this.closed) return;
    if (board) SHELF_BOARDS.forEach(([x, y], i) => { const s = new Sprite(board.texture); s.position.set(x, y); s.label = `board:${i}`; this.shelf.addChild(s); });
    const [tx, ty] = SHELF_BOARDS[0]!;
    items.forEach((a, i) => { if (!a) return; const [, dx, dy] = SHELF_ITEMS[i]!; const s = new Sprite(a.texture); s.position.set(tx + dx, ty + dy); s.label = SHELF_ITEMS[i]![0]; this.shelf.addChild(s); });
  }
  private async loadTv(): Promise<void> {
    const list = this.deps.playlist ?? TV_DEFAULT_PLAYLIST;
    this.programmes = list.map(() => null);
    await Promise.all(list.map(async (index, slot) => {
      const path = TV_PROGRAMMES[index]; if (!path) return;
      try {
        const movie = new AvatarMovie(await this.deps.readText(path, this.abort.signal), { colors: true });
        if (movie.issues.length || this.closed) return;
        const dir = path.slice(0, path.lastIndexOf('/') + 1), images = new Map<number, CanvasImageSource>(), arts: RoomArt[] = [];
        await Promise.all(movie.files.map(async (file, i) => {
          const a = await this.art(dir + file.replace('?', this.deps.language ?? 'E'));
          const image = a?.texture.source.resource as CanvasImageSource | undefined;
          if (a && image) { images.set(i, image); arts.push(a); }
        }));
        if (!this.closed) this.programmes[slot] = { movie, images, arts };
      } catch (e) { if (!this.closed) console.warn('my room tv', path, e); }
    }));
    if (this.closed) return;
    const w = 224, h = 126, make = this.deps.makeCanvas ?? ((cw, ch) => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(cw, ch); const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; });
    this.canvas = make(w, h); this.source = new CanvasSource({ resource: this.canvas as HTMLCanvasElement });
    const sprite = new Sprite(new Texture({ source: this.source })); sprite.label = 'tv-screen'; this.tv.addChild(sprite);
    this.playing = this.programmes.findIndex(p => p); this.started = this.now();
  }
  /** The TV's frame now: its programme's at 30 fps, the next programme after the last frame. */
  step(hold = false): void {
    const ctx = this.canvas?.getContext('2d') as CanvasRenderingContext2D | null | undefined;
    if (!ctx || this.playing < 0) return;
    if (hold) this.started = this.now();   // reduced motion: the programme's first picture, still
    let p = this.programmes[this.playing], frame = Math.floor((this.now() - this.started) * (p?.movie.fps ?? 30) / 1000);
    if (!p || frame >= p.movie.frameCount) {
      for (let n = 0; n < this.programmes.length; n++) { this.playing = (this.playing + 1) % this.programmes.length; if (this.programmes[this.playing]) break; }
      this.started = this.now(); this.shown = -1; p = this.programmes[this.playing]; frame = 0;
      if (!p) return;
    }
    const key = this.playing * 100000 + frame; if (key === this.shown) return; this.shown = key;
    ctx.clearRect(0, 0, 224, 126);
    for (const layer of p.movie.layers(frame, true)) drawLayer(ctx, layer, p.images.get(layer.file));
    this.source!.update();
  }
  destroy(): void {
    if (this.closed) return; this.closed = true; this.abort.abort();
    this.shelf.destroy({ children: true }); this.tv.destroy({ children: true });
    this.source?.destroy(); if (this.canvas) this.canvas.width = this.canvas.height = 0;
    for (const a of this.arts) a.release(); this.arts.length = 0;
  }
}

let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;
/** One movie layer: its bitmap clipped to the shape, through its matrices, alpha and colour transform
 * (channel * mult + add, the bitmap's own alpha kept). */
function drawLayer(ctx: CanvasRenderingContext2D, layer: AvatarLayer, image: CanvasImageSource | undefined): void {
  if (!image || layer.alpha <= 0) return;
  const [left, top, right, bottom] = layer.bounds, c = layer.color;
  const paint = (g: CanvasRenderingContext2D) => {
    g.save(); g.transform(...layer.matrix); g.beginPath(); g.rect(left, top, right - left, bottom - top); g.clip(); g.transform(...layer.bitmapMatrix); g.drawImage(image, 0, 0); g.restore();
  };
  if (!c) { ctx.save(); ctx.globalAlpha = layer.alpha; paint(ctx); ctx.restore(); return; }
  const w = ctx.canvas.width, h = ctx.canvas.height;
  if (!scratch || scratch.width !== w || scratch.height !== h) { scratch = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); }
  const g = scratch.getContext('2d') as CanvasRenderingContext2D;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); paint(g);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${byte(c.mult[0])},${byte(c.mult[1])},${byte(c.mult[2])})`; g.fillRect(0, 0, w, h);
  if (c.add.some(v => v)) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgb(${byte(c.add[0])},${byte(c.add[1])},${byte(c.add[2])})`; g.fillRect(0, 0, w, h); }
  g.globalCompositeOperation = 'destination-in'; paint(g);
  ctx.save(); ctx.globalAlpha = layer.alpha; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scratch, 0, 0); ctx.restore();
}
