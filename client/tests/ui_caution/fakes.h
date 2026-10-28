#pragma once
#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "caution/cautionEntry.h"

struct FakeDlg : CEasyTask {
    CTask* owner = nullptr;
    int32_t kind = 0;
    std::string text;
    uint32_t flags = 0;
    bool fromFile = false;
    int32_t result = 0;
};
extern std::vector<std::string> g_log;
extern bool g_stopLogin;
extern std::map<std::string, CHttpDownload*> g_downloads;
