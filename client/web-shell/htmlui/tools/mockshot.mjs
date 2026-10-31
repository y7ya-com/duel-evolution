// Screenshots of the mock snapshots through the layer: node tools/mockshot.mjs <outdir> [names...] [--dpr=2]
// [--svelte=deck] (those groups from their Svelte build, gen/: npm run build first)
// (starts its own serve.mjs on a port of its own).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), dpr = +(args.find(a => a.startsWith('--dpr='))?.slice(6) || 1);
const svelte = args.find(a => a.startsWith('--svelte='))?.slice(9);
const [out = 'mockshots', ...names] = args.filter(a => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const PORT = 8950 + process.pid % 40;   // its own server: never another worktree's on 8941
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise((ok, no) => { srv.stdout.once('data', ok); srv.once('exit', c => no(new Error('serve.mjs exited ' + c))); });
const b = await launch({ dpr });
const list = names.length ? names : readdirSync(path.join(here, '../mock')).map(f => f.replace('.json', ''));
for (const n of list) {
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=${n}${svelte ? '&svelte=' + svelte : ''}`);
  writeFileSync(path.join(out, `${n}@${dpr}x.png`), await b.shot());
  console.log(n, 'ok');
}
if (b.logs.length) console.log(b.logs.join('\n'));
b.close();
process.exit(0);
