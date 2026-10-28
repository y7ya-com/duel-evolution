// yo2PlChibiAvatar.cpp: CPlChibiAvatar's elm and attachments, reset, setup, the player's labels/flags/parts, the
// name colour, and the per-frame fade + star update from the lobby record.
#include "Game/Avatar/yo2ChibiAvatarManager.h"
#include "Game/Avatar/yo2PlChibiAvatar.h"
#include "avatar_stubs.h"
#include "game_test.h"

static CPlayerInfo jaden() {
    CPlayerInfo p;
    p.pid = 1234;
    p.name = "Jaden";
    p.country = "JP";
    p.teamName = "Slifer";
    p.state = 0x67;   // duelling
    p.avatar[0][CAvatarData::CLOTHES] = 0x70;
    p.avatar[1][CAvatarData::CLOTHES] = 0x80;
    p.teamId = 9;
    p.teamCode = 4242;
    return p;
}

template <class T>
static bool attachedAt(T* e, CTask* elm, const char* name, float x, float y) {
    return e && e->parent() == elm && e->instName() == name && e->inheritTransform_ && e->keepLocalZ_ &&
           e->pos_.x == x && e->pos_.y == y && e->pos_.z == 31729.0f;
}

static void build() {
    CTask* root = CTask::createRoot();
    CElement* layer = CElement::newChild(root, 5);
    CAvatarData d;
    d.setDefault(CAvatarData::FEMALE_DM);
    CPlChibiAvatar* a = CPlChibiAvatar::create(root, layer, d.bytes_);
    CHECK(a && a->taskName() == "CPlChibiAvatar" && a->priority() == 10000 && !a->elmParent_);
    CChibiAvatarElm* e = a->elm();
    CHECK(e && e->parent() == layer && e->avatar_.bytes_[CAvatarData::CLOTHES] == 0x70);
    CHECK(attachedAt(a->nationFlag_.get(), e, "国旗", -25, -130));
    CHECK(attachedAt(a->nameLabel_.get(), e, "名前ラベル", 0, -130));
    CHECK(attachedAt(a->label2_.get(), e, "チーム名ラベル", 0, -146));
    CHECK(attachedAt(a->teamFlag_.get(), e, "チーム旗", -25, -155));
    CHECK(attachedAt(a->star_.get(), e, "スター", -25, -114) && pendingLog().has("star.create:1"));

    spriteLog().textures.clear();
    a->reset();
    CHECK(a->kind_ == CChibiAvatar::KIND_PLAYER && !a->hasData_ && a->pid_ == 0 && a->name() == u"unknown");
    CHECK(spriteLog().textures.back() == "data/avatar/flag/flag_2215_01.png" && a->nationFlag_->rect_[1] == 0);
    CHECK(pendingLog().has("star:0,0"));

    g_lobbyWorld = 1;
    pendingLog().calls.clear();
    a->setPlayer(jaden());
    CHECK(a->hasData_ && a->pid_ == 1234 && e->avatar_.bytes_[CAvatarData::CLOTHES] == 0x80);   // world 1's parts
    CHECK(e->kind_ == CChibiAvatarElm::PLAYER && e->motionFiles_ == CChibiAvatarElm::kPlayerMotionFiles);
    CHECK(a->name() == u"@3Jaden");   // "@0" + name, then the colour of state 0x67 (stub: 103 % 10)
    CHECK(a->label2_->text() == u"@0Slifer");
    CHECK(a->instName() == "1234[Slifer]" && e->instName() == "1234[Slifer]Elm");   // the team name wins
    CHECK(a->nationFlag_->rect_[0] == 176 && a->nationFlag_->rect_[1] == 60);       // JP, small
    bool team = false;
    for (auto& t : spriteLog().textures) team |= t == "team:9/4242";
    CHECK(team);
    a->setNameColor(0x65);
    CHECK(a->name() == u"@1Jaden");

    CPlayerInfo q = jaden();
    q.teamName = "Obelisk", q.teamId = 3;
    a->setTeam(q);
    CHECK(a->label2_->text() == u"@0Obelisk" && a->instName() == "1234[Obelisk]" && a->name() == u"@1Jaden");
    CHECK(spriteLog().textures.back() == "team:3/4242");

    // setup: only from REQUESTED, and only with data
    a->requestLoad();
    a->texturesRequested_ = true;
    a->setup(false);
    CHECK(a->state_ == CChibiAvatar::LOADING && !a->texturesRequested_);
    a->state_ = CChibiAvatar::REQUESTED;
    a->setup(true);
    int n = 0;
    for (auto& p : e->engines_) n += dynamic_cast<CSwfEngine*>(p.task()) != nullptr;
    CHECK(a->state_ == CChibiAvatar::LOADED && n == 56);   // instant: every engine, greetings too
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void shown() {
    CTask* root = CTask::createRoot();
    auto* mng = static_cast<CChibiAvatarMng*>((new CChibiAvatarMng)->CTask::create(root, 1));
    CAvatarData d;
    CPlChibiAvatar* a = CPlChibiAvatar::create(root, root, d.bytes_);
    a->mng_ = mng;
    a->reset();
    a->setPlayer(jaden());
    a->requestLoad();
    a->setup(true);
    testFrame(root);   // LOADED + autoShow: fade in
    CHECK(a->state_ == CChibiAvatar::SHOWN && a->elm()->color_[3] == 0.0f);
    for (int i = 0; i < 14; i++) testFrame(root);
    CHECK(a->elm()->color_[3] < 1.0f && !a->effect_.done_);
    testFrame(root);   // 15 steps of 1/15
    CHECK(a->elm()->color_[3] == 1.0f && a->effect_.done_);
    a->elm()->world_.m[3][0] = 2000;   // off screen: hidden
    testFrame(root);
    CHECK(!a->elm()->disp_);
    a->elm()->world_.m[3][0] = 200;
    testFrame(root);
    CHECK(a->elm()->disp_);

    // stars by room kind
    lobbyPlayers().push_back(jaden());
    struct { uint8_t kind; uint16_t stars; const char* want; } cases[] = {
        {7, 9, "star:7,0"},  {15, 3, "star:3,0"},  {9, 9, "star:5,0"},    {16, 2, "star:2,0"},
        {10, 37, "star:3,7"}, {17, 70, "star:5,0"}, {20, 50, "star:5,0"}, {20, 51, "star:5,0"}, {20, 8, "star:0,8"},
    };
    for (auto& c : cases) {
        testRoomKind() = c.kind;
        lobbyPlayers()[0].stars = c.stars;
        pendingLog().calls.clear();
        testFrame(root);
        CHECK(pendingLog().calls.size() == 1 && pendingLog().calls[0] == c.want);
    }
    testRoomKind() = 3;   // other rooms: stars untouched
    pendingLog().calls.clear();
    testFrame(root);
    CHECK(pendingLog().calls.empty());
    lobbyPlayers().clear();

    // fade out, then hidden for good
    a->hide(false);
    int frames = 0;
    while (a->state_ == CChibiAvatar::SHOWN && frames < 20) {
        testFrame(root);
        frames++;
    }
    // 15 or 16 steps of 1/15 (float rounding), and the frame the fade ends it hides for good
    CHECK((frames == 15 || frames == 16) && a->elm()->color_[3] == 0.0f);
    CHECK(a->state_ == CChibiAvatar::IDLE && a->elm()->disabled_);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

int main() {
    gameSetFileProvider(fixtureProvider);
    build();
    shown();
    std::printf("avatar_plchibi_test ok\n");
}
