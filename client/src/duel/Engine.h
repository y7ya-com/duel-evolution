// The duel engine of yo2.exe (unlabeled code 0x006e2150..0x007362d0 plus the duel helpers around 0x0079xxxx).
// The client is not authoritative: the server queues engine commands with 0x6202 (CNetDuel::queue), the executor
// (FUN_00721020) hands them one by one to the dispatcher (FUN_00709cb0) and each handler is a small state machine that
// changes the board and asks the duel view (DUEL_VIEW, FUN_0073dd80) for animations, waiting for them to finish.
// Reference: YOLaucher research/traductor/NOTES.md §2 (the command table) and research/lockstep/NOTES.md.
//
// All engine state is one block of globals, 0x012c7880..0x012d2b64. DuelEngine reproduces it byte for byte so a
// differential test can copy the exe's memory in and out; members are named after their address where the meaning
// is not known yet (c80b4 = DAT_012c80b4).
#pragma once
#include <cstddef>
#include <cstdint>

#include "NetDuel.h"

// A card word (slots, piles): internal card id (14 bits) | owner << 14 | flag bits 15..22 | serial << 23.
// uid = owner + 2 * serial identifies a physical card for the whole duel.
inline uint32_t cardId(uint32_t w) { return w & 0x3fff; }
inline uint32_t cardOwner(uint32_t w) { return w >> 14 & 1; }
inline uint32_t cardSerial(uint32_t w) { return w >> 23 & 0xff; }
inline uint32_t cardUid(uint32_t w) { return cardOwner(w) + cardSerial(w) * 2; }

enum Zone : int {   // engine zone numbers (0x6350 / 0x6202 use the same)
    Z_MONSTER = 0,  // 0..4 monster slots
    Z_SPELL = 5,    // 5..9 spell/trap slots
    Z_FIELD = 10,   // field spell
    Z_HAND = 0xb, Z_EXTRA = 0xc, Z_DECK = 0xd, Z_GRAVE = 0xe, Z_BANISH = 0xf,
};

struct EngSlot {          // 0x14: one field slot (0..10; slot 11 holds player-wide state)
    uint32_t card;        // 0x00 card word, 0 = empty
    uint16_t turn;        // 0x04 move stamp (DuelEngine::stamp when placed)
    uint16_t def;         // 0x06 position: 1 = defense (toggled by 0x34)
    uint16_t faceUp;      // 0x08 1 = face-up (0x2d / 0x48 "value", toggled by 0x34 / 0x35)
    uint16_t head;        // 0x0a first effect node on this slot (0 = none)
    uint32_t value;       // 0x0c counters / turns / declared value (0x3a); low u16 = counter count
    uint32_t flags;       // 0x10 bit 3 being summoned, bit 21 placed this turn, ... (FUN_00707f20 sets bit n)
};
static_assert(sizeof(EngSlot) == 0x14, "EngSlot");

struct EngPlayer {           // 0xe0c at 0x012c8880 + j * 0xe0c
    int32_t lp;              // 0x000
    uint32_t nextSerial;     // 0x004 FUN_006eaf00: next token serial (wraps to baseSerial + 2 past 0xff)
    uint32_t baseSerial;     // 0x008
    uint32_t handCount;      // 0x00c
    uint32_t deckCount;      // 0x010
    uint32_t graveCount;     // 0x014
    uint32_t extraCount;     // 0x018
    uint32_t banishCount;    // 0x01c
    uint32_t v20;            // 0x020
    uint32_t deckOut;        // 0x024 set when a draw finds the deck empty
    uint32_t v28;            // 0x028
    uint32_t v2c;            // 0x02c
    uint32_t endReason;      // 0x030 DUEL_END reason for this player (0x05)
    EngSlot slot[12];        // 0x034
    uint32_t hand[160];      // 0x124
    uint32_t deck[160];      // 0x3a4 index 0 = top
    uint32_t extra[30];      // 0x624
    uint32_t grave[190];     // 0x69c
    uint32_t banish[190];    // 0x994
    uint8_t banishView[190][2];  // 0xc8c per banished card: [0] 0x40 = use bit 1 of [1], 0xc0 = face-down, else face-up
    uint8_t vc8c[0x180 - 380];
};
static_assert(sizeof(EngPlayer) == 0xe0c, "EngPlayer");

struct EngUid {           // 10 B per uid at 0x012ca4c8: what the engine knows of each physical card
    uint16_t card;        // 0x0 internal id (0x6202 type 0x1d / 0x40)
    uint16_t propIndex;   // 0x2 card_prop index (the network id), FUN_00744a50
    uint16_t moves;       // 0x4 low 2 bits count placements (FUN_006eaf70)
    uint16_t head;        // 0x6 first effect node bound to the card
    uint16_t w8;          // 0x8
};
static_assert(sizeof(EngUid) == 10, "EngUid");

struct EngNode {          // 10 B effect / modifier node at 0x012cb8c8; node 0 unused, 1..255 allocatable
    uint16_t key;         // 0x0 card id of the source
    uint8_t kind;         // 0x2 low nibble type (0 = free; < 6 / >= 6 are two families), high nibble sub-type
    uint8_t b3;           // 0x3
    uint16_t value;       // 0x4
    uint16_t stamp;       // 0x6 DuelEngine::stamp at creation
    uint16_t next;        // 0x8 next node in the same list
};
static_assert(sizeof(EngNode) == 10, "EngNode");

