#include "yo2TeamFlag.h"

#include <cstdio>
#include <filesystem>
#include <system_error>

#include "System/yo2Debug.h"

namespace {
constexpr uint32_t kPriority = 10000;
}

// ================================================================ the states (labelled System in labels.tsv)

// @yo2 0x00b049a0 CFlagLoadIdle::instance (function-local static; 0xb049f0 is its atexit stub)
CFlagLoadIdle* CFlagLoadIdle::instance() {
    static CFlagLoadIdle s;
    return &s;
}

// @yo2 0x00b04a10 CFlagLoadIdle::update: after a change, download the first flag not loaded yet
void CFlagLoadIdle::update(IFlagLoadContext* ctx) {
    if (!ctx->changed())
        return;
    for (const auto& entry : *ctx->flags()) {
        const TeamFlagInfo& info = entry.second;
        if (!info.loaded) {
            ctx->startDownload(info.id);
            ctx->setState(CFlagLoadLoading::instance());
            return;
        }
    }
    ctx->setChanged(false);  // everything is loaded
}

// @yo2 0x00b04af0 CFlagLoadLoading::instance (function-local static; 0xb04b40 is its atexit stub)
CFlagLoadLoading* CFlagLoadLoading::instance() {
    static CFlagLoadLoading s;
    return &s;
}

// @yo2 0x00b04b60 CFlagLoadLoading::update: back to idle once the loader is done
void CFlagLoadLoading::update(IFlagLoadContext* ctx) {
    if (ctx->loader()->finished_)
        ctx->setState(CFlagLoadIdle::instance());
}

// ================================================================ CTeamFlagManager

CTeamFlagManager::CTeamFlagManager() { loader_.setUser(this); }

// @yo2 0x00b05500 CTeamFlagManager::~CTeamFlagManager
// @yo2 0x00b05390 CTeamFlagManager deleting destructor
// @yo2 0x00b053c0 map<uint32_t, TeamFlagInfo>::~map
CTeamFlagManager::~CTeamFlagManager() = default;

// @yo2 0x00b05130 CTeamFlagManager::New
CTeamFlagManager* CTeamFlagManager::newChild(CTask* parent) {
    auto* m = new CTeamFlagManager;
    return dynamic_cast<CTeamFlagManager*>(m->create(parent, kPriority));
}

// @yo2 0x00b04ba0 CTeamFlagManager::onInit: the loader, the cache directory, idle
bool CTeamFlagManager::onInit() {
    loader_.setUser(this);
    loader_.set(CTeamFlagLoader::newChild(this));
    YO2_ASSERT(loader_.task() != nullptr, "チーム旗ダウンロードタスク生成エラー");  // download task creation failed
    loader_.get()->setInstName("チーム旗ダウンロードタスク");                     // "team flag download task"
    dir_ = "teamflag/";
    changed_ = false;
    state_ = CFlagLoadIdle::instance();
    return true;
}

// @yo2 0x00b050a0 CTeamFlagManager::onMain: take the finished download, then run the state
bool CTeamFlagManager::onMain() {
    if (loader_.get()->finished_) {
        if (loader_.get()->ok_)
            flags_[current_].loaded = true;
        loader_.get()->reset();
    }
    state_->update(this);
    return true;
}

// @yo2 0x00b05d70 CTeamFlagManager::onDestroy: delete the session's flag files (teamflag/tf*)
void CTeamFlagManager::onDestroy() {
    std::error_code ec;
    for (const auto& entry : std::filesystem::directory_iterator(dir_.c_str(), ec)) {
        std::string name = entry.path().filename().string();
        if (entry.is_directory(ec) || name.size() < 2 || (name[0] | 0x20) != 't' || (name[1] | 0x20) != 'f')
            continue;
        std::error_code rm;
        bool ok = std::filesystem::remove(std::string(dir_.c_str()) + name, rm);
        yo2Trace(ok ? "旗ファイル削除 %s\n" : "旗ファイル削除失敗 %s\n", name.c_str());  // flag file deleted / failed
    }
}

// @yo2 0x00b05640 CTeamFlagManager::startDownload (IFlagLoadContext slot 0): unless the loader is busy
void CTeamFlagManager::startDownload(uint32_t id) {
    if (loader_.get()->busy_)
        return;
    const TeamFlagInfo* info = flags_.find(id);
    if (!info)
        return;
    current_ = info->id;
    loader_.get()->start(info->id, info->path);
}

// @yo2 0x00b05300 CTeamFlagManager::loader (IFlagLoadContext slot 1)
CTeamFlagLoader* CTeamFlagManager::loader() { return dynamic_cast<CTeamFlagLoader*>(loader_.task()); }

// @yo2 0x00b056e0 CTeamFlagManager::request: a flag the game wants to show; new ones get queued
void CTeamFlagManager::request(uint32_t id, uint32_t version) {
    if (!flags_.find(id)) {
        add(id, version);
        setChanged(true);
    }
}

