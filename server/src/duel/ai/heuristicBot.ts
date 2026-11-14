// HeuristicBot: Duel Evolution's NPC AI player. A generic player with per-card rules (cardRules.ts) that reads the
// board instead of playing the first legal thing:
//   - Main phase: counts lethal first (every body that can swing against the opponent's LP: then it turns them all
//     up and goes to battle without over-committing); draw/search and tactical removal, special-summons, plays the
//     STRONGEST monster (tribute-summoning a boss over a weak body, a stolen monster or a token), sets a wall, a flip
//     monster or an outclassed body face-down, turns set attackers up onto an open field and outclassed ones to
//     defense, sets backrow and uses its spells/effects when a rule (cardRules.ts) says they pay.
//   - Battle: only declares attacks that improve the position (exact 1-ply combat, scored by evaluate()), takes lethal
//     when it is there, breaks walls only with a monster big enough to risk it, never trades evenly for nothing.
//   - Responses: springs set cards when a rule says the moment is right (an attack worth it, the opponent's End
//     Phase, something to negate; one answer per chain), removes the opponent's biggest threat, equips its own best
//     monster, tributes its weakest monsters, defends when behind.
// Every loop-capable choice is de-duplicated per turn / per chain window, plus a hard per-turn action cap, so a duel
// always terminates.
//
// Optional layers (BotOpts):
//   - spy: reads the opponent's real hand / set cards / face-down stats (an unmasked board). OFF by default: the
//     honest player sees only what the select's `view` shows. Even with spy, "pick from the opponent's hidden hand"
//     stays a uniformly random pick (#removalValue).
//   - search: the elite tier scores its real decisions with replay-fork rollouts (simSearch.ts).
//   - blunder: the easy tier sometimes plays a random legal line instead of the heuristic's.
//   - strength (0-100): how demanding the player is. A weaker player is not random: it wants a bigger body before it
//     stands one in attack position and a bigger gain before it tributes, so it sets more and commits less.
//   - style: a personality on top of the tier (attackOnly, myTurnOnly, def, fool, light): see BotStyle.
// The Battle Phase is planned whole (battlePlan.ts): every attack order and target, compared by survival, lethal,
// the opponent's next Battle Phase, the board, then the fewest attacks.
import { ATTACK_CLASS, attackClass, compareVerdicts, nextAttack, outcomeScore, planAttacks, planBattle, planEnd, PLAN_DEFAULTS, replyPosition, stealValue, tradeValue, UNKNOWN_WALL, type PlanInput, type PlannedAttack, valueWithReply, type PlanAttacker, type PlanMon } from "./battlePlan.ts";
import BATTLE_PROOF_JSON from "./battleProof.json";
import ON_SUMMON_JSON from "./onSummon.json";
import FLIP_SUMMON_JSON from "./flipSummon.json";
import CATEGORIES from "./aiCategories.json";
import { type CardRule, type RuleCard, type RuleCtx, type RuleMon, type RuleZones, tagRule } from "./cardRules.ts";
import type { RuleCtxExt } from "./ruleCtxExt.ts";
import { activeRules, rulesOf, type RuleSet } from "./ruleSet.ts";
import { H_ATOHAND, H_DISCARD, H_EQUIP, H_RELEASE, H_REMOVE, H_SET, H_SPSUMMON, H_SUMMON, H_TODECK, H_TOGRAVE, TAGS_NO_BOOST, TYPE_EXTRA, TYPE_CONTINUOUS, TYPE_COUNTER, TYPE_EFFECT, TYPE_EQUIP, TYPE_FIELD, TYPE_FUSION, TYPE_MONSTER, TYPE_QUICKPLAY, TYPE_RITUAL, TYPE_SPELL, TYPE_TRAP, tagMask } from "../brain/cards.ts";
import { COMBO_PLANS, type ComboPlan } from "./comboPlans.ts";
import { evaluate, type EvalMon, type Position } from "./evaluate.ts";
import { canPay, costOrder, discardBenefit, expendable, neverSet, type CostView } from "./costPick.ts";
import {
  type Activatable, type BoardCard, type CardRef, type DuelBoard, type Json, type PlaceRef, type PlayerBoard, type Prompt,
  LOCATION, PHASE, POS, boardFromState, boardFromView, freePlaces, isFaceDown, lowestBits, solveAnnounceCard, solveSum, toPrompt,
  respBattle, respCards, respChain, respCounter, respEffectYN, respIdle, respOption, respPlaces, respPosition, respSort,
  respTribute, respUnselect, respYesNo,
} from "./prompt.ts";
import { rolloutScore, searchable, whatIf, type SearchAccess } from "./simSearch.ts";
import type { CardDB as BrainDB } from "../brain/index.ts";
import { zoneOrder } from "../zones.ts";

/** Tag-derived rules per card code (null = none), shared: card text does not change. */
const TAG_RULES = new Map<number, CardRule | null>();

const MAX_IDLE_ACTIONS = 24; // hard safety cap on plays per turn (prevents pathological loops)

/** Set cards that really answer a committed board or an attack: what a spy-vision player fears, pops first, and
 *  discounts its board eval by. */
const THREAT_BACKROW = /mirror force|sakuretsu armor|torrential tribute|ring of destruction|bottomless trap hole|magic cylinder|solemn judgment|mirror wall|spellbinding circle|draining shield|negate attack|waboku|crush card virus|book of moon/;
/** Backrow removal worth firing BEFORE committing monsters when a known threat is set. */
const BACKROW_POPPER = /mystical space typhoon|dust tornado|heavy storm|harpie's feather duster/;
/** An opponent's link that clears our whole backrow (untargeted): its set cards are lost anyway, so used if they can be.
 *  Judgment Dragon's and Demise's texts have no tag for it (production lost a set Raigeki Break to Demise unused). */
