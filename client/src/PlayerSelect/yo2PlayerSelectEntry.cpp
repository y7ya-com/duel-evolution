#include "yo2PlayerSelectEntry.h"

#include "Deck/DeckManager.h"
#include "Net/NetLobby_Social.h"
#include "Net/NetTasks.h"
#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"
#include "duel/CardDB.h"
#include "duel/EngineInternal.h"
#include "playerSelectExt.h"
#include "yo2PlayerSelect.h"

struct CPlayerSelectScene::Layout {
    YO2_AT(CPlayerSelectScene, state_, 0x80);
    YO2_AT(CPlayerSelectScene, bg_, 0x84);
    YO2_AT(CPlayerSelectScene, slot_, 0x90);
    YO2_AT(CPlayerSelectScene, newCharacter_, 0x94);
    YO2_AT(CPlayerSelectScene, window_, 0x98);
    YO2_AT(CPlayerSelectScene, account_, 0xa4);
    YO2_AT(CPlayerSelectScene, duelpass_, 0xb0);
    YO2_AT(CPlayerSelectScene, lobby_, 0xbc);
    YO2_AT(CPlayerSelectScene, box_, 0xc8);
    YO2_AT(CPlayerSelectScene, deck_, 0xcc);
};

CPlayerSelectScene* CPlayerSelectScene::s_instance;

namespace {
constexpr int32_t BG_PLAYER_SELECT = 0x29;
constexpr int32_t TRUNK_CARDS = 0xcb8;
constexpr int32_t STARTER_MAIN = 40;

// The fields of the two System objects this file's inline members touch.
struct PlayerDataFields {
    uint8_t _00[0x38];
    vc6::string deckFile;   // 0x38
};
YO2_AT(PlayerDataFields, deckFile, 0x38);
struct CardBoxFields {
    uint32_t vtbl;
    int32_t total;                  // 0x04 copies of every card together
    uint8_t _08;
    struct { uint8_t copies, b1, b2; } card[0x1000];   // 0x09 + 3 * id (id 0 unused)
    uint8_t _3009[0x301c - 0x3009];
    vc6::string dir;                // 0x301c
};
YO2_AT(CardBoxFields, total, 0x04);
YO2_AT(CardBoxFields, card, 0x09);
YO2_AT(CardBoxFields, dir, 0x301c);
YO2_SIZEOF(CardBoxFields, 0x302c);
CardBoxFields* fields(CCardBox* b) { return reinterpret_cast<CardBoxFields*>(b); }
const CardBoxFields* fields(const CCardBox* b) { return reinterpret_cast<const CardBoxFields*>(b); }
}  // namespace

// TODO(System): the player data manager (DAT_012714c4).
extern CPlayerDataManager* g_playerData;
// @yo2 0x00814f40 CPlayerDataManager::getInstance (inlined copy)
CPlayerDataManager* playerData() { return g_playerData; }
// @yo2 0x00815110 CPlayerDataManager::deckFile (inlined copy): a copy of +0x38
vc6::string playerDataDeckFile(const CPlayerDataManager* p) { return reinterpret_cast<const PlayerDataFields*>(p)->deckFile; }
// @yo2 0x00814f60 CPlayerDataManager::setDeckFile (inlined copy)
void playerDataSetDeckFile(CPlayerDataManager* p, vc6::string file) { reinterpret_cast<PlayerDataFields*>(p)->deckFile = file; }

