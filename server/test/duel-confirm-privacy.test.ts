// A private look at the deck stays private (ygopro/EDOPro: a MSG_CONFIRM_CARDS of deck cards goes only to the player
// who looks, ev.player; hand/field/extra confirms and MSG_CONFIRM_DECKTOP are public). The real translator, fed like
// ocgSession's PvP: view 0 (player 0), view 1 (player 1, mirrored events) and the spectators' public view.
import { describe, expect, it } from "vitest";
import { cardmap } from "../src/duel/data.ts";
import { mirror } from "../src/duel/translator/mirror.ts";
import { type Msg, YO2Duel } from "../src/duel/translator/translator.ts";
import { PyRandom } from "../src/util/pyrandom.ts";

const MEGAMORPH = 22046459;
const SECRET = 89631139;   // Blue-Eyes White Dragon: the card player 1 looks at
const OCG_DECK = 1, OCG_HAND = 2;

function views() {
  const decks = [{ main: Array(40).fill(MEGAMORPH), extra: [] }, { main: Array(40).fill(MEGAMORPH), extra: [] }];
  const mk = (cfg: Record<string, unknown>) => new YO2Duel(decks, { first: 0, cardmap: cardmap(), cfg, rng: new PyRandom(7) });
  const v = [mk({}), mk({}), mk({ public_view: true })];
  v.forEach((d) => d.start());
  // what each one receives for a batch of events (view 1's are mirrored: its own player is player 0)
  const feed = (evs: any[]) => v.map((d, k) => d.feed_many(k === 1 ? evs.map((e) => mirror(e)) : evs));
  return { v, feed };
}

/** Does the output carry the passcode (u32 either way round)? */
const carries = (out: Msg[], code: number) => {
  const le = Buffer.alloc(4); le.writeUInt32LE(code);
  const be = Buffer.alloc(4); be.writeUInt32BE(code);
  return out.some(([, b]) => { const x = Buffer.from(b); return x.includes(le) || x.includes(be); });
};

describe("CONFIRM_CARDS privacy", () => {
  it("a deck look reaches only the player who looks", () => {
    const { feed } = views();
    const [p0, p1, pub] = feed([{ ev: "msg", type: "CONFIRM_CARDS", player: 1, cards: [{ controller: 1, location: OCG_DECK, sequence: 0, code: SECRET }] }]);
    expect(carries(p1, SECRET), "player 1 sees its own look").toBe(true);
    expect(carries(p0, SECRET), "player 0 must not see player 1's deck look").toBe(false);
    expect(carries(pub, SECRET), "spectators must not see player 1's deck look").toBe(false);
  });

  it("a look at the opponent's deck reaches only the player who looks", () => {
    const { feed } = views();
    const [p0, p1, pub] = feed([{ ev: "msg", type: "CONFIRM_CARDS", player: 0, cards: [{ controller: 1, location: OCG_DECK, sequence: 0, code: SECRET }] }]);
    expect(carries(p0, SECRET)).toBe(true);
    expect(carries(p1, SECRET)).toBe(false);
    expect(carries(pub, SECRET)).toBe(false);
  });

  it("a hand reveal stays public", () => {
    const { v, feed } = views();
    // put the card into player 1's hand first (a draw: hidden from player 0 and the spectators)
    const drawn = feed([{ ev: "msg", type: "DRAW", player: 1, drawn: [{ code: SECRET }] }]);
    expect(carries(drawn[0], SECRET)).toBe(false);
    expect(carries(drawn[2], SECRET)).toBe(false);
    expect(v[1].side[0].hand.length).toBe(1);
    const [p0, p1, pub] = feed([{ ev: "msg", type: "CONFIRM_CARDS", player: 0, cards: [{ controller: 1, location: OCG_HAND, sequence: 0, code: SECRET }] }]);
    expect(carries(p0, SECRET)).toBe(true);
    expect(carries(pub, SECRET)).toBe(true);
  });

  it("an excavation (CONFIRM_DECKTOP) stays public", () => {
    const { feed } = views();
    const [p0, p1, pub] = feed([{ ev: "msg", type: "CONFIRM_DECKTOP", player: 1, cards: [{ controller: 1, location: OCG_DECK, sequence: 0, code: SECRET }] }]);
    expect(carries(p0, SECRET)).toBe(true);
    expect(carries(p1, SECRET)).toBe(true);
    expect(carries(pub, SECRET)).toBe(true);
  });
});
