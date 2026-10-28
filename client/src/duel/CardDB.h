// Card database (0x0073b600..0x0073c380, labelled System but only the duel and deck code use it): data/bin/
// card_prop.bin (8 bytes per card), card_intid.bin (u16 prop index per internal id - 3000) and the limit lists.
//
// card_prop record: word 0 = internal id (14 bits) | ATK/10 << 14 (9 bits, 0x1ff = "?") | DEF/10 << 23;
// word 1 = bit 0 | kind << 1 (5 bits) | attribute << 6 (4 bits; 8 spell, 9 trap) | level << 10 (4 bits)
//        | icon << 14 (3 bits) | race << 17 (5 bits; 0x16 spell, 0x17 trap).
#pragma once
#include <cstdint>

bool cardDbLoad(const char* binDir);   // FUN_0073b640 (props part): card_prop.bin, card_intid.bin, card_genre.bin
int cardNormalize(int id);             // FUN_0073b600 alternative-art ids to their base card
int cardPropIndex(int id);             // FUN_0073bbe0 0 when unknown
int cardPropId(int index);             // FUN_0073bc50
const uint32_t* cardProp(int id);      // FUN_0073bf50
int cardRace(int id);                  // FUN_0073bf20
int cardAttr(int id);                  // FUN_0073bf80
int cardLevel(int id);                 // FUN_0073bfb0
int cardIcon(int id);                  // FUN_0073bfe0
int cardKind(int id);                  // FUN_0073c010
int cardAtk(int id);                   // FUN_0073c040 "?" = 0
int cardDef(int id);                   // FUN_0073c080
int cardAtkRaw(int id);                // FUN_0073c0c0 "?" = 0xffff
int cardDefRaw(int id);                // FUN_0073c100
int cardBit(int id, int bit);          // FUN_0073c140 genre bit n (CARD_Genre.bin, 64 bits per card)

inline bool cardIsMonster(int id) { return id && cardAttr(id) < 8; }   // FUN_007177f0
inline bool cardIsSpell(int id) { return cardRace(id) == 0x16; }      // FUN_00717820
inline bool cardIsTrap(int id) { return cardRace(id) == 0x17; }       // FUN_00717850

// limit lists (forbidden / limited): set by the lobby, read by the deck editor and the duel
// (the names src/Net/NetLobby_Shop.h declares them by)
void limitationSet(int32_t i, int32_t yo2Id, int32_t konamiId, uint8_t copies);   // FUN_0073c1e0
void limitationCount(int32_t n);                                                   // FUN_0073c220
void unreleasedSet(int32_t i, int32_t yo2Id, int32_t konamiId);                    // FUN_0073c240
void unreleasedCount(int32_t n);                                                   // FUN_0073c270
int cardLimitOf(int id);               // FUN_0073c290 3 when not listed
int cardLimit(int id);                 // FUN_0073c190 debug builds: 3
int cardPairFindB(int id);             // FUN_0073c330 unreleased (internal id): 0 found / -1
int cardPairFindA(int id);             // FUN_0073c380 unreleased (YO2 id)
#if !(defined(_WIN32) && defined(__i386__))   // (in the game these are the exe's globals, see CardDB.cpp)
extern uint32_t g_cardLimitCount;      // DAT_012a1038
extern uint32_t g_cardPairCount;       // DAT_01295030
extern uint32_t g_debugFlags;          // *(*(DAT_012711ac+0xc68)+0x1214): bit 11 = debug build
#endif
