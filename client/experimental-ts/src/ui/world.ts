import { WorldCamera, WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from '../world/camera';
import type { Viewport } from '../world/camera';
import type { Point } from '../world/maps';
import type { WorldScene, SceneFrame, SceneSprite } from '../world/scene';
import { safeImageUrl } from './helpers';
import { FRONT_OBJECT_DEPTH, objectDepth } from '../world/depth';

export type RenderScene = Pick<WorldScene, 'mapId' | 'definition' | 'frame' | 'dispose'>;
export interface WorldRendererOptions {
  loadScene(mapId: number, signal: AbortSignal): Promise<RenderScene>;
  onViewport?(): void;
  /** Injectable decoding makes resource-order tests independent of a real browser. */
  decodeImage?(image: HTMLImageElement): Promise<void>;
}
interface SpriteNode { sprite: SceneSprite; element: HTMLElement; }
interface FrameNodes { background: HTMLElement[]; objects: HTMLElement[]; front: HTMLElement[]; images: HTMLImageElement[]; sprites: SpriteNode[]; }
const viewportKey = (v: Viewport) => `${v.x}/${v.y}/${v.width}/${v.height}`;
function contains(outer: Viewport, inner: Viewport): boolean { return inner.x >= outer.x + 16 && inner.y >= outer.y + 16 && inner.x + inner.width <= outer.x + outer.width - 16 && inner.y + inner.height <= outer.y + outer.height - 16; }
function requestedViewport(v: Viewport): Viewport {
  return { x: Math.floor((v.x - 128) / 64) * 64, y: Math.floor((v.y - 128) / 64) * 64, width: WORLD_VIEW_WIDTH + 320, height: WORLD_VIEW_HEIGHT + 320 };
}
function node(tag: 'div' | 'img' | 'p' | 'button', className: string): HTMLElement { const n = document.createElement(tag); n.className = className; return n; }

/** A persistent, leased map view. At most one displayed and one pending frame exist. */
export class WorldRenderer {
  readonly element = node('div', 'de-world-view');
  readonly avatars = node('div', 'de-world-avatars');
  private readonly background = node('div', 'de-world-layer');
  private readonly objects = node('div', 'de-world-layer');
  private readonly front = node('div', 'de-world-layer');
  private readonly status = node('div', 'de-world-status');
  private readonly staging = node('div', 'de-world-pending');
  private camera: WorldCamera | null = null;
  private requestedMap: number | null = null;
  private followPoint: Point = { x: 512, y: 384 };
  private scene: RenderScene | null = null;
  private displayedScene: RenderScene | null = null;
  private displayed: SceneFrame | null = null;
  private displayedNodes: FrameNodes | null = null;
  private loadAbort: AbortController | null = null;
  private frameAbort: AbortController | null = null;
  private framePending = false;
  private failedViewport: string | null = null;
  private pendingNodes: FrameNodes | null = null;
  private pendingFrame: SceneFrame | null = null;
  private failedLoad = false;
  private observedParent: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private generation = 0;
  private readonly releasedFrames = new WeakSet<SceneFrame>();
  private closed = false;
  constructor(private readonly options: WorldRendererOptions) {
    this.element.setAttribute('aria-label', 'World scenery'); this.element.dataset.mapReady = 'false';
    this.background.dataset.layer = 'background'; this.objects.dataset.layer = 'objects'; this.avatars.dataset.layer = 'avatars'; this.front.dataset.layer = 'front';
    // One z-sort, as the original's CZSort: objects (keyed by their bottom edge) and avatars (keyed by their feet) share
    // the view's stacking context (neither layer makes its own); the front objects' layer sits at their fixed key.
    this.front.style.zIndex = String(FRONT_OBJECT_DEPTH);
    this.staging.style.display = 'none'; this.staging.setAttribute('aria-hidden', 'true');
    this.element.append(this.background, this.objects, this.avatars, this.front, this.status, this.staging);
    this.status.setAttribute('role', 'status'); this.avatars.style.visibility = 'hidden';
  }
  get ready(): boolean { return !this.closed && this.displayed?.mapId === this.requestedMap && this.camera !== null; }
  get viewport(): Viewport | null { return this.camera?.viewport ?? null; }
  get mapId(): number | null { return this.requestedMap; }
  worldToScreen(point: Point): Point { return this.camera?.worldToScreen(point) ?? point; }
  screenToWorld(point: Point): Point { return this.camera?.screenToWorld(point) ?? point; }
  show(mapId: number, follow: Point): void {
    if (this.closed) return; this.fit();
    if (!Number.isInteger(mapId) || mapId < 0 || mapId > 9 || !Number.isFinite(follow.x) || !Number.isFinite(follow.y)) throw new Error('Invalid world view');
    this.followPoint = { ...follow };
    if (this.requestedMap === mapId && this.scene) { this.camera?.follow(follow); this.positionSprites(); this.options.onViewport?.(); this.ensureFrame(); return; }
    if (this.requestedMap === mapId && (this.loadAbort || this.failedLoad)) return;
    this.load(mapId);
  }
  private load(mapId: number): void {
    const generation = ++this.generation;
    this.loadAbort?.abort(); this.cancelPendingFrame(); this.failedViewport = null; this.failedLoad = false;
    if (this.scene && this.scene !== this.displayedScene) this.scene.dispose();
    this.scene = null; this.camera = null; this.requestedMap = mapId; this.element.dataset.mapId = String(mapId); this.element.dataset.mapReady = 'false'; this.avatars.style.visibility = 'hidden'; this.message('Loading map artwork…');
    const request = new AbortController(); this.loadAbort = request;
    let loading: Promise<RenderScene>;
    try { loading = this.options.loadScene(mapId, request.signal); } catch (error) { loading = Promise.reject(error); }
    void loading.then(scene => {
      if (this.closed || request.signal.aborted || generation !== this.generation) { scene.dispose(); return; }
      this.scene = scene; this.camera = new WorldCamera(scene.definition); this.camera.follow(this.followPoint, true);
      this.options.onViewport?.(); this.ensureFrame();
    }).catch(error => { if (!this.closed && !request.signal.aborted && generation === this.generation && (error as Error)?.name !== 'AbortError') { this.failedLoad = true; this.message('Map artwork could not be loaded.', true); } })
      .finally(() => { if (this.loadAbort === request) this.loadAbort = null; });
  }
  retry(): void { if (!this.closed && this.requestedMap !== null) this.load(this.requestedMap); }
  private message(text: string, retry = false): void {
    this.status.replaceChildren(); if (text) { const label = node('p', ''); label.textContent = text; this.status.append(label); }
    // the map's own failure (its Retry Map) marked for the page and its tests: a lobby without scenery, not a loading one
    if (retry) this.element.dataset.mapFailed = 'true'; else delete this.element.dataset.mapFailed;
    if (retry) { const button = node('button', '') as HTMLButtonElement; button.type = 'button'; button.textContent = 'Retry Map'; button.onclick = () => this.retry(); this.status.append(button); }
  }
  private positionSprites(): void {
    if (!this.camera || this.displayed?.mapId !== this.requestedMap || !this.displayedNodes) return;
    for (const { element, sprite } of this.displayedNodes.sprites) {
      const point = this.camera.worldToScreen(sprite); element.style.left = `${point.x / WORLD_VIEW_WIDTH * 100}%`; element.style.top = `${point.y / WORLD_VIEW_HEIGHT * 100}%`;
    }
  }
  private ensureFrame(): void {
    if (this.closed || !this.scene || !this.camera || this.framePending) return;
    const view = this.camera.viewport;
    if (this.displayed?.mapId === this.requestedMap && contains(this.displayed.viewport, view)) return;
    const requested = requestedViewport(view), key = viewportKey(requested); if (key === this.failedViewport) return;
    const scene = this.scene, generation = this.generation, request = new AbortController(); this.frameAbort = request; this.framePending = true;
    let acquired: SceneFrame | null = null, nodes: FrameNodes | null = null;
    void scene.frame(requested, request.signal).then(async frame => {
      acquired = frame;
      if (this.closed || request.signal.aborted || generation !== this.generation) return;
      this.pendingFrame = frame; nodes = this.buildNodes(frame); this.pendingNodes = nodes;
      await this.decodeFrame(nodes.images, request.signal);
      if (this.closed || request.signal.aborted || generation !== this.generation) return;
      const previous = this.displayed, previousNodes = this.displayedNodes, previousScene = this.displayedScene;
      // Clearing src after detaching decoded <img>s retains native Blink nodes.
      // Keep old artwork visible until decoding completes, then clear while attached.
      this.clearImageSources(previousNodes);
      this.background.replaceChildren(...nodes.background); this.objects.replaceChildren(...nodes.objects); this.front.replaceChildren(...nodes.front);
      this.pendingFrame = null; this.pendingNodes = null; this.displayed = frame; this.displayedNodes = nodes; this.displayedScene = scene; acquired = null; nodes = null;
      this.releaseFrame(previous);
      if (previousScene && previousScene !== scene) previousScene.dispose();
      this.element.dataset.mapReady = 'true'; this.element.dataset.sceneImages = String(this.displayedNodes.images.length); this.avatars.style.visibility = ''; this.positionSprites(); this.message(''); this.options.onViewport?.();
    }).catch(error => {
      if (!this.closed && !request.signal.aborted && generation === this.generation && (error as Error)?.name !== 'AbortError') { this.failedViewport = key; this.message('Map artwork could not be loaded.', true); }
    }).finally(() => {
      this.clearImageSources(nodes); if (this.pendingNodes === nodes) this.pendingNodes = null; if (this.pendingFrame === acquired) this.pendingFrame = null; this.releaseFrame(acquired);
      if (this.frameAbort === request) { this.frameAbort = null; this.framePending = false; if (!this.closed && generation === this.generation) this.ensureFrame(); }
    });
  }
  private buildNodes(frame: SceneFrame): FrameNodes {
    const result: FrameNodes = { background: [], objects: [], front: [], sprites: [], images: [] };
    if (frame.tiles.length + frame.objects.length + frame.frontObjects.length > 768) throw new Error('World sprite count exceeds budget');
    try {
      const append = (sprites: readonly SceneSprite[], target: HTMLElement[], depth = false) => {
        for (const sprite of sprites) {
          const url = safeImageUrl(sprite.url); if (!url) throw new Error('Invalid world image URL');
          const image = node('img', 'de-world-image') as HTMLImageElement; image.alt = ''; image.decoding = 'async'; image.src = url; result.images.push(image);
          let element: HTMLElement = image;
          if (sprite.clipWidth !== undefined && sprite.clipHeight !== undefined) {
            element = node('div', 'de-world-tile'); element.style.width = `${sprite.clipWidth / WORLD_VIEW_WIDTH * 100}%`; element.style.height = `${sprite.clipHeight / WORLD_VIEW_HEIGHT * 100}%`;
            image.style.width = `${sprite.width / sprite.clipWidth * 100}%`; image.style.height = `${sprite.height / sprite.clipHeight * 100}%`; element.append(image);
          } else { image.style.width = `${sprite.width / WORLD_VIEW_WIDTH * 100}%`; image.style.height = `${sprite.height / WORLD_VIEW_HEIGHT * 100}%`; }
          if (depth) { element.style.zIndex = String(objectDepth(sprite)); element.dataset.depth = element.style.zIndex; }
          target.push(element); result.sprites.push({ sprite, element }); this.staging.append(element);
        }
      };
      append(frame.tiles, result.background); append(frame.objects, result.objects, true); append(frame.frontObjects, result.front); return result;
    } catch (error) { this.clearImageSources(result); throw error; }
  }
  private async decodeFrame(images: HTMLImageElement[], signal: AbortSignal): Promise<void> {
    let next = 0;
    const decode = (image: HTMLImageElement) => new Promise<void>((resolve, reject) => {
      const aborted = () => { cleanup(); reject(new DOMException('World image decoding canceled', 'AbortError')); };
      const cleanup = () => signal.removeEventListener('abort', aborted);
      if (signal.aborted) { aborted(); return; } signal.addEventListener('abort', aborted, { once: true });
      let work: Promise<void>; try { work = this.options.decodeImage ? this.options.decodeImage(image) : typeof image.decode === 'function' ? image.decode() : Promise.resolve(); } catch (error) { work = Promise.reject(error); }
      void work.then(() => { cleanup(); if (signal.aborted) reject(new DOMException('World image decoding canceled', 'AbortError')); else resolve(); }, error => { cleanup(); reject(error); });
    });
    const worker = async () => { while (!signal.aborted) { const image = images[next++]; if (!image) return; await decode(image); } if (signal.aborted) throw new DOMException('World image decoding canceled', 'AbortError'); };
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, images.length) }, worker));
    const failure = results.find((v): v is PromiseRejectedResult => v.status === 'rejected'); if (failure) throw failure.reason;
  }
  private fit(): void {
    const parent = this.element.parentElement ?? this.element.parentNode as HTMLElement | null;
    if (!parent || typeof parent.getBoundingClientRect !== 'function' || parent === this.observedParent) return;
    this.resizeObserver?.disconnect(); this.observedParent = parent;
    const layout = () => { const box = parent.getBoundingClientRect(); if (!(box.width > 0 && box.height > 0)) return; const scale = Math.min(box.width / WORLD_VIEW_WIDTH, box.height / WORLD_VIEW_HEIGHT); this.element.style.width = `${WORLD_VIEW_WIDTH * scale}px`; this.element.style.height = `${WORLD_VIEW_HEIGHT * scale}px`; this.element.style.left = `${(box.width - WORLD_VIEW_WIDTH * scale) / 2}px`; this.element.style.top = `${(box.height - WORLD_VIEW_HEIGHT * scale) / 2}px`; };
    layout(); if (typeof ResizeObserver === 'function') { this.resizeObserver = new ResizeObserver(layout); this.resizeObserver.observe(parent); }
  }
  private cancelPendingFrame(): void {
    this.frameAbort?.abort(); this.frameAbort = null; this.framePending = false;
    this.clearImageSources(this.pendingNodes); this.pendingNodes = null; this.releaseFrame(this.pendingFrame); this.pendingFrame = null;
  }
  private releaseFrame(frame: SceneFrame | null): void { if (frame && !this.releasedFrames.has(frame)) { this.releasedFrames.add(frame); frame.release(); } }
  private clearImageSources(bundle: FrameNodes | null): void {
    if (!bundle) return; for (const image of bundle.images) { image.removeAttribute('src'); image.remove(); }
    for (const { element } of bundle.sprites) element.remove();
    bundle.images.length = 0; bundle.sprites.length = 0; bundle.background.length = 0; bundle.objects.length = 0; bundle.front.length = 0;
  }
  /** Leaving a scene detaches all URLs before releasing their leases and metadata owner. */
  hide(): void {
    if (this.closed) return;
    ++this.generation; this.loadAbort?.abort(); this.loadAbort = null; this.cancelPendingFrame(); this.resizeObserver?.disconnect(); this.resizeObserver = null; this.observedParent = null;
    this.clearImageSources(this.displayedNodes); this.displayedNodes = null; this.releaseFrame(this.displayed); this.displayed = null;
    this.background.replaceChildren(); this.objects.replaceChildren(); this.front.replaceChildren(); this.avatars.replaceChildren();
    const scenes = new Set([this.scene, this.displayedScene]); for (const scene of scenes) scene?.dispose();
    this.scene = null; this.displayedScene = null; this.requestedMap = null; this.element.dataset.mapReady = 'false'; this.element.dataset.sceneImages = '0'; this.camera = null; this.failedViewport = null; this.failedLoad = false; this.message(''); this.avatars.style.visibility = 'hidden';
  }
  dispose(): void { if (this.closed) return; this.hide(); this.closed = true; this.element.replaceChildren(); this.element.remove(); }
}
