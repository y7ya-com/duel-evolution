// Engine card tables (0x0071a270..0x0071e000): summon rules, spell speeds, turn counts, spell counters, per-card rule lists.
// Pure functions of a card id (and the card DB); translated from the exe's switch trees, card names from the
// 2008 card data where known. tests/duel_cards_test.py compares every one with the decompiled code exhaustively.
#include "EngineInternal.h"

int engCardCategory(int id);
int engIsFusionOrSynchro(int id);
int engIsSpiritKind(int id);
int engIsSynchro(int id);

// @yo2 0x0071a270 effect monsters with record bit 0x16: 2 for the listed ones, else 1; 0 otherwise
int engCard71a270(int id) {
    if (!cardIsMonster(id) || !cardBit(id, 0x16)) return 0;
    switch (id) {
    case 0x14fd:  // Maharaghi
    case 0x1503:  // Otohime
    case 0x1526:  // Dark Dust Spirit
    case 0x1527:  // Royal Keeper
    case 0x1534:  // Fushioh Richie
    case 0x1535:  // Cobraman Sakuzy
    case 0x1694:  // Tsukuyomi
    case 0x16ab:  // Nightmare Penguin
    case 0x1ced:  // Fossil Dyna Pachycephalo
    case 0x1dfd:
    case 0x1e2c:
    case 0x1e30:
        return 2;
    }
    return 1;
}

// @yo2 0x0071a360 summon restriction kind (1..5); 0 = none
int engSummonRule(int id) {
    if (id >= 0x1483 && id <= 0x1487) return 1;  // Soul of Purity and Light .. Garuda the Wind Spirit
    if (id >= 0x16c5 && id <= 0x16c9) return 1;  // Inferno .. Chaos Sorcerer
    if (id >= 0x19a3 && id <= 0x19a6) return 2;  // Uria, Lord of Searing Flames .. Elemental Hero Neo Bubbleman
    switch (id) {
    case 0xeb3:
    case 0x13e9:
    case 0x1758:  // Archlord Zerato
    case 0x176c:  // Mazera DeVille
    case 0x17c2:  // Blue-Eyes Shining Dragon
    case 0x17c6:  // Sorcerer of Dark Magic
    case 0x1894:  // Red-Eyes Darkness Dragon
    case 0x1895:  // Vampire Genesis
    case 0x18b4:  // Megarock Dragon
    case 0x18b9:  // Master Monk
    case 0x18e8:  // Ocean Dragon Lord - Neo-Daedalus
    case 0x1982:  // Dark Eradicator Warlock
    case 0x198c:  // Armed Dragon LV10
    case 0x19c8:  // Anteatereatingant
    case 0x19ca:  // Doom Dozer
    case 0x19f0:  // Exxod, Master of The Guard
    case 0x1a65:  // Destiny Hero - Dogma
    case 0x1bb8:  // Destiny Hero - Plasma
    case 0x1bc8:  // Sky Scourge Enrise
    case 0x1bc9:  // Sky Scourge Norleras
    case 0x1c03:  // Rainbow Dragon
    case 0x1c2a:  // Frost and Flame Dragon
    case 0x1c2b:  // Desert Twister
    case 0x1c81:  // Enishi, Shien's Chancellor
    case 0x1ca6:  // Thousand-Eyes Jellyfish
    case 0x1cb0:  // Arcana Force Ex - The Light Ruler
    case 0x1ce0:  // Exodius the Ultimate Forbidden Lord
    case 0x1cee:  // Rainbow Dark Dragon
    case 0x1cfd:  // Dark Armed Dragon
    case 0x1d62:  // Evil Dragon Ananta
    case 0x1d91:  // Aztekipede, the Worm Warrior
    case 0x1d9c:  // Jinzo - Lord
    case 0x1da6:  // Arcana Force EX - The Dark Ruler
    case 0x1daf:  // Judgment Dragon
    case 0x1db4:  // Batteryman Industrial Strength
    case 0x1e20:
    case 0x1e31:
    case 0x1e7d:
        return 2;
    case 0xfde:  // Larvae Moth
    case 0xfdf:  // Great Moth
    case 0xfe9:  // Perfectly Ultimate Great Moth
    case 0x111c:  // Gate Guardian
    case 0x112e:  // Metalzoa
    case 0x127d:  // Manga Ryu-Ran
    case 0x127e:  // Toon Mermaid
    case 0x127f:  // Toon Summoned Skull
    case 0x128c:  // Red-Eyes Black Metal Dragon
    case 0x12a5:  // Blue-Eyes Toon Dragon
    case 0x138a:  // Valkyrion the Magna Warrior
    case 0x1466:  // Dark Necrofear
    case 0x146e:  // Dark Sage
    case 0x14fc:  // Gradius' Option
    case 0x154a:  // Toon Dark Magician Girl
    case 0x1578:  // Lava Golem
    case 0x16cb:  // Black Luster Soldier - Envoy of the Beginning
    case 0x16e4:  // Chaos Emperor Dragon - Envoy of the End
    case 0x1bad:  // Volcanic Doomfire
    case 0x1cda:  // Grinder Golem
    case 0x1cfb:  // The Dark Creator
    case 0x1d9a:  // Volcanic Queen
    case 0x1dbd:  // Cloudian - Storm Dragon
        return 1;
    case 0xfe5:  // Harpie Lady Sisters
    case 0x1534:  // Fushioh Richie
        return 3;
    case 0x1117:  // Wall Shadow
    case 0x1643:  // Mirage Knight
    case 0x1644:  // Berserk Dragon
    case 0x1645:  // Exodia Necross
    case 0x167c:  // Dark Magician Knight
    case 0x1788:  // Spirit of the Pharaoh
    case 0x17d4:  // Horus the Black Flame Dragon LV8
    case 0x17db:  // Armed Dragon LV7
    case 0x1816:  // Silent Swordsman LV7
    case 0x181a:  // Silent Magician LV8
    case 0x186b:  // Gearfried the Swordmaster
    case 0x18a4:  // Machiners Force
    case 0x1906:  // Winged Kuriboh LV10
    case 0x1951:  // Water Dragon
    case 0x19a8:  // Cyber Barrier Dragon
    case 0x19a9:  // Cyber Laser Dragon
    case 0x19cd:  // Princess Pikeru
    case 0x19ce:  // Princess Curran
    case 0x1ad2:  // Elemental Hero Poison Rose
    case 0x1c10:  // Vennominaga the Deity of Poisonous Snakes
    case 0x1cf2:  // Yubel - Terror Incarnate
    case 0x1cf3:  // Yubel - The Ultimate Nightmare
        return 4;
    case 0x17c9:  // Theinen the Great Sphinx
        return 5;
    }
    return 0;
}

