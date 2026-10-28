// Engine card tables (0x00716c10..0x00718b20): card properties: categories from the kind, art groups, archetype groups 0..19.
// Pure functions of a card id (and the card DB); translated from the exe's switch trees, card names from the
// 2008 card data where known. tests/duel_cards_test.py compares every one with the decompiled code exhaustively.
#include "EngineInternal.h"

int engIsNeos(int id);

// @yo2 0x00716c10 the card's copy limit (FUN_0073c190)
int engCardLimit(int id) { return cardLimit(id); }

// @yo2 0x00716c30 card category from its kind: 0 normal monster, 1 effect monster, 2 ritual, 3 fusion,
// 4..6 the three Egyptian gods (kind 0xb: id - 0x1382), 7 spell, 8 trap, 9 token, 10 synchro
int engCardCategory(int id) {
    switch (cardKind(id)) {
    case 1: case 6: case 7: case 8: case 9: case 0x10:   // effect, toon, spirit, union, gemini, effect tuner
        return 1;
    case 2: case 3:   // fusion, fusion effect
        return 3;
    case 4: case 5:   // ritual, ritual effect
        return 2;
    case 10:
        return 9;
    case 0xb:
        return id - 0x1382;
    case 0xd:
        return 7;
    case 0xe:
        return 8;
    case 0x11: case 0x12:   // synchro, synchro effect
        return 10;
    default:
        return 0;
    }
}

// @yo2 0x00716d10 the next alternative art of a card (cycles), the id itself when it has none
int engNextArt(int id) {
    switch (id) {
    case 0xf3e:  // Sheep Token
        return 0xf3f;
    case 0xf3f:  // Sheep Token
        return 0xf40;
    case 0xf40:  // Sheep Token
        return 0xf41;
    case 0xf41:  // Sheep Token
        return 0xf3e;
    case 0xf4b:  // Ojama Token
        return 0xf4c;
    case 0xf4c:  // Ojama Token
        return 0xf4d;
    case 0xf4d:  // Ojama Token
        return 0xf4b;
    case 0xf4e:  // Lamb Token
        return 0xf4f;
    case 0xf4f:  // Lamb Token
        return 0xf4e;
    case 0xf55:  // Fluffy Token
    case 0x19ee:  // Fluffy Token (alt art)
        return 0xf56;
    case 0xf56:  // Fluffy Token
        return 0xf55;
    case 0xfa6:
        return 0xfa7;
    case 0xfa7:  // Blue-Eyes White Dragon
        return 0xfa6;
    case 0xfc9:  // Dark Magician
        return 0x142d;
    case 0xfe4:  // Harpie Lady
        return 0x1477;
    case 0x10f4:  // Umi
        return 0x150b;
    case 0x12e5:  // Polymerization
        return 0x1303;
    case 0x1303:  // Polymerization
        return 0x12e5;
    case 0x142d:  // Dark Magician
        return 0xfc9;
    case 0x1477:  // Cyber Harpie Lady
        return 0x182a;
    case 0x14f9:  // Sheep Token (alt art)
        return 0x154f;
    case 0x150b:  // A Legendary Ocean
        return 0x10f4;
    case 0x154f:  // Sheep Token (alt art)
        return 0x1550;
    case 0x1550:  // Sheep Token (alt art)
        return 0x1551;
    case 0x1551:  // Sheep Token (alt art)
        return 0x14f9;
    case 0x1670:  // Ojama Token (alt art)
        return 0x1671;
    case 0x1671:  // Ojama Token (alt art)
        return 0x1672;
    case 0x1672:  // Ojama Token (alt art)
        return 0x1670;
    case 0x1730:  // Lamb Token (alt art)
        return 0x1731;
    case 0x1731:  // Lamb Token (alt art)
        return 0x1730;
    case 0x182a:  // Harpie Lady 1
        return 0x182b;
    case 0x182b:  // Harpie Lady 2
        return 0x182c;
    case 0x182c:  // Harpie Lady 3
        return 0xfe4;
    case 0x1a70:  // Neo-Spacian Aqua Dolphin
        return 0x1c06;
    case 0x1a73:  // Neo-Spacian Glow Moss
        return 0x1d11;
    case 0x1c06:  // Neo-Spacian Marine Dolphin
        return 0x1a70;
    case 0x1d11:  // Neo-Spacian Twinkle Moss
        return 0x1a73;
    }
    return id;
}

