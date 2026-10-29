// What of the game log reaches Workers Logs in production (do.ts, without LOG=1; wrangler.jsonc observability):
// errors, protocol anomalies and the economy, never the per-frame lines. No secrets reach the game log (0x3003, the
// login blob, is never hexed; peers are ws ids, not IPs).
const ERR = /\[(ERROR|EXC)\]|error answering|handler error|\[d1\].*fail/;
const NOTE = /\[(AVISO|economia)\]|bad MD5|length > 1024|RETRY|no esperado|NOT sent|limit of \d+ sessions|0x3003 refused|\(a flood\)/;
export const logLevel = (s: string): "error" | "warn" | null => (ERR.test(s) ? "error" : NOTE.test(s) ? "warn" : null);