const CLEARS_BACKROW = /^(judgment dragon|heavy storm|harpie's feather duster|lightsworn barrier|demise, king of armageddon|dark magic attack)$/;
/** A spell / trap that stays on the field once resolved: destroying it while it is still a chain link takes its effect
 *  away. Any other (a normal or quick-play spell, a normal or counter trap) leaves the field as it resolves. */
const LASTING = TYPE_CONTINUOUS | TYPE_EQUIP | TYPE_FIELD;
/** Flip monsters whose effect discards the hand. */
const HAND_RESET = /^(morphing jar)$/;
/** Monsters whose attack returns their target (and themselves) to the hand at the start of the Damage Step: the
 *  battle planner reads it as removing the target, whatever the stats. */
const BOUNCE_ATTACKER = /^(neo-spacian grand mole)$/;
/** Attack answers that take every attacker (wasted on one) and ones that cost a discard or LP (#answerCost). */
const MASS_ANSWER = /^(mirror force|justi-break|dimension wall|draining shield)$/;
const PAID_ANSWER = /^(raigeki break|ring of destruction|judgment of anubis|magic drain|solemn judgment)$/;
/** Monsters that burn for the ATK of what they destroy by battle: a set monster in front of them should be the smallest. */
const BURN_ON_KILL = /^(shining flare wingman|elemental hero shining flare wingman|elemental hero flame wingman|flame wingman)$/;
/** A monster's stats when Normal Summoned without tributes (its own procedure halves them). */
const NO_TRIBUTE_STATS: Record<string, { atk: number; def: number }> = {
  "fusilier dragon, the dual-mode beast": { atk: 1400, def: 1000 },
  "beast king barbaros": { atk: 1900, def: 1200 },
};
/** Monsters whose effect works only face-down (Blast Sphere: attacked while set, it takes the attacker): always set, never
 *  flipped (production Normal Summoned two face-up). */
const STAYS_SET = /^(blast sphere)$/;
/** Monsters whose battles hurt only the opponent (Amazoness Swords Woman): in attack position they cost me nothing. */
const REFLECTS_DAMAGE = /^(amazoness swords woman)$/;
/** A card rule's summon score at least this is the turn's plan (made first). */
const PLANNED_SUMMON = 1500;
/** Face-up cards that stop monsters attacking (#attackLocked). */
const ATTACK_LOCKS = /^(nightmare's steelcage|swords of revealing light|messenger of peace|gravity bind|level limit - area b)$/;
/** A lock of mine already running: a second one adds nothing. */
const LOCKS = /^(swords of revealing light|swords of concealing light|nightmare's steelcage|messenger of peace|level limit - area b|gravity bind)$/;
/** Monsters that cannot be destroyed by battle, Equip Spells that make theirs so, Gladiator Beasts (a battle they survive
 *  triggers them) and monsters whose destruction destroys a monster (scripts/ai_battle_proof.mjs). */
const BATTLE_PROOF = new Set<number>(BATTLE_PROOF_JSON.codes);
const BATTLE_PROOF_EQUIP = new Set<number>(BATTLE_PROOF_JSON.equips);
const BATTLE_TRIGGER = new Set<number>(BATTLE_PROOF_JSON.battleTrigger);
const REVENGE = new Set<number>(BATTLE_PROOF_JSON.revenge);
/** Monsters that deal piercing damage (production never counted Gravekeeper's Spear Soldier's on a 200 DEF Spirit Reaper). */
const PIERCE = new Set<number>(BATTLE_PROOF_JSON.pierce);
/** Monsters that can attack directly with monsters across (Spell Striker). */
const DIRECT = new Set<number>(BATTLE_PROOF_JSON.direct);
/** Monsters whose own effect a Normal Summon triggers (scripts/ai_on_summon.mjs): summoned face-up for it. */
const ON_SUMMON = new Set<number>(ON_SUMMON_JSON.codes);
/** Monsters with no FLIP type whose effect only a Flip Summon triggers (scripts/ai_flip_summon.mjs): played as flip monsters. */
const FLIP_SUMMON = new Set<number>(FLIP_SUMMON_JSON.codes);
const CATEGORY = Object.fromEntries(Object.entries(CATEGORIES.codes).map(([k, v]) => [k, new Set<number>(v)])) as Record<keyof typeof CATEGORIES.codes, Set<number>>;
/** What a monster's owner gets back when it dies (Master Duel's CPU card categories): a search or a summon, a revival
 *  of itself, any other leave-the-field effect. */
export function afterlife(code: number): number {
  return CATEGORY.graveSearch.has(code) || CATEGORY.selfRevive.has(code) ? 700 : CATEGORY.leavesField.has(code) ? 400 : 0;
}
/** Face-up cards that negate every Trap effect (Master Duel never activates a Trap into them). */
const TRAP_LOCK = /^(royal decree|jinzo|jinzo - lord)$/;
/** Face-up cards that negate Spell activations / effects. */
const SPELL_LOCK = /^(imperial order|spell canceller)$/;
/** Continuous / Equip cards that keep a revived monster on the field: it leaves with them. */
const LINKED_REVIVAL = /^(call of the haunted|glorious illusion|premature burial|limit reverse|the shallow grave|soul resurrection)$/;
/** Burn cards a chain can stack, and what each deals now (Chain Strike: 400 per link, #burnChain). */
const BURN: Record<string, (c: RuleCtx) => number> = {
  "secret barrel": (c) => 200 * (c.oppHand + c.oppMon.length + c.oppBackrow),
  "just desserts": (c) => 500 * c.oppMon.length,
  "ceasefire": (c) => 500 * ((c.ext?.myEffectMon ?? 0) + (c.ext?.oppEffectMon ?? 0) + c.myMon.filter((m) => m.faceDown).length + c.oppMon.filter((m) => m.faceDown).length),
  "dimension wall": (c) => c.ext?.incomingDamage ?? 0,
  "magic cylinder": (c) => c.attackAtk,
  "chain strike": () => 0,
};
/** Set cards that answer an attack on me (the rule fact mySetAttackAnswers: a wipe on a summon can wait for them). */
const ATTACK_ANSWER = /^(sakuretsu armor|mirror force|magic cylinder|negate attack|dimension wall|draining shield|justi-break|raigeki break|ring of destruction|widespread ruin|magical arm shield|enemy controller)$/;
/** Cards in hand or set that stop an attack or a whole Battle Phase: with one, an Exodia piece is not set as a wall. */
const STOPS_ATTACKS = /^(sakuretsu armor|mirror force|magic cylinder|negate attack|dimension wall|draining shield|justi-break|raigeki break|ring of destruction|widespread ruin|magical arm shield|scapegoat|waboku|threatening roar|gravity bind|messenger of peace|swords of revealing light|nightmare's steelcage|level limit - area b)$/;
/** Cards that gain from being discarded (Dark World): an opponent's shown one makes "they discard" a gift. */
const DISCARD_PAYOFF = / of dark world$|^dark world /;
/** Control cards whose monster goes back at the End Phase (their text tags miss it: Brain Control's monster was never
 *  read as borrowed, so production tributed two of them before they could attack). */
/** Cards that need another face-up card of mine to be activated: the card -> its partner. */
const NEEDS: Record<string, string> = { "royal tribute": "necrovalley" };
/** Equips whose ATK boost counts my Spell/Trap cards. */
const COUNTS_BACKROW = /^mage power$/;
const LENDS = /^(brain control|mind control|enemy controller)$/;
/** Spells and traps with an LP cost (a card worth nothing once it cannot be paid). */
const LP_COST: Record<string, number> = { "brain control": 800, "premature burial": 800, "final countdown": 2000, "ultimate offering": 500, "skill drain": 1000 };
/** Equips that hold a monster taken from the opponent: it goes back when they leave. */
const STEALS = /^(snatch steal|mind control)$/;
/** Set cards whose cost is a discard: the last card in hand is kept for them. */
const DISCARD_COST = /^(raigeki break|divine wrath|magic jammer|forced back|dark coffin|hallowed life barrier|spiritualism)$/;
/** Cards that take a monster off the opponent's field. */
const REMOVAL = tagMask("destroy_monster", "nuke_opp", "nuke_all", "control", "bounce");

/** What the player needs to know about cards: base stats, the cards.cdb name, and a flip-risk prior. */
export interface CardInfo {
  stat(code: number): { atk: number; def: number; level: number };
  /** cards.cdb English name, lowercase ("" if unknown). */
  name(code: number): string;
  /** Estimated value lost by exposing this set monster (FLIP removal/search...): 0 for a plain body. */
  flipRisk(code: number): number;
  /** For ANNOUNCE_CARD (declarable() over the whole card pool). */
  brain: BrainDB;
}

export interface BotOpts {
  /** The NPC id: its own rules (NPC_RULES) and combo plan (COMBO_PLANS). */
  npcId?: number;
  /** Its deck list (Main + Extra): what is still in the Deck is this less every copy seen (rule inMyDeck). */
  deck?: number[];
  /** The card rules (ruleSet.ts): the active set when absent. */
  rules?: RuleSet;
  /** Spy vision: boards come from `peek` (the full duel state) instead of the select's honest `view`. */
  spy?: boolean;
  /** The duel's full state (duelcore `query`), for spy vision. */
  peek?: () => Json;
  /** Seed of the private rng (honest random picks, blunders, mistakes): deterministic per seed. */
  seed?: number;
  /** Elite tier: real decisions scored by replay-fork rollouts. */
  search?: SearchAccess;
  /** Probability of playing the 2nd-best searched line instead of the best (0 = always the best). */
  mistakeRate?: number;
  /** Easy tier: probability of a random legal line at a main/battle-phase decision. */
  blunder?: number;
  /** 0-100 (default 100): lower = more demanding before committing a monster (sets more, tributes less). */
  strength?: number;
  style?: BotStyle;
}

/** A personality, independent of the tier. */
export interface BotStyle {
  /** Never sets a monster or puts one in defense position. */
  attackOnly?: boolean;
  /** Never answers on the opponent's turn (no chains, no traps). Implies light. */
  myTurnOnly?: boolean;
  /** Defensive: demands more before standing a monster in attack. */
  def?: boolean;
  /** Takes the first legal option at every choice. */
  fool?: boolean;
  /** Thinks less: no reply ply in the battle plan or the rollout score. */
  light?: boolean;
}

/** One searchable line: the response, plus the bookkeeping to apply if this line is chosen (what respond() would
 *  have recorded: dedup sets, action counts, pending attacker). */
interface Candidate { resp: Json; commit?: () => void }
/** An action a what-if can play: the prompt it answers and the response. */
interface Action { prompt: Prompt; resp: Json }

/** A link of the current chain: what it targets of ours (`${location}:${sequence}`), whether it clears our backrow
 *  (CLEARS_BACKROW), and whether it negates the link below it. */
interface ChainLink { code: number; controller: number; location: number; sequence: number; targets: string[]; clears: boolean; negates: boolean }

interface OppMon { seq: number; code: number; level: number; atk: number; def: number; battleProof: boolean; afterlife: number; faceDown: boolean; attackPos: boolean; known: boolean; flipRisk: number; effectThreat: number;
  /** Taken from the other player until the End Phase (Brain Control): it goes back, so it is the first tribute. */
  stolen: boolean;
  /** A face-up lock stops it attacking (#attackLocked). */
  noAttack: boolean;
  /** A Gladiator Beast (a battle it survives triggers it); destroyed, it destroys a monster (Newdoria). */
  battleTrigger: boolean; revenge: boolean }
/** Live combo-assembly state: how many pieces are in hand/field and whether the payoff can be made now. */
interface ComboState { plan: ComboPlan; pieces: number; ready: boolean; haveEnabler: boolean }

type P<K extends Prompt["kind"]> = Extract<Prompt, { kind: K }>;

/** mulberry32: a small seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class HeuristicBot {
  readonly seat: number;
  #cards: CardInfo;
  #board: DuelBoard | null = null;
  #turn = -1;
  #turnPlayer = 0;
  #idleActions = 0;
  /** Material count of the latest unselect prompt (variable-ATK contact fusions). */
  #summonMaterialCount = 0;
  /** `${loc}:${seq}:${desc}` of effects activated this turn: stops re-activation loops. */
  #activatedThisTurn = new Set<string>();
  /** `code:desc` of chains activated in the current chain window: stops re-chain loops. */
  #chainedThisWindow = new Set<string>();
  /** ATK of the monster whose attack we just declared, consumed by the follow-up target prompt. */
  #pendingAttacker: number | null = null;
  /** Keep the declared monster across chain/target prompts: a replay must reassess the NEW board. */
  #declaredAttacker: CardRef | null = null;
  /** The declared attack reached its declaration (the engine's ATTACK). When it did not (an attack cost refused:
   *  Panther Warrior's tribute), that monster is not declared again this turn: it looped to the decision cap. */
  #attackSeen = true;
  #deadAttackers = new Set<number>();
  /** The opponent's attack of this Battle Phase (their monster's zone; ours it targets), until the phase changes. */
  #attack: { sequence: number; direct: boolean; target: number | null; resolved?: boolean } | null = null;
  /** Who activated the chain's last link (null outside a chain). */
  #chainTop: number | null = null;
  /** The link of the chain resolving now (1-based, CHAIN_SOLVING), 0 outside a resolution. */
  #solving = 0;
  /** The chain's links so far (cleared at its end). */
  #links: ChainLink[] = [];
  /** ATK of the monster the opponent just summoned (its response window), until a chain starts or the phase moves, and
   *  its zone: its ATK on the field is read there (Evil HERO Dark Gaia's printed ATK is "?": production read it as 1
   *  and let a 6200 through Bottomless Trap Hole). */
  #oppSummonAtk = 0;
  #oppSummonSeq = -1;
  /** The engine's hint for this seat's next card pick (HINT type 3: 518 = equip...). */
  #hint = 0;
  /** The card this seat activated last (what a following target pick belongs to). */
  #lastActivated = 0;
  /** The turn a control card that gives the monster back at the End Phase was activated (Brain Control): what it
   *  took is a free tribute that turn. */
  #lentTurn = -1;
  /** Lethal was counted this turn: turn every body up, summon the strongest, attack. */
  #allIn = false;
  #rules: Record<string, CardRule>;
  #combo: ComboPlan | undefined;
  #vision: boolean;
  #peek: (() => Json) | undefined;
  #rng: () => number;
  #search: SearchAccess | undefined;
  #mistakeRate: number;
  #blunder: number;
  /** 0 (strength 100) .. 1 (strength 0): how much more the player demands before committing. */
  #picky: number;
  #style: BotStyle;
  /** The opponent's zone the planned attack goes for (null = direct), for the target prompt that follows it. */
  #plannedTarget: number | null | undefined;
  /** The select being answered (a what-if forks the duel at it), and this decision's what-if results. */
  #sel: Json | null = null;
  #whatIfs = new Map<string, { gain: number; summon: number }>();
  #stored: { turn: number; seqs: ReadonlySet<number> } | null = null;
  #deckList: number[] = [];
  /** My monsters (zones) that declared an attack this turn, and my attack under way (its zone, its target's). */
  #attackedThisTurn = new Set<number>();
  #oppAttackedThisTurn = new Set<number>();
  #myAttack: { sequence: number; target: number | null } | null = null;
  /** The chain length once our last answer in this window is on it (a later opponent link may be answered again). */
  #answeredAt = 0;
  /** A burn card went on this chain to raise Chain Strike's link: Chain Strike follows it. */
  #stacking = false;
  /** This seat Normal Summoned this turn (the cost picker keeps a summonable monster until then); the opponent did. */
  #normalSummoned = false;
  #oppNormalSummoned = false;
  /** `${zone}:${code}` of my face-up Spell/Trap cards -> how many of my Standby Phases each has spent there. */
  #standbys = new Map<string, number>();
  /** Whose turn it is by the duel's messages (NEW_TURN), for what happens between selects. */
  #msgTurnPlayer = -1;
  /** Equip cards by their zone (`${controller}:${sequence}`) -> the monster zone they went onto (the EQUIP message). */
  #equips = new Map<string, string>();
  /** `${zone}:${code}` of the monsters I controlled but did not own at the start of this turn (a Creature Swap): not
   *  what this turn's Brain Control lent me. */
  #heldBefore = new Set<string>();
  #heldTurn = -1;
  /** The turn and main-phase step #lethalProbe last looked at. */
  #probed = "";

  constructor(seat: number, cards: CardInfo, opts: BotOpts = {}) {
    this.seat = seat;
    this.#cards = cards;
    this.#rules = rulesOf(opts.rules ?? activeRules(), opts.npcId);
    this.#deckList = opts.deck ?? [];
    this.#combo = opts.npcId !== undefined ? COMBO_PLANS[opts.npcId] : undefined;
    this.#vision = !!opts.spy && !!opts.peek;
    this.#peek = opts.peek;
    this.#rng = mulberry32(opts.seed ?? 0x9e3779b9);
    this.#search = opts.search;
    this.#mistakeRate = opts.mistakeRate ?? 0;
    this.#blunder = opts.blunder ?? 0;
    this.#style = opts.style ?? {};
    if (this.#style.myTurnOnly) this.#style = { ...this.#style, light: true };
    this.#picky = Math.min(1, (100 - Math.max(0, Math.min(100, opts.strength ?? 100))) / 100 + (this.#style.def ? 0.5 : 0));
  }

  /** The battle plan's options for this player. */
  #planOpts() {
    return { ...PLAN_DEFAULTS, reply: !this.#style.light };
  }

  // ---- engine entry points ----------------------------------------------------------------------------------------
  /** Public duel messages (ev.ev === "msg"): chain boundaries reset the per-window guard. */
  observe(ev: Json): void {
    switch (ev.type) {
      case "MOVE": {
        const from = ev.from as Json | undefined;
        if (Number(from?.controller) === this.seat && (Number(from?.location) & LOCATION.HAND) !== 0) {
          // Hand slots are compacted when a card leaves. Another copy of a freely usable
          // spell can now occupy the same code/slot as the previous one (three Pots of Greed).
          // Its legality comes from the engine; keep the loop guards for unchanged field cards.
          for (const key of this.#activatedThisTurn) {
            const parts = key.split(":");
            const location = parts[0] === "eff" ? parts[4] : parts[0] === "b" ? parts[2] : parts[1];
            if (Number(location) === LOCATION.HAND) this.#activatedThisTurn.delete(key);
          }
        }
        break;
      }
      case "CHAIN_END": this.#chainedThisWindow.clear(); this.#chainTop = null; this.#links = []; this.#solving = 0; this.#answeredAt = 0; this.#stacking = false; break;
      case "CHAIN_SOLVING": this.#solving = Number(ev.chain_size ?? 0); break;
      case "CHAIN_SOLVED": this.#solving = 0; break;
      case "CHAINING": {
        this.#oppSummonAtk = 0;
        this.#chainTop = Number(ev.controller);
        const code = Number(ev.code);
        const k = this.#cards.brain.get(code);
        const clears = CLEARS_BACKROW.test(this.#nameOf(code)) || !!k?.has("storm_all") || (!!k?.has("storm_opp") && Number(ev.controller) !== this.seat);
        this.#links.push({ code, controller: Number(ev.controller), location: Number(ev.location), sequence: Number(ev.sequence),
          targets: [], clears, negates: this.#negates(code) });
        break;
      }
      case "BECOME_TARGET":
        if (this.#chainTop !== null && this.#chainTop !== this.seat) {
          const top = this.#links[this.#links.length - 1];
          for (const c of (Array.isArray(ev.cards) ? ev.cards : []) as Json[]) if (top && Number(c.controller) === this.seat) top.targets.push(`${Number(c.location)}:${Number(c.sequence)}`);
        }
        break;
      case "NEW_PHASE": case "NEW_TURN":
        if (ev.type === "NEW_TURN" && ev.player !== undefined) this.#msgTurnPlayer = Number(ev.player);
        if (ev.type === "NEW_PHASE" && Number(ev.phase) === PHASE.STANDBY && this.#msgTurnPlayer === this.seat) this.#countStandby();
        this.#attack = null; this.#myAttack = null; this.#oppSummonAtk = 0; if (ev.type === "NEW_TURN") { this.#attackedThisTurn.clear(); this.#oppAttackedThisTurn.clear(); } if (ev.type === "NEW_TURN") { this.#normalSummoned = false; this.#oppNormalSummoned = false; } break;
      case "SUMMONING": case "SPSUMMONING": case "FLIPSUMMONING":
        if (ev.type === "SUMMONING") { if (Number(ev.controller) === this.seat) this.#normalSummoned = true; else this.#oppNormalSummoned = true; }
        this.#oppSummonAtk = Number(ev.controller) !== this.seat && Number(ev.code) ? Math.max(1, this.#stat(Number(ev.code)).atk) : 0;
        this.#oppSummonSeq = this.#oppSummonAtk > 0 && (Number(ev.location) & LOCATION.MZONE) !== 0 ? Number(ev.sequence) : -1;
        break;
      case "SET":
        // a monster Set uses the Normal Summon too
        if ((Number(ev.location) & LOCATION.MZONE) !== 0) { if (Number(ev.controller) === this.seat) this.#normalSummoned = true; else this.#oppNormalSummoned = true; }
        break;
      case "ATTACK": {
        const a = ev.card as Json | undefined, t = ev.target as Json | null | undefined;
        if (a && Number(a.controller) !== this.seat) {
          this.#attack = { sequence: Number(a.sequence), direct: !t, target: t && Number(t.controller) === this.seat ? Number(t.sequence) : null };
          this.#oppAttackedThisTurn.add(Number(a.sequence));
        }
        else {
          this.#attackSeen = true;
          if (a) { this.#attackedThisTurn.add(Number(a.sequence)); this.#myAttack = { sequence: Number(a.sequence), target: t ? Number(t.sequence) : null }; }
        }
        break;
      }
      case "HINT": if (ev.hint_type === 3 && ev.player === this.seat) this.#hint = Number(ev.hint); break;
      // the damage is calculated: removing the attacker now stops nothing
      case "BATTLE": if (this.#attack) this.#attack = { ...this.#attack, resolved: true }; break;
      case "EQUIP": {
        const c = ev.card as Json | undefined, t = ev.target as Json | undefined;
        if (c && t) this.#equips.set(`${Number(c.controller)}:${Number(c.sequence)}`, `${Number(t.controller)}:${Number(t.sequence)}`);
        break;
      }
    }
  }

  /** Response for a duelcore select addressed to this seat (brain mode, with `view`); null = let the engine decide. */
  choose(sel: Json): Json | null {
    this.#sync(sel);
    // the turn's battle plan is stored at its first main-phase decision (tributes never take its attackers)
    if (sel.type === "SELECT_IDLECMD" && this.#turnPlayer === this.seat) this.#storedPlan();
    this.#sel = sel;
    this.#whatIfs.clear();
    return this.decide(toPrompt(sel, this.seat, this.#vision), sel);
  }

  /** Turn bookkeeping and the board for this select. */
  #sync(sel: Json): void {
    const turn = Number(sel.turn ?? 0);
    this.#turnPlayer = Number(sel.turn_player ?? 0);
    if (turn !== this.#turn) {
      this.#turn = turn;
      this.#declaredAttacker = null;
      this.#attackSeen = true;
      this.#deadAttackers.clear();
      if (this.#turnPlayer === this.seat) { this.#idleActions = 0; this.#activatedThisTurn.clear(); this.#allIn = false; }
    }
    this.#board = (this.#vision && this.#peek ? boardFromState(this.#peek(), this.seat, true) : null) ?? boardFromView(sel, this.seat) ?? this.#board;
    if (turn !== this.#heldTurn) {
      this.#heldTurn = turn;
      this.#heldBefore = new Set((this.#me()?.mzone ?? []).flatMap((c, i) => (c && c.owner !== undefined && c.owner !== c.controller ? [`${i}:${c.code}`] : [])));
    }
  }

  /** Copies another player's per-turn bookkeeping (a rollout pilot continuing the live player's turn). */
  copyTurnState(from: HeuristicBot): void {
    this.#turn = from.#turn;
    this.#idleActions = from.#idleActions;
    this.#summonMaterialCount = from.#summonMaterialCount;
    this.#activatedThisTurn = new Set(from.#activatedThisTurn);
    this.#chainedThisWindow = new Set(from.#chainedThisWindow);
    this.#allIn = from.#allIn;
    this.#lentTurn = from.#lentTurn;
    this.#attackSeen = from.#attackSeen;
    this.#deadAttackers = new Set(from.#deadAttackers);
    this.#attack = from.#attack;
    this.#chainTop = from.#chainTop;
    this.#links = from.#links.map((l) => ({ ...l, targets: [...l.targets] }));
    this.#hint = from.#hint;
    this.#lastActivated = from.#lastActivated;
    this.#oppSummonAtk = from.#oppSummonAtk;
    this.#oppSummonSeq = from.#oppSummonSeq;
    this.#solving = from.#solving;
    this.#stacking = from.#stacking;
    this.#standbys = new Map(from.#standbys);
    this.#msgTurnPlayer = from.#msgTurnPlayer;
    this.#equips = new Map(from.#equips);
    this.#heldBefore = new Set(from.#heldBefore);
    this.#heldTurn = from.#heldTurn;
  }

  /** The value of a duelcore `state` from this seat (masked for it unless spy): evaluate(), counting what the
   *  opponent's next Battle Phase would take (a rollout ends with the NPC's own turn: that reply comes next). */
  valueOf(state: Json): number {
    const b = boardFromState(state, this.seat, this.#vision);
    if (b) this.#board = b;
    const p = this.#boardPosition();
    return this.#style.light ? evaluate(p) : valueWithReply(p, this.#planOpts().replyWeight);
  }

  /** Bookkeeping for a response injected into a rollout instead of chosen by this pilot (the follow-up target choice
   *  of an injected attack must know the attacker). */
  applyExternalResponse(ev: Prompt, r: Json): void {
    const index = typeof r.index === "number" ? r.index : -1;
    if (ev.kind === "selectBattleCmd") {
      if (r.action === "SELECT_BATTLE") {
        const a = ev.attackable[index];
        if (a) { this.#declaredAttacker = a; this.#attackSeen = false; this.#pendingAttacker = this.#me()?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk; }
      } else if (r.action === "SELECT_CHAIN") {
        const a = ev.activatable[index];
        if (a) { this.#activatedThisTurn.add(`b:${a.code}:${a.location}:${a.sequence}:${a.description}`); this.#activated(a.code); }
      }
    } else if (ev.kind === "selectIdleCmd") {
      if (r.action !== "TO_BP" && r.action !== "TO_EP") this.#idleActions++;
      if (r.action === "SELECT_ACTIVATE") {
        const a = ev.activatable[index];
        if (a) { this.#activatedThisTurn.add(`${a.code}:${a.location}:${a.sequence}:${a.description}`); this.#activated(a.code); }
      }
    } else if (ev.kind === "selectEffectYN" && r.yes === true) {
      this.#activatedThisTurn.add(this.#effKey(ev));
    } else if (ev.kind === "selectChain" && index >= 0) {
      const c = ev.chains[index];
      if (c) { this.#chainedThisWindow.add(`${c.code}:${c.description}`); this.#activated(c.code); }
    }
  }

  /** My Standby Phase: one more for each face-up Spell/Trap card of mine (the board of my last decision), the rest forgotten. */
  #countStandby(): void {
    const next = new Map<string, number>();
    this.#me()?.szone.forEach((c, i) => {
      if (!c || !c.code || isFaceDown(c.position)) return;
      const key = `${i}:${c.code}`;
      next.set(key, (this.#standbys.get(key) ?? 0) + 1);
    });
    this.#standbys = next;
  }

  /** Spell / trap zone `sequence` of `controller` holds a link of the chain that leaves the field as it resolves:
   *  destroying it does nothing (an opponent's resolving Mystical Space Typhoon is not backrow worth a card). */
  #spent(controller: number, sequence: number): boolean {
    return this.#links.some((l) => l.controller === controller && (l.location & LOCATION.SZONE) !== 0 && l.sequence === sequence
      && ((this.#cards.brain.get(l.code)?.type ?? 0) & LASTING) === 0);
  }

  /** A card that negates an activation (a counter trap, Seven Tools...): its link cancels the link below it. */
  #negates(code: number): boolean {
    const k = this.#cards.brain.get(code);
    return !!k && ((k.type & TYPE_COUNTER) !== 0 || (k.has("negate") && !k.has("on_attack")));
  }

  /** The opponent's links that will still resolve: a link negated by the one above it (itself not negated) is gone. */
  #liveOppLinks(): ChainLink[] {
    const out: ChainLink[] = [];
    let negated = false;
    for (let i = this.#links.length - 1; i >= 0; i--) {
      const l = this.#links[i]!, below = this.#links[i - 1];
      if (!negated && l.controller !== this.seat) out.push(l);
      // this link (alive) cancels the one below it when they are opposing players'
      negated = !negated && l.negates && !!below && below.controller !== l.controller;
    }
    return out;
  }

  /** A set card of ours the opponent's chain is about to take (and not one whose effect would leave with it). */
  #isDoomed(c: CardRef): boolean {
    if (c.controller !== this.seat || (c.location & LOCATION.SZONE) === 0) return false;
    if (((this.#cards.brain.get(c.code)?.type ?? 0) & LASTING) !== 0) return false;
    const key = `${c.location}:${c.sequence}`;
    return this.#liveOppLinks().some((l) => l.clears || l.targets.includes(key));
  }

  /** Bookkeeping for a card this seat activates: what a following target pick belongs to. */
  #activated(code: number): void {
    this.#lastActivated = code;
    const k = this.#cards.brain.get(code);
    if (k && k.has("control") && (k.descTemporal || LENDS.test(this.#nameOf(code)))) this.#lentTurn = this.#turn;
  }

  // ---- combo planner ----------------------------------------------------------------------------------------------
  #nameOf(code: number): string { return this.#cards.name(code); }

  /** This NPC's combo state (by card name over hand + field), or null without a plan or with the payoff already out. */
  #comboState(): ComboState | null {
    const plan = this.#combo, me = this.#me();
    if (!plan || !me) return null;
    if (me.mzone.some((c) => c && this.#nameOf(c.code) === plan.fusion)) return null;
    const hand = me.hand.map((c) => this.#nameOf(c));
    const field = me.mzone.filter(Boolean).map((c) => this.#nameOf(c!.code));
    const pieces = [...hand, ...field].filter((n) => plan.pieces.includes(n)).length;
    const haveAssembler = hand.includes(plan.assembler);
    return { plan, pieces, ready: haveAssembler && pieces >= plan.need, haveEnabler: !!plan.graveEnabler && hand.includes(plan.graveEnabler) };
  }

  #comboPayoffLive(): boolean {
    const plan = this.#combo, me = this.#me();
    return !!plan && !!me && me.mzone.some((c) => c && this.#nameOf(c.code) === plan.fusion);
  }

  /** A declared combo outranks the search: the scalar evaluation cannot see a combo's continuous pressure. */
  #hasForcedComboAction(ev: P<"selectIdleCmd">): boolean {
    const plan = this.#combo;
    if (!plan) return false;
    const offered = new Set(ev.activatable.map((a) => this.#nameOf(a.code)));
    if (this.#comboState()?.ready && offered.has(plan.assembler)) return true;
    return this.#comboPayoffLive() && !!plan.afterPayoff?.some((name) => offered.has(name));
  }

  // ---- board helpers ----------------------------------------------------------------------------------------------
  #me(): PlayerBoard | null { return this.#board?.players[this.seat] ?? null; }
  #opp(): PlayerBoard | null { return this.#board?.players[1 - this.seat] ?? null; }
  #stat(code: number) { return this.#cards.stat(code); }
  /** Its attack bounces its target (BOUNCE_ATTACKER). */
  #bounces(code: number): boolean { return !!code && BOUNCE_ATTACKER.test(this.#nameOf(code)); }
  /** A monster set for its flip: a FLIP monster, or one whose effect only its Flip Summon triggers (Swarm of Locusts). */
  #isFlip(code: number): boolean { return !!code && (!!this.#cards.brain.get(code)?.is_flip || FLIP_SUMMON.has(code)); }

  /** The monster in this zone cannot be destroyed by battle: by its own text, or by a face-up Equip Spell on it
   *  (Gladiator Beast's Battle Manica: production attacked a Secutor wearing one three times). */
  /** The battle under way: the opponent's monster in it is not destroyed by it (battle-proof, or not beaten). */
  #oppBattlerSurvives(): boolean {
    const me = this.#me(), opp = this.#opp(), foe = 1 - this.seat;
    const at = (seq: number | null | undefined) => (seq === null || seq === undefined ? null : opp?.mzone[seq] ?? null);
    if (this.#turnPlayer !== this.seat && this.#attack) {
      const t = at(this.#attack.sequence), guard = this.#attack.target === null ? null : me?.mzone[this.#attack.target];
      if (!t || !guard || this.#battleProofAt(foe, this.#attack.sequence, t.code)) return true;
      return (guard.position & POS.DEFENSE) !== 0 || (guard.attack ?? 0) <= (t.attack ?? 0);
    }
    if (this.#turnPlayer === this.seat && this.#myAttack && this.#myAttack.target !== null) {
      const t = at(this.#myAttack.target), mine = me?.mzone[this.#myAttack.sequence];
      if (!t || !mine || this.#battleProofAt(foe, this.#myAttack.target, t.code)) return true;
      const value = (t.position & POS.DEFENSE) !== 0 ? t.defense ?? 0 : t.attack ?? 0;
      return (mine.attack ?? 0) <= value;
    }
    return false;
  }

  /** A monster of mine wears an equip whose ATK counts my Spell/Trap cards (Mage Power): set them before attacking. */
  #backrowBoosts(): boolean {
    const b = this.#board;
    if (!b) return false;
    for (const [at, on] of this.#equips) {
      const [who, zone] = at.split(":").map(Number) as [number, number];
      const e = b.players[who]?.szone[zone];
      if (who === this.seat && on.startsWith(`${this.seat}:`) && e && e.code && !isFaceDown(e.position) && COUNTS_BACKROW.test(this.#nameOf(e.code))) return true;
    }
    return false;
  }

  #battleProofAt(controller: number, seq: number, code: number): boolean {
    if (code && BATTLE_PROOF.has(code)) return true;
    const b = this.#board;
    if (!b) return false;
    for (const [at, on] of this.#equips) {
      if (on !== `${controller}:${seq}`) continue;
      const [who, zone] = at.split(":").map(Number) as [number, number];
      const e = b.players[who]?.szone[zone];
      if (e && e.code && !isFaceDown(e.position) && BATTLE_PROOF_EQUIP.has(e.code)) return true;
    }
    return false;
  }

  /** A player's monsters with their current stats. A masked face-down has unknown stats (known = false). */
  #monstersOf(p: PlayerBoard | null): OppMon[] {
    if (!p) return [];
    const out: OppMon[] = [];
    const who = p === this.#me() ? this.seat : 1 - this.seat;
    p.mzone.forEach((c, seq) => {
      if (!c) return;
      const faceDown = isFaceDown(c.position);
      out.push({
        seq, code: c.code, level: c.level ?? (c.code ? this.#stat(c.code).level : 0), atk: c.attack ?? 0, def: c.defense ?? 0, faceDown,
        battleProof: this.#battleProofAt(who, seq, c.code), afterlife: c.code ? afterlife(c.code) : 0,
        attackPos: (c.position & POS.ATTACK) !== 0 && !faceDown,
        known: !faceDown || c.code !== 0,
        flipRisk: faceDown ? (c.code ? this.#cards.flipRisk(c.code) : 300) : 0,
        // lent by this turn's Brain Control (not a monster I already held when the turn began: a Creature Swap)
        stolen: c.owner !== undefined && c.owner !== c.controller && this.#lentTurn === this.#turn && !(who === this.seat && this.#heldBefore.has(`${seq}:${c.code}`)),
        noAttack: false,
        battleTrigger: !!c.code && BATTLE_TRIGGER.has(c.code),
        revenge: !!c.code && REVENGE.has(c.code),
        effectThreat: this.#readyRemovalValue(c, who),
      });
    });
    const locks = this.#faceUpLocks();
    if (locks.size > 0) for (const m of out) m.noAttack = this.#attackLocked(m, p === this.#me() ? this.seat : 1 - this.seat, locks);
    return out;
  }

  /** A face-up attack-position Lyla can take a backrow card next Main Phase. Count that visible
   * threat when comparing an equal-ATK trade; never inspect an opposing set card's identity. */
  #readyRemovalValue(c: BoardCard, who: number): number {
    if (isFaceDown(c.position) || !(c.position & POS.ATTACK) || this.#nameOf(c.code) !== "lyla, lightsworn sorceress") return 0;
    if (this.#board?.players.some(p => p.szone.some(s => s && !isFaceDown(s.position) && this.#nameOf(s.code) === "skill drain"))) return 0;
    return this.#board?.players[1 - who]?.szone.some(Boolean) ? 1000 : 0;
  }

  /** The battle locks face-up on the field, by name, with the player who controls each. */
  #faceUpLocks(): Map<string, Set<number>> {
    const out = new Map<string, Set<number>>();
    this.#board?.players.forEach((p, who) => {
      for (const c of p.szone) {
        if (!c || !c.code || isFaceDown(c.position)) continue;
        const n = this.#nameOf(c.code);
        if (!ATTACK_LOCKS.test(n)) continue;
        if (!out.has(n)) out.set(n, new Set());
        out.get(n)!.add(who);
      }
    });
    return out;
  }

  /** A face-up lock stops this monster (controlled by `owner`) attacking: Nightmare's Steelcage (everyone), Messenger
   *  of Peace (1500 ATK or more), Gravity Bind (Level 4 or more), Level Limit - Area B (Level 4 or more: kept in
   *  defence), the opponent's Swords of Revealing Light. A set monster's Level is unknown: it may attack. */
  #attackLocked(m: { atk: number; level: number; faceDown: boolean }, owner: number, locks = this.#faceUpLocks()): boolean {
    if (locks.has("nightmare's steelcage")) return true;
    if ([...(locks.get("swords of revealing light") ?? [])].some((who) => who !== owner)) return true;
    if (m.faceDown) return false;
    if (locks.has("messenger of peace") && m.atk >= 1500) return true;
    return (locks.has("gravity bind") || locks.has("level limit - area b")) && m.level >= 4;
  }

  /** How many of the opponent's set cards are KNOWN board/attack answers (spy vision only: 0 otherwise). */
  #threatSetCount(): number {
    if (!this.#vision) return 0;
    const opp = this.#opp();
    if (!opp) return 0;
    return opp.szone.filter((c) => c && isFaceDown(c.position) && c.code && THREAT_BACKROW.test(this.#nameOf(c.code))).length;
  }
  #oppMonsters(): OppMon[] { return this.#monstersOf(this.#opp()); }
  #maxAttackAtk(mon: OppMon[]): number { return mon.reduce((m, o) => (o.attackPos && o.atk > m ? o.atk : m), 0); }
  #oppMaxAtk(): number { return this.#maxAttackAtk(this.#oppMonsters()); }

  // ---- card rules -------------------------------------------------------------------------------------------------
  /** The card's rule: its named rule over the rule from its type and tags, field by field. */
  #ruleFor(code: number): CardRule | undefined {
    if (!code) return undefined;
    let r = TAG_RULES.get(code);
    if (r === undefined) { r = tagRule(this.#cards.brain.get(code)) ?? null; TAG_RULES.set(code, r); }
    const named = this.#rules[this.#nameOf(code)];
    return named ? (r ? { ...r, ...named } : named) : r ?? undefined;
  }

  /** Index of the backrow worth setting: a trap or a quick-play spell (a set normal spell does nothing), or -1. */
  #spellToSet(ev: P<"selectIdleCmd">): number {
    let quick = -1;
    // the last free zone stays free for a spell in hand that needs it (production filled it with a second "A" Cell
    // Scatter Burst and held Brain Control, Heavy Storm and its Field Spell for 28 turns); a second copy of a set card
    // waits while zones are short
    const me = this.#me();
    const free = me ? me.szone.slice(0, 5).filter((c) => !c).length : 5;
    const handSpell = !!me && me.hand.some((c) => { const t = this.#cards.brain.get(c)?.type ?? 0; return (t & TYPE_SPELL) !== 0 && (t & (TYPE_QUICKPLAY | TYPE_FIELD)) === 0 && !neverSet(c); });
    if (free <= 1 && handSpell && (me?.hand.length ?? 0) < 7) return -1;
    // a last card in hand that only repeats a card already on my field stays there while a set card needs a discard to
    // work (production set a second Macro Cosmos, and its Divine Wrath could not answer)
    const keepFodder = !!me && me.hand.length <= 1 && me.szone.some((c) => c && c.code && isFaceDown(c.position) && DISCARD_COST.test(this.#nameOf(c.code)));
    const setCodes = new Set(me ? me.szone.filter((c): c is BoardCard => !!c && isFaceDown(c.position)).map((c) => c.code) : []);
    for (let i = 0; i < ev.spellSet.length; i++) {
      if (free <= 2 && setCodes.has(ev.spellSet[i]!.code)) continue;
      if (keepFodder && me!.szone.some((c) => c && c.code === ev.spellSet[i]!.code)) continue;
      const t = this.#cards.brain.get(ev.spellSet[i]!.code)?.type ?? 0;
      // not into a face-up Royal Decree / Jinzo (a port choice: Master Duel's set routine has no lock check), and never a
      // card dead in hand (the Spirit Messages, the Sarcophagi: Master Duel never sets them on their own)
      if (this.#locked(ev.spellSet[i]!.code) || neverSet(ev.spellSet[i]!.code)) continue;
      if (t & TYPE_TRAP) return i;
      if (quick < 0 && (t & TYPE_QUICKPLAY)) quick = i;
    }
    return quick;
  }

  /** The activation a card rule asks for now (its idleActivate is true, its priority > 0), the highest priority first. */
  #ruledActivation(ev: P<"selectIdleCmd">): Json | null {
    const ctx = this.#ctx();
    let best = -1, priority = 0;
    ev.activatable.forEach((a, i) => {
      if (!this.#ruleFor(a.code)?.idleActivate || this.#activatedThisTurn.has(`${a.code}:${a.location}:${a.sequence}:${a.description}`)) return;
      const p = this.#idlePriority(a.code, ctx, a, { prompt: ev, resp: respIdle("SELECT_ACTIVATE", i) });
      if (p > priority) { priority = p; best = i; }
    });
    if (best < 0) return null;
    const a = ev.activatable[best]!;
    this.#activatedThisTurn.add(`${a.code}:${a.location}:${a.sequence}:${a.description}`);
    this.#activated(a.code);
    return respIdle("SELECT_ACTIVATE", best);
  }

  /** A contact fusion spends actual field bodies; being summonable is not evidence that it pays.
   * Fortress should absorb opposing Machines or improve our combat, not turn 2100 + 1200 into 2000. */
  #specialSummonAllowed(ev: P<"selectIdleCmd">, index: number, ctx: RuleCtx): boolean {
    const c = ev.spSummonable[index]!;
    if (this.#ruleFor(c.code)?.specialSummon?.(ctx) === false) return false;
    if (this.#nameOf(c.code) !== "chimeratech fortress dragon") return true;
    const machines = (p: PlayerBoard | null) => this.#monstersOf(p).filter(m => ((this.#cards.brain.get(m.code)?.race ?? 0) & 0x20) !== 0);
    if (machines(this.#opp()).some(m => !m.faceDown)) return true;
    if (this.#search && this.#sel) return this.#whatIf({ prompt: ev, resp: respIdle("SELECT_SPECIAL_SUMMON", index) }).gain > 0;
    // The no-search rollout pilot uses the same combat test with the minimum two own materials.
    const input = this.#planInput(), own = machines(this.#me());
    for (const cyber of own.filter(m => this.#nameOf(m.code) === "cyber dragon" || (!m.faceDown && this.#nameOf(m.code) === "proto-cyber dragon"))) {
      for (const other of own.filter(m => m.seq !== cyber.seq)) {
        const kept = input.my.filter(m => m.seq !== cyber.seq && m.seq !== other.seq);
        const fused: PlanMon = { seq: cyber.seq, atk: 2000, def: 0, faceDown: false, attackPos: true, known: true };
        const after = { ...input, my: [...kept, fused], attackers: [...input.attackers.filter(a => a.seq !== cyber.seq && a.seq !== other.seq),
          { index: cyber.seq, seq: cyber.seq, atk: 2000, canDirect: false }] };
        if (tradeValue(after) > tradeValue(input) + 200) return true;
      }
    }
    return false;
  }

  /** A Special Summon a card rule asks for now (its specialSummon is true and its idlePriority > 0: Lava Golem onto the
   *  opponent's field under my own lock), made before the search weighs the turn. */
  #ruledSpecialSummon(ev: P<"selectIdleCmd">): Json | null {
    const ctx = this.#ctx();
    const i = ev.spSummonable.findIndex((c, index) => { const r = this.#ruleFor(c.code); return this.#specialSummonAllowed(ev, index, ctx) && !!r?.specialSummon && (r.idlePriority ?? 0) > 0 && r.specialSummon(ctx); });
    return i >= 0 ? respIdle("SELECT_SPECIAL_SUMMON", i) : null;
  }

  /** My Battle Phase ahead, the opponent's field empty and my Normal Summon unused: the summon that hits now (production
   *  ended its turn holding a 2200 attacker over an empty field, twice). */
  #freeDamageSummon(ev: P<"selectIdleCmd">): Json | null {
    if (!ev.canBattlePhase || !this.#battleAhead() || this.#normalSummoned || this.#oppMonsters().length > 0) return null;
    const play = this.#summonPlays(ev, this.#ctx())[0];
    if (play && play.cmd === "SELECT_SUMMON" && play.stat >= 1000) return respIdle(play.cmd, play.index);
    // nothing of theirs on the field at all: a body that hits is summoned even where the ranking would set it
    // (production set Warrior Lady of the Wasteland facing an empty field and backrow)
    if (this.#opp()?.szone.some((c) => c) ?? true) return null;
    let best = -1, atk = 999;
    ev.summonable.forEach((c, i) => {
      const k = this.#cards.brain.get(c.code);
      if (!k || k.tributes() > 0 || this.#isFlip(c.code) || this.#ruleFor(c.code)?.keepInHand || this.#locked(c.code)) return;
      const a = this.#normalSummonStats(c.code).atk;
      if (a > atk) { atk = a; best = i; }
    });
    return best >= 0 ? respIdle("SELECT_SUMMON", best) : null;
  }

  /** My Battle Phase ahead, not lethal yet, and a card its rule holds (an equip, a boost) that wins the duel this turn
   *  when played out on the engine: play it (production held Megamorph on Etoile Cyber: 3100 direct damage against
   *  2400 LP). A few rollouts, once per board. */
  #lethalProbe(ev: P<"selectIdleCmd">, sel: Json): Json | null {
    if (!ev.canBattlePhase || !this.#battleAhead() || this.#probed === `${this.#turn}:${this.#idleActions}`) return null;
    this.#probed = `${this.#turn}:${this.#idleActions}`;
    const mine = this.#monstersOf(this.#me()).filter((m) => m.attackPos && !m.faceDown);
    const reach = mine.reduce((s, m) => s + m.atk, 0);
    if (mine.length === 0 || (this.#opp()?.lp ?? 8000) > 2 * reach + 1000 || this.#lethalInfo().through) return null;
    const ctx = this.#ctx();
    let probes = 0;
    for (const [i, a] of ev.activatable.entries()) {
      if (probes >= 3) break;
      if (!((this.#cards.brain.get(a.code)?.type ?? 0) & TYPE_SPELL) || this.#activatedThisTurn.has(`${a.code}:${a.location}:${a.sequence}:${a.description}`)) continue;
      const resp = respIdle("SELECT_ACTIVATE", i);
      if (this.#locked(a.code) || this.#idlePriority(a.code, ctx, a, { prompt: ev, resp }) > -Infinity) continue;
      probes++;
      if ((rolloutScore(this.#search!, this.seat, sel, ev, resp, this) ?? 0) < 1e9) continue;
      this.#activatedThisTurn.add(`${a.code}:${a.location}:${a.sequence}:${a.description}`);
      this.#activated(a.code);
      return resp;
    }
    return null;
  }

  /** Before my Battle Phase with my Normal Summon unused: the summon whose battle (and the reply to it) comes out clearly
   *  better than going in without it (production went to battle with three Diamond Dudes in hand next to an 800 ATK
   *  Summoner Monk facing a lone Brron, and later had nothing on the field). */
  #battleSummon(ev: P<"selectIdleCmd">): Json | null {
    if (!ev.canBattlePhase || !this.#battleAhead() || this.#normalSummoned || this.#oppMonsters().length === 0) return null;
    const play = this.#summonPlays(ev, this.#ctx())[0];
    // a real attacker, clearly better (a weak body thrown in beside the search's choice lost lab duels)
    if (!play || play.trade === undefined || play.cmd !== "SELECT_SUMMON" || play.stat < 1400) return null;
    return play.trade > this.#tradeWith(new Set()) + 600 ? respIdle(play.cmd, play.index) : null;
  }

  /** Ending the turn over the hand size: the best card I can set goes to the field instead of the graveyard (production
   *  discarded Messenger of Peace with three empty zones). */
  #setOverHandLimit(ev: P<"selectIdleCmd">): Json | null {
    const me = this.#me();
    if (!me || me.hand.length <= 6 || ev.spellSet.length === 0) return null;
    let best = -1, worth = -Infinity;
    ev.spellSet.forEach((c, i) => {
      if (neverSet(c.code) || this.#locked(c.code)) return;
      const w = this.#worth(c.code, true);
      if (w > worth) { worth = w; best = i; }
    });
    return best >= 0 ? respIdle("SELECT_SPELL_SET", best) : null;
  }

  /** -Infinity = a rule says HOLD. Positive values are pre-development plays. */
  #idlePriority(code: number, ctx: RuleCtx, ref?: CardRef, action?: Action): number {
    const name = this.#nameOf(code);
    if (this.#locked(code)) return -Infinity;
    if (this.#combo?.afterPayoff?.includes(name) && !this.#comboPayoffLive()) return -Infinity;
    const rule = this.#ruleFor(code);
    if (rule?.idleActivate && !rule.idleActivate(this.#withSelf(ctx, code, ref, action))) return -Infinity;
    // a Field Spell already face-up on our field: a second copy only replaces it (production: Luminous Spark over Luminous
    // Spark); the face-up one's own effect is not a copy (production never used Mausoleum of the Emperor's summon)
    const fromField = !!ref && ref.controller === this.seat && (ref.location & LOCATION.SZONE) !== 0;
    if (!fromField && ((this.#cards.brain.get(code)?.type ?? 0) & TYPE_FIELD) && this.#me()?.szone.some((c) => c && c.code === code && !isFaceDown(c.position))) return -Infinity;
    return rule?.idlePriority ?? 0;
  }

  /** The board a card rule reasons over. Built once per decision. */
  #ctx(): RuleCtx {
    const me = this.#me(), opp = this.#opp();
    const myMon = this.#monstersOf(me), oppMon = this.#monstersOf(opp);
    const hit = new Set(this.#liveOppLinks().flatMap((l) => l.targets));
    const lethal = this.#lethalInfo();
    const toRule = (o: OppMon, mine: boolean): RuleMon => ({ atk: o.atk, def: o.def, faceDown: o.faceDown, attackPos: o.attackPos, level: o.level,
      fusion: !!o.code && ((this.#cards.brain.get(o.code)?.type ?? 0) & TYPE_FUSION) !== 0, chainHit: mine && hit.has(`${LOCATION.MZONE}:${o.seq}`),
      blocksLethal: !mine && lethal.blockers.has(o.seq) });
    const backrow = (p: PlayerBoard | null): number => (p ? p.szone.filter((c, i) => c && !this.#spent(p === me ? this.seat : 1 - this.seat, i)).length : 0);
    const graveMaxAtk = (p: PlayerBoard | null): number => (p ? p.grave.reduce((m, c) => Math.max(m, this.#stat(c).atk), 0) : 0);
    const attacker = this.#attack && this.#turnPlayer !== this.seat ? opp?.mzone[this.#attack.sequence] : null;
    const attackAtk = attacker && !isFaceDown(attacker.position) ? Math.max(1, attacker.attack ?? 0) : 0;
    const guard = attackAtk > 0 && this.#attack!.target !== null ? me?.mzone[this.#attack!.target] : null;
    return {
      myLp: me?.lp ?? 8000, oppLp: opp?.lp ?? 8000,
      myMon: myMon.map((o) => toRule(o, true)), oppMon: oppMon.map((o) => toRule(o, false)),
      myMaxAtk: this.#maxAttackAtk(myMon), oppMaxAtk: this.#maxAttackAtk(oppMon),
      myBackrow: backrow(me), oppBackrow: backrow(opp),
      myGraveMaxAtk: graveMaxAtk(me), oppGraveMaxAtk: graveMaxAtk(opp),
      oppHand: opp?.hand.length ?? 0,
      myNames: me ? me.mzone.flatMap((c) => (c && c.code && !isFaceDown(c.position) ? [this.#nameOf(c.code)] : [])) : [],
      myHand: me?.hand.length ?? 0,
      myHandTributes: me ? me.hand.filter((c) => { const k = this.#cards.brain.get(c); return !!k && k.tributes() > 0; }).length : 0,
      myRemoved: me ? me.removed.filter((c) => ((this.#cards.brain.get(c)?.type ?? 0) & TYPE_MONSTER) !== 0).length : 0,
      myTurn: this.#turnPlayer === this.seat,
      oppEndPhase: this.#turnPlayer !== this.seat && this.#board?.phase === PHASE.END,
      attackAtk, attackLethal: attackAtk > 0 && attackAtk >= (me?.lp ?? 8000) && (this.#attack!.direct || myMon.length === 0),
      attackOnDefense: !!guard && (guard.position & POS.DEFENSE) !== 0,
      oppChained: this.#chainTop !== null && this.#chainTop !== this.seat,
      ext: { ...this.#ctxExt(myMon, oppMon, attackAtk, guard ?? null), lethalThrough: lethal.through },
      zones: this.#zones(),
    };
  }

  /** My cards by zone, as names (the rules' named-card operators); the Deck is my deck list less every copy seen. */
  #zones(): RuleZones {
    const me = this.#me(), opp = this.#opp();
    const names = (codes: number[]) => codes.filter(Boolean).map((c) => this.#nameOf(c));
    const field = me ? [...me.mzone, ...me.szone].filter((c): c is BoardCard => !!c && !!c.code).map((c) => c.code) : [];
    const seen = [...(me?.hand ?? []), ...field, ...(me?.grave ?? []), ...(me?.removed ?? [])].filter(Boolean);
    const deck = [...this.#deckList];
    for (const c of seen) { const i = deck.indexOf(c); if (i >= 0) deck.splice(i, 1); }
    const fieldSpells = [me?.szone[5], opp?.szone[5]].filter((c): c is BoardCard => !!c && !!c.code && !isFaceDown(c.position)).map((c) => this.#nameOf(c.code));
    return { hand: names(me?.hand ?? []), deck: names(deck), field: names(field), grave: names(me?.grave ?? []), fieldSpells };
  }

  /** On my turn before my battle is over: are my attacks lethal on this board (the battle plan, set cards aside), and
   *  which opponent's monster alone stands in the way (removing it makes them lethal)? */
  #lethalInfo(): { through: boolean; blockers: Set<number> } {
    const none = { through: false, blockers: new Set<number>() };
    const phase = this.#board?.phase ?? 0;
    if (this.#turnPlayer !== this.seat || !(phase >= PHASE.MAIN1 && phase < PHASE.MAIN2)) return none;
    const base = this.#battlePosition();
    const me = this.#me(), opp = this.#opp();
    const my: PlanMon[] = this.#monstersOf(me).map((m, i) => ({ ...base.myMon[i]!, seq: m.seq }));
    const theirs: PlanMon[] = this.#monstersOf(opp).map((m, i) => ({ ...base.oppMon[i]!, seq: m.seq }));
    const attackers: PlanAttacker[] = my.filter((m) => m.attackPos && !m.faceDown).map((m, index) => ({ index, seq: m.seq, atk: m.atk, canDirect: DIRECT.has(me?.mzone[m.seq]?.code ?? 0) }));
    if (attackers.length === 0) return none;
    const opts = { ...PLAN_DEFAULTS, reply: false, maxNodes: 3000 };
    const lethalWith = (o: PlanMon[]) => planBattle({ base, my, opp: o, attackers }, opts).outcome.lethal;
    if (lethalWith(theirs)) return { through: true, blockers: new Set() };
    const blockers = new Set<number>();
    if (theirs.length <= 5) for (const t of theirs) if (lethalWith(theirs.filter((x) => x !== t))) blockers.add(t.seq);
    return { through: false, blockers };
  }

  /** The board facts beyond the core RuleCtx (ruleCtxExt.ts). */
  #ctxExt(myMon: OppMon[], oppMon: OppMon[], attackAtk: number, guard: BoardCard | null): RuleCtxExt {
    const me = this.#me(), opp = this.#opp(), b = this.#board;
    if (!me || !opp || !b) return {};
    const type = (code: number): number => this.#cards.brain.get(code)?.type ?? 0;
    const myTurn = this.#turnPlayer === this.seat, phase = b.phase;
    const battlePhase = phase > PHASE.MAIN1 && phase < PHASE.MAIN2;
    const faceUpST = (p: PlayerBoard, who: number) => p.szone.filter((c, i) => c && !isFaceDown(c.position) && !this.#spent(who, i));
    // the standing on the field (Konami's battle outlook): hands and set cards aside
    const value = evaluate({ ...this.#boardPosition(), myHand: 0, myBackrow: 0 });
    const live = this.#liveOppLinks();
    const top = live[0] && live[0] === this.#links[this.#links.length - 1] ? live[0] : undefined;
    const keys = new Set(live.flatMap((l) => l.targets));
    const clears = live.some((l) => l.clears);
    let threat = 0, hits = 0, hitsBackrow = clears && me.szone.some(Boolean);
    // what a non-targeting link takes too (Raigeki, Dark Hole, Mirror Force: my monsters; Heavy Storm: my backrow)
    const nukes = live.some((l) => { const k = this.#cards.brain.get(l.code); return !!k && (k.has("nuke_opp") || k.has("nuke_all")); });
    const storms = clears || live.some((l) => { const k = this.#cards.brain.get(l.code); return !!k && (k.has("storm_opp") || k.has("storm_all")); });
    me.mzone.forEach((c, i) => { if (c && (nukes || keys.has(`${LOCATION.MZONE}:${i}`))) { threat += c.attack ?? 0; hits++; } });
    me.szone.forEach((c, i) => { if (c && (storms || keys.has(`${LOCATION.SZONE}:${i}`))) { threat += 1000; hits++; hitsBackrow = true; } });
    const handMon = me.hand.filter((c) => (type(c) & TYPE_MONSTER) !== 0);
    const costs = this.#costView();
    const spare = expendable(costs);
    const isMon = (c: number) => (type(c) & TYPE_MONSTER) !== 0;
    const maxAtk = (codes: number[]) => codes.filter(isMon).reduce((m, c) => Math.max(m, this.#stat(c).atk), 0);
    const effectMon = (p: PlayerBoard) => p.mzone.filter((c) => c && c.code && !isFaceDown(c.position) && (type(c.code) & TYPE_EFFECT) !== 0).length;
    const swinging = myMon.filter((m) => m.attackPos).reduce((n, m) => n + m.atk, 0);
    const oppAttack = !myTurn && this.#attack ? opp.mzone[this.#attack.sequence] : null;
    const guardValue = guard ? ((guard.position & POS.DEFENSE) !== 0 ? guard.defense ?? 0 : guard.attack ?? 0) : 0;
    const incoming = attackAtk <= 0 ? 0 : !guard ? attackAtk : (guard.position & POS.DEFENSE) !== 0 ? 0 : Math.max(0, attackAtk - (guard.attack ?? 0));
    return {
      myDeck: me.deckCount, oppDeck: opp.deckCount, chainLen: this.#links.length,
      boardEdge: Math.round(value), outlook: Math.max(-4, Math.min(4, Math.round(value / 1500))),
      oppFaceUpBackrow: faceUpST(opp, 1 - this.seat).length,
      oppFaceUpSpells: faceUpST(opp, 1 - this.seat).filter((c) => (type(c!.code) & TYPE_SPELL) !== 0).length,
      mySetBackrow: me.szone.filter((c) => c && isFaceDown(c.position)).length,
      myFreeStZones: me.szone.slice(0, 5).filter((c) => !c).length,
      oppFreeZones: opp.mzone.slice(0, 5).filter((c) => !c).length,
      myHandMonsters: handMon.length, myHandSpare: spare, myHandMaxMonAtk: maxAtk(handMon),
      myGraveMonsters: me.grave.filter(isMon).length, myGraveSpells: me.grave.filter((c) => (type(c) & TYPE_SPELL) !== 0).length,
      oppGraveMonsters: opp.grave.filter(isMon).length,
      myBanishedMaxAtk: maxAtk(me.removed), oppRemoved: opp.removed.filter(isMon).length, oppRemovedMaxAtk: maxAtk(opp.removed),
      myEffectMon: effectMon(me), oppEffectMon: effectMon(opp),
      oppChainThreat: threat, oppChainHitsMine: hits,
      oppSummonAtk: this.#summonedAtk(),
      incomingDamage: incoming,
      myBattlerAtk: oppAttack && guard ? guard.attack ?? 0 : myTurn && this.#myAttack ? me.mzone[this.#myAttack.sequence]?.attack ?? 0 : 0,
      oppBattlerValue: oppAttack ? attackAtk : myTurn && this.#myAttack && this.#myAttack.target !== null ? (() => {
        const t = opp.mzone[this.#myAttack!.target!];
        return !t ? 0 : isFaceDown(t.position) ? UNKNOWN_WALL : (t.position & POS.DEFENSE) !== 0 ? t.defense ?? 0 : t.attack ?? 0;
      })() : 0,
      // (no Battle Phase on the duel's first turn: production equipped Mage Power going first)
      preBattle: myTurn && (phase === PHASE.MAIN1 || battlePhase) && this.#turn > 1,
      afterBattle: myTurn && phase === PHASE.MAIN2,
      inBattle: battlePhase && (myTurn ? !!this.#declaredAttacker : !!this.#attack),
      oppStandby: !myTurn && phase === PHASE.STANDBY,
      discardFodder: canPay(costs, { safe: this.#safePayment() }),
      cheapTribute: myMon.some((m) => m.stolen || Math.max(m.atk, m.def) < 1200),
      myFieldSpell: !!me.szone[5] && !isFaceDown(me.szone[5]!.position),
      myLockActive: me.szone.some((c) => c && c.code && !isFaceDown(c.position) && LOCKS.test(this.#nameOf(c.code))),
      oppChainedSpell: !!top && (type(top.code) & TYPE_SPELL) !== 0,
      oppChainedTrap: !!top && (type(top.code) & TYPE_TRAP) !== 0,
      oppChainedLingering: !!top && (type(top.code) & LASTING) !== 0,
      oppChainHitsMyBackrow: hitsBackrow,
      oppChainUsesGrave: !!top && (this.#cards.brain.get(top.code)?.has("revive") ?? false),
      oppSummoning: this.#oppSummonAtk > 0,
      lethalOnEmpty: myTurn && swinging >= opp.lp,
      attackTargetLoses: !!guard && attackAtk > guardValue,
      attackTargetFloats: !!guard && !!guard.code && afterlife(guard.code) > 0,
      oppBattlerSurvives: this.#oppBattlerSurvives(),
      attackHurts: incoming > 0 || (!!guard && attackAtk > guardValue && !this.#battleProofAt(this.seat, guard.sequence, guard.code)),
      attackerIsStrongest: !!oppAttack && oppMon.every((m) => m.seq === this.#attack!.sequence || !m.attackPos || m.atk <= attackAtk || this.#oppAttackedThisTurn.has(m.seq)),
      oppPlanLethal: !myTurn && replyPosition(this.#boardPosition()).myLp <= 0,
      trapLock: this.#trapLock(),
      oppCanNormalSummon: !myTurn && !this.#oppNormalSummoned && phase <= PHASE.MAIN1,
      oppLockActive: opp.szone.some((c) => c && c.code && !isFaceDown(c.position) && LOCKS.test(this.#nameOf(c.code))),
      normalSummonLeft: myTurn && !this.#normalSummoned,
      mySetFlipMon: myMon.some((m) => m.faceDown && !!m.code && this.#isFlip(m.code)),
      oppLethalThrough: !myTurn && replyPosition(this.#boardPosition()).myLp <= 0,
      removalValue: Math.max(0, ...([[opp.mzone, LOCATION.MZONE], [opp.szone, LOCATION.SZONE]] as [(BoardCard | null)[], number][])
        .flatMap(([zone, location]) => zone.flatMap((c, i): CardRef[] => (c ? [{ controller: 1 - this.seat, location, sequence: i, code: c.code, position: c.position }] : [])))
        .map((c) => this.#removalValue(c))),
      myHandDead: me.hand.filter((c) => c && (discardBenefit(c, costs) === 1 || (isMon(c) && (this.#cards.brain.get(c)?.tributes() ?? 0) > myMon.length))).length,
      myHandDiscardPayoff: me.hand.filter((c) => c && (discardBenefit(c) === 2 || / of dark world$|^dark world /.test(this.#nameOf(c)))).length,
      myCounterTraps: [...me.hand, ...me.szone.filter((c): c is BoardCard => !!c).map((c) => c.code)].filter((c) => c && (type(c) & TYPE_COUNTER) !== 0).length,
      myReviveCards: [...me.hand, ...me.szone.filter((c): c is BoardCard => !!c).map((c) => c.code)].filter((c) => c && !isMon(c) && (this.#cards.brain.get(c)?.has("revive") ?? false)).length,
      oppLinkedMonsters: Math.min(oppMon.filter((m) => !m.faceDown).length,
        opp.szone.filter((c) => c && c.code && !isFaceDown(c.position) && LINKED_REVIVAL.test(this.#nameOf(c.code))).length),
      battlePhaseAhead: this.#battleAhead(),
      doublingBurnWins: (() => {
        const immune = myMon.some((m) => !m.faceDown && m.code && this.#nameOf(m.code) === "des wombat");
        let mine = me.lp, theirs = opp.lp;
        for (let d = 300; d < 1e7; d *= 2) {
          theirs -= d;
          if (!immune) mine -= d;
          if (mine <= 0) return false;
          if (theirs <= 0) return true;
        }
        return false;
      })(),
      oppDiscardPayoff: [...opp.grave, ...opp.removed, ...[...opp.mzone, ...opp.szone].filter((c): c is BoardCard => !!c && !isFaceDown(c.position)).map((c) => c.code)]
        .filter((c) => c && DISCARD_PAYOFF.test(this.#nameOf(c))).length,
      myLinkedCards: me.szone.filter((c) => c && c.code && !isFaceDown(c.position) && (LINKED_REVIVAL.test(this.#nameOf(c.code)) || STEALS.test(this.#nameOf(c.code)))).length,
      myStealEquips: me.szone.filter(c => c && !isFaceDown(c.position) && this.#nameOf(c.code) === "snatch steal").length,
      myArchfiends: me.mzone.filter((c) => c && c.code && !isFaceDown(c.position) && /archfiend/.test(this.#nameOf(c.code))).length,
      mySetAttackAnswers: me.szone.filter((c) => c && c.code && isFaceDown(c.position) && ATTACK_ANSWER.test(this.#nameOf(c.code))).length,
      attackerLevel: oppAttack ? oppAttack.level ?? (oppAttack.code ? this.#stat(oppAttack.code).level : 0) : 0,
      attackerExtra: !!oppAttack && !!oppAttack.code && ((type(oppAttack.code) & TYPE_EXTRA) !== 0),
    };
  }

  /** ATK of the monster the opponent just summoned: its current ATK on the field, else its printed ATK; 0 none. */
  #summonedAtk(): number {
    if (this.#oppSummonAtk <= 0) return 0;
    const c = this.#oppSummonSeq >= 0 ? this.#opp()?.mzone[this.#oppSummonSeq] : null;
    return c && c.code && !isFaceDown(c.position) && c.attack !== undefined ? Math.max(1, c.attack) : this.#oppSummonAtk;
  }

  /** A face-up Trap lock (Royal Decree, Jinzo) on either field that is not itself being negated: a Trap does nothing. */
  #trapLock(): boolean {
    const b = this.#board;
    if (!b) return false;
    return b.players.some((p) => [...p.szone, ...p.mzone].some((c) => c && c.code && !isFaceDown(c.position) && TRAP_LOCK.test(this.#nameOf(c.code))));
  }

  /** A Spell / Trap that a face-up lock would negate (Master Duel tests "would this be negated" before any activation:
   *  md-ai/port/E-chains.md §5): never activated, never set to wait. */
  #locked(code: number): boolean {
    const type = this.#cards.brain.get(code)?.type ?? 0;
    const b = this.#board;
    if (!b) return false;
    if ((type & TYPE_TRAP) !== 0) return this.#trapLock();
    if ((type & TYPE_SPELL) !== 0) return b.players.some((p) => [...p.szone, ...p.mzone].some((c) => c && c.code && !isFaceDown(c.position) && SPELL_LOCK.test(this.#nameOf(c.code))));
    return false;
  }

  /** My hand as Master Duel's cost picker reads it (costPick.ts). */
  #costView(hand?: number[]): CostView {
    const me = this.#me();
    const isMonster = (c: number) => ((this.#cards.brain.get(c)?.type ?? 0) & TYPE_MONSTER) !== 0;
    const monsters = me ? me.mzone.filter(Boolean).length : 0;
    return {
      hand: hand ?? me?.hand ?? [],
      field: me ? [...me.mzone, ...me.szone].filter((c): c is BoardCard => !!c).map((c) => c.code) : [],
      isMonster,
      atk: (c) => this.#stat(c).atk,
      canNormalSummon: (c) => (this.#cards.brain.get(c)?.tributes() ?? 0) <= monsters,
      keep: (c) => !!this.#ruleFor(c)?.keepInHand,
      worth: (c) => this.#worth(c, true),
      destinyLive: (() => { const z = this.#zones(); return [...z.hand, ...z.field, ...z.deck].includes("destiny board"); })(),
      // a Dark World monster discarded summons itself (production kept Sillva for Dark World Dealings' discard)
      payoff: (c) => isMonster(c) && DISCARD_PAYOFF.test(this.#nameOf(c)),
    };
  }

  /** A "safe" payment (Master Duel's): one made while not behind on the board, which keeps the cards it keeps. */
  #safePayment(): boolean {
    return outcomeScore(this.#boardPosition()) >= 0;
  }

  /** The rule context about one card: its stats (on my field: its current ones), whether a live opponent link hits it,
   *  and whether a face-up copy of it is already on the field. */
  #withSelf(ctx: RuleCtx, code: number, ref?: CardRef | null, action?: Action): RuleCtx {
    const snap = ref ? this.#snap(ref) : null;
    const st = this.#stat(code);
    const onField = !!snap && snap.controller === this.seat && (snap.location & LOCATION.MZONE) !== 0 && !!snap.code;
    const atk = onField ? snap!.attack ?? st.atk : st.atk, def = onField ? snap!.defense ?? st.def : st.def;
    const key = ref ? `${ref.location}:${ref.sequence}` : "";
    const live = this.#liveOppLinks();
    const threatened = !!ref && ref.controller === this.seat
      && live.some((l) => l.targets.includes(key) || (l.clears && (ref.location & LOCATION.SZONE) !== 0));
    const same = (p: PlayerBoard | null) => !!p && [...p.mzone, ...p.szone].some((c) => c && c.code === code && !isFaceDown(c.position)
      && !(ref && c.controller === ref.controller && c.location === ref.location && c.sequence === ref.sequence));
    // a card in my hand is not its own discard
    // a card in my hand is not its own cost
    const self = ref && ref.controller === this.seat && (ref.location & LOCATION.HAND) !== 0 ? ref.sequence : undefined;
    const costs = this.#costView();
    const spare = expendable(costs, self);
    const standbys = ref && ref.controller === this.seat && (ref.location & LOCATION.SZONE) !== 0 ? this.#standbys.get(`${ref.sequence}:${code}`) ?? 0 : 0;
    const ext: RuleCtxExt = { ...ctx.ext, myHandSpare: spare, discardFodder: canPay(costs, { exclude: self, safe: this.#safePayment() }), selfAtk: atk, selfDef: def, selfValue: onField ? ((snap!.position & POS.DEFENSE) !== 0 ? def : atk) : 0,
      selfStandbys: standbys,
      selfThreatened: threatened, sameCardActive: same(this.#me()) || same(this.#opp()) };
    // the steal's battle is planned only if a rule reads it
    Object.defineProperty(ext, "stealGain", { get: () => this.#stealGain(LP_COST[this.#nameOf(code)] ?? 0), enumerable: true });
    if (action) {
      // the what-if runs only if a rule reads it
      const result = () => this.#whatIf(action);
      Object.defineProperty(ext, "effectGain", { get: () => result().gain, enumerable: true });
      Object.defineProperty(ext, "effectSummonGain", { get: () => result().summon, enumerable: true });
    }
    return { ...ctx, ext };
  }

  /** The action played out under the real rules (simSearch.ts whatIf): the board's value after it minus now, and the
   *  ATK it brought to my field minus the ATK it took from it. 0 / 0 without the lookahead or on a failed fork. */
  #whatIf(action: Action): { gain: number; summon: number } {
    const key = JSON.stringify(action.resp);
    const known = this.#whatIfs.get(key);
    if (known) return known;
    let out = { gain: 0, summon: 0 };
    if (this.#search && this.#sel) {
      const before = this.#board;
      try {
        const st = whatIf(this.#search, this.seat, this.#sel, action.prompt, action.resp, this);
        if (typeof st === "number") out = { gain: st, summon: 0 };
        else if (st) {
          const now = this.#positionValue(), mineNow = this.#myMonsterAtks();
          this.#board = boardFromState(st, this.seat, this.#vision) ?? before;
          const after = this.#positionValue(), mineAfter = this.#myMonsterAtks();
          const came = [...mineAfter].filter(([k]) => !mineNow.has(k)).reduce((n, [, a]) => n + a, 0);
          const went = [...mineNow].filter(([k]) => !mineAfter.has(k)).reduce((n, [, a]) => n + a, 0);
          out = { gain: Math.round(after - now), summon: came - went };
        }
      } catch {
        // a failed what-if reads as no gain
      } finally {
        this.#board = before;
      }
    }
    this.#whatIfs.set(key, out);
    return out;
  }

  /** The current board's value as a rollout scores it. */
  #positionValue(): number {
    const p = this.#boardPosition();
    return this.#style.light ? evaluate(p) : valueWithReply(p, this.#planOpts().replyWeight);
  }

  /** My monsters on the field: `${zone}:${code}` -> ATK. */
  #myMonsterAtks(): Map<string, number> {
    const m = new Map<string, number>();
    this.#me()?.mzone.forEach((c, i) => { if (c && c.code) m.set(`${i}:${c.code}`, c.attack ?? this.#stat(c.code).atk); });
    return m;
  }

  // ---- decision entry ---------------------------------------------------------------------------------------------
  /** With search (elite), the real decisions are scored by fork rollouts; with blunder (easy), a random legal line
   *  sometimes replaces the heuristic's; everything else (and any search failure) is the plain heuristic. */
  decide(ev: Prompt, sel?: Json): Json | null {
    if (ev.kind === "selectIdleCmd" && this.#hasForcedComboAction(ev)) return this.respond(ev);
    if (this.#blunder > 0 && ev.kind === "selectIdleCmd" && this.#rng() < this.#blunder) {
      // a random line among the plays, never "end the turn" (production: an easy NPC skipped two turns holding six traps)
      const cands = this.#candidates(ev)?.filter((c) => c.resp.action !== "TO_EP");
      if (cands && cands.length > 1) {
        this.#pendingAttacker = null;
        const c = cands[Math.floor(this.#rng() * cands.length)]!;
        c.commit?.();
        return c.resp;
      }
    }
    if (!this.#search || !sel || !searchable(this.#search, sel, this.seat)) return this.respond(ev);
    if (ev.kind === "selectIdleCmd" && this.#idleActions < MAX_IDLE_ACTIONS) {
      // Master Duel's flip for effect comes first in Main 1 (before the Normal Summon)
      const flip = this.#flipForEffect(ev);
      if (flip) { this.#idleActions++; return flip; }
      // Master Duel's activation tables: a card whose own rule says "now" (and that comes before the Normal Summon:
      // priority > 0) is activated, not second-guessed by the rollout (its end-of-turn board value does not see what
      // removing a Spell/Trap is worth: production set Mystical Space Typhoon instead of popping a Royal Decree)
      const ruled = this.#ruledActivation(ev) ?? this.#ruledSpecialSummon(ev) ?? this.#freeDamageSummon(ev) ?? this.#lethalProbe(ev, sel);
      if (ruled) { this.#idleActions++; return ruled; }
    }
    const cands = this.#candidates(ev);
    if (!cands || cands.length < 2) return this.respond(ev);
    const r = this.#searchDecide(ev, sel, cands);
    // Leaving the main phase: positions first (Master Duel's position pass), and Main 1 does not end while its battle
    // plan has an attack.
    if (ev.kind === "selectIdleCmd" && (r?.action === "TO_BP" || r?.action === "TO_EP") && this.#idleActions < MAX_IDLE_ACTIONS) {
      const pos = this.#positionPass(ev);
      if (pos) { this.#idleActions++; return pos; }
      if (r.action === "TO_EP" && ev.canBattlePhase && this.#mainOnePlan().length > 0) return respIdle("TO_BP");
      if (r.action === "TO_EP") { const keep = this.#setOverHandLimit(ev); if (keep) { this.#idleActions++; return keep; } }
      // the turn does not end with a trap left in hand that could be set (Master Duel sets its backrow before it ends;
      // the rollouts price a set card like a held one: production ended two turns on an empty field holding Bottomless
      // Trap Hole and Call of the Haunted)
      if (r.action === "TO_EP") { const set = this.#spellToSet(ev); if (set >= 0) { this.#idleActions++; return respIdle("SELECT_SPELL_SET", set); } }
      if (r.action === "TO_BP") { const summon = this.#battleSummon(ev); if (summon) { this.#idleActions++; return summon; } }
      // Mage Power counts my Spell/Trap cards: they are set before the attack (production attacked for 500 less)
      if (r.action === "TO_BP" && this.#backrowBoosts()) { const set = this.#spellToSet(ev); if (set >= 0) { this.#idleActions++; return respIdle("SELECT_SPELL_SET", set); } }
    }
    return r;
  }

  #searchDecide(ev: Prompt, sel: Json, cands: Candidate[]): Json | null {
    const search = this.#search!;
    if (ev.kind !== "selectCard") this.#pendingAttacker = null;
    const t0 = performance.now();
    const scored: { c: Candidate; s: number }[] = [];
    try {
      const limit = Math.max(2, search.maxCandidates);
      // Keep the phase-exit lines (the last two) in the pool: a busy hand can offer many summons/effects.
      const pool = cands.length <= limit ? cands : [...cands.slice(0, limit - 2), ...cands.slice(-2)];
      for (const c of pool) {
        // every candidate in the pool is played out: only a runaway decision stops early (the safety ceiling)
        if (scored.length > 0 && performance.now() - t0 > search.budgetMs) break;
        const s = rolloutScore(search, this.seat, sel, ev, c.resp, this);
        if (s === null) return this.respond(ev); // replay drift: the whole decision falls back to the heuristic
        scored.push({ c, s });
        if (s >= 1e9) break; // a winning line
      }
    } catch {
      return this.respond(ev);
    }
    if (scored.length === 0) return this.respond(ev);
    // Stable sort: on a tie the earlier (heuristic-ordered) candidate wins.
    scored.sort((a, b) => b.s - a.s);
    const pick = this.#mistakeRate > 0 && scored.length > 1 && this.#rng() < this.#mistakeRate ? scored[1]! : scored[0]!;
    pick.c.commit?.();
    return pick.c.resp;
  }

  // ---- candidate enumeration (search / blunder) -------------------------------------------------------------------
  // Pure: no bookkeeping here, the chosen candidate's commit() applies it. Candidates come from the prompt's own legal
  // lists, so every line is playable.
  #candidates(ev: Prompt): Candidate[] | null {
    switch (ev.kind) {
      case "selectIdleCmd": return this.#idleActions >= MAX_IDLE_ACTIONS ? null : this.#idleCandidates(ev);
      case "selectBattleCmd": return this.#battleCandidates(ev);
      // Only on OUR OWN turn (protecting a play); on the opponent's turn the fast heuristic reacts.
      case "selectChain": return this.#turnPlayer === this.seat ? this.#chainCandidates(ev) : null;
      case "selectOption": return ev.options.map((_, i) => ({ resp: respOption(i) }));
      case "selectEffectYN": {
        const key = this.#effKey(ev);
        if (this.#activatedThisTurn.has(key)) return null;
        return [
          { resp: respEffectYN(true), commit: () => { this.#activatedThisTurn.add(key); } },
          { resp: respEffectYN(false) },
        ];
      }
      default: return null;
    }
  }

  #idleCandidates(ev: P<"selectIdleCmd">): Candidate[] {
    const out: Candidate[] = [];
    const act = () => { this.#idleActions++; };
    const ctx = this.#ctx();
    // Order matters when there are more lines than maxCandidates: draw/removal setup, the strongest summons, then the rest.
    const activatable = ev.activatable.map((a, i) => ({ a, i, p: this.#idlePriority(a.code, ctx, a, { prompt: ev, resp: respIdle("SELECT_ACTIVATE", i) }) }))
      .filter(({ a, p }) => p > -Infinity && !this.#activatedThisTurn.has(`${a.code}:${a.location}:${a.sequence}:${a.description}`))
      .sort((a, b) => b.p - a.p);
    const pushActivation = ({ a, i }: { a: Activatable; i: number }) => {
      const key = `${a.code}:${a.location}:${a.sequence}:${a.description}`;
      out.push({ resp: respIdle("SELECT_ACTIVATE", i), commit: () => { this.#activatedThisTurn.add(key); this.#idleActions++; this.#activated(a.code); } });
    };
    activatable.filter((x) => x.p > 0).forEach(pushActivation);
    ev.spSummonable.map((a, i) => ({ a, i, s: this.#stat(a.code).atk + (this.#ruleFor(a.code)?.summonScore?.(ctx) ?? 0) }))
      .filter(({ i }) => this.#specialSummonAllowed(ev, i, ctx))
      .sort((a, b) => b.s - a.s).forEach(({ i }) => out.push({ resp: respIdle("SELECT_SPECIAL_SUMMON", i), commit: act }));
    // Fusion materials remain usable on the field: do not give up all board presence while waiting to draw Polymerization.
    // the Normal Summons / Sets Master Duel's rules allow, each in its position
    const summonable = this.#summonPlays(ev, ctx);
    summonable.forEach((p) => out.push({ resp: respIdle(p.cmd, p.index), commit: act }));
    activatable.filter((x) => x.p === 0).forEach(pushActivation);
    // (no position changes here: they are Master Duel's position pass, made when the main phase is left)
    // one set-backrow line
    const setIdx = this.#spellToSet(ev);
    if (setIdx >= 0) out.push({ resp: respIdle("SELECT_SPELL_SET", setIdx), commit: act });
    const canAttack = ev.canBattlePhase && this.#hasAttacker();
    if (canAttack) out.push({ resp: respIdle("TO_BP") });
    // Never let the hand-heavy evaluation choose "do nothing" over a clearly useful setup, summon, reposition or
    // attack. Once the productive actions are exhausted, END comes back.
    const productive = activatable.some((x) => x.p > 0) || ev.spSummonable.length > 0 || summonable.length > 0 || canAttack;
    if (ev.canEndPhase && !productive) out.push({ resp: respIdle("TO_EP") });
    return out;
  }

  #battleCandidates(ev: P<"selectBattleCmd">): Candidate[] {
    const me = this.#me();
    const out: Candidate[] = [];
    this.#noteDeadAttacker();
    ev.attackable.forEach((a, i) => {
      if (this.#deadAttackers.has(a.sequence)) return;
      const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
      out.push({ resp: respBattle("SELECT_BATTLE", i), commit: () => { this.#declaredAttacker = a; this.#attackSeen = false; this.#pendingAttacker = atk; } });
    });
    ev.activatable.forEach((a, i) => {
      const key = `b:${a.code}:${a.location}:${a.sequence}:${a.description}`;
      if (this.#activatedThisTurn.has(key)) return;
      out.push({ resp: respBattle("SELECT_CHAIN", i), commit: () => { this.#activatedThisTurn.add(key); } });
    });
    if (ev.canMain2) out.push({ resp: respBattle("TO_M2") });
    if (ev.canEndPhase) out.push({ resp: respBattle("TO_EP") });
    return out;
  }

  /** Chain candidates: pass + each fresh chainable (on our own turn: protect our play or not). */
  #chainCandidates(ev: P<"selectChain">): Candidate[] | null {
    if (ev.chains.length === 0 || ev.forced) return null;
    const out: Candidate[] = [{ resp: respChain(null) }];
    const ctx = this.#ctx();
    ev.chains.forEach((c, i) => {
      const key = `${c.code}:${c.description}`;
      if (this.#chainedThisWindow.has(key)) return;
      // a card whose rule says not now is not a line (production: Rush Recklessly on the opponent's Brron in Main 1)
      const react = this.#ruleFor(c.code)?.chainReact;
      if (react && !react(this.#withSelf(ctx, c.code, c))) return;
      out.push({ resp: respChain(i), commit: () => { this.#chainedThisWindow.add(key); } });
    });
    return out;
  }

  // ---- the heuristic ----------------------------------------------------------------------------------------------
  respond(ev: Prompt): Json | null {
    // Any prompt that isn't the attack-target follow-up clears the pending attacker.
    if (ev.kind !== "selectCard") { this.#pendingAttacker = null; if (ev.kind !== "selectBattleCmd") this.#plannedTarget = undefined; }
    switch (ev.kind) {
      case "selectIdleCmd": return this.#idle(ev);
      case "selectBattleCmd": return this.#battle(ev);
      case "selectChain": return this.#chain(ev);
      case "selectCard": return this.#selectCard(ev);
      case "selectUnselectCard": return this.#selectUnselect(ev);
      case "selectTribute": return this.#selectTribute(ev);
      case "selectPosition": return respPosition(this.#position(ev.code, ev.positions));
      case "selectPlace": return respPlaces(ev.isDisfield, this.#selectPlace(ev));
      case "selectEffectYN": return this.#effectYN(ev);
      case "selectYesNo": return this.#battleYesNo(ev.description, ev.text);
      case "selectOption": return this.#selectOption(ev);
      case "selectCounter": return this.#selectCounter(ev);
      case "announceRace": return { type: "ANNOUNCE_RACE", races: lowestBits(ev.available, ev.count) };
      case "announceAttrib": return { type: "ANNOUNCE_ATTRIB", attributes: lowestBits(ev.available, ev.count) };
      case "announceNumber": return { type: "ANNOUNCE_NUMBER", value: this.#ruleFor(this.#lastActivated)?.number?.(this.#withSelf(this.#ctx(), this.#lastActivated), ev.options.map(Number)) ?? 0 };
      case "sortCard": return respSort();
      case "selectSum": return solveSum(ev, (i) => this.#materialCost(ev.cards[i]!));
      case "announceCard": return solveAnnounceCard(ev.opcodes, this.#cards.brain);
      default: return null; // rock-paper-scissors and the rest: the engine decides
    }
  }

  /** A card's options (each its string: code << 20 | n): its rule picks, else the first. */
  #selectOption(ev: P<"selectOption">): Json {
    const code = Math.floor(Number(ev.options[0] ?? 0) / 0x100000);
    const pick = code > 0 ? this.#ruleFor(code)?.option?.(this.#withSelf(this.#ctx(), code)) : undefined;
    return respOption(pick !== undefined && pick >= 0 && pick < ev.options.length ? pick : 0);
  }

  #selectCounter(ev: P<"selectCounter">): Json {
    const counts = ev.cards.map(() => 0);
    let need = ev.count;
    for (let i = 0; i < ev.cards.length && need > 0; i++) {
      const take = Math.min(need, ev.cards[i]!.counters);
      counts[i] = take;
      need -= take;
    }
    return respCounter(counts);
  }

  /** Zones. A normal PLACE goes on our own side; a DISFIELD (zones that can't be used) locks the OPPONENT's free
   *  Monster Zones first. */
  #selectPlace(ev: P<"selectPlace">): PlaceRef[] {
    if (ev.isDisfield) {
      const opp = 1 - this.seat;
      const oppMZone: PlaceRef[] = [];
      for (const s of zoneOrder(7)) if ((ev.disabledFlag & (1 << (16 + s))) === 0) oppMZone.push({ controller: opp, location: LOCATION.MZONE, sequence: s });
      if (oppMZone.length > 0) {
        const fill = freePlaces(this.seat, ev.count, ev.disabledFlag).filter((p) => !oppMZone.some((o) => o.controller === p.controller && o.sequence === p.sequence && o.location === p.location));
        return [...oppMZone, ...fill].slice(0, ev.count);
      }
    }
    return freePlaces(this.seat, ev.count, ev.disabledFlag);
  }

  // ---- main phase -------------------------------------------------------------------------------------------------
  #idle(ev: P<"selectIdleCmd">): Json {
    if (this.#style.fool) return this.#foolIdle(ev);
    const ctx = this.#ctx();
    const oppMax = ctx.oppMaxAtk;
    const oppHasMon = ctx.oppMon.length > 0;
    const combo = this.#comboState();

    // 00. Lethal on an open field: with it already standing, straight to battle (nothing more to lose to a trap);
    // with it in reach, every body turned up and the strongest summoned, then battle.
    if (ev.canBattlePhase && !oppHasMon && this.#idleActions < MAX_IDLE_ACTIONS) {
      const reach = this.#reach(ev);
      if (reach.standing >= ctx.oppLp) return respIdle("TO_BP");
      if (reach.standing + reach.turned + reach.summon >= ctx.oppLp) this.#allIn = true;
      if (this.#allIn) {
        if (reach.turnIndex >= 0) { this.#idleActions++; return respIdle("SELECT_POS_CHANGE", reach.turnIndex); }
        if (reach.summonIndex >= 0) { this.#idleActions++; return respIdle("SELECT_SUMMON", reach.summonIndex); }
        if (reach.standing > 0) return respIdle("TO_BP");
      }
    }

    // 0a. Master Duel's flip for effect, before the Normal Summon.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      const flip = this.#flipForEffect(ev);
      if (flip) { this.#idleActions++; return flip; }
    }

    // 0. (spy vision) A KNOWN board answer is set and we hold backrow removal: pop it BEFORE committing monsters.
    if (this.#idleActions < MAX_IDLE_ACTIONS && this.#threatSetCount() > 0) {
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (!BACKROW_POPPER.test(this.#nameOf(a.code))) continue;
        const key = `${a.code}:${a.location}:${a.sequence}:${a.description}`;
        if (this.#activatedThisTurn.has(key)) continue;
        const rule = this.#ruleFor(a.code);
        if (rule?.idleActivate && !rule.idleActivate(this.#withSelf(ctx, a.code, a, { prompt: ev, resp: respIdle("SELECT_ACTIVATE", i) }))) continue;
        this.#activatedThisTurn.add(key);
        this.#idleActions++;
        this.#activated(a.code);
        return respIdle("SELECT_ACTIVATE", i);
      }
    }

    // 0b. Draw/search and tactical removal BEFORE choosing the normal summon.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      let best = -1, priority = 0;
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (this.#activatedThisTurn.has(`${a.code}:${a.location}:${a.sequence}:${a.description}`)) continue;
        if (combo && combo.plan.enableField && this.#nameOf(a.code) === combo.plan.enableField) continue;
        const p = this.#idlePriority(a.code, ctx, a, { prompt: ev, resp: respIdle("SELECT_ACTIVATE", i) });
        if (p > priority) { priority = p; best = i; }
      }
      if (best >= 0) {
        const a = ev.activatable[best]!;
        this.#activatedThisTurn.add(`${a.code}:${a.location}:${a.sequence}:${a.description}`);
        this.#idleActions++;
        this.#activated(a.code);
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 1. Special summon when possible (almost always free advantage): the strongest.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      const offered = ev.spSummonable.map((c, i) => ({ c, i })).filter(({ i }) => this.#specialSummonAllowed(ev, i, ctx));
      if (offered.length > 0) {
        const idx = offered[this.#argBestSummon(offered.map(({ c }) => c.code), ctx)]!.i;
        this.#idleActions++;
        return respIdle("SELECT_SPECIAL_SUMMON", idx);
      }
    }

    // 2. Normal/tribute summon the strongest worthwhile monster (set it if it can't hold attack).
    const play = this.#chooseMonsterPlay(ev, oppMax, oppHasMon, ctx);
    if (play && this.#idleActions < MAX_IDLE_ACTIONS) { this.#idleActions++; return respIdle(play.cmd, play.index); }

    // 3. An effect / spell not used yet this turn. A card rule can say "hold this" in a bad spot: skip it.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      let best = -1, priority = -Infinity;
      for (let i = 0; i < ev.activatable.length; i++) {
        const a = ev.activatable[i]!;
        if (this.#activatedThisTurn.has(`${a.code}:${a.location}:${a.sequence}:${a.description}`)) continue;
        if (combo && combo.plan.enableField && this.#nameOf(a.code) === combo.plan.enableField) continue;
        const p = this.#idlePriority(a.code, ctx, a, { prompt: ev, resp: respIdle("SELECT_ACTIVATE", i) });
        if (p > priority) { priority = p; best = i; }
      }
      if (best >= 0) {
        const a = ev.activatable[best]!;
        this.#activatedThisTurn.add(`${a.code}:${a.location}:${a.sequence}:${a.description}`);
        this.#idleActions++;
        this.#activated(a.code);
        return respIdle("SELECT_ACTIVATE", best);
      }
    }

    // 4. Set backrow (traps / quick-plays) to have answers on the opponent's turn.
    const setIdx = this.#spellToSet(ev);
    if (this.#idleActions < MAX_IDLE_ACTIONS && setIdx >= 0) {
      this.#idleActions++;
      return respIdle("SELECT_SPELL_SET", setIdx);
    }

    // 4b. Positions, Master Duel's way (#positionPass): the planned attackers up, the rest by its defence rules.
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      const pos = this.#positionPass(ev);
      if (pos) { this.#idleActions++; return pos; }
    }

    // 5. Into battle with something that can swing; otherwise end (over the hand size: a card set, not discarded).
    if (ev.canBattlePhase && (this.#hasAttacker() || this.#mainOnePlan().length > 0)) return respIdle("TO_BP");
    if (ev.canEndPhase && this.#idleActions < MAX_IDLE_ACTIONS) { const keep = this.#setOverHandLimit(ev); if (keep) { this.#idleActions++; return keep; } }
    if (ev.canEndPhase) return respIdle("TO_EP");
    return respIdle(ev.canBattlePhase ? "TO_BP" : "TO_EP");
  }

  // ---- positions (Master Duel's position passes: md-ai/port/A2-mainphase.md §5) ------------------------------------
  /** My monsters and the opponent's as the battle planner reads them; `raised` set monsters are taken as flipped up. */
  #planInput(raised: ReadonlySet<number> = new Set()): PlanInput {
    const base = this.#battlePosition();
    const toPlan = (o: OppMon): PlanMon => ({ atk: o.atk, def: o.faceDown && !o.known ? Math.max(o.def, UNKNOWN_WALL) : o.def, faceDown: o.faceDown,
      attackPos: o.attackPos, known: o.known, flipRisk: o.flipRisk, battleProof: o.battleProof, afterlife: o.afterlife, seq: o.seq, noAttack: o.noAttack,
      battleTrigger: o.battleTrigger, revenge: o.revenge, effectThreat: o.effectThreat });
    const locks = this.#faceUpLocks();
    const my = this.#monstersOf(this.#me()).map((m) => {
      const up = !m.faceDown || raised.has(m.seq);
      // a raised set monster's lock is judged face-up (its Level known to me)
      const noAttack = up && m.faceDown ? this.#attackLocked({ ...m, faceDown: false, level: m.level || this.#stat(m.code).level }, this.seat, locks) : m.noAttack;
      return { ...toPlan(m), faceDown: !up, attackPos: up && !noAttack, known: true, noAttack };
    });
    // every face-up monster (and a raised set one) may attack: a defender the plan uses is switched up first; one a lock
    // stops attacking stays out (production flipped Emissary of the Afterlife under its own Level Limit - Area B)
    const lent = new Set(this.#monstersOf(this.#me()).filter((m) => m.stolen).map((m) => m.seq));
    const attackers: PlanAttacker[] = my.filter((m) => !m.faceDown && m.atk > 0 && !m.noAttack && !this.#ruleNoAttack(m.seq))
      .map((m) => { const code = this.#me()?.mzone[m.seq]?.code ?? 0; return { index: m.seq, seq: m.seq, atk: m.atk, canDirect: DIRECT.has(code), bounces: this.#bounces(code), lent: lent.has(m.seq), pierce: PIERCE.has(code) }; });
    return { base, my, opp: this.#monstersOf(this.#opp()).map(toPlan), attackers, oppAttackNegates: this.#publicAttackNegates() };
  }

  /** Usable public answers only: no assumption about the opponent's hand or set cards. */
  #publicAttackNegates(): number {
    const me = this.#me(), opp = this.#opp();
    if (!me || !opp) return 0;
    const visible = this.#board?.players.flatMap(p => [...p.szone, ...p.mzone]) ?? [];
    if (visible.some(c => c && !isFaceDown(c.position)
      && /^(necrovalley|imperial iron wall|soul drain|the end of anubis)$/.test(this.#nameOf(c.code)))) return 0;
    if (me.mzone.some(c => c && !isFaceDown(c.position) && this.#nameOf(c.code) === "kycoo the ghost destroyer")) return 0;
    return opp.grave.filter(c => this.#nameOf(c) === "necro gardna").length;
  }

  /** The attackers of the battle plan as it stood at my turn's first main-phase decision (Master Duel stores it then). */
  #storedPlan(): ReadonlySet<number> {
    if (this.#stored?.turn !== this.#turn) this.#stored = { turn: this.#turn, seqs: new Set(this.#mainOnePlan().map((a) => a.seq)) };
    return this.#stored.seqs;
  }

  /** My monster in this zone stays out of my attacks by its card rule (CardRule.noAttack). */
  #ruleNoAttack(seq: number): boolean {
    const c = this.#me()?.mzone[seq];
    const rule = c && c.code ? this.#ruleFor(c.code)?.noAttack : undefined;
    return !!rule && rule(this.#withSelf(this.#ctx(), c!.code, { controller: this.seat, location: LOCATION.MZONE, sequence: seq, code: c!.code, position: c!.position }));
  }

  /** The Main Phase 1 battle plan (Master Duel's: planAttacks) on my turn; empty in Main Phase 2 and on turn 1. */
  #mainOnePlan(raised?: ReadonlySet<number>): PlannedAttack[] {
    // no Battle Phase on the duel's first turn
    if (this.#board?.phase === PHASE.MAIN2 || this.#turnPlayer !== this.seat || this.#turn <= 1) return [];
    return planAttacks(this.#planInput(raised));
  }

  /** "Better in defence": a face-up monster that could fight a known enemy monster but gains nothing doing it. */
  #betterInDefence(m: OppMon, input: PlanInput): boolean {
    if (m.battleProof || REFLECTS_DAMAGE.test(this.#nameOf(m.code))) return false;
    const self = input.my.find((x) => x.seq === m.seq);
    if (!self) return false;
    // nothing of theirs out-hits it in attack and its DEF is the weaker stat: defence only exposes it (production put a
    // 2000/100 Warwolf and a 2000/300 Stratos in defence over a Spirit Reaper and a defending wall, and lost both)
    if (m.def < m.atk && !input.opp.some((o) => !o.faceDown && o.attackPos && !o.noAttack && o.atk > m.atk)) return false;
    const att: PlanAttacker = { index: m.seq, seq: m.seq, atk: m.atk, canDirect: DIRECT.has(this.#me()?.mzone[m.seq]?.code ?? 0) };
    const one = { ...input, my: [{ ...self, faceDown: false, attackPos: true }], attackers: [att] };
    return input.opp.some((o) => !o.faceDown && attackClass(one, att, o) === ATTACK_CLASS.NOTHING);
  }

  /** The strongest ATK that can come at one of my monsters next turn: the opponent's face-up monsters and a set one at
   *  the halved estimate. Only what is on the board (A1-summon.md §11.2: an honest CPU does not guess the hand: adding
   *  an unknown Normal Summon to every threat set nearly every monster under 1600 face-down, and lost lab duels). */
  #threatAtk(): number {
    let t = 0;
    // a monster a face-up lock stops attacking threatens nothing (production set Solar Flare Dragon under its own
    // Messenger of Peace)
    for (const o of this.#oppMonsters()) if (!o.noAttack) t = Math.max(t, o.faceDown && !o.known ? UNKNOWN_WALL / 2 : o.atk);
    return t;
  }

  /** Master Duel's Main-2 (and no-Battle-Phase) position for one monster: attack, defence or keep. */
  #mainTwoPosition(m: OppMon, input: PlanInput): "atk" | "def" | "keep" {
    // one whose battle damage goes to the opponent stays in attack (production put Amazoness Swords Woman in defence)
    if (!m.faceDown && REFLECTS_DAMAGE.test(this.#nameOf(m.code))) return m.attackPos ? "keep" : "atk";
    const lp = this.#me()?.lp ?? 8000;
    // staying in attack could be lethal
    const loss = this.#oppMonsters().filter((o) => !o.faceDown && !o.noAttack && o.atk > m.atk).reduce((n, o) => n + (o.atk - m.atk), 0);
    if (lp - loss <= 0) return "def";
    if (this.#betterInDefence(m, input)) return "def";
    // a set flip monster stays set: its flip is judged for its effect (#flipForEffect); a face-down-only one stays down
    if (m.faceDown && (this.#isFlip(m.code) || STAYS_SET.test(this.#nameOf(m.code)))) return "keep";
    const atk = m.atk, def = m.def, threat = this.#threatAtk();
    if (atk === 0) return "def";
    const cap = Math.min(lp, 1000), gap = threat - atk;
    if (gap < cap) {
      if (atk < def) {
        if (threat + 500 <= def && atk + 1000 < def) return "def";
        if (threat <= atk && atk >= 1700) return "atk";
        if (def > 1500 && def >= this.#oppMaxAtk()) return "def";
      } else if (gap <= 0) return "atk";
      if (threat <= atk) return "atk";
      return gap > 0 ? "def" : "keep";
    }
    return "def";
  }

  /** The battle from my monsters' real positions, `raised` ones switched (or flipped) to attack: what my attacks win
   *  less what the opponent's reply takes back (battlePlan.ts tradeValue). */
  #tradeWith(raised: ReadonlySet<number>): number {
    return tradeValue(this.#realInput(raised));
  }

  /** The battle planner's input with my monsters in their real positions, `raised` ones switched (or flipped) to attack. */
  #realInput(raised: ReadonlySet<number>): PlanInput {
    const input = this.#planInput(raised);
    const real = new Map(this.#monstersOf(this.#me()).map((m) => [m.seq, m]));
    const my = input.my.map((pm) => {
      const r = real.get(pm.seq);
      const up = raised.has(pm.seq) || (!!r && r.attackPos);
      return { ...pm, faceDown: !!r && r.faceDown && !raised.has(pm.seq), attackPos: up && !pm.noAttack };
    });
    const attackers = input.attackers.filter((a) => my.some((m) => m.seq === a.seq && m.attackPos));
    return { ...input, my, attackers };
  }

  /** What stealing the opponent's strongest face-up monster for this turn gains my Battle Phase (#ctxExt stealGain). */
  #stealGain(lpCost = 0): number {
    if (!this.#battleAhead()) return 0;
    const input = this.#realInput(new Set());
    const take = input.opp.filter((m) => !m.faceDown).sort((a, b) => b.atk - a.atk)[0];
    if (!take) return 0;
    const paid = { ...input, base: { ...input.base, myLp: input.base.myLp - lpCost } };
    return Math.round(stealValue(paid, take) - tradeValue(input));
  }

  /** Raising this monster to attack for the battle plan pays: its attacks win more than the reply takes through it
   *  (Master Duel raises every planned attacker; production raised Marshmallon to hit a 200/100 for 100 and took 5,600
   *  through it, twice, the second time for the duel). */
  #raisePays(seq: number): boolean {
    return this.#tradeWith(new Set([seq])) >= this.#tradeWith(new Set());
  }

  /** One position change or flip summon, Master Duel's way, or null. Main 1 with a Battle Phase ahead: the monsters the
   *  battle plan uses go to attack (a set attacker is flipped when the plan with it face-up attacks with it), a face-up
   *  attacker the plan leaves out goes to defence when it faces a known monster it cannot beat, nothing else moves.
   *  Main 2 and turns with no Battle Phase: #mainTwoPosition. */
  #positionPass(ev: P<"selectIdleCmd">): Json | null {
    if (this.#style.attackOnly || ev.repositionable.length === 0) return null;
    const mine = this.#monstersOf(this.#me());
    const at = (r: CardRef) => mine.find((m) => m.seq === r.sequence && (r.location & LOCATION.MZONE) !== 0);
    const input = this.#planInput();
    const battleAhead = ev.canBattlePhase && this.#board?.phase !== PHASE.MAIN2 && this.#turn > 1;
    if (battleAhead) {
      const inPlan = new Set(this.#mainOnePlan().map((a) => a.seq));
      for (let i = 0; i < ev.repositionable.length; i++) {
        const m = at(ev.repositionable[i]!);
        if (!m || m.faceDown) continue;
        if (inPlan.has(m.seq) ? !m.attackPos && this.#raisePays(m.seq) : m.attackPos && this.#betterInDefence(m, input)) return respIdle("SELECT_POS_CHANGE", i);
      }
      // a set monster without a flip effect: flipped when the battle plan with it face-up uses it
      for (let i = 0; i < ev.repositionable.length; i++) {
        const m = at(ev.repositionable[i]!);
        if (!m || !m.faceDown || this.#isFlip(m.code) || STAYS_SET.test(this.#nameOf(m.code))) continue;
        if (this.#mainOnePlan(new Set([m.seq])).some((a) => a.seq === m.seq) && this.#raisePays(m.seq)) return respIdle("SELECT_POS_CHANGE", i);
      }
      return null;
    }
    for (let i = 0; i < ev.repositionable.length; i++) {
      const m = at(ev.repositionable[i]!);
      if (!m) continue;
      const want = this.#mainTwoPosition(m, input);
      if (want === "atk" && (m.faceDown || !m.attackPos)) return respIdle("SELECT_POS_CHANGE", i);
      if (want === "def" && !m.faceDown && m.attackPos) return respIdle("SELECT_POS_CHANGE", i);
    }
    return null;
  }

  /** Master Duel's flip for effect (Main 1 before the Normal Summon, and again later): a set flip monster is flipped when
   *  its flip, played out on the engine with its effect, leaves the board better. */
  #flipForEffect(ev: P<"selectIdleCmd">): Json | null {
    if (!this.#search || !this.#sel) return null;
    if (this.#turnPlayer !== this.seat) return null;
    for (let i = 0; i < ev.repositionable.length; i++) {
      const r = ev.repositionable[i]!;
      const s = this.#snap(r);
      if (!s || !isFaceDown(s.position) || !this.#isFlip(r.code)) continue;
      // its card rule says when (Morphing Jar refills both hands: the board value sees only mine), else the what-if
      const rule = this.#ruleFor(r.code)?.flip;
      if (rule ? rule(this.#withSelf(this.#ctx(), r.code, r)) : this.#whatIf({ prompt: ev, resp: respIdle("SELECT_POS_CHANGE", i) }).gain > 0) {
        // a flip that discards my hand (Morphing Jar): the traps in it are set first (production discarded Mirror Force
        // into three attackers)
        if (HAND_RESET.test(this.#nameOf(r.code))) { const set = this.#spellToSet(ev); if (set >= 0) return respIdle("SELECT_SPELL_SET", set); }
        return respIdle("SELECT_POS_CHANGE", i);
      }
    }
    return null;
  }

  /** The fool's main phase: the first legal play of each kind (an activation not used yet this turn, a summon, a
   *  special summon, a set), then battle with anything that can swing, else the end. */
  #foolIdle(ev: P<"selectIdleCmd">): Json {
    if (this.#idleActions < MAX_IDLE_ACTIONS) {
      const a = ev.activatable.findIndex((x) => !this.#activatedThisTurn.has(`${x.code}:${x.location}:${x.sequence}:${x.description}`));
      if (a >= 0) {
        const x = ev.activatable[a]!;
        this.#activatedThisTurn.add(`${x.code}:${x.location}:${x.sequence}:${x.description}`);
        this.#idleActions++;
        this.#activated(x.code);
        return respIdle("SELECT_ACTIVATE", a);
      }
      const first: [ "SELECT_SPECIAL_SUMMON" | "SELECT_SUMMON" | "SELECT_SPELL_SET", unknown[] ][] =
        [["SELECT_SPECIAL_SUMMON", ev.spSummonable], ["SELECT_SUMMON", ev.summonable], ["SELECT_SPELL_SET", ev.spellSet]];
      for (const [cmd, list] of first) if (list.length > 0) { this.#idleActions++; return respIdle(cmd, 0); }
    }
    if (ev.canBattlePhase && this.#hasAttacker()) return respIdle("TO_BP");
    return respIdle(ev.canEndPhase ? "TO_EP" : "TO_BP");
  }

  /** Damage on an open field this turn: what stands in attack, what a position change adds (the first such
   *  monster's index) and the strongest Normal Summon without tribute (its index). */
  #reach(ev: P<"selectIdleCmd">): { standing: number; turned: number; turnIndex: number; summon: number; summonIndex: number } {
    const standing = this.#monstersOf(this.#me()).reduce((n, m) => n + (m.attackPos ? m.atk : 0), 0);
    let turned = 0, turnIndex = -1;
    ev.repositionable.forEach((r, i) => {
      const s = this.#snap(r);
      if (!s || (!isFaceDown(s.position) && (s.position & POS.ATTACK) !== 0)) return;
      const atk = s.attack ?? this.#stat(r.code).atk;
      if (atk <= 0) return;
      turned += atk;
      if (turnIndex < 0) turnIndex = i;
    });
    let summon = 0, summonIndex = -1;
    ev.summonable.forEach((c, i) => {
      const st = this.#normalSummonStats(c.code);
      if (st.level <= 4 && st.atk > summon && !this.#ruleFor(c.code)?.keepInHand) { summon = st.atk; summonIndex = i; }
    });
    return { standing, turned, turnIndex, summon, summonIndex };
  }

  /** The best monster to commit this main phase, and whether to summon it or set it (Master Duel's rules,
   *  #summonPlays), or null. */
  #chooseMonsterPlay(ev: P<"selectIdleCmd">, _oppMax: number, _oppHasMon: boolean, ctx: RuleCtx): { cmd: "SELECT_SUMMON" | "SELECT_MONSTER_SET"; index: number } | null {
    return this.#summonPlays(ev, ctx)[0] ?? null;
  }

  /** Cyberdark's Normal Summon equips a Level 3-or-lower Dragon from our own graveyard. Judge
   * the body it will actually produce, including the direct-damage shortcut (duel 911), rather than
   * its printed 800 ATK. This reads public cards only; a Set does not trigger the equip. */
  #normalSummonStats(code: number): { atk: number; def: number; level: number } {
    const st = this.#stat(code), me = this.#me();
    if (!/^(cyberdark horn|cyberdark edge|cyberdark keel)$/.test(this.#nameOf(code)) || !me
      || me.szone.slice(0, 5).filter(Boolean).length >= 5) return st;
    const locked = this.#board?.players.some(p => p.szone.some(c => c && !isFaceDown(c.position)
      && /^(skill drain|necrovalley)$/.test(this.#nameOf(c.code))));
    if (locked) return st;
    const equipAtk = me.grave.reduce((best, c) => {
      const card = this.#cards.brain.get(c);
      return card && (card.race & 0x2000) !== 0 && card.level <= 3
        ? Math.max(best, this.#stat(c).atk) : best;
    }, 0);
    return { ...st, atk: st.atk + equipAtk };
  }

  /** Master Duel's position for a monster it summons (md-ai/port/A1-summon.md §5): a weak FLIP monster is set; else set
   *  when the opponent's best next-turn attack out-guns it by min(LP, 1000), or its DEF is a clear wall; face-up when
   *  nothing beats it. */
  #summonPosition(code: number, bonus: number, st = this.#stat(code)): "up" | "set" {
    if (this.#style.attackOnly || this.#allIn) return "up";
    const { atk, def } = st;
    if (this.#isFlip(code) && atk < 2000 && !(atk >= 1200 && def <= atk + 200)) return "set";
    if (STAYS_SET.test(this.#nameOf(code))) return "set";
    if (REFLECTS_DAMAGE.test(this.#nameOf(code))) return "up";
    const T = this.#threatAtk(), lp = this.#me()?.lp ?? 8000;
    // a monster battle cannot destroy walls only in defence: summoned in attack under a bigger attacker it is a hole the
    // damage goes through (production: Spirit Reaper face-up at 200 LP, its card rule's summon score read as "face-up";
    // and face-up at 100 LP onto an empty field, where its direct attack fed a Dark World discard)
    if (BATTLE_PROOF.has(code) && (atk < T || (atk < 1000 && lp <= 1000))) return "set";
    // a card rule that wants it on the field for its effect (a Monarch), or an effect that only a Normal Summon
    // triggers (Manju of the Ten Thousand Hands: set, it never searches): Master Duel's per-card effect-use table
    if (bonus > 0 || ON_SUMMON.has(code)) return "up";
    if (atk === 0) return "set";
    // an empty opposing field with my Battle Phase ahead: a real attacker goes up and hits (production set Gamma and
    // Mystical Elf there: their DEF read as a wall against nothing); a token-sized body is set, not shown for 100
    if (this.#oppMonsters().length === 0 && this.#battleAhead()) return atk >= 1400 || (atk >= def && atk >= 1000) ? "up" : "set";
    if (this.#turn <= 1 && def >= atk) return "set";
    const gap = T - atk;
    if (gap >= Math.min(lp, 1000)) return "set";
    if (atk < def) {
      if (def >= T + 500 && def > atk + 1000) return "set";
      if (atk >= T && atk >= 1700) return "up";
      if (def > 1500 && def >= this.#oppMaxAtk()) return "set";
    } else if (gap <= 0) return "up";
    if (atk >= T) return "up";
    return "set";
  }

  /** The board after Normal Summoning (or setting) this monster with these tributes and Master Duel's planned attacks
   *  (planEnd): its value (the hand left out: every play spends the one card) and its battle verdict. */
  #afterSummon(code: number, set: boolean, tributes: number[], st = this.#stat(code)): { value: number; verdict: number; trade: number } {
    const input = this.#planInput();
    const free = [0, 1, 2, 3, 4].find((z) => !input.my.some((m) => m.seq === z && !tributes.includes(m.seq))) ?? 9;
    const mon: PlanMon = { atk: st.atk, def: st.def, faceDown: set, attackPos: !set, known: true, flipRisk: 0, seq: free,
      battleProof: BATTLE_PROOF.has(code), afterlife: afterlife(code) };
    const my = [...input.my.filter((m) => !tributes.includes(m.seq)), mon];
    const attackers = [...input.attackers.filter((a) => !tributes.includes(a.seq)), ...(set ? [] : [{ index: free, seq: free, atk: st.atk, canDirect: DIRECT.has(code), bounces: this.#bounces(code), pierce: PIERCE.has(code) }])];
    const { end } = planEnd({ ...input, my, attackers });
    // the same summon judged with my other monsters in their real positions, against the reply (#tradeWith)
    const real = new Map(this.#monstersOf(this.#me()).map((m) => [m.seq, m]));
    const tmy = my.map((m) => { const r = real.get(m.seq); return r && m !== mon ? { ...m, attackPos: r.attackPos && !m.noAttack, faceDown: r.faceDown } : m; });
    const trade = tradeValue({ ...input, my: tmy, attackers: attackers.filter((a) => tmy.some((m) => m.seq === a.seq && m.attackPos)) });
    return { value: evaluate({ ...end, myHand: 0 }), verdict: outcomeScore(end), trade };
  }

  /** My Main Phase 1 with my Battle Phase still ahead (no Battle Phase on the duel's first turn). */
  #battleAhead(): boolean {
    return this.#turnPlayer === this.seat && this.#board?.phase === PHASE.MAIN1 && this.#turn > 1;
  }

  /** The Normal Summons / Sets Master Duel's rules allow, best first (A1-summon.md §4.3, §6, §10): its position by
   *  #summonPosition; a Tribute Summon only when the new monster holds more than every tribute did and reaches the
   *  strongest opposing monster (a card rule's summon score, a Monarch, skips the test), a Tribute Set otherwise only
   *  to wall an opponent's lethal with more than the tributes stopped; never an attacker of the turn's stored battle
   *  plan as a tribute; and in Main 2 nothing at all when a safe monster is out, the NPC is not behind and no candidate beats both. */
  #summonPlays(ev: P<"selectIdleCmd">, ctx: RuleCtx): { cmd: "SELECT_SUMMON" | "SELECT_MONSTER_SET"; index: number; score: number; stat: number; trade?: number }[] {
    const holdOf = (m: OppMon): number => (m.faceDown && !m.known ? Math.max(m.def, UNKNOWN_WALL) : m.attackPos ? m.atk : m.def);
    const mine = this.#monstersOf(this.#me()), opp = this.#oppMonsters();
    const planned = new Set(this.#mainOnePlan().map((a) => a.seq));
    // tributes: never an attacker of the battle plan stored at the start of the turn (Master Duel's 180812130: a
    // monster flipped up since then is fair game), a borrowed monster first, then the weakest by ATK, as the tribute
    // prompt gives them up (#selectTribute: ranking a set Mystical Elf by its 2000 DEF priced the wrong tribute)
    const stored = this.#storedPlan();
    // nor, before my battle, a borrowed monster that attacks in the plan: it attacks first and is tributed in Main 2
    // (production tributed a Brain Controlled Goldd and Brron for one monster that Book of Moon then stopped); a planned
    // attacker that wants the graveyard (Emissary of the Afterlife's search) is fodder for a bigger monster all the same
    const planNow = ev.canBattlePhase && this.#battleAhead() ? new Set(this.#mainOnePlan().map((a) => a.seq)) : new Set<number>();
    const fodder = mine.filter((m) => (!stored.has(m.seq) || m.afterlife > 0) && !(m.stolen && planNow.has(m.seq)))
      .sort((x, y) => Number(y.stolen) - Number(x.stolen) || (x.atk - x.afterlife) - (y.atk - y.afterlife));
    const bar = opp.reduce((n, m) => Math.max(n, holdOf(m)), 0);
    const lethalOnMe = replyPosition(this.#boardPosition()).myLp <= 0;
    const stops = (def: number) => opp.filter((m) => m.attackPos && m.atk <= def).length;
    const battleAhead = ev.canBattlePhase && this.#battleAhead();
    const out: { cmd: "SELECT_SUMMON" | "SELECT_MONSTER_SET"; index: number; score: number; stat: number; verdict: number; planned: boolean; hold: boolean; trade?: number }[] = [];
    const seen = new Set<number>();
    const burnOnKill = opp.some((o) => !o.faceDown && o.code && BURN_ON_KILL.test(this.#nameOf(o.code)));
    // a piece kept in hand (Exodia) is still set as a wall when the opponent's next Battle Phase would kill me without it
    // (production died at 1300 LP to a lone Celestia holding Left Arm of the Forbidden One)
    // (the last resort: not with a card in hand or set that stops attacks, Scapegoat, Gravity Bind, Mirror Force...)
    const me = this.#me();
    const stopper = !!me && [...me.hand, ...me.szone.filter((c): c is BoardCard => !!c).map((c) => c.code)].some((c) => c && STOPS_ATTACKS.test(this.#nameOf(c)));
    const lethalNext = !stopper && replyPosition(this.#boardPosition()).myLp <= 0;
    ev.monsterSet.forEach((c, i) => {
      if (!lethalNext || !this.#ruleFor(c.code)?.keepInHand || seen.has(c.code)) return;
      seen.add(c.code);
      const st = this.#stat(c.code);
      if (st.level > 4) return;
      out.push({ cmd: "SELECT_MONSTER_SET", index: i, score: st.def * 0.5 - 5000, stat: st.def, verdict: 0, planned: false, hold: true });
    });
    ev.summonable.forEach((c, i) => {
      if (seen.has(c.code) || this.#ruleFor(c.code)?.keepInHand) return;
      seen.add(c.code);
      let st = this.#normalSummonStats(c.code);
      const equipAtk = st.atk - this.#stat(c.code).atk;
      const bonus = this.#ruleFor(c.code)?.summonScore?.(ctx) ?? 0;
      const setIndex = ev.monsterSet.findIndex((x) => x.code === c.code);
      let n = st.level > 6 ? 2 : st.level > 4 ? 1 : 0;
      // offered with fewer monsters than its tributes: its own summon without tributes (Fusilier Dragon at half its
      // stats: production never played it, counting two tributes it did not have)
      if (n > mine.length) { n = 0; st = { ...st, ...NO_TRIBUTE_STATS[this.#nameOf(c.code)] }; }
      let set = this.#summonPosition(c.code, bonus, st) === "set" && setIndex >= 0;
      // before a Battle Phase against a monster: the position whose battle and the reply to it come out better (Master
      // Duel judges only one; production set a 2000/100 Warwolf, which walls nothing, and summoned a 300 ATK Spirit
      // Reaper into a 3000)
      if (battleAhead && opp.length > 0 && setIndex >= 0 && !this.#isFlip(c.code) && !STAYS_SET.test(this.#nameOf(c.code)) && !ON_SUMMON.has(c.code) && bonus <= 0) {
        const tributes = n > 0 ? fodder.slice(0, n).map((t) => t.seq) : [];
        const up = this.#afterSummon(c.code, false, tributes, st).trade, down = this.#afterSummon(c.code, true, tributes, { ...st, atk: st.atk - equipAtk }).trade;
        if (Math.abs(up - down) > 200) set = down > up;
      }
      if (set && equipAtk) st = { ...st, atk: st.atk - equipAtk }; // A Set has no on-summon equip.
      const stat = set ? st.def : st.atk;
      if (n > 0 && bonus <= 0) {
        const tributes = fodder.slice(0, n);
        if (tributes.length < n) return;
        const given = tributes.reduce((m, t) => Math.max(m, t.stolen ? 0 : holdOf(t)), 0);
        const pays = stat > given && stat >= bar;
        const walls = set && lethalOnMe && stops(st.def) > Math.max(0, ...tributes.map((t) => stops(t.def)));
        if (!pays && !walls) return;
      }
      // Main 1 before a Battle Phase: the play as Master Duel's turn plan judges it, by the battle it leads to (the board
      // after the summon, its tributes gone, and the planned attacks); otherwise by the body
      const after = battleAhead ? this.#afterSummon(c.code, set, fodder.slice(0, n).map((t) => t.seq), st) : null;
      // set into a monster that burns for what it destroys (Shining Flare Wingman): the smallest ATK goes there
      const score = (after ? after.value + bonus : (set ? st.def * 0.5 : st.atk) + bonus) - (set && burnOnKill ? st.atk : 0);
      // a set flip monster, or a monster whose summon triggers its effect, is played for the effect, not the body
      const hold = (set && this.#isFlip(c.code)) || (!set && ON_SUMMON.has(c.code));
      out.push({ cmd: set ? "SELECT_MONSTER_SET" : "SELECT_SUMMON", index: set ? setIndex : i, score, stat, verdict: after?.verdict ?? 0, planned: bonus >= PLANNED_SUMMON, hold, trade: after?.trade });
    });
    // Main 2 (or no Battle Phase): two safe monsters of my own out and not behind: only a play that beats both (Master
    // Duel's; with one monster it held every second body and on-summon effect: Sparkman on turn 1, Stratos's search,
    // the Pyro that shields Solar Flare Dragon; a borrowed monster leaves at the End Phase and guards nothing)
    if (this.#board?.phase === PHASE.MAIN2 || !ev.canBattlePhase) {
      const threat = this.#threatAtk();
      const own = mine.filter((m) => !m.stolen);
      const safe = own.filter((m) => holdOf(m) >= threat).reduce((n, m) => Math.max(n, holdOf(m)), -1);
      const hand = this.#me()?.hand.length ?? 0;
      if (own.length >= 2 && safe >= 0 && outcomeScore(this.#boardPosition()) >= 0 && hand < 6) {
        // (a set flip monster, an on-summon effect, a wall against lethal are played all the same: production held
        // Gravekeeper's Spy, Guard and Kycoo for a turn next to two Spear Soldiers)
        const keep = out.filter((o) => o.hold || o.stat > Math.max(bar, safe));
        out.length = 0;
        out.push(...keep);
      }
    }
    // a card rule's planned play first (Manju of the Ten Thousand Hands with its ritual spell waiting); then, before a
    // Battle Phase, Master Duel's turn plan compares the boards by its battle verdict first, then by value
    return out.sort((x, y) => Number(y.planned) - Number(x.planned) || (battleAhead ? compareVerdicts(y.verdict, x.verdict) : 0) || y.score - x.score);
  }

  // ---- battle phase -----------------------------------------------------------------------------------------------
  // Combat is deterministic, so the battle phase gets a real 1-ply lookahead: resolve each candidate attack exactly
  // (who dies, the LP swing) and score the RESULTING board with evaluate(); lethal evaluates as a win.
  #boardPosition(): Position {
    const me = this.#me(), opp = this.#opp();
    const toEval = (o: OppMon): EvalMon => ({
      atk: o.atk, def: o.faceDown && !o.known ? Math.max(o.def, UNKNOWN_WALL) : o.def,
      faceDown: o.faceDown, attackPos: o.attackPos, known: o.known, flipRisk: o.flipRisk, battleProof: o.battleProof,
      afterlife: o.afterlife, noAttack: o.noAttack, battleTrigger: o.battleTrigger, revenge: o.revenge, effectThreat: o.effectThreat,
    });
    return {
      myMon: this.#monstersOf(me).map(toEval), oppMon: this.#monstersOf(opp).map(toEval),
      myLp: me?.lp ?? 8000, oppLp: opp?.lp ?? 8000,
      myHand: me?.hand.length ?? 0,
      myBackrow: me ? me.szone.filter(Boolean).length : 0,
      // With spy vision the backrow risk is exact: only known board answers count.
      oppBackrow: opp ? (this.#vision ? this.#threatSetCount() : opp.szone.filter(Boolean).length) : 0,
    };
  }

  /** Combat view: with spy vision and two or more set monsters, every set monster gets the SAME unknown-wall prior
   *  (no attacking just because x-ray vision found the convenient one). */
  #battlePosition(): Position {
    // Combat compares boards before and after one attack: no backrow discount on our own bodies here (halving
    // them made an even trade, our 1300 for their 1300, read as a gain).
    const base = { ...this.#boardPosition(), oppBackrow: 0 };
    const sets = base.oppMon.filter((m) => m.faceDown);
    if (!this.#vision || sets.length < 2) return base;
    return { ...base, oppMon: base.oppMon.map((m) => (m.faceDown ? { ...m, atk: 0, def: UNKNOWN_WALL, known: false, flipRisk: 300 } : m)) };
  }

  /** The board after attacker (ATK a) hits t (null = a direct attack). An unknown face-down is an UNKNOWN_WALL DEF wall. */
  #resolveAttack(base: Position, a: number, t: EvalMon | null): Position {
    let { myLp, oppLp } = base;
    let oppMon = base.oppMon, myMon = base.myMon;
    if (t === null) oppLp -= a;
    else {
      const guard = t.faceDown ? (t.known ? t.def : Math.max(t.def, UNKNOWN_WALL)) : t.attackPos ? t.atk : t.def;
      const dropOne = (m: EvalMon[], x: EvalMon) => {
        if (x.battleProof) return m;
        const i = m.findIndex((y) => y.atk === x.atk && y.def === x.def && y.attackPos === x.attackPos && y.faceDown === x.faceDown);
        return i < 0 ? m : [...m.slice(0, i), ...m.slice(i + 1)];
      };
      if (t.attackPos) {
        if (a > guard) { oppLp -= a - guard; oppMon = dropOne(oppMon, t); }
        else if (a === guard) {
          oppMon = dropOne(oppMon, t);
          const ai = myMon.findIndex((y) => y.attackPos && y.atk === a);
          if (ai >= 0) myMon = [...myMon.slice(0, ai), ...myMon.slice(ai + 1)];
        } else {
          myLp -= guard - a;
          const ai = myMon.findIndex((y) => y.attackPos && y.atk === a);
          if (ai >= 0) myMon = [...myMon.slice(0, ai), ...myMon.slice(ai + 1)];
        }
      } else {
        if (a > guard) oppMon = dropOne(oppMon, t);
        else if (a < guard) myLp -= guard - a;
      }
    }
    return { ...base, myLp, oppLp, myMon, oppMon };
  }

  #attackScore(base: Position, atk: number, target: EvalMon | null): number {
    return evaluate(this.#resolveAttack(base, atk, target)) - (target?.faceDown ? target.flipRisk ?? 0 : 0);
  }

  #battle(ev: P<"selectBattleCmd">): Json {
    const ctx = this.#ctx();
    for (let i = 0; i < ev.activatable.length; i++) {
      const a = ev.activatable[i]!;
      const key = `b:${a.code}:${a.location}:${a.sequence}:${a.description}`;
      if (this.#activatedThisTurn.has(key)) continue;
      if (this.#nameOf(a.code) === "limiter removal") {
        // Count only Machines that the engine still lets attack. The old sum included spent
        // attackers and non-Machines, promising lethal then destroying our board at End Phase.
        const { input } = this.#planBattle(ev);
        const machines = new Set(this.#me()?.mzone.flatMap((m, seq) => m && ((this.#cards.brain.get(m.code)?.race ?? 0) & 0x20) ? [seq] : []) ?? []);
        const boosted = { ...input, my: input.my.map(m => machines.has(m.seq) ? { ...m, atk: m.atk * 2 } : m),
          attackers: input.attackers.map(m => machines.has(m.seq) ? { ...m, atk: m.atk * 2 } : m) };
        if (!planBattle(boosted, this.#planOpts()).outcome.lethal) continue;
      } else if (!this.#ruleFor(a.code)?.battleActivate?.(this.#withSelf(ctx, a.code, a, { prompt: ev, resp: respBattle("SELECT_CHAIN", i) }))) continue;
      this.#activatedThisTurn.add(key);
      this.#activated(a.code);
      return respBattle("SELECT_CHAIN", i);
    }
    const base = this.#battlePosition();
    const me = this.#me();
    this.#noteDeadAttacker();
    let bestIdx = -1, bestAtk = 0;
    this.#plannedTarget = undefined;
    if (this.#style.fool) {
      // the first monster that can attack, at whatever the target prompt offers first
      const i = ev.attackable.findIndex((a) => !this.#deadAttackers.has(a.sequence));
      if (i >= 0) { bestIdx = i; bestAtk = me?.mzone[ev.attackable[i]!.sequence]?.attack ?? this.#stat(ev.attackable[i]!.code).atk; this.#plannedTarget = undefined; }
    } else {
      // Lethal this Battle Phase (the whole phase planned, battlePlan.ts): its first attack. Otherwise Master Duel's
      // decision: the one attack that gains the most, or none (nextAttack); decided again after it resolves.
      const { input, plan } = this.#planBattle(ev);
      const first = plan.outcome.lethal || input.oppAttackNegates > 0 ? plan.attacks[0] : nextAttack(input);
      if (first) { bestIdx = first.index; bestAtk = first.atk; this.#plannedTarget = first.target; }
    }
    // no way out of the battle (the opponent's card makes every monster attack): the least bad attack, not a refused End
    if (bestIdx < 0 && !ev.canMain2 && !ev.canEndPhase) {
      let worst = -Infinity;
      ev.attackable.forEach((a, index) => {
        if (this.#deadAttackers.has(a.sequence)) return;
        const atk = me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk;
        const targets: (EvalMon | null)[] = (a.directAttackable || base.oppMon.length === 0) ? [null] : base.oppMon;
        for (const t of targets) { const v = this.#attackScore(base, atk, t); if (v > worst) { worst = v; bestIdx = index; bestAtk = atk; } }
      });
    }
    if (bestIdx >= 0) { this.#declaredAttacker = ev.attackable[bestIdx]!; this.#attackSeen = false; this.#pendingAttacker = bestAtk; return respBattle("SELECT_BATTLE", bestIdx); }
    if (ev.canMain2) return respBattle("TO_M2");
    if (ev.canEndPhase || !ev.activatable.length) return respBattle("TO_EP");
    return respBattle("SELECT_CHAIN", 0);
  }

  /** Back at the battle command with the last declared attack never declared by the engine: that monster is out. */
  #noteDeadAttacker(): void {
    if (this.#declaredAttacker && !this.#attackSeen) this.#deadAttackers.add(this.#declaredAttacker.sequence);
    this.#attackSeen = true;
  }

  /** This Battle Phase planned from here (battlePlan.ts), over the same board the 1-ply scoring reads. */
  #planBattle(ev: P<"selectBattleCmd">) {
    const base = this.#battlePosition();
    const me = this.#me(), opp = this.#opp();
    const withSeq = (p: PlayerBoard | null, mons: EvalMon[]): PlanMon[] =>
      this.#monstersOf(p).map((m, i) => ({ ...mons[i]!, seq: m.seq }));
    const attackers: PlanAttacker[] = [];
    const lent = new Set(this.#monstersOf(me).filter((m) => m.stolen).map((m) => m.seq));
    ev.attackable.forEach((a, index) => {
      if (this.#deadAttackers.has(a.sequence) || this.#ruleNoAttack(a.sequence)) return;
      attackers.push({ index, seq: a.sequence, atk: me?.mzone[a.sequence]?.attack ?? this.#stat(a.code).atk, canDirect: a.directAttackable, bounces: this.#bounces(a.code), lent: lent.has(a.sequence), pierce: PIERCE.has(a.code) });
    });
    const input = { base, my: withSeq(me, base.myMon), opp: withSeq(opp, base.oppMon), attackers, oppAttackNegates: this.#publicAttackNegates() };
    return { input, plan: planBattle(input, this.#planOpts()) };
  }

  // ---- chains / responses -----------------------------------------------------------------------------------------
  #battleYesNo(description: string, text = ""): Json {
    if (description !== "30" && description !== "31") {
      // A card's own question (its string: code << 20 | n), an upkeep cost say: its rule answers; else yes to a free
      // Special Summon from the Deck or hand (Nimble Momonga, Giant Germ: production answered no), no to the rest.
      const code = Math.floor(Number(description) / 0x100000);
      const rule = code > 0 ? this.#ruleFor(code) : undefined;
      if (rule?.yesNo) return respYesNo(rule.yesNo(this.#withSelf(this.#ctx(), code)));
      return respYesNo(/^Special Summon\b.*\bfrom your (Deck|hand)\?$/i.test(text));
    }
    const card = this.#declaredAttacker;
    const live = card ? this.#snap(card) : null;
    if (!live || isFaceDown(live.position) || !(live.position & POS.ATTACK)) return respYesNo(false);
    const atk = live.attack ?? this.#stat(live.code).atk;
    const base = this.#battlePosition();
    // the replay goes on when the attack would still gain something (Master Duel's attack classes, battlePlan.ts)
    const direct = description === "31" || base.oppMon.length === 0;
    const self: PlanMon = { atk, def: live.defense ?? this.#stat(live.code).def, faceDown: false, attackPos: true, known: true, seq: -1, battleProof: BATTLE_PROOF.has(live.code) };
    const input = { base, my: [self], opp: base.oppMon.map((m, i) => ({ ...m, seq: i })), attackers: [{ index: 0, seq: -1, atk, canDirect: direct, pierce: PIERCE.has(live.code) }] };
    const targets: (PlanMon | null)[] = direct ? [null] : input.opp;
    const yes = targets.some((target) => attackClass(input, input.attackers[0]!, target) > 0);
    if (yes) this.#pendingAttacker = atk;
    return respYesNo(yes);
  }

  #chain(ev: P<"selectChain">): Json {
    if (ev.chains.length === 0) return respChain(null);
    if (ev.forced) return respChain(0);
    // a my-turn-only player never answers on the opponent's turn
    if (this.#style.myTurnOnly && this.#turnPlayer !== this.seat) return respChain(null);
    // A set card the opponent's chain is taking: used now if it does anything (production: Scapegoat, Raigeki Break,
    // Ring of Destruction and Compulsory Evacuation Device destroyed unused).
    const doomedIdx = ev.chains.findIndex((c, i) => this.#isDoomed(c) && !this.#chainedThisWindow.has(`${c.code}:${c.description}`) && !this.#locked(c.code)
      && (this.#ruleFor(c.code)?.doomed?.(this.#withSelf(this.#ctx(), c.code, c, { prompt: ev, resp: respChain(i) })) ?? true));
    if (doomedIdx >= 0) {
      const c = ev.chains[doomedIdx]!;
      this.#chainedThisWindow.add(`${c.code}:${c.description}`);
      this.#activated(c.code);
      return respChain(doomedIdx);
    }
    // Burn that adds up to the opponent's LP on one chain, Chain Strike on top (production fired two Secret Barrels as two
    // chains and a lone Chain Strike for 800, twice short of a win), and the normal traps cleared off my field for Gorz.
    if (!this.#style.myTurnOnly || this.#turnPlayer === this.seat) {
      const burn = this.#burnChain(ev) ?? this.#gorzClear(ev);
      if (burn !== null) {
        const c = ev.chains[burn]!;
        this.#chainedThisWindow.add(`${c.code}:${c.description}`);
        this.#answeredAt = this.#links.length + 1;
        this.#activated(c.code);
        return respChain(burn);
      }
    }
    // Set traps / quick effects on the OPPONENT's turn (removal and negation timing), one answer per window (a second
    // trap on the same attack is a card wasted) unless the opponent has chained a new link since our answer (Master
    // Duel answers each new link). On our own turn only a negation of the opponent's link: no optional self-chains
    // that would interrupt our own plays.
    const top = this.#links[this.#links.length - 1];
    const newLink = this.#links.length > this.#answeredAt && !!top && top.controller !== this.seat;
    if (this.#stacking) {
      const strike = ev.chains.findIndex((c) => this.#nameOf(c.code) === "chain strike" && !this.#chainedThisWindow.has(`${c.code}:${c.description}`) && !this.#locked(c.code));
      if (strike >= 0) {
        const c = ev.chains[strike]!;
        this.#stacking = false;
        this.#chainedThisWindow.add(`${c.code}:${c.description}`);
        this.#answeredAt = this.#links.length + 1;
        this.#activated(c.code);
        return respChain(strike);
      }
    }
    if (this.#chainedThisWindow.size > 0 && !newLink) return respChain(null);
    const ctx = this.#ctx();
    const own = this.#turnPlayer === this.seat;
    // on my own turn: negations of the opponent's link, and the cards whose rule asks to answer there (ownTurn)
    if (own && !ctx.oppChained && !ev.chains.some((c) => this.#ruleFor(c.code)?.ownTurn)) return respChain(null);
    // a fool springs the first card it can
    if (this.#style.fool) {
      const c = ev.chains[0]!;
      this.#chainedThisWindow.add(`${c.code}:${c.description}`);
      this.#activated(c.code);
      return respChain(0);
    }
    // The candidates in priority order (a rule's chainPriority, else a negation of the opponent's link first): the
    // first whose rule says yes is the answer.
    const prio = (c: Activatable): number => this.#ruleFor(c.code)?.chainPriority ?? (ctx.oppChained && this.#negates(c.code) ? 50 : 0);
    let order = ev.chains.map((c, i) => ({ i, p: prio(c) })).sort((a, b) => b.p - a.p).map((x) => x.i);
    // an attack on me: of the answers that would fire, the cheapest that does the job (production spent Mirror Force on
    // a lone attacker with Sakuretsu Armor set, and Raigeki Break plus a discard where Sakuretsu was free)
    if (!own && ctx.attackAtk > 0 && !ctx.oppChained) {
      const fires = order.filter((i) => {
        const c = ev.chains[i]!, rule = this.#ruleFor(c.code);
        return !this.#chainedThisWindow.has(`${c.code}:${c.description}`) && !this.#locked(c.code)
          && (!rule?.chainReact || rule.chainReact(this.#withSelf(ctx, c.code, c, { prompt: ev, resp: respChain(i) })));
      });
      const attackers = ctx.oppMon.filter((m) => m.attackPos).length;
      order = fires.sort((a, b) => this.#answerCost(ev.chains[a]!.code, attackers) - this.#answerCost(ev.chains[b]!.code, attackers));
    }
    for (const i of order) {
      const c = ev.chains[i]!;
      const key = `${c.code}:${c.description}`;
      if (this.#chainedThisWindow.has(key)) continue;
      if (this.#locked(c.code)) continue;
      if (own && !this.#ruleFor(c.code)?.ownTurn && !(ctx.oppChained && this.#cards.brain.get(c.code)?.has("negate"))) continue;
      const rule = this.#ruleFor(c.code);
      if (rule?.chainReact && !rule.chainReact(this.#withSelf(ctx, c.code, c, { prompt: ev, resp: respChain(i) }))) continue;
      // Chain Strike about to go: a burn card that deals 1000 or more goes under it first, raising its link
      if (this.#nameOf(c.code) === "chain strike") {
        const under = this.#strikeFodder(ev, ctx);
        if (under >= 0) {
          const u = ev.chains[under]!;
          this.#chainedThisWindow.add(`${u.code}:${u.description}`);
          this.#answeredAt = this.#links.length + 1;
          this.#stacking = true;
          this.#activated(u.code);
          return respChain(under);
        }
      }
      // (No what-if veto: Master Duel has none on its responses, only "would this be negated" (#locked). Rev 6 held a
      // response that left the board worse than passing: the board value prices a set card at a whole card, cannot see
      // the opponent's cards it stops, and the what-if ends with the chain, before the attack the trap stops, so it
      // held nearly every trap: Magic Cylinder, Raigeki Break and Judgment of Anubis never fired.)
      this.#chainedThisWindow.add(key);
      this.#answeredAt = this.#links.length + 1;
      this.#activated(c.code);
      return respChain(i);
    }
    return respChain(null);
  }

  /** My burn cards offered in this chain window (not used in it yet, not negated by a lock), with what each deals now. */
  #burnOffered(ev: P<"selectChain">, ctx: RuleCtx): { i: number; name: string; dmg: number }[] {
    return ev.chains.map((c, i) => ({ c, i, name: this.#nameOf(c.code) }))
      .filter(({ c, name }) => BURN[name] && c.controller === this.seat && !this.#chainedThisWindow.has(`${c.code}:${c.description}`) && !this.#locked(c.code))
      .map(({ i, name }) => ({ i, name, dmg: BURN[name]!(ctx) }));
  }

  /** The next card of a burn chain that ends the duel, or null: what my links on this chain already deal, plus every
   *  burn card offered; or Chain Strike on top of one of each name (it needs no name twice in the chain), 400 per link. */
  #burnChain(ev: P<"selectChain">): number | null {
    if (ev.chains.every((c) => !BURN[this.#nameOf(c.code)])) return null;
    const ctx = this.#ctx();
    const offered = this.#burnOffered(ev, ctx);
    if (offered.length === 0) return null;
    const names = this.#links.map((l) => this.#nameOf(l.code));
    const queued = this.#links.reduce((n, l, k) => {
      if (l.controller !== this.seat) return n;
      const name = this.#nameOf(l.code);
      return n + (name === "chain strike" ? 400 * (k + 1) : BURN[name]?.(ctx) ?? 0);
    }, 0);
    const others = offered.filter((x) => x.name !== "chain strike" && x.dmg > 0).sort((a, b) => b.dmg - a.dmg);
    const strike = offered.find((x) => x.name === "chain strike");
    const all = queued + others.reduce((n, x) => n + x.dmg, 0);
    if (strike && new Set(names).size === names.length && !names.includes("chain strike")) {
      const seen = new Set(names), under: typeof others = [];
      for (const x of others) if (!seen.has(x.name)) { seen.add(x.name); under.push(x); }
      const link = this.#links.length + under.length + 1;
      if (link >= 2 && queued + under.reduce((n, x) => n + x.dmg, 0) + 400 * link >= ctx.oppLp) return (under[0] ?? strike).i;
    }
    return all >= ctx.oppLp && others.length > 0 ? others[0]!.i : null;
  }

  /** A burn card worth 1000 or more to chain under Chain Strike (a name not in the chain yet), or -1. */
  #strikeFodder(ev: P<"selectChain">, ctx: RuleCtx): number {
    const names = new Set(this.#links.map((l) => this.#nameOf(l.code)));
    const x = this.#burnOffered(ev, ctx).filter((b) => b.name !== "chain strike" && !names.has(b.name) && b.dmg >= 1000).sort((a, b) => b.dmg - a.dmg)[0];
    return x ? x.i : -1;
  }

  /** Gorz the Emissary of Darkness in hand, no monster of mine, a direct attack about to hurt: every card on my field is a
   *  set card that leaves as it resolves and can go now, so they all go, and the damage summons Gorz (production took
   *  4200 holding Gorz over a set Secret Barrel and Just Desserts). The next one to chain, or null. */
  #gorzClear(ev: P<"selectChain">): number | null {
    const me = this.#me();
    if (!me || this.#turnPlayer === this.seat || !this.#attack?.direct || me.mzone.some(Boolean)) return null;
    if (!me.hand.some((c) => this.#nameOf(c) === "gorz the emissary of darkness")) return null;
    const mine = this.#links.filter((l) => l.controller === this.seat).map((l) => `${l.location}:${l.sequence}`);
    const offered = new Map<string, number>(ev.chains.map((c, i) => [`${c.location}:${c.sequence}`, i]));
    let next: number | null = null;
    for (let z = 0; z < me.szone.length; z++) {
      const c = me.szone[z];
      if (!c) continue;
      const key = `${LOCATION.SZONE}:${z}`;
      if (mine.includes(key)) continue;
      const i = offered.get(key);
      if (i === undefined || !isFaceDown(c.position) || ((this.#cards.brain.get(ev.chains[i]!.code)?.type ?? 0) & LASTING) !== 0) return null;
      if (this.#chainedThisWindow.has(`${ev.chains[i]!.code}:${ev.chains[i]!.description}`) || this.#locked(ev.chains[i]!.code)) return null;
      next ??= i;
    }
    return next;
  }

  /** What answering an attack with this card costs me beyond the card: a mass removal on a lone attacker (its other
   *  targets are lost), a discard or LP; the free one-for-one answers cost nothing more. */
  #answerCost(code: number, attackers: number): number {
    const name = this.#nameOf(code);
    if (MASS_ANSWER.test(name)) return attackers >= 2 ? 0 : 3;
    if (PAID_ANSWER.test(name)) return 2;
    return 1;
  }

  #selectCard(ev: P<"selectCard">): Json {
    // The attack-target follow-up: the best monster this attacker can destroy.
    if (this.#pendingAttacker !== null) {
      const atk = this.#pendingAttacker, planned = this.#plannedTarget;
      this.#pendingAttacker = null;
      this.#plannedTarget = undefined;
      const at = planned === undefined || planned === null ? -1
        : ev.cards.findIndex((c) => c.controller !== this.seat && (c.location & LOCATION.MZONE) !== 0 && c.sequence === planned);
      if (at >= 0) return respCards([at]);
      if (this.#style.fool) return respCards([0]);
      const idx = this.#bestAttackTarget(ev.cards, atk);
      if (idx >= 0) return respCards([idx]);
    }
    // An equip or a boost (Rush Recklessly) goes on our own monster: the one in the battle under way, else the strongest
    // (the engine offers both fields; production: a boost picked as removal raised the player's Celestia). A steal or
    // a weakening card keeps the opponent's.
    const hint = this.#hint;
    this.#hint = 0;
    const k = this.#cards.brain.get(this.#lastActivated);
    if ((hint === H_EQUIP || !!k?.has("boost")) && ev.min <= 1 && !k?.any(TAGS_NO_BOOST)) {
      const battler = this.#turnPlayer === this.seat ? this.#declaredAttacker?.sequence
        : this.#attack && this.#attack.target !== null ? this.#attack.target : undefined;
      let best = -1, bestAtk = -1;
      ev.cards.forEach((c, i) => {
        if (c.controller !== this.seat || (c.location & LOCATION.MZONE) === 0 || isFaceDown(c.position ?? 0)) return;
        const atk = c.sequence === battler ? Infinity : this.#liveAtk(c) ?? 0;
        if (atk > bestAtk) { bestAtk = atk; best = i; }
      });
      if (best >= 0) return respCards([best]);
    }
    // Combo plan: the goal fusion when the assembler offers Extra Deck choices; for a from-hand cost, protect the
    // pieces (send them last) and dump the grave-enabler first.
    const combo = this.#comboState();
    if (combo) {
      const goalIdx = ev.cards.findIndex((c) => (c.location & LOCATION.EXTRA) !== 0 && this.#nameOf(c.code) === combo.plan.fusion);
      if (goalIdx >= 0 && ev.min <= 1 && ev.max >= 1) return respCards([goalIdx]);
      const fromHandCost = ev.min >= 1 && ev.cards.length > 0 && ev.cards.every((c) => c.controller === this.seat && (c.location & LOCATION.HAND) !== 0);
      if (fromHandCost) {
        const rank = (i: number): number => { const n = this.#nameOf(ev.cards[i]!.code); return n === combo.plan.graveEnabler ? 0 : combo.plan.pieces.includes(n) ? 2 : 1; };
        const order = ev.cards.map((_, i) => i).sort((a, b) => rank(a) - rank(b));
        return respCards(order.slice(0, Math.min(Math.max(ev.min, 1), ev.cards.length)));
      }
    }
    if (this.#style.fool) return respCards(ev.cards.map((_, i) => i).slice(0, Math.max(ev.min, 0)));
    const ruled = this.#rulePick(ev.cards, ev.min, ev.max);
    if (ruled) return respCards(ruled);
    return respCards(this.#pickTargets(ev.cards, Math.max(ev.min, this.#optionalPicks(ev.cards, ev.max, hint)), ev.max, hint));
  }

  /** The card whose effect is asking for a pick: our link resolving now, else the card we activated last. */
  #pickSubject(): number {
    const l = this.#solving > 0 ? this.#links[this.#solving - 1] : undefined;
    return l && l.controller === this.seat ? l.code : this.#lastActivated;
  }

  /** The asking card's pick rule (CardRule.pick) over the offered cards: indices by score, highest first, those under
   *  its min left out unless the prompt needs them; null without a rule. */
  #rulePick(cards: CardRef[], min: number, max: number): number[] | null {
    const pick = this.#ruleFor(this.#pickSubject())?.pick;
    if (!pick || cards.length === 0) return null;
    const ctx = this.#ctx();
    const ranked = cards.map((c, i) => { const s = pick.score(ctx, this.#ruleCard(c)); return { i, s: s >= 0 && this.#isAttacker(c) ? s + 1e5 : s }; }).sort((a, b) => b.s - a.s);
    const cap = Math.min(max > 0 ? max : cards.length, cards.length);
    const out: number[] = [];
    for (const r of ranked) {
      if (out.length >= cap) break;
      if (out.length >= min && pick.min !== undefined && r.s < pick.min) break;
      out.push(r.i);
    }
    return out;
  }

  /** The opponent's monster attacking me now (their Battle Phase, its attack declared, its damage not calculated yet:
   *  production bounced a Dark Nephthys whose attack was over and Sillva's 2300 came through for the duel). */
  #isAttacker(c: CardRef): boolean {
    return !!this.#attack && !this.#attack.resolved && this.#turnPlayer !== this.seat && c.controller !== this.seat && (c.location & LOCATION.MZONE) !== 0 && c.sequence === this.#attack.sequence;
  }

  /** An offered card as a pick rule reads it. */
  #ruleCard(c: CardRef): RuleCard {
    const snap = this.#snap(c);
    const code = snap?.code || c.code;
    const st = code ? this.#stat(code) : { atk: 0, def: 0, level: 0 };
    const type = code ? this.#cards.brain.get(code)?.type ?? 0 : 0;
    const pos = snap?.position ?? c.position ?? 0;
    const L = c.location;
    return {
      atk: snap?.attack ?? st.atk, def: snap?.defense ?? st.def, level: snap?.level ?? st.level,
      faceDown: (L & (LOCATION.MZONE | LOCATION.SZONE)) !== 0 && isFaceDown(pos), attackPos: (pos & POS.ATTACK) !== 0 && !isFaceDown(pos),
      fusion: (type & TYPE_FUSION) !== 0, battleProof: false,
      mine: c.controller === this.seat, onField: (L & (LOCATION.MZONE | LOCATION.SZONE)) !== 0, inHand: (L & LOCATION.HAND) !== 0,
      inGrave: (L & LOCATION.GRAVE) !== 0, inDeck: (L & LOCATION.DECK) !== 0, inExtra: (L & LOCATION.EXTRA) !== 0,
      banished: (L & LOCATION.REMOVED) !== 0, isMonster: (type & TYPE_MONSTER) !== 0, isSpell: (type & TYPE_SPELL) !== 0,
      isTrap: (type & TYPE_TRAP) !== 0, name: code ? this.#nameOf(code) : "",
      copyInHand: !!code && (this.#me()?.hand.filter((h) => h === code).length ?? 0) > ((L & LOCATION.HAND) !== 0 && c.controller === this.seat ? 1 : 0),
      chainHit: c.controller === this.seat && this.#liveOppLinks().some((l) => l.targets.includes(`${L}:${c.sequence}`)),
      canAttack: c.controller === this.seat && (L & LOCATION.MZONE) !== 0 && (pos & POS.ATTACK) !== 0 && !isFaceDown(pos)
        && this.#turnPlayer === this.seat && (this.#board?.phase ?? 0) < PHASE.MAIN2 && !this.#attackedThisTurn.has(c.sequence),
      alreadyHave: !!code && (() => {
        const me = this.#me(); if (!me) return false;
        const mine = [...me.hand, ...[...me.mzone, ...me.szone].filter((x): x is BoardCard => !!x).map((x) => x.code)];
        const here = c.controller === this.seat && (L & (LOCATION.HAND | LOCATION.MZONE | LOCATION.SZONE)) !== 0 ? 1 : 0;
        return mine.filter((x) => x === code).length > here;
      })(),
      copyOnField: !!code && (() => {
        const me = this.#me(); if (!me) return false;
        const ups = [...me.mzone.map((x, i) => ({ x, loc: LOCATION.MZONE, i })), ...me.szone.map((x, i) => ({ x, loc: LOCATION.SZONE, i }))]
          .filter(({ x }) => x && x.code === code && !isFaceDown(x.position));
        return ups.some(({ loc, i }) => !(c.controller === this.seat && (L & loc) !== 0 && c.sequence === i));
      })(),
      worth: code ? this.#worth(code, (L & LOCATION.HAND) !== 0) : 0,
      revenge: !!code && REVENGE.has(code),
    } as RuleCard;
  }

  /** How many cards an optional pick (min 0) is worth taking: the opponent's cards on the field (removal: as many as
   *  allowed), our own Deck / Extra Deck (a search) or our own cards the engine adds to the hand (Backup Soldier's
   *  graveyard recovery: production took one Exodia piece of two); anything else (a cost, our own field) none. */
  #optionalPicks(cards: CardRef[], max: number, hint = 0): number {
    if (cards.length === 0) return 0;
    const cap = max > 0 ? max : cards.length;
    if (hint === H_ATOHAND && cards.every((c) => c.controller === this.seat)) return Math.min(cap, cards.length);
    const theirs = cards.filter((c) => c.controller !== this.seat);
    if (theirs.length > 0 && theirs.every((c) => (c.location & (LOCATION.MZONE | LOCATION.SZONE)) !== 0)
      && cards.every((c) => c.controller !== this.seat || (c.location & (LOCATION.MZONE | LOCATION.SZONE)) === 0)) return Math.min(cap, theirs.length);
    if (cards.every((c) => c.controller === this.seat && (c.location & (LOCATION.DECK | LOCATION.EXTRA)) !== 0)) return Math.min(cap, cards.length);
    return 0;
  }

  #selectUnselect(ev: P<"selectUnselectCard">): Json {
    const choose = (index: number | null) => {
      this.#summonMaterialCount = ev.unselectable.length + (index === null ? 0 : 1);
      return respUnselect(index);
    };
    if (ev.selectable.length === 0) return choose(null);
    // Eight Machines give Chimeratech 6400 ATK and eight monster attacks. Keep the
    // rest of the deck instead of dumping every remaining monster for Future Fusion.
    if (this.#nameOf(this.#pickSubject()) === "future fusion" && ev.finishable && ev.unselectable.length >= 8) return choose(null);
    // the asking card's pick rule: its best card still offered, until it is satisfied
    const rule = this.#ruleFor(this.#pickSubject())?.pick;
    if (rule && !this.#style.fool) {
      const ctx = this.#ctx();
      const best = ev.selectable.map((c, i) => ({ i, s: rule.score(ctx, this.#ruleCard(c)) })).sort((a, b) => b.s - a.s)[0]!;
      const need = ev.unselectable.length < ev.min;
      if (!need && (ev.finishable || ev.min <= 0) && (rule.min !== undefined ? best.s < rule.min : ev.unselectable.length >= Math.max(ev.min, 1))) return choose(null);
      return choose(best.i);
    }
    if (ev.min <= 0 || ev.finishable) {
      // still worth another card (an optional removal or search not filled yet)?
      const want = this.#style.fool ? 0 : this.#optionalPicks([...ev.selectable, ...ev.unselectable], ev.max, this.#hint);
      if (ev.unselectable.length >= want) return choose(null);
    }
    const pick = this.#pickTargets(ev.selectable, 1, 1)[0];
    return choose(pick ?? 0);
  }

  #selectTribute(ev: P<"selectTribute">): Json {
    // a card's own tribute cost: its pick rule (the highest score is given up first)
    const ruled = this.#rulePick(ev.cards, ev.min, ev.min);
    if (ruled) return respTribute(ruled);
    // Feed a stolen monster first (it goes back otherwise), then the weakest, enough to satisfy the minimum.
    const stolen = (c: CardRef): boolean => { const b = this.#snap(c); return !!b && b.owner !== undefined && b.owner !== b.controller && this.#lentTurn === this.#turn; };
    // Master Duel: then a monster outside the battle plan before a planned attacker (D-costs.md §7.1), the weakest first
    const planned = this.#storedPlan();
    const ranked = ev.cards
      .map((c, index) => ({ index, atk: stolen(c) ? -1 : (this.#liveAtk(c) ?? this.#stat(c.code).atk) - afterlife(c.code)
        + ((c.location & LOCATION.MZONE) !== 0 && planned.has(c.sequence) ? 100000 : 0), param: c.releaseParam }))
      .sort((a, b) => a.atk - b.atk);
    const picks: number[] = [];
    let weight = 0;
    for (const r of ranked) {
      if (weight >= ev.min) break;
      picks.push(r.index);
      weight += Math.max(1, r.param & 0xf); // low nibble: how many tributes this card counts as
    }
    while (picks.length < ev.min) { const next = ranked[picks.length]; if (!next) break; picks.push(next.index); }
    return respTribute(picks);
  }

  /** Target indices for a card prompt, through the controller-aware chooseTargets() below. */
  #pickTargets(cards: CardRef[], min: number, max: number, hint = 0): number[] {
    const acquisition = cards.length > 0 && cards.every((c) => c.controller === this.seat && (c.location & (LOCATION.DECK | LOCATION.EXTRA)) !== 0);
    const ctx = acquisition ? this.#ctx() : null;
    const valued = cards.map((c) => ({
      controller: c.controller,
      location: c.location,
      // Deck searches should find engine starters, not merely the highest printed ATK.
      value: this.#removalValue(c) + (ctx && c.code ? (this.#ruleFor(c.code)?.summonScore?.(ctx) ?? 0) : 0),
    }));
    // the engine says the pick summons or adds the card (a Special Summon from the hand: Marauding Captain): our best,
    // not the cheapest as a cost would be
    const gain = hint === H_SPSUMMON || hint === H_SUMMON || hint === H_ATOHAND;
    // a card from my hand to set (Dust Tornado's "Set 1 card"): a trap or quick-play that works from the field, my best
    // one; else the least worth, a decoy
    if (hint === H_SET && cards.length > 0 && cards.every((c) => c.controller === this.seat && (c.location & LOCATION.HAND) !== 0 && c.code)) {
      const n = Math.min(Math.max(min, 1), max > 0 ? max : cards.length);
      const live = (c: CardRef) => ((this.#cards.brain.get(c.code)?.type ?? 0) & (TYPE_TRAP | TYPE_QUICKPLAY)) !== 0 && !neverSet(c.code) && !this.#locked(c.code);
      return cards.map((c, i) => ({ i, k: live(c) ? 1e5 + this.#worth(c.code, true) : -this.#worth(c.code, true) }))
        .sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.i);
    }
    // giving up cards from my own hand (a discard, a cost): Master Duel's cost picker order
    if (!gain && cards.length > 0 && cards.every((c) => c.controller === this.seat && (c.location & LOCATION.HAND) !== 0 && c.code)) {
      const n = Math.min(Math.max(min, 0), max > 0 ? max : cards.length);
      return (costOrder(this.#costView(cards.map((c) => c.code))) ?? []).slice(0, n);
    }
    return chooseTargets(valued, this.seat, min, max, gain, hint);
  }

  /** Among the offered attack targets, the one whose post-combat board evaluates best (exact combat). */
  #bestAttackTarget(cards: CardRef[], atk: number): number {
    const base = this.#battlePosition();
    const built = cards.map((c) => {
      const s = this.#snap(c);
      const pos = s?.position ?? c.position ?? 0;
      const faceDown = isFaceDown(pos);
      const code = s?.code || c.code;
      const st = this.#stat(code);
      // An unknown set monster is the same UNKNOWN_WALL DEF wall the base position holds (so the kill is found in it).
      const known = !faceDown || !!code;
      const exact: EvalMon = {
        atk: known ? s?.attack ?? st.atk : 0, def: known ? s?.defense ?? st.def : UNKNOWN_WALL, faceDown,
        attackPos: (pos & POS.ATTACK) !== 0 && !faceDown,
        known,
        flipRisk: faceDown ? (code ? this.#cards.flipRisk(code) : 300) : 0,
        battleProof: this.#battleProofAt(c.controller, c.sequence, code), battleTrigger: !!code && BATTLE_TRIGGER.has(code), revenge: !!code && REVENGE.has(code),
      };
      return { faceDown, exact };
    });
    const hidden = built.map((x, i) => (x.faceDown ? i : -1)).filter((i) => i >= 0);
    const anonymize = this.#vision && hidden.length >= 2;
    let best = 0, bestScore = -Infinity;
    built.forEach(({ faceDown, exact }, index) => {
      const mon = anonymize && faceDown ? { ...exact, atk: 0, def: UNKNOWN_WALL, known: false, flipRisk: 300 } : exact;
      const score = this.#attackScore(base, atk, mon);
      if (score > bestScore) { bestScore = score; best = index; }
    });
    // All anonymised set targets score the same: sample uniformly among them.
    if (anonymize && built[best]?.faceDown) return hidden[Math.floor(this.#rng() * hidden.length)] ?? best;
    return best;
  }

  #removalValue(c: CardRef): number {
    // HONESTY GUARD: a prompt offering the opponent's HAND is a random pick, even with spy vision: equal value plus
    // rng jitter = a uniformly random pick.
    if (c.controller !== this.seat && (c.location & LOCATION.HAND) !== 0) return 1000 + this.#rng();
    // Our own hand / deck / Extra Deck: the card for what it is (their position reads face-down: all were 1500, so
    // a discard or a search took the first one listed).
    if (c.controller === this.seat && c.code && (c.location & (LOCATION.HAND | LOCATION.DECK | LOCATION.EXTRA)) !== 0) return this.#worth(c.code, (c.location & LOCATION.HAND) !== 0);
    if ((c.location & LOCATION.SZONE) !== 0 && this.#spent(c.controller, c.sequence)) return -1;
    // the monster attacking me right now: removing it stops the damage (production's Compulsory Evacuation Device and
    // Raigeki Break took another monster and the 1400 still came through)
    if (this.#isAttacker(c)) return 1e5;
    const live = this.#liveAtk(c);
    if (live !== undefined) {
      // Master Duel spends removal on the monsters its battle cannot handle: one our attackers already beat is worth half
      if (c.controller !== this.seat && (c.location & LOCATION.MZONE) !== 0) {
        // in their Battle Phase, one that can still attack this turn comes first (production bounced a Dark Nephthys whose
        // attack was over and Sillva's 2300 came through)
        const phase = this.#board?.phase ?? 0;
        const s = this.#snap(c), myBest = this.#maxAttackAtk(this.#monstersOf(this.#me()));
        if (this.#turnPlayer !== this.seat && phase > PHASE.MAIN1 && phase < PHASE.MAIN2 && s && !isFaceDown(s.position)
          && (s.position & POS.ATTACK) !== 0 && !this.#oppAttackedThisTurn.has(c.sequence)) return live + 1500;
        const hold = s && (s.position & POS.DEFENSE) !== 0 ? s.defense ?? 0 : live;
        if (myBest > hold && !this.#battleProofAt(c.controller, c.sequence, s?.code ?? 0)) return live * 0.5;
      }
      return live;
    }
    // Face-down on the FIELD: spy vision reads it off the (unmasked) board.
    if (this.#vision) {
      const s = this.#snap(c);
      if (s?.code) {
        if ((s.location & LOCATION.MZONE) !== 0) return Math.max(s.attack ?? 0, s.defense ?? 0);
        return THREAT_BACKROW.test(this.#nameOf(s.code)) ? 1800 : 300;
      }
    }
    return isFaceDown(c.position ?? 0) ? UNKNOWN_WALL : (c.code ? this.#stat(c.code).atk : 0);
  }

  /** A card of ours off the field, for a discard (the lowest goes) or a search (the highest comes): a monster by its
   *  ATK, less when it needs tributes; a spell or trap above a plain body, more with a rule that plays it first, more
   *  as an answer to an attack (Mirror Force over a Field Spell: production's A Cat of Ill Omen took the first one
   *  listed), more still with the opponent's attackers on the field; a second lasting copy of a card already face-up
   *  on my field (another Field Spell, a lock already running) is worth little. */
  #worth(code: number, inHand = false): number {
    if (this.#ruleFor(code)?.keepInHand) return 9000;
    const k = this.#cards.brain.get(code);
    if (!k) return this.#stat(code).atk || 1000;
    let v: number;
    if (k.type & TYPE_MONSTER) {
      const t = k.is_extra ? 0 : k.tributes();
      v = this.#stat(code).atk * (t === 0 ? 1 : t === 1 ? 0.7 : 0.45);
      // one that can be summoned without tributes is worth at least that body (Fusilier Dragon's 1400)
      const free = NO_TRIBUTE_STATS[this.#nameOf(code)];
      if (free) v = Math.max(v, free.atk);
      // in hand (a discard), one whose effect removes a card is more than its body (production discarded Exiled Force, its
      // only removal), and so is one that brings another from the Deck (Gravekeeper's Spy, discarded over a second
      // Brain Control); a search still takes the stronger body (the lab's HERO deck searched Exiled Force over Stratos)
      if (inHand && (k.any(REMOVAL) || k.has("destroy_any"))) v += 500;
      else if (inHand && CATEGORY.recruit.has(code)) v += 300;
    } else {
      v = 1300 + (this.#ruleFor(code)?.idlePriority ?? 0) * 4;
      const name = this.#nameOf(code);
      const me0 = this.#me();
      // a Ritual Spell with no Ritual Monster in hand, a card whose LP cost I cannot pay: dead (production discarded its
      // only monster over two dead Ritual Spells, and a Gravekeeper's Spy over a Brain Control at 100 LP)
      if ((k.type & TYPE_RITUAL) && !(me0?.hand.some((c) => ((this.#cards.brain.get(c)?.type ?? 0) & (TYPE_MONSTER | TYPE_RITUAL)) === (TYPE_MONSTER | TYPE_RITUAL)) ?? false)) v -= 1000;
      if ((LP_COST[name] ?? 0) >= (me0?.lp ?? 8000)) v -= 1000;
      // half of a pair: dead without its partner on my field or in my hand, worth more beside it (production discarded
      // Necrovalley and kept the Royal Tribute that needs it)
      const partner = NEEDS[name];
      if (partner && me0 && ![...me0.hand, ...me0.szone.map((c) => c?.code ?? 0)].some((c) => c && this.#nameOf(c) === partner)) v -= 1000;
      if (me0 && Object.entries(NEEDS).some(([card, need]) => need === name && me0.hand.some((c) => this.#nameOf(c) === card))) v += 300;
      const answer = (k.type & (TYPE_TRAP | TYPE_QUICKPLAY)) !== 0;
      if (answer && THREAT_BACKROW.test(name)) v += 500;
      if (answer && this.#oppMonsters().some((m) => m.attackPos)) v += 300;
      const me = this.#me();
      const upCopy = !!me && me.szone.some((c) => c && c.code === code && !isFaceDown(c.position));
      if ((k.type & LASTING) !== 0 && (upCopy || (LOCKS.test(name) && this.#myLockUp()))) v -= 800;
    }
    return v + this.#want(code, k, inHand);
  }

  /** A battle lock of mine is face-up (Messenger of Peace, Gravity Bind, Level Limit - Area B...). */
  #myLockUp(): boolean {
    return !!this.#me()?.szone.some((c) => c && c.code && !isFaceDown(c.position) && LOCKS.test(this.#nameOf(c.code)));
  }

  /** What the board wants right now (a wishlist over hand and field): a second copy of a card already in hand is worth
   *  less (discarded first, not searched again), a small body while a tribute monster waits in the hand with nothing
   *  to tribute is worth more, and so is removal while the opponent has the bigger monster. */
  #want(code: number, k: NonNullable<ReturnType<BrainDB["get"]>>, inHand: boolean): number {
    const me = this.#me();
    if (!me) return 0;
    let w = 0;
    if (me.hand.filter((c) => c === code).length >= (inHand ? 2 : 1)) w -= 400;
    // (hand discards and costs: costPick.ts, Master Duel's picker)
    if ((k.type & TYPE_MONSTER) && !k.is_extra && k.tributes() === 0) {
      const needs = Math.max(0, ...me.hand.map((c) => this.#cards.brain.get(c)?.tributes() ?? 0));
      if (needs > me.mzone.filter(Boolean).length) w += 300;
    }
    if (k.any(REMOVAL) && this.#oppMaxAtk() > this.#maxAttackAtk(this.#monstersOf(me))) w += 400;
    return w;
  }

  /** Current ATK of a known face-up monster (board first, base stats as fallback). */
  #liveAtk(c: CardRef): number | undefined {
    if (isFaceDown(c.position ?? 0)) return undefined;
    const s = this.#snap(c);
    if (s && !isFaceDown(s.position) && s.attack !== undefined) return s.attack;
    return c.code ? this.#stat(c.code).atk : undefined;
  }

  /** The referenced card on the board (its current, buffed stats). */
  #snap(c: CardRef): BoardCard | null {
    const p = this.#board?.players[c.controller];
    if (!p) return null;
    const zone = c.location & LOCATION.MZONE ? p.mzone : c.location & LOCATION.SZONE ? p.szone : null;
    return zone ? zone[c.sequence] ?? null : null;
  }

  // ---- small choices ----------------------------------------------------------------------------------------------
  /** One copy's optional effect (by where the card is: a second Giant Rat's trigger is not the first one's, production
   *  declined it as "already used this turn"). */
  #effKey(ev: P<"selectEffectYN">): string { return `eff:${ev.card.code}:${ev.description}:${ev.card.controller}:${ev.card.location}:${ev.card.sequence}`; }

  #effectYN(ev: P<"selectEffectYN">): Json {
    // A card's optional effect once per turn (yes again on a re-trigger would loop).
    const key = this.#effKey(ev);
    if (this.#activatedThisTurn.has(key)) return respEffectYN(false);
    // a card rule's own answer (yesNo), else yes
    const rule = this.#ruleFor(ev.card.code);
    if (rule?.yesNo && !rule.yesNo(this.#withSelf(this.#ctx(), ev.card.code, ev.card))) return respEffectYN(false);
    this.#activatedThisTurn.add(key);
    this.#activated(ev.card.code);
    return respEffectYN(true);
  }

  /** Face-up attack for a real attacker that can hold; a wall (DEF > ATK) or an outclassed body defends. */
  #position(code: number, positions: number): number {
    const printed = this.#stat(code);
    let { atk, def } = printed;
    if (this.#nameOf(code) === "chimeratech fortress dragon") atk = 1000 * Math.max(2, this.#summonMaterialCount);
    if (this.#nameOf(code) === "cyberdark dragon") {
      const me = this.#me();
      const drained = this.#board?.players.some(p => p.szone.some(c => c && !isFaceDown(c.position) && this.#nameOf(c.code) === "skill drain"));
      if (me && !drained) {
        const grave = me.grave.filter(c => ((this.#cards.brain.get(c)?.type ?? 0) & TYPE_MONSTER) !== 0);
        const space = me.szone.slice(0, 5).filter((c, i) => c && !this.#spent(this.seat, i)).length < 5;
        const dragon = space ? grave.filter(c => ((this.#cards.brain.get(c)?.race ?? 0) & 0x2000) !== 0)
          .reduce((best, c) => Math.max(best, this.#stat(c).atk), 0) : 0;
        // The equipped Dragon leaves the graveyard, so no longer supplies its extra 100 ATK.
        atk += grave.length * 100 + (dragon > 0 ? dragon - 100 : 0);
      }
    }
    const oppMax = this.#oppMaxAtk();
    // In attack only when it holds there: nothing bigger across, and not a wall by nature; or, my Battle Phase ahead,
    // when it dies in defence anyway and in attack it beats something now (production put Cyber Dragon in defence
    // facing a 1400 it ran over and a 2400 that beat it either way)
    const opp = this.#oppMonsters();
    const beats = opp.some((o) => !o.faceDown && !o.battleProof && atk > (o.attackPos ? o.atk : o.def));
    const doomed = this.#battleAhead() && def < oppMax && beats;
    // a "?" ATK set by its own summon (Chimeratech Overdragon: 800 per material, Dark Gaia) attacks on my turn (production
    // put a 4800 Overdragon in defence: its printed ATK read -2)
    const variable = atk < 0 && this.#battleAhead();
    const up = this.#allIn || this.#style.attackOnly || doomed || variable || (atk >= oppMax + 400 * this.#picky && !(def > atk && atk < 1500));
    const order = up
      ? [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]
      : [POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEUP_ATTACK, POS.FACEDOWN_ATTACK];
    for (const p of order) if (positions & p) return p;
    return POS.FACEUP_ATTACK;
  }

  #hasAttacker(): boolean {
    const me = this.#me();
    return !!me && me.mzone.some((c) => c && (c.position & POS.ATTACK) !== 0 && !isFaceDown(c.position));
  }

  /** What giving up a ritual / sum material costs: a monster in hand that cannot be summoned this turn (my Normal
   *  Summon used, or it needs tributes I lack) least, then hand monsters by worth, then my field's monsters (production
   *  gave up its face-up Manju for Zorc and kept a dead Gil Garth in hand, then had no blocker). */
  #materialCost(c: CardRef): number {
    const code = c.code;
    if ((c.location & LOCATION.HAND) !== 0) {
      const k = this.#cards.brain.get(code);
      const dead = this.#normalSummoned || (k?.tributes() ?? 0) > this.#monstersOf(this.#me()).length;
      return this.#worth(code, true) * (dead ? 0.3 : 1);
    }
    return 3000 + (this.#liveAtk(c) ?? this.#stat(code).atk);
  }

  /** Index of the best monster to summon: ATK plus its rule's summon bonus. */
  #argBestSummon(codes: number[], ctx: RuleCtx): number {
    let best = 0, bestScore = -Infinity;
    codes.forEach((code, i) => {
      const s = this.#stat(code).atk + (this.#ruleFor(code)?.summonScore?.(ctx) ?? 0);
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }
}

/** The engine's hints for a pick that gives the cards up. */
const GIVE_UP = new Set([H_RELEASE, H_DISCARD, H_REMOVE, H_TOGRAVE, H_TODECK]);

/**
 * Up to `max` (>= `min`) target indices for a card prompt, CONTROLLER-AWARE so the player never targets its own board
 * with removal:
 *   - the opponent controls ANY offered card: removal / disruption / a steal: take THEIR highest-value cards;
 *   - deck / extra / graveyard prompts: searches and revivals: take our HIGHEST-value card;
 *   - any other own-only prompt is a cost: give up our LOWEST-value card.
 */
export function chooseTargets(cards: { controller: number; location: number; value: number }[], seat: number, min: number, max: number, gainHint = false, hint = 0): number[] {
  if (cards.length === 0) return [];
  const n = Math.min(Math.max(min, 0), max > 0 ? max : cards.length);
  if (n === 0) return [];
  const all = cards.map((_, i) => i);
  // my own graveyard given up (banished, shuffled back, tributed as a cost: Dark Catapulter): the least worth first
  // (production banished its Flame Wingman)
  if (cards.every((c) => (c.location & LOCATION.GRAVE) !== 0 && c.controller === seat) && GIVE_UP.has(hint)) {
    return all.sort((a, b) => cards[a]!.value - cards[b]!.value).slice(0, n);
  }
  // Reborn can revive from EITHER graveyard: control is not removal intent in this prompt.
  if (cards.every((c) => (c.location & LOCATION.GRAVE) !== 0)) {
    return all.sort((a, b) => cards[b]!.value - cards[a]!.value).slice(0, n);
  }
  const theirs = all.filter((i) => cards[i]!.controller !== seat);
  if (theirs.length > 0) {
    const picks = theirs.slice().sort((a, b) => cards[b]!.value - cards[a]!.value).slice(0, n);
    if (picks.length < n) {
      const mine = all.filter((i) => cards[i]!.controller === seat).sort((a, b) => cards[a]!.value - cards[b]!.value);
      picks.push(...mine.slice(0, n - picks.length));
    }
    return picks;
  }
  const gain = gainHint || cards.every((c) => (c.location & (LOCATION.DECK | LOCATION.EXTRA)) !== 0);
  const revival = cards.some((c) => (c.location & LOCATION.GRAVE) !== 0);
  return all.sort((a, b) => ((gain || revival) ? cards[b]!.value - cards[a]!.value : cards[a]!.value - cards[b]!.value)).slice(0, n);
}