// @yo2 0x00b05770 CTeamFlagManager::add: the map entry for teamflag/tf<id>.png, not loaded
void CTeamFlagManager::add(uint32_t id, uint32_t version) {
    char name[0x100];
    std::snprintf(name, sizeof name, "tf%06d.png", static_cast<int>(id));
    vc6::string path = dir_;
    path += name;
    TeamFlagInfo& info = flags_[id];
    info.version = version;
    info.id = id;
    info.path = path;
    info.loaded = false;
    setChanged(true);
}

// @yo2 0x00b05a10 CTeamFlagManager::updateVersion: only ever newer
void CTeamFlagManager::updateVersion(uint32_t id, uint32_t version) {
    const TeamFlagInfo* info = flags_.find(id);
    if (info && info->version < version) {
        flags_[id].version = version;
        setChanged(true);
    }
}

// @yo2 0x00b05aa0 CTeamFlagManager::version (0: unknown flag)
uint32_t CTeamFlagManager::version(uint32_t id) const {
    const TeamFlagInfo* info = flags_.find(id);
    return info ? info->version : 0;
}

// @yo2 0x00b05b20 CTeamFlagManager::isOutdated (an unknown flag isn't)
bool CTeamFlagManager::isOutdated(uint32_t id, uint32_t version) const {
    const TeamFlagInfo* info = flags_.find(id);
    return info && info->version < version;
}

// @yo2 0x00b05bb0 CTeamFlagManager::flagPath ("" for an unknown flag)
vc6::string CTeamFlagManager::flagPath(uint32_t id) const {
    const TeamFlagInfo* info = flags_.find(id);
    return info ? info->path : vc6::string("");
}

struct CTeamFlagManager::Layout {
    YO2_AT(CTeamFlagManager, flags_, 0x74);
    YO2_AT(CTeamFlagManager, dir_, 0x84);
    YO2_AT(CTeamFlagManager, changed_, 0x94);
    YO2_AT(CTeamFlagManager, current_, 0x98);
    YO2_AT(CTeamFlagManager, loader_, 0x9c);
    YO2_AT(CTeamFlagManager, state_, 0xa8);
};

// ================================================================ CTeamFlagLoader

CTeamFlagLoader::CTeamFlagLoader() = default;

// @yo2 0x00b06220 CTeamFlagLoader::~CTeamFlagLoader
// @yo2 0x00b061f0 CTeamFlagLoader deleting destructor
CTeamFlagLoader::~CTeamFlagLoader() = default;

// @yo2 0x00b060c0 CTeamFlagLoader::New
CTeamFlagLoader* CTeamFlagLoader::newChild(CTask* parent) {
    auto* l = new CTeamFlagLoader;
    return dynamic_cast<CTeamFlagLoader*>(l->create(parent, kPriority));
}

// @yo2 0x00b064a0 CTeamFlagLoader::start: GET <teamURL><id % 1000>/tf<id>.png into localPath
void CTeamFlagLoader::start(uint32_t id, const vc6::string& localPath) {
    if (busy_)
        return;
    finished_ = false;
    ok_ = false;
    if (!task_) {
        task_ = downloadTaskNew(this);
        YO2_ASSERT(task_ != nullptr, "teamflag download task create err");
        task_->setInstName("チーム旗ダウンロードタスク");
    }
    char buf[0x200];
    std::snprintf(buf, sizeof buf, "tf%06d.png", static_cast<int>(id));
    fileName_ = buf;
    localPath_ = localPath;
    std::snprintf(buf, sizeof buf, "%s%d/%s", systemTeamUrl().c_str(), static_cast<int>(id % 1000),
                  fileName_.c_str());
    url_ = buf;
    downloadTaskGet(task_, url_);
    yo2Trace("%sダウンロード開始\n", url_.c_str());  // "download started"
    busy_ = true;
}

// @yo2 0x00b063b0 CTeamFlagLoader::onMain: when the download ends, write the file (teamflag/ is created first)
bool CTeamFlagLoader::onMain() {
    if (!busy_ || !task_ || !downloadTaskDone(task_))
        return true;
    finished_ = true;
    busy_ = false;
    if (downloadTaskStatus(task_) == STATUS_OK) {
        std::error_code ec;
        std::filesystem::create_directory("teamflag", ec);
        if (std::FILE* f = std::fopen(localPath_.c_str(), "wb")) {
            std::fwrite(downloadTaskData(task_), downloadTaskSize(task_), 1, f);
            std::fclose(f);
            ok_ = true;
        }
    } else if (downloadTaskStatus(task_) == STATUS_FAILED) {
        ok_ = false;
    }
    return true;
}

struct CTeamFlagLoader::Layout {
    YO2_AT(CTeamFlagLoader, task_, 0x74);
    YO2_AT(CTeamFlagLoader, finished_, 0x78);
    YO2_AT(CTeamFlagLoader, busy_, 0x79);
    YO2_AT(CTeamFlagLoader, ok_, 0x7a);
    YO2_AT(CTeamFlagLoader, url_, 0x7c);
    YO2_AT(CTeamFlagLoader, fileName_, 0x8c);
    YO2_AT(CTeamFlagLoader, localPath_, 0x9c);
    YO2_AT(CTeamFlagLoader, buffer_, 0xac);
};