// @yo2 0x00815320 CCardBox::clear (inlined copy): no copies of ids 1..0x1000, total 0
void cardBoxClear(CCardBox* box) {
    for (int id = 1; id <= 0x1000; id++)
        reinterpret_cast<uint8_t*>(box)[9 + id * 3] = 0;   // (id 0x1000 is the byte past the table)
    fields(box)->total = 0;
}
// @yo2 0x00815290 CCardBox::add (inlined copy): copies stop at 255, the total counts what was added
void cardBoxAdd(CCardBox* box, uint16_t id, uint8_t n) {
    uint8_t& c = fields(box)->card[id].copies;
    if (c + n > 0xff) {
        fields(box)->total += 0xff - c;
        c = 0xff;
        return;
    }
    c = static_cast<uint8_t>(c + n);
    fields(box)->total += n;
}
// @yo2 0x00815350 CCardBox::setDir (inlined copy)
void cardBoxSetDir(CCardBox* box, vc6::string dir) { fields(box)->dir = dir; }
uint8_t cardBoxCopies(const CCardBox* box, uint16_t id) { return fields(box)->card[id].copies; }

// @yo2 0x00815970 avatarIsOwned
bool avatarIsOwned(const CAvatarData* avatar, const CPlayerBinData* bin) {
    const uint8_t* b = avatar->bytes_;
    const uint32_t base = b[0] ? 0x100 : 0;   // the female parts' PBIN bits follow the male ones
    for (int i = 0; i < 16; i++) {
        const uint32_t bit = b[i] + base;
        if (i == 0) {
            if (b[i] > 1)
                return false;
        } else if (i <= 8) {
            if (!bin->flag(bit))
                return false;
        } else if (i == 9) {
            if (b[i] && !bin->flag(bit))
                return false;
        } else if (i >= 13) {
            if (b[i] >= 7)
                return false;
        }
    }
    return true;
}

// @yo2 0x008106e0 CPlayerSelectScene::New (yo2PlayerSelectEntry.h; the constructor is inlined into it)
CPlayerSelectScene::CPlayerSelectScene() {
    bg_.setUser(this);
    window_.setUser(this);
    account_.setUser(this);
    duelpass_.setUser(this);
    setTaskName("CPlayerSelectScene");
}
// @yo2 0x008109b0 CPlayerSelectScene::~CPlayerSelectScene
// @yo2 0x00810980 CPlayerSelectScene deleting destructor
CPlayerSelectScene::~CPlayerSelectScene() = default;

// @yo2 0x00815680 CPlayerSelectScene::Receive (just CEasyTask's)
int32_t CPlayerSelectScene::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x00810ac0 CPlayerSelectScene::onInit: background, the window over the account's characters, the account task
bool CPlayerSelectScene::onInit() {
    s_instance = this;
    state_ = START;
    createBaseElement("CPlayerSelectScene:ベースエレメント");
    bg_.set(bgCommonNew(this, baseElement(), BG_PLAYER_SELECT, 0));
    bg_.get()->setInstName("コモンBG");
    slot_ = 0;
    window_.set(CWindowPlayerSelect::create(baseElement(), &appNetAccount()->me, 448, 256));
    window_.get()->setInstName("プレイヤ選択ウインドウ");
    account_.set(CNetAccountTask::spawn(this, baseElement()));
    account_.get()->setInstName("アカウント作業タスク");
    return true;
}

// @yo2 0x008156a0 CPlayerSelectScene::select: the picked character becomes the active one; its folder, its friend
// and black lists
void CPlayerSelectScene::select() {
    appNetAccount()->me.activeSlot = static_cast<uint8_t>(slot_);
    CPlayerInfo* p = window_.get()->player(slot_);
    playerDataSetPlayer(playerData(), playerNameString(*p).c_str());
    playerDataSave(playerData());
    fblistInit();
    gameWorldSyncLists();
}

// The deck the player starts with: from card id 1 up, every copy the box has (as many as the limit list allows) until
// 40 cards were offered to the main deck; fusions go to the extra deck.
void CPlayerSelectScene::buildStarterDeck() {
    const uint8_t* box = reinterpret_cast<const uint8_t*>(box_);
    int32_t main = 0;
    for (int32_t id = 1; id <= 0x1000; id++) {
        int32_t n = cardBoxCopies(box_, static_cast<uint16_t>(id));
        const int32_t limit = engCardLimit(cardPropId(id));
        if (limit < n)
            n = limit;
        for (; n > 0; n--) {
            const int32_t kind = cardKind(cardPropId(id));
            if (kind == 2 || kind == 3) {
                deck_->addExtra(static_cast<uint16_t>(id), box);
            } else {
                deck_->addMain(static_cast<uint16_t>(id), box);
                main++;
            }
        }
        if (main >= STARTER_MAIN)
            break;
    }
    deck_->save();
}

