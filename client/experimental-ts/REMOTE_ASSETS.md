# Remote archive development bridge

`tools/remote-assets.mjs` exports `createRemoteAssetMiddleware(options)`, a Connect-compatible `(req, res, next)` middleware for the development server. The configured original host supports byte ranges but does not provide browser CORS. This bridge lets `ArchiveReader` request ranges from same-origin `/game-assets/` without storing archives locally.

The Vite integration belongs in its development-only `configureServer` hook. Configure the server-side environment variable `YO2_ASSET_URL=https://original.ygoevolution.com/game/` and pass it as `baseUrl`; the browser asset base should be `/game-assets/`. Keep the development server on loopback. This module supplies no build/preview/Worker integration and throws if created with `NODE_ENV=production`.

Example for the owner of the Vite configuration (the middleware itself does not read environment variables):

```js
import { createRemoteAssetMiddleware } from './tools/remote-assets.mjs';

const remoteBase = process.env.YO2_ASSET_URL;
const remoteAssets = remoteBase
  ? {
      name: 'duel-remote-assets',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(createRemoteAssetMiddleware({
          baseUrl: remoteBase,
          forwardValidators: true,
        }));
      },
    }
  : undefined;
// Include remoteAssets in Vite's development plugins when configured.
```

Use one provider for `/game-assets/` at a time; the local asset middleware also claims that prefix. Leaving the environment variable unset should keep the integration disabled. If the middleware is installed without `baseUrl`, recognized asset requests return 503 without a fetch. Alternatively, `allowOriginalHost: true` explicitly enables the exported `DEFAULT_REMOTE_ASSET_URL` (`https://original.ygoevolution.com/game/`). No opt-in is inferred from browser requests.

## API

| Option | Default | Contract |
| --- | --- | --- |
| `baseUrl` | absent | Server-controlled HTTPS directory URL, trailing slash optional. Credentials, query, fragment and non-HTTP(S) protocols are forbidden. Explicit configuration enables fetching. |
| `allowOriginalHost` | `false` | Explicitly use the original default host if `baseUrl` is absent. |
| `maxRangeBytes` | 33,554,432 (32 MiB) | Positive safe integer, maximum 32 MiB; matches the local archive middleware ceiling. |
| `timeoutMs` | 15,000 | Positive integer, maximum 60,000. Covers fetch headers, streaming and downstream stalls. |
| `forwardValidators` | `false` | Explicitly forward only client `If-Range` and upstream `ETag`. Enable to let `ArchiveReader` pin a stable archive ETag. An upstream 412 remains 412; a full 200 fallback is always rejected. |
| `fetch` | global Node fetch | Injectable transport accepting fetch options and returning a web `Response`. Must honor abort and manual redirects. |
| `originPolicy` | absent | Optional predicate receiving a copy of the configured base `URL`; false rejects configuration. Intended for synthetic tests. HTTP is accepted only when both a non-default `fetch` and an explicit accepting policy are injected. Never wire this exception to request parameters. |

`MAX_REMOTE_RANGE_BYTES` and `DEFAULT_REMOTE_ASSET_URL` are also exported. There is no manifest, persistent state, cache, downloader, or production plugin API.

## Request and response contract

Only GET and exactly these raw paths are accepted:

- `/game-assets/merge.dat`
- `/game-assets/Sound.dat`
- `/game-assets/merge/data/card.dat`
- `/game-assets/merge/data/mini.dat`

Other prefixes fall through to `next()`. Unknown paths under `/game-assets/` return 404, including percent encodings, traversal, query parameters, extra slashes and fragments. Other methods, including HEAD, return 405. The upstream URL is built solely from the configured base and one of the fixed names.

Every request must contain exactly one `Range: bytes=START-END`, with finite safe nonnegative integers, `END >= START`, and length within the configured ceiling. Missing, duplicate, multipart, suffix, open-ended and oversized ranges return 400 before any fetch. The bridge does not probe archive size or convert a missing range into an archive download.

The upstream receives a new header allowlist: normalized `Range`, `Accept-Encoding: identity`, and optional `If-Range`. Browser cookies, authorization, Origin, arbitrary request headers and referrer are not forwarded. Node fetch may add ordinary transport headers. Redirect mode is manual and all redirect statuses are rejected, even within the same base directory. A response reporting an already-followed redirect or a different final URL is also rejected.

Only a 206 with exact requested endpoints and a numeric safe total larger than END can stream. If `Content-Length` is present it must match the requested byte count; HTTP/2 responses may omit it. The stream enforces the exact count in both cases. Content encoding must be absent or `identity`. Full 200 responses, redirects and malformed metadata are rejected before reading their bodies; rejected bodies are cancelled. Upstream 404 and 412 map to those statuses; other unexpected statuses map to 502. Timeout before response headers returns 504, other fetch errors 502. Error messages do not expose upstream URLs or credentials.

The response exposes only generated range/type/security headers and, with opt-in, ETag. It uses `Cache-Control: no-store`. No upstream cookies, CORS headers, content encoding or arbitrary response headers are copied. If the range becomes truncated, exceeds its declared length, stalls, or errors after streaming begins, the response is terminated; its status cannot be changed once 206 headers are sent. The client must treat an incomplete body as failure.

## Bounds and limits

The Node stream pipeline enforces the exact response byte count, uses 64 KiB stream high-water marks and propagates downstream backpressure. It holds stream chunks rather than accumulating an entire range. An oversized chunk is rejected before forwarding that chunk. Disconnect, timeout and stream errors abort the upstream and cancel the web reader. The transport can still prebuffer its own network chunks; this is not a guarantee of zero speculative network bytes before metadata rejection.

There is no whole-archive fallback, archive cache, disk write, extraction, transcoding, retry or cross-request aggregation. A finite range can cover an entire sufficiently small archive; this implementation enforces a byte ceiling, not a guarantee that each accepted range is smaller than the archive. There is no global concurrency/rate limit, DNS pinning, incoming browser Origin gate or deployment authentication. Restrict the development server to loopback and trust only the operator-configured base and transport. Use local archives if remote access, latency or upstream availability is unsuitable. Optional validators only help when the origin emits stable ETags and honors If-Range; no asset snapshot consistency is promised without them.

## Verification

Run from `client/experimental-ts`:

```sh
node tools/run.mjs vitest run tests/tooling-remote-assets.test.ts
```

Automated checks use only synthetic responses and local HTTP servers via injected fetch/origin policy. They cover opt-in, fixed routing, finite ranges, header isolation, validators, malformed metadata, rejected full responses and redirects before body reads, length mismatches, timeout/disconnect cancellation, backpressure, and a synthetic `ArchiveReader` extraction round trip. These checks do not contact the original host, download proprietary archives, establish gameplay/asset parity, or demonstrate that every original archive range can be read successfully. Vite environment wiring is owned by the parent integration and is not changed by this module.
