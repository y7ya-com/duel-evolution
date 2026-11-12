import { avatarParts } from '../avatars/appearance';
import type { AvatarLoadOptions, AvatarResource } from '../avatars';

export interface AvatarViewOptions {
  loadAvatar(parts: Uint8Array, options: AvatarLoadOptions): Promise<AvatarResource>;
  now?(): number;
  requestFrame?(callback: FrameRequestCallback): number;
  cancelFrame?(handle: number): void;
  reducedMotion?: boolean | (() => boolean);
  /** World coordinates anchor the original movie origin; previews center the feet. */
  sourceOrigin?: boolean;
}
interface Request { key: string; parts: Uint8Array; world: 0 | 1; motion: 'stand' | 'walk'; direction: number; }
interface Displayed { key: string; resource: AvatarResource; request: Request; started: number; frame: number; }
export const AVATAR_VIEW_WIDTH = 128, AVATAR_VIEW_HEIGHT = 160;
export const AVATAR_FOOT_X = 64, AVATAR_FOOT_Y = 144;

/** A persistent picture (an <img>: each frame is painted off screen and shown as its PNG), one displayed resource and
 * at most one outstanding load.
 * Aborted loads must settle before the latest coalesced request starts; even an
 * uncooperative decoder cannot accumulate an unbounded queue of replacements. */
