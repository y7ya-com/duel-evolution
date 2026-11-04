import { describe, expect, it, vi } from 'vitest';
import { BLACK_HIT_PIXEL, CollisionTiles, decodeCollisionMask, EXIT_HIT_PIXELS, exitIndexFromPixel, finishProbedStep, footGeometry, heightPixelRegion, isWallPixel, rgbaMask, smoothGroundStep } from '../src/world/collision';
const mask = (r = 255, g = 255, b = 255, a = 0) => rgbaMask(1, 1, new Uint8Array([r,g,b,a]));
const png = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10]);
  const v = new DataView(b.buffer); v.setUint32(8,13); v.setUint32(12,0x49484452); v.setUint32(16,w); v.setUint32(20,h); return b;
};
describe('source-backed hit pixel primitives', () => {
  it('uses ARGB, preserving alpha rather than brightness thresholds', () => {
    expect(mask(0,0,255,255).pixel(0,0)).toBe(0xff0000ff);
    expect(mask(0,255,255,255).pixel(0,0)).toBe(0xff00ffff);
    expect(mask(100,0,255,255).pixel(0,0)).toBe(0xff6400ff);
    expect(mask(0,100,255,255).pixel(0,0)).toBe(0xff0064ff);
    expect(isWallPixel(mask(0,0,0,0).pixel(0,0))).toBe(false);
    expect(isWallPixel(0xfe000000)).toBe(false);
    expect(isWallPixel(BLACK_HIT_PIXEL)).toBe(true);
    EXIT_HIT_PIXELS.forEach((c,i) => { expect(exitIndexFromPixel(c)).toBe(i); expect(isWallPixel(c)).toBe(true); });
    expect(exitIndexFromPixel(0xff0000fe)).toBeNull();
    expect(heightPixelRegion(0xffff0000)).toBe('red');
    expect(heightPixelRegion(0x00ff0000)).toBe('other');
  });
  it('owns its input, rejects malformed geometry, and returns black outside', () => {
    const bytes = new Uint8Array([0,0,255,255]), m = rgbaMask(1,1,bytes); bytes.fill(0);
    expect(m.pixel(0,0)).toBe(0xff0000ff); expect(m.pixel(-1,0)).toBe(BLACK_HIT_PIXEL);
    expect(() => m.pixel(0.5,0)).toThrow(); expect(() => rgbaMask(2,2,bytes)).toThrow();
    expect(() => rgbaMask(2,2,new Uint8Array(16),3)).toThrow();
    const c = new AbortController(); c.abort(); expect(() => rgbaMask(1,1,bytes,1,c.signal)).toThrow(/aborted/);
  });
  it('addresses tiles by world stride, retaining unknown separately from black', () => {
    const tiles = new CollisionTiles(1,1,2,2,2);
    expect(tiles.pixel(1,0)).toBeNull(); expect(tiles.pixel(-1,0)).toBe(BLACK_HIT_PIXEL);
    tiles.set(1,0,mask(0,0,255,255)); tiles.set(0,1,mask(0,255,255,255));
    expect(tiles.pixel(1,0)).toBe(0xff0000ff); expect(tiles.pixel(0,1)).toBe(0xff00ffff);
    expect(() => tiles.set(0,0,mask())).toThrow(/budget/); expect(tiles.retainedPixels).toBe(2);
    tiles.set(1,0,mask()); expect(tiles.retainedPixels).toBe(2);
    tiles.delete(1,0); expect(tiles.pixel(1,0)).toBeNull(); tiles.clear(); expect(tiles.retainedPixels).toBe(0);
    expect(() => tiles.pixel(NaN,0)).toThrow(); expect(() => tiles.set(2,0,mask())).toThrow();
  });
  it('does not stretch a larger PNG into the logical cell', () => {
    const tiles = new CollisionTiles(1,1,2,1);
    tiles.set(0,0,rgbaMask(2,1,new Uint8Array([0,0,255,255, 0,255,255,255])));
    expect(tiles.pixel(0,0)).toBe(0xff0000ff); expect(tiles.pixel(1,0)).toBeNull();
  });
  it('transforms the local center and all 16 probes with D3DX row-vector coefficients', () => {
    const f = footGeometry({m00:2,m01:0,m10:0,m11:0.5,m30:-80,m31:-58});
    expect(f.center).toEqual({x:0,y:0}); expect(f.probes).toHaveLength(16);
    expect(f.probes[0]).toEqual({x:40,y:0}); expect(f.probes[4].y).toBeCloseTo(10,4);
    const rotated = footGeometry({m00:0,m01:1,m10:-1,m11:0,m30:0,m31:0});
    expect(rotated.center).toEqual({x:-116,y:40});
    expect(() => footGeometry({m00:NaN,m01:0,m10:0,m11:1,m30:0,m31:0})).toThrow();
  });
  it('caps a reported collision at 3 and moves only above 1.2 pixels', () => {
    expect(finishProbedStep({x:6,y:0},true)).toEqual({x:3,y:0});
    expect(finishProbedStep({x:6,y:0},false)).toEqual({x:6,y:0});
    expect(finishProbedStep({x:1.2,y:0},false)).toEqual({x:0,y:0});
    expect(finishProbedStep({x:1.20001,y:0},false).x).toBe(1.20001);
  });
  it('applies supplied ground scale before 90/10 smoothing', () => {
    expect(smoothGroundStep({x:0,y:0},{x:3,y:4},0.5)).toEqual({x:0.18,y:0.24});
    expect(smoothGroundStep({x:2,y:0},{x:0,y:0},1)).toEqual({x:1.8,y:0});
    expect(() => smoothGroundStep({x:0,y:0},{x:1,y:1},Infinity)).toThrow();
  });
});
describe('bounded browser mask decoder', () => {
  it('checks pre-abort and budgets before invoking a decoder', async () => {
    const c = new AbortController(); c.abort();
    await expect(decodeCollisionMask(png(1,1),{signal:c.signal})).rejects.toMatchObject({name:'AbortError'});
    await expect(decodeCollisionMask(png(2,2),{maxPixels:3})).rejects.toThrow(/budget/);
    await expect(decodeCollisionMask(new Uint8Array())).rejects.toThrow(/PNG/);
  });
  it('closes a late bitmap after cancellation without allocating a canvas', async () => {
    const c = new AbortController(), close = vi.fn(); let finish!: (x: unknown) => void;
    vi.stubGlobal('document', {createElement:vi.fn()});
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(r => {finish=r;})));
    try {
      const pending = decodeCollisionMask(png(1,1),{signal:c.signal}); c.abort(); finish({width:1,height:1,close});
      await expect(pending).rejects.toMatchObject({name:'AbortError'}); expect(close).toHaveBeenCalledOnce();
      expect(document.createElement).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('copies decoded RGBA and frees canvas/bitmap on success', async () => {
    const close = vi.fn(), canvas = {width:0,height:0,getContext:vi.fn(() => ({drawImage:vi.fn(),getImageData:() => ({data:new Uint8ClampedArray([0,0,255,255])})}))};
    vi.stubGlobal('document',{createElement:()=>canvas}); vi.stubGlobal('createImageBitmap',async () => ({width:1,height:1,close}));
    try { const m = await decodeCollisionMask(png(1,1)); expect(m.pixel(0,0)).toBe(0xff0000ff); expect(close).toHaveBeenCalledOnce(); expect(canvas.width).toBe(0); }
    finally {vi.unstubAllGlobals();}
  });
});