// The cards that exist in several arts: each group is one card for "same card" checks.
static int artGroup(int id) {
    switch (id) {
    case 0xf3e: case 0xf3f: case 0xf40: case 0xf41: case 0x14f9: case 0x154f: case 0x1550: case 0x1551:
        return 1;   // Sheep Token
    case 0xf4b: case 0xf4c: case 0xf4d: case 0x1670: case 0x1671: case 0x1672:
        return 2;   // Ojama Token
    case 0xf4e: case 0xf4f: case 0x1730: case 0x1731:
        return 3;   // Lamb Token
    case 0xf55: case 0xf56: case 0x19ee:
        return 4;   // Fluffy Token
    case 0xfa6: case 0xfa7:
        return 5;   // Blue-Eyes White Dragon
    case 0xfc9: case 0x142d:
        return 6;   // Dark Magician
    case 0x10f4: case 0x150b:
        return 7;   // Umi / A Legendary Ocean
    case 0x12e5: case 0x1303:
        return 8;   // Polymerization
    case 0xfe4: case 0x1477: case 0x182a: case 0x182b: case 0x182c:
        return 9;   // Harpie Lady
    case 0x1a70: case 0x1c06:
        return 10;
    case 0x1a73: case 0x1d11:
        return 11;
    }
    return 0;
}

// @yo2 0x00717230 card a counts as card b (equal, or two arts of one card)
int engSameCard(int a, int b) {
    if (a == b) return 1;
    int g = artGroup(a);
    return g && g == artGroup(b);
}

// @yo2 0x00717760 system ids (<= 0xf3b), the Egyptian gods and a few unplayable cards
int engIsSpecialId(int id) {
    if (id <= 0xf3b) return 1;
    if (id >= 0x1433 && id <= 0x1446) return 1;
    switch (id) {
    case 0x12d6:
    case 0x1386:  // Obelisk the Tormentor
    case 0x1387:  // Slifer the Sky Dragon
    case 0x1388:  // The Winged Dragon of Ra
    case 0x1ab2:  // Power Wall
    case 0x1abd:
    case 0x1abe:
    case 0x1abf:
    case 0x1ac2:
    case 0x1c55:
    case 0x1c5f:
        return 1;
    }
    return 0;
}

// 0x007177f0 cardIsMonster, 0x00717820 cardIsSpell and 0x00717850 cardIsTrap are inline in CardDB.h.
// @yo2 0x007177f0 (CardDB.h cardIsMonster)
// @yo2 0x00717820 (CardDB.h cardIsSpell)
// @yo2 0x00717850 (CardDB.h cardIsTrap)

// @yo2 0x00717880 a normal monster (kind 0) or a normal tuner (kind 0xf)
int engIsNormalKind(int id) {
    int k = cardKind(id);
    return k == 0 || k == 0xf;
}

// @yo2 0x007178b0 an effect monster kind: effect, fusion/ritual effect, toon, spirit, union, gemini, token-god,
// effect tuner, synchro effect
int engIsEffectKind(int id) {
    switch (cardKind(id)) {
    case 1: case 3: case 5: case 6: case 7: case 8: case 9: case 0xb: case 0x10: case 0x12:
        return 1;
    default:
        return 0;
    }
}

// @yo2 0x00717920
int engIsFusion(int id) { return engCardCategory(id) == 3; }

// @yo2 0x00717950
int engIsSynchro(int id) { return engCardCategory(id) == 10; }

// @yo2 0x00717980 an extra deck monster
int engIsFusionOrSynchro(int id) {
    int c = engCardCategory(id);
    return c == 3 || c == 10;
}

// @yo2 0x007179b0
int engIsRitual(int id) { return engCardCategory(id) == 2; }

// @yo2 0x007179e0
int engIsTokenKind(int id) { return cardKind(id) == 10; }

// @yo2 0x00717a10
int engIsToonKind(int id) { return cardKind(id) == 6; }

// @yo2 0x00717a40
int engIsSpiritKind(int id) { return cardKind(id) == 7; }

// @yo2 0x00717aa0
int engIsGeminiKind(int id) { return cardKind(id) == 9; }
// (0x00717a70, kind 8 = union, is engCard717a70 in EngineRules1.cpp)

// @yo2 0x00717ad0 a tuner (kinds 0xf and 0x10)
int engIsTunerKind(int id) {
    int k = cardKind(id);
    return k > 0xe && k < 0x11;
}