// The trunk arrived: refill the card box from it, then open the player's deck file. With no deck file name a starter
// deck is built ("deck.ydc"); a file that won't load falls back to deck.ydc, then to a starter deck. The deck's lists
// go through the rule check.
void CPlayerSelectScene::loadCardsAndDeck() {
    box_ = cardBox();
    cardBoxClear(box_);
    cardBoxSetDir(box_, playerDataDir(playerData()));
    const CMyUser& me = appNetAccount()->me;
    for (int32_t i = 0; i < TRUNK_CARDS; i++)
        cardBoxAdd(box_, static_cast<uint16_t>(i + 1), me.trunk[i]);
    cardBoxSave(box_);

    deck_ = g_deckManager;
    deck_->clear();
    deck_->setDirectory(playerDataDir(playerData()));
    const vc6::string file = playerDataDeckFile(playerData());
    bool fresh = file.empty();
    if (!fresh) {
        deck_->setFileName(file);
        if (!deck_->load()) {
            deck_->setFileName("deck.ydc");   // (0x00815500 makes the name)
            fresh = !deck_->load();
        }
    }
    if (fresh) {
        playerDataSetDeckFile(playerData(), "deck.ydc");
        playerDataSave(playerData());
        deck_->setFileName(playerDataDeckFile(playerData()));
        buildStarterDeck();
    }

    CDeckRuleCheck check;
    check.clear();
    const uint16_t* main = deck_->mainList();
    for (int i = 0; i < deck_->mainSize(); i++)
        check.addMain(main[i]);
    const uint16_t* side = deck_->sideList();
    for (int i = 0; i < deck_->sideSize(); i++)
        check.addSide(side[i]);
    const uint16_t* extra = deck_->extraList();
    for (int i = 0; i < deck_->extraSize(); i++)
        check.addExtra(extra[i]);
}

