// yo2Rating.cpp: the Korean game-rating notice (data/etc/korean/*.png).
//
// CRatingScene is the boot screen between the logo and the title: the age-rating mark and the grade table on a
// white background, shown for four seconds after the fade-in, then a fade-out into the title scene.
// CRatingTask is the in-game reminder: every hour (3600 s) it shows the rating mark in the top-right corner for
// four seconds. Its HelpText (menu-bar help line) is hidden 15 s before each showing and raised to priority 999
// while the mark is up.
#pragma once
#include <cstdint>
#include <string>

#include "System/yo2Scene.h"
#include "System/yo2SceneManager.h"

// ---------------------------------------------------------------- other folders' code used here (not ported yet)
// Their definitions live with their owners; the Rating tests link stand-ins (tests/ui_rating/stubs.cpp).

// CSpriteElm::newChild(parent, priority, texture) (src/System yo2SpriteElm.cpp, 0x61f030): a sprite element whose
// texture is loaded by its onInit. Only its CElement part is used here, so it is handled as a CElement.
CElement* spriteElmNew(CTask* parent, uint32_t priority, const vc6::string& texture);

// CScreenFader (src/duel yo2ScreenFader.cpp) fades, from the scene manager's fader. `z` is the fade quad's depth.
void screenFaderFadeOut(CElement* fader, int32_t frames, uint32_t z);  // 0x7dcb00: to black
void screenFaderFadeIn(CElement* fader, int32_t frames, uint32_t z);   // 0x7dcc20: from black

// CStringDB slot 1 (0x61fb80): text #index widened to UTF-16 (the exe's std::wstring).
std::u16string stringDbWide(uint32_t index);

// HelpText (src/Game yo2HelpText.cpp, 0x1c bytes) is embedded by value; until src/Game is merged this keeps its
// bytes and reaches it through these calls. TODO(Game): embed HelpText itself.
struct HelpTextStorage {
    uint32_t raw[7];
};
void helpTextConstruct(HelpTextStorage* h);                        // HelpText::HelpText    0xa5c410
void helpTextDestruct(HelpTextStorage* h);                         // HelpText::~HelpText   0xa5c6d0
void helpTextSetText(HelpTextStorage* h, std::u16string_view s);   // HelpText::setText     0xa5c530
void helpTextSetPriority(HelpTextStorage* h, int32_t priority);    // HelpText::setPriority 0xa5c500

class HelpTextSlot {
public:
    HelpTextSlot() { helpTextConstruct(&s_); }
    ~HelpTextSlot() { helpTextDestruct(&s_); }
    HelpTextSlot(const HelpTextSlot&) = delete;
    HelpTextSlot& operator=(const HelpTextSlot&) = delete;
    void setText(std::u16string_view s) { helpTextSetText(&s_, s); }
    void setPriority(int32_t p) { helpTextSetPriority(&s_, p); }
    HelpTextStorage* storage() { return &s_; }

private:
    HelpTextStorage s_;
};
YO2_SIZEOF(HelpTextSlot, 0x1c);

// ---------------------------------------------------------------- the scene

class CRatingScene : public CSceneTask {
public:
    CRatingScene();
    ~CRatingScene() override;
    static CSceneTask* make(CTask* parent, CElement* layer);  // CSceneMng's SCENE_RATING factory

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    enum State : int32_t { FADING_IN, SHOWING, LEAVING };
    int32_t state() const { return state_; }
    CElement* ratingMark() const { return ratingMark_.task() ? ratingMark_.get() : nullptr; }
    CElement* gradeTable() const { return gradeTable_.task() ? gradeTable_.get() : nullptr; }
    CElement* background() const { return background_.task() ? background_.get() : nullptr; }

    static constexpr int32_t kShowSeconds = 4;
    static constexpr int32_t kFadeFrames = 10;
    static constexpr uint32_t kFadeZ = 61004;

private:
    int32_t state_ = FADING_IN;       // 0x80
    int32_t leaveAt_ = 0;             // 0x84 time() after which the fade-out starts
    CTaskPtr<CElement> ratingMark_;   // 0x88 CTaskPtr<CSpriteElm> "レーティング画像" rating_all.png
    CTaskPtr<CElement> gradeTable_;   // 0x94 CTaskPtr<CSpriteElm> "グレード表画像" rating1.png
    CTaskPtr<CElement> background_;   // 0xa0 CTaskPtr<CSpriteElm> "白バック画像" back.png
    [[maybe_unused]] uint32_t unkAC_ = 0;  // 0xac never touched
    struct Layout;
};
YO2_SIZEOF(CRatingScene, 0xb0);

// ---------------------------------------------------------------- the in-game reminder

class CRatingTask : public CEasyTask {
public:
    CRatingTask();
    ~CRatingTask() override;
    static CRatingTask* newChild(CTask* parent, CTask* layer);

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    enum State : int32_t { WAITING, SHOWING, HIDING };
    int32_t state() const { return state_; }
    int32_t nextShow() const { return nextShow_; }
    CElement* base() const { return base_.task() ? base_.get() : nullptr; }
    CElement* ratingMark() const { return ratingMark_.task() ? ratingMark_.get() : nullptr; }
    HelpTextSlot& helpText() { return help_; }

    static constexpr int32_t kIntervalSeconds = 3600;
    static constexpr int32_t kHideHelpSeconds = 15;
    static constexpr int32_t kShowSeconds = 4;
    static constexpr uint32_t kHelpTextId = 0xbd2;

private:
    int32_t state_ = WAITING;         // 0x70
    CTask* layer_ = nullptr;          // 0x74 the base element's parent, consumed by onInit
    CTaskPtr<CElement> base_;         // 0x78 "CLogoScene::m_pBaseElm" (sic)
    int32_t nextShow_ = 0;            // 0x84 time() of the next showing
    int32_t hideAt_ = 0;              // 0x88 time() after which the mark goes away
    CTaskPtr<CElement> ratingMark_;   // 0x8c CTaskPtr<CSpriteElm>, only while showing
    CTaskPtr<CElement> unused98_;     // 0x98 CTaskPtr<CSpriteElm>, never set
    CTaskPtr<CElement> unusedA4_;     // 0xa4 CTaskPtr<CSpriteElm>, never set
    HelpTextSlot help_;               // 0xb0
    [[maybe_unused]] uint32_t unkCC_ = 0;  // 0xcc operator new(0xd0); never touched
    struct Layout;
};
YO2_SIZEOF(CRatingTask, 0xd0);
