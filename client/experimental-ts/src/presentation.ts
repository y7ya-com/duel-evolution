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
function identityVisible(card: ReturnType<typeof visibleCards>[number], observer = false): boolean {
  return card.passcode !== null && (card.faceUp || card.player === 0 && !observer &&
    ['hand', 'extra', 'monster', 'spell'].includes(card.zone));
}
const lpLine = (who: string, what: string, lp?: [number, number]) => `${who} ${what}${lp ? ` (LP ${lp[0]} -> ${lp[1]})` : ''}`;
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
    // The original Duel Log's wording (server/src/duel/duelText.ts): "<name> paid 2000 LP (LP 8000 -> 6000)". Engine 0x25's
    // P1 is the LP change's type (EngineCmd6.cpp engCmdLp): 2 a cost (the translator's PAY_LPCOST), else damage.
    case 0x25: return p[0] ? lpLine(who, p[1] === 2 ? `paid ${p[0]} LP` : `took ${p[0]} damage`, e.lp) : null;
    case 0x24: return p[0] ? lpLine(who, `gained ${p[0]} LP`, e.lp) : null;
    case 0x26: return e.lp && e.lp[0] !== e.lp[1] ? lpLine(who, 'LP set', e.lp) : null;
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
  const identity = card && identityVisible(card, state.observer) ? catalog.card(card.passcode!).name : null;
  const side = a.player === 0 ? 'your' : 'opponent’s';
  const zone = a.zone <= 4 ? `monster zone ${a.zone + 1}` : a.zone <= 10 ? `spell/trap zone ${a.zone - 4}`
    : a.zone === 11 ? `hand card ${a.index + 1}` : a.zone === 12 ? 'extra deck' : a.zone === 13 ? 'deck'
    : a.zone === 14 ? 'graveyard' : 'banished cards';
  return `${a.label}: ${identity ?? `${side} ${zone}`}`;
}
/** The declaration list's candidates as prompt options (cached per catalog, mode and text tables). */
const declarableViews = new WeakMap<object, { id: string; label: string }[]>();
function declarableCards(catalog: CardCatalog, mode: number, texts?: DuelTextCatalog): { id: string; label: string }[] {
  const list = catalog.declarable(mode >= 0x4b && mode <= 0x4e ? mode : 0x4b, texts);
  let views = declarableViews.get(list);
  if (!views) { views = list.map(c => ({ id: String(c.passcode), label: c.name })); declarableViews.set(list, views); }
  return views;
}
/** The original's instruction for a selection made on the board itself, in its duel dialog wording (the translator's
 * pick panel: DLG_PICK_FIELD 274, DLG_PICK_TRIBUTE 18, DLG_PICK_OPP_HAND 244; 222 for an attack target; 243 a card in
 * one's own hand). A zone has no dialog line of its own: its words are the original's zone names. */
const INSTRUCTIONS: Record<number, string> = { 18: 'Please select a monster as Tribute.', 222: 'Select monster as target for attack.',
  243: 'Select 1 card from your hand.', 244: "Select 1 card from your opponent's hand.", 274: 'Select a target card from the Field.' };
