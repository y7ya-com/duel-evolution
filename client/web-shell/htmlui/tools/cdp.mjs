// A headless Chrome for Testing over CDP, for the htmlui tools (mockshot.mjs, flip.mjs). No visible window; refuses
// to start with under 25 % memory free (buildslot admits the whole run at 35 %) (the shared Mac's rule). CHROME=<binary> to pick another build.
import { spawn, execSync } from 'node:child_process';
import { rmSync, readdirSync, readFileSync } from 'node:fs';
import { totalmem } from 'node:os';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = process.platform === 'darwin';
  const base = process.env.HOME + (mac ? '/Library/Caches/ms-playwright' : '/.cache/ms-playwright');
  const dir = readdirSync(base).filter(d => /^chromium-\d/.test(d)).sort().pop();
  return mac ? `${base}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
    : `${base}/${dir}/chrome-linux64/chrome`;
}

// the GPU: Metal on macOS; on Linux the Intel GPU through Vulkan (headless Chrome otherwise falls back to SwiftShader,
// ~50x slower: 1 vs 54 frames/s measured here, its GPU process 90-150 % CPU). YO2_GPU_FLAGS='...' overrides
const gpuFlags = () => process.env.YO2_GPU_FLAGS != null ? process.env.YO2_GPU_FLAGS.split(/\s+/).filter(Boolean)
  : process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'];

// scrollbars: show the native scroll bars (headless hides them by default: a capture of a native scroller shows none)
export async function launch({ port = 9480 + (process.pid % 100), dpr = 1, width = 1024, height = 768, mobile = false, scrollbars = false } = {}) {
  const free = process.platform === 'darwin'   // Linux: MemAvailable (page cache counts as free, as memory_pressure's)
    ? +(/free percentage: (\d+)%/.exec(execSync('memory_pressure').toString())?.[1] ?? 100)
    : Math.round(+/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1] * 1024 / totalmem() * 100);
  const min = +(process.env.CDP_MIN_FREE || 25);   // CDP_MIN_FREE=15: a big machine where 25 % is still gigabytes
  if (free < min) throw new Error(`only ${free}% memory free`);
  // this port's Chrome from a run that died without cleaning up (ports are per slot or per pid): never another port's
  try { execSync(`pkill -9 -f -- '--remote-debugging-port=${port} '`); } catch {}
  const profile = process.env.YO2_CHROME_PROFILE || '/tmp/htmlui-chrome-' + process.pid;
  const ch = spawn('nice', ['-n', '10', chromePath(), '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, ...(scrollbars ? [] : ['--hide-scrollbars']), '--no-first-run', ...gpuFlags(), 'about:blank'], { stdio: 'ignore' });
  // the trailing space in the pkill pattern above needs an argument after the port: --user-data-dir follows it
  const kill = () => { ch.kill('SIGKILL'); try { if (!process.env.YO2_CHROME_PROFILE) rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {} };
  process.on('exit', kill);
  // a SIGTERM / SIGINT (a stopped run, buildslot, Ctrl-C) ends the process without 'exit' handlers: make it an exit
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) if (!process.listenerCount(sig)) process.on(sig, () => process.exit(1));
  let ws;
  for (let i = 0; i < 150 && !ws; i++) {   // 30 s: a busy machine (other sessions' builds) can take over 10 s to start Chrome
    await sleep(200);
    try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
  }
  if (!ws) { kill(); throw new Error('chrome did not start'); }
  const sock = new WebSocket(ws);
  await new Promise(r => sock.onopen = r);
  let id = 0;
  const pend = new Map(), logs = [];
  sock.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async js => {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const go = async (url, ready = 'window.__ready') => {
    await send('Page.navigate', { url });
    for (let i = 0; i < +(process.env.CDP_READY_POLLS || 100); i++) { await sleep(100); if (await ev(`!!(${ready})`).catch(() => false)) return; }
    throw new Error('not ready: ' + url + '\n' + logs.join('\n'));
  };
  const shot = async (clip) => {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    if (!r.result) throw new Error('screenshot: ' + JSON.stringify(r.error || r) + (clip ? ' clip ' + JSON.stringify(clip) : ''));
    return Buffer.from(r.result.data, 'base64');
  };
  return { send, ev, go, shot, logs, close: () => { sock.close(); kill(); } };
}
