#include "Game/yo2EventManager.h"

#include <cstdlib>
#include <cstring>

#include "Game/yo2GameData.h"
#include "System/yo2Debug.h"

// DAT_00d2c860: events 1..5 spawn an NPC, show one balloon and send it off; event 4 has three such scenes.
const EventStep g_eventScript[EVENT_STEPS] = {
    {1, 0, 2}, {1, 2, 8205}, {1, 2, 8210}, {1, 2, 8215}, {1, 2, 8220}, {1, 1, 0},
    {2, 0, 2}, {2, 2, 8275}, {2, 2, 8280}, {2, 2, 8285}, {2, 2, 8290}, {2, 2, 8295}, {2, 1, 0},
    {3, 0, 2}, {3, 2, 8225}, {3, 2, 8230}, {3, 2, 8235}, {3, 2, 8240}, {3, 1, 0},
    {4, 0, 2}, {4, 2, 8300}, {4, 2, 8305}, {4, 2, 8310}, {4, 1, 0},
    {4, 0, 4}, {4, 2, 8330}, {4, 2, 8335}, {4, 2, 8340}, {4, 2, 8345}, {4, 1, 0},
    {4, 0, 2}, {4, 2, 8315}, {4, 2, 8320}, {4, 2, 8325}, {4, 1, 0},
    {5, 0, 2}, {5, 2, 8265}, {5, 2, 8270}, {5, 1, 0},
    {6, 4, 0},
};

// ---- CEventPlayer ----

CEventPlayer::CEventPlayer() {
    baseElm_.setUser(this);
    setTaskName("CEventPlayer");
    npc_.setUser(this);
    balloon_.setUser(this);
}

// @yo2 0x00a4c5a0 CEventPlayer::create (constructor inlined; baseParent kept for onInit; priority 10000)
CEventPlayer* CEventPlayer::create(CTask* parent, CTask* baseParent) {
    auto* p = new CEventPlayer;
    p->baseParent_ = baseParent;
    return dynamic_cast<CEventPlayer*>(p->CTask::create(parent, 10000));
}

// @yo2 0x00a4c8a0 CEventPlayer::~CEventPlayer
// @yo2 0x00a4c870 CEventPlayer deleting destructor
CEventPlayer::~CEventPlayer() = default;

// @yo2 0x00a4c990 CEventPlayer::start: play `event` from its first step; name/number fill the balloons' @@s/@@d;
// timeout (frames, 0 = none) cuts the event short
void CEventPlayer::start(int32_t event, int32_t number, const vc6::string& name, int32_t timeout) {
    event_ = event;
    state_ = PLAYING;
    name_ = name;
    number_ = number;
    timeout_ = timeout;
    hasTimeout_ = timeout != 0;
    for (step_ = 0; step_ < EVENT_STEPS; step_++)
        if (g_eventScript[step_].event == event_)
            break;
    YO2_ASSERT(step_ < EVENT_STEPS, "データエラー");   // "data error": no such event
    stepStart_ = true;
}

// @yo2 0x00a4cbe0 CEventPlayer::onInit: the base element under baseParent_, at the origin
bool CEventPlayer::onInit() {
    baseElm_.set(CElement::newChild(baseParent_, 10000));
    if (!dynamic_cast<CElement*>(baseElm_.task()))
        return false;
    baseElm_.get()->setInstName("CEventPlayer::m_pBaseElm");
    baseElm_.get()->pos_ = Vec3{};
    baseParent_ = nullptr;
    return true;
}

// @yo2 0x00a4ecd0 CEventPlayer::onDestroy: the base element (and with it the NPC and the balloon) goes too
void CEventPlayer::onDestroy() {
    if (dynamic_cast<CElement*>(baseElm_.task()))
        baseElm_.get()->destroy(__FILE__, __LINE__);
}

// @yo2 0x00a4ed20 CEventPlayer::stepLeftEvent: the current step belongs to another event (the script is over)
bool CEventPlayer::stepLeftEvent() const { return g_eventScript[step_].event != event_; }

