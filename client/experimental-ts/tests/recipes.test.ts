import { describe, expect, it } from 'vitest';
import { RecipeCatalog, RECIPE_PBIN_BYTES } from '../src/recipes';
const record = (id='1',recipeBit:number|null=9) => ({id,name:'Synthetic recipe',recipeBit,main:[17,17,23],side:[41],extra:[53]});
const data = (...recipes:ReturnType<typeof record>[]) => ({version:1,deckSource:'original-ydc',recipes});
const bits = (...values:number[]) => { const b=new Uint8Array(RECIPE_PBIN_BYTES); for(const v of values)b[v>>3]|=1<<(v&7);return b; };
describe('validated private recipes',()=>{
 it('requires exact LSB-first PBIN receipt rights and never treats free mode as all-owned',()=>{
  const c=RecipeCatalog.fromJSON(data(record(),record('2',null),record('3',1023),record('4',8)));
  expect(c.available(null,true)).toEqual([]); expect(c.available(new Uint8Array(127))).toEqual([]);expect(c.available(new Uint8Array(129))).toEqual([]);
  expect(c.available(bits(8,15))).toEqual([{id:'4',name:'Synthetic recipe',main:[17,17,23],side:[41],extra:[53]}]);
  expect(c.available(bits(9,1023),true).map(r=>r.id)).toEqual(['1','3']);
  expect(c.available(bits(8,9,1023))).toEqual(c.available(bits(8,9,1023),true));
 });
 it('preserves order, duplicates, names and identity without retaining caller arrays',()=>{
  const r=record(), c=RecipeCatalog.fromJSON(data(r));r.main.reverse();r.name='changed';
  const out=c.available(bits(9));expect(out[0]).toEqual({id:'1',name:'Synthetic recipe',main:[17,17,23],side:[41],extra:[53]});
  out[0].main.pop();out[0].name='changed';expect(c.available(bits(9))[0].main).toEqual([17,17,23]);expect(c.available(bits(9))[0].name).toBe('Synthetic recipe');
  c.clear();expect(c.size).toBe(0);expect(c.available(bits(9))).toEqual([]);
 });
 it.each([
  data(record(),record()), data(record(),record('2')),data(record('01')),data({...record(),name:'\0bad'}),data(record('1',1024)),
  data({...record(),recipeBit:undefined} as any),data({...record(),main:Array(81).fill(1)}),data({...record(),side:Array(16).fill(1)}),
  data({...record(),extra:Array(31).fill(1)}),data({...record(),main:[0]}),data({...record(),main:[0xffffff00]}),data({...record(),main:[1.1]}),
  {...data(record()),version:2},{...data(record()),deckSource:'legal-starter'},data(...Array.from({length:193},(_,i)=>record(String(i+1),null)))
 ])('rejects malformed data atomically (%#)',bad=>{
  const c=RecipeCatalog.fromJSON(data(record()));expect(()=>c.install(bad)).toThrow();expect(c.size).toBe(1);expect(c.available(bits(9))[0].main).toEqual([17,17,23]);
 });
});
