import {afterEach,expect,it,vi} from 'vitest';
import {loadClientData} from '../src/data';
afterEach(()=>vi.useRealTimers());
const responses:Record<string,unknown>={
  '/card-catalog.json':[{passcode:1,name:'Card One'}], '/card-details.json':[],
  '/card-texts.json':{v:1,language:'E',source:'merge.dat/CARD_Desc_E',cards:[],missingInternalIds:[]},
  '/npc-data.json':{version:1,lines:{}}, '/duel-texts.json':{v:1,legacyOptions:{},legacyPrompts:{},cardNames:{}},
  '/world-maps.json':{version:1,maps:[]},
  '/deck-recipes.json':{version:1,deckSource:'original-ydc',recipes:[]},
};
it('recovers a timed-out dataset on an explicit retry while other independent tables remain usable',async()=>{
  vi.useFakeTimers(); let stall=true;
  const fetcher:typeof fetch=vi.fn(async(input,init)=>{
    const path=String(input);
    if(path==='/world-maps.json'&&stall) return new Promise<Response>((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true}));
    return Response.json(responses[path]);
  });
  const first=loadClientData({fetch:fetcher,timeoutMs:25}); await vi.advanceTimersByTimeAsync(26);const data=await first;
  expect(data.issues).toEqual(['Maps']);expect(data.catalog?.card(1).name).toBe('Card One');expect(data.worldMaps).toBeUndefined();
  stall=false;const retry=await loadClientData({fetch:fetcher,timeoutMs:25});expect(retry.issues).toEqual([]);expect(retry.worldMaps).toEqual({version:1,maps:[]});
});
it('returns a failed table as unavailable without publishing a partially validated catalog',async()=>{
  const data=await loadClientData({fetch:vi.fn(async input=>Response.json(String(input)==='/card-catalog.json'?[{passcode:1,name:'First'},{passcode:-1,name:'Invalid'}]:responses[String(input)]))});
  expect(data.catalog).toBeUndefined();expect(data.issues).toEqual(['Card names']);expect(data.cardDetails).toBeDefined();
});
it('propagates caller cancellation and releases every request deadline',async()=>{
  vi.useFakeTimers();const controller=new AbortController();
  const fetcher:typeof fetch=vi.fn(async(_input,init)=>new Promise<Response>((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
  const pending=loadClientData({fetch:fetcher,signal:controller.signal});const check=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await check;expect(vi.getTimerCount()).toBe(0);
});
