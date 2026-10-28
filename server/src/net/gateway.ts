// Boxedwine network-gateway framing (network-gateway.mjs; client side: yo2-decomp platform/net/net_ws.cpp).
// One WebSocket per client multiplexes its TCP sockets:
//   text   {"type":"open","id":N,"host":"127.0.0.1","port":P} -> {"type":"open","id":N,"status":0|-errno}
//   text   {"type":"close","id":N}  both ways ("shutdown" from the client is treated as close)
//   binary [1][id u32 BE][stream bytes]  both ways (type 2 = UDP: ignored, the recomp client never uses it)

export const ECONNREFUSED = -111;
export const EINVAL = -22;

export type Control =
  | { type: "open"; id: number; host?: string; port: number }
  | { type: "close" | "shutdown"; id: number }
  | { type: string; id?: number };

export function parseControl(text: string): Control | null {
  try {
    const m = JSON.parse(text);
    return m && typeof m === "object" && !Array.isArray(m) && typeof m.type === "string" ? m : null;
  } catch {
    return null;
  }
}

export function dataFrame(id: number, payload: Uint8Array): Uint8Array {
  const f = new Uint8Array(5 + payload.length);
  f[0] = 1;
  new DataView(f.buffer).setUint32(1, id >>> 0);
  f.set(payload, 5);
  return f;
}

/** [id, payload] of a TCP data frame, or null. */
export function readDataFrame(f: Uint8Array): [number, Uint8Array] | null {
  if (f.length < 5 || f[0] !== 1) return null;
  return [new DataView(f.buffer, f.byteOffset, f.byteLength).getUint32(1), f.subarray(5)];
}
