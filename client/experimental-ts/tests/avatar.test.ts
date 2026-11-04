import { describe, it, expect, vi } from 'vitest';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { AvatarLoader, AvatarMovie, avatarPose, avatarDirection, defaultAvatar, resolveAvatarPngs } from '../src/avatars';
import type { AvatarAssets, AvatarBitmap } from '../src/avatars';
import type { AssetLease } from '../src/assets';
import { parseAvatarDump } from '../src/avatars/dump.mjs';
import { assertPrivateOutput, generateAvatarData } from '../tools/avatar-data.mjs';
// All fixtures below are synthetic, constructed in tests; no original assets are embedded.
const ctor = (kind: string, fields = '') => `SWF::Element::${kind}->new(\n${fields}\n)`;
const bmp = (id = 1) => ctor('Tag::DefineBitsLossless',`CharacterID => ${id},\nFileName => 0,\nBitmapWidth => 1,\nBitmapHeight => 1,`);
const shape = ctor('Tag::DefineShape', `ShapeID => 2,\nShapeBounds => ${ctor('RECT','Xmin => 0,\nYmin => 0,\nXmax => 20,\nYmax => 20,')},\nShapes => ${ctor('SHAPEWITHSTYLE1',`FillStyles => ${ctor('Array::FILLSTYLEARRAY1',`[${ctor('FILLSTYLE1',`FillStyleType => 65,\nBitmapID => 1,\nBitmapMatrix => ${ctor('MATRIX','ScaleX => 20,\nScaleY => 20,')},`)}]`)},`)},`);
const show = ctor('Tag::ShowFrame');
const place = (depth = 3, x = 40, character = 2, flags = 6) => ctor('Tag::PlaceObject2', `Flags => ${flags},\nDepth => ${depth},\n${character ? `CharacterID => ${character},` : ''}\nMatrix => ${ctor('MATRIX',`TranslateX => ${x},\nTranslateY => 60,`)},`);
const dump = (body = place()+show, count = 1) => `PngFileTable = {\n png => cm_bo_01_c01_n01_01.png,\n)\nHeader:\nFrame rate = 30\nFrame count = ${count}\n${bmp()}\n${shape}\n${body}`;
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'));
function assets(text = dump()) {
  let active = 0;
  const source: AvatarAssets = { readScene: vi.fn(async path => {
    active++; let live = true;
    const image = path.endsWith('.png');
    return {value:{bytes:image ? png : new TextEncoder().encode(text),url:'blob:test',mimeType:image?'image/png':'application/octet-stream'},release(){if(live){active--;live=false;}}};
  }) };
  return {source,get active(){return active;}};
}
const decoder = () => { const close = vi.fn(); return {close,decode:vi.fn(async () => ({width:1,height:1,close}))}; };
describe('source appearance and poses',()=>{
  it('keeps source byte layout, world disk, colour and accessory numbering',()=>{
    const b = defaultAvatar(1,1); b[13]=2;b[14]=6;b[15]=5;b[9]=85;
    expect([...b.slice(0,10)]).toEqual([1,0,32,48,64,96,128,144,184,85]);
    expect(resolveAvatarPngs(['cm_h1_01_c01.png','cm_bo_01_c01.png','cm_ey_01_c01.png','cm_dd_01_c01.png','cm_a2_01_c01.png'],b,1)).toEqual(['cw_h1_01_c07.png','cw_bo_01_c03.png','cw_ey_01_c06.png','cw_ad_01_c01.png','cw_a2_02_c05.png']);
  });
  it('handles bald, afros, ponytail and hoods exactly as source rules',()=>{
    const b=defaultAvatar();b[1]=6;b[14]=4;
    expect(resolveAvatarPngs(['cm_h1_01_c01.png','cm_h2_01_c01.png'],b,0)).toEqual(['cm_h1_07_c01.png','cm_h1_50_c01.png']);
    b[0]=1;b[1]=8;
    expect(resolveAvatarPngs(['cm_h2_01_c01.png'],b,0)).toEqual(['cw_h2_09_c05.png']);
    b[6]=117;
    expect(resolveAvatarPngs(['cm_h1_01_c01.png','cm_h2_01_c01.png'],b,0)).toEqual(['cw_h1_99_c01.png','cw_h1_50_c01.png']);
  });
  it('exposes original five facing files, mirrored reverse ordering and anchor',()=>{
    expect(Array.from({length:8},(_,d)=>avatarPose('walk',d).path.split('/').pop())).toEqual(['cm_w01.txt','cm_w02.txt','cm_w03.txt','cm_w04.txt','cm_w05.txt','cm_w04.txt','cm_w03.txt','cm_w02.txt']);
    expect(avatarPose('stand',5)).toMatchObject({mirrored:true,offset:[-46,-116],foot:[40,116]});
    expect(avatarPose('duelStart',7).path).toContain('cm_d01_01.txt');
    expect([avatarDirection(0,1),avatarDirection(-1,0),avatarDirection(0,-1),avatarDirection(1,0)]).toEqual([0,2,4,6]);
  });
  it('pins reviewed source conventions without embedding original asset data',async()=>{
    const source=await readFile(resolve('../src/Game/Avatar/yo2ChibiAvatarElm.cpp'),'utf8');
    for(const s of ['"cm", "cw"','b[14] + 1','b[15] + 1','{-46.0f, -136.0f, 0.0f}','"h1_50_c01"','dir_ >= 5 && dir_ <= 7'])expect(source).toContain(s);
  });
});
describe('bounded movie evaluator',()=>{
  it('parses original constructor syntax and preserves transforms/depth sorting',()=>{
    const movie=new AvatarMovie(dump(place(8,80)+place(2,20)+show));
    expect(movie.layers().map(l=>[l.depth,l.matrix,l.bounds,l.bitmapMatrix])).toEqual([
      [[2],[1,0,0,1,1,3],[0,0,1,1],[1,0,0,1,0,0]],[[8],[1,0,0,1,4,3],[0,0,1,1],[1,0,0,1,0,0]],
    ]);
  });
  it('applies moves, removals, frame loops and non-looping end holds',()=>{
    const movie=new AvatarMovie(dump(place()+show+place(3,100,0,5)+show+ctor('Tag::RemoveObject2','Depth => 3,')+show,3));
    expect(movie.layers(1)[0].matrix[4]).toBe(5);
    expect(movie.layers(2)).toHaveLength(0);expect(movie.layers(3)).toHaveLength(1);expect(movie.layers(3,false)).toHaveLength(0);
  });
  it('advances child timelines even under a one-frame parent',()=>{
    const sprite=ctor('Tag::DefineSprite',`SpriteID => 9,\nControlTags => ${ctor('Array::TAGARRAY',`[${place()+show+place(3,80,0,5)+show}]`)},`);
    const movie=new AvatarMovie(dump(sprite+place(1,0,9)+show));
    expect(movie.layers(1)[0].matrix[4]).toBe(4);
  });
  it('refuses unsupported action features and malformed geometry',()=>{
    const movie=new AvatarMovie(dump(ctor('Tag::DoAction')+place()+show));
    expect(movie.issues).toEqual(['DoAction']);expect(()=>movie.layers()).toThrow('Unsupported');
    expect(()=>new AvatarMovie(dump().replace('TranslateX => 40','TranslateX => Infinity'))).toThrow('geometry');
    expect(()=>parseAvatarDump('process.exit()')).toThrow('header');
    expect(()=>new AvatarMovie(dump()).layers(-1)).toThrow('frame');
  });
});
describe('leased browser resources',()=>{
  it('retains images until idempotent release and leaves the asset manager alive',async()=>{
    const a=assets(), d=decoder(), loader=new AvatarLoader(a.source,{decode:d.decode});
    const r=await loader.load(defaultAvatar());expect(a.active).toBe(1);expect(loader.retainedBytes).toBe(png.length+4);
    expect(r.frameAt(1000)).toBe(30);r.dispose();r.dispose();expect(a.active).toBe(0);expect(d.close).toHaveBeenCalledTimes(1);expect(loader.retainedBytes).toBe(0);expect(()=>r.layers()).toThrow('disposed');
    const next=await loader.load(defaultAvatar());loader.dispose();expect(()=>next.layers()).toThrow('disposed');expect(a.active).toBe(0);
  });
  it('closes a late bitmap when cancellation arrives during decode',async()=>{
    const a=assets(),close=vi.fn();let done!:(value:AvatarBitmap)=>void;
    const decode=vi.fn(()=>new Promise<AvatarBitmap>(r=>{done=r;}));const loader=new AvatarLoader(a.source,{decode});const signal=new AbortController();
    const pending=loader.load(defaultAvatar(),{signal:signal.signal});
    await vi.waitFor(()=>expect(decode).toHaveBeenCalled());signal.abort();expect(a.active).toBe(0);expect(loader.retainedBytes).toBe(0);done({width:1,height:1,close});
    await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(close).toHaveBeenCalledOnce();expect(a.active).toBe(0);expect(loader.retainedBytes).toBe(0);
  });
  it('rolls back retained leases and budget on decoder error/mismatched dimensions',async()=>{
    const a=assets(),d=decoder();const loader=new AvatarLoader(a.source,{decode:async l=>({...await d.decode(),width:2})});
    await expect(loader.load(defaultAvatar())).rejects.toThrow('geometry');expect(d.close).toHaveBeenCalledOnce();expect(a.active).toBe(0);expect(loader.retainedBytes).toBe(0);
  });
  it('enforces aggregate live resource budget before decoding',async()=>{
    const a=assets(),d=decoder(),loader=new AvatarLoader(a.source,{decode:d.decode,budgetBytes:png.length+4});const r=await loader.load(defaultAvatar());
    await expect(loader.load(defaultAvatar())).rejects.toThrow('budget');expect(a.active).toBe(1);expect(d.decode).toHaveBeenCalledOnce();r.dispose();expect(loader.retainedBytes).toBe(0);
  });
  it('draws with the source origin, clipping, bitmap transform and balanced canvas state',async()=>{
    const a=assets(),d=decoder(),loader=new AvatarLoader(a.source,{decode:d.decode});
    const r=await loader.load(defaultAvatar(),{direction:5});
    const ctx={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),transform:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),drawImage:vi.fn(),globalAlpha:1};
    r.draw(ctx as unknown as CanvasRenderingContext2D,{x:100,y:200,scale:2});
    expect(ctx.translate.mock.calls).toEqual([[100,200],[-46,-116]]);expect(ctx.scale).toHaveBeenCalledWith(-2,2);
    expect(ctx.rect).toHaveBeenCalledWith(0,0,1,1);expect(ctx.drawImage).toHaveBeenCalledOnce();expect(ctx.restore).toHaveBeenCalledTimes(2);
    ctx.drawImage.mockImplementation(()=>{throw new Error('canvas failed');});expect(()=>r.draw(ctx as unknown as CanvasRenderingContext2D)).toThrow('canvas failed');
    expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);r.dispose();
  });
  it('cancels pending resources during loader disposal and rejects new work',async()=>{
    const a=assets(),close=vi.fn();let done!:(value:AvatarBitmap)=>void;
    const decode=vi.fn(()=>new Promise<AvatarBitmap>(r=>{done=r;}));const loader=new AvatarLoader(a.source,{decode});
    const pending=loader.load(defaultAvatar());await vi.waitFor(()=>expect(decode).toHaveBeenCalled());
    loader.dispose();expect(a.active).toBe(0);expect(loader.retainedBytes).toBe(0);done({width:1,height:1,close});
    await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(close).toHaveBeenCalledOnce();await expect(loader.load(defaultAvatar())).rejects.toThrow('disposed');
  });
  it('supports private motion metadata without retaining metadata leases',async()=>{
    const a=assets(),d=decoder(),loader=new AvatarLoader(a.source,{decode:d.decode,motionData:{[avatarPose().path]:dump()}});
    const r=await loader.load(defaultAvatar());expect(a.source.readScene).toHaveBeenCalledTimes(1);r.dispose();
  });
});
describe('private generator',()=>{
  it('refuses tracked and unignored destinations',async()=>{
    await expect(assertPrivateOutput(resolve('package.json'))).rejects.toThrow('tracked');
    await expect(assertPrivateOutput(resolve('avatar-unignored-test-output.json'))).rejects.toThrow('unignored');
  });
  it('writes validated metadata only to an ignored fresh destination',async()=>{
    const dir=await mkdtemp(resolve(tmpdir(),'avatar-input-')),out=resolve('dist',`avatar-test-${Date.now()}.json`);
    try {const input=resolve(dir,'cm_n01.txt');await writeFile(input,dump());expect((await generateAvatarData(out,[input])).count).toBe(1);expect(JSON.parse(await readFile(out,'utf8')).motions[avatarPose().path]).toBe(dump());await expect(generateAvatarData(out,[input])).rejects.toThrow();}
    finally{await rm(dir,{recursive:true,force:true});await rm(out,{force:true});}
  });
});
