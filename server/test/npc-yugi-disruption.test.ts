import {beforeAll, expect, it} from 'vitest';
import {createNodeDuelCore} from '../src/duel/engine/node.ts';
import type {DuelCore} from '../src/duel/engine/core.ts';
import {publicCounterReply} from '../src/duel/ai/simSearch.ts';
import {play,code,npcActivated,activating,passive} from './npcScenario.ts';
let dc:DuelCore;
beforeAll(async()=>{dc=await createNodeDuelCore()},60000);
const draws=(p:ReturnType<typeof play>)=>p.npc.filter(x=>x.sel.heart_of_cards).map(x=>x.resp?.card);
it('does not spend the opening skill on a beater it leaves in hand behind an existing wall',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,first:'npc',turns:1,
  npc:{hand:['Premature Burial','Heart of the Underdog','Giant Soldier of Stone','Giant Soldier of Stone','Beta The Magnet Warrior']},player:{}});
 expect(draws(p)[0]).not.toBe(code('Skilled Dark Magician'));
 expect(p.npc.length).toBeLessThan(160);
});
it('chooses useful protection or resources instead of another single removal spell into unknown backrow',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,first:'player',turns:2,
  npc:{hand:['Premature Burial','Giant Soldier of Stone','Beta The Magnet Warrior','Skilled Dark Magician'],mzone:[['Giant Soldier of Stone','set']],szone:[['Heart of the Underdog','up']]},
  player:{mzone:['Wulf, Lightsworn Beast','Lumina, Lightsworn Summoner'],szone:['Solemn Judgment','Bottomless Trap Hole','Bottomless Trap Hole']}});
 expect([code('Graceful Charity'),code('Pot of Greed'),code('Mirror Force'),code('Swords of Revealing Light')]).toContain(draws(p)[0]);
 expect(p.npc.length).toBeLessThan(200);
});
it('summons Tribe face-up, keeps discard fodder, and declares the public opposing type',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,heart_pool:[code('Petit Moth')],first:'player',turns:2,
  npc:{hand:['Tribe-Infecting Virus','Alpha The Magnet Warrior','Raigeki']},
  player:{mzone:['Crystal Beast Sapphire Pegasus','Crystal Beast Topaz Tiger'],szone:[['Crystal Beast Amber Mammoth','up'],['Crystal Beast Sapphire Pegasus','up'],['Crystal Beast Amber Mammoth','up'],null,null,['Ancient City - Rainbow Ruins','up']]},
  player_policy:activating('Ancient City - Rainbow Ruins')});
 expect(p.msgs.some(m=>m.type==='SUMMONING'&&m.code===code('Tribe-Infecting Virus'))).toBe(true);
 expect(npcActivated(p,'Tribe-Infecting Virus')).toBe(true);
 const race=p.npc.find(x=>x.sel.type==='ANNOUNCE_RACE');
 expect(race?.resp?.races).toEqual([0x4000]); // Beast, not the default Warrior bit
 expect(p.msgs.some(m=>m.type==='MOVE'&&m.card===code('Tribe-Infecting Virus')&&(m.to as any)?.location===16)).toBe(false);
});
it('does not cast a lone nuke first when a public negate can be attacked by an independent monster effect',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,heart_pool:[code('Petit Moth')],first:'player',turns:2,
  npc:{hand:['Tribe-Infecting Virus','Alpha The Magnet Warrior','Raigeki']},
  player:{mzone:['Crystal Beast Sapphire Pegasus','Crystal Beast Topaz Tiger'],szone:[['Crystal Beast Amber Mammoth','up'],['Crystal Beast Sapphire Pegasus','up'],['Crystal Beast Amber Mammoth','up'],null,null,['Ancient City - Rainbow Ruins','up']]}});
 const summon=p.msgs.findIndex(m=>m.type==='SUMMONING'&&m.code===code('Tribe-Infecting Virus'));
 const spell=p.msgs.findIndex(m=>m.type==='CHAINING'&&m.code===code('Raigeki'));
 expect(summon).toBeGreaterThanOrEqual(0);
 expect(spell<0||summon<spell).toBe(true);
});
it.each([1,4])('a forecast may answer with face-up Rainbow Ruins in position %i',position=>{
 expect(publicCounterReply({type:'SELECT_CHAIN',selects:[{code:34487429,location:8,position}]},false)).toEqual({type:'SELECT_CHAIN',index:0});
});
it('never uses the identities of hidden traps and can reserve a public negate for the payoff',()=>{
 expect(publicCounterReply({type:'SELECT_CHAIN',selects:[{code:41420027,location:8,position:10},{code:34487429,location:8,position:10}]},false)).toBeNull();
 expect(publicCounterReply({type:'SELECT_CHAIN',selects:[{code:34487429,location:8,position:1}]},true)).toBeNull();
});
it('holds Graceful Charity unused and still answers with Tribe-Infecting Virus',()=>{
 // Owner: one signature Pot of Greed per duel is Yugi's only draw spell; a Graceful Charity in hand stays there.
 const p=play(dc,{npcId:53,heart_of_cards:1,heart_pool:[code('Raigeki')],first:'player',turns:2,
  npc:{hand:['Graceful Charity','Alpha The Magnet Warrior','Tribe-Infecting Virus'],deck:[...Array(16).fill('Petit Moth'),'Tribe-Infecting Virus','Dark Hole','Raigeki','Petit Moth']},
  player:{mzone:['Crystal Beast Sapphire Pegasus','Crystal Beast Topaz Tiger'],szone:[['Crystal Beast Amber Mammoth','up'],['Crystal Beast Sapphire Pegasus','up'],['Crystal Beast Amber Mammoth','up'],null,null,['Ancient City - Rainbow Ruins','up']]},
  player_policy: sel => {
    const charity=(sel.view as any)?.players?.[1]?.szone?.some((c:any)=>c?.code===code('Graceful Charity'));
    return charity ? passive(sel) : activating('Ancient City - Rainbow Ruins')(sel);
  }});
 expect(npcActivated(p,'Graceful Charity')).toBe(false);
 expect(npcActivated(p,'Tribe-Infecting Virus')).toBe(true);
 expect(p.npc.find(x=>x.sel.type==='ANNOUNCE_RACE')?.resp?.races).toEqual([0x4000]);
});
it('different unknown set identities do not change the draw decision',()=>{
 const choose=(sets:string[])=>play(dc,{npcId:53,heart_of_cards:1,first:'player',turns:2,
  npc:{hand:['Premature Burial','Giant Soldier of Stone','Beta The Magnet Warrior','Skilled Dark Magician'],mzone:[['Giant Soldier of Stone','set']]},
  player:{mzone:['Wulf, Lightsworn Beast','Lumina, Lightsworn Summoner'],szone:sets}});
 expect(draws(choose(['Solemn Judgment','Bottomless Trap Hole']))[0])
  .toBe(draws(choose(['Jar of Greed','Reckless Greed']))[0]);
});
it('prefers taking a Crystal Beast over destroying it into another Rainbow Ruins resource',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,heart_pool:[code('Raigeki'),code('Snatch Steal')],first:'player',turns:2,
  npc:{hand:['Alpha The Magnet Warrior','Chorus of Sanctuary']},
  player:{mzone:['Crystal Beast Sapphire Pegasus'],szone:[['Crystal Beast Amber Mammoth','up'],['Crystal Beast Topaz Tiger','up'],null,null,null,['Ancient City - Rainbow Ruins','up']]}});
 expect(draws(p)[0]).toBe(code('Snatch Steal'));
 expect(npcActivated(p,'Snatch Steal')).toBe(true);
});
it('keeps its discard when visible Skill Drain would negate Tribe',()=>{
 const p=play(dc,{npcId:53,heart_of_cards:1,heart_pool:[code('Petit Moth')],first:'player',turns:2,
  npc:{hand:['Alpha The Magnet Warrior'],mzone:['Tribe-Infecting Virus']},
  player:{mzone:['Blue-Eyes White Dragon'],szone:[['Skill Drain','up']]}});
 expect(npcActivated(p,'Tribe-Infecting Virus')).toBe(false);
});
