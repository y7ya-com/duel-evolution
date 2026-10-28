// Engine card tables (0x00718b20..0x0071a270): archetype groups 20..62, the LV ladder, the group dispatcher.
// Pure functions of a card id (and the card DB); translated from the exe's switch trees, card names from the
// 2008 card data where known. tests/duel_cards_test.py compares every one with the decompiled code exhaustively.
#include "EngineInternal.h"

int engCardGroup58Core(int id);
int engIsAmazoness(int id);
int engIsAncientGear(int id);
int engIsArchfiend(int id);
int engIsBES(int id);
int engIsBatteryman(int id);
int engIsDarkScorpion(int id);
int engIsDarkWorld(int id);
int engIsDestinyHero(int id);
int engIsElementalHero(int id);
int engIsEvilHero(int id);
int engIsGravekeeper(int id);
int engIsGuardian(int id);
int engIsLvMonster(int id);
int engIsMachiners(int id);
int engIsNeos(int id);
int engIsNeosFusion(int id);
int engIsNeosFusionMonster(int id);
int engIsNinja(int id);
int engIsOjama(int id);
int engIsSixSamuraiMember(int id);
int engIsSphinx(int id);
int engIsToonName(int id);

// @yo2 0x00718b20 Harpie cards (group 20)
int engIsHarpie(int id) {
    switch (id) {
    case 0xfe4:  // Harpie Lady
    case 0xfe5:  // Harpie Lady Sisters
    case 0x1128:  // Harpie's Pet Dragon
    case 0x1246:  // Harpie's Feather Duster
    case 0x1477:  // Cyber Harpie Lady
    case 0x181f:  // Harpie Girl
    case 0x182a:  // Harpie Lady 1
    case 0x182b:  // Harpie Lady 2
    case 0x182c:  // Harpie Lady 3
    case 0x183f:  // Harpies' Hunting Ground
    case 0x1a1e:  // Harpie's Pet Baby Dragon
    case 0x1bc7:  // Harpie Queen
        return 1;
    }
    return 0;
}

// @yo2 0x00718bb0 "roid" cards (group 21)
int engIsRoid(int id) {
    if (id >= 0x18ef && id <= 0x18f5) return 1;  // Cycroid .. Jetroid
    if (id >= 0x1a55 && id <= 0x1a59) return 1;  // Stealthroid .. Rescueroid
    switch (id) {
    case 0xeb2:
    case 0x157b:  // Dark Jeroid
    case 0x18fa:  // Steam Gyroid
    case 0x18fb:  // UFOroid Fighter
    case 0x19f4:  // Elemental Hero Necroid Shaman
    case 0x1a4f:  // Expressroid
    case 0x1a50:  // Ambulanceroid
    case 0x1a52:  // Submarineroid
    case 0x1a53:  // Super Vehicroid Jumbo Drill
    case 0x1a5c:  // Vehicroid Connection Zone
    case 0x1ab3:  // Super Vehicroid - Stealth Union
    case 0x1b8f:
    case 0x1b90:  // Carrierroid
    case 0x1b91:  // Armoroid Gaidengo
    case 0x1e39:
        return 1;
    }
    return 0;
}

// @yo2 0x00718c80 Vehicroid cards (group 22)
int engIsVehicroid(int id) {
    switch (id) {
    case 0x1a53:  // Super Vehicroid Jumbo Drill
    case 0x1a5c:  // Vehicroid Connection Zone
    case 0x1ab3:  // Super Vehicroid - Stealth Union
        return 1;
    }
    return 0;
}

// @yo2 0x00718cb0 Chrysalis cards (group 24)
int engIsChrysalis(int id) {
    switch (id) {
    case 0x1a6c:  // Chrysalis Dolphin
    case 0x1bf3:  // Chrysalis Chicky
    case 0x1bf4:  // Chrysalis Pantail
    case 0x1bf5:  // Chrysalis Pinny
    case 0x1c04:  // Chrysalis Larva
    case 0x1c05:  // Chrysalis Mole
        return 1;
    }
    return 0;
}

