// workerd host for the duel engine. workerd cannot compile wasm from bytes, so ocgcore.sync.wasm comes in as a
// PRECOMPILED module through wrangler's default CompiledWasm rule (`import x from "*.wasm"`), here for
// ocgcore-wasm 0.1.2. The data (gamedata/engine/, built
// by scripts/engine_gamedata.mjs) is too big to bundle (scripts.pack ~20 MB): the host reads it from R2.
import wasm from "ocgcore-wasm/lib/ocgcore.sync.wasm";
import { DuelCore, type EngineData } from "./core.ts";

export { wasm as ocgcoreWasm };

/** Engine data from an R2 bucket holding cards.json, strings.json and scripts.pack under `prefix`. */
export async function loadEngineDataR2(bucket: R2Bucket, prefix = "engine/"): Promise<EngineData> {
  const get = async (name: string) => {
    const obj = await bucket.get(prefix + name);
    if (!obj) throw new Error(`engine data missing in R2: ${prefix}${name} (scripts/engine_gamedata.mjs, then upload)`);
    return obj;
  };
  const [cards, strings, scripts] = await Promise.all([get("cards.json"), get("strings.json"), get("scripts.pack")]);
  return { cards: await cards.json(), strings: await strings.json(), scripts: new Uint8Array(await scripts.arrayBuffer()) };
}

export function createWorkerdDuelCore(data: EngineData): Promise<DuelCore> {
  return DuelCore.create({ data, wasm: wasm as WebAssembly.Module });
}
