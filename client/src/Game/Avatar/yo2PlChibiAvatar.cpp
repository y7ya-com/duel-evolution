#include "Game/Avatar/yo2PlChibiAvatar.h"

#include "System/yo2Debug.h"

// Where the labels and flags sit relative to the elm (and their z, in front of everything on the map).
static constexpr float kLabelZ = 31729.0f;

// @yo2 0x009ddc90 CPlChibiAvatar::create: onInit will put the elm under `elmParent`, wearing `avatar`
CPlChibiAvatar* CPlChibiAvatar::create(CTask* parent, CTask* elmParent, const uint8_t* avatar) {
    auto* a = new CPlChibiAvatar;
    a->elmParent_ = elmParent;
    a->initAvatar_ = avatar;
    return dynamic_cast<CPlChibiAvatar*>(a->CTask::create(parent, 10000));
}

// @yo2 0x009df6e0 CPlChibiAvatar::CPlChibiAvatar
CPlChibiAvatar::CPlChibiAvatar() {
    setTaskName("CPlChibiAvatar");
}

// @yo2 0x009df8b0 CPlChibiAvatar::~CPlChibiAvatar
// @yo2 0x009df860 CPlChibiAvatar deleting destructor
CPlChibiAvatar::~CPlChibiAvatar() = default;

// A child element of the elm that follows it (world = local * elm's) and keeps its own z.
template <class T>
static void attach(T* e, const char* instName, float x, float y) {
    e->setInstName(instName);
    e->inheritTransform_ = true;
    e->keepLocalZ_ = true;
    e->pos_ = {x, y, kLabelZ};
}

// @yo2 0x009df9a0 CPlChibiAvatar::onInit: the elm, then on it the country flag, the name and team labels, the
// team flag and the stars
bool CPlChibiAvatar::onInit() {
    createElm(elmParent_, initAvatar_);
    elmParent_ = nullptr;

    nationFlag_.setUser(this);
    nationFlag_.set(CNationFlag::create(elm(), 10000));
    YO2_ASSERT(nationFlag_.task() != nullptr, "error CChibiAvatar::m_pNationFlag::Create()");
    attach(nationFlag_.get(), "国旗", -25.0f, -130.0f);   // "national flag"

    nameLabel_.setUser(this);
    nameLabel_.set(CTextElm::create(elm(), 10000));
    attach(nameLabel_.get(), "名前ラベル", 0.0f, -130.0f);   // "name label"

    label2_.setUser(this);
    label2_.set(CTextElm::create(elm(), 10000));
    attach(label2_.get(), "チーム名ラベル", 0.0f, -146.0f);   // "team name label"

    teamFlag_.setUser(this);
    teamFlag_.set(CTeamFlag::create(elm(), 10000));
    YO2_ASSERT(dynamic_cast<CTeamFlag*>(teamFlag_.task()) != nullptr, "error CChibiAvatar::m_pTeamFlag::Create()");
    attach(teamFlag_.get(), "チーム旗", -25.0f, -155.0f);   // "team flag"

    star_.setUser(this);
    star_.set(CNpcStar::create(elm(), 10000, 1));
    YO2_ASSERT(dynamic_cast<CNpcStar*>(star_.task()) != nullptr, "error CChibiAvatar::m_pStar::Create()");
    attach(star_.get(), "スター", -25.0f, -114.0f);   // "star"
    return true;
}

// @yo2 0x009ddd60 CPlChibiAvatar::reset: no player; the placeholder flag ("AL", the table's first row), no stars
void CPlChibiAvatar::reset() {
    CChibiAvatar::reset();
    kind_ = KIND_PLAYER;
    hasData_ = false;
    pid_ = 0;
    nationFlag_.get()->setNation("AL", CNationFlag::SMALL);
    star_.get()->setStars(0, 0);
}

