// Development server only. No asset persistence, archive cache, or production plugin.
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_REMOTE_ASSET_URL = 'https://original.ygoevolution.com/game/';
export const MAX_REMOTE_RANGE_BYTES = 32 * 1024 * 1024;
const PREFIX = '/game-assets/';
const ARCHIVES = new Set(['merge.dat', 'Sound.dat', 'merge/data/card.dat', 'merge/data/mini.dat']);

function reply(res, status, message, headers = {}) {
  if (res.destroyed) return;
  const body = Buffer.from(message);
  res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8', 'Content-Length':body.length,
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(body);
}
function finiteRange(value, max) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const match = /^bytes=(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]), end = Number(match[2]), length = end - start + 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && length <= max
    ? { start, end, length } : null;
}
function headerCount(req, name) {
  let count = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === name) count++;
  return count;
}

/**
 * Connect middleware. baseUrl is explicit opt-in; allowOriginalHost:true opts into the default.
 * fetch + originPolicy are injectable for local synthetic tests (see REMOTE_ASSETS.md).
 * forwardValidators explicitly enables ETag/If-Range; no other client headers are copied.
 */
export function createRemoteAssetMiddleware({ baseUrl, allowOriginalHost = false, fetch: fetcher = globalThis.fetch,
  originPolicy, maxRangeBytes = MAX_REMOTE_RANGE_BYTES, timeoutMs = 15_000, forwardValidators = false } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Remote assets are development-only');
  if (!Number.isSafeInteger(maxRangeBytes) || maxRangeBytes < 1 || maxRangeBytes > MAX_REMOTE_RANGE_BYTES) throw new RangeError('Invalid maxRangeBytes');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('Invalid timeoutMs');
  if (typeof fetcher !== 'function') throw new TypeError('Invalid fetch');
  // An HTTP exception is only available alongside an explicitly injected transport and policy.
  const testTransport = fetcher !== globalThis.fetch && typeof originPolicy === 'function';
  let base;
  if (baseUrl || allowOriginalHost) {
    base = new URL(baseUrl || DEFAULT_REMOTE_ASSET_URL);
    if ((base.protocol !== 'https:' && !(testTransport && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash ||
      (originPolicy && !originPolicy(new URL(base.href)))) throw new Error('Remote asset base must be an approved HTTPS directory URL');
    if (!base.pathname.endsWith('/')) base.pathname += '/';
  }
  return function remoteAssets(req, res, next) {
    const path = req.url ?? '';
    if (!path.startsWith(PREFIX)) return next();
    if (req.method !== 'GET') return reply(res, 405, 'Read-only ranged assets', { Allow:'GET' });
    // Exact raw paths only: no URL normalization, query parameters, escapes or traversal.
    const name = path.slice(PREFIX.length);
    if (!ARCHIVES.has(name)) return reply(res, 404, 'Asset not found');
    const range = headerCount(req, 'range') === 1 ? finiteRange(req.headers.range, maxRangeBytes) : null;
    if (!range) return reply(res, 400, 'A single finite bounded Range is required');
    if (!base) return reply(res, 503, 'Remote assets are not enabled');
    const ifRange = req.headers['if-range'];
    if (forwardValidators && ifRange !== undefined && (headerCount(req, 'if-range') !== 1 || typeof ifRange !== 'string' || ifRange.length > 1024)) {
      return reply(res, 400, 'Invalid If-Range');
    }
    const controller = new AbortController();
    let upstream;
    let timedOut = false;
    const disconnect = () => { if (!res.writableFinished) controller.abort(); };
    req.once('aborted', disconnect); res.once('close', disconnect);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    timer.unref?.();
    // live serves the 2x card art from its own directory, cards/ beside game/ (lazyfs.js mounts both)
    const from = name.startsWith('merge/data/') && /\/game\/$/.test(base.pathname) ? new URL('../cards/' + name, base) : new URL(name, base);
    void (async () => {
      try {
        upstream = await fetcher(from.href, {
          method:'GET', redirect:'manual', credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal:controller.signal,
          headers:{ Range:`bytes=${range.start}-${range.end}`, 'Accept-Encoding':'identity',
            ...(forwardValidators && ifRange ? { 'If-Range':ifRange } : {}) },
        });
        if (controller.signal.aborted) throw new Error('Cancelled');
        // Refuse redirects and full responses before ever reading their bodies.
        if (upstream.status !== 206 || upstream.redirected || (upstream.url && upstream.url !== from.href)) {
          const status = upstream.status === 404 ? 404 : upstream.status === 412 ? 412 : 502;
          reply(res, status, status === 404 ? 'Asset not found' : status === 412 ? 'Archive changed; reload the client' : 'Upstream must return an exact partial response');
          return;
        }
        const cr = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') ?? '');
        const total = cr ? Number(cr[3]) : NaN;
        const length = upstream.headers.get('content-length');
        const encoding = upstream.headers.get('content-encoding');
        if (!cr || Number(cr[1]) !== range.start || Number(cr[2]) !== range.end || !Number.isSafeInteger(total) || total <= range.end ||
          (length !== null && (!/^\d+$/.test(length) || Number(length) !== range.length)) || (encoding && encoding !== 'identity') || !upstream.body) {
          reply(res, 502, 'Invalid upstream partial response'); return;
        }
        const etag = forwardValidators ? upstream.headers.get('etag') : null;
        if (etag && (etag.length > 1024 || /[\x00-\x1f\x7f]/.test(etag))) {
          reply(res, 502, 'Invalid upstream validator'); return;
        }
        res.writeHead(206, { 'Content-Type':'application/octet-stream', 'Content-Length':range.length,
          'Content-Range':`bytes ${range.start}-${range.end}/${total}`, 'Accept-Ranges':'bytes',
          'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...(etag ? { ETag:etag } : {}) });
        let received = 0;
        const bounded = new Transform({ highWaterMark:64 * 1024, transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > range.length ? new Error('Oversized upstream range') : null, received <= range.length ? chunk : undefined);
        }, flush(callback) { callback(received === range.length ? null : new Error('Truncated upstream range')); } });
        // pipeline propagates downstream backpressure and cancels the web reader on error/abort.
        await pipeline(Readable.fromWeb(upstream.body, { highWaterMark:64 * 1024 }), bounded, res, { signal:controller.signal });
      } catch {
        if (res.headersSent) res.destroy();
        else reply(res, timedOut ? 504 : 502, timedOut ? 'Remote asset read timed out' : 'Remote asset read failed');
      } finally {
        clearTimeout(timer);
        req.removeListener('aborted', disconnect); res.removeListener('close', disconnect);
        controller.abort();
        if (upstream?.body && !upstream.body.locked) await upstream.body.cancel().catch(() => {});
      }
    })();
  };
}
