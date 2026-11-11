// The warm two-player live harness: the local stack, both players signed in and in the lobby, kept running, so a live
// before/after of any screen for either player takes seconds instead of a boot. Konami-derived output: keep it local.
//
//   node tools/warm.mjs start [--seed=<file>]    the stack (stack.py: wrangler dev with DEV:1, two test users with a
//                                                character each), one game.mjs per player, ONE headless Chrome on the
//                                                Intel GPU (refused otherwise) with a window per player: A and B, both
//                                                signed in and in Beginner's Lobby A. Detached; idempotent (a healthy
//                                                harness is reused). --seed: local state applied before anyone signs in
//   node tools/warm.mjs status                   scene, shown windows, fps, reconnect state, trail of each player
//   node tools/warm.mjs goto <A|B|both> <route> [--fresh]
//                                                a flip.mjs route (`routes` lists them; `lobby` too). A player whose
//                                                steps so far are the start of the route's goes on from there (every
//                                                route through Beginner's Lobby A starts from the lobby: shop-menu ->
//                                                shop-avatar is the rest only); any other is rebooted (its window
//                                                reloaded, ~1 min) and walks the route from the title. --fresh: always
//   node tools/warm.mjs steps <A|B|both> <json|file> [outdir]   (outdir: as shot's <out>)
//                                                flip.mjs's step language ([["rc", "walkto 1200 880 1500"], ["wait",
//                                                1000], ["shot", "x"]], ...). Once the runtime's scripted input has moved
//                                                a player's mouse (rc), click / rhold are sent as scripted input too
//   node tools/warm.mjs shot <A|B|both> [out] [--native|--html] [--win=CLS] [--classes=A,B]
//                                                the before / after at 2x: <out>-<A|B>-native.png (every window drawn
//                                                by the engine, yo2Html.set('0')) and -html.png (every window with an
//                                                HTML screen in HTML, set('all'); --classes: only those), each once
//                                                frames, entrances, images and fonts settle; the player's switches put
//                                                back after. <out> a directory: <out>/<A|B>-<mode>.png. --win: that
//                                                window's (or task's) rect only. A bare name (no /) or no <out> at
//                                                all: under ~/.cache/de-scratch/htmlui-warm-<N>/shots/ (on disk)
//   node tools/warm.mjs reload-ui [A|B|both] [--swap=<path in htmlui/>=<file>]...
//                                                hot reload of the htmlui modules, the game untouched (below). --swap:
//                                                that module from another file (a trial edit, the tree untouched),
//                                                until the next reload-ui
//   node tools/warm.mjs seed <json|file.json|file.mjs>
//                                                local-only state through /__dev/state, then both players brought back
//   node tools/warm.mjs trade-start              A asks B for a card swap, B says Yes: both in the trade scene
//   node tools/warm.mjs eval <A|B|both> <js>     an expression in a player's page;  logs <A|B> [n]: its console
//   node tools/warm.mjs stop                     stops what the harness started (by pid: its daemon, stack.py and
//                                                its wrangler dev, both game.mjs, its Chrome)
//
// Slot: FLIP_SLOT (default 4): stack 8800+10N, game.mjs A / B 8801+10N / 8802+10N, this control port 8805+10N,
// DevTools 9440+N. State, logs, stuck captures, the Chrome profile and shots in ~/.cache/de-scratch/htmlui-warm-<N>/
// (state.json: ports, pids, cookies), never /tmp (RAM-backed on this box).
// WARM_A / WARM_B: the characters' names (default "Warm Tester A" / "Warm Tester B"). The game files come from
// ~/.cache/yo2-game (BUILD GAME FONTS CARDS YO2EMU, as flip.mjs; any already set wins).
//
// Hot reload (reload-ui): every page loads its modules under /htmlui@<generation>/, which a CDP Fetch rule serves
// from /htmlui/ unseen by the page, so each reload is a new URL for every module in the graph (screens, read/,
// controls/, cosmetics/, gen/) and all of them evaluate again. The old bridge first unmounts its screens (nothing
// owned for 3 frames), its frame hook is dropped and every node an /htmlui/ module put into <head>, <body> or the
// canvas's parent is removed (an init script tags them by the caller's stack); the new bridge starts on the running
// game and the player's yo2Html switches (set / toggle, recorded) are put back. A full reload (goto --fresh) is still
// needed for: the runtime (wasm, recomp/ovr), yo2rc.html, the loader / starter / duelspeed scripts, ../ui.js
// (html-ui), game.mjs; a Svelte group needs `npm run build` first (gen/ is then reloaded like the rest); a module
// that keeps a window / document listener after unmount keeps it (the old one stays too).
//
// Seed: GET /__dev/state, the change, POST it back. A JSON {"A": {"profile": {...}, "account": {...}}, "B": ...,
// "state": {...}} is deep-merged into that player's character (profiles[slot]) / account / the whole state (arrays
// replace); a JSON with "accounts" is the whole state; an .mjs's default export (state, {A, B, names}) changes it in
// place or returns the new one (A / B: {acct, slot, account, profile}). The server then forgets every live session
// (server.ts reset builds a new game), so each player's /net WebSockets are closed with resume off: the game's own
// reconnect (ovr/lobbyretry.c, as after a deploy) signs in again and puts them back in the same lobby area or My
// Room in a few seconds. A player elsewhere (a shop, a trade) or not back in 60 s is rebooted and its trail replayed.
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { existsSync, readFileSync, openSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));
const SLOT = +(process.env.FLIP_SLOT ?? 4), CTL = 8805 + 10 * SLOT, DIR = path.join(process.env.HOME, '.cache/de-scratch', `htmlui-warm-${SLOT}`);
const STATE = path.join(DIR, 'state.json'), SHOTS = path.join(DIR, 'shots');
// an output name with no '/' goes under SHOTS (on disk); a path is the caller's
const outPath = a => !a ? path.join(SHOTS, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)) + '/' : a.includes('/') ? path.resolve(a) + (a.endsWith('/') ? '/' : '') : path.join(SHOTS, a);

