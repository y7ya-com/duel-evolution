import { expect, it, vi } from 'vitest';
import { NpcController } from '../src/features/npc';
import { BinaryWriter as W } from '../src/network/codec';
const packet = (id:number,data:Uint8Array) => ({id,data,param:0});
function setup() { const send=vi.fn(), start=vi.fn(), refresh=vi.fn(); const c=new NpcController({send,onStartDuel:start,onRefreshCollection:refresh}); c.open({id:51,name:'NPC'}); return {c,send,start,refresh}; }
it('asks before starting; decline uses line10 then closes',async()=>{ const {c,start,send}=setup(); expect(c.state.stage).toBe('ask'); await c.answer(false); expect(c.state.dialogue).toMatchObject({line:10,text:'…?',known:false}); c.advance(); expect(c.state.stage).toBe('done'); expect(start).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); });
it.each([[1,1,'won',0x45],[2,1,'lost',0x4a],[1,2,'item',0x4f]] as const)('result %i present %i yields %s',async(result,kind,stage,line)=>{
 const {c,send,start,refresh}=setup(); await c.answer(true); await c.answer(true); expect(start).toHaveBeenCalledTimes(1); c.afterDuel(result); c.advance(); expect(c.state.stage).toBe('after-duel');
 c.receive(packet(0x4237,new W().u32(kind).bytes())); c.receive(packet(0x4800,new W().u16(7).bytes())); c.advance(); expect(c.state.stage).toBe(stage); expect(c.state.dialogue?.line).toBe(line);
 c.advance(); c.advance(); expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0]).toEqual([0x5204,new W().u16(3).u32(0).bytes()]);
 const grant=packet(0x5205,new W().u16(1).u16(99).u16(1).u32(123).bytes()); c.receive(grant); c.receive(grant); expect(c.state.giftBits).toEqual([99]); expect(c.state.giftCards).toEqual([123]); expect(refresh).toHaveBeenCalledTimes(1);
});
it('selects offered packs only; confirms once; never replays uncertain claims',async()=>{const {c,send,refresh}=setup(); await c.answer(true); c.afterDuel(1); c.receive(packet(0x4800,new W().u16(7).bytes())); c.selectPack(1); expect(send).not.toHaveBeenCalled(); c.selectPack(7); c.selectPack(7); expect(send).toHaveBeenCalledTimes(1); expect(c.state.cards).toEqual([]); c.disconnected(); expect(c.state.packStatus).toBe('uncertain'); c.selectPack(7); expect(send).toHaveBeenCalledTimes(1); const receipt=packet(0x4803,new W().u32(0).u32(123).u8(1).bytes()); c.receive(receipt); c.receive(receipt); expect(c.state.cards).toEqual([{id:123,isNew:true}]); expect(refresh).toHaveBeenCalledTimes(1); c.receive(packet(0x4800,new W().u16(8).bytes())); expect(c.state.packs).toEqual([7]);});
it('ignores unrelated receipts, rejects malformed data, handles refusal and reset',async()=>{const {c,send}=setup(); await c.answer(true); c.afterDuel(1); c.receive(packet(0x4803,new W().u32(0).u32(123).u8(1).bytes())); expect(c.state.cards).toEqual([]); c.receive(packet(0x4800,new W().u16(2).bytes())); c.selectPack(2); c.receive(packet(0x4803,new Uint8Array(3))); expect(c.state.error).toContain('Malformed'); expect(c.state.packStatus).toBe('pending'); c.receive(packet(0x4803,new W().u32(1).bytes())); expect(c.state.packStatus).toBe('failed'); c.selectPack(2); expect(send).toHaveBeenCalledTimes(1); c.reset(); c.receive(packet(0x4237,new W().u32(1).bytes())); expect(c.state.npc).toBeNull(); c.dispose(); c.open({id:51,name:'NPC'}); expect(c.state.stage).toBe('idle');});
it('does not resurrect reset state on async start failure',async()=>{let reject!:(e:unknown)=>void; const c=new NpcController({send:vi.fn(),onStartDuel:()=>new Promise((_,no)=>{reject=no;})}); c.open({id:51,name:'NPC'}); const operation=c.answer(true); c.reset(); reject(new Error('late')); await operation; expect(c.state.stage).toBe('idle');});
it('keeps failed send delivery uncertain and refresh retry never replays mutation',async()=>{
 const send=vi.fn(()=>{throw Error('connection lost');});const refresh=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
 const c=new NpcController({send,onStartDuel:vi.fn(),onRefreshCollection:refresh});c.open({id:51,name:'NPC'});await c.answer(true);c.afterDuel(1);c.receive(packet(0x4800,new W().u16(7).bytes()));c.selectPack(7);expect(c.state.packStatus).toBe('uncertain');await c.refreshCollection();expect(c.state.error).toContain('refresh failed');await c.refreshCollection();c.selectPack(7);expect(send).toHaveBeenCalledTimes(1);expect(c.state.cards).toEqual([]);
});
it('queues another inventory refresh when a second confirmed grant arrives mid-refresh',async()=>{
 let finish!:()=>void;const refresh=vi.fn().mockImplementationOnce(()=>new Promise<void>(yes=>{finish=yes;})).mockResolvedValue(undefined);
 const c=new NpcController({send:vi.fn(),onStartDuel:vi.fn(),onRefreshCollection:refresh});c.open({id:51,name:'NPC'});await c.answer(true);c.afterDuel(1);c.receive(packet(0x4237,new W().u32(1).bytes()));c.receive(packet(0x4800,new W().u16(7).bytes()));c.advance();c.advance();c.receive(packet(0x5205,new W().u16(0).u16(1).u32(123).bytes()));c.selectPack(7);c.receive(packet(0x4803,new W().u32(0).u32(124).u8(0).bytes()));expect(refresh).toHaveBeenCalledTimes(1);finish();await Promise.resolve();await Promise.resolve();expect(refresh).toHaveBeenCalledTimes(2);
});
it('does not attach unrelated lobby rewards after a declined conversation',async()=>{const {c}=setup();await c.answer(false);c.advance();c.receive(packet(0x4800,new W().u16(7).bytes()));expect(c.state.packs).toEqual([]);});
it('reads opening before ASK and caches acknowledged contact without granting a gift',async()=>{
 const send=vi.fn(),start=vi.fn(),refresh=vi.fn();const c=new NpcController({send,onStartDuel:start,onRefreshCollection:refresh});
 c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.state.stage).toBe('opening');expect(c.state.dialogue?.line).toBe(0);
 expect(send.mock.calls).toEqual([[0x5204,new W().u16(4).u32(9).bytes()]]);c.advance();await c.answer(true);expect(start).not.toHaveBeenCalled();
 const ack=packet(0x5205,new W().u16(0).u16(0).bytes());c.receive(ack);c.receive(ack);expect(c.state.firstContactStatus).toBe('confirmed');expect(c.state.giftStatus).toBe('idle');expect(refresh).not.toHaveBeenCalled();
 await c.answer(false);c.advance();c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.state.dialogue?.line).toBe(5);expect(send).toHaveBeenCalledTimes(1);
});
it('unknown rank never invents contact; auth skip waits for opening',()=>{
 const send=vi.fn();const c=new NpcController({send,onStartDuel:vi.fn()});c.open({id:9,name:'NPC'},0x100,{});expect(c.state.dialogue?.line).toBeNull();expect(send).not.toHaveBeenCalled();c.advance();expect(c.state.stage).toBe('greeting');c.advance();
 c.open({id:9,name:'NPC'},0,{npcRank:2});expect(c.state.dialogue?.line).toBe(5);c.advance();expect(c.state.stage).toBe('ask');
});
it('preserves uncertain contact, rejects malformed acknowledgements and prevents replay',()=>{
 const send=vi.fn(()=>{throw Error('lost');});const c=new NpcController({send,onStartDuel:vi.fn()});c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.state.firstContactStatus).toBe('uncertain');c.disconnected();c.advance();
 c.receive(packet(0x5205,new W().u16(1).u16(99).u16(0).bytes()));expect(c.state.firstContactStatus).toBe('uncertain');expect(c.state.giftBits).toEqual([]);c.open({id:9,name:'NPC'},0,{npcRank:0});expect(send).toHaveBeenCalledTimes(1);
 c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));expect(c.state.firstContactStatus).toBe('confirmed');c.reset();c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));expect(c.state.npc).toBeNull();
});
it.each([0x36,0x42,0x4b])('special NPC %i never infers a gift from absent rights',id=>{
 const send=vi.fn();const c=new NpcController({send,onStartDuel:vi.fn()});c.open({id,name:'NPC'},0,{npcRank:0});expect(c.state.dialogue?.known).toBe(false);expect(c.state.error).toContain('eligibility data');expect(send).not.toHaveBeenCalled();c.advance();expect(c.state.stage).toBe('done');
 c.open({id,name:'NPC'},0,{npcRank:2,specialPresentDone:true});expect(c.state.dialogue?.line).toBe(5);c.advance();expect(c.state.stage).toBe('ask');
});
it('checks world-init eligibility with the verified opcode and refreshes progress without inferring a hidden right',async()=>{
 let finish!:()=>void;const send=vi.fn(),progress=vi.fn(()=>new Promise<void>(yes=>{finish=yes;})),c=new NpcController({send,onStartDuel:vi.fn(),onRefreshProgress:progress});
 expect(c.checkEligibility()).toBe(true);expect(send.mock.calls).toEqual([[0x5204,new W().u16(1).u32(0).bytes()]]);expect(c.checkEligibility()).toBe(false);expect(()=>c.open({id:75,name:'NPC'},0,{npcRank:1,specialPresentDone:false})).toThrow('still being checked');
 c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));expect(c.state.eligibility).toEqual({status:'confirmed',refreshing:true,bits:[],cards:[]});expect(progress).toHaveBeenCalledOnce();expect(c.checkEligibility()).toBe(false);
 finish();await Promise.resolve();await Promise.resolve();c.open({id:75,name:'NPC'},0,{npcRank:1,specialPresentDone:false});expect(c.state.stage).toBe('opening');expect(c.state.error).toContain('does not currently have');c.advance();expect(c.state.stage).toBe('done');expect(c.close()).toBe(true);
 c.open({id:75,name:'NPC'},0,{npcRank:1,specialPresentDone:true});c.advance();expect(c.state.stage).toBe('ask');
});
it('accepts source refusal text blocks but never executes dialogue as a grant',()=>{
 const send=vi.fn(),c=new NpcController({send,onStartDuel:vi.fn(),resolvePresentText:id=>id===0x63e2?'Synthetic denial':id>=0x63e2&&id<=0x63e6?'':null});
 c.open({id:54,name:'NPC'},0,{npcRank:0,specialPresentDone:false});expect(c.state.dialogue).toMatchObject({line:null,text:'Synthetic denial',known:true});expect(send).not.toHaveBeenCalled();c.advance();expect(c.state.stage).toBe('done');
});
it('keeps uncertain world eligibility fenced across tunnel loss and resolves a late acknowledged receipt once',async()=>{
 const send=vi.fn(()=>{throw Error('offline');}),progress=vi.fn(),c=new NpcController({send,onStartDuel:vi.fn(),onRefreshProgress:progress});c.checkEligibility();expect(c.state.eligibility.status).toBe('uncertain');expect(c.checkEligibility()).toBe(false);c.disconnected();expect(()=>c.open({id:9,name:'NPC'})).toThrow('uncertain');
 c.receive(packet(0x5205,new W().u16(1).u16(250).u16(0).bytes()));c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));await Promise.resolve();await Promise.resolve();expect(c.state.eligibility.bits).toEqual([250]);expect(progress).toHaveBeenCalledOnce();expect(send).toHaveBeenCalledOnce();
});
it('does not overlap world eligibility with a contact or gift and validates malformed receipts',async()=>{
 const send=vi.fn(),c=new NpcController({send,onStartDuel:vi.fn()});c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.checkEligibility()).toBe(false);c.reset();expect(c.checkEligibility()).toBe(true);c.receive(packet(0x5205,new Uint8Array(3)));expect(c.state.eligibility.status).toBe('pending');expect(c.state.error).toContain('Malformed');c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));expect(c.state.eligibility.status).toBe('confirmed');expect(c.checkEligibility()).toBe(true);expect(send).toHaveBeenCalledTimes(3);
});
it('ignores late eligibility progress callbacks after reset and exposes refresh failure without fabricating rights',async()=>{
 let reject!:(e:unknown)=>void;const progress=vi.fn(()=>new Promise<void>((_,no)=>{reject=no;})),c=new NpcController({send:vi.fn(),onStartDuel:vi.fn(),onRefreshProgress:progress});c.checkEligibility();c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));c.reset();reject(Error('late'));await Promise.resolve();await Promise.resolve();expect(c.state.error).toBeNull();expect(c.state.eligibility.status).toBe('idle');
 c.checkEligibility();c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));reject(Error('failed'));await Promise.resolve();await Promise.resolve();expect(c.state.eligibility.refreshing).toBe(false);expect(c.state.error).toContain('progress refresh failed');expect(c.state.eligibility.bits).toEqual([]);
});
it('does not strand inventory refreshes when a new NPC opens after an eligibility grant',async()=>{
 let finish!:()=>void;const refresh=vi.fn().mockImplementationOnce(()=>new Promise<void>(yes=>{finish=yes;})).mockResolvedValue(undefined),c=new NpcController({send:vi.fn(),onStartDuel:vi.fn(),onRefreshCollection:refresh});
 c.checkEligibility();c.receive(packet(0x5205,new W().u16(0).u16(1).u32(123).bytes()));expect(refresh).toHaveBeenCalledOnce();c.open({id:9,name:'NPC'},0,{npcRank:1});void c.refreshCollection();finish();for(let i=0;i<6;i++)await Promise.resolve();expect(refresh).toHaveBeenCalledTimes(2);expect(c.state.refreshPending).toBe(false);
});
it('ordinary close retains contact history while hard reset clears it',async()=>{
 const send=vi.fn();const c=new NpcController({send,onStartDuel:vi.fn()});c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.close()).toBe(false);c.receive(packet(0x5205,new W().u16(0).u16(0).bytes()));c.advance();await c.answer(false);c.advance();expect(c.close()).toBe(true);c.open({id:9,name:'NPC'},0,{npcRank:0});expect(c.state.dialogue?.line).toBe(5);expect(send).toHaveBeenCalledTimes(1);c.reset();c.open({id:9,name:'NPC'},0,{npcRank:0});expect(send).toHaveBeenCalledTimes(2);
});
