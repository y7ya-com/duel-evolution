import { expect, it } from 'vitest';
import { mkdir, symlink, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildRecipeData, generateRecipes, recipeNames } from '../tools/recipes.mjs';
import { RecipeCatalog } from '../src/recipes';
const source = () => ({ydc:{'71':{main:[17,17,19],side:[],extra:[29]},'99':{main:[42],side:[],extra:[]}},shop:{packs:[[71,1,8],[99,0,null]]},persist:{default_pbin_bits:[0,3]},names:{'71':'Synthetic deck'}});
it('projects only source-proven recipe products and preserves YDC duplicates and order',()=>{
 const data=buildRecipeData(source());expect(data).toEqual({version:1,deckSource:'original-ydc',recipes:[{id:'71',name:'Synthetic deck',recipeBit:9,main:[17,17,19],side:[],extra:[29]}]});
 expect(()=>RecipeCatalog.fromJSON(data)).not.toThrow();
 const names=recipeNames('export const STARTER_DECKS: Record<number, [string,string,number]> = {\n71: ["Synthetic \\"deck\\"", "ignored", 1],\n};');
 expect(names['71']).toBe('Synthetic "deck"');
});
it('fails closed on ambiguous identities, unknown rights, missing names and invalid source decks',()=>{
 for(const change of [s=>s.shop.packs.push([71,1,10]),s=>s.shop.packs.push([72,1,8]),s=>s.shop.packs[0][2]=null,s=>s.names={},s=>s.ydc['71'].main=[0],s=>s.ydc['71'].extra=Array(31).fill(1),s=>s.persist.default_pbin_bits=[1024]]){
  const s:any=source();change(s);expect(()=>buildRecipeData(s)).toThrow();
 }
});
it('refuses tracked, unignored, file symlink and parent symlink output before reading input',async()=>{
 await expect(generateRecipes(resolve('../../README.md'),'missing')).rejects.toThrow('tracked');
 await expect(generateRecipes(resolve('public/unignored-recipes.json'),'missing')).rejects.toThrow('unignored');
 const dir=resolve('recordings/recipes-guards-'+process.pid);await mkdir(dir,{recursive:true});
 try{
  await symlink(resolve('../../README.md'),resolve(dir,'file.json'));
  await expect(generateRecipes(resolve(dir,'file.json'),'missing')).rejects.toThrow('symlink');
  await symlink(dir,resolve(dir,'parent'));
  await expect(generateRecipes(resolve(dir,'parent/out.json'),'missing')).rejects.toThrow('symlink');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('bounds private inputs and refuses overwriting an existing ignored output',async()=>{
 const dir=resolve('recordings/recipes-input-'+process.pid);await mkdir(resolve(dir,'gamedata'),{recursive:true});await mkdir(resolve(dir,'src/game'),{recursive:true});
 try{
  const s=source();for(const [file,value] of [['ydc',s.ydc],['shop',s.shop],['persist',s.persist]])await writeFile(resolve(dir,'gamedata/'+file+'.json'),JSON.stringify(value));
  await writeFile(resolve(dir,'src/game/starter.ts'),'export const STARTER_DECKS: Record<number, unknown> = {\n71: ["Synthetic deck", "description", 1],\n};');
  const out=resolve(dir,'output.json');expect((await generateRecipes(out,dir)).count).toBe(1);expect(RecipeCatalog.fromJSON(JSON.parse(await readFile(out,'utf8'))).size).toBe(1);
  await expect(generateRecipes(out,dir)).rejects.toThrow('EEXIST');
  await writeFile(resolve(dir,'gamedata/ydc.json'),' '.repeat(8*1024*1024+1));await expect(generateRecipes(resolve(dir,'oversize.json'),dir)).rejects.toThrow('budget');
 }finally{await rm(dir,{recursive:true,force:true});}
});
