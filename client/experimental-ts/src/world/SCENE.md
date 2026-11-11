# Scene integration

Import directly, extensionless, from `./world/scene` and `./world/camera`; existing world barrel is outside this task's ownership.

```ts
const loader = new SceneLoader({ assets }); // Pick<AssetManager, 'readScene'>
const scene = await loader.load(mapId, signal); // metadata only
const camera = new WorldCamera({ width: scene.definition.width, height: scene.definition.height });
camera.follow(player); // original logical viewport: 1024 × 768
const next = await scene.frame(camera.viewport, signal);
// Render next.tiles, next.objects, then next.frontObjects in their appropriate layers.
// Positions are world pixels; screen position = position - next.viewport origin.
// Detach the previous frame's images, then previous.release().
// Each frame owns its URLs until release(), scene.dispose(), or loader.dispose().
scene.dispose();
loader.dispose(); // before assets.dispose()
```

`SceneFrame` exposes `mapId`, `viewport`, `tiles`, `objects`, `frontObjects`, `npcSpots` (empty: no source positions), and idempotent `release()`. Each sprite has `path,x,y,width,height,url`; objects preserve table order and layer. Scene loading does not load every map tile. `frame()` streams intersecting base tiles, discovers unknown object PNG dimensions with bounded reads through the asset manager, retains only intersecting object images, and reuses discovered dimensions on later requests. Unknown object bounds are conservatively probed; this can read offscreen objects on the first frame. Concurrent image work is bounded to four requests. A new frame cancels pending previous work, but a completed displayed frame remains valid until released. A new loader load cancels a pending prior load; completed scenes remain caller-owned until disposed. Always catch cancellation (error name `AbortError`). Do not release a displayed frame before detaching its images.

`WorldCamera.follow({x,y}, snap?)` is CFieldMap::scrollTo (0x00a505a0): `snap` centres (map load), otherwise the camera moves only when the avatar is within 300 px of the left/right/top view edge or 350 px of the bottom, by exactly the overshoot (no easing); then clamped to 0 and to map − view (a map smaller than the view sits flush right/bottom, as the original). The view is drawn at `trunc(camera)`; `exact` exposes the float camera. `worldToScreen` / `screenToWorld` use logical pixels; convert CSS event coordinates to logical pixels first.

The source format and verification limits are recorded below.

## Renderer contract

Sprite `width`/`height` are the PNG's natural dimensions. Base tiles additionally provide `clipWidth`/`clipHeight`: the logical cell dimensions from the map table. Render the image at natural size inside a cell-sized clipping container; do not stretch the image to the cell. This matters for the real room: its logical cell is 1024 × 768 but the PNG header is 1029 × 768. The scene's world bounds still come from logical tile count × tile stride. Object positions may be negative. Keep clipping at the world viewport as well. CSS scaling belongs to the renderer; camera transforms remain in logical pixels.

Frames preserve source order within each layer and provide the two source object groups separately. The renderer z-sorts them with the avatars as the original does (`src/world/depth.ts`); see "Draw order" below. `objects` are **not** NPCs. The parent owns avatars, pointer mapping, render scheduling, and scene changes. `frame()` is async: retain the displayed frame while awaiting its replacement. When moving quickly, catch `AbortError` from superseded requests; dispose the old scene when switching maps. The loader does not silently discard previously returned scenes because their displayed frame URLs may still be in use.

`WorldScene.definition` provides `{name,baseMap,hitMap,tileWidth,tileHeight,columns,rows,width,height,objects,frontObjects}`. Base/hit prefixes and object paths are normalized beneath `data/Map/` (already-rooted `data/map/` paths also work). `sceneTilePath(definition,column,row,hit?)` accepts zero-based indices and formats one-based filename suffixes. Hit-map paths are metadata only: this module never claims pixel collision/exit/height behavior or reads hit textures during a display frame.

## Draw order

Traced in the exe (2026-11-11). The field is drawn by one CZSort per frame, ascending z (a larger key draws later, in front):

- CFieldMap::loadSection (0x00a50ec0) calls CFieldMap::addObject (0x00a508c0) for each `FrontObjMap` record with pos (X, Y, 30724.0 = 0x46f00800) and "fixed z" on (call at 0x00a5150e), and for each `ObjMap` record with pos (X, Y, Y * 10.0) and "fixed z" off (call at 0x00a517bb).
- addObject loads the sprite, then with "fixed z" off adds the image height * 10.0 (`[sprite+0x9c]`, OneTexture +0x18: the PNG's height; `fmul [0xbe93bc]` = 10.0) and builds the translation (D3DXMatrixTranslation 0x00b41f8c). An `ObjMap` object's key is therefore its bottom edge * 10.
- CFieldMap::onMain (0x00a527c0) queues the tiles at the map's own z (arg -1), then each object n with z = `_43` of (its translation x the map's matrix) (D3DXMatrixMultiply 0x00b41539, key `[obj+0x4d94]`).
- CChibiAvatarElm::onMain (0x009cbed0, at 0x009cbf96) and walkStep (0x009cd4e0) set the avatar's z = y * 10 each frame: players, other players and NPCs alike are keyed by their feet.

