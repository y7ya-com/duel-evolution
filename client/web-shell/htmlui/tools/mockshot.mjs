// Screenshots of the mock snapshots through the layer: node tools/mockshot.mjs <outdir> [names...] [--dpr=2]
// (serve.mjs must not be running on 8941; this starts its own).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), dpr = +(args.find(a => a.startsWith('--dpr='))?.slice(6) || 1);
const [out = 'mockshots', ...names] = args.filter(a => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const srv = spawn('node', [path.join(here, '../serve.mjs'), '8941'], { stdio: 'ignore' });
process.on('exit', () => srv.kill());
await new Promise(r => setTimeout(r, 400));
const b = await launch({ dpr });
const list = names.length ? names : readdirSync(path.join(here, '../mock')).map(f => f.replace('.json', ''));
for (const n of list) {
  await b.go(`http://127.0.0.1:8941/htmlui/mock.html?s=${n}`);
  writeFileSync(path.join(out, `${n}@${dpr}x.png`), await b.shot());
  console.log(n, 'ok');
}
if (b.logs.length) console.log(b.logs.join('\n'));
b.close();
process.exit(0);
