// yo2ChibiAvatar.cpp: CChibiAvatar's load/show/hide state machine over a real CChibiAvatarElm, the manager's
// one-loader-at-a-time lock, the state table, positions, the name label and the on-screen test.
#include "Game/Avatar/yo2ChibiAvatar.h"
#include "Game/Avatar/yo2ChibiAvatarManager.h"
#include "avatar_stubs.h"
#include "game_test.h"

struct TestChibi : CChibiAvatar {
    int setups = 0;
    void setup(bool) override {
        setups++;
        state_ = LOADING;
    }
};

static TestChibi* newChibi(CTask* parent, CChibiAvatarMng* mng) {
    auto* c = static_cast<TestChibi*>((new TestChibi)->CTask::create(parent, 10));
    c->mng_ = mng;
    return c;
}

static int engines(CChibiAvatarElm* e) {
    int n = 0;
    for (auto& p : e->engines_) n += dynamic_cast<CSwfEngine*>(p.task()) != nullptr;
    return n;
}

static void lifecycle() {
    CTask* root = CTask::createRoot();
    auto* mng = static_cast<CChibiAvatarMng*>((new CChibiAvatarMng)->CTask::create(root, 1));
    TestChibi* a = newChibi(root, mng);
    TestChibi* b = newChibi(root, mng);
    CHECK(a->taskName() == "CChibiAvatar" && a->autoShow_ && !a->elm());

    CAvatarData d;
    d.setDefault(CAvatarData::MALE_GX);
    CHECK(a->createElm(root, d.bytes_) && b->createElm(root, d.bytes_));
    CHECK(a->elm() && a->elm()->instName() == "ちびアバターElm(名無し)" && a->effect_.elm_.task() == a->elm());
    CHECK(a->elm()->avatar_.bytes_[CAvatarData::CLOTHES] == 0x80 && a->elm()->disabled_);
    a->reset();   // clears the elm: the parts come after (CPlChibiAvatar::setPlayer)
    b->reset();
    a->elm()->setPlayerParts(d.bytes_);
    b->elm()->setPlayerParts(d.bytes_);
    CHECK(a->state_ == CChibiAvatar::IDLE && a->states_.count == 5 &&
          a->states_.allows(CChibiAvatar::REQUESTED, ChibiStateTable::SETUP));

    a->setPosition({10, 20, 0}, 3);
    CHECK(a->elm()->pos_.x == 10 && a->pos_.y == 20 && a->dir_ == 3 && a->elm()->dir_ == 3);
    CHECK(engines(a->elm()) == 1);   // turning made the facing's standing engine

    a->requestLoad();
    b->requestLoad();
    testFrame(root);   // REQUESTED waits for the subclass
    CHECK(a->state_ == CChibiAvatar::REQUESTED);
    a->setup(false);
    b->setup(false);
    b->autoShow_ = false;
    testFrame(root);   // a holds the loader lock and builds one engine a frame; b waits
    CHECK(mng->loading_ == a && a->texturesRequested_ && !b->texturesRequested_ && engines(a->elm()) == 2);
    int frames = 1;
    while (a->state_ == CChibiAvatar::LOADING && frames < 100) {
        testFrame(root);
        frames++;
    }
    // 48 engines (7 motions x 8 facings, greetings on demand), one existed: 47 frames (the last one's call runs the
    // cursor to the end)
    CHECK(a->state_ == CChibiAvatar::LOADED && engines(a->elm()) == 48 && frames == 47);
    CHECK(mng->loading_ == b && b->texturesRequested_);
    testFrame(root);   // autoShow: fade in from transparent at the stored position
    CHECK(a->state_ == CChibiAvatar::SHOWN && a->effect_.mode_ == 1 && !a->elm()->disabled_);
    CHECK(a->elm()->color_[3] == 0.0f && a->elm()->color_[0] == 1.0f && a->elm()->pos_.x == 10);
    CHECK(a->elm()->dir_ == 3 && a->elm()->engineIdx_ == CChibiAvatarElm::motionIndex(CChibiAvatarElm::STAND, 3));

    a->hide(false);   // fade out only
    CHECK(a->effect_.mode_ == 2 && a->state_ == CChibiAvatar::SHOWN);
    CHECK(mng->loading_ == b);
    a->hide(true);
    CHECK(a->state_ == CChibiAvatar::IDLE && !a->texturesRequested_ && a->elm()->disabled_);
    CHECK(mng->loading_ == b);   // hiding a doesn't take b's lock

    while (b->state_ == CChibiAvatar::LOADING) testFrame(root);
    testFrame(root);
    CHECK(b->state_ == CChibiAvatar::LOADED && mng->loading_ == nullptr);   // no autoShow: waits
    b->show(true);
    CHECK(b->state_ == CChibiAvatar::SHOWN && b->effect_.mode_ == 0);

    b->reset();   // drops the elm's engines
    CHECK(engines(b->elm()) == 0 && b->pos_.x == 0 && !b->texturesRequested_);

    // on screen: the elm's world translation within (-100, 1124) x (-100, 868)
    CChibiAvatarElm* e = a->elm();
    float pts[][3] = {{0, 0, 1}, {-99, 867, 1}, {-100, 0, 0}, {1124, 0, 0}, {500, 868, 0}, {1123.9f, -99.9f, 1}};
    for (auto& p : pts) {
        e->world_.m[3][0] = p[0];
        e->world_.m[3][1] = p[1];
        CHECK(a->onScreen() == (p[2] != 0));
    }
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void nameLabel() {
    CTask* root = CTask::createRoot();
    TestChibi* a = newChibi(root, nullptr);
    auto* label = static_cast<CTextElm*>((new CTextElm)->CTask::create(root, 1));
    a->nameLabel_.setUser(a);
    a->nameLabel_.set(label);
    label->setText(u"Jaden");
    CHECK(a->name() == u"Jaden");
    a->reset();   // no elm yet: only the label changes
    CHECK(a->name() == u"unknown");
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void stateTable() {
    TestChibi a;
    a.reset();
    using T = ChibiStateTable;
    CHECK(a.states_.allows(CChibiAvatar::IDLE, 0) && !a.states_.allows(CChibiAvatar::IDLE, T::BUSY));
    CHECK(a.states_.allows(CChibiAvatar::REQUESTED, T::BUSY | T::SETUP));
    CHECK(!a.states_.allows(CChibiAvatar::LOADING, T::SETUP) && a.states_.allows(CChibiAvatar::LOADED, T::BUSY));
    CHECK(a.states_.allows(CChibiAvatar::SHOWN, T::VISIBLE | T::BUSY) && !a.states_.allows(CChibiAvatar::SHOWN, 7));
    CHECK(!a.states_.allows(99, 0));   // no row: false even for no flags
}

static void loaderLock() {
    CChibiAvatarMng m;
    TestChibi a, b;
    CHECK(m.lockLoader(&a) && m.lockLoader(&a) && !m.lockLoader(&b));
    m.unlockLoader(&b);   // not the holder: no change
    CHECK(m.loading_ == &a);
    m.unlockLoader(&a);
    CHECK(m.lockLoader(&b));
}

int main() {
    gameSetFileProvider(fixtureProvider);
    lifecycle();
    nameLabel();
    loaderLock();
    stateTable();
    std::printf("avatar_chibi_test ok\n");
}
