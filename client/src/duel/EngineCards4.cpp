// Engine card tables (0x006ed310..0x006f0000): chain link checks and per-card answers for the effect code.
// Pure functions of a card id, a chain link record or the card DB; translated from the exe's switch trees.
// tests/duel_cards_test.py compares every one with the decompiled code exhaustively.
//
// A chain link record (u16 words): [0] card id, [1] bit 0 player, bits 6..11 location, bits 12..13 how it was
// activated, bit 15 a flag; [3] bits 0..6 target count; [4..8] targets; [6] the effect chosen; [9] ring index of
// targets past 5; u32 at [10] effect flags.
#include <cstring>

#include "EngineInternal.h"


static uint32_t linkDword(const uint16_t* link) {
    uint32_t v;
    memcpy(&v, link + 10, 4);
    return v;
}

// @yo2 0x006ed310 a chain link's spell speed: the card's own (FUN_0071ba00) unless the link says otherwise
int engLinkSpellSpeed(const uint16_t* link) {
    int id = link[0];
    uint16_t how = link[1] & 0x3000, loc = link[1] & 0xfc0;
    switch (id) {
    case 0x1ba7:
        if (how == 0x3000) return 2;
        break;
    case 0x1c03:  // Rainbow Dragon
        if (link[6] == 2) return 1;
        break;
    case 0x1aa5: case 0x1e36:
        if (how == 0x2000) return 1;
        break;
    case 0x1529: case 0x1d96:
        if (how == 0x3000) return 1;
        break;
    case 0x1d0a:
        if ((link[1] & 0x8000) && loc != 0x940) return 1;
        break;
    case 0x1534: case 0x1caf: case 0x1cb0:  // Fushioh Richie, ...
        if (loc != 0 || how != 0x1000) return 1;
        break;
    case 0x1da3: case 0x1e3a:
        if (how == 0x1000) return 1;
        break;
    }
    return engSpellSpeed(id);
}

// the id lists of FUN_006ed4a0, per k
static const int s_k0d[] = {0xeab, 0xec2, 0x1119, 0x111a, 0x111b, 0x13a7, 0x1493, 0x14be, 0x1853, 0x1883, 0x1d96, 0x1e17, 0x1e26, 0x1ef2};
static const int s_k0e[] = {0xeb2, 0xfe0, 0x151b, 0x1ab2, 0x1da3, 0x1e4b};
static const int s_k0f[] = {0x1352, 0x135a, 0x138f, 0x17ca, 0x19b6, 0x1b61, 0x1bff};
static const int s_k10[] = {0x1352, 0x135a};
static const int s_k14[] = {0xeab, 0xeae, 0xeb6, 0x1231, 0x1238, 0x1243, 0x12cf, 0x12d0, 0x12f1, 0x12f2, 0x1329, 0x132a, 0x1330, 0x1381, 0x138e, 0x13ee, 0x1409, 0x1492, 0x14be, 0x14eb, 0x1514, 0x153d, 0x15a6, 0x167b, 0x16e3, 0x1763, 0x184b, 0x1853, 0x1882, 0x192d, 0x19b4, 0x1a60, 0x1a69, 0x1c03, 0x1c3e, 0x1d2b, 0x1d83, 0x1d96, 0x1e0f, 0x1e26, 0x1e3e, 0x1ee1, 0x1ef1, 0x1efb};
static const int s_k16[] = {0x12ba, 0x134b, 0x14a7, 0x18d4, 0x195e, 0x1990, 0x19e0, 0x1a17, 0x1acb, 0x1b5d, 0x1bf8, 0x1cdc, 0x1d28, 0x1d30, 0x1e4f, 0x1e51};