// @yo2 0x00718cf0 Neo-Spacian cards (group 23)
int engIsNeoSpacian(int id) {
    if (id >= 0x1a70 && id <= 0x1a75) return 1;  // Neo-Spacian Aqua Dolphin .. Neo-Spacian Flare Scarab
    switch (id) {
    case 0x1c06:  // Neo-Spacian Marine Dolphin
    case 0x1d11:  // Neo-Spacian Twinkle Moss
        return 1;
    }
    return 0;
}

// @yo2 0x00718d30 Alien cards (group 25)
int engIsAlien(int id) {
    if (id >= 0x1a90 && id <= 0x1a95) return 1;  // Alien Grey .. Alien Mother
    switch (id) {
    case 0x1af1:  // Alien Infiltrator
    case 0x1b4b:  // Alien Psychic
    case 0x1c16:  // Alien Shocktrooper
    case 0x1c83:  // Alien Telepath
    case 0x1c84:  // Alien Hypno
        return 1;
    }
    return 0;
}

// @yo2 0x00718da0 Phantom Beast / mythical beast cards (group 26)
int engIsPhantomBeast(int id) {
    if (id >= 0x1b2a && id <= 0x1b2d) return 1;  // Phantom Beast Cross-Wing .. Phantom Beast Rock-Lizard
    switch (id) {
    case 0x1291:  // Gazelle the King of Mythical Beasts
    case 0x1294:  // Chimera the Flying Mythical Beast
        return 1;
    }
    return 0;
}

// @yo2 0x00718de0 a HERO: Elemental, Destiny or Evil Hero (group 27)
int engIsHero(int id) { return engIsElementalHero(id) || engIsDestinyHero(id) || engIsEvilHero(id) || id == 0x1a81; }

// @yo2 0x00718e50 Allure Queen cards (group 28)
int engIsAllureQueen(int id) {
    switch (id) {
    case 0x1ad6:  // Allure Queen LV3
    case 0x1ad7:  // Allure Queen LV5
    case 0x1ad8:  // Allure Queen LV7
        return 1;
    }
    return 0;
}

// @yo2 0x00718e80 Gadget cards (group 29)
int engIsGadget(int id) {
    switch (id) {
    case 0x13e4:  // Gadget Soldier
    case 0x1807:  // Green Gadget
    case 0x180b:  // Red Gadget
    case 0x180c:  // Yellow Gadget
    case 0x1ec9:
    case 0x1eca:
        return 1;
    }
    return 0;
}

// @yo2 0x00718ed0 "Six Samurai" cards: the monsters and three support cards (group 30)
int engIsSixSamurai(int id) { return engIsSixSamuraiMember(id) || id == 0x1b5f || id == 0x1c92 || id == 0x1d22; }

// @yo2 0x00718f20 "Six Samurai" monsters
int engIsSixSamuraiMember(int id) {
    if (id >= 0x1b33 && id <= 0x1b38) return 1;  // The Six Samurai - Yariza .. The Six Samurai - Irou
    switch (id) {
    case 0x1be9:  // Grandmaster of the Six Samurai
    case 0x1c6c:  // Chamberlain of the Six Samurai
    case 0x1c82:  // Spirit of the Six Samurai
    case 0x1ead:
        return 1;
    }
    return 0;
}

// @yo2 0x00718f70 the six "The Six Samurai" + Great Shogun Shien
int engIsTheSixSamurai(int id) {
    if (id >= 0x1b33 && id <= 0x1b39) return 1;  // The Six Samurai - Yariza .. Great Shogun Shien
    return 0;
}

// @yo2 0x00718fa0 Crystal Beast cards (group 31)
int engIsCrystalBeast(int id) {
    if (id >= 0x1ba2 && id <= 0x1ba6) return 1;  // Crystal Beast Ruby Carbuncle .. Crystal Beast Sapphire Pegasus
    switch (id) {
    case 0x1b9f:  // Crystal Beast Amethyst Cat
    case 0x1ba0:  // Crystal Beast Amber Mammoth
        return 1;
    }
    return 0;
}

// @yo2 0x00718ff0 Volcanic cards (group 32)
int engIsVolcanic(int id) {
    switch (id) {
    case 0xebc:
    case 0x1baa:  // Volcanic Shell
    case 0x1bab:  // Volcanic Scattershot
    case 0x1bad:  // Volcanic Doomfire
    case 0x1bbe:  // Volcanic Blaster
    case 0x1bbf:  // Volcanic Slicer
    case 0x1bc0:  // Volcanic Hammerer
    case 0x1bdb:  // Volcanic Recharge
    case 0x1c17:  // Volcanic Rat
    case 0x1c4b:  // Volcanic Rocket
    case 0x1cf7:  // Volcanic Counter
    case 0x1d9a:  // Volcanic Queen
        return 1;
    }
    return 0;
}

