// Constants of py research/traductor/translator.py (engine commands, dialog texts, tables). See py NOTES.md for the
// evidence behind each one; names are kept so the two files can be read side by side.
import { CMD_ATTACK, CMD_GENERIC, ZONE_BANISH, ZONE_DECK, ZONE_EXTRA, ZONE_GRAVE, ZONE_HAND } from "./lockstep.ts";

export const C_LP_GAIN = 0x24, C_LP_DAMAGE = 0x25, C_LP_SET = 0x26, C_LP_RESET = 0x27;
export const C_CHAIN_SET = 0x12, C_CHAIN_RUN = 0x13, C_BATTLE_RUN = 0x17, C_ATTACK = 0x19, C_DIRECT = 0x1a;
export const C_ATTACK_END = 0x1c, C_HAPPEN = 0x2f, C_FIELD_CHANGE = 0x14, C_REVEAL = 0x2e, C_FLASH = 0x30;
export const C_TO_GRAVE = 0x31, C_POSITION = 0x34, C_FLIP = 0x35, C_MOVE = 0x3f, C_MOVE_FIELD = 0x41, C_TOKEN = 0x48;
export const C_HAND_SHUFFLE = 0x4e, C_MONST_SHUFFLE = 0x49, C_SET_MONSTER = 0x4f, C_SET_SPELL = 0x50;
export const C_SUMMON_DONE = 0x45;
export const SUMMON_DONE_BITS: Record<string, number> = { SUMMONED: 0, SPSUMMONED: 2, FLIPSUMMONED: 8 };
export const SUMMON_DONE_SET = 4;
export const C_SUMMON_FX = 0x2c, SUMMON_FX_KIND = 2;
export const C_HAND_SHOW = 0x51, C_HAND_OPEN = 0x52, C_DICE = 0x5d, C_COIN = 0x5c, C_COUNTER = 0x3c;
export const C_FIELD_MOVE = 0x3d, C_SWAP = 0x3e;
export const COUNTER_MAP = new Map<number, number>([[0x01, 0], [0x1b, 2], [0x11, 3], [0x06, 4], [0x25, 5], [0x03, 6],
  [0x1c, 7], [0x05, 8], [0x2a, 16], [0x0e, 17], [0x15, 18], [0x09, 19], [0x19, 20]]);
export const C_SLOT_VALUE = 0x3a, C_TURN_COUNT = 0x3b;
export const CHINT_TURN = 1, CHINT_CARD = 2, CHINT_RACE = 3, CHINT_ATTRIBUTE = 4;
// Cards the 2008 client gives a turn counter (TURN_CARDS: passcode -> turns, 0xffff = endless) or one over the player
// (TURN_CARDS_NEG), and the declare-a-race / attribute / card ones whose choice it paints. By passcode (the base one:
// an alternate art goes through rulesKey). Two the client's engine knew but its card table never had are not here
// (internal 0x1ee4, 0xecc).
export const TURN_CARDS = new Map<number, number>([[40240595, 0xffff] /* Cocoon of Evolution */,
  [62121, 0xffff] /* Castle of Dark Illusions */, [29155212, 0xffff] /* Pumpking the King of Ghosts */,
  [72302403, 3] /* Swords of Revealing Light */, [24668830, 0xffff] /* Germ Infection */, [83225447, 0xffff] /* Stim-Pack */,
  [58775978, 2] /* Nightmare's Steelcage */, [69954399, 2] /* Ekibyo Drakmord */, [56043446, 3] /* Viser Des */,
  [88989706, 0xffff] /* Great Dezard */, [11961740, 2] /* Different Dimension Capsule */,
  [47233801, 0xffff] /* Dark Snake Syndrome */, [38992735, 0xffff] /* Wave-Motion Cannon */, [31476755, 2] /* Dust Barrier */,
  [12117532, 0xffff] /* Shattered Axe */, [48115277, 0xffff] /* Blockman */, [12923641, 2] /* Swords of Concealing Light */,
  [97362768, 0xffff] /* Spark Blaster */, [77565204, 2] /* Future Fusion */, [84808313, 3] /* Big Evolution Pill */,
  [79569173, 3] /* Seismic Shockwave */, [51670553, 2] /* Soul Devouring Bamboo Sword */, [1149109, 2] /* Deck Lockdown */,
  [60627999, 2] /* Sanguine Swamp */]);
