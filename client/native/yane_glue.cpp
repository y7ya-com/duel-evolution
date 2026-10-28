// See yane_glue.h. Compiled in yaneSDK's mode (native/CMakeLists.txt).
#include "stdafx.h"

#include "yaneAppBase.h"
#include "yaneAppInitializer.h"
#include "yaneAppManager.h"
#include "yaneFPSTimer.h"
#include "yaneFile.h"
#include "yaneKey.h"
#include "yaneWinHook.h"
#include "yaneWindow.h"

#include "yane_glue.h"

void yaneInit(void* instance, void* prev, const char* cmdLine, int show) {
    CAppInitializer::Init((HINSTANCE)instance, (HINSTANCE)prev, (LPSTR)cmdLine, show);
}

const char* yaneCmdLine() { return CAppInitializer::GetCmdLine(); }

void yaneSetPathList(const char* const* names, int n) {
    vector<string> v;
    for (int i = 0; i < n; i++) v.push_back(names[i]);
    CFile::SetPathList(v);
}

namespace {
class GlueApp : public CAppBase {
public:
    GlueApp(void (*spec)(void*, YaneWindowSpec*), void (*main)(void*), void* user) : spec_(spec), main_(main), user_(user) {}

protected:
    LRESULT OnPreCreate(CWindowOption& opt) {
        CAppBase::OnPreCreate(opt);
        YaneWindowSpec s = {"", "", 640, 480, 0};
        spec_(user_, &s);
        opt.caption = s.caption;
        opt.classname = s.className;
        opt.size_x = s.width;
        opt.size_y = s.height;
        if (s.style) opt.style = s.style;
        return 0;
    }
    void MainThread(void) { main_(user_); }

private:
    void (*spec_)(void*, YaneWindowSpec*);
    void (*main_)(void*);
    void* user_;
};

class GlueHook : public CWinHook {
public:
    GlueHook(YaneHookFn fn, void* user) : fn_(fn), user_(user) {}
    LRESULT WndProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) { return (LRESULT)fn_(user_, h, msg, wp, lp); }

private:
    YaneHookFn fn_;
    void* user_;
};

// the exe keeps one CFPSTimer in CApp (+0x14) and one CKey (+0x184): made on first use, after yaneSDK's start-up
// (CKey opens DirectInput)
CFPSTimer& fps() {
    static CFPSTimer* t = new CFPSTimer;
    return *t;
}
CKey& key() {
    static CKey* k = new CKey;
    return *k;
}
}  // namespace

void yaneRunApp(void (*spec)(void*, YaneWindowSpec*), void (*main)(void*), void* user) {
    GlueApp app(spec, main, user);
    app.Run();
}

void* yaneCurrentApp() { return CAppManager::GetMyApp(); }

void* yaneAppHwnd() {
    CAppBase* app = CAppManager::GetMyApp();
    return app ? (void*)app->GetHWnd() : NULL;
}

bool yanePump() {
    CAppBase* app = CAppManager::GetMyApp();
    return app && app->IsThreadValid();
}

void* yaneHook(YaneHookFn fn, void* user) {
    GlueHook* h = new GlueHook(fn, user);
    CAppInitializer::Hook(h);
    return h;
}

void yaneUnhook(void* hook) {
    CAppInitializer::Unhook((GlueHook*)hook);
    delete (GlueHook*)hook;
}

void yaneFpsSet(int32_t f) { fps().SetFPS((DWORD)f); }
void yaneFpsWait() { fps().WaitFrame(); }
int32_t yaneFpsGet() { return (int32_t)fps().GetFPS(); }
void yaneKeyUpdate() { key().Input(); }

bool yaneReadFile(const char* name, void (*sink)(void*, const void*, uint32_t), void* user) {
    CFile f;
    if (f.Read(name) != 0) return false;
    sink(user, f.GetMemory(), (uint32_t)f.GetSize());
    return true;
}
