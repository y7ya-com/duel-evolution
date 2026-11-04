// Cosmetic box maths for server/docs/ECONOMY.md: expected MP per new item and to complete each box's pool, with the
// pity rules and duplicate handling of src/game/cosmetics.ts, by seeded Monte Carlo.
//
//   node_modules/.pnpm/node_modules/.bin/vite-node scripts/economy/boxes.ts            (from server/)
//   ECON_SRC=/tmp/econ-head/src ... boxes.ts     (another source tree, e.g. `git archive` of the deployed commit)
//   ECON_SWEEP=1 ... boxes.ts                    (also print the odds/pity grid the proposal was chosen from)
//
// Works with both catalog generations: the deployed one (BOXES with a "hair" box, cosmeticPool by kind) and the
// reworked one (BOX_ECONOMY / DROP_EXCLUSIONS, a "head" box of hair + accessories). The roll follows the reworked
// boxWeights semantics (rarities with no item drop out and the rest renormalise; ultra pity only when the pool has an
// ultra), which is identical to the deployed nextBoxOdds whenever every weighted tier has items.
//
// No production data: it reads the catalog (cosmetics-catalog.ts) and the avatar rows (gamedata/lobby.json) only.
// Writes /tmp/econ-raw/boxes.json (or ECON_OUT) and prints a summary.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Tier = "common" | "rare" | "super" | "ultra";
const TIERS: Tier[] = ["common", "rare", "super", "ultra"];
type Box = { id: string; price: number; weights: Record<Tier, number>; superAt: number | null; ultraAt: number | null };
type Item = { id: string; rarity: Tier };
type Dupes = "none" | "tier"; // "tier": the item is drawn among the rolled tier's UNOWNED items while any remain
const KEYS = ["hair", "dueldisk", "outfit"] as const; // this study's names; the reworked catalog calls "hair" "head"

const SRC = process.env.ECON_SRC ?? new URL("../../src", import.meta.url).pathname;
const OUT = process.env.ECON_OUT ?? "/tmp/econ-raw/boxes.json";
const cat = await import(/* @vite-ignore */ `${SRC}/game/cosmetics-catalog.ts`);
const REWORKED = "DROP_EXCLUSIONS" in cat;
const ROWS = cat.AVATAR_ROWS as Record<string, [number, number, number, number, number, number]>;
const catalogId = (key: string) => (REWORKED && key === "hair" ? "head" : key);
const catalogBox = (key: string): Box => (cat.BOXES as Box[]).find((b) => b.id === catalogId(key))!;

// ---------------------------------------------------------------- pools
const livePool = (key: string, gender: "male" | "female"): Item[] =>
  (cat.cosmeticPool(catalogId(key), gender) as { id: string; rarity: Tier }[]).map(({ id, rarity }) => ({ id, rarity }));

/** The pools after the cosmetics change. The reworked catalog implements it, so its own pool is used. For the deployed
 *  catalog, ECONOMY.md §7's assumptions:
 *  - every box: only designs with BOTH a male and a female variant can drop;
 *  - outfit: no Duel Academy (series 3 / ac_*) artwork, and the excluded Yugi/Tea design stays out;
 *  - hair -> head & hair: the hair families with both bodies plus the slot 2/9 head accessories that exist for both
 *    bodies (paired by name text id). Accessory rarities from their 2008 shop price: 500 MP common/rare, the x3
 *    "present" design (text 3534, 1500 MP) super. */
const ACCESSORY_RARITY: Record<number, Tier> = { 3402: "common", 3404: "rare", 3534: "super" };
function projectedPool(key: string): Item[] {
  if (REWORKED) return livePool(key, "male");
  const both = (cat.COSMETICS as any[]).filter((f) => f.kind === key
    && ["male", "female"].every((g) => f.variants.some((v: any) => v.gender === g))
    && !(key === "outfit" && (cat.OUTFIT_DROP_EXCLUSIONS?.[f.id] || String(f.artwork ?? "").startsWith("ac_")
      || f.variants.every((v: any) => ROWS[String(v.bit)]?.[5] === 3))));
  const items: Item[] = both.map((f) => ({ id: f.id, rarity: f.rarity }));
  if (key === "hair") {
    const texts = new Map<number, Set<number>>();
    for (const [, [, dflt, kind, slot, text]] of Object.entries(ROWS)) {
      if (dflt || ![1, 2].includes(kind) || ![2, 9].includes(slot)) continue;
      (texts.get(text) ?? texts.set(text, new Set()).get(text)!).add(kind);
    }
    for (const [text, kinds] of texts) if (kinds.size === 2) items.push({ id: `head:${text}`, rarity: ACCESSORY_RARITY[text] ?? "common" });
  }
  return items;
}

