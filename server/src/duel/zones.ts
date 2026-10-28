// The order an automatic placement tries the zones in (OCGcore SELECT_PLACE / SELECT_DISFIELD). Shared by every
// zone picker: the engine's `auto` (engine/bot.ts), the translator's answer for a client with "Auto Card Placing" on
// (translator/helpers.ts _free_places), the NPC AI (ai/prompt.ts freePlaces, ai/heuristicBot.ts) and the py-parity
// brain (brain/brain.ts, whose own order this already was).
//
// Official order: the centre zone first, then the two next to it, then the edges: OCGcore sequences 2, 1, 3, 0, 4.
// A sequence is per player and from that player's own side (sequence 0 = their leftmost; the client draws the
// opponent's field turned round, with slot s facing the viewer's slot 4 - s), so the same order serves both players
// and nothing is mirrored. Zones past the five main ones (the extra monster zones 5-6, the field zone 5 and the
// pendulum zones 6-7 of SZONE) keep their own order after them.
//
// "py" is py's order (the first free zone from the left), for the parity runs only (PLACE_ORDER=py).

export type PlaceOrder = "centre" | "py";

const CENTRE_FIRST = [2, 1, 3, 0, 4];

/** The sequences 0..n-1 of one region, in the order an automatic placement tries them. */
export function zoneOrder(n: number, order: PlaceOrder = "centre"): number[] {
  const all = Array.from({ length: n }, (_, s) => s);
  return order === "py" ? all : [...CENTRE_FIRST.filter((s) => s < n), ...all.filter((s) => s >= CENTRE_FIRST.length)];
}

/** PLACE_ORDER: "py" (parity runs) or the official centre-first order (anything else). */
export const placeOrderFrom = (v: unknown): PlaceOrder => (String(v ?? "").trim().toLowerCase() === "py" ? "py" : "centre");