export const TURN_CARDS_NEG = new Map<number, number>([[57728570, 3] /* Crush Card Virus */, [49587034, 4] /* Lightforce Sword */,
  [95308449, 20] /* Final Countdown */, [75500286, 2] /* Gold Sarcophagus */, [35027493, 3] /* Deck Devastation Virus */,
  [58015506, 2] /* Pikeru's Second Sight */, [21208154, 2] /* The Wicked Avatar */, [54974237, 3] /* Eradicator Epidemic Virus */]);
export const FINAL_COUNTDOWN = 95308449;
export const DECL_RACE = new Set([74701381 /* DNA Surgery */, 296499 /* The Regulation of Tribe */,
  69296555 /* Array of Revealing Light */, 1525329 /* The Hunter with 7 Weapons */]);
export const DECL_ATTR = new Set([10352095 /* Scroll of Bewitchment */, 56769674 /* DNA Transplant */,
  94253609 /* Elemental Absorber */, 27769400 /* Tualatin */]);
export const DECL_ATTR_BITS = new Set([15595052 /* Disciple of the Forbidden Spell */]);
export const DECL_CARD = new Set([43711255 /* Prohibition */, 8323633 /* Cloak and Dagger */]);
export const C_NPC_ANNOUNCE = 0x60, C_NPC_CHAIN = 0x62, C_NPC_TURN_END = 0x03;
export const T_REVEAL = 0x1d;
export const C_EFFECT_ADD = 0x36, C_EFFECT_DEL = 0x37, EFFECT_SET_STATS = 0x1c5f;
export const C_LINK = 0x42, C_LOCKON = 0x29;
export const C_TRIBUTE = 0x46, C_TRIBUTE_MARK = 0x4a, C_FUSION_MARK = 0x4b, C_FUSION_MAT = 0x4c, C_FUSION_RUN = 0x4d;
export const HINTMSG_RELEASE = 500, HINTMSG_FMATERIAL = 511;
export const T_STARS = 0x1f, VIEW_SET_MATERIAL = 0x29, DLGT_RITUAL = 0xe;
export const DLG_RITUAL_MONSTER = 286, DLG_RITUAL_STARS = 207, DLG_RITUAL_DECK = 289;
export const KIND_RITUAL = 8, KIND_OPP_HAND = 8, DLG_PICK_OPP_HAND = 244;
export const HINTMSG_SPSUMMON = 509, STARS_NONE = 0xff;
export const LINK_STALE: [number, number] = [-1, -1];
export const T_VIEW_LIST = 0x33, T_VIEW_DETAIL = 0x37, T_AIM = 0x47;
export const VIEW_BATTLE_INIT = 0x0a, VIEW_BATTLE_SELECT = 0x0b, VIEW_ATTACKER = 0x0c;
export const M_LIST = 0x6610;
export const LIST_ONE = 6, LIST_EXACT0 = 6, LIST_UPTO0 = 0x27;
/** CWindowDeckList kind 0x48: pick any number in order; right click closes it, also with none (FUN_0076a3f0). */
export const LIST_ANY = 0x48;
export const LIST_ZONES = [ZONE_DECK, ZONE_GRAVE, ZONE_BANISH, ZONE_EXTRA];
export const LIST_FUSION = 0xfe, LIST_DIALOG = 0xff;
export const DLG_EFFECT_YN = 250, DLG_EFFECT_YN_HAND = 328, DLG_EFFECT_YN_GRAVE = 329;
export const DLG_PICK_FIELD = 274, DLG_PICK_TRIBUTE = 18;
export const DLG_LINK_EFFECT = 7, DLG_LINK_CARD = 8, DLG_CHAIN = 269;
export const YESNO_SYS_DLG = new Map<number, number>([[30, 223], [31, 225], [32, 221], [94, 270], [210, 93]]);
/** "passcode,n" -> [dlg, card of the name (null | "self" | passcode), number | null] */
export const YESNO_DLG = new Map<string, [number, null | "self" | number, number | null]>([
  ["21502796,1", [353, null, null]], ["24140059,0", [305, null, null]], ["23927567,0", [305, null, null]],
  ["55256016,0", [104, null, null]], ["28553439,1", [104, null, null]], ["69270537,0", [89, null, null]],
  ["44656491,0", [232, "self", 100]], ["82432018,0", [232, "self", 1000]], ["22359980,0", [232, "self", 2000]],
  ["21598948,1", [232, "self", 500]], ["24874630,0", [232, "self", 1000]], ["92394653,1", [232, "self", 500]],
  ["81332143,2", [299, 14731897, null]],
]);
export const YESNO_SYS_CARD = new Map<number, number>([[96, 333]]);
export const REASON_NONE = 0xff;
export const DLGT_SELECT = 4, DLGT_RACE = 6, DLGT_ATTR = 7, DLGT_STAND = 8, DLGT_NUM = 0xb, DLGT_DISCARD = 0xd;
export const T_SETVAR16 = 0x1e, VAR_DISCARD = 1, DLG_DISCARD = 235, HINTMSG_DISCARD = 501;
export const OCG_PHASE_END = 0x200, HAND_LIMIT = 6, LIST_ANNOUNCE = 0x4b;
export const YO2_RACE = new Map<number, number>([[1, 0x2000], [2, 0x10], [3, 0x8], [4, 0x80], [5, 0x40000], [6, 0x100],
  [7, 0x20], [8, 0x20000], [9, 0x10000], [10, 0x800], [11, 0x4000], [12, 0x8000], [13, 0x400], [14, 0x40], [15, 0x1],
  [16, 0x200], [17, 0x4], [18, 0x2], [19, 0x1000], [20, 0x80000]]);