struct EngCmd {           // 8 B: one engine command (0x6202 type 0 / FUN_00709b10)
    uint16_t b;           // player << 15 | id (12 bits)
    uint16_t p0, p1, p2;
};

struct EngChain {         // 0x1c per chain link at 0x012c8424 + n * 0x1c (n = 1..16)
    uint16_t w0;          // 0x00
    uint16_t bits;        // 0x02 bit 0 player, bits 1-5 zone
    uint16_t w4;          // 0x04
    uint16_t w6;          // 0x06 low 7 bits: counter, bit 7 targets were picked, high byte: target count
    uint16_t tgt[5];      // 0x08 targets: player | slot << 1 | uid << 5 | moves << 14
    uint16_t ringAt;      // 0x12 targets past 5 continue in the ring at 0x012c8618 from this index
    uint8_t rest[8];      // 0x14
};
static_assert(sizeof(EngChain) == 0x1c, "EngChain");

struct DuelEngine {                // 0x012c7880
    uint32_t vc7880;                // 0x0000
    uint8_t _0004[0x1c];
    EngCmd cur;                    // 0x0020 (0x012c78a0) the command being executed
    EngCmd queue[256];             // 0x0028 (0x012c78a8) pending engine commands
    int32_t queued;                // 0x0828 (0x012c80a8)
    int32_t running;               // 0x082c (0x012c80ac) 1 while `cur` executes; handlers clear it when done
    int32_t step;                  // 0x0830 (0x012c80b0) the running handler's state
    int32_t vc80b4;                 // 0x0834
    uint32_t tmpCard;              // 0x0838 (0x012c80b8) card word being moved
    uint32_t vc80bc;                // 0x083c
    uint32_t vc80c0;                // 0x0840
    uint32_t vc80c4;
    uint32_t vc80c8;
    uint32_t vc80cc;
    uint32_t vc80d0;
    uint32_t vc80d4;
    uint32_t vc80d8;
    uint32_t vc80dc;
    uint32_t vc80e0;
    uint32_t vc80e4;
    uint32_t vc80e8;
    uint32_t vc80ec;
    uint32_t vc80f0;
    uint32_t vc80f4;
    uint32_t vc80f8;
    uint32_t vc80fc;
    uint32_t vc8100;
    uint32_t vc8104;
    uint32_t vc8108;
    uint32_t vc810c;
    uint32_t vc8110;
    uint32_t vc8114;
    uint32_t vc8118;
    uint32_t vc811c;
    uint32_t vc8120;
    uint32_t vc8124;
    uint32_t vc8128;
    uint32_t vc812c;
    uint32_t vc8130;
    uint32_t vc8134;
    uint32_t vc8138;
    uint32_t vc813c;
    uint32_t vc8140;
    uint32_t vc8144;
    uint32_t vc8148;
    uint32_t vc814c;
    uint32_t vc8150;
    uint32_t vc8154;
    uint32_t vc8158;
    uint32_t vc815c;
    uint32_t vc8160;
    uint32_t vc8164;
    uint32_t vc8168;
    uint32_t vc816c;
    uint32_t vc8170;
    uint32_t vc8174;
    uint32_t vc8178;
    uint32_t vc817c;
    uint32_t vc8180;
    uint32_t vc8184;
    uint32_t vc8188;
    uint32_t vc818c;
    uint32_t vc8190;
    uint32_t vc8194;
    uint32_t vc8198;
    uint32_t vc819c;
    uint32_t vc81a0;
    uint32_t vc81a4;
    uint32_t vc81a8;
    uint32_t vc81ac;
    uint32_t vc81b0;
    uint32_t vc81b4;
    uint32_t vc81b8;
    uint32_t vc81bc;
    uint32_t vc81c0;
    uint32_t vc81c4;
    uint32_t vc81c8;
    uint32_t vc81cc;
    uint32_t vc81d0;
    uint32_t vc81d4;
    uint32_t vc81d8;
    uint32_t vc81dc;
    uint32_t vc81e0;
    uint32_t vc81e4;
    uint32_t vc81e8;
    uint32_t vc81ec;
    uint32_t vc81f0;
    uint32_t vc81f4;
    uint32_t vc81f8;
    uint32_t vc81fc;
    uint32_t vc8200;
    uint32_t vc8204;
    uint32_t vc8208;
    uint32_t vc820c;
    uint32_t vc8210;
    uint32_t vc8214;
    uint32_t vc8218;
    uint32_t vc821c;
    uint32_t vc8220;
    uint32_t vc8224;
    uint32_t vc8228;
    uint32_t vc822c;
    uint32_t vc8230;
    uint32_t vc8234;
    uint32_t vc8238;
    uint32_t vc823c;
    uint32_t vc8240;
    uint32_t vc8244;
    uint32_t vc8248;
    uint32_t vc824c;
    uint32_t vc8250;
    uint32_t vc8254;
    uint32_t vc8258;
    uint32_t vc825c;
    uint32_t vc8260;
    uint32_t vc8264;
    uint32_t vc8268;
    uint32_t vc826c;
    uint32_t vc8270;
    uint32_t vc8274;
    uint32_t vc8278;
    uint32_t vc827c;
    uint32_t vc8280;
    uint32_t vc8284;
    uint32_t vc8288;
    uint32_t vc828c;
    uint32_t vc8290;
    uint32_t vc8294;
    uint32_t vc8298;
    uint32_t vc829c;
    uint32_t vc82a0;
    uint32_t vc82a4;
    uint32_t vc82a8;
    uint32_t vc82ac;
    uint32_t vc82b0;
    uint32_t vc82b4;
    uint32_t vc82b8;
    uint32_t vc82bc;
    uint32_t vc82c0;
    uint32_t vc82c4;
    uint32_t vc82c8;
    uint32_t vc82cc;
    uint32_t vc82d0;
    uint32_t vc82d4;
    uint32_t vc82d8;
    uint32_t vc82dc;
    uint32_t vc82e0;
    uint32_t vc82e4;
    uint32_t vc82e8;
    uint32_t vc82ec;
    uint32_t vc82f0;
    uint32_t vc82f4;
    uint32_t vc82f8;
    uint32_t vc82fc;
    uint32_t vc8300;
    uint32_t vc8304;
    uint32_t vc8308;
    uint32_t vc830c;
    uint32_t vc8310;
    uint32_t vc8314;
    uint32_t vc8318;
    uint32_t vc831c;
    uint32_t vc8320;
    uint32_t vc8324;
    uint32_t vc8328;
    uint32_t vc832c;
    uint32_t vc8330;
    uint32_t vc8334;
    uint32_t vc8338;
    uint32_t vc833c;
    uint32_t vc8340;
    uint32_t vc8344;
    uint32_t vc8348;
    uint32_t vc834c;
    uint32_t vc8350;
    uint32_t vc8354;
    uint32_t vc8358;
    uint32_t vc835c;
    uint32_t vc8360;
    uint32_t vc8364;
    uint32_t vc8368;
    uint32_t vc836c;
    uint32_t vc8370;
    uint32_t vc8374;
    uint32_t vc8378;
    uint32_t vc837c;
    uint32_t vc8380;
    uint32_t vc8384;
    uint32_t vc8388;
    uint32_t vc838c;
    uint32_t vc8390;
    uint32_t vc8394;
    uint32_t vc8398;
    uint32_t vc839c;
    uint32_t vc83a0;
    uint32_t vc83a4;
    uint32_t vc83a8;
    uint32_t vc83ac;
    uint32_t vc83b0;
    uint32_t vc83b4;
    uint32_t vc83b8;
    uint32_t vc83bc;
    uint32_t vc83c0;
    uint32_t vc83c4;
    uint32_t vc83c8;
    uint32_t vc83cc;
    uint32_t vc83d0;
    uint32_t vc83d4;
    uint32_t vc83d8;
    uint32_t vc83dc;
    uint32_t vc83e0;
    uint32_t vc83e4;
    uint32_t vc83e8;
    uint32_t vc83ec;
    uint32_t vc83f0;
    uint32_t vc83f4;
    uint32_t vc83f8;
    uint32_t vc83fc;
    uint32_t vc8400;
    uint32_t vc8404;
    uint32_t vc8408;
    uint32_t vc840c;
    uint32_t vc8410;
    uint32_t vc8414;
    uint32_t vc8418;
    uint32_t vc841c;
    uint32_t vc8420;
    EngChain chain[17];            // 0x0ba4 (0x012c8424) links 1..16
    uint32_t vc8600;                // 0x0d80
    int32_t chainCount;            // 0x0d84 (0x012c8604)
    uint32_t vc8608;
    uint32_t vc860c;
    uint32_t vc8610;
    uint32_t vc8614;
    uint32_t vc8618;
    uint32_t vc861c;
    uint32_t vc8620;
    uint32_t vc8624;
    uint32_t vc8628;
    uint32_t vc862c;
    uint32_t vc8630;
    uint32_t vc8634;
    uint32_t vc8638;
    uint32_t vc863c;
    uint32_t vc8640;
    uint32_t vc8644;
    uint32_t vc8648;
    uint32_t vc864c;
    uint32_t vc8650;
    uint32_t vc8654;
    uint32_t vc8658;
    uint32_t vc865c;
    uint32_t vc8660;
    uint32_t vc8664;
    uint32_t vc8668;
    uint32_t vc866c;
    uint32_t vc8670;
    uint32_t vc8674;
    uint32_t vc8678;
    uint32_t vc867c;
    uint32_t vc8680;
    uint32_t vc8684;
    uint32_t vc8688;
    uint32_t vc868c;
    uint32_t vc8690;
    uint32_t vc8694;
    uint32_t vc8698;
    uint32_t vc869c;
    uint32_t vc86a0;
    uint32_t vc86a4;
    uint32_t vc86a8;
    uint32_t vc86ac;
    uint32_t vc86b0;
    uint32_t vc86b4;
    uint32_t vc86b8;
    uint32_t vc86bc;
    uint32_t vc86c0;
    uint32_t vc86c4;
    uint32_t vc86c8;
    uint32_t vc86cc;
    uint32_t vc86d0;
    uint32_t vc86d4;
    uint32_t vc86d8;
    uint32_t vc86dc;
    uint32_t vc86e0;
    uint32_t vc86e4;
    uint32_t vc86e8;
    uint32_t vc86ec;
    uint32_t vc86f0;
    uint32_t vc86f4;
    uint32_t vc86f8;
    uint32_t vc86fc;
    uint32_t vc8700;
    uint32_t vc8704;
    uint32_t vc8708;
    uint32_t vc870c;
    uint32_t vc8710;
    uint32_t vc8714;
    uint32_t vc8718;
    uint32_t vc871c;
    uint32_t vc8720;
    uint32_t vc8724;
    uint32_t vc8728;
    uint32_t pairA;                // 0x012c872c 0x6202 type 0x1f
    uint32_t pairB;                // 0x012c8730
    uint32_t vc8734;
    uint32_t vc8738;
    uint32_t vc873c;
    uint32_t vc8740;
    uint32_t vc8744;
    uint32_t vc8748;
    uint32_t vc874c;
    uint32_t vc8750;
    uint32_t vc8754;
    uint32_t vc8758;
    uint32_t vc875c;
    uint32_t vc8760;
    uint32_t vc8764;
    uint32_t vc8768;
    uint32_t vc876c;
    uint32_t vc8770;
    uint32_t vc8774;
    uint32_t vc8778;
    uint32_t vc877c;
    uint32_t vc8780;
    uint32_t vc8784;
    uint32_t vc8788;
    uint32_t vc878c;
    uint32_t vc8790;
    uint32_t vc8794;
    uint32_t vc8798;
    uint32_t vc879c;
    uint32_t vc87a0;
    uint32_t vc87a4;
    uint32_t vc87a8;
    uint32_t vc87ac;
    uint32_t vc87b0;
    uint32_t vc87b4;
    uint32_t vc87b8;
    uint32_t vc87bc;
    uint32_t vc87c0;
    uint32_t vc87c4;
    uint32_t vc87c8;
    uint32_t vc87cc;
    uint32_t vc87d0;
    uint32_t vc87d4;
    uint32_t vc87d8;
    uint32_t vc87dc;
    uint32_t vc87e0;
    uint32_t vc87e4;
    uint32_t vc87e8;
    uint32_t vc87ec;
    uint32_t vc87f0;
    uint32_t vc87f4;
    uint32_t vc87f8;
    uint32_t vc87fc;
    uint32_t vc8800;
    uint32_t vc8804;
    uint32_t vc8808;
    uint32_t vc880c;
    uint32_t vc8810;
    uint32_t vc8814;
    uint32_t vc8818;
    uint32_t vc881c;
    uint32_t vc8820;
    uint32_t vc8824;
    uint32_t vc8828;
    uint32_t vc882c;
    uint32_t vc8830;
    uint32_t vc8834;
    uint32_t vc8838;
    uint32_t vc883c;
    uint32_t vc8840;
    uint32_t vc8844;
    uint32_t vc8848;
    uint32_t vc884c;
    uint32_t vc8850;
    uint32_t vc8854;
    uint32_t vc8858;
    uint32_t vc885c;
    uint32_t vc8860;
    uint32_t vc8864;
    uint32_t vc8868;                // 0x0fe8 (0x012c8868)
    uint32_t vc886c;
    uint32_t vc8870;
    uint32_t vc8874;
    uint32_t vc8878;
    uint32_t vc887c;
    EngPlayer pl[2];               // 0x1000 (0x012c8880)
    uint32_t flags;                // 0x2c18 (0x012ca498) bit n set by command 0x09
    uint8_t _2c1c[4];
    uint32_t vca4a0;                // 0x2c20
    uint8_t _2c24[0x2c40 - 0x2c24];
    uint32_t fieldSpell;           // 0x2c40 (0x012ca4c0) internal id of the active field spell (0x14)
    uint32_t vca4c4;                // 0x2c44
    EngUid uid[512];               // 0x2c48 (0x012ca4c8)
    EngNode node[256];             // 0x4048 (0x012cb8c8)
    uint32_t seed;                 // 0x012cc2c8 LCG state (FUN_00720850)
    uint32_t stamp;                // 0x012cc2cc bumped on every placement / node
    uint32_t turnPlayer;           // 0x012cc2d0
    uint32_t turn;                 // 0x012cc2d4
    uint32_t vcc2d8;
    uint32_t phase;                // 0x012cc2dc 0 draw .. 4 main 2, 7 = none (after a turn change)
    uint32_t vcc2e0;
    uint32_t result;               // 0x012cc2e4 DUEL_END: 1 P0 wins, 2 P1 wins, 0 draw
    uint32_t vcc2e8;
    uint32_t vcc2ec;
    uint32_t vcc2f0;
    uint32_t vcc2f4;
    uint32_t vcc2f8;
    uint32_t vcc2fc;
    uint32_t vcc300;
    uint32_t vcc304;
    uint32_t subPhase;             // 0x012cc308
    uint32_t vcc30c;
    uint32_t vcc310;
    uint32_t battleState;          // 0x012cc314
    uint32_t vcc318;
    uint32_t vcc31c;
    uint32_t vcc320;
    uint32_t inDispatch;           // 0x012cc324
    uint32_t vcc328;
    uint32_t vcc32c;
    uint32_t vcc330;
    uint32_t vcc334;
    uint32_t vcc338;               // 0x012cc338 nesting depth of FUN_00702cc0 (level) while it asks for the side masks
    uint32_t vcc33c;
    uint32_t vcc340;
    uint32_t vcc344;
    uint32_t inputClass;           // 0x012cc348 0x6202 type 0x1a P0
    uint32_t vcc34c;
    uint32_t vcc350;
    uint32_t vcc354;
    uint32_t vcc358;
    uint32_t vcc35c;
    uint32_t vcc360;
    uint32_t vcc364;
    uint32_t vcc368;
    uint32_t vcc36c;
    uint32_t vcc370;
    uint32_t vcc374;
    uint32_t vcc378;
    uint32_t vcc37c;
    uint32_t vcc380;
    uint32_t vcc384;
    uint32_t vcc388;
    uint32_t vcc38c;
    uint32_t vcc390;
    uint32_t vcc394;
    uint32_t vcc398;
    uint32_t vcc39c;
    uint32_t vcc3a0;
    uint32_t vcc3a4;
    uint16_t vars[8];              // 0x012cc3a8 0x6202 type 0x1e: vars[1] = cards left to discard
    uint32_t vcc3b8;
    uint32_t vcc3bc;
    uint32_t vcc3c0;          // 0x012cc3c0 battle: attacking player
    uint32_t vcc3c4;          // 0x012cc3c4 battle: attacked player
    uint32_t vcc3c8;          // 0x012cc3c8 battle: 1 = direct attack
    uint32_t vcc3cc;
    uint32_t vcc3d0;
    uint32_t vcc3d4;
    uint32_t vcc3d8;
    uint32_t vcc3dc;          // 0x012cc3dc battle: attacker's slot
    uint32_t vcc3e0;          // 0x012cc3e0 battle: attacked slot
    uint32_t vcc3e4;
    uint32_t vcc3e8;          // 0x012cc3e8 battle: attacker's uid
    uint32_t vcc3ec;          // 0x012cc3ec battle: 1 while a battle runs
    uint32_t vcc3f0;
    uint32_t vcc3f4;
    uint32_t vcc3f8;
    uint32_t vcc3fc;
    uint32_t vcc400;
    uint32_t vcc404;
    uint32_t vcc408;
    uint32_t vcc40c;
    uint32_t vcc410;
    uint32_t vcc414;
    uint32_t vcc418;
    uint32_t vcc41c;
    uint32_t vcc420;
    uint32_t vcc424;
    uint32_t vcc428;
    uint32_t vcc42c;
    uint32_t vcc430;
    uint32_t vcc434;
    uint32_t vcc438;
    uint32_t vcc43c;
    uint32_t vcc440;
    uint32_t vcc444;
    uint32_t vcc448;
    uint32_t vcc44c;
    uint32_t vcc450;
    uint32_t vcc454;
    uint32_t vcc458;
    uint32_t vcc45c;
    uint32_t vcc460;
    uint32_t vcc464;
    uint32_t vcc468;
    uint32_t vcc46c;
    uint32_t vcc470;
    uint32_t vcc474;
    uint32_t vcc478;
    uint32_t vcc47c;
    uint32_t vcc480;
    uint32_t vcc484;
    uint32_t vcc488;
    uint32_t vcc48c;
    uint32_t vcc490;
    uint32_t vcc494;
    uint32_t vcc498;
    uint32_t vcc49c;
    uint32_t vcc4a0;
    uint32_t vcc4a4;
    EngSlot tmpSlot[2];            // 0x012cc4a8 / 0x012cc4bc
    uint32_t vcc4d0;
    uint32_t vcc4d4;
    uint32_t vcc4d8;
    uint32_t vcc4dc;
    uint32_t vcc4e0;
    uint32_t vcc4e4;
    uint32_t vcc4e8;
    uint32_t vcc4ec;
    uint32_t vcc4f0;
    uint32_t vcc4f4;
    uint32_t vcc4f8;
    uint32_t vcc4fc;
    uint32_t vcc500;
    uint32_t vcc504;
    uint32_t vcc508;
    uint32_t vcc50c;
    uint32_t vcc510;
    uint32_t vcc514;
    uint32_t vcc518;
    uint32_t vcc51c;
    uint32_t vcc520;
    uint32_t vcc524;
    uint32_t vcc528;
    uint32_t vcc52c;
    uint32_t vcc530;
    uint32_t vcc534;
    uint32_t vcc538;
    uint32_t vcc53c;
    uint32_t vcc540;
    uint32_t vcc544;
    uint32_t vcc548;
    uint32_t vcc54c;
    uint32_t vcc550;
    uint32_t vcc554;
    uint32_t vcc558;
    uint32_t vcc55c;
    uint32_t vcc560;
    uint32_t vcc564;
    uint32_t vcc568;
    uint32_t vcc56c;
    uint32_t vcc570;
    uint32_t vcc574;
    uint32_t vcc578;
    uint32_t vcc57c;
    uint32_t vcc580;
    uint32_t vcc584;
    uint32_t vcc588;
    uint32_t vcc58c;
    uint32_t vcc590;
    uint32_t vcc594;
    uint32_t vcc598;
    uint32_t vcc59c;
    uint32_t vcc5a0;
    uint32_t vcc5a4;
    uint32_t vcc5a8;
    uint32_t vcc5ac;
    uint32_t vcc5b0;
    uint32_t vcc5b4;
    uint32_t vcc5b8;
    uint32_t vcc5bc;
    uint32_t vcc5c0;
    uint32_t vcc5c4;
    uint32_t vcc5c8;
    uint32_t vcc5cc;
    uint32_t vcc5d0;
    uint32_t vcc5d4;
    uint32_t vcc5d8;
    uint32_t vcc5dc;
    uint32_t vcc5e0;
    uint32_t vcc5e4;
    uint32_t vcc5e8;
    uint32_t vcc5ec;
    uint32_t vcc5f0;
    uint32_t vcc5f4;
    uint32_t vcc5f8;
    uint32_t vcc5fc;
    uint32_t vcc600;
    uint32_t vcc604;
    uint32_t vcc608;
    uint32_t vcc60c;
    uint32_t vcc610;
    uint32_t vcc614;
    uint32_t vcc618;
    uint32_t vcc61c;
    uint32_t vcc620;
    uint32_t vcc624;
    uint32_t vcc628;
    uint32_t vcc62c;
    uint32_t vcc630;
    uint32_t vcc634;
    uint32_t vcc638;
    uint32_t vcc63c;
    uint32_t vcc640;
    uint32_t vcc644;
    uint32_t vcc648;
    uint32_t vcc64c;
    uint32_t vcc650;
    uint32_t vcc654;
    uint32_t vcc658;
    uint32_t vcc65c;
    uint32_t vcc660;
    uint32_t vcc664;
    uint32_t vcc668;
    uint32_t vcc66c;
    uint32_t vcc670;
    uint32_t vcc674;
    uint32_t vcc678;
    uint32_t vcc67c;
    uint32_t vcc680;
    uint32_t vcc684;
    uint32_t vcc688;
    uint32_t vcc68c;
    uint32_t vcc690;
    uint32_t vcc694;
    uint32_t vcc698;
    uint32_t vcc69c;
    uint32_t vcc6a0;
    uint32_t vcc6a4;
    uint32_t vcc6a8;
    uint32_t vcc6ac;
    uint32_t vcc6b0;
    uint32_t vcc6b4;
    uint32_t vcc6b8;
    uint32_t vcc6bc;
    uint32_t vcc6c0;
    uint32_t vcc6c4;
    uint32_t vcc6c8;
    uint32_t vcc6cc;
    uint32_t vcc6d0;
    uint32_t vcc6d4;
    uint32_t vcc6d8;
    uint32_t vcc6dc;
    uint32_t vcc6e0;
    uint32_t vcc6e4;
    uint32_t vcc6e8;
    uint32_t vcc6ec;
    uint32_t vcc6f0;
    uint32_t vcc6f4;
    uint32_t vcc6f8;
    uint32_t vcc6fc;
    uint32_t vcc700;
    uint32_t vcc704;
    uint32_t vcc708;
    uint32_t vcc70c;
    uint32_t vcc710;
    uint32_t vcc714;
    uint32_t vcc718;
    uint32_t vcc71c;
    uint32_t vcc720;
    uint32_t vcc724;
    uint32_t vcc728;
    uint32_t vcc72c;
    uint32_t vcc730;
    uint32_t vcc734;
    uint32_t vcc738;
    uint32_t vcc73c;
    uint32_t vcc740;
    uint32_t vcc744;
    uint32_t vcc748;
    uint32_t vcc74c;
    uint32_t vcc750;
    uint32_t vcc754;
    uint32_t vcc758;
    uint32_t vcc75c;
    uint32_t vcc760;
    uint32_t vcc764;
    uint32_t vcc768;
    uint32_t vcc76c;
    uint32_t vcc770;
    uint32_t vcc774;
    uint32_t vcc778;
    uint32_t vcc77c;
    uint32_t vcc780;
    uint32_t vcc784;
    uint32_t vcc788;
    uint32_t vcc78c;
    uint32_t vcc790;
    uint32_t vcc794;
    uint32_t vcc798;
    uint32_t vcc79c;
    uint32_t vcc7a0;
    uint32_t vcc7a4;
    uint32_t vcc7a8;
    uint32_t vcc7ac;
    uint32_t vcc7b0;
    uint32_t vcc7b4;
    uint32_t vcc7b8;
    uint32_t vcc7bc;
    uint32_t vcc7c0;
    uint32_t vcc7c4;
    uint32_t vcc7c8;
    uint32_t vcc7cc;
    uint32_t vcc7d0;
    uint32_t vcc7d4;
    uint32_t vcc7d8;
    uint32_t vcc7dc;
    uint32_t vcc7e0;
    uint32_t vcc7e4;
    uint32_t vcc7e8;
    uint32_t vcc7ec;
    uint32_t vcc7f0;
    uint32_t vcc7f4;
    uint32_t vcc7f8;
    uint32_t vcc7fc;
    uint32_t vcc800;
    uint32_t vcc804;
    uint32_t vcc808;
    uint32_t vcc80c;
    uint32_t vcc810;
    uint32_t vcc814;
    uint32_t vcc818;
    uint32_t vcc81c;
    uint32_t vcc820;
    uint32_t vcc824;
    uint32_t vcc828;
    uint32_t vcc82c;
    uint32_t vcc830;
    uint32_t vcc834;
    uint32_t vcc838;
    uint32_t vcc83c;
    uint32_t vcc840;
    uint32_t viewer;               // 0x012cc844 the player this client shows at the bottom
    uint32_t ctl[2];               // 0x012cc848 per player: 1 = played by the engine itself; ctl[0] == 3 refuses commands
    uint32_t vcc850;
    uint32_t vcc854;
    uint32_t vcc858;
    uint32_t vcc85c;
    uint32_t vcc860;
    uint32_t vcc864;
    uint32_t vcc868;
    uint32_t vcc86c;
    uint32_t vcc870;
    uint32_t vcc874;
    uint32_t vcc878;
    uint32_t vcc87c;
    uint32_t vcc880;
    uint32_t vcc884;
    uint32_t vcc888;
    uint32_t vcc88c;
    uint32_t vcc890;
    uint32_t vcc894;
    uint32_t vcc898;
    uint32_t vcc89c;
    uint32_t vcc8a0;
    uint32_t vcc8a4;
    uint32_t vcc8a8;
    uint32_t vcc8ac;
    uint32_t vcc8b0;
    uint32_t vcc8b4;
    uint32_t vcc8b8;
    uint32_t vcc8bc;
    uint32_t vcc8c0;
    uint32_t vcc8c4;
    uint32_t vcc8c8;
    uint32_t vcc8cc;
    uint32_t vcc8d0;
    uint32_t vcc8d4;
    uint32_t vcc8d8;
    uint32_t vcc8dc;
    uint32_t vcc8e0;
    uint32_t vcc8e4;
    uint32_t vcc8e8;
    uint32_t vcc8ec;
    uint32_t vcc8f0;
    uint32_t vcc8f4;
    uint32_t vcc8f8;
    uint32_t vcc8fc;
    uint32_t vcc900;
    uint32_t vcc904;
    uint32_t vcc908;
    uint32_t vcc90c;
    uint32_t vcc910;
    uint32_t vcc914;
    uint32_t vcc918;
    uint32_t vcc91c;
    uint32_t vcc920;
    uint32_t vcc924;
    uint32_t vcc928;
    uint32_t vcc92c;
    uint32_t vcc930;
    uint32_t vcc934;
    uint32_t vcc938;
    uint32_t vcc93c;
    uint32_t vcc940;
    uint32_t vcc944;
    uint32_t vcc948;
    uint32_t vcc94c;
    uint32_t vcc950;
    uint32_t vcc954;
    uint32_t vcc958;
    uint32_t vcc95c;
    uint32_t vcc960;
    uint32_t vcc964;
    uint32_t vcc968;
    uint32_t vcc96c;
    uint32_t vcc970;
    uint32_t vcc974;
    uint32_t vcc978;
    uint32_t vcc97c;
    uint32_t vcc980;
    uint32_t vcc984;
    uint32_t vcc988;
    uint32_t vcc98c;
    uint32_t vcc990;
    uint32_t vcc994;
    uint32_t vcc998;
    uint32_t vcc99c;
    uint32_t vcc9a0;
    uint32_t vcc9a4;
    uint32_t vcc9a8;
    uint32_t vcc9ac;
    uint32_t vcc9b0;
    uint32_t vcc9b4;
    uint32_t vcc9b8;
    uint32_t vcc9bc;
    uint32_t vcc9c0;
    uint32_t vcc9c4;
    uint32_t vcc9c8;
    uint32_t vcc9cc;
    uint32_t vcc9d0;
    uint32_t vcc9d4;
    uint32_t vcc9d8;
    uint32_t vcc9dc;
    uint32_t vcc9e0;
    uint32_t vcc9e4;
    uint32_t vcc9e8;
    uint32_t vcc9ec;
    uint32_t vcc9f0;
    uint32_t vcc9f4;
    uint32_t vcc9f8;
    uint32_t vcc9fc;
    uint32_t vcca00;
    uint32_t vcca04;
    uint32_t vcca08;
    uint32_t vcca0c;
    uint32_t vcca10;
    uint32_t vcca14;
    uint32_t vcca18;
    uint32_t vcca1c;
    uint32_t vcca20;
    uint32_t vcca24;
    uint32_t vcca28;
    uint32_t vcca2c;
    uint32_t vcca30;
    uint32_t vcca34;
    uint32_t vcca38;
    uint32_t vcca3c;
    uint32_t vcca40;
    uint32_t vcca44;
    uint32_t vcca48;
    uint32_t vcca4c;
    uint32_t vcca50;
    uint32_t vcca54;
    uint32_t vcca58;
    uint32_t vcca5c;
    uint32_t vcca60;
    uint32_t vcca64;
    uint32_t vcca68;
    uint32_t vcca6c;
    uint32_t vcca70;
    uint32_t vcca74;
    uint32_t vcca78;
    uint32_t vcca7c;
    uint32_t vcca80;
    uint32_t vcca84;
    uint32_t vcca88;
    uint32_t vcca8c;
    uint32_t vcca90;
    uint32_t vcca94;
    uint32_t vcca98;
    uint32_t vcca9c;
    uint32_t vccaa0;
    uint32_t vccaa4;
    uint32_t vccaa8;
    uint32_t vccaac;
    uint32_t vccab0;
    uint32_t vccab4;
    uint32_t vccab8;
    uint32_t vccabc;
    uint32_t vccac0;
    uint32_t vccac4;
    uint32_t vccac8;
    uint32_t vccacc;
    uint32_t vccad0;
    uint32_t vccad4;
    uint32_t vccad8;
    uint32_t vccadc;
    uint32_t vccae0;
    uint32_t vccae4;
    uint32_t vccae8;
    uint32_t vccaec;
    uint32_t vccaf0;
    uint32_t vccaf4;
    uint32_t vccaf8;
    uint32_t vccafc;
    uint32_t vccb00;
    uint32_t vccb04;
    uint32_t vccb08;
    uint32_t vccb0c;
    uint32_t vccb10;
    uint32_t vccb14;
    uint32_t vccb18;
    uint32_t vccb1c;
    DuelCardList deckList;         // 0x52a0 (0x012ccb20) 0x6610 card list for the deck-list window
    uint32_t vd2b34;
    uint32_t vd2b38;
    uint32_t vd2b3c;
    uint32_t vd2b40;
    uint32_t vd2b44;
    uint32_t vd2b48;
    uint32_t vd2b4c;
    uint32_t vd2b50;
    uint32_t vd2b54;
    uint32_t vd2b58;
    uint32_t vd2b5c;
    uint32_t vd2b60;
};
YO2_AT(DuelEngine, cur, 0x20);
YO2_AT(DuelEngine, queued, 0x828);
YO2_AT(DuelEngine, tmpCard, 0x838);
YO2_AT(DuelEngine, chain, 0xba4);
YO2_AT(DuelEngine, chainCount, 0xd84);
YO2_AT(DuelEngine, pairA, 0xeac);
YO2_AT(DuelEngine, vc8868, 0xfe8);
YO2_AT(DuelEngine, pl, 0x1000);
YO2_AT(DuelEngine, flags, 0x2c18);
YO2_AT(DuelEngine, fieldSpell, 0x2c40);
YO2_AT(DuelEngine, uid, 0x2c48);
YO2_AT(DuelEngine, node, 0x4048);
YO2_AT(DuelEngine, stamp, 0x4a4c);
YO2_AT(DuelEngine, phase, 0x4a5c);
YO2_AT(DuelEngine, result, 0x4a64);
YO2_AT(DuelEngine, subPhase, 0x4a88);
YO2_AT(DuelEngine, battleState, 0x4a94);
YO2_AT(DuelEngine, inDispatch, 0x4aa4);
YO2_AT(DuelEngine, inputClass, 0x4ac8);
YO2_AT(DuelEngine, vars, 0x4b28);
YO2_AT(DuelEngine, tmpSlot, 0x4c28);
YO2_AT(DuelEngine, viewer, 0x4fc4);
YO2_AT(DuelEngine, deckList, 0x52a0);
static_assert(sizeof(DuelEngine) == 0xb2e4, "DuelEngine size");

