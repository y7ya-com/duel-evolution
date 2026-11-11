// tools/stack-ready.mjs: waits until the acceptance stack ($ACCEPTANCE_STACK) and the client ($ACCEPTANCE_CLIENT)
// answer, before any test starts. Right after a stack restart wrangler dev listens before the Worker, D1 and
// better-auth are warm, and the first sign-in can take longer than a test's wait. Ready = three rounds in a row of:
// the stack's /api/auth/ok and /api/auth/get-session, a staging test sign-in (better-auth + D1, the path every test
// signs in through), and the client's page and its /api proxy to the stack. Gives up (exit 1) after STACK_READY_S
// (default 180) seconds.
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.env.ACCEPTANCE_STACK ?? '/tmp/local-stack.json', 'utf8'));
const client = process.env.ACCEPTANCE_CLIENT ?? 'http://localhost:5174';
const name = `TestRdy${Date.now().toString(36).slice(-6)}`;   // the stack's test names: Test + 1-12 letters/digits
const limit = Date.now() + 1000 * +(process.env.STACK_READY_S || 180);
const ok = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${url} ${r.status}`); return r; };
const round = async () => {
  await ok(stack.origin + '/api/auth/ok');
  await ok(stack.origin + '/api/auth/get-session', { headers: { Origin: stack.origin } });
  await ok(stack.origin + '/api/de/test-sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: stack.origin, 'x-test-signin': stack.secret }, body: JSON.stringify({ name }) });
  await ok(client + '/');
  await ok(client + '/api/auth/ok');
};
let streak = 0, last = '';
const start = Date.now();
while (streak < 3) {
  try { await round(); streak++; } catch (e) { streak = 0; last = String(e?.message ?? e); }
  if (streak < 3) {
    if (Date.now() > limit) { console.error(`stack not ready after ${Math.round((Date.now() - start) / 1000)} s: ${last}`); process.exit(1); }
    await new Promise(r => setTimeout(r, streak ? 300 : 2000));
  }
}
console.log(`stack ready (${stack.origin}, ${client}) in ${((Date.now() - start) / 1000).toFixed(1)} s`);
