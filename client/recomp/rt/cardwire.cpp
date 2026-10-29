// The card wire: real Yu-Gi-Oh! passcodes on the network, the 2008 exe's own card ids inside it. The exe keeps its
// dense card index (the card_prop index, 1..3255, u16 everywhere, a byte per card in the trunk) and the Konami internal
// id its duel engine stores (14 bits); the server, D1 and every protocol field use passcodes. This file sits between
// the two in the socket layer (wsock.c / web_wsock.c, native and web): it decodes each frame (24-byte header: u16 id,
// u16 length, u32 param, MD5(header[0:8] + data); everything XOR 5a a5 5a 55), rewrites the card fields, re-signs it.
//
// Handshake (per connection, server first): a v2 server opens every connection with 0xCA01 (u16 version 2, u32 hash
// of its card table). If the codec's table has the same hash it answers 0xCA02 (u16 2, u32 hash) and that connection
// is v2 from then on, both ways; the hello itself never reaches the exe. Any other first frame (today's server): the
// connection is passed through byte for byte, nothing is ever sent the server did not get before.
//
// The table: <game>/merge/data/card_passcode.bin (tools/cardart.py `table`): "YO2CARDS", u32 count, u32 placeholder
// index for a hidden monster / spell / trap, then per card index u32 passcode + u16 internal id (LE). Passcode 0 = no
// card. Hidden cards travel as 0xFFFFFF01/02/03 (monster/spell/trap) and become the placeholder index.
//
// v2 = v1 with each card field a u32 passcode, except (S = server -> client, C = client -> server):
//   S 0x3101/02/03, 0x7125/26/27, 0x7129/30/31  trunk tables: the chunks carry (u32 passcode, u8 count) pairs; the
//                         codec rebuilds the 3256-byte table and gives the exe its own 7 chunks between start and end
//   S 0x6202              per 40-byte record 3 more bytes: slots of P0..P7 to map to the card index, to the internal
//                         id, and hints (bit 0: the client's next 0x6423 answer above 1 is a declared card)
//   S 0x6610              items (u32 id, u16 serial, u16 owner); owner 2 = a text id, left alone
//   S 0x5600 / 0x5601     the YO2 id field holds the passcode and the Konami id field 0: the codec fills both
//   S 0x5209 / 0x5212     u32 already: converted when the item type says card (0 / 0 or 1)
//   S 0x6010..0x6012      the replay: its blob's 0x6202 entries carry the same 3 bytes (47 instead of 44). The codec
//                         acks the server itself (0x6013), collects the whole record, converts it, and hands it to the
//                         exe one message per exe 0x6013, as the server does
//   C 0x6423              u32 internal id -> passcode while a 0x6202 hint's card-name request lasts (v <= 1 ends it)
// The exe checks that every inbound frame's param is the previous one + 1: on a v2 connection the codec numbers what
// it delivers itself (the swallowed hello lends its number to the next frame).
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "../../src/Net/md5.h"

#ifndef CW_TEST
extern "C" {
#include "win.h"
}
#define CW_LOG(...) rc_log(__VA_ARGS__)
#else
#define CW_LOG(...) (fprintf(stderr, __VA_ARGS__), fputc('\n', stderr))
#endif

namespace cw {

using Bytes = std::vector<uint8_t>;
struct Frame { uint16_t id; uint32_t param; Bytes data; };

enum : uint16_t { HELLO_S = 0xCA01, HELLO_C = 0xCA02, VERSION = 2 };
enum : uint32_t { HIDDEN_MONSTER = 0xFFFFFF01u, HIDDEN_SPELL = 0xFFFFFF02u, HIDDEN_TRAP = 0xFFFFFF03u };
static const uint8_t KEY[4] = {0x5a, 0xa5, 0x5a, 0x55};
static const unsigned TRUNK = 0xcb8, TRUNK_CHUNK = 0x200;

static uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
static uint16_t be16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
static uint32_t le32(const uint8_t* p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }
static void put32(Bytes& b, uint32_t v) { b.push_back(v >> 24); b.push_back(v >> 16); b.push_back(v >> 8); b.push_back(v); }
static void put16(Bytes& b, uint32_t v) { b.push_back(v >> 8); b.push_back(v); }
static void set32le(uint8_t* p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }
static void set32(uint8_t* p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }

// ---------------------------------------------------------------- the card table

struct Table {
    std::vector<uint32_t> pc;           // index -> passcode
    std::vector<uint16_t> internal;     // index -> Konami internal id
    std::unordered_map<uint32_t, uint16_t> idx;   // passcode -> index
    std::unordered_map<uint16_t, uint32_t> byInternal;   // internal id -> passcode (the first index that has it)
    uint32_t hidden[3] = {0, 0, 0};     // placeholder index: monster, spell, trap
    uint32_t hash = 0;
    bool ok = false;

