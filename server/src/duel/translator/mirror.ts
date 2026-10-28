// py ocg_duel.py PvP helpers: each client believes it is player 0, so the server runs two translators and the second
// one sees the duelcore events mirrored (0 <-> 1), exactly what duelcore itself changes when it starts with first=1.

const PVP_PLAYER_KEYS = new Set(["player", "controller", "triggering_controller", "turn_player", "winner"]);
const PVP_PAIR_KEYS = new Set(["players", "results", "lp"]);

/** A duelcore event seen from the other side (a copy). */
export function mirror(v: any, key = ""): any {
  if (Array.isArray(v)) {
    const arr = v.map((x) => mirror(x));
    if (arr.length === 2 && PVP_PAIR_KEYS.has(key)) arr.reverse();
    return arr;
  }
  if (v !== null && typeof v === "object") {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (PVP_PLAYER_KEYS.has(k) && typeof x === "number" && (x === 0 || x === 1)) o[k] = 1 - x;
      else o[k] = mirror(x, k);
    }
    if (o.type === "FIELD_DISABLED" && Number.isInteger(o.field_mask)) {
      const m = o.field_mask;
      o.field_mask = ((((m & 0xffff) << 16) >>> 0) + Math.floor(m / 65536)) % 2 ** 32;
    }
    return o;
  }
  return v;
}

/** duelcore query seen from the other side: duelcore with first=1 only swaps "players". */
export function mirror_state(st: any): any {
  if (st === null || typeof st !== "object" || Array.isArray(st)) return st;
  const o = { ...st };
  if (Array.isArray(o.players) && o.players.length === 2) o.players = [o.players[1], o.players[0]];
  return o;
}

/** A response of views[p] -> absolute indices (only places[].player carries a player). */
export function unmirror_response(p: number, resp: any): any {
  if (p !== 1 || resp === null || typeof resp !== "object" || !Array.isArray(resp.places)) return resp;
  return { ...resp, places: resp.places.map((pl: any) => (pl.player === 0 || pl.player === 1 ? { ...pl, player: 1 - pl.player } : pl)) };
}

/** ocg_duel._is_end: a 0x6202 that ends the duel (type 0x4d, or engine command 0x05 DUEL_END). */
export function is_end(m: [number, Uint8Array] | Uint8Array): boolean {
  const [mid, data] = m instanceof Uint8Array ? [0x6202, m] : m;
  if (mid !== 0x6202 || data.length < 8) return false;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const t = dv.getUint32(0), b = dv.getUint32(4);
  return (t & 0xff) === 0x4d || ((t & 0xff) === 0 && (b & 0xfff) === 0x05);
}
