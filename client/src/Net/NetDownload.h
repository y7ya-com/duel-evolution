// HTTP downloads (the exe's src\Net\yo2Download*.cpp): CHttpDownload fetches one URL on its own thread, into memory
// (the caution screen's notice) or into a file (the patcher's merge.txt / root.txt / pYYMMDDNN.dat); CDownloadTask is
// the CEasyTask that owns one and says when it's finished.
#pragma once
#include <cstdint>
#include <string>

#include "System/vc6.h"
#include "System/yo2EasyTask.h"

// What the downloads need from the platform. The exe uses WinInet: InternetOpenA("YGO", INTERNET_OPEN_TYPE_DIRECT)
// + InternetOpenUrlA(url, 0xc0000000 = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE) for the handle,
// HttpQueryInfoA for the numbers, InternetReadFile, and InternetCloseHandle on both handles.
struct YgHttp;
YgHttp* ygHttpOpenUrl(const char* agent, const char* url);   // null: either open failed
enum : uint32_t { YG_HTTP_STATUS_CODE = 0x13, YG_HTTP_CONTENT_LENGTH = 5 };   // | HTTP_QUERY_FLAG_NUMBER
bool ygHttpQueryNumber(YgHttp* h, uint32_t info, uint32_t* out);
bool ygHttpRead(YgHttp* h, void* buf, uint32_t n, uint32_t* got);   // false = failed (GetLastError has why)
void ygHttpClose(YgHttp* h);
// A read failure: FormatMessageA(GetLastError()) in MessageBoxA(NULL, text, "Error", MB_ICONINFORMATION).
void ygShowLastError(const char* caption);
bool ygDiskFreeBytes(uint64_t* avail);   // GetDiskFreeSpaceExA(NULL): bytes available to the caller
int32_t ygBeginThread(void (*fn)(void*), void* arg);   // _beginthread(fn, 0, arg); -1 = failed
void ygSleep(uint32_t ms);

// FUN_0069f820: more than `bytes` free on the current drive (the patcher's check before it downloads).
bool netHasFreeSpace(uint64_t bytes);
// FUN_0069f8f0 / FUN_0069fb40: the blocking downloads the thread runs. 1 = done; *size = Content-Length first, *got
// counts up while reading, and *state == 4 (cancelled) stops them like a read error.
int32_t httpDownloadToMemory(const char* url, char** buf, uint32_t* got, uint32_t* size, const int32_t* state);
int32_t httpDownloadToFile(const char* url, const char* path, uint32_t* got, uint32_t* size, const int32_t* state);

// The empty base CHttpDownload derives from (vtable 0xbeb27c: only the deleting destructor).
class CHttpDownloadBase {
public:
    virtual ~CHttpDownloadBase();   // FUN_0069f470, deleting FUN_0069f490
};

// CHttpDownload (0x3c): one download at a time.
class CHttpDownload : public CHttpDownloadBase {
public:
    enum State { IDLE, RUNNING, DONE, FAILED, CANCEL };
    CHttpDownload();             // FUN_0069fee0
    ~CHttpDownload() override;   // FUN_0069ff60, deleting FUN_0069ff30

    int32_t download(const std::string& url);                            // FUN_006a0180: into memory
    int32_t downloadToFile(const std::string& url, const std::string& path);   // FUN_006a0330
    int32_t state() const;       // FUN_006a0450
    void setState(int32_t s);    // FUN_006a0470
    void cancel();               // FUN_006a0490: the thread stops at its next read
    void wait() const;           // FUN_006a0850 (CDownloadTask::onDestroy): spin while it runs

    int32_t thread = -1;      // 0x04 _beginthread handle
    vc6::string url;          // 0x08
    vc6::string path;         // 0x18
    int32_t state_ = IDLE;    // 0x28 written by the download thread
    char* buf = nullptr;      // 0x2c the body (+ a NUL) after a memory download
    uint32_t got = 0;         // 0x30 bytes so far
    uint32_t size = 0;        // 0x34 Content-Length
    bool toFile = false;      // 0x38

private:
    int32_t start(const vc6::string& u);   // FUN_006a0020
    static void run(void* self);           // 0x0069fe00 the thread
    struct Layout;
};
struct CHttpDownload::Layout {
    YO2_AT(CHttpDownload, thread, 0x04);
    YO2_AT(CHttpDownload, url, 0x08);
    YO2_AT(CHttpDownload, path, 0x18);
    YO2_AT(CHttpDownload, state_, 0x28);
    YO2_AT(CHttpDownload, buf, 0x2c);
    YO2_AT(CHttpDownload, got, 0x30);
    YO2_AT(CHttpDownload, size, 0x34);
    YO2_AT(CHttpDownload, toFile, 0x38);
};
YO2_SIZEOF(CHttpDownload, 0x3c);

// CTmDownloaded (vtable 0xbeb2c8, tag 0x19): CDownloadTask tells itself the download finished.
struct CTmDownloaded : CTaskMessage {
    enum : int32_t { TAG = 0x19 };
    explicit CTmDownloaded(CTask* sender) : CTaskMessage(TAG), sender(sender) {}
    ~CTmDownloaded() override;   // FUN_006a0830, deleting FUN_006a0800
    CTask* sender;   // 0x10
};
YO2_AT(CTmDownloaded, sender, 0x10);

// CDownloadTask (0xb0). Callers start the download on `dl` themselves and poll isDone().
class CDownloadTask : public CEasyTask {
public:
    static CDownloadTask* spawn(CTask* parent);   // FUN_006a04b0
    CDownloadTask();
    ~CDownloadTask() override;   // FUN_006a06d0, deleting FUN_006a06a0
    bool onInit() override;      // FUN_006a0700
    bool onMain() override;      // FUN_006a0720
    void onDestroy() override;   // FUN_006a0850
    virtual bool isDone() const; // FUN_006a0680 (vtable slot 9)

    CHttpDownload dl;     // 0x70
    bool done = false;    // 0xac set once dl finished (either way)

private:
    struct Layout;
};
struct CDownloadTask::Layout {
    YO2_AT(CDownloadTask, dl, 0x70);
    YO2_AT(CDownloadTask, done, 0xac);
};
YO2_SIZEOF(CDownloadTask, 0xb0);
