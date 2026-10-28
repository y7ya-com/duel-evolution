// yo2Menu.cpp: the place plate, CWindowTaskFramePlace and CWindowModelPlace.
#include <ctime>

#include "Game/yo2Menu.h"
#include "Game/yo2WorldMngExtern.h"
#include "Net/NetLobby.h"

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};
void show(CElement* e, const CWindowTaskPictureFrame::Piece& p) {   // the sprite shows its piece
    e->rect_[0] = p.u;
    e->rect_[1] = p.v;
    e->rect_[2] = p.w;
    e->rect_[3] = p.h;
}
// CWindowTaskShadowText::setPos (CWindowTask.h inline 0x0083d380): the text at x, y, its shadow offset from it.
void shadowTextAt(CWindowTaskShadowText* t, float x, float y) {
    t->x_ = static_cast<int32_t>(x);
    t->y_ = static_cast<int32_t>(y);
    t->text_->setPos(x, y);
    t->shadow_->setPos(static_cast<float>(t->shadowDx_) + x, static_cast<float>(t->shadowDy_) + y);
}
// One of the plate's four texts: black-shadowed, 16 pixels high, at x, y.
void placeText(CWindowTaskShadowText* t, const char* name, int32_t areaW, float x, float y, bool right) {
    windowNameTask(t, name);
    if (right) {
        t->text_->setAlign(CWindowTaskText::RIGHT);
        t->shadow_->setAlign(CWindowTaskText::RIGHT);
    }
    t->z_ = t->pos_.z = 1;
    t->text_->setArea(areaW, 16);
    t->shadow_->setArea(areaW, 16);
    shadowTextAt(t, x, y);
    t->shadow_->setColor(0, 0, 0, 1);
}
vc6::wstring wformat(const char* fmt, int32_t n) { return windowWiden(yo2Format(fmt, n)); }
}   // namespace

// --- CWindowTaskFramePlace ----------------------------------------------------------------------------------------

// @yo2 0x00a8bf10 CWindowTaskFramePlace::CWindowTaskFramePlace
CWindowTaskFramePlace::CWindowTaskFramePlace() { setTaskName("デュエルメニュー背景"); }

// @yo2 0x00a8be30 CWindowTaskFramePlace::create
CWindowTaskFramePlace* CWindowTaskFramePlace::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = new CWindowTaskFramePlace;
    f->setMediator(mediator);
    return dynamic_cast<CWindowTaskFramePlace*>(f->CTask::create(parent, 10000));
}

// @yo2 0x00a8c070 CWindowTaskFramePlace::~CWindowTaskFramePlace
// @yo2 0x00a8c040 CWindowTaskFramePlace deleting destructor
CWindowTaskFramePlace::~CWindowTaskFramePlace() = default;

// @yo2 0x00a8c180 CWindowTaskFramePlace::loadImages: only the middle row has pixels (224 x 52 at 0, 0, then the two
// 16-pixel ends at 224 and 240); the other pieces are 1 x 1
void CWindowTaskFramePlace::loadImages() {
    vc6::string path = windowDataDir();
    path += "lobbyname_win_01_c01.png";
    windowSpriteTexture(topLeft_, path);
    windowDupTexture(top_, path);
    windowSpriteTexture(topRight_, path);
    windowSpriteTexture(bottomLeft_, path);
    windowSpriteTexture(bottomRight_, path);
    for (Piece& p : pieces_)
        p = {1, 1, 0, 0};
    pieces_[3] = {224, 52, 0, 0};
    pieces_[4] = {16, 52, 224, 0};
    pieces_[5] = {16, 52, 240, 0};
    show(windowElement(topLeft_), pieces_[0]);
    show(windowElement(top_), pieces_[1]);
    show(windowElement(topRight_), pieces_[2]);
    show(windowElement(bottomLeft_), pieces_[6]);
    show(windowElement(bottomRight_), pieces_[8]);
}

// @yo2 0x00a8e7a0 CWindowTaskFramePlace::setSize
void CWindowTaskFramePlace::setSize(float w, float h) {
    w_ = w;
    h_ = h;
    layout();
}

// --- CWindowModelPlace --------------------------------------------------------------------------------------------

// @yo2 0x00a8d070 CWindowModelPlace::CWindowModelPlace
CWindowModelPlace::CWindowModelPlace() {
    unk3e0_ = "";
    unk3f0_ = "";
    setTaskName("場所表示");
}

