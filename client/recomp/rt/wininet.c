// WININET: the updater's HTTP requests, as a blocking HTTP/1.0 client. Every host goes to YO2_HTTP (default
// 127.0.0.1:8730, YOLaucher's yo2emu HTTP server), the path is kept: the same rewrite net_hook.js does for Wine.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

#include "win.h"

enum { I_ROOT = 1, I_CONN, I_REQ };
typedef struct {
    int kind, done;
    char host[128], path[512], verb[16];
    uint16_t port;
    uint8_t *body, *resp;   // request body (InternetWriteFile), response body
    uint32_t nbody, nresp, pos, status;
} Inet;
#define MAXI 64
static Inet *in_h[MAXI];
static uint32_t inet_new(int kind) {
    for (uint32_t i = 1; i < MAXI; i++)
        if (!in_h[i]) {
            in_h[i] = calloc(1, sizeof(Inet));
            in_h[i]->kind = kind;
            return 0xcc0000u + i;
        }
    return 0;
}
static Inet *H(uint32_t h) { return h > 0xcc0000u && h < 0xcc0000u + MAXI ? in_h[h - 0xcc0000u] : NULL; }

// one request/response over a fresh TCP connection
static void perform(Inet *r) {
    if (r->done) return;
    r->done = 1;
#ifdef __EMSCRIPTEN__
    int rc_web_http(const char *verb, const char *path, const uint8_t *body, uint32_t nbody, uint8_t **resp,
                    uint32_t *nresp);
    r->status = (uint32_t)rc_web_http(r->verb, r->path, r->body, r->nbody, &r->resp, &r->nresp);   // YO2_HTTP + path
    rc_log("wininet: %s http://%s:%u%s -> %u, %u bytes", r->verb, r->host, r->port, r->path, r->status, r->nresp);
    if (!r->status) { free(r->resp); r->resp = NULL; }
#else
    const char *dst = getenv("YO2_HTTP");
    char ip[64] = "127.0.0.1";
    int port = 8730;
    if (dst) sscanf(dst, "%63[^:]:%d", ip, &port);
    rc_log("wininet: %s http://%s:%u%s -> %s:%d", r->verb, r->host, r->port, r->path, ip, port);
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in sa = {.sin_len = sizeof sa, .sin_family = AF_INET, .sin_port = htons((uint16_t)port)};
    inet_pton(AF_INET, ip, &sa.sin_addr);
    if (fd < 0 || connect(fd, (struct sockaddr *)&sa, sizeof sa) < 0) {
        rc_log("wininet: connect %s:%d failed", ip, port);
        if (fd >= 0) close(fd);
        return;
    }
    char hd[1024];
    int n = snprintf(hd, sizeof hd, "%s %s HTTP/1.0\r\nHost: %s\r\nUser-Agent: YGO\r\nContent-Length: %u\r\n\r\n",
                     r->verb, r->path, r->host, r->nbody);
    (void)!write(fd, hd, (size_t)n);
    if (r->nbody) (void)!write(fd, r->body, r->nbody);
    uint8_t *buf = NULL;
    size_t len = 0, cap = 0;
    for (;;) {
        if (len + 65536 > cap) buf = realloc(buf, cap = (cap + 65536) * 2);
        ssize_t k = read(fd, buf + len, 65536);
        if (k <= 0) break;
        len += (size_t)k;
    }
    close(fd);
    uint8_t *sep = buf ? memmem(buf, len, "\r\n\r\n", 4) : NULL;
    if (!sep) { free(buf); return; }
    sscanf((char *)buf, "HTTP/%*s %u", &r->status);
    r->nresp = (uint32_t)(len - (size_t)(sep + 4 - buf));
    r->resp = malloc(r->nresp + 1);
    memcpy(r->resp, sep + 4, r->nresp);
    free(buf);
    rc_log("wininet: -> %u, %u bytes", r->status, r->nresp);
#endif
}

