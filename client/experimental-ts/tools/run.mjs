// Prefer an isolated install; a repository checkout can reuse its existing tool installations.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...args] = process.argv.slice(2);
if (!['tsc', 'vite', 'vitest'].includes(tool)) throw new Error('Unknown development tool');
const roots = [root, resolve(root, '../../web-shell/htmlui'), resolve(root, '../../..', 'server')];
// htmlui is a sibling of experimental-ts, not its parent.
roots[1] = resolve(root, '../web-shell/htmlui');
roots[2] = resolve(root, '../../server');
const binary = roots.map(r => resolve(r, 'node_modules/.bin', tool)).find(existsSync);
if (!binary) throw new Error(`Install dependencies in ${root} before running ${tool}`);
const child = spawn(binary, args, { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
