import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DuelAudioDirector, DUEL_SOUND_EVIDENCE, fieldAudioSlot, resultAudioSlot } from '../src/duel/audio';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import type { DuelState, PresentationEvent } from '../src/duel/types';
import { engine } from '../../../server/src/duel/translator/lockstep';

const event = (type: string, params = [0, 0, 0], player: 0 | 1 = 0): PresentationEvent => ({ sequence: 0, type: `engine:${type}`, params, player });
function next(previous: DuelState, ...events: PresentationEvent[]): DuelState {
  return { ...previous, sequence: previous.sequence + 1, events: events.map(e => ({ ...e, sequence: previous.sequence + 1 })) };
}
const sample = (acknowledgedThrough: number, events: PresentationEvent[] = [], skippedEvents = 0) => ({ acknowledgedThrough, skippedEvents, effects: events.map(event => ({ event, progress: 0 })) });

describe('source-backed duel sound cues', () => {
  it('pins the restored source call sites and keeps background result/field semantics separate', () => {
    const battle = readFileSync(resolve(import.meta.dirname, '../../src/duel/SceneBattleManager.cpp'), 'utf8');
    expect(battle).toContain('SE_ATTACK_HIT = 0x10000009, SE_ATTACK_SWING = 0x10000006');
    expect(battle).toContain('if (k == 0x90) playSe(SE_ATTACK_SWING, 0)');
    const summon = readFileSync(resolve(import.meta.dirname, '../../src/duel/EngineCmd6.cpp'), 'utf8');
    expect(summon).toContain('0x2d summon by uid (views 0x19 + 0x35 RUN_SUMMON, reborn.wav)');
    expect([1, 2, 3, 0, 99].map(resultAudioSlot)).toEqual([28, 27, 26, null, null]);
    expect(Array.from({ length: 15 }, (_, i) => fieldAudioSlot(i, 17))).toEqual([17, 34, 35, 32, 33, 31, 30, 43, 37, 38, 42, 41, 39, 40, 36]);
    expect(fieldAudioSlot(0x16, 11)).toBe(44); expect(fieldAudioSlot(15, 11)).toBe(45);
    expect(() => fieldAudioSlot(0, 28)).toThrow();
  });
  it('routes actual decoded attacks exactly once at presentation start and never on raw packet receipt', () => {
    const audio = new DuelAudioDirector(), before = createDuelState();
    const after = reduceDuelMessage(before, { id: 0x6202, data: engine(0x19, 0, 1, 0x0201) });
    audio.enqueue(before, after); expect(audio.pendingCues).toBe(1);
    expect(audio.consumeSample(sample(0))).toEqual([]);
    const cues = audio.consumeSample(sample(0, after.events));
    expect(cues).toEqual([{ sequence: 1, ordinal: 0, player: 0, kind: 'attack', id: 0x10000006, path: 'se/attack.wav' }]);
    expect(audio.consumeSample(sample(0, after.events))).toEqual([]);
    expect(audio.consumeSample(sample(1))).toEqual([]); expect(audio.pendingCues).toBe(0);
  });
  it('handles equal-sequence multiple events by ordinal, including identical summon commands', () => {
    const audio = new DuelAudioDirector(), a = createDuelState(), b = next(a, event('2d'), event('30'), event('2d'));
    audio.enqueue(a, b); const cues = audio.consumeSample(sample(1));
    expect(cues.map(c => [c.ordinal, c.path])).toEqual([[0, 'se/reborn.wav'], [2, 'se/reborn.wav']]);
    expect(audio.consumeSample(sample(1))).toEqual([]);
  });
  it.each([0, 1] as const)('reproduces conditional no-LP-damage battle impact for attacking player %s', player => {
    const audio = new DuelAudioDirector(); let a = createDuelState();
    const b = next(a, event('19', [0, 2 << 8 | (player ^ 1), 0], player)); audio.enqueue(a, b); audio.consumeSample(sample(1)); a = b;
    for (const [damage0, damage1, flags, expected] of [[0, 0, 2 << (8 * (player ^ 1)), 1], [0, 0, 2 << (8 * player), 1], [0, 0, 0, 0], [500, 0, 2, 0], [0, 500, 2, 0]]) {
      const b = next(a, event('17', [damage0, damage1, flags], player)); audio.enqueue(a, b);
      const cues = audio.consumeSample(sample(b.sequence));
      expect(cues.filter(c => c.kind === 'impact')).toHaveLength(expected);
      if (expected) expect(cues[0].path).toBe('se/damage.wav');
      if (damage0 || damage1) expect(cues.map(c => c.kind)).toEqual(['damage']); a = b;
    }
  });
  it('does not guess an impact without a known target, after attack end, or for nonexistent direct-attack targets', () => {
    const audio = new DuelAudioDirector(); let a = createDuelState();
    for (const events of [[event('17', [0, 0, 0x202])], [event('1a'), event('17', [0, 0, 0x200])], [event('1c'), event('17', [0, 0, 2])]]) {
      const b = next(a, ...events); audio.enqueue(a, b); const cues = audio.consumeSample(sample(b.sequence));
      expect(cues.some(c => c.kind === 'impact')).toBe(false); a = b;
    }
  });
  it('consumes muted/unavailable sound opportunities without replaying a backlog when unmuted', () => {
    const audio = new DuelAudioDirector(0, { muted: true }), a = createDuelState(), b = next(a, event('1a'));
    audio.enqueue(a, b); expect(audio.consumeSample(sample(0, b.events))).toEqual([]);
    audio.setMuted(false); expect(audio.consumeSample(sample(1))).toEqual([]);
    expect(audio.counters.muted).toBe(1);
    const c = next(b, event('1a')); audio.enqueue(b, c); expect(audio.consumeSample(sample(2))).toHaveLength(1);
    // A false playEffect result belongs to the audio manager; consuming again cannot retry the cue.
    expect(audio.consumeSample(sample(2))).toEqual([]);
  });
  it('distinguishes deliberate skip from reduced-motion compressed audio, with bounded bursts', () => {
    const a = createDuelState(), b = next(a, event('1a'), event('2d'), event('2d'));
    const audio = new DuelAudioDirector(); audio.enqueue(a, b);
    expect(audio.consumeSample(sample(1, [], 3))).toEqual([]); expect(audio.counters.skipped).toBe(3);
    audio.reset(); audio.setReducedMotion(true); audio.enqueue(a, b);
    expect(audio.consumeSample(sample(1, [], 3))).toHaveLength(3);
    const bounded = new DuelAudioDirector(0, { reducedMotion: true, maxCuesPerSample: 2 }); bounded.enqueue(a, b);
    expect(bounded.consumeSample(sample(1, [], 3))).toHaveLength(2); expect(bounded.counters.dropped).toBe(1);
  });
  it('bounds outstanding cues and preserves accounting over a long unacknowledged stream', () => {
    const audio = new DuelAudioDirector(0, { maxQueuedCues: 4 }); let a = createDuelState();
    for (let i = 0; i < 10000; i++) { const b = next(a, event('1a')); audio.enqueue(a, b); a = b; expect(audio.pendingCues).toBeLessThanOrEqual(4); }
    expect(audio.counters).toMatchObject({ enqueued: 10000, dropped: 9996 });
    expect(audio.consumeSample(sample(a.sequence))).toHaveLength(4); expect(audio.pendingCues).toBe(0);
    const c = audio.counters; expect(c.enqueued).toBe(c.emitted + c.muted + c.dropped + c.skipped);
  });
  it('rejects duplicate/out-of-order state and samples, then clears the timeline on explicit reset', () => {
    const audio = new DuelAudioDirector(), a = createDuelState(), b = next(a, event('1a'));
    audio.enqueue(a, b); expect(() => audio.enqueue(a, b)).toThrow(/once/);
    expect(() => audio.consumeSample(sample(2))).toThrow(/out of order/);
    audio.consumeSample(sample(1)); expect(() => audio.consumeSample(sample(0))).toThrow(/out of order/);
    audio.reset(); expect(audio.pendingCues).toBe(0); expect(audio.counters.enqueued).toBe(0);
    audio.enqueue(a, b); audio.dispose(); audio.dispose(); expect(audio.pendingCues).toBe(0);
    expect(audio.consumeSample(sample(1))).toEqual([]); audio.enqueue(b, next(b, event('1a'))); expect(audio.pendingCues).toBe(0);
  });
  it('keeps unsupported sound associations silent instead of inferring paths from command names', () => {
    // Chain resolution (0x13) and draw (0x55) have no source-verified sound yet.
    const audio = new DuelAudioDirector(), a = createDuelState(), b = next(a, event('13'), event('55'));
    audio.enqueue(a, b); expect(audio.consumeSample(sample(1))).toEqual([]);
    expect(Object.keys(DUEL_SOUND_EVIDENCE)).toEqual(['attack', 'impact', 'summon', 'damage', 'recover', 'turn', 'battlePhase',
      'destroy', 'battleDestroy', 'tribute', 'activate', 'chain', 'coin', 'dice']);
    expect(() => new DuelAudioDirector(0, { maxQueuedCues: 0 })).toThrow();
  });
  it('plays a battle gauge sound once, suppresses its matching LP completion, and retains later cost/recovery cues', () => {
    const audio = new DuelAudioDirector(); let a = createDuelState();
    const cases: [PresentationEvent[], string[]][] = [
      [[event('19', [0, 0x201]), event('17', [0, 500, 0x200])], ['attack', 'damage']],
      [[event('25', [500, 0, 0], 1)], []],
      [[event('25', [500, 2, 0], 1)], ['damage']],
      [[event('24', [1000, 1, 0], 1)], ['recover']],
      [[event('4'), event('c'), event('d'), event('e'), event('f')], ['turn', 'battlePhase']],
    ];
    for (const [events, expected] of cases) {
      const b = next(a, ...events); audio.enqueue(a, b);
      expect(audio.consumeSample(sample(b.sequence)).map(c => c.kind)).toEqual(expected); a = b;
    }
  });
  it('retains both simultaneous battle gauge sounds and their per-player completion suppression', () => {
    const audio = new DuelAudioDirector(), a = createDuelState();
    const b = next(a, event('19', [0, 0x101]), event('17', [200, 300, 0])); audio.enqueue(a, b);
    expect(audio.consumeSample(sample(1)).filter(c => c.kind === 'damage').map(c => c.player)).toEqual([0, 1]);
    const c = next(b, event('25', [200, 0, 0]), event('25', [300, 0, 0], 1)); audio.enqueue(b, c);
    expect(audio.consumeSample(sample(2))).toEqual([]);
  });
});