// @yo2 0x009de190 CPlChibiAvatar::setup: REQUESTED -> LOADING, or with `instant` every part built now -> LOADED
void CPlChibiAvatar::setup(bool instant) {
    YO2_ASSERT(states_.allows(state_, ChibiStateTable::SETUP), "error CPlChibiAvatar state[%d]", state_);
    YO2_ASSERT(hasData_, "error CPlChibiAvatar no data");
    if (texturesRequested_) {
        elm()->releaseTextures();
        texturesRequested_ = false;
    }
    if (!instant) {
        state_ = LOADING;
    } else {
        elm()->createAllParts();
        state_ = LOADED;
    }
}

// The team label ("@0" + team name) and the instance names. The exe names the task and its elm "pid[team name]"
// here, after setPlayer has just named them "pid[player name]".
void CPlChibiAvatar::setTeamLabel(const CPlayerInfo& player) {
    std::string team = playerTeamName(player);
    label2_.get()->setText(sjisToUtf16("@0" + team));
    setInstName(yo2Format("%d[%s]", playerPid(player), team.c_str()));
    elm()->setInstName(yo2Format("%d[%s]Elm", playerPid(player), team.c_str()));
}

// @yo2 0x009de490 CPlChibiAvatar::setPlayer: everything shown about `player`, and the parts of its avatar in the
// lobby's world
void CPlChibiAvatar::setPlayer(const CPlayerInfo& player) {
    std::string name = playerNameString(player);
    nameLabel_.get()->setText(sjisToUtf16("@0" + name));
    setInstName(yo2Format("%d[%s]", playerPid(player), name.c_str()));
    elm()->setInstName(yo2Format("%d[%s]Elm", playerPid(player), name.c_str()));
    setTeamLabel(player);
    teamFlag_.get()->setTeam(playerTeamId(player), playerTeamCode(player));
    nationFlag_.get()->setNation(playerCountry(player).c_str(), CNationFlag::SMALL);
    setNameColor(playerState(player));
    pid_ = playerPid(player);
    elm()->setPlayerParts(playerAvatar(player, g_lobbyWorld));
    hasData_ = true;
}

// @yo2 0x009dee10 CPlChibiAvatar::setTeam: the team label and flag only
void CPlChibiAvatar::setTeam(const CPlayerInfo& player) {
    setTeamLabel(player);
    teamFlag_.get()->setTeam(playerTeamId(player), playerTeamCode(player));
}

// @yo2 0x009df3d0 CPlChibiAvatar::setNameColor: the name label's "@n" colour prefix from the lobby state
void CPlChibiAvatar::setNameColor(int32_t state) {
    const std::u16string& old = name();
    std::u16string text = u"@";
    for (char c : std::to_string(playerStateColor(state)))
        text += static_cast<char16_t>(c);
    text += old.size() >= 2 ? old.substr(2) : std::u16string();   // drop the old "@n"
    nameLabel_.get()->setText(text);
}

// @yo2 0x009e0bc0 CPlChibiAvatar::onShown: hidden off screen, the fade stepped (a finished fade-out hides it for
// good), and the stars from the player's lobby record, by room kind
void CPlChibiAvatar::onShown() {
    elm()->setDisp(onScreen(), true);
    effect_.update();
    if (effect_.mode_ == 2 && effect_.done_)
        hide(true);
    const CPlayerInfo* p = lobbyFindPlayer(pid_);
    if (!p)
        return;
    uint32_t stars = playerStars(*p);
    uint32_t big, small = 0;
    switch (lobbyRoomKind()) {
    case 7:
    case 15:
        big = stars < 7 ? stars : 7;
        break;
    case 9:
    case 16:
        big = stars < 5 ? stars : 5;
        break;
    case 10:
    case 17:
    case 20:
        big = stars / 10 < 5 ? stars / 10 : 5;
        small = stars % 10;
        if (stars > 50)
            small = 0;
        break;
    default:
        return;
    }
    star_.get()->setStars(static_cast<int32_t>(big), static_cast<int32_t>(small));
}
