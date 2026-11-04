import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SceneLoader } from '../src/world/scene';
import { parseSceneTable, pngDimensions, sceneTilePath } from '../src/world/scene-format';

// Opt-in private evidence; no archive/table/art bytes are tracked or downloaded by tests.
const tablePath = process.env.YO2_SCENE_TABLE;
const directoryPath = process.env.YO2_SCENE_DIRECTORY;
const samplesPath = process.env.YO2_SCENE_PNG_SAMPLES;
describe.skipIf(!tablePath || !directoryPath)('privately supplied source scene metadata',()=>{
  it('parses all ten real sections and resolves every declared base/hit tile/object path against archive directory',()=>{
    const definitions=parseSceneTable(readFileSync(tablePath!));
    const entries=JSON.parse(readFileSync(directoryPath!,'utf8')) as [string,number,number,number][];
    const names=new Set(entries.map(([n])=>n.toLowerCase().replaceAll('\\','/')));
    expect(definitions.size).toBe(10);
    for(const d of definitions.values()) {
      for(let x=0;x<d.columns;x++) for(let y=0;y<d.rows;y++) {
        expect(names.has(sceneTilePath(d,x,y).toLowerCase())).toBe(true);
        expect(names.has(sceneTilePath(d,x,y,true).toLowerCase())).toBe(true);
      }
      for(const obj of [...d.objects,...d.frontObjects]) expect(names.has(obj.path.toLowerCase())).toBe(true);
    }
  });
  it('loads every source map id from the real table and releases every metadata lease',async()=>{
    const cpp=readFileSync(new URL('../../src/Game/yo2FieldMap.cpp',import.meta.url),'utf8');
    const names=[...cpp.matchAll(/\{"(Map_[a-z0-9_]+)",/g)].map(m=>m[1]);
    expect(names).toHaveLength(10);
    const bytes=readFileSync(tablePath!);let released=0;
    const loader=new SceneLoader({assets:{readScene:async()=>({value:{bytes,url:'blob:table',mimeType:'text/plain'},release:()=>{released++;}})}});
    for(let id=0;id<names.length;id++) expect((await loader.load(id)).definition.name).toBe(names[id]);
    expect(released).toBe(10);loader.dispose();
  });
  it.skipIf(!samplesPath)('validates independently range-inspected PNG header geometry',()=>{
    const samples=JSON.parse(readFileSync(samplesPath!,'utf8')) as {name:string;header:number[];width:number;height:number}[];
    expect(samples.length).toBeGreaterThanOrEqual(4);
    for(const s of samples) expect(pngDimensions(Uint8Array.from(s.header))).toEqual({width:s.width,height:s.height});
    const room=samples.find(s=>s.name.endsWith('map_r01_base_1_1.png'))!;
    const definition=parseSceneTable(readFileSync(tablePath!)).get('Map_r01')!;
    expect({width:definition.width,height:definition.height}).toEqual({width:1024,height:768});
    expect(room).toMatchObject({width:1029,height:768}); // physical PNG differs from logical tile cell
  });
});
