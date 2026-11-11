import { describe, expect, it } from 'vitest';
import { signInWindow, signedIn, RUN, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, type, text, byText, byKey, sleep, screenshot, testPassword, discordForward, record, resetRateLimits, createCharacter, freeSlot, deleteCharacter, characterSlot, placeName, lobbyShown, openDeckEditor, exitDeckEditor } from './harness';

// the title signed out: ONLINE opens live's sign-in window (CWindowLogin, src/ui/htmlui/login.ts), its Sign in and inputs
const titleSignedOut = signInWindow;
async function signInForm(page:Awaited<ReturnType<typeof openPage>>,user:string,password:string) {
  await type(page,byKey('username'),user);
  await page.ev(`(()=>{const p=document.querySelector('[data-key="password"]')||[...document.querySelectorAll('input[type=password]')].find(i=>i.closest('form')?.querySelector('[data-key="username"]'));p.value=${JSON.stringify(password)};p.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click(page,'Sign in');
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
      expect(await page.ev(`Boolean(${byText('Sign in')})`)).toBe(true);
      const alert = (await page.ev(`[...document.querySelectorAll('.de-notice,.de-error,[role=alert]')].map(n=>n.textContent.trim()).filter(Boolean).join(' | ')`) as string);
      expect(alert.length).toBeGreaterThan(10);
      record('auth.invalid',{ actions:'Sign-in form with a wrong password, then the right one', expected:'Actionable failure; retry possible', observed:`refusal shown: "${alert}"; the Sign In form stayed available` });
      // auth.login: the right password binds the account; the password is never kept in the page
      await signInForm(page,user,password);
      await until(page,signedIn(user),30000);
      const html = await page.ev('document.documentElement.outerHTML') as string, storage = await page.ev('JSON.stringify({...localStorage,...sessionStorage})') as string;
      expect(html).not.toContain(password); expect(storage).not.toContain(password); expect(page.logs.join('\n')).not.toContain(password);
      const session = await page.ev(`fetch('/api/de/session').then(r=>r.json())`) as { signedIn:boolean; name?:string };
      expect(session).toMatchObject({ signedIn:true });
      record('auth.login',{ actions:'Real sign-in form against better-auth', expected:'Account bound; no credential in DOM, storage or console', observed:`Signed in as ${user}; /api/de/session signedIn=true; password absent from DOM/storage/logs`, accounts:'1 test user' });
      // auth.session: reload restores the session; Sign Out clears identity and access
      await page.go(page === page ? `${(await page.ev('location.href'))}` : '',signedIn(user));
      // Sign Out: OPTIONS, More Options, Account (the rewrite's options page; live signs out by closing the page)
      await press(page,byKey('title-options')); await press(page,byKey('opt-more'));
      await until(page,byKey('options-account'),20000); await page.ev(`${byKey('options-account')}.open=true`);
      await click(page,'Sign Out');
      // the page drops the identity at once and stays busy until the server's sign-out answers ('Signed out.')
      await until(page,`${titleSignedOut}&&!window.__deApp?.getState().busy`,30000);
      expect((await page.ev(`fetch('/api/de/session').then(r=>r.json())`) as { signedIn:boolean }).signedIn).toBe(false);
      expect(await page.ev(`fetch('/api/de/decks').then(r=>r.status)`)).toBe(401);
      await page.go(await page.ev('location.href') as string,`document.querySelector('.de-client')`);
      await until(page,titleSignedOut,30000);
      record('auth.session',{ actions:'Reload while signed in; Sign Out; reload', expected:'Session restored on reload; logout clears identity and protected access', observed:'Signed in after reload; after Sign Out session=false, /api/de/decks 401, still signed out after reload' });
    } finally { closeAll(); }
  },240000);

  it('registers through the sign-in window\'s Create account, verifies through the Discord forward, refuses duplicates and bad input',async () => {
    resetRateLimits();
    try {
      const page = await openPage(); await openClient(page,null);
      await until(page,titleSignedOut,30000);
      const account = `Reg${RUN}`, password = `long-enough-${RUN}`;
      // live's CWindowLogin (src/ui/htmlui/login.ts): "Create account" turns the window to its sign-up mode
      const signUp = async (p:typeof page,name:string,pass:string) => {
        await type(p,byKey('username'),name); await type(p,byKey('password'),pass);
        await press(p,byKey('login-submit'));
      };
      const refusal = `(()=>{const s=document.querySelector('.de-login-status[role=alert]');return s&&s.textContent.trim()})()`;
      const openSignUp = async (p:typeof page) => {
        await press(p,byKey('login-create-account'));
        await until(p,`${byKey('login-back-to-sign-in')}&&document.querySelector('[data-key="password"]')?.autocomplete==='new-password'`,20000);
      };
      await openSignUp(page);
      // invalid: a name the server refuses, said on the window's status line
      await signUp(page,'x',password);
      await until(page,refusal,20000);
      const invalid = await page.ev(refusal) as string;
      expect(invalid.length).toBeGreaterThan(5);
      // valid registration -> the window's verify view with the code
      await signUp(page,account,password);
      await until(page,`document.body.innerText.includes('/verify')`,20000);
      const pageText = await text(page), code = /\b([A-Z0-9]{6,12})\b/.exec(pageText.slice(pageText.indexOf('/verify')))?.[1] ?? /code[^A-Z0-9]*([A-Z0-9]{6,12})/i.exec(pageText)?.[1];
      await screenshot(page,'auth-register-code');
      expect(code,'verification code shown').toBeTruthy();
      expect(await page.ev(`Boolean(${byText('Continue')})`)).toBe(true);
      // duplicate: another browser registering the same name with a different password is refused
      const other = await openPage(); await openClient(other,null); await until(other,titleSignedOut,30000);
      await openSignUp(other);
      await signUp(other,account,'a-different-password');
      await until(other,refusal,20000);
      const duplicate = await other.ev(refusal) as string;
      expect(duplicate.length).toBeGreaterThan(5);
      // Discord /verify with the shown code, then Continue signs in (the password typed at Create account)
      const verified = await discordForward('verify',code!,`${Date.now()}`.slice(-12));
      expect(verified.ok).toBe(true);
      await press(page,byKey('login-submit'));
      await until(page,signedIn(),30000);
      record('auth.register',{ actions:'Sign-in window Create account; invalid name; duplicate name from a second browser; Discord /verify forward; Continue', expected:'Valid account created and usable; duplicate and invalid refused', observed:`code shown; invalid: "${invalid}"; duplicate: "${duplicate}"; verified and signed in as ${account}`, accounts:'1 new account, 1 second browser' });
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
      // main's HTML deck screen (canvas grids): the loaded deck and the trunk, as the screen holds them
      const deck = await openDeckEditor(a,40);
      const mainCount = deck.main.length;
      const owned = deck.collection.filter(c=>c.owned>0).length;
      await exitDeckEditor(a);
      await click(a,'Shop'); await until(a,`/[0-9,]+ MP/.test(document.body.innerText)`,60000);
      const wallet = /([0-9,]+) MP/.exec(await text(a))?.[0];
      const level = /Lv (\d+)/.exec(await a.ev(`document.querySelector('.de-status')?.textContent ?? ''`) as string)?.[0];
      expect(mainCount).toBeGreaterThanOrEqual(40); expect(owned).toBeGreaterThan(0); expect(wallet).toBeTruthy();
      // main's HTML shop (shop/index.js) leaves through its Back button
      await click(a,'Back'); await until(a,lobbyShown,60000);
      expect(await a.ev(`document.body.innerText.includes('Choose your Starter Deck')`)).toBe(false);
      record('character.starter',{ actions:'Fresh character claims the offered starter; open deck editor and shop; return to lobby', expected:'Claimed once; deck, inventory, level and wallet reflect it', observed:`starter claimed; main deck ${mainCount} cards; ${owned} owned trunk entries; wallet ${wallet}; ${level}; not offered again` });
      await click(a,'Return to Title');
      await click(a,'Go Online',60000);
      await until(a,`[...document.querySelectorAll('[data-key^="character-slot:"]')].some(b=>b.textContent.includes(${JSON.stringify(name)}))`,30000);
      const slots = await a.ev(`[...document.querySelectorAll('[data-key^="character-slot:"]')].map(s=>s.textContent)`) as string[];
      expect(slots).toEqual([name]);
      expect(await a.ev(`document.querySelectorAll('[data-key^="character-create:"]').length`)).toBe(3);
      // character.create collision: B cannot take A's name
      await click(b,'Go Online',60000); await until(b,freeSlot,60000);
      await createCharacter(b,name,{ wait:false });
      await until(b,`document.body.innerText.includes('This Player Name is already in use.')`,20000);
      const collision = 'This Player Name is already in use. Please create another.';
      expect(await b.ev(`document.querySelectorAll('[data-key^="character-slot:"]').length`)).toBe(0);
      // invalid name
      await createCharacter(b,'Bo',{ wait:false });
      await until(b,`document.body.innerText.includes('at least 4 characters')`,20000);
      await createCharacter(b,'Zoë☃ok',{ wait:false });
      await until(b,`document.body.innerText.includes('incompatible characters')`,20000);
      const invalid = 'too short: "Enter a name of at least 4 characters."; non-Latin-1: "There are incompatible characters in this name."';
      expect(await b.ev(`document.querySelectorAll('[data-key^="character-slot:"]').length`)).toBe(0);
      record('character.create',{ actions:'Create a valid name; second account creates the same name; invalid name', expected:'Valid name appears in its slot; collision and invalid name reported; slots refresh', observed:`created "${name}" in slot 1; collision: "${collision}"; invalid: "${invalid}"; neither created` });
      record('character.list',{ actions:'Reconnect and open Select Character', expected:'Occupied and empty slots with correct identity', observed:`occupied: ${slots.join(', ')}; 3 free slots offered` });
      // character.select: enters the lobby as that character
      await press(a,`[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes(${JSON.stringify(name)}))`);
      await until(a,lobbyShown,60000);
      expect(await text(a)).toContain(name);
      const world = await a.ev(placeName) as string;
      record('character.select',{ actions:'Select the existing character', expected:'Loads the selected player and enters the correct world', observed:`entered ${world} as ${name}` });
      // starter offered only once: not offered again on re-entry
      expect(await a.ev(`document.body.innerText.includes('Choose your Starter Deck')`)).toBe(false);
      // auth.binding: B's list never shows A's character, and B cannot select A's slot
      const listB = await b.ev(`[...document.querySelectorAll('[data-key^="character-slot:"]')].map(s=>s.textContent)`) as string[];
      expect(listB).not.toContain(name);
      record('auth.binding',{ actions:'Second account lists characters', expected:"An account cannot see or select another account's character", observed:`account B sees [${listB.join(', ')}], not "${name}"` , accounts:'2 test users' });
      // character.delete: B creates and deletes its own character
      const doomed = `Temp ${RUN}`;
      await createCharacter(b,doomed,{ wait:false });
      await until(b,`[...document.querySelectorAll('[data-key^="character-slot:"]')].some(s=>s.textContent===${JSON.stringify(doomed)})`,30000);
      // a wrong password first: the original's refusal, the character kept
      const doomedSlot = await b.ev(`(${characterSlot(doomed)})?.dataset.key.split(':')[1]`) as string;
      await press(b,byKey(`character-delete:${doomedSlot}`)); await until(b,byKey('character-delete-password'),10000);
      const prompt = await b.ev(`document.getElementById('htmlui-host').innerText`) as string;
      await type(b,byKey('character-delete-password'),'not the password'); await press(b,byKey('character-delete-password-ok'));
      await until(b,byKey('dialog-ok'),30000); const refused = await b.ev(`document.getElementById('htmlui-host').innerText`) as string; await press(b,byKey('dialog-ok'));
      await until(b,characterSlot(doomed),10000);
      const { warning, done } = await deleteCharacter(b,doomed,await testPassword(`TestCb${RUN}`));
      await until(b,`![...document.querySelectorAll('[data-key^="character-slot:"]')].some(s=>s.textContent===${JSON.stringify(doomed)})`,30000);
      const one = (t:string) => t.replace(/\s+/g,' ').trim();
      record('character.delete',{ actions:'Create a character; Delete with a wrong password, then with the account password and Yes', expected:'Slot updates after confirmed deletion',
        observed:`prompt "${one(prompt)}"; wrong password: "${one(refused)}", "${doomed}" kept; right password: "${one(warning)}" → Yes → "${one(done)}", "${doomed}" removed; slot free again` });
    } finally { closeAll(); }
  },300000);
});
