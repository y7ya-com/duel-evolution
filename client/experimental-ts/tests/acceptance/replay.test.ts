import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, sleep, screenshot, record, byKey, startNpcDuel, surrender, claimNpcReward, lobbyShown, type Page } from './harness';

/** The Duel Log (Main Menu > Duel Log, src/ui/htmlui/duellog.ts) over main's duel archive (GET /api/de/replays,
 * server/src/duel/duelArchive.ts): an NPC duel played to its end is listed, Download gives its EDOPro .yrpX
 * (/api/de/replays/<id>), Play replays the duel record this browser kept on the duel screen with the replay's
 * Play/Pause, Step and Exit, and Exit returns to the lobby. */
const REPLAY = `window.__deApp?.getState?.().replay`;
const archive = (page:Page) => page.ev(`fetch('/api/de/replays?limit=1000',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(b=>b.replays??[])`) as Promise<{ id:number; kind:string; opponent:string|null; result:string; turns:number }[]>;
/** The Duel History row naming this opponent (the listbox draws each row as its own line of text). */
const rowLine = (opponent:string) => `[...document.querySelectorAll('#htmlui-host *')].filter(e=>e.children.length===0&&e.textContent.includes(${JSON.stringify(`vs ${opponent}`)})&&e.getClientRects().length)[0]`;
/** Selects that row with a real press at its line (the list takes the point). */
async function pickRow(page:Page,opponent:string) {
  const point = await page.ev(`(()=>{const r=${rowLine(opponent)}.getBoundingClientRect();return {x:Math.round(r.x+Math.min(r.width/2,60)),y:Math.round(r.y+r.height/2)};})()`) as { x:number; y:number };
  await page.send('Input.dispatchMouseEvent',{ type:'mouseMoved',...point });
  await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',...point,button:'left',clickCount:1 });
  await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',...point,button:'left',clickCount:1 });
}