// @yo2 0x00719080 Blaze Accelerator cards (group 33)
int engIsBlazeAccelerator(int id) {
    switch (id) {
    case 0x1bae:  // Blaze Accelerator
    case 0x1bb0:  // Tri-Blaze Accelerator
        return 1;
    }
    return 0;
}

// @yo2 0x007190b0 Venom cards (group 34)
int engIsVenom(int id) {
    switch (id) {
    case 0x1bfc:  // Venom Swamp
    case 0x1c0c:  // Venom Snake
    case 0x1c0d:  // Venom Boa
    case 0x1c0e:  // Venom Serpent
    case 0x1c15:  // Venom Shot
    case 0x1c1a:  // Venom Cobra
    case 0x1c3b:  // Venom Burn
        return 1;
    }
    return 0;
}

// @yo2 0x00719140 Cloudian cards (group 35)
int engIsCloudian(int id) {
    if (id >= 0x1c60 && id <= 0x1c64) return 1;  // Cloudian - Eye of the Typhoon .. Cloudian - Poison Cloud
    if (id >= 0x1c6d && id <= 0x1c71) return 1;  // Cloudian - Smoke Ball .. Cloudian - Turbulence
    switch (id) {
    case 0xf5d:  // Cloudian Token
    case 0x1c89:  // Cloudian Squall
    case 0x1dbd:  // Cloudian - Storm Dragon
        return 1;
    }
    return 0;
}

// @yo2 0x007191b0 Gladiator Beast cards (group 36)
int engIsGladiatorBeast(int id) {
    if (id >= 0x1c72 && id <= 0x1c79) return 1;  // Gladiator Beast Alexander .. Gladiator Beast Secutor
    if (id >= 0x1c8b && id <= 0x1c8f) return 1;  // Colosseum - Cage of the Gladiator Beasts .. Gladiator Beast's Respite
    switch (id) {
    case 0x1c86:  // Gladiator Beast Gaiodiaz
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1cc5:  // Gladiator Beast Andal
    case 0x1d08:  // Gladiator Beast Darius
    case 0x1d23:  // Gladiator Beast's Battle Archfiend Shield
    case 0x1d38:  // Gladiator Beast Octavius
    case 0x1d39:  // Gladiator Beast Torax
    case 0x1dc1:  // Gladiator Beast Gyzarus
    case 0x1e2a:
    case 0x1e53:
        return 1;
    }
    return 0;
}

// @yo2 0x007192f0 Gladiator Beast's Battle equips (group 37)
int engIsGladiatorBeastEquip(int id) {
    switch (id) {
    case 0x1c8c:  // Gladiator Beast's Battle Halberd
    case 0x1c8d:  // Gladiator Beast's Battle Gladius
    case 0x1c8e:  // Gladiator Beast's Battle Manica
    case 0x1d23:  // Gladiator Beast's Battle Archfiend Shield
        return 1;
    }
    return 0;
}

// @yo2 0x00719330 Bamboo Sword cards (group 38)
int engIsBambooSword(int id) {
    switch (id) {
    case 0x1c39:  // Broken Bamboo Sword
        return 1;
    }
    return 0;
}

// @yo2 0x00719350 Evil Hero cards (group 39)
int engIsEvilHero(int id) {
    if (id >= 0x1c59 && id <= 0x1c5d) return 1;  // Evil Hero Inferno Wing .. Evil Hero Dark Gaia
    switch (id) {
    case 0x1cd0:  // Evil Hero Infernal Prodigy
    case 0x1cd2:  // Evil Hero Wild Cyclone
    case 0x1cd3:  // Evil Hero Infernal Sniper
    case 0x1cd4:  // Evil Hero Malicious Fiend
        return 1;
    }
    return 0;
}

// @yo2 0x00719430 archetype group 40 (ids past the 2008 card data) (group 40)
int engCardGroup40(int id) {
    switch (id) {
    case 0x1433:
    case 0x1434:
        return 1;
    }
    return 0;
}

