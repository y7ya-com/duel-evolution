import { Bytes, decodeCommands, decodeList, DuelProtocolError, visiblePasscode } from './decode';
import type { CommandRecord, DuelCard, DuelPrompt, DuelSide, DuelState, LegalAction, Location, Player, WireMessage, Zone } from './types';

export const MAX_PRESENTATION_EVENTS = 256;
export const MAX_DIAGNOSTICS = 64;
export const COMMAND_LABELS = ['Attack', 'Inspect', 'Special summon', 'Activate', 'Summon', 'Flip summon', 'Set monster',
  'Set spell/trap', 'Attack position', 'Defense position', 'Surrender', 'Select', 'Draw', 'Shuffle'] as const;
export const ZONE_IDS = { monster: 0, spell: 5, hand: 11, extra: 12, deck: 13, grave: 14, banish: 15 } as const;

function side(lp: number): DuelSide {
  return { lp, monster: Array<number | null>(5).fill(null), spell: Array<number | null>(6).fill(null),
    hand: [], extra: [], deck: [], grave: [], banish: [], nextSerial: 0, turnCounters: {} };
}
export function createDuelState(lp = 8000): DuelState {
  if (!Number.isInteger(lp) || lp < 0 || lp > 0xffff) throw new DuelProtocolError('Invalid starting LP');
  return { version: 1, sequence: 0, status: 'idle', sides: [side(lp), side(lp)], cards: {}, turnPlayer: 0, turn: 0,
    phase: null, chain: [], prompt: null, promptSequence: 0, fieldMasks: [Array<number>(16).fill(0), Array<number>(16).fill(0)],
    handMasks: [{}, {}], buttons: [[], []], inputKind: 0, acceptingInput: false,
    list: { mode: 0, items: [], owner: 0 }, dialog: { expected: 0, items: [] }, variables: {}, timer: null, matchTimer: null,
    result: null, events: [], droppedPresentationEvents: 0, unsupported: [], errors: [] };
}

