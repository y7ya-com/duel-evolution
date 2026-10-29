// cardwire.cpp for Node (server/parity/bridge.mjs): the client's own codec between py's fake_client (v1, the 2008
// exe's bytes) and the v2 server. `make cardwire_js` -> build/cardwire.mjs. Per connection a Stream; cw_feed runs the
// server's bytes (dir 0) or the client's (dir 1) through it, then cw_out(s, 0) is what the client reads and
// cw_out(s, 1) what goes to the server (cw_len, then cw_clear).
#define CW_TEST
#include "cardwire.cpp"
#include <emscripten/emscripten.h>

using namespace cw;
extern "C" {
EMSCRIPTEN_KEEPALIVE Table* cw_table(const uint8_t* p, int n) {
    Table* t = new Table;
    if (t->load(Bytes(p, p + n))) return t;
    delete t;
    return nullptr;
}
EMSCRIPTEN_KEEPALIVE uint32_t cw_hash(Table* t) { return t ? t->hash : 0; }
EMSCRIPTEN_KEEPALIVE Stream* cw_new(Table* t) {
    Stream* s = new Stream;
    s->c.t = t;
    if (!t) s->c.mode = Conn::PASS;
    return s;
}
EMSCRIPTEN_KEEPALIVE void cw_free(Stream* s) { delete s; }
EMSCRIPTEN_KEEPALIVE void cw_feed(Stream* s, int dir, const uint8_t* p, int n) {
    if (dir == 0) onServerBytes(*s, p, (size_t)n);
    else onExeBytes(*s, p, (size_t)n);
}
EMSCRIPTEN_KEEPALIVE const uint8_t* cw_out(Stream* s, int which) { return which ? s->rawOut.data() : s->toExe.data(); }
EMSCRIPTEN_KEEPALIVE int cw_len(Stream* s, int which) { return (int)(which ? s->rawOut.size() : s->toExe.size()); }
EMSCRIPTEN_KEEPALIVE void cw_clear(Stream* s, int which) { (which ? s->rawOut : s->toExe).clear(); }
}