// @yo2 0x00719460 Arcana Force cards (group 41)
int engIsArcanaForce(int id) {
    if (id >= 0x1d9d && id <= 0x1da6) return 1;  // Arcana Force 0 - The Fool .. Arcana Force EX - The Dark Ruler
    switch (id) {
    case 0xe8c:
    case 0xe8f:
    case 0x1cb0:  // Arcana Force Ex - The Light Ruler
        return 1;
    }
    return 0;
}

// @yo2 0x007194a0 archetype group 42 (group 42)
int engCardGroup42(int id) {
    switch (id) {
    case 0xea1:
    case 0xea2:
    case 0x1c55:
    case 0x1c5f:
        return 1;
    }
    return 0;
}

// @yo2 0x007194e0 Skyblaster cards (group 43)
int engIsSkyblaster(int id) {
    switch (id) {
    case 0xf5f:  // Skyblaster Token
    case 0x1cd8:  // Phantom Skyblaster
        return 1;
    }
    return 0;
}

// @yo2 0x00719510 the five Exodia pieces (group 44)
int engIsForbiddenOne(int id) {
    if (id >= 0xfb7 && id <= 0xfbb) return 1;  // Right Leg of the Forbidden One .. Exodia the Forbidden One
    return 0;
}

// @yo2 0x00719540 Rainbow Dragon cards (group 45)
int engIsRainbowDragon(int id) {
    switch (id) {
    case 0x1c03:  // Rainbow Dragon
    case 0x1cee:  // Rainbow Dark Dragon
        return 1;
    }
    return 0;
}

// @yo2 0x00719570 Cyber Dragon fusions (group 46)
int engIsCyberDragonFusion(int id) {
    switch (id) {
    case 0x18fc:  // Cyber Twin Dragon
    case 0x18fd:  // Cyber End Dragon
    case 0x1a4e:  // Chimeratech Overdragon
    case 0x1ceb:  // Chimeratech Fortress Dragon
        return 1;
    }
    return 0;
}

// @yo2 0x007195b0 Ice Barrier cards (group 47)
int engIsIceBarrier(int id) {
    switch (id) {
    case 0x1d67:  // Blizzed, Guard of the Ice Barrier
    case 0x1d69:
    case 0x1d7c:
    case 0x1e85:
    case 0x1e86:
    case 0x1f12:
    case 0x1f13:
    case 0x1f22:
        return 1;
    }
    return 0;
}

// @yo2 0x00719620 archetype group 48 (group 48)
int engCardGroup48(int id) {
    if (id >= 0x1f19 && id <= 0x1f1d) return 1;
    switch (id) {
    case 0x1d74:
    case 0x1d75:
    case 0x1d76:
    case 0x1d80:
    case 0x1e92:
    case 0x1e93:
    case 0x1e9c:
    case 0x1ea0:
    case 0x1f25:
        return 1;
    }
    return 0;
}

// @yo2 0x00719750 "Saber" cards (group 49)
int engIsSaber(int id) {
    if (id >= 0x1e8d && id <= 0x1e90) return 1;
    switch (id) {
    case 0x19c9:  // Saber Beetle
    case 0x1a8c:  // Sabersaurus
    case 0x1d70:
    case 0x1d71:
    case 0x1d72:
    case 0x1d7f:
    case 0x1e9b:
        return 1;
    }
    return 0;
}

// @yo2 0x007197c0 Worm cards (group 50)
int engIsWorm(int id) {
    if (id >= 0x1d77 && id <= 0x1d7b) return 1;
    if (id >= 0x1e94 && id <= 0x1e99) return 1;
    switch (id) {
    case 0xfbd:  // The Wicked Worm Beast
    case 0x111d:  // Dungeon Worm
    case 0x11d8:  // Needle Worm
    case 0x13c5:  // Worm Drake
    case 0x140c:  // Dimensionhole
    case 0x18bb:  // Medusa Worm
    case 0x1b41:  // Electric Virus
    case 0x1d91:  // Aztekipede, the Worm Warrior
    case 0x1f1e:
    case 0x1f1f:
    case 0x1f20:
        return 1;
    }
    return 0;
}

