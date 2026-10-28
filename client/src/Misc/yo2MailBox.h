// yo2MailBox.cpp: the lobby mail kept on disk. CMailMgr (DAT_012ad2e8) holds two CMailBoxes, the mail received
// (<user dir>\mail\rdm.dat) and the mail sent (sdm.dat). Each is a list of LobbyMail* saved as a CCryptFile: a date
// header ("2007/06/20"), the count, then each mail. The lobby files incoming and outgoing mail through them (Net's
// lobbyMailReceived / lobbyMailSent: add, then save); the D-Mail windows read them.
#pragma once
#include <cstdint>

#include "System/vc6.h"
#include "System/yo2Debug.h"

struct LobbyMail;

// yaneSDK's CFile::PathFileExists (statics). TODO(yaneSDK)
bool pathFileExists(const char* path);

class CMailBox {
public:
    virtual void buildPath() = 0;               // slot 0: path_ = the user's folder + this box's file
    virtual bool exists();                      // 0x00832740
    virtual int32_t save();                     // 0x00832770 always 0
    virtual int32_t load();                     // 0x00833170 -1 when the file can't be read
    virtual void clear();                       // 0x00833eb0 deletes the mails
    virtual void copyFrom(const CMailBox& o);   // 0x008343f0 add()s each of o's mails
    virtual void add(const LobbyMail& m);       // 0x00833f40 a copy, at the end
    virtual void remove(int32_t i);             // 0x008341c0
    virtual void setUser(vc6::string user);     // 0x00834240
    virtual LobbyMail* at(int32_t i);           // 0x00834430
    virtual int32_t count();                    // 0x00834450
    virtual void rewind();                      // 0x00834480 first next() is the oldest
    virtual LobbyMail* next();                  // 0x008344a0 null at the end
    virtual void rewindBack();                  // 0x008344d0 first prev() is the newest
    virtual LobbyMail* prev();                  // 0x008344f0 null at the start
    ~CMailBox();                                // 0x00834670 not virtual; leaves the mails (CMailMgr never dies early)

    LobbyMail** fwd_ = nullptr;          // 0x04 next()'s cursor
    LobbyMail** back_ = nullptr;         // 0x08 prev()'s cursor
    vc6::vector<LobbyMail*> mails_;      // 0x0c
    vc6::string path_;                   // 0x1c
    vc6::string user_;                   // 0x2c (kept, never read)

private:
    struct Layout;
};
YO2_SIZEOF(CMailBox, 0x3c);

class CMailBoxRecv final : public CMailBox {
public:
    void buildPath() override;    // 0x00833ac0 \mail\rdm.dat
    int32_t load() override;      // 0x00833aa0
};

class CMailBoxSend final : public CMailBox {
public:
    void buildPath() override;    // 0x00833c00 \mail\sdm.dat
    int32_t load() override;      // 0x00833be0
};

class CMailMgr final {
public:
    virtual void setUser(vc6::string user);   // 0x00834520 both boxes
    virtual void load();                      // 0x00834640 both boxes
    ~CMailMgr();                              // 0x008347c0

    CMailBoxRecv recv_;    // 0x04
    CMailBoxSend sent_;    // 0x40
    vc6::string user_;     // 0x7c

private:
    struct Layout;
};
YO2_SIZEOF(CMailMgr, 0x8c);

extern CMailMgr* g_mailMgr;   // DAT_012ad2e8
