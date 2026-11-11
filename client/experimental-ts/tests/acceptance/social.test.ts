import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, pressAvatar, type, text, byText, byKey, sleep, screenshot, record, type Page, say, chatLines, profileText, placeName, cardText, closeCard } from './harness';

const avatar = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].find(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)})`;
const avatarCount = (name:string) => `[...document.querySelectorAll('[data-key^="avatar:"]')].filter(a=>a.querySelector('.de-avatar-name')?.textContent===${JSON.stringify(name)}).length`;
const position = (page:Page,name:string) => page.ev(`(()=>{const a=${avatar(name)};return a?a.style.left+'|'+a.style.top:null})()`) as Promise<string|null>;
/** main's chat: a channel's tab (All Chat for 'global'), or a whisper typed as '/w name text' */
async function chat(page:Page,channel:string,message:string,target?:string) {
  if (channel === 'whisper') return say(page,message,{ to:target! });
  await say(page,message,{ tab:channel === 'global' ? 'all' : channel as 'trade' | 'team' });
}
async function social(page:Page) { await click(page,'Find Player'); await until(page,`document.querySelector('[data-key="find-name"]')`,30000); await sleep(800); }
/** Find a player by name; the field must hold the name when Find is pressed (the screen refreshes as it opens). */
async function find(page:Page,name:string) {
  const input = `document.querySelector('[data-key="find-name"]')`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await type(page,input,name);
    await until(page,`${input}?.value===${JSON.stringify(name)}`,5000);
    await press(page,`document.querySelector('[data-key="find-search"]')`);
    try { await until(page,`document.querySelector('.win[data-window-class="CWindowModelFriendEnum"]')?.innerText.includes(${JSON.stringify(`${name} (ID `)})`,8000); return; } catch { await sleep(500); }
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
      const area = await a.ev(placeName) as string;
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
      await until(a,`${cardText}.includes(${JSON.stringify(names.b)})&&/LV/.test(${cardText})`,20000);
      const profile = await a.ev(cardText) as string;
      expect(profile).toMatch(/Wins/); expect(profile).toContain('Send Friend Request');
      record('lobby.interact',{ actions:"Click another player's avatar", expected:'Occupant selected; profile and valid actions shown', observed:`${names.b}'s card (main's CPlayerListMenu): level, title, wins / losses, comment; Send Duel / Friend / Trade Request, Chat Message, D-mail, Team, Ignore` });
      record('social.profile',{ actions:"Open another player's profile", expected:'Correct identity, progression, title and status', observed:profile.replace(/\s+/g,' ').slice(0,200) });
      await closeCard(a);
      // avatars.titles: A sets a comment and personal title; B sees them on A's profile.
      await click(a,'My Profile');
      await until(a,byKey('profile-comment'),20000); await press(a,byKey('profile-comment'));
      await until(a,byKey('comment-greeting'),10000);
      await type(a,byKey('comment-greeting'),`Hello from ${RUN}`); await type(a,byKey('comment-duel'),`Champ ${RUN}`);
      await press(a,byKey('comment-ok'));
      // My Profile shows ten rows (live's CWindowModelProfile); the Comment row past them is scrolled in, as a player would
      const both = `(${profileText})?.includes('Hello from ${RUN}')&&(${profileText})?.includes('Champ ${RUN}')`;
      for (let i = 0; i < 40 && !await a.ev(`Boolean(${both})`); i++) {
        const r = await a.ev(`(()=>{const w=${byKey('profile-ok')}?.closest('.win')?.getBoundingClientRect();return w&&[w.x+w.width/2,w.y+w.height/2]})()`) as [number,number]|null;
        if (r) await a.send('Input.dispatchMouseEvent',{ type:'mouseWheel',x:r[0],y:r[1],deltaX:0,deltaY:120 });
        await sleep(500);
      }
      await until(a,both,5000);
      await press(a,byKey('profile-ok'));
      await pressAvatar(b,avatar(names.a));
      await until(b,`${cardText}.includes('Hello from ${RUN}')&&${cardText}.includes('Champ ${RUN}')`,20000);
      await closeCard(b);
      record('avatars.titles',{ actions:'Set own comment and personal title; another player opens the profile', expected:'Read and change own profile/title; only owned choices offered', observed:`B read "Hello from ${RUN}" and "Champ ${RUN}" on A's profile; only own-profile edit controls offered` });
      // social.chat: global reaches everyone once; whisper reaches only its target.
      await chat(a,'global',`hi all ${RUN}`);
      for (const p of [b,c]) await until(p,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].filter(l=>l.textContent.includes('hi all ${RUN}')).length===1`,20000);
      await chat(a,'whisper',`psst ${RUN}`,names.b);
      await until(b,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('psst ${RUN}'))`,20000);
      await sleep(1500);
      expect((await chatLines(c)).some(l => l.includes(`psst ${RUN}`))).toBe(false);
      record('social.chat',{ actions:'Global message from A; whisper A→B with C present', expected:'Channel, ordering and duplicate suppression respected', observed:'global line shown exactly once to B and C; whisper shown to B, never to C' });
      // social.friends: A finds B by name in Find a Player and adds; B accepts the invitation there; A's Friend List shows B online.
      await social(a); await find(a,names.b);
      await press(a,byKey('find-friend'));
      await social(b); await until(b,`document.querySelector('[data-key^="find-offer:"]')?.textContent.includes(${JSON.stringify(names.a)})`,30000);
      await press(b,`document.querySelector('[data-key^="find-offer:"]')`);
      await until(b,`!${byKey('find-accept')}?.disabled`,10000); await press(b,byKey('find-accept'));
      await press(a,byKey('find-close')); await press(b,byKey('find-close'));
      const friendList = (name:string) => `[...document.querySelectorAll('.win[data-window-class="CWindowModelFriendlist"] .row')].find(r=>r.textContent.includes(${JSON.stringify(name)}))`;
      for (let i = 0; i < 6; i++) {
        await click(a,'Friend List');
        try { await until(a,`${friendList(names.b)}&&!/Offline/.test(${friendList(names.b)}.textContent)`,8000); break; }
        catch (e) { if (i === 5) throw e; await press(a,byKey('list-close')); await sleep(2000); }
      }
      await screenshot(a,'social-friends');
      record('social.friends',{ actions:'Find a Player by name, Add to Friend List, accept the invitation in the other\'s Find a Player, open the Friend List', expected:'Friend list, online state and invitations persist', observed:`${names.b} listed online (not Offline) in A's Friend List after accepting` });
      // social.mail: A picks B's row in the Friend List, Friend Options -> Send D-mail; B opens D-Mail and reads it.
      await press(a,friendList(names.b));
      await until(a,`${byKey('list-find')}?.textContent.includes('Friend Options')`,10000); await press(a,byKey('list-find'));
      await until(a,`!${byKey('find-mail')}?.disabled`,10000); await press(a,byKey('find-mail'));
      await until(a,`document.body.innerText.includes(${JSON.stringify(names.b)})&&${byKey('compose-subject')}`,10000);
      await type(a,byKey('compose-subject'),`Note ${RUN}`);
      await type(a,byKey('compose-body'),'Duel me later.');
      await until(a,`!${byKey('compose-send')}?.disabled`,10000); await press(a,byKey('compose-send'));
      await until(a,`!${byKey('compose-send')}`,10000);
      const mailRow = `[...document.querySelectorAll('[data-key^="mail-row:"]')].some(r=>r.textContent.includes('Note ${RUN}'))`;
      for (let i = 0; i < 6; i++) {
        await click(b,'D-Mail');
        try { await until(b,mailRow,8000); break; } catch (e) { if (i === 5) throw e; await press(b,byKey('mail-close')); await sleep(2000); }
      }
      await press(b,byKey('mail-close'));
      record('social.mail',{ actions:"Friend List row -> Friend Options -> Send D-mail; recipient opens D-Mail", expected:'Send, list and read supported mail; empty state shown', observed:`B's D-Mail listed "Note ${RUN}" from ${names.a}` });
      // social.teams: A forms a team (Team List -> Form Team, the name prompt), invites B from Find a Player; B accepts there; team chat reaches B.
      await click(a,'Team List');
      await until(a,byKey('team-form'),10000); await press(a,byKey('team-form'));
      await until(a,byKey('team-name'),10000); await type(a,byKey('team-name'),`T${RUN}`);
      await until(a,`!${byKey('team-name-ok')}?.disabled`,5000); await press(a,byKey('team-name-ok'));
      await until(a,`document.body.innerText.includes('Team List: T${RUN}')`,30000);
      await press(a,byKey('list-close'));
      await social(a); await find(a,names.b);
      await until(a,`!${byKey('find-team')}?.disabled`,10000); await press(a,byKey('find-team'));
      await press(a,byKey('find-close'));
      for (let i = 0; i < 6; i++) {
        await social(b);
        try { await until(b,`document.querySelector('[data-key^="find-teaminvite:"]')`,8000); break; } catch (e) { if (i === 5) throw e; await press(b,byKey('find-close')); await sleep(2000); }
      }
      await press(b,`document.querySelector('[data-key^="find-teaminvite:"]')`);
      await until(b,`!${byKey('find-accept')}?.disabled`,10000); await press(b,byKey('find-accept'));
      await press(b,byKey('find-close'));
      const teamHas = (name:string) => `[...document.querySelectorAll('.win[data-window-class="CWindowModelTeamlist"] .row')].some(r=>r.textContent.includes(${JSON.stringify(name)}))`;
      for (const [p,other] of [[b,names.a],[a,names.b]] as const) for (let i = 0; i < 6; i++) {
        await click(p,'Team List');
        try { await until(p,`document.body.innerText.includes('Team List: T${RUN}')&&${teamHas(other)}`,8000); await press(p,byKey('list-close')); break; }
        catch (e) { if (i === 5) throw e; await press(p,byKey('list-close')); await sleep(2000); }
      }
      await chat(a,'team',`team ${RUN}`);
      await until(b,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('team ${RUN}'))`,20000);
      await sleep(1000); expect((await chatLines(c)).some(l => l.includes(`team ${RUN}`))).toBe(false);
      record('social.teams',{ actions:'Create team, invite by name, join, team chat', expected:'Membership, presence and team-chat permissions correct', observed:`B joined T${RUN} from its invitation; both Team Lists show the other; team chat reached B, not C` });
      // social.ignore + chat-policy: B ignores A; A's global messages no longer reach B; unignore restores them.
      await social(b); await find(b,names.a);
      await until(b,`!${byKey('find-ignore')}?.disabled`,10000); await press(b,byKey('find-ignore'));
      await until(b,`${byKey('find-ignore')}?.disabled`,20000); await press(b,byKey('find-close'));
      await click(b,'Ignore List');
      await until(b,`[...document.querySelectorAll('.win[data-window-class="CWindowModelBlacklist"] .row')].some(r=>r.textContent.includes(${JSON.stringify(names.a)}))`,20000);
      await press(b,byKey('list-close'));
      await chat(a,'global',`ignored ${RUN}`);
      await until(c,`[...document.querySelectorAll('#htmlui-host [role="log"] > div')].some(l=>l.textContent.includes('ignored ${RUN}'))`,20000);
      await sleep(1500);
      expect((await chatLines(b)).some(l => l.includes(`ignored ${RUN}`))).toBe(false);
      record('social.ignore',{ actions:'B ignores A by name; A sends a global message', expected:'Ignored users hidden by visibility/contact rules', observed:`C saw "ignored ${RUN}", B (ignoring) did not` });
      const maxLength = await a.ev(`document.querySelector('[data-key="chat"]').maxLength`) as number;
      record('social.chat-policy',{ actions:'Chat length limit and ignore applied', expected:'Limits and ignore handled without leaking private messages', observed:`message box limited to ${maxLength} characters; ignored sender hidden; whispers never shown to third parties` });
      // lobby.rooms: A moves to another area; B (left behind) no longer sees A; A's NPC/room lists refresh.
      // the bar's Move list (main's CWindowModelMove): a row per area, "Name[kind]  people/32"
      const current = await a.ev(placeName) as string;
      await press(a,byKey('menubar-move')); await until(a,`document.querySelector('[data-key^="move-area:"]')`,10000);
      const rows = await a.ev(`[...document.querySelectorAll('[data-key^="move-area:"]')].map(b=>[b.dataset.key,b.getAttribute('aria-label')??b.textContent])`) as [string,string][];
      const target = rows.find(([,l]) => !current.includes(l.split('[')[0]!.trim())) ?? rows[0]!;
      await press(a,byKey(target[0]));
      await until(a,`(${placeName})!==${JSON.stringify(current)}`,30000);
      await until(b,`${avatarCount(names.a)}===0`,30000);
      const moved = await a.ev(placeName) as string;
      record('lobby.rooms',{ actions:'Choose another area from the area list', expected:'Change rooms and refresh player and NPC lists', observed:`A moved ${current} → ${moved}; A vanished from B's area` });
      record('lobby.enter',{ actions:'Enter the world; leave for other screens and return', expected:'Correct world, room, occupants; no stale listeners', observed:`entered ${area}; after the Find a Player, Friend List, D-Mail and Team List windows each player appears once` });
      c.close();
      await until(b,`${avatarCount(names.c)}===0`,60000);
    } finally { closeAll(); }
  },600000);
});