// @yo2 0x00a8d4c0 CWindowModelPlace::create
CWindowModelPlace* CWindowModelPlace::create(CTask* parent) {
    auto* w = new CWindowModelPlace;
    return dynamic_cast<CWindowModelPlace*>(w->CTask::create(parent, 10000));
}

// @yo2 0x00a8d3a0 CWindowModelPlace::~CWindowModelPlace
// @yo2 0x00a8d350 CWindowModelPlace deleting destructor
CWindowModelPlace::~CWindowModelPlace() = default;

// @yo2 0x00a8d2c0 CWindowModelPlace::maxZ
int32_t CWindowModelPlace::maxZ() const { return static_cast<int32_t>(z_ + 5.0f); }

// @yo2 0x00a8d580 CWindowModelPlace::onInit: a 260 x 52 frame, the lobby line at y 9, the map line at y 26 (names at
// x 20, counts right-aligned at x 140); hidden until shown
bool CWindowModelPlace::onInit() {
    frame_.setUser(this);
    frame_.set(CWindowTaskFramePlace::create(this, this));
    windowNameTask(frame_.task(), "場所表示フレーム");
    frame_->w_ = 260;
    frame_->h_ = 52;
    frame_->layout();
    frame_->z_ = frame_->pos_.z = 0;
    lobbyName_.setUser(this);
    lobbyName_.set(CWindowTaskShadowText::create(this, this));
    placeText(lobbyName_.get(), "ロビー表示", 300, 20, 9, false);
    lobbyCount_.setUser(this);
    lobbyCount_.set(CWindowTaskShadowText::create(this, this));
    placeText(lobbyCount_.get(), "ロビー人数表示", 100, 140, 9, true);
    mapName_.setUser(this);
    mapName_.set(CWindowTaskShadowText::create(this, this));
    placeText(mapName_.get(), "マップ表示", 300, 20, 26, false);
    mapCount_.setUser(this);
    mapCount_.set(CWindowTaskShadowText::create(this, this));
    placeText(mapCount_.get(), "マップ人数表示", 100, 140, 26, true);
    lastUpdate_ = static_cast<int32_t>(std::time(nullptr));
    setDisp(false, true);
    TaskLockBits::of(this) |= 2u;
    layout();
    return true;
}

// @yo2 0x00a8dd80 CWindowModelPlace::onMain: the counts, every 5 seconds while shown
bool CWindowModelPlace::onMain() {
    if (!isVisible(false))
        return true;
    int32_t now = static_cast<int32_t>(std::time(nullptr));
    if (lastUpdate_ + 5 >= now)
        return true;
    lastUpdate_ = now;
    lobbyPlayers_ = static_cast<int32_t>(appNetLobby()->players.size());
    mapPlayers_ = gameMapPlayers();
    lobbyCount_->setText(wformat("(%d/1000)", lobbyPlayers_).c_str());
    mapCount_->setText(wformat("(%d/32)", mapPlayers_).c_str());
    return true;
}

// @yo2 0x00a8dea0 CWindowModelPlace::layout: the lobby's name and count, the map's name with its block number and
// count; the counts follow the longer name and the frame is 140 wider than it
void CWindowModelPlace::layout() {
    pos_.z = z_;
    if (!isVisible(false))
        return;
    CNetLobby* lobby = appNetLobby();
    lobbyPlayers_ = lobbyPlayerCount();
    lobbyName_->setText(lobbyDisplayName(lobby->rank, lobby->area).c_str());
    lobbyCount_->setText(wformat("(%d/1000)", lobbyPlayers_).c_str());
    uint8_t block = blockDisplayNumber(lobby->block);
    mapPlayers_ = gameMapPlayers();
    vc6::wstring map = mapDisplayName(gameCurrentMap());
    std::u16string line{std::u16string_view(map)};
    line += u"[";
    line += std::u16string_view(windowWiden(yo2Format("%d", block + 1)));
    line += u"]";
    mapName_->setText(line.c_str());
    mapCount_->setText(wformat("(%d/32)", mapPlayers_).c_str());
    int32_t a = lobbyName_->text_->width(), b = mapName_->text_->width();
    int32_t widest = (a > b ? lobbyName_ : mapName_)->text_->width();
    float x = static_cast<float>(widest + 20);
    shadowTextAt(lobbyCount_.get(), x, 9);
    shadowTextAt(mapCount_.get(), x, 26);
    frame_->setSize(static_cast<float>(widest + 140), 52);
}
