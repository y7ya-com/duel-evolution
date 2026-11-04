import { expect, it } from 'vitest';
import { readFile, mkdir, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NpcDialogueCatalog } from '../src/npcs/dialogue';
// Build inputs contain synthetic test wording only.
import { buildNpcData, generateNpcData } from '../tools/npc-data.mjs';
it('joins original paired rows to little-endian string offsets without inventing missing lines',()=>{
 const index=new Uint8Array(12);new DataView(index.buffer).setUint32(4,1,true);new DataView(index.buffer).setUint32(8,7,true);
 const data=buildNpcData('// heading\n51,1,0,2\n51,3,0,4\n52,1\n// omitted style\n',index,new TextEncoder().encode('\0hello\0other\0'));
 // A line is the five balloon rows from its text id on; here rows 1 and 2 exist.
 expect(data.lines['51']['0']).toEqual({textId:1,text:'hello\nother',style:3});expect(data.lines['51']['1']).toBeUndefined();expect(data.lines['52']).toBeUndefined();
 const catalog=new NpcDialogueCatalog();catalog.install(data);expect(catalog.resolve(51,2)).toBe('other');expect(catalog.resolve(51,10)).toBeNull();catalog.clear();expect(catalog.resolve(51,2)).toBeNull();
});
it('rejects invalid offsets and oversized or malformed catalog input',()=>{
 expect(()=>buildNpcData('1,4\n1,0',new Uint8Array(4),new Uint8Array(1))).toThrow('offset');
 const catalog=new NpcDialogueCatalog();expect(()=>catalog.install({version:1,lines:{'1':{'100':{text:'a',textId:1,style:0}}}})).toThrow();
});
it('extracts only the fifteen verified special-NPC text IDs, including meaningful empty lines',()=>{
 const index=new Uint8Array((0x6ab2+1)*4),data=buildNpcData('1,1\n1,0',index,new TextEncoder().encode('synthetic\0'));
 expect(Object.keys(data.presentTexts)).toHaveLength(15);expect(data.presentTexts[0x63e2]).toBe('synthetic');
 const catalog=new NpcDialogueCatalog();catalog.install(data);expect(catalog.resolveText(0x6aae)).toBe('synthetic');catalog.install({...data,presentTexts:{[0x63e2]:''}});expect(catalog.resolveText(0x63e2)).toBe('');expect(()=>catalog.install({...data,presentTexts:{99:'wrong'}})).toThrow('eligibility');expect(catalog.resolveText(0x63e2)).toBe('');catalog.clear();expect(catalog.resolveText(0x63e2)).toBeNull();
});
it('refuses tracked and unignored destinations before reading private input',async()=>{
 await expect(generateNpcData(resolve('../../README.md'),'missing','missing','missing')).rejects.toThrow('tracked');
 await expect(generateNpcData(resolve('public/npc-unignored.json'),'missing','missing','missing')).rejects.toThrow('unignored');
});
it('validates available private generated catalog without copying its strings into test snapshots',async()=>{
 let data;try{data=JSON.parse(await readFile(resolve('public/npc-data.json'),'utf8'));}catch(e:any){if(e.code==='ENOENT')return;throw e;}
 const catalog=new NpcDialogueCatalog();expect(()=>catalog.install(data)).not.toThrow();expect(Object.keys(data.lines).length).toBeGreaterThan(0);
});

it('refuses symlink output even when its name is ignored',async()=>{const dir=resolve('recordings/npc-guard-'+process.pid);await mkdir(dir,{recursive:true});const output=resolve(dir,'private.json');try{await symlink(resolve('../../README.md'),output);await expect(generateNpcData(output,'missing','missing','missing')).rejects.toThrow('symlink');}finally{await rm(dir,{recursive:true,force:true});}});