function player(value: number): Player {
  if (value !== 0 && value !== 1) throw new DuelProtocolError(`Invalid player ${value}`);
  return value;
}
function location(p: number, zone: number, index: number): Location {
  const who = player(p);
  if (!Number.isInteger(index) || index < 0 || index > 1023) throw new DuelProtocolError(`Invalid slot index ${index}`);
  if (zone <= 4) return { player: who, zone: 'monster', index: zone + index };
  if (zone <= 10) return { player: who, zone: 'spell', index: zone - 5 + index };
  const zones: Record<number, Zone> = { 11: 'hand', 12: 'extra', 13: 'deck', 14: 'grave', 15: 'banish' };
  if (!zones[zone]) throw new DuelProtocolError(`Invalid zone ${zone}`);
  return { player: who, zone: zones[zone], index };
}
function validateLocation(at: Location): void {
  if (at.index < 0 || at.index >= (at.zone === 'monster' ? 5 : at.zone === 'spell' ? 6 : 1024)) {
    throw new DuelProtocolError(`Invalid ${at.zone} index ${at.index}`);
  }
}
function getAt(state: DuelState, p: number, zone: number, index = 0): DuelCard | null {
  const at = location(p, zone, index); validateLocation(at);
  const uid = state.sides[at.player][at.zone][at.index];
  return uid == null ? null : state.cards[uid] ?? null;
}
function reindex(state: DuelState, p: Player, zone: Zone): void {
  state.sides[p][zone].forEach((uid, index) => {
    if (uid != null && state.cards[uid]) Object.assign(state.cards[uid], { player: p, zone, index });
  });
}
function detach(state: DuelState, uid: number, compact = true): void {
  // Search actual membership: a shuffle's reimposition can temporarily displace a card before its record arrives.
  for (const p of [0, 1] as const) for (const zone of Object.keys(ZONE_IDS) as Zone[]) {
    const pile = state.sides[p][zone], index = pile.indexOf(uid);
    if (index < 0) continue;
    if (compact && zone !== 'monster' && zone !== 'spell') pile.splice(index, 1);
    else pile[index] = null;
    reindex(state, p, zone);
  }
}
function put(state: DuelState, card: DuelCard, at: Location, faceUp = card.faceUp, defense = card.defense): void {
  validateLocation(at);
  const wasField = card.zone === 'monster' || card.zone === 'spell', toField = at.zone === 'monster' || at.zone === 'spell';
  if (wasField !== toField) { card.attack = null; card.defence = null; card.counters = {}; card.value = 0; card.turns = 0; }
  detach(state, card.uid);
  const pile = state.sides[at.player][at.zone];
  if (at.zone !== 'monster' && at.zone !== 'spell') {
    if (at.index > pile.length) throw new DuelProtocolError('Move destination skips pile positions');
    pile.splice(at.index, 0, card.uid);
  } else {
    if (pile[at.index] != null && pile[at.index] !== card.uid) throw new DuelProtocolError('Move destination is occupied');
    pile[at.index] = card.uid;
  }
  Object.assign(card, at, { faceUp, defense: at.zone === 'monster' && defense }); reindex(state, at.player, at.zone);
}
function impose(state: DuelState, p: number[], rawCode: number): void {
  const at = p[1] === 0 ? location(p[0], p[2], 0) : location(p[0], p[1], p[2]);
  validateLocation(at);
  const owner = player(p[5]), serial = p[4];
  if (serial > 255) throw new DuelProtocolError('Invalid card serial');
  const uid = serial * 2 + owner;
  let card = state.cards[uid];
  if (!card) card = state.cards[uid] = { ...at, uid, owner, serial, passcode: null, hiddenKind: null,
    faceUp: false, defense: false, token: false, attack: null, defence: null, counters: {}, value: 0, turns: 0 };
  detach(state, uid, false);
  Object.assign(card, at, { passcode: visiblePasscode(rawCode), hiddenKind: rawCode === 0xffffff01 ? 'monster' :
    rawCode === 0xffffff02 ? 'spell' : rawCode === 0xffffff03 ? 'trap' : null });
  if (at.zone === 'hand') card.faceUp = at.player === 0 && card.passcode !== null;
  else if (at.zone === 'grave' || at.zone === 'banish') card.faceUp = card.passcode !== null;
  const pile = state.sides[at.player][at.zone];
  while (pile.length <= at.index) pile.push(null);
  pile[at.index] = uid;
  state.sides[owner].nextSerial = Math.max(state.sides[owner].nextSerial, serial);
}
function packedLocation(value: number): Location { return location(value & 1, (value >>> 1) & 31, 0); }
function packedSource(state: DuelState, value: number): DuelCard | null {
  const p = player(value & 1), zone = (value >>> 1) & 31, serialByte = (value >>> 6) & 255;
  if (zone <= 10) return getAt(state, p, zone);
  const at = location(p, zone, 0), pile = state.sides[p][at.zone];
  const matches = pile.filter((uid) => uid != null && (uid & 255) === serialByte);
  if (matches.length !== 1) return null;
  return state.cards[matches[0]!] ?? null;
}
function event(state: DuelState, type: string, p: Player, params: number[], card?: number, lp?: [number, number]): void {
  if (state.events.length >= MAX_PRESENTATION_EVENTS) { state.events.shift(); state.droppedPresentationEvents++; }
  state.events.push({ sequence: state.sequence, type, player: p, params: [...params], ...(card === undefined ? {} : { card }), ...(lp ? { lp } : {}) });
}
function unsupported(state: DuelState, messageId: number, kind: number, command: number, reason: string): void {
  if (state.unsupported.some((u) => u.messageId === messageId && u.kind === kind && u.command === command && u.reason === reason)) return;
  state.unsupported.push({ sequence: state.sequence, messageId, kind, command, reason });
  if (state.unsupported.length > MAX_DIAGNOSTICS) state.unsupported.shift();
}
export function legalActions(state: DuelState): LegalAction[] {
  const out: LegalAction[] = [];
  for (const p of [0, 1] as const) {
    for (let zone = 0; zone < 16; zone++) {
      if (zone === 11) continue;
      const mask = state.fieldMasks[p][zone];
      for (let command = 0; command < 16; command++) if (mask & (1 << command)) {
        out.push({ player: p, zone, index: 0, command, label: COMMAND_LABELS[command] ?? `Command ${command}` });
      }
    }
    for (const [index, mask] of Object.entries(state.handMasks[p])) for (let command = 0; command < 16; command++) {
      if (mask & (1 << command)) out.push({ player: p, zone: 11, index: Number(index), command,
        label: COMMAND_LABELS[command] ?? `Command ${command}` });
    }
  }
  return out;
}
function prompt(state: DuelState, kind: DuelPrompt['kind'], title: string): DuelPrompt {
  return { id: ++state.promptSequence, kind, title, cancelable: true, cancellationKnown: false,
    actions: legalActions(state), buttons: [...state.buttons[0]], items: structuredClone(state.list.items),
    text: state.dialog.consumed ? [] : structuredClone(state.dialog.items), min: 0, max: 1, options: [], dialogKind: 0,
    listMode: state.list.mode, detail: 0, hints: 0 };
}
function listPrompt(state: DuelState, mode: number, hints = 0): DuelPrompt {
  // 0x4b..0x4e are the original's card-name lists (CWindowDeckList::buildNameList: any card, no Fusion, Monsters but
  // Fusions, Monsters); the translator asks with 0x4b.
  const result = prompt(state, mode >= 0x4b && mode <= 0x4e || hints & 1 ? 'announce-card' : 'cards', 'Choose cards');
  if (state.list.consumed) result.items = [];
  result.listMode = mode; result.hints = hints;
  if (mode === 6) result.min = result.max = 1;
  else if (mode > 6 && mode <= 0x26) result.min = result.max = mode - 6;
  else if (mode === 0x48) { result.min = 0; result.max = result.items.length; }
  else if (mode > 0x27 && mode < 0x48) { result.min = 0; result.max = mode - 0x27; }
  else { result.min = 0; result.max = result.items.length; result.title = 'Inspect cards'; }
  // The announcement view carries no list or dialog of its own: what the model holds is the previous view's.
  if (result.kind === 'announce-card') { result.cancelable = false; result.cancellationKnown = true; result.items = []; result.text = []; result.title = 'Declare a card'; }
  return result;
}
function dialogPrompt(state: DuelState, params: number[], hints: number): DuelPrompt {
  const [kind, , detail] = params;
  const kinds: Record<number, DuelPrompt['kind']> = { 2: 'yesno', 3: 'yesno', 4: 'option', 6: 'race',
    7: 'attribute', 8: 'position', 11: 'number', 13: 'discard', 14: 'ritual', 0xff: 'field-selection', 0xfe: 'cards' };
  const result = prompt(state, kinds[kind] ?? 'unsupported', 'Choose an action');
  // A dialog keeps the last dialog pictures (LIST_DIALOG), as the original's list buffer does, but never the cards of
  // a list view that came before it (a Graveyard list under a position question).
  if (state.list.consumed && state.list.mode !== 0xff) { result.items = []; result.listMode = 0; }
  result.dialogKind = kind; result.detail = detail; result.hints = hints;
  if (['option', 'position', 'race', 'attribute', 'number', 'unsupported'].includes(result.kind)) {
    result.cancelable = false; result.cancellationKnown = true;
  } else if (result.kind === 'yesno') result.cancellationKnown = true;
  if (result.kind === 'yesno') result.options = [{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }];
  else if (result.kind === 'position') result.options = [{ value: 0, label: 'Attack position' }, { value: 1, label: 'Defense position' }];
  else if (result.kind === 'option') result.options = result.items.map((item, value) => ({ value, label: `Option ${value + 1} (text ${item.rawId})` }));
  else if (result.kind === 'race') {
    // Index order is the game's YO2_RACE mapping, not OCGcore bit order.
    const names = ['', 'Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish',
      'Dinosaur', 'Insect', 'Beast', 'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile'];
    for (let i = 1; i <= 20; i++) if (detail & (1 << i)) result.options.push({ value: i, label: names[i] });
  } else if (result.kind === 'attribute') {
    const names = ['', 'LIGHT', 'DARK', 'WATER', 'FIRE', 'EARTH', 'WIND'];
    result.min = result.max = detail & 0xffff;
    for (let i = 1; i <= 6; i++) if ((detail >>> 16) & (1 << i)) result.options.push({ value: 1 << i, label: names[i] });
  } else if (result.kind === 'number') {
    result.min = (detail >>> 16) & 15; result.max = (detail >>> 24) & 255;
    if (result.max < result.min) throw new DuelProtocolError('Invalid numeric prompt range');
    const label = detail & 0xffff, scale = label === 302 ? 1000 : label === 303 ? 100 : 1;
    for (let i = result.min; i <= result.max; i++) result.options.push({ value: i,
      label: `${i * scale}${label === 302 || label === 303 ? ' LP' : label === 304 ? ' stars' : label === 318 ? ' counters' : ''}` });
  } else if (result.kind === 'discard') {
    // The hand-limit discard (its only dialog) is forced: the server re-asks a cancel.
    result.min = result.max = state.variables[1] ?? 0; result.cancelable = false; result.cancellationKnown = true;
  }
  return result;
}

