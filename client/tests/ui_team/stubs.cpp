// Stand-ins for what src/team calls in other folders (CDownloadTask, the system config). Linked into the team tests
// only.
#include "stubs.h"

std::vector<FakeDownload*> g_downloads;

CTask* downloadTaskNew(CTask* parent) {
    auto* d = new FakeDownload;
    g_downloads.push_back(d);
    return d->create(parent, 10000);
}
bool downloadTaskDone(CTask* t) { return static_cast<FakeDownload*>(t)->done; }
void downloadTaskGet(CTask* t, const vc6::string& url) {
    auto* d = static_cast<FakeDownload*>(t);
    d->urls.push_back(url.c_str());
    d->done = false;
}
int32_t downloadTaskStatus(CTask* t) { return static_cast<FakeDownload*>(t)->status; }
const uint8_t* downloadTaskData(CTask* t) {
    return reinterpret_cast<const uint8_t*>(static_cast<FakeDownload*>(t)->body.data());
}
uint32_t downloadTaskSize(CTask* t) { return static_cast<uint32_t>(static_cast<FakeDownload*>(t)->body.size()); }

vc6::string systemTeamUrl() { return "http://flags.test/team/"; }