export const YO2_ATTR = new Map<number, number>([[1, 0x10], [2, 0x20], [3, 0x2], [4, 0x4], [5, 0x1], [6, 0x8]]);
export const DLG_SEL_RACE = 241, DLG_SEL_ATTR = 242, DLG_SEL_POS = 326, DLG_SEL_EFFECT = 259, DLG_SEL_CARDTYPE = 260;
export const DLG_NUM_LEVEL = 280, DLG_NUM_LP = 301, DLG_NUM_QTY = 594, DLG_NUM_COUNTERS = 317;
export const LBL_NUM = 283, LBL_LEVEL = 304, LBL_LP1000 = 302, LBL_LP100 = 303, LBL_COUNTERS = 318;
export const NUMBER_TEXTS = new Map<number, [number, number]>([[85087012, [330, 331]], [3280747, [296, LBL_NUM]]]);

/** aux.Stringid in the old format: code << 4 | n */
export const _sid = (code: number, n: number): number => code * 16 + n;

export const OPTION_DLG = new Map<number, number>([[70, 440], [71, 441], [72, 442],
  [_sid(967928, 0), 465], [_sid(967928, 1), 466],
  [_sid(1781310, 0), 458], [_sid(1781310, 1), 459], [_sid(1781310, 2), 421], [_sid(1781310, 3), 449],
  [_sid(1804528, 1), 426], [_sid(1804528, 2), 427],
  [_sid(6967870, 1), 431], [_sid(6967870, 2), 423],
  [_sid(8842266, 0), 406], [_sid(8842266, 1), 419],
  [_sid(10032958, 1), 462], [_sid(10032958, 2), 463], [_sid(10032958, 3), 464],
  [_sid(12183332, 1), 424], [_sid(12183332, 2), 425],
  [_sid(20065322, 0), 436], [_sid(20065322, 1), 478],
  [_sid(26931058, 1), 452], [_sid(26931058, 2), 453],
  [_sid(29424328, 1), 438], [_sid(29424328, 2), 439],
  [_sid(30461781, 0), 448], [_sid(30461781, 1), 449],
  [_sid(37390589, 1), 416], [_sid(37390589, 2), 417], [_sid(37390589, 3), 418],
  [_sid(39978267, 1), 454], [_sid(39978267, 2), 455],
  [_sid(40044918, 1), 470], [_sid(40044918, 2), 471],
  [_sid(40695128, 2), 438], [_sid(40695128, 3), 439],
  [_sid(48576971, 1), 448], [_sid(48576971, 2), 422],
  [_sid(48768179, 1), 434], [_sid(48768179, 2), 435],
  [_sid(53839837, 1), 440], [_sid(53839837, 2), 441], [_sid(53839837, 3), 442],
  [_sid(58074572, 0), 406], [_sid(58074572, 1), 407],
  [_sid(61587183, 1), 432], [_sid(61587183, 2), 433], [_sid(61587183, 3), 438], [_sid(61587183, 4), 439],
  [_sid(74153887, 1), 436], [_sid(74153887, 2), 437],
  [_sid(76754619, 0), 408], [_sid(76754619, 1), 409],
  [_sid(45653036, 0), 479], [_sid(45653036, 1), 480],
  [_sid(76922029, 1), 422], [_sid(76922029, 2), 423],
  [_sid(80161395, 1), 408], [_sid(80161395, 2), 409],
  [_sid(86198326, 0), 408], [_sid(86198326, 1), 409],
  [_sid(93130021, 1), 467], [_sid(93130021, 2), 468], [_sid(93130021, 3), 469],
  [_sid(98045062, 1), 446], [_sid(98045062, 2), 447]]);
