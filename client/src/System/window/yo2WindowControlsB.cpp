// Window controls written by game-b (see yo2WindowControlsB.h).
#include "System/window/yo2WindowControlsB.h"

// =====================================================================================================================
// CWindowTaskFrameDuel

// @yo2 0x00a36ee0 CWindowTaskFrameDuel::CWindowTaskFrameDuel
CWindowTaskFrameDuel::CWindowTaskFrameDuel() { setTaskName("デュエルメニュー背景"); }

// @yo2 0x00a36e00 CWindowTaskFrameDuel::create
CWindowTaskFrameDuel* CWindowTaskFrameDuel::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = new CWindowTaskFrameDuel;
    f->setMediator(mediator);
    return dynamic_cast<CWindowTaskFrameDuel*>(f->CTask::create(parent, 10000));
}

// @yo2 0x00a37150 CWindowTaskFrameDuel::~CWindowTaskFrameDuel
// @yo2 0x00a37040 (an identical copy)
// @yo2 0x00a37010 CWindowTaskFrameDuel deleting destructor
CWindowTaskFrameDuel::~CWindowTaskFrameDuel() = default;

// @yo2 0x00a37260 CWindowTaskFrameDuel::loadImages: 100 x 152 corners over a 64-wide middle column, 8 high middle
// row, 48 high bottom row; each textured sprite shows its piece
void CWindowTaskFrameDuel::loadImages() {
    vc6::string path = windowDataDir();
    path += "duel_win_01_c01.png";
    windowSpriteTexture(topLeft_, path);
    windowDupTexture(top_, path);
    windowSpriteTexture(topRight_, path);
    windowSpriteTexture(bottomLeft_, path);
    windowSpriteTexture(bottomRight_, path);
    static const int32_t kW[3] = {100, 64, 100}, kU[3] = {0, 100, 108};
    static const int32_t kH[3] = {152, 8, 48}, kV[3] = {0, 152, 160};
    for (int g = 0; g < 9; g++)
        pieces_[g] = {kW[g % 3], kH[g / 3], kU[g % 3], kV[g / 3]};
    auto show = [](CElement* e, const Piece& p) {
        e->rect_[0] = p.u;
        e->rect_[1] = p.v;
        e->rect_[2] = p.w;
        e->rect_[3] = p.h;
    };
    show(windowElement(topLeft_), pieces_[0]);
    show(windowElement(top_), pieces_[1]);
    show(windowElement(topRight_), pieces_[2]);
    show(windowElement(bottomLeft_), pieces_[6]);
    show(windowElement(bottomRight_), pieces_[8]);
}