// @yo2 0x0071aea0 summon rule of extra-deck monsters (1..5); unlisted synchros 4, others 0
int engExtraSummonRule(int id) {
    switch (id) {
    case 0xea1:
    case 0xea2:
    case 0x1c55:
    case 0x1c5f:
        return 3;
    case 0xecb:
    case 0x157d:  // Dragon Master Knight
    case 0x157e:  // F.G.D.
    case 0x15fc:  // Dark Paladin
    case 0x18c8:  // Elemental Hero Flame Wingman
    case 0x18c9:  // Elemental Hero Thunder Giant
    case 0x1943:  // Elemental Hero Shining Flare Wingman
    case 0x1956:  // Elemental Hero Rampart Blaster
    case 0x1957:  // Elemental Hero Tempest
    case 0x1958:  // Elemental Hero Wildedge
    case 0x1981:  // Elemental Hero Mudballman
    case 0x1987:  // Elemental Hero Steam Healer
    case 0x19ef:  // Elemental Hero Electrum
    case 0x19f3:  // Elemental Hero Wild Wingman
    case 0x19f4:  // Elemental Hero Necroid Shaman
    case 0x19ff:  // Elemental Hero Phoenix Enforcer
    case 0x1a00:  // Elemental Hero Shining Phoenix Enforcer
    case 0x1a01:  // Elemental Hero Mariner
    case 0x1a4b:  // Elemental Hero Terra Firma
    case 0x1a4e:  // Chimeratech Overdragon
    case 0x1a58:  // Ambulance Rescueroid
    case 0x1ab1:  // Cyberdark Dragon
    case 0x1b72:  // Elemental Hero Inferno
    case 0x1c08:  // Elemental Hero Darkbright
    case 0x1c54:  // Elemental Hero Plasma Vice
    case 0x1d13:  // Rainbow Neos
    case 0x1dc0:  // Ultimate Ancient Gear Golem
    case 0x1e7e:
    case 0x1f25:
        return 1;
    case 0x15b1:  // XY-Dragon Cannon
    case 0x15b4:  // XYZ-Dragon Cannon
    case 0x15f9:  // XZ-Tank Cannon
    case 0x15fa:  // YZ-Tank Dragon
    case 0x1953:  // VW-Tiger Catapult
    case 0x1954:  // VWXYZ-Dragon Catapult Cannon
    case 0x1a6d:  // Elemental Hero Dark Neos
    case 0x1a6e:  // Elemental Hero Aqua Neos
    case 0x1a6f:  // Elemental Hero Flare Neos
    case 0x1b4c:  // Elemental Hero Glow Neos
    case 0x1b4d:  // Elemental Hero Air Neos
    case 0x1b4e:  // Elemental Hero Grand Neos
    case 0x1c07:  // Elemental Hero Marine Neos
    case 0x1c09:  // Elemental Hero Magma Neos
    case 0x1c6b:  // Elemental Hero Chaos Neos
    case 0x1c86:  // Gladiator Beast Gaiodiaz
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1cae:  // Armityle the Chaos Phantom
    case 0x1ceb:  // Chimeratech Fortress Dragon
    case 0x1d12:  // Elemental Hero Storm Neos
    case 0x1dc1:  // Gladiator Beast Gyzarus
        return 4;
    case 0x1c06:  // Neo-Spacian Marine Dolphin
    case 0x1d11:  // Neo-Spacian Twinkle Moss
        return 5;
    case 0x1c59:  // Evil Hero Inferno Wing
    case 0x1c5c:  // Evil Hero Lightning Golem
    case 0x1c5d:  // Evil Hero Dark Gaia
    case 0x1cd2:  // Evil Hero Wild Cyclone
    case 0x1cd3:  // Evil Hero Infernal Sniper
    case 0x1cd4:  // Evil Hero Malicious Fiend
        return 2;
    }
    return engIsSynchro(id) ? 4 : 0;
}

