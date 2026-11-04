import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel, type Msg } from '../../../server/src/duel/translator/translator';
import { mirror, mirror_state } from '../../../server/src/duel/translator/mirror';
import { PyRandom } from '../../../server/src/util/pyrandom';
import { WireDecoder } from '../../../server/test/cardwire';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { visiblePasscode } from '../src/duel/decode';
import { encodeDuelResponse } from '../src/duel/responses';
import type { DuelResponse, DuelState, WireMessage } from '../src/duel/types';

// Original recordings stay private and read-only. No assets or derived data enter this test source.
const gd = resolve(import.meta.dirname, '../../../server/gamedata');
const dir = resolve(gd, 'fixtures/translator');
const available = existsSync(resolve(gd, 'translator.json')) && existsSync(resolve(gd, 'cards.json')) && existsSync(dir);
const files = available ? readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort() : [];
const revive = (_key: string, v: unknown) => typeof v === 'string' && v.startsWith('#big:') ? BigInt(v.slice(5)) : v;

/** Clone the pre-decision server state, retaining class methods but isolating mutable state/RNG.
 * The immutable card database is shared; no reference query/clock closure may run in the oracle.
 */
function cloneGraph<T>(value: T, seen = new Map<object, unknown>()): T {
  if (!value || typeof value !== 'object') return value;
  const existing = seen.get(value); if (existing) return existing as T;
  if (ArrayBuffer.isView(value)) return (value as unknown as Uint8Array).slice() as T;
  if (value instanceof Map) { const out = new Map(); seen.set(value, out); for (const [k, v] of value) out.set(cloneGraph(k, seen), cloneGraph(v, seen)); return out as T; }
  if (value instanceof Set) { const out = new Set(); seen.set(value, out); for (const v of value) out.add(cloneGraph(v, seen)); return out as T; }
  if (Array.isArray(value)) { const out: unknown[] = []; seen.set(value, out); for (const v of value) out.push(cloneGraph(v, seen)); return out as T; }
  const out = Object.create(Object.getPrototypeOf(value)); seen.set(value, out);
  for (const [k, v] of Object.entries(value)) out[k] = cloneGraph(v, seen);
  return out;
}
function forkDecision(reference: YO2Duel): YO2Duel {
  const out = Object.create(Object.getPrototypeOf(reference)) as YO2Duel;
  const seen = new Map<object, unknown>([[reference.cm, reference.cm]]);
  for (const [k, v] of Object.entries(reference)) (out as any)[k] = cloneGraph(v, seen);
  out.log = () => {};
  out.query = null; out.clock = () => { throw new Error('Oracle clock not installed'); };
  return out;
}
const wireOutput = (out: Msg[]) => out.map(([id, bytes]) => [id, Buffer.from(bytes).toString('hex')]);
const decisionProgress = (duel: YO2Duel) => ({ mode: duel.state?.mode ?? null, chosen: duel.state?.chosen ?? null,
  counterAllocations: duel.state?.got ?? null, declaredCard: duel.state?.card ?? null,
  waiting: duel.waiting, queuedUnselect: duel.unsel_queue, viewing: duel.viewing });

