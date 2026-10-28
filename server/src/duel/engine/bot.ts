// Port of YOLaucher-web apps/server/src/duel/bot.ts (the simple NPC duelcore uses for bot players and `auto`).
// Kept line for line: its choices (and its Math.random draws, seeded by the caller) must match duelcore.
import {
  OcgLocation,
  OcgMessageType,
  OcgPosition,
  OcgResponseType,
  SelectBattleCMDAction,
  SelectIdleCMDAction,
  type OcgCardData,
  type OcgMessage,
  type OcgResponse,
  type SelectFieldPlace,
} from "ocgcore-wasm";
import type { SelectMessage } from "./duel.ts";
import { zoneOrder, type PlaceOrder } from "../zones.ts";

const TYPE_MONSTER = 0x1;
const TYPE_SPELL = 0x2;

/**
 * Bot sencillo ("CPU" de Duel Evolution): no planifica, pero siempre responde algo válido.
 * Invoca su mejor monstruo, activa mágicas de la mano, coloca trampas, ataca con todo y
 * encadena trampas a veces. Tiene un tope de decisiones por turno para no entrar en bucles
 * (p. ej. una carta que se puede activar una y otra vez).
 */
export class Bot {
  private actionsThisTurn = 0;
  private attacksThisTurn = 0;

  /** placeOrder: the zone order of SELECT_PLACE / SELECT_DISFIELD (src/duel/zones.ts; "py" = duelcore's 0..7). */
  constructor(private cardInfo: (code: number) => OcgCardData | null, private placeOrder: PlaceOrder = "centre") {}

  /** El DuelRoom le pasa todos los mensajes para que sepa cuándo cambia el turno. */
  observe(messages: OcgMessage[]) {
    for (const m of messages) {
      if (m.type === OcgMessageType.NEW_TURN) {
        this.actionsThisTurn = 0;
        this.attacksThisTurn = 0;
      }
    }
  }

  choose(msg: SelectMessage): OcgResponse {
    switch (msg.type) {
      case OcgMessageType.SELECT_IDLECMD: {
        this.actionsThisTurn++;
        const tired = this.actionsThisTurn > 10;
        if (!tired) {
          // 1) Invocar el monstruo de más ATK (de los que se pueden invocar normal)
          if (msg.summons.length) {
            const best = argmax(msg.summons, (c) => this.cardInfo(c.code)?.attack ?? 0);
            return idle(SelectIdleCMDAction.SELECT_SUMMON, best);
          }
          // 2) Mágicas desde la mano (Pot of Greed, Dark Hole...). Solo desde la mano: las de
          //    campo con efecto repetible son las que meten en bucle a un bot tonto
          const fromHand = msg.activates.findIndex((c) => c.location === OcgLocation.HAND && this.isSpell(c.code));
          if (fromHand >= 0) return idle(SelectIdleCMDAction.SELECT_ACTIVATE, fromHand);
          // 3) Colocar trampas y mágicas rápidas
          if (msg.spell_sets.length) return idle(SelectIdleCMDAction.SELECT_SPELL_SET, 0);
          // 4) Si no puede invocar, al menos colocar un monstruo boca abajo
          if (msg.monster_sets.length) return idle(SelectIdleCMDAction.SELECT_MONSTER_SET, 0);
        }
        if (msg.to_bp && this.attacksThisTurn === 0) return idle(SelectIdleCMDAction.TO_BP, null);
        if (msg.to_ep) return idle(SelectIdleCMDAction.TO_EP, null);
        return idle(SelectIdleCMDAction.TO_BP, null);
      }
      case OcgMessageType.SELECT_BATTLECMD: {
        this.attacksThisTurn++;
        if (msg.attacks.length && this.attacksThisTurn < 8) {
          return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: 0 };
        }
        if (msg.to_ep) return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_EP, index: null };
        return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.TO_M2, index: null };
      }
      case OcgMessageType.SELECT_CHAIN: {
        if (msg.forced && msg.selects.length) return { type: OcgResponseType.SELECT_CHAIN, index: 0 };
        // Encadenar a veces: así sus trampas salen, pero no gasta todo a la primera
        if (msg.selects.length && Math.random() < 0.5) return { type: OcgResponseType.SELECT_CHAIN, index: 0 };
        return { type: OcgResponseType.SELECT_CHAIN, index: null };
      }
      case OcgMessageType.SELECT_EFFECTYN:
        return { type: OcgResponseType.SELECT_EFFECTYN, yes: true };
      case OcgMessageType.SELECT_YESNO:
        return { type: OcgResponseType.SELECT_YESNO, yes: true };
      case OcgMessageType.SELECT_OPTION:
        return { type: OcgResponseType.SELECT_OPTION, index: 0 };
      case OcgMessageType.SELECT_CARD: {
        // Preferir cartas del rival (objetivos de destrucción, etc.)
        const order = msg.selects
          .map((c, i) => ({ i, rival: c.controller !== msg.player }))
          .sort((a, b) => Number(b.rival) - Number(a.rival))
          .map((x) => x.i);
        const n = Math.max(1, msg.min);
        return { type: OcgResponseType.SELECT_CARD, indicies: order.slice(0, Math.min(n, msg.max)) };
      }
      case OcgMessageType.SELECT_TRIBUTE: {
        // Sacrificar los de menos ATK
        const order = msg.selects
          .map((c, i) => ({ i, atk: this.cardInfo(c.code)?.attack ?? 0 }))
          .sort((a, b) => a.atk - b.atk)
          .map((x) => x.i);
        return { type: OcgResponseType.SELECT_TRIBUTE, indicies: order.slice(0, msg.min) };
      }
      case OcgMessageType.SELECT_UNSELECT_CARD: {
        if (msg.can_finish || !msg.select_cards.length) return { type: OcgResponseType.SELECT_UNSELECT_CARD, index: null };
        return { type: OcgResponseType.SELECT_UNSELECT_CARD, index: 0 };
      }
      case OcgMessageType.SELECT_SUM:
        return { type: OcgResponseType.SELECT_SUM, indicies: pickSum(msg.selects_must.length, msg.selects, msg.amount) };
      case OcgMessageType.SELECT_COUNTER: {
        let left = msg.count;
        const counters = msg.cards.map((c) => {
          const take = Math.min(c.count, left);
          left -= take;
          return take;
        });
        return { type: OcgResponseType.SELECT_COUNTER, counters };
      }
      case OcgMessageType.SELECT_PLACE:
        return { type: OcgResponseType.SELECT_PLACE, places: freePlaces(msg.player, msg.field_mask, msg.count, false, this.placeOrder) };
      case OcgMessageType.SELECT_DISFIELD:
        return { type: OcgResponseType.SELECT_DISFIELD, places: freePlaces(msg.player, msg.field_mask, msg.count, true, this.placeOrder) };
      case OcgMessageType.SELECT_POSITION: {
        const p = msg.positions;
        const pick = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_ATTACK].find(
          (x) => (p & x) !== 0,
        )!;
        return { type: OcgResponseType.SELECT_POSITION, position: pick };
      }
      case OcgMessageType.SORT_CARD:
      case OcgMessageType.SORT_CHAIN:
        return { type: OcgResponseType.SORT_CARD, order: null };
      case OcgMessageType.ROCK_PAPER_SCISSORS:
        return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3 };
      case OcgMessageType.ANNOUNCE_RACE:
        return { type: OcgResponseType.ANNOUNCE_RACE, races: bits(BigInt(msg.available), msg.count) as never };
      case OcgMessageType.ANNOUNCE_ATTRIB:
        return { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: bits(BigInt(msg.available), msg.count).map(Number) as never };
      case OcgMessageType.ANNOUNCE_NUMBER:
        return { type: OcgResponseType.ANNOUNCE_NUMBER, value: 0 };
      case OcgMessageType.ANNOUNCE_CARD:
        // Declarar una carta cualquiera que exista (Blue-Eyes). Si no encaja, el core pide otra
        return { type: OcgResponseType.ANNOUNCE_CARD, card: 89631139 };
      default:
        throw new Error(`el bot no sabe responder a ${(msg as OcgMessage).type}`);
    }
  }

  private isSpell(code: number) {
    const t = this.cardInfo(code)?.type ?? 0;
    return (t & TYPE_SPELL) !== 0 && (t & TYPE_MONSTER) === 0;
  }
}

