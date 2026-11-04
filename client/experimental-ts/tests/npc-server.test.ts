import { afterEach, expect, it, vi } from 'vitest';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { setDuelCore } from '../../../server/src/duel/data';
import { setProgression } from '../../../server/src/game/persist';
import { BinaryWriter } from '../src/network/codec';
import { check } from '../../../server/src/duel/deckCheck';
import { NpcController } from '../src/features/npc';
import { createDuelState, reduceDuelMessage, encodeDuelResponse } from '../src/duel';
import type { DuelState, DuelResponse } from '../src/duel';
import { drive, setup } from './network-server-fixture';
import { passive, deck as normalDeck } from './duel-outcomes-fixture';
afterEach(()=>{setDuelCore(null);vi.clearAllTimers();vi.useRealTimers();});
function aggressive(state:DuelState):DuelResponse {
 const p=state.prompt!;
 if(p.kind==='actions') {
  const summon=p.actions.find(a=>a.command===4);
  if(summon)return {type:'action',...summon};
  const attack=p.actions.find(a=>a.command===0);
  if(attack)return {type:'action',...attack};
  if(p.buttons.includes(3))return {type:'phase',phase:3};
 }
 return passive(state);
}
it.each([false,true])('actual NPC natural outcome and authoritative pack claim (aggressive=%s)',async(win)=>{
 setDuelCore(await createNodeDuelCore());
 const f=setup(undefined,win?'npc-win':'npc-loss'); const s=f.session;
 const refresh=vi.fn(()=>s.refreshCollection());
 const c=new NpcController({send:(id,data)=>s.sendLobby(id,data),onStartDuel:id=>{const deck=(win?{main:[69247929,23771716,11091375,14898066,79182538,5464695,7359741,7459013,11321183,11813953,11987744,12493482,14531242,16587243].flatMap(id=>[id,id,id]).slice(0,40),extra:[]}:normalDeck(40));const errors=check(deck.main,deck.extra,Object.fromEntries(s.state.collection));if(errors.length)throw Error(JSON.stringify(errors));return s.startNpcDuel(id,deck);},onRefreshCollection:refresh});
 s.options.onMessage=(channel,message)=>{if(channel===s.lobby)c.receive(message);};
 let board=createDuelState(),answered=0;
 try{
 await drive(s.start()); await drive(s.createCharacter(0,'NPC Tester')); await drive(s.selectCharacter(0));
 // Fixture history starts at four wins; this game's actual engine outcome earns the fifth.
 if(win){const raw=f.server.game.store.loadRaw(); const p=Object.values(raw.accounts!)[0].profiles['0'];p.npcbin={'9':[4,0,0,5]};f.server.game.store.saveRaw(raw);}
 c.open(s.state.npcs.find(n=>n.id===(win?9:35))!); await drive(c.answer(true)); expect(c.state.error).toBeNull();
 s.duel!.subscribe(m=>{if([0x6202,0x6610,0x6611,0x6612,0x6461,0x6613,0x649b].includes(m.id))board=reduceDuelMessage(board,m);});
 let hand:'draw'|'win'|'lose'='draw'; for(let i=0;hand==='draw'&&i<20;i++)hand=await drive(s.chooseHand(i%3));
 if(hand==='win')await drive(s.chooseFirst(true));else await vi.advanceTimersByTimeAsync(100);
 s.beginDuel(false);
 for(let step=0;step<8000&&board.status!=='finished';step++){
  await vi.advanceTimersByTimeAsync(100); expect(board.errors).toEqual([]); expect(board.unsupported).toEqual([]);
  if(board.acceptingInput&&board.prompt&&board.prompt.id!==answered){answered=board.prompt.id;const response=win?aggressive(board):passive(board);for(const p of encodeDuelResponse(board,response))s.sendDuel(p.id,p.data);}
 }
 expect(board.status,JSON.stringify({turn:board.turn,prompt:board.prompt})).toBe('finished');
 expect(board.result?.result).toBe(win?1:2);
 c.afterDuel(board.result!.result as 1|2|3); await drive(s.finishDuel());
 expect(c.state.settlementReceived).toBe(true); expect(c.state.packs).toHaveLength(1);
 const profile=()=>Object.values(f.server.game.store.loadRaw().accounts!)[0].profiles['0'];
 expect(profile().npc_card_due).toHaveLength(1);
 c.advance(); if(win){ expect(c.state.stage).toBe('won'); c.advance(); await vi.advanceTimersByTimeAsync(200); expect(c.state.giftStatus).toBe('confirmed'); expect(c.state.giftCards.length+c.state.giftBits.length).toBeGreaterThan(0); } expect(c.state.stage).toBe('done');
 const beforePack=structuredClone(profile().trunk);
 c.selectPack(c.state.packs[0]);
 if(!win){c.disconnected();f.sockets.at(-1)!.close();await vi.advanceTimersByTimeAsync(4000);expect(s.gateway.status).toBe('connected');}
 await vi.advanceTimersByTimeAsync(300);
 expect(c.state.packStatus).toBe('confirmed'); expect(c.state.cards).toHaveLength(1); const card=c.state.cards[0];expect(profile().trunk[String(card.id)]).toBe((beforePack[String(card.id)]??0)+1);expect(card.isNew).toBe(!beforePack[String(card.id)]);expect(s.state.collection.get(card.id)).toBe(profile().trunk[String(card.id)]); expect(profile().npc_card_due).toEqual([]); expect(refresh).toHaveBeenCalledTimes(win?2:1);
 // Server refusal after entitlement consumption is ignored by the already confirmed receipt.
 const refusals:number[]=[];const unsubscribe=s.lobby!.subscribe(m=>{if(m.id===0x4803)refusals.push(new DataView(m.data.buffer,m.data.byteOffset).getUint32(0));});
 setProgression(true);try{s.sendLobby(0x4802,new BinaryWriter().u16(c.state.packs[0]).bytes());await vi.advanceTimersByTimeAsync(200);}finally{setProgression(false);unsubscribe();}
 expect(refusals).toEqual([1]);expect(c.state.packStatus).toBe('confirmed');
 // Actual tunnel loss/resume must not replay a claim or pay a second time.
 c.disconnected();f.sockets.at(-1)!.close();await vi.advanceTimersByTimeAsync(4000);expect(s.gateway.status).toBe('connected');
 await drive(c.refreshCollection());
 const settled=structuredClone(profile());c.selectPack(c.state.packs[0]); await drive(s.finishDuel()); await vi.advanceTimersByTimeAsync(200);expect(profile()).toEqual(settled);
 expect(f.logs.some(l=>l.includes('(surrender)'))).toBe(false);
 if(win){
  // This natural fifth win against NPC9 earns Kaiba's challenge right through the world request.
  const beforeEligibility=structuredClone(profile().trunk);expect(c.checkEligibility()).toBe(true);await vi.advanceTimersByTimeAsync(200);await drive(s.refreshPlayerBits());
  expect(c.state.eligibility.status).toBe('confirmed');expect(profile().pbin).toContain(592);expect(!!(s.state.pbin![592>>3]&(1<<(592&7)))).toBe(true);expect(profile().trunk).toEqual(beforeEligibility);
 }
 }finally{c.dispose();s.dispose();}
},30000);
it('actual first-contact handler is idempotent and its acknowledgement survives tunnel resume',async()=>{
 const f=setup(undefined,'npc-contact'),s=f.session;let sends=0;
 const c=new NpcController({send:(id,data)=>{sends++;s.sendLobby(id,data);},onStartDuel:vi.fn()});
 s.options.onMessage=(channel,message)=>{if(channel===s.lobby)c.receive(message);};
 try{
  await drive(s.start());await drive(s.createCharacter(0,'Contact Tester'));await drive(s.selectCharacter(0));
  const profile=()=>Object.values(f.server.game.store.loadRaw().accounts!)[0].profiles['0'];
  const trunk=structuredClone(profile().trunk),bits=structuredClone(profile().pbin);
  c.open({id:9,name:'NPC'},0,{npcRank:0});c.disconnected();f.sockets.at(-1)!.close();await vi.advanceTimersByTimeAsync(4000);
  expect(c.state.firstContactStatus).toBe('confirmed');expect(profile().npcbin?.['9']?.[3]).toBe(1);expect(profile().trunk).toEqual(trunk);expect(profile().pbin).toEqual(bits);
  c.advance();await c.answer(false);c.advance();c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.state.dialogue?.line).toBe(5);expect(sends).toBe(1);
  s.sendLobby(0x5204,new BinaryWriter().u16(4).u32(9).bytes());await vi.advanceTimersByTimeAsync(200);expect(profile().npcbin?.['9']?.[3]).toBe(1);expect(profile().trunk).toEqual(trunk);
  s.sendLobby(0x5204,new BinaryWriter().u16(4).u32(128).bytes());await vi.advanceTimersByTimeAsync(200);expect(profile().npcbin?.['128']).toBeUndefined();expect(profile().trunk).toEqual(trunk);
 }finally{c.dispose();s.dispose();}
},15000);
it('world-init eligibility grants only actual server-earned rights and refreshes authoritative PBIN flags',async()=>{
 const f=setup(undefined,'npc-eligibility'),s=f.session,start=vi.fn(),sends:{id:number;data:Uint8Array}[]=[];
 const c=new NpcController({send:(id,data)=>{sends.push({id,data:data.slice()});s.sendLobby(id,data);},onStartDuel:start,onRefreshProgress:async()=>{await s.refreshPlayerBits();await s.refreshNpcs();}});
 s.options.onMessage=(channel,message)=>{if(channel===s.lobby)c.receive(message);};
 const has=(bit:number)=>!!(s.state.pbin?.[bit>>3]&(1<<(bit&7)));
 const profile=()=>Object.values(f.server.game.store.loadRaw().accounts!)[0].profiles['0'];
 const history=(kaiba:number,alexis:number)=>{const raw=f.server.game.store.loadRaw(),p=Object.values(raw.accounts!)[0].profiles['0'];p.npcbin={'6':[kaiba,0,0,1],'31':[alexis,0,0,1]};p.pbin=p.pbin.filter((bit:number)=>![592,593,594].includes(bit));f.server.game.store.saveRaw(raw);};
 const settle=async()=>{for(let i=0;i<100&&(c.state.eligibility.status!=='confirmed'||c.state.eligibility.refreshing);i++)await vi.advanceTimersByTimeAsync(20);expect(c.state.eligibility.status).toBe('confirmed');expect(c.state.eligibility.refreshing).toBe(false);};
 try{
  await drive(s.start());await drive(s.createCharacter(0,'Eligible Tester'));await drive(s.selectCharacter(0));history(0,0);const trunk=structuredClone(profile().trunk);
  expect(c.checkEligibility()).toBe(true);await settle();expect([has(592),has(593),has(594)]).toEqual([false,false,true]);expect(s.state.pbin).toHaveLength(128);expect(s.state.npcbin).toHaveLength(512);expect(profile().trunk).toEqual(trunk);
  c.open({id:75,name:'NPC'},0,{npcRank:s.state.npcbin![75*4+3],specialPresentDone:has(594)});await vi.advanceTimersByTimeAsync(200);c.advance();await c.answer(true);expect(start).toHaveBeenCalledWith(75);
  c.reset();history(4,5);expect(c.checkEligibility()).toBe(true);await settle();expect([has(592),has(593),has(594)]).toEqual([false,true,true]);
  c.reset();history(5,5);expect(c.checkEligibility()).toBe(true);await settle();expect([has(592),has(593),has(594)]).toEqual([true,true,true]);expect(profile().trunk).toEqual(trunk);
  expect(c.checkEligibility()).toBe(true);await settle();expect(c.state.eligibility.bits).toEqual([]);expect([has(592),has(593),has(594)]).toEqual([true,true,true]);
  expect(sends.filter(p=>p.id===0x5204&&new DataView(p.data.buffer).getUint16(0)===1)).toHaveLength(4);expect(c.state.giftCards).toEqual([]);
 }finally{c.dispose();s.dispose();}
},15000);
