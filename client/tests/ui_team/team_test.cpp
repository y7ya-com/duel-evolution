// src/team: the team flag manager, its two states and the loader, over a fake CDownloadTask, in a scratch working
// directory (the loader writes teamflag/tf<id>.png, the manager deletes teamflag/tf* when it dies). Covers every
// function in yo2TeamFlag.cpp / yo2TeamFlagFields.cpp:
//   CFlagLoadIdle instance/update 0xb049a0/0xb04a10, CFlagLoadLoading instance/update 0xb04af0/0xb04b60
//   CTeamFlagManager: New 0xb05130, ~ 0xb05500/0xb05390 (+ map 0xb053c0, pair 0xb059c0), onInit 0xb04ba0,
//     onMain 0xb050a0, onDestroy 0xb05d70, context slots 0xb05640 0xb05300 0xb05330 0xb05d50 0xb05350 0xb05370,
//     request 0xb056e0, add 0xb05770, updateVersion 0xb05a10, version 0xb05aa0, isOutdated 0xb05b20, flagPath 0xb05bb0
//   CTeamFlagLoader: New 0xb060c0, ~ 0xb06220/0xb061f0 (+ buffer 0xb05f10/0xb06080), onInit 0xb06380,
//     onMain 0xb063b0, start 0xb064a0, reset 0xb06890
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "stubs.h"

namespace fs = std::filesystem;

namespace {
void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}

