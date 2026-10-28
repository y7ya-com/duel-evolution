// Doubles for what src/caution calls in other folders: CHttpDownload (src/Net), CInfoDlgCommon / CBgCommon (src/Game,
// System), the sound player, the config's site URL and the app's stop-login flag.
#include "fakes.h"

#include "System/yo2Element.h"

std::vector<std::string> g_log;
bool g_stopLogin;
std::map<std::string, CHttpDownload*> g_downloads;

CHttpDownload::CHttpDownload() = default;
CHttpDownload::~CHttpDownload() = default;
int32_t CHttpDownload::start(vc6::string url) {
    url_ = url;
    status_ = RUNNING;
    g_log.push_back(std::string("GET ") + url.c_str());
    g_downloads[url.c_str()] = this;
    return 0;
}
int32_t CHttpDownload::status() const { return status_; }

CEasyTask* infoDlgCreate(CTask* parent, CTask* owner, int32_t kind, const vc6::string& message, uint32_t flags) {
    auto* d = new FakeDlg;
    d->owner = owner, d->kind = kind, d->text = message.c_str(), d->flags = flags;
    g_log.push_back("dlg " + std::to_string(kind) + " " + d->text);
    return dynamic_cast<CEasyTask*>(d->create(parent, 10000));
}
CEasyTask* infoDlgCreateFromFile(CTask* parent, CTask* owner, int32_t kind, const vc6::string& path,
                                 uint32_t flags) {
    auto* d = static_cast<FakeDlg*>(infoDlgCreate(parent, owner, kind, path, flags));
    d->fromFile = true;
    return d;
}
int32_t infoDlgResult(CEasyTask* dlg) { return static_cast<FakeDlg*>(dlg)->result; }

CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg) {
    g_log.push_back("bg " + std::to_string(bg) + " " + std::to_string(arg) + (layer ? " layer" : ""));
    auto* t = new CEasyTask;
    return dynamic_cast<CEasyTask*>(t->create(parent, 10000));
}
bool soundPlay(uint32_t id, int32_t fade) {
    char buf[40];
    std::snprintf(buf, sizeof buf, "sound %x %d", id, fade);
    g_log.push_back(buf);
    return true;
}
vc6::string localizedAppUrl() { return "http://site/eng/"; }
void appSetStopLogin(bool on) { g_stopLogin = on; }

// CWindowLoginView's slots exist only in the real window (System); defining them here gives the host build (UBSan's
// vptr checks) its typeinfo. The view's members are checked by the difftest (cases_caution.py).
#include "caution/loginWindowInline.h"
void CWindowLoginView::slot0() {}
void CWindowLoginView::slot1() {}
void CWindowLoginView::slot2() {}
void CWindowLoginView::slot3() {}
void CWindowLoginView::slot4() {}
void CWindowLoginView::slot5() {}
void CWindowLoginView::slot6() {}
void CWindowLoginView::slot7() {}
void CWindowLoginView::slot8() {}
void CWindowLoginView::relayout() {}
