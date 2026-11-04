# Experimental TypeScript client

This is an independent browser client on `experimental/typescript-client-rewrite`. It does not load `yo2.exe`, generated C, the old client WASM, guest memory, or the HTML memory bridge. The existing server and its authoritative OCGcore rules remain unchanged.

**This experiment is not a completed rewrite.** See [STATUS.md](STATUS.md) for the tested checkpoint and remaining work. `PARITY.md` is the acceptance inventory; the parity command deliberately fails while whole-client acceptance lacks evidence. Unit and recorded-wire passes do not establish original graphics, animations, every card interaction, avatar behavior, or all browser/session scenarios.

## Run locally

Use a current Node release supported by Vite (the implementation was checked with Node 26). Run the existing local server following the repository README. It needs your supplied/generated `server/gamedata/`.

```sh
cd client/experimental-ts
npm install
npm run catalog
npm run cards
npm run texts
npm run world
YO2_GAME=/path/to/your/game npm run dev
```

Open `http://localhost:5174/`. Sign in with your local server account, go online, create/select a character, claim a starter if eligible, and choose a saved deck before challenging an NPC. Development tools can reuse already-installed server/htmlui tools when run through `node tools/run.mjs`; an isolated dependency installation is preferred for reproducibility.

For original maps, avatars and card images, add `?assets=/game-assets/`. The development server reads only allowlisted archives from `YO2_GAME` (and optionally `YO2_CARDS`) through bounded Range requests. Alternatively, explicitly enable the bounded remote bridge with `YO2_ASSET_URL=https://original.ygoevolution.com/game/ npm run dev`; it reads individual ranges and never saves a whole archive. See [REMOTE_ASSETS.md](REMOTE_ASSETS.md) and `tools/DEV.md`. `DE_SERVER` defaults to `http://127.0.0.1:8787`; `DE_PUBLIC_ORIGIN` must match the local Worker's `PUBLIC_ORIGIN`.

`npm run catalog` creates ignored `public/card-catalog.json`; `npm run cards` supplies validated statistics and native deck-file identities. Original rules text can be generated with `npm run card-texts -- --url https://original.ygoevolution.com/game/merge.dat` (bounded ranges), producing ignored `public/card-texts.json`: 3,243 original English descriptions and 16 explicitly missing extension identities in the inspected inputs. Names fall back to explicit passcodes when metadata is absent. Generated game data must never be committed. `npm run world` generates ignored collision grids from source; movement is disabled without them. Source-backed initial arrivals avoid an uninitialized `(0,0)` position. Grid routing still does not reproduce original pixel probes, height scaling or exit triggers.

The title offers World mode and Free Duel & Deck Editor. Free mode uses the existing isolated server protocol and free active-deck pointer; it does not offer NPC progression or purchases. Manual Match rooms support sideboarding. Automatic Single/Either searches are supported; the current server does not implement automatic Match pairing.

## Verification

```sh
npm run typecheck
npm run build
npm test
npm run smoke
npm run parity
```

`npm test` and `npm run smoke` rebuild first through their npm prerequisites, preventing browser checks from silently exercising stale `dist/` output. Direct Vitest/browser-tool invocations require an explicit current build.

Tests that use the actual server/OCGcore and recorded private fixtures require the generated game data. A visible skip is not a pass for that behavior. The standalone asset/resource tests use synthetic files. `smoke` uses installed cached Chromium through the repository CDP helper, explicitly fixture-backed HTTP, and checks desktop/mobile bootstrap and Options; it is not a production-authentication or gameplay-parity test.

The recorded-duel oracle exercises 72 recordings, 24,802 state boundaries and 66,966 incoming packets. It independently runs 5,791 new encoded decisions / 5,914 outgoing packets through isolated translator states and compares core commands and complete v2 outputs, including 5,235 successful core choices. Another 135 rejected requests are checked for hidden semantic progress and receive no successful-choice credit. It also compares board/piles, LP, identity/ownership/location and face/position. This found and fixed read-only pile inspection confirmation. See `src/duel/README.md` for the exact oracle boundaries; it does not cover every card or original-client behavior.

## Design and resource ownership

- `network/`: browser packet codec, bounded multiplexed WebSocket transport, resumable channels and independent character/lobby/duel lifecycle.
- `duel/`: deterministic authoritative-state projection, validated semantic responses and a separate bounded visual timeline. Source supports the original eight-frame card glide; some other timing remains provisional.
- `ui/`: DOM/canvas interface from explicit state and commands. Hidden identities and stale prompts are checked at the boundary. No memory offsets or synthetic native clicks.
- `services/` and `features/`: same-origin account/deck/shop APIs, idempotent purchase handling, social/trade, cosmetics/tag, and user-selected audio.
- `assets/` and `core/`: bounded archive reads/decompression, leased image URLs, byte-budgeted caches, and explicit resource lifetimes.
- `parity/`: opt-in credential-redacting captures, deterministic replay and an acceptance gate that cannot silently claim missing coverage.

The UI releases image leases when their final use disappears; disposal aborts pending work, stops audio/animation, closes game channels and clears listeners/caches. Image admission validates dimensions and charges an RGBA estimate plus encoded/Blob storage. Avatar resources have a separate bounded bitmap budget. These estimates do not measure browser/GPU allocation. User-selected audio files and slot playback modes persist locally when browser storage is available; audio activation still requires a gesture.

A real Chromium desktop/mobile test exercises a complete NPC51 natural loss through mouse/touch controls and downloads a capture that replays to the same result. Its cookie/auth and HTTP deck persistence are test fixtures; gameplay WebSockets, starter handling, World and OCGcore are real. Separate [authenticated HTTP/D1](HTTP_EVIDENCE.md) and [natural victory/draw](DUEL_OUTCOMES.md) tests state their fixture boundaries. The opt-in original-media browser test requires `YO2_ASSET_URL` and checks real image decoding and repeated scene/resource lifecycles; ordinary tests do not fetch original archives.

No production deployment, replacement of the existing client, or server migration is part of this experiment. Existing uncommitted work outside this directory was preserved.

## Working-tree dependency

This experimental commit adds only the new client. It was built against the existing working tree, which already contained uncommitted server/API additions (including shop/social/tag/cosmetics behavior). Those changes were preserved and are not included in this client-only checkpoint. A clean checkout needs the matching server changes and privately generated data before the integration suite or every online feature can run.