constexpr uint32_t ENG_BASE = 0x012c7880;   // where g_eng lives in the exe
#if defined(_WIN32) && defined(__i386__)
// Inside the game (yo2rep.dll, and the differential tester that maps it next to yo2.exe) the engine state IS the exe's
// block, so the rewrite and the original share every global.
#define YO2_ENGINE_IN_EXE 1
#define g_eng (*reinterpret_cast<DuelEngine*>(ENG_BASE))
#else
extern DuelEngine g_eng;
#endif

// The duel view (DUEL_VIEW, FUN_0073dd80): animations and dialogs. The engine starts one and polls whether it is
// still running (FUN_00743130). Implemented by the duel scene; a headless build finishes them at once.
void duelView(int view, uintptr_t a, uintptr_t b, uintptr_t c);   // FUN_0073dd80 (b may carry a text buffer)
int duelViewBusy(int view);                                     // FUN_00743130

// A global by its exe address, for the arrays the exe indexes across several named members (0x012cc848[i]...).
template <class T = uint32_t> inline T* engAt(uint32_t addr) {
    return reinterpret_cast<T*>(reinterpret_cast<uint8_t*>(&g_eng) + (addr - ENG_BASE));
}
// A few engine globals hold exe pointers into the block itself; read through them only when they land inside it.
inline const uint16_t* engPtr16(uint32_t addr) {
    return addr >= ENG_BASE && addr + 2 <= ENG_BASE + sizeof(DuelEngine) ? engAt<uint16_t>(addr) : nullptr;
}