export class AvatarView {
  readonly element = document.createElement('img');
  private readonly scratch = document.createElement('canvas');
  private readonly scratchContext: CanvasRenderingContext2D | null;
  private readonly now: () => number;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private desired: Request | null = null;
  private displayed: Displayed | null = null;
  private pending: { request: Request; abort: AbortController } | null = null;
  private failedKey: string | null = null;
  private frameHandle: number | null = null;
  private frameGeneration = 0;
  private closed = false;
  constructor(private readonly options: AvatarViewOptions) {
    this.element.width = this.scratch.width = AVATAR_VIEW_WIDTH;
    this.element.height = this.scratch.height = AVATAR_VIEW_HEIGHT;
    this.element.className = 'de-avatar-view'; this.element.alt = ''; this.element.draggable = false; this.element.setAttribute('aria-hidden', 'true');
    this.element.dataset.avatarReady = 'false';
    this.element.dataset.avatarPainted = 'false';
    this.element.dataset.footX = String(AVATAR_FOOT_X); this.element.dataset.footY = String(AVATAR_FOOT_Y);
    this.scratchContext = this.scratch.getContext('2d');
    this.now = options.now ?? (() => performance.now());
    this.requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? (handle => cancelAnimationFrame(handle));
  }
  show(parts: Uint8Array, world: 0 | 1, motion: 'stand' | 'walk', direction: number): void {
    if (this.closed) return;
    if (world !== 0 && world !== 1 || motion !== 'stand' && motion !== 'walk' || !Number.isInteger(direction) || direction < 0 || direction > 7) throw new Error('Invalid avatar view pose');
    const copy = avatarParts(parts), key = `${world}/${motion}/${direction}/${Array.from(copy).join(',')}`;
    if (this.desired?.key === key) { this.animate(); return; }
    this.stopFrame(); this.failedKey = null;
    this.desired = { key, parts: copy, world, motion, direction };
    delete this.element.dataset.avatarError; this.element.dataset.avatarReady = 'false';
    if (this.pending?.request.key !== key) this.pending?.abort.abort();
    if (this.displayed?.key === key) {
      this.element.dataset.avatarReady = 'true'; this.animate();
    } else this.loadLatest();
  }
  private loadLatest(): void {
    if (this.closed || this.pending || !this.desired || this.desired.key === this.displayed?.key || this.desired.key === this.failedKey) return;
    if (!this.scratchContext) { this.fail('Canvas rendering is unavailable'); this.failedKey = this.desired.key; return; }
    const request = this.desired, abort = new AbortController();
    this.pending = { request, abort }; this.element.dataset.avatarLoading = 'true';
    let promise: Promise<AvatarResource>;
    try { promise = this.options.loadAvatar(request.parts.slice(), { world: request.world, motion: request.motion, direction: request.direction, signal: abort.signal }); }
    catch (error) { promise = Promise.reject(error); }
    void promise.then(resource => {
      if (this.closed || abort.signal.aborted || this.desired?.key !== request.key) { resource.dispose(); return; }
      const next: Displayed = { key: request.key, resource, request, started: this.now(), frame: -1 };
      try { this.paint(next, 0); }
      catch (error) { resource.dispose(); throw error; }
      const old = this.displayed; this.displayed = next;
      // Release the previous decoded images only after the replacement reaches the visible picture.
      old?.resource.dispose(); this.element.dataset.avatarReady = 'true'; delete this.element.dataset.avatarError;
      this.animate();
    }).catch(error => {
      if (!this.closed && !abort.signal.aborted && this.desired?.key === request.key) {
        this.failedKey = request.key; this.fail(error instanceof Error ? error.message : 'Avatar artwork could not be loaded');
      }
    }).finally(() => {
      if (this.pending?.abort === abort) { this.pending = null; delete this.element.dataset.avatarLoading; }
      this.loadLatest();
    });
  }
  private paint(displayed: Displayed, frame: number): void {
    const { resource } = displayed, ctx = this.scratchContext!;
    ctx.clearRect(0, 0, AVATAR_VIEW_WIDTH, AVATAR_VIEW_HEIGHT);
    const sign = resource.pose.mirrored ? -1 : 1;
    // The source movie's root offset is (-46,-116), foot probe (40,116).
    // Previews center that probe; world actors retain its original -6/+6 offset.
    resource.draw(ctx, { x: this.options.sourceOrigin ? AVATAR_FOOT_X : AVATAR_FOOT_X - sign * (resource.pose.offset[0] + resource.pose.foot[0]),
      y: AVATAR_FOOT_Y - resource.pose.offset[1] - resource.pose.foot[1], frame });
    this.element.src = this.scratch.toDataURL(); this.element.dataset.avatarPainted = 'true'; this.element.dataset.avatarDrawn = displayed.key;
    this.element.dataset.footX = String(this.options.sourceOrigin ? AVATAR_FOOT_X + sign * (resource.pose.offset[0] + resource.pose.foot[0]) : AVATAR_FOOT_X);
    displayed.frame = frame;
  }
  private animate(): void {
    const displayed = this.displayed;
    const reduced = typeof this.options.reducedMotion === 'function' ? this.options.reducedMotion() : this.options.reducedMotion;
    // Source standing poses are static. No frame loop while idle/loading/failed,
    // and source walk cadence is retained without repainting between movie frames.
    if (this.closed || !displayed || this.desired?.key !== displayed.key || this.failedKey === displayed.key || displayed.request.motion !== 'walk' || reduced || displayed.resource.movie.frameCount <= 1) { this.stopFrame(); return; }
    if (this.frameHandle !== null) return;
    const generation = this.frameGeneration;
    this.frameHandle = this.requestFrame(() => {
      if (generation !== this.frameGeneration) return;
      this.frameHandle = null;
      if (this.closed || this.displayed !== displayed || this.desired?.key !== displayed.key) return;
      const elapsed = Math.max(0, this.now() - displayed.started);
      // Source walk children are single-frame sprites; wrapping the root also
      // prevents frame counters exceeding the bounded evaluator in long sessions.
      const frame = Math.floor(elapsed * displayed.resource.movie.fps / 1000) % displayed.resource.movie.frameCount;
      try { if (frame !== displayed.frame) this.paint(displayed, frame); }
      catch (error) { this.failedKey = displayed.key; this.fail(error instanceof Error ? error.message : 'Avatar drawing failed'); return; }
      this.animate();
    });
  }
  private fail(message: string): void { this.stopFrame(); this.element.dataset.avatarReady = 'false'; this.element.dataset.avatarError = message.slice(0, 256); }
  private stopFrame(): void { this.frameGeneration++; if (this.frameHandle !== null) { this.cancelFrame(this.frameHandle); this.frameHandle = null; } }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.stopFrame(); this.pending?.abort.abort();
    this.displayed?.resource.dispose(); this.displayed = null; this.desired = null;
    this.element.dataset.avatarReady = 'false'; delete this.element.dataset.avatarLoading;
    this.element.dataset.avatarPainted = 'false';
    // Release the picture and the drawing surface. AvatarResource owns/revokes its own decoded leases.
    this.element.removeAttribute('src'); this.scratch.width = this.scratch.height = 0;
    this.element.remove();
  }
}