// ---------------------------------------------------------------- the box
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Next-open weights: empty tiers out; ultra pity (only with an ultra in the pool), then super-or-better pity. */
function weights(box: Box, has: Record<Tier, boolean>, sm: number, um: number): Record<Tier, number> {
  if (box.ultraAt !== null && has.ultra && um >= box.ultraAt - 1) return { common: 0, rare: 0, super: 0, ultra: 1 };
  const pity = box.superAt !== null && sm >= box.superAt - 1;
  return Object.fromEntries(TIERS.map((t) => [t, has[t] && (!pity || t === "super" || t === "ultra") ? box.weights[t] : 0])) as Record<Tier, number>;
}
type Run = { firstSuperPlus: number; firstUltra: number | null; kth: number[]; complete: number | null; tiers: Record<Tier, number>; opened: number };
function run(box: Box, pool: Item[], dupes: Dupes, rnd: () => number, cap = 6000): Run {
  const byTier = Object.fromEntries(TIERS.map((t) => [t, pool.filter((i) => i.rarity === t)])) as Record<Tier, Item[]>;
  const has = Object.fromEntries(TIERS.map((t) => [t, byTier[t].length > 0])) as Record<Tier, boolean>;
  const owned = new Set<string>(), kth: number[] = [], tiers = { common: 0, rare: 0, super: 0, ultra: 0 };
  let sm = 0, um = 0, firstSuperPlus = 0, firstUltra: number | null = null, n = 0;
  while (owned.size < pool.length && n < cap) {
    n++;
    const w = weights(box, has, sm, um), total = TIERS.reduce((s, t) => s + w[t], 0);
    if (!total) throw new Error(`${box.id}: no rollable tier (the server marks the box unavailable)`);
    let roll = rnd() * total, tier: Tier = "common";
    for (const t of TIERS) { roll -= w[t]; if (roll < 0 && w[t] > 0) { tier = t; break; } }
    let choices = byTier[tier];
    if (dupes === "tier") { const fresh = choices.filter((i) => !owned.has(i.id)); if (fresh.length) choices = fresh; }
    const item = choices[Math.floor(rnd() * choices.length)];
    tiers[tier]++;
    if (!owned.has(item.id)) { owned.add(item.id); kth.push(n); }
    if ((tier === "super" || tier === "ultra") && !firstSuperPlus) firstSuperPlus = n;
    if (tier === "ultra" && firstUltra === null) firstUltra = n;
    sm = tier === "super" || tier === "ultra" ? 0 : sm + 1;
    um = tier === "ultra" ? 0 : um + 1;
  }
  return { firstSuperPlus, firstUltra, kth, complete: owned.size === pool.length ? n : null, tiers, opened: n };
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// Daily income benchmarks (analyze.py, 2026-10-29..11-03): median MP on a duel day, and the 75th percentile.
const MEDIAN_DAY = Number(process.env.ECON_MEDIAN_DAY ?? 525), P75_DAY = Number(process.env.ECON_P75_DAY ?? 1100);
function study(label: string, box: Box, pool: Item[], dupes: Dupes, runs = 40000, seed = 20261104) {
  const rnd = mulberry32(seed), rs = Array.from({ length: runs }, () => run(box, pool, dupes, rnd));
  const done = rs.map((r) => r.complete).filter((x): x is number => x !== null);
  const opened = rs.reduce((a, r) => a + r.opened, 0);
  const rate = Object.fromEntries(TIERS.map((t) => [t, +(100 * rs.reduce((a, r) => a + r.tiers[t], 0) / opened).toFixed(1)]));
  const comp = Object.fromEntries(TIERS.map((t) => [t, pool.filter((i) => i.rarity === t).length]));
  const boxes = mean(done), halfN = Math.ceil(pool.length / 2), half = mean(rs.map((r) => r.kth[halfN - 1]));
  const ultra = rs.map((r) => r.firstUltra).filter((x): x is number => x !== null);
  return {
    label, box: box.id, dupes, price: box.price, weights: box.weights, superAt: box.superAt, ultraAt: box.ultraAt,
    pool: { size: pool.length, ...comp }, effective_tier_rate_pct: rate, completed_runs: done.length / runs,
    boxes_to_first_super_or_ultra: +mean(rs.map((r) => r.firstSuperPlus)).toFixed(2),
    boxes_to_first_ultra: ultra.length ? +mean(ultra).toFixed(2) : null,
    boxes_to_half_pool: +half.toFixed(2),
    boxes_to_complete: { mean: +boxes.toFixed(1), p50: pct(done, 0.5), p90: pct(done, 0.9) },
    mp_per_new_item_avg: Math.round(boxes * box.price / pool.length),
    mp_first_half_per_item: Math.round(half * box.price / halfN),
    mp_to_complete: { mean: Math.round(boxes * box.price), p90: pct(done, 0.9) * box.price },
    median_days_to_complete: +(boxes * box.price / MEDIAN_DAY).toFixed(1),
    p75_days_to_complete: +(boxes * box.price / P75_DAY).toFixed(1),
    median_days_per_box: +(box.price / MEDIAN_DAY).toFixed(2),
    duplicate_share: +(1 - pool.length / boxes).toFixed(3),
  };
}

// ---------------------------------------------------------------- the scenarios
/** The proposal (ECONOMY.md §8, economy-prices.json): one odds/pity rule for every box, the price per box. Empty tiers
 *  renormalise away and ultra pity only applies when the pool has an ultra. */
const RULE = { weights: { common: 55, rare: 30, super: 11, ultra: 4 }, superAt: 8, ultraAt: 15 };
const PRICE: Record<string, number> = { hair: 500, dueldisk: 1000, outfit: 1200 };
const proposed = (key: string): Box => ({ id: key, price: PRICE[key], ...RULE });
const out: any[] = [];
for (const key of KEYS) {
  const b = catalogBox(key), gl = livePool(key, "male"), gf = livePool(key, "female"), proj = projectedPool(key);
  out.push(study("catalog pool (male), catalog box", b, gl, "none"));
  if (gf.length !== gl.length) out.push(study("catalog pool (female), catalog box", b, gf, "none"));
  if (!REWORKED) out.push(study("projected pool, catalog box", b, proj, "none"));
  out.push(study("projected pool, proposed box", proposed(key), proj, "none"));
  out.push(study("projected pool, proposed box + tier dupe protection", proposed(key), proj, "tier"));
  // Proposed rarity cap for disks: only the Gold colourways are ultra; any other ultra-tier disk becomes super.
  if (key === "dueldisk" && proj.filter((i) => i.rarity === "ultra").length > 4) {
    const name = (id: string) => String((cat.COSMETICS as any[]).find((f) => f.id === id)?.name ?? "");
    const golds = proj.map((i) => (i.rarity === "ultra" && !/Gold/.test(name(i.id)) ? { ...i, rarity: "super" as Tier } : i));
    out.push(study("golds-only ultra, proposed box", proposed(key), golds, "none"));
    out.push(study("golds-only ultra, proposed box + tier dupe protection", proposed(key), golds, "tier"));
  }
}
if (process.env.ECON_SWEEP) {
  const W: Record<string, Record<Tier, number>> = { "79/15/5/1": { common: 79, rare: 15, super: 5, ultra: 1 },
    "60/30/8/2": { common: 60, rare: 30, super: 8, ultra: 2 }, "55/30/11/4": { common: 55, rare: 30, super: 11, ultra: 4 },
    "50/30/14/6": { common: 50, rare: 30, super: 14, ultra: 6 }, "50/30/12/8": { common: 50, rare: 30, super: 12, ultra: 8 } };
  for (const key of KEYS) {
    const proj = projectedPool(key);
    for (const [wn, w] of Object.entries(W)) for (const superAt of [8, 10]) for (const ultraAt of [10, 15, 20]) for (const dupes of ["none", "tier"] as Dupes[]) {
      const s = study("sweep", { id: key, price: 1, weights: w, superAt, ultraAt }, proj, dupes, 6000);
      console.log(`sweep ${key.padEnd(8)} w ${wn.padEnd(10)} superAt ${superAt} ultraAt ${String(ultraAt).padEnd(3)} dupes ${dupes.padEnd(4)}`
        + ` 1stU ${String(s.boxes_to_first_ultra).padEnd(5)} half ${String(s.boxes_to_half_pool).padEnd(5)} complete ${s.boxes_to_complete.mean} p90 ${s.boxes_to_complete.p90}`);
    }
  }
}
const pools = Object.fromEntries(KEYS.map((key) => [key, {
  catalog_male: livePool(key, "male").map((i) => `${i.id}:${i.rarity[0]}`), catalog_female: livePool(key, "female").map((i) => `${i.id}:${i.rarity[0]}`),
  projected: projectedPool(key).map((i) => `${i.id}:${i.rarity[0]}`) }]));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ src: SRC, reworked_catalog: REWORKED, median_day: MEDIAN_DAY, p75_day: P75_DAY,
  catalog_boxes: KEYS.map(catalogBox), proposed: KEYS.map(proposed), pools, scenarios: out }, null, 1));
console.log(`catalog: ${SRC} (${REWORKED ? "reworked" : "deployed"} generation)`);
for (const [k, v] of Object.entries(pools)) console.log(`pool ${k}: ${v.projected.join(" ")}`);
for (const s of out) console.log(`${s.box.padEnd(8)} ${s.label.padEnd(52)} price ${String(s.price).padStart(4)} pool ${s.pool.size} (${s.pool.common}/${s.pool.rare}/${s.pool.super}/${s.pool.ultra})`
  + ` rate ${TIERS.map((t) => s.effective_tier_rate_pct[t]).join("/")} 1stSU ${s.boxes_to_first_super_or_ultra} 1stU ${s.boxes_to_first_ultra}`
  + ` complete ${s.boxes_to_complete.mean} (p90 ${s.boxes_to_complete.p90}) = ${s.mp_to_complete.mean} MP, ${s.mp_per_new_item_avg}/item,`
  + ` half ${s.mp_first_half_per_item}/item, dupes ${s.duplicate_share}, ${s.median_days_to_complete} med-days / ${s.p75_days_to_complete} p75-days`);
