// yaneSDK, as the C++17 side sees it (app_glue.cpp): plain types only, because yaneSDK's headers compile only in its
// own mode (gnu++11, -fms-extensions, the Shift-JIS-converted copies). Implemented in yane_glue.cpp.
#pragma once
#include <cstdint>

void yaneInit(void* instance, void* prev, const char* cmdLine, int show);   // CAppInitializer::Init
const char* yaneCmdLine();
void yaneSetPathList(const char* const* names, int n);                       // CFile::SetPathList

struct YaneWindowSpec {
    const char* caption;
    const char* className;
    int32_t width, height;
    uint32_t style;
};
// CAppBase::Run on a subclass whose OnPreCreate asks spec() and whose MainThread calls mainThread(); returns when the
// window closes and mainThread has returned
void yaneRunApp(void (*spec)(void* user, YaneWindowSpec* out), void (*mainThread)(void* user), void* user);
void* yaneCurrentApp();   // CAppManager::GetMyApp
void* yaneAppHwnd();      // its window
bool yanePump();          // CAppBase::IsThreadValid: messages dispatched; false once the window is closing

// A CWinHook on the current app's window: fn sees every message first (yaneSDK's hook list); unhook with the handle
typedef intptr_t (*YaneHookFn)(void* user, void* hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam);
void* yaneHook(YaneHookFn fn, void* user);
void yaneUnhook(void* hook);

void yaneFpsSet(int32_t fps);   // CFPSTimer (the app's one)
void yaneFpsWait();
int32_t yaneFpsGet();
void yaneKeyUpdate();           // CKey::Input (the app's one)
// yaneSDK's CFile::Read (loose files, then the archives in the path list): the whole file, or false
bool yaneReadFile(const char* name, void (*sink)(void* user, const void* data, uint32_t size), void* user);
bool yaneFileExists(const char* name);                 // CFile::PathFileExists
void yaneSetFileLanguage(char letter, char fallback);  // CFile::m_szLanguage: what a '?' in a file name becomes