describe.skipIf(!available)('private recorded duels: deterministic browser board vs authoritative translator', () => {
  const cm = available ? new CardMap(JSON.parse(readFileSync(resolve(gd, 'translator.json'), 'utf8'))) : null;
  const totals = { recordings: 0, boundaries: 0, packets: 0, successfulChoices: 0, oracleDecisions: 0,
    oraclePackets: 0, oracleRejectedRequests: 0, oracleCategories: {} as Record<string, number>,
    rejectedReasons: {} as Record<string, number> };
  for (const file of files) {
    const doc = JSON.parse(gunzipSync(readFileSync(resolve(dir, file))).toString('utf8'), revive);
    if (doc.kind === 'unit') continue; // these intentionally mutate internal state without emitting wire updates
    it(file, () => {
      const rng = new PyRandom(doc.seed), views: YO2Duel[] = [], states: DuelState[] = [], wires: WireDecoder[] = [];
      const selections: { marks: Map<number, number>; single: number | null; announce: number | null; prompt: number;
        oracle: YO2Duel | null; state: DuelState | null; outputs: Msg[]; q: any[]; clocks: number[] }[] = [];
      let current: any = null, compared = 0;
      const take = (key: 'q' | 'clk') => {
        if (!current[key]?.length) throw new Error(`Unexpected translator ${key} request`);
        return current[key].shift();
      };
      const accept = (index: number, out: Msg[], step: number) => {
        totals.packets += out.length;
        for (const [id, data] of out) states[index] = reduceDuelMessage(states[index], { id, data });
        wires[index].decode(out); // learn announce-card context for recorded v1 response conversion
        const state = states[index], duel = views[index], context = `${file} step ${step} ${current.op} view ${index}`;
        expect(state.errors, context).toEqual([]);
        expect(state.unsupported, context).toEqual([]);
        for (const p of [0, 1] as const) {
          const side = state.sides[p], reference = duel.side[p];
          for (const [ours, theirs] of [['monster', 'mz'], ['spell', 'sz'], ['hand', 'hand'], ['deck', 'deck'],
            ['extra', 'extra'], ['grave', 'grave'], ['banish', 'banish']] as const) {
            expect(side[ours], `${context} player ${p} ${ours}`).toEqual(reference[theirs]);
            for (let position = 0; position < reference[theirs].length; position++) {
              const uid = reference[theirs][position];
              if (uid === null) continue;
              const card = state.cards[uid], known = duel.cards.get(uid)!;
              expect(card, `${context} UID ${uid} location`).toMatchObject({ player: p, zone: ours, index: position, owner: known.owner });
              expect(card.passcode, `${context} UID ${uid} exposed identity`).toBe(visiblePasscode(known.known ?? 0));
              if (ours === 'monster' || ours === 'spell') expect(card.faceUp, `${context} UID ${uid} face`).toBe(known.face);
              // Translator carries OCG position bits on spells too; those do not indicate defense orientation.
              if (ours === 'monster') expect(card.defense, `${context} UID ${uid} defense position`).toBe(known.defense);
            }
          }
          expect(side.lp, `${context} player ${p} LP`).toBe(Math.min(duel.lp[p], 0xffff));
        }
        compared++;
        totals.boundaries++;
      };
      for (let step = 0; step < doc.steps.length; step++) {
        const s = doc.steps[step], index = s.v;
        current = { ...s, q: [...s.q || []], clk: [...s.clk || []] };
        const duel = views[index];
        switch (s.op) {
          case 'new': {
            const config = { place_order: 'py', fusion_needs_summon: false, unselect_list: false, toss_on_card: false, ...s.cfg };
            const view = new YO2Duel(s.decks, { first: s.first, cardmap: cm!, cfg: config, rng, clock: () => take('clk') });
            view.query = () => doc.kind === 'pvp' && index === 1 ? mirror_state(take('q')) : take('q');
            views[index] = view; states[index] = createDuelState(); wires[index] = new WireDecoder(gd);
            selections[index] = { marks: new Map(), single: null, announce: null, prompt: -1,
              oracle: null, state: null, outputs: [], q: [], clocks: [] }; break;
          }
          case 'set': (duel as any)[s.k] = s.val; break;
          case 'start': accept(index, duel.start(), step); break;
          case 'rng': (rng as any)[s.fn](...s.args); break;
          case 'feed': accept(index, duel.feed_many(doc.kind === 'pvp' && index === 1 ? s.evs.map(mirror) : s.evs), step); break;
          case 'sync': accept(index, duel.sync_stats(doc.kind === 'pvp' && index === 1 ? mirror_state(s.state) : s.state), step); break;
          case 'needs_auto': duel.needs_auto(); break;
          case 'auto_response': duel.auto_response(); break;
          case 'client': {
            if (s.exc) break;
            const payload = wires[index].encode(s.id, new Uint8Array(Buffer.from(s.data, 'hex')));
            const state = states[index], prompt = state.prompt, pick = selections[index];
            if (prompt?.id !== pick.prompt) {
              pick.marks.clear(); pick.single = null; pick.announce = null; pick.prompt = prompt?.id ?? -1;
              pick.oracle = null; pick.state = null; pick.outputs = []; pick.q = []; pick.clocks = [];
            }
            const bytes = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const intermediate = s.id === 0x6426 || s.id === 0x6432 || s.id === 0x6423 && prompt?.kind === 'announce-card' && payload.length >= 4 && bytes.getUint32(0) > 1;
            if (!pick.oracle) { pick.oracle = forkDecision(duel); pick.state = structuredClone(state); }
            pick.q.push(...s.q || []); pick.clocks.push(...s.clk || []);
            if (s.id === 0x6426 && payload.length >= 4) pick.single = bytes.getUint32(0);
            if (s.id === 0x6432 && payload.length >= 8) {
              const row = bytes.getUint32(0), order = bytes.getUint32(4);
              if (order) pick.marks.set(row, order); else pick.marks.delete(row);
            }
            if (s.id === 0x6423 && prompt?.kind === 'announce-card' && payload.length >= 4 && bytes.getUint32(0) > 1) pick.announce = bytes.getUint32(0);
            const context = `${file} step ${step} semantic response 0x${s.id.toString(16)}`;
            let response: DuelResponse | null = null;
            if (!intermediate) {
              if (s.id === 0x6350) response = { type: 'action', player: bytes.getUint32(0) as 0 | 1,
                // The server deliberately ignores pile indices in _click/_sum_click.
                // The new semantic client emits the canonical zero rather than a stale legacy cursor index.
                zone: bytes.getUint32(4), index: bytes.getUint32(4) >= 12 ? 0 : bytes.getUint32(8), command: bytes.getUint32(12) };
              else if (s.id === 0x002e) response = { type: 'phase', phase: bytes.getUint32(0) };
              else if (s.id === 0x6351) response = { type: 'cancel' };
              else if (s.id === 0x6423 && prompt?.kind === 'cards') {
                const indices = [...pick.marks].sort((a, b) => a[1] - b[1]).map(([i]) => i);
                if (!indices.length && pick.single !== null) indices.push(pick.single);
                response = indices.length || prompt.min === 0 ? { type: 'cards', indices } : { type: 'cancel' };
              } else if (s.id === 0x6423 && prompt?.kind === 'announce-card' && pick.announce !== null) {
                response = { type: 'announce-card', passcode: pick.announce };
              } else if (s.id === 0x6423) response = { type: 'answer', value: bytes.getUint32(0) };
            }
            const [referenceCommand, out] = duel.on_client(s.id, payload);
            expect(referenceCommand, `${context} recorded core command`).toEqual(s.cmd ?? null);
            pick.outputs.push(...out);
            if (!intermediate) {
              expect(response, context).not.toBe(null);
              let encoded: WireMessage[] | null = null;
              try { encoded = encodeDuelResponse(pick.state!, response!); }
              catch (error) {
                if (referenceCommand?.cmd === 'respond') throw new Error(`${context}: encoder rejected successful choice: ${String(error)}`);
                if (!referenceCommand) expect(decisionProgress(duel), `${context} rejected request must not hide semantic progress`)
                  .toEqual(decisionProgress(pick.oracle!));
                const reason = error instanceof Error ? error.message : String(error);
                totals.rejectedReasons[reason] = (totals.rejectedReasons[reason] ?? 0) + 1;
                totals.oracleRejectedRequests++;
              }
              if (encoded) {
                const oracle = pick.oracle!, q = [...pick.q], clocks = [...pick.clocks], unexpectedReads: string[] = [];
                oracle.clock = () => { if (!clocks.length) { unexpectedReads.push('clock'); throw new Error(`${context}: extra oracle clock request`); } return clocks.shift()!; };
                oracle.query = duel.query === null ? null : () => {
                  if (!q.length) { unexpectedReads.push('query'); throw new Error(`${context}: extra oracle board query`); }
                  const snapshot = q.shift(); return doc.kind === 'pvp' && index === 1 ? mirror_state(snapshot) : snapshot;
                };
                const commands: unknown[] = [], oracleOutput: Msg[] = [];
                for (const packet of encoded) {
                  const [command, produced] = oracle.on_client(packet.id, packet.data);
                  if (command) commands.push(command); oracleOutput.push(...produced);
                }
                expect(commands, `${context} NEW encoded core commands`).toEqual(referenceCommand ? [referenceCommand] : []);
                expect(wireOutput(oracleOutput), `${context} NEW encoded server output`).toEqual(wireOutput(pick.outputs));
                expect(clocks, `${context} unconsumed oracle clock`).toEqual([]);
                expect(q, `${context} unconsumed oracle query`).toEqual([]);
                expect(unexpectedReads, `${context} unexpected oracle reads (including errors swallowed by server)` ).toEqual([]);
                totals.oracleDecisions++; totals.oraclePackets += encoded.length;
                const category = referenceCommand?.cmd === 'respond' ? String(referenceCommand.response.type) : pick.state?.prompt?.kind ?? 'none';
                totals.oracleCategories[category] = (totals.oracleCategories[category] ?? 0) + 1;
                if (referenceCommand?.cmd === 'respond') totals.successfulChoices++;
              }
              pick.oracle = null; pick.state = null; pick.outputs = []; pick.q = []; pick.clocks = [];
            }
            accept(index, out, step); break;
          }
          case 'resend': accept(index, duel.resend(), step); break;
          case 'query_none': duel.query = null; break;
          case 'finished': duel.finished = true; break;
          case 'surrender': break;
          default: throw new Error(`Unknown recorded operation ${s.op}`);
        }
      }
      expect(compared).toBeGreaterThan(0);
      totals.recordings++;
    }, 30_000);
  }
  it('summary of exercised authoritative state and successful choice boundaries', () => {
    expect(totals.recordings).toBeGreaterThan(0);
    expect(totals.successfulChoices).toBeGreaterThan(0);
    for (const category of ['SELECT_IDLECMD', 'SELECT_BATTLECMD', 'SELECT_CHAIN', 'SELECT_CARD', 'SELECT_PLACE',
      'SELECT_UNSELECT_CARD', 'SELECT_OPTION', 'ANNOUNCE_RACE', 'SELECT_POSITION', 'SELECT_TRIBUTE', 'SELECT_EFFECTYN',
      'SELECT_YESNO', 'SORT_CARD', 'ANNOUNCE_NUMBER', 'ANNOUNCE_ATTRIB', 'SELECT_SUM', 'ANNOUNCE_CARD']) {
      expect(totals.oracleCategories[category], `Independent encoded coverage for ${category}`).toBeGreaterThan(0);
    }
    console.log('Experimental duel parity evidence:', totals);
  });
});

