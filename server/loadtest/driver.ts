// Load driver (loadtest/README.md): POST /run fans the simulated players out over LoadDOs (`per` each, so no single
// isolate's CPU or connection limit is what's measured), each signs its players in through the test sign-in of the
// load-test server (service binding TARGET, never production) and runs them; the answer is the merged summary.
import { DurableObject } from "cloudflare:workers";
import { merge, newStats, npcDueler, pvpPair, Sim, summary, walker, type Plan, type Stats } from "./sim.ts";

interface Env { LOAD: DurableObjectNamespace<LoadDO>; TARGET: Fetcher; LOAD_KEY: string; TEST_SIGNIN_SECRET: string }
const ORIGIN = "https://load.invalid"; // the load server's PUBLIC_ORIGIN (target.jsonc)
interface Job extends Plan { tag: string; from: number; count: number; n: number; pvp: number; npcs: number; rampS: number }

export class LoadDO extends DurableObject<Env> {
  private async connect(name: string, st: Stats): Promise<Sim | null> {
    const h = { "Content-Type": "application/json", Origin: ORIGIN, "x-test-signin": this.env.TEST_SIGNIN_SECRET };
    const r = await this.env.TARGET.fetch("https://load.invalid/api/de/test-sign-in", { method: "POST", headers: h, body: JSON.stringify({ name }) });
    const cookie = (r.headers.getSetCookie?.() ?? [r.headers.get("Set-Cookie") ?? ""]).map((c) => c.split(";")[0]).join("; ");
    if (r.status !== 200 || !cookie.includes("session_token")) { st.errors[`signin${r.status}`] = (st.errors[`signin${r.status}`] ?? 0) + 1; return null; }
    const w = await this.env.TARGET.fetch("https://load.invalid/net", { headers: { Upgrade: "websocket", Origin: ORIGIN, Cookie: cookie } });
    const ws = w.webSocket;
    if (!ws) { st.errors[`ws${w.status}`] = (st.errors[`ws${w.status}`] ?? 0) + 1; return null; }
    ws.accept();
    (ws as unknown as { binaryType: string }).binaryType = "arraybuffer"; // newer compat dates default to Blob
    return new Sim(ws, name, st);
  }

  override async fetch(req: Request): Promise<Response> {
    const j = (await req.json()) as Job;
    const st = newStats();
    const runs: Promise<unknown>[] = [];
    const sims = new Map<number, Promise<Sim | null>>();
    const start = (g: number) => {
      const p = new Promise<void>((r) => setTimeout(r, (g / j.n) * j.rampS * 1000)).then(async () => {
        const s = await this.connect(`TestL${j.tag}${g}`, st);
        if (s && !(await s.login(`L${j.tag}${g}`))) { try { s.ws.close(); } catch { /* gone */ } return null; }
        return s;
      });
      sims.set(g, p);
      return p;
    };
    for (let g = j.from; g < j.from + j.count; g++) {
      // roles by global index: the first `pvp` players are pairs (2k, 2k+1), the next `npcs` duel NPCs, the rest walk
      if (g < j.pvp) {
        if (g % 2 === 1) continue;
        const a = start(g), b = start(g + 1);
        runs.push(Promise.all([a, b]).then(([x, y]) => x && y && pvpPair(x, y, j)));
      } else {
        const p = start(g);
        runs.push(p.then((s) => s && (g < j.pvp + j.npcs ? npcDueler(s, j) : walker(s, j))));
      }
    }
    await Promise.all(runs.map((r) => r.catch((e) => { st.errors[`throw:${String(e).slice(0, 60)}`] = 1; })));
    st.counts.connected = (await Promise.all(sims.values())).filter(Boolean).length;
    for (const s of await Promise.all(sims.values())) try { s?.ws.close(); } catch { /* gone */ }
    return Response.json(st);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get("x-load-key") !== env.LOAD_KEY) return new Response("not found", { status: 404 });
    if (url.pathname !== "/run" || req.method !== "POST") return new Response("POST /run", { status: 400 });
    const b = (await req.json()) as Job & { per: number };
    const tag = b.tag ?? Math.random().toString(36).slice(2, 6);
    const per = b.per ?? 4, jobs: Job[] = [];
    for (let from = 0; from < b.n; from += per) jobs.push({ ...b, tag, from, count: Math.min(per, b.n - from) });
    const t0 = Date.now();
    const all = await Promise.all(jobs.map((job, i) =>
      env.LOAD.get(env.LOAD.idFromName(`${tag}-${i}`)).fetch("https://do/", { method: "POST", body: JSON.stringify(job) })
        .then((r) => r.json() as Promise<Stats>).catch((e) => ({ ...newStats(), errors: { [`do:${String(e).slice(0, 60)}`]: 1 } }))));
    return Response.json({ tag, n: b.n, per, wallS: (Date.now() - t0) / 1000, ...summary(merge(all)) });
  },
};
