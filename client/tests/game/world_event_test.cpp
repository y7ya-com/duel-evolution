// yo2EventManager.cpp: CEventPlayer (script lookup, base element) and CFukiDictionary (fuki_index.csv).
#include <cstring>

#include "Game/yo2EventManager.h"
#include "game_test.h"

static void eventPlayer() {
    CTask* root = CTask::createRoot();
    CElement* world = CElement::newChild(root, 10);
    CEventPlayer* p = CEventPlayer::create(root, world);   // TM_INIT -> onInit
    CHECK(p && p->taskName() == "CEventPlayer");
    CHECK(p->baseParent_ == nullptr && p->baseElm_);
    CElement* base = p->baseElm_.get();
    CHECK(base->parent() == world && base->instName() == "CEventPlayer::m_pBaseElm");
    CHECK(base->priority() == 10000 && base->pos_.x == 0 && base->pos_.y == 0 && base->pos_.z == 0);
    CHECK(p->state_ == CEventPlayer::IDLE && p->event_ == 1 && p->stepStart_ && !p->hasTimeout_);

    p->stepStart_ = false;
    p->start(4, 77, "Jaden", 0);
    CHECK(p->state_ == CEventPlayer::PLAYING && p->event_ == 4 && p->step_ == 19 && p->stepStart_);
    CHECK(p->number_ == 77 && p->name_ == "Jaden" && p->timeout_ == 0 && !p->hasTimeout_);
    CHECK(!p->stepLeftEvent());
    p->step_ = 35;   // event 5's first step
    CHECK(p->stepLeftEvent());
    p->start(6, 0, "", 300);
    CHECK(p->step_ == 39 && p->timeout_ == 300 && p->hasTimeout_ && p->name_.empty());
    p->start(1, 0, "", 0);
    CHECK(p->step_ == 0 && g_eventScript[p->step_].command == EventStep::SPAWN_NPC);

    CHECK(CEventPlayer::npcNameText(0) == 8001 && CEventPlayer::npcNameText(1) == 8014);
    CHECK(CEventPlayer::npcNameText(2) == 8041 && CEventPlayer::npcNameText(3) == 8005);
    CHECK(CEventPlayer::npcNameText(4) == 8005 && CEventPlayer::npcNameText(6) == 8050);
    CHECK(CEventPlayer::npcNameText(7) == 8066);

    // destroying the player takes the base element (a child of `world`, not of the player) with it
    p->destroy(__FILE__, __LINE__);
    CHECK(!base->alive() && world->children().empty());
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
}

static void scriptShape() {
    // every event's steps are contiguous and every SPAWN_NPC scene ends with NPC_LEAVE
    int open = 0;
    for (int i = 0; i < EVENT_STEPS; i++) {
        const EventStep& s = g_eventScript[i];
        if (s.command == EventStep::SPAWN_NPC) CHECK(open++ == 0);
        if (s.command == EventStep::NPC_LEAVE) CHECK(--open == 0);
        if (s.command == EventStep::BALLOON) CHECK(open == 1 && s.arg >= 8205 && s.arg <= 8345 && s.arg % 5 == 0);
        if (i) CHECK(s.event >= g_eventScript[i - 1].event);
    }
    CHECK(open == 0);
}

static void fukiFixture() {
    std::string s = "// header\r\n\r\n";
    s += "7,100,101,0\r\n7,2,0,4\r\n";          // NPC 7: three lines
    s += "9,200\r\n// dropped style line\r\n";   // NPC 9's style line is a comment: NPC 9 is dropped...
    s += "11,300,301\r\n11,1,1\r\n";             // ...and NPC 11 takes its slot
    std::string full = "5";
    for (int i = 1; i <= 84; i++) full += "," + std::to_string(1000 + i);
    s += full + "\r\n5";
    for (int i = 1; i <= 84; i++) s += "," + std::to_string(i % 5);
    s += "\r\n12,1\r\n";                         // a text line with no style line at the end of the file: not counted
    fixtureFiles()["data/Avatar/npc/fuki_index.csv"] = s;
    CFukiDictionary d;
    CHECK(d.load() && d.count_ == 3);
    CHECK(d.text(7, 0) == 100 && d.text(7, 1) == 101 && d.text(7, 2) == 0);
    CHECK(d.style(7, 0) == 2 && d.style(7, 1) == 0 && d.style(7, 2) == 4);
    CHECK(d.text(9, 0) == -1 && d.style(9, 0) == 0);   // unknown NPC
    CHECK(d.text(11, 1) == 301 && d.style(11, 1) == 1);
    CHECK(d.text(5, 0) == 1001 && d.text(5, 83) == 1084 && d.style(5, 83) == 84 % 5);
    CHECK(d.entries_[3].npc == 12 && d.entries_[3].text[0] == 1);   // parsed, then left uncounted
    CHECK(d.unused(7, 0) == 0);
    fixtureFiles().erase("data/Avatar/npc/fuki_index.csv");
    CHECK(!d.load());   // no file: readLine says "nothing read"
}

static void fukiReal() {
    if (!mergeDat()) {
        std::printf("world_event_test: real fuki_index.csv skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    gameSetFileProvider(mergeProvider);
    CTask* root = CTask::createRoot();
    CFukiDictionary* d = CFukiDictionary::create(root);
    CHECK(d && d->count_ == 98);
    for (int i = 0; i < 98; i++) CHECK(d->entries_[i].npc == i + 1);
    CHECK(d->text(1, 0) == 12760 && d->text(1, 1) == 12765 && d->text(1, 2) == 0 && d->text(1, 83) == 13060);
    CHECK(d->style(1, 0) == 2 && d->style(1, 5) == 2 && d->style(1, 1) == 0);
    CHECK(d->text(98, 0) == 30115 && d->style(98, 0) == 1 && d->style(98, 3) == 0);
    CHECK(d->text(99, 0) == -1);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    gameSetFileProvider(fixtureProvider);
    std::printf("world_event_test: real fuki_index.csv ok (98 NPCs)\n");
}

int main() {
    gameSetFileProvider(fixtureProvider);
    eventPlayer();
    scriptShape();
    fukiFixture();
    fukiReal();
    std::printf("world_event_test ok\n");
}
