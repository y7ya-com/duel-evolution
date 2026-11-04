import { ClientApp } from './app';
import { CardCatalog } from './catalog';
import { loadClientData } from './data';
import { AssetManager } from './assets';
import { BrowserAudioManager } from './features/audio';
import { mountClient } from './ui';
import type { SettingsView } from './ui/contracts';
import { isGameLanguage } from './features/language';
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
const data=await loadClientData({signal:abort.signal}), catalog=data.catalog ?? new CardCatalog();
const offset = Number(params.get('portOffset') ?? 1000);
if (!Number.isInteger(offset) || offset < 0 || offset > 60000) throw new Error('Invalid port offset');
const assets = params.has('assets') ? new AssetManager({ baseUrl: new URL(params.get('assets')!, location.href).href, mergeCardPaths: catalog.mergePaths }) : undefined;
const audio = new BrowserAudioManager(params.has('assets') ? { soundArchiveUrl: new URL(params.get('assets')!.replace(/\/?$/, '/') + 'Sound.dat', location.href).href } : {});
let audioRestoreTimer: ReturnType<typeof setTimeout> | undefined;
try { await Promise.race([audio.restore(),new Promise<void>(resolve=>{audioRestoreTimer=setTimeout(resolve,5000);})]); }
finally { clearTimeout(audioRestoreTimer); }
settings = {sound:audio.volumes.sound,music:audio.volumes.music,...settings};
const app = new ClientApp({ ...data, audio, dataIssues:data.issues, reloadData:signal=>loadClientData({signal}), gatewayUrl:gateway.href,portOffset:offset,freeMode:params.get('free')==='1',catalog,assets,settings,
  persistSettings: s => { try { localStorage.setItem('de-client-settings-v1', JSON.stringify(s)); } catch { /* optional */ } },
});
const ui = mountClient(root, app);
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
  abort.abort(); ui.dispose(); app.dispose();
  window.removeEventListener('pagehide', pagehide);
}
function pagehide(event: PageTransitionEvent): void { if (!event.persisted) dispose(); }
window.addEventListener('pagehide', pagehide);
// HMR owns the old controller rather than keeping duplicate sockets and subscriptions alive.
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(dispose);
