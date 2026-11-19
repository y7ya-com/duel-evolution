// The NPCs' own recipes: these replace the official 2008 lists (gamedata duel.json) for the map NPCs and the famous
// duelists (Hell Kaiser and Yugi keep hellKaiserDecks.ts / yugiDecks.ts). Rebuilt in 2026-11 from the production
// duel archive: each keeps its NPC's theme and prize card (famous duelists: their anime/manga cards), 40 cards, the
// 2008 limits (a card the official list already ran keeps that count). Source overrides survive regeneration of the
// private official deck tables.
import type { Deck } from "./data.ts";

export const NPC_DECK_OVERRIDES: Record<string, Deck> = {
  // BeeBee
  "1": {
    main: [
      45985838, 45985838, 45985838, // Solar Flare Dragon
      60806437, 60806437, // UFO Turtle
      3510565, 3510565, 3510565, // Stealth Bird
      69579761, 69579761, // Des Koala
      23205979, // Spirit Reaper
      31305911, // Marshmallon
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      38992735, 38992735, // Wave-Motion Cannon
      44656491, 44656491, 44656491, // Messenger of Peace
      3136426, // Level Limit - Area B
      85742772, // Gravity Bind
      72302403, // Swords of Revealing Light
      70828912, // Premature Burial
      17078030, 17078030, // Wall of Revealing Light
      41420027, // Solemn Judgment
      54704216, 54704216, // Nightmare Wheel
      36468556, // Ceasefire
      27053506, 27053506, // Secret Barrel
      24068492, 24068492, // Just Desserts
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      70342110, 70342110, // Dimensional Prison
      29401950, // Bottomless Trap Hole
      83555666, // Ring of Destruction
      62279055, // Magic Cylinder
    ],
    extra: [],
  },
  // missbomb
  "2": {
    main: [
      9637706, 9637706, 9637706, // Des Wombat
      97017120, 97017120, 97017120, // Giant Rat
      69579761, 69579761, 69579761, // Des Koala
      22567609, 22567609, 22567609, // Nimble Momonga
      39168895, 39168895, 39168895, // Berserk Gorilla
      46668237, // Green Baboon, Defender of the Forest
      79182538, // Mad Dog of Darkness
      47233801, 47233801, // Dark Snake Syndrome
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      67169062, // Pot of Avarice
      72302403, // Swords of Revealing Light
      14087893, // Book of Moon
      97169186, // Smashing Ground
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      70342110, 70342110, // Dimensional Prison
      41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      97077563, // Call of the Haunted
      62279055, // Magic Cylinder
      83555666, // Ring of Destruction
      83986578, // King Tiger Wanghu
    ],
    extra: [],
  },
  // bankara
  "3": {
    main: [
      4929256, 4929256, 4929256, // Mobius the Frost Monarch
      26205777, 26205777, // Thestalos the Firestorm Monarch
      51945556, 51945556, // Zaborg the Thunder Monarch
      73125233, 73125233, // Raiza the Storm Monarch
      9748752, 9748752, // Caius the Shadow Monarch
      44330098, // Gorz the Emissary of Darkness
      70095154, 70095154, // Cyber Dragon
      12538374, // Treeborn Frog
      23205979, // Spirit Reaper
      31305911, // Marshmallon
      26202165, // Sangan
      85087012, // Card Trooper
      7572887, // D.D. Warrior Lady
      68005187, 68005187, // Soul Exchange
      98045062, // Enemy Controller
      87910978, 87910978, 87910978, // Brain Control
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      70342110, 70342110, // Dimensional Prison
      41420027, // Solemn Judgment
      56120475, // Sakuretsu Armor
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // kyoko
  "5": {
    main: [
      6214884, 6214884, 6214884, // Brron, Mad King of Dark World
      32619583, 32619583, 32619583, // Sillva, Warlord of Dark World
      78004197, 78004197, 78004197, // Goldd, Wu-Lord of Dark World
      79126789, 79126789, // Broww, Huntsman of Dark World
      33731070, 33731070, // Beiige, Vanguard of Dark World
      25847467, 25847467, // Kahkki, Guerilla of Dark World
      44330098, // Gorz the Emissary of Darkness
      26202165, // Sangan
      28985331, // Armageddon Knight
      65192027, // Dark Armed Dragon
      74117290, 74117290, 74117290, // Dark World Dealings
      93554166, 93554166, 93554166, // Dark World Lightning
      93431518, 93431518, // Gateway to Dark World
      72892473, // Card Destruction
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      29401950, 29401950, // Bottomless Trap Hole
      41420027, // Solemn Judgment
      97077563, // Call of the Haunted
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
      80344569, // Neo-Spacian Grand Mole
    ],
    extra: [],
  },
  // gouk
  "7": {
    main: [
      84636823, 84636823, // Spell Canceller
      4929256, 4929256, // Mobius the Frost Monarch
      51945556, 51945556, // Zaborg the Thunder Monarch
      70095154, 70095154, 70095154, // Cyber Dragon
      48092532, 48092532, // D.D. Survivor
      94853057, 94853057, // Banisher of the Radiance
      7572887, // D.D. Warrior Lady
      44330098, // Gorz the Emissary of Darkness
      71564252, 71564252, // Thunder King Rai-Oh
      12538374, // Treeborn Frog
      30241314, 30241314, // Macro Cosmos
      29401950, 29401950, 29401950, // Bottomless Trap Hole
      70342110, 70342110, 70342110, // Dimensional Prison
      41420027, 41420027, // Solemn Judgment
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      56120475, 56120475, // Sakuretsu Armor
      94192409, 94192409, // Compulsory Evacuation Device
      97077563, // Call of the Haunted
      60082869, 60082869, // Dust Tornado
      83555666, // Ring of Destruction
      70074904, 70074904, // D.D. Assailant
    ],
    extra: [],
  },
  // Miss Shadow
  "8": {
    main: [
      88472456, 88472456, 88472456, // Zombyra the Dark
      73698349, 73698349, 73698349, // Giant Orc
      9748752, 9748752, // Caius the Shadow Monarch
      44330098, // Gorz the Emissary of Darkness
      65192027, // Dark Armed Dragon
      95178994, 95178994, 95178994, // Giant Germ
      26202165, // Sangan
      23205979, // Spirit Reaper
      28933734, 28933734, // Mask of Darkness
      33508719, // Morphing Jar
      83011277, 83011277, // Mystic Tomato
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      1475311, 1475311, // Allure of Darkness
      68005187, // Soul Exchange
      35027493, 35027493, // Deck Devastation Virus
      57728570, // Crush Card Virus
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      70342110, // Dimensional Prison
      41420027, // Solemn Judgment
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
      97169186, // Smashing Ground
    ],
    extra: [],
  },
  // Miss Scout
  "9": {
    main: [
      76922029, 76922029, 76922029, // Don Zaloog
      22609617, 22609617, // Mataza the Zapper
      2460565, 2460565, // Marauding Captain
      78658564, 78658564, // Goblin Attack Force
      70074904, 70074904, // D.D. Assailant
      74131780, // Exiled Force
      7572887, // D.D. Warrior Lady
      14536035, // Dark Grepher
      26202165, // Sangan
      23205979, // Spirit Reaper
      74153887, // Dark Scorpion - Meanae the Thorn
      6967870, // Dark Scorpion - Cliff the Trap Remover
      32807846, 32807846, // Reinforcement of the Army
      403847, 403847, // The A. Forces
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      88279736, 88279736, // Robbin' Goblin
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      70342110, // Dimensional Prison
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // Reia
  "14": {
    main: [
      85306040, 85306040, 85306040, // Goblin Elite Attack Force
      78658564, 78658564, 78658564, // Goblin Attack Force
      73698349, 73698349, // Giant Orc
      88472456, 88472456, // Zombyra the Dark
      53982768, 53982768, // Dark Ruler Ha Des
      44330098, // Gorz the Emissary of Darkness
      23205979, // Spirit Reaper
      26202165, // Sangan
      74131780, // Exiled Force
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, 87910978, 87910978, // Brain Control
      97169186, // Smashing Ground
      14087893, 14087893, // Book of Moon
      55713623, 55713623, // Shrink
      68005187, // Soul Exchange
      29401950, 29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      70342110, // Dimensional Prison
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // Sakura
  "16": {
    main: [
      64538655, 64538655, 64538655, // Sasuke Samurai #4
      95519486, 95519486, 95519486, // The Six Samurai - Zanji
      27782503, 27782503, // The Six Samurai - Irou
      31904181, 31904181, // The Six Samurai - Nisashi
      90397998, 90397998, // The Six Samurai - Kamon
      64398890, // The Six Samurai - Yaichi
      83039729, 83039729, // Grandmaster of the Six Samurai
      63176202, // Great Shogun Shien
      7572887, // D.D. Warrior Lady
      72345736, 72345736, // Six Samurai United
      32807846, 32807846, // Reinforcement of the Army
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, 41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      70342110, 70342110, // Dimensional Prison
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
      80344569, // Neo-Spacian Grand Mole
    ],
    extra: [],
  },
  // Robert
  "17": {
    main: [
      93130021, 93130021, 93130021, // Victory Viper XX03
      70095154, 70095154, // Cyber Dragon
      41172955, 41172955, 41172955, // Green Gadget
      86445415, 86445415, 86445415, // Red Gadget
      13839120, 13839120, 13839120, // Yellow Gadget
      14148099, // B.E.S. Big Core
      77585513, // Jinzo
      85087012, // Card Trooper
      23171610, // Limiter Removal
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, 87910978, 87910978, // Brain Control
      97169186, // Smashing Ground
      14087893, // Book of Moon
      29401950, 29401950, // Bottomless Trap Hole
      70342110, 70342110, 70342110, // Dimensional Prison
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, 41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      83555666, // Ring of Destruction
      45986603, // Snatch Steal
    ],
    extra: [],
  },
  // frogMaster
  "21": {
    main: [
      10456559, 10456559, // T.A.D.P.O.L.E.
      84451804, 84451804, 84451804, // Des Frog
      56840658, 56840658, // Poison Draw Frog
      49522489, // Beelze Frog
      12538374, // Treeborn Frog
      4929256, 4929256, 4929256, // Mobius the Frost Monarch
      18318842, 18318842, 18318842, // Abyss Soldier
      23205979, // Spirit Reaper
      26202165, // Sangan
      96947648, 96947648, // Salvage
      82999629, // Umiiruka
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, 87910978, 87910978, // Brain Control
      68005187, // Soul Exchange
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      70342110, // Dimensional Prison
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
      57839750, 57839750, // Mother Grizzly
    ],
    extra: [],
  },
  // kanna
  "24": {
    main: [
      13093792, 13093792, 13093792, // Destiny HERO - Diamond Dude
      9411399, 9411399, // Destiny HERO - Malicious
      56570271, // Destiny HERO - Disk Commander
      17132130, // Destiny HERO - Dogma
      40044918, // Elemental HERO Stratos
      41613948, // Destiny HERO - Doom Lord
      26202165, // Sangan
      85087012, // Card Trooper
      23205979, // Spirit Reaper
      7572887, // D.D. Warrior Lady
      74131780, // Exiled Force
      45809008, 45809008, 45809008, // Destiny Draw
      1475311, 1475311, // Allure of Darkness
      72204747, // Over Destiny
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      67169062, // Pot of Avarice
      35464895, // Destiny Signal
      29401950, 29401950, // Bottomless Trap Hole
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      56120475, 56120475, // Sakuretsu Armor
      70342110, 70342110, // Dimensional Prison
      45986603, // Snatch Steal
      83011277, 83011277, // Mystic Tomato
    ],
    extra: [],
  },
  // NiaNia
  "26": {
    main: [
      61370518, 61370518, 61370518, // Skull Archfiend of Lightning
      49881766, 49881766, 49881766, // Archfiend Soldier
      35975813, 35975813, 35975813, // Terrorking Archfiend
      9603356, 9603356, // Shadowknight Archfiend
      48675364, 48675364, // Archfiend General
      72192100, // Desrook Archfiend
      8581705, // Infernalqueen Archfiend
      26202165, // Sangan
      33508719, // Morphing Jar
      94585852, 94585852, 94585852, // Pandemonium
      1475311, 1475311, // Allure of Darkness
      32919136, // Falling Down
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // dancer
  "27": {
    main: [
      34088136, 34088136, 34088136, // Ultimate Insect LV3
      34830502, // Ultimate Insect LV5
      19877898, 19877898, // Ultimate Insect LV7
      93107608, 93107608, // Howling Insect
      35052053, 35052053, 35052053, // Insect Knight
      26185991, // Pinch Hopper
      4041838, 4041838, 4041838, // Ninja Grandmaster Sasuke
      41006930, 41006930, // Strike Ninja
      82005435, // Lady Ninja Yae
      70861343, 70861343, // Ninjitsu Art of Transformation
      25290459, // Level Up!
      32807846, 32807846, // Reinforcement of the Army
      14087893, // Book of Moon
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, // Sakuretsu Armor
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // Zuno
  "30": {
    main: [
      73665146, 73665146, 73665146, // Silent Magician LV4
      72443568, 72443568, // Silent Magician LV8
      77252217, 77252217, 77252217, // Chainsaw Insect
      71107816, 71107816, // The Bistro Butcher
      54749427, 54749427, // Destiny HERO - Defender
      69579761, 69579761, // Des Koala
      23205979, // Spirit Reaper
      33508719, // Morphing Jar
      25290459, 25290459, // Level Up!
      14087893, // Book of Moon
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      52417194, // Heavy Slump
      56120475, // Sakuretsu Armor
      89405199, 89405199, // Greed
      27053506, 27053506, 27053506, // Secret Barrel
      41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      62279055, // Magic Cylinder
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // lalala
  "31": {
    main: [
      65403020, 65403020, // The End of Anubis
      24317029, 24317029, 24317029, // Gravekeeper's Spy
      63695531, 63695531, // Gravekeeper's Spear Soldier
      17393207, 17393207, // Gravekeeper's Commandant
      25262697, 25262697, 25262697, // Gravekeeper's Assailant
      37101832, 37101832, // Gravekeeper's Guard
      88240808, 88240808, // Kycoo the Ghost Destroyer
      62473983, // Gravekeeper's Chief
      23205979, // Spirit Reaper
      47355498, 47355498, 47355498, // Necrovalley
      72405967, // Royal Tribute
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, 87910978, // Brain Control
      97169186, // Smashing Ground
      14087893, 14087893, // Book of Moon
      45986603, // Snatch Steal
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      60082869, // Dust Tornado
      56120475, // Sakuretsu Armor
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // AoJ
  "32": {
    main: [
      44330098, // Gorz the Emissary of Darkness
      94004268, // Amazoness Swords Woman
      26302522, 26302522, 26302522, // Blast Sphere
      2851070, // Reflect Bounder
      23205979, // Spirit Reaper
      69579761, 69579761, 69579761, // Des Koala
      31305911, // Marshmallon
      95178994, 95178994, 95178994, // Giant Germ
      33508719, // Morphing Jar
      19613556, // Heavy Storm
      46918794, 46918794, 46918794, // Tremendous Fire
      8842266, 8842266, 8842266, // Poison of the Old Man
      5318639, // Mystical Space Typhoon
      73915051, // Scapegoat
      91623717, // Chain Strike
      29843091, // Ojama Trio
      24068492, 24068492, 24068492, // Just Desserts
      27053506, 27053506, 27053506, // Secret Barrel
      79852326, 79852326, // Zoma the Spirit
      36468556, // Ceasefire
      67095270, 67095270, 67095270, // Dimension Wall
      83555666, // Ring of Destruction
      62279055, // Magic Cylinder
    ],
    extra: [],
  },
  // Queen Ryo
  "34": {
    main: [
      62180201, // The Wicked Dreadroot
      21208154, // The Wicked Avatar
      57793869, // The Wicked Eraser
      57281778, 57281778, // Ryu Kokki
      44436472, 44436472, 44436472, // Double Coston
      77044671, 77044671, // Pyramid Turtle
      26202165, // Sangan
      23205979, // Spirit Reaper
      15341821, // Dandylion
      31305911, // Marshmallon
      95178994, 95178994, 95178994, // Giant Germ
      22567609, 22567609, 22567609, // Nimble Momonga
      33508719, // Morphing Jar
      19613556, // Heavy Storm
      31036355, 31036355, // Creature Swap
      45986603, // Snatch Steal
      5318639, // Mystical Space Typhoon
      87910978, 87910978, // Brain Control
      67169062, // Pot of Avarice
      70828912, // Premature Burial
      72302403, // Swords of Revealing Light
      71044499, // Nobleman of Crossout
      69162969, // Lightning Vortex
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      83555666, // Ring of Destruction
      80604091, // Ultimate Offering
      26905245, 26905245, // Metal Reflect Slime
      97077563, // Call of the Haunted
    ],
    extra: [],
  },
  // A-lien
  "35": {
    main: [
      24104865, 24104865, // Alien Mother
      51192573, // Cosmic Horror Gangi'el
      97127906, 97127906, 97127906, // Alien Shocktrooper
      98719226, 98719226, 98719226, // Alien Warrior
      62315111, 62315111, 62315111, // Alien Hunter
      62437709, 62437709, // Alien Grey
      91070115, // Alien Telepath
      83555666, // Ring of Destruction
      26202165, // Sangan
      23205979, // Spirit Reaper
      73262676, // "A" Cell Scatter Burst
      34541863, // "A" Cell Breeding Device
      60946968, // Otherworld - The "A" Zone
      14087893, // Book of Moon
      71044499, // Nobleman of Crossout
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, 87910978, 87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, // Sakuretsu Armor
      45986603, // Snatch Steal
    ],
    extra: [],
  },
  // Kain
  "38": {
    main: [
      70095154, 70095154, // Cyber Dragon
      77585513, // Jinzo
      4929256, 4929256, // Mobius the Frost Monarch
      51945556, 51945556, // Zaborg the Thunder Monarch
      26205777, 26205777, // Thestalos the Firestorm Monarch
      73125233, // Raiza the Storm Monarch
      9748752, 9748752, // Caius the Shadow Monarch
      60229110, // Granmarg the Rock Monarch
      12538374, // Treeborn Frog
      85087012, // Card Trooper
      26202165, // Sangan
      44330098, // Gorz the Emissary of Darkness
      4259068, // Spell Economics
      80921533, 80921533, // Mausoleum of the Emperor
      68005187, 68005187, // Soul Exchange
      43040603, // Monster Gate
      98045062, 98045062, // Enemy Controller
      14087893, // Book of Moon
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      45986603, // Snatch Steal
      40737112, // Dark Magician of Chaos
    ],
    extra: [],
  },
  // Brow
  "40": {
    main: [
      31812496, 31812496, 31812496, // Stone Statue of the Aztecs
      30190809, 30190809, 30190809, // Gear Golem the Moving Fortress
      3510565, // Stealth Bird
      69579761, 69579761, // Des Koala
      79575620, 79575620, 79575620, // Injection Fairy Lily
      65240384, 65240384, 65240384, // Big Shield Gardna
      40659562, // Guardian Sphinx
      31305911, // Marshmallon
      23205979, // Spirit Reaper
      33508719, // Morphing Jar
      44656491, 44656491, // Messenger of Peace
      3136426, // Level Limit - Area B
      72302403, // Swords of Revealing Light
      5318639, // Mystical Space Typhoon
      14087893, 14087893, // Book of Moon
      55713623, // Shrink
      31036355, // Creature Swap
      81380218, // Chorus of Sanctuary
      85742772, // Gravity Bind
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      62279055, // Magic Cylinder
      60082869, // Dust Tornado
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // Abigail
  "43": {
    main: [
      31887905, 31887905, // Familiar-Possessed - Aussa
      4376658, 4376658, // Familiar-Possessed - Hiita
      31764353, 31764353, // Familiar-Possessed - Wynn
      68881649, 68881649, // Familiar-Possessed - Eria
      37970940, // Aussa the Earth Charmer
      37744402, // Wynn the Wind Charmer
      99414168, // Elemental Mistress Doriado
      71413901, // Breaker the Magical Warrior
      7572887, // D.D. Warrior Lady
      23205979, // Spirit Reaper
      33508719, // Morphing Jar
      26202165, // Sangan
      79575620, // Injection Fairy Lily
      23965037, // Doriado's Blessing
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      87910978, // Brain Control
      70828912, // Premature Burial
      97169186, // Smashing Ground
      14087893, 14087893, // Book of Moon
      71044499, // Nobleman of Crossout
      69162969, // Lightning Vortex
      98045062, // Enemy Controller
      41420027, 41420027, 41420027, // Solemn Judgment
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // raMon
  "44": {
    main: [
      33396948, // Exodia the Forbidden One
      44519536, // Left Leg of the Forbidden One
      7902349, // Left Arm of the Forbidden One
      8124921, // Right Leg of the Forbidden One
      70903634, // Right Arm of the Forbidden One
      75043725, 75043725, 75043725, // Emissary of the Afterlife
      26202165, // Sangan
      23205979, // Spirit Reaper
      31305911, // Marshmallon
      33508719, // Morphing Jar
      65240384, 65240384, // Big Shield Gardna
      70368879, 70368879, 70368879, // Upstart Goblin
      75500286, // Gold Sarcophagus
      44656491, 44656491, 44656491, // Messenger of Peace
      72302403, // Swords of Revealing Light
      3136426, // Level Limit - Area B
      90928333, 90928333, // Dark Factory of Mass Production
      73915051, // Scapegoat
      67169062, // Pot of Avarice
      58775978, 58775978, // Nightmare's Steelcage
      83968380, 83968380, 83968380, // Jar of Greed
      85742772, // Gravity Bind
      17078030, // Wall of Revealing Light
      36361633, 36361633, // Threatening Roar
      12607053, 12607053, // Waboku
      62279055, // Magic Cylinder
      44095762, // Mirror Force
    ],
    extra: [],
  },
  // sabasaba
  "49": {
    main: [
      44330098, // Gorz the Emissary of Darkness
      69579761, 69579761, 69579761, // Des Koala
      33508719, // Morphing Jar
      59907935, 59907935, // Cyber Archfiend
      102380, // Lava Golem
      46918794, 46918794, 46918794, // Tremendous Fire
      8842266, 8842266, 8842266, // Poison of the Old Man
      91623717, // Chain Strike
      29843091, 29843091, // Ojama Trio
      24068492, 24068492, 24068492, // Just Desserts
      27053506, 27053506, 27053506, // Secret Barrel
      36468556, // Ceasefire
      83555666, // Ring of Destruction
      62279055, // Magic Cylinder
      99518961, 99518961, 99518961, // Restructer Revolution
      19523799, 19523799, 19523799, // Ookazi
      33767325, 33767325, // Meteor of Destruction
      38992735, 38992735, 38992735, // Wave-Motion Cannon
      37576645, 37576645, // Reckless Greed
      85562745, // Dark Room of Nightmare
    ],
    extra: [],
  },
  // Seto Kaiba, stage 1
  "54": {
    main: [
      70342110, // Dimensional Prison
      89631139, 89631139, 89631139, // Blue-Eyes White Dragon
      14898066, 14898066, 14898066, // Vorse Raider
      97590747, 97590747, // La Jinn the Mystical Genie of the Lamp
      54912977, // Ancient Lamp
      73398797, 73398797, // Paladin of White Dragon
      95492061, 95492061, // Manju of the Ten Thousand Hands
      26202165, // Sangan
      33508719, // Morphing Jar
      46052429, 46052429, // Advanced Ritual Art
      38120068, 38120068, // Trade-In
      10667321, // Ancient Rules
      98045062, 98045062, // Enemy Controller
      55713623, // Shrink
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      14315573, // Negate Attack
      56120475, // Sakuretsu Armor
      60082869, // Dust Tornado
      17655904, // Burst Stream of Destruction
      67169062, // Pot of Avarice
    ],
    extra: [],
  },
  // Seto Kaiba, stage 2
  "55": {
    main: [
      70342110, // Dimensional Prison
      89631139, 89631139, 89631139, // Blue-Eyes White Dragon
      17985575, 17985575, // Lord of D.
      62113340, 62113340, 62113340, // Divine Dragon Ragnarok
      39191307, 39191307, 39191307, // Masked Dragon
      14898066, 14898066, // Vorse Raider
      26202165, // Sangan
      43973174, // The Flute of Summoning Dragon
      38120068, 38120068, // Trade-In
      77565204, // Future Fusion
      71490127, // Dragon's Mirror
      98045062, // Enemy Controller
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      87910978, // Brain Control
      55713623, // Shrink
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      14315573, // Negate Attack
      60082869, // Dust Tornado
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
      10667321, 10667321, // Ancient Rules
      56120475, // Sakuretsu Armor
    ],
    extra: [
      23995346, 23995346, 23995346, // Blue-Eyes Ultimate Dragon
      13756293, 13756293, 13756293, // King Dragun
      99267150, // Five-Headed Dragon
    ],
  },
  // Seto Kaiba, stage 3
  "56": {
    main: [
      89631139, 89631139, 89631139, // Blue-Eyes White Dragon
      73398797, 73398797, // Paladin of White Dragon
      95492061, 95492061, // Manju of the Ten Thousand Hands
      62651957, 62651957, // X-Head Cannon
      65622692, 65622692, // Y-Dragon Head
      64500000, 64500000, // Z-Metal Tank
      14898066, // Vorse Raider
      53839837, // Vampire Lord
      26202165, // Sangan
      95178994, // Giant Germ
      46052429, // Advanced Ritual Art
      38120068, 38120068, // Trade-In
      10667321, // Ancient Rules
      98045062, 98045062, // Enemy Controller
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      45986603, // Snatch Steal
      87910978, 87910978, // Brain Control
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      55713623, // Shrink
      57728570, // Crush Card Virus
      83555666, // Ring of Destruction
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      70342110, // Dimensional Prison
    ],
    extra: [
      23995346, 23995346, // Blue-Eyes Ultimate Dragon
      91998119, 91998119, // XYZ-Dragon Cannon
      2111707, // XY-Dragon Cannon
      99724761, // XZ-Tank Cannon
      25119460, // YZ-Tank Dragon
    ],
  },
  // Tea Gardner, stage 1
  "57": {
    main: [
      62279055, // Magic Cylinder
      68007326, // Guardian Angel Joan
      82085619, 82085619, // Shining Friendship
      84080938, 84080938, // The Forgiving Maiden
      90925163, 90925163, 90925163, // Dancing Fairy
      64752646, 64752646, 64752646, // Fire Princess
      85802526, // Cure Mermaid
      53530069, // Spirit of the Breeze
      31305911, // Marshmallon
      81383947, // White Magician Pikeru
      22567609, 22567609, 22567609, // Nimble Momonga
      33508719, // Morphing Jar
      48712195, // Card Trader
      5318639, // Mystical Space Typhoon
      73915051, // Scapegoat
      70828912, // Premature Burial
      44656491, 44656491, 44656491, // Messenger of Peace
      51481927, 51481927, // Spell Absorption
      3136426, // Level Limit - Area B
      72302403, // Swords of Revealing Light
      35346968, 35346968, // Solemn Wishes
      85742772, // Gravity Bind
      4178474, // Raigeki Break
      44095762, // Mirror Force
      17078030, 17078030, // Wall of Revealing Light
      97077563, // Call of the Haunted
      36468556, // Ceasefire
    ],
    extra: [],
  },
  // Tea Gardner, stage 2
  "58": {
    main: [
      70342110, // Dimensional Prison
      20951752, // Voltanis the Adjudicator
      95956346, 95956346, 95956346, // Shining Angel
      11662742, 11662742, 11662742, // Gellenduo
      85399281, 85399281, // Harvest Angel of Wisdom
      16268841, 16268841, 16268841, // Zolga
      21297224, 21297224, 21297224, // Hysteric Fairy
      31305911, // Marshmallon
      33508719, // Morphing Jar
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      87910978, // Brain Control
      41420027, 41420027, 41420027, // Solemn Judgment
      14315573, 14315573, // Negate Attack
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      97077563, // Call of the Haunted
      60082869, // Dust Tornado
      56120475, 56120475, // Sakuretsu Armor
      62279055, // Magic Cylinder
      18036057, 18036057, // Airknight Parshath
    ],
    extra: [],
  },
  // Tea Gardner, stage 3
  "59": {
    main: [
      56120475, // Sakuretsu Armor
      70342110, // Dimensional Prison
      56433456, 56433456, 56433456, // The Sanctuary in the Sky
      95956346, 95956346, 95956346, // Shining Angel
      48783998, 48783998, 48783998, // Nova Summoner
      12171659, 12171659, // Zeradias, Herald of Heaven
      18036057, 18036057, // Airknight Parshath
      12510878, // Neo-Parshath, the Sky Paladin
      11662742, 11662742, 11662742, // Gellenduo
      77527210, // Soul of Purity and Light
      31305911, // Marshmallon
      33508719, // Morphing Jar
      70046172, 70046172, // Rush Recklessly
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      87910978, // Brain Control
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      62279055, // Magic Cylinder
      29401950, 29401950, // Bottomless Trap Hole
      41420027, // Solemn Judgment
      60082869, // Dust Tornado
      45986603, // Snatch Steal
      83555666, // Ring of Destruction
    ],
    extra: [],
  },
  // Jaden Yuki, stage 1
  "60": {
    main: [
      40044918, // Elemental HERO Stratos
      21844576, 21844576, // Elemental HERO Avian
      58932615, 58932615, // Elemental HERO Burstinatrix
      20721928, 20721928, 20721928, // Elemental HERO Sparkman
      84327329, 84327329, // Elemental HERO Clayman
      79979666, // Elemental HERO Bubbleman
      86188410, 86188410, // Elemental HERO Wildheart
      59793705, // Elemental HERO Bladedge
      89252153, // Elemental HERO Necroshade
      33875961, // Dark Catapulter
      57116033, // Winged Kuriboh
      6480253, // Wroughtweiler
      79109599, 79109599, // King of the Swamp
      24094653, 24094653, // Polymerization
      213326, 213326, // E - Emergency Call
      32807846, 32807846, // Reinforcement of the Army
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      95281259, // The Warrior Returning Alive
      63035430, // Skyscraper
      18511384, // Fusion Recovery
      67169062, // Pot of Avarice
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, // Bottomless Trap Hole
      97077563, // Call of the Haunted
      22020907, // Hero Signal
      56120475, // Sakuretsu Armor
      14315573, // Negate Attack
    ],
    extra: [
      35809262, 35809262, // Elemental HERO Flame Wingman
      61204971, 61204971, // Elemental HERO Thunder Giant
      55615891, 55615891, // Elemental HERO Wild Wingman
      41436536, // Elemental HERO Phoenix Enforcer
      81003500, // Elemental HERO Necroid Shaman
      47737087, // Elemental HERO Rampart Blaster
      52031567, // Elemental HERO Mudballman
      81197327, // Elemental HERO Steam Healer
      14225239, // Elemental HERO Mariner
      10526791, // Elemental HERO Wildedge
      83121692, // Elemental HERO Tempest
      60493189, // Elemental HERO Plasma Vice
    ],
  },
  // Jaden Yuki, stage 2
  "61": {
    main: [
      21844576, // Elemental HERO Avian
      58932615, // Elemental HERO Burstinatrix
      84327329, // Elemental HERO Clayman
      20721928, 20721928, // Elemental HERO Sparkman
      79979666, // Elemental HERO Bubbleman
      59793705, // Elemental HERO Bladedge
      86188410, 86188410, // Elemental HERO Wildheart
      89252153, // Elemental HERO Necroshade
      40044918, // Elemental HERO Stratos
      79109599, 79109599, 79109599, // King of the Swamp
      33508719, // Morphing Jar
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      95281259, // The Warrior Returning Alive
      32807846, 32807846, // Reinforcement of the Army
      70828912, // Premature Burial
      63035430, // Skyscraper
      24094653, 24094653, // Polymerization
      23557835, // Dimension Fusion
      95286165, // De-Fusion
      45906428, 45906428, 45906428, // Miracle Fusion
      77565204, // Future Fusion
      18511384, // Fusion Recovery
      213326, 213326, 213326, // E - Emergency Call
      37318031, // R - Righteous Justice
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      29401950, // Bottomless Trap Hole
      56120475, // Sakuretsu Armor
      97077563, // Call of the Haunted
    ],
    extra: [
      14225239, // Elemental HERO Mariner
      81003500, 81003500, // Elemental HERO Necroid Shaman
      55615891, 55615891, // Elemental HERO Wild Wingman
      47737087, // Elemental HERO Rampart Blaster
      61204971, 61204971, // Elemental HERO Thunder Giant
      83121692, // Elemental HERO Tempest
      29343734, // Elemental HERO Electrum
      25366484, 25366484, 25366484, // Elemental HERO Shining Flare Wingman
      10526791, 10526791, // Elemental HERO Wildedge
    ],
  },
  // Jaden Yuki, stage 3
  "62": {
    main: [
      89943723, 89943723, 89943723, // Elemental HERO Neos
      69884162, 69884162, 69884162, // Elemental HERO Neos Alius
      40044918, // Elemental HERO Stratos
      54959865, // Neo-Spacian Air Hummingbird
      74131780, // Exiled Force
      17955766, // Neo-Spacian Aqua Dolphin
      37195861, // Elemental HERO Ocean
      80344569, // Neo-Spacian Grand Mole
      17732278, // Neo-Spacian Glow Moss
      43237273, // Neo-Spacian Dark Panther
      85087012, // Card Trooper
      7572887, // D.D. Warrior Lady
      33508719, // Morphing Jar
      42015635, 42015635, // Neo Space
      213326, 213326, 213326, // E - Emergency Call
      10667321, 10667321, // Ancient Rules
      63703130, 63703130, // O - Oversoul
      32807846, 32807846, // Reinforcement of the Army
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      86188410, // Elemental HERO Wildheart
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      29401950, 29401950, // Bottomless Trap Hole
      97077563, // Call of the Haunted
      41420027, // Solemn Judgment
      56120475, // Sakuretsu Armor
      83555666, // Ring of Destruction
    ],
    extra: [
      11502550, 11502550, 11502550, // Elemental HERO Air Neos
      55171412, 55171412, // Elemental HERO Aqua Neos
      85507811, 85507811, // Elemental HERO Glow Neos
      28677304, 28677304, // Elemental HERO Dark Neos
      48996569, 48996569, // Elemental HERO Grand Neos
      17032740, // Elemental HERO Chaos Neos
      49352945, // Elemental HERO Storm Neos
    ],
  },
  // Chazz Princeton, stage 1
  "63": {
    main: [
      51638941, 51638941, 51638941, // V-Tiger Jet
      96300057, 96300057, 96300057, // W-Wing Catapult
      62651957, 62651957, 62651957, // X-Head Cannon
      65622692, 65622692, 65622692, // Y-Dragon Head
      64500000, 64500000, 64500000, // Z-Metal Tank
      95956346, 95956346, 95956346, // Shining Angel
      26202165, // Sangan
      46181000, // Frontline Base
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      71044499, // Nobleman of Crossout
      45986603, // Snatch Steal
      23171610, // Limiter Removal
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      81777047, 81777047, 81777047, // Luminous Spark
      41420027, // Solemn Judgment
      60082869, // Dust Tornado
      56120475, 56120475, // Sakuretsu Armor
    ],
    extra: [
      84243274, 84243274, 84243274, // VWXYZ-Dragon Catapult Cannon
      91998119, 91998119, 91998119, // XYZ-Dragon Cannon
      58859575, 58859575, // VW-Tiger Catapult
      2111707, 2111707, // XY-Dragon Cannon
      99724761, 99724761, // XZ-Tank Cannon
      25119460, 25119460, // YZ-Tank Dragon
    ],
  },
  // Chazz Princeton, stage 2
  "64": {
    main: [
      980973, 980973, 980973, // Armed Dragon LV3
      46384672, 46384672, 46384672, // Armed Dragon LV5
      73879377, 73879377, // Armed Dragon LV7
      15960641, // Mirage Dragon
      39191307, 39191307, 39191307, // Masked Dragon
      47297616, // Light and Darkness Dragon
      26202165, // Sangan
      43586926, // Twin-Headed Behemoth
      30314994, 30314994, 30314994, // Element Dragon
      25290459, 25290459, // Level Up!
      61850482, // Level Modulation
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      60082869, // Dust Tornado
      45986603, // Snatch Steal
      81385346, // Stamping Destruction
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      56120475, 56120475, 56120475, // Sakuretsu Armor
      41420027, // Solemn Judgment
      54178050, // Dragon's Rage
      62867251, // Light of Intervention
    ],
    extra: [],
  },
  // Chazz Princeton, stage 3
  "65": {
    main: [
      980973, 980973, 980973, // Armed Dragon LV3
      46384672, 46384672, 46384672, // Armed Dragon LV5
      73879377, 73879377, // Armed Dragon LV7
      59464593, // Armed Dragon LV10
      39191307, 39191307, 39191307, // Masked Dragon
      47297616, // Light and Darkness Dragon
      42941100, // Ojama Yellow
      12482652, // Ojama Green
      79335209, // Ojama Black
      26202165, // Sangan
      50916353, // Chthonian Soldier
      24643836, // Ojamagic
      33550694, // Fusion Gate
      43586926, // Twin-Headed Behemoth
      25290459, // Level Up!
      61850482, // Level Modulation
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      71044499, // Nobleman of Crossout
      67169062, // Pot of Avarice
      45986603, // Snatch Steal
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      56120475, 56120475, // Sakuretsu Armor
      41420027, // Solemn Judgment
      29843091, // Ojama Trio
    ],
    extra: [
      90140980, 90140980, 90140980, // Ojama King
      40391316, // Ojama Knight
    ],
  },
  // Alexis Rhodes, stage 1
  "66": {
    main: [
      7572887, // D.D. Warrior Lady
      11460577, 11460577, // Etoile Cyber
      5438492, 5438492, 5438492, // Warrior Lady of the Wasteland
      76763417, // Cyber Gymnast
      70074904, 70074904, // D.D. Assailant
      49375719, // Cyber Tutu
      88696724, 88696724, 88696724, // The Earth - Hex-Sealed Fusion
      33508719, // Morphing Jar
      97023549, 97023549, // Blade Skater
      22046459, 22046459, // Megamorph
      45986603, // Snatch Steal
      5318639, // Mystical Space Typhoon
      90502999, 90502999, 90502999, // Ground Collapse
      32807846, 32807846, // Reinforcement of the Army
      70828912, // Premature Burial
      42703248, // Giant Trunade
      71044499, // Nobleman of Crossout
      24094653, // Polymerization
      403847, 403847, // The A. Forces
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      67095270, // Dimension Wall
      83555666, // Ring of Destruction
      77754944, 77754944, // Widespread Ruin
      56120475, 56120475, // Sakuretsu Armor
      97077563, // Call of the Haunted
    ],
    extra: [
      10248389, 10248389, 10248389, // Cyber Blader
    ],
  },
  // Alexis Rhodes, stage 2
  "67": {
    main: [
      7572887, // D.D. Warrior Lady
      11460577, 11460577, // Etoile Cyber
      5438492, 5438492, 5438492, // Warrior Lady of the Wasteland
      76763417, 76763417, // Cyber Gymnast
      70074904, 70074904, // D.D. Assailant
      49375719, 49375719, // Cyber Tutu
      33508719, // Morphing Jar
      97023549, 97023549, // Blade Skater
      5318639, // Mystical Space Typhoon
      32807846, 32807846, // Reinforcement of the Army
      70828912, // Premature Burial
      42703248, // Giant Trunade
      71044499, // Nobleman of Crossout
      24094653, // Polymerization
      45986603, // Snatch Steal
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      67095270, // Dimension Wall
      56120475, 56120475, 56120475, // Sakuretsu Armor
      97077563, // Call of the Haunted
      83555666, // Ring of Destruction
      49010598, // Divine Wrath
      43340443, // Forced Back
      55256016, // Judgment of Anubis
      69162969, // Lightning Vortex
      2158562, // Cyber Prima
      10375182, 10375182, 10375182, // Command Knight
      19613556, // Heavy Storm
    ],
    extra: [
      10248389, 10248389, 10248389, // Cyber Blader
    ],
  },
  // Alexis Rhodes, stage 3
  "68": {
    main: [
      11458071, // Sky Scourge Enrise
      48453776, // Sky Scourge Norleras
      44330098, // Gorz the Emissary of Darkness
      23401839, 23401839, // Senju of the Thousand Hands
      95492061, 95492061, 95492061, // Manju of the Ten Thousand Hands
      33508719, // Morphing Jar
      72426662, 72426662, // Demise, King of Armageddon
      86327225, // Shinato, King of a Higher Plane
      7459013, 7459013, 7459013, // Zure, Knight of Dark World
      49881766, 49881766, 49881766, // Archfiend Soldier
      12493482, 12493482, 12493482, // Dunames Dark Witch
      19613556, // Heavy Storm
      48206762, // Fulfillment of the Contract
      29401950, // Bottomless Trap Hole
      45986603, // Snatch Steal
      46052429, 46052429, 46052429, // Advanced Ritual Art
      5318639, // Mystical Space Typhoon
      23557835, // Dimension Fusion
      67169062, // Pot of Avarice
      70828912, // Premature Burial
      42703248, // Giant Trunade
      53582587, // Torrential Tribute
      60082869, 60082869, 60082869, // Dust Tornado
      44095762, // Mirror Force
      83555666, // Ring of Destruction
      97077563, // Call of the Haunted
    ],
    extra: [],
  },
  // Joey Wheeler, stage 1
  "69": {
    main: [
      74677422, 74677422, // Red-Eyes Black Dragon
      36262024, 36262024, // Black Dragon's Chick
      48305365, 48305365, 48305365, // Axe Raider
      423705, 423705, 423705, // Gearfried the Iron Knight
      2460565, 2460565, // Marauding Captain
      30860696, // Rocket Warrior
      42035044, // Panther Warrior
      90790253, // Little-Winguard
      64428736, // Alligator's Sword
      88819587, // Baby Dragon
      71625222, // Time Wizard
      74131780, // Exiled Force
      32807846, 32807846, // Reinforcement of the Army
      79571449, // Graceful Charity
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      87910978, // Brain Control
      74137509, // Graceful Dice
      37390589, 37390589, // Kunai with Chain
      68540058, // Metalmorph
      126218, // Skull Dice
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      56120475, // Sakuretsu Armor
    ],
    extra: [],
  },
  // Joey Wheeler, stage 2
  "70": {
    main: [
      77585513, 77585513, // Jinzo
      423705, 423705, 423705, // Gearfried the Iron Knight
      30860696, 30860696, // Rocket Warrior
      2460565, 2460565, 2460565, // Marauding Captain
      90790253, // Little-Winguard
      42035044, // Panther Warrior
      7572887, // D.D. Warrior Lady
      74131780, // Exiled Force
      74677422, // Red-Eyes Black Dragon
      36262024, // Black Dragon's Chick
      32807846, 32807846, // Reinforcement of the Army
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      87910978, // Brain Control
      74137509, 74137509, // Graceful Dice
      73915051, // Scapegoat
      126218, 126218, // Skull Dice
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      56120475, 56120475, // Sakuretsu Armor
      48305365, 48305365, // Axe Raider
      70342110, // Dimensional Prison
    ],
    extra: [],
  },
  // Joey Wheeler, stage 3
  "71": {
    main: [
      74677422, 74677422, // Red-Eyes Black Dragon
      36262024, 36262024, // Black Dragon's Chick
      77585513, 77585513, // Jinzo
      423705, 423705, 423705, // Gearfried the Iron Knight
      2460565, 2460565, 2460565, // Marauding Captain
      30860696, 30860696, // Rocket Warrior
      42035044, 42035044, // Panther Warrior
      74131780, // Exiled Force
      7572887, // D.D. Warrior Lady
      48305365, // Axe Raider
      32807846, 32807846, // Reinforcement of the Army
      74137509, 74137509, // Graceful Dice
      73915051, // Scapegoat
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      71044499, // Nobleman of Crossout
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      87910978, // Brain Control
      126218, // Skull Dice
      37390589, // Kunai with Chain
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      56120475, // Sakuretsu Armor
      70342110, // Dimensional Prison
    ],
    extra: [],
  },
  // Jesse Anderson, stage 1
  "72": {
    main: [
      7093411, 7093411, 7093411, // Crystal Beast Sapphire Pegasus
      95600067, 95600067, 95600067, // Crystal Beast Topaz Tiger
      69937550, 69937550, 69937550, // Crystal Beast Amber Mammoth
      32933942, 32933942, 32933942, // Crystal Beast Amethyst Cat
      21698716, 21698716, 21698716, // Crystal Beast Cobalt Eagle
      68215963, 68215963, // Crystal Beast Emerald Tortoise
      32710364, // Crystal Beast Ruby Carbuncle
      95326659, 95326659, // Crystal Beacon
      60876124, // Rare Value
      8275702, 8275702, // Crystal Promise
      35486099, // Crystal Blessing
      34487429, 34487429, // Ancient City - Rainbow Ruins
      83746708, 83746708, // Mage Power
      5318639, // Mystical Space Typhoon
      97169186, // Smashing Ground
      66788016, // Fissure
      69162969, // Lightning Vortex
      70828912, // Premature Burial
      96331676, 96331676, // Crystal Raigeki
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      29401950, // Bottomless Trap Hole
    ],
    extra: [],
  },
  // Jesse Anderson, stage 2
  "73": {
    main: [
      7093411, 7093411, 7093411, // Crystal Beast Sapphire Pegasus
      95600067, 95600067, 95600067, // Crystal Beast Topaz Tiger
      69937550, 69937550, 69937550, // Crystal Beast Amber Mammoth
      32933942, 32933942, // Crystal Beast Amethyst Cat
      21698716, 21698716, // Crystal Beast Cobalt Eagle
      68215963, 68215963, // Crystal Beast Emerald Tortoise
      32710364, // Crystal Beast Ruby Carbuncle
      95326659, 95326659, // Crystal Beacon
      60876124, // Rare Value
      8275702, 8275702, // Crystal Promise
      35486099, // Crystal Blessing
      34487429, 34487429, // Ancient City - Rainbow Ruins
      83746708, 83746708, // Mage Power
      5318639, // Mystical Space Typhoon
      97169186, // Smashing Ground
      66788016, // Fissure
      69162969, // Lightning Vortex
      70828912, // Premature Burial
      96331676, 96331676, // Crystal Raigeki
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      29401950, // Bottomless Trap Hole
      41420027, // Solemn Judgment
    ],
    extra: [],
  },
  // Jesse Anderson, stage 3
  "74": {
    main: [
      7093411, 7093411, 7093411, // Crystal Beast Sapphire Pegasus
      95600067, 95600067, 95600067, // Crystal Beast Topaz Tiger
      69937550, 69937550, 69937550, // Crystal Beast Amber Mammoth
      32933942, 32933942, // Crystal Beast Amethyst Cat
      21698716, 21698716, // Crystal Beast Cobalt Eagle
      68215963, // Crystal Beast Emerald Tortoise
      79856792, // Rainbow Dragon
      32710364, // Crystal Beast Ruby Carbuncle
      95326659, 95326659, // Crystal Beacon
      60876124, // Rare Value
      8275702, 8275702, // Crystal Promise
      35486099, // Crystal Blessing
      34487429, 34487429, // Ancient City - Rainbow Ruins
      83746708, 83746708, // Mage Power
      5318639, // Mystical Space Typhoon
      97169186, // Smashing Ground
      72881007, // Crystal Abundance
      69162969, // Lightning Vortex
      70828912, // Premature Burial
      96331676, 96331676, // Crystal Raigeki
      53582587, // Torrential Tribute
      44095762, // Mirror Force
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      29401950, 29401950, // Bottomless Trap Hole
    ],
    extra: [],
  },
  // Yami Marik, stage 1
  "75": {
    main: [
      38445524, 38445524, 38445524, // Gil Garth
      90980792, 90980792, 90980792, // Dark Jeroid
      73698349, 73698349, // Giant Orc
      99050989, 99050989, // Drillago
      56043446, // Viser Des
      72657739, 72657739, // Malice Doll of Demise
      84290642, // Snipe Hunter
      23205979, // Spirit Reaper
      26202165, // Sangan
      16226786, // Night Assailant
      21593977, // Makyura the Destructor
      5318639, // Mystical Space Typhoon
      19613556, // Heavy Storm
      70828912, // Premature Burial
      97169186, // Smashing Ground
      14087893, // Book of Moon
      69954399, // Ekibyo Drakmord
      18161786, 18161786, // Mystic Plasma Zone
      58775978, // Nightmare's Steelcage
      69162969, // Lightning Vortex
      54704216, 54704216, // Nightmare Wheel
      26905245, // Metal Reflect Slime
      41925941, 41925941, // Bark of Dark Ruler
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      56120475, 56120475, // Sakuretsu Armor
      93382620, // Rope of Life
      70342110, // Dimensional Prison
    ],
    extra: [],
  },
  // Yami Marik, stage 2
  "76": {
    main: [
      102380, 102380, // Lava Golem
      52090844, 52090844, // Bowganian
      76052811, // Helpoemer
      4335645, // Newdoria
      73698349, 73698349, // Giant Orc
      90980792, 90980792, // Dark Jeroid
      38445524, 38445524, // Gil Garth
      72657739, // Malice Doll of Demise
      21593977, // Makyura the Destructor
      23205979, // Spirit Reaper
      26202165, // Sangan
      16226786, // Night Assailant
      31709826, // Revival Jam
      97342942, 97342942, // Ectoplasmer
      44656491, // Messenger of Peace
      72302403, // Swords of Revealing Light
      58775978, // Nightmare's Steelcage
      14087893, // Book of Moon
      5318639, // Mystical Space Typhoon
      19613556, // Heavy Storm
      70828912, // Premature Burial
      97169186, // Smashing Ground
      54704216, 54704216, // Nightmare Wheel
      26905245, 26905245, // Metal Reflect Slime
      85742772, // Gravity Bind
      57728570, // Crush Card Virus
      70342110, // Dimensional Prison
      97077563, // Call of the Haunted
      29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      41420027, // Solemn Judgment
    ],
    extra: [],
  },
  // Yami Marik, stage 3
  "77": {
    main: [
      10000010, // The Winged Dragon of Ra
      38445524, 38445524, 38445524, // Gil Garth
      90980792, 90980792, 90980792, // Dark Jeroid
      73698349, 73698349, 73698349, // Giant Orc
      72657739, 72657739, // Malice Doll of Demise
      99050989, 99050989, // Drillago
      31709826, // Revival Jam
      76052811, // Helpoemer
      102380, // Lava Golem
      23205979, // Spirit Reaper
      26202165, // Sangan
      83764718, // Monster Reborn
      55144522, // Pot of Greed
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      18161786, 18161786, // Mystic Plasma Zone
      14087893, // Book of Moon
      54704216, 54704216, // Nightmare Wheel
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      44095762, // Mirror Force
      56120475, // Sakuretsu Armor
      57728570, // Crush Card Virus
      41420027, // Solemn Judgment
    ],
    extra: [],
  },
  // Yami Bakura, stage 1
  "81": {
    main: [
      94212438, 94212438, // Destiny Board
      31893528, // Spirit Message "I"
      67287533, // Spirit Message "N"
      94772232, // Spirit Message "A"
      30170981, // Spirit Message "L"
      31829185, 31829185, // Dark Necrofear
      67105242, 67105242, // Earthbound Spirit
      68049471, 68049471, // The Gross Ghost of Fled Dreams
      5434080, // Headless Knight
      32541773, // The Portrait's Secret
      28933734, // Mask of Darkness
      54652250, // Man-Eater Bug
      23205979, // Spirit Reaper
      26202165, // Sangan
      16226786, // Night Assailant
      31305911, // Marshmallon
      53982768, // Dark Ruler Ha Des
      78700060, // Doomcaliber Knight
      93599951, // Dark Spirit of the Silent
      79852326, 79852326, // Zoma the Spirit
      29401950, // Bottomless Trap Hole
      58775978, 58775978, // Nightmare's Steelcage
      72302403, // Swords of Revealing Light
      70342110, // Dimensional Prison
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      97077563, // Call of the Haunted
      44095762, // Mirror Force
      62279055, // Magic Cylinder
      53582587, // Torrential Tribute
      56120475, // Sakuretsu Armor
      36361633, 36361633, // Threatening Roar
      12607053, // Waboku
    ],
    extra: [],
  },
  // Yami Bakura, stage 2
  "82": {
    main: [
      41442341, 41442341, // Puppet Master
      31829185, 31829185, // Dark Necrofear
      53982768, // Dark Ruler Ha Des
      95178994, 95178994, 95178994, // Giant Germ
      78700060, 78700060, // Doomcaliber Knight
      58551308, 58551308, 58551308, // Spear Cretin
      28933734, // Mask of Darkness
      54652250, // Man-Eater Bug
      16226786, // Night Assailant
      26202165, // Sangan
      23205979, // Spirit Reaper
      84290642, // Snipe Hunter
      74713516, 74713516, // Dark Mimic LV1
      57953380, // Card of Safe Return
      55713623, 55713623, // Shrink
      5318639, // Mystical Space Typhoon
      19613556, // Heavy Storm
      70828912, // Premature Burial
      87910978, // Brain Control
      66788016, // Fissure
      97169186, // Smashing Ground
      31036355, 31036355, // Creature Swap
      67169062, // Pot of Avarice
      72302403, // Swords of Revealing Light
      44095762, // Mirror Force
      57728570, // Crush Card Virus
      53582587, // Torrential Tribute
      29401950, 29401950, // Bottomless Trap Hole
      97077563, // Call of the Haunted
    ],
    extra: [],
  },
  // Yami Bakura, stage 3
  "83": {
    main: [
      97642679, 97642679, // Dark Master - Zorc
      96420087, 96420087, // Contract with the Dark Master
      46052429, // Advanced Ritual Art
      95492061, 95492061, 95492061, // Manju of the Ten Thousand Hands
      14531242, 14531242, // Opticlops
      38445524, 38445524, // Gil Garth
      49881766, 49881766, // Archfiend Soldier
      31829185, 31829185, // Dark Necrofear
      95178994, 95178994, 95178994, // Giant Germ
      78700060, 78700060, // Doomcaliber Knight
      26202165, // Sangan
      23205979, // Spirit Reaper
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      18161786, 18161786, 18161786, // Mystic Plasma Zone
      70828912, // Premature Burial
      87910978, // Brain Control
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      41420027, 41420027, // Solemn Judgment
      44095762, // Mirror Force
      56120475, // Sakuretsu Armor
      97077563, // Call of the Haunted
      29401950, 29401950, // Bottomless Trap Hole
      70342110, // Dimensional Prison
    ],
    extra: [],
  },
  // Aster Phoenix, stage 1
  "84": {
    main: [
      21844576, 21844576, 21844576, // Elemental HERO Avian
      58932615, 58932615, 58932615, // Elemental HERO Burstinatrix
      20721928, 20721928, // Elemental HERO Sparkman
      84327329, // Elemental HERO Clayman
      40044918, // Elemental HERO Stratos
      86188410, 86188410, // Elemental HERO Wildheart
      13093792, 13093792, // Destiny HERO - Diamond Dude
      41613948, // Destiny HERO - Doom Lord
      24094653, 24094653, // Polymerization
      45906428, 45906428, // Miracle Fusion
      213326, 213326, // E - Emergency Call
      32807846, 32807846, // Reinforcement of the Army
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      97169186, // Smashing Ground
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      22020907, // Hero Signal
      56120475, 56120475, // Sakuretsu Armor
      29401950, 29401950, // Bottomless Trap Hole
      55144522, // Pot of Greed
      41420027, 41420027, // Solemn Judgment
      69162969, // Lightning Vortex
    ],
    extra: [
      41436536, 41436536, // Elemental HERO Phoenix Enforcer
      88820235, 88820235, // Elemental HERO Shining Phoenix Enforcer
      35809262, // Elemental HERO Flame Wingman
      25366484, // Elemental HERO Shining Flare Wingman
      61204971, // Elemental HERO Thunder Giant
      47737087, // Elemental HERO Rampart Blaster
      55615891, // Elemental HERO Wild Wingman
      10526791, // Elemental HERO Wildedge
      60493189, // Elemental HERO Plasma Vice
    ],
  },
  // Aster Phoenix, stage 2
  "85": {
    main: [
      13093792, 13093792, 13093792, // Destiny HERO - Diamond Dude
      9411399, 9411399, // Destiny HERO - Malicious
      56570271, // Destiny HERO - Disk Commander
      41613948, 41613948, // Destiny HERO - Doom Lord
      81866673, 81866673, // Destiny HERO - Dasher
      77608643, // Destiny HERO - Captain Tenacious
      80744121, 80744121, // Destiny HERO - Fear Monger
      17132130, // Destiny HERO - Dogma
      7572887, // D.D. Warrior Lady
      74131780, // Exiled Force
      23205979, // Spirit Reaper
      31305911, // Marshmallon
      45809008, 45809008, 45809008, // Destiny Draw
      72204747, // Over Destiny
      75041269, // Clock Tower Prison
      32807846, 32807846, // Reinforcement of the Army
      67169062, // Pot of Avarice
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      29401950, 29401950, // Bottomless Trap Hole
      8698851, // D - Counter
    ],
    extra: [],
  },
  // Aster Phoenix, stage 3
  "86": {
    main: [
      13093792, 13093792, 13093792, // Destiny HERO - Diamond Dude
      9411399, 9411399, // Destiny HERO - Malicious
      56570271, // Destiny HERO - Disk Commander
      41613948, // Destiny HERO - Doom Lord
      81866673, 81866673, // Destiny HERO - Dasher
      77608643, // Destiny HERO - Captain Tenacious
      80744121, 80744121, // Destiny HERO - Fear Monger
      17132130, // Destiny HERO - Dogma
      83965310, // Destiny HERO - Plasma
      7572887, // D.D. Warrior Lady
      74131780, // Exiled Force
      23205979, // Spirit Reaper
      31305911, // Marshmallon
      45809008, 45809008, 45809008, // Destiny Draw
      72204747, // Over Destiny
      75041269, // Clock Tower Prison
      32807846, 32807846, // Reinforcement of the Army
      67169062, // Pot of Avarice
      19613556, // Heavy Storm
      5318639, // Mystical Space Typhoon
      70828912, // Premature Burial
      97169186, // Smashing Ground
      69162969, // Lightning Vortex
      87910978, // Brain Control
      44095762, // Mirror Force
      53582587, // Torrential Tribute
      97077563, // Call of the Haunted
      56120475, 56120475, // Sakuretsu Armor
      29401950, 29401950, // Bottomless Trap Hole
      8698851, // D - Counter
    ],
    extra: [],
  },
};
