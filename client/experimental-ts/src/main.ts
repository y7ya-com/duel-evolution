import { ClientApp } from './app';
import { CardCatalog, readCatalog } from './catalog';
import { AssetManager } from './assets';
import { DuelTextCatalog } from './duel/text';
import { loadWorldMaps } from './world';
import { BrowserAudioManager } from './features/audio';
import { mountClient } from './ui';
import type { SettingsView } from './ui/contracts';
const root = document.getElementById('app');
if (!root) throw new Error('Missing client mount');
const params = new URLSearchParams(location.search);
const gateway = new URL('/net', location.href); gateway.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
let settings: Partial<SettingsView> = {};
try {
  const stored: unknown = JSON.parse(localStorage.getItem('de-client-settings-v1') ?? '{}');
  if (stored && typeof stored === 'object') {
    const s = stored as Partial<SettingsView>;
    if (typeof s.sound === 'number' && s.sound >= 0 && s.sound <= 1) settings.sound = s.sound;
    if (typeof s.music === 'number' && s.music >= 0 && s.music <= 1) settings.music = s.music;
    if (typeof s.reducedMotion === 'boolean') settings.reducedMotion = s.reducedMotion;
    if (typeof s.showCardNames === 'boolean') settings.showCardNames = s.showCardNames;
  }
} catch { /* Storage is optional and never contains credentials or game inventory. */ }
const catalog = new CardCatalog();
const abort = new AbortController();
// Display data is generated locally from supplied assets, never a prerequisite for networking.
const catalogTimeout = setTimeout(() => abort.abort(), 5000);
try {
  const response = await fetch('/card-catalog.json', { signal: abort.signal });
  catalog.install(await readCatalog(response, abort.signal));
} catch { /* Unknown card names remain explicit passcodes. */ }
finally { clearTimeout(catalogTimeout); }
const worldAbort = new AbortController(), worldTimeout = setTimeout(() => worldAbort.abort(), 5000);
const duelTexts = new DuelTextCatalog();
const [worldMaps] = await Promise.all([
  loadWorldMaps('/world-maps.json', { signal: worldAbort.signal }).catch(() => undefined),
  fetch('/duel-texts.json', { signal: worldAbort.signal }).then(r => readCatalog(r, worldAbort.signal)).then(data => duelTexts.install(data)).catch(() => undefined),
]);
clearTimeout(worldTimeout);
const offset = Number(params.get('portOffset') ?? 1000);
if (!Number.isInteger(offset) || offset < 0 || offset > 60000) throw new Error('Invalid port offset');
const assets = params.has('assets') ? new AssetManager({ baseUrl: new URL(params.get('assets')!, location.href).href, mergeCardPaths: catalog.mergePaths }) : undefined;
const audio = new BrowserAudioManager(params.has('assets') ? { soundArchiveUrl: new URL(params.get('assets')!.replace(/\/?$/, '/') + 'Sound.dat', location.href).href } : {});
const app = new ClientApp({ audio, worldMaps, duelTexts, gatewayUrl: gateway.href, portOffset: offset, catalog, assets, settings,
  persistSettings: s => { try { localStorage.setItem('de-client-settings-v1', JSON.stringify(s)); } catch { /* optional */ } },
});
const ui = mountClient(root, app);
void app.initialize();
let closed = false;
function dispose(): void {
  if (closed) return; closed = true;
  abort.abort(); worldAbort.abort(); ui.dispose(); app.dispose();
  window.removeEventListener('pagehide', pagehide);
}
function pagehide(event: PageTransitionEvent): void { if (!event.persisted) dispose(); }
window.addEventListener('pagehide', pagehide);
// HMR owns the old controller rather than keeping duplicate sockets and subscriptions alive.
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(dispose);
