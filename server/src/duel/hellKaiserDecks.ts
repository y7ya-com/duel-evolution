// Hell Kaiser's tuned 2008 recipes. Friendship selects Cyber fusion (78), Cyberdark (79),
// or Chimeratech (80); all NPCs use the same honest AI. These source overrides survive
// regeneration of the private official deck tables. The owner allows forbidden staples
// for this boss, including extra draw power to assemble the fusion plans reliably.
export const HELL_KAISER_DECKS: Record<string, { main: number[]; extra: number[] }> = {
  "78": {
    main: [
      70095154, 70095154, 70095154, // Cyber Dragon
      26439287, 26439287, // Proto-Cyber Dragon
      3370104, 3370104, 3370104, // Cyber Phoenix
      15717011, // The Light - Hex-Sealed Fusion
      26202165, // Sangan
      37630732, 37630732, 37630732, // Power Bond
      3659803, 3659803, 3659803, // Overload Fusion
      77565204, 77565204, 77565204, // Future Fusion
      23171610, // Limiter Removal
      19613556, // Heavy Storm
      42703248, // Giant Trunade
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      55144522, 55144522, 55144522, // Pot of Greed (boss exception: forbidden in player decks)
      79571449, 79571449, 79571449, // Graceful Charity (boss exception: forbidden in player decks)
      83764718, 83764718, // Monster Reborn (boss exception: forbidden in player decks)
      12580477, // Raigeki (boss exception: forbidden in player decks)
      18144506, // Harpie's Feather Duster (boss exception: forbidden in player decks)
      45986603, // Snatch Steal (boss exception: forbidden in player decks)
    ],
    extra: [
      74157028, 74157028, 74157028, // Cyber Twin Dragon
      1546123, 1546123, // Cyber End Dragon
      64599569, 64599569, 64599569, // Chimeratech Overdragon
      79229522, 79229522, // Chimeratech Fortress Dragon
    ],
  },
  "79": {
    main: [
      41230939, 41230939, 41230939, // Cyberdark Horn
      77625948, 77625948, 77625948, // Cyberdark Edge
      3019642, 3019642, 3019642, // Cyberdark Keel
      96005454, 96005454, 96005454, // Hunter Dragon
      39191307, 39191307, // Masked Dragon
      26202165, // Sangan
      85087012, // Card Trooper
      81439173, 81439173, 81439173, // Foolish Burial
      77565204, // Future Fusion
      80033124, // Cyberdark Impact!
      19613556, // Heavy Storm
      42703248, // Giant Trunade
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      29401950, // Bottomless Trap Hole
      41420027, // Solemn Judgment
      55144522, 55144522, 55144522, // Pot of Greed (boss exception: forbidden in player decks)
      79571449, 79571449, // Graceful Charity (boss exception: forbidden in player decks)
      83764718, // Monster Reborn (boss exception: forbidden in player decks)
      12580477, // Raigeki (boss exception: forbidden in player decks)
      18144506, // Harpie's Feather Duster (boss exception: forbidden in player decks)
      45986603, // Snatch Steal (boss exception: forbidden in player decks)
    ],
    extra: [
      40418351, 40418351, 40418351, // Cyberdark Dragon
      99267150, // Five-Headed Dragon
    ],
  },
  "80": {
    main: [
      70095154, 70095154, 70095154, // Cyber Dragon
      26439287, 26439287, // Proto-Cyber Dragon
      3370104, 3370104, 3370104, // Cyber Phoenix
      87621407, 87621407, // Dekoichi the Battlechanted Locomotive
      85087012, // Card Trooper
      77565204, 77565204, 77565204, // Future Fusion
      3659803, 3659803, 3659803, // Overload Fusion
      37630732, 37630732, // Power Bond
      23171610, // Limiter Removal
      19613556, // Heavy Storm
      42703248, // Giant Trunade
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, // Bottomless Trap Hole
      41420027, // Solemn Judgment
      55144522, 55144522, 55144522, // Pot of Greed (boss exception: forbidden in player decks)
      79571449, 79571449, 79571449, // Graceful Charity (boss exception: forbidden in player decks)
      83764718, 83764718, // Monster Reborn (boss exception: forbidden in player decks)
      12580477, // Raigeki (boss exception: forbidden in player decks)
      18144506, // Harpie's Feather Duster (boss exception: forbidden in player decks)
      45986603, // Snatch Steal (boss exception: forbidden in player decks)
    ],
    extra: [
      74157028, 74157028, 74157028, // Cyber Twin Dragon
      1546123, 1546123, // Cyber End Dragon
      64599569, 64599569, 64599569, // Chimeratech Overdragon
      79229522, 79229522, // Chimeratech Fortress Dragon
    ],
  },
};
