// py research/seguridad_duelo/mazo.py (DK) + yo2srv/duelo/mazo.py: the duel deck the client sends, checked against the
// character's trunk and the 2008 deck editor's rules when it is complete (0x6603). Modes: off | avisar (default:
// history in the profile and a log line) | bloquear (the duel does not start: 0x649b code 1 at rock-paper-scissors).
// The test instance (YO2_PVP_TEST) defaults to off: its fake clients carry NPC decks with an empty trunk.
import { createHash } from "node:crypto";
import type { Conn } from "../net/conn.ts";
import type { Game } from "../game/game.ts";
import type { Session } from "../game/hub.ts";
import * as PP from "../game/persist.ts";
import { cardmap, DECK_CARDS } from "./data.ts";
import { duelsvrinfomsg } from "./lockstep.ts";

const MODES = ["off", "avisar", "bloquear"];
const MAIN_MIN = 40, MAIN_MAX = 80, EXTRA_MAX = 30, COPIES_MAX = 3, NO_DECK = 65535, HIST_MAX = 30, SVR_CUT = 1;
const JANKEN_MSGS = new Set([0x6101, 0x6102, 0x6103, 0x6104, 0x61fe]);

interface Problem { regla: string; id: number | null; nombre: string; usa: number; tiene: number | null; max: number; min?: number; zona?: string; texto?: string }

const isFusion = (kind: number) => [2, 3].includes((kind >> 1) & 0x1f);
const count = (xs: number[]) => { const m = new Map<number, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };

