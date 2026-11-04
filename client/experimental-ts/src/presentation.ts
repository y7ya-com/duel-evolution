import { visibleCards, ZONE_IDS } from './duel/model';
import type { DuelState, DuelResponse as EngineResponse, LegalAction, Zone } from './duel/types';
import type { DuelView, DuelPromptView, DuelOption, DuelResponse, FieldZone } from './ui/contracts';
import { CardCatalog } from './catalog';
import type { CardPlacement, TimelineSample } from './duel/timeline';
import { fieldCardPosition } from './ui/helpers';
import { describePrompt, describeNotice, type DuelTextCatalog } from './duel/text';
const zones: Record<Zone, FieldZone> = { monster: 'monster', spell: 'spell', hand: 'hand', deck: 'deck', extra: 'extra', grave: 'graveyard', banish: 'banished' };
const actionId = (a: LegalAction) => `action:${a.player}:${a.zone}:${a.index}:${a.command}`;
const phases: Record<number, string> = { 3: 'Battle Phase', 4: 'Main Phase 2', 5: 'End Turn' };
const EMPTY_ACTIONS: DuelOption[] = [];
function uidFor(state: DuelState, a: LegalAction): number | null {
  if (a.zone <= 4) return state.sides[a.player].monster[a.zone] ?? null;
  if (a.zone <= 10) return state.sides[a.player].spell[a.zone - 5] ?? null;
  const z = Object.entries(ZONE_IDS).find(([, id]) => id === a.zone)?.[0] as Zone | undefined;
  return z ? state.sides[a.player][z][a.index] ?? null : null;
}
function identityVisible(card: ReturnType<typeof visibleCards>[number]): boolean {
  return card.passcode !== null && (card.faceUp || card.player === 0 &&
    ['hand', 'extra', 'monster', 'spell'].includes(card.zone));
}
const PHASES: Record<number, string> = { 0x0c: 'Draw Phase', 0x0d: 'Standby Phase', 0x0e: 'Main Phase 1', 0x0f: 'Battle Phase', 0x10: 'Main Phase 2' };
/** A readable duel-log line for a server presentation event, or null for bookkeeping the player never sees. */
export function describeEvent(state: DuelState, catalog: CardCatalog, names: [string, string], e: DuelState['events'][number], texts?: DuelTextCatalog): string | null {
  if (e.type === 'notice') return describeNotice(e.params[0] ?? 0, texts);
  const m = /^engine:([0-9a-f]+)$/.exec(e.type); if (!m) return null;
  const cmd = parseInt(m[1]!, 16), who = names[e.player] ?? 'A duelist', p = e.params;
  const shown = e.card === undefined ? null : state.cards[e.card];
  const card = (fallback: string) => shown && shown.passcode !== null && (shown.faceUp || shown.owner === 0) ? catalog.card(shown.passcode).name : fallback;
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (PHASES[cmd]) return `${who}: ${PHASES[cmd]}`;
  switch (cmd) {
    case 0x01: return 'The duel begins!';
    case 0x04: return `${who} ends the turn.`;
    case 0x05: return 'The duel is over.';
    case 0x55: return p[1] ? `${who} draws ${count(p[1], 'card')}.` : null;
    case 0x2d: return p[0]! & 0x4000 ? `${who} summons ${card('a monster')}.` : `${who} summons a monster face-down.`;
    case 0x48: return `${who} summons a token.`;
    // Hand to monster / spell zone: P1 bit 14 is face-up (a summon or a face-up play), otherwise a set.
    case 0x4f: return p[1]! & 0x4000 ? `${who} summons ${card('a monster')}.` : `${who} sets a monster.`;
    case 0x50: return p[1]! & 0x4000 ? `${who} plays ${card('a card')}.` : `${who} sets a card.`;
    case 0x12: return `${who} activates ${card('a card')}.`;
    case 0x19: return `${who}'s ${card('monster')} attacks!`;
    case 0x1a: return `${who}'s ${card('monster')} attacks directly!`;
    case 0x25: return p[0] ? `${who} takes ${p[0].toLocaleString()} damage.` : null;
    case 0x24: return p[0] ? `${who} gains ${p[0].toLocaleString()} LP.` : null;
    case 0x23: return `${who}'s LP drop to 0.`;
    case 0x31: return `${card('A card')} is sent to the Graveyard.`;
    case 0x46: return `${card('A monster')} is tributed.`;
    case 0x34: return `${who} changes a monster's battle position.`;
    case 0x35: return shown?.faceUp ? `${card('A card')} is flipped face-up.` : null;
    case 0x4e: return `${who} shuffles their hand.`;
    case 0x54: return `${who} shuffles their deck.`;
    case 0x5c: return `${who} tosses a coin.`;
    case 0x5d: return p[1] ? `${who} rolls a ${p[1]}.` : `${who} rolls a die.`;
    default: return null;
  }
}
function actionLabel(state: DuelState, catalog: CardCatalog, a: LegalAction): string {
  const uid = uidFor(state, a), card = uid === null ? null : state.cards[uid];
  const identity = card && identityVisible(card) ? catalog.card(card.passcode!).name : null;
  const side = a.player === 0 ? 'your' : 'opponent’s';
  const zone = a.zone <= 4 ? `monster zone ${a.zone + 1}` : a.zone <= 10 ? `spell/trap zone ${a.zone - 4}`
    : a.zone === 11 ? `hand card ${a.index + 1}` : a.zone === 12 ? 'extra deck' : a.zone === 13 ? 'deck'
    : a.zone === 14 ? 'graveyard' : 'banished cards';
  return `${a.label}: ${identity ?? `${side} ${zone}`}`;
}
export function projectDuel(state: DuelState, catalog: CardCatalog, names: [string, string], submittedPrompt: number | null = null, texts?: DuelTextCatalog): DuelView {
  const p = state.prompt, blocked = submittedPrompt === p?.id;
  const boardPrompt = p && ['actions', 'field-selection', 'discard', 'ritual'].includes(p.kind);
  const actions: DuelOption[] = p && boardPrompt && state.acceptingInput && !blocked ? p.actions.map(a => {
    const uid = uidFor(state, a), card = uid === null ? null : state.cards[uid];
    const place = uid === null && a.zone <= 10 ? { controller: (a.player === 0 ? 0 : 1) as 0 | 1, zone: (a.zone <= 4 ? 'monster' : 'spell') as 'monster' | 'spell', index: a.zone <= 4 ? a.zone : a.zone - 5 } : null;
    return { id: actionId(a), label: actionLabel(state, catalog, a), ...(uid === null ? {} : { cardId: String(uid) }), ...(place ? { place } : {}) };
  }) : [];
  if (p?.kind === 'actions' && state.acceptingInput && !blocked) for (const b of p.buttons) actions.push({ id: `phase:${b}`, label: phases[b] ?? `Phase ${b}` });
  let prompt: DuelPromptView | null = null;
  if (p && p.kind !== 'actions' && !blocked) {
    const kind: DuelPromptView['kind'] = p.kind === 'yesno' ? 'yes-no' : p.kind === 'position' ? 'position'
      : p.kind === 'number' ? 'number' : p.kind === 'announce-card' ? 'announce'
      : p.kind === 'attribute' ? 'attributes' : p.kind === 'cards' ? 'cards'
      : ['field-selection', 'discard', 'ritual'].includes(p.kind) ? 'place' : 'choice';
    prompt = { id: String(p.id), text: p.title, kind, cancelable: p.cancelable,
      min: p.min, max: p.max, options: p.options.map(o => ({ id: `answer:${o.value}`, label: o.label })),
      ...(p.kind === 'number' ? { numberMin: p.min, numberMax: p.max } : {}) };
    if (texts) {
      // CHAIN_END has no wire command to clear the cached chain. Only this dialog's
      // explicit picture list is safe context for text alternatives.
      const context = p.listMode === 0xff ? p.items.find(item => item.owner < 2 && item.passcode)?.passcode ?? undefined : undefined;
      const described = describePrompt(p, texts, context);
      prompt.text = described.title;
      prompt.options = prompt.options.map((option, i) => ({ ...option, label: described.optionLabels.get(i) ?? option.label }));
    }
    if (p.items.length) prompt.candidates = p.items.map((c, i) => ({ id: String(i), label: c.passcode ? catalog.card(c.passcode).name : 'Hidden card', ...(c.passcode ? { card: catalog.card(c.passcode) } : {}) }));
    if (p.kind === 'cards' && !(p.listMode >= 6 && p.listMode <= 0x26 || p.listMode >= 0x28 && p.listMode <= 0x48)) {
      prompt.min = prompt.max = 0;
      prompt.readOnly = true;
      prompt.candidates = prompt.candidates?.map(candidate => ({ ...candidate, disabled: true }));
    }
    if (['field-selection', 'discard', 'ritual'].includes(p.kind)) {
      prompt.options = p.actions.filter(a => a.command === 11 || a.command === 0).map(a => {
        const uid = uidFor(state, a);
        return { id: actionId(a), label: actionLabel(state, catalog, a), ...(uid === null ? {} : { cardId: String(uid) }) };
      });
      // These are one-at-a-time authoritative board choices, not a client-owned list selection.
      delete prompt.candidates;
    }
  }
  const latestIssue = state.errors.at(-1) ?? state.unsupported.at(-1)?.reason;
  return {
    players: [
      { name: names[0], lp: state.sides[0].lp, deckCount: state.sides[0].deck.length, handCount: state.sides[0].hand.length,
        turnCounters: Object.entries(state.sides[0].turnCounters).filter(([, turns]) => turns > 0).map(([code, turns]) => ({ passcode: Number(code), name: catalog.card(Number(code)).name, turns })) },
      { name: names[1], lp: state.sides[1].lp, deckCount: state.sides[1].deck.length, handCount: state.sides[1].hand.length,
        turnCounters: Object.entries(state.sides[1].turnCounters).filter(([, turns]) => turns > 0).map(([code, turns]) => ({ passcode: Number(code), name: catalog.card(Number(code)).name, turns })) },
    ],
    cards: visibleCards(state).map(c => {
      // Never publish a cached identity when the current card is hidden from this player.
      const known = identityVisible(c);
      const meta = known ? catalog.card(c.passcode!) : { id: String(c.uid), name: 'Hidden card' };
      return { ...meta, id: String(c.uid), controller: c.player, zone: zones[c.zone], index: c.index,
        faceUp: c.faceUp || c.zone === 'hand' && c.player === 0, position: c.defense ? 'defense' : 'attack',
        ...(known && c.attack !== null ? { attack: c.attack } : {}), ...(known && c.defence !== null ? { defense: c.defence } : {}),
        ...(c.faceUp && Object.values(c.counters).some(count => count > 0) ? {
          counters: Object.entries(c.counters).filter(([, count]) => count > 0).map(([kind, count]) => ({ kind: Number(kind), count })),
        } : {}), ...(c.faceUp && c.turns > 0 ? { turnCounter: c.turns } : {}) };
    }),
    prompt, turn: state.turn, turnPlayer: state.turnPlayer, phase: state.phase ?? 'Preparing', actions, ...(actions.length ? { actionsFor: String(p!.id) } : {}),
    ...(state.timer ? { timer: { ...state.timer } } : {}),
    log: state.events.slice(-120).map(e => describeEvent(state, catalog, names, e, texts)).filter((line): line is string => line !== null).slice(-60),
    ...(state.result ? { ended: state.result.result === 1 ? 'Victory' : state.result.result === 2 ? 'Defeat' : state.result.result === 3 ? 'Draw' : 'Duel finished' } : {}),
    ...(latestIssue ? { waiting: `Unsupported gameplay: ${latestIssue}`, issue: `A duel message could not be used (${latestIssue}); the board shows the last good state.` } : blocked ? { waiting: 'Waiting for the server…' } : {}),
  };
}
function actionResponse(id: string, state: DuelState): EngineResponse {
  const p = state.prompt;
  if (!p || !state.acceptingInput) throw new Error('No active server choice');
  const a = p.actions.find(a => actionId(a) === id);
  if (a) return { type: 'action', player: a.player, zone: a.zone, index: a.index, command: a.command };
  const phase = p.buttons.find(b => `phase:${b}` === id);
  if (phase !== undefined) return { type: 'phase', phase };
  const option = p.options.find(o => `answer:${o.value}` === id);
  if (option) return p.kind === 'yesno' ? { type: 'yesno', yes: option.value === 1 } : { type: 'answer', value: option.value };
  throw new Error('The choice is no longer available');
}
export function interpretResponse(state: DuelState, id: string, response?: DuelResponse): EngineResponse {
  const p = state.prompt;
  if (!p || String(p.id) !== id) throw new Error('This prompt is no longer active');
  if (!response) throw new Error('A response is required');
  if ('cancel' in response) return { type: 'cancel' };
  if ('optionId' in response) return actionResponse(response.optionId, state);
  if ('optionIds' in response) {
    if (p.kind !== 'attribute' || !Array.isArray(response.optionIds) || new Set(response.optionIds).size !== response.optionIds.length) throw new Error('Invalid attribute choices');
    const values = response.optionIds.map(id => {
      const option = p.options.find(o => `answer:${o.value}` === id);
      if (!option) throw new Error('The attribute is no longer available'); return option.value;
    });
    if (values.length !== p.min) throw new Error(`Choose exactly ${p.min} attributes`);
    return { type: 'answer', value: values.reduce((mask, value) => mask | value, 0) };
  }
  if ('cardIds' in response) {
    if (p.kind !== 'cards') throw new Error('This prompt requires a board action');
    return { type: 'cards', indices: response.cardIds.map(v => {
    if (!/^\d+$/.test(v)) throw new Error('Invalid card selection'); return Number(v);
    }) };
  }
  if ('number' in response) return { type: 'answer', value: response.number };
  if ('text' in response && p.kind === 'announce-card' && /^\d{1,8}$/.test(response.text)) return { type: 'announce-card', passcode: Number(response.text) };
  throw new Error('Unsupported choice');
}
export function interpretAction(state: DuelState, id: string): EngineResponse { return actionResponse(id, state); }

