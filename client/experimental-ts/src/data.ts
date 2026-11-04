import { CardCatalog, readCatalog } from './catalog';
import { CardDetailsCatalog } from './cards';
import { OriginalCardTextCatalog } from './cards/original-text';
import { NpcDialogueCatalog } from './npcs/dialogue';
import { DuelTextCatalog } from './duel/text';
import { loadWorldMaps } from './world';
import type { WorldMaps } from './world';
import {RecipeCatalog} from './recipes';

export interface ClientData {
  catalog?: CardCatalog; cardDetails?: CardDetailsCatalog; cardTexts?: OriginalCardTextCatalog;
  npcDialogue?: NpcDialogueCatalog; duelTexts?: DuelTextCatalog; worldMaps?: WorldMaps; recipes?:RecipeCatalog; issues: string[];
}
/** Independent deadlines and transactional decoders let later retries recover a
 * missing dataset without replacing a working game connection or partial table. */
export async function loadClientData(options: {fetch?:typeof fetch;signal?:AbortSignal;timeoutMs?:number} = {}): Promise<ClientData> {
  const fetcher=options.fetch ?? globalThis.fetch, timeout=options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError('Invalid game data timeout');
  const json=async(url:string,signal:AbortSignal,max=8*1024*1024)=>readCatalog(await fetcher(url,{signal}),signal,max);
  const jobs = [
    {key:'catalog',label:'Card names',load:async(signal:AbortSignal)=>{const c=new CardCatalog();c.install(await json('/card-catalog.json',signal));return c;}},
    {key:'cardDetails',label:'Card details',load:async(signal:AbortSignal)=>{const c=new CardDetailsCatalog();c.install(await json('/card-details.json',signal,16*1024*1024));return c;}},
    {key:'cardTexts',label:'Card rules',load:async(signal:AbortSignal)=>{const c=new OriginalCardTextCatalog();c.install(await json('/card-texts.json',signal,16*1024*1024));return c;}},
    {key:'npcDialogue',label:'NPC dialogue',load:async(signal:AbortSignal)=>{const c=new NpcDialogueCatalog();c.install(await json('/npc-data.json',signal));return c;}},
    {key:'duelTexts',label:'Duel text',load:async(signal:AbortSignal)=>{const c=new DuelTextCatalog();c.install(await json('/duel-texts.json',signal));return c;}},
    {key:'worldMaps',label:'Maps',load:(signal:AbortSignal)=>loadWorldMaps('/world-maps.json',{fetch:fetcher,signal})},
    {key:'recipes',label:'Deck recipes',load:async(signal:AbortSignal)=>RecipeCatalog.fromJSON(await json('/deck-recipes.json',signal,1024*1024))},
  ];
  const results=await Promise.all(jobs.map(async job=>{
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true}); const timer=setTimeout(abort,timeout);
    try { options.signal?.throwIfAborted(); return {key:job.key,value:await job.load(controller.signal)}; }
    catch(error) { if(options.signal?.aborted) throw error; return {issue:job.label}; }
    finally { clearTimeout(timer);options.signal?.removeEventListener('abort',abort); }
  }));
  const data:ClientData={issues:[]};
  for(const result of results) { if('issue' in result) data.issues.push(result.issue!);else Object.assign(data,{[result.key]:result.value}); }
  return data;
}
