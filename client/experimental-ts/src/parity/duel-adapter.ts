import { decodeCommands } from '../duel/decode';
import { createDuelState, reduceDuelMessage } from '../duel/model';
import type { DuelState } from '../duel/types';
import type { ReplayAdapter } from './replay';

/** Actual browser reducer recognition, not server translator parity. A batch with any
 * unsupported record receives no credit. Presentation outputs do not imply UI/response parity. */
export const duelReplayAdapter: ReplayAdapter<DuelState> = {
  initial: () => createDuelState(),
  apply(previous, message) {
    const state = reduceDuelMessage(previous, message);
    // Probe each command independently: diagnostics roll over, and DUEL_INIT can clear
    // an earlier unsupported instruction in the same batch. Neither means support.
    let supported = true;
    let probe: DuelState = { ...previous, errors: [], unsupported: [] };
    let opcodes: string[] = [];
    try {
      const records = message.id === 0x6202 ? decodeCommands(message.data) : null;
      const width = records ? message.data.length / records.length : message.data.length;
      for (let i = 0; i < (records?.length ?? 1); i++) {
        probe = reduceDuelMessage({ ...probe, errors: [], unsupported: [] }, {
          ...message, data: records ? message.data.slice(i * width, (i + 1) * width) : message.data,
        });
        if (probe.errors.length || probe.unsupported.length || probe.prompt?.kind === 'unsupported') supported = false;
      }
      if (supported) opcodes = records
        ? records.map(r => `0x6202/kind:0x${r.kind.toString(16)}/b:0x${(r.kind === 0 ? r.b & 0xfff : r.b).toString(16)}`)
        : [`0x${message.id.toString(16)}`];
    } catch { supported = false; }
    return { state, supported, opcodes, outputs: state.events.filter(e => e.sequence === state.sequence) };
  },
};
