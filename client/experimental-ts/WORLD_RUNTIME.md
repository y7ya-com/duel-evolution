# Streamed source collision and navigation

`WorldRuntime` connects readable hit-map PNGs to the restored collision solver. It owns one scene definition, a bounded LRU of decoded masks, one map cancellation scope, and a bounded worker queue shared by table reads, tile reads and decodes. It owns no asset manager or UI resources.

```
const physics = new WorldRuntime({ assets, crossings: true });
const navigator = new WorldNavigator({
  send: position => session.move(position.x, position.y, position.direction),
  physics,
  onExit: (exit, position) => transition(exit.destination, position),
});
await physics.load(map, arrival, connectionSignal);
navigator.reset(map, arrival);
await physics.prepare(arrival);
navigator.moveTo(target);
// Each browser frame: navigator.update(deltaMs).
// On teardown, dispose both: the navigator does not own the shared physics runtime.
```

The application owns exit latching, destination requests, choosing arrival with `chooseArrival(newMap,oldMap,{crossings:true})`, map resets and connection lifecycle. `onExit(exit,position)` receives `{index,color,destination,source}` and the post-step position; navigation cancels its route before invoking it. The runtime does not invent an arrival, send a packet or initiate a transition. Constructor without `physics` preserves the existing coarse-grid navigation behavior.

`load(map,position,signal?)` reads `data/Map/FieldMapData.txt`, finds `map.name`, then prepares only nearby hit tiles. The signal stays attached for the map's lifetime, including later prefetch; replacing/disposal detaches it. `prepare(position,signal?)` awaits the current foot neighborhood; cancellation of a shared prepare wait leaves map tiles available to other movement ticks. `retry()` clears cached tile failures; a failed scene-table load requires `load` again. `status` exposes `{mapId,loading,pendingTiles,loadedTiles,retainedPixels,error}`. Errors never turn into free pixels.

Default limits: two simultaneous table/read/decode operations (maximum configurable four),16 retained/requested tiles (maximum64),16Mi pixels of retained RGBA-equivalent masks (64MiB, hard maximum64Mi pixels). Encoded leases are released after each decode. The existing decoder separately bounds encoded PNGs and native temporary surfaces. LRU eviction excludes the latest prepared neighborhood, and fails explicitly if that neighborhood cannot fit. Scene geometry bounds total tile keys to256. A map generation check prevents late reads/decodes repopulating a replacement scene. No full map preload or growing route history is retained. Missing masks pause movement while prefetch continues; failed tiles do not repeatedly request assets on every tick.

The prefetch policy covers current avatar height sampling and source foot probes with32pixels of margin; it is a streaming policy, not an original timing constant. Highly unusual supplied parent transforms or tile geometry can exceed the explicit neighborhood budget. Default map shapes are read from the scene table; room/gridless maps can move when collision pixels are available. The source grid assists point-click routing but never overrides actual pixels. A grid-blocked or gridless target may be approached directly under pixel collision. A target behind an impassable wall remains pending until cancelled/replaced, matching continued source walk-to requests; automatic obstacle replanning from pixels is not implemented.

## Verified root world transform

The collision center is not the avatar's network position. `src/avatars/transform.ts` composes the source D3DX row-vector hierarchy:

`root T(-46,-116) * engine mirrorX * avatarLocal * parentWorld`.

Evidence:

- `yo2ChibiAvatarElm.cpp createEngine` sets engine inheritance and root position `(-46,-136)+(0,20)=(-46,-116)`; `switchEngine` mirrors the engine's X scale for facings5..7 and reparents the active engine under the avatar.
- `CElement::updateMatrix` (`yo2Element.cpp`,0x0060fa70) builds local `S*Rz*Ry*Rx*T` and inherited world `local*parentWorld`. Default avatar position is a translation; no automatic collision-centered adjustment occurs.
- Static local PE inspection verifies engine inheritance at0x009ccdc5, root-translation operands at0x009ccdef/0x009ccdf7, and root inheritance at0x00670d5d. Root creation0x006709db calls thunk0x00403a44→`CElement::newChild`0x0060e2c0 with the engine as parent; it is retained in engine+0x350. The clean `footCenter`/`footProbe` functions read this root world matrix and transform `(40,116)` or its ordered radius20circle.

Consequently an unscaled/unrotated player in field-local coordinates has foot center `(position.x-6,position.y)` for normal facings and `(position.x+6,position.y)` for mirrored facings. Mirroring reverses ordered probe geometry. `playerFootTransform` preserves this offset; it must not use the UI preview's recentered foot anchor. Options allow an actual `parentWorld` or nondefault `avatarLocal` matrix. The runtime accepts an actual `footTransform` provider for other parent transforms.

The browser uses a field-local XY frame. With arbitrary shared field translation `(cx,cy)`, root world points gain that translation, and `probeWalls` subtracts the same actual `fieldOrigin`; it cancels exactly. This does not assert that the original scene's camera/world origin was zero. Supply actual field origin and matrix provider if a different parent hierarchy is used. These six-coefficient helpers cover flat XY transforms, not arbitrary 3D perspective or Z→XY rotation. Float32 matrix stores are modeled; complete bit-identical D3DX/x87 transforms and trig are unproven.

## Movement and explicit adaptations

Each30Hz movement tick samples exact ground color at truncated avatar-local XY, normalizes input to6×verified height scale (.7for exact opaque red, otherwise1), smooths with90%previous/10%new, updates facing before obtaining the mirrored root probes, then runs the16probe collision solver. Pre-probe smoothed velocity is retained for subsequent ticks. A collision-modified step is capped at3; only displacement above1.2moves. Exit detection uses the solver's reported prior blocked color; the opt-in crossing patch uses pre-step avatar position, matching its probe-hook location. The exact solver/color constants and its evidence are documented in `src/world/COLLISION.md`.

`navigator.moving` still means a pending route for compatibility. `navigator.walking` reports actual movement on the latest tick, `navigator.waiting` reports missing collision data, and `navigator.error` records an explicit load/callback issue. Use `walking` for the avatar's animation; waiting or blocked movement should stand. Long background frames retain the existing250ms/eight-tick catch-up cap.

Two conservative browser adaptations are explicit: original `walkStep` snaps directly to a target within6before probing; the physics-enabled navigator only snaps when loaded probes confirm it is unobstructed. Physics wire coordinates use source float→int32 truncation, and are published only when the truncated position's source foot circle has no wall hit. This avoids fabricating movement through missing pixels or integer conversion into walls. The source grid-only fallback retains its previous Math.round behavior. These adaptations and coarse routing mean this is not a claim of exact native trajectory parity.

Verification uses synthetic masks, real scene-table parsing and the actual restored solver. Tests cover geometry/mirror/order, shared camera translation cancellation, source speed/height/momentum, collision cap, authoritative exit color, bounded tile eviction/concurrency, map-switch cancellation, late decodes, errors/retry, connection cancellation, gridless navigation, missing-mask pause/resume, blocked grids versus exact pixels, callbacks/resets and disposal. Optional private PE tests inspect instruction operands only; no executable is run and no proprietary masks/binary bytes are embedded in tracked files. Browser decode over real assets, whole-world path reachability, NPC collision differences and full trajectory/visual parity remain separate evidence requirements.