// @yo2 0x0071b470 cannot be normal summoned: fusions and rituals, and monsters with a summon rule
int engNoNormalSummon(int id) {
    switch (engCardCategory(id)) {
    case 0: case 7: case 8:   // normal monsters, spells, traps
        return 0;
    case 2: case 3:
        return 1;
    default:
        return engSummonRule(id) > 0;
    }
}

// @yo2 0x0071b4f0 a monster that may be normal summoned (0x17c4 and 0x1dac never)
int engCanNormalSummon(int id) {
    if (!cardIsMonster(id) || id == 0x17c4 || id == 0x1dac) return 0;
    return !engNoNormalSummon(id);
}

// @yo2 0x0071b540 a synchro, or extra summon rule 4
int engExtraRule4(int id) { return engIsSynchro(id) || engExtraSummonRule(id) == 4; }

// @yo2 0x0071b580 extra summon rule 0..3
int engExtraRuleUnder4(int id) {
    int r = engExtraSummonRule(id);
    return r >= 0 && r < 4;
}

// @yo2 0x0071b5b0 may be special summoned by a card effect (spirits and the listed cards never)
int engCanBeRevived(int id) {
    if (engIsSpiritKind(id)) return 0;
    switch (id) {
    case 0x16ec:  // Victory Dragon
    case 0x1725:  // Ulevo
    case 0x1729:  // Meteo the Matchless
    case 0x1771:  // Doomcaliber Knight
    case 0x17bc:  // Gandora the Dragon of Destruction
    case 0x18ab:  // Ancient Gear Golem
    case 0x18ac:  // Ancient Gear Beast
    case 0x18e0:  // Infernal Flame Emperor
    case 0x1905:  // The Wicked Dreadroot
    case 0x1938:  // Gilford the Legend
    case 0x193b:  // Tyler the Great Warrior
    case 0x1985:  // King of Destruction - Xexex
    case 0x1986:  // Queen of Fate - Eternia
    case 0x19a8:  // Cyber Barrier Dragon
    case 0x19a9:  // Cyber Laser Dragon
    case 0x19cd:  // Princess Pikeru
    case 0x19ce:  // Princess Curran
    case 0x1a40:  // Simorgh, Bird of Divinity
    case 0x1a62:  // Destiny Hero - Double Dude
    case 0x1aa5:  // Light and Darkness Dragon
    case 0x1ae1:  // Vanity's Fiend
    case 0x1ae8:  // Vanity's Ruler
    case 0x1b1a:  // Flame Ogre
    case 0x1b2e:  // Testament of the Arcane Lords
    case 0x1b2f:  // Armament of the Lethal Lords
    case 0x1bb3:  // The Wicked Avatar
    case 0x1bb4:  // The Wicked Eraser
    case 0x1bca:  // Sky Scourge Invicil
    case 0x1bea:  // Diabolos, King of the Abyss
    case 0x1c61:  // Cloudian - Ghost Fog
    case 0x1c72:  // Gladiator Beast Alexander
    case 0x1c73:  // Gladiator Beast Spartacus
    case 0x1cce:  // Chimaera, the Master of Beasts
    case 0x1ccf:  // Emperor of Lightning
    case 0x1d7b:
    case 0x1e76:
    case 0x1f1c:
    case 0x1f2f:
    case 0x1f30:
    case 0x1f38:
    case 0x1f39:
        return 0;
    }
    return engIsFusionOrSynchro(id) ? (engExtraSummonRule(id) == 0 || engExtraSummonRule(id) == 4)
                                    : (engSummonRule(id) != 2 && engSummonRule(id) != 4);
}

// @yo2 0x0071b9c0 a synchro, or no extra summon rule
int engExtraRule0(int id) { return engIsSynchro(id) || engExtraSummonRule(id) == 0; }

// @yo2 0x0071ba00 spell speed: quick-play 2, other spells 1, counter traps 3, other traps 2, listed quick-effect monsters 2
int engSpellSpeed(int id) {
    int race = cardRace(id), icon = cardIcon(id);
    if (race == 0x16) return (icon == 5) + 1;   // spells: quick-play 2
    if (race == 0x17) return icon == 1 ? 3 : 2;   // traps: counter 3
    switch (id) {
    case 0xeb2:
    case 0xec2:
    case 0xfe0:  // Kuriboh
    case 0x1119:  // Sanga of the Thunder
    case 0x111a:  // Kazejin
    case 0x111b:  // Suijin
    case 0x13a7:  // Injection Fairy Lily
    case 0x148c:  // Maryokutai
    case 0x14b6:  // Dark Balter the Terrible
    case 0x14c7:  // Ryu Senshi
    case 0x1529:  // Great Dezard
    case 0x1534:  // Fushioh Richie
    case 0x158a:  // Gravekeeper's Watcher
    case 0x1594:  // Charm of Shabti
    case 0x15fc:  // Dark Paladin
    case 0x168f:  // Desrook Archfiend
    case 0x16b9:  // Strike Ninja
    case 0x1724:  // Winged Rhynos
    case 0x1771:  // Doomcaliber Knight
    case 0x1774:  // Gemini Imps
    case 0x17c2:  // Blue-Eyes Shining Dragon
    case 0x17c6:  // Sorcerer of Dark Magic
    case 0x17d4:  // Horus the Black Flame Dragon LV8
    case 0x183a:  // A-Team: Trap Disposal Unit
    case 0x1906:  // Winged Kuriboh LV10
    case 0x1936:  // Alkana Knight Joker
    case 0x1a24:  // Herald of Purple Light
    case 0x1a25:  // Herald of Green Light
    case 0x1a60:  // Destiny Hero - Blade Master
    case 0x1a86:  // Dragonic Knight
    case 0x1aa5:  // Light and Darkness Dragon
    case 0x1ac6:  // Cyber Ogre
    case 0x1b2c:  // Phantom Beast Thunder-Pegasus
    case 0x1b44:  // D.D. Crow
    case 0x1b90:  // Carrierroid
    case 0x1c03:  // Rainbow Dragon
    case 0x1c0a:  // Necro Gardna
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1caf:  // White Night Dragon
    case 0x1cb0:  // Arcana Force Ex - The Light Ruler
    case 0x1ccc:
    case 0x1ce5:  // Thunder King Rai-Oh
    case 0x1d0a:  // Superancient Deepsea King Coelacanth
    case 0x1d66:
    case 0x1d8f:  // Prime Material Dragon
    case 0x1d96:  // Honest
    case 0x1da3:  // Arcana Force XIV - Temperance
    case 0x1ded:
    case 0x1df9:
    case 0x1e17:
    case 0x1e26:
    case 0x1e36:
    case 0x1e3a:
    case 0x1eca:
    case 0x1ed5:
    case 0x1f09:
    case 0x1f0b:
    case 0x1f21:
        return 2;
    }
    return 1;
}

