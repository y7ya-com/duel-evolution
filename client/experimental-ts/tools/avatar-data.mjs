// Original motion data remains private. No archive or image bytes are embedded here.
import { readFile, mkdir, writeFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseAvatarDump } from '../src/avatars/dump.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Verify both logical and physical destinations: symlink escapes cannot bypass git policy. */
export async function assertPrivateOutput(output) {
  const repo = execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8'}).trim();
  const logical = resolve(output);
  let existing = dirname(logical), tail = [basename(logical)];
  for (;;) {
    try { await stat(existing); break; } catch (e) { if (e.code !== 'ENOENT') throw e; tail.unshift(basename(existing)); existing = dirname(existing); }
  }
  const physical = resolve(await realpath(existing),...tail);
  for (const path of new Set([logical,physical])) {
    if (!path.startsWith(repo + '/')) throw new Error('Avatar output must be inside the repository and git-ignored');
    // --no-index checks ignore rules independently; ls-files rejects tracked paths even if ignored.
    if (execFileSync('git',['ls-files','--',path],{cwd:repo,encoding:'utf8'}).trim()) throw new Error('Refusing tracked avatar output');
    try { execFileSync('git',['check-ignore','--no-index','-q','--',path],{cwd:repo}); }
    catch { throw new Error('Refusing unignored avatar output; add public/avatar-data.json (or chosen path) to client/experimental-ts/.gitignore'); }
  }
  // An existing symlink file also needs its target checked; do not follow it when writing.
  try { const {lstat} = await import('node:fs/promises'); if ((await lstat(logical)).isSymbolicLink()) throw new Error('Refusing symlink avatar output'); }
  catch(e) { if(e.code !== 'ENOENT') throw e; }
  return logical;
}
/** Inputs are separately extracted original cm_*.txt files; each is bounded before reading. */
export async function generateAvatarData(output, inputs) {
  const dest = await assertPrivateOutput(output);
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 23) throw new Error('Expected 1..23 original player motion dumps');
  const motions = {}; let total = 0;
  for (const input of inputs) {
    const name = basename(input);
    if (!/^cm_(?:[nwgt]0[1-5]|d01_0[1-3])\.txt$/.test(name) || motions[`data/Avatar/chibi/${name}`]) throw new Error('Invalid or duplicate original motion filename');
    const info = await stat(input);
    if (info.size > 4*1024*1024 || (total += info.size) > 32*1024*1024) throw new Error('Avatar data exceeds budget');
    const text = await readFile(input,'utf8'); parseAvatarDump(text);
    motions[`data/Avatar/chibi/${name}`] = text;
  }
  await mkdir(dirname(dest),{recursive:true});
  // Recheck after creating directories and refuse overwrites (including races creating symlinks).
  await assertPrivateOutput(dest);
  await writeFile(dest,JSON.stringify({version:1,motions}),{flag:'wx'});
  return {output:dest,count:inputs.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output,...inputs] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node tools/avatar-data.mjs <ignored-output.json> <original-cm_*.txt>...');
  console.log(await generateAvatarData(resolve(root,output),inputs));
}
