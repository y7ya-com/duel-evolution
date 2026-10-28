// NPC duel AI: TS port of py research/ia/brain.py (see brain.ts).
export { NpcBrain, Board, face_up, in_attack, NPC_RITUALES, setNpcRituales, type BrainResponse } from "./brain.ts";
export { Card, CardDB, declarable, OP, TAG_NAMES, type BrainCardsJson } from "./cards.ts";
export { type NpcProfile, type NpcProfilesJson, PERFILES, loadNpcProfile, makeProfile, porNivel, profileFromDict, pyRound } from "./profile.ts";