// one command to the daemon: its progress lines (# ...) to stderr, its JSON answer returned
const call = (cmd, args = [], quiet = false) => new Promise((ok, no) => {
  const r = request({ host: '127.0.0.1', port: CTL, method: 'POST', path: '/' }, res => {
    let buf = '', last = '';
    res.setEncoding('utf8');
    res.on('data', d => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
        const line = buf.slice(0, i);
        if (line.startsWith('# ')) { if (!quiet) process.stderr.write(line + '\n'); } else last = line;
      }
    });
    res.on('end', () => { try { ok(JSON.parse(last || buf)); } catch { no(new Error('bad answer: ' + (last || buf).slice(0, 200))); } });
  });
  r.on('error', no);
  r.end(JSON.stringify({ cmd, args }));
});
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const state = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return null; } };
const cmdline = pid => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/[\0 ]/); } catch { return []; } };

// the pids state.json names, each only if it is still the process the harness started (its command line)
function killRecorded(s) {
  const P = s?.pids || {}, killed = [];
  const own = {
    daemon: a => a.some(x => x.endsWith('warmd.mjs')),
    stack: a => a.some(x => x.endsWith('stack.py')) && a.includes(String(s.ports.stack)),
    gameA: a => a.some(x => x.endsWith('game.mjs')) && a.includes(String(s.ports.A)),
    gameB: a => a.some(x => x.endsWith('game.mjs')) && a.includes(String(s.ports.B)),
    chrome: a => a.includes(`--remote-debugging-port=${s.ports.devtools}`) && a.some(x => x === `--user-data-dir=${path.join(DIR, `chrome-${P.daemon}`)}`),
    wrangler: a => a.some(x => /wrangler/.test(x)) && a.includes(String(s.ports.stack)),
  };
  for (const [k, pid] of Object.entries(P)) {
    if (!pid || !alive(pid) || !own[k]?.(cmdline(pid))) continue;
    try { process.kill(k === 'wrangler' || k === 'stack' ? -pid : pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }   // wrangler and stack.py lead their own groups
    killed.push(k + ':' + pid);
  }
  return killed;
}

async function start(seed) {
  const s = state();
  if (s?.pids?.daemon && alive(s.pids.daemon)) {
    const st = await call('status', [], true).catch(() => null);
    const healthy = st?.phase === 'ready' && ['A', 'B'].every(T => st[T] && !st[T].error && st[T].fps > 0);
    if (healthy) { console.log(JSON.stringify({ ok: true, reused: true, ...st })); return; }
    if (st && !['ready', 'failed', 'stopped'].includes(st.phase)) return wait(Date.now());   // still starting
    console.error('warm: the running harness is not healthy:', JSON.stringify(st)?.slice(0, 300), '- restarting it');
    await call('stop', [], true).catch(() => {});
    await sleep(2500);
    killRecorded(state());
    await sleep(1500);
  } else if (s) killRecorded(s);   // a harness that died: anything it left behind
  mkdirSync(DIR, { recursive: true });
  const out = openSync(path.join(DIR, 'daemon.log'), 'w');
  const d = spawn('node', [path.join(here, 'warmd.mjs')], { detached: true, stdio: ['ignore', out, out],
    env: { ...process.env, FLIP_SLOT: String(SLOT), ...(seed && { WARM_SEED: path.resolve(seed) }) } });
  d.unref();
  return wait(Date.now(), d.pid);
}
async function wait(t0, pid) {
  let phase = '', printed = 0;
  for (;;) {
    await sleep(1000);
    const log = existsSync(path.join(DIR, 'daemon.log')) ? readFileSync(path.join(DIR, 'daemon.log'), 'utf8').split('\n') : [];
    for (; printed < log.length - 1; printed++) process.stderr.write('  ' + log[printed] + '\n');
    const s = state();
    if (s?.phase !== phase) { phase = s?.phase; process.stderr.write(`warm: ${phase} (${Math.round((Date.now() - t0) / 1000)} s)\n`); }
    if (phase === 'ready') { console.log(JSON.stringify({ ok: true, coldStartMs: s.timings?.coldStartMs, ports: s.ports, pids: s.pids })); return; }
    if (phase === 'failed' || (pid && !alive(pid)) || Date.now() - t0 > 600000) {
      console.log(JSON.stringify({ ok: false, phase, error: s?.error || 'the daemon died', log: path.join(DIR, 'daemon.log') }));
      process.exitCode = 1; return;
    }
  }
}

const [cmd, ...args] = process.argv.slice(2);
// paths are the caller's: made absolute here (the daemon's cwd is not this one)
const abs = a => a && !a.startsWith('--') && !a.trim().startsWith('[') && !a.trim().startsWith('{') && (a.includes('/') || /\.(png|json|mjs|js)$/.test(a)) ? path.resolve(a) : a;
if (!cmd || cmd === 'help') {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^\/\/ ?/gm, ''));
} else if (cmd === 'start') {
  await start(args.find(a => a.startsWith('--seed='))?.slice(7));
} else if (cmd === 'stop') {
  const s = state();
  const r = await call('stop', [], true).catch(() => null);
  for (let i = 0; i < 20 && s?.pids?.daemon && alive(s.pids.daemon); i++) await sleep(250);
  await sleep(500);
  const left = s ? killRecorded(s) : [];   // whatever outlived the daemon's own stop
  console.log(JSON.stringify({ ok: true, stopped: !!r, killed: left }));
} else {
  const pos = args.filter(a => !a.startsWith('--')), flags = args.filter(a => a.startsWith('--'));
  const fix = cmd === 'shot' ? [pos[0], outPath(pos[1]), ...flags]
    : cmd === 'eval' ? args : cmd === 'reload-ui' ? args.map(a => a.startsWith('--swap=') ? a.replace(/=([^=]+)$/, (_, f) => '=' + path.resolve(f)) : a) : cmd === 'steps' ? [args[0], abs(args[1]), outPath(args[2])] : args.map(abs);
  const r = await call(cmd, fix.filter(a => a !== undefined)).catch(e => ({ ok: false, error: `${e.message} (is it started? node tools/warm.mjs start)` }));
  console.log(JSON.stringify(r, null, cmd === 'status' ? 1 : 0));
  if (!r.ok) process.exitCode = 1;
}
