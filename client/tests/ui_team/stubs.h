// What the team stand-ins (stubs.cpp) record.
#pragma once
#include <string>
#include <vector>

#include "team/yo2TeamFlag.h"

struct FakeDownload : CTask {
    std::vector<std::string> urls;  // every get()
    bool done = false;
    int32_t status = 0;             // 2 ok, 3 failed
    std::string body;
};
extern std::vector<FakeDownload*> g_downloads;
