import { DuelProtocolError } from './decode';
import type { DuelResponse, DuelState, WireMessage } from './types';

function requireChoice(ok: unknown, message: string): asserts ok {
  if (!ok) throw new DuelProtocolError(message);
}
function uint(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 0xffffffff; }
function packet(id: number, ...values: number[]): WireMessage {
  const data = new Uint8Array(values.length * 4), view = new DataView(data.buffer);
  values.forEach((value, i) => view.setUint32(i * 4, value));
  return { id, data };
}

/** Encode only choices exposed by the current server prompt; never mutate or consume state.
 * Callers must discard UI callbacks when prompt.id changes: DuelResponse has no prompt token.
 * Untransmitted core constraints (announcement predicates, sum weights, optional-list minima)
 * remain server-authoritative. A cancel/finish request may be rejected by the server;
 * encoding it never means the selection was accepted or that local state may advance.
 */
export function encodeDuelResponse(state: DuelState, response: DuelResponse): WireMessage[] {
  const prompt = state.prompt;
  requireChoice(state.status === 'playing' && state.acceptingInput && !state.result && prompt,
    'No active duel prompt');
  requireChoice(prompt.id === state.promptSequence && prompt.id > 0, 'Stale duel prompt');
  requireChoice(prompt.kind !== 'unsupported', 'Unsupported duel prompt');
  switch (response.type) {
    case 'action': {
      requireChoice(['actions', 'field-selection', 'discard', 'ritual'].includes(prompt.kind), 'Prompt does not accept board actions');
      const { player, zone, index, command } = response;
      requireChoice((player === 0 || player === 1) && Number.isInteger(zone) && zone >= 0 && zone <= 15 &&
        Number.isInteger(index) && index >= 0 && index <= 79 && Number.isInteger(command) && command >= 0 && command <= 13,
      'Invalid action coordinates or command');
      requireChoice(zone === 11 || index === 0, 'Field and pile actions use slot zones and index zero');
      const mask = zone === 11 ? state.handMasks[player][index] : state.fieldMasks[player][zone];
      requireChoice((mask & (1 << command)) !== 0 && prompt.actions.some(a => a.player === player && a.zone === zone &&
        a.index === index && a.command === command), 'Action is not in the current server masks');
      return [packet(0x6350, player, zone, index, command)];
    }
    case 'phase':
      requireChoice(prompt.kind === 'actions' && [3, 4, 5].includes(response.phase) &&
        prompt.buttons.includes(response.phase) && state.buttons[0].includes(response.phase), 'Phase is not enabled');
      return [packet(0x002e, response.phase)];
    case 'yesno':
      requireChoice(prompt.kind === 'yesno' && typeof response.yes === 'boolean', 'Prompt does not accept yes/no');
      requireChoice(prompt.options.some(o => o.value === Number(response.yes)), 'Answer is not enabled');
      return [packet(0x6423, Number(response.yes))];
    case 'answer': {
      const value = response.value;
      requireChoice(uint(value), 'Answer must be an unsigned 32-bit integer');
      requireChoice(['yesno', 'option', 'position', 'race', 'attribute', 'number'].includes(prompt.kind), 'Prompt does not accept an answer');
      if (prompt.kind === 'attribute') {
        const available = prompt.options.reduce((mask, o) => mask | o.value, 0);
        let bits = value, count = 0;
        while (bits) { bits = (bits & (bits - 1)) >>> 0; count++; }
        requireChoice((value & ~available) === 0 && count === prompt.min && count === prompt.max, 'Invalid attribute selection');
      } else {
        requireChoice(prompt.options.some(o => o.value === value), 'Answer is not an available option');
        if (prompt.kind === 'number') requireChoice(value >= prompt.min && value <= prompt.max, 'Number is outside the prompt range');
      }
      return [packet(0x6423, value)];
    }
    case 'cards': {
      requireChoice(prompt.kind === 'cards' && (prompt.listMode >= 6 && prompt.listMode <= 0x26 ||
        prompt.listMode >= 0x28 && prompt.listMode <= 0x48), 'Prompt is not a selectable card list');
      const indices = response.indices;
      requireChoice(Array.isArray(indices) && indices.length >= prompt.min &&
        indices.length <= prompt.max && new Set(indices).size === indices.length, 'Invalid selection count or duplicate indices');
      requireChoice(indices.every(i => Number.isInteger(i) && i >= 0 && i < prompt.items.length), 'Card index is outside the prompt list');
      // The translator sorts nonzero marks by their order; a bare close cannot select cards.
      return [...indices.map((index, order) => packet(0x6432, index, order + 1)), packet(0x6423, 0)];
    }
    case 'announce-card':
      requireChoice(prompt.kind === 'announce-card' && uint(response.passcode) && response.passcode > 1 &&
        response.passcode < 0xffffff00, 'Invalid card announcement');
      // ANNOUNCE_CARD records the passcode first, then resolves on a separate 0/1 close.
      return [packet(0x6423, response.passcode), packet(0x6423, 0)];
    case 'cancel':
      requireChoice(prompt.cancelable, 'Cancellation is unavailable');
      if (prompt.kind === 'yesno') return [packet(0x6423, 0)];
      if (prompt.kind === 'cards') return [packet(0x6423, 0)];
      requireChoice(['actions', 'field-selection', 'discard', 'ritual'].includes(prompt.kind), 'This dialog cannot be cancelled');
      return [packet(0x6351)];
    default: throw new DuelProtocolError('Unknown duel response');
  }
}