// @yo2 0x006ed4a0 the card answers question k of the effect code (k = 0xd..0x16); spell icon 1 and the
// first list answer every k
int engCardAnswers(int id, int k) {
    if (cardIcon(id) == 1) return 1;
    switch (id) {
    case 0x148c:  // Maryokutai
    case 0x14f2:  // Null and Void
    case 0x15fc:  // Dark Paladin
    case 0x168f:  // Desrook Archfiend
    case 0x17c2:  // Blue-Eyes Shining Dragon
    case 0x17c6:  // Sorcerer of Dark Magic
    case 0x17d4:  // Horus the Black Flame Dragon LV8
    case 0x183a:  // A-Team: Trap Disposal Unit
    case 0x1936:  // Alkana Knight Joker
    case 0x1a24:  // Herald of Purple Light
    case 0x1a25:  // Herald of Green Light
    case 0x1b90:  // Carrierroid
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1d0a:  // Superancient Deepsea King Coelacanth
    case 0x1d8f:  // Prime Material Dragon
    case 0x1df9:
    case 0x1e36:
    case 0x1e3a:
    case 0x1ed5:
    case 0x1f0b:
    case 0x1f21:
        return 1;
    }
    const int* list = nullptr;
    size_t n = 0;
    switch (k) {
    case 0xd: list = s_k0d; n = sizeof s_k0d / sizeof *s_k0d; break;
    case 0xe: list = s_k0e; n = sizeof s_k0e / sizeof *s_k0e; break;
    case 0xf: list = s_k0f; n = sizeof s_k0f / sizeof *s_k0f; break;
    case 0x10: list = s_k10; n = sizeof s_k10 / sizeof *s_k10; break;
    case 0x14: list = s_k14; n = sizeof s_k14 / sizeof *s_k14; break;
    case 0x16: list = s_k16; n = sizeof s_k16 / sizeof *s_k16; break;
    }
    for (size_t i = 0; i < n; i++)
        if (list[i] == id) return 1;
    return 0;
}

// @yo2 0x006edf80 the listed cards
int engCard6edf80(int id) {
    switch (id) {
    case 0x12fd:  // Solemn Judgment
    case 0x1300:  // Horn of Heaven
    case 0x1517:  // Royal Oppression
    case 0x1932:  // The Selection
    case 0x1a38:  // Forced Back
    case 0x1b06:  // Black Horn of Heaven
    case 0x1ce5:  // Thunder King Rai-Oh
    case 0x1e52:
    case 0x1e7b:
    case 0x1ef9:
        return 1;
    }
    return 0;
}

// @yo2 0x006ee000 always 0 (an empty handler)
int engNo6ee000() { return 0; }

// @yo2 0x006ee020 always 0 (an empty handler)
int engNo6ee020() { return 0; }

// @yo2 0x006ee040 always 0 (an empty handler)
int engNo6ee040() { return 0; }

// @yo2 0x006ee060 a chain link's card: 1, 2 or 3 for the listed cards, 0 otherwise
int engLink6ee060(const uint16_t* link) {
    int id = link[0];
    switch (id) {
    case 0xec3:
    case 0x11f5:  // Morphing Jar
    case 0x12d5:  // Card Destruction
    case 0x13b4:  // Rigorous Reaver
    case 0x14e8:  // Dragged Down into the Grave
    case 0x15a4:  // Royal Tribute
    case 0x1738:  // Dangerous Machine Type-6
    case 0x17a8:  // The Law of the Normal
    case 0x1803:  // Mind Crush
    case 0x1b5a:  // Dark World Dealings
        return 3;
    case 0xec9:
    case 0x1209:  // Hiro's Shadow Scout
    case 0x1324:  // Confiscation
    case 0x1325:  // Delinquent Duo
    case 0x1509:  // Fengsheng Mirror
    case 0x150d:  // Smoke Grenade of the Thief
    case 0x151c:  // Drop Off
    case 0x1571:  // Helpoemer
    case 0x176c:  // Mazera DeVille
    case 0x182e:  // Thestalos the Firestorm Monarch
    case 0x199b:  // Dark Red Enchanter
    case 0x1bdc:  // Terrible Deal
    case 0x1bdf:  // Introduction to Gallantry
    case 0x1be0:  // Secrets of the Gallant
    case 0x1c1d:  // Aquarian Alessa
    case 0x1c70:  // Cloudian - Altus
    case 0x1d31:  // Drastic Drop Off
    case 0x1de0:  // Gladiator Lash
        return 2;
    case 0x12cc:  // Graceful Charity
    case 0x12fa:  // The Cheerful Coffin
    case 0x1539:  // Mirage of Nightmare
    case 0x1769:  // Beckoning Light
    case 0x1970:  // Dark World Lightning
    case 0x19b7:  // Treasure Map
    case 0x1d37:  // Fine
    case 0x1d38:  // Gladiator Beast Octavius
    case 0x1e2d:
    case 0x1ed6:
        return 1;
    }
    return 0;
}

