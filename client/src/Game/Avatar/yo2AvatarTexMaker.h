// yo2AvatarTexMaker.cpp: CAvatarTexMaker composes an avatar picture from part images (layers) into one texture-sized
// canvas on a worker thread, then hands each cell of the canvas to one destination sprite. CWaistUpAvatar uses it
// for the waist-up portrait. Steps, driven by onMain: start() -> ask the texture manager for every layer's file ->
// once all are loaded the worker composes (layers alpha-blended in order, then the clear rects cut out) and copies
// the cells -> the files are released.
#pragma once
#include <atomic>
#include <cstdint>

#include "Game/Avatar/yo2AvatarExtern.h"
#include "Game/Avatar/yo2ObjVector.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CAvatarTexMaker : public CEasyTask {
public:
    enum { MAX_SPRITES = 16 };
    enum State : int32_t { IDLE, REQUEST, LOADING, COMPOSING };

    // One part picture: w x h pixels from (srcX, srcY) of `path`, drawn at (dstX, dstY) on the canvas.
    struct Layer {
        vc6::string path;      // 0x00
        int32_t srcX = 0;      // 0x10
        int32_t srcY = 0;      // 0x14
        int32_t w = 0;         // 0x18
        int32_t h = 0;         // 0x1c
        int32_t dstX = 0;      // 0x20
        int32_t dstY = 0;      // 0x24
        bool unk28 = false;    // 0x28 copied along, never read here
    };
    // A rectangle of one cell (col, row) made transparent after the layers are drawn.
    struct ClearRect {
        int32_t col, row;
        int32_t left, top, right, bottom;   // within the cell
    };
    using LayerList = ObjVector<Layer>;

    static CAvatarTexMaker* create(CTask* parent, uint32_t priority);
    CAvatarTexMaker();
    ~CAvatarTexMaker() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    void setDestSprites(CSpriteElm* const* sprites, uint32_t texW, uint32_t texH, uint32_t cellW, uint32_t cellH);
    void addClearRect(int32_t col, int32_t row, const int32_t rect[4]);
    void setLayers(const LayerList& layers);
    void start();

    void compose();
    static void blendLayer(ArgbImage& dst, const ArgbImage& src, const Layer& layer);
    static void threadMain(void* self);

    int32_t state_ = IDLE;                   // 0x070 State
    CTaskPtr<CSpriteElm> dest_[MAX_SPRITES]; // 0x074 cell k = row * cols + col
    uint32_t texW_ = 0;                      // 0x134 canvas size
    uint32_t texH_ = 0;                      // 0x138
    uint32_t cellW_ = 0;                     // 0x13c
    uint32_t cellH_ = 0;                     // 0x140
    uint32_t cols_ = 0;                      // 0x144 texW / cellW
    uint32_t rows_ = 0;                      // 0x148 texH / cellH
    vc6::vector<ClearRect> clearRects_;      // 0x14c
    LayerList layers_;                       // 0x15c
    uintptr_t thread_ = 0;                   // 0x16c
    std::atomic<bool> quit_{false};          // 0x170 tells the worker to stop
    std::atomic<bool> drawOrder_{false};     // 0x171 "m_bDrawOrder": the worker should compose now
    std::atomic<bool> drawn_{false};         // 0x172 the worker is done
    uint8_t unk173_[0x2d] = {};              // 0x173
};
YO2_AT(CAvatarTexMaker, state_, 0x070);
YO2_AT(CAvatarTexMaker, dest_, 0x074);
YO2_AT(CAvatarTexMaker, texW_, 0x134);
YO2_AT(CAvatarTexMaker, rows_, 0x148);
YO2_AT(CAvatarTexMaker, clearRects_, 0x14c);
YO2_AT(CAvatarTexMaker, layers_, 0x15c);
YO2_AT(CAvatarTexMaker, thread_, 0x16c);
YO2_AT(CAvatarTexMaker, quit_, 0x170);
YO2_AT(CAvatarTexMaker, drawOrder_, 0x171);
YO2_AT(CAvatarTexMaker, drawn_, 0x172);
YO2_SIZEOF(CAvatarTexMaker::Layer, 0x2c);
YO2_SIZEOF(CAvatarTexMaker::ClearRect, 0x18);
YO2_SIZEOF(CAvatarTexMaker, 0x1a0);