export function boardInstruction(state: DuelState, p: NonNullable<DuelState['prompt']>, texts?: DuelTextCatalog, lastAction?: EngineResponse | null): string | null {
  // Surrender (the deck's command 10) and pile inspection (1) ride along with every request.
  const choices = p.actions.filter(a => a.command !== 10 && a.command !== 1);
  if (p.kind !== 'actions' || p.buttons.length || !choices.length) return null;
  const line = (id: number) => texts?.dialog(id) ?? INSTRUCTIONS[id]!;
  // Attack actions on the player's own monsters declare an attack (the Battle Phase's idle choice): nothing to explain;
  // on the opponent's monsters they pick the attack's target.
  if (choices.every(a => a.command === 0)) return choices.every(a => a.player === 1 && a.zone <= 4) ? line(222) : null;
  if (!choices.every(a => a.command === 11)) return null;
  if (choices.every(a => uidFor(state, a) === null)) {
    const monster = choices.every(a => a.zone <= 4), spell = choices.every(a => a.zone >= 5 && a.zone <= 10);
    return monster ? 'Select a Monster Card Zone.' : spell ? 'Select a Spell & Trap Card Zone.' : 'Select a Card Zone.';
  }
  if (choices.every(a => a.zone === 11)) return line(choices.every(a => a.player === 1) ? 244 : 243);
  // A Tribute Summon or Set asks for its Tributes right after the summon from the hand.
  const summoned = lastAction?.type === 'action' && lastAction.zone === 11 && (lastAction.command === 4 || lastAction.command === 6);
  if (summoned && choices.every(a => a.player === 0 && a.zone <= 4)) return line(18);
  return line(274);
}
export function projectDuel(state: DuelState, catalog: CardCatalog, names: [string, string], submittedPrompt: number | null = null, texts?: DuelTextCatalog, lastAction?: EngineResponse | null): DuelView {
  const p = state.prompt, blocked = submittedPrompt === p?.id;
  const boardPrompt = p && ['actions', 'field-selection', 'discard', 'ritual'].includes(p.kind);
  const actions: DuelOption[] = p && boardPrompt && state.acceptingInput && !blocked ? p.actions.map(a => {
    const uid = uidFor(state, a), card = uid === null ? null : state.cards[uid];
    const place = uid === null && a.zone <= 10 ? { controller: (a.player === 0 ? 0 : 1) as 0 | 1, zone: (a.zone <= 4 ? 'monster' : 'spell') as 'monster' | 'spell', index: a.zone <= 4 ? a.zone : a.zone - 5 } : null;
    return { id: actionId(a), label: actionLabel(state, catalog, a), ...(uid === null ? {} : { cardId: String(uid) }), ...(place ? { place } : {}) };
  }) : [];
  if (p?.kind === 'actions' && state.acceptingInput && !blocked) for (const b of p.buttons) actions.push({ id: `phase:${b}`, label: phases[b] ?? `Phase ${b}` });
  // A card selection on the board (tributes, a target) can be backed out of, as with the original's right click; the
  // server refuses (re-sends) one that cannot be cancelled. A zone placement is never cancellable.
  if (p && isBoardSelection(state, p) && state.acceptingInput && !blocked) actions.push({ id: 'cancel', label: 'Cancel' });
  let prompt: DuelPromptView | null = null;
  if (p && p.kind !== 'actions' && !blocked) {
    const kind: DuelPromptView['kind'] = p.kind === 'yesno' ? 'yes-no' : p.kind === 'position' ? 'position'
      : p.kind === 'number' ? 'number' : p.kind === 'announce-card' ? 'announce'
      : p.kind === 'attribute' ? 'attributes' : p.kind === 'cards' ? 'cards'
      : ['field-selection', 'discard', 'ritual'].includes(p.kind) ? 'place' : 'choice';
    prompt = { id: String(p.id), text: p.title, kind, cancelable: p.cancelable,
      min: p.min, max: p.max, options: p.options.map(o => ({ id: `answer:${o.value}`, label: o.label })),
      ...(p.kind === 'number' ? { numberMin: p.min, numberMax: p.max } : {}), ...(p.kind === 'announce-card' ? { declarable: declarableCards(catalog, p.listMode, texts) } : {}) };
    if (texts) {
      // CHAIN_END has no wire command to clear the cached chain. Only this dialog's
      // explicit picture list is safe context for text alternatives.
      // Several pictures (a chain question naming every card that could respond) name no single card.
      const pictured = p.listMode === 0xff ? p.items.filter(item => item.owner < 2 && item.passcode) : [];
      const context = pictured.length === 1 ? pictured[0]!.passcode ?? undefined : undefined;
      const described = describePrompt(p, texts, context);
      prompt.text = described.title;
      prompt.options = prompt.options.map((option, i) => ({ ...option, label: described.optionLabels.get(i) ?? option.label }));
    }
    // Owner 2 rows are an option dialog's texts (its choices), not cards.
    if (p.items.some(c => c.owner !== 2)) prompt.candidates = p.items.map((c, i) => ({ id: String(i), owner: c.owner, label: c.passcode ? catalog.card(c.passcode).name : 'Hidden card', ...(c.passcode ? { card: catalog.card(c.passcode) } : {}) }))
      .filter(c => c.owner !== 2).map(({ owner: _, ...c }) => c);
    if (p.kind === 'cards' && !(p.listMode >= 6 && p.listMode <= 0x26 || p.listMode >= 0x28 && p.listMode <= 0x48)) {
      prompt.min = prompt.max = 0;
      prompt.readOnly = true;
      prompt.candidates = prompt.candidates?.map(candidate => ({ ...candidate, disabled: true }));
    }
    if (['field-selection', 'discard', 'ritual'].includes(p.kind)) {
      // a choice is a card (picked on the card) or an empty zone (picked on the zone itself, as the original)
      prompt.options = p.actions.filter(a => a.command === 11 || a.command === 0).map(a => {
        const uid = uidFor(state, a);
        const place = uid === null && a.zone <= 10 ? { controller: (a.player === 0 ? 0 : 1) as 0 | 1, zone: (a.zone <= 4 ? 'monster' : 'spell') as 'monster' | 'spell', index: a.zone <= 4 ? a.zone : a.zone - 5 } : null;
        return { id: actionId(a), label: actionLabel(state, catalog, a), ...(uid === null ? {} : { cardId: String(uid) }), ...(place ? { place } : {}) };
      });
      // These are one-at-a-time authoritative board choices, not a client-owned list selection.
      delete prompt.candidates;
    }
  }
  const instruction = p && state.acceptingInput && !blocked ? boardInstruction(state, p, texts, lastAction) : null;
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
      const known = identityVisible(c, state.observer);
      const meta = known ? catalog.card(c.passcode!) : { id: String(c.uid), name: 'Hidden card' };
      return { ...meta, id: String(c.uid), controller: c.player, zone: zones[c.zone], index: c.index,
        faceUp: c.faceUp || c.zone === 'hand' && c.player === 0 && !state.observer, position: c.defense ? 'defense' : 'attack',
        ...(known && c.attack !== null ? { attack: c.attack } : {}), ...(known && c.defence !== null ? { defense: c.defence } : {}),
        ...(c.faceUp && Object.values(c.counters).some(count => count > 0) ? {
          counters: Object.entries(c.counters).filter(([, count]) => count > 0).map(([kind, count]) => ({ kind: Number(kind), count })),
        } : {}), ...(c.faceUp && c.turns > 0 ? { turnCounter: c.turns } : {}) };
    }),
    prompt, ...(instruction ? { instruction } : {}), turn: state.turn, turnPlayer: state.turnPlayer, phase: state.phase ?? 'Preparing', actions, ...(actions.length ? { actionsFor: String(p!.id) } : {}),
    ...(state.timer ? { timer: { ...state.timer } } : {}),
    log: state.events.slice(-120).map(e => describeEvent(state, catalog, names, e, texts)).filter((line): line is string => line !== null).slice(-60),
    ...(state.result ? { ended: state.result.result === 1 ? 'Victory' : state.result.result === 2 ? 'Defeat' : state.result.result === 3 ? 'Draw' : 'Duel finished' } : {}),
    ...(latestIssue ? { waiting: `Unsupported gameplay: ${latestIssue}`, issue: `A duel message could not be used (${latestIssue}); the board shows the last good state.` } : blocked ? { waiting: 'Waiting for the server…' } : {}),
  };
}
const isBoardSelection = (state: DuelState, p: NonNullable<DuelState['prompt']>) => p.kind === 'actions' && !p.buttons.length && p.actions.some(a => a.command === 11 && uidFor(state, a) !== null);
function actionResponse(id: string, state: DuelState): EngineResponse {
  const p = state.prompt;
  if (!p || !state.acceptingInput) throw new Error('No active server choice');
  if (id === 'cancel' && isBoardSelection(state, p)) return { type: 'cancel' };
  const a = p.actions.find(a => actionId(a) === id);
  if (a) return { type: 'action', player: a.player, zone: a.zone, index: a.index, command: a.command };
  const phase = p.buttons.find(b => `phase:${b}` === id);
  if (phase !== undefined) return { type: 'phase', phase };
  const option = p.options.find(o => `answer:${o.value}` === id);
  if (option) return p.kind === 'yesno' ? { type: 'yesno', yes: option.value === 1 } : { type: 'answer', value: option.value };
  throw new Error('The choice is no longer available');
}
/** `named` resolves a typed card declaration (a name or passcode) to a passcode; the server decides if it is declarable. */
export function interpretResponse(state: DuelState, id: string, response?: DuelResponse, named?: (text: string) => number | null): EngineResponse {
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
  if ('text' in response && p.kind === 'announce-card') {
    const passcode = named ? named(response.text) : /^\d{1,8}$/.test(response.text.trim()) ? Number(response.text.trim()) : null;
    if (passcode === null) throw new Error(`No card is named “${response.text.trim().slice(0, 60)}”.`);
    return { type: 'announce-card', passcode };
  }
  throw new Error('Unsupported choice');
}
export function interpretAction(state: DuelState, id: string): EngineResponse { return actionResponse(id, state); }