    bool load(const Bytes& f) {
        if (f.size() < 24 || memcmp(f.data(), "YO2CARDS", 8)) return false;
        uint32_t n = le32(&f[8]);
        if (f.size() != 24 + (size_t)n * 6) return false;
        for (int k = 0; k < 3; k++) hidden[k] = le32(&f[12 + 4 * k]);
        pc.resize(n), internal.resize(n);
        for (uint32_t i = 0; i < n; i++) {
            const uint8_t* e = &f[24 + 6 * (size_t)i];
            pc[i] = le32(e), internal[i] = (uint16_t)(e[4] | e[5] << 8);
            if (pc[i]) idx.emplace(pc[i], (uint16_t)i);
            if (pc[i] && internal[i]) byInternal.emplace(internal[i], pc[i]);
        }
        hash = 2166136261u;   // FNV-1a of the whole file
        for (uint8_t b : f) hash = (hash ^ b) * 16777619u;
        return ok = true;
    }
    uint32_t toIndex(uint32_t p) const {
        if (!p) return 0;
        if (p >= HIDDEN_MONSTER && p <= HIDDEN_TRAP) return hidden[p - HIDDEN_MONSTER];
        auto it = idx.find(p);
        if (it == idx.end()) { CW_LOG("cardwire: passcode %u not in the card table", p); return 0; }
        return it->second;
    }
    uint32_t toInternal(uint32_t p) const { uint32_t i = toIndex(p); return i < internal.size() ? internal[i] : 0; }
    uint32_t fromIndex(uint32_t i) const { return i < pc.size() ? pc[i] : 0; }
    uint32_t fromInternal(uint32_t v) const { auto it = byInternal.find((uint16_t)v); return it == byInternal.end() ? 0 : it->second; }
};

// ---------------------------------------------------------------- one connection

struct Conn {
    const Table* t = nullptr;
    enum { FIRST, PASS, V2 } mode = FIRST;
    uint32_t nextIn = 0;        // the param the exe expects next (v2)
    uint32_t lastOut = 0;       // the exe's last outbound param (for frames the codec sends itself)
    bool announce = false;      // the next 0x6423 answer is a declared card
    // trunk tables being collected: start message, (passcode, count) pairs
    std::map<uint16_t, Bytes> trunkStart;
    std::map<uint16_t, std::vector<std::pair<uint32_t, uint8_t>>> trunkPairs;
    // the replay: collecting from the server, then delivering to the exe
    bool replayIn = false;
    std::vector<Frame> replay;   // v2 as received (header, commands, search init, finish)
    std::vector<Frame> deliver;  // converted, waiting for the exe's 0x6013s
};

// v2 -> v1 0x6202 record: 40 bytes BE + 3 bytes (index mask, internal mask, hints)
static void record6202(Conn& c, const uint8_t* in, uint8_t* out, bool le, int pOff) {
    memcpy(out, in, 40 + (le ? 4 : 0));
    uint8_t toIdx = in[pOff + 32], toInt = in[pOff + 33], hints = in[pOff + 34];
    for (int s = 0; s < 8; s++) {
        uint8_t* p = out + pOff + 4 * s;
        uint32_t v = le ? le32(p) : be32(p);
        if (toIdx >> s & 1) v = c.t->toIndex(v);
        else if (toInt >> s & 1) v = c.t->toInternal(v);
        else continue;
        if (le) set32le(p, v); else set32(p, v);
    }
    if (!le && (hints & 1)) c.announce = true;
}

static Bytes rle(const Bytes& d) {
    Bytes o;
    for (size_t i = 0; i < d.size();) {
        size_t j = i + 1;
        while (j < d.size() && d[j] == d[i] && j - i < 255) j++;
        o.push_back(d[i]), o.push_back((uint8_t)(j - i));
        i = j;
    }
    return o;
}
static Bytes unrle(const Bytes& d) {
    Bytes o;
    for (size_t i = 0; i + 1 < d.size(); i += 2) o.insert(o.end(), d[i + 1], d[i]);
    return o;
}

// The replay record (server/src/duel/duellog.ts buildBlob): a fixed head (475 B), u32 entry count, 40 more bytes, the entries
// (44 B LE in v1, 47 in v2), then the empty fusion and search tails.
static const size_t REPLAY_COUNT_AT = 475, REPLAY_ENTRIES_AT = 519;   // (checked against buildBlob)
static bool convertReplay(Conn& c) {
    if (c.replay.empty() || c.replay[0].id != 0x6010) return false;
    Bytes body;
    for (auto& f : c.replay) if (f.id == 0x6011) body.insert(body.end(), f.data.begin(), f.data.end());
    Bytes blob = unrle(body), out;
    if (blob.size() < REPLAY_ENTRIES_AT) return false;
    uint32_t n = le32(&blob[REPLAY_COUNT_AT]);
    if (blob.size() < REPLAY_ENTRIES_AT + (size_t)n * 47) return false;
    out.assign(blob.begin(), blob.begin() + REPLAY_ENTRIES_AT);
    for (uint32_t k = 0; k < n; k++) {
        uint8_t e[44];
        record6202(c, &blob[REPLAY_ENTRIES_AT + 47 * (size_t)k], e, true, 12);
        out.insert(out.end(), e, e + 44);
    }
    out.insert(out.end(), blob.begin() + REPLAY_ENTRIES_AT + 47 * (size_t)n, blob.end());
    Bytes packed = rle(out), head = c.replay[0].data;
    size_t t = 4;   // u16 magic, u16 version, the title (NUL-terminated), then u32 nSent, u32 nDecoded
    while (t < head.size() && head[t]) t++;
    if (t + 9 > head.size()) return false;
    set32(&head[t + 1], (uint32_t)packed.size()), set32(&head[t + 5], (uint32_t)out.size());
    c.deliver.clear();
    c.deliver.push_back({0x6010, 0, head});
    for (size_t k = 0; k < packed.size(); k += 1024)
        c.deliver.push_back({0x6011, 0, Bytes(packed.begin() + k, packed.begin() + std::min(packed.size(), k + 1024))});
    for (auto& f : c.replay) if (f.id != 0x6010 && f.id != 0x6011) c.deliver.push_back(f);
    return true;
}

// Server -> client, v2 -> v1. Appends what the exe gets (0..n messages); `ack` gets frames to send back to the server.
static void fromServer(Conn& c, const Frame& f, std::vector<Frame>& out, std::vector<Frame>& ack) {
    const Table& t = *c.t;
    const Bytes& d = f.data;
    Bytes o;
    auto pass = [&] { out.push_back({f.id, 0, d}); };
    auto cards = [&](size_t from, size_t stride) {   // records of `stride` bytes from `from`, each a u32 card first -> u16
        o.assign(d.begin(), d.begin() + std::min(from, d.size()));
        for (size_t p = from; p + stride <= d.size(); p += stride) {
            put16(o, t.toIndex(be32(&d[p])));
            o.insert(o.end(), d.begin() + p + 4, d.begin() + p + stride);
        }
        out.push_back({f.id, 0, o});
    };
    switch (f.id) {
    case 0x3101: case 0x7125: case 0x7129: c.trunkStart[f.id] = d, c.trunkPairs[f.id].clear(); return;
    case 0x3102: case 0x7126: case 0x7130:
        for (size_t p = 0; p + 5 <= d.size(); p += 5) c.trunkPairs[f.id - 1].push_back({be32(&d[p]), d[p + 4]});
        return;
    case 0x3103: case 0x7127: case 0x7131: {
        uint16_t s = f.id - 2;
        Bytes table(TRUNK, 0);
        for (auto& [p, n] : c.trunkPairs[s]) {
            uint32_t i = t.toIndex(p);
            if (i >= 1 && i <= TRUNK) table[i - 1] = n;
        }
        out.push_back({s, 0, c.trunkStart[s]});
        for (unsigned k = 0; k < TRUNK; k += TRUNK_CHUNK)
            out.push_back({(uint16_t)(s + 1), 0, Bytes(table.begin() + k, table.begin() + std::min(TRUNK, k + TRUNK_CHUNK))});
        out.push_back({f.id, 0, d});
        c.trunkStart.erase(s), c.trunkPairs.erase(s);
        return;
    }
    case 0x4803: return cards(4, 5);          // s32, (card, u8 new)*
    case 0x4903: return cards(8, 5);          // u32, s32, (card, u8)*
    case 0x4905: return cards(4, 5);          // u32, (card, u8)*
    case 0x5401: return cards(4, 4);          // u32, card*
    case 0x8302: return cards(0, 4);          // card
    case 0x8304: return cards(5, 4);          // u32, u8, card x 4
    case 0x8402: return cards(5, 4);          // u32, u8 n, card x n
    case 0x5205: {                               // u16 n, u16 bits x n, u16 m, card x m
        if (d.size() < 2) return pass();
        size_t m = 2 + 2 * (size_t)be16(&d[0]);
        if (d.size() < m + 2) return pass();
        o.assign(d.begin(), d.begin() + m + 2);
        for (size_t p = m + 2; p + 4 <= d.size(); p += 4) put16(o, t.toIndex(be32(&d[p])));
        out.push_back({f.id, 0, o});
        return;
    }
    case 0x8102:                                 // s32 r; r == 0: card, u8, u8 DP, u16 pack
        if (d.size() >= 8 && !be32(&d[0])) { o.assign(d.begin(), d.begin() + 4); put16(o, t.toIndex(be32(&d[4])));
            o.insert(o.end(), d.begin() + 8, d.end()); out.push_back({f.id, 0, o}); return; }
        return pass();
    case 0x8204:                                 // s32 r; r == 0: u8, 3 x (card, u8 new), u8 DP
        if (d.size() >= 4 + 1 + 15 && !be32(&d[0])) {
            o.assign(d.begin(), d.begin() + 5);
            for (int k = 0; k < 3; k++) put16(o, t.toIndex(be32(&d[5 + 5 * k]))), o.push_back(d[9 + 5 * k]);
            o.insert(o.end(), d.begin() + 20, d.end());
            out.push_back({f.id, 0, o});
            return;
        }
        return pass();
    case 0x5209: case 0x5212: {                  // catalogue items / purchase lines: u32 card when the type says so
        o = d;
        size_t from = f.id == 0x5209 ? 0 : 4, stride = f.id == 0x5209 ? 17 : 13;
        for (size_t p = from; p + stride <= o.size(); p += stride) {
            uint8_t type = o[p + 4];
            if (type == 0 || (f.id == 0x5212 && type == 1)) set32(&o[p + 5], t.toIndex(be32(&o[p + 5])));
        }
        out.push_back({f.id, 0, o});
        return;
    }
    case 0x5600: case 0x5601: {                  // (u32 i, u32 card, u32 Konami id[, u8 copies])
        o = d;
        size_t stride = f.id == 0x5600 ? 13 : 12;
        for (size_t p = 0; p + stride <= o.size(); p += stride) {
            uint32_t pc = be32(&o[p + 4]);
            set32(&o[p + 4], t.toIndex(pc)), set32(&o[p + 8], t.toInternal(pc));
        }
        out.push_back({f.id, 0, o});
        return;
    }
    case 0x7115: case 0x7116:                    // u32 value, u8 op (0: a card, 1: an index)
        if (d.size() >= 5) { put16(o, d[4] == 0 ? t.toIndex(be32(&d[0])) : be32(&d[0]));
            o.insert(o.end(), d.begin() + 4, d.end()); out.push_back({f.id, 0, o}); return; }
        return pass();
    case 0x6202:
        if (d.size() % 43) return pass();
        o.resize(d.size() / 43 * 40);
        for (size_t k = 0; k < d.size() / 43; k++) record6202(c, &d[43 * k], &o[40 * k], false, 8);
        out.push_back({f.id, 0, o});
        return;
    case 0x6610: {                               // 17-byte head, items (u32 id, u16 serial, u16 owner)
        if (d.size() < 17) return pass();
        o.assign(d.begin(), d.begin() + 17);
        for (size_t p = 17; p + 8 <= d.size(); p += 8) {
            uint32_t id = be32(&d[p]);
            uint16_t owner = be16(&d[p + 6]);
            put16(o, owner == 2 ? id : t.toIndex(id) & 0x3fff), put16(o, be16(&d[p + 4])), put16(o, owner), put16(o, 0);
        }
        out.push_back({f.id, 0, o});
        return;
    }
    case 0x6010: c.replayIn = true, c.replay.clear(), c.deliver.clear(); [[fallthrough]];
    case 0x6011: case 0x6016:
        if (!c.replayIn) return pass();
        c.replay.push_back({f.id, 0, d});
        ack.push_back({0x6013, c.lastOut, {}});   // the server sends the next one after each ack
        return;
    case 0x6012:
        if (!c.replayIn) return pass();
        c.replay.push_back({f.id, 0, d}), c.replayIn = false;
        if (!convertReplay(c)) { CW_LOG("cardwire: replay record not understood: dropped"); c.deliver.clear(); return; }
        out.push_back(c.deliver.front()), c.deliver.erase(c.deliver.begin());   // the header now; the rest per exe 0x6013
        return;
    default: return pass();
    }
}

// Client -> server, v1 -> v2 (1:1, or nothing when the codec answers the exe itself). `toExe`: frames for the exe.
static void fromExe(Conn& c, const Frame& f, std::vector<Frame>& out, std::vector<Frame>& toExe) {
    const Table& t = *c.t;
    const Bytes& d = f.data;
    Bytes o;
    switch (f.id) {
    case 0x6013:                                 // a replay being delivered: the next message, the server is done
        if (!c.deliver.empty()) { toExe.push_back(c.deliver.front()); c.deliver.erase(c.deliver.begin()); return; }
        break;
    case 0x8401: case 0x8303:                    // u8 n, card x n / u8, card x 3
        if (d.empty()) break;
        o.push_back(d[0]);
        for (size_t p = 1; p + 2 <= d.size(); p += 2) put32(o, t.fromIndex(be16(&d[p])));
        out.push_back({f.id, f.param, o});
        return;
    case 0x6601: case 0x6603:                    // u32 n, card x n
        if (d.size() < 4) break;
        o.assign(d.begin(), d.begin() + 4);
        for (size_t p = 4; p + 2 <= d.size(); p += 2) put32(o, t.fromIndex(be16(&d[p])));
        out.push_back({f.id, f.param, o});
        return;
    case 0x7000:                                 // u16 sub: 0x7113 add card (u16 card), 0x7119 u8 + 20 x s32 cards
        if (d.size() >= 4 && be16(&d[0]) == 0x7113) {
            o.assign(d.begin(), d.begin() + 2), put32(o, t.fromIndex(be16(&d[2])));
            o.insert(o.end(), d.begin() + 4, d.end());
            out.push_back({f.id, f.param, o});
            return;
        }
        if (d.size() >= 3 + 80 && be16(&d[0]) == 0x7119) {
            o = d;
            for (int k = 0; k < 20; k++) {
                uint32_t v = be32(&o[3 + 4 * k]);
                if (v != 0xffffffffu) set32(&o[3 + 4 * k], t.fromIndex(v));
            }
            out.push_back({f.id, f.param, o});
            return;
        }
        break;
    case 0x6423:   // u32 v: while the server asks for a card name, each pick (v > 1) is an internal id; v <= 1 ends it
        if (c.announce && d.size() >= 4 && be32(&d[0]) > 1) {
            o = d, set32(&o[0], t.fromInternal(be32(&d[0])));
            out.push_back({f.id, f.param, o});
            return;
        }
        c.announce = false;
        break;
    }
    out.push_back(f);
}

// ---------------------------------------------------------------- frames <-> bytes

static Bytes encode(const Frame& f) {
    Bytes b(24 + f.data.size());
    b[0] = f.id >> 8, b[1] = f.id, b[2] = f.data.size() >> 8, b[3] = f.data.size();
    set32(&b[4], f.param);
    memcpy(&b[24], f.data.data(), f.data.size());
    Md5 h;
    h.update(b.data(), 8);
    h.update(f.data.data(), f.data.size());
    h.final(&b[8]);
    for (size_t i = 0; i < b.size(); i++) b[i] ^= KEY[i % 4];
    return b;
}
// One whole frame from the front of `buf` (XOR'd), or false when it is not all there yet. v2 frames may be longer
// than the exe's 1024 bytes (a trunk table, a replay chunk): u16 length either way.
static bool decode(Bytes& buf, Frame& f) {
    if (buf.size() < 24) return false;
    uint8_t h[8];
    for (int i = 0; i < 8; i++) h[i] = buf[i] ^ KEY[i % 4];
    size_t n = (size_t)(h[2] << 8 | h[3]);
    if (buf.size() < 24 + n) return false;
    f.id = (uint16_t)(h[0] << 8 | h[1]), f.param = be32(h + 4), f.data.resize(n);
    for (size_t i = 0; i < n; i++) f.data[i] = buf[24 + i] ^ KEY[(24 + i) % 4];
    buf.erase(buf.begin(), buf.begin() + 24 + n);
    return true;
}

struct Stream {
    Conn c;
    Bytes rawIn, toExe, rawOut;   // bytes from the server not yet whole frames / for the exe / for the server
    Bytes fromExeBuf;             // the exe's partial outbound frame
};

// Bytes from the server: whatever the exe should now read goes to s.toExe, codec replies to s.rawOut.
static void onServerBytes(Stream& s, const uint8_t* p, size_t n) {
    if (s.c.mode == Conn::PASS) { s.toExe.insert(s.toExe.end(), p, p + n); return; }
    s.rawIn.insert(s.rawIn.end(), p, p + n);
    Frame f;
    while (s.c.mode != Conn::PASS && decode(s.rawIn, f)) {
        if (s.c.mode == Conn::FIRST) {
            bool v2 = f.id == HELLO_S && f.data.size() >= 6 && be16(&f.data[0]) == VERSION && s.c.t && s.c.t->ok;
            if (!v2) {   // today's server: this frame and everything after it as it came
                s.c.mode = Conn::PASS;
                Bytes again = encode(f);   // (same bytes: the server's own MD5 and param)
                s.toExe.insert(s.toExe.end(), again.begin(), again.end());
                s.toExe.insert(s.toExe.end(), s.rawIn.begin(), s.rawIn.end());
                s.rawIn.clear();
                return;
            }
            Bytes hi;
            put16(hi, VERSION), put32(hi, s.c.t->hash);
            Bytes reply = encode({HELLO_C, 0, hi});
            s.rawOut.insert(s.rawOut.end(), reply.begin(), reply.end());
            if (be32(&f.data[2]) != s.c.t->hash) {   // another card table: stay v1; the server refuses us in v1
                CW_LOG("cardwire: server card table %08x, ours %08x: not switching", be32(&f.data[2]), s.c.t->hash);
                s.c.mode = Conn::PASS;
                s.toExe.insert(s.toExe.end(), s.rawIn.begin(), s.rawIn.end());
                s.rawIn.clear();
                return;
            }
            s.c.mode = Conn::V2, s.c.nextIn = f.param;   // the hello's number goes to the exe's next frame
            CW_LOG("cardwire: v2 (table %08x)", s.c.t->hash);
            continue;
        }
        std::vector<Frame> out, ack;
        fromServer(s.c, f, out, ack);
        for (auto& o : out) { o.param = s.c.nextIn++; Bytes b = encode(o); s.toExe.insert(s.toExe.end(), b.begin(), b.end()); }
        for (auto& a : ack) { Bytes b = encode(a); s.rawOut.insert(s.rawOut.end(), b.begin(), b.end()); }
    }
}

// Bytes the exe sends: what goes to the server -> s.rawOut, answers the codec gives the exe itself -> s.toExe.
static void onExeBytes(Stream& s, const uint8_t* p, size_t n) {
    if (s.c.mode != Conn::V2) { s.rawOut.insert(s.rawOut.end(), p, p + n); return; }
    s.fromExeBuf.insert(s.fromExeBuf.end(), p, p + n);
    Frame f;
    while (decode(s.fromExeBuf, f)) {
        s.c.lastOut = f.param;
        std::vector<Frame> out, back;
        fromExe(s.c, f, out, back);
        for (auto& o : out) { Bytes b = encode(o); s.rawOut.insert(s.rawOut.end(), b.begin(), b.end()); }
        for (auto& o : back) { o.param = s.c.nextIn++; Bytes b = encode(o); s.toExe.insert(s.toExe.end(), b.begin(), b.end()); }
    }
}

}  // namespace cw