describe.skipIf(!enabled)('Duel Log and replays against the real server',() => {
  it('lists a finished NPC duel, downloads its .yrpX and replays it on the duel board to the end, then Exit returns to the lobby',async () => {
    try {
      const page = await openPage(1280,900);
      await openClient(page,await signIn(`TestRp${RUN}`));
      const me = `Rp ${RUN}`; await enterWorld(page,me);
      const before = (await archive(page)).length;
      // An NPC duel to its end (surrendered on our first turn: the server's result and its duel record).
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>=10`,60000);
      await surrender(page);
      await claimNpcReward(page);
      await until(page,lobbyShown,60000);
      // The archive row (written at the duel's end).
      for (let i = 0; i < 60 && (await archive(page)).length <= before; i++) await sleep(1000);
      const rows = await archive(page);
      expect(rows.length).toBe(before + 1);
      const row = rows[0]!;
      expect(row.kind).toMatch(/npc/i);
      // Main Menu > Duel Log: the top's stats, Duel History, the row.
      await click(page,'Duel Log');
      await until(page,`${byKey('duellog-history')}&&!${byKey('duellog-history')}.disabled`,30000);
      const top = (await page.ev(`document.querySelector('#htmlui-host').innerText.replace(/\\s+/g,' ')`) as string).replace(/^.*?(Duel Log)/,'$1');
      await press(page,byKey('duellog-history'));
      const opponent = row.opponent ?? 'Yami Yugi';
      await until(page,rowLine(opponent),20000);
      const listed = (await page.ev(`document.querySelector('#htmlui-host').innerText.replace(/\\s+/g,' ')`) as string).replace(/^.*?(Duel Log: History)/,'$1');
      expect(listed).toContain(`vs ${opponent}`);
      await screenshot(page,'replay-duellog-list');
      await pickRow(page,opponent);
      await until(page,`${byKey('duellog-download')}&&!${byKey('duellog-download')}.disabled`,10000);
      // Download: the anchor main's list clicks points at the row's .yrpX.
      await page.ev(`(()=>{window.__dl=[];const c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.hasAttribute('download')){window.__dl.push(this.href);return;}return c.call(this);};})()`);
      await press(page,byKey('duellog-download'));
      await until(page,`window.__dl.length===1`,10000);
      const file = await page.ev(`(async()=>{const u=window.__dl[0];const r=await fetch(u,{credentials:'same-origin'});const b=new Uint8Array(await r.arrayBuffer());return {url:u.replace(location.origin,''),status:r.status,name:r.headers.get('content-disposition')??'',bytes:b.length,magic:String.fromCharCode(...b.slice(0,4))};})()`) as { url:string; status:number; name:string; bytes:number; magic:string };
      expect(file.url).toBe(`/api/de/replays/${row.id}`);
      expect(file.status).toBe(200);
      expect(file.name).toMatch(/\.yrpX/);
      expect(file.bytes).toBeGreaterThan(32);
      expect(file.magic).toBe('yrpX');
      // Play: the record this browser kept, on the duel screen.
      await until(page,`${byKey('duellog-play')}&&!${byKey('duellog-play')}.disabled`,10000);
      await press(page,byKey('duellog-play'));
      await until(page,`${REPLAY}&&document.querySelector('.de-client').dataset.scene==='duel'&&${byKey('replay-toggle')}`,30000);
      const r0 = await page.ev(REPLAY) as { index:number; total:number; playing:boolean };
      expect(r0.total).toBeGreaterThan(0);
      // Pause, Step one command, Play to the end.
      if (r0.playing) { await press(page,byKey('replay-toggle')); await until(page,`${REPLAY}.playing===false`,10000); }
      const paused = (await page.ev(REPLAY) as { index:number }).index;
      await sleep(1500);
      const stillPaused = (await page.ev(REPLAY) as { index:number }).index;
      expect(stillPaused).toBe(paused);
      await press(page,byKey('replay-step'));
      await until(page,`${REPLAY}.index>${paused}`,10000);
      const stepped = (await page.ev(REPLAY) as { index:number }).index;
      expect(stepped).toBeGreaterThan(paused);
      await press(page,byKey('replay-toggle')); await until(page,`${REPLAY}.playing===true||${REPLAY}.index===${REPLAY}.total`,10000);
      // the board fills from the record's commands as it plays (its cards drawn), to the last command
      let fieldCards = 0;
      for (const until_ = Date.now() + 240000; Date.now() < until_ && !(await page.ev(`${REPLAY}.index===${REPLAY}.total`));) { fieldCards = Math.max(fieldCards,await page.ev(`document.querySelectorAll('.de-field-card').length`) as number); await sleep(100); }
      await until(page,`${REPLAY}.index===${REPLAY}.total`,5000);
      fieldCards = Math.max(fieldCards,await page.ev(`document.querySelectorAll('.de-field-card').length`) as number);
      expect(fieldCards).toBeGreaterThan(0);
      const ended = await page.ev(`({toggle:${byKey('replay-toggle')}?.disabled??null,step:${byKey('replay-step')}?.disabled??null})`);
      expect(ended).toEqual({ toggle:true,step:true });
      await screenshot(page,'replay-ended');
      // Exit: back to the lobby.
      await press(page,byKey('replay-exit'));
      await until(page,`!${REPLAY}&&${lobbyShown}`,30000);
      record('duellog.replay',{ actions:'NPC duel (surrendered) to its result; Main Menu > Duel Log > Duel History; pick the row; Download; Play; Pause, Step, Play to the end; Exit',
        expected:'The finished duel is listed from the archive; Download gives its .yrpX; Play replays it on the duel board to the end; Exit returns to the lobby',
        observed:`top "${top.slice(0,120)}"; list "${listed.slice(0,160)}"; Download ${file.url} ${file.status} ${file.bytes} bytes "${file.magic}" (${file.name}); replay of ${r0.total} commands: paused at ${paused} (still ${stillPaused} after 1.5 s), Step → ${stepped}, played to ${r0.total}/${r0.total} (up to ${fieldCards} cards on the board); Exit → lobby` });
    } finally { closeAll(); }
  },600000);
});