describe('semantic oracle isolation and mutation sensitivity', () => {
  function example() {
    const cardmap = new CardMap({ wire: [123, 456], wireHash: 0,
      cdb: { 123: [1, 0, 100, 100, 1, 1, 0, 1], 456: [1, 0, 100, 100, 1, 1, 0, 1] }, scripts: {} });
    const d = new YO2Duel([{ main: [123, 456] }, {}], { cardmap, rng: new PyRandom(1), cfg: { turn_timer: 0 } });
    let state = createDuelState();
    for (const [id, data] of d.start()) state = reduceDuelMessage(state, { id, data });
    for (const [id, data] of norm(d._on_select({ type: 'SELECT_CARD', selects: [0, 1].map(sequence =>
      ({ controller: 0, location: 1, sequence, code: [123, 456][sequence] })), min: 2, max: 2 }))) state = reduceDuelMessage(state, { id, data });
    return { d, state };
  }
  function produced(d: YO2Duel, packets: WireMessage[]) {
    return packets.map(packet => d.on_client(packet.id, packet.data)[0]).filter(Boolean);
  }
  it('isolates pending lists, card objects, random state and decision completion', () => {
    const { d, state } = example(), candidate = forkDecision(d);
    candidate.state.marks.set(1, 1); expect(d.state.marks.size).toBe(0);
    candidate.card(2).face = true; expect(d.card(2).face).toBe(false);
    candidate.rng.getrandbits(32); expect(d.rng.getrandbits(32)).toBe(new PyRandom(1).getrandbits(32));
    expect(produced(candidate, encodeDuelResponse(state, { type: 'cards', indices: [1, 0] }))).toEqual([
      { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [1, 0] } },
    ]);
    expect(candidate.waiting).toBe(null); expect(d.waiting.type).toBe('SELECT_CARD');
  });
  it('detects corrupted list order even when both packet sets produce no server output', () => {
    const { d, state } = example(), expected = { cmd: 'respond', response: { type: 'SELECT_CARD', indicies: [1, 0] } };
    const valid = encodeDuelResponse(state, { type: 'cards', indices: [1, 0] });
    const corrupt = valid.map(packet => ({ ...packet, data: packet.data.slice() }));
    new DataView(corrupt[0].data.buffer).setUint32(4, 2); new DataView(corrupt[1].data.buffer).setUint32(4, 1);
    expect(produced(forkDecision(d), valid)).toEqual([expected]);
    expect(produced(forkDecision(d), corrupt)).not.toEqual([expected]);
  });
  it('detects wrong numeric/attribute values through real core commands rather than payload equality', () => {
    const { d } = example(); let state = createDuelState(); state.status = 'playing';
    for (const [id, data] of norm(d._on_select({ type: 'ANNOUNCE_ATTRIB', available: 0x30, count: 1 }))) state = reduceDuelMessage(state, { id, data });
    const valid = encodeDuelResponse(state, { type: 'answer', value: 2 });
    const corrupt = valid.map(packet => ({ ...packet, data: packet.data.slice() }));
    new DataView(corrupt[0].data.buffer).setUint32(0, 4);
    expect(produced(forkDecision(d), valid)).toEqual([{ cmd: 'respond', response: { type: 'ANNOUNCE_ATTRIB', attributes: [0x10] } }]);
    expect(produced(forkDecision(d), corrupt)).toEqual([{ cmd: 'respond', response: { type: 'ANNOUNCE_ATTRIB', attributes: [0x20] } }]);
  });
});
