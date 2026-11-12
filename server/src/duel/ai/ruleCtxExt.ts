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
  /** The opponent's attack would destroy the monster of mine it targets; its attacker came from the Extra Deck. */
  "attackTargetLoses", "attackerExtra",
  /** The card the rule is about is hit by a live opponent link; a face-up copy of it is already on the field. */
  "selfThreatened", "sameCardActive",
  /** Master Duel's attack-response facts: the attack would cost me LP or the monster it hits; the attacker is the
   *  strongest monster the opponent can still attack with; the opponent's attacks this turn add up to my LP. */
  "attackHurts", "attackerIsStrongest", "oppPlanLethal",
  /** A face-up card negates Trap effects (Royal Decree, Jinzo): a Trap activated now does nothing. */
  "trapLock",
] as const;
export type RuleCtxExt = Partial<Record<(typeof EXT_NUM)[number], number> & Record<(typeof EXT_BOOL)[number], boolean>>;
