/** A same-origin, cookie-authenticated JSON transport. Mutations are never retried. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly payload?: unknown) {
    super(message); this.name = 'ApiError';
  }
}
export class ResponseError extends Error {
  constructor(message: string) { super(message); this.name = 'ResponseError'; }
}
export interface RequestOptions { signal?: AbortSignal; }
export interface HttpOptions {
  /** Defaults to location.origin. Tests may supply an explicit origin. */
  origin?: string;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
  timeoutMs?: number;
}
export type Decoder<T> = (value: unknown) => T;
export class HttpClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;
  private readonly maxBytes: number;
  private readonly timeout: number;
  private readonly requests = new Set<AbortController>();
  private disposed = false;
  constructor(options: HttpOptions = {}) {
    this.origin = new URL(options.origin ?? globalThis.location.origin).origin;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxBytes = options.maxResponseBytes ?? 4 * 1024 * 1024;
    this.timeout = options.timeoutMs ?? 20_000;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || !Number.isFinite(this.timeout) || this.timeout < 0) throw new RangeError('Invalid HTTP bounds');
  }
  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, decode: Decoder<T>, body?: unknown, options: RequestOptions = {}): Promise<T> {
    if (this.disposed) throw new Error('HTTP client disposed');
    // Only absolute paths from this application's API namespace are accepted.
    const url = new URL(path, this.origin);
    if (!path.startsWith('/api/') || !url.pathname.startsWith('/api/') || url.origin !== this.origin || url.username || url.password || url.hash) throw new Error('Expected same-origin API path');
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = this.timeout > 0 ? setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), this.timeout) : undefined;
    this.requests.add(controller);
    try {
      controller.signal.throwIfAborted();
      const response = await this.fetcher(url.href, {
        method, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
      });
      let value: unknown;
      const reader = response.body?.getReader();
      if (!reader) throw new ResponseError('Expected JSON response body');
      const cancelReader = () => { void reader.cancel(controller.signal.reason).catch(() => undefined); };
      controller.signal.addEventListener('abort', cancelReader, { once: true });
      try {
        controller.signal.throwIfAborted();
        const declared = Number(response.headers.get('content-length'));
        if (declared > this.maxBytes) throw new ResponseError('Response exceeds byte limit');
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          controller.signal.throwIfAborted();
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > this.maxBytes) throw new ResponseError('Response exceeds byte limit');
          chunks.push(chunk);
        }
        controller.signal.throwIfAborted();
        const bytes = new Uint8Array(size); let at = 0;
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { if (!response.ok) throw new ApiError(`HTTP ${response.status}`, response.status); throw new ResponseError('Invalid JSON response'); }
      } finally {
        controller.signal.removeEventListener('abort', cancelReader);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (!response.ok) {
        const o = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        throw new ApiError(typeof o.message === 'string' ? o.message : typeof o.error === 'string' ? o.error : `HTTP ${response.status}`,
          response.status, typeof o.code === 'string' ? o.code : typeof o.error === 'string' ? o.error : undefined, value);
      }
      return decode(value);
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort); this.requests.delete(controller);
    }
  }
  dispose(): void {
    this.disposed = true;
    for (const request of this.requests) request.abort(new DOMException('Client disposed', 'AbortError'));
    this.requests.clear();
  }
}
