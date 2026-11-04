# Experimental TypeScript client

This is an independent browser client on `experimental/typescript-client-rewrite`. It does not load `yo2.exe`, generated C, the old client WASM, guest memory, or the HTML memory bridge. The existing server and its authoritative OCGcore rules remain unchanged.

**This experiment is not a completed rewrite.** See [STATUS.md](STATUS.md) for the tested checkpoint and remaining work. `PARITY.md` is the acceptance inventory; the parity command deliberately fails while whole-client acceptance lacks evidence. Unit and recorded-wire passes do not establish original graphics, animations, every card interaction, avatar behavior, or all browser/session scenarios.

## Run locally

Use a current Node release supported by Vite (the implementation was checked with Node 26). Run the existing local server following the repository README. It needs your supplied/generated `server/gamedata/`.

```sh
cd client/experimental-ts
npm install
npm run catalog
npm run texts
npm run world
YO2_GAME=/path/to/your/game npm run dev
```

Open `http://localhost:5174/`. Sign in with your local server account, go online, create/select a character, claim a starter if eligible, and choose a saved deck before challenging an NPC. Development tools can reuse already-installed server/htmlui tools when run through `node tools/run.mjs`; an isolated dependency installation is preferred for reproducibility.

For original card images, add `?assets=/game-assets/`. The development server reads only allowlisted archives from `YO2_GAME` (and optionally `YO2_CARDS`) through bounded Range requests. It never copies or commits game files. See `tools/DEV.md` for Origin, cookie, archive-path and upstream settings. `DE_SERVER` defaults to `http://127.0.0.1:8787`; `DE_PUBLIC_ORIGIN` must match the local Worker's `PUBLIC_ORIGIN`.

`npm run catalog` creates ignored `public/card-catalog.json` from the local server's generated tables. Card names fall back explicitly to passcodes when it is absent. This initial catalog does not supply all original effect descriptions, dialogue text or alternate-art metadata. Generated display data must never be committed. `npm run world` also generates ignored collision grids from the existing source; movement is disabled when collision data is unavailable. Grid-based routing does not yet reproduce the original pixel probes, height scaling or exit triggers.

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

The current recorded-duel tests regenerate v2 output from existing reference recordings and compare the new client model's board, piles, LP, identity/ownership/location, face/position, and check that successful recorded choices are representable by the semantic encoder. Corpus byte equality covers action/phase packets only; selection, answer, announcement and cancellation categories have focused roundtrip tests, not complete recorded-response equivalence. The latest full run exercised 72 recordings, 24,802 state boundaries, 66,966 packets and 5,235 successful decisions. This is scoped evidence, not a claim that every card or original-client behavior is covered.

## Design and resource ownership

- `network/`: browser packet codec, bounded multiplexed WebSocket transport, resumable channels and independent character/lobby/duel lifecycle.
- `duel/`: deterministic authoritative-state projection, validated semantic responses and a separate bounded visual timeline. Source supports the original eight-frame card glide; some other timing remains provisional.
- `ui/`: DOM/canvas interface from explicit state and commands. Hidden identities and stale prompts are checked at the boundary. No memory offsets or synthetic native clicks.
- `services/` and `features/`: same-origin account/deck/shop APIs, idempotent purchase handling, social/trade, cosmetics/tag, and user-selected audio.
- `assets/` and `core/`: bounded archive reads/decompression, leased image URLs, byte-budgeted caches, and explicit resource lifetimes.
- `parity/`: opt-in credential-redacting captures, deterministic replay and an acceptance gate that cannot silently claim missing coverage.

The UI releases image leases when their final use disappears; disposal aborts pending work, stops audio/animation, closes game channels and clears listeners/caches. The asset cache budget excludes browser decoded-image/GPU allocation, which still needs real-device measurement. Audio files remain local and currently must be selected again after reload.

A real Chromium desktop/mobile test also exercises a complete NPC51 natural loss through mouse/touch controls and downloads a capture that replays to the same result. Its cookie/auth and HTTP deck persistence are test fixtures; gameplay WebSockets, starter handling, World and OCGcore are real. A separate 100-cycle title/options smoke checks retained heap/DOM behavior, without claiming real-asset or whole-session memory parity.

No production deployment, replacement of the existing client, or server migration is part of this experiment. Existing uncommitted work outside this directory was preserved.

## Working-tree dependency

This experimental commit adds only the new client. It was built against the existing working tree, which already contained uncommitted server/API additions (including shop/social/tag/cosmetics behavior). Those changes were preserved and are not included in this client-only checkpoint. A clean checkout needs the matching server changes and privately generated data before the integration suite or every online feature can run.
