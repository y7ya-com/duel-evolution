// The mock snapshot through the LIVE shipped layer: node tools/liveshot.mjs <out> <site> <h-hash> [snap] [--dpr=2]
// (the page is the site's htmlui.json, so the game never boots; bridge.js and the ui/ art come from the site).
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), dpr = +(args.find(a => a.startsWith('--dpr='))?.slice(6) || 1);
const [out, site, hash, s = 'playerselect-live'] = args.filter(a => !a.startsWith('--'));
const snap = readFileSync(path.join(here, `../mock/${s}.json`), 'utf8');
const b = await launch({ dpr });
await b.go(site + '/htmlui.json', 'document.readyState === "complete"');
await b.ev(`(async () => {
  document.documentElement.innerHTML = '<head><style>html, body { margin: 0; background: #234; } #htmlui-host { position: relative !important; }</style></head><body></body>';
  const { makeLayer, loadScreens } = await import('/${hash}/htmlui/bridge.js');
  const snap = ${snap}, host = document.createElement('div');
  host.id = 'htmlui-host'; document.body.append(host);
  const { render } = await makeLayer(host, await loadScreens(), '/ui/');
  const api = Object.fromEntries(['click', 'hover', 'key', 'char', 'setText', 'scroll', 'wheel'].map(n => [n, () => {}]));
  render(snap, new Set(snap.windows.map(w => w.id)), api);
  await document.fonts.ready;
})()`);
await new Promise(r => setTimeout(r, 500));
writeFileSync(out, await b.shot());
console.log(out, 'ok');
if (b.logs.length) console.log(b.logs.join('\n'));
b.close();
process.exit(0);
