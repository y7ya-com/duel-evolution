# Independent browser assets API

Import from `src/assets` (extensionless), e.g. `import { AssetManager } from './assets'` in the parent app. No Module, FS, guest runtime, manifest, proprietary data, image decoder, or global lifecycle hook is used.

```ts
const assets = new AssetManager({ baseUrl: '/game-assets/' });
const lease = await assets.loadCard(89631139, abortController.signal);
image.src = lease.value.url;
// On replacement/unmount, detach the old image then:
lease.release();
// On application teardown, detach consumers/release leases, then:
assets.dispose();
```

## Public manager API

`new AssetManager(options: AssetManagerOptions)` accepts:

- `baseUrl: string`: URL directory containing `merge.dat`, `merge/data/card.dat`, and `merge/data/mini.dat`. Relative browser URLs work. A trailing slash is optional; use a directory URL without query/hash.
- `fetch?: typeof globalThis.fetch`: injectable fetch implementation; defaults to browser fetch.
- `cacheBytes?: number`: safe nonnegative integer, default 64 MiB. Each cached resource charges twice its byte length, for source bytes plus Blob storage. This excludes browser decoded image/GPU storage, directory metadata, and bounded in-flight buffers.
- `limits?: Partial<ArchiveLimits>`: defaults `maxEntries: 100000`, `maxEntryBytes: 16777216`, `maxStoredBytes: 16777216`, `concurrency: 4`. Limits are positive safe integers. Concurrency 1–32, entries at most 1000000, and entry/stored limits at most 256 MiB. Concurrency applies across all three archives, including directory reads and decode work. The waiting queue holds at most 128 jobs; overflow rejects.
- `mergeCardPaths?: Readonly<Record<string,string>>`: optional explicit canonical decimal passcode → merge.dat entry path. Used only if card.dat or its named entry is missing (404/absent directory entry). HTTP/protocol/decode failures never silently fall back. No internal ID mapping is inferred or downloaded.

Methods:

- `loadCard(passcode: string | number, signal?: AbortSignal): Promise<AssetLease>` reads `<decimal passcode>.jpg` in card.dat. Inputs must contain 1–8 decimal digits; leading zeros normalize away. IDs are passcodes, not internal card indices.
- `loadMini(passcode, signal?): Promise<AssetLease>` reads the same naming scheme in mini.dat, without merge fallback.
- `readScene(path: string, signal?: AbortSignal): Promise<AssetLease>` reads a named merge.dat entry, such as `data/y2/duel/field/duelbg_a_02.png`. Paths are case-insensitive, backslashes normalize to slashes, and empty/absolute/traversing paths are rejected. This reads bytes; it does not interpret scene tables, layouts, textures, animations, or effects.
- `cacheBytes: number` reports retained cache charges.
- `dispose(): void` is idempotent, aborts pending subscribers/work, revokes every retained object URL immediately (including leased resources), and disallows future loads.

`AssetLease` is the parent's `Lease<Asset>`: `{ readonly value: Asset; release(): void }`. Release is idempotent. `Asset` is `{ readonly bytes: Uint8Array; readonly url: string; readonly mimeType: string }`. Bytes are shared and immutable by convention: copy before mutation. JPEG/PNG/BMP/WAV/OGG types are inferred by extension; other entries use application/octet-stream. URL lifetime extends through the lease, until manager disposal. A released resource may remain cached, then be revoked on eviction. Never call URL.revokeObjectURL yourself. Live leases prevent eviction; loads reject if no room remains. Abort after a load has resolved does not release its lease.

Concurrent identical loads share network/decode work but receive independent leases. One caller's abort leaves other subscribers running; the last abort cancels underlying work. Failures are retryable. Invalid arguments may throw synchronously; use try/await/catch around calls. Missing resources use exported `AssetNotFoundError`; cancellation uses name `AbortError`. Other validation/budget failures are Error/RangeError.

## Lower-level exports and protocol

`ArchiveReader(url, fetch?, limits?)` exposes `directory(signal?): Promise<ReadonlyMap<string, ArchiveEntry>>`, `read(path, signal?): Promise<Uint8Array>`, and `dispose()`. `ArchiveEntry` contains `{name, offset, size, stored}`. Treat returned maps and byte arrays as immutable. Directory metadata stays for the reader lifetime; raw entry results are only shared while in flight. Prefer the manager for application use and byte-budgeted caching. `decodeLzss(source, size, maxOutput?)` is exported for independently checked decoding; default output limit is 16 MiB.

Archive parsing follows `client/recomp/web/lazyfs.js`, `client/tools/mergedir.py`, and `client/tools/cardart.py`: `KCEJYUGI`, little-endian count, 268-byte records, 256-byte nibble-swapped CP932/Shift-JIS null-terminated names, then u32 offset/decoded length/stored length. Duplicate normalized names, invalid spans, directory counts, and oversized entries reject. Equal stored/decoded lengths mean raw data; other entries use zero-initialized 4 KiB LZSS ring at 0xFEE. Truncation, output overrun, and trailing compressed bytes reject rather than produce partial output. This strictness can reject corrupt files tolerated by the permissive guest decoder.

Requests fetch exact inclusive byte ranges, starting with bytes 0–11 then the bounded directory. Responses MUST be 206 with matching Content-Range start/end and a numeric stable total. If present, Content-Length must match. Nonidentity Content-Encoding rejects. Strong ETag values, if provided, are pinned and sent with If-Range; subsequent responses must retain them. Bodies are streamed into a fixed-length buffer and short/oversized responses reject. Cross-origin hosting must allow Range/If-Range and expose Content-Range, Content-Length, ETag, and Content-Encoding via CORS. Configure archive hosting without content compression. Without a strong ETag the reader detects length changes but cannot detect equal-length archive replacement; use immutable/versioned base URLs.

No gzip directory sidecar support or persistent browser storage is included. The reader fetches only directories and requested entries. Decoded media validity and visual parity require integration/real-asset verification; synthetic tests do not establish those.