const exePath = '/tmp/de-startup-yo2.exe';
describe.skipIf(!existsSync(exePath))('private original executable static sound evidence', () => {
  it('confirms view/gauge call chains and numerical SE operands without running the executable', () => {
    const bytes = readFileSync(exePath), word = (va: number) => bytes.readUInt32LE(va - 0x400000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('d25d4b135602eafe9db1a709ac5d2367295ba1dad084366d37a1a7577021e613');
    const target = (va: number) => va + 5 + bytes.readInt32LE(va - 0x400000 + 1);
    expect(target(0x411fcc)).toBe(0x686560);
    for (const [address, kind] of [[0x756a95, 'attack'], [0x754aee, 'impact'], [0x7a32e8, 'summon'], [0x7d475d, 'turn'], [0x7d3de5, 'battlePhase']] as const) {
      expect(word(address + 1)).toBe(DUEL_SOUND_EVIDENCE[kind].id);
    }
    expect(word(0x741b80 + 14 * 4)).toBe(0x73e432); // view0xf LIFE_DAMAGE
    expect(target(0x73e48b)).toBe(0x412bfc); expect(target(0x412bfc)).toBe(0x7cefc0);
    const nonnegative = word(0x7cefff), negativeAdjustment = bytes.readInt8(0x7ceffc - 0x400000);
    expect(nonnegative).toBe(DUEL_SOUND_EVIDENCE.recover.id);
    expect(nonnegative + negativeAdjustment).toBe(DUEL_SOUND_EVIDENCE.damage.id);
    expect(target(0x7cf004)).toBe(0x411fcc);
    expect(target(0x73e25e)).toBe(0x408364); expect(target(0x408364)).toBe(0x7d46c0);
    expect(target(0x7d46d0)).toBe(0x40c310); expect(target(0x40c310)).toBe(0x7d4720);
    expect(target(0x7d4789)).toBe(0x405c95); expect(target(0x405c95)).toBe(0x7d3d90);
  });
});

describe('destruction, activation, chain, coin and die sounds', () => {
  const run = (audio: DuelAudioDirector, ...batches: PresentationEvent[][]) => {
    let a = createDuelState(); const out: { kind: string; path: string; delay?: number }[] = [];
    for (const events of batches) { const b = next(a, ...events); audio.enqueue(a, b); out.push(...audio.consumeSample(sample(b.sequence)).map(({ kind, path, delay }) => ({ kind, path, ...(delay ? { delay } : {}) }))); a = b; }
    return out;
  };
  it('a field card broken by an effect is a normal break; one broken by battle is the attacked break', () => {
    expect(run(new DuelAudioDirector(), [event('31', [2, 0x10, 0])])).toEqual([{ kind: 'destroy', path: 'se/card_normal_brake.wav' }]);
    // A hand / pile card (zone 11+) moved with 0x31 breaks nothing on the field.
    expect(run(new DuelAudioDirector(), [event('31', [11, 0x10, 5])])).toEqual([]);
    const battle = run(new DuelAudioDirector(), [event('19', [0, 2 << 8 | 1, 0])], [event('17', [0, 0, 2 << 8])], [event('31', [2, 0x10, 0], 1)], [event('1c')], [event('31', [3, 0x10, 0])]);
    expect(battle.map(c => c.kind)).toEqual(['attack', 'impact', 'battleDestroy', 'destroy']);
    expect(battle[2].path).toBe('se/card_attacked_brake.wav');
    expect(run(new DuelAudioDirector(), [event('46', [1, 0x10, 0])])).toEqual([{ kind: 'tribute', path: 'se/ikenie.wav' }]);
  });
  it('an activation plays magic_active; from Chain Link 2 the chain plaque adds chain.wav', () => {
    expect(run(new DuelAudioDirector(), [event('12', [5, 0, 1])], [event('12', [6, 0, 2])]).map(c => c.path))
      .toEqual(['se/magic_active.wav', 'se/magic_active.wav', 'se/chain.wav']);
  });
  it('coins sound at the toss, the die at its last two landings of the fx roll (immediately with reduced motion)', () => {
    expect(run(new DuelAudioDirector(), [event('5c', [1 << 6, 0, 1])])).toEqual([{ kind: 'coin', path: 'se/coin.wav' }]);
    expect(run(new DuelAudioDirector(), [event('5d', [0, 4, 0])])).toEqual([
      { kind: 'dice', path: 'se/dice.wav', delay: 667 }, { kind: 'dice', path: 'se/dice.wav', delay: 1000 }]);
    expect(run(new DuelAudioDirector(0, { reducedMotion: true }), [event('5d', [0, 4, 0])])).toEqual([{ kind: 'dice', path: 'se/dice.wav' }]);
  });
  it('every sound file is a line of the original se.txt at its id', () => {
    const lines = ['cursor', 'decide', 'return', 'unable', 'start', 'turn_change', 'attack', 'card_attacked_brake', 'card_normal_brake', 'damage',
      'equip', 'gofuken', 'ikenie', 'magic_active', 'reborn', 'card_move', 'card_open', 'battle_turn', 'scene_change', 'exodia_a1', 'exodia_b',
      'exodia_c', 'exodia_d', 'exodia_e', 'dice', 'coin', 'chain', 'life_up'];
    for (const { id, path } of Object.values(DUEL_SOUND_EVIDENCE)) expect(`se/${lines[id - 0x10000000]}.wav`).toBe(path);
  });
});