// @yo2 0x00719920 Lightsworn cards (group 51)
int engIsLightsworn(int id) {
    if (id >= 0x1da7 && id <= 0x1dae) return 1;  // Jain, Lightsworn Paladin .. Gragonith, Lightsworn Dragon
    switch (id) {
    case 0x1e2b:
    case 0x1e45:
    case 0x1e54:
    case 0x1e74:
    case 0x1e75:
        return 1;
    }
    return 0;
}

// @yo2 0x00719a60 Frog cards (group 52)
int engIsFrog(int id) {
    switch (id) {
    case 0xeca:
    case 0x1918:  // Des Frog
    case 0x191a:  // Poison Draw Frog
    case 0x19cb:  // Treeborn Frog
    case 0x19cc:  // Beelze Frog
    case 0x19d6:  // D.3.S. Frog
    case 0x1db2:  // Unifrog
        return 1;
    }
    return 0;
}

// @yo2 0x00719ab0 archetype group 53 (group 53)
int engCardGroup53(int id) {
    switch (id) {
    case 0x1e35:
        return 1;
    }
    return 0;
}

// @yo2 0x00719ad0 archetype group 54 (group 54)
int engCardGroup54(int id) {
    if (id >= 0x1e7f && id <= 0x1e83) return 1;
    if (id >= 0x1f0c && id <= 0x1f11) return 1;
    switch (id) {
    case 0x1e9a:
    case 0x1e9f:
    case 0x1f23:
    case 0x1f24:
        return 1;
    }
    return 0;
}

// @yo2 0x00719bf0 archetype group 55 (group 55)
int engCardGroup55(int id) {
    switch (id) {
    case 0x1d6a:
    case 0x1d6b:
    case 0x1d6c:
    case 0x1e87:
    case 0x1e89:
    case 0x1f14:
    case 0x1f15:
        return 1;
    }
    return 0;
}

// @yo2 0x00719c40 archetype group 56 (group 56)
int engCardGroup56(int id) {
    switch (id) {
    case 0x1d6d:
    case 0x1d6e:
    case 0x1d6f:
    case 0x1d7e:
    case 0x1e8a:
    case 0x1e8b:
    case 0x1e8c:
    case 0x1f16:
    case 0x1f17:
        return 1;
    }
    return 0;
}

// @yo2 0x00719c90 Neos, Neo-Spacians and HEROes (group 57)
int engIsHeroOrNeos(int id) { return engIsNeos(id) || engIsNeoSpacian(id) || engIsHero(id); }

// @yo2 0x00719ce0 archetype group 58
int engCardGroup58(int id) {
    if (id > 0x1ee1 && (id < 0x1ee5 || id == 0x1ef7)) return 1;
    return engCardGroup58Core(id);
}

// @yo2 0x00719d20 the core of archetype group 58
int engCardGroup58Core(int id) { return id > 0x1ec1 && id < 0x1ec9; }

// @yo2 0x00719d50 archetype group 59 (group 59)
int engCardGroup59(int id) {
    if (id >= 0x1ecd && id <= 0x1ed0) return 1;
    switch (id) {
    case 0x1edb:
        return 1;
    }
    return 0;
}

// @yo2 0x00719d90 archetype group 60 (group 60)
int engCardGroup60(int id) {
    if (id >= 0x1f08 && id <= 0x1f0b) return 1;
    switch (id) {
    case 0x1f21:
        return 1;
    }
    return 0;
}

// @yo2 0x00719dd0 archetype group 61 (group 61)
int engCardGroup61(int id) {
    if (id >= 0xebe && id <= 0xec4) return 1;
    return 0;
}

// @yo2 0x00719e00 Red-Eyes cards (group 62)
int engIsRedEyes(int id) {
    switch (id) {
    case 0xff8:  // Red-Eyes B. Dragon
    case 0x128c:  // Red-Eyes Black Metal Dragon
    case 0x1894:  // Red-Eyes Darkness Dragon
    case 0x1d85:  // Red-Eyes Darkness Metal Dragon
    case 0x1eae:
    case 0x1f2e:
        return 1;
    }
    return 0;
}

