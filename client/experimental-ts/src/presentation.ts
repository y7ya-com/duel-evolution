import { visibleCards, ZONE_IDS } from './duel/model';
import type { DuelState, DuelResponse as EngineResponse, LegalAction, Zone } from './duel/types';
import type { DuelView, DuelPromptView, DuelOption, DuelResponse, FieldZone } from './ui/contracts';
import { CardCatalog } from './catalog';
import type { CardPlacement, TimelineSample } from './duel/timeline';
import { fieldCardPosition } from './ui/helpers';
import { describePrompt, type DuelTextCatalog } from './duel/text';
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
    return { id: actionId(a), label: actionLabel(state, catalog, a), ...(uid === null ? {} : { cardId: String(uid) }) };
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
      const lastChain = state.chain.at(-1), context = lastChain?.uid == null ? undefined : state.cards[lastChain.uid]?.passcode ?? undefined;
      const described = describePrompt(p, texts, context);
      prompt.text = described.title;
      prompt.options = prompt.options.map((option, i) => ({ ...option, label: described.optionLabels.get(i) ?? option.label }));
    }
    if (p.items.length) prompt.candidates = p.items.map((c, i) => ({ id: String(i), label: c.passcode ? catalog.card(c.passcode).name : 'Hidden card', ...(c.passcode ? { card: catalog.card(c.passcode) } : {}) }));
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
      { name: names[0], lp: state.sides[0].lp, deckCount: state.sides[0].deck.length, handCount: state.sides[0].hand.length },
      { name: names[1], lp: state.sides[1].lp, deckCount: state.sides[1].deck.length, handCount: state.sides[1].hand.length },
    ],
    cards: visibleCards(state).map(c => {
      // Never publish a cached identity when the current card is hidden from this player.
      const known = identityVisible(c);
      const meta = known ? catalog.card(c.passcode!) : { id: String(c.uid), name: 'Hidden card' };
      return { ...meta, id: String(c.uid), controller: c.player, zone: zones[c.zone], index: c.index,
        faceUp: c.faceUp || c.zone === 'hand' && c.player === 0, position: c.defense ? 'defense' : 'attack',
        ...(known && c.attack !== null ? { attack: c.attack } : {}), ...(known && c.defence !== null ? { defense: c.defence } : {}) };
    }),
    prompt, turn: state.turn, turnPlayer: state.turnPlayer, phase: state.phase ?? 'Preparing', actions,
    ...(state.timer ? { timer: { ...state.timer } } : {}),
    log: state.events.slice(-60).map(e => `${e.sequence}: ${e.type}`),
    ...(state.result ? { ended: state.result.result === 1 ? 'Victory' : state.result.result === 2 ? 'Defeat' : state.result.result === 3 ? 'Draw' : 'Duel finished' } : {}),
    ...(latestIssue ? { waiting: `Unsupported gameplay: ${latestIssue}` } : blocked ? { waiting: 'Waiting for the server…' } : {}),
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
  ], ...(sample.pending ? { prompt: null, actions: EMPTY_ACTIONS, waiting: view.waiting ?? 'Resolving duel animations…' } : {}) };
}
