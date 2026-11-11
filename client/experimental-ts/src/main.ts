import { ClientApp } from './app';
import { CardCatalog } from './catalog';
import { loadClientData } from './data';
import { AssetManager, CacheApiPersistence, IdlePrefetcher } from './assets';
import { SceneManifest } from './assets/prefetch';
import { SceneLoader, scenePaths } from './world/scene';
import { decodeDuelPrefetch, Preloader } from './features/preload';
import { PendingWork, SceneLoadingOverlay, SceneLoadTracker, sceneKey, watchSceneChanges } from './ui/htmlui/scene-loading';
import { tradeScene } from './ui/htmlui/trade';
import { BrowserAudioManager } from './features/audio';
import { browserSocialBox } from './features/social';
import { mountClient } from './ui';
import type { SettingsView } from './ui/contracts';
import { isGameLanguage } from './features/language';
import { DEFAULT_ASSETS } from './site';
const root = document.getElementById('app');
if (!root) throw new Error('Missing client mount');
const params = new URLSearchParams(location.search);
const gateway = new URL('/net', location.href); gateway.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
// The browser's reduced-motion preference is the default until the player chooses in Options.
let settings: Partial<SettingsView> = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? { reducedMotion: true } : {};
try {
  const stored: unknown = JSON.parse(localStorage.getItem('de-client-settings-v1') ?? '{}');
  if (stored && typeof stored === 'object') {
    const s = stored as Partial<SettingsView>;
    if (typeof s.sound === 'number' && s.sound >= 0 && s.sound <= 1) settings.sound = s.sound;
    if (typeof s.music === 'number' && s.music >= 0 && s.music <= 1) settings.music = s.music;
    if (typeof s.reducedMotion === 'boolean') settings.reducedMotion = s.reducedMotion;
    if (typeof s.showCardNames === 'boolean') settings.showCardNames = s.showCardNames;
    if (isGameLanguage(s.language)) settings.language = s.language;
  }
} catch { /* Storage is optional and never contains credentials or game inventory. */ }
const abort = new AbortController();
// The boot screen (main's loader.js look) from the first frame the script runs, over index.html's own first frame
const reducedMotion = () => settings.reducedMotion === true || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
let overlay: SceneLoadingOverlay | null = new SceneLoadingOverlay(null, reducedMotion);
const data=await loadClientData({signal:abort.signal}), catalog=data.catalog ?? new CardCatalog();
const offset = Number(params.get('portOffset') ?? 1000);
if (!Number.isInteger(offset) || offset < 0 || offset > 60000) throw new Error('Invalid port offset');
const dev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
// Archive chunks persist between sessions (Cache API, one cache per archive build); the next scenes warm at idle.
const prefetcher = new IdlePrefetcher();
let storage: Storage | null = null; try { storage = localStorage; } catch { /* optional */ }
const manifest = new SceneManifest('de-prefetch-v1', storage);
let preloader: Preloader | undefined;
const assetBase = params.get('assets') ?? (DEFAULT_ASSETS || null);
// The 2x card art (merge/data/card.dat, mini.dat) has its own directory on live, cards/ beside game/ (lazyfs.js mounts
// both): without it every card face fell back to merge.dat's 2008 art. ?cards= names another; a base that is not a
// game/ directory (the dev middleware's /game-assets/) serves card.dat itself.
const cardsBase = params.get('cards') ?? (assetBase !== null && /(^|\/)game\/?$/.test(assetBase) ? assetBase.replace(/game\/?$/, 'cards/') : null);
const assets = assetBase !== null ? new AssetManager({ baseUrl: new URL(assetBase, location.href).href, mergeCardPaths: catalog.mergePaths,
  ...(cardsBase !== null ? { cardsBaseUrl: new URL(cardsBase, location.href).href } : {}),
  ...(globalThis.caches ? { persistent: new CacheApiPersistence({ build: 'v1' }) } : {}), onScene: path => preloader?.record(path) }) : undefined;
const mapScenes = assets ? new SceneLoader({ assets }) : null;
if (assets) preloader = new Preloader({ assets, prefetcher, manifest,
  mapPaths: async (id, signal) => { const scene = await mapScenes!.load(id, signal); try { return scenePaths(scene.definition); } finally { scene.dispose(); } },
  neighbours: id => data.worldMaps?.maps.find(m => m.id === id)?.exits.map(e => e.to) ?? [],
  duelDeck: async signal => {
    const response = await fetch('/api/de/prefetch/duel', { credentials: 'same-origin', signal });
    return response.status === 200 ? decodeDuelPrefetch(await response.json()) : null;
  } }, settings.language ?? 'E');