// @yo2 0x00717b00 "Toon" in the name (group 0)
int engIsToonName(int id) {
    if (id >= 0x1561 && id <= 0x1566) return 1;  // Toon Defense .. Toon Goblin Attack Force
    switch (id) {
    case 0xecd:
    case 0x1123:  // Toon Alligator
    case 0x127d:  // Manga Ryu-Ran
    case 0x127e:  // Toon Mermaid
    case 0x127f:  // Toon Summoned Skull
    case 0x12a5:  // Blue-Eyes Toon Dragon
    case 0x12be:  // Toon World
    case 0x154a:  // Toon Dark Magician Girl
        return 1;
    }
    return 0;
}

// @yo2 0x00717b80 Archfiend ("Demon") cards (group 1)
int engIsArchfiend(int id) {
    if (id >= 0x168c && id <= 0x1692) return 1;  // Vilepawn Archfiend .. Skull Archfiend of Lightning
    switch (id) {
    case 0xfbc:  // Summoned Skull
    case 0x1070:  // Archfiend Marmot of Nefariousness
    case 0x107f:  // B. Skull Dragon
    case 0x10ab:  // Archfiend Mirror
    case 0x10d6:  // Axe of Despair
    case 0x127f:  // Toon Summoned Skull
    case 0x12b5:  // Beast of Talwar
    case 0x13e3:  // Archfiend of Gilfer
    case 0x1441:
    case 0x14b7:  // Lesser Fiend
    case 0x14cd:  // Shadow Tamer
    case 0x14da:  // Fiend Skull Dragon
    case 0x165a:  // A Deal with Dark Ruler
    case 0x1682:  // Archfiend Soldier
    case 0x169d:  // Archfiend's Oath
    case 0x16a4:  // Archfiend's Roar
    case 0x1911:  // Cyber Archfiend
    case 0x1bc6:  // Archfiend General
    case 0x1bed:  // Mist Archfiend
    case 0x1cca:  // Imprisoned Queen Archfiend
    case 0x1d23:  // Gladiator Beast's Battle Archfiend Shield
    case 0x1e37:
    case 0x1e3a:
    case 0x1ebf:
        return 1;
    }
    return 0;
}

// @yo2 0x00717e20 Gravekeeper's cards (group 2)
int engIsGravekeeper(int id) {
    if (id >= 0x1585 && id <= 0x158d) return 1;  // Gravekeeper's Spy .. Gravekeeper's Assailant
    switch (id) {
    case 0x131d:  // Gravekeeper's Servant
    case 0x1bc2:  // Gravekeeper's Commandant
        return 1;
    }
    return 0;
}

// @yo2 0x00717e60 "Guardian" cards (group 3)
int engIsGuardian(int id) {
    if (id >= 0x164a && id <= 0x164f) return 1;  // Guardian Elma .. Guardian Tryce
    switch (id) {
    case 0xffe:  // Metal Guardian
    case 0x111c:  // Gate Guardian
    case 0x11a7:  // Guardian of the Throne Room
    case 0x1266:  // Skull Guardian
    case 0x1452:  // Fairy Guardian
    case 0x152e:  // Guardian Sphinx
    case 0x170b:  // Guardian Angel Joan
    case 0x18b0:  // Lost Guardian
    case 0x18ba:  // Guardian Statue
    case 0x1e38:
    case 0x1e73:
    case 0x1f0a:
        return 1;
    }
    return 0;
}

// @yo2 0x00717f00 Dark Scorpion cards (group 4)
int engIsDarkScorpion(int id) {
    switch (id) {
    case 0x143f:
    case 0x1440:
    case 0x1531:  // Dark Scorpion Burglars
    case 0x161e:  // Cliff the Trap Remover
    case 0x1656:  // Dark Scorpion - Chick the Yellow
    case 0x1685:  // Dark Scorpion - Gorg the Strong
    case 0x1686:  // Dark Scorpion - Meanae the Thorn
    case 0x169e:  // Mustering of the Dark Scorpions
    case 0x16a3:  // Dark Scorpion Combination
        return 1;
    }
    return 0;
}

// @yo2 0x00717fa0 Amazoness cards (group 5)
int engIsAmazoness(int id) {
    switch (id) {
    case 0x143e:
    case 0x144b:  // Amazon Archer
    case 0x14a4:  // Amazoness Swords Woman
    case 0x14a6:  // Amazoness Archers
    case 0x14ab:  // Amazoness Chain Master
    case 0x14af:  // Amazoness Fighter
    case 0x14b0:  // Amazoness Spellcaster
    case 0x160d:  // Amazoness Paladin
    case 0x160e:  // Amazoness Blowpiper
    case 0x160f:  // Amazoness Tiger
        return 1;
    }
    return 0;
}

