// Gate handshake against YOLaucher's real server, through the platform transport + the rewritten codec.
//   gate_hello [host] [port]     (default 127.0.0.1 5730)  -> exit 0 if 0x2002 then 0x2003 arrive in order
// Server: cd YOLaucher-web/tools/yo2emu && YO2_NO_CLIENT=1 python3.12 run.py 0
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>

#include "net/net.h"

int main(int argc, char** argv) {
    const char* host = argc > 1 ? argv[1] : "127.0.0.1";
    int port = argc > 2 ? atoi(argv[2]) : 5730;
    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    auto late = [&] { return std::chrono::steady_clock::now() > deadline; };
    auto nap = [] { std::this_thread::sleep_for(std::chrono::milliseconds(1)); };

    NetSocket* s = netConnect(host, port);
    if (!s) { printf("FAIL connect %s:%d\n", host, port); return 1; }
    while (netStatus(s) == NET_CONNECTING && !late()) nap();
    if (netStatus(s) != NET_OPEN) { printf("FAIL not open\n"); return 1; }
    YgTransport t = netTransport(s);

    static YgPacket out, in;
    const char ver[] = "Ver.080912.00";   // no NUL on the wire (fake_client.py VERSION)
    out.id = 0x2005;
    out.param = 1;
    out.len = sizeof ver - 1;
    memcpy(out.data, ver, out.len);
    if (int r = ygSend(&out, t)) { printf("FAIL send %d\n", r); return 1; }

    const int want[] = {0x2002, 0x2003};
    int got = 0, lastParam = 0;
    while (got < 2) {
        if (late()) { printf("FAIL timeout after %d of 2\n", got); return 1; }
        int r = ygRecv(&in, t);
        if (r == YG_PENDING) { nap(); continue; }
        if (r != YG_OK) { printf("FAIL recv %d\n", r); return 1; }
        printf("rx 0x%04x param=%d len=%d\n", in.id, in.param, in.len);
        if (got && in.param != lastParam + 1) { printf("FAIL param %d after %d\n", in.param, lastParam); return 1; }
        lastParam = in.param;
        if (in.id != want[got]) { printf("FAIL expected 0x%04x\n", want[got]); return 1; }
        got++;
    }
    netClose(s);
    printf("OK gate hello: 0x2002 then 0x2003\n");
    return 0;
}
