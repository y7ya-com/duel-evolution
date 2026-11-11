import { afterEach, expect, it } from "vitest";
import SD from "../gamedata/shop.json";
import RARITIES from "../data/card-rarities.json";
import { SHOP_ROTATION as config, packRotation, packInRotation, rotationUpdate, shopCatalog } from "../src/game/shop.ts";
const day = 86400, epoch = Date.parse(config.epoch) / 1000;
const pools = SD.iid as Record<string, number[]>;
afterEach(() => { config.forceOn = []; config.forceOff = []; });
it("opens with the requested three 2008 sets, then the best-covered Lightsworn engine", () => {
  expect(config.themes[0].highlighted.slice().sort()).toEqual([46, 47, 48]);
  expect(config.themes[1].theme).toBe("Lightsworn");
});
it("highlights reproducibly maximize UR/SR core coverage for every theme", () => {
  for (const theme of config.themes) {
    expect(theme.highlighted.length).toBeGreaterThan(0);
    expect(theme.highlightCount).toBeLessThanOrEqual(config.highlightLimit);
    const left = new Set(theme.core), chosen: number[] = [];
    for (const pc of left) expect(["UR", "SR"]).toContain((RARITIES.rarity as Record<string, string>)[pc]);
    for (let n = 0; n < theme.highlightCount; n++) {
      const score = (id: number) => [...left].filter(pc => pools[id].includes(pc)).length;
      const best = Array.from({ length: 48 }, (_, i) => i + 1).filter(id => !chosen.includes(id))
        .sort((a, b) => score(b) - score(a) || Number(b >= 33) - Number(a >= 33) || a - b)[0];
      if (!score(best)) break;
      chosen.push(best); for (const pc of pools[best]) left.delete(pc);
    }
    expect(theme.highlighted).toEqual(chosen);
  }
});
it("loops deterministically, covers all rotating packs, and keeps fillers available for their full 28 days", () => {
  const seen = new Set<number>();
  for (let step = 0; step < config.themes.length; step++) {
    const start = epoch + step * config.updateDays * day, theme = config.themes[step];
    expect(rotationUpdate(start).update).toMatchObject({ index: step, theme: theme.theme, highlighted: theme.highlighted });
    expect(rotationUpdate(start)).toEqual(rotationUpdate(start));
    expect(rotationUpdate(start + config.themes.length * config.updateDays * day).update.theme).toBe(theme.theme);
    for (const id of theme.highlighted) for (let d = 0; d < config.updateDays; d++) expect(packRotation(id, start + d * day).highlighted).toBe(true);
    for (const id of theme.filler) {
      seen.add(id);
      for (let d = 0; d < config.fillerDays; d++) expect(packInRotation(id, start + d * day)).toBe(true);
    }
    const previous = config.themes[(step + config.themes.length - 1) % config.themes.length].filler;
    for (let d = 0; d < config.updateDays; d++) {
      const expected = [...new Set([...previous, ...theme.filler, ...theme.highlighted])].filter(id => config.pool.includes(id)).sort((a,b) => a-b);
      expect(config.pool.filter(id => packInRotation(id, start + d * day))).toEqual(expected);
      expect(expected.length).toBeLessThanOrEqual(7);
      expect(expected.length).toBeGreaterThanOrEqual(4);
    }
  }
  expect([...seen].sort()).toEqual([...config.pool].sort());
});
it("labels exact filler entry, leaving and expiry boundaries and protects permanent shelves", () => {
  const id = config.themes[0].filler[0], endsAt = new Date((epoch + config.fillerDays * day) * 1000).toISOString();
  expect(packRotation(id, epoch)).toMatchObject({ group: "update", endsAt, highlighted: false });
  expect(packRotation(id, epoch + 14 * day)).toMatchObject({ group: "always", endsAt });
  expect(packRotation(id, epoch + 25 * day - 1).group).toBe("always");
  expect(packRotation(id, epoch + 25 * day)).toMatchObject({ group: "leaving", endsAt });
  expect(packRotation(id, epoch + 28 * day).group).toBe("out");
  for (const now of [epoch, epoch + 99 * day]) for (const pid of [...config.classics, ...config.beginnerPacks, 7001, 8006]) expect(packRotation(pid, now)).toMatchObject({ group: "always", endsAt: null });
  expect(rotationUpdate(epoch).nextUpdateAt).toBe(new Date((epoch + config.updateDays * day) * 1000).toISOString());
});
it("applies immediate overrides, forceOff precedence, and protects permanent shelves", () => {
  config.forceOff = [23, 1, 1001, 7001]; config.forceOn = [23];
  expect(packInRotation(23, epoch)).toBe(false);
  for (const id of [1, 1001, 7001]) expect(packInRotation(id, epoch)).toBe(true);
  config.forceOff = []; expect(packInRotation(23, epoch + 28 * day)).toBe(true);
});
it("keeps catalogue ids stable across dates, hidden packs and following catalogue rows", () => {
  let now = epoch;
  const g = { clock: { time: () => now }, admin: { data: { prices: {} } } } as any;
  const rows = () => new Map(shopCatalog(g, null).map(r => { const v = new DataView(r.buffer, r.byteOffset); return [`${r[4]}:${v.getUint32(5)}`, v.getUint32(0)]; }));
  const first = rows();
  expect(first.get("1:46")).toBe(58); expect(first.get("1:47")).toBe(59); expect(first.get("1:48")).toBe(60);
  expect(first.get("1:1001")).toBe(46); expect(first.get("1:7001")).toBe(49);
  now += 14 * day; const second = rows();
  config.forceOn = [...config.pool]; const all = rows();
  for (const [key, id] of [...first, ...second]) expect(id).toBe(all.get(key));
  expect([...first.keys()]).not.toEqual([...second.keys()]);
});