// @yo2 0x00718010 Ninja cards (group 6)
int engIsNinja(int id) {
    switch (id) {
    case 0x117b:  // Armed Ninja
    case 0x16b8:  // Crimson Ninja
    case 0x16b9:  // Strike Ninja
    case 0x1754:  // Lady Ninja Yae
    case 0x17df:  // Ninja Grandmaster Sasuke
    case 0x18be:  // White Ninja
    case 0x1bcb:  // Goe Goe the Gallant Ninja
        return 1;
    }
    return 0;
}

// @yo2 0x00718080 LV monster series (1 Ultimate Insect, 2 Horus, 3 Dark Mimic, 4 Mystic Swordsman, 5 Armed Dragon, 6 Silent Swordsman, ...); 0 = none
int engLvSeries(int id) {
    switch (id) {
    case 0x17d1:  // Ultimate Insect LV1
    case 0x1822:  // Ultimate Insect LV3
    case 0x185e:  // Ultimate Insect LV5
    case 0x18af:  // Ultimate Insect LV7
        return 1;
    case 0x17d2:  // Horus the Black Flame Dragon LV4
    case 0x17d3:  // Horus the Black Flame Dragon LV6
    case 0x17d4:  // Horus the Black Flame Dragon LV8
        return 2;
    case 0x17d5:  // Dark Mimic LV1
    case 0x17d6:  // Dark Mimic LV3
        return 3;
    case 0x17d7:  // Mystic Swordsman LV2
    case 0x17d8:  // Mystic Swordsman LV4
    case 0x1823:  // Mystic Swordsman LV6
        return 4;
    case 0x17d9:  // Armed Dragon LV3
    case 0x17da:  // Armed Dragon LV5
    case 0x17db:  // Armed Dragon LV7
    case 0x198c:  // Armed Dragon LV10
        return 5;
    case 0x1812:  // Silent Swordsman LV3
    case 0x1814:  // Silent Swordsman LV5
    case 0x1816:  // Silent Swordsman LV7
        return 6;
    case 0x1817:  // Silent Magician LV4
    case 0x181a:  // Silent Magician LV8
        return 7;
    case 0x1906:  // Winged Kuriboh LV10
    case 0x1d66:
        return 8;
    case 0x1ad6:  // Allure Queen LV3
    case 0x1ad7:  // Allure Queen LV5
    case 0x1ad8:  // Allure Queen LV7
        return 9;
    case 0x1adc:  // Dark Lucius LV4
    case 0x1add:  // Dark Lucius LV6
    case 0x1ade:  // Dark Lucius LV8
        return 10;
    }
    return 0;
}

// @yo2 0x007181e0 an LV monster (group 7)
int engIsLvMonster(int id) { return engLvSeries(id) > 0; }

