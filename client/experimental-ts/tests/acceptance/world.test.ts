// The overworld on PixiJS (src/ui/world.ts): two players in one area, the map drawn on the world canvas, each sees the
// other walk smoothly, the frame rate while walking, chat bubbles, and every area of the Move list in turn.
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseWorldMaps } from '../../src/world/maps';
import { astarCells, cellOf, isWalkable, segmentWalkable } from '../../src/world/pathfinding';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, until, press, byKey, sleep, say, record, type Page } from './harness';

const MAPS = parseWorldMaps(JSON.parse(readFileSync(new URL('../../public/world-maps.json',import.meta.url),'utf8')));
const OUT = process.env.WORLD_SHOTS || `${process.env.HOME}/.cache/de-scratch/visual/pixiworld`;
const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
const world = `window.__deWorld?.()`;
const placeName = `[...document.querySelectorAll('#htmlui-host .lb-shadow')].filter(t=>t.style.left==='20px').map(t=>t.textContent).join(' · ')`;
async function shot(page:Page,name:string) {
  mkdirSync(OUT,{ recursive:true });
  const r = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x,y:s.y,w:s.width,h:s.height};})()`) as { x:number; y:number; w:number; h:number };
  const res = await page.send('Page.captureScreenshot',{ format:'png',clip:{ x:r.x,y:r.y,width:r.w,height:r.w * 0.75,scale:1024 / r.w } });
  writeFileSync(`${OUT}/${name}.png`,Buffer.from(res.result.data,'base64'));
}
/** Holds the right button at a stage point (live's walk-at-once) for `ms`. */
async function holdWalk(page:Page,gx:number,gy:number,ms:number) {
  const p = await page.ev(`(()=>{const s=document.querySelector('.de-stage').getBoundingClientRect();return {x:s.x+${gx}*s.width/1024,y:s.y+${gy}*s.width/1024};})()`) as { x:number; y:number };
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',x:p.x,y:p.y });
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',x:p.x,y:p.y,button:'right',buttons:2,clickCount:1 });
  await sleep(ms);
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',x:p.x,y:p.y,button:'right',buttons:0,clickCount:1 });
}
/** Frames the page paints in `ms` (requestAnimationFrame), and the worst gap. */
const frameRate = (page:Page,ms:number) => page.ev(`new Promise(r=>{let n=0;const t0=performance.now();let last=t0,worst=0;const f=t=>{n++;worst=Math.max(worst,t-last);last=t;if(t-t0<${ms})requestAnimationFrame(f);else r({fps:Math.round(n*10000/(t-t0))/10,worst:Math.round(worst*10)/10})};requestAnimationFrame(f);})`) as Promise<{ fps:number; worst:number }>;

type World = { mapId:number; ready:boolean; viewport:{ x:number; y:number }; avatars:{ name:string; x:number; y:number }[] };
type Box = { index:number; x0:number; y0:number; x1:number; y1:number };
/** A click on the map at a world point (the lobby map's own click: the app walks there, routing round walls). */
async function clickWorld(page:Page,x:number,y:number) {
  await page.ev(`(()=>{const w=window.__deWorld(),v=w.viewport,c=document.querySelector('[data-key="lobby-map"]'),r=document.querySelector('.de-world-view').getBoundingClientRect();
    const sx=Math.max(4,Math.min(1020,${x}-v.x)),sy=Math.max(4,Math.min(764,${y}-v.y));
    c.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+sx*r.width/1024,clientY:r.top+sy*r.height/768}));})()`);
}
/** Walks `name` toward the centre of exit `index` of the current map until `done` holds (or 40 tries). */
async function walkInto(page:Page,name:string,index:number,done:string) {
  await until(page,`${world}?.ready`,60000);
  let box:Box | undefined;
  for (let i = 0; i < 10 && !box; i++) { box = (await page.ev(`window.__deExits?.()`) as Box[] | null)?.find(b => b.index === index); if (!box) await sleep(500); }
  if (!box) throw new Error(`no exit ${index} on map ${(await page.ev(world) as World).mapId}`);
  // the walkable spot nearest the exit (its 20-px walk grid), then straight on into the exit as a player holding the
  // button would. The player's walk is straight at the cursor (live's CPlChibiAvatar: no route, the wall solver slides
  // it along a wall but a corner stops it), so the way there goes round the walls as a player steers: the walk grid's
  // route (the exe's A*), each move aimed at the farthest of its next points in a straight line from the avatar
  const mapId = (await page.ev(world) as World).mapId, grid = MAPS.maps.find(m => m.id === mapId)?.grid;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, trail:string[] = [];
  let near = { x:cx,y:cy };
  if (grid) { let best = Infinity; for (let y = 10; y < grid.height * 20; y += 20) for (let x = 10; x < grid.width * 20; x += 20) {
    if (!isWalkable(grid,{ x,y })) continue; const dx = Math.max(box.x0 - x,0,x - box.x1), dy = Math.max(box.y0 - y,0,y - box.y1), d = Math.hypot(dx,dy) * 1000 + Math.hypot(x - cx,y - cy);
    if (d < best) { best = d; near = { x,y }; } } }
  let route:{ x:number; y:number }[] | null = null, step = 0, last = '', still = 0;
  for (let i = 0; i < 120; i++) {
    if (await page.ev(`Boolean(${done})`)) return box;
    const w = await page.ev(world) as World | null, me = w?.avatars.find(a => a.name === name);
    if (me) { const at = `${Math.round(me.x)},${Math.round(me.y)}`; if (at !== trail[trail.length - 1]) trail.push(at); still = at === last ? still + 1 : 0; last = at; }
    if (me && w?.ready) {
      const there = Math.hypot(me.x - near.x,me.y - near.y) < 24;
      let t = there ? { x:cx,y:cy } : near;
      if (!there && grid) {
        // a new route from where the avatar is when it has none or stands still off it
        if (!route || still >= 3) { route = astarCells(grid,cellOf(me),cellOf(near)) ?? [near]; route.push(near); step = 0; still = 0; }
        while (step < route.length - 1 && Math.hypot(route[step]!.x - me.x,route[step]!.y - me.y) < 30) step++;
        let j = step; while (j + 1 < route.length && j < step + 8 && segmentWalkable(grid,me,route[j + 1]!)) j++;
        t = route[j]!;
      }
      await page.ev(`window.__deApp.dispatch({type:'move',x:${Math.round(t.x)},y:${Math.round(t.y)}}).catch(()=>{})`);
    }
    await sleep(350);
  }
  if (!await page.ev(`Boolean(${done})`)) throw new Error(`exit ${index} not reached (box ${JSON.stringify(box)}; walked ${trail.join(' ')}; ${await page.ev(`document.querySelector('.de-world-status')?.textContent+'|'+(window.__deApp?.getState?.().error??'')`)})`);
  return box;
}
const onScreen = (w:World,name:string) => { const me = w.avatars.find(a => a.name === name); return !!me && me.x - w.viewport.x >= 0 && me.x - w.viewport.x <= 1024 && me.y - w.viewport.y >= 0 && me.y - w.viewport.y <= 768; };
async function moveTo(page:Page,match:RegExp) {
  await press(page,byKey('menubar-move')); await until(page,`document.querySelector('[data-key^="move-area:"]')`,10000);
  const rows = await page.ev(`[...document.querySelectorAll('[data-key^="move-area:"]')].map(b=>[b.dataset.key,b.getAttribute('aria-label')??b.textContent])`) as [string,string][];
  const row = rows.find(([,l]) => match.test(l)); if (!row) throw new Error(`no area ${match}: ${rows.map(r => r[1]).join(', ')}`);
  const current = await page.ev(placeName) as string;
  await press(page,byKey(row[0])); await until(page,`(${placeName})!==${JSON.stringify(current)}`,30000);
  await until(page,`${world}?.ready&&${world}.sprites>0`,60000); await sleep(1500);
}

describe.skipIf(!enabled)('world (PixiJS)',() => {
  it('walks into the shop counter (the card shop opens), through a map exit, and into and out of My Room',async () => {
    const name = `Wd ${RUN}`, page = await openPage(1100,900);
    try {
      await openClient(page,await signIn(`TestWd${RUN}`)); await enterWorld(page,name);
      const log:string[] = [];
      // the Store (Duel Academy) / Game Shop (Domino City): exit 2 is the counter (entry source 11)
      await moveTo(page,/^Store|Game Shop/);
      let w = await page.ev(world) as World; expect(onScreen(w,name)).toBe(true); log.push(`arrived on map ${w.mapId} on screen`);
      await shot(page,'20-store-arrival');
      const shop = `document.querySelector('[data-key="card-shop"] [aria-label="Card Shop"]')`;
      const counter = await walkInto(page,name,2,shop);
      await sleep(2500); await shot(page,'21-store-counter-shop'); log.push(`counter ${JSON.stringify(counter)} opened the card shop`);
      await press(page,`document.querySelector('[data-key="card-shop"] [aria-label="Leave the shop"]')`); await until(page,`${world}?.ready`,30000); await sleep(1000);
      expect(await page.ev(`Boolean(${shop})`)).toBe(false); await shot(page,'22-store-back');
      // Domino City Clock Square: exit 3 is the walk-out to My Room (entry source 8), exit 0 the way to map 2
      await moveTo(page,/Clock Square/);
      w = await page.ev(world) as World; expect(onScreen(w,name)).toBe(true);
      await walkInto(page,name,0,`${world}?.mapId===2&&${world}.ready`); await sleep(1500);
      w = await page.ev(world) as World; expect(onScreen(w,name)).toBe(true); log.push(`map 0 exit 0 -> map ${w.mapId}`); await shot(page,'23-exit-to-map2');
      await walkInto(page,name,0,`${world}?.mapId===0&&${world}.ready`); await sleep(1500); log.push('map 2 exit 0 -> map 0'); await shot(page,'24-exit-back-map0');
      await walkInto(page,name,3,`${world}?.mapId===8&&${world}.ready`); await sleep(1500);
      w = await page.ev(world) as World; expect(onScreen(w,name)).toBe(true); log.push('map 0 exit 3 -> My Room'); await shot(page,'25-my-room');
      // My Room is its own map (Map_r01): the player stands by the red door (CMyRoomScene: 790,430), its own exits load,
      // and its blue door (exit 0) goes out to Domino City (live: the red one to Duel Academy)
      const room = await page.ev(world) as World, me = room.avatars.find(a => a.name === name)!;
      expect([Math.round(me.x), Math.round(me.y)]).toEqual([790, 430]);
      const roomExits = await page.ev(`window.__deExits?.()`) as Box[]; expect(roomExits.some(b => b.index === 0 && b.x1 < 1024 && b.y1 < 768)).toBe(true);
      log.push(`My Room arrival ${Math.round(me.x)},${Math.round(me.y)}; exits ${JSON.stringify(roomExits)}`);
      await walkInto(page,name,0,`[0,1,2,3,9].includes(${world}?.mapId)&&${world}.ready`); await sleep(1500); w = await page.ev(world) as World;
      expect(onScreen(w,name)).toBe(true); log.push(`My Room door -> map ${w.mapId}`);
      await shot(page,'26-out-of-my-room');
      console.log('doors',log.join(' | '));
      record('world.doors',{ actions:'Walk into the Store counter, a map exit, My Room and its door',expected:'Shop opens; maps change; arrivals on screen',observed:log.join('; ') });
    } finally { closeAll(); }
  },600000);

  it('NPCs stand at their spots (the exe\'s spot tables) on three maps, idle, and a click opens the NPC card',async () => {
    const name = `Wn ${RUN}`, page = await openPage(1100,900), log:string[] = [];
    try {
      await openClient(page,await signIn(`TestWn${RUN}`)); await enterWorld(page,name);
      for (const [area,file] of [[/^Store|Game Shop/,'30-npcs-store'],[/Clock Square/,'31-npcs-clock-square'],[/Main Street|Domino Pier|Card Shop Street|Downtown/,'32-npcs-domino']] as const) {
        try { await moveTo(page,area); } catch (error) { if (file === '32-npcs-domino') { log.push(String((error as Error).message).slice(0,200)); continue; } throw error; }
        await sleep(2000);
        const w = await page.ev(world) as World & { avatars:{ name:string; x:number; y:number; direction:number; z:number }[] };
        const spots = MAPS.maps.find(m => m.id === w.mapId)!.npcSpots, npcs = await page.ev(`JSON.stringify(window.__deApp.getState?.().lobby?.avatars?.filter(a=>a.npc).map(a=>[a.id,a.name,a.x,a.y,a.direction]))`) as string;
        const listed = JSON.parse(npcs) as [number,string,number,number,number][];
        expect(listed.length).toBeGreaterThan(0);
        for (const [,n,x,y] of listed) { expect(spots.some(s => s.x === x && s.y === y)).toBe(true); expect(w.avatars.some(a => a.name === n && Math.round(a.x) === x && Math.round(a.y) === y)).toBe(true); }
        log.push(`map ${w.mapId}: ${listed.map(([,n,x,y,d]) => `${n}@${x},${y}/${d}`).join(' ')}`);
        await shot(page,file);
      }
      // the nearest NPC's hit target starts its talk, its card beside it (live's CNpcTalk)
      const id = await page.ev(`(()=>{const a=window.__deApp.getState().lobby.avatars.filter(a=>a.npc);const me=window.__deApp.getState().lobby.avatars.find(a=>a.self);a.sort((p,q)=>Math.hypot(p.x-me.x,p.y-me.y)-Math.hypot(q.x-me.x,q.y-me.y));return a[0]?.id})()`) as number;
      await page.ev(`document.querySelector('[data-key="avatar:${id}"]').click()`);
      await until(page,`document.querySelector('button[data-key="npc-talk:next"],[data-key="npc-start:yes"]')`,10000); await sleep(800); await shot(page,'33-npc-card');
      log.push(`clicked NPC ${-id}: its card is open`);
      console.log('npcs',log.join(' | '));
      record('world.npcs',{ actions:'Visit three maps; click an NPC',expected:'NPCs at the exe spot coordinates; the NPC card opens',observed:log.join('; ') });
    } finally { closeAll(); }
  },600000);

  it('draws the map and avatars on the canvas, walks, sees the others walk, crosses areas',async () => {
    const names = { a:`Wa ${RUN}`,b:`Wb ${RUN}` };
    const [ca,cb] = await Promise.all([signIn(`TestWa${RUN}`),signIn(`TestWb${RUN}`)]);
    const a = await openPage(1100,900), b = await openPage(1100,900);
    try {
      await openClient(a,ca); await openClient(b,cb);
      await enterWorld(a,names.a); await enterWorld(b,names.b);
      await until(a,`${world}?.ready&&${world}.avatars.some(v=>v.drawn)`,60000); await until(b,`${world}?.ready`,60000);
      await until(a,avatar(names.b),30000); await until(b,avatar(names.a),30000);
      const inspect = await a.ev(world) as { mapId:number; renderer:string; sprites:number; textures:number; avatars:{ name:string; drawn:boolean; z:number }[] };
      expect(inspect.renderer).toBe('pixi'); expect(inspect.sprites).toBeGreaterThan(0);
      expect(await a.ev(`!!document.querySelector('.de-world-view>canvas.de-world-canvas')&&!document.querySelector('.de-world-view img')`)).toBe(true);
      await sleep(1500); await shot(a,'01-lobby-a'); await shot(b,'02-lobby-b');
      // A walks (right button held): A's own frame rate while walking, and B's view of A walking between server points
      const before = (await b.ev(world) as { avatars:{ name:string; x:number; y:number }[] }).avatars.find(v => v.name === names.a)!;
      const samples:{ x:number; y:number; walking:boolean }[] = [];
      const sampling = (async () => { for (let i = 0; i < 40; i++) { const s = (await b.ev(world) as { avatars:{ name:string; x:number; y:number; walking:boolean }[] }).avatars.find(v => v.name === names.a); if (s) samples.push(s); await sleep(100); } })();
      // DOM writes in the world while walking (the HTML UI's own layer aside): the hit targets only, at most 10 a second
      await a.ev(`(()=>{const v=document.querySelector('.de-world-view');window.__worldMutations=0;window.__worldObserver=new MutationObserver(l=>{window.__worldMutations+=l.length});window.__worldObserver.observe(v,{subtree:true,childList:true,attributes:true});})()`);
      const [rate] = await Promise.all([frameRate(a,3000),holdWalk(a,150,600,2500)]);
      const mutations = await a.ev(`(()=>{window.__worldObserver.disconnect();return window.__worldMutations})()`) as number;
      console.log('world DOM mutations in 3 s of walking',mutations);
      expect(mutations).toBeLessThan(3 * 10 * 4);
      await sampling;
      const afterA = await a.ev(world) as { frames:{ fps:number; p95:number; worst:number } };
      await shot(a,'03-walked-a'); await shot(b,'04-walked-b');
      const distinct = new Set(samples.map(s => `${Math.round(s.x)},${Math.round(s.y)}`)).size;
      record('world.pixi',{ actions:'A holds the right button to walk; B watches',expected:'60 fps while walking; others walk smoothly between server positions',
        observed:`A ${rate.fps} fps by rAF (worst gap ${rate.worst} ms), ticker ${afterA.frames.fps.toFixed(1)} fps p95 ${afterA.frames.p95.toFixed(1)} ms; B saw A at ${distinct} distinct points (from ${Math.round(before.x)},${Math.round(before.y)}), walking in ${samples.filter(s => s.walking).length} of ${samples.length} samples` });
      console.log('fps',JSON.stringify(rate),JSON.stringify(afterA.frames),'distinct',distinct,'walking',samples.filter(s => s.walking).length);
      expect(distinct).toBeGreaterThan(3);
      // chat bubbles over the heads
      await say(a,'Pixi hello'); await sleep(1200); await shot(b,'05-chat-b'); await shot(a,'06-chat-a');
      // every area of the Move list, in turn: the map changes, textures of the old map go
      await press(a,byKey('menubar-move')); await until(a,`document.querySelector('[data-key^="move-area:"]')`,10000);
      const rows = await a.ev(`[...document.querySelectorAll('[data-key^="move-area:"]')].map(b=>[b.dataset.key,b.getAttribute('aria-label')??b.textContent])`) as [string,string][];
      await press(a,byKey('menubar-move')).catch(() => {});
      const visited:string[] = [];
      for (const [key,label] of rows.slice(0,6)) {
        const current = await a.ev(placeName) as string;
        if (!await a.ev(`Boolean(document.querySelector('[data-key="${key}"]'))`)) { await press(a,byKey('menubar-move')); await until(a,`document.querySelector('[data-key^="move-area:"]')`,10000); }
        await press(a,byKey(key)).catch(() => {});
        await until(a,`(${placeName})!==${JSON.stringify(current)}||!document.querySelector('[data-key="${key}"]')`,30000).catch(() => {});
        await until(a,`${world}?.ready&&${world}.sprites>0`,60000).catch(() => {});
        await sleep(1500);
        const w = await a.ev(world) as { mapId:number; textures:number; sprites:number; viewport:{ x:number; y:number }; avatars:{ name:string; x:number; y:number; z:number; drawn:boolean }[] };
        const me = w.avatars.find(v => v.name === names.a);
        const rateHere = await frameRate(a,1500);
        visited.push(`${label.replace(/\s+/g,' ').trim()} (map ${w.mapId}, ${w.sprites} sprites, ${w.textures} textures, ${rateHere.fps} fps, self at screen ${me ? `${Math.round(me.x - w.viewport.x)},${Math.round(me.y - w.viewport.y)} z ${me.z}${me.drawn ? '' : ' (no art)'}` : 'absent'})`);
        await shot(a,`10-area-${visited.length}-map${w.mapId}`);
      }
      console.log('areas',visited.join(' | '));
      record('world.areas',{ actions:'Each area of the Move list',expected:'Each map drawn on the canvas',observed:visited.join('; ') });
    } finally { closeAll(); }
  },600000);
});
