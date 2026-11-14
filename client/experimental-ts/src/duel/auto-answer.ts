// DUEL OPTIONS in the duel (the engine's CWindowModelDuelConfig settings; their meanings are its help texts, yo2text
// 0x1984..0x198b): the answers the client gives by itself. Auto Card Placing ON: "The game will place the card on any
// available position for you" (a placement on the player's own empty zones takes the first one offered). Activation
// Message: Auto Cancel answers NO to every message asking to confirm an activation, Semi Auto Cancel only to the low
// priority ones (the generic "respond?" chain questions, asked whenever any card could respond), Manual shows them all.
// Holding the right mouse button answers NO to them, holding the left one shows them ("These mouse controls will
// override your Activation Message Settings"). Pure.
import type { DuelOptions } from '../ui/contracts';
import type { DuelResponse, DuelState } from './types';

/** Dialog texts (dlg_text) that ask to confirm an activation: respond to this effect / card, activate this effect
 * (from the hand, from the Graveyard). The first two are the chain's generic questions: low priority. */
export const ACTIVATION_TEXTS = new Set([7, 8, 250, 328, 329]);
export const LOW_PRIORITY_TEXTS = new Set([7, 8]);
/** The order Auto Card Placing fills a row's five zones in (their index in the row). */
export const PLACE_ORDER = [2, 1, 3, 0, 4];
export interface HeldButtons { left: boolean; right: boolean }

export function autoAnswer(state: DuelState, options: DuelOptions, held: HeldButtons = { left: false, right: false }): DuelResponse | null {
  const p = state.prompt;
  if (!p || state.status !== 'playing' || !state.acceptingInput || state.result || state.observer) return null;
  if (p.kind === 'yesno') {
    const ids = p.text.filter(t => t.kind === 0 || t.kind === 2).map(t => t.value);
    if (!ids.some(id => ACTIVATION_TEXTS.has(id))) return null;
    if (held.left) return null;
    if (held.right) return { type: 'yesno', yes: false };
    const low = ids.every(id => !ACTIVATION_TEXTS.has(id) || LOW_PRIORITY_TEXTS.has(id));
    if (options.activationMessage === 0 || options.activationMessage === 1 && low) return { type: 'yesno', yes: false };
    return null;
  }
  if ((p.kind === 'field-selection' || p.kind === 'actions') && options.autoPlacing) {
    // only a placement: every zone choice one of the player's own empty monster / spell zones (the selection's other
    // commands, a pile's Inspect and the deck's Surrender, ride along with it: the server's place question after a
    // Summon or a Set is an action list of zone Selects (command 11) with them, and live places the card at once)
    const zones = p.actions.filter(a => a.zone <= 10);
    const empty = zones.length > 0 && zones.every(a => a.player === 0 && (p.kind === 'field-selection' || a.command === 11) && (a.zone <= 4 ? state.sides[0].monster[a.zone] : state.sides[0].spell[a.zone - 5]) == null);
    if (!empty) return null;
    // live's engine fills the row from its middle: the middle zone, then the one left of it, then right, then the ends
    // (de-scratch/hand l31 / l33: a Summon to the middle, two Sets to the middle and then the one left of it)
    const a = [...zones].sort((x, y) => PLACE_ORDER.indexOf(x.zone % 5) - PLACE_ORDER.indexOf(y.zone % 5))[0]!;
    return { type: 'action', player: a.player, zone: a.zone, index: a.index, command: a.command };
  }
  return null;
}
