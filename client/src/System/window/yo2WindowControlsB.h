// yo2WindowControlsB.cpp: window controls written by game-b (0x00a60000..0x00b3ffff) that live in other folders'
// address ranges: CWindowTaskFrameDuel, the duel menus' background frame.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowControls.h"

// --- CWindowTaskFrameDuel: "デュエルメニュー背景", a 9-slice frame on duel_win_01_c01.png ---------------------------
class CWindowTaskFrameDuel : public CWindowTaskPictureFrame {
public:
    // (the exe sets the mediator before create)
    static CWindowTaskFrameDuel* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskFrameDuel();
    ~CWindowTaskFrameDuel() override;
    void loadImages() override;

    uint32_t unk474_ = 0;   // 0x474 (never written)
};
YO2_SIZEOF(CWindowTaskFrameDuel, 0x478);