/** "passcode,n0,n1" -> [dlg, card of the name, number] */
export const OPTION_YN = new Map<string, [number, null | "self" | number, number | null]>([
  ["78371393,3,4", [233, "self", null]], ["81332143,0,1", [298, null, null]]]);
export const OPT_YES = 1213, OPT_NO = 1214, DLG_MAGIC_DRAIN = 11;

export const OCG_DECK = 1, OCG_HAND = 2, OCG_MZONE = 4, OCG_SZONE = 8, OCG_GRAVE = 16, OCG_REMOVED = 32;
export const OCG_EXTRA = 64, OCG_OVERLAY = 128;
export const POS_FU_ATK = 1, POS_FD_ATK = 2, POS_FU_DEF = 4, POS_FD_DEF = 8;
export type PileName = "hand" | "deck" | "grave" | "banish" | "extra";
export type Where = PileName | "mz" | "sz";
export const PILE_ZONE: Record<PileName, number> = { hand: ZONE_HAND, deck: ZONE_DECK, grave: ZONE_GRAVE, banish: ZONE_BANISH, extra: ZONE_EXTRA };
export const OCG_PILE = new Map<number, PileName>([[OCG_DECK, "deck"], [OCG_HAND, "hand"], [OCG_GRAVE, "grave"],
  [OCG_REMOVED, "banish"], [OCG_EXTRA, "extra"]]);
export const PHASE_MAP = new Map<number, number>([[1, 0], [2, 1], [4, 2], [8, 3], [16, 3], [128, 3], [256, 4]]);

export const _LCG_A = 0x343fd, _LCG_C = 0x269ec3, _LCG_AINV = 3115528533;
export const HAND_SEED_TRIES = 120000, HAND_SEED_MAX_N = 9;

// --- §21/§28: CardScripts timings and the official chain prompts
export const EVENT_FREE_CHAIN = 1002, TIMING_ATTACK = 0x1000;
export const TIMING_DAMAGE_STEP = 0x2000, TIMING_DAMAGE_CAL = 0x4000, TIMING_BATTLE_PHASE = 0x1000000;
export const TIMINGS_BATTLE = TIMING_ATTACK | TIMING_DAMAGE_STEP | TIMING_DAMAGE_CAL | TIMING_BATTLE_PHASE;
/** [TIMING bit, dlg mine, dlg opponent's, P2 mine, P2 opponent's] by priority */
export const CHAIN_EVENTS: readonly (readonly [number, number, number, number, number])[] = [
  [0x1000, 182, 183, 2, 2], [0x4000, 266, 266, 2, 2], [0x2000, 177, 177, 2, 2], [0x200, 175, 176, 1, 1],
  [0x400, 159, 160, 1, 1], [0x800, 178, 178, 1, 1], [0x10000, 197, 198, 1, 1], [0x80000, 267, 267, 1, 1],
  [0x2000000, 196, 196, 1, 1], [0x20, 67, 251, 1, 2], [0x10, 0, 272, 1, 1], [0x4, 64, 64, 1, 1], [0x2, 63, 63, 1, 1],
  [0x1, 62, 62, 1, 1]];
export const CHAIN_SUMMONS = new Map<string, readonly [number, number, number, number, number]>([
  ["SUMMONING", [0x40, 169, 170, 1, 2]], ["SUMMONED", [0x40, 252, 253, 2, 1]],
  ["SPSUMMONING", [0x80, 173, 174, 1, 2]], ["SPSUMMONED", [0x80, 256, 257, 2, 1]],
  ["FLIPSUMMONING", [0x100, 171, 172, 1, 2]], ["FLIPSUMMONED", [0x100, 254, 255, 1, 1]]]);
