import { describe, expect, it, vi } from 'vitest';
import { SceneLoader } from '../src/world/scene';
import { parseSceneTable, pngDimensions, sceneAssetPath, sceneTilePath } from '../src/world/scene-format';
import type { AssetLease } from '../src/assets';

function table(name = 'Map_d01_01') {
  return `MapData::Start\n${name}; MapName\nSynthetic/base; BaseMap\n16; BasePartsW\n16; BasePartsH\n3; BaseNumX\n2; BaseNumY\nSynthetic/hit; HitMap\n1; ObjMapNum\nSynthetic/object.png; Pic\n-4; X\n-2; Y\n1; FrontObjMapNum\nSynthetic/front.png; Pic\n30; X\n1; Y\nMapData::End\n`;
}
function png(width = 16, height = 16) {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(8,13); view.setUint32(12,0x49484452); view.setUint32(16,width);view.setUint32(20,height);return bytes;
}
function fixture(text = table()) {
  const leases: { path: string; release: ReturnType<typeof vi.fn> }[] = [];
  const assets = { readScene: vi.fn(async (path: string, _signal?: AbortSignal): Promise<AssetLease> => {
    const release = vi.fn(); leases.push({ path, release });
    return { value: { bytes: path.endsWith('.txt') ? new TextEncoder().encode(text) : png(), url: 'blob:' + path, mimeType: 'image/png' }, release };
  }) };
  return { assets, leases, loader: new SceneLoader({ assets }) };
}
const view = { x: 0, y: 0, width: 16, height: 16 };

describe('source scene format', () => {
  it('parses value-first CRLF records, signed object coordinates and source layers', () => {
    const d = parseSceneTable(table().replaceAll('\n','\r\n')).get('Map_d01_01')!;
    expect(d).toMatchObject({ width:48,height:32,tileWidth:16,tileHeight:16,columns:3,rows:2 });
    expect(d.objects[0]).toEqual({ path:'data/Map/Synthetic/object.png',x:-4,y:-2 });
    expect(d.frontObjects[0].x).toBe(30);
    expect(Object.isFrozen(d.objects[0])).toBe(true);
    expect(sceneTilePath(d,0,1)).toBe('data/Map/Synthetic/base_1_2.png');
    expect(sceneTilePath(d,2,0,true)).toBe('data/Map/Synthetic/hit_3_1.png');
    expect(() => sceneTilePath(d,3,0)).toThrow();
  });
  it.each([
    ['', 'empty'], [table().replace('MapData::End',''), 'unterminated'],
    [table()+table(), 'duplicate'], [table().replace('16; BasePartsW','0; BasePartsW'), 'zero tile'],
    [table().replace('3; BaseNumX','17; BaseNumX'), 'too many tiles'],
    [table().replace('1; ObjMapNum','257; ObjMapNum'), 'too many objects'],
    [table().replace('-4; X','-32769; X'), 'bad coordinate'],
    [table().replace('16; BasePartsH','1e2; BasePartsH'), 'nondecimal'],
    [table().replace('Synthetic/object.png','../object.png'), 'traversal'],
    [table().replace('Synthetic/object.png','Synthetic/object.jpg'), 'nonpng'],
    [table().replace('1; FrontObjMapNum','0; FrontObjMapNum'), 'count mismatch'],
    [table().replace('16; BasePartsW','BasePartsW; 16'), 'key first'],
    [table()+'\0', 'nul'], [table().replace('MapData::End','MapData::End\nfoo'), 'trailing'],
  ])('rejects malformed table: %s (%s)', (text) => { expect(() => parseSceneTable(text)).toThrow(); });
  it('bounds input and rejects invalid asset paths', () => {
    expect(() => parseSceneTable(' '.repeat(1048577))).toThrow();
    for (const path of ['/foo','https://x/a','a//b','a/./b','a/../b','a?b','a#b','C:\\a']) expect(() => sceneAssetPath(path)).toThrow();
    expect(sceneAssetPath('data\\map\\test.png')).toBe('data/map/test.png');
  });
  it('checks PNG header spans, dimensions and decoded pixel bounds', () => {
    expect(pngDimensions(png(1024,768))).toEqual({width:1024,height:768});
    for (const bytes of [png().slice(0,32), new Uint8Array(33), png(0), png(8193), png(8192,8192)]) expect(() => pngDimensions(bytes)).toThrow();
    const prefixed = new Uint8Array(40);prefixed.set(png(),7);expect(pngDimensions(prefixed.subarray(7))).toEqual({width:16,height:16});
  });
});

