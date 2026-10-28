// CHttpDownload / CDownloadTask (the exe's src\Net\yo2Download*.cpp).
#include "NetDownload.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

static const char AGENT[] = "YGO";

// @yo2 0x0069f820 GetDiskFreeSpaceEx: free > bytes (it also formats "GetDiskFreeSpaceEx %I64uM > %uM", unused)
bool netHasFreeSpace(uint64_t bytes) {
    uint64_t avail;
    return ygDiskFreeBytes(&avail) && avail > bytes;
}

// The status (must be 200) and Content-Length (must be > 0) of an opened URL.
static bool contentLength(YgHttp* h, uint32_t* len) {
    uint32_t status;
    return ygHttpQueryNumber(h, YG_HTTP_STATUS_CODE, &status) && status == 200 &&
           ygHttpQueryNumber(h, YG_HTTP_CONTENT_LENGTH, len) && *len != 0;
}

// @yo2 0x0069f8f0 the whole body into a malloc'd, NUL-terminated buffer
int32_t httpDownloadToMemory(const char* url, char** out, uint32_t* got, uint32_t* size, const int32_t* state) {
    YgHttp* h = ygHttpOpenUrl(AGENT, url);
    if (!h) return 0;
    int32_t ok = 0;
    uint32_t len;
    if (contentLength(h, &len)) {
        *size = len;
        if (char* buf = (char*)calloc(len + 1, 1)) {
            char* p = buf;
            uint32_t left = len;
            while (left != 0) {
                uint32_t n;
                if (*state == CHttpDownload::CANCEL || !ygHttpRead(h, p, left, &n)) {
                    ygShowLastError("Error");
                    free(buf);
                    ygHttpClose(h);
                    return 0;
                }
                p += n;
                left -= n;
                *got = len - left;
            }
            *out = buf;
            *got = len;
            ok = 1;
        }
    }
    ygHttpClose(h);
    return ok;
}

// @yo2 0x0069fb40 the body into `path` ("wb"), 64 KB at a time; a short write or a failed read deletes the file
int32_t httpDownloadToFile(const char* url, const char* path, uint32_t* got, uint32_t* size, const int32_t* state) {
    YgHttp* h = ygHttpOpenUrl(AGENT, url);
    if (!h) return 0;
    int32_t ok = 0;
    uint32_t len;
    if (contentLength(h, &len)) {
        *size = len;
        if (FILE* f = fopen(path, "wb")) {
            static char chunk[0x10000];   // the exe's is on the stack
            uint32_t left = len;
            ok = 1;
            while (left != 0) {
                uint32_t n;
                if (*state == CHttpDownload::CANCEL || !ygHttpRead(h, chunk, sizeof chunk, &n)) {
                    ygShowLastError("Error");
                    ok = 0;
                    break;
                }
                if (fwrite(chunk, 1, n, f) != n) {
                    ok = 0;
                    break;
                }
                *got += n;
                left -= n;   // unsigned, as in the exe: a longer body than Content-Length wraps and keeps reading
            }
            fclose(f);
            if (ok) *got = len;
            else remove(path);
        }
    }
    ygHttpClose(h);
    return ok;
}

// @yo2 0x0069f470 CHttpDownloadBase::~CHttpDownloadBase
// @yo2 0x0069f490 CHttpDownloadBase deleting destructor
CHttpDownloadBase::~CHttpDownloadBase() = default;

// Two std::vector<uint32_t> instances the compiler left in this file; nothing calls them (std::vector here).
// @yo2 0x0069f4c0 vector<uint32_t>::_Tidy
// @yo2 0x0069f530 vector<uint32_t>::_Insert_n

// @yo2 0x0069fee0
CHttpDownload::CHttpDownload() = default;

// @yo2 0x0069ff30 CHttpDownload deleting destructor
// @yo2 0x0069ff60 frees the body; the two strings go
CHttpDownload::~CHttpDownload() { free(buf); }

// @yo2 0x006a0450
int32_t CHttpDownload::state() const { return state_; }
// @yo2 0x006a0470
void CHttpDownload::setState(int32_t s) { state_ = s; }
// @yo2 0x006a0490
void CHttpDownload::cancel() { setState(CANCEL); }

void CHttpDownload::wait() const {
    while (state() == RUNNING) ygSleep(1);
}

// @yo2 0x0069fe00 the download thread
void CHttpDownload::run(void* self) {
    CHttpDownload* d = (CHttpDownload*)self;
    if (d->toFile) {
        d->setState(httpDownloadToFile(d->url.c_str(), d->path.c_str(), &d->got, &d->size, &d->state_) == 1 ? DONE
                                                                                                          : FAILED);
        free(d->buf);   // the exe frees the old memory body here too
        d->buf = nullptr;
    } else {
        d->setState(httpDownloadToMemory(d->url.c_str(), &d->buf, &d->got, &d->size, &d->state_) == 1 ? DONE
                                                                                                     : FAILED);
    }
}

// @yo2 0x006a0020 not while one runs: drop the old body, start the thread; 0 started, -1 not
int32_t CHttpDownload::start(const vc6::string& u) {
    if (state() == RUNNING) return -1;
    free(buf);
    buf = nullptr;   // fix: the exe leaves it dangling, and the thread (file) or the destructor frees it again
    url = u;
    // fix: the exe sets RUNNING after _beginthread returns, so a thread that finishes first is overwritten and the
    // download looks like it never ends
    int32_t before = state();
    setState(RUNNING);
    thread = ygBeginThread(run, this);
    if (thread == -1) {
        setState(before);
        return -1;
    }
    return 0;
}

// @yo2 0x006a0180
int32_t CHttpDownload::download(const std::string& u) {
    toFile = false;
    return start(vc6::string(u));
}

// @yo2 0x006a0330
int32_t CHttpDownload::downloadToFile(const std::string& u, const std::string& p) {
    toFile = true;
    path = vc6::string(p);
    return start(vc6::string(u));
}

// @yo2 0x006a0830 CTmDownloaded::~CTmDownloaded
// @yo2 0x006a0800 CTmDownloaded deleting destructor
CTmDownloaded::~CTmDownloaded() = default;

CDownloadTask::CDownloadTask() { setTaskName("CDownloadTask"); }

// @yo2 0x006a06a0 CDownloadTask deleting destructor
// @yo2 0x006a06d0 dl goes, then CEasyTask
CDownloadTask::~CDownloadTask() = default;

// @yo2 0x006a04b0 create under parent (priority 10000)
CDownloadTask* CDownloadTask::spawn(CTask* parent) {
    return dynamic_cast<CDownloadTask*>((new CDownloadTask)->create(parent, 10000));
}

// @yo2 0x006a0700
bool CDownloadTask::onInit() { return true; }

// @yo2 0x006a0720 once dl has finished (done or failed): done, and CTmDownloaded to itself
bool CDownloadTask::onMain() {
    if (done) return true;
    if (dl.state() != CHttpDownload::DONE && dl.state() != CHttpDownload::FAILED) return true;
    done = true;
    CTmDownloaded msg(this);
    call(&msg);
    return true;
}

// @yo2 0x006a0850 the thread still uses dl: wait for it
void CDownloadTask::onDestroy() { dl.wait(); }

// @yo2 0x006a0680
bool CDownloadTask::isDone() const { return done; }
