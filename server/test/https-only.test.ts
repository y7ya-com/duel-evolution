// src/https.ts (worker.ts): the game hosts are https only, and their responses carry HSTS so a browser never tries
// http again (plain http can't be cross-origin isolated: "blocked: shared-memory", 2026-11-01).
import { expect, it } from "vitest";
import { HSTS, toHttps, withHsts } from "../src/https.ts";

const HOSTS = new Set(["ygoevolution.com", "original.ygoevolution.com"]);

it("http on a game host 301s (308 for a POST) to the same https URL; https responses get HSTS; other hosts and a 101 untouched", () => {
  for (const h of HOSTS) {
    const g = toHttps(new Request(`http://${h}/x?y=1`), HOSTS)!;
    expect([g.status, g.headers.get("location")]).toEqual([301, `https://${h}/x?y=1`]);
    const p = toHttps(new Request(`http://${h}/api/de/register`, { method: "POST", body: "{}" }), HOSTS)!;
    expect([p.status, p.headers.get("location")]).toEqual([308, `https://${h}/api/de/register`]);
    expect(toHttps(new Request(`https://${h}/`), HOSTS)).toBeNull();
    expect(withHsts(new Request(`https://${h}/`), new Response("ok"), HOSTS).headers.get("strict-transport-security")).toBe(HSTS);
  }
  expect(toHttps(new Request("http://127.0.0.1:8787/"), HOSTS)).toBeNull();
  expect(withHsts(new Request("http://127.0.0.1:8787/"), new Response("ok"), HOSTS).headers.get("strict-transport-security")).toBeNull();
  const ws = { status: 101 } as Response;
  expect(withHsts(new Request("https://ygoevolution.com/net"), ws, HOSTS)).toBe(ws);
});
