#include "Game/yo2TgtAvaListDlg.h"

// DAT_00bf3f48
const GameCtrlInfo g_gameCtrlInfo[CTRL_COUNT] = {
    {1, 0, "CTRL_NONE"},           {1, 1000, "CTRL_SELECT_LOBBY"},  {1, 1000, "CTRL_MAIN_MENU"},
    {1, 2000, "CTRL_MY_PROFILE"},  {1, 2000, "CTRL_COMMENT_SETTING"}, {1, 2000, "CTRL_TITLE_SETTING"},
    {1, 2000, "CTRL_D_MAIL"},      {1, 2000, "CTRL_DUEL_SETTING"},  {1, 2000, "CTRL_BLACKLIST"},
    {1, 2000, "CTRL_FRIENDLIST"},  {1, 2000, "CTRL_TEAMLIST"},      {1, 2000, "CTRL_DUELLOG"},
    {1, 2000, "CTRL_DUEL_BUSY"},   {1, 2000, "CTRL_USE_DUELPASS"},  {1, 2000, "CTRL_REARRENGE_DISK"},
    {1, 500, "CTRL_ABOUTEVENT"},   {1, 1000, "CTRL_DUEL_MENU"},     {1, 1000, "CTRL_MOVE_MENU"},
    {1, 1000, "CTRL_MOVE_MENU"},   {2, 500, "CTRL_PLAYER_INFO"},    {1, 3000, "CTRL_NPC_DUEL"},
    {2, 500, "CTRL_AVATAR_LIST"},  {1, 2000, "CTRL_TRADE_OFFER"},   {1, 2000, "CTRL_TRADE_REPLY"},
    {1, 1000, "CTRL_PRESENT_GET"}, {1, 5000, "CTRL_ERROR"},
};

// @yo2 0x00adaf50 GameCtrlInfo::has
bool GameCtrlInfo::has(uint32_t f) const { return (flags & f) == f; }

GameCtrl g_gameCtrl;

// @yo2 0x00adaf20 GameCtrl::GameCtrl
GameCtrl::GameCtrl() : now_(0) { reset(); }

// @yo2 0x00adaf00 GameCtrl::reset
void GameCtrl::reset() { now_ = CTRL_NONE; }

// @yo2 0x00adae50 GameCtrl::canEnter: may `ctrl` take over from the current mode?
bool GameCtrl::canEnter(int32_t ctrl) const {
    const GameCtrlInfo& cur = g_gameCtrlInfo[now_];
    const GameCtrlInfo& next = g_gameCtrlInfo[ctrl];
    if (cur.has(GameCtrlInfo::YIELD_TO_HIGHER) && next.priority > cur.priority)
        return true;
    return cur.has(GameCtrlInfo::YIELD_TO_EQUAL) && next.priority >= cur.priority;
}

// @yo2 0x00adaed0 GameCtrl::enter
bool GameCtrl::enter(int32_t ctrl) {
    if (!canEnter(ctrl))
        return false;
    now_ = ctrl;
    return true;
}

// @yo2 0x00adae20 GameCtrl::leave: back to CTRL_NONE if `ctrl` is the current mode
void GameCtrl::leave(int32_t ctrl) {
    if (now_ == ctrl)
        now_ = CTRL_NONE;
}

// @yo2 0x00ad9b90 CTgtAvaListDlg::CTgtAvaListDlg
CTgtAvaListDlg::CTgtAvaListDlg() {
    setTaskName("CTgtAvaListDlg");
    list_.setUser(this);
    avatarMng_.setUser(this);
    target_.setUser(this);
}

// @yo2 0x00ad9db0 CTgtAvaListDlg::~CTgtAvaListDlg
// @yo2 0x00ad9d60 CTgtAvaListDlg deleting destructor
CTgtAvaListDlg::~CTgtAvaListDlg() = default;