IMP(WININET, InternetOpenA) { RET(5, inet_new(I_ROOT)); }
IMP(WININET, InternetConnectA) {
    uint32_t h = inet_new(I_CONN);
    Inet *c2 = H(h);
    snprintf(c2->host, sizeof c2->host, "%s", GS(ARG(1)) ? GS(ARG(1)) : "");
    c2->port = (uint16_t)(ARG(2) ? ARG(2) : 80);
    RET(8, h);
}
IMP(WININET, HttpOpenRequestA) {
    Inet *cn = H(ARG(0));
    uint32_t h = inet_new(I_REQ);
    Inet *r = H(h);
    if (cn) { memcpy(r->host, cn->host, sizeof r->host); r->port = cn->port; }
    snprintf(r->verb, sizeof r->verb, "%s", ARG(1) ? GS(ARG(1)) : "GET");
    snprintf(r->path, sizeof r->path, "%s", ARG(2) ? GS(ARG(2)) : "/");
    if (r->path[0] != '/') { memmove(r->path + 1, r->path, sizeof r->path - 1); r->path[0] = '/'; }
    RET(8, h);
}
IMP(WININET, HttpSendRequestExA) { RET(5, H(ARG(0)) != NULL); }   // the request goes out at HttpEndRequestA
IMP(WININET, InternetWriteFile) {
    Inet *r = H(ARG(0));
    if (!r) RET(4, 0);
    r->body = realloc(r->body, r->nbody + ARG(2));
    memcpy(r->body + r->nbody, G(ARG(1)), ARG(2));
    r->nbody += ARG(2);
    if (ARG(3)) WR32m(ARG(3), ARG(2));
    RET(4, 1);
}
IMP(WININET, HttpEndRequestA) { Inet *r = H(ARG(0)); if (r) perform(r); RET(4, r && r->resp != NULL); }
IMP(WININET, InternetOpenUrlA) {   // GET a full URL
    uint32_t h = inet_new(I_REQ);
    Inet *r = H(h);
    const char *u = GS(ARG(1)), *p = strstr(u, "://");
    p = p ? p + 3 : u;
    size_t hl = strcspn(p, "/:");
    snprintf(r->host, sizeof r->host, "%.*s", (int)hl, p);
    r->port = p[hl] == ':' ? (uint16_t)atoi(p + hl + 1) : 80;
    const char *path = strchr(p, '/');
    snprintf(r->path, sizeof r->path, "%s", path ? path : "/");
    strcpy(r->verb, "GET");
    perform(r);
    if (!r->resp) { free(r); in_h[h - 0xcc0000u] = NULL; RET(6, 0); }
    RET(6, h);
}
IMP(WININET, HttpQueryInfoA) {   // HTTP_QUERY_STATUS_CODE (19) / CONTENT_LENGTH (5), as text or HTTP_QUERY_FLAG_NUMBER
    Inet *r = H(ARG(0));
    if (!r) RET(5, 0);
    perform(r);
    uint32_t q = ARG(1) & 0xffff, v = q == 19 ? r->status : q == 5 ? r->nresp : 0;
    if (q != 19 && q != 5) { rc_log("wininet: HttpQueryInfo(%u) unsupported", q); RET(5, 0); }
    if (ARG(1) & 0x20000000u) { WR32m(ARG(2), v); WR32m(ARG(3), 4); RET(5, 1); }
    char s[16];
    int n = snprintf(s, sizeof s, "%u", v);
    if (RD32m(ARG(3)) <= (uint32_t)n) { WR32m(ARG(3), (uint32_t)n + 1); RET(5, 0); }
    memcpy(G(ARG(2)), s, (size_t)n + 1);
    WR32m(ARG(3), (uint32_t)n);
    RET(5, 1);
}
IMP(WININET, InternetReadFile) {
    Inet *r = H(ARG(0));
    if (!r) RET(4, 0);
    perform(r);
    uint32_t k = r->nresp - r->pos < ARG(2) ? r->nresp - r->pos : ARG(2);
    if (k) memcpy(G(ARG(1)), r->resp + r->pos, k);
    r->pos += k;
    WR32m(ARG(3), k);
    RET(4, 1);
}
IMP(WININET, InternetCloseHandle) {
    Inet *r = H(ARG(0));
    if (r) { free(r->body); free(r->resp); free(r); in_h[ARG(0) - 0xcc0000u] = NULL; }
    RET(1, 1);
}