// @yo2 0x00719e50 the LV monsters a card levels into (or back from): their ids in out[] (null = discard), the count
int engLvNext(int id, int* out) {
    int dummy[2];
    if (!out) out = dummy;
    auto one = [&](int a) { out[0] = a; return 1; };
    auto two = [&](int a, int b) { out[0] = a; out[1] = b; return 2; };
    switch (id) {
    case 0x17d1: return one(0x1822);              // Ultimate Insect LV1 -> LV3
    case 0x1822: return two(0x17d1, 0x185e);      // LV3 -> LV1, LV5
    case 0x185e: return two(0x1822, 0x18af);      // LV5 -> LV3, LV7
    case 0x18af: return one(0x185e);              // LV7 -> LV5
    case 0x17d2: case 0x17d4: return one(0x17d3);  // Horus LV4 / LV8 -> LV6
    case 0x17d3: return one(0x17d4);              // Horus LV6 -> LV8
    case 0x17d5: return one(0x17d6);              // Dark Mimic LV1 -> LV3
    case 0x17d6: return one(0x17d5);
    case 0x17d7: return one(0x17d8);              // Mystic Swordsman LV2 -> LV4
    case 0x17d8: return one(0x1823);              // LV4 -> LV6
    case 0x17d9: case 0x17db: return one(0x17da);  // Armed Dragon LV3 / LV7 -> LV5
    case 0x17da: case 0x198c: return one(0x17db);  // Armed Dragon LV5 / LV10 -> LV7
    case 0x1812: case 0x1816: return one(0x1814);  // Silent Swordsman LV3 / LV7 -> LV5
    case 0x1814: return one(0x1816);              // LV5 -> LV7
    case 0x1817: return one(0x181a);              // Silent Magician LV4 -> LV8
    case 0x181a: return one(0x1817);
    case 0x1a6c: return one(0x1a70);
    case 0x1ad6: return one(0x1ad7);              // Allure Queen LV3 -> LV5
    case 0x1ad7: return two(0x1ad6, 0x1ad8);      // LV5 -> LV3, LV7
    case 0x1ad8: return one(0x1ad7);
    case 0x1adc: case 0x1ade: return one(0x1add);  // Dark Lucius LV4 / LV8 -> LV6
    case 0x1add: return two(0x1adc, 0x1ade);
    case 0x1bf3: return one(0x1a71);
    case 0x1bf4: return one(0x1a74);
    case 0x1bf5: return one(0x1a73);
    case 0x1c04: return one(0x1a75);
    case 0x1c05: return one(0x1a72);
    }
    return 0;
}

using CardPred = int (*)(int);
static const CardPred kCardGroups[0x3f] = {   // the exe's table at 0x00beb818
    engIsToonName, engIsArchfiend, engIsGravekeeper, engIsGuardian, engIsDarkScorpion, engIsAmazoness, engIsNinja,
    engIsLvMonster, engIsElementalHero, engIsDestinyHero, engIsNeosFusion, engIsNeosFusionMonster, engIsNeos,
    engIsOjama, engIsBatteryman, engIsDarkWorld, engIsBES, engIsAncientGear, engIsSphinx, engIsMachiners, engIsHarpie,
    engIsRoid, engIsVehicroid, engIsNeoSpacian, engIsChrysalis, engIsAlien, engIsPhantomBeast, engIsHero,
    engIsAllureQueen, engIsGadget, engIsSixSamurai, engIsCrystalBeast, engIsVolcanic, engIsBlazeAccelerator,
    engIsVenom, engIsCloudian, engIsGladiatorBeast, engIsGladiatorBeastEquip, engIsBambooSword, engIsEvilHero,
    engCardGroup40, engIsArcanaForce, engCardGroup42, engIsSkyblaster, engIsForbiddenOne, engIsRainbowDragon,
    engIsCyberDragonFusion, engIsIceBarrier, engCardGroup48, engIsSaber, engIsWorm, engIsLightsworn, engIsFrog,
    engCardGroup53, engCardGroup54, engCardGroup55, engCardGroup56, engIsHeroOrNeos, engCardGroup58, engCardGroup59,
    engCardGroup60, engCardGroup61, engIsRedEyes,
};

// @yo2 0x0071a240 the card belongs to archetype group n (the effect texts name groups by this index)
int engCardInGroup(int id, int group) {
    if (group < 0 || group > 0x3e) return 0;   // fix: the exe only checks the upper bound
    return kCardGroups[group](id);
}
