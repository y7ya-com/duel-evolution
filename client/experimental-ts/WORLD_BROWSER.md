# Optional real-mask browser evidence

Run this file alone, after other Chromium checks have closed:

```
YO2_ASSET_URL=https://original.ygoevolution.com/game/ node tools/run.mjs vitest run tests/world-browser.test.ts --reporter=dot
```

Without an explicit `YO2_ASSET_URL`, the test visibly skips and neither launches a browser nor reads original archives. Generate the ignored `public/world-maps.json` first with the existing `tools/world.mjs` workflow. Vite resolves from the project's or existing sibling development dependency installation; no new package is required. The ephemeral Vite server uses `configFile:false`, loopback and port 0, a blank test page, and the bounded development-only remote asset middleware. It does not import application main, authenticate, create a game session, or start a server authority. The existing Chromium launcher enforces its memory admission guard; do not bypass it or run concurrent browser workloads.

The browser loads the production `AssetManager`, `WorldRuntime`, `WorldNavigator` and collision modules directly. It reads only finite original archive ranges through same-origin `/game-assets/merge.dat`. The middleware refuses a missing Range before any upstream read; each accepted range is limited to 8 MiB, the full workload must remain below 32 MiB, and no full-archive fallback exists.

## Independent checks

- The actual room hit-map PNG is decoded independently with `createImageBitmap` and a readable canvas. Sampled RGBA bytes are converted directly to ARGB and compared with production `decodeCollisionMask`, including every actual exit-colored pixel. This checks real browser PNG decoding and channel handling. Both paths share the platform PNG decoder; it is not an independent PNG decompression implementation. In particular, canvas removes hidden RGB under alpha 0; opaque wall/exit/height markers are unaffected.
- A separate implementation of the source root offset, mirror and 16 ordered radius 20 probes scans the decoded pixels. No authored coordinates, rectangles, stored map grid or runtime `canPublish` call is used to discover the test corridor, wall, or facing-sensitive boundary. Runtime normal/mirrored publication decisions must agree at the discovered boundary.
- The production navigator walks a discovered 48 pixel clear corridor with coarse grid assistance disabled for this isolated physics actor. Every emitted coordinate's probes are independently sampled against the decoded original mask; no wall/exit overlap or segment of 8 pixels or more is accepted. The destination must complete without a new click or teleport.
- Independently clear pre-step positions near actual blue/cyan exit pixels are discovered from the PNG. Production stepping must report a physical wall hit and map the reported exit index to the current source map entry's destination. An observed room exit that maps back to map 8 establishes the index-to-destination mapping; it does not establish a completed area/network transition.
- A separate real world map is prepared near its source arrival, then probed at a distant unloaded tile. The first step must preserve position and momentum while waiting; explicit preparation must make that same region available. It does not assert the distant region is walkable.
- Ten alternating real map reloads must stay within the configured 8 tile / 4 Mi-pixel runtime budget. Native ImageBitmap counts, encoded asset leases, object URL creation/revocation, pending tile work, retained masks and encoded cache bytes are measured. All owned resources must close on disposal. A post-GC JS heap bound checks that the isolated run retains less than 16 MiB over the blank-page baseline. This is not a GPU/native process memory measurement or a long-session acceptance threshold.

Source movement/root/collision details and explicit short-snap/wire-coordinate adaptations are documented in `WORLD_RUNTIME.md` and `src/world/COLLISION.md`. Static PE recovery established the transform and solver; this browser test never reads or executes the executable. No original PNG bytes, map grids or discovered coordinates are embedded in tracked files. Only aggregate evidence is written to `/tmp/duel-ts-world-browser-evidence.json`.

## Observed run, 2026-11-04

Chromium 156.0.8078.4 passed in 6.5 seconds after the prior desktop/mobile browser process closed. The source room mask was 1024×768. The check compared 7,392 pixels, including 2,826 blue and 3,034 cyan exit pixels. Its histogram also contained 616,534 opaque black and 164,038 transparent pixels. No opaque red height pixel occurred; the .7 height-scale region therefore remains source/static/unit evidence, not an observed real-mask browser traversal.

The discovered corridor completed in 16 ticks with 14 wire positions; the maximum emitted segment was 5 pixels and every independently checked published foot probe was clear. Facing-dependent boundary behavior matched. One actual exit index 0 mapped to destination 8. Missing world-map tiles paused and resumed correctly.

Across ten reloads the maximum retained runtime masks were 786,432 pixels and 3 tiles, with peak 1 live ImageBitmap and 3 encoded leases. The asset cache held 3,992,560 charged bytes. Disposal left 0 leases, 0 bitmaps and 0 object URLs; all 5 created URLs were revoked. The run read 7 ranges totaling 5,220,172 bytes and measured 679,980 bytes of post-GC JS heap growth. These are measurements from this workload, not broader parity percentages.

Not established: full-world reachability, every exit, actual red-region traversal, original trajectory/animation equivalence, NPC collision, integrated UI placement, game authority/outcomes, multiplayer movement, production authentication, mobile interaction, browser-soak behavior or native/GPU memory parity. Separate integrated application and game tests remain necessary.