// @yo2 0x0071bfa0 turn count of a lasting card (0xffff = until removed, < 0 = special counters)
int engTurnCount(int id) {
    switch (id) {
    case 0xecc:
    case 0x123b:  // Crush Card Virus
    case 0x188c:  // Deck Devastation Virus
    case 0x1bf1:  // Eradicator Epidemic Virus
        return -3;
    case 0xfee:  // Cocoon of Evolution
    case 0xff9:  // Castle of Dark Illusions
    case 0x1009:  // Pumpking the King of Ghosts
    case 0x130d:  // Germ Infection
    case 0x131a:  // Stim-Pack
    case 0x1529:  // Great Dezard
    case 0x15a0:  // Dark Snake Syndrome
    case 0x15ee:  // Wave-Motion Cannon
    case 0x180f:  // Shattered Axe
    case 0x1810:  // Blockman
    case 0x1909:  // Spark Blaster
        return 0xffff;
    case 0x1102:  // Swords of Revealing Light
    case 0x14ac:  // Viser Des
    case 0x1aa3:  // Big Evolution Pill
    case 0x1aa9:  // Seismic Shockwave
        return 3;
    case 0x12c8:  // Lightforce Sword
        return -4;
    case 0x1400:  // Nightmare's Steelcage
    case 0x149d:  // Ekibyo Drakmord
    case 0x159c:  // Different Dimension Capsule
    case 0x17a1:  // Dust Barrier
    case 0x187c:  // Swords of Concealing Light
    case 0x1a7e:  // Future Fusion
    case 0x1c91:  // Soul Devouring Bamboo Sword
    case 0x1dd1:  // Deck Lockdown
    case 0x1de2:  // Sanguine Swamp
    case 0x1ee4:
        return 2;
    case 0x169c:  // Final Countdown
        return -20;
    case 0x1811:  // Gold Sarcophagus
    case 0x18d5:  // Pikeru's Second Sight
    case 0x1bb3:  // The Wicked Avatar
        return -2;
    }
    return 0;
}

// @yo2 0x0071c210 max spell counters (0xff = no limit); 0 = takes none
int engSpellCounterMax(int id) {
    switch (id) {
    case 0x128e:  // Hannibal Necromancer
    case 0x1617:  // Breaker the Magical Warrior
    case 0x1e0a:
        return 1;
    case 0x1610:  // Skilled White Magician
    case 0x1611:  // Skilled Dark Magician
    case 0x161a:  // Royal Magical Library
        return 3;
    case 0x1615:  // Magical Marionette
    case 0x1624:  // Pitch-Black Power Stone
    case 0x1695:  // Legendary Flame Lord
    case 0x16de:  // Tower of Babel
    case 0x186a:  // Blast Magician
    case 0x1983:  // Mythical Beast Cerberus
    case 0x199b:  // Dark Red Enchanter
    case 0x1db0:  // Dark Valkyria
    case 0x1dec:
    case 0x1e77:
        return 255;
    case 0x1817:  // Silent Magician LV4
        return 5;
    }
    return 0;
}

// @yo2 0x0071c2f0 cards that hold spell counters
int engUsesSpellCounters(int id) {
    switch (id) {
    case 0x1610:  // Skilled White Magician
    case 0x1611:  // Skilled Dark Magician
    case 0x1615:  // Magical Marionette
    case 0x161a:  // Royal Magical Library
    case 0x1695:  // Legendary Flame Lord
    case 0x16de:  // Tower of Babel
    case 0x186a:  // Blast Magician
    case 0x1983:  // Mythical Beast Cerberus
    case 0x199b:  // Dark Red Enchanter
    case 0x1e77:
        return 1;
    }
    return 0;
}


