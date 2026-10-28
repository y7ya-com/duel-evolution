// The lobby's one-request tasks (src\Net\yo2NetLobby_<Name>.cpp): each one sends a single lobby message and waits
// for its answer, the way CNetLobbyTask does for the rest. The lobby scenes (src/Lobby) spawn one each and poll
// busy: 0 idle (requests accepted), 1 working, 2 done, 3 failed, for one frame each before going back to 0.
#pragma once
#include "NetTasks.h"

// The four network objects every one of them keeps at 0x70 (onInit copies them from the app object).
struct CNetLobbyRequestBase : CEasyTask {
    enum Busy { BUSY_IDLE, BUSY_WORKING, BUSY_DONE, BUSY_FAILED };
    CNetGate* gate = nullptr;      // 0x70
    CNetAccount* acc = nullptr;    // 0x74
    CNetDuel* duel = nullptr;      // 0x78
    CNetLobby* lobby = nullptr;    // 0x7c

protected:
    void bind();
    // States 2-5 of every task here: 2 send, 3 wait for request byte f and take results[k] (0 = done), 4 failed,
    // 5 done; then back to 1 = idle.
    template <class Send>
    void request(int32_t& state, int32_t& busy, int32_t& result, int f, int k, Send send);
    // The answers the lobby scene waits for itself (request byte 0x1c+k answered): cleared, true.
    bool answered(int k, bool tradeCancel = false);
};

// CNetLobby_CreateRoom (0xb0): 0x4288 REQCREATEROOM, result 0x428a (results[0xe]).
class CNetLobby_CreateRoom : public CNetLobbyRequestBase {
public:
    static CNetLobby_CreateRoom* spawn(CTask* parent);   // FUN_006b1650
    CNetLobby_CreateRoom();                              // FUN_006b1710
    ~CNetLobby_CreateRoom() override;                    // FUN_006b1870
    bool onInit() override;                              // FUN_006b18f0
    bool onMain() override;                              // FUN_006b19b0
    void onDestroy() override;                           // FUN_006b1ce0
    // dstyle, wmode, mstat, the password (17 bytes, when locked), then three more bytes and a u32 (the NPC rival)
    bool createRoom(uint8_t dstyle, uint8_t wmode, uint8_t mstat, bool locked, const char* password, uint8_t d,
                    uint8_t e, uint8_t f, uint32_t rival);   // FUN_006b1bb0

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint32_t _8c = 0;
    uint8_t locked = 0;          // 0x90
    char password[17] = {};      // 0x91
    uint8_t dstyle = 3;          // 0xa2
    uint8_t wmode = 0;           // 0xa3
    uint8_t mstat = 1;           // 0xa4
    uint8_t d = 0, e = 0, f = 0; // 0xa5
    uint32_t rival = 0;          // 0xa8
    uint8_t _ac[4] = {};

private:
    struct Layout;
};
struct CNetLobby_CreateRoom::Layout {
    YO2_AT(CNetLobby_CreateRoom, lobby, 0x7c);
    YO2_AT(CNetLobby_CreateRoom, state, 0x80);
    YO2_AT(CNetLobby_CreateRoom, result, 0x88);
    YO2_AT(CNetLobby_CreateRoom, password, 0x91);
    YO2_AT(CNetLobby_CreateRoom, dstyle, 0xa2);
    YO2_AT(CNetLobby_CreateRoom, rival, 0xa8);
};
YO2_SIZEOF(CNetLobby_CreateRoom, 0xb0);

// CNetLobby_DeleteRoom (0xb0): 0x4290 REQDELETEROOM, result 0x4292 (results[0xf]); done = no room of mine.
class CNetLobby_DeleteRoom : public CNetLobbyRequestBase {
public:
    static CNetLobby_DeleteRoom* spawn(CTask* parent);   // FUN_006b2c80
    CNetLobby_DeleteRoom();                              // FUN_006b2d40
    ~CNetLobby_DeleteRoom() override;                    // FUN_006b2ea0
    bool onInit() override;                              // FUN_006b2f20
    bool onMain() override;                              // FUN_006b2fa0
    bool deleteRoom();                                   // FUN_006b31c0
    bool answered(int k);                                // 0x006b3130

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint8_t _8c[0x24] = {};

private:
    struct Layout;
};
struct CNetLobby_DeleteRoom::Layout {
    YO2_AT(CNetLobby_DeleteRoom, state, 0x80);
    YO2_AT(CNetLobby_DeleteRoom, result, 0x88);
};
YO2_SIZEOF(CNetLobby_DeleteRoom, 0xb0);

// CNetLobby_OfferCancel (0xa8): 0x4304 CANCELREQMATCH, result 0x4309 (results[0x13]).
class CNetLobby_OfferCancel : public CNetLobbyRequestBase {
public:
    static CNetLobby_OfferCancel* spawn(CTask* parent);   // FUN_006b5100
    CNetLobby_OfferCancel();                              // FUN_006b51c0
    ~CNetLobby_OfferCancel() override;                    // FUN_006b5350
    bool onInit() override;                               // FUN_006b5430
    bool onMain() override;                               // FUN_006b54b0
    bool cancel();                                        // FUN_006b5680
    bool answered(int k);                                 // 0x006b55f0

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint8_t _8c[8] = {};
    vc6::string unused;          // 0x94 never set
    uint8_t _a4[4] = {};

private:
    struct Layout;
};
struct CNetLobby_OfferCancel::Layout {
    YO2_AT(CNetLobby_OfferCancel, state, 0x80);
    YO2_AT(CNetLobby_OfferCancel, unused, 0x94);
};
YO2_SIZEOF(CNetLobby_OfferCancel, 0xa8);