// @yo2 0x00718210 Elemental Hero cards (group 8)
int engIsElementalHero(int id) {
    if (id >= 0x18a6 && id <= 0x18a9) return 1;  // Elemental Hero Avian .. Elemental Hero Sparkman
    switch (id) {
    case 0x18c8:  // Elemental Hero Flame Wingman
    case 0x18c9:  // Elemental Hero Thunder Giant
    case 0x18f9:  // Elemental Hero Bubbleman
    case 0x1943:  // Elemental Hero Shining Flare Wingman
    case 0x194d:  // Elemental Hero Bladedge
    case 0x194e:  // Elemental Hero Wildheart
    case 0x1956:  // Elemental Hero Rampart Blaster
    case 0x1957:  // Elemental Hero Tempest
    case 0x1958:  // Elemental Hero Wildedge
    case 0x197f:  // Elemental Hero Necroshade
    case 0x1981:  // Elemental Hero Mudballman
    case 0x1987:  // Elemental Hero Steam Healer
    case 0x19a6:  // Elemental Hero Neo Bubbleman
    case 0x19ef:  // Elemental Hero Electrum
    case 0x19f3:  // Elemental Hero Wild Wingman
    case 0x19f4:  // Elemental Hero Necroid Shaman
    case 0x19fd:  // Elemental Hero Neos
    case 0x19ff:  // Elemental Hero Phoenix Enforcer
    case 0x1a00:  // Elemental Hero Shining Phoenix Enforcer
    case 0x1a01:  // Elemental Hero Mariner
    case 0x1a48:  // Elemental Hero Woodsman
    case 0x1a4b:  // Elemental Hero Terra Firma
    case 0x1a4d:  // Elemental Hero Ocean
    case 0x1a6d:  // Elemental Hero Dark Neos
    case 0x1a6e:  // Elemental Hero Aqua Neos
    case 0x1a6f:  // Elemental Hero Flare Neos
    case 0x1a80:  // Elemental Hero Stratos
    case 0x1acf:  // Elemental Hero Knospe
    case 0x1ad2:  // Elemental Hero Poison Rose
    case 0x1b0f:  // Elemental Hero Heat
    case 0x1b4c:  // Elemental Hero Glow Neos
    case 0x1b4d:  // Elemental Hero Air Neos
    case 0x1b4e:  // Elemental Hero Grand Neos
    case 0x1b70:  // Elemental Hero Lady Heat
    case 0x1b72:  // Elemental Hero Inferno
    case 0x1b92:  // Elemental Hero Voltic
    case 0x1bc1:  // Elemental Hero Captain Gold
    case 0x1c07:  // Elemental Hero Marine Neos
    case 0x1c08:  // Elemental Hero Darkbright
    case 0x1c09:  // Elemental Hero Magma Neos
    case 0x1c1b:  // Elemental Hero Neos Alius
    case 0x1c54:  // Elemental Hero Plasma Vice
    case 0x1c6b:  // Elemental Hero Chaos Neos
    case 0x1d12:  // Elemental Hero Storm Neos
    case 0x1d43:  // Elemental Hero Prisma
    case 0x1e7e:
        return 1;
    }
    return 0;
}

// @yo2 0x00718660 Neos contact fusions (group 10)
int engIsNeosFusion(int id) {
    switch (id) {
    case 0x19fd:  // Elemental Hero Neos
    case 0x1a6d:  // Elemental Hero Dark Neos
    case 0x1a6e:  // Elemental Hero Aqua Neos
    case 0x1a6f:  // Elemental Hero Flare Neos
    case 0x1b4c:  // Elemental Hero Glow Neos
    case 0x1b4d:  // Elemental Hero Air Neos
    case 0x1b4e:  // Elemental Hero Grand Neos
    case 0x1c07:  // Elemental Hero Marine Neos
    case 0x1c09:  // Elemental Hero Magma Neos
    case 0x1c6b:  // Elemental Hero Chaos Neos
    case 0x1d12:  // Elemental Hero Storm Neos
    case 0x1d13:  // Rainbow Neos
        return 1;
    }
    return 0;
}

// @yo2 0x007186e0 a fusion monster of the Neos family (group 11)
int engIsNeosFusionMonster(int id) { return engIsFusion(id) && engIsNeos(id); }

// @yo2 0x00718720 Neos, its contact fusions and the cards named after it (group 12)
int engIsNeos(int id) {
    if (engIsNeosFusion(id)) return 1;
    switch (id) {
    case 0x1a77:  // Elemental Hero Neos
    case 0x1b51:  // Neo Space
    case 0x1bfb:
    case 0x1c1b:
    case 0x1c29:
    case 0x1d17:
    case 0x1d81:
    case 0x1e7d:
    case 0x1e7e:
        return 1;
    }
    return 0;
}

// @yo2 0x007187c0 Destiny Hero cards (group 9)
int engIsDestinyHero(int id) {
    if (id >= 0x1a02 && id <= 0x1a05) return 1;  // Destiny Hero - Doom Lord .. Destiny Hero - Dreadmaster
    if (id >= 0x1a60 && id <= 0x1a65) return 1;  // Destiny Hero - Blade Master .. Destiny Hero - Dogma
    switch (id) {
    case 0x1b25:  // Destiny Hero - Malicious
    case 0x1bb7:  // Destiny Hero - Disk Commander
    case 0x1bb8:  // Destiny Hero - Plasma
    case 0x1cf8:  // Destiny Hero - Dunker
    case 0x1cf9:  // Destiny Hero - Departed
    case 0x1d99:  // Destiny Hero - Dread Servant
        return 1;
    }
    return 0;
}

