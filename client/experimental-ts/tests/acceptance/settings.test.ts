import { describe, expect, it } from 'vitest';
import { AUDIO_SLOTS } from '../../src/features/audio';
import { exitDeckEditor } from './harness';
import { resultShown } from './harness';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, sleep, screenshot, record, byKey, reenterWorld, startNpcDuel, duelBot, surrender, type, claimStarter, claimNpcReward, type Page, createCharacter, freeSlot, lobbyShown, titleButton } from './harness';

/** The deck screen's trunk (main's CWindowModelKaban, deck-dom.ts): passcode=name of its first cards. */
const collectionNames = (page:Page) => page.ev(`[...document.querySelectorAll('[data-zone="trunk"][data-passcode]')].slice(0,40).map(b=>b.dataset.passcode+'='+b.getAttribute('aria-label'))`) as Promise<string[]>;
const stored = (page:Page) => page.ev(`JSON.parse(localStorage.getItem('de-client-settings-v1')??'{}')`) as Promise<Record<string,unknown>>;
async function key(page:Page,key:string,code = key,keyCode = 0) {
  await page.send('Input.dispatchKeyEvent',{ type:'keyDown',key,code,windowsVirtualKeyCode:keyCode });
  await page.send('Input.dispatchKeyEvent',{ type:'keyUp',key,code,windowsVirtualKeyCode:keyCode });
}
/** A Main Menu entry by its key (its label follows the chosen language): MAIN opens the menu, as a player would. */
async function menuEntry(page:Page,key:string) {
  await until(page,`${byKey('main-menu')}||${byKey(`menu:${key}`)}`,30000);
  if (!(await page.ev(`Boolean(${byKey(`menu:${key}`)})`))) await press(page,byKey('main-menu'));
  await until(page,`${byKey(`menu:${key}`)}&&!${byKey(`menu:${key}`)}.disabled`,30000); await press(page,byKey(`menu:${key}`));
}
async function openDeck(page:Page) { await menuEntry(page,'deck'); await until(page,`document.querySelectorAll('[data-zone="trunk"][data-passcode]').length>0`,60000); await sleep(400); }
/** Edit Deck, the trunk's first card names, EXIT back to the lobby (main's deck screen leaves through its EXIT). */
async function trunkNames(page:Page) { await openDeck(page); const names = await collectionNames(page); await exitDeckEditor(page); return names; }
/** DUEL OPTIONS (htmlui/options.ts, live's CWindowModelDuelConfig) from the Main Menu. */
async function duelOptions(page:Page) { await menuEntry(page,'settings'); await until(page,byKey('duel-config-ok'),30000); }
const LANGUAGES = ['日本語','English','Deutsch','Français','Italiano','Español','한국어'];
/** The title's OPTIONS (htmlui/options.ts titleOptionsWindow, live's COptionDlg): Language, Screen and Volume rows. */
const optionsShown = byKey('opt-ok');
const langShown = `${byKey('opt-lang')}?.textContent.trim()`;
const langReady = `(${byKey('opt-lang-next')}&&!${byKey('opt-lang-next')}.disabled)`;
/** main's error dialog over OPTIONS: a language whose tables could not load. */
const langError = byKey('language-error-ok');
const soundShown = `${byKey('opt-sound-level')}?.textContent.trim()`;
/** Back on the title (Main Menu: Return to Title, its key: the label follows the language; Yes to 'Disconnect from the
 * game?', as a player would) and its OPTIONS open. */