// CNetLobby_OfferRoom (0xb0): challenge the player in a listed room, 0x4300 REQMATCH (room, password), result
// 0x4301 (results[0x10]) kept in matchResult. Fails at once (-495) when the room isn't (still) that player's.
class CNetLobby_OfferRoom : public CNetLobbyRequestBase {
public:
    enum { ROOM_GONE = -495 };
    static CNetLobby_OfferRoom* spawn(CTask* parent);   // FUN_006b6640
    CNetLobby_OfferRoom();                              // FUN_006b6700
    ~CNetLobby_OfferRoom() override;                    // FUN_006b6890
    bool onInit() override;                             // FUN_006b6970
    bool onMain() override;                             // FUN_006b69f0
    bool offer(int32_t pid, int32_t room, const std::string& password);   // FUN_006b6cc0
    bool answered(int k);                               // 0x006b6c30

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint32_t _8c = 0;
    int32_t pid = 0;             // 0x90 the room's player
    vc6::string password;        // 0x94
    int32_t matchResult = 0;     // 0xa4 the 0x4301 result, whatever it was
    int32_t room = 0;            // 0xa8
    uint8_t _ac[4] = {};

private:
    struct Layout;
};
struct CNetLobby_OfferRoom::Layout {
    YO2_AT(CNetLobby_OfferRoom, pid, 0x90);
    YO2_AT(CNetLobby_OfferRoom, password, 0x94);
    YO2_AT(CNetLobby_OfferRoom, matchResult, 0xa4);
    YO2_AT(CNetLobby_OfferRoom, room, 0xa8);
};
YO2_SIZEOF(CNetLobby_OfferRoom, 0xb0);

// CNetLobby_RecvMail (0xa8): the mail window's requests: friend search (an empty builder; it waits for the
// 0x3603 answer), PID by name (0x4500), mail count (0x4620), receive mail (0x4610).
class CNetLobby_RecvMail : public CNetLobbyRequestBase {
public:
    static CNetLobby_RecvMail* spawn(CTask* parent);   // FUN_006c8b20
    CNetLobby_RecvMail();                              // FUN_006c8be0
    ~CNetLobby_RecvMail() override;                    // FUN_006c8d80
    bool onInit() override;                            // FUN_006c8e00
    bool onMain() override;                            // FUN_006c8e80
    bool searchFriends();                              // 0x006c92e0
    bool getPidByName(const std::string& name);        // 0x006c9320
    bool getMailCount();                               // 0x006c9450
    bool rcvMail();                                    // FUN_006c9490
    bool takeAnswer(int k);                            // 0x006c9220

    uint32_t _80 = 0;
    int32_t state = 0;           // 0x84
    int32_t busy = BUSY_IDLE;    // 0x88
    int32_t result = 0;          // 0x8c
    uint32_t _90 = 0, _94 = 0;
    vc6::string name;            // 0x98 getPidByName

private:
    struct Layout;
};
struct CNetLobby_RecvMail::Layout {
    YO2_AT(CNetLobby_RecvMail, state, 0x84);
    YO2_AT(CNetLobby_RecvMail, result, 0x8c);
    YO2_AT(CNetLobby_RecvMail, name, 0x98);
};
YO2_SIZEOF(CNetLobby_RecvMail, 0xa8);

// CNetLobby_ReplyDuel (0xa8): answers a challenge, 0x4303 MATCHOFFERREPLY; done the next frame (no result).
class CNetLobby_ReplyDuel : public CNetLobbyRequestBase {
public:
    static CNetLobby_ReplyDuel* spawn(CTask* parent);   // FUN_006ca450
    CNetLobby_ReplyDuel();                              // FUN_006ca510
    ~CNetLobby_ReplyDuel() override;                    // FUN_006ca6a0
    bool onInit() override;                             // FUN_006ca780
    bool onMain() override;                             // FUN_006ca800
    bool reply(bool yes);                               // 0x006ca970
    bool answered(int k);                               // 0x006ca8e0

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint8_t _8c[8] = {};
    vc6::string unused;          // 0x94 never set
    uint8_t yes = 0;             // 0xa4
    uint8_t _a5[3] = {};

private:
    struct Layout;
};
struct CNetLobby_ReplyDuel::Layout {
    YO2_AT(CNetLobby_ReplyDuel, unused, 0x94);
    YO2_AT(CNetLobby_ReplyDuel, yes, 0xa4);
};
YO2_SIZEOF(CNetLobby_ReplyDuel, 0xa8);

// CNetLobby_TradeCancel (0x90): withdraws a trade offer, 0x7000/0x7108 CANCELREQTRADE (results[0x38]).
class CNetLobby_TradeCancel : public CNetLobbyRequestBase {
public:
    static CNetLobby_TradeCancel* spawn(CTask* parent);   // FUN_006d0090
    CNetLobby_TradeCancel();                              // FUN_006d0150
    ~CNetLobby_TradeCancel() override;                    // FUN_006d02b0
    bool onInit() override;                               // FUN_006d02d0
    bool onMain() override;                               // FUN_006d0350
    bool cancel();                                        // FUN_006d0520
    bool answered(int k);                                 // 0x006d0490

    int32_t state = 0;           // 0x80
    int32_t busy = BUSY_IDLE;    // 0x84
    int32_t result = 0;          // 0x88
    uint32_t _8c = 0;

private:
    struct Layout;
};
struct CNetLobby_TradeCancel::Layout {
    YO2_AT(CNetLobby_TradeCancel, state, 0x80);
    YO2_AT(CNetLobby_TradeCancel, _8c, 0x8c);
};
YO2_SIZEOF(CNetLobby_TradeCancel, 0x90);
