# Browser audio integration

Exports from `features/audio`: `BrowserAudioManager`, `AUDIO_SLOTS` (46 original slot descriptors), `BrowserAudioOptions`. UI: `renderAudioFeature(manager): HTMLElement` from `ui/extra/audio`.

Create one manager per app lifetime. Call `await manager.activate()` **directly inside a trusted click/keydown handler** (the audio UI includes an Enable audio button). Nothing constructs an AudioContext or starts playback before this explicit activation. Scene calls before activation remember only the latest slot. Call `manager.dispose()` on app teardown.

Public contract:
- `setSlotFiles(slot: number, files: File[]): void`: replace a local playlist; empty means silence, with original duel-layer/jingle fallback rules. Throws for invalid slots or resource limits. No upload or persistence; files must be selected again after reload.
- `playSlot(slot: number): Promise<boolean>`: select scene audio; true means playback started/already playing. Caller owns actual scene mapping. Do not infer network audio commands.
- `setVolumes({ music?, sound? }): void`: independent normalized 0–1 volume; invalid values throw.
- `playEffect(path: string): Promise<boolean>`: read original `SE/*.wav` from a supplied Sound.dat reader/URL and decode in the browser. Missing/unsupported files return false and report through optional `onError`.
- `stop(): void`: cancel pending playback, stop music/effects; retains playlists/cache and activation.
- `dispose(): void`: idempotent stop plus resource release, archive cancellation and AudioContext close.

Music uses one streaming HTMLAudioElement and one short-lived object URL, with immediate stop on transitions (no crossfade). Original looping defaults and ordered playlists apply. Empty 24/25/30–45 use the last requested 10–20 duel base; empty 21–23 leave current audio alone. Repeated scene calls do not restart music. Effects duck music to 35% while any effect plays; sound volume zero disables effect work.

Pass `soundArchiveUrl` pointing at the deployment's actual Sound.dat HTTP range endpoint, or `archive: { read(path, signal) }` from existing ArchiveReader. No default asset URL is assumed. A passed archive remains caller-owned. Effects are explicit asset paths, never guessed server messages. Browser codec support governs decoding.

Limits (defaults): 8 files per slot, 256 files/256 MiB total, 64 MiB each; decoded effect cache plus active buffers 16 MiB, one effect at most 8 MiB decoded/4 MiB encoded, four pending distinct effects decoded serially, 16 active effect voices. Excess work is rejected/dropped. No background audio decoding. `audioFactory`, `contextFactory` and object-URL functions are injectable for deterministic resource tests. UI uses only local file inputs and never uploads files.

## State/dispatch boundary (available now)

`AudioState` / `AudioAction` are exported from `features/audio`. `manager.getState()` returns a detached state snapshot. `manager.dispatch(action): Promise<void>` accepts `{type:'activate'}`, `{type:'stop'}`, `{type:'play-slot',slot}`, `{type:'set-slot-files',slot,files:File[]}`, `{type:'set-volumes',music?,sound?}`. `play-slot` is the **UI preview action**, activating directly in the event handler; ordinary scene transitions must call `playSlot` (which never activates). To preserve browser activation, controller dispatch must immediately call manager.dispatch before its first await.

Renderer overload: `renderAudioFeature(state: AudioState, dispatch: (action: AudioAction) => void | Promise<void>): HTMLElement`; also supports `renderAudioFeature(manager)`. Render is inert; side effects occur only in control handlers. No global listeners, timers or subscriptions are registered; discard the old element on stage rerender. Manager lifetime belongs to the app. State-driven callers rerender after dispatch settles. The manager convenience form updates filenames locally; recreate to refresh other state. `getSlotFiles(slot)` returns a copied file list; `volumes`, `currentSlot`, `isActivated`, `decodedBytes` are read-only accessors.

Verification: focused fake-media/Web Audio tests cover user activation, browser promise races, scene fallback, playlist completion/error limits, URL cleanup, volume ducking, LRU/active-buffer budgets, pending/voice limits, cancellation, and an actual ArchiveReader HTTP-range directory read. A real browser/device codec and autoplay smoke test is still needed. The decoded byte budget bounds retained buffers (including live voices); browser-internal temporary decode allocations are released by the browser after decode, and cannot be cancelled mid-decode. At most one decode runs at a time.

Server inspection: `server/src/duel/duellog.ts` writes `BGM_DEFAULT = 0x20000010` in replay player blocks. This module introduces no network messages; authoritative scene-to-slot integration belongs to the app. Existing `recomp/audio-slots.md` and `recomp/web/audio.js` define the fallback/loop behavior mirrored here.