describe('leased scene streaming', () => {
  it('loads only metadata, then streams intersecting tiles and layers in source order', async () => {
    const {loader,assets,leases} = fixture();const scene = await loader.load(0);
    expect(assets.readScene).toHaveBeenCalledTimes(1);expect(leases[0].release).toHaveBeenCalledOnce();
    const frame = await scene.frame(view);
    expect(frame.tiles.map(s=>s.path)).toEqual(['data/Map/Synthetic/base_1_1.png']);
    expect(frame.objects.map(s=>s.x)).toEqual([-4]);expect(frame.frontObjects).toEqual([]);expect(frame.npcSpots).toEqual([]);
    expect(assets.readScene.mock.calls.some(([p])=>p.includes('front.png'))).toBe(false);
    frame.release();frame.release();
    expect(leases.every(l=>l.release.mock.calls.length===1)).toBe(true);
    loader.dispose();await expect(scene.frame(view)).rejects.toThrow('disposed');
  });
  it('retains a displayed frame across replacement and releases all on disposal', async () => {
    const {loader,leases} = fixture();const scene=await loader.load(0);
    const a=await scene.frame(view), b=await scene.frame({...view,x:16});
    expect(a.tiles[0].url).toContain('base_1_1');expect(b.tiles[0].url).toContain('base_2_1');
    expect(leases.filter(l=>!l.path.endsWith('.txt')).every(l=>!l.release.mock.calls.length)).toBe(true);
    a.release();scene.dispose();scene.dispose();b.release();loader.dispose();
    expect(leases.every(l=>l.release.mock.calls.length===1)).toBe(true);
  });
  it('discovers object dimensions and stops requesting known offscreen images', async () => {
    const {loader,assets,leases}=fixture(table().replace('-4; X','-20; X'));
    const scene=await loader.load(0), a=await scene.frame(view);
    expect(a.objects).toHaveLength(0);
    const objectLease=leases.find(l=>l.path.endsWith('object.png'))!;expect(objectLease.release).toHaveBeenCalledOnce();a.release();
    const before=assets.readScene.mock.calls.filter(([p])=>p.endsWith('object.png')).length;
    (await scene.frame(view)).release();expect(assets.readScene.mock.calls.filter(([p])=>p.endsWith('object.png')).length).toBe(before);loader.dispose();
  });
  it('rejects invalid ids, missing sections and closed loader without leaking table lease', async () => {
    const {loader,leases}=fixture();for (const id of [-1,10,NaN,0.2]) await expect(loader.load(id)).rejects.toThrow();
    await expect(loader.load(8)).rejects.toThrow('missing');expect(leases[0].release).toHaveBeenCalledOnce();loader.dispose();await expect(loader.load(0)).rejects.toThrow('disposed');
  });
  it('releases every acquired image on malformed PNG', async () => {
    for (const bytes of [png(0),new Uint8Array(33)]) {
      const {loader,assets,leases}=fixture();const scene=await loader.load(0);
      assets.readScene.mockImplementation(async path=>{const release=vi.fn();leases.push({path,release});return {value:{bytes,url:'blob:test',mimeType:'image/png'},release};});
      await expect(scene.frame({...view,width:48,height:32})).rejects.toThrow();expect(leases.every(l=>l.release.mock.calls.length===1)).toBe(true);loader.dispose();
    }
  });
  it('handles an empty off-map frame without image requests', async()=>{
    const {loader,assets}=fixture();const scene=await loader.load(0);const frame=await scene.frame({...view,x:40000,y:40000});
    expect(frame.tiles).toHaveLength(0);expect(frame.objects).toHaveLength(0);expect(assets.readScene).toHaveBeenCalledTimes(1);loader.dispose();
  });
  it('validates viewport bounds and pre-abort before loading images',async()=>{
    const {loader,assets}=fixture();const scene=await loader.load(0);
    for(const invalid of [{...view,x:NaN},{...view,width:0},{...view,height:Infinity}]) await expect(scene.frame(invalid)).rejects.toThrow();
    const c=new AbortController();c.abort();await expect(scene.frame(view,c.signal)).rejects.toMatchObject({name:'AbortError'});expect(assets.readScene).toHaveBeenCalledTimes(1);loader.dispose();
  });
  it('releases late noncooperative image resolutions after replacement and disposal',async()=>{
    const {loader,assets,leases}=fixture();const scene=await loader.load(0);
    let resolve!: (lease:AssetLease)=>void;
    assets.readScene.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const old=scene.frame(view);const assertion=expect(old).rejects.toMatchObject({name:'AbortError'});
    const current=await scene.frame({...view,x:16});const release=vi.fn();resolve({value:{bytes:png(),url:'blob:late',mimeType:'image/png'},release});
    await assertion;expect(release).toHaveBeenCalledOnce();scene.dispose();current.release();expect(leases.every(l=>l.release.mock.calls.length===1)).toBe(true);
  });
  it('releases late metadata after superseding loader load',async()=>{
    const {loader,assets}=fixture();let resolve!:(lease:AssetLease)=>void;
    assets.readScene.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const old=loader.load(0);const assertion=expect(old).rejects.toMatchObject({name:'AbortError'});
    await loader.load(0);const release=vi.fn();resolve({value:{bytes:new TextEncoder().encode(table()),url:'blob:late',mimeType:'text/plain'},release});
    await assertion;expect(release).toHaveBeenCalledOnce();loader.dispose();
  });
});

