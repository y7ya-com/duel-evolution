// yo2TeamFlag.cpp: team flag images, downloaded on demand and cached as teamflag/tf<id>.png.
//
// CTeamFlagManager keeps a map of the flags the game has asked for (id -> version, local path, loaded) and runs a
// two-state machine over it: CFlagLoadIdle, whenever the map changed, starts the download of the first flag not
// loaded yet and switches to CFlagLoadLoading, which waits for CTeamFlagLoader to finish and switches back. The
// loader fetches <teamURL><id % 1000>/tf<id>.png through a CDownloadTask (src/Net) and writes it to the local
// path. When the manager dies it deletes teamflag/tf* (the cache only lives for a session).
#pragma once
#include <cstdint>
#include <string>

#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

// ---------------------------------------------------------------- other folders' code used here (not ported)
// CDownloadTask (src/Net yo2Download.cpp): an HTTP GET task. New 0x6a04b0; its HTTP part is at +0x70.
CTask* downloadTaskNew(CTask* parent);                          // CDownloadTask::New
bool downloadTaskDone(CTask* task);                             // vslot 9 (0x24): the transfer has ended
void downloadTaskGet(CTask* task, const vc6::string& url);      // (task + 0x70)->get(url) 0x6a0180
int32_t downloadTaskStatus(CTask* task);                        // (task + 0x70)->status 0x6a0450
const uint8_t* downloadTaskData(CTask* task);                   // +0x9c: the body
uint32_t downloadTaskSize(CTask* task);                         // +0xa0: its size
// CSystemConfigManager (DAT_0127188c) vslot 31: the team flag server's base URL (ends with '/').
vc6::string systemTeamUrl();

// ---------------------------------------------------------------- the flag map
class CTeamFlagLoader;

// The map's value (the exe's node holds pair<const uint32_t, TeamFlagInfo> from +0xc).
struct TeamFlagInfo {
    uint32_t version = 0;  // +0x00 the newest version the game has seen
    uint32_t id = 0;       // +0x04
    vc6::string path;      // +0x08 teamflag/tf<id>.png
    bool loaded = false;   // +0x18 downloaded this session
    // @yo2 0x00b059c0 pair<const uint32_t, TeamFlagInfo>::~pair (the path)
    ~TeamFlagInfo() = default;
};
YO2_AT(TeamFlagInfo, path, 0x08);
YO2_AT(TeamFlagInfo, loaded, 0x18);
YO2_SIZEOF(TeamFlagInfo, 0x1c);

using TeamFlagMap = vc6::map<uint32_t, TeamFlagInfo>;

// ---------------------------------------------------------------- the state machine
class IFlagLoadState;

// What a state sees of the manager (CTeamFlagManager + 0x70).
class IFlagLoadContext {
public:
    virtual void startDownload(uint32_t id) = 0;         // slot 0
    virtual CTeamFlagLoader* loader() = 0;               // slot 1
    virtual TeamFlagMap* flags() = 0;                    // slot 2
    virtual bool setState(IFlagLoadState* state) = 0;    // slot 3
    virtual bool changed() = 0;                          // slot 4
    virtual void setChanged(bool on) = 0;                // slot 5
};

class IFlagLoadState {
public:
    virtual void update(IFlagLoadContext* ctx) = 0;  // slot 0, every TM_MAIN
};

class CFlagLoadIdle : public IFlagLoadState {
public:
    static CFlagLoadIdle* instance();
    void update(IFlagLoadContext* ctx) override;
};

class CFlagLoadLoading : public IFlagLoadState {
public:
    static CFlagLoadLoading* instance();
    void update(IFlagLoadContext* ctx) override;
};

// ---------------------------------------------------------------- the downloader
// The loader's other buffer (+0xac; only made and freed).
struct TeamFlagBuffer {
    TeamFlagBuffer();
    ~TeamFlagBuffer() { clear(); }
    void clear();
    uint8_t* data;        // 0x00
    uint32_t unk04[4];    // 0x04
    int32_t unk14;        // 0x14 -1
};
YO2_SIZEOF(TeamFlagBuffer, 0x18);

class CTeamFlagLoader : public CEasyTask {
public:
    static CTeamFlagLoader* newChild(CTask* parent);
    CTeamFlagLoader();
    ~CTeamFlagLoader() override;
    bool onInit() override;
    bool onMain() override;

    void start(uint32_t id, const vc6::string& localPath);
    void reset();

    enum : int32_t { STATUS_OK = 2, STATUS_FAILED = 3 };  // downloadTaskStatus

    uint32_t unk70_ = 0;       // 0x70
    CTask* task_ = nullptr;    // 0x74 CDownloadTask, made by the first start()
    bool finished_ = false;    // 0x78 the last download ended (until reset())
    bool busy_ = false;        // 0x79 downloading
    bool ok_ = false;          // 0x7a the last download was written to localPath_
    vc6::string url_;          // 0x7c
    vc6::string fileName_;     // 0x8c tf<id>.png
    vc6::string localPath_;    // 0x9c
    TeamFlagBuffer buffer_;    // 0xac
    uint32_t unkC4_ = 0;       // 0xc4

private:
    struct Layout;
};
YO2_SIZEOF(CTeamFlagLoader, 0xc8);

// ---------------------------------------------------------------- the manager
class CTeamFlagManager : public CEasyTask, public IFlagLoadContext {
public:
    static CTeamFlagManager* newChild(CTask* parent);
    CTeamFlagManager();
    ~CTeamFlagManager() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    // IFlagLoadContext
    void startDownload(uint32_t id) override;
    CTeamFlagLoader* loader() override;
    TeamFlagMap* flags() override;
    bool setState(IFlagLoadState* state) override;
    bool changed() override;
    void setChanged(bool on) override;

    // what the game asks
    void request(uint32_t id, uint32_t version);
    void updateVersion(uint32_t id, uint32_t version);
    uint32_t version(uint32_t id) const;
    bool isOutdated(uint32_t id, uint32_t version) const;
    vc6::string flagPath(uint32_t id) const;

    TeamFlagMap flags_;                  // 0x74
    vc6::string dir_;                    // 0x84 "teamflag/"
    bool changed_ = false;               // 0x94 the map changed since the idle state last looked
    uint32_t current_ = 0;               // 0x98 the flag being downloaded
    CTaskPtr<CTeamFlagLoader> loader_;   // 0x9c
    IFlagLoadState* state_ = nullptr;    // 0xa8
    uint32_t unkAC_ = 0;                 // 0xac

private:
    void add(uint32_t id, uint32_t version);
    struct Layout;
};
YO2_SIZEOF(CTeamFlagManager, 0xb0);
