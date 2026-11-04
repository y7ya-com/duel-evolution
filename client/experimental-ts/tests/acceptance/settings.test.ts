import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN, CLIENT, enabled, openPage, closeAll, signIn, openClient, enterWorld, click, until, press, sleep, screenshot, record, byKey, reenterWorld, startNpcDuel, duelBot, surrender, type, claimStarter, claimNpcReward, type Page, createCharacter, freeSlot } from './harness';

const pressed = (code:string) => `document.querySelector('[data-key="language:${code}"]')?.getAttribute('aria-pressed')==='true'`;
const collectionNames = (page:Page) => page.ev(`[...document.querySelectorAll('[data-key^="collection-card:"]')].slice(0,40).map(b=>b.dataset.key.slice(16)+'='+b.title.split(' · ')[0])`) as Promise<string[]>;
/** A shop pack's name and description (the original English names are "Pack n"; descriptions carry the wording). */
const shopNames = (page:Page) => page.ev(`[...document.querySelectorAll('.de-shop-item')].slice(0,12).map(a=>a.querySelector('h3').textContent+': '+([...a.querySelectorAll('p')].map(p=>p.textContent).join(' ').trim()))`) as Promise<string[]>;
const stored = (page:Page) => page.ev(`JSON.parse(localStorage.getItem('de-client-settings-v1')??'{}')`) as Promise<Record<string,unknown>>;
async function key(page:Page,key:string,code = key,keyCode = 0) {
  await page.send('Input.dispatchKeyEvent',{ type:'keyDown',key,code,windowsVirtualKeyCode:keyCode });
  await page.send('Input.dispatchKeyEvent',{ type:'keyUp',key,code,windowsVirtualKeyCode:keyCode });
}
async function openDeck(page:Page) { await click(page,'Edit Deck'); await until(page,`document.querySelectorAll('[data-key^="collection-card:"]').length>0`,60000); await sleep(400); }
async function openShop(page:Page) { await click(page,'Shop'); await until(page,`document.querySelectorAll('.de-shop-item h3').length>0`,60000); await sleep(800); }
async function choose(page:Page,code:string) {
  await click(page,'Options'); await until(page,byKey(`language:${code}`),30000);
  await press(page,byKey(`language:${code}`));
}

/** Observes the client's Web Audio and media use without changing it: contexts, effect voices and their gain, decodes,
 * media elements and what they play (by the File name behind each object URL). */