function execute(state: DuelState, record: CommandRecord): void {
  const p = record.params, who = player((record.b >>> 15) & 1), cmd = record.b & 0xfff;
  if ([1, 4, 5, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x12, 0x13, 0x23, 0x24, 0x25, 0x26,
    0x2d, 0x31, 0x34, 0x35, 0x3d, 0x3e, 0x3f, 0x41, 0x46, 0x48, 0x49, 0x4d, 0x4e,
    0x4f, 0x50, 0x54, 0x55].includes(cmd)) {
    state.prompt = null; state.acceptingInput = false;
  }
  let card: DuelCard | null = null;
  // An LP change keeps the LP before and after it, so the duel log can show both (the original Duel Log's "(LP a -> b)").
  const lpBefore = cmd >= 0x23 && cmd <= 0x26 ? state.sides[who].lp : null;
  const missing = (why: string) => unsupported(state, 0x6202, 0, cmd, why);
  switch (cmd) {
    case 1: {
      const sequence = state.sequence, events = state.events, dropped = state.droppedPresentationEvents,
        promptSequence = state.promptSequence;
      Object.assign(state, createDuelState()); state.sequence = sequence; state.events = events;
      state.droppedPresentationEvents = dropped; state.promptSequence = promptSequence; state.status = 'playing'; break;
    }
    // Translator sends C_TURN_CHANGE for the player whose turn just ended.
    case 4: state.turnPlayer = (who ^ 1) as Player; state.turn = Math.max(1, state.turn) + 1; state.chain = []; break;
    case 5: state.status = 'finished'; state.acceptingInput = false; state.prompt = null;
      state.result = { result: p[0], mode: p[1] }; break;
    case 0x0c: state.phase = 'draw'; state.turnPlayer = who; state.turn = Math.max(1, state.turn); break;
    case 0x0d: state.phase = 'standby'; state.turnPlayer = who; state.turn = Math.max(1, state.turn); break;
    case 0x0e: state.phase = 'main1'; state.turnPlayer = who; state.turn = Math.max(1, state.turn); break;
    case 0x0f: state.phase = 'battle'; state.turnPlayer = who; state.turn = Math.max(1, state.turn); break;
    case 0x10: state.phase = 'main2'; state.turnPlayer = who; state.turn = Math.max(1, state.turn); break;
    case 0x12:
      if (p[2] < 1 || p[2] > 256) { missing('Chain link exceeds the client presentation limit'); break; }
      card = state.cards[p[1]] ?? null;
      state.chain = state.chain.filter((c) => c.link < p[2]);
      state.chain.push({ player: who, zone: p[0], uid: state.cards[p[1]] ? p[1] : null, link: p[2], resolving: false }); break;
    case 0x13: { const link = state.chain.find((c) => c.link === p[2]); if (link) link.resolving = true; break; }
    case 0x23: state.sides[who].lp = 0; break;
    case 0x24: state.sides[who].lp += p[0]; break;
    case 0x25: state.sides[who].lp = Math.max(0, state.sides[who].lp - p[0]); break;
    case 0x26: state.sides[who].lp = p[0]; break;
    case 0x27: break; // cancel the legacy LP interpolation; our authoritative LP changes are immediate
    case 0x2d: {
      card = state.cards[p[1]] ?? null;
      if (!card) { missing('Summon references an unknown card'); break; }
      const at = packedLocation(p[0]); put(state, card, at, !!(p[0] & 0x4000), !!(p[0] & 0x8000)); break;
    }
    case 0x31: case 0x46: {
      card = state.cards[p[2]] ?? getAt(state, who, p[0]);
      if (!card) { missing('Grave move references an unknown card'); break; }
      if (card.token) { detach(state, card.uid); delete state.cards[card.uid]; }
      else put(state, card, { player: card.owner, zone: 'grave', index: state.sides[card.owner].grave.length }, card.passcode !== null, false);
      break;
    }
    case 0x34:
      card = getAt(state, who, p[0]);
      if (card) {
        card.defense = !card.defense;
        if (p[1]) { card.faceUp = !card.faceUp; if (!card.faceUp) { card.attack = null; card.defence = null; card.counters = {}; } }
      }
      else missing('Position change references an empty slot'); break;
    case 0x35:
      card = getAt(state, who, p[0]);
      if (card) { card.faceUp = !card.faceUp; if (!card.faceUp) { card.attack = null; card.defence = null; card.counters = {}; } }
      else missing('Flip references an empty slot'); break;
    case 0x36: case 0x37: {
      card = getAt(state, who, p[0] & 255);
      if (card && p[1] === 0x1c5f) {
        // The translator emits a pair: first value ATK, second DEF, after clearing an earlier pair.
        if (cmd === 0x37) { card.attack = null; card.defence = null; }
        else if (card.attack === null) card.attack = p[2]; else card.defence = p[2];
      }
      break;
    }
    case 0x3a: card = getAt(state, who, p[0]); if (card) card.value = p[1] | (p[2] << 16); break;
    case 0x3b:
      if (record.internalSlots & 1) {
        const counters = state.sides[who].turnCounters;
        if (!(p[0] in counters) && Object.keys(counters).length >= 64) missing('Player turn-counter cache exceeds its limit');
        else counters[p[0]] = p[2];
      }
      else { card = getAt(state, who, p[0]); if (card) card.turns = p[1] ? p[2] || card.value + 1 : 0; }
      break;
    case 0x3c:
      if (p[2] > 63) { missing('Unknown counter kind exceeds the client presentation limit'); break; }
      card = getAt(state, who, p[0]); if (card) card.counters[p[2]] = Math.max(0, (card.counters[p[2]] ?? 0) + (p[1] << 16 >> 16)); break;
    case 0x3d: {
      const fromP = p[0] & 1, fromZ = (p[0] >>> 8) & 255;
      card = getAt(state, fromP, fromZ);
      if (!card) { missing('Field move references an empty slot'); break; }
      put(state, card, location(p[1] & 1, (p[1] >>> 8) & 255, 0), !!p[2], card.zone === 'monster' && card.defense); break;
    }
    case 0x3e: {
      const a = getAt(state, p[0] & 1, (p[0] >>> 8) & 255), b = getAt(state, p[1] & 1, (p[1] >>> 8) & 255);
      if (!a || !b) { missing('Swap references an empty slot'); break; }
      const at: Location = { player: a.player, zone: a.zone, index: a.index }, bt: Location = { player: b.player, zone: b.zone, index: b.index };
      detach(state, a.uid); detach(state, b.uid); put(state, a, bt); put(state, b, at); break;
    }
    case 0x3f: case 0x41: {
      card = packedSource(state, p[0]);
      if (!card) { missing('Packed move references an unknown card'); break; }
      const toP = player(p[1] & 1), zone = (p[1] >>> 1) & 31;
      const at = location(toP, zone, 0);
      if (zone >= 11) at.index = at.zone === 'deck' && ((p[1] >>> 6) & 255) === 0 ? 0 :
        state.sides[toP][at.zone].length - Number(card.player === toP && card.zone === at.zone);
      put(state, card, at, cmd === 0x41 ? !!(p[2] & 1) : at.zone === 'grave' || at.zone === 'banish' || (at.zone === 'hand' && toP === 0), cmd === 0x41 && !!(p[2] & 256));
      break;
    }
    case 0x48: {
      const at = packedLocation(p[0]), serial = ++state.sides[who].nextSerial;
      if (serial > 255) throw new DuelProtocolError('Token serial overflow');
      impose(state, [at.player, 0, at.index, p[1], serial, who], p[1]);
      card = state.cards[serial * 2 + who]; card.token = true; card.faceUp = !!(p[0] & 0x4000); card.defense = !!(p[0] & 0x8000); break;
    }
    case 0x49: {
      const slots = [0, 1, 2, 3, 4].filter((i) => p[2] & (1 << i)), old = slots.map((i) => state.sides[who].monster[i]);
      const perm = shufflePermutation((p[0] | (p[1] << 16)) >>> 0, slots.length);
      slots.forEach((slot, i) => { state.sides[who].monster[slots[perm[i]]] = old[i]; });
      reindex(state, who, 'monster'); break;
    }
    case 0x4e: {
      const old = [...state.sides[who].hand], perm = shufflePermutation((p[0] | (p[1] << 16)) >>> 0, old.length);
      state.sides[who].hand = perm.map((i) => old[i]); reindex(state, who, 'hand'); break;
    }
    case 0x4f: case 0x50: {
      const uid = cmd === 0x4f ? p[2] >>> 1 : p[2];
      card = state.cards[uid] ?? getAt(state, who, 11, p[0]);
      if (!card) { missing('Set/summon references an unknown hand card'); break; }
      const at = location(who, (p[1] >>> 1) & 31, 0);
      put(state, card, at, !!(p[1] & 0x4000), cmd === 0x4f && !!(p[1] & 0x8000)); break;
    }
    case 0x51: card = state.cards[p[0]]; if (card) card.faceUp = true; break;
    case 0x52: for (const uid of state.sides[who].hand) if (uid != null) state.cards[uid].faceUp = !!p[0] || who === 0; break;
    case 0x54: break; // the server immediately reimposes the exact shuffled deck with type 0x40 records
    case 0x55: {
      const count = p[1];
      if (count > state.sides[who].deck.length) { missing('Draw exceeds the known deck size'); break; }
      for (let i = 0; i < count; i++) {
        const uid = state.sides[who].deck[0];
        if (uid == null || !state.cards[uid]) { missing('Draw references an unknown top card'); break; }
        card = state.cards[uid];
        put(state, card, { player: who, zone: 'hand', index: state.sides[who].hand.length }, who === 0 && card.passcode !== null, false);
      }
      break;
    }
    // Server-issued presentation commands. Retained in the bounded event queue, never used to run local rules.
    // The attacker, so the duel log can name it before it moves or leaves the field.
    case 0x19: case 0x1a: try { card = getAt(state, who, p[0]); } catch { card = null; } break;
    case 3: case 9: case 0x14: case 0x15: case 0x17: case 0x1c: case 0x29: case 0x2c:
    case 0x2e: case 0x2f: case 0x30: case 0x42: case 0x45: case 0x4a: case 0x4b: case 0x4c: case 0x4d:
    case 0x5c: case 0x5d: case 0x60: case 0x62: break;
    default: missing('Unknown engine command; gameplay parity is not established');
  }
  event(state, `engine:${cmd.toString(16)}`, who, p, card?.uid, lpBefore === null ? undefined : [lpBefore, state.sides[who].lp]);
}