async function titleOptions(page:Page) {
  await until(page,`${titleButton('options')}||${optionsShown}||${byKey('main-menu')}`,60000);
  if (!(await page.ev(`Boolean(${titleButton('options')}||${optionsShown})`)) && await page.ev(`Boolean(${byKey('main-menu')})`)) {
    await menuEntry(page,'title'); await until(page,byKey('disconnect-yes'),30000); await press(page,byKey('disconnect-yes'));
  }
  if (!(await page.ev(`Boolean(${optionsShown})`))) { await until(page,titleButton('options'),60000); await press(page,titleButton('options')); }
  await until(page,optionsShown,30000);
}
/** OPTIONS' < / > to a language, a step at a time as live's row goes (each waits for that language's tables, or the refusal). */
async function chooseIn(page:Page,name:string) {
  for (let step = 0; step < LANGUAGES.length; step++) {
    await until(page,`${langReady}||${langError}`,90000);
    const current = await page.ev(langShown) as string;
    if (current === name || await page.ev(`Boolean(${langError})`)) return;
    const from = LANGUAGES.indexOf(current), to = LANGUAGES.indexOf(name), forward = (to - from + LANGUAGES.length) % LANGUAGES.length <= LANGUAGES.length / 2;
    await press(page,byKey(forward ? 'opt-lang-next' : 'opt-lang-prev'));
    await until(page,`${langShown}!==${JSON.stringify(current)}||${langError}`,90000);
  }
  await until(page,`(${langShown}===${JSON.stringify(name)}&&${langReady})||${langError}`,90000);
}
/** OPTIONS' OK, then online again into the world. */
async function leaveOptions(page:Page,me:string) { await press(page,optionsShown); await until(page,`!${optionsShown}`,10000); await reenterWorld(page,me); }
async function choose(page:Page,name:string,me:string) { await titleOptions(page); await chooseIn(page,name); await leaveOptions(page,me); }
/** The Main Menu's entry labels (main's CMainMenu), opened and closed again. */
async function menuLabels(page:Page) {
  await press(page,byKey('main-menu')); await until(page,byKey('menu:deck'),10000);
  const labels = await page.ev(`[...document.querySelectorAll('[data-key^="menu:"]')].map(b=>b.textContent.trim())`) as string[];
  await press(page,byKey('main-menu-close')); await until(page,`!${byKey('menu:deck')}`,10000);
  return labels;
}

/** Observes the client's Web Audio and media use without changing it: contexts, effect voices and the output gain
 * (the context's first gain node; a cue's own level from Sound.dat is a gain under it), decodes,
 * media elements and what they play (by the File name behind each object URL). */