/** Overlay presentation poses on a view without changing rules, response masks, or server state. */
export function applyTimeline(view: DuelView, sample: TimelineSample, catalog: CardCatalog): DuelView {
  const current = new Map(view.cards.map(card => [Number(card.id), card]));
  const rotation = (card: CardPlacement) => (card.player === 1 ? 180 : 0) + (card.defense && card.zone === 'monster' ? 90 : 0);
  const position = (card: CardPlacement) => fieldCardPosition({ id: String(card.uid), name: '',
    controller: card.player, zone: zones[card.zone], index: card.index, faceUp: card.faceUp,
    position: card.defense ? 'defense' : 'attack' }, card.handCount);
  const cards = sample.cards.map(item => {
    const target = item.to ?? item.from!;
    const from = item.from ?? target, to = item.to ?? target;
    const a = position(from), b = position(to), oldAngle = rotation(from), newAngle = rotation(to);
    let delta = ((newAngle - oldAngle + 540) % 360) - 180;
    if (delta === -180) delta = 180; // the original takes the positive half-turn for opposite owners
    const flip = from.faceUp === to.faceUp ? 1 : Math.abs(Math.cos(item.progress * Math.PI));
    const faceUp = item.progress < 0.5 ? from.faceUp : to.faceUp;
    const existing = current.get(item.uid);
    // A disappearing token may no longer exist in the authoritative board; its last public identity is safe to paint.
    const shown = item.progress < 0.5 ? from : to;
    const known = shown.passcode !== null && (shown.faceUp || shown.player === 0 && ['hand', 'extra', 'monster', 'spell'].includes(shown.zone));
    const meta = known ? existing?.passcode === shown.passcode ? existing : catalog.card(shown.passcode!) : { id: String(item.uid), name: 'Hidden card' };
    return { ...meta, id: String(item.uid), controller: target.player, zone: zones[target.zone], index: target.index,
      faceUp, position: target.defense ? 'defense' as const : 'attack' as const,
      motion: { x: a.x + (b.x - a.x) * item.eased, y: a.y + (b.y - a.y) * item.eased,
        rotation: oldAngle + delta * item.progress, scaleX: Math.max(0.001, flip), opacity: item.opacity,
        zIndex: item.progress < 1 && (a.x !== b.x || a.y !== b.y || delta !== 0 || from.faceUp !== to.faceUp || item.opacity !== 1) ? 2 : 0 } };
  });
  const effects: NonNullable<DuelView['effects']> = sample.effects.flatMap(({ event, progress }) => {
    const types: Record<string, NonNullable<DuelView['effects']>[number]['type']> = {
      'engine:19': 'attack', 'engine:1a': 'attack', 'engine:17': 'attack', 'engine:12': 'chain', 'engine:13': 'chain',
      'engine:25': 'damage', 'engine:24': 'recover', 'engine:30': 'flash', 'engine:3c': 'flash',
    };
    const type = types[event.type]; if (!type) return [];
    const zone = event.params[0] & 255;
    const card = sample.cards.find(c => c.uid === event.card || type === 'chain' && c.uid === event.params[1]) ??
      sample.cards.find(c => {
        const at = c.to ?? c.from;
        return at?.player === event.player && (type === 'flash' ? at.passcode === event.params[0] :
          at.zone === 'monster' && at.index === zone || at.zone === 'spell' && at.index === zone - 5);
      });
    return [{ type, player: event.player, progress, ...(card ? { cardId: String(card.uid) } : {}),
      ...(type === 'damage' || type === 'recover' ? { value: event.params[0] } : {}) }];
  });
  return { ...view, cards, effects, players: [
    { ...view.players[0], lp: sample.lp[0] }, { ...view.players[1], lp: sample.lp[1] },
  ], ...(sample.pending ? { prompt: null, actions: EMPTY_ACTIONS, ...(view.waiting ? { waiting: view.waiting } : {}) } : {}) };
}
