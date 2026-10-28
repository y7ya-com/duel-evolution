// One ocgcore duel: step() up to the next decision / WIN, respond(). Port of YOLaucher-web
// apps/server/src/duel/engine.ts (Duel.step/respond, SELECT_TYPES) and view.ts applyToTrack, as duelcore uses them.
import {
  OcgMessageType,
  OcgProcessResult,
  type OcgCoreSync,
  type OcgDuelHandle,
  type OcgMessage,
  type OcgResponse,
} from "ocgcore-wasm";

/** Messages that ask a player for a decision: the core stops until it gets the response. */
export const SELECT_TYPES = new Set<number>([
  OcgMessageType.SELECT_BATTLECMD,
  OcgMessageType.SELECT_IDLECMD,
  OcgMessageType.SELECT_EFFECTYN,
  OcgMessageType.SELECT_YESNO,
  OcgMessageType.SELECT_OPTION,
  OcgMessageType.SELECT_CARD,
  OcgMessageType.SELECT_CHAIN,
  OcgMessageType.SELECT_PLACE,
  OcgMessageType.SELECT_POSITION,
  OcgMessageType.SELECT_TRIBUTE,
  OcgMessageType.SORT_CHAIN,
  OcgMessageType.SELECT_COUNTER,
  OcgMessageType.SELECT_SUM,
  OcgMessageType.SELECT_DISFIELD,
  OcgMessageType.SORT_CARD,
  OcgMessageType.SELECT_UNSELECT_CARD,
  OcgMessageType.ROCK_PAPER_SCISSORS,
  OcgMessageType.ANNOUNCE_RACE,
  OcgMessageType.ANNOUNCE_ATTRIB,
  OcgMessageType.ANNOUNCE_CARD,
  OcgMessageType.ANNOUNCE_NUMBER,
]);

export type SelectMessage = OcgMessage & { player: number };

export interface StepResult {
  messages: OcgMessage[];
  /** The message asking for a decision (with its player), if the duel is waiting */
  waiting: SelectMessage | null;
  ended: boolean;
  /** Winner (0/1) or 2 = draw, once ended */
  winner?: number;
}

export class Duel {
  private last: SelectMessage | null = null;
  errors: string[] = [];

  constructor(
    private core: OcgCoreSync,
    private handle: OcgDuelHandle,
  ) {}

  /** Runs the duel until someone has to decide something or it ends. */
  step(): StepResult {
    const messages: OcgMessage[] = [];
    for (let guard = 0; guard < 10_000; guard++) {
      const status = this.core.duelProcess(this.handle);
      const batch = this.core.duelGetMessage(this.handle);
      messages.push(...batch);
      // The core does not stop by itself on a decided duel: it emits WIN and goes on. Cut here, as EDOPro does
      const win = batch.find((m) => m.type === OcgMessageType.WIN);
      if (win) {
        this.last = null;
        const cut = messages.indexOf(win) + 1;
        return { messages: messages.slice(0, cut), waiting: null, ended: true, winner: (win as { player: number }).player };
      }
      if (status === OcgProcessResult.END) {
        this.last = null;
        return { messages, waiting: null, ended: true };
      }
      if (status === OcgProcessResult.WAITING) {
        const sel = [...batch].reverse().find((m) => SELECT_TYPES.has(m.type)) as SelectMessage | undefined;
        // RETRY = the previous response was not valid: the same thing is asked again
        if (batch.some((m) => m.type === OcgMessageType.RETRY) && this.last) {
          return { messages, waiting: this.last, ended: false };
        }
        this.last = sel ?? this.last;
        return { messages, waiting: this.last, ended: false };
      }
    }
    throw new Error("el duelo no avanza (bucle de proceso sin fin)");
  }

  respond(response: OcgResponse) {
    this.core.duelSetResponse(this.handle, response);
  }

  get raw() {
    return { core: this.core, handle: this.handle };
  }

  destroy() {
    this.core.destroyDuel(this.handle);
  }
}

/** State the server tracks itself because ocgcore does not expose it in queries (view.ts DuelTrack). */
export interface DuelTrack {
  lp: [number, number];
  turn: number;
  turnPlayer: number;
  phase: number;
}

export function applyToTrack(t: DuelTrack, messages: OcgMessage[]) {
  for (const m of messages as (OcgMessage & { player: number; phase: number; amount: number; lp: number })[]) {
    switch (m.type) {
      case OcgMessageType.NEW_TURN:
        t.turn++;
        t.turnPlayer = m.player;
        break;
      case OcgMessageType.NEW_PHASE:
        t.phase = m.phase;
        break;
      case OcgMessageType.DAMAGE:
      case OcgMessageType.PAY_LPCOST:
        t.lp[m.player] = Math.max(0, t.lp[m.player] - m.amount);
        break;
      case OcgMessageType.RECOVER:
        t.lp[m.player] += m.amount;
        break;
      case OcgMessageType.LPUPDATE:
        t.lp[m.player] = m.lp;
        break;
    }
  }
}