const AUDIO_PROBE = `(()=>{const A=window.__audio={contexts:[],starts:[],active:0,maxActive:0,decoded:0,media:[],plays:[],names:new Map()};
const C=window.AudioContext;window.AudioContext=class extends C{constructor(...a){super(...a);A.contexts.push(this);const cg=this.createGain.bind(this);this.createGain=()=>{const g=cg();if(!this.__out){this.__out=g;A.gain=g;}return g;};
const cb=this.createBufferSource.bind(this);this.createBufferSource=()=>{const s=cb();const st=s.start.bind(s);s.start=(...x)=>{A.starts.push({at:Math.round(performance.now()),gain:A.gain?.gain.value,dur:s.buffer?.duration});A.active++;A.maxActive=Math.max(A.maxActive,A.active);s.addEventListener('ended',()=>A.active--);return st(...x);};return s;};
const d=this.decodeAudioData.bind(this);this.decodeAudioData=(b,...r)=>{A.decoded++;return d(b,...r);};}};
const Au=window.Audio;window.Audio=function(...a){const m=new Au(...a);A.media.push(m);return m;};window.Audio.prototype=Au.prototype;
const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const e={name:A.names.get(this.src),volume:this.volume,at:Math.round(performance.now()),activation:navigator.userActivation?.isActive};A.plays.push(e);const r=play.call(this);r.catch(x=>{e.error=x.name+': '+x.message;});return r;};
const cou=URL.createObjectURL;URL.createObjectURL=function(b){const u=cou.call(URL,b);if(b&&b.name)A.names.set(u,b.name);return u;};})()`;
/** What background audio is playing now: the File names of unpaused media elements. */
const playing = (page:Page) => page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)+'@'+m.volume.toFixed(2))`) as Promise<string[]>;
/** Loose audio files named after the game's parts (features/audio.ts AUDIO_SLOTS ids), short silent PCM WAVs made in the
 * page, dropped on the game as a player drops them: live's Audio page (recomp/web/audiopage.js) takes them anywhere,
 * opens and reviews them as a pack, and Use this pack sets them. */
async function dropAudio(page:Page,names:string[],seconds:number) {
  await page.ev(`(()=>{const wav=s=>{const rate=8000,n=rate*s,b=new DataView(new ArrayBuffer(44+n*2)),w=(o,t)=>{for(let i=0;i<t.length;i++)b.setUint8(o+i,t.charCodeAt(i));};
    w(0,'RIFF');b.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');b.setUint32(16,16,true);b.setUint16(20,1,true);b.setUint16(22,1,true);b.setUint32(24,rate,true);b.setUint32(28,rate*2,true);b.setUint16(32,2,true);b.setUint16(34,16,true);w(36,'data');b.setUint32(40,n*2,true);return b.buffer;};
    const dt=new DataTransfer();for(const name of ${JSON.stringify(names)})dt.items.add(new File([wav(${seconds})],name,{type:'audio/wav'}));
    document.body.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`);
  const use = `[...document.querySelectorAll('#rc-audio button')].find(b=>b.textContent==='Use this pack')`;
  await until(page,use,30000); await press(page,use);
  const ok = `[...document.querySelectorAll('#rc-audio .foot button')].find(b=>b.textContent==='OK')`;
  await until(page,`${ok}&&/Plays in ${names.length} of/.test(document.querySelector('#rc-audio').innerText)`,30000);
}
/** The Audio page's Volume (the background audio level), 0..100. */
const audioVolume = `document.querySelector('#rc-audio input[type=range][aria-label="Volume"]')`;
async function closeAudio(page:Page) { await press(page,`[...document.querySelectorAll('#rc-audio .foot button')].find(b=>b.textContent==='OK')`); await until(page,`!document.querySelector('#rc-audio')`,10000); }
/** OPTIONS' Volume (the sound effects level) down to nothing, a step at a time. */
async function muteEffects(page:Page) {
  for (let i = 0; i < 12 && await page.ev(soundShown) !== '0%'; i++) { const was = await page.ev(soundShown); await press(page,byKey('opt-sound-down')); await until(page,`${soundShown}!==${JSON.stringify(was)}`,5000); }
}

describe.skipIf(!enabled)('Options: language, display, persistence and accessibility',() => {
  it('switches game-text language from the original tables, recovers from refusals and keeps choices across reload',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestSe${RUN}`));
      const me = `Set ${RUN}`; await enterWorld(page,me);
      // settings.language-screen: the title's OPTIONS (live's COptionDlg) Language row (< name >) over the original's
      // seven languages; card and pack names, DUEL OPTIONS' help and main's labels (their yo2text ids) follow the choice.
      const english = await trunkNames(page), englishMenu = await menuLabels(page);
      await duelOptions(page);
      const englishOptions = await page.ev(`${byKey('duel-config-ok')}.closest('.win').innerText`) as string;
      await press(page,byKey('duel-config-cancel')); await until(page,`!${byKey('duel-config-ok')}`,10000);
      await titleOptions(page);
      expect(await page.ev(langShown)).toBe('English');
      await chooseIn(page,'Deutsch');
      expect(await page.ev(`Boolean(${langError})`)).toBe(false);
      await screenshot(page,'settings-language-de');
      await leaveOptions(page,me);
      await duelOptions(page);
      const germanOptions = await page.ev(`${byKey('duel-config-ok')}.closest('.win').innerText`) as string;
      expect(germanOptions).not.toBe(englishOptions);
      await press(page,byKey('duel-config-cancel')); await until(page,`!${byKey('duel-config-ok')}`,10000);
      const germanMenu = await menuLabels(page);
      const menuChanged = germanMenu.filter((g,i) => g !== englishMenu[i]).length;
      expect(germanMenu.length).toBe(englishMenu.length);
      expect(menuChanged).toBeGreaterThanOrEqual(3);
      const german = await trunkNames(page);
      const changed = german.filter((g,i) => g !== english[i]).length;
      expect(german.length).toBe(english.length);
      expect(changed).toBeGreaterThan(english.length / 2);
      // Japanese: a different script and code page (< twice, through English).
      await choose(page,'日本語',me);
      const japanese = await trunkNames(page), japaneseMenu = await menuLabels(page);
      expect(japanese.some(n => /[぀-ヿ一-鿿]/.test(n))).toBe(true);
      expect(japaneseMenu.some(n => /[぀-ヿ一-鿿]/.test(n))).toBe(true);
      await screenshot(page,'settings-language-ja-deck');
      // Refused data: the archive is unreachable while choosing French: main's error dialog says so, Deutsch stays and
      // the choice can be made again.
      await titleOptions(page); await chooseIn(page,'Deutsch');
      await page.send('Network.setBlockedURLs',{ urls:['*/game-assets/*'] });
      await chooseIn(page,'Français');
      await until(page,langError,60000);
      const refusal = await page.ev(`${langError}.closest('.win').innerText`) as string;
      expect(refusal).toMatch(/Français|French/);
      await screenshot(page,'settings-language-refused');
      expect(await page.ev(langShown)).toBe('Deutsch');
      await page.send('Network.setBlockedURLs',{ urls:[] });
      await press(page,langError); await until(page,`!${langError}`,10000);
      await chooseIn(page,'Français');
      expect(await page.ev(`Boolean(${langError})`)).toBe(false);
      // Screen: Full screen refused once leaves the window as it was; a later press enters fullscreen and Window leaves it.
      await page.ev(`(()=>{const real=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(){Element.prototype.requestFullscreen=real;return Promise.reject(new TypeError('Permissions check failed'));};})()`);
      await press(page,byKey('opt-fullscreen')); await sleep(500);
      const refusedFullscreen = await page.ev(`document.fullscreenElement===null&&!${byKey('opt-fullscreen')}.disabled`) as boolean;
      expect(refusedFullscreen).toBe(true);
      await press(page,byKey('opt-fullscreen'));
      await until(page,`document.fullscreenElement!==null&&${byKey('opt-windowed')}&&!${byKey('opt-windowed')}.disabled`,15000);
      await screenshot(page,'settings-fullscreen');
      await press(page,byKey('opt-windowed'));
      await until(page,`document.fullscreenElement===null&&!${byKey('opt-fullscreen')}.disabled`,15000);
      await leaveOptions(page,me);
      const french = await trunkNames(page);
      expect(french.filter((f,i) => f !== english[i] && f !== german[i]).length).toBeGreaterThan(english.length / 3);
      record('settings.language-screen',{ actions:'Title OPTIONS Language row: Deutsch (DUEL OPTIONS window text follows); Main Menu and deck screen; 日本語; Deutsch; Français with the archive blocked, then again; Screen row: Full screen refused once, then enter and Window',
        expected:'The original seven languages; card text and main\'s labels switch from that language\'s tables; a refused load says so and keeps the old language; a refused fullscreen leaves the window as it was',
        observed:`first collection card "${english[0]}" → de "${german[0]}" (${changed}/${english.length} changed) → ja "${japanese[0]}" → fr "${french[0]}"; Main Menu ${englishMenu.join('/')} → de ${germanMenu.join('/')} (${menuChanged} changed) → ja ${japaneseMenu.join('/')}; blocked: error dialog "${refusal.replace(/\s+/g,' ').slice(0,160)}" with Deutsch still shown, retry chose Français; fullscreen refused (still windowed), then entered and left` });

      // settings.persist: the effects volume (OPTIONS' Volume) and the language, then a reload restores both.
      await titleOptions(page);
      const before = await page.ev(soundShown) as string;
      await press(page,byKey(before === '100%' ? 'opt-sound-down' : 'opt-sound-up')); await until(page,`${soundShown}!==${JSON.stringify(before)}`,5000);
      const sound = await page.ev(soundShown) as string;
      await press(page,optionsShown); await until(page,`!${optionsShown}`,10000);
      const saved = await stored(page);
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await titleOptions(page);
      await until(page,`${langShown}==='Français'`,90000);
      const restored = { sound:await page.ev(soundShown), language:await page.ev(langShown) };
      expect(restored).toEqual({ sound,language:'Français' });
      expect(saved).toMatchObject({ language:'F',sound:Number(sound.replace('%','')) / 100 });
      await screenshot(page,'settings-restored');
      record('settings.persist',{ actions:'Title OPTIONS: Volume + (Français chosen before), OK; reload the page',
        expected:'The volume and language restore after reload',
        observed:`saved sound ${saved.sound}, language ${saved.language}; after reload OPTIONS shows Volume ${restored.sound}, Language ${restored.language}` });

      // settings.accessibility: Escape closes the topmost modal (OPTIONS on the title, DUEL OPTIONS over the lobby, the
      // player's own profile card, the deck screen's LOAD DECK file list) before leaving a screen.
      await page.ev(`document.activeElement?.blur()`);
      await key(page,'Escape','Escape',27); await until(page,`!${optionsShown}&&${titleButton('options')}`,10000);
      await reenterWorld(page,me);
      await duelOptions(page);
      await key(page,'Escape','Escape',27);
      await until(page,`!${byKey('duel-config-ok')}&&${lobbyShown}`,30000);
      await menuEntry(page,'profile');
      const profile = `document.querySelector('[data-key="profile-ok"]')`;   // main's Profile window
      await until(page,profile,20000);
      await page.ev(`document.activeElement?.blur()`);
      await key(page,'Escape','Escape',27);
      await until(page,`!${profile}`,15000);
      // main's deck screen: a pressed trunk card shows in its card detail ([data-detail]); Escape closes the screen's
      // topmost window (LOAD DECK's file list) before leaving the screen.
      await openDeck(page);
      const trunkCard = `document.querySelector('[data-zone="trunk"][data-passcode]')`;
      const pressedCard = await page.ev(`${trunkCard}.getAttribute('aria-label')`) as string;
      await press(page,trunkCard);
      await until(page,`document.querySelector('[data-detail]')?.getAttribute('aria-label')===${JSON.stringify(pressedCard)}`,10000);
      const inspected = await page.ev(`document.querySelector('[data-detail]').getAttribute('aria-label')`);
      await press(page,byKey('deck-load-deck'));
      const fileList = byKey('deck-files-cancel');
      await until(page,fileList,10000);
      await page.ev(`document.activeElement?.blur()`);
      await key(page,'Escape','Escape',27);
      await until(page,`!${fileList}`,10000);
      expect(await page.ev(`document.querySelector('.de-client').dataset.scene`)).toBe('deck');
      await key(page,'Escape','Escape',27); await until(page,lobbyShown,30000);
      // Readable feedback: an error is announced as an alert.
      const alerts = await page.ev(`[...document.querySelectorAll('[role=alert],[role=status]')].length`) as number;
      expect(alerts).toBeGreaterThan(0);
      record('settings.accessibility',{ actions:'Escape in the title\'s OPTIONS, DUEL OPTIONS, the profile card and the deck screen\'s LOAD DECK file list',
        expected:'Escape closes the topmost modal then the screen; feedback is announced',
        observed:`Escape: OPTIONS closed on the title, DUEL OPTIONS closed over the lobby, own profile card closed (focus outside it), trunk card "${inspected}" shown in the deck detail, LOAD DECK's file list closed by Escape (still in the deck screen), second Escape → lobby; ${alerts} live regions` });
    } finally { closeAll(); }
  },600000);
  it('unlocks audio on the first gesture, follows scenes without overlap, plays duel cues at the set volume and keeps mute',async () => {
    try {
      const slots = [0,1,3,5,6,10,...Array.from({ length:8 },(_,i) => 11 + i),26,27,28,...Array.from({ length:16 },(_,i) => 30 + i)];
      const file = (slot:number) => `${AUDIO_SLOTS[slot]!.id}.wav`;
      const page = await openPage(); await page.send('Page.enable');
      await page.send('Page.addScriptToEvaluateOnNewDocument',{ source:AUDIO_PROBE });
      await openClient(page,await signIn(`TestAu${RUN}`),{ settings:{ sound:0.8,music:0.6,reducedMotion:false } });
      // No audio before a gesture.
      await sleep(1500);
      const beforeGesture = await page.ev(`({contexts:window.__audio.contexts.length,plays:window.__audio.plays.length})`) as { contexts:number; plays:number };
      expect(beforeGesture).toEqual({ contexts:0,plays:0 });
      // the first press on the game unlocks audio
      await page.send('Input.dispatchMouseEvent',{ type:'mousePressed',x:4,y:4,button:'left',clickCount:1 }); await page.send('Input.dispatchMouseEvent',{ type:'mouseReleased',x:4,y:4,button:'left',clickCount:1 });
      await until(page,`window.__audio.contexts.length===1&&window.__audio.contexts[0].state==='running'`,10000);
      // local files for the scene parts, dropped on the title (live's Audio page opens for them)
      await dropAudio(page,slots.map(file),20);
      await closeAudio(page);
      await until(page,`window.__audio.media.some(m=>!m.paused&&window.__audio.names.get(m.src)==='title.wav')`,15000);
      const title = await playing(page);
      // Scene transitions: characters, lobby, deck editor, lobby — one background track at a time.
      const timeline:string[] = [`title:${title.join(',')}`]; let maxPlaying = title.length;
      const sample = async (label:string,expect_:string) => {
        await until(page,`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()===${JSON.stringify(expect_)}`,20000);
        const now = await playing(page); maxPlaying = Math.max(maxPlaying,now.length); timeline.push(`${label}:${now.join(',')}`);
      };
      await click(page,'Go Online',60000); await until(page,freeSlot,60000);
      await sample('characters','login.wav');
      const me = `Audio ${RUN}`;
      await createCharacter(page,me,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes('Audio ${RUN}')&&!b.disabled)`;
      await until(page,slot,30000); await press(page,slot); await until(page,lobbyShown,60000); await claimStarter(page);
      const area = await page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()`) as string;
      await sample('lobby',area === 'gx_area.wav' ? 'gx_area.wav' : 'yugi_area.wav');
      await openDeck(page); await sample('deck','deck_editor.wav');
      await exitDeckEditor(page); await sample('lobby',area);
      // A duel: rock-paper-scissors slot, then a duel slot; effects from Sound.dat at the sound volume.
      const startsBefore = await page.ev(`window.__audio.starts.length`) as number;
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>0`,60000);
      const duelTrack = await page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()`) as string;
      timeline.push(`duel:${duelTrack}`);
      expect(duelTrack).toMatch(/^(duel_\d|field_[a-z_]+|janken)\.wav$/);
      const janken = await page.ev(`window.__audio.plays.some(p=>p.name==='janken.wav')`);
      for (let i = 0; i < 400 && (await page.ev(`window.__audio.starts.length`) as number) < startsBefore + 3; i++) { if (await duelBot(page) === 'finished') break; await sleep(150); }
      const cues = await page.ev(`window.__audio.starts.slice(${startsBefore})`) as { gain:number; dur:number }[];
      expect(cues.length).toBeGreaterThan(0);
      expect(cues.filter(c => !(Math.abs(c.gain - 0.8) < 0.01 && c.dur > 0))).toEqual([]);
      const decodes = await page.ev(`window.__audio.decoded`) as number;
      // Surrender: the result slot; back in the lobby the area track returns and nothing is left playing.
      if (!(await page.ev(resultShown))) await surrender(page);
      await until(page,`window.__duelEnd()`,30000);
      const result = await page.ev(`window.__duelEnd()`) as string;
      const resultTrack = result === 'Victory' ? 'duel_win.wav' : result === 'Draw' ? 'duel_draw.wav' : 'duel_lose.wav';
      await until(page,`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()===${JSON.stringify(resultTrack)}`,20000);
      timeline.push(`${result}:${(await playing(page)).join(',')}`);
      await claimNpcReward(page);
      await sample('lobby',area);
      const stuck = await page.ev(`window.__audio.active`) as number;
      expect(stuck).toBe(0);
      expect(maxPlaying).toBe(1);
      const peakVoices = await page.ev(`window.__audio.maxActive`) as number;
      expect(peakVoices).toBeLessThanOrEqual(16);
      // Mute effects in the title's OPTIONS (live's only effects volume): the output gain goes to 0, the background
      // track keeps its own level.
      await titleOptions(page); await muteEffects(page);
      await until(page,`window.__audio.gain.gain.value===0`,5000);
      const background = await playing(page);
      await press(page,optionsShown); await until(page,`!${optionsShown}`,10000);
      // Persistence: reload. Mute, the background volume and the dropped files return; the title track resumes at its
      // level after a gesture.
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await titleOptions(page);
      const mutedShown = await page.ev(soundShown) as string;
      await press(page,optionsShown); await until(page,`!${optionsShown}`,10000);
      await reenterWorld(page,me);
      await menuEntry(page,'audio'); await until(page,audioVolume,30000);
      await until(page,`/Plays in ${slots.length} of/.test(document.querySelector('#rc-audio').innerText)`,15000);
      const reloaded = { sound:mutedShown,background:Number(await page.ev(`${audioVolume}.value`)) };
      expect(reloaded).toEqual({ sound:'0%',background:60 });
      await screenshot(page,'audio-options');
      await closeAudio(page);
      const afterReload = await playing(page);
      expect(afterReload).toEqual([`${area}@0.60`]);
      record('audio.volume',{ actions:'Sound effects 80% and background audio 60% with local files per scene dropped on the game (live\'s Audio page); duel cues from Sound.dat; effects muted in the title\'s OPTIONS; reload',
        expected:'Levels and mute persist and affect their own playback',
        observed:`${cues.length} duel cues at gain ${cues[0]?.gain} (${decodes} effects decoded from Sound.dat); background ${background.join(',')} while effects muted (gain 0); after reload: OPTIONS Volume ${reloaded.sound}, Audio page Volume ${reloaded.background}, files kept, playing ${afterReload.join(',')}` });
      record('audio.lifecycle',{ actions:'Open the client (no gesture), first press, title → characters → lobby → deck editor → lobby → NPC duel (RPS, duel, result) → lobby',
        expected:'Audio starts only after a gesture; each scene switches its track; duel cues end; nothing overlaps or stays stuck',
        observed:`before gesture: ${beforeGesture.contexts} contexts, ${beforeGesture.plays} plays; after the first press: context running; tracks ${timeline.join(' → ')}; janken played ${janken}; at most ${maxPlaying} background track at once, peak ${peakVoices} effect voices, ${stuck} voices left after the duel` });
    } finally { closeAll(); }
  },600000);
});
