import { Container, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import { WorldCamera, WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from '../world/camera';
import type { Viewport } from '../world/camera';
import type { Point } from '../world/maps';
import type { WorldScene, SceneFrame, SceneSprite } from '../world/scene';
import { avatarDepth, FRONT_OBJECT_DEPTH, objectDepth } from '../world/depth';
import { ActorMotion, AVATAR_FOOT_Y, drawnAvatars, stripFrame } from '../world/actors';
import type { AvatarLoadOptions, AvatarResource } from '../avatars';
import type { LobbyAvatar } from './contracts';
import { safeImageUrl } from './helpers';
import { AvatarActor, PoseCache, poseKey, type PoseStrip } from './world-avatars';
import { flagCell as flagCellOf } from './nation-flag';

export type RenderScene = Pick<WorldScene, 'mapId' | 'definition' | 'frame' | 'dispose'>;
/** A decoded picture the renderer owns: released when no displayed frame uses it (on a map change, all of them). */
export interface WorldTexture { texture: Texture; release(): void }
/** What PixiJS's Application gives the renderer: its stage, a ticker and teardown (a fake one in the unit tests). */
export interface WorldHost { readonly stage: Container; readonly canvas?: HTMLCanvasElement; add(tick: (dtMs: number) => void): void; /** Stops / restarts the ticker (no drawing off the lobby). */ run?(on: boolean): void; destroy(): void }
export interface WorldRendererOptions {
  loadScene(mapId: number, signal: AbortSignal): Promise<RenderScene>;
  onViewport?(): void;
  /** Decodes one scene picture into a texture (default: fetch + createImageBitmap). */
  loadTexture?(url: string, signal: AbortSignal): Promise<WorldTexture>;
  /** The avatars' movie art (AvatarLoader); absent: placeholders only. */
  loadAvatar?(parts: Uint8Array, options: AvatarLoadOptions): Promise<AvatarResource>;
  /** The nation flags' small atlas (nation-flag.ts FLAG_ATLAS). */
  loadFlagAtlas?(signal: AbortSignal): Promise<WorldTexture>;
  /** The PixiJS application on a canvas in `parent` (default: a WebGL Application at 60 fps); null draws nothing. */
  createHost?(parent: HTMLElement): Promise<WorldHost | null>;
  reducedMotion?(): boolean;
  /** Bakes a pose strip (tests); default draws the movie into a canvas atlas. */
  bake?(key: string, resource: AvatarResource): PoseStrip;
  now?(): number;
}
interface FrameSprites { frame: SceneFrame; sprites: Sprite[]; paths: Set<string>; count: number }
interface TextureEntry { tex: WorldTexture; url: string }
const viewportKey = (v: Viewport) => `${v.x}/${v.y}/${v.width}/${v.height}`;
function contains(outer: Viewport, inner: Viewport): boolean { return inner.x >= outer.x + 16 && inner.y >= outer.y + 16 && inner.x + inner.width <= outer.x + outer.width - 16 && inner.y + inner.height <= outer.y + outer.height - 16; }
function requestedViewport(v: Viewport): Viewport {
  return { x: Math.floor((v.x - 128) / 64) * 64, y: Math.floor((v.y - 128) / 64) * 64, width: WORLD_VIEW_WIDTH + 320, height: WORLD_VIEW_HEIGHT + 320 };
}
function node(tag: 'div' | 'p' | 'button', className: string): HTMLElement { const n = document.createElement(tag); n.className = className; return n; }
const abortError = () => new DOMException('World texture loading canceled', 'AbortError');

/** The browser's decode: the scene lease's blob URL into an ImageBitmap texture (closed on release). */
async function defaultTexture(url: string, signal: AbortSignal): Promise<WorldTexture> {
  const response = await fetch(url, { signal }); const bitmap = await createImageBitmap(await response.blob());
  if (signal.aborted) { bitmap.close(); throw abortError(); }
  const source = new ImageSource({ resource: bitmap, scaleMode: 'nearest' }), texture = new Texture({ source });
  return { texture, release() { texture.destroy(false); source.destroy(); bitmap.close(); } };
}
/** PixiJS on one canvas: WebGL, transparent over the stage, 60 fps, the pointer left to the page (the hit targets). */
async function defaultHost(parent: HTMLElement): Promise<WorldHost | null> {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  const { Application } = await import('pixi.js');
  const app = new Application();
  await app.init({ width: WORLD_VIEW_WIDTH, height: WORLD_VIEW_HEIGHT, backgroundAlpha: 0, antialias: false, resolution: 1, preference: 'webgl', autoDensity: false, eventMode: 'none', eventFeatures: { move: false, globalMove: false, click: false, wheel: false } });
  app.ticker.maxFPS = 60;
  const canvas = app.canvas; canvas.className = 'de-world-canvas'; canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.key = 'world-canvas';
  parent.prepend(canvas);
  return { stage: app.stage, canvas, add: tick => app.ticker.add(t => tick(t.deltaMS)), run: on => { if (on) app.ticker.start(); else { app.ticker.stop(); app.render(); } }, destroy: () => app.destroy({ removeView: true }, { children: true }) };
}

/**
 * The overworld drawn with PixiJS (as DuelForge's WorldRenderer): one canvas in the 1024 x 768 stage under the HTML UI.
 * - the map's tiles, ObjMap objects and FrontObjMap objects are sprites from the scene's leased frames (texture per
 *   picture, shared across frames, all released when the map changes);
 * - objects and avatars share one z-sorted container (depth.ts: objects at bottom * 10, avatars at feet * 10, the front
 *   objects' container at 30724), as the original's CZSort;
 * - the camera is the exe's dead zone (camera.ts), the world container at -trunc(camera);
 * - each avatar is a sprite showing one frame of its pose's baked strip (world-avatars.ts), its name and flag above;
 *   the others walk to each new server position at the original's pace (actors.ts ActorMotion);
 * - the DOM keeps one transparent hit target per avatar (button.de-avatar, written at most 10 times a second and only
 *   when it moved) for the pointer, assistive tools and the acceptance tests.
 */
export class WorldRenderer {
  readonly element = node('div', 'de-world-view');
  /** The avatars' hit targets (index.ts's buttons). */
  readonly avatars = node('div', 'de-world-avatars');
  readonly root = new Container();
  readonly world = new Container();
  readonly tiles = new Container();
  /** Objects, avatars and the front objects' container, sorted by zIndex each frame something moved. */
  readonly sorted = new Container();
  readonly front = new Container();
  private readonly status = node('div', 'de-world-status');
  private host: WorldHost | null = null;
  private hostLoading = false;
  private camera: WorldCamera | null = null;
  private requestedMap: number | null = null;
  private followPoint: Point = { x: 512, y: 384 };
  private scene: RenderScene | null = null;
  private displayedScene: RenderScene | null = null;
  private displayed: FrameSprites | null = null;
  private loadAbort: AbortController | null = null;
  private frameAbort: AbortController | null = null;
  private framePending = false;
  private failedViewport: string | null = null;
  private pendingFrame: SceneFrame | null = null;
  private failedLoad = false;
  private observedParent: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private generation = 0;
  private readonly releasedFrames = new WeakSet<SceneFrame>();
  private readonly textures = new Map<string, TextureEntry>();
  private closed = false;
  readonly actors = new Map<number, AvatarActor>();
  private readonly motions = new Map<number, ActorMotion>();
  private readonly lastAvatars = new Map<number, LobbyAvatar>();
  private hitNodes: ReadonlyMap<number, HTMLElement> = new Map();
  private readonly poses: PoseCache | null;
  private flagAtlas: WorldTexture | null = null;
  private flagLoading: AbortController | null = null;
  private readonly flagTextures = new Map<string, Texture>();
  private hitClock = 0;
  private paused = false;
  private drawn = new Set<number>();
  private drawnKey = '';
  private drawnClock = 0;
  private sortDirty = true;
  private readonly now: () => number;
  /** Frame times of the last 240 ticks (ms), for the page's own measure of its frame rate. */
  private readonly frameTimes = new Float64Array(240);
  private frameCursor = 0;
  private frameCount = 0;
  constructor(private readonly options: WorldRendererOptions) {
    this.now = options.now ?? (() => performance.now());
    this.poses = options.loadAvatar ? new PoseCache((p, o) => options.loadAvatar!(p, o), options.bake) : null;
    this.element.setAttribute('aria-label', 'World scenery'); this.element.dataset.mapReady = 'false';
    this.avatars.dataset.layer = 'avatars';
    this.element.append(this.avatars, this.status);
    this.status.setAttribute('role', 'status'); this.avatars.style.visibility = 'hidden';
    this.root.addChild(this.world); this.world.addChild(this.tiles, this.sorted);
    this.sorted.sortableChildren = true; this.front.zIndex = FRONT_OBJECT_DEPTH; this.front.label = 'front'; this.sorted.addChild(this.front);
    this.root.visible = false;
  }
  get ready(): boolean { return !this.closed && this.displayed?.frame.mapId === this.requestedMap && this.camera !== null; }
  get viewport(): Viewport | null { return this.camera?.viewport ?? null; }
  get mapId(): number | null { return this.requestedMap; }
  worldToScreen(point: Point): Point { return this.camera?.worldToScreen(point) ?? point; }
  screenToWorld(point: Point): Point { return this.camera?.screenToWorld(point) ?? point; }
  show(mapId: number, follow: Point): void {
    if (this.closed) return; this.fit(); this.ensureHost(); if (this.paused) { this.paused = false; this.host?.run?.(true); }
    if (!Number.isInteger(mapId) || mapId < 0 || mapId > 9 || !Number.isFinite(follow.x) || !Number.isFinite(follow.y)) throw new Error('Invalid world view');
    this.followPoint = { x: follow.x, y: follow.y };
    if (this.requestedMap === mapId && this.scene) { this.followCamera(); return; }
    if (this.requestedMap === mapId && (this.loadAbort || this.failedLoad)) return;
    this.load(mapId);
  }
  private followCamera(): void {
    if (!this.camera) return;
    const before = this.camera.viewport; this.camera.follow(this.followPoint); const after = this.camera.viewport;
    if (before.x !== after.x || before.y !== after.y) { this.placeWorld(); this.options.onViewport?.(); }
    this.ensureFrame();
  }
  private placeWorld(): void { const v = this.camera?.viewport; if (v) this.world.position.set(-v.x, -v.y); }
  private ensureHost(): void {
    if (this.host || this.hostLoading || this.closed) return;
    this.hostLoading = true;
    const create = this.options.createHost ?? defaultHost;
    void create(this.element).then(host => {
      if (!host) return; if (this.closed) { host.destroy(); return; }
      this.host = host; host.stage.addChild(this.root); host.add(dt => this.tick(dt)); if (this.paused) host.run?.(false);
    }).catch(error => console.warn('world renderer:', error));
  }
  private load(mapId: number): void {
    const generation = ++this.generation;
    this.loadAbort?.abort(); this.cancelPendingFrame(); this.failedViewport = null; this.failedLoad = false;
    if (this.scene && this.scene !== this.displayedScene) this.scene.dispose();
    this.clearFrame(); this.clearActors();
    this.scene = null; this.camera = null; this.requestedMap = mapId; this.element.dataset.mapId = String(mapId); this.element.dataset.mapReady = 'false'; this.avatars.style.visibility = 'hidden'; this.message('Loading map artwork…');
    const request = new AbortController(); this.loadAbort = request;
    let loading: Promise<RenderScene>;
    try { loading = this.options.loadScene(mapId, request.signal); } catch (error) { loading = Promise.reject(error); }
    void loading.then(scene => {
      if (this.closed || request.signal.aborted || generation !== this.generation) { scene.dispose(); return; }
      this.scene = scene; this.camera = new WorldCamera(scene.definition); this.camera.follow(this.followPoint, true); this.placeWorld();
      this.options.onViewport?.(); this.ensureFrame();
    }).catch(error => { if (!this.closed && !request.signal.aborted && generation === this.generation && (error as Error)?.name !== 'AbortError') { this.failedLoad = true; this.message('Map artwork could not be loaded.', true); } })
      .finally(() => { if (this.loadAbort === request) this.loadAbort = null; });
  }
  retry(): void { if (!this.closed && this.requestedMap !== null) this.load(this.requestedMap); }
  private message(text: string, retry = false): void {
    this.status.replaceChildren(); if (text) { const label = node('p', ''); label.textContent = text; this.status.append(label); }
    if (retry) this.element.dataset.mapFailed = 'true'; else delete this.element.dataset.mapFailed;
    if (retry) { const button = node('button', '') as HTMLButtonElement; button.type = 'button'; button.textContent = 'Retry Map'; button.onclick = () => this.retry(); this.status.append(button); }
  }
  private ensureFrame(): void {
    if (this.closed || !this.scene || !this.camera || this.framePending) return;
    const view = this.camera.viewport;
    if (this.displayed?.frame.mapId === this.requestedMap && contains(this.displayed.frame.viewport, view)) return;
    const requested = requestedViewport(view), key = viewportKey(requested); if (key === this.failedViewport) return;
    const scene = this.scene, generation = this.generation, request = new AbortController(); this.frameAbort = request; this.framePending = true;
    let acquired: SceneFrame | null = null;
    void scene.frame(requested, request.signal).then(async frame => {
      acquired = frame;
      if (this.closed || request.signal.aborted || generation !== this.generation) return;
      this.pendingFrame = frame;
      if (frame.tiles.length + frame.objects.length + frame.frontObjects.length > 768) throw new Error('World sprite count exceeds budget');
      await this.loadTextures([...frame.tiles, ...frame.objects, ...frame.frontObjects], request.signal);
      if (this.closed || request.signal.aborted || generation !== this.generation) return;
      const previous = this.displayed, previousScene = this.displayedScene;
      this.displayed = this.buildSprites(frame); this.displayedScene = scene; this.pendingFrame = null; acquired = null;
      if (previous) { for (const s of previous.sprites) s.destroy(); this.releaseFrame(previous.frame); }
      this.dropUnusedTextures();
      if (previousScene && previousScene !== scene) previousScene.dispose();
      this.root.visible = true; this.sortDirty = true;
      this.element.dataset.mapReady = 'true'; this.element.dataset.sceneImages = String(this.displayed.count); this.avatars.style.visibility = ''; this.message(''); this.layoutHits(true); this.options.onViewport?.();
    }).catch(error => {
      if (!this.closed && !request.signal.aborted && generation === this.generation && (error as Error)?.name !== 'AbortError') { this.failedViewport = key; this.message('Map artwork could not be loaded.', true); }
    }).finally(() => {
      if (this.pendingFrame === acquired) this.pendingFrame = null; this.releaseFrame(acquired); this.dropUnusedTextures();
      if (this.frameAbort === request) { this.frameAbort = null; this.framePending = false; if (!this.closed && generation === this.generation) this.ensureFrame(); }
    });
  }
  /** Each picture once (by its archive path), four decodes at a time; a picture already on screen is reused. */
  private async loadTextures(sprites: readonly SceneSprite[], signal: AbortSignal): Promise<void> {
    const wanted: SceneSprite[] = [], seen = new Set<string>();
    for (const s of sprites) { const url = safeImageUrl(s.url); if (!url) throw new Error('Invalid world image URL'); if (!this.textures.has(s.path) && !seen.has(s.path)) { seen.add(s.path); wanted.push(s); } }
    const load = this.options.loadTexture ?? defaultTexture;
    let next = 0;
    const worker = async () => {
      for (let s = wanted[next++]; s && !signal.aborted; s = wanted[next++]) {
        const tex = await load(s.url, signal);
        if (signal.aborted || this.closed) { tex.release(); throw abortError(); }
        const old = this.textures.get(s.path); if (old) tex.release(); else this.textures.set(s.path, { tex, url: s.url });
      }
      if (signal.aborted) throw abortError();
    };
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, wanted.length) }, worker));
    const failure = results.find((v): v is PromiseRejectedResult => v.status === 'rejected'); if (failure) throw failure.reason;
  }
  private buildSprites(frame: SceneFrame): FrameSprites {
    const out: FrameSprites = { frame, sprites: [], paths: new Set(), count: 0 };
    const add = (list: readonly SceneSprite[], parent: Container, depth: boolean) => {
      for (const s of list) {
        const entry = this.textures.get(s.path); if (!entry) throw new Error('World texture missing');
        let texture = entry.tex.texture;
        // a base tile occupies its logical cell: natural-size art is clipped, never stretched
        if (s.clipWidth !== undefined && s.clipHeight !== undefined) texture = new Texture({ source: texture.source, frame: new Rectangle(0, 0, Math.min(s.clipWidth, s.width, texture.source.width || s.width), Math.min(s.clipHeight, s.height, texture.source.height || s.height)) });
        const sprite = new Sprite(texture); sprite.position.set(s.x, s.y); sprite.label = s.path;
        if (texture !== entry.tex.texture) sprite.on('destroyed', () => texture.destroy(false));
        if (depth) sprite.zIndex = objectDepth(s);
        parent.addChild(sprite); out.sprites.push(sprite); out.paths.add(s.path); out.count++;
      }
    };
    add(frame.tiles, this.tiles, false); add(frame.objects, this.sorted, true); add(frame.frontObjects, this.front, false);
    return out;
  }
  private dropUnusedTextures(): void {
    const keep = this.displayed?.paths;
    for (const [path, entry] of this.textures) if (!keep?.has(path)) { entry.tex.release(); this.textures.delete(path); }
  }
  /** The lobby's avatars as the state has them: self at its position (its walk is the runtime's), the others walking
   * there; art for the nearest 24 near the view. */
  setAvatars(avatars: readonly LobbyAvatar[]): void {
    if (this.closed) return;
    const t = this.now(), seen = new Set<number>();
    for (const a of avatars) {
      seen.add(a.id); this.lastAvatars.set(a.id, a);
      let actor = this.actors.get(a.id), motion = this.motions.get(a.id);
      if (!actor) { actor = new AvatarActor(a.id, a.name, !!a.self); this.actors.set(a.id, actor); this.sorted.addChild(actor.root); this.sortDirty = true; }
      actor.setName(a.name); this.applyFlag(actor, a.country);
      if (!motion) { motion = new ActorMotion(a, a.direction ?? 0); this.motions.set(a.id, motion); }
      else motion.retarget(a, a.direction, !!a.self);
      if (a.self) { motion.direction = a.direction ?? motion.direction; motion.walking = a.motion === 'walk'; }
      this.place(actor, motion);
    }
    for (const [id, actor] of this.actors) if (!seen.has(id)) { this.dropActor(id, actor); }
    const v = this.camera?.viewport ?? null, viewKey = v ? `${v.x}/${v.y}/${avatars.length}` : `-/${avatars.length}`;
    if (viewKey !== this.drawnKey || ++this.drawnClock >= 30) { this.drawnKey = viewKey; this.drawnClock = 0; this.drawn = drawnAvatars(avatars, v); }
    for (const [id, actor] of this.actors) this.pose(actor, this.lastAvatars.get(id)!, this.drawn.has(id), t);
  }
  /** Index's hit targets (button.de-avatar by avatar id), written by the renderer as the avatars move. */
  bindHits(nodes: ReadonlyMap<number, HTMLElement>): void { this.hitNodes = nodes; for (const actor of this.actors.values()) { actor.hitLeft = actor.hitTop = ''; } this.layoutHits(true); }
  private place(actor: AvatarActor, motion: ActorMotion): void {
    if (actor.root.x !== motion.x || actor.root.y !== motion.y) { actor.root.position.set(motion.x, motion.y); const z = avatarDepth(motion.y); if (actor.root.zIndex !== z) { actor.root.zIndex = z; this.sortDirty = true; } }
  }
  private pose(actor: AvatarActor, a: LobbyAvatar, art: boolean, t: number): void {
    const motion = this.motions.get(actor.id)!;
    if (!art || !this.poses || a.parts?.length !== 16) { if (actor.strip) { this.poses?.release(actor.strip); actor.strip = null; } actor.body.visible = false; actor.placeholder.visible = true; actor.drawn = false; actor.wanted = ''; return; }
    const walking = motion.walking, key = poseKey(actor.partsKey(a.parts), a.world ?? 0, walking ? 'walk' : 'stand', motion.direction);
    actor.poseWalking = walking; actor.poseDirection = motion.direction;
    if (actor.wanted === key) return;
    actor.wanted = key;
    const strip = this.poses.acquire(key, a.parts, a.world ?? 0, walking ? 'walk' : 'stand', motion.direction, () => { if (!this.closed && actor.wanted === key && this.actors.get(actor.id) === actor) { actor.wanted = ''; const last = this.lastAvatars.get(actor.id); if (last) this.pose(actor, last, true, this.now()); } });
    if (!strip) return;   // the old pose stays on screen until the new one is in
    if (actor.strip) this.poses.release(actor.strip);
    actor.show(strip, t);
  }
  private applyFlag(actor: AvatarActor, country: string | undefined): void {
    const cell = country ? flagCellOf(country) : null;
    if (!cell || !this.options.loadFlagAtlas) { actor.setFlag(null); return; }
    if (!this.flagAtlas) { this.loadFlags(); actor.setFlag(null); return; }
    let texture = this.flagTextures.get(country!);
    if (!texture) { texture = new Texture({ source: this.flagAtlas.texture.source, frame: new Rectangle(cell[0], cell[1], 22, 15) }); this.flagTextures.set(country!, texture); }
    actor.setFlag(texture);
  }
  private loadFlags(): void {
    if (this.flagLoading || this.flagAtlas || !this.options.loadFlagAtlas) return;
    const abort = new AbortController(); this.flagLoading = abort;
    void this.options.loadFlagAtlas(abort.signal).then(atlas => {
      if (abort.signal.aborted || this.closed) { atlas.release(); return; }
      this.flagAtlas = atlas; for (const [id, actor] of this.actors) this.applyFlag(actor, this.lastAvatars.get(id)?.country);
    }, () => {}).finally(() => { if (this.flagLoading === abort) this.flagLoading = null; });
  }
  private dropActor(id: number, actor: AvatarActor): void {
    if (actor.strip) this.poses?.release(actor.strip);
    actor.destroy(); this.actors.delete(id); this.motions.delete(id); this.lastAvatars.delete(id);
  }
  /** One frame: the others step toward their server positions, walk cycles advance, the camera follows, the scene
   * sorts if something moved; the DOM hit targets follow every sixth frame. */
  tick(dtMs: number): void {
    if (this.closed) return;
    this.frameTimes[this.frameCursor] = dtMs; this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length; this.frameCount++;
    const t = this.now(), reduced = this.options.reducedMotion?.() ?? false;
    for (const [id, actor] of this.actors) {
      const motion = this.motions.get(id)!, last = this.lastAvatars.get(id);
      if (last && !last.self && motion.step(dtMs, last.direction)) this.repose(actor, last, t);
      this.place(actor, motion);
      const strip = actor.strip;
      if (strip && strip.frames.length > 1) {
        const frame = reduced ? 0 : stripFrame(t - actor.started, strip.fps, strip.frames.length);
        if (frame !== actor.frame) { actor.frame = frame; actor.body.texture = strip.frames[frame]; }
      }
    }
    if (this.sortDirty) { this.sorted.sortChildren(); this.sortDirty = false; }
    if (++this.hitClock >= 6) { this.hitClock = 0; this.layoutHits(false); }
  }
  /** A remote that started or stopped walking (or turned) asks for that pose. */
  private repose(actor: AvatarActor, a: LobbyAvatar, t: number): void {
    if (!actor.drawn && !actor.wanted) return;
    const motion = this.motions.get(actor.id)!;
    if (a.parts?.length === 16 && (motion.walking !== actor.poseWalking || motion.direction !== actor.poseDirection)) this.pose(actor, a, true, t);
  }
  /** The DOM hit targets: left / top (the stage's percent, as the DOM view had them), written only when changed. */
  private layoutHits(force: boolean): void {
    if (!this.camera) return;
    const v = this.camera.viewport;
    for (const [id, el] of this.hitNodes) {
      const actor = this.actors.get(id), motion = this.motions.get(id); if (!actor || !motion) continue;
      const left = `${(motion.x - v.x) / WORLD_VIEW_WIDTH * 100}%`, top = `${(motion.y - v.y) / WORLD_VIEW_HEIGHT * 100}%`;
      if (force || left !== actor.hitLeft) { el.style.left = left; actor.hitLeft = left; }
      if (force || top !== actor.hitTop) { el.style.top = top; actor.hitTop = top; }
      const z = String(avatarDepth(motion.y)); if (el.style.zIndex !== z) el.style.zIndex = z;
      const has = / has-original\b/.test(el.className); if (has !== actor.drawn) el.className = actor.drawn ? `${el.className} has-original` : el.className.replace(/ has-original\b/g, '');
    }
  }
  /** Each shown avatar's head in stage px (All Chat's bubbles stand over it: the art box's top). */
  chatAnchors(): { id: number; x: number; y: number }[] {
    const v = this.camera?.viewport; if (!v || !this.ready) return [];
    const out: { id: number; x: number; y: number }[] = [];
    for (const [id, m] of this.motions) out.push({ id, x: m.x - v.x, y: m.y - v.y - AVATAR_FOOT_Y });
    return out;
  }
  /** What the page shows, for tests and tools (window.__deWorld). */
  inspect() {
    const v = this.camera?.viewport ?? null, n = Math.min(this.frameCount, this.frameTimes.length), times = Array.from(this.frameTimes.subarray(0, n)).sort((a, b) => a - b);
    const mean = n ? times.reduce((s, x) => s + x, 0) / n : 0;
    return {
      mapId: this.requestedMap, ready: this.ready, viewport: v, sprites: this.displayed?.count ?? 0, textures: this.textures.size, poses: this.poses?.size ?? 0, renderer: this.host ? 'pixi' : 'none',
      frames: { count: this.frameCount, fps: mean ? 1000 / mean : 0, p95: n ? times[Math.min(n - 1, Math.floor(n * 0.95))] : 0, worst: n ? times[n - 1] : 0 },
      avatars: [...this.actors.values()].map(a => { const m = this.motions.get(a.id)!; return { id: a.id, name: a.name.text, x: m.x, y: m.y, direction: m.direction, walking: m.walking, frame: a.frame, z: a.root.zIndex, drawn: a.drawn }; }),
    };
  }
  private fit(): void {
    const parent = this.element.parentElement ?? this.element.parentNode as HTMLElement | null;
    if (!parent || typeof parent.getBoundingClientRect !== 'function' || parent === this.observedParent) return;
    this.resizeObserver?.disconnect(); this.observedParent = parent;
    const layout = () => { const box = parent.getBoundingClientRect(); if (!(box.width > 0 && box.height > 0)) return; const scale = Math.min(box.width / WORLD_VIEW_WIDTH, box.height / WORLD_VIEW_HEIGHT); this.element.style.width = `${WORLD_VIEW_WIDTH * scale}px`; this.element.style.height = `${WORLD_VIEW_HEIGHT * scale}px`; this.element.style.left = `${(box.width - WORLD_VIEW_WIDTH * scale) / 2}px`; this.element.style.top = `${(box.height - WORLD_VIEW_HEIGHT * scale) / 2}px`; };
    layout(); if (typeof ResizeObserver === 'function') { this.resizeObserver = new ResizeObserver(layout); this.resizeObserver.observe(parent); }
  }
  private cancelPendingFrame(): void { this.frameAbort?.abort(); this.frameAbort = null; this.framePending = false; this.releaseFrame(this.pendingFrame); this.pendingFrame = null; }
  private releaseFrame(frame: SceneFrame | null): void { if (frame && !this.releasedFrames.has(frame)) { this.releasedFrames.add(frame); frame.release(); } }
  /** The displayed frame's sprites and every texture go (a map change: nothing of the old map stays in memory). */
  private clearFrame(): void {
    if (this.displayed) { for (const s of this.displayed.sprites) s.destroy(); this.releaseFrame(this.displayed.frame); this.displayed = null; }
    for (const entry of this.textures.values()) entry.tex.release(); this.textures.clear();
    this.root.visible = false;
  }
  private clearActors(): void { for (const [id, actor] of [...this.actors]) this.dropActor(id, actor); this.poses?.clear(); this.drawn = new Set(); this.drawnKey = ''; }
  /** Leaving a scene releases every lease, texture and pose strip. */
  hide(): void {
    if (this.closed) return;
    ++this.generation; this.loadAbort?.abort(); this.loadAbort = null; this.cancelPendingFrame(); this.resizeObserver?.disconnect(); this.resizeObserver = null; this.observedParent = null;
    this.clearFrame(); this.clearActors(); this.avatars.replaceChildren(); this.hitNodes = new Map();
    const scenes = new Set([this.scene, this.displayedScene]); for (const scene of scenes) scene?.dispose();
    this.paused = true; this.host?.run?.(false);
    this.scene = null; this.displayedScene = null; this.requestedMap = null; this.element.dataset.mapReady = 'false'; this.element.dataset.sceneImages = '0'; this.camera = null; this.failedViewport = null; this.failedLoad = false; this.message(''); this.avatars.style.visibility = 'hidden';
  }
  dispose(): void {
    if (this.closed) return; this.hide(); this.closed = true;
    this.flagLoading?.abort(); for (const t of this.flagTextures.values()) t.destroy(false); this.flagTextures.clear(); this.flagAtlas?.release(); this.flagAtlas = null;
    this.host?.destroy(); this.host = null; this.root.destroy({ children: true });
    this.element.replaceChildren(); this.element.remove();
  }
}
/** A picture the page resolved (a URL or a drawn canvas) as a world texture: the nation flags' atlas. */
export async function pictureTexture(picture: string | HTMLCanvasElement, signal: AbortSignal): Promise<WorldTexture> {
  if (typeof picture === 'string') return defaultTexture(picture, signal);
  const { CanvasSource } = await import('pixi.js');
  const source = new CanvasSource({ resource: picture, scaleMode: 'nearest' }), texture = new Texture({ source });
  return { texture, release() { texture.destroy(false); source.destroy(); } };
}
