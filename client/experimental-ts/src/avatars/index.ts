import type { AssetLease } from '../assets';
import { imageBudget } from '../assets/image-bounds';
import { checkAbort } from '../assets/async';
import { avatarParts, avatarPose, resolveAvatarPngs } from './appearance';
import type { AvatarMotion } from './appearance';
import { AvatarMovie } from './movie';
export { AvatarMovie, multiply } from './movie';
export type { AvatarLayer, Matrix } from './movie';
export { avatarParts, defaultAvatar, resolveAvatarPngs, avatarPose, avatarDirection, AVATAR_MOTIONS } from './appearance';
export type { AvatarMotion } from './appearance';
/** AssetManager satisfies this interface; loader never owns/disposes the manager. */
export interface AvatarAssets { readScene(path: string, signal?: AbortSignal): Promise<AssetLease>; }
export interface AvatarBitmap { readonly width: number; readonly height: number; close(): void; }
export interface AvatarLoadOptions { world?: 0 | 1; motion?: AvatarMotion; direction?: number; signal?: AbortSignal; }
export interface AvatarLoaderOptions {
  /** Aggregate decoded pixels + retained bytes, including live resources. Default 32 MiB. */
  budgetBytes?: number;
  /** Optional private generator output. Missing motions still load through readScene. */
  motionData?: Readonly<Record<string, string>>;
  /** Injectable for tests/platforms. Browser default uses createImageBitmap. */
  decode?: (lease: AssetLease, signal: AbortSignal) => Promise<AvatarBitmap>;
}
export interface AvatarDrawOptions { x?: number; y?: number; scale?: number; frame?: number; elapsedMs?: number;
  /** Include the named opaque atari hit-area sprite. Hidden by default (documented inference). */
  includeHitArea?: boolean;
}
export class AvatarResource {
  private closed = false;
  constructor(readonly movie: AvatarMovie, readonly pose: ReturnType<typeof avatarPose>, readonly paths: readonly string[],
    private readonly images: ReadonlyMap<number, AvatarBitmap>, private cleanup: () => void) {}
  /** Milliseconds at source frame rate; non-looping motions hold their last frame. */
  frameAt(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid avatar elapsed time');
    const n = Math.floor(elapsedMs * this.movie.fps / 1000);
    return this.pose.loop ? n : Math.min(n, this.movie.frameCount - 1);
  }
  layers(frame = 0) {
    if (this.closed) throw new Error('Avatar resource disposed');
    return this.movie.layers(frame, this.pose.loop);
  }
  /** Draw at original elm origin. Caller clears canvas and selects viewport. */
  draw(ctx: CanvasRenderingContext2D, options: AvatarDrawOptions = {}): void {
    const { x = 0, y = 0, scale = 1 } = options;
    if (![x,y,scale].every(Number.isFinite) || scale <= 0) throw new Error('Invalid avatar draw transform');
    const frame = options.frame ?? this.frameAt(options.elapsedMs ?? 0), layers = this.layers(frame);
    ctx.save();
    try {
      ctx.translate(x,y); ctx.scale(this.pose.mirrored ? -scale : scale, scale);
      ctx.translate(...this.pose.offset);
      for (const layer of layers) {
        if (!options.includeHitArea && /^(?:cm|cw)_atari_01_mc$/.test(layer.name ?? '')) continue;
        const image = this.images.get(layer.file);
        if (!image) throw new Error('Avatar bitmap not loaded');
        ctx.save();
        try {
          ctx.transform(...layer.matrix); ctx.globalAlpha *= layer.alpha;
          const [left,top,right,bottom] = layer.bounds;
          ctx.beginPath(); ctx.rect(left,top,right-left,bottom-top); ctx.clip();
          ctx.transform(...layer.bitmapMatrix);
          ctx.drawImage(image as ImageBitmap,0,0);
        } finally { ctx.restore(); }
      }
    } finally { ctx.restore(); }
  }
  dispose(): void { if (!this.closed) { this.closed = true; this.cleanup(); } }
}
export class AvatarLoader {
  private readonly pending = new Set<AbortController>();
  private readonly live = new Set<AvatarResource>();
  private readonly budget: number;
  private readonly decode: NonNullable<AvatarLoaderOptions['decode']>;
  private readonly motionData: Readonly<Record<string, string>>;
  private used = 0;
  private closed = false;
  constructor(private readonly assets: AvatarAssets, options: AvatarLoaderOptions = {}) {
    this.motionData = { ...options.motionData };
    if (Object.keys(this.motionData).length > 23 || Object.values(this.motionData).reduce((n,t) => n + (typeof t === 'string' ? t.length : Infinity),0) > 32*1024*1024) throw new Error('Avatar motion data exceeds budget');
    this.budget = options.budgetBytes ?? 32*1024*1024;
    if (!Number.isSafeInteger(this.budget) || this.budget < 1 || this.budget > 256*1024*1024) throw new Error('Invalid avatar budget');
    this.decode = options.decode ?? (async (lease) => createImageBitmap(new Blob([lease.value.bytes.slice().buffer], {type:lease.value.mimeType})));
  }
  get retainedBytes(): number { return this.used; }
  async load(appearance: ArrayLike<number>, options: AvatarLoadOptions = {}): Promise<AvatarResource> {
    if (this.closed) throw new Error('Avatar loader disposed');
    checkAbort(options.signal);
    const parts = avatarParts(appearance), pose = avatarPose(options.motion, options.direction), world = options.world ?? 0;
    if (world !== 0 && world !== 1) throw new Error('Invalid avatar world');
    const controller = new AbortController(), signal = controller.signal;
    const cancel = (): void => controller.abort();
    options.signal?.addEventListener('abort',cancel,{once:true}); this.pending.add(controller);
    const leases: AssetLease[] = [], images = new Map<number, AvatarBitmap>(); let charged = 0;
    const reserve = (bytes: number): void => {
      if (bytes > this.budget - this.used) throw new Error('Avatar decoded resource budget exceeded');
      this.used += bytes; charged += bytes;
    };
    const cleanup = (): void => {
      for (const image of new Set(images.values())) image.close(); images.clear();
      for (const lease of leases) lease.release(); leases.length = 0;
      this.used -= charged; charged = 0;
    };
    signal.addEventListener('abort',cleanup,{once:true});
    try {
      const local = this.motionData[pose.path];
      const metadata = local === undefined ? await this.assets.readScene(pose.path,signal) : undefined;
      let movie: AvatarMovie;
      try {
        checkAbort(signal);
        if (metadata && metadata.value.bytes.length > 4*1024*1024) throw new Error('Avatar metadata exceeds budget');
        movie = new AvatarMovie(local ?? new TextDecoder('utf-8',{fatal:true}).decode(metadata!.value.bytes));
      } finally { metadata?.release(); }
      if (movie.issues.length) throw new Error(`Unsupported avatar features: ${movie.issues.join(', ')}`);
      const names = resolveAvatarPngs(movie.files,parts,world);
      const paths = names.map(n => `data/Avatar/chibi/${n}`), byPath = new Map<string, AvatarBitmap>();
      // Source movie may reference different images on later frames: retain exactly one lease per filename.
      for (let i = 0; i < paths.length; i++) {
        checkAbort(signal);
        let image = byPath.get(paths[i]);
        if (!image) {
          const lease = await this.assets.readScene(paths[i],signal); leases.push(lease); checkAbort(signal);
          const bounds = imageBudget(lease.value.bytes,lease.value.mimeType,{maxWidth:2048,maxHeight:2048,maxPixels:4*1024*1024});
          reserve(bounds.decodedBytes + lease.value.bytes.length);
          image = await this.decode(lease,signal);
          // Register before checking abort so late decoders always get closed.
          images.set(i,image); byPath.set(paths[i],image);
          checkAbort(signal);
          if (image.width !== bounds.width || image.height !== bounds.height) throw new Error('Avatar decoder geometry mismatch');
        }
        images.set(i,image);
      }
      checkAbort(signal);
      const resource = new AvatarResource(movie,pose,paths,images,() => { this.live.delete(resource); cleanup(); });
      this.live.add(resource); return resource;
    } catch (error) { cleanup(); throw error; }
    finally { this.pending.delete(controller); signal.removeEventListener('abort',cleanup); options.signal?.removeEventListener('abort',cancel); }
  }
  /** Cancels pending loads and closes every owned bitmap/lease; does not dispose the asset source. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.pending) controller.abort();
    for (const resource of [...this.live]) resource.dispose();
  }
}
