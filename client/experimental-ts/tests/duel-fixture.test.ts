import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { YO2Duel, type Msg } from '../../../server/src/duel/translator/translator';
import { mirror, mirror_state } from '../../../server/src/duel/translator/mirror';
import { PyRandom } from '../../../server/src/util/pyrandom';
import { WireDecoder } from '../../../server/test/cardwire';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { visiblePasscode } from '../src/duel/decode';
import { encodeDuelResponse } from '../src/duel/responses';
import type { DuelState } from '../src/duel/types';

// Original recordings stay private and read-only. No assets or derived data enter this test source.
const gd = resolve(import.meta.dirname, '../../../server/gamedata');
const dir = resolve(gd, 'fixtures/translator');
const available = existsSync(resolve(gd, 'translator.json')) && existsSync(resolve(gd, 'cards.json')) && existsSync(dir);
const files = available ? readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort() : [];
const revive = (_key: string, v: unknown) => typeof v === 'string' && v.startsWith('#big:') ? BigInt(v.slice(5)) : v;

describe.skipIf(!available)('private recorded duels: deterministic browser board vs authoritative translator', () => {
  const cm = available ? new CardMap(JSON.parse(readFileSync(resolve(gd, 'translator.json'), 'utf8'))) : null;
  const totals = { recordings: 0, boundaries: 0, packets: 0, successfulChoices: 0 };
  for (const file of files) {
    const doc = JSON.parse(gunzipSync(readFileSync(resolve(dir, file))).toString('utf8'), revive);
    if (doc.kind === 'unit') continue; // these intentionally mutate internal state without emitting wire updates
    it(file, () => {
      const rng = new PyRandom(doc.seed), views: YO2Duel[] = [], states: DuelState[] = [], wires: WireDecoder[] = [];
      const selections: { marks: Map<number, number>; single: number | null; announce: number | null; prompt: number }[] = [];
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
            selections[index] = { marks: new Map(), single: null, announce: null, prompt: -1 }; break;
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
            }
            const bytes = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            if (s.id === 0x6426 && payload.length >= 4) pick.single = bytes.getUint32(0);
            if (s.id === 0x6432 && payload.length >= 8) {
              const row = bytes.getUint32(0), order = bytes.getUint32(4);
              if (order) pick.marks.set(row, order); else pick.marks.delete(row);
            }
            if (s.id === 0x6423 && prompt?.kind === 'announce-card' && payload.length >= 4 && bytes.getUint32(0) > 1) pick.announce = bytes.getUint32(0);
            // Successful recorded choices must also be expressible through the new semantic client API.
            // Invalid historic requests that intentionally fell back to auto/retry are not credited.
            if (s.cmd?.cmd === 'respond') {
              totals.successfulChoices++;
              const context = `${file} step ${step} semantic response 0x${s.id.toString(16)}`;
              let encoded: ReturnType<typeof encodeDuelResponse> | null = null;
              if (s.id === 0x6350) encoded = encodeDuelResponse(state, { type: 'action', player: bytes.getUint32(0) as 0 | 1,
                // The server deliberately ignores pile indices in _click/_sum_click.
                // The new semantic client emits the canonical zero rather than a stale legacy cursor index.
                zone: bytes.getUint32(4), index: bytes.getUint32(4) >= 12 ? 0 : bytes.getUint32(8), command: bytes.getUint32(12) });
              else if (s.id === 0x002e) encoded = encodeDuelResponse(state, { type: 'phase', phase: bytes.getUint32(0) });
              else if (s.id === 0x6351) encoded = encodeDuelResponse(state, { type: 'cancel' });
              else if (s.id === 0x6423 && prompt?.kind === 'cards') {
                const indices = [...pick.marks].sort((a, b) => a[1] - b[1]).map(([i]) => i);
                if (!indices.length && pick.single !== null) indices.push(pick.single);
                encoded = encodeDuelResponse(state, indices.length || prompt.min === 0 ? { type: 'cards', indices } : { type: 'cancel' });
              } else if (s.id === 0x6423 && prompt?.kind === 'announce-card' && pick.announce !== null) {
                encoded = encodeDuelResponse(state, { type: 'announce-card', passcode: pick.announce });
              } else if (s.id === 0x6423) encoded = encodeDuelResponse(state, { type: 'answer', value: bytes.getUint32(0) });
              expect(encoded, context).not.toBe(null);
              if ([0x6350, 0x002e].includes(s.id)) {
                const expected = payload.slice();
                if (s.id === 0x6350 && bytes.getUint32(4) >= 12) new DataView(expected.buffer).setUint32(8, 0);
                expect(encoded![0].data, context).toEqual(expected);
              }
            }
            const [, out] = duel.on_client(s.id, payload);
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
    console.log('Experimental duel parity evidence:', totals);
  });
});