// @yo2 0x00718840 Ojama cards (group 13)
int engIsOjama(int id) {
    switch (id) {
    case 0xeb0:
    case 0xf4b:  // Ojama Token
    case 0xf4c:  // Ojama Token
    case 0xf4d:  // Ojama Token
    case 0x166a:  // Ojama Trio
    case 0x1670:  // Ojama Token (alt art)
    case 0x1671:  // Ojama Token (alt art)
    case 0x1672:  // Ojama Token (alt art)
    case 0x1681:  // Ojama Green
    case 0x16b3:  // Ojama Yellow
    case 0x16b4:  // Ojama Black
    case 0x16cf:  // Ojama Delta Hurricane!!
    case 0x17ee:  // Ojama King
    case 0x1945:  // Ojamuscle
    case 0x1946:  // Ojamagic
    case 0x1c0b:  // Ojama Knight
        return 1;
    }
    return 0;
}

// @yo2 0x007188e0 Batteryman cards (group 14)
int engIsBatteryman(int id) {
    switch (id) {
    case 0x18c3:  // Batteryman AA
    case 0x191c:  // Batteryman C
    case 0x1a2f:  // Batteryman D
    case 0x1db3:  // Batteryman Charger
    case 0x1db4:  // Batteryman Industrial Strength
    case 0x1db5:  // Batteryman Micro-Cell
        return 1;
    }
    return 0;
}

// @yo2 0x00718920 Dark World cards (group 15)
int engIsDarkWorld(int id) {
    if (id >= 0x1965 && id <= 0x196a) return 1;  // Beiige, Vanguard of Dark World .. Scarr, Scout of Dark World
    switch (id) {
    case 0xec9:
    case 0x1961:  // Zure, Knight of Dark World
    case 0x1970:  // Dark World Lightning
    case 0x1973:  // Gateway to Dark World
    case 0x1b3d:  // Reign-Beaux, Overlord of Dark World
    case 0x1b3e:  // Kahkki, Guerilla of Dark World
    case 0x1b3f:  // Gren, Tactician of Dark World
    case 0x1b5a:  // Dark World Dealings
    case 0x1c18:  // Renge, Gatekeeper of Dark World
    case 0x1d25:  // Dark World Grimoire
        return 1;
    }
    return 0;
}

// @yo2 0x007189b0 B.E.S. cards (group 16)
int engIsBES(int id) {
    switch (id) {
    case 0xea5:
    case 0x1837:  // Big Core
    case 0x1913:  // B.E.S. Crystal Core
    case 0x1962:  // B.E.S. Tetran
    case 0x19bf:  // B.E.S. Covered Core
        return 1;
    }
    return 0;
}

// @yo2 0x00718a00 Ancient Gear cards (group 17)
int engIsAncientGear(int id) {
    if (id >= 0x1ab9 && id <= 0x1abc) return 1;  // Ancient Gear Engineer .. Ancient Gear Fist
    switch (id) {
    case 0x18ab:  // Ancient Gear Golem
    case 0x18ac:  // Ancient Gear Beast
    case 0x18ad:  // Ancient Gear Soldier
    case 0x19aa:  // Ancient Gear
    case 0x19ad:  // Ancient Gear Factory
    case 0x19ae:  // Ancient Gear Drill
    case 0x19b2:  // Ancient Gear Castle
    case 0x19bb:  // Ancient Gear Cannon
    case 0x1b14:  // Ancient Gear Gadjiltron Dragon
    case 0x1b15:  // Ancient Gear Gadjiltron Chimera
    case 0x1b17:  // Ancient Gear Workshop
    case 0x1c7e:  // Ancient Gear Knight
    case 0x1dc0:  // Ultimate Ancient Gear Golem
        return 1;
    }
    return 0;
}

// @yo2 0x00718aa0 Sphinx cards (group 18)
int engIsSphinx(int id) {
    switch (id) {
    case 0x152e:  // Guardian Sphinx
    case 0x17c7:  // Andro Sphinx
    case 0x17c8:  // Sphinx Teleia
    case 0x17c9:  // Theinen the Great Sphinx
    case 0x18b1:  // Hieracosphinx
    case 0x18b2:  // Criosphinx
        return 1;
    }
    return 0;
}

// @yo2 0x00718ae0 Machiners cards (group 19)
int engIsMachiners(int id) {
    switch (id) {
    case 0x189e:  // Machiners Soldier
    case 0x189f:  // Machiners Defender
    case 0x18a0:  // Machiners Sniper
    case 0x18a4:  // Machiners Force
        return 1;
    }
    return 0;
}
