// The alignment checks (cosmetics/align.js) on the running game: attaches to a kept flip page's DevTools, measures the
// cosmetics screen that is up, prints each check (game px) and exits 1 when one is off by more than 1 px.
//   node client/web-shell/htmlui/cosmetics/align_check.mjs [--port=9443] [--label=NAME] [--json=out.json] [--all]
// --all: every check, not only the failures. The page must be the game (tools/flip.mjs --keep; a slot's DevTools port).
import { writeFileSync } from 'node:fs';
const opt = k => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const port = +(opt('port') || process.env.CDP_PORT || 9443), label = opt('label') || '';
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page');
if (!page) { console.error('no page on DevTools port', port); process.exit(2); }
const sock = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no; });
let id = 0;
const pend = new Map();
sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const r = await send('Runtime.evaluate', { expression: `import('/htmlui/cosmetics/align.js').then(m => m.checkAlign())`, awaitPromise: true, returnByValue: true });
sock.close();
const res = r.result?.result?.value;
if (!res) { console.error(JSON.stringify(r.result?.exceptionDetails || r).slice(0, 800)); process.exit(2); }
const bad = res.checks.filter(c => !c.ok);
console.log(`${label || res.screen || 'no cosmetics screen'}: ${res.checks.length - bad.length}/${res.checks.length} within 1 px${bad.length ? '' : ' (all)'}`);
for (const c of process.argv.includes('--all') ? res.checks : bad) console.log(`  ${c.ok ? 'ok ' : 'OFF'} ${c.name}: ${JSON.stringify(c.got)}${c.want !== undefined ? ' vs ' + JSON.stringify(c.want) : ''}`);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ label, ...res }, null, 1));
process.exit(res.screen && !bad.length ? 0 : 1);
