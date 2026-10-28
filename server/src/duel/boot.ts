// workerd boot of the duel engine (do.ts): the engine data (gamedata/engine: cards.json, strings.json and the ~20 MB
// scripts.pack, rebuilt by scripts/engine_gamedata.mjs) is read from R2 under ENGINE_PREFIX; ocgcore.sync.wasm comes
// precompiled in the bundle. Created once, asynchronously; every command after that is synchronous.
import { createWorkerdDuelCore, loadEngineDataR2 } from "./engine/workerd.ts";
import { brainDb, cardmap, duelCore, setDuelCore } from "./data.ts";

/** R2 key prefix of the engine data (parity/run.py and DEPLOY.md upload it there). */
export const ENGINE_PREFIX = "duel-evolution/engine/";

export async function bootDuel(bucket: R2Bucket | undefined, log: (s: string) => void = () => {}): Promise<void> {
  if (duelCore()) return;
  const t0 = Date.now();
  try {
    if (!bucket) throw new Error("no BUCKET binding: the engine data lives in R2");
    setDuelCore(await createWorkerdDuelCore(await loadEngineDataR2(bucket, ENGINE_PREFIX)));
    cardmap();
    brainDb();
    log(`[ocg] duelcore y CardMap listos (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`[ocg] no arranca duelcore: ${(e as Error)?.stack ?? e}`);
  }
}
