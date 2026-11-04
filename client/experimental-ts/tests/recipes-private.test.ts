import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildRecipeData, recipeNames } from '../tools/recipes.mjs';
import { RecipeCatalog } from '../src/recipes';
// Explicit opt-in reads existing private gamedata; never snapshots derived cards/names.
const privateTest = it.skipIf(process.env.DE_RECIPE_PRIVATE !== '1');
async function sources() {
 const base=resolve('../../server');
 const [ydc,shop,persist,source]=await Promise.all(['gamedata/ydc.json','gamedata/shop.json','gamedata/persist.json','src/game/starter.ts'].map(p=>readFile(resolve(base,p),'utf8')));
 return {ydc:JSON.parse(ydc),shop:JSON.parse(shop),persist:JSON.parse(persist),names:recipeNames(source)};
}
afterEach(()=>{vi.useRealTimers();});
privateTest('compares every real shop recipe to YDC and exact server PBIN bytes without legal-starter substitutions',async()=>{
 const s=await sources(), c=RecipeCatalog.fromJSON(buildRecipeData(s));
 const PP=await import('../../../server/src/game/persist');
 const starter=await import('../../../server/src/game/starter');
 const rows=s.shop.packs.filter(([,k,b]:any[])=>k===1&&b!==null);
 expect(c.size).toBe(rows.length);
 expect(c.available(PP.pbinBytes({pbin:PP.defaultPbinBits()}))).toEqual([]); // source proves no built-in defaults
 let legalDiffers=false;
 for(const [id,,right] of rows){
  expect(PP.recipeBit(id)).toBe(right+1);
  expect(c.available(PP.pbinBytes({pbin:[right]}))).toEqual([]);
  const actual=c.available(PP.pbinBytes({pbin:[right+1]}));
  expect(actual).toEqual([{id:String(id),name:starter.STARTER_DECKS[id][0],...s.ydc[id]}]);
  expect(c.available(PP.pbinBytes({pbin:[right+1]}),true)).toEqual(actual);
  legalDiffers ||= JSON.stringify(starter.legalDeck(id).main)!==JSON.stringify(s.ydc[id].main);
 }
 expect(legalDiffers).toBe(true); // recipe and acquired starter really are distinct products
});
privateTest('uses actual starter claim and shop receipt bits; duplicate claims/purchases never duplicate recipes',async()=>{
 const [{harness},PP,starter,shop,proto]=await Promise.all([
  import('../../../server/test/notes-harness'),import('../../../server/src/game/persist'),import('../../../server/src/game/starter'),import('../../../server/src/game/shop'),import('../../../server/src/net/proto')
 ]);
 const s=await sources(), c=RecipeCatalog.fromJSON(buildRecipeData(s));
 const ids=s.shop.packs.filter(([,kind,bit]:any[])=>kind===1&&bit!==null).map(([id]:any[])=>id);
 const h=harness({players:{}},{PROGRESSION:'1'});
 try{
  const a=h.client('Recipe','Recipe','pw','recipe-user');await a.account(0,'Recipe Tester');await a.enterRoom();
  const profile=()=>h.state().accounts[h.game.hub.acctOfUser('recipe-user')].profiles[0];
  const [first,second]=ids;
  expect(c.available(PP.pbinBytes(profile()))).toEqual([]);
  expect(starter.starterClaim(h.game,'recipe-user',first)[0]).toBe(200);
  expect(c.available(PP.pbinBytes(profile())).map(r=>r.id)).toEqual([String(first)]);
  const afterClaim=structuredClone(profile());expect(starter.starterClaim(h.game,'recipe-user',second)[0]).toBe(409);expect(profile()).toEqual(afterClaim);
  // Native cart duplicates are folded by actual shopBuy. Three units grant cards
  // three times but only one recipe entitlement, which is refreshed by PBIN.
  const session=[...h.game.hub.sessions.values()][0];
  h.game.withCtx(session,()=>{
   const row=shop.shopCatalog(h.game).find(b=>b[4]===1&&new DataView(b.buffer,b.byteOffset).getUint32(5)===second)!;
   const item=new DataView(row.buffer,row.byteOffset).getUint32(0);
   const receipts:any[]=[];const conn:any={send:(id:number,data:Uint8Array)=>receipts.push({id,data})};
   const cart=new proto.W().u32(item).u8(1).u32(item).u8(2).bytes();
   const before=structuredClone(profile().trunk);
   shop.shopBuy(h.game,conn,cart);
   expect(receipts.some(r=>r.id===0x5211&&new DataView(r.data.buffer,r.data.byteOffset).getUint32(0)===0)).toBe(true);
   const counts=new Map<number,number>();for(const pc of s.shop.ydc[second])if(PP.cardOk(pc))counts.set(pc,(counts.get(pc)??0)+3);
   for(const [pc,n] of counts)expect(profile().trunk[pc]).toBe(Math.min(255,(before[pc]??0)+n));
  });
  const available=c.available(PP.pbinBytes(profile()));expect(available.map(r=>r.id)).toEqual([first,second].sort((a,b)=>a-b).map(String));
  expect(available.find(r=>r.id===String(second))).toEqual({id:String(second),name:s.names[second],...s.ydc[second]});
  expect(profile().pbin.filter((b:number)=>b===PP.recipeBit(second))).toHaveLength(1);
  expect(c.available(PP.pbinBytes(profile()),true)).toEqual(available);
 }finally{PP.setProgression(false);}
},20000);
