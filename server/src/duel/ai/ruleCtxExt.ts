// The board facts a card rule may read beyond the core RuleCtx (cardRules.ts): their names, for the rule compiler
// (ruleExpr.ts), and their meanings. heuristicBot.ts #ctxExt computes them; an unknown fact reads 0 / false.
// No imports: cardRules.ts and ruleExpr.ts both use it.
export const EXT_NUM = [
  "myDeck", "oppDeck", "chainLen",
  /** evaluate() of the board from my side (> 0: ahead), and the same in coarse steps (-4..4). */
  "boardEdge", "outlook",
  "oppFaceUpBackrow", "oppFaceUpSpells", "mySetBackrow", "myFreeStZones", "oppFreeZones",
  "myHandMonsters", "myHandSpare", "myHandMaxMonAtk",
  "myGraveMonsters", "myGraveSpells", "oppGraveMonsters", "myBanishedMaxAtk", "oppRemoved", "oppRemovedMaxAtk",
  "myEffectMon", "oppEffectMon",
  /** What the opponent's live chain links hit of mine: ATK of my monsters + 1000 per Spell/Trap; and how many cards. */
  "oppChainThreat", "oppChainHitsMine",
  /** ATK of the monster the opponent just summoned (this response window), 0 none. */
  "oppSummonAtk",
  /** The battle under way: damage to my LP from the opponent's attack, my battler's ATK, the opposing battler's
   *  ATK (attack position) or DEF. */
  "incomingDamage", "myBattlerAtk", "oppBattlerValue",
  /** The Level of the opponent's monster attacking me (0 none / unknown). */
  "attackerLevel",
  /** The card the rule is about: its current ATK / DEF and its value (ATK in attack position, else DEF), if it is a
   *  monster on my field (else its printed stats, value 0). */
  "selfAtk", "selfDef", "selfValue",
  /** What-if, under the real rules (an engine fork: simSearch.ts whatIf): the board's value after this card's activation
   *  has played out minus its value now; and the ATK of the monsters it brought to my field minus the ATK of mine it
   *  took away. Computed only when a rule reads them, with the lookahead (0 without it). */
  "effectGain", "effectSummonGain",
  /** The opponent's monsters that leave with a continuous / equip card of theirs (Call of the Haunted, Glorious
   *  Illusion, Premature Burial): destroying the card takes the monster too. */
  "oppLinkedMonsters",
  /** The value of the best removal target on the opponent's field (the NPC's removal picker: a monster my attackers
   *  cannot beat is worth its ATK, one they beat half, a set Spell/Trap 1000...). */
  "removalValue",
  /** Hand cards: dead now (a preferred discard, or a monster needing more tributes than I have); better in the
   *  graveyard (they gain from being discarded: Sangan-like, Dark World); Counter Traps (hand or set); cards that
   *  revive a monster (hand or set). */
  "myHandDead", "myHandDiscardPayoff", "myCounterTraps", "myReviveCards",
  /** How many of my Standby Phases the card the rule is about has spent face-up on my field (Wave-Motion Cannon's
   *  counters: 1000 damage each). */
  "selfStandbys",
  /** The opponent's cards seen (field, graveyard, banished) that gain from being discarded (Dark World): a card that
   *  makes them discard feeds them. */
  "oppDiscardPayoff",
  /** My set Spell/Trap cards that answer an attack (Sakuretsu Armor, Mirror Force, Magic Cylinder...). */
  "mySetAttackAnswers",
  /** What my Battle Phase gains with the opponent's strongest face-up monster on my side instead (a steal: battlePlan.ts
   *  tradeValue, it goes back at the End Phase), 0 without one. */
  "stealGain",
  /** My face-up "Archfiend" monsters (Falling Down is destroyed without one). */
  "myArchfiends",
  /** My face-up Spell/Trap cards that hold a monster on my field (Call of the Haunted, Premature Burial, Snatch Steal):
   *  destroying them takes the monster too. */
  "myLinkedCards",
] as const;
export const EXT_BOOL = [
  /** My turn, before my Battle Phase is over (Main Phase 1 or the Battle Phase); my Main Phase 2; a battle under way. */
  "preBattle", "afterBattle", "inBattle", "oppStandby",
  /** A spare card to discard (myHandSpare >= 1); a monster of mine worth little as a tribute (or one I only borrowed). */
  "discardFodder", "cheapTribute",
  "myFieldSpell", "myLockActive",
  /** The opponent's live top link is a Spell / Trap / one that stays on the field (Continuous, Equip, Field); it would
   *  destroy or remove one of my Spell / Trap cards; it works from a graveyard (a revival). */
  "oppChainedSpell", "oppChainedTrap", "oppChainedLingering", "oppChainHitsMyBackrow", "oppChainUsesGrave",
  "oppSummoning",
  /** My attacking monsters (face-up, attack position) would be lethal with the opponent's field empty; my attacks
   *  this turn are lethal on the board as it is (the battle plan, set cards aside). */
  "lethalOnEmpty", "lethalThrough",
  /** The opponent's attack would destroy the monster of mine it targets; its attacker came from the Extra Deck; the
   *  monster it targets gets something back when it is destroyed (a search, a summon, a revival: Peten the Dark Clown). */
  "attackTargetLoses", "attackerExtra", "attackTargetFloats",
  /** The card the rule is about is hit by a live opponent link; a face-up copy of it is already on the field. */
  "selfThreatened", "sameCardActive",
  /** Master Duel's attack-response facts: the attack would cost me LP or the monster it hits; the attacker is the
   *  strongest monster the opponent can still attack with; the opponent's attacks this turn add up to my LP. */
  "attackHurts", "attackerIsStrongest", "oppPlanLethal",
  /** A face-up card negates Trap effects (Royal Decree, Jinzo): a Trap activated now does nothing. */
  "trapLock",
  /** The opponent's turn and it has not Normal Summoned or Set a monster yet (one more summon may follow). */
  "oppCanNormalSummon",
  /** The opponent controls a battle lock (Swords of Revealing Light, Nightmare's Steelcage, Messenger of Peace...). */
  "oppLockActive",
  /** My turn and my Normal Summon / Set is still unused. */
  "normalSummonLeft",
  /** I control a face-down FLIP monster (flipping it by an effect would waste it). */
  "mySetFlipMon",
  /** The opponent's attacks this turn add up to my LP (oppPlanLethal by its other name). */
  "oppLethalThrough",
  /** My Main Phase 1 with my Battle Phase still to come (never on the duel's first turn). */
  "battlePhaseAhead",
  /** A burn that hits both players each Standby Phase, 300 doubling (Dark Snake Syndrome), kills the opponent before me
   *  (a face-up Des Wombat of mine takes my share away). */
  "doublingBurnWins",
] as const;
export type RuleCtxExt = Partial<Record<(typeof EXT_NUM)[number], number> & Record<(typeof EXT_BOOL)[number], boolean>>;
