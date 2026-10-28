// net_cli verbs and platform stubs for the HTTP downloads (NetDownload.cpp). ygHttp* is a minimal HTTP/1.0 client
// over POSIX sockets (the test points it at YOLaucher's own HTTP server); the download thread is held until
// "call dl.run" so each step is deterministic.
#include "NetDownload.h"
#include "net_cli.h"

#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>

struct YgHttp {
    int fd = -1;
    std::string pending;   // body bytes that came in with the headers
    uint32_t status = 0, length = 0;
    bool hasLength = false;
};

YgHttp* ygHttpOpenUrl(const char* agent, const char* url) {
    std::string u = url;
    if (u.rfind("http://", 0) != 0) return nullptr;
    u = u.substr(7);
    size_t slash = u.find('/');
    std::string hostport = u.substr(0, slash), path = slash == std::string::npos ? "/" : u.substr(slash);
    size_t colon = hostport.find(':');
    std::string host = hostport.substr(0, colon), port = colon == std::string::npos ? "80" : hostport.substr(colon + 1);
    addrinfo hints{}, *ai = nullptr;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host.c_str(), port.c_str(), &hints, &ai) != 0) return nullptr;
    int fd = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
    bool ok = fd >= 0 && ::connect(fd, ai->ai_addr, ai->ai_addrlen) == 0;
    freeaddrinfo(ai);
    if (!ok) {
        if (fd >= 0) close(fd);
        return nullptr;
    }
    std::string req = "GET " + path + " HTTP/1.0\r\nHost: " + hostport + "\r\nUser-Agent: " + agent + "\r\n\r\n";
    send(fd, req.data(), req.size(), 0);
    YgHttp* h = new YgHttp;
    h->fd = fd;
    std::string head;
    char b[4096];
    size_t end;
    while ((end = head.find("\r\n\r\n")) == std::string::npos) {
        ssize_t n = recv(fd, b, sizeof b, 0);
        if (n <= 0) break;
        head.append(b, n);
    }
    if (end != std::string::npos) {
        h->pending = head.substr(end + 4);
        head.resize(end);
        sscanf(head.c_str(), "HTTP/%*s %u", &h->status);
        for (size_t p = head.find("\r\n"); p != std::string::npos; p = head.find("\r\n", p + 2))
            if (strncasecmp(head.c_str() + p + 2, "Content-Length:", 15) == 0) {
                h->length = (uint32_t)strtoul(head.c_str() + p + 17, nullptr, 10);
                h->hasLength = true;
            }
    }
    printf("http open %s status=%u length=%u\n", url, h->status, h->length);
    return h;
}
bool ygHttpQueryNumber(YgHttp* h, uint32_t info, uint32_t* out) {
    if (info == YG_HTTP_STATUS_CODE && h->status) return *out = h->status, true;
    if (info == YG_HTTP_CONTENT_LENGTH && h->hasLength) return *out = h->length, true;
    return false;
}
static int g_readLimit;   // > 0: reads return at most this many bytes
bool ygHttpRead(YgHttp* h, void* buf, uint32_t n, uint32_t* got) {
    if (g_readLimit > 0 && n > (uint32_t)g_readLimit) n = g_readLimit;
    if (!h->pending.empty()) {
        *got = (uint32_t)std::min<size_t>(n, h->pending.size());
        memcpy(buf, h->pending.data(), *got);
        h->pending.erase(0, *got);
        return true;
    }
    ssize_t r = recv(h->fd, buf, n, 0);
    if (r < 0) return false;
    *got = (uint32_t)r;
    return true;
}
void ygHttpClose(YgHttp* h) {
    close(h->fd);
    delete h;
    printf("http close\n");
}
void ygShowLastError(const char* caption) { printf("messagebox %s\n", caption); }
static uint64_t g_diskFree;
bool ygDiskFreeBytes(uint64_t* avail) { return *avail = g_diskFree, true; }
static void (*g_threadFn)(void*);
static void* g_threadArg;
static bool g_threadFail;
int32_t ygBeginThread(void (*fn)(void*), void* arg) {
    if (g_threadFail) return -1;
    g_threadFn = fn;
    g_threadArg = arg;
    return 0x77;
}
void ygSleep(uint32_t) {}

static CTask* g_dlRoot;
static CDownloadTask* g_dl;
static void hook(CTask* t, CTaskMessage* m) {
    if (m->tag == CTmDownloaded::TAG)
        printf("msg %x self=%d\n", m->tag, static_cast<CTmDownloaded*>(m)->sender == t);
}
NET_CLI("call", "dl.spawn") {
    if (!g_dlRoot) g_dlRoot = CTask::createRoot();
    g_dl = CDownloadTask::spawn(g_dlRoot);
    g_dl->setHook(hook);
    printf("dl spawned %s\n", g_dl->taskName().c_str());
});
NET_CLI("call", "dl.get") { printf("start %d\n", g_dl->dl.download(arg)); });
NET_CLI("call", "dl.file") {   // "<url>,<path>"
    size_t c = arg.find(',');
    printf("start %d\n", g_dl->dl.downloadToFile(arg.substr(0, c), arg.substr(c + 1)));
});
NET_CLI("call", "dl.run") {   // the held thread runs now
    void (*fn)(void*) = g_threadFn;
    g_threadFn = nullptr;
    if (fn) fn(g_threadArg);
});
NET_CLI("call", "dl.cancel") { g_dl->dl.cancel(); });
NET_CLI("call", "dl.threadfail") { g_threadFail = atoi(arg.c_str()) != 0; });
NET_CLI("call", "dl.readlimit") { g_readLimit = atoi(arg.c_str()); });
NET_CLI("call", "dl.frame") {
    CTmMain m;
    g_dlRoot->call(&m);
    CTask::flushDeleted();
    const CHttpDownload& d = g_dl->dl;
    printf("dl state=%d done=%d got=%u size=%u thread=%d tofile=%d\n", d.state(), g_dl->isDone(), d.got, d.size,
           d.thread, d.toFile);
});
NET_CLI("call", "dl.body") {
    const CHttpDownload& d = g_dl->dl;
    printf("body %s\n", d.buf ? hex((const uint8_t*)d.buf, d.size + 1).c_str() : "-");
});
NET_CLI("call", "dl.diskfree") { g_diskFree = strtoull(arg.c_str(), nullptr, 10); });
NET_CLI("call", "dl.hasfree") { printf("hasfree %d\n", netHasFreeSpace(strtoull(arg.c_str(), nullptr, 10))); });
NET_CLI("call", "dl.destroy") {
    g_dl->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_dl = nullptr;
    printf("destroyed\n");
});