// @yo2 0x00811210 CPlayerSelectScene::onMain
bool CPlayerSelectScene::onMain() {
    switch (state_) {
    case START:
        state_ = DUELPASS;
        break;
    case DUELPASS:
        duelpass_.set(CNetAccountTaskReqDuellpass150::spawn(this));
        duelpass_.get()->setInstName("DUELPASS150購入種別取得タスク");
        state_ = WAIT_DUELPASS;
        break;
    case WAIT_DUELPASS:
        if (duelpass_.get()->state == CNetAccountTaskReqDuellpass150::DONE)
            state_ = SHOW;
        break;
    case SHOW:
        state_ = WAIT_INPUT;
        newCharacter_ = false;
        break;
    case WAIT_INPUT: {
        CWindowPlayerSelect* w = window_.get();
        w->setBusy(false);
        const int32_t r = w->result();   // "[%d]ボタン押された"
        if (r >= 0 && r < CWindowPlayerSelect::SLOTS) {
            slot_ = r;
            if (!w->player(slot_)->valid) {   // "プレイヤ作成要求"
                account_.get()->createCharacter(slot_);
                state_ = WAIT_CREATE;
                w->setBusy(true);
            } else {
                select();
                w->setBusy(true);
                state_ = TRUNK;
            }
        } else if (r >= CWindowPlayerSelect::RESULT_DELETE && r < CWindowPlayerSelect::RESULT_DELETE + 4) {
            slot_ = r - CWindowPlayerSelect::RESULT_DELETE;
            playerDataSetPlayer(playerData(), playerNameString(*w->player(slot_)).c_str());
            account_.get()->deleteCharacter(slot_);
            w->setBusy(true);
            state_ = WAIT_DELETE;
        } else if (r == CWindowPlayerSelect::RESULT_BACK) {
            account_.get()->hangUp();
            state_ = WAIT_HANGUP;
        }
        w->resetResult();
        break;
    }
    case TRUNK:
        account_.get()->requestTrunk();
        state_ = WAIT_TRUNK;
        break;
    case WAIT_TRUNK:
        switch (account_.get()->busy) {
        case CNetAccountTask::BUSY_FAILED:   // "かばん取得時にエラー発生"
            YO2_ASSERT(false, "かばん取得時にエラー発生\n");
            break;
        case CNetAccountTask::BUSY_DONE:
            loadCardsAndDeck();
            state_ = PBIN;
            break;
        default:
            break;
        }
        break;
    case PBIN:
        account_.get()->requestPbin(appNetAccount()->me.activeSlot);
        state_ = WAIT_PBIN;
        break;
    case WAIT_PBIN: {
        const int32_t busy = account_.get()->busy;
        if (busy == CNetAccountTask::BUSY_FAILED) {
            YO2_ASSERT(false, "プレイヤバイナリ取得時にエラー発生\n");
        } else if (busy == CNetAccountTask::BUSY_DONE) {
            // Avatars wearing parts the PBIN doesn't grant go back to the default ("アバターデータが不正")
            CNetAccount* acc = appNetAccount();
            for (int world = 0; world < 2; world++) {
                CAvatarData* a = &acc->me.player(acc->me.activeSlot)->avatar[world];
                if (!avatarIsOwned(a, &acc->bin)) {
                    *a = CAvatarData();   // the male DM default
                }
            }
            state_ = LEAVE;
        }
        break;
    }
    case WAIT_CREATE:
        switch (account_.get()->busy) {
        case CNetAccountTask::BUSY_FAILED:   // "プレイヤ作成時にエラー発生"
            state_ = SHOW;
            break;
        case CNetAccountTask::BUSY_DONE:
            select();
            newCharacter_ = true;
            state_ = TRUNK;
            break;
        default:
            break;
        }
        break;
    case WAIT_DELETE:
        switch (account_.get()->busy) {
        case CNetAccountTask::BUSY_FAILED:
            state_ = SHOW;
            break;
        case CNetAccountTask::BUSY_DONE:
            state_ = LIST;
            break;
        default:
            break;
        }
        break;
    case LIST:
        account_.get()->requestPlayerList();
        state_ = WAIT_LIST;
        break;
    case WAIT_LIST:
        switch (account_.get()->busy) {
        case CNetAccountTask::BUSY_FAILED:
            YO2_ASSERT(false, "PLIST_WAIT ERROR! ");
            state_ = SHOW;
            break;
        case CNetAccountTask::BUSY_DONE:
            window_.get()->refresh();
            state_ = SHOW;
            break;
        default:
            break;
        }
        break;
    case WAIT_HANGUP: {
        const int32_t busy = account_.get()->busy;
        if (busy == CNetAccountTask::BUSY_WORKING)
            break;
        YO2_ASSERT(busy != CNetAccountTask::BUSY_FAILED, "アカウント切断時にエラー発生\n");
        if (busy == CNetAccountTask::BUSY_DONE)
            CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
        break;
    }
    case LEAVE:
        YO2_ASSERT(lobby_.task() == nullptr, "netLobby ERROR");
        account_.get()->bye();
        if (newCharacter_)
            CSceneMng::instance()->push(SCENE_CHANGE_AVATAR, CSceneMng::FADE_WAIT, true);
        else
            gameWorldEnterMyRoom();
        state_ = DONE;
        break;
    default:
        break;
    }
    return true;
}

// @yo2 0x00815610 CPlayerSelectScene::onDestroy: the base element goes (the window with it)
void CPlayerSelectScene::onDestroy() {
    if (CElement* base = baseElement())
        base->destroy(__FILE__, 0x1e5);
    s_instance = nullptr;
}
