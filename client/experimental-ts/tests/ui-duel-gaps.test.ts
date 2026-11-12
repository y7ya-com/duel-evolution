import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountClient } from '../src/ui';
import type { ClientCommand, ClientController, ClientView, DuelView } from '../src/ui/contracts';
import { matchDeclarable, ANNOUNCE_SHOWN } from '../src/ui/duel-announce';
import { badgePlace, badgeRows, COUNTER_ROWS } from '../src/ui/duel-counters';
import { BLINK, blinkSchedule, eyeFrameLayers } from '../src/ui/duel-portrait';
import { DuelPresentation } from '../src/ui/duel-scene';
import { ATTACK } from '../src/ui/duel-fx';
import { TestDocument, type TestNode } from './ui-dom-fixture';

/** The duel-screen gaps closed against the original (STATUS.md "Known gaps"): the card-name candidate list, board
 * selection instructions, counters drawn as the original's badges, blinking portraits and the attack's timing. */
function fixture(archive = false) {
  const document = new TestDocument();
  vi.stubGlobal('document', document); vi.stubGlobal('window', { confirm: () => true });
  const root = document.createElement('div');
  let state = { scene: 'title', connection: 'offline', status: 'Offline', auth: { signedIn: false }, player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null,
    settings: { showCardNames: true, reducedMotion: false, highContrast: false, uiScale: 1 } } as unknown as ClientView;
  const commands: ClientCommand[] = [], listeners = new Set<(s: ClientView) => void>();
  const controller: ClientController = { getState: () => state, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, dispatch: command => { commands.push(command); },
    ...(archive ? { loadArchiveImage: () => new Promise<never>(() => {}) } : {}) };
  const mounted = mountClient(root as unknown as HTMLElement, controller);
  const update = (patch: Partial<ClientView>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(state); };
  return { root, commands, mounted, update };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const players = [{ name: 'A', lp: 8000 }, { name: 'B', lp: 8000 }] as const;
const duel = (patch: Partial<DuelView>): DuelView => ({ players, turn: 2, turnPlayer: 0, phase: 'main1', log: [], prompt: null, cards: [], ...patch });
const byKey = (root: TestNode, prefix: string) => root.querySelectorAll('*').filter(n => n.dataset.key?.startsWith(prefix));
const byClass = (root: TestNode, cls: string) => root.querySelectorAll('*').filter(n => n.className.split(' ').includes(cls));

describe('card-name declarations', () => {
  const list = [{ id: '4031928', label: 'Change of Heart' }, { id: '45986603', label: 'Snatch Steal' }, { id: '55144522', label: 'Pot of Greed' }];
  it('narrows the candidates to the names holding the typed text, as the original search box does', () => {
    expect(matchDeclarable(list, '').map(c => c.label)).toEqual(['Change of Heart', 'Snatch Steal', 'Pot of Greed']);
    expect(matchDeclarable(list, '  sTeAl ').map(c => c.label)).toEqual(['Snatch Steal']);
    expect(matchDeclarable(list, 'o').map(c => c.label)).toEqual(['Change of Heart', 'Pot of Greed']);
    expect(matchDeclarable(list, '55144522').map(c => c.label)).toEqual(['Pot of Greed']);
    expect(matchDeclarable(list, 'nothing')).toEqual([]);
  });
  it('shows the candidate list, filters it while typing and declares the card picked', async () => {
    const f = fixture();
    const many = Array.from({ length: ANNOUNCE_SHOWN + 5 }, (_, i) => ({ id: String(1000 + i), label: `Card ${i}` }));
    f.update({ scene: 'duel', duel: duel({ prompt: { id: '5', kind: 'announce', text: 'Declare 1 card name.', options: [], declarable: [...list, ...many] } }) }); await Promise.resolve();
    expect(byKey(f.root, 'prompt-declare:5:')).toHaveLength(ANNOUNCE_SHOWN);
    expect(f.root.textContent).toContain(`${list.length + many.length} cards: showing the first ${ANNOUNCE_SHOWN}.`);
    const input = byKey(f.root, 'prompt-announcement:5')[0]!;
    input.value = 'snatch'; input.oninput?.({});
    expect(byKey(f.root, 'prompt-declare:5:').map(b => b.textContent)).toEqual(['Snatch Steal']);
    expect(f.root.textContent).toContain('1 card.');
    byKey(f.root, 'prompt-declare:5:45986603')[0]!.onclick?.({});
    expect(f.commands.at(-1)).toEqual({ type: 'duelRespond', promptId: '5', response: { text: '45986603' } });
    // Typing a whole name and Announce still declares it by name.
    byKey(f.root, 'prompt-announcement:5')[0]!.parentNode!.parentNode!.onsubmit?.({ preventDefault() {} });
    expect(f.commands.at(-1)).toEqual({ type: 'duelRespond', promptId: '5', response: { text: 'snatch' } });
    f.mounted.dispose();
  });
});

describe('board selection instructions', () => {
  it('shows the instruction over the board without blocking it', async () => {
    const f = fixture();
    f.update({ scene: 'duel', duel: duel({ instruction: 'Select a target card from the Field.', actionsFor: '3',
      actions: [{ id: 'action:1:5:0:11', label: 'Select: opponent’s spell/trap zone 1', place: { controller: 1, zone: 'spell', index: 0 } }] }) }); await Promise.resolve();
    const line = byClass(f.root, 'de-duel-instruction');
    expect(line.map(n => n.textContent)).toEqual(['Select a target card from the Field.']);
    expect(line[0]!.getAttribute('role')).toBe('status');
    f.update({ duel: duel({}) }); await Promise.resolve();
    expect(byClass(f.root, 'de-duel-instruction')).toEqual([]);
    f.mounted.dispose();
  });
});

describe('counters as the original draws them', () => {
  it('places each badge row from the card edge toward its controller, 16 px apart, 5 px in', () => {
    expect(badgePlace(false, 0, 16)).toEqual({ left: 0, top: 84 - 5 - 8 });
    expect(badgePlace(false, 1, 16)).toEqual({ left: 0, top: 84 - 5 - 16 - 8 });
    expect(badgePlace(true, 0, 16)).toEqual({ left: 0, top: 5 - 8 });
    expect(badgePlace(true, 0, 13)).toEqual({ left: 0, top: 5 - 7 });
    expect(badgeRows({ faceUp: true, turnCounter: 2, counters: [{ kind: 0, count: 1 }, { kind: 3, count: 0 }] })).toEqual([{ kind: 'turns', count: 2 }, { kind: 0, count: 1 }]);
    expect(badgeRows({ faceUp: false, counters: [{ kind: 0, count: 1 }] })).toEqual([]);
    expect(COUNTER_ROWS[0]).toBe(1); expect(COUNTER_ROWS).toHaveLength(23);
  });
  const breaker = { id: '7', passcode: 71413901, name: 'Breaker the Magical Warrior', controller: 0 as const, zone: 'monster' as const, index: 2, faceUp: true, position: 'attack' as const, counters: [{ kind: 0, count: 1 }] };
  it('draws the coin and digits from the original art instead of a text badge', async () => {
    const f = fixture(true);
    f.update({ scene: 'duel', duel: duel({ cards: [breaker] }) }); await Promise.resolve();
    const card = byKey(f.root, 'field-card:7')[0]!;
    expect(byClass(card, 'de-card-counter')).toEqual([]);
    const badge = byClass(card, 'de-badge')[0]!;
    expect(badge.dataset).toMatchObject({ kind: '0', count: '1' });
    const images = card.querySelectorAll('img');
    expect(images.find(i => i.style.top === '-100%')?.style.width).toBe('600%');   // magic_counter.png row 1: the spell counter
    expect(byClass(badge, 'de-badge-digit').map(d => d.querySelectorAll('img')[0]!.style.left)).toEqual(['-100%']);   // duel_fontm_y "1"
    expect(card.getAttribute('aria-label')).toContain('Spell counters: 1');
    // A count that changes turns the coin and bursts over the number once.
    f.update({ duel: duel({ cards: [{ ...breaker, counters: [{ kind: 0, count: 2 }] }] }) }); await Promise.resolve();
    const again = byKey(f.root, 'field-card:7')[0]!;
    expect(byClass(again, 'de-badge-spin')).toHaveLength(1); expect(byClass(again, 'de-badge-pop')).toHaveLength(1);
    f.mounted.dispose();
  });
  it('keeps the text badges without the original art', async () => {
    const f = fixture(false);
    f.update({ scene: 'duel', duel: duel({ cards: [breaker] }) }); await Promise.resolve();
    expect(byClass(byKey(f.root, 'field-card:7')[0]!, 'de-card-counter').map(n => n.textContent)).toEqual(['1']);
    f.mounted.dispose();
  });
});

describe('blinking portraits', () => {
  it('swaps the eye parts for their half-shut and shut frames', () => {
    const layers = [{ path: 'data/avatar/wu/wm_bo_01_c01_r.png', rect: [0, 0, 1, 1] as [number, number, number, number] },
      { path: 'data/avatar/wu/wm_ey_02_01_c03.png', rect: [0, 0, 1, 1] as [number, number, number, number] },
      { path: 'data/avatar/wu/ww_eb_01_01_c01.png', rect: [0, 0, 1, 1] as [number, number, number, number] },
      { path: 'data/avatar/wu/wm_mo_01_01_c01.png', rect: [0, 0, 1, 1] as [number, number, number, number] }];
    expect(eyeFrameLayers(layers, 3).map(l => l.path.slice(15))).toEqual(['wm_bo_01_c01_r.png', 'wm_ey_02_03_c03.png', 'ww_eb_01_03_c01.png', 'wm_mo_01_01_c01.png']);
    expect(eyeFrameLayers(layers, 1)).toBe(layers);
    // the loser's face: the sweating eye set (04 open .. 06 shut) and the gritted-teeth mouth, each falling back to the
    // part as it is when the archive lacks it
    const lose = eyeFrameLayers(layers, 1, 'lose');
    expect(lose.map(l => l.path.slice(15))).toEqual(['wm_bo_01_c01_r.png', 'wm_ey_02_04_c03.png', 'ww_eb_01_04_c01.png', 'wm_mo_01_02_c01.png']);
    expect(lose[3]!.fallback).toBe(layers[3]!.path); expect(lose[0]).toBe(layers[0]);
    expect(eyeFrameLayers(layers, 3, 'lose').map(l => l.path.slice(15))[1]).toBe('wm_ey_02_06_c03.png');
  });
  it('blinks with the original timing: a random open while, then half, shut, half for 8 frames each', () => {
    expect(blinkSchedule(() => 0)).toEqual([[1, BLINK.minOpen], [2, 133], [3, 133], [2, 133]]);
    expect(blinkSchedule(() => 0.999999)[0]![1]).toBeCloseTo(BLINK.maxOpen, 0);
  });
  it('runs each portrait on its own timer and keeps the eyes open with reduced motion', async () => {
    const document = new TestDocument(); vi.stubGlobal('document', document);
    const timers: { cb: () => void; ms: number }[] = [];
    const scene = new DuelPresentation(null, { random: () => 0.5, setTimer: (cb, ms) => { timers.push({ cb, ms }); return timers.length; }, clearTimer: () => {} });
    const drawn: string[] = [];
    const internals = scene as unknown as { portraits: TestNode[]; faces: { frames: Record<number, TestNode> }[]; blink(side: 0 | 1): void; reduced: boolean; showEyes(side: 0 | 1, frame: number): void };
    // one picture per eye frame; the one shown is the visible one
    const names: Record<string, string> = { 1: 'open', 2: 'half', 3: 'shut' }, frames = { 1: document.createElement('img'), 2: document.createElement('img'), 3: document.createElement('img') };
    internals.faces[1]!.frames = frames;
    const show = internals.showEyes.bind(scene);
    internals.showEyes = (side, frame) => { show(side, frame); const visible = Object.entries(frames).filter(([, img]) => img.style.visibility !== 'hidden'); expect(visible).toHaveLength(1); drawn.push(names[visible[0]![0]]!); };
    internals.blink(1);
    expect(drawn).toEqual(['open', 'open']);
    expect(timers.at(-1)!.ms).toBe(BLINK.minOpen + 0.5 * (BLINK.maxOpen - BLINK.minOpen));
    for (let i = 0; i < 4; i++) timers.at(-1)!.cb();
    expect(drawn.slice(2)).toEqual(['half', 'shut', 'half', 'open', 'open']);
    expect(internals.portraits[1]!.dataset.blinks).toBe('1');
    internals.reduced = true; drawn.length = 0; const before = timers.length;
    internals.blink(1);
    expect(drawn).toEqual(['open']); expect(timers.length).toBe(before);
    scene.dispose();
  });
});

describe('attack timing', () => {
  it('follows CBattleManager state 4: aim 8 frames, fly to frame 16, then the hit', () => {
    expect(ATTACK.aim).toBeCloseTo(133.33, 1); expect(ATTACK.hit).toBeCloseTo(266.67, 1);
  });
});