// @yo2 0x0071c420 the listed cards; rulesets 0xc9, 0xca, 0xd2..0xd4 swap 0x1c8b for 0x1a0c
int engCard71c420(int id) {
    int rules = ndLogScene();
    bool alt = rules == 0xc9 || rules == 0xca || rules == 0xd2 || rules == 0xd3 || rules == 0xd4;
    switch (id) {
    case 0x16fe: case 0x1837: case 0x18f8: case 0x1913: case 0x1962: case 0x19b2: case 0x19bf: case 0x1a8d:
    case 0x1b6a: case 0x1b6b:
        return 1;
    case 0x1a0c:
        return alt;
    case 0x1c8b:
        return !alt;
    }
    return 0;
}

// @yo2 0x0071c580 cards with a hand / face-down activation (Kuriboh, Cocoon of Evolution, ...)
int engCard71c580(int id) {
    if (id >= 0x1b41 && id <= 0x1b44) return 1;  // Electric Virus .. D.D. Crow
    if (id >= 0x1bc1 && id <= 0x1bc7) return 1;  // Elemental Hero Captain Gold .. Harpie Queen
    switch (id) {
    case 0xeb2:
    case 0xfe0:  // Kuriboh
    case 0xfee:  // Cocoon of Evolution
    case 0x114f:  // Thunder Dragon
    case 0x158a:  // Gravekeeper's Watcher
    case 0x1594:  // Charm of Shabti
    case 0x168f:  // Desrook Archfiend
    case 0x1774:  // Gemini Imps
    case 0x179c:  // King of the Swamp
    case 0x1a24:  // Herald of Purple Light
    case 0x1a25:  // Herald of Green Light
    case 0x1a60:  // Destiny Hero - Blade Master
    case 0x1a86:  // Dragonic Knight
    case 0x1ac6:  // Cyber Ogre
    case 0x1c29:  // Neo Space Pathfinder
    case 0x1cfc:  // Dark Nephthys
    case 0x1d66:
    case 0x1d94:  // Hecatrice
    case 0x1d96:  // Honest
    case 0x1da3:  // Arcana Force XIV - Temperance
    case 0x1ded:
    case 0x1df9:
    case 0x1e32:
    case 0x1e33:
    case 0x1e5a:  // Dark Simorgh
    case 0x1eca:
    case 0x1f09:
    case 0x1f17:
    case 0x1f2d:
        return 1;
    }
    return 0;
}

// @yo2 0x0071c840 Theinen, Watapon, Green Baboon, ...
int engCard71c840(int id) {
    switch (id) {
    case 0x17c9:  // Theinen the Great Sphinx
    case 0x17cc:  // Watapon
    case 0x18ec:  // Green Baboon, Defender of the Forest
    case 0x190a:  // Van'Dalgyon the Dark Dragon Lord
    case 0x197d:  // Tualatin
    case 0x199e:  // Gorz the Emissary of Darkness
    case 0x1a28:  // Voltanis the Adjudicator
    case 0x1a43:  // Puppet King
    case 0x1a47:  // Cyber Dinosaur
    case 0x1d3c:  // Dragon Ice
    case 0x1dbe:  // Phantom Dragon
        return 1;
    }
    return 0;
}

// @yo2 0x0071c8d0 Magical Labyrinth, Fusion Gate, Royal Oppression, Mausoleum of the Emperor, ...
int engCard71c8d0(int id) {
    switch (id) {
    case 0xe88:
    case 0x1232:  // Magical Labyrinth
    case 0x149c:  // Fusion Gate
    case 0x1517:  // Royal Oppression
    case 0x1a67:  // Mausoleum of the Emperor
        return 1;
    }
    return 0;
}

// @yo2 0x0071c920 fusion-substitute monsters
int engFusionSubstitute(int id) {
    switch (id) {
    case 0x1013:  // Goddess with the Third Eye
    case 0x10a8:  // Beastking of the Swamps
    case 0x10b3:  // Versago the Destroyer
    case 0x1228:  // Mystical Sheep #1
    case 0x179c:  // King of the Swamp
    case 0x1870:  // The Light - Hex-Sealed Fusion
    case 0x1871:  // The Dark - Hex-Sealed Fusion
    case 0x1872:  // The Earth - Hex-Sealed Fusion
        return 1;
    }
    return 0;
}

// @yo2 0x0071c990 0 for some fusions (Dark Balter, Ryu Senshi, F.G.D., the Cyber fusions, ...), else 1
int engCard71c990(int id) {
    switch (id) {
    case 0x14b6:  // Dark Balter the Terrible
    case 0x14c7:  // Ryu Senshi
    case 0x14da:  // Fiend Skull Dragon
    case 0x157e:  // F.G.D.
    case 0x18fb:  // UFOroid Fighter
    case 0x18fc:  // Cyber Twin Dragon
    case 0x18fd:  // Cyber End Dragon
    case 0x1936:  // Alkana Knight Joker
    case 0x1955:  // Cyber Blader
    case 0x19d6:  // D.3.S. Frog
    case 0x1a53:  // Super Vehicroid Jumbo Drill
    case 0x1ac8:  // Cyber Ogre 2
    case 0x1d13:  // Rainbow Neos
    case 0x1dbf:  // Destiny End Dragoon
        return 0;
    }
    return 1;
}

// @yo2 0x0071ca30 Blindly Loyal Goblin, Mataza the Zapper, Horus LV4, Botanical Lion
int engCard71ca30(int id) {
    switch (id) {
    case 0x1652:  // Blindly Loyal Goblin
    case 0x170a:  // Mataza the Zapper
    case 0x17d2:  // Horus the Black Flame Dragon LV4
    case 0x1be7:  // Botanical Lion
        return 1;
    }
    return 0;
}