std::string slurp(const char* path) {
    std::ifstream f(path, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

void testQueries(CTeamFlagManager* m) {
    assert(m->flags_.empty() && !m->changed_);
    m->request(42, 3);
    const TeamFlagInfo* info = m->flags_.find(42);
    assert(info && info->version == 3 && info->id == 42 && info->path == "teamflag/tf000042.png" && !info->loaded);
    assert(m->changed_);
    m->changed_ = false;
    m->request(42, 5);  // known: nothing changes
    assert(!m->changed_ && m->version(42) == 3);
    assert(m->version(7) == 0 && m->flagPath(7) == "" && m->flagPath(42) == "teamflag/tf000042.png");
    assert(m->isOutdated(42, 4) && !m->isOutdated(42, 3) && !m->isOutdated(7, 9));
    m->updateVersion(42, 2);  // never older
    assert(m->version(42) == 3 && !m->changed_);
    m->updateVersion(7, 9);   // unknown: ignored
    assert(!m->flags_.find(7) && !m->changed_);
    m->updateVersion(42, 6);
    assert(m->version(42) == 6 && m->changed_);
    // the context slots
    IFlagLoadContext* ctx = m;
    assert(ctx->flags() == &m->flags_ && ctx->loader() == m->loader_.get() && ctx->changed());
    ctx->setChanged(false);
    assert(!m->changed_);
    ctx->setChanged(true);
}
}  // namespace

int main() {
    static int layers0;
    fs::path dir = fs::temp_directory_path() / ("yo2_team_test_" + std::to_string(reinterpret_cast<uintptr_t>(&layers0)));
    fs::create_directories(dir);
    fs::current_path(dir);

    CTask* root = CTask::createRoot();
    CTeamFlagManager* m = CTeamFlagManager::newChild(root);

    // onInit: the loader (a child), the cache directory, idle
    CTeamFlagLoader* loader = m->loader_.get();
    assert(loader->parent() == m && loader->instName() == "チーム旗ダウンロードタスク");
    assert(!loader->task_ && !loader->busy_ && !loader->finished_ && !loader->ok_);
    assert(loader->buffer_.data == nullptr && loader->buffer_.unk14 == -1);
    assert(m->dir_ == "teamflag/" && m->state_ == CFlagLoadIdle::instance());
    assert(CFlagLoadIdle::instance() == CFlagLoadIdle::instance());

    testQueries(m);  // leaves flag 42 queued, changed
    m->request(1007, 1);

    // idle: the first flag not loaded starts downloading; GET <teamURL><id % 1000>/tf<id>.png
    frame(root);
    assert(m->state_ == CFlagLoadLoading::instance() && m->current_ == 42);
    assert(g_downloads.size() == 1 && loader->task_ == g_downloads[0] && loader->task_->parent() == loader);
    FakeDownload* dl = g_downloads[0];
    assert(dl->instName() == "チーム旗ダウンロードタスク");
    assert(dl->urls.size() == 1 && dl->urls[0] == "http://flags.test/team/42/tf000042.png");
    assert(loader->busy_ && loader->fileName_ == "tf000042.png" && loader->localPath_ == "teamflag/tf000042.png");
    assert(loader->url_ == "http://flags.test/team/42/tf000042.png");
    // busy: further starts are ignored, also through the context
    m->startDownload(1007);
    loader->start(1007, "x");
    assert(dl->urls.size() == 1 && m->current_ == 42);

    // still downloading
    frame(root);
    assert(m->state_ == CFlagLoadLoading::instance() && loader->busy_ && !loader->finished_);

    // done: the loader writes the file (making teamflag/), then the manager marks the flag loaded
    dl->done = true;
    dl->status = CTeamFlagLoader::STATUS_OK;
    dl->body = std::string("\x89PNG\0data", 9);
    frame(root);
    assert(loader->finished_ && !loader->busy_ && loader->ok_);
    assert(slurp("teamflag/tf000042.png") == dl->body);
    frame(root);
    assert(m->flags_.find(42)->loaded && !loader->finished_ && !loader->ok_);  // reset() after taking it
    // The exe's quirk: the manager resets the loader before the state looks at it, so CFlagLoadLoading never sees
    // finished_ and the queue stops after one flag (flag 1007 is never fetched).
    frame(root);
    frame(root);
    assert(m->state_ == CFlagLoadLoading::instance() && !m->flags_.find(1007)->loaded && dl->urls.size() == 1);

    // the states on their own: loading -> idle once the loader is finished; idle starts the next flag
    loader->finished_ = true;
    CFlagLoadLoading::instance()->update(m);
    assert(m->state_ == CFlagLoadIdle::instance());
    loader->finished_ = false;
    m->setChanged(false);
    CFlagLoadIdle::instance()->update(m);  // nothing changed: nothing happens
    assert(m->state_ == CFlagLoadIdle::instance() && dl->urls.size() == 1);
    m->setChanged(true);
    CFlagLoadIdle::instance()->update(m);
    assert(m->state_ == CFlagLoadLoading::instance() && m->current_ == 1007);
    assert(dl->urls.size() == 2 && dl->urls[1] == "http://flags.test/team/7/tf001007.png");

    // a failed download: finished, not ok, no file
    dl->done = true;
    dl->status = CTeamFlagLoader::STATUS_FAILED;
    loader->onMain();
    assert(loader->finished_ && !loader->busy_ && !loader->ok_ && !fs::exists("teamflag/tf001007.png"));
    loader->reset();
    // with everything loaded, idle clears the change flag
    m->flags_[1007].loaded = true;
    m->setState(CFlagLoadIdle::instance());
    CFlagLoadIdle::instance()->update(m);
    assert(!m->changed_ && m->state_ == CFlagLoadIdle::instance());
    // reset() keeps a running download's state
    loader->busy_ = true;
    loader->finished_ = true;
    loader->reset();
    assert(loader->finished_);
    loader->busy_ = false;

    // onDestroy: teamflag/tf* goes, the rest stays
    std::ofstream("teamflag/TF000009.png") << "x";
    std::ofstream("teamflag/other.txt") << "x";
    fs::create_directory("teamflag/tfdir");
    m->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(!fs::exists("teamflag/tf000042.png") && !fs::exists("teamflag/TF000009.png"));
    assert(fs::exists("teamflag/other.txt") && fs::exists("teamflag/tfdir"));

    fs::current_path(fs::temp_directory_path());
    fs::remove_all(dir);
    std::printf("team flags: ok\n");
    return 0;
}
