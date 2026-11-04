import { ApiError } from '../services/http';

/** Readable sentences for the shop's and the cosmetics' server refusals (server/src/game/shop-api.ts, cosmetics.ts),
 * which arrive as codes. An unknown code is shown as received. */
const MESSAGES: Readonly<Record<string, string>> = {
  'purchase-rejected': 'The server refused this purchase: not enough MP for the whole order, or the item is already owned. Nothing was charged.',
  'invalid-purchase': 'Choose a quantity from 1 to 50.',
  'stale-request': 'The shop changed since it was loaded. Refresh the shop and try again; nothing was charged.',
  'request-id-conflict': 'This request was already used for a different purchase. Refresh the shop and try again.',
  'request-conflict': 'This request was already used for a different item. Refresh and try again.',
  'unavailable-item': 'This item is no longer sold.',
  busy: 'Finish your duel or trade before shopping.',
  'in-duel': 'Finish your duel before changing cosmetics.',
  'free-mode': 'Not available in Free Duel mode.',
  'no-character': 'Select a character first.',
  'not-in-game': 'Go online with a character first.',
  'insufficient-earned-mp': 'Not enough earned MP. Cosmetic boxes are paid with earned MP only; starter MP cannot be used.',
  'unavailable-pool': 'This box cannot be opened right now.',
  'not-owned': 'You do not own this cosmetic.',
  'no-compatible-variant': 'This cosmetic cannot be worn with your current body or world.',
  'insufficient-duplicates': 'You do not have a spare copy of that cosmetic to trade.',
  'server-restarting': 'The server is restarting. Try again in a moment.',
};
export function serverMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
  return MESSAGES[code] ?? code;
}
/** The same error with a readable message; anything else (an abort) is returned unchanged. */
export function readableError(error: unknown): unknown {
  if (!(error instanceof ApiError) || !(error.message in MESSAGES)) return error;
  return new ApiError(MESSAGES[error.message]!, error.status, error.code ?? error.message, error.payload);
}