// @yo2 0x0071ca70 Amplifier, Spiritualism, ...
int engCard71ca70(int id) {
    switch (id) {
    case 0xe89:
    case 0x12d3:  // Amplifier
    case 0x147e:  // Spiritualism
        return 1;
    }
    return 0;
}

// @yo2 0x0071cab0 Toy Magician
int engIsToyMagician(int id) {
    switch (id) {
    case 0x1a9f:  // Toy Magician
        return 1;
    }
    return 0;
}

// @yo2 0x0071cad0 Spirit Message "I"/"N"/"A"/"L", The Third Sarcophagus, ...
int engCard71cad0(int id) {
    if (id >= 0x1497 && id <= 0x149a) return 1;  // Spirit Message "I" .. Spirit Message "L"
    switch (id) {
    case 0x17ad:  // The Third Sarcophagus
    case 0x17ae:  // The Second Sarcophagus
        return 1;
    }
    return 0;
}

// @yo2 0x0071cb10 a Guardian's weapon card
int engGuardianWeapon(int id) {
    switch (id) {
    case 0x164a:  // Guardian Elma
        return 0x165c;
    case 0x164b:  // Guardian Ceal
        return 0x165d;
    case 0x164c:  // Guardian Grarl
        return 0x165e;
    case 0x164d:  // Guardian Baou
        return 0x165f;
    case 0x164e:  // Guardian Kay'est
        return 0x1660;
    case 0x164f:  // Guardian Tryce
        return 0x1661;
    }
    return 0;
}

// @yo2 0x0071cb90 Neo-Spacian Dark Panther, Phantom of Chaos, ...
int engCard71cb90(int id) {
    switch (id) {
    case 0x1a74:  // Neo-Spacian Dark Panther
    case 0x1cb7:  // Phantom of Chaos
    case 0x1e7e:
        return 1;
    }
    return 0;
}

// @yo2 0x0071cbd0 w = {card id, location word}: 0 when the card may not do it from where it is
// (location bits 6..11: 0x8c0 never; bits 12..13 == 2 for the first list)
int engCard71cbd0(const uint16_t* w) {
    uint16_t loc = w[1] & 0xfc0;
    if (loc == 0x8c0) return 0;
    switch (w[0]) {
    case 0x1d15: case 0x12a6:
        return 0;
    case 0x14fd:
        return loc != 0x40;
    case 0x1315: case 0x13f5: case 0x140c: case 0x1449: case 0x144c: case 0x1452: case 0x1457: case 0x14e2:
    case 0x15b8: case 0x1a02: case 0x1a7a: case 0x1c67: case 0x1c9b: case 0x1d1b: case 0x1e48:
        return (w[1] & 0x3000) != 0x2000;
    case 0x1282: case 0x13c7: case 0x188f: case 0x1a7e:
        return loc != 0x80;
    case 0x1a9c: case 0x1c84:
        return loc != 0x140;
    }
    return 1;
}