export function deckHash(main: number[], extra: number[]): string {
  const s = [...main].sort((a, b) => a - b).join(",") + "|" + [...extra].sort((a, b) => a - b).join(",");
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/** py check(): the deck's problems (empty = valid). */
export function check(main: number[], extra: number[], trunk: Record<string, number>, limitList = true): Problem[] {
  const db = DECK_CARDS;
  const out: Problem[] = [];
  const nom = (cid: number) => db[cid]?.[2] ?? "";
  if (!(main.length >= MAIN_MIN && main.length <= MAIN_MAX))
    out.push({ regla: "tamano", id: null, nombre: "", usa: main.length, tiene: null, max: MAIN_MAX, min: MAIN_MIN, zona: "principal",
      texto: `principal de ${main.length} cartas (` + (main.length < MAIN_MIN ? `mínimo ${MAIN_MIN})` : `máximo ${MAIN_MAX})`) });
  if (extra.length > EXTRA_MAX)
    out.push({ regla: "tamano", id: null, nombre: "", usa: extra.length, tiene: null, max: EXTRA_MAX, zona: "extra", texto: `extra de ${extra.length} cartas (máximo ${EXTRA_MAX})` });
  const use = count([...main, ...extra]);
  const ids = [...use.keys()].sort((a, b) => a - b);
  for (const cid of ids) if (!(cid in db)) out.push({ regla: "existe", id: cid, nombre: "", usa: use.get(cid)!, tiene: null, max: 0 });
  for (const [zona, list, want] of [["principal", main, false], ["extra", extra, true]] as const) {
    const bad = count(list.filter((c) => c in db && isFusion(db[c][0]) !== want));
    for (const cid of [...bad.keys()].sort((a, b) => a - b))
      out.push({ regla: "sitio", id: cid, nombre: nom(cid), usa: bad.get(cid)!, tiene: null, max: 0, zona,
        texto: zona === "principal" ? "fusión en el Deck principal" : "no es una fusión y está en el Deck extra" });
  }
  for (const cid of ids) {
    const have = PP.int(trunk[String(cid)] ?? 0) || 0;
    if (use.get(cid)! > have) out.push({ regla: "baul", id: cid, nombre: nom(cid), usa: use.get(cid)!, tiene: have, max: have });
  }
  const byk = new Map<number, number[]>();
  // copies count per card (alternate arts together: their base passcode; the 2008 client grouped by Konami id)
  for (const cid of use.keys()) { if (!(cid in db)) continue; const k = cardmap().rulesKey(cid); (byk.get(k) ?? byk.set(k, []).get(k)!).push(cid); }
  for (const k of [...byk.keys()].sort((a, b) => a - b)) {
    const ks = byk.get(k)!.sort((a, b) => a - b);
    const n = ks.reduce((a, c) => a + use.get(c)!, 0);
    const lim = db[ks[0]][1];
    if (lim === NO_DECK) { if (n > 0) out.push({ regla: "lista", id: ks[0], nombre: nom(ks[0]), usa: n, tiene: null, max: 0, texto: "no va en mazos (dios o ficha)" }); }
    else if (limitList && [0, 1, 2].includes(lim)) { if (n > lim) out.push({ regla: "lista", id: ks[0], nombre: nom(ks[0]), usa: n, tiene: null, max: lim }); }
    else if (n > COPIES_MAX) out.push({ regla: "copias", id: ks[0], nombre: nom(ks[0]), usa: n, tiene: null, max: COPIES_MAX });
  }
  return out;
}

function historyAdd(p: Record<string, any>, main: number[], extra: number[], problems: Problem[], t = Date.now() / 1000) {
  t = Math.round(t);
  const decks = (p.decks ??= {});
  let hist = decks.historial;
  if (!Array.isArray(hist)) hist = decks.historial = [];
  const h = deckHash(main, extra);
  const i = hist.findIndex((e: any) => e && typeof e === "object" && e.hash === h);
  const old = i >= 0 ? hist.splice(i, 1)[0] : null;
  const e = old ?? { hash: h, main: [...main], extra: [...extra], primera: t, duelos: 0 };
  Object.assign(e, { main: [...main], extra: [...extra], ultima: t, duelos: PP.int(e.duelos || 0) + 1, valido: !problems.length,
    problemas: problems.map((x) => ({ ...x })) });
  hist.push(e);
  hist.splice(0, Math.max(0, hist.length - HIST_MAX));
  return e;
}

export class DeckCheck {
  mode: string;
  constructor(private g: Game, mode: string) { this.mode = MODES.includes(mode) ? mode : "avisar"; }

  /** The complete deck of session s's character: history in ITS profile, log line if it does not fit. */
  review(s: Session | null, main: number[], extra: number[], partida: string | null = null, mode = this.mode) {
    if (mode === "off" || !s || !s.acct) return null;
    let probs: Problem[];
    try {
      const r = this.g.withCtx(s, () => {
        const st = this.g.loadState();
        const slot = s.slot !== null ? s.slot : PP.activeSlot(st);
        const p = PP.profile(st, PP.int(slot) & 3, false);
        if (!p) { this.g.log(`[mazo] sin perfil en el hueco ${slot}: no se comprueba`); return null; }
        const pr = check(main, extra, p.trunk ?? {}, true);
        historyAdd(p, main, extra, pr);
        this.g.saveState(st);
        return pr;
      });
      if (r === null) return null;
      probs = r;
    } catch (e) { this.g.log(`[EXC] [mazo] ${e}`); return null; }
    const block = probs.length > 0 && mode === "bloquear";
    if (probs.length) this.g.log(`[mazo] ${s.name || "?"} (cuenta ${s.acct.slice(0, 6)}, hueco ${s.slot})${partida ? ` ${partida}` : ""}: `
      + `${probs.length} problema${probs.length === 1 ? "" : "s"} (${block ? "BLOQUEADO" : mode})`);
    return { valido: !probs.length, problemas: probs, bloquear: block, modo: mode };
  }

  /** 0x6603 of an NPC duel: c.deck_block if it must be blocked. */
  npcDeck(c: Conn, s: { player: { main: number[]; extra: number[] }; id: number }) {
    c.ext.deckChecked = deckHash(s.player.main, s.player.extra);
    const r = this.review(c.sess as Session | null, s.player.main, s.player.extra, `npc:${s.id}`);
    if (r && r.bloquear) c.ext.deckBlock = { t: Date.now() / 1000, told: false };
    return r;
  }

  /** 0x61fe of an NPC duel: the deck that starts is the one checked (a client that skips 0x6603 or sends 0x6601
   *  again after it is checked now). */
  npcStart(c: Conn, s: { player: { main: number[]; extra: number[] }; id: number }) {
    if (c.ext.deckChecked !== deckHash(s.player.main, s.player.extra)) this.npcDeck(c, s);
  }

  /** NPC duel with the deck blocked: true = handled here. */
  npcGate(c: Conn, msgId: number, _data: Uint8Array): boolean {
    const b = c.ext.deckBlock as { told: boolean } | undefined;
    if (!b) return false;
    if (msgId === 0x6100 && !b.told) {
      b.told = true;
      c.send(0x6100, new Uint8Array(0));
      c.send(0x649b, duelsvrinfomsg(SVR_CUT, 0));
      const o = c.ext.ocg as { over: boolean } | undefined;
      if (o) o.over = true;
      const df = this.g.duel?.dfFor(c);
      if (df) df.sess.end = null;
      this.g.log(`[mazo] duelo contra NPC NO empieza: 0x649b código ${SVR_CUT} (el cliente vuelve al mapa)`);
      return true;
    }
    return msgId === 0x6100 || JANKEN_MSGS.has(msgId);
  }
}