// The scene-load overlay (main's loader look) and, in development, scene load times cold vs warm.
let lastStats = assets?.stats ?? { persisted: 0, network: 0 };
const sceneLoads = new SceneLoadTracker(loading => overlay?.set(loading), dev ? (name, ms) => {
  const now = assets?.stats ?? lastStats, network = now.network - lastStats.network, persisted = now.persisted - lastStats.persisted; lastStats = now;
  console.info(`[scene-load] ${name} ${ms.toFixed(0)} ms ${network ? 'cold' : 'warm'} (network ${network}, persisted ${persisted}, memory ${(assets?.cacheBytes ?? 0) >> 10} KiB)`);
} : undefined);
const audio = new BrowserAudioManager(assetBase !== null ? { soundArchiveUrl: new URL(assetBase.replace(/\/?$/, '/') + 'Sound.dat', location.href).href } : {});
// Deferred audio (live: ovr/sedefer.c): startup waits for the stored audio pack only when the stored settings lack the
// volumes; otherwise it restores in the background.
const audioRestore = audio.restore().catch(() => false);
if (typeof settings.sound !== 'number' || typeof settings.music !== 'number') {
  let audioRestoreTimer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([audioRestore,new Promise<void>(resolve=>{audioRestoreTimer=setTimeout(resolve,5000);})]); }
  finally { clearTimeout(audioRestoreTimer); }
}
settings = {sound:audio.volumes.sound,music:audio.volumes.music,...settings};
const socialBox = browserSocialBox();
const app = new ClientApp({ ...data, audio, ...(preloader ? { preloader } : {}), sceneLoads, dataIssues:data.issues, reloadData:signal=>loadClientData({signal}), gatewayUrl:gateway.href,portOffset:offset,freeMode:params.get('free')==='1',catalog,assets,settings,...(socialBox ? { socialBox } : {}),
  persistSettings: s => { try { localStorage.setItem('de-client-settings-v1', JSON.stringify(s)); } catch { /* optional */ } },
});
// every scene change raises the veil too (main's loader.js on each scene "begin"), until the new scene has settled: its
// windows drawn and the pictures it asked for come (the archive / card pictures counted while in flight)
const pendingWork = new PendingWork();
{ const pics = app as unknown as { loadArchiveImage?: ClientApp['loadArchiveImage']; loadCardImage: ClientApp['loadCardImage'] };
  const archive = app.loadArchiveImage, card = app.loadCardImage.bind(app);
  if (archive) pics.loadArchiveImage = (path, signal) => pendingWork.track(archive(path, signal));
  pics.loadCardImage = (pc, signal) => pendingWork.track(card(pc, signal)); }
const sceneWatch = watchSceneChanges({ tracker: sceneLoads, pending: pendingWork,
  roots: () => [document.getElementById('htmlui-host'), root.querySelector('.de-stage')].filter((e): e is HTMLElement => !!e) });
const observeScene = (v: ReturnType<ClientApp['getState']>) => sceneWatch.observe(sceneKey({ ...v, trade: !!v.socialDetail && tradeScene(v.socialDetail.trade), map: v.lobby?.mapId }));
observeScene(app.getState());
const unwatchScenes = app.subscribe(observeScene);
const ui = mountClient(root, app);
overlay.setLoader(app.loadArchiveImage?.bind(app) ?? null);
overlay.follow(() => root.querySelector('.de-stage'));
// the boot veil fades once the first screen's windows are up (or after 8 s whatever happens)
{ const t0 = performance.now(); const ready = () => { if (closed) return; if (document.querySelector('#htmlui-host:not([hidden]) > *') || performance.now() - t0 > 8000) requestAnimationFrame(() => overlay?.booted()); else setTimeout(ready, 50); }; setTimeout(ready, 0); }
// Development only: browser acceptance runs read the duel model when a duel stalls (tests/acceptance/duel.test.ts).
if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __deApp?: ClientApp }).__deApp = app;
void app.initialize();
// Browsers start audio only from a user gesture: the first press or key that finds audio audible unlocks it, inside
// that event (the original plays from the first screen). Muted volumes leave it locked until a later gesture.
const unlock = (): void => {
  if (audio.isActivated) return;
  if (Object.values(audio.volumes).some(volume => volume > 0)) void audio.activate();
};
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlock, true);
let closed = false;
function dispose(): void {
  if (closed) return; closed = true;
  for (const type of ['pointerdown', 'keydown'] as const) window.removeEventListener(type, unlock, true);
  unwatchScenes(); sceneWatch.dispose(); abort.abort(); prefetcher.dispose(); mapScenes?.dispose(); manifest.save(); overlay?.dispose(); ui.dispose(); app.dispose();
  window.removeEventListener('pagehide', pagehide);
}
function pagehide(event: PageTransitionEvent): void { if (!event.persisted) dispose(); }
window.addEventListener('pagehide', pagehide);
// HMR owns the old controller rather than keeping duplicate sockets and subscriptions alive.
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(dispose);
