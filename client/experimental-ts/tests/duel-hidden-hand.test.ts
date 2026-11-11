import { describe, expect, it } from 'vitest';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { YO2Duel, type Msg } from '../../../server/src/duel/translator/translator';
import { PyRandom } from '../../../server/src/util/pyrandom';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import type { DuelState } from '../src/duel/types';
import { projectDuel } from '../src/presentation';
import { CardCatalog } from '../src/catalog';

/** The real server translator, configured as the spectators' public view (npcWatch/pvpMatch: public_view) or as a
 *  player's view of an NPC (hide_npc). A card the engine confirms from a hand (CONFIRM_CARDS → 0x51) is shown in the
 *  moment, never left face up in that hand: the server sends no "hide again" command. */
const CARDS = [24094653, 46986414, 89631139, 70781052, 38033121];
function view(cfg: Record<string, unknown>) {
  const d = new YO2Duel([{ main: CARDS }, { main: CARDS }], { rng: new PyRandom(1),
    cardmap: new CardMap({ wire: CARDS, wireHash: 0, cdb: Object.fromEntries(CARDS.map(c => [c, [1, 0, 100, 100, 1, 1, 0, 1]])), scripts: {} }),
    cfg: { turn_timer: 0, ...cfg } });
  // app.ts marks a live spectator's model as the observer's (no own side), as it does for the npcWatch/pvpMatch stream.
  let state: DuelState = { ...createDuelState(), ...(cfg.public_view ? { observer: true } : {}) };
  const apply = (messages: Msg[]) => { for (const [id, data] of messages) state = reduceDuelMessage(state, { id, data }); };
  apply(d.start());
  return { get state() { return state; }, feed(events: Record<string, unknown>[]) { apply(d.feed_many(events as never)); } };
}
const handFaces = (s: DuelState, who: 0 | 1) => s.sides[who].hand.filter((u): u is number => u != null).map(u => s.cards[u].faceUp);
const draws = [{ ev: 'msg', type: 'DRAW', player: 0, drawn: CARDS.slice(0, 3).map(code => ({ code })) },
  { ev: 'msg', type: 'DRAW', player: 1, drawn: CARDS.slice(0, 3).map(code => ({ code })) }];
const confirm = (player: number, sequence: number) => ({ ev: 'msg', type: 'CONFIRM_CARDS', player: 1 - player,
  cards: [{ controller: player, location: 2, sequence, code: CARDS[sequence] }] });

describe('hidden hands through the real server stream', () => {
  it('a spectator sees no hand card face up, before or after a confirmed hand card', () => {
    const spectator = view({ public_view: true });
    spectator.feed(draws);
    expect(handFaces(spectator.state, 0)).toEqual([false, false, false]);
    expect(handFaces(spectator.state, 1)).toEqual([false, false, false]);
    spectator.feed([confirm(1, 0), confirm(0, 1)]);
    expect(spectator.state.events.some(e => e.type === 'engine:51')).toBe(true);
    expect(handFaces(spectator.state, 0)).toEqual([false, false, false]);
    expect(handFaces(spectator.state, 1)).toEqual([false, false, false]);
    // What the duel screen draws: every hand card a back, no hand card named.
    const catalog = new CardCatalog(); catalog.install(CARDS.map(passcode => ({ passcode, name: `Card ${passcode}` })));
    const hand = projectDuel(spectator.state, catalog, ['A', 'NPC']).cards.filter(c => c.zone === 'hand');
    expect(hand).toHaveLength(6);
    expect(hand.filter(c => c.faceUp || c.name !== 'Hidden card')).toEqual([]);
  });
  it('a player sees their own hand and never the opponent’s, even after the opponent confirms a hand card', () => {
    const player = view({ hide_npc: true });
    player.feed(draws);
    expect(handFaces(player.state, 0)).toEqual([true, true, true]);
    expect(handFaces(player.state, 1)).toEqual([false, false, false]);
    player.feed([confirm(1, 2)]);
    expect(handFaces(player.state, 1)).toEqual([false, false, false]);
    expect(handFaces(player.state, 0)).toEqual([true, true, true]);
    const catalog = new CardCatalog(); catalog.install(CARDS.map(passcode => ({ passcode, name: `Card ${passcode}` })));
    const hand = projectDuel(player.state, catalog, ['A', 'NPC']).cards.filter(c => c.zone === 'hand');
    expect(hand.filter(c => c.controller === 1 && (c.faceUp || c.name !== 'Hidden card'))).toEqual([]);
    expect(hand.filter(c => c.controller === 0).map(c => c.name)).toEqual(CARDS.slice(0, 3).map(c => `Card ${c}`));
  });
});