// @yo2 0x006ee410 always 0 (an empty handler)
int engNo6ee410() { return 0; }

// @yo2 0x006ee430 always 0 (an empty handler)
int engNo6ee430() { return 0; }

// @yo2 0x006ee450 the listed cards (0x1db7 only for k == 5)
int engCard6ee450(int id, int k) {
    if (id == 0x1db7) return k == 5;
    switch (id) {
    case 0xe8f:
    case 0xe9f:
    case 0xeba:
    case 0x11cf:  // Mushroom Man #2
    case 0x1227:  // Invader of the Throne
    case 0x12c3:  // Brain Control
    case 0x12d1:  // Mind Control
    case 0x12e2:  // Magical Arm Shield
    case 0x12fc:  // Change of Heart
    case 0x1322:  // Snatch Steal
    case 0x13ab:  // Jowls of Dark Demise
    case 0x13b0:  // Electromagnetic Bagworm
    case 0x13ea:
    case 0x142a:  // Creature Swap
    case 0x1430:  // Mystic Box
    case 0x143a:
    case 0x1466:  // Dark Necrofear
    case 0x14b8:  // Possessed Dark Soul
    case 0x14cd:  // Shadow Tamer
    case 0x14ce:  // Dragon Manipulator
    case 0x1581:  // Enemy Controller
    case 0x169a:  // Falling Down
    case 0x17e0:  // Rafflesia Seduction
    case 0x1857:  // Owner's Seal
    case 0x1877:  // Brain Jacker
    case 0x18b5:  // Dummy Golem
    case 0x18bf:  // Aussa the Earth Charmer
    case 0x18c0:  // Eria the Water Charmer
    case 0x18c1:  // Hiita the Fire Charmer
    case 0x18c2:  // Wynn the Wind Charmer
    case 0x18c6:  // Reshef the Dark Being
    case 0x18e5:  // Mutant Mindmaster
    case 0x1925:  // Shien's Spy
    case 0x195d:  // Chthonian Polymer
    case 0x19c0:  // D.D. Guide
    case 0x1a9c:  // Brainwashing Beam
    case 0x1b41:  // Electric Virus
    case 0x1b42:  // Puppet Plant
    case 0x1b43:  // Marionette Mite
    case 0x1be4:  // Mass Hypnosis
    case 0x1c02:  // Mirror Gate
    case 0x1c35:  // Creature Seizure
    case 0x1c84:  // Alien Hypno
    case 0x1c9f:  // Interdimensional Warp
    case 0x1da2:  // Arcana Force VII - The Chariot
    case 0x1da4:  // Arcana Force XVIII - The Moon
    case 0x1df0:
    case 0x1e55:
    case 0x1ed3:
    case 0x1edf:
    case 0x1f1b:
        return 1;
    }
    return 0;
}

