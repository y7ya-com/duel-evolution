# Layered player avatars

Browser entry point: `src/avatars/index.ts`. No original asset bytes or generated motion records are tracked here. This implements the **chibi player** path and the famous NPCs' own chibi art (`npc.ts`, CNpcChibiAvatar: cn_ sets, blink, level stars; `load(parts, { npc: { set } })`), not the waist-up PBIN portrait compositor.

```ts
import { AvatarLoader } from './avatars';
const avatars = new AvatarLoader(assetManager); // readScene(path, signal) adapter
const resource = await avatars.load(player.parts, {
  world: 0, motion: 'walk', direction: 5, signal,
});
resource.draw(canvas.getContext('2d')!, { x: 100, y: 200, elapsedMs: 250 });
resource.dispose(); // closes bitmaps and releases leases; idempotent
avatars.dispose(); // cancels pending work, disposes live resources, leaves manager alive
```

`AvatarLoader.load(ArrayLike<number>[16], {world?, motion?, direction?, signal?})` snapshots appearance before asynchronous work. Defaults are world 0, standing, direction 0. Never substitutes an asset after a missing-file error. `AvatarResource` exposes `movie`, `pose`, resolved `paths`, `frameAt(ms)`, `layers(frame)`, `draw(ctx, {x?,y?,scale?,frame?,elapsedMs?,includeHitArea?})`, and `dispose()`. `retainedBytes` on the loader measures reserved compressed image bytes plus estimated decoded RGBA surfaces, **not** measured browser/GPU memory. Default aggregate image reservation is 32 MiB; image dimensions are bounded before decoding. Loads retain one asset lease/bitmap per unique filename. Abort/disposal releases acquired image leases immediately; a decoder already running may finish later, and that bitmap is then closed. Consumers must dispose resources when changing appearance/pose. No DOM, animation timer, canvas clearing, or shared manager ownership is assumed.

`AvatarMovie(text)` parses original SWF::Element motion dumps without executing constructors or ActionScript. `layers(frame, loop?)` returns bitmap file-table index, source display-list transform, bitmap fill transform, rectangle bounds, inherited alpha, depth path, and instance name. Root frames and nested clips evaluate in source order with sorted depths, persistent move updates, removals, child birth frames, and a maximum nesting/layer/operation budget. Looping `frameAt` returns elapsed source frames (the evaluator wraps each timeline). Non-looping poses hold the last root frame. It does not implement CChibiAvatarElm's motion arbitration, idle timer, or automatic follow-up state transitions; `AVATAR_MOTIONS` exposes their priorities/loop/turn/next metadata for a controller.

Appearance rules follow `client/src/Game/Avatar/yo2ChibiAvatarElm.cpp` (`applyMaleParts`, `applyFemaleParts`, `clothesPart`), and byte defaults follow `yo2AvatarData.cpp`. This includes sex, hair/skin/eye colours, front/back hair, bald/afro/ponytail/hood cases, eyes/mouth, clothes and accessories. The original chibi routines do not consult the nose byte or duel-disk byte; disk follows lobby world. Account ownership, PBIN/world validation and clothing unlock filtering (`avatarValidate`) are not implemented here. Invalid/missing variants are errors, never fabricated IDs or replacement pictures.

`avatarPose(motion,direction)` exposes the five source facing files ordered 1,2,3,4,5,4,3,2, mirroring directions 5..7. Directions turn from +y toward -x. All duel facings share one file per duel motion. Root offset is (-46,-116); original foot-probe center in movie coordinates is (40,116). Canvas mirroring applies to the whole engine including the root offset. `avatarDirection(x,y)` reproduces source vector-to-facing conversion.

Known limits:

- `AvatarMovie.issues` reports unsupported tags, masks, and RGB colour transforms; drawing/loading refuses those movies rather than silently skipping effects. Alpha multiplication is supported; the original reader's misspelled alpha-add field is not treated as a valid alpha-add transform.
- Source shapes are bitmap-filled rectangles, as documented in `client/src/Swf/yo2SwfReader.cpp`; general Flash vector paths, repeated bitmap fills, ActionScript, button states and SWF event dispatch are outside this API. Sprite continuation across *engine changes* needs a controller; a new resource begins at the caller's chosen elapsed time.
- Sampled movies contain a named `cm_atari_01_mc` hit-area sprite whose PNG is an opaque green rectangle. The supplied clean SWF runtime stops at its interface, so its original suppression behavior is unknown. `layers()` preserves it. `draw()` hides that explicitly named helper by default as a rendering **inference**; pass `includeHitArea:true` to draw the raw movie. No blank image is substituted.
- Canvas rasterization/blending is not established as pixel-identical to the original D3D engine. Waist-up portraits and the TexMaker's special alpha blending are not implemented.
- The configured original host supports bounded Range reads but lacks browser CORS. Supply a CORS-capable same-origin asset source/proxy or locally supplied files through the parent's asset manager. This module does not bypass browser policy.

Private generator: `node tools/avatar-data.mjs public/avatar-data.json <extracted cm_*.txt>...` accepts up to 23 bounded original motion files and emits `{version:1,motions:{[originalPath]:text}}`. Pass `data.motions` as optional `AvatarLoader` option `motionData`; absent motions still load through `readScene`. The generator refuses tracked, unignored, external and symlink output files and refuses overwrites. **Parent must add `public/avatar-data.json` to `client/experimental-ts/.gitignore` before generating that destination.** This task intentionally does not edit the parent's ignore file. PNGs continue to come from the asset manager; no archive is downloaded by the generator.

Verification on 2026-11-04:

- 17 synthetic tests cover appearance, source conventions, display-list ordering/transforms/removals/nested clocks, clipping/drawing, budget refusal, lease ownership, abort/late decode, loader/resource disposal, unsupported metadata and private-output guards.
- Bounded `ArchiveReader` reads against the configured original `merge.dat` parsed all 23 unique player motion dumps: 867,873 uncompressed metadata bytes, 357 root frames and 3,458 evaluated bitmap placements. No unsupported features were found in this sample. Only directory and individual entry ranges were fetched.
- Default male/female standing references (20 PNGs) were individually fetched to `/tmp` and fully decoded to RGBA by FFmpeg: 631,824 RGBA bytes, dimensions 1x1 through 128x128. The no-accessory 1x1 transparent assets are actual original files, not generated replacements. This proves sample decode/geometry, not visual/gameplay parity or all wardrobe combinations.
- Standalone strict TypeScript check of the avatar entry point and dependencies passed. Repository-wide typecheck reports parent-owned `app.ts` contract mismatches (`mode`, `freeMode`, `purchased`); those files are outside this task's ownership.
