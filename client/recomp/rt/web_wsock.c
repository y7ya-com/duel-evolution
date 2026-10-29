// WSOCK32's socket calls on the web, over platform/net's WebSocket gateway (web_net.cpp). #included by wsock.c in
// place of its BSD-socket half, sharing as[] / last_err / rc_post. A socket is a gateway connection; the gateway
// does the DNS, so gethostbyname hands out a placeholder address that connect maps back to the name.
// Env: YO2_SERVER (every connect goes to this host, as natively), YO2_GATEWAY (the WebSocket URL).
void *rc_web_sock_open(const char *host, int port);
int rc_web_sock_status(void *s);   // 0 connecting, 1 open, 2 closed
int rc_web_sock_recv(void *s, uint8_t *buf, int len);
int rc_web_sock_send(void *s, const uint8_t *buf, int len);
int rc_web_sock_event(void *s);
void rc_web_sock_close(void *s);
void rc_web_sleep(uint32_t ms);

static struct { int used; void *ns; } ws[MAXS];
static char hostnames[16][128];   // gethostbyname name k <-> placeholder address 10.255.0.(k+1)

IMP(WSOCK32, ord23) {   // socket(af, type, proto)
    for (int i = 1; i < MAXS; i++)
        if (!ws[i].used) {
            ws[i].used = 1;
            ws[i].ns = NULL;
            memset(&as[i], 0, sizeof as[i]);
            RET(3, SOCK_BASE + (uint32_t)i);
        }
    last_err = 10024;   // WSAEMFILE
    RET(3, 0xffffffffu);
}
IMP(WSOCK32, ord4) {   // connect(s, sockaddr*, len): blocking, as the exe's connect thread expects
    int i = fd_of(ARG(0));
    uint8_t *a = G(ARG(1) + 4);
    char host[128];
    if (a[0] == 10 && a[1] == 255 && a[2] == 0 && a[3] >= 1 && a[3] <= 16) snprintf(host, sizeof host, "%s", hostnames[a[3] - 1]);
    else snprintf(host, sizeof host, "%u.%u.%u.%u", a[0], a[1], a[2], a[3]);
    if (getenv("YO2_SERVER")) snprintf(host, sizeof host, "%s", getenv("YO2_SERVER"));
    int port = rc_mem[ARG(1) + 2] << 8 | rc_mem[ARG(1) + 3];
    if (getenv("YO2_PORT_OFFSET") && port >= 5730 && port < 5800) port += atoi(getenv("YO2_PORT_OFFSET"));   // as native
    rc_log("wsock: connect %s:%d (gateway)", host, port);
    void *s = i > 0 && ws[i].used ? rc_web_sock_open(host, port) : NULL;
    for (uint32_t t0 = rc_ticks_ms(); s && rc_web_sock_status(s) == 0 && rc_ticks_ms() - t0 < 20000;) rc_web_sleep(5);
    if (!s || rc_web_sock_status(s) != 1) {
        if (s) rc_web_sock_close(s);
        last_err = 10061;   // WSAECONNREFUSED
        RET(3, 0xffffffffu);
    }
    ws[i].ns = s;
    rc_cw_open(i);
    RET(3, 0);
}
IMP(WSOCK32, ord3) {   // closesocket
    int i = fd_of(ARG(0));
    if (i > 0) {
        if (ws[i].ns) rc_web_sock_close(ws[i].ns);
        ws[i].used = 0;
        ws[i].ns = NULL;
        memset(&as[i], 0, sizeof as[i]);
        rc_cw_close(i);
    }
    RET(1, 0);
}
static int raw_recv(int i, uint8_t *b, int n) { int k = rc_web_sock_recv(ws[i].ns, b, n); return k < -1 ? -2 : k; }
static int raw_send(int i, const uint8_t *b, int n) { return rc_web_sock_send(ws[i].ns, b, n) < 0 ? -2 : n; }
IMP(WSOCK32, ord16) {   // recv(s, buf, len, flags): blocking until WSAAsyncSelect made the socket non-blocking
    int i = fd_of(ARG(0));
    if (i <= 0 || !ws[i].ns) { last_err = 10057; RET(4, 0xffffffffu); }   // WSAENOTCONN
    int k;
    while ((k = rc_cw_recv(i, G(ARG(1)), (int)ARG(2), raw_recv, raw_send)) == -1 && !as[i].msg) rc_web_sleep(5);
    as[i].armed_read = 1;   // Windows re-enables FD_READ after each recv
    if (k == -1) { last_err = 10035; RET(4, 0xffffffffu); }   // WSAEWOULDBLOCK
    if (k < 0) { last_err = 10054; RET(4, 0xffffffffu); }     // WSAECONNRESET
    RET(4, (uint32_t)k);
}
IMP(WSOCK32, ord19) {   // send(s, buf, len, flags)
    rc_deck_tap(G(ARG(1)), (int)ARG(2));   // decktap.c: the duel deck, for the card-art prefetch
    int i = fd_of(ARG(0));
    int k = i > 0 && ws[i].ns ? (rc_cw_v2(i) ? rc_cw_send(i, G(ARG(1)), (int)ARG(2), raw_send)
                                             : rc_web_sock_send(ws[i].ns, G(ARG(1)), (int)ARG(2))) : -2;
    if (k < 0) { last_err = 10054; RET(4, 0xffffffffu); }
    RET(4, (uint32_t)k);
}
IMP(WSOCK32, ord52) {   // gethostbyname -> a hostent in guest memory (one static per process, as Windows)
    static uint32_t he;
    const char *name = GS(ARG(0));
    int k = 0;
    while (k < 15 && hostnames[k][0] && strcmp(hostnames[k], name)) k++;
    snprintf(hostnames[k], sizeof hostnames[k], "%s", name);
    rc_log("wsock: gethostbyname(%s) -> 10.255.0.%d (gateway resolves)", name, k + 1);
    if (!he) he = rc_halloc(64, 1);
    WR32m(he, he + 40); WR32m(he + 4, he + 24); rc_wr16(rc_mem + he + 8, 2); rc_wr16(rc_mem + he + 10, 4);
    WR32m(he + 12, he + 16); WR32m(he + 16, he + 32); WR32m(he + 20, 0); WR32m(he + 24, 0);
    uint8_t ip[4] = {10, 255, 0, (uint8_t)(k + 1)};
    memcpy(G(he + 32), ip, 4);
    WR8m(he + 40, 0);
    RET(1, he);
}
IMP(WSOCK32, ord101) {   // WSAAsyncSelect(s, hwnd, msg, events)
    int i = fd_of(ARG(0));
    if (i <= 0) RET(4, 0xffffffffu);
    as[i].hwnd = ARG(1);
    as[i].msg = ARG(2);
    as[i].events = ARG(3);
    as[i].armed_read = 1;
    RET(4, 0);
}

void rc_net_poll(void) {
    for (int i = 1; i < MAXS; i++) {
        if (!as[i].msg || as[i].closed || !as[i].armed_read || !ws[i].ns) continue;
        int ev = rc_web_sock_event(ws[i].ns) | (rc_cw_pending(i) ? 1 : 0);   // + frames the codec holds for the exe
        if ((ev & 1) && (as[i].events & 1)) {
            as[i].armed_read = 0;
            rc_post(as[i].hwnd, as[i].msg, SOCK_BASE + i, 1);
        } else if (ev & 0x20) {
            as[i].closed = 1;
            if (as[i].events & 0x20) rc_post(as[i].hwnd, as[i].msg, SOCK_BASE + i, 0x20);
        }
    }
}