#ifndef CW_TEST
// ---------------------------------------------------------------- wsock.c / web_wsock.c

static cw::Table g_table;
static bool g_tableTried;
static cw::Stream* g_s[64];
static const cw::Table* table() {
    if (!g_tableTried) {
        g_tableTried = true;
        std::string path = std::string(rc_game_dir ? rc_game_dir : ".") + "/merge/data/card_passcode.bin";
        if (FILE* f = fopen(path.c_str(), "rb")) {
            cw::Bytes b;
            uint8_t buf[4096];
            for (size_t n; (n = fread(buf, 1, sizeof buf, f)) > 0;) b.insert(b.end(), buf, buf + n);
            fclose(f);
            CW_LOG("cardwire: %s %s", path.c_str(), g_table.load(b) ? "loaded" : "not understood");
        }
    }
    return g_table.ok ? &g_table : nullptr;
}

extern "C" void rc_cw_open(int s) {   // a connected socket
    if (s < 0 || s >= 64) return;
    delete g_s[s];
    g_s[s] = new cw::Stream;
    g_s[s]->c.t = table();
    if (!g_s[s]->c.t) g_s[s]->c.mode = cw::Conn::PASS;   // no table: never v2 (a v2 server refuses us)
}
extern "C" void rc_cw_close(int s) { if (s >= 0 && s < 64) delete g_s[s], g_s[s] = nullptr; }
// recv: `raw(s, buf, n)` reads the socket (>0 bytes, 0 closed, -1 would block, -2 error); same results back
extern "C" int rc_cw_recv(int s, uint8_t* out, int n, int (*raw)(int, uint8_t*, int), int (*rawSend)(int, const uint8_t*, int)) {
    cw::Stream* st = s >= 0 && s < 64 ? g_s[s] : nullptr;
    if (!st || (st->c.mode == cw::Conn::PASS && st->toExe.empty())) return raw(s, out, n);
    while (st->toExe.empty()) {   // read until there is something for the exe (or nothing more right now)
        uint8_t buf[8192];
        int k = raw(s, buf, sizeof buf);
        if (k <= 0) return k;
        cw::onServerBytes(*st, buf, (size_t)k);
        if (!st->rawOut.empty()) { rawSend(s, st->rawOut.data(), (int)st->rawOut.size()); st->rawOut.clear(); }
    }
    int k = n < (int)st->toExe.size() ? n : (int)st->toExe.size();
    memcpy(out, st->toExe.data(), (size_t)k);
    st->toExe.erase(st->toExe.begin(), st->toExe.begin() + k);
    return k;
}
// send: the exe's bytes; reports them all sent (the codec keeps any partial frame)
extern "C" int rc_cw_send(int s, const uint8_t* p, int n, int (*rawSend)(int, const uint8_t*, int)) {
    cw::Stream* st = s >= 0 && s < 64 ? g_s[s] : nullptr;
    if (!st || st->c.mode != cw::Conn::V2) return rawSend(s, p, n);
    cw::onExeBytes(*st, p, (size_t)n);
    if (!st->rawOut.empty()) {
        if (rawSend(s, st->rawOut.data(), (int)st->rawOut.size()) < 0) return -2;
        st->rawOut.clear();
    }
    return n;
}
extern "C" int rc_cw_v2(int s) { return s >= 0 && s < 64 && g_s[s] && g_s[s]->c.mode == cw::Conn::V2; }
extern "C" int rc_cw_pending(int s) { return s >= 0 && s < 64 && g_s[s] ? (int)g_s[s]->toExe.size() : 0; }
#endif
