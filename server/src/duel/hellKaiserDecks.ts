// Hell Kaiser uses the tuned Cyberdark boss recipe at every friendship stage.
// Source overrides survive regeneration of the private official deck tables. The owner
// allows forbidden staples; all NPCs still use the same honest AI.
const CYBERDARK_DECK = {
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
};

export const HELL_KAISER_DECKS: Record<string, { main: number[]; extra: number[] }> = Object.fromEntries(
  [78, 79, 80].map(id => [String(id), { main: [...CYBERDARK_DECK.main], extra: [...CYBERDARK_DECK.extra] }]),
);
