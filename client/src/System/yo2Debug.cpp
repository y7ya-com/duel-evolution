#include "yo2Debug.h"

#include <cstdarg>
#include <cstdio>
#include <cstdlib>

namespace {
char g_formatBuf[0x400];  // DAT_012d2b60
}

// @yo2 0x0059abf0 Format: vsprintf into the shared buffer
const char* yo2Format(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(g_formatBuf, sizeof g_formatBuf, fmt, ap);
    va_end(ap);
    return g_formatBuf;
}

// @yo2 0x0060cff0 assertion box (clipboard + MessageBox in the exe)
bool yo2AssertFailed(bool*, const char* msg, const char* file, int line) {
    std::fprintf(stderr, "%s(%d) %s\n", file, line, msg);
    return false;
}

// yaneSDK trace (0x0052c360, phase 1): empty in the shipped exe
void yo2Trace(const char*, ...) {}

void yo2Exit(int code) { std::exit(code); }
