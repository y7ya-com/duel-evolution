// Yugi keeps his classic fusion, Dark Magician, and Magnet/Slifer themes.
// These physical decks are the normal fallback while top-deck exposure blocks Heart of the Cards.
import type { Deck } from "./data.ts";

const YUGI_FUSIONS = [11901678, 11901678, 11901678, 66889139, 66889139, 66889139, 4796100, 4796100, 4796100, 98502113, 98502113, 98502113];

export const YUGI_DECKS: Record<string, Deck> = {
  "51": {
    main: [
      6368038, 6368038, // Gaia The Fierce Knight
      16589042, // Swift Gaia the Fierce Knight
      65240384, // Big Shield Gardna
      52077741, 52077741, 52077741, // Obnoxious Celtic Guard
      79109599, 79109599, 79109599, // King of the Swamp
      33508719, // Morphing Jar
      40640057, // Kuriboh
      70781052, 70781052, 70781052, // Summoned Skull
      5818798, // Gazelle the King of Mythical Beasts
      10667321, 10667321, 10667321, // Ancient Rules
      45986603, // Snatch Steal
      5318639, // Mystical Space Typhoon
      49328340, // Spiral Spear Strike
      70828912, // Premature Burial
      72302403, // Swords of Revealing Light
      24094653, 24094653, 24094653, // Polymerization
      53582587, // Torrential Tribute
      4178474, 4178474, // Raigeki Break
      35539880, 35539880, // Birthright
      44095762, // Mirror Force
      62279055, // Magic Cylinder
      97077563, // Call of the Haunted
      42703248, // Giant Trunade
      98045062, 98045062, // Enemy Controller
      14087893, // Book of Moon
      19613556, // Heavy Storm
    ],
    extra: [...YUGI_FUSIONS],
  },
  "52": {
    main: [
      73752131, 73752131, 73752131, // Skilled Dark Magician
      9156135, 9156135, // Apprentice Magician
      45141844, 45141844, 45141844, // Old Vindictive Magician
      40737112, // Dark Magician of Chaos
      69542930, // Dedication through Light and Darkness
      78193831, // Buster Blader
      45462639, 45462639, // Dark Red Enchanter
      46986414, 46986414, // Dark Magician
      38033121, // Dark Magician Girl
      2314238, // Dark Magic Attack
      63391643, // Thousand Knives
      14778250, 14778250, // The Tricky
      79109599, 79109599, // King of the Swamp
      19613556, // Heavy Storm
      25774450, // Mystic Box
      14087893, // Book of Moon
      28553439, 28553439, 28553439, // Magical Dimension
      70828912, // Premature Burial
      42703248, // Giant Trunade
      72302403, // Swords of Revealing Light
      24094653, 24094653, // Polymerization
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      50755, 50755, // Magician's Circle
      62279055, // Magic Cylinder
      97077563, // Call of the Haunted
      98045062, // Enemy Controller
    ],
    extra: [...YUGI_FUSIONS],
  },
  "53": {
    main: [
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      22589918, 22589918, // Reload
      69162969, // Lightning Vortex
      35762283, 35762283, 35762283, // Heart of the Underdog
      70828912, // Premature Burial
      81380218, 81380218, // Chorus of Sanctuary
      5318639, // Mystical Space Typhoon
      45986603, // Snatch Steal
      19613556, // Heavy Storm
      13039848, 13039848, 13039848, // Giant Soldier of Stone
      75347539, 75347539, // Valkyrion the Magna Warrior
      99785935, 99785935, 99785935, // Alpha The Magnet Warrior
      11549357, 11549357, 11549357, // Gamma the Magnet Warrior
      39256679, 39256679, 39256679, // Beta The Magnet Warrior
      15025844, 15025844, 15025844, // Mystical Elf
      69247929, // Gene-Warped Warwolf
      70781052, 70781052, // Summoned Skull
      10000020, // Slifer the Sky Dragon
      90928333, // Dark Factory of Mass Production
      43422537, 43422537, // Double Summon
      98045062, // Enemy Controller
      53582587, // Torrential Tribute
    ],
    extra: [...YUGI_FUSIONS],
  },
};
