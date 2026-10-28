// Node host for the duel engine (vitest, scripts): reads gamedata/engine/ (scripts/engine_gamedata.mjs) and compiles
// ocgcore-wasm's own lib/ocgcore.sync.wasm, the same bytes the library embeds, through the same instantiateWasm path
// workerd uses.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DuelCore, type EngineData } from "./core.ts";

/** server/gamedata/engine */
export const ENGINE_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "gamedata", "engine");

export function loadEngineData(dir = ENGINE_DATA_DIR): EngineData {
  return {
    cards: JSON.parse(readFileSync(join(dir, "cards.json"), "utf8")),
    strings: JSON.parse(readFileSync(join(dir, "strings.json"), "utf8")),
    scripts: new Uint8Array(readFileSync(join(dir, "scripts.pack"))),
  };
}

export function loadWasmModule(): WebAssembly.Module {
  const path = createRequire(import.meta.url).resolve("ocgcore-wasm/lib/ocgcore.sync.wasm");
  // (workers-types declares WebAssembly.Module abstract; Node compiles from bytes fine)
  const Module = WebAssembly.Module as unknown as new (bytes: Uint8Array) => WebAssembly.Module;
  return new Module(readFileSync(path));
}

export function createNodeDuelCore(dir = ENGINE_DATA_DIR): Promise<DuelCore> {
  return DuelCore.create({ data: loadEngineData(dir), wasm: loadWasmModule() });
}