// @yo2 0x0071ce20 a card word's id: 1, 2 or 5 for the listed cards, 0 otherwise
int engCard71ce20(const uint16_t* w) {
    int id = w[0];
    if (id >= 0x1b41 && id <= 0x1b44) return 1;  // Electric Virus .. D.D. Crow
    if (id >= 0x1bc1 && id <= 0x1bc7) return 1;  // Elemental Hero Captain Gold .. Harpie Queen
    switch (id) {
    case 0xe89:
    case 0xfe0:  // Kuriboh
    case 0x114f:  // Thunder Dragon
    case 0x12f8:  // Tribute to The Doomed
    case 0x12fe:  // Magic Jammer
    case 0x13f5:  // Return of the Doomed
    case 0x1421:  // Type Zero Magic Crusher
    case 0x1446:
    case 0x1461:  // Lightning Vortex
    case 0x1470:  // Judgment of Anubis
    case 0x147f:  // Jowgen the Spiritualist
    case 0x14a7:  // Rope of Life
    case 0x14d7:  // Spirit Ryu
    case 0x14dc:  // Gray Wing
    case 0x14de:  // The Dragon's Bead
    case 0x1594:  // Charm of Shabti
    case 0x15a6:  // Curse of Aging
    case 0x15a8:  // Raigeki Break
    case 0x15ad:  // Non Aggression Area
    case 0x15b1:  // XY-Dragon Cannon
    case 0x15b4:  // XYZ-Dragon Cannon
    case 0x15c7:  // Cost Down
    case 0x15e9:  // Dark Core
    case 0x15f9:  // XZ-Tank Cannon
    case 0x15fa:  // YZ-Tank Dragon
    case 0x15fc:  // Dark Paladin
    case 0x15fd:  // Double Spell
    case 0x161c:  // Tribe-Infecting Virus
    case 0x16b2:  // Chiron the Mage
    case 0x16dd:  // Cursed Seal of the Forbidden Spell
    case 0x1727:  // Abyss Soldier
    case 0x1754:  // Lady Ninja Yae
    case 0x1758:  // Archlord Zerato
    case 0x1764:  // Light of Judgment
    case 0x179c:  // King of the Swamp
    case 0x179e:  // Special Hurricane
    case 0x1805:  // Hallowed Life Barrier
    case 0x183e:  // Serial Spell
    case 0x1844:  // Back to Square One
    case 0x1845:  // Monster Reincarnation
    case 0x1848:  // Malice Dispersion
    case 0x1849:  // Divine Wrath
    case 0x1851:  // Spell Purification
    case 0x187a:  // A Feather of the Phoenix
    case 0x1887:  // Phoenix Wing Wind Blast
    case 0x188e:  // Forced Ceasefire
    case 0x1895:  // Vampire Genesis
    case 0x18c6:  // Reshef the Dark Being
    case 0x18c9:  // Elemental Hero Thunder Giant
    case 0x18cb:  // Double Attack
    case 0x1900:  // Summon Priest
    case 0x190e:  // Cybernetic Magician
    case 0x191e:  // D.D.M. - Different Dimension Master
    case 0x192d:  // Rising Energy
    case 0x1936:  // Alkana Knight Joker
    case 0x1953:  // VW-Tiger Catapult
    case 0x19ae:  // Ancient Gear Drill
    case 0x19b6:  // Damage Condenser
    case 0x19db:  // Karma Cut
    case 0x19f3:  // Elemental Hero Wild Wingman
    case 0x1a09:  // Cyber Gymnast
    case 0x1a42:  // Hysteric Party
    case 0x1a60:  // Destiny Hero - Blade Master
    case 0x1a6e:  // Elemental Hero Aqua Neos
    case 0x1a70:  // Neo-Spacian Aqua Dolphin
    case 0x1a9b:  // Fossil Excavation
    case 0x1ac6:  // Cyber Ogre
    case 0x1adf:  // Snipe Hunter
    case 0x1b10:  // Cold Enchanter
    case 0x1b26:  // Destiny Draw
    case 0x1b60:  // Eliminating the League
    case 0x1b90:  // Carrierroid
    case 0x1bfe:  // Snake Rain
    case 0x1c06:  // Neo-Spacian Marine Dolphin
    case 0x1c29:  // Neo Space Pathfinder
    case 0x1c2a:  // Frost and Flame Dragon
    case 0x1c2b:  // Desert Twister
    case 0x1c40:  // Spell Reclamation
    case 0x1c41:  // Trap Reclamation
    case 0x1c4e:  // Herald of Creation
    case 0x1c50:  // Trade-In
    case 0x1c53:  // The Big Saturn
    case 0x1c54:  // Elemental Hero Plasma Vice
    case 0x1c87:  // Gladiator Beast Heraklinos
    case 0x1cd6:  // Revoke Fusion
    case 0x1d0a:  // Superancient Deepsea King Coelacanth
    case 0x1d15:  // Super Polymerization
    case 0x1d27:  // Rainbow Life
    case 0x1d3c:  // Dragon Ice
    case 0x1d5f:  // D.D.R. - Different Dimension Reincarnation
    case 0x1d7c:
    case 0x1d89:  // Dark Grepher
    case 0x1d94:  // Hecatrice
    case 0x1da3:  // Arcana Force XIV - Temperance
    case 0x1daa:  // Lumina, Lightsworn Summoner
    case 0x1dc9:  // Solar Recharge
    case 0x1ddd:  // Destruction Jammer
    case 0x1dfd:
        return 1;
    case 0x1321:  // Final Destiny
        return 5;
    case 0x1326:  // Darkness Approaches
    case 0x1638:  // Magical Stone Excavation
    case 0x16a6:  // Spell Vanishing
        return 2;
    }
    return 0;
}

