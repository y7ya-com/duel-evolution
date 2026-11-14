import { describe, expect, it } from 'vitest';
import { engine, set_card } from '../../../server/src/duel/translator/lockstep';
import { concat } from '../../../server/src/duel/translator/py';
import { createDuelState, reduceDuelMessage, acknowledgePresentation } from '../src/duel/model';
import { DuelTimeline, TIMING_EVIDENCE, lpCountFrames, lpLeft } from '../src/duel/timeline';
import { applyTimeline, projectDuel } from '../src/presentation';
import { CardCatalog } from '../src/catalog';
import type { DuelState } from '../src/duel/types';

const cmd = (s: DuelState, data: Uint8Array) => reduceDuelMessage(s, { id: 0x6202, data });
const initial = () => cmd(createDuelState(), engine(1));
function deck(): DuelState { return cmd(initial(), set_card(0, 13, 0, 123, 1)); }

describe('deterministic bounded duel presentation timeline', () => {
  it('uses verified eight-frame movement timing and distinguishes provisional timings', () => {
    expect(TIMING_EVIDENCE.cardFrames).toMatchObject({ frames: 8, evidence: 'source' });
    expect(TIMING_EVIDENCE.lpFrames).toMatchObject({ frames: 32, evidence: 'source' });
    expect(TIMING_EVIDENCE.attackFrames.evidence).toBe('policy');
  });
  it('acknowledges identity-only packets immediately without fabricating a glide', () => {
    const previous = initial(), next = cmd(previous, set_card(0, 13, 0, 123, 1));
    const t = new DuelTimeline(previous), sample = t.enqueue(previous, next);
    expect(sample.pending).toBe(false); expect(sample.acknowledgedThrough).toBe(next.sequence);
    expect(sample.cards[0].to?.passcode).toBe(123);
  });
  it('interpolates card motion with the original quarter-sine over eight frames', () => {
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1)), t = new DuelTimeline(before);
    t.enqueue(before, after);
    expect(t.sample().cards[0]).toMatchObject({ progress: 0, eased: 0, from: { zone: 'deck' }, to: { zone: 'hand' } });
    const halfway = t.advance(4);
    expect(halfway.cards[0].progress).toBe(0.5); expect(halfway.cards[0].eased).toBeCloseTo(Math.SQRT1_2);
    expect(halfway.acknowledgedThrough).toBe(before.sequence);
    const done = t.advance(4);
    expect(done.pending).toBe(false); expect(done.acknowledgedThrough).toBe(after.sequence);
    expect(done.cards[0].to?.zone).toBe('hand');
  });
  it("counts displayed LP as live's gauge (its number held 32 frames, then 100 a frame, 10 under 100, 1 under 10)", () => {
    const before = initial(), after = cmd(before, engine(0x25, 0, 2000)), t = new DuelTimeline(before);
    t.enqueue(before, after);
    expect(t.sample().lp).toEqual([8000, 8000]); expect(after.sides[0].lp).toBe(6000);
    expect(t.advance(32).lp).toEqual([8000, 8000]);
    expect(t.advance(1).lp).toEqual([7900, 8000]); expect(t.advance(9).lp).toEqual([7000, 8000]);
    expect(t.advance(9).pending).toBe(true); expect(t.advance(1)).toMatchObject({ lp: [6000, 8000], pending: false });
    // a fixed rate, not a fixed time: 1800 LP 18 frames, 1500 LP 15; what is under 100 by tens and then ones
    expect([1800, 1500, 50, 1855, 7].map(lpCountFrames)).toEqual([18, 15, 5, 28, 7]);
    expect([0, 18, 19, 23, 24, 28].map(f => lpLeft(1855, f))).toEqual([1855, 55, 45, 5, 4, 0]);
  });
  it('holds a battle\'s damage from the attack\'s hit when it comes in the next packet', () => {
    const before = initial(), attacked = cmd(before, engine(0x19, 1, 2)), hit = cmd(attacked, engine(0x25, 0, 1800));
    const t = new DuelTimeline(before); t.enqueue(before, attacked); t.enqueue(attacked, hit);
    // the attack plays its 16 frames; the hit was at 16, so the count starts 42 frames after it
    expect(t.advance(16 + 42).lp).toEqual([8000, 8000]);
    expect(t.advance(1).lp).toEqual([7900, 8000]); expect(t.advance(17)).toMatchObject({ lp: [6200, 8000], pending: false });
  });
  it('preserves order and acknowledges effects only after their complete packet batch', () => {
    const before = initial(), middle = cmd(before, engine(0x25, 0, 1000)), after = cmd(middle, engine(0x19, 1, 2, 0));
    const t = new DuelTimeline(before); t.enqueue(before, middle); t.enqueue(middle, after);
    expect(t.sample().effects[0].event.type).toBe('engine:25');
    expect(t.advance(32 + 10).effects[0].event.type).toBe('engine:19');
    expect(t.acknowledgedThrough).toBe(middle.sequence);
    const done = t.advance(16);
    expect(done.acknowledgedThrough).toBe(after.sequence); expect(done.consumedEvents).toBe(2);
  });
  it('flushes a backlog explicitly without losing final state or event accounting', () => {
    const before = initial(), t = new DuelTimeline(before, { maxBatches: 2 }); let state = before;
    for (let i = 0; i < 3; i++) { const next = cmd(state, engine(0x25, 0, 100)); t.enqueue(state, next); state = next; }
    const sample = t.sample();
    expect(sample.pending).toBe(false); expect(sample.lp).toEqual([7700, 8000]);
    expect(sample.acknowledgedThrough).toBe(state.sequence); expect(sample.consumedEvents).toBe(3); expect(sample.skippedEvents).toBe(3);
    expect(sample.retainedCards).toBe(0);
  });
  it('bounds retained card snapshots independently of the batch count', () => {
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1));
    const t = new DuelTimeline(before, { maxRetainedCards: 1 });
    const sample = t.enqueue(before, after);
    expect(sample.pending).toBe(false); expect(sample.retainedCards).toBe(0); expect(sample.cards[0].to?.zone).toBe('hand');
    expect(sample.skippedEvents).toBe(1);
  });
  it('skips safely for reduced motion and can resume ordinary future animation', () => {
    const before = initial(), middle = cmd(before, engine(0x25, 0, 100)), after = cmd(middle, engine(0x25, 0, 100));
    const t = new DuelTimeline(before, { reducedMotion: true });
    expect(t.enqueue(before, middle).pending).toBe(false);
    expect(t.sample().lp[0]).toBe(7900); t.setReducedMotion(false);
    expect(t.enqueue(middle, after).pending).toBe(true); expect(t.setReducedMotion(true).lp[0]).toBe(7800);
  });
  it('acknowledges same-packet multiple records only after every effect has played', () => {
    const before = initial(), after = cmd(before, concat(engine(0x25, 0, 100), engine(0x19, 0, 0)));
    const t = new DuelTimeline(before); t.enqueue(before, after);
    // a battle's damage: the number from the hit (8 frames in), counted 42 frames after it
    expect(t.advance(50).acknowledgedThrough).toBe(before.sequence);
    expect(t.advance(1).consumedEvents).toBe(2); expect(t.acknowledgedThrough).toBe(after.sequence);
  });
  it('does not double-count old reducer history rolling out in long duels', () => {
    let state = initial(); const t = new DuelTimeline(state);
    for (let i = 0; i < 700; i++) {
      const next = cmd(state, engine(0x30, 0, 123)); t.enqueue(state, next); t.advance(32); state = next;
    }
    expect(t.sample().consumedEvents).toBe(700); expect(t.sample().skippedEvents).toBe(0);
    expect(t.sample().queuedBatches).toBe(0); expect(state.events.length).toBeLessThanOrEqual(256);
  });
  it('accounts explicitly for fresh events lost in a single oversized reducer batch', () => {
    const before = initial(), after = cmd(before, concat(...Array.from({ length: 300 }, () => engine(0x30, 0, 123))));
    const t = new DuelTimeline(before); t.enqueue(before, after); const done = t.advance(32);
    expect(done.consumedEvents).toBe(300); expect(done.skippedEvents).toBe(44);
    expect(done.acknowledgedThrough).toBe(after.sequence);
  });
  it('allows explicit acknowledgement trimming without losing queued presentation', () => {
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1)), t = new DuelTimeline(before);
    t.enqueue(before, after); const trimmed = acknowledgePresentation(after, t.acknowledgedThrough);
    expect(trimmed.events.some(e => e.sequence === after.sequence)).toBe(true);
    t.advance(8); expect(acknowledgePresentation(trimmed, t.acknowledgedThrough).events).toEqual([]);
  });
  it('rejects duplicate/out-of-order states and invalid frame deltas', () => {
    const before = initial(), after = cmd(before, engine(0x25, 0, 1)), t = new DuelTimeline(before);
    t.enqueue(before, after);
    expect(() => t.enqueue(before, after)).toThrow(/packet order/);
    for (const frames of [-1, Infinity, NaN]) expect(() => t.advance(frames)).toThrow();
  });
  it('does not expose mutable internal snapshots through samples', () => {
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1)), t = new DuelTimeline(before);
    const sample = t.enqueue(before, after); sample.cards[0].from!.zone = 'grave'; sample.effects[0].event.params[0] = 123;
    expect(t.sample().cards[0].from?.zone).toBe('deck'); expect(t.sample().effects[0].event.params[0]).toBe(0xffff);
  });
  it('produces the same samples for the same packet/frame sequence', () => {
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1));
    const a = new DuelTimeline(before), b = new DuelTimeline(before);
    expect(a.enqueue(before, after)).toEqual(b.enqueue(before, after));
    for (const frames of [1, 2.5, 0, 4.5]) expect(a.advance(frames)).toEqual(b.advance(frames));
  });
  it('projects glide/flip poses while keeping server prompts withheld until caught up', () => {
    const catalog = new CardCatalog(); catalog.install([{ passcode: 123, name: 'Reference card' }]);
    const before = deck(), after = cmd(before, engine(0x55, 0, 0xffff, 1)), t = new DuelTimeline(before);
    t.enqueue(before, after);
    const authority = projectDuel(after, catalog, ['You', 'Rival']);
    const halfway = applyTimeline(authority, t.advance(4), catalog);
    expect(halfway.cards[0].motion?.x).toBeLessThan(902); expect(halfway.cards[0].motion?.x).toBeGreaterThan(525);
    expect(halfway.cards[0].motion?.scaleX).toBeCloseTo(0.001); expect(halfway.prompt).toBe(null);
    expect(after.cards[2].zone).toBe('hand');
    expect(applyTimeline(authority, t.advance(4), catalog).cards[0].motion?.x).toBe(525); // live's hand is centred on x 525
  });
  it('projects source events into explicit attack, chain and LP visual cues', () => {
    const catalog = new CardCatalog(), before = initial();
    const after = cmd(before, concat(engine(0x19, 1, 2), engine(0x25, 0, 1500), engine(0x12, 1, 2, 3, 1)));
    const t = new DuelTimeline(before); t.enqueue(before, after);
    // the opponent's attack hits 16 frames in; its damage is counted 42 frames later, 100 a frame
    const displayed = applyTimeline(projectDuel(after, catalog, ['You', 'Rival']), t.advance(16 + 42 + 5), catalog);
    expect(displayed.effects?.map(e => e.type)).toEqual(['attack', 'damage', 'chain']);
    expect(displayed.effects?.find(e => e.type === 'damage')).toMatchObject({ player: 0, value: 1500 });
    expect(displayed.players[0].lp).toBe(7500); expect(after.sides[0].lp).toBe(6500);
  });
});