export const CHAIN_DAMAGE = [189, 190, 1] as const;
export const CHAIN_SEP = 0xffff;
export const CHAIN_NONE = [204, 205, 206] as const;
export const CHAIN_NONE_P2 = 0;
export const LOCATION_HAND = 2;
export const _ET_ACTIVATE = 0x10, _ET_TRIGGER_O = 0x80, _ET_QUICK_O = 0x100, _ET_TRIGGER_F = 0x200, _ET_QUICK_F = 0x400;

export const IGNORED = new Set(["HINT", "CHAINED", "CHAIN_SOLVED", "CHAIN_NEGATED", "CHAIN_DISABLED", "CARD_SELECTED",
  "RANDOM_SELECTED", "BECOME_TARGET", "CARD_HINT", "PLAYER_HINT", "FIELD_DISABLED", "UPDATE_DATA", "UPDATE_CARD",
  "WAITING", "START", "MISSED_EFFECT", "CARD_TARGET", "CANCEL_TARGET", "EQUIP", "ADD_COUNTER", "REMOVE_COUNTER",
  "SHOW_HINT", "BE_CHAIN_TARGET", "CREATE_RELATION", "RELEASE_RELATION", "RETRY", "HAND_RES", "TOSS_COIN", "SWAP",
  "DECK_TOP", "REFRESH_DECK", "SHUFFLE_SET_CARD", "SHUFFLE_EXTRA", "AI_NAME", "MATCH_KILL", "REMOVE_CARDS"]);

/** translator.DEFAULT_CFG as the vanilla profile runs it (no YO2_* environment). */
export const DEFAULT_CFG: Record<string, any> = {
  lp: 8000, kind_main: 3, kind_battle: 3, kind_select: 3, select_bit: CMD_GENERIC, target_bit: CMD_ATTACK,
  yesno: "dialog", hide_npc: true, token_serial_base: null, finish_mode: 0, npc_phrases: false, pile_look: true,
  stat_sync: true, stat_sync_turn: true, summon_done: true, summon_kind_fx: true, token_vanish: true, yesno_card: true,
  yesno_sys_text: true, yesno_texts: true, option_yn: true, hand_open: true, number_texts: true,
  battle_damage_real: true, battle_damage_split: true, lp_type_oficial: true, lp_resync: false, lp_reconcile: true,
  lp_set_direct: true, chain_one_name: false, chain_link_detail: true, yesno_text: DLG_CHAIN, chain_dialog: 3,
  chain_importance: 2, chain_importance_auto: true, forced_auto_single: true, chain_card_name: false,
  chain_priority: "oficial", chain_event_text: true, chain_none_prompt: false, chain_priority_hand: true,
  chain_link_text: true, chain_yes_direct: false, pick_panel: false, activate_flash: false, chain_reveal: true,
  attack_aim: true, aim_target_bit: CMD_GENERIC, look_modes: { [ZONE_GRAVE]: 1, [ZONE_BANISH]: 4, [ZONE_EXTRA]: 1 },
  list_picks: true, place_manual: true, place_order: "centre", card_link: true, link_kind_equip: 10, link_kind_target: 9,
  link_target_anim: true, target_lockon: true, lockon_pile: true, counters: true, swap_cmd: true, monst_shuffle: true,
  field_move_3d: true, toss_anim: true, coin_call: 1, tribute_anim: true, tribute_mark: false, fusion_anim: true,
  fusion_needs_summon: true,   // ours, not py's (DESIGN.md "Deliberate changes from 2008"); py-parity replays: off
  fusion_official: true, turn_timer: 180, turn_limit: true, tiempo_gunslinger: 60.0, tiempo_respuesta: 180.0,
  tiempo_margen: 3.0, retry_auto: 2, field_change: true, position_dialog: true, announce_dialogs: true,
  option_dialog: true, sort_list: true, counter_dialog: true, hand_limit_dialog: true, turn_counter: true,
  declare_hint: true, ritual_sum: true, turn_counter_player: true, opp_hand_pick: true,
  // ours, not py's (DESIGN.md "Deliberate changes from 2008"); the py-parity replays turn it off
  unselect_list: true,
};
