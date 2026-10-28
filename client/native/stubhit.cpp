// See stubhit.h. Also records where the boot dies: a crash signal writes a CRASH row with the backtrace.
#include "stubhit.h"

#include <execinfo.h>
#include <signal.h>
#include <unistd.h>

#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <set>

namespace {
std::mutex gLock;
FILE* gLog;
int gSeq;
const char* gLast = "(none)";

FILE* log() {
    if (!gLog) {
        const char* path = getenv("YO2_STUBHITS");
        gLog = fopen(path ? path : "stubhits.tsv", "w");
        if (gLog) fprintf(gLog, "seq\taddr\tkind\towner\tname\tcaller\n");
    }
    return gLog;
}

void onCrash(int sig) {
    if (FILE* f = log()) {
        fprintf(f, "%d\t-\tCRASH\t-\tsignal %d after the last new stub: %s\t-\n", gSeq, sig, gLast);
        fflush(f);
        void* frames[48];
        int n = backtrace(frames, 48);
        fprintf(stderr, "yo2native: signal %d; backtrace:\n", sig);
        backtrace_symbols_fd(frames, n, 2);
    }
    _exit(128 + sig);
}

struct Init {
    Init() {
        for (int s : {SIGSEGV, SIGBUS, SIGABRT, SIGILL, SIGFPE}) signal(s, onCrash);
    }
} gInit;
}  // namespace

void yo2StubHit(uint32_t addr, const char* kind, const char* owner, const char* name, const char* caller) {
    std::lock_guard<std::mutex> l(gLock);
    static std::set<const char*> seen;   // one row per stub: its name literal is unique
    if (!seen.insert(name).second) return;
    gLast = name;
    if (FILE* f = log()) {
        fprintf(f, "%d\t%08x\t%s\t%s\t%s\t%s\n", gSeq, addr, kind, owner, name, caller);
        fflush(f);
    }
    fprintf(stderr, "stub %4d %08x %-6s %s\n", gSeq, addr, kind, name);
    gSeq++;
}