// @yo2 0x006ee9e0 1, 2 or 3 for the listed cards, 0 otherwise
int engCard6ee9e0(int id) {
    switch (id) {
    case 0xe89:
    case 0x1420:  // Monster Recovery
    case 0x14e2:  // Super Rejuvenation
    case 0x16d9:  // Reload
    case 0x198d:  // Magical Mallet
    case 0x1bf7:  // Convert Contact
    case 0x1c65:  // Diamond-Dust Cyclone
        return 1;
    case 0x12d5:  // Card Destruction
    case 0x14e8:  // Dragged Down into the Grave
    case 0x1b23:  // Damage Polarizer
    case 0x1b5a:  // Dark World Dealings
    case 0x1cdd:  // Hand Destruction
        return 3;
    case 0x15aa:  // Disturbance Strategy
    case 0x17f3:  // Mind Wipe
    case 0x1801:  // Heavy Slump
        return 2;
    }
    return 0;
}

// @yo2 0x006eeaa0 the listed cards
int engCard6eeaa0(int id) {
    switch (id) {
    case 0xe9e:
    case 0x1296:  // Jinzo
    case 0x1302:  // Royal Decree
    case 0x14c7:  // Ryu Senshi
    case 0x14d5:  // Tyrant Dragon
    case 0x14da:  // Fiend Skull Dragon
    case 0x14de:  // The Dragon's Bead
    case 0x1529:  // Great Dezard
    case 0x1534:  // Fushioh Richie
    case 0x159d:  // Necrovalley
    case 0x172e:  // Gora Turtle of Illusion
    case 0x1760:  // Talisman of Trap Sealing
    case 0x17b9:  // The End of Anubis
    case 0x17c2:  // Blue-Eyes Shining Dragon
    case 0x17c6:  // Sorcerer of Dark Magic
    case 0x183a:  // A-Team: Trap Disposal Unit
    case 0x1936:  // Alkana Knight Joker
    case 0x1955:  // Cyber Blader
    case 0x19c6:  // Silent Insect
    case 0x1a07:  // Cyber Phoenix
    case 0x1a1d:  // Super-Electromagnetic Voltech Dragon
    case 0x1a24:  // Herald of Purple Light
    case 0x1aa5:  // Light and Darkness Dragon
    case 0x1ab9:  // Ancient Gear Engineer
    case 0x1ba7:  // Ancient City - Rainbow Ruins
    case 0x1bca:  // Sky Scourge Invicil
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1caf:  // White Night Dragon
    case 0x1cb0:  // Arcana Force Ex - The Light Ruler
    case 0x1d00:  // Doomsday Horror
    case 0x1d0a:  // Superancient Deepsea King Coelacanth
    case 0x1d9c:  // Jinzo - Lord
    case 0x1d9d:  // Arcana Force 0 - The Fool
    case 0x1e36:
    case 0x1e3a:
    case 0x1ed5:
        return 1;
    }
    return 0;
}