function idle(action: SelectIdleCMDAction, index: number | null): OcgResponse {
  return { type: OcgResponseType.SELECT_IDLECMD, action, index };
}

function argmax<T>(xs: T[], f: (x: T) => number): number {
  let best = 0;
  xs.forEach((x, i) => {
    if (f(x) > f(xs[best])) best = i;
  });
  return best;
}

function bits(mask: bigint, count: number): bigint[] {
  const out: bigint[] = [];
  for (let b = 1n; b <= mask && out.length < count; b <<= 1n) if (mask & b) out.push(b);
  return out;
}

/**
 * Zonas libres del mensaje SELECT_PLACE. El core manda la máscara de las NO disponibles
 * (como en EDOPro, que hace ~mask): bits 0-7 = mis monstruos, 8-15 = mis mágicas/trampas,
 * 16-31 = lo mismo del rival. Within a region, in `order` (src/duel/zones.ts: the centre first).
 */
export function freePlaces(player: number, mask: number, count: number, rivalFirst = false, order: PlaceOrder = "centre"): SelectFieldPlace[] {
  const out: SelectFieldPlace[] = [];
  const owners = rivalFirst ? [1, 0] : [0, 1];
  for (const side of owners) {
    for (const [base, location] of [
      [0, OcgLocation.MZONE],
      [8, OcgLocation.SZONE],
    ] as const) {
      for (const seq of zoneOrder(8, order)) {
        if (out.length >= count) break;
        const bit = 1 << (side * 16 + base + seq);
        if ((mask & bit) === 0) out.push({ player: side === 0 ? player : 1 - player, location, sequence: seq });
      }
    }
  }
  return out;
}

/** Elige cartas cuya suma de "amount" dé exactamente lo pedido (rituales, sincronías). */
function pickSum(mustCount: number, selects: { amount: number }[], target: number): number[] {
  const vals = selects.map((s) => [s.amount & 0xffff, s.amount >> 16].filter((v) => v > 0));
  const path: number[] = [];
  const dfs = (i: number, sum: number): boolean => {
    if (sum === target) return true;
    if (i >= vals.length || sum > target) return false;
    for (const v of vals[i]) {
      path.push(i);
      if (dfs(i + 1, sum + v)) return true;
      path.pop();
    }
    return dfs(i + 1, sum);
  };
  dfs(0, 0);
  return [...Array(mustCount).keys(), ...path.map((i) => i + mustCount)];
}