struct ChoiceTexts { uint16_t card; uint16_t text[5]; };
static const ChoiceTexts kChoiceTexts[] = {   // 0x1ac = no text
    {0x10f8, {0x196, 0x197, 0x1ac, 0x1ac, 0x1ac}},  // Mooyan Curry
    {0x1298, {0x1c6, 0x1c7, 0x1ac, 0x1ac, 0x1ac}},  // Cyber Raider
    {0x12c6, {0x198, 0x199, 0x1ac, 0x1ac, 0x1ac}},  // 7 Completed
    {0x1388, {0x1ad, 0x1ae, 0x1ac, 0x1ac, 0x1ac}},  // The Winged Dragon of Ra
    {0x14e0, {0x1a4, 0x1ad, 0x1ac, 0x1ac, 0x1ac}},  // Dragon's Gunfire
    {0x14fd, {0x1b6, 0x1b7, 0x1ac, 0x1ac, 0x1ac}},  // Maharaghi
    {0x1519, {0x1b8, 0x1b9, 0x1ba, 0x1ac, 0x1ac}},  // Ominous Fortunetelling
    {0x1522, {0x1b8, 0x1b9, 0x1ba, 0x1ac, 0x1ac}},  // Vampire Lord
    {0x1532, {0x1a6, 0x1a7, 0x1ac, 0x1ac, 0x1ac}},  // Don Zaloog
    {0x153d, {0x198, 0x199, 0x1ac, 0x1ac, 0x1ac}},  // Pyramid Energy
    {0x153f, {0x1b8, 0x1b9, 0x1ba, 0x1ac, 0x1ac}},  // Ordeal of a Traveler
    {0x1544, {0x1aa, 0x1ab, 0x1ac, 0x1ac, 0x1ac}},  // Dark Coffin
    {0x1581, {0x1be, 0x1bf, 0x1ac, 0x1ac, 0x1ac}},  // Enemy Controller
    {0x1599, {0x1a8, 0x1a9, 0x1ac, 0x1ac, 0x1ac}},  // Card Shuffle
    {0x15a5, {0x1b8, 0x1b9, 0x1ba, 0x1ac, 0x1ac}},  // Reversal Quiz
    {0x15cf, {0x1c5, 0x1cd, 0x1ac, 0x1ac, 0x1ac}},  // Kiryu
    {0x15d3, {0x1c5, 0x1cc, 0x1ac, 0x1ac, 0x1ac}},  // Second Goblin
    {0x15e7, {0x196, 0x1a4, 0x1ac, 0x1ac, 0x1ac}},  // Poison of the Old Man
    {0x15f1, {0x1c2, 0x1c3, 0x1ac, 0x1ac, 0x1ac}},  // Spell Shield Type-8
    {0x15f7, {0x1c4, 0x1c5, 0x1ac, 0x1ac, 0x1ac}},  // Formation Union
    {0x161e, {0x1af, 0x1a7, 0x1ac, 0x1ac, 0x1ac}},  // Cliff the Trap Remover
    {0x1656, {0x1b0, 0x1b1, 0x1ac, 0x1b6, 0x1b7}},  // Dark Scorpion - Chick the Yellow
    {0x1679, {0x1c8, 0x1c9, 0x1ac, 0x1ac, 0x1ac}},  // Judgment of Pharaoh
    {0x1685, {0x1b2, 0x1b3, 0x1ac, 0x1ac, 0x1ac}},  // Dark Scorpion - Gorg the Strong
    {0x1686, {0x1b4, 0x1b5, 0x1ac, 0x1ac, 0x1ac}},  // Dark Scorpion - Meanae the Thorn
    {0x1746, {0x1b8, 0x1b9, 0x1ba, 0x1ac, 0x1ac}},  // Vampire Lady
    {0x175a, {0x198, 0x199, 0x1ac, 0x1ac, 0x1ac}},  // Mystik Wok
    {0x1776, {0x1c0, 0x1c1, 0x1ac, 0x1ac, 0x1ac}},  // Legacy of Yata-Garasu
    {0x1841, {0x1c0, 0x1a6, 0x1ac, 0x1ac, 0x1ac}},  // Necklace of Command
    {0x184e, {0x1ca, 0x1cb, 0x1a5, 0x1c1, 0x1ac}},  // Fuh-Rin-Ka-Zan
    {0x1885, {0x1d1, 0x1d2, 0x1ac, 0x1ac, 0x1ac}},  // Penalty Game!
    {0x1916, {0x1c5, 0x1cc, 0x1ac, 0x1ac, 0x1ac}},  // Protective Soul Ailin
    {0x19d3, {0x1ce, 0x1cf, 0x1d0, 0x1ac, 0x1ac}},  // Divine Dragon - Excelion
    {0x1a1c, {0x1d3, 0x1d4, 0x1d5, 0x1ac, 0x1ac}},  // Victory Viper XX03
    {0x1a32, {0x1d3, 0x1d4, 0x1d5, 0x1ac, 0x1ac}},  // Power Capsule
    {0x1a80, {0x1d6, 0x1d7, 0x1ac, 0x1ac, 0x1ac}},  // Elemental Hero Stratos
    {0x1af0, {0x1d8, 0x1b0, 0x1ac, 0x1ac, 0x1ac}},  // Storm Shooter
    {0x1b3d, {0x1ca, 0x1cb, 0x1a5, 0x1c1, 0x1ac}},  // Reign-Beaux, Overlord of Dark World
    {0x1b71, {0x1d9, 0x1da, 0x1ac, 0x1ac, 0x1ac}},  // Ice Master
    {0x1ba7, {0x1c0, 0x1de, 0x1ac, 0x1ac, 0x1ac}},  // Ancient City - Rainbow Ruins
    {0x1bea, {0x1b6, 0x1b7, 0x1ac, 0x1ac, 0x1ac}},  // Diabolos, King of the Abyss
    {0x1bf1, {0x1b9, 0x1ba, 0x1ac, 0x1ac, 0x1ac}},  // Eradicator Epidemic Virus
    {0x1c03, {0x1db, 0x1dc, 0x1ac, 0x1ac, 0x1ac}},  // Rainbow Dragon
    {0x1c25, {0x1c7, 0x1dd, 0x1ac, 0x1ac, 0x1ac}},  // Flint Lock
    {0x1c69, {0x1df, 0x1e0, 0x1ac, 0x1ac, 0x1ac}},  // Rain Storm
    {0x1cf4, {0x1c5, 0x1ad, 0x1ac, 0x1ac, 0x1ac}},  // Armored Cybern
    {0x1cf5, {0x1c1, 0x1e1, 0x1ac, 0x1ac, 0x1ac}},  // Cyber Valley
    {0x1d13, {0x1e2, 0x1e3, 0x1e4, 0x1ac, 0x1ac}},  // Rainbow Neos
    {0x1d68, {0x1b6, 0x1b7, 0x1ac, 0x1ac, 0x1ac}},  // Blizzard Warrior
    {0x1db0, {0x1d9, 0x1ad, 0x1ac, 0x1ac, 0x1ac}},  // Dark Valkyria
};

// @yo2 0x0071dbc0 text id of choice k of a card with several effects to pick from; 0x1ac = none
int engChoiceText(int id, int k) {
    if (k < 0 || k > 4) return 0x1ac;
    for (const ChoiceTexts& c : kChoiceTexts)
        if (c.card == id) return c.text[k];
    return 0x1ac;
}