// @yo2 0x006eed70 which players a chain link affects: bit 0 its own controller, bit 1 the opponent. Starts from its
// targets in zone 0xe; the listed cards override or add to that.
uint32_t engLinkSides(const uint16_t* link) {
    uint32_t sides = 0;
    int me = link[1] & 1;
    for (int k = 0; k < (link[3] & 0x7f); k++) {
        int t = engChainTarget(reinterpret_cast<const EngChain*>(link), k);
        if ((t >> 8 & 0xff) == 0xe) sides |= (me != (t & 0xff)) + 1;
    }
    uint16_t how = link[1] & 0x3000;
    switch (link[0]) {
    // affects its controller
    case 0xeb0: case 0xeca: case 0x100c: case 0x106d: case 0x1138: case 0x1152: case 0x1294: case 0x1359:
    case 0x1366: case 0x137d: case 0x138a: case 0x13f5: case 0x1446: case 0x148b: case 0x14a7: case 0x14c1:
    case 0x14d2: case 0x14ea: case 0x14ef: case 0x14f6: case 0x14f7: case 0x156a: case 0x156d: case 0x1576:
    case 0x158b: case 0x1616: case 0x1630: case 0x1631: case 0x1638: case 0x164a: case 0x164f: case 0x1664:
    case 0x168f: case 0x16a4: case 0x16a8: case 0x16bc: case 0x16d5: case 0x16f8: case 0x1714: case 0x1745:
    case 0x1769: case 0x1788: case 0x178a: case 0x178c: case 0x1795: case 0x17a2: case 0x17b7: case 0x17f1:
    case 0x17f7: case 0x1820: case 0x183d: case 0x1845: case 0x1864: case 0x187a: case 0x1880: case 0x1881:
    case 0x1895: case 0x18a4: case 0x18cc: case 0x191f: case 0x1927: case 0x1938: case 0x1944: case 0x1951:
    case 0x196f: case 0x1971: case 0x1973: case 0x1974: case 0x1979: case 0x19d7: case 0x1a03: case 0x1a12:
    case 0x1a42: case 0x1a4f: case 0x1a58: case 0x1a59: case 0x1a64: case 0x1a6b: case 0x1a9b: case 0x1abe:
    case 0x1b17: case 0x1b65: case 0x1b88: case 0x1bd2: case 0x1bdb: case 0x1bde: case 0x1be9: case 0x1bef:
    case 0x1bf9: case 0x1c4e: case 0x1c4f: case 0x1c58: case 0x1c90: case 0x1c9b: case 0x1cad: case 0x1cb7:
    case 0x1cdb: case 0x1cfb: case 0x1d1d: case 0x1d3f: case 0x1d93: case 0x1dcc: case 0x1dd5: case 0x1ddc:
    case 0x1df7: case 0x1e07: case 0x1e47: case 0x1e4a: case 0x1e6d: case 0x1ee1:
        return 1;
    // affects nobody
    case 0xeb7: case 0xebd: case 0x12a6: case 0x13fe: case 0x1415: case 0x1445: case 0x158f: case 0x1592:
    case 0x1610: case 0x1611: case 0x1629: case 0x167d: case 0x1713: case 0x1791: case 0x195c: case 0x198e:
    case 0x19b1: case 0x1a05: case 0x1a48: case 0x1a57: case 0x1a95: case 0x1c56: case 0x1da2: case 0x1dd2:
    case 0x1dd6: case 0x1e38: case 0x1eae:
        return 0;
    // affects the opponent
    case 0x1379: case 0x143d: case 0x1488: case 0x14e7: case 0x15e6: case 0x15fd: case 0x19f4: case 0x1ca0:
    case 0x1d44: case 0x1ea8: case 0x1eb0: case 0x1f8c:
        return 2;
    // affects both
    case 0xea4: case 0xead: case 0xeb4: case 0x1365: case 0x14f0: case 0x14fb: case 0x1536: case 0x16db:
    case 0x1990: case 0x1eb1:
        return 3;
    // plus its controller when activated the 0x1000 way
    case 0x1534: case 0x1549: case 0x187f: case 0x197c: case 0x1b98:
        return sides | (how == 0x1000);
    // plus its controller when activated the 0x2000 way
    case 0x133b: case 0x1449: case 0x144c: case 0x1452: case 0x1457: case 0x179a: case 0x1aa5: case 0x1aa9:
        return sides | (how == 0x2000);
    case 0x1edb:
        return sides | (how == 0x3000);
    // both when it has no targets
    case 0x12ea: case 0x1af9:
        return (link[3] & 0x7f) == 0 ? 3 : sides;
    case 0x12ba:
        return sides | (((linkDword(link) >> 9 & 1) ^ me) + 1);
    case 0x1686:
        return sides | (link[6] == 2);
    case 0x190a:
        if (how == 0x2000 || linkDword(link) > 7) return sides;
        return 1;
    case 0x1afb:
        return ((engChainTargetUid(reinterpret_cast<const EngChain*>(link), 0) & 1) ^ me) + 1;
    case 0x1d13:  // Rainbow Neos
        return link[6] == 3 ? 2 : sides;
    case 0x1da5:
        return (link[1] & 0xfc0) == 0x40 ? 2 : sides;
    }
    return sides;
}