const AUDIO_PROBE = `(()=>{const A=window.__audio={contexts:[],starts:[],active:0,maxActive:0,decoded:0,media:[],plays:[],names:new Map()};
const C=window.AudioContext;window.AudioContext=class extends C{constructor(...a){super(...a);A.contexts.push(this);const cg=this.createGain.bind(this);this.createGain=()=>{const g=cg();A.gain=g;return g;};
const cb=this.createBufferSource.bind(this);this.createBufferSource=()=>{const s=cb();const st=s.start.bind(s);s.start=(...x)=>{A.starts.push({at:Math.round(performance.now()),gain:A.gain?.gain.value,dur:s.buffer?.duration});A.active++;A.maxActive=Math.max(A.maxActive,A.active);s.addEventListener('ended',()=>A.active--);return st(...x);};return s;};
const d=this.decodeAudioData.bind(this);this.decodeAudioData=(b,...r)=>{A.decoded++;return d(b,...r);};}};
const Au=window.Audio;window.Audio=function(...a){const m=new Au(...a);A.media.push(m);return m;};window.Audio.prototype=Au.prototype;
const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const e={name:A.names.get(this.src),volume:this.volume,at:Math.round(performance.now()),activation:navigator.userActivation?.isActive};A.plays.push(e);const r=play.call(this);r.catch(x=>{e.error=x.name+': '+x.message;});return r;};
const cou=URL.createObjectURL;URL.createObjectURL=function(b){const u=cou.call(URL,b);if(b&&b.name)A.names.set(u,b.name);return u;};})()`;
/** What background audio is playing now: the File names of unpaused media elements. */
const playing = (page:Page) => page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)+'@'+m.volume.toFixed(2))`) as Promise<string[]>;
/** A short silent PCM WAV per scene slot, made here (the project ships no audio). */
function silentWav(path:string,seconds:number) {
  const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF',0); b.writeUInt32LE(36 + n * 2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(rate,24); b.writeUInt32LE(rate * 2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n * 2,40);
  writeFileSync(path,b); return path;
}
async function assignSlot(page:Page,slot:number,file:string) {
  const shown = `[...document.querySelectorAll('[aria-label="Audio settings"] fieldset')][${slot}]?.textContent.includes(${JSON.stringify(file.split('/').pop())})`;
  // Options re-renders as the audio choices save; a file set on a replaced input is chosen again.
  for (let attempt = 0; attempt < 5 && !(await page.ev(`Boolean(${shown})`)); attempt++) {
    const doc = (await page.send('DOM.getDocument',{ depth:0 })).result.root.nodeId;
    const node = (await page.send('DOM.querySelector',{ nodeId:doc,selector:`[aria-label="Audio settings"] fieldset:nth-of-type(${slot + 1}) input[type=file]` })).result?.nodeId;
    if (node) await page.send('DOM.setFileInputFiles',{ nodeId:node,files:[file] });
    for (let i = 0; i < 20 && !(await page.ev(`Boolean(${shown})`)); i++) await sleep(100);
  }
  await until(page,shown,5000);
}

describe.skipIf(!enabled)('Options: language, display, persistence and accessibility',() => {
  it('switches game-text language from the original tables, recovers from refusals and keeps choices across reload',async () => {
    try {
      const page = await openPage(); await openClient(page,await signIn(`TestSe${RUN}`));
      await enterWorld(page,`Set ${RUN}`);
      // settings.language-screen: the original Options' seven languages; English card and pack names first.
      await openDeck(page); const english = await collectionNames(page);
      await openShop(page); const englishPacks = await shopNames(page);
      await click(page,'Options'); await until(page,byKey('options-language'),30000);
      const offered = await page.ev(`[...document.querySelectorAll('[data-key^="language:"]')].map(b=>b.textContent)`) as string[];
      expect(offered).toEqual(['日本語','English','Deutsch','Français','Italiano','Español','한국어']);
      expect(await page.ev(pressed('E'))).toBe(true);
      await press(page,byKey('language:G'));
      await until(page,pressed('G'),90000);
      expect(await page.ev(`document.querySelector('[data-key="options-language"] .de-error')`)).toBe(null);
      await screenshot(page,'settings-language-de');
      await openDeck(page); const german = await collectionNames(page);
      const changed = german.filter((g,i) => g !== english[i]).length;
      expect(german.length).toBe(english.length);
      expect(changed).toBeGreaterThan(english.length / 2);
      await openShop(page); const germanPacks = await shopNames(page);
      expect(germanPacks.filter((p,i) => p !== englishPacks[i]).length,JSON.stringify([englishPacks,germanPacks])).toBeGreaterThan(0);
      // Japanese: a different script and code page.
      await choose(page,'J'); await until(page,pressed('J'),90000);
      await openDeck(page); const japanese = await collectionNames(page);
      expect(japanese.some(n => /[぀-ヿ一-鿿]/.test(n))).toBe(true);
      await openShop(page); const japanesePacks = await shopNames(page);
      expect(japanesePacks.some(n => /[぀-ヿ一-鿿＀-￯]/.test(n))).toBe(true);
      await screenshot(page,'settings-language-ja-shop');
      await choose(page,'G'); await until(page,pressed('G'),90000);
      // Refused data: the archive is unreachable while choosing French; German stays and the choice can be retried.
      await page.send('Network.setBlockedURLs',{ urls:['*/game-assets/*'] });
      await choose(page,'F');
      await until(page,`document.querySelector('[data-key="options-language"] .de-error')`,60000);
      const refusal = await page.ev(`document.querySelector('[data-key="options-language"] .de-error').textContent`) as string;
      expect(await page.ev(pressed('G'))).toBe(true);
      await page.send('Network.setBlockedURLs',{ urls:[] });
      await press(page,byKey('language:F')); await until(page,pressed('F'),90000);
      expect(await page.ev(`document.querySelector('[data-key="options-language"] .de-error')`)).toBe(null);
      await openDeck(page); const french = await collectionNames(page);
      expect(french.filter((f,i) => f !== english[i] && f !== german[i]).length).toBeGreaterThan(english.length / 3);

      // Fullscreen: a refused request explains itself and a later click enters and leaves fullscreen.
      await click(page,'Options'); await until(page,byKey('browser-fullscreen-toggle'),30000);
      await page.ev(`(()=>{const real=Element.prototype.requestFullscreen;window.__realFs=real;Element.prototype.requestFullscreen=function(){Element.prototype.requestFullscreen=real;return Promise.reject(new TypeError('Permissions check failed'));};})()`);
      await press(page,byKey('browser-fullscreen-toggle'));
      await until(page,`[...document.querySelectorAll('.de-settings-row [role=alert]')].some(n=>/refused/i.test(n.textContent))`,15000);
      const fullscreenRefusal = await page.ev(`[...document.querySelectorAll('.de-settings-row [role=alert]')].find(n=>/refused/i.test(n.textContent)).textContent`) as string;
      await press(page,byKey('browser-fullscreen-toggle'));
      await until(page,`document.fullscreenElement!==null&&document.querySelector('[data-key="browser-fullscreen-toggle"]').textContent==='Exit Fullscreen'`,15000);
      await screenshot(page,'settings-fullscreen');
      await press(page,byKey('browser-fullscreen-toggle'));
      await until(page,`document.fullscreenElement===null&&document.querySelector('[data-key="browser-fullscreen-toggle"]').textContent==='Enter Fullscreen'`,15000);
      record('settings.language-screen',{ actions:'Options: list languages; Deutsch; deck editor and shop; 日本語; Deutsch; Français with the archive blocked, then again; fullscreen refused once, then enter and exit',
        expected:'The original seven languages; card and pack text switch from that language\'s tables; a refused load or fullscreen keeps the old state with a retryable message',
        observed:`offered ${offered.join('/')}; first collection card "${english[0]}" → de "${german[0]}" (${changed}/${english.length} changed) → ja "${japanese[0]}" → fr "${french[0]}"; packs "${englishPacks[0]}" → de "${germanPacks[0]}" → ja "${japanesePacks[0]}"; blocked: "${refusal.slice(0,140)}" with Deutsch still selected, retry selected Français; fullscreen refusal "${fullscreenRefusal}", then document.fullscreenElement set and cleared` });

      // settings.persist: volumes and toggles through the controls, then a reload restores all of them.
      await click(page,'Options'); await until(page,byKey('options-language'),30000);
      const slider = `document.querySelector('input[type=range][aria-label="Sound effects"]')`;
      const before = await page.ev(`${slider}.value`);
      await press(page,slider);
      for (let i = 0; i < 3; i++) { await key(page,'ArrowRight','ArrowRight',39); await sleep(100); }
      await page.ev(`${slider}.dispatchEvent(new Event('change',{bubbles:true}))`);
      await until(page,`Number(${slider}.value)!==${Number(before)}`,5000);
      const sound = Number(await page.ev(`${slider}.value`));
      const toggle = (label:string) => `[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input')`;
      const motionBefore = await page.ev(`${toggle('Reduce animation')}.checked`) as boolean;
      await press(page,toggle('Reduce animation')); await until(page,`${toggle('Reduce animation')}.checked===${!motionBefore}`,5000);
      await press(page,toggle('Show card names')); await until(page,`${toggle('Show card names')}.checked===false`,5000);
      const saved = await stored(page);
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await click(page,'Options',60000); await until(page,byKey('options-language'),30000);
      await until(page,pressed('F'),90000);
      const restored = { sound:Number(await page.ev(`${slider}.value`)), motion:await page.ev(`${toggle('Reduce animation')}.checked`), names:await page.ev(`${toggle('Show card names')}.checked`), motionAttr:await page.ev(`document.querySelector('.de-client').dataset.motion`) };
      expect(restored).toEqual({ sound,motion:!motionBefore,names:false,motionAttr:!motionBefore ? 'reduced' : 'full' });
      expect(saved).toMatchObject({ language:'F',sound,showCardNames:false,reducedMotion:!motionBefore });
      await screenshot(page,'settings-restored');
      record('settings.persist',{ actions:'Options: Sound effects slider with arrow keys, toggle Reduce animation and Show card names (Français chosen before); reload the page',
        expected:'Display/input preferences restore after reload',
        observed:`saved sound ${saved.sound}, reducedMotion ${saved.reducedMotion}, showCardNames ${saved.showCardNames}, language ${saved.language}; after reload: sound ${restored.sound}, reduce animation ${restored.motion} (host data-motion=${restored.motionAttr}), show card names ${restored.names}, Français pressed` });

      // settings.accessibility: keyboard focus through Options, Escape closes modals and leaves Options, reduced motion stops CSS motion.
      await press(page,toggle('Show card names')); await until(page,`${toggle('Show card names')}.checked===true`,5000);
      if (!(await page.ev(`${toggle('Reduce animation')}.checked`))) { await press(page,toggle('Reduce animation')); await until(page,`${toggle('Reduce animation')}.checked`,5000); }
      await page.ev(`document.activeElement?.blur()`);
      const focused:string[] = [];
      for (let i = 0; i < 40 && focused.length < 40; i++) {
        await key(page,'Tab','Tab',9);
        const f = await page.ev(`(()=>{const a=document.activeElement;if(!a||a===document.body)return '';const s=getComputedStyle(a);return (a.dataset.key??a.tagName)+'|'+(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)})()`) as string;
        if (f) focused.push(f);
      }
      const reached = (k:string) => focused.some(f => f.startsWith(k));
      expect(reached('language:J') && reached('language:K') && reached('browser-fullscreen-toggle')).toBe(true);
      expect(focused.filter(f => f.startsWith('language:')).every(f => f.endsWith('|true'))).toBe(true);
      // Reduced motion: no transition/animation on the client's own elements.
      const motion = await page.ev(`(()=>{const b=document.querySelector('[data-key="language:G"]');const s=getComputedStyle(b);return s.transitionDuration+'/'+s.animationName})()`) as string;
      expect(motion).toMatch(/^0s(, 0s)*\/none/);
      // Escape leaves Options (for the title after the reload), then the lobby once online again.
      await press(page,byKey('language:F')); await key(page,'Escape','Escape',27);
      await until(page,`document.querySelector('.de-client').dataset.scene==='title'`,30000);
      await reenterWorld(page,`Set ${RUN}`);
      await click(page,'Options'); await until(page,byKey('language:F'),30000);
      await press(page,byKey('language:F')); await key(page,'Escape','Escape',27);
      await until(page,byKey('lobby-npcs'),30000);
      // Escape closes the player's own profile card.
      await click(page,'My Profile');
      const profile = `document.querySelector('[data-key="profile-ok"]')`;   // main's Profile window
      await until(page,profile,20000);
      await page.ev(`document.activeElement?.blur()`);
      await key(page,'Escape','Escape',27);
      await until(page,`!${profile}`,15000);
      const profileClosed = 'own profile card closed by Escape (focus outside it)';
      // Escape closes the deck editor's card inspector before leaving the editor.
      await openDeck(page);
      await press(page,`document.querySelector('[data-key^="collection-card:"]')`);
      await until(page,`document.querySelector('.de-card-inspector h3')`,10000);
      const inspected = await page.ev(`document.querySelector('.de-card-inspector h3').textContent`);
      await key(page,'Escape','Escape',27);
      await until(page,`!document.querySelector('.de-card-inspector h3')`,10000);
      expect(await page.ev(`document.querySelector('.de-client').dataset.scene`)).toBe('deck');
      await key(page,'Escape','Escape',27); await until(page,byKey('lobby-npcs'),30000);
      // Readable feedback: an error is announced as an alert.
      const alerts = await page.ev(`[...document.querySelectorAll('[role=alert],[role=status]')].length`) as number;
      expect(alerts).toBeGreaterThan(0);
      record('settings.accessibility',{ actions:'Tab through Options with the keyboard; reduced motion on; Escape in Options, profile card and deck card inspector',
        expected:'Keyboard focus reaches every control with a visible outline; Escape closes the topmost modal then the screen; reduced motion stops CSS motion',
        observed:`${focused.length} Tab stops incl. all 7 language buttons and fullscreen, outlines on language buttons; language button motion "${motion}" with Reduce animation; Escape: Options → title (offline) and → lobby (online), ${profileClosed}, inspector "${inspected}" closed (still in deck editor), second Escape → lobby; ${alerts} live regions` });
    } finally { closeAll(); }
  },600000);
  it('unlocks audio on the first gesture, follows scenes without overlap, plays duel cues at the set volume and keeps mute',async () => {
    try {
      const dir = '/tmp/acceptance-audio'; mkdirSync(dir,{ recursive:true });
      const slots:Record<number,string> = { 0:'title',1:'deck',3:'login',5:'yugi-area',6:'gx-area',10:'janken',26:'draw',27:'lose',28:'win' };
      for (let s = 11; s <= 18; s++) slots[s] = `duel-${s - 10}`;
      for (let s = 29; s <= 45; s++) slots[s] = `field-${s}`;
      const page = await openPage(); await page.send('Page.enable');
      await page.send('Page.addScriptToEvaluateOnNewDocument',{ source:AUDIO_PROBE });
      await openClient(page,await signIn(`TestAu${RUN}`),{ settings:{ sound:0.8,music:0.6,reducedMotion:false } });
      // No audio before a gesture.
      await sleep(1500);
      const beforeGesture = await page.ev(`({contexts:window.__audio.contexts.length,plays:window.__audio.plays.length})`) as { contexts:number; plays:number };
      expect(beforeGesture).toEqual({ contexts:0,plays:0 });
      // Choose local files for the scene slots in Options; the first press there unlocks audio.
      await click(page,'Options'); await until(page,`document.querySelector('[aria-label="Audio settings"]')`,30000);
      await until(page,`window.__audio.contexts.length===1&&window.__audio.contexts[0].state==='running'`,10000);
      for (const [slot,name] of Object.entries(slots)) await assignSlot(page,Number(slot),silentWav(`${dir}/${name}.wav`,20));
      await click(page,'Back');
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
      await createCharacter(page,`Audio ${RUN}`,{ wait:false });
      const slot = `[...document.querySelectorAll('[data-key^="character-slot:"]')].find(b=>b.textContent.includes('Audio ${RUN}')&&!b.disabled)`;
      await until(page,slot,30000); await press(page,slot); await until(page,byKey('lobby-npcs'),60000); await claimStarter(page);
      const area = await page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()`) as string;
      await sample('lobby',area === 'gx-area.wav' ? 'gx-area.wav' : 'yugi-area.wav');
      await openDeck(page); await sample('deck','deck.wav');
      await click(page,'Return to Lobby'); await until(page,byKey('lobby-npcs'),60000); await sample('lobby',area);
      // A duel: rock-paper-scissors slot, then a duel slot; effects from Sound.dat at the sound volume.
      const startsBefore = await page.ev(`window.__audio.starts.length`) as number;
      await startNpcDuel(page,'Yami Yugi');
      await until(page,`document.querySelectorAll('.de-field-card').length>0`,60000);
      const duelTrack = await page.ev(`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()`) as string;
      timeline.push(`duel:${duelTrack}`);
      expect(duelTrack).toMatch(/^(duel-\d|field-\d+|janken)\.wav$/);
      const janken = await page.ev(`window.__audio.plays.some(p=>p.name==='janken.wav')`);
      for (let i = 0; i < 400 && (await page.ev(`window.__audio.starts.length`) as number) < startsBefore + 3; i++) { if (await duelBot(page) === 'finished') break; await sleep(150); }
      const cues = await page.ev(`window.__audio.starts.slice(${startsBefore})`) as { gain:number; dur:number }[];
      expect(cues.length).toBeGreaterThan(0);
      expect(cues.every(c => Math.abs(c.gain - 0.8) < 0.01 && c.dur > 0)).toBe(true);
      const decodes = await page.ev(`window.__audio.decoded`) as number;
      // Mute effects in Options mid-duel: no further cues; the background track keeps its own level.
      await click(page,'Options'); await until(page,`document.querySelector('input[type=range][aria-label="Sound effects"]')`,30000);
      await page.ev(`(()=>{const i=document.querySelector('input[type=range][aria-label="Sound effects"]');i.value='0';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(page,`window.__audio.gain.gain.value===0`,5000);
      const background = await playing(page);
      await click(page,'Return to Duel'); const mutedFrom = await page.ev(`window.__audio.starts.length`) as number;
      for (let i = 0; i < 60; i++) { if (await duelBot(page) === 'finished') break; await sleep(150); }
      const mutedCues = (await page.ev(`window.__audio.starts.length`) as number) - mutedFrom;
      expect(mutedCues).toBe(0);
      // Surrender: the result slot; back in the lobby the area track returns and nothing is left playing.
      if (!(await page.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Return to Lobby')`))) await surrender(page);
      await until(page,`document.querySelector('.de-duel-end')?.getAttribute('aria-label')`,30000);
      const result = await page.ev(`document.querySelector('.de-duel-end').getAttribute('aria-label')`) as string;
      const resultTrack = result === 'Victory' ? 'win.wav' : result === 'Draw' ? 'draw.wav' : 'lose.wav';
      await until(page,`window.__audio.media.filter(m=>!m.paused&&m.src).map(m=>window.__audio.names.get(m.src)).join()===${JSON.stringify(resultTrack)}`,20000);
      timeline.push(`${result}:${(await playing(page)).join(',')}`);
      await claimNpcReward(page);
      await sample('lobby',area);
      const stuck = await page.ev(`window.__audio.active`) as number;
      expect(stuck).toBe(0);
      expect(maxPlaying).toBe(1);
      const peakVoices = await page.ev(`window.__audio.maxActive`) as number;
      expect(peakVoices).toBeLessThanOrEqual(16);
      // Persistence: reload. Mute, both volumes and the chosen files return; the area track resumes at its level after a gesture.
      await page.go(`${CLIENT}/?portOffset=1000&assets=/game-assets/`,`document.querySelector('.de-client')`);
      await click(page,'Options',60000); await until(page,`document.querySelector('[aria-label="Audio settings"] fieldset')`,30000);
      await until(page,`[...document.querySelectorAll('[aria-label="Audio settings"] fieldset')][5].textContent.includes('yugi-area.wav')`,15000);
      const reloaded = { sound:Number(await page.ev(`document.querySelector('input[type=range][aria-label="Sound effects"]').value`)), background:Number(await page.ev(`document.querySelector('input[type=range][aria-label="Background audio"]').value`)) };
      expect(reloaded).toEqual({ sound:0,background:0.6 });
      await click(page,'Back');
      await until(page,`window.__audio.media.some(m=>!m.paused&&window.__audio.names.get(m.src)==='title.wav')`,15000);
      const afterReload = await playing(page);
      expect(afterReload).toEqual(['title.wav@0.60']);
      await screenshot(page,'audio-options');
      record('audio.volume',{ actions:'Sound effects 80% and background audio 60% with local files per scene; duel cues from Sound.dat; mute effects mid-duel; reload',
        expected:'Levels and mute persist and affect their own playback',
        observed:`${cues.length} duel cues at gain ${cues[0]?.gain} (${decodes} effects decoded from Sound.dat); background ${background.join(',')} while effects muted; ${mutedCues} cues after mute (gain 0); after reload: sound ${reloaded.sound}, background ${reloaded.background}, files kept, playing ${afterReload.join(',')}` });
      record('audio.lifecycle',{ actions:'Open the client (no gesture), first press, title → characters → lobby → deck editor → lobby → NPC duel (RPS, duel, result) → lobby',
        expected:'Audio starts only after a gesture; each scene switches its track; duel cues end; nothing overlaps or stays stuck',
        observed:`before gesture: ${beforeGesture.contexts} contexts, ${beforeGesture.plays} plays; after the first press: context running; tracks ${timeline.join(' → ')}; janken played ${janken}; at most ${maxPlaying} background track at once, peak ${peakVoices} effect voices, ${stuck} voices left after the duel` });
    } finally { closeAll(); }
  },600000);
});
