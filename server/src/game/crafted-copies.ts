// Tradeable crafted copies retain their dismantle lock as they move. They leave first in a trade.
import type { P } from "./persist.ts";
export function craftedOffered(p: P, cards: number[]): number[] {
  const left = { ...(p.crafted ?? {}) }, out: number[] = [];
  for (const pc of cards) if ((left[pc] ?? 0) > 0) { left[pc]--; out.push(pc); }
  return out;
}
export function craftedMove(p: P, outgoing: number[], incoming: number[]) {
  const locked = p.crafted ??= {};
  for (const pc of outgoing) { locked[pc] = Math.max(0, (locked[pc] ?? 0) - 1); if (!locked[pc]) delete locked[pc]; }
  for (const pc of incoming) locked[pc] = (locked[pc] ?? 0) + 1;
}