/** Overlay presentation poses on a view without changing rules, response masks, or server state. */
export function applyTimeline(view: DuelView, sample: TimelineSample, catalog: CardCatalog, observer = false): DuelView {
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
    const known = shown.passcode !== null && (shown.faceUp || shown.player === 0 && !observer && ['hand', 'extra', 'monster', 'spell'].includes(shown.zone));
    const meta = known ? existing?.passcode === shown.passcode ? existing : catalog.card(shown.passcode!) : { id: String(item.uid), name: 'Hidden card' };
    return { ...meta, id: String(item.uid), controller: target.player, zone: zones[target.zone], index: target.index,
      faceUp, position: target.defense ? 'defense' as const : 'attack' as const,
      // the card's size goes with it, as the original's CCard (a hand card's 94 x 138 shrinks to the zone's 48 x 70 as it
      // flies there, a drawn card grows into the hand's)
      motion: { x: a.x + (b.x - a.x) * item.eased, y: a.y + (b.y - a.y) * item.eased,
        width: a.width + (b.width - a.width) * item.eased, height: a.height + (b.height - a.height) * item.eased, eased: item.eased,
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
  // While the board is still animating, its choices (and what they ask) wait with it.
  const { instruction: _instruction, ...settled } = view;
  return { ...(sample.pending ? settled : view), cards, effects, players: [
    { ...view.players[0], lp: sample.lp[0] }, { ...view.players[1], lp: sample.lp[1] },
  ], ...(sample.pending ? { prompt: null, actions: EMPTY_ACTIONS, ...(view.waiting ? { waiting: view.waiting } : {}) } : {}) };
}