// @yo2 0x00a4ed50 CEventPlayer::npcNameText: text id of an event NPC's name (asserts for kinds without one)
int32_t CEventPlayer::npcNameText(int32_t npcKind) {
    switch (npcKind) {
    case 0: return 8001;
    case 1: return 8014;
    case 2: return 8041;
    case 3:
    case 4: return 8005;
    case 6: return 8050;
    case 7: return 8066;
    }
    YO2_ASSERT(false, "Need NameData!");
    return 0;
}

// ---- CFukiDictionary ----

// @yo2 0x00a4ef80 CFukiDictionary::create (new, zeroed table, CTask::create at priority 10000)
CFukiDictionary* CFukiDictionary::create(CTask* parent) {
    return dynamic_cast<CFukiDictionary*>((new CFukiDictionary)->CTask::create(parent, 10000));
}

// @yo2 0x00a4f0a0 CFukiDictionary::~CFukiDictionary
// @yo2 0x00a4f070 CFukiDictionary deleting destructor
CFukiDictionary::~CFukiDictionary() = default;

// @yo2 0x00a4f0c0 CFukiDictionary::onInit
bool CFukiDictionary::onInit() {
    if (load())
        return true;
    YO2_ASSERT(false, "Fuki_DATA MakeError!");
    return false;
}

static bool isDataLine(const char* line) { return line[0] != '\0' && !(line[0] == '/' && line[1] == '/'); }

// @yo2 0x00a4f230 CFukiDictionary::load: data/Avatar/npc/fuki_index.csv, two lines per NPC (texts, then styles).
// A text line whose style line is empty or a comment is dropped (the next NPC overwrites it).
bool CFukiDictionary::load() {
    GameFile file;
    file.read("data/Avatar/npc/fuki_index.csv");   // unchecked, like the exe: readLine then says 3 (error)
    count_ = 0;
    char line[0x400];
    for (;;) {
        int32_t r = file.readLine(line, sizeof line);
        if (r == 1)
            break;
        if (r != 0)
            return false;
        if (!isDataLine(line))
            continue;
        // The exe writes past entries_ (into count_) on a 121st NPC before its assert fires; stop here instead.
        YO2_ASSERT(count_ < COUNT, "FUKI_DATA MAX LOW OVER");
        FukiEntry& e = entries_[count_];
        int col = 0;
        for (char* tok = std::strtok(line, ",\n"); tok; tok = std::strtok(nullptr, ",\n"), col++) {
            YO2_ASSERT(col <= FukiEntry::LINES, "FUKI_DATA MAX COLUM OVER");
            (col == 0 ? e.npc : e.text[col - 1]) = std::atoi(tok);
        }
        r = file.readLine(line, sizeof line);
        if (r == 1)
            break;
        if (r != 0)
            return false;
        if (!isDataLine(line))
            continue;
        col = 0;
        for (char* tok = std::strtok(line, ",\n"); tok; tok = std::strtok(nullptr, ",\n"), col++) {
            YO2_ASSERT(col <= FukiEntry::LINES, "FUKI_DATA MAX COLUM OVER");
            if (col != 0)   // the style line repeats the NPC id in column 0
                e.style[col - 1] = std::atoi(tok);
        }
        YO2_ASSERT(count_ <= COUNT - 1, "FUKI_DATA MAX LOW OVER");
        count_++;
    }
    yo2Trace("フキダシデータ生成。総数=[%d]個\n", count_);
    return true;
}

// @yo2 0x00a4f950 CFukiDictionary::text: text id of an NPC's balloon line, -1 for an unknown NPC
int32_t CFukiDictionary::text(int32_t npc, int32_t line) const {
    for (int32_t i = 0; i < count_; i++)
        if (entries_[i].npc == npc)
            return entries_[i].text[line];
    return -1;
}

// @yo2 0x00a4f9e0 CFukiDictionary::style: the balloon style of an NPC's line, 0 for an unknown NPC
int32_t CFukiDictionary::style(int32_t npc, int32_t line) const {
    for (int32_t i = 0; i < count_; i++)
        if (entries_[i].npc == npc)
            return entries_[i].style[line];
    return 0;
}