So an avatar is in front of an `ObjMap` object whose bottom edge is at or above its feet and behind one whose bottom edge is below them; `FrontObjMap` art covers every avatar (above y 3072.4, which no map reaches). In the rewrite the objects' and avatars' layers make no stacking context: object sprites carry `z-index = (y + height) * 10`, avatar nodes `floor(y * 10)` (ties draw the avatar in front; the exe's std::sort leaves them unordered), the front layer 30724. Real-data checks (`tests/world-depth.test.ts`, merge.dat from `~/.cache/yo2-game` or `YO2_MERGE`): in Store (Map_a02) at (719, 603) the stairs' side panels 0301..0304 (bottoms 698, 683, 655, 628) cover the avatar and 0305 (bottom 601) does not, as live shows.

## Format evidence

Clean references: `client/src/Game/yo2FieldMap.cpp/.h`, `client/src/Game/STATUS_world.md` (loadSection at 0x00a50ec0, tile streaming at 0x00a52920, scroll at 0x00a505a0); `client/recomp/rt/user32.cpp` documents `screen = world - camera` and the tile stride fields; `client/platform/vfs/vfs.cpp` documents archive entry reads. The clean source omits the original loadSection/scroll/render implementations. The source map-id order is copied from the ten-entry C++ name table only; no map layout, texture, proprietary grid, or generated scene table is embedded in tracked source.

On 2026-11-04, read-only HTTP Range inspection of the existing configured public `https://original.ygoevolution.com/game/merge.dat` established the actual text grammar, asset paths and sample PNG headers. The archive advertised 691359533 bytes and 19445 directory entries. Only bounded directory/table entry ranges and selected PNG header/entry ranges were read; the archive was never downloaded whole. Private inspection artifacts remain outside the repository under `/tmp/world-scene-*`.

The real table `data/map/fieldmapdata.txt` (21122 decoded bytes) uses this sequence:

1. `MapData::Start`
2. `value; MapName`, `value; BaseMap`, integers `BasePartsW`, `BasePartsH`, `BaseNumX`, `BaseNumY`, then `value; HitMap`
3. `count; ObjMapNum`, followed by exactly count triples `path; Pic`, `integer; X`, `integer; Y`
4. `count; FrontObjMapNum`, followed by the same triple format
5. `MapData::End`

Whitespace and CRLF are allowed; values precede their keys. Ten sections parsed successfully; all declared base/hit tile paths and all 371 object paths resolved against the independently inspected archive directory. Four selected PNG headers were checked (base, object, front object, room base). These checks establish format/path compatibility for that inspected table, not decoded image or visual parity. There are no NPC placement records in this grammar. Exact original camera margins, sprite anchor/depth rules, animation, hit-pixel logic and visual playback remain unverified.

## Bounds, ownership and failures

The parser rejects malformed/truncated/duplicate/unexpected records, NULs, unsafe/traversing paths, non-PNG objects and invalid integers. Limits: 1 MiB table input, 20000 nonempty lines, 16 sections, 1..16 tiles per axis, 1..2048 logical pixels per tile axis, and 256 objects per group. Signed object positions are limited to ±32768. Metadata records/arrays are frozen. PNG header geometry is bounded to 8192 per axis and 16 Mi pixels per image; frames cap retained image geometry at 64 Mi pixels. This is a header/geometry check, not a PNG decoder or CRC validator. AssetManager separately controls encoded bytes/cache leases and archive limits. Browser decoded image/GPU overhead remains renderer-owned.

Each frame performs at most four concurrent asset reads. Base tiles are selected by logical cell/viewport intersection. Objects with unknown dimensions are conservatively tested against the maximum image bounds, then probed through `readScene`; nonintersecting objects release immediately and their discovered dimensions are retained as bounded metadata for future culling. A cold first frame can therefore read many offscreen object images, but does not fetch every base tile. Later frames avoid known offscreen object reads. Missing/invalid resources reject the frame and release all acquired leases; no fake map or partial successful frame is returned. Already completed frames have independent leases. Cancellation/disposal also releases late resolutions from a noncooperative asset provider once they resolve. The supplied AssetManager honors the forwarded abort signal.

## Validation

`node tools/run.mjs tsc --noEmit` passed once on the integrated checkout. A final rerun during concurrent parent/UI changes reports an unrelated `src/app.ts` exhaustive-action error for new sideboard actions; this task does not own that file. Strict scoped checking of the three scene/camera source files passes with the same ES2022/Bundler/DOM settings. Run the synthetic checks with:

```sh
node tools/run.mjs vitest run tests/world-scene.test.ts tests/world-camera.test.ts
```

Thirty-four synthetic checks cover grammar/bounds/path safety, logical geometry, exact viewport tile selection, order/layers, PNG dimensions, concurrency/pixel budgets, independent completed-frame leases, disposal, supersession, pre-abort, failures, and late noncooperative resolutions. The existing world/navigation source checks also passed alongside these.

Three optional private-data checks in `tests/world-scene-source.test.ts` run when `YO2_SCENE_TABLE` and `YO2_SCENE_DIRECTORY` point to locally supplied inspection files. `YO2_SCENE_TABLE` is decoded text; `YO2_SCENE_DIRECTORY` is JSON tuples `[normalizedPath,offset,decodedSize,storedSize]`. Set `YO2_SCENE_PNG_SAMPLES` to JSON `{name,header:number[],width,height}[]` for the sample PNG geometry check. These tests do no network requests or game-data generation and skip by default. The local run used `/tmp/world-scene-table.txt`, `/tmp/world-scene-directory.json`, and `/tmp/world-scene-png-samples.json`. All three passed, including loading every map id in the order independently read from `yo2FieldMap.cpp`.
