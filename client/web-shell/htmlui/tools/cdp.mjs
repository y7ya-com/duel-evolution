// A headless Chrome for Testing over CDP, for the htmlui tools (mockshot.mjs, flip.mjs). No visible window; refuses
// to start with under 25 % memory free (buildslot admits the whole run at 35 %) (the shared Mac's rule). CHROME=<binary> to pick another build.
import { spawn, execSync } from 'node:child_process';
import { rmSync, readdirSync } from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = readdirSync(base).filter(d => d.startsWith('chromium-')).sort().pop();
  return `${base}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
}

export async function launch({ port = 9480 + (process.pid % 100), dpr = 1, width = 1024, height = 768, mobile = false } = {}) {
  const free = +(/free percentage: (\d+)%/.exec(execSync('memory_pressure').toString())?.[1] ?? 100);
  if (free < 25) throw new Error(`only ${free}% memory free`);
  // this port's Chrome from a run that died without cleaning up (ports are per slot or per pid): never another port's
  try { execSync(`pkill -9 -f -- '--remote-debugging-port=${port} '`); } catch {}
  const profile = '/tmp/htmlui-chrome-' + process.pid;
  const ch = spawn('nice', ['-n', '10', chromePath(), '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--use-angle=metal', 'about:blank'], { stdio: 'ignore' });
  // the trailing space in the pkill pattern above needs an argument after the port: --user-data-dir follows it
  const kill = () => { ch.kill('SIGKILL'); try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {} };
  process.on('exit', kill);
  // a SIGTERM / SIGINT (a stopped run, buildslot, Ctrl-C) ends the process without 'exit' handlers: make it an exit
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) if (!process.listenerCount(sig)) process.on(sig, () => process.exit(1));
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
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
    for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`!!(${ready})`).catch(() => false)) return; }
    throw new Error('not ready: ' + url + '\n' + logs.join('\n'));
  };
  const shot = async (clip) => {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    if (!r.result) throw new Error('screenshot: ' + JSON.stringify(r.error || r) + (clip ? ' clip ' + JSON.stringify(clip) : ''));
    return Buffer.from(r.result.data, 'base64');
  };
  return { send, ev, go, shot, logs, close: () => { sock.close(); kill(); } };
}