describe('streaming resource bounds',()=>{
  it('never runs more than four image reads concurrently and preserves tile order',async()=>{
    const {loader,assets}=fixture();const scene=await loader.load(0);
    let active=0,peak=0;
    assets.readScene.mockImplementation(async path=>{
      active++;peak=Math.max(peak,active);
      await new Promise(r=>setTimeout(r,1));active--;
      return {value:{bytes:png(),url:'blob:'+path,mimeType:'image/png'},release:vi.fn()};
    });
    const frame=await scene.frame({...view,width:48,height:32});
    expect(peak).toBe(4);expect(active).toBe(0);
    expect(frame.tiles.map(t=>[t.x,t.y])).toEqual([[0,0],[0,16],[16,0],[16,16],[32,0],[32,16]]);loader.dispose();
  });
  it('enforces the frame decoded pixel budget and releases all image leases',async()=>{
    const repeated=Array.from({length:5},(_,i)=>`Synthetic/large${i}.png; Pic\n0; X\n0; Y\n`).join('');
    const text=table().replace('1; ObjMapNum\nSynthetic/object.png; Pic\n-4; X\n-2; Y\n',`5; ObjMapNum\n${repeated}`);
    const {loader,assets,leases}=fixture(text);const scene=await loader.load(0);
    assets.readScene.mockImplementation(async path=>{
      const release=vi.fn();leases.push({path,release});
      return {value:{bytes:png(path.includes('large')?8192:16,path.includes('large')?2048:16),url:'blob:'+path,mimeType:'image/png'},release};
    });
    await expect(scene.frame(view)).rejects.toThrow('pixel budget');expect(leases.every(l=>l.release.mock.calls.length===1)).toBe(true);loader.dispose();
  });
  it('disposes pending scene work and releases its late image',async()=>{
    const {loader,assets}=fixture();const scene=await loader.load(0);let resolve!:(lease:AssetLease)=>void;
    assets.readScene.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const pending=scene.frame({...view,x:16});const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});loader.dispose();
    const release=vi.fn();resolve({value:{bytes:png(),url:'blob:late',mimeType:'image/png'},release});
    await assertion;expect(release).toHaveBeenCalledOnce();
  });
});

 it('preserves PNG dimensions independently of logical tile clipping bounds',async()=>{
   const {loader,assets}=fixture();const scene=await loader.load(0);
   assets.readScene.mockImplementation(async path=>({value:{bytes:png(21,16),url:'blob:'+path,mimeType:'image/png'},release:vi.fn()}));
   const frame=await scene.frame(view);expect(frame.tiles[0]).toMatchObject({width:21,height:16,clipWidth:16,clipHeight:16});loader.dispose();
 });
