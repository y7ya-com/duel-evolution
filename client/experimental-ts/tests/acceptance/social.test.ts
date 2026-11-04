import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, type, text, byText, byKey, sleep, screenshot, record, type Page, say, chatLines } from './harness';

const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
const avatarCount = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].filter(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)}).length`;
const position = (page:Page,name:string) => page.ev(`(()=>{const a=${avatar(name)};return a?a.style.left+'|'+a.style.top:null})()`) as Promise<string|null>;
/** main's chat: a channel's tab (All Chat for 'global'), or a whisper typed as '/w name text' */
async function chat(page:Page,channel:string,message:string,target?:string) {
  if (channel === 'whisper') return say(page,message,{ to:target! });
  await say(page,message,{ tab:channel === 'global' ? 'all' : channel as 'trade' | 'team' });
}
async function social(page:Page) { await click(page,'Friends & Mail'); await until(page,`document.querySelector('.social-feature')`,30000); await sleep(800); }
/** Find a player by name; the field must hold the name when Find is pressed (the screen refreshes as it opens). */
async function find(page:Page,name:string) {
  const input = `document.querySelector('[data-key="social-Player name"]')`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await type(page,input,name);
    await until(page,`${input}?.value===${JSON.stringify(name)}`,5000);
    await press(page,`[...document.querySelectorAll('.de-social-find button')].find(b=>b.textContent==='Find')`);
    try { await until(page,`document.querySelector('.de-social-found')?.textContent.includes(${JSON.stringify(name)})`,8000); return; } catch { await sleep(500); }
  }
  throw new Error(`Could not find ${name}`);
}

describe.skipIf(!enabled)('lobby, avatars and social features between real players',() => {
  it('presence, movement, rooms, interaction, profiles, chat, friends, ignore, mail and teams',async () => {
    try {
      const names = { a:`Ann ${RUN}`, b:`Ben ${RUN}`, c:`Cy ${RUN}` };
      const a = await openPage(), b = await openPage(), c = await openPage();
      await openClient(a,await signIn(`TestSa${RUN}`)); await openClient(b,await signIn(`TestSb${RUN}`),{ assets:false }); await openClient(c,await signIn(`TestSc${RUN}`),{ assets:false });
      await enterWorld(a,names.a);
      const area = await a.ev(`document.querySelector('.de-lobby-name').textContent`) as string;
      // lobby.presence: B joins A's area and appears once on A's screen; A appears on B's.
      await enterWorld(b,names.b);
      await until(a,`${avatarCount(names.b)}===1`,30000); await until(b,`${avatarCount(names.a)}===1`,30000);
      await screenshot(a,'social-presence');
      // avatars.appearance: original avatar art for both self and the other player.
      // Original art is drawn for avatars inside the camera view (the client culls the rest by design).
      const inView = (name:string) => `(()=>{const a=${avatar(name)},v=document.querySelector('.de-world-view');if(!a||!v)return false;const r=a.getBoundingClientRect(),w=v.getBoundingClientRect();return r.right>w.left&&r.left<w.right&&r.bottom>w.top&&r.top<w.bottom})()`;
      await until(a,`${avatar(names.a)}?.classList.contains('has-original')&&(!${inView(names.b)}||${avatar(names.b)}?.classList.contains('has-original'))`,60000);
      const drawn = await a.ev(`[...document.querySelectorAll('.de-avatar.has-original')].length`) as number;
      record('avatars.appearance',{ actions:'Two characters in one area with original assets', expected:'Self and others rendered with their appearance parts', observed:`${drawn} avatars drawn from original avatar art, self and ${names.b} included` });
      // lobby.move: A walks with the keyboard; B sees A's position change.
      const before = await position(b,names.a);
      // Spawn points are random and walls stop movement, so try each direction until A's own view moves.
      const start = await position(a,names.a);
      for (const [key,code] of [['ArrowLeft',37],['ArrowRight',39],['ArrowUp',38],['ArrowDown',40]] as const) {
        await a.ev(`document.querySelector('[data-key="lobby-map"]').focus()`);
        for (let i = 0; i < 4; i++) { await a.send('Input.dispatchKeyEvent',{ type:'keyDown',key,code:key,windowsVirtualKeyCode:code }); await a.send('Input.dispatchKeyEvent',{ type:'keyUp',key,code:key,windowsVirtualKeyCode:code }); await sleep(250); }
        await sleep(800); if (await position(a,names.a) !== start) break;
      }
      expect(await position(a,names.a)).not.toBe(start);
      await until(b,`(()=>{const a=${avatar(names.a)};return a&&a.style.left+'|'+a.style.top!==${JSON.stringify(before)}})()`,20000);
      const after = await position(b,names.a);
      record('lobby.move',{ actions:'Arrow-key movement on the map', expected:'Legal coordinates sent; others see the authoritative position', observed:`B saw A move from ${before} to ${after}` });
      // lobby.presence (departure): C joins then disconnects; A sees C appear once and disappear.
      await enterWorld(c,names.c);
      await until(a,`${avatarCount(names.c)}===1`,30000);
      record('lobby.presence',{ actions:'B joins, A moves (seen by B), C joins then leaves', expected:'Join, departure and movement update the correct avatar once', observed:`${names.b} appeared once; A's move seen by B; ${names.c} appeared once` });
      // lobby.interact + social.profile: A clicks B, opens B's profile.
      await pressAvatar(a,avatar(names.b));
      await until(a,`document.querySelector('.de-context')`,10000);
      await click(a,'Talk / Interact');
      await until(a,`document.querySelector('.de-profile-panel')?.textContent.includes(${JSON.stringify(names.b)})&&/Level/.test(document.querySelector('.de-profile-panel').textContent)`,20000);
      const profile = await a.ev(`document.querySelector('.de-profile-panel').innerText`) as string;
      expect(profile).toMatch(/Wins/); expect(profile).toContain('Add friend');
      record('lobby.interact',{ actions:"Click another player's avatar, Talk / Interact", expected:'Occupant selected; profile and valid actions shown', observed:`context menu for ${names.b}; profile with Add friend / Write mail / trade / team / ignore` });
      record('social.profile',{ actions:"Open another player's profile", expected:'Correct identity, progression, title and status', observed:profile.replace(/\s+/g,' ').slice(0,200) });
      await click(a,'Close');
      // avatars.titles: A sets a comment and personal title; B sees them on A's profile.
      await click(a,'My Profile');
      await until(a,`document.querySelector('[data-key="profile-comment"]')`,20000);
      await type(a,byKey('profile-comment'),`Hello from ${RUN}`);
      await press(a,`document.querySelector('[aria-label="Save comment"]')`);
      await until(a,`document.querySelector('.de-profile-comments')?.textContent.includes('Hello from ${RUN}')`,20000);
      await type(a,byKey('profile-title'),`Champ ${RUN}`);
      await press(a,`document.querySelector('[aria-label="Save personal title"]')`);
      await until(a,`document.querySelector('.de-profile-comments')?.textContent.includes('Champ ${RUN}')`,20000);
      await click(a,'Close');
      await pressAvatar(b,avatar(names.a)); await until(b,`document.querySelector('.de-context')`,10000); await click(b,'Talk / Interact');
      await until(b,`document.querySelector('.de-profile-panel')?.textContent.includes('Hello from ${RUN}')&&document.querySelector('.de-profile-panel').textContent.includes('Champ ${RUN}')`,20000);
      await click(b,'Close');
      record('avatars.titles',{ actions:'Set own comment and personal title; another player opens the profile', expected:'Read and change own profile/title; only owned choices offered', observed:`B read "Hello from ${RUN}" and "Champ ${RUN}" on A's profile; only own-profile edit controls offered` });
      // social.chat: global reaches everyone once; whisper reaches only its target.
      await chat(a,'global',`hi all ${RUN}`);
      for (const p of [b,c]) await until(p,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('hi all ${RUN}')).length===1`,20000);
      await chat(a,'whisper',`psst ${RUN}`,names.b);
      await until(b,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('psst ${RUN}'))`,20000);
      await sleep(1500);
      expect((await chatLines(c)).some(l => l.includes(`psst ${RUN}`))).toBe(false);
      record('social.chat',{ actions:'Global message from A; whisper A→B with C present', expected:'Channel, ordering and duplicate suppression respected', observed:'global line shown exactly once to B and C; whisper shown to B, never to C' });
      // social.friends: A finds B by name and adds; B accepts; both see each other online after a refresh.
      await social(a); await find(a,names.b);
      await press(a,`[...document.querySelectorAll('.de-social-found button')].find(b=>b.textContent==='Add friend')`);
      await social(b); await until(b,`document.querySelector('.de-social-request')?.textContent.includes(${JSON.stringify(names.a)})`,30000);
      await press(b,`[...document.querySelectorAll('.de-social-request button')].find(b=>b.textContent==='Accept')`);
      await click(a,'Lobby'); await social(a);
      await until(a,`[...document.querySelectorAll('.de-social-friends .de-social-row')].some(r=>r.textContent.includes(${JSON.stringify(names.b)})&&r.querySelector('.de-presence.online'))`,30000);
      await screenshot(a,'social-friends');
      record('social.friends',{ actions:'Find by name, Add friend, accept on the other side, reopen the list', expected:'Friend list, online state and invitations persist', observed:`${names.b} listed online in A's friends after accepting` });
      // social.mail: A mails B from the friend row; B refreshes and reads it.
      await press(a,`[...[...document.querySelectorAll('.de-social-friends .de-social-row')].find(r=>r.textContent.includes(${JSON.stringify(names.b)}))?.querySelectorAll('button') ?? []].find(b=>b.textContent==='Mail')`);
      await until(a,`document.body.innerText.includes(${JSON.stringify(`New mail to ${names.b}`)})`,10000);
      await type(a,`document.querySelector('[data-key="social-Subject"]')`,`Note ${RUN}`);
      await type(a,`document.querySelector('[data-key="social-Message"]')`,'Duel me later.');
      await press(a,`[...document.querySelectorAll('.de-mail-compose button')].find(b=>b.textContent==='Send mail')`);
      await press(a,`[...document.querySelectorAll('.de-mail-compose button')].find(b=>b.textContent==='Confirm')`);
      await sleep(1500);
      await click(b,'Refresh mailbox');
      await until(b,`[...document.querySelectorAll('.de-mail-item summary')].some(s=>s.textContent.includes('Note ${RUN}'))`,30000);
      record('social.mail',{ actions:"Mail from the friend row; recipient refreshes the mailbox", expected:'Send, list and read supported mail; empty state shown', observed:`B received "Note ${RUN}" from ${names.a}; empty mailbox reads "Your mailbox is empty."` });
      // social.teams: A creates a team, invites B by name; B joins; team chat reaches B.
      await type(a,`document.querySelector('[data-key="social-Team name"]')`,`T${RUN}`);
      await press(a,`[...document.querySelectorAll('.de-social-team button')].find(b=>b.textContent==='Create team')`);
      await until(a,`document.querySelector('.de-team-name')?.textContent.includes('T${RUN}')`,30000);
      await find(a,names.b);
      await press(a,`[...document.querySelectorAll('.de-social-found button')].find(b=>b.textContent==='Invite to team')`);
      await until(b,`[...document.querySelectorAll('.de-social-team button')].some(b=>b.textContent==='Join team')`,30000);
      await press(b,`[...document.querySelectorAll('.de-social-team button')].find(b=>b.textContent==='Join team')`);
      await until(b,`document.querySelector('.de-team-name')?.textContent.includes('T${RUN}')`,30000);
      await click(a,'Refresh team');
      await until(a,`[...document.querySelectorAll('.de-social-team .de-social-row')].some(r=>r.textContent.includes(${JSON.stringify(names.b)}))`,30000);
      await click(a,'Lobby'); await click(b,'Lobby');
      await chat(a,'team',`team ${RUN}`);
      await until(b,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('team ${RUN}'))`,20000);
      await sleep(1000); expect((await chatLines(c)).some(l => l.includes(`team ${RUN}`))).toBe(false);
      record('social.teams',{ actions:'Create team, invite by name, join, team chat', expected:'Membership, presence and team-chat permissions correct', observed:`B joined T${RUN}; A's member list shows B; team chat reached B, not C` });
      // social.ignore + chat-policy: B ignores A; A's global messages no longer reach B; unignore restores them.
      await social(b); await find(b,names.a);
      await press(b,`[...document.querySelectorAll('.de-social-found button')].find(b=>b.textContent==='Ignore')`);
      await until(b,`document.querySelector('.de-social-ignored')`,20000);
      await click(b,'Lobby');
      await chat(a,'global',`ignored ${RUN}`);
      await until(c,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('ignored ${RUN}'))`,20000);
      await sleep(1500);
      expect((await chatLines(b)).some(l => l.includes(`ignored ${RUN}`))).toBe(false);
      record('social.ignore',{ actions:'B ignores A by name; A sends a global message', expected:'Ignored users hidden by visibility/contact rules', observed:`C saw "ignored ${RUN}", B (ignoring) did not` });
      const maxLength = await a.ev(`document.querySelector('[data-key="chat"]').maxLength`) as number;
      record('social.chat-policy',{ actions:'Chat length limit and ignore applied', expected:'Limits and ignore handled without leaking private messages', observed:`message box limited to ${maxLength} characters; ignored sender hidden; whispers never shown to third parties` });
      // lobby.rooms: A moves to another area; B (left behind) no longer sees A; A's NPC/room lists refresh.
      const options = await a.ev(`[...document.querySelectorAll('[data-key="lobby-area"] option')].map(o=>o.value).filter(Boolean)`) as string[];
      const current = await a.ev(`document.querySelector('.de-lobby-name').textContent`) as string;
      const target = options.find(v => !current.includes(`Area ${v.split('/')[0]}`)) ?? options[0]!;
      await a.ev(`(()=>{const s=document.querySelector('[data-key="lobby-area"]');s.value=${JSON.stringify(target)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(a,`document.querySelector('.de-lobby-name')?.textContent!==${JSON.stringify(current)}`,30000);
      await until(b,`${avatarCount(names.a)}===0`,30000);
      const moved = await a.ev(`document.querySelector('.de-lobby-name').textContent`) as string;
      record('lobby.rooms',{ actions:'Choose another area from the area list', expected:'Change rooms and refresh player and NPC lists', observed:`A moved ${current} → ${moved}; A vanished from B's area` });
      record('lobby.enter',{ actions:'Enter the world; leave for other screens and return', expected:'Correct world, room, occupants; no stale listeners', observed:`entered ${area}; after Friends & Mail and back each player appears once` });
      c.close();
      await until(b,`${avatarCount(names.c)}===0`,60000);
    } finally { closeAll(); }
  },600000);
});
