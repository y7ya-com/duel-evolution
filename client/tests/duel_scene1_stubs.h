// State the scene-1 stubs (tests/duel_scene1_stubs.cpp) record or answer from, for tests/duel_scene1_cli.cpp.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace s1 {

struct Draw {             // one spriteDraw call
    const void* sprite;
    int32_t x, y, alpha;
    int32_t src[4];
    int32_t size[2];
    bool hasSrc, hasSize;
    bool blit;            // spriteBlit: scale, pivot, angle (radians), mode
    float sx, sy, angle;
    int32_t cx, cy, mode;
};

struct State {
    // input
    int32_t mouseX = 0, mouseY = 0;
    bool held = false, clicked = false, released = false, rightClicked = false, wheelMoved = false;
    int32_t wheel = 0;
    uint32_t keys = 0;        // bit k: keyPushed(k)
    bool hitTest = true;      // ugHitTest
    // sprites: every sheet is spriteW x spriteH with `frames` frames across
    int32_t spriteW = 32, spriteH = 32, frames = 1;
    std::vector<Draw> draws;
    // list boxes
    std::vector<std::string> listRows;
    int32_t hover = -1;
    std::vector<int32_t> rowSpan;   // listboxRowSpan per row (default 1)
    int32_t selectedCount = 0;
    uint32_t selectedMask = 0;
    int32_t button = 0;       // dialogOkButton / decoButton
    // engine
    std::vector<uint32_t> sent;   // engSendChoice
    uint32_t pairA = 0;
    int pairANone = 0;
    int discardLeft = 0;      // eng_722670
    int isMatch = 0;          // ndIsMatch
    // the mat as the card draw asks it (one card's slot)
    int stats[13] = {};       // engStatsOf2 (EngStats)
    int cardText = 0;         // engCardText
    uint32_t word = 0;        // engWordAt
    int input = 0;            // ndInput
    uint16_t handMask = 0;    // ndHandMask
    int counterRoom = 0, turns = 0, race = 0, attr = 0;
    uint32_t minLock = 0, keyValue = 0xffffffffu;
    int hasKey = 0;
    uint32_t counters[0x17] = {};
    // cursor
    std::vector<std::pair<int32_t, int32_t>> warps;
    int32_t asserts = 0;
    std::vector<std::string> log;
};
State& st();
void reset();

}   // namespace s1
