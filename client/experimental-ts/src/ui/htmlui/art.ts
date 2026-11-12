// The rewrite's art for pictures.ts (what the engine draws on main): archive textures, card faces by passcode, the
// player's waist-up portrait (duel-portrait.ts WaistUpComposer) and the shop's clerk, composed from the original's NPC
// picture (data/avatar/npc/<id>.csv: its id, place and a 3 x 3 grid of 256-pixel tiles, '****' an empty one).
import { WaistUpComposer, canvasUrl } from '../duel-portrait';
import type { PictureResolver, PictureSource } from './pictures';

type Lease = { url: string; release(): void };
export interface ArtLoaders {
  loadArchiveImage?: (path: string, signal: AbortSignal) => Promise<Lease>;
  loadCardImage?: (passcode: number, signal: AbortSignal) => Promise<Lease>;
}

/** The tiles of an NPC picture's first frame (rows of the csv after its four header lines), '' for an empty tile. */
export function npcTiles(csv: string): string[] {
  const lines = csv.split(/\r?\n/).map(l => l.trim());
  return lines.slice(4, 13).map(t => t === '****' ? '' : t);
}

export class PictureArt {
  private leases: Lease[] = [];
  /** The composed pictures' object URLs (a portrait, a clerk), revoked with the client. */
  private urls: string[] = [];
  private composer: WaistUpComposer | null;
  constructor(private loaders: ArtLoaders) {
    const load = loaders.loadArchiveImage;
    this.composer = load ? new WaistUpComposer((path, signal) => load(path, signal)) : null;
  }
  private keep(lease: Lease): string { this.leases.push(lease); return lease.url; }
  // '?' in a game path is the language letter: English, else the Japanese art (main's deck.js does the same)
  private async archive(path: string, signal: AbortSignal): Promise<string> {
    const load = this.loaders.loadArchiveImage; if (!load) throw new Error('No original art.');
    if (!path.includes('?')) return this.keep(await load(path, signal));
    return this.keep(await load(path.replace('?', 'e'), signal).catch(() => load(path.replace('?', 'j'), signal)));
  }
  readonly resolve: PictureResolver = async (source: PictureSource, signal) => {
    if ('archive' in source) return this.archive(source.archive, signal);
    if ('card' in source) { const load = this.loaders.loadCardImage; if (!load) throw new Error('No card art.'); return this.keep(await load(source.card, signal)); }
    const [kind, arg = ''] = source.canvas.split(':');
    if (kind === 'portrait' && this.composer) return this.picture(await this.composer.compose(Uint8Array.from(arg.split('.').map(Number)), 1, signal));
    if (kind === 'clerk') return this.picture(await this.clerk(arg, signal));
    throw new Error('Unknown picture.');
  };
  private async clerk(id: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
    if (!/^[ad]\d\d$/.test(id)) throw new Error('Unknown clerk.');
    const load = this.loaders.loadArchiveImage; if (!load) throw new Error('No original art.');
    const lease = await load(`data/avatar/npc/${id}.csv`, signal);
    let csv: string; try { csv = await (await fetch(lease.url, { signal })).text(); } finally { lease.release(); }
    const tiles = npcTiles(csv), canvas = document.createElement('canvas'); canvas.width = canvas.height = 768;
    const ctx = canvas.getContext('2d');
    await Promise.all(tiles.map(async (tile, i) => {
      if (!tile || !/^[\w.-]+\.png$/.test(tile)) return;
      const url = await this.archive(`data/avatar/npc/${tile}`, signal).catch(() => null); if (!url) return;
      const img = new Image(); img.src = url; await img.decode().catch(() => {});
      if (img.naturalWidth) ctx?.drawImage(img, 256 * (i % 3), 256 * Math.floor(i / 3));
    }));
    return canvas;
  }
  /** A composition made off screen as the picture the window shows (an <img>). */
  private async picture(canvas: HTMLCanvasElement): Promise<string> { const url = await canvasUrl(canvas); this.urls.push(url); return url; }
  dispose(): void { for (const l of this.leases) l.release(); this.leases = []; for (const u of this.urls) URL.revokeObjectURL(u); this.urls = []; }
}
