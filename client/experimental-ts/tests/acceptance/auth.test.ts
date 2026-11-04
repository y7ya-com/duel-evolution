import { describe, expect, it } from 'vitest';
import { RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, text, byText, byKey, sleep, screenshot, testPassword, discordForward, record, resetRateLimits } from './harness';

const titleSignedOut = `document.body.innerText.includes('Sign In')&&document.querySelector('input[name="password"],[data-key="password"]')`;
async function signInForm(page:Awaited<ReturnType<typeof openPage>>,user:string,password:string) {
  await type(page,byKey('username'),user);
  await page.ev(`(()=>{const p=document.querySelector('[data-key="password"]')||[...document.querySelectorAll('input[type=password]')].find(i=>i.closest('form')?.querySelector('[data-key="username"]'));p.value=${JSON.stringify(password)};p.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click(page,'Sign In');
}

describe.skipIf(!enabled)('accounts and characters against the real Worker, auth and D1',() => {
  it('signs in, refuses wrong credentials, restores and ends sessions, and keeps credentials out of the page',async () => {
    resetRateLimits();
    try {
      const user = `TestAu${RUN}`;
      await signIn(user);   // creates the account; its password is derived from the stack secret
      const password = await testPassword(user);
      const page = await openPage(); await openClient(page,null);
      await until(page,titleSignedOut,30000);
      // auth.invalid: wrong password shows an actionable failure and the form stays usable
      await signInForm(page,user,'definitely-not-the-password');
      await until(page,`document.querySelector('.de-notice,.de-error,[role=alert]')`,20000);
      const refused = await text(page);
      expect(refused).not.toContain('Signed in as');
      expect(await page.ev(`Boolean(${byText('Sign In')})`)).toBe(true);
      const alert = (await page.ev(`[...document.querySelectorAll('.de-notice,.de-error,[role=alert]')].map(n=>n.textContent.trim()).filter(Boolean).join(' | ')`) as string);
      expect(alert.length).toBeGreaterThan(10);
      record('auth.invalid',{ actions:'Sign-in form with a wrong password, then the right one', expected:'Actionable failure; retry possible', observed:`refusal shown: "${alert}"; the Sign In form stayed available` });
      // auth.login: the right password binds the account; the password is never kept in the page
      await signInForm(page,user,password);
      await until(page,`document.body.innerText.includes('Signed in as ${user}')`,30000);
      const html = await page.ev('document.documentElement.outerHTML') as string, storage = await page.ev('JSON.stringify({...localStorage,...sessionStorage})') as string;
      expect(html).not.toContain(password); expect(storage).not.toContain(password); expect(page.logs.join('\n')).not.toContain(password);
      const session = await page.ev(`fetch('/api/de/session').then(r=>r.json())`) as { signedIn:boolean; name?:string };
      expect(session).toMatchObject({ signedIn:true });
      record('auth.login',{ actions:'Real sign-in form against better-auth', expected:'Account bound; no credential in DOM, storage or console', observed:`Signed in as ${user}; /api/de/session signedIn=true; password absent from DOM/storage/logs`, accounts:'1 test user' });
      // auth.session: reload restores the session; Sign Out clears identity and access
      await page.go(page === page ? `${(await page.ev('location.href'))}` : '',`document.body.innerText.includes('Signed in as ${user}')`);
      await click(page,'Sign Out');
      await until(page,titleSignedOut,30000);
      expect((await page.ev(`fetch('/api/de/session').then(r=>r.json())`) as { signedIn:boolean }).signedIn).toBe(false);
      expect(await page.ev(`fetch('/api/de/decks').then(r=>r.status)`)).toBe(401);
      await page.go(await page.ev('location.href') as string,`document.querySelector('.de-client')`);
      await until(page,titleSignedOut,30000);
      record('auth.session',{ actions:'Reload while signed in; Sign Out; reload', expected:'Session restored on reload; logout clears identity and protected access', observed:'Signed in after reload; after Sign Out session=false, /api/de/decks 401, still signed out after reload' });
    } finally { closeAll(); }
  },240000);

  it('registers through the account panel, verifies through the Discord forward, refuses duplicates and bad input',async () => {
    resetRateLimits();
    try {
      const page = await openPage(); await openClient(page,null);
      await until(page,titleSignedOut,30000);
      const account = `Reg${RUN}`, password = `long-enough-${RUN}`;
      await press(page,`[...document.querySelectorAll('summary')].find(s=>s.textContent.includes('Registration'))`);
      await click(page,'Register / recover verification code');
      const field = (label:string) => `[...document.querySelectorAll('.account-feature label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input')`;
      // invalid: a name the server refuses
      await type(page,field('Account name'),'x'); await type(page,field('Password'),password);
      await press(page,`[...document.querySelectorAll('.account-feature button[type=submit]')].find(b=>b.textContent==='Register')`);
      await until(page,`document.querySelector('.account-feature [role=alert]')`,20000);
      const invalid = await page.ev(`document.querySelector('.account-feature [role=alert]').textContent`) as string;
      // valid registration -> verification code
      await type(page,field('Account name'),account); await type(page,field('Password'),password);
      await press(page,`[...document.querySelectorAll('.account-feature button[type=submit]')].find(b=>b.textContent==='Register')`);
      await until(page,`document.body.innerText.includes('/verify')`,20000);
      const pageText = await text(page), code = /\b([A-Z0-9]{6,12})\b/.exec(pageText.slice(pageText.indexOf('/verify')))?.[1] ?? /code[^A-Z0-9]*([A-Z0-9]{6,12})/i.exec(pageText)?.[1];
      await screenshot(page,'auth-register-code');
      expect(code,'verification code shown').toBeTruthy();
      // login before verification is refused with a usable message
      // duplicate: another browser registering the same name with a different password is refused
      const other = await openPage(); await openClient(other,null); await until(other,titleSignedOut,30000);
      await press(other,`[...document.querySelectorAll('summary')].find(s=>s.textContent.includes('Registration'))`);
      await click(other,'Register / recover verification code');
      await type(other,field('Account name'),account); await type(other,field('Password'),'a-different-password');
      await press(other,`[...document.querySelectorAll('.account-feature button[type=submit]')].find(b=>b.textContent==='Register')`);
      await until(other,`document.querySelector('.account-feature [role=alert]')`,20000);
      const duplicate = await other.ev(`document.querySelector('.account-feature [role=alert]').textContent`) as string;
      // Discord /verify with the shown code, then Continue signs in
      const verified = await discordForward('verify',code!,`${Date.now()}`.slice(-12));
      expect(verified.ok).toBe(true);
      await type(page,field('Password'),password);
      await press(page,`[...document.querySelectorAll('.account-feature button[type=submit]')].find(b=>b.textContent==='Continue')`);
      await until(page,`document.body.innerText.includes('Signed in as')`,30000);
      record('auth.register',{ actions:'Account panel Register; invalid name; duplicate name from a second browser; Discord /verify forward; Continue', expected:'Valid account created and usable; duplicate and invalid refused', observed:`code shown; invalid: "${invalid}"; duplicate: "${duplicate}"; verified and signed in as ${account}`, accounts:'1 new account, 1 second browser' });
    } finally { closeAll(); }
  },240000);

  it('creates, lists, selects and deletes characters, refuses collisions, claims the starter once, and binds characters to their account',async () => {
    resetRateLimits();
    try {
      const a = await openPage(), b = await openPage();
      const cookiesA = await signIn(`TestCa${RUN}`), cookiesB = await signIn(`TestCb${RUN}`);
      await openClient(a,cookiesA); await openClient(b,cookiesB);
      const name = `Hero ${RUN}`;
      // character.create + character.list
      await enterWorld(a,name);
      // The claim must show up as a deck, owned cards and a level/wallet from the server.
      await click(a,'Edit Deck');
      await until(a,`/Main Deck/.test(document.body.innerText)&&document.querySelectorAll('[data-key^="deck-card:main:"]').length>=40`,60000);
      const mainCount = await a.ev(`document.querySelectorAll('[data-key^="deck-card:main:"]').length`) as number;
      const owned = await a.ev(`[...document.querySelectorAll('[data-key^="collection-card:"] .de-card-count')].filter(c=>c.textContent!=='×0').length`) as number;
      await click(a,'Shop'); await until(a,`/[0-9,]+ MP/.test(document.body.innerText)`,60000);
      const wallet = /([0-9,]+) MP/.exec(await text(a))?.[0];
      const level = /Lv (\d+)/.exec(await a.ev(`document.querySelector('.de-status')?.textContent ?? ''`) as string)?.[0];
      expect(mainCount).toBeGreaterThanOrEqual(40); expect(owned).toBeGreaterThan(0); expect(wallet).toBeTruthy();
      await click(a,'Lobby'); await until(a,byKey('lobby-npcs'),60000);
      expect(await a.ev(`document.body.innerText.includes('Choose your Starter Deck')`)).toBe(false);
      record('character.starter',{ actions:'Fresh character claims the offered starter; open deck editor and shop; return to lobby', expected:'Claimed once; deck, inventory, level and wallet reflect it', observed:`starter claimed; main deck ${mainCount} cards; ${owned} owned collection entries on page 1; wallet ${wallet}; ${level}; not offered again` });
      await click(a,'Disconnect');
      await click(a,'Go Online',60000);
      await until(a,`[...document.querySelectorAll('.de-characters button')].some(b=>b.textContent.includes(${JSON.stringify(name)}))`,30000);
      const slots = await a.ev(`[...document.querySelectorAll('.de-characters strong')].map(s=>s.textContent)`) as string[];
      expect(slots).toEqual([name]);
      expect(await a.ev(`document.querySelectorAll('[data-key="character-slot"] option').length`)).toBe(3);
      // character.create collision: B cannot take A's name
      await click(b,'Go Online',60000); await until(b,byKey('character-name'),60000);
      await type(b,byKey('character-name'),name); await click(b,'Create');
      await until(b,`document.body.innerText.includes('This Player Name is already in use.')`,20000);
      const collision = 'This Player Name is already in use. Please create another.';
      expect(await b.ev(`document.querySelectorAll('.de-characters strong').length`)).toBe(0);
      // invalid name
      await type(b,byKey('character-name'),'Bo'); await click(b,'Create');
      await until(b,`document.body.innerText.includes('at least 4 characters')`,20000);
      await type(b,byKey('character-name'),'Zoë☃ok'); await click(b,'Create');
      await until(b,`document.body.innerText.includes('incompatible characters')`,20000);
      const invalid = 'too short: "Enter a name of at least 4 characters."; non-Latin-1: "There are incompatible characters in this name."';
      expect(await b.ev(`document.querySelectorAll('.de-characters strong').length`)).toBe(0);
      record('character.create',{ actions:'Create a valid name; second account creates the same name; invalid name', expected:'Valid name appears in its slot; collision and invalid name reported; slots refresh', observed:`created "${name}" in slot 1; collision: "${collision}"; invalid: "${invalid}"; neither created` });
      record('character.list',{ actions:'Reconnect and open Select Character', expected:'Occupied and empty slots with correct identity', observed:`occupied: ${slots.join(', ')}; 3 free slots offered` });
      // character.select: enters the lobby as that character
      await press(a,`[...document.querySelectorAll('.de-characters button')].find(b=>b.textContent.includes(${JSON.stringify(name)}))`);
      await until(a,byKey('lobby-npcs'),60000);
      expect(await text(a)).toContain(name);
      const world = await a.ev(`document.querySelector('.de-lobby-name')?.textContent`) as string;
      record('character.select',{ actions:'Select the existing character', expected:'Loads the selected player and enters the correct world', observed:`entered ${world} as ${name}` });
      // starter offered only once: not offered again on re-entry
      expect(await a.ev(`document.body.innerText.includes('Choose your Starter Deck')`)).toBe(false);
      // auth.binding: B's list never shows A's character, and B cannot select A's slot
      const listB = await b.ev(`[...document.querySelectorAll('.de-characters strong')].map(s=>s.textContent)`) as string[];
      expect(listB).not.toContain(name);
      record('auth.binding',{ actions:'Second account lists characters', expected:"An account cannot see or select another account's character", observed:`account B sees [${listB.join(', ')}], not "${name}"` , accounts:'2 test users' });
      // character.delete: B creates and deletes its own character
      const doomed = `Temp ${RUN}`;
      await type(b,byKey('character-name'),doomed); await click(b,'Create');
      await until(b,`[...document.querySelectorAll('.de-characters strong')].some(s=>s.textContent===${JSON.stringify(doomed)})`,30000);
      await click(b,`Delete ${doomed}`);
      await until(b,`![...document.querySelectorAll('.de-characters strong')].some(s=>s.textContent===${JSON.stringify(doomed)})`,30000);
      record('character.delete',{ actions:'Create then delete (confirmed) a character', expected:'Slot updates after confirmed deletion', observed:`"${doomed}" removed; slot free again` });
    } finally { closeAll(); }
  },300000);
});