/** MSVC LCG/Fisher-Yates, matching translator/helpers.ts and the original hand/set-card shuffle. */
export function shufflePermutation(seed: number, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  let s = seed >>> 0;
  for (let n = count; n > 1; n--) {
    s = (Math.imul(s, 0x343fd) + 0x269ec3) >>> 0;
    const j = (((s >>> 16) & 0x7fff) * n) >>> 15;
    [order[j], order[n - 1]] = [order[n - 1], order[j]];
  }
  return order;
}

function applyRecord(state: DuelState, record: CommandRecord): void {
  const p = record.params;
  switch (record.kind) {
    case 0: execute(state, record); break;
    case 0x11: event(state, 'sync', 0, p); break;
    case 0x1a:
      state.inputKind = p[0]; state.acceptingInput = true;
      // Preserve a specialized field/discard/ritual panel preceding the mask request.
      if (state.prompt && ['field-selection', 'discard', 'ritual'].includes(state.prompt.kind)) {
        state.prompt = { ...state.prompt, id: ++state.promptSequence, actions: legalActions(state), buttons: [...state.buttons[0]] };
        if (state.prompt.kind === 'discard') state.prompt.min = state.prompt.max = state.variables[1] ?? 0;
        if (state.prompt.kind === 'ritual') state.prompt.title = `Choose ritual materials (${state.variables[0x10000] ?? state.prompt.detail} stars remaining)`;
      } else state.prompt = prompt(state, 'actions', 'Choose an action');
      break;
    case 0x1b:
      // Kind 0 is an information box (e.g. surrender refused); the server re-sends the pending prompt right after it.
      if (record.b === 0x32 && p[0] === 0) event(state, 'notice', 0, [p[1] ?? 0]);
      else if (record.b === 0x32) {
        state.prompt = dialogPrompt(state, p, record.hints);
        // A card-list dialog (0xfe) titles the list view that follows it; every other view uses its texts up.
        state.list.consumed = true; if (p[0] !== 0xfe) state.dialog.consumed = true;
      } else if (record.b === 0x33) { state.prompt = listPrompt(state, p[1], record.hints); state.list.consumed = state.dialog.consumed = true; }
      else if (![0x0a, 0x0b, 0x0c, 0x29, 0x37, 0x47].includes(record.b)) {
        unsupported(state, 0x6202, record.kind, record.b, 'Unknown view/prompt command');
      }
      if (state.prompt) state.acceptingInput = true;
      event(state, `view:${record.b.toString(16)}`, 0, p); break;
    case 0x1c: event(state, 'refresh-card', 0, p); break;
    case 0x1d: event(state, 'reveal-card', 0, p); break;
    case 0x1e:
      if (p[0] !== 1) { unsupported(state, 0x6202, record.kind, record.b, 'Unknown named duel variable'); break; }
      state.variables[p[0]] = p[1];
      if (p[0] === 1 && p[1] === 0 && state.prompt?.kind === 'discard') { state.prompt = null; state.acceptingInput = false; }
      break;
    case 0x1f: state.variables[0x10000] = p[0]; state.variables[0x10001] = p[1]; break;
    case 0x40: impose(state, p, p[3]); break;
    case 0x47: case 0x48: case 0x4a: event(state, `control:${record.kind.toString(16)}`, 0, p); break;
    case 0x49: state.prompt = null; state.acceptingInput = false; break;
    case 0x4d: state.result = { result: p[0], mode: p[1] }; state.status = 'finished'; state.prompt = null; state.acceptingInput = false; break;
    case 0x60:
      if (p[0] > 1024) throw new DuelProtocolError('Dialog list exceeds limit');
      state.dialog = { expected: p[0], items: [] }; break;
    case 0x61:
      for (let i = 0; i < 8 && state.dialog.items.length < state.dialog.expected; i += 2) {
        state.dialog.items.push({ value: p[i], kind: p[i + 1] });
      }
      break;
    case 0x62: state.chain = []; break;
    case 0x63: event(state, 'chain-list', 0, p); break;
    default: unsupported(state, 0x6202, record.kind, record.b, 'Unknown command record type');
  }
}