struct EngBattleSide {    // 0x48 per player at 0x012cc3f0: the monsters in the current battle (FUN_00705450 fills it)
    uint32_t j, slot;     // 0x00
    uint32_t pos;         // 0x08 EngSlot::def of the monster (1 = defense)
    uint32_t uid;         // 0x0c
    uint32_t moves;       // 0x10 low 2 bits of EngUid::moves
    int32_t text, card;   // 0x14 engCardText / engCardAt
    int32_t baseAtk, baseDef, atk, def;   // 0x1c clamped at 0; atk becomes the damage the battle deals
    int32_t race, level;  // 0x2c
    uint32_t v34[4];      // 0x34
    uint32_t v44;         // 0x44 set to 1
};
static_assert(sizeof(EngBattleSide) == 0x48, "EngBattleSide");
inline EngBattleSide* engBattle() { return engAt<EngBattleSide>(0x012cc3f0); }

// The command being executed: B = player << 15 | id, P0..P2.
inline uint32_t cmdPlayer() { return g_eng.cur.b >> 15; }
// Slot record by number as the exe computes it: 12..15 run on into the player's hand words (some handlers read
// "slot" fields for a pile zone).
inline EngSlot* engSlotRaw(uint32_t j, uint32_t s) { return engAt<EngSlot>(0x012c88b4 + (j & 1) * 0xe0c + s * 0x14); }
