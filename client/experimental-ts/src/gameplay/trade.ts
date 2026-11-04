import { command, payload, PayloadReader, records } from './binary';
import type { GameplayCommand } from './binary';

/** server/src/game/trade.ts SUB: all outgoing operations are u16 subcommands INSIDE 0x7000.
 * ADDCARD uses u32 passcodes on the current server (legacy NetLobby.cpp's u16 needs cardwire translation).
 */
function trade(sub: number, body: Uint8Array = new Uint8Array(0)): GameplayCommand { return command(0x7000, payload().u16(sub).raw(body).build()); }
export const tradeCommands = {
  request: (pid: number) => trade(0x7102, payload().u32(pid).build()),
  accept: () => trade(0x7105, payload().u32(1).build()),
  reject: () => trade(0x7105, payload().u32(0).build()),
  cancelRequest: () => trade(0x7108),
  /** After accepted OFFERREPLY: request trunk and limit tables. */
  loadCollection: () => trade(0x7132),
  /** Once UI can apply incoming moves, enables server's queued MOVEOTHER delivery. */
  start: () => trade(0x7101),
  addCard: (passcode: number) => trade(0x7113, payload().u32(passcode).build()),
  removeCard: (offerIndex: number) => {
    if (offerIndex < 0 || offerIndex >= 10) throw new RangeError('Trade offer index must be 0..9');
    return trade(0x7114, payload().u16(offerIndex).build());
  },
  acknowledgeMove: () => trade(0x7122),
  /** SETSTATUS locks both offers if either player is ready. No unlock opcode exists. */
  ready: () => trade(0x7117, payload().u8(1).build()),
  /** Current server consumes the choice byte only; verifies stored offers itself. */
  confirm: (accept: boolean) => trade(0x7119, payload().u8(accept ? 1 : 2).build()),
  exit: () => trade(0x7112),
  /** CLEAR aborts the trade, it does not merely empty one's offer. */
  abort: () => trade(0x7128),
};
export interface CardCount { passcode: number; count: number }
export type TradeEvent =
  | { type: 'offer'; pid: number; name: string }
  | { type: 'result'; operation: 'request' | 'offerReply' | 'addCard' | 'removeCard'; code: number }
  | { type: 'move'; operation: 'add' | 'remove'; value: number }
  | { type: 'ready' | 'otherReady'; ready: boolean }
  | { type: 'confirmResult'; result: number }
  | { type: 'end'; success: boolean }
  | { type: 'exit'; pid: number }
  | { type: 'cards'; table: 'trunk' | 'limit'; cards: CardCount[] }
  | { type: 'tableStart' | 'tableEnd'; table: 'trunk' | 'limit' }
  | { type: 'cancelled' | 'started' | 'arrived' | 'allReady' };
/** Incoming replies are top-level ids, not 0x7000 envelopes. Unknown ids return null; malformed known payloads throw. */
export function decodeTradeMessage(id: number, data: Uint8Array): TradeEvent | null {
  const r = new PayloadReader(data);
  let event: TradeEvent;
  switch (id) {
    case 0x7104: event = { type: 'offer', pid: r.u32(), name: r.text(16) }; break;
    case 0x7103: case 0x7105: case 0x7113: case 0x7114:
      event = { type: 'result', operation: id === 0x7103 ? 'request' : id === 0x7105 ? 'offerReply' : id === 0x7113 ? 'addCard' : 'removeCard', code: r.i32() }; break;
    case 0x7116: {
      const value = r.u32(), mode = r.u8();
      if (mode > 1) throw new RangeError('Unknown trade move operation');
      event = { type: 'move', operation: mode === 0 ? 'add' : 'remove', value }; break;
    }
    case 0x7117: case 0x7134: event = { type: id === 0x7117 ? 'ready' : 'otherReady', ready: r.u8() === 1 }; break;
    case 0x7120: event = { type: 'confirmResult', result: r.u8() }; break;
    case 0x7121: event = { type: 'end', success: r.u8() === 1 }; break;
    case 0x7112: event = { type: 'exit', pid: r.u32() }; break;
    case 0x7125: case 0x7129: event = { type: 'tableStart', table: id === 0x7125 ? 'trunk' : 'limit' }; break;
    case 0x7127: case 0x7131: event = { type: 'tableEnd', table: id === 0x7127 ? 'trunk' : 'limit' }; break;
    case 0x7126: case 0x7130: return { type: 'cards', table: id === 0x7126 ? 'trunk' : 'limit', cards: records(data, row => ({ passcode: row.u32(), count: row.u8() })) };
    case 0x7109: event = { type: 'cancelled' }; break;
    case 0x7133: event = { type: 'started' }; break;
    case 0x7122: event = { type: 'arrived' }; break;
    case 0x7118: event = { type: 'allReady' }; break;
    default: return null;
  }
  r.end(); return event;
}

export interface TradeView { otherOffer: readonly number[]; ready: boolean; otherReady: boolean; allReady: boolean; finished: boolean; success: boolean | null; trunk: readonly CardCount[]; limit: readonly CardCount[] }
export function initialTradeView(): TradeView { return { otherOffer: [], ready: false, otherReady: false, allReady: false, finished: false, success: null, trunk: [], limit: [] }; }
/** Pure projection only; never sends confirmation or assumes an ADDCARD ack proves server acceptance. */
export function reduceTradeView(state: TradeView, event: TradeEvent): TradeView {
  switch (event.type) {
    case 'move': return { ...state, otherOffer: event.operation === 'add' ? [...state.otherOffer, event.value] : state.otherOffer.filter((_, i) => i !== event.value) };
    case 'ready': return { ...state, ready: event.ready };
    case 'otherReady': return { ...state, otherReady: event.ready };
    case 'allReady': return { ...state, allReady: true };
    case 'confirmResult': return event.result === 2 ? { ...state, ready: false, otherReady: false, allReady: false } : state;
    case 'end': return { ...state, finished: true, success: event.success };
    case 'exit': case 'cancelled': return { ...state, finished: true, success: false };
    case 'tableStart': return { ...state, [event.table]: [] };
    case 'cards': return { ...state, [event.table]: [...state[event.table], ...event.cards] };
    default: return state;
  }
}