/** Immutable, transactional packet reduction: malformed packets cannot partially change the board. */
export function reduceDuelMessage(previous: DuelState, message: WireMessage): DuelState {
  const state = structuredClone(previous); state.sequence++;
  try {
    switch (message.id) {
      case 0x6202: for (const record of decodeCommands(message.data)) applyRecord(state, record); break;
      case 0x6610: state.list = decodeList(message.data); break;
      case 0x6611: {
        const r = new Bytes(message.data), masks: [number[], number[]] = [Array<number>(16).fill(0), Array<number>(16).fill(0)], buttons: [number[], number[]] = [[], []];
        for (const p of [0, 1] as const) {
          for (let z = 0; z < 16; z++) { if (z === 11) continue; masks[p][z] = r.u16(); r.u8(); }
          for (let i = 0; i < 10; i++) if (r.u8()) buttons[p].push(i);
        }
        r.done(); state.fieldMasks = masks; state.buttons = buttons; break;
      }
      case 0x6612: {
        const r = new Bytes(message.data), count = r.u16();
        if (count > 160) throw new DuelProtocolError('Hand masks exceed limit');
        state.handMasks = [{}, {}];
        for (let i = 0; i < count; i++) { const p = player(r.u8()), index = r.u16(), mask = r.u16();
          if (index > 79) throw new DuelProtocolError('Invalid hand mask index'); state.handMasks[p][index] = mask; }
        for (let i = 0; i < 2; i++) { player(r.u8()); const count = r.u8(); for (let j = 0; j < count; j++) r.u8(); }
        r.done(); break;
      }
      case 0x6461: {
        const r = new Bytes(message.data), who = r.u8(), seconds = r.i32(), paused = !!r.u8(), otherSeconds = r.i32(); r.done();
        // pvpMatch.ts sends GLOBAL_CLOCK=3 for the sideboard deadline/start-stop pair.
        if (who === 3) state.matchTimer = { seconds, paused, otherSeconds };
        else state.timer = { player: player(who), seconds, paused, otherSeconds };
        break;
      }
      case 0x6613: {
        const r = new Bytes(message.data); const scores = Array.from({ length: 9 }, () => r.u32()); r.done(); event(state, 'score', 0, scores); break;
      }
      case 0x649b: {
        const r = new Bytes(message.data), code = r.u8(), rival = r.u8(); r.done(); event(state, 'server-notice', player(rival & 1), [code]); break;
      }
      default: unsupported(state, message.id, -1, -1, 'Unhandled duel message');
    }
    return state;
  } catch (error) {
    const rejected = structuredClone(previous); rejected.sequence++;
    rejected.errors.push(`0x${message.id.toString(16)}: ${error instanceof Error ? error.message : String(error)}`);
    if (rejected.errors.length > MAX_DIAGNOSTICS) rejected.errors.shift();
    return rejected;
  }
}

export function acknowledgePresentation(state: DuelState, throughSequence: number): DuelState {
  return { ...state, events: state.events.filter((e) => e.sequence > throughSequence) };
}

/** Occupied board membership, excluding temporarily displaced identities during a shuffle's reimposition. */
export function visibleCards(state: DuelState): DuelCard[] {
  const cards: DuelCard[] = [], seen = new Set<number>();
  for (const p of [0, 1] as const) for (const zone of Object.keys(ZONE_IDS) as Zone[]) {
    for (const uid of state.sides[p][zone]) if (uid != null && !seen.has(uid) && state.cards[uid]) {
      seen.add(uid); cards.push(state.cards[uid]);
    }
  }
  return cards;
}

/** Stable projection for record/replay parity, excluding animation timing and diagnostic history. */
export function duelSnapshot(state: DuelState): unknown {
  return { status: state.status, turnPlayer: state.turnPlayer, turn: state.turn, phase: state.phase,
    sides: state.sides, cards: Object.values(state.cards).sort((a, b) => a.uid - b.uid),
    prompt: state.prompt, result: state.result };
}
