# World integration API

Import extensionless from `./world` (src/world/index.ts).

```ts
const maps = await loadWorldMaps('/world-maps.json', { signal });
const map = maps.maps.find(m => m.id === area);
const navigator = new WorldNavigator({ send: ({x, y, direction}) => session.move(x, y, direction) });
navigator.reset(map!, { x, y, direction }); // authoritative scene/player entry, cancels old route
navigator.moveTo({ x: clickX, y: clickY }); // boolean: false if invalid/blocked/unreachable/no grid
navigator.update(deltaMs); // call from app RAF; fixed 30 Hz source movement, bounded catch-up
const position = navigator.position; // {x,y,direction} | null; floating map pixels
const walking = navigator.moving;
navigator.cancel(); // stops immediately; no extra send
navigator.dispose(); // idempotent, no later sends
```

`send` receives rounded integer map-pixel coordinates with direction 0..7 when the rounded position or facing changes. Position remains local floating precision. A scene reset never sends or silently relocates a blocked spawn; movement from blocked spawns is refused. No timer/global runtime is created. Map 8/9 have no source walk grids: no invented free walk.

`WorldMap`: `{id,name,width:number|null,height:number|null,grid:WalkGrid|null,entries:MapEntry[],exits:MapExit[],npcSpots:NpcSpot[]}`. `WalkGrid`: `{width,height,rows:readonly string[]}` in 20-pixel cells. `MapEntry`: `{from,x,y,direction}` (C++ arrival positions, NOT exit triggers). `MapExit`: `{to:number}` known reciprocal map adjacency, no invented trigger position. `NpcSpot`: `{spot,x,y,direction}` where source known; otherwise empty. `parseWorldMaps(unknown)` validates bounded version-1 JSON. `loadWorldMaps(url?, {fetch?,signal?}?)` fetches bounded JSON. `findPath(grid,start,target,maxVisited?)` returns map-pixel waypoints excluding start, or null; `isWalkable(grid,point)`, `cellCenter(x,y)`, `nearBlocked(grid,x,y)`, `directionFromVector(dx,dy)` are public pure helpers.

Run `node tools/world.mjs` to generate private `public/world-maps.json` from the existing C++ table and grid rows. Parent owns ignoring this generated asset. No proprietary grid is embedded in tracked TS or tests.

Source movement: `Avatar/yo2ChibiAvatarElm.cpp` moveStep normalizes to 6 pixels/update, keeps 0.9 of previous velocity and adds 0.1 desired velocity, suppresses steps <=1.2 px; walkStep snaps under 6 pixels. `System/yo2App.h` documents 30 fps. Nominal ground scale 1 gives 180 px/s after ramp-up. Field height/probe implementations remain unavailable clean source; this implementation uses scale 1, bounded cell collision and safe segment checks, and may conservatively stop/route differently. C++ colored wall pixels identify exits, and foot-circle probes have radius 20: mask cells alone cannot reproduce those behaviors. No pixel probe, exit-trigger detection, map art, animation, height scaling or original path-search parity is claimed. Visual map dimensions for gridless maps remain unknown. Automatic scene transitions stay with parent/server.

## Final behavior and limits

Implementation is complete. Synthetic and direct C++ source comparison tests are in `tests/world.test.ts` and `tests/world-source.test.ts`. Run `node tools/run.mjs vitest run tests/world.test.ts tests/world-source.test.ts` (21 tests). Source comparison reads the repository C++/inc files directly; tests do not depend on a generated private JSON fixture.

Pathfinding uses bounded, deterministic cardinal BFS, then removes collinear waypoints. Default expansion budget is 65536 (maximum permitted grid cell count), and caller `maxVisited` is an integer 1..65536. Parsed grids are 1..256 cells on each axis, frozen along with their rows. The navigator does not reinterpret a blocked target as some other destination. Both local steps and rounded outgoing positions undergo supercover segment collision checks; diagonal corner touches are conservatively blocked. The original 20-pixel-radius avatar foot probes and wall sliding are not reproduced. At route corners, velocity is cleared to keep smoothing from cutting a wall; straight runs retain source acceleration. A target less than 6 pixels away snaps only after segment validation, matching the source arrival threshold. The final facing follows the arrival segment, as click targets have no explicit arrival-facing parameter.

`reset` accepts authoritative pixel coordinates (0..65535) and direction (integer 0..7), even when the spawn cell is blocked or the map has no grid. That state remains visible but cannot initiate a route. No automatic nearest-cell warp occurs. `moveTo` replaces/cancels the old route even when the new request fails. `cancel` preserves current position and facing. Methods after disposal cannot send or resume movement; `position` becomes null. `update` rejects nonfinite/negative deltas, advances fixed 1000/30 ms steps, clamps a single input delta to 250 ms, and performs at most eight steps per call. A hidden-tab pause cannot trigger a long teleport/catch-up sequence. The injected send callback is synchronous and its exceptions propagate to the caller; handle transport errors in the app callback.

The source arrival table includes `from:11` reserved entries and `from:12` END sentinels. Extraction stops at the first END (or ten entries) and retains 11 as metadata; it is not a map id. `exits` are adjacency inferred from other maps' arrival entries, not physical trigger locations; duel room routing is dynamic and cannot be inferred as ordinary walk exits. `entries` are arrival positions and must not be rendered as exit buttons/trigger coordinates. `npcSpots` is empty: the named clean map sources do not contain NPC spot coordinates; server spot IDs alone do not establish positions. There are no invented NPC placements. No local FieldMapData.txt/archive was available in the workspace, so map tile/object metadata extraction is deferred; source art is not replaced by invented original map metadata.

JSON fetch uses a 1 MiB streamed byte limit, validates UTF-8/JSON/version/record bounds and freezes parsed metadata. It accepts at most ten unique ids 0..9 and ten arrival/exit records per map. Grid dimensions must match pixel dimensions exactly; gridless map pixel dimensions remain null. Missing or invalid data rejects instead of opening an unbounded/walk-anywhere fallback. `loadWorldMaps` takes an optional `AbortSignal`, and canceling fetch is owned by the caller.

Generated file: `public/world-maps.json` (74783 bytes; rebuild after source map changes). It is private local output and is currently covered by the parent-owned `.gitignore`. No guest/WASM/System runtime, native bootstrap, rendering surface, timer, or global hook is used by this module.
