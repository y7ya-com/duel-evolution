// The duel record the server sends at a duel's end (src/duel/record.ts), decoded from messages made by the server's own
// encoder (server/src/duel/duellog.ts messages(), tests/fixtures/duel-record.json): the 0x6013 handshake, the players,
// every 0x6202 back byte for byte; kept in this browser (services/duel-records.ts) and matched to the archive's rows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DuelRecordCollector, RECORD_FINISH, decodeDuelRecord, recordMessages, recordName, rleDecode } from '../src/duel/record';
import { matchRecord, memoryRecordStore, RECORDS_KEEP } from '../src/services/duel-records';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';

const fx = JSON.parse(readFileSync(new URL('./fixtures/duel-record.json', import.meta.url), 'utf8')) as { messages: [number, string][]; entries: [number, string][] };
const b = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
const msgs = fx.messages.map(([id, d]) => [id, b(d)] as const);

describe('the duel record', () => {
  it('collects 0x6010 .. 0x6012, answering each but the last with 0x6013, and decodes the server\'s record', () => {
    const c = new DuelRecordCollector(); let acks = 0, rec = null as ReturnType<typeof decodeDuelRecord> | null;
    expect(c.receive(0x6011, new Uint8Array(4))).toEqual({ ack: false });   // a chunk without a header is no record
    for (const [id, d] of msgs) { const got = c.receive(id, d); if (got.ack) acks++; if (got.record) rec = got.record; expect(got.error).toBeUndefined(); }
    expect(acks).toBe(msgs.length - 1); expect(c.active).toBe(false);
    expect(rec!.title).toMatch(/^pvp\d{14}$/); expect(rec!.when).toBe(1789000000); expect(rec!.mode).toBe(3);
    expect(rec!.players.map(p => [p.pid, p.level, recordName(p.name), p.main, p.extra])).toEqual([[1234, 7, 'Jaden Yuki', 40, 3], [55, 3, 'Yami Marik', 40, 0]]);
    expect(rec!.entries.map(e => [e.side, Buffer.from(e.data).toString('base64')])).toEqual(fx.entries);
    expect(recordMessages(rec!).map(m => m.id)).toEqual(fx.entries.map(() => 0x6202));
  });
  it('an incomplete record is an error, not a record', () => {
    const c = new DuelRecordCollector();
    c.receive(msgs[0]![0], msgs[0]![1]);
    expect(c.receive(RECORD_FINISH, new Uint8Array(0)).error).toMatch(/incomplete/);
    expect(() => decodeDuelRecord(new Uint8Array(8), [])).toThrow(/Not a duel record/);
    expect(Array.from(rleDecode(Uint8Array.of(7, 3, 0, 2)))).toEqual([7, 7, 7, 0, 0]);
  });
  it('its commands go through the duel model; the finish ends it', () => {
    const c = new DuelRecordCollector(); let rec = null as ReturnType<typeof decodeDuelRecord> | null;
    for (const [id, d] of msgs) rec = c.receive(id, d).record ?? rec;
    let s = createDuelState();
    for (const m of recordMessages(rec!)) s = reduceDuelMessage(s, m);
    expect(s.sequence).toBeGreaterThan(0);
  });
  it('kept newest first, capped; an archive row finds its record by opponent and time', async () => {
    const c = new DuelRecordCollector(); let rec = null as ReturnType<typeof decodeDuelRecord> | null;
    for (const [id, d] of msgs) rec = c.receive(id, d).record ?? rec;
    const store = memoryRecordStore();
    for (let i = 0; i < RECORDS_KEEP + 3; i++) await store.save({ ...rec!, when: rec!.when + i });
    const list = await store.list();
    expect(list).toHaveLength(RECORDS_KEEP); expect(list[0]!.when).toBe(rec!.when + RECORDS_KEEP + 2);
    expect(list[0]!.names).toEqual(['Jaden Yuki', 'Yami Marik']);
    expect(matchRecord({ at: rec!.when + RECORDS_KEEP + 2 + 60, opponent: 'Yami Marik' }, list)?.when).toBe(rec!.when + RECORDS_KEEP + 2);
    expect(matchRecord({ at: rec!.when + 99999, opponent: 'Yami Marik' }, list)).toBeNull();
    expect(matchRecord({ at: rec!.when + 10, opponent: 'Bob' }, list)).toBeNull();
  });
});
