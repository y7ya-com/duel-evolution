// cardwire.cpp without the game: pass-through stays byte for byte, the v2 handshake, every converted message family
// both ways (trunk tables, pack/shop results, lists, the duel stream and its hints, the replay record).
// `make cardwire_test` (through tools/buildslot.py), then build/cardwire_test.
#define CW_TEST
#include "cardwire.cpp"

#include <cassert>

using namespace cw;
static int fails;
#define CHECK(c, ...) do { if (!(c)) { fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); fails++; } } while (0)

static void le32w(Bytes& b, uint32_t v) { b.push_back(v); b.push_back(v >> 8); b.push_back(v >> 16); b.push_back(v >> 24); }
static Table makeTable() {   // index 1 Blue-Eyes, 2 Dark Magician, 3 a token; placeholders 1 / 2 / 3
    Bytes f = {'Y', 'O', '2', 'C', 'A', 'R', 'D', 'S'};
    const uint32_t pcs[] = {0, 89631139, 46986414, 73915052}, ints[] = {0, 4007, 4041, 3902};
    le32w(f, 4), le32w(f, 1), le32w(f, 2), le32w(f, 3);
    for (int i = 0; i < 4; i++) le32w(f, pcs[i]), f.push_back(ints[i]), f.push_back(ints[i] >> 8);
    Table t;
    bool ok = t.load(f);
    assert(ok);
    return t;
}
static Bytes bytesOf(std::initializer_list<Frame> fs) {
    Bytes b;
    for (auto& f : fs) { Bytes e = encode(f); b.insert(b.end(), e.begin(), e.end()); }
    return b;
}
static std::vector<Frame> framesOf(Bytes b) {
    std::vector<Frame> out;
    Frame f;
    while (decode(b, f)) out.push_back(f);
    assert(b.empty());
    return out;
}
static Stream* v2Stream(const Table& t, uint32_t helloParam = 0) {
    Stream* s = new Stream;
    s->c.t = &t;
    Bytes hi;
    put16(hi, VERSION), put32(hi, t.hash);
    Bytes b = bytesOf({{HELLO_S, helloParam, hi}});
    onServerBytes(*s, b.data(), b.size());
    return s;
}
static std::vector<Frame> serve(Stream& s, std::initializer_list<Frame> fs) {   // server frames -> what the exe reads
    Bytes b = bytesOf(fs);
    onServerBytes(s, b.data(), b.size());
    auto out = framesOf(s.toExe);
    s.toExe.clear();
    return out;
}
static std::vector<Frame> exeSends(Stream& s, std::initializer_list<Frame> fs) {   // exe frames -> what the server gets
    Bytes b = bytesOf(fs);
    onExeBytes(s, b.data(), b.size());
    auto out = framesOf(s.rawOut);
    s.rawOut.clear();
    return out;
}
static Bytes rec6202(uint32_t type, uint32_t b, std::initializer_list<uint32_t> p, uint8_t toIdx, uint8_t toInt, uint8_t hints) {
    Bytes r;
    put32(r, type), put32(r, b);
    size_t k = 0;
    for (uint32_t v : p) put32(r, v), k++;
    for (; k < 8; k++) put32(r, 0);
    r.push_back(toIdx), r.push_back(toInt), r.push_back(hints);
    return r;
}

int main() {
    Table t = makeTable();
    CHECK(t.toIndex(46986414) == 2 && t.toInternal(89631139) == 4007 && t.fromIndex(3) == 73915052, "table");
    CHECK(t.fromInternal(4041) == 46986414 && t.toIndex(HIDDEN_TRAP) == 3 && t.toIndex(0) == 0, "table lookups");

    {   // today's server: its first frame is not the hello -> both directions byte for byte, nothing injected
        Stream s;
        s.c.t = &t;
        Bytes in = bytesOf({{0x3004, 1, {0, 0, 0, 0}}, {0x4803, 2, {0, 0, 0, 0, 0, 1, 1}}});
        onServerBytes(s, in.data(), 10), onServerBytes(s, in.data() + 10, in.size() - 10);   // split mid-header
        CHECK(s.toExe == in && s.rawOut.empty() && s.c.mode == Conn::PASS, "pass-through in");
        Bytes out = bytesOf({{0x6601, 5, {0, 0, 0, 1, 0, 1}}});
        onExeBytes(s, out.data(), out.size());
        CHECK(s.rawOut == out, "pass-through out");
    }
    {   // a v2 server with another card table: we answer with ours and stay v1
        Stream s;
        s.c.t = &t;
        Bytes hi;
        put16(hi, VERSION), put32(hi, t.hash ^ 1);
        Bytes b = bytesOf({{HELLO_S, 1, hi}, {0x3004, 2, {}}});
        onServerBytes(s, b.data(), b.size());
        auto rep = framesOf(s.rawOut);
        CHECK(rep.size() == 1 && rep[0].id == HELLO_C && be32(&rep[0].data[2]) == t.hash, "hello reply on mismatch");
        CHECK(s.c.mode == Conn::PASS && framesOf(s.toExe).size() == 1, "mismatch: v1, the next frame passed on");
    }
    Stream& s = *v2Stream(t);
    {
        auto rep = framesOf(s.rawOut);
        s.rawOut.clear();
        CHECK(s.c.mode == Conn::V2 && rep.size() == 1 && rep[0].id == HELLO_C, "v2 handshake");
        CHECK(s.toExe.empty(), "the hello never reaches the exe");
    }
    {   // the duel stream: SETCARD P3 -> index, a token's P1 -> internal id, hints -> the next 0x6423 is a card
        Bytes d = rec6202(0x40, 0, {0, 0x0d, 0, 89631139, 5, 0}, 1 << 3, 0, 0);
        Bytes d2 = rec6202(0, 0x48, {9, 73915052, 0}, 0, 1 << 1, 0);
        Bytes d3 = rec6202(0x1b, 0x33, {0x4b}, 0, 0, 1);
        d.insert(d.end(), d2.begin(), d2.end());
        auto out = serve(s, {{0x6202, 7, d}, {0x6202, 8, d3}});   // a connection continuing the exe's count at #7
        CHECK(out.size() == 2 && out[0].param == 7 && out[1].param == 8, "numbered from the server's first frame");
        CHECK(out[0].data.size() == 80 && be32(&out[0].data[8 + 12]) == 1 && be32(&out[0].data[40 + 8 + 4]) == 3902,
              "6202 slots: index %u, internal %u", be32(&out[0].data[20]), be32(&out[0].data[52]));
        CHECK(out[1].data.size() == 40 && s.c.announce, "hints: announce");
        Bytes a, one, b;
        put32(a, 4041), put32(one, 1), put32(b, 4007);
        auto sv = exeSends(s, {{0x6423, 50, a}, {0x6423, 51, b}, {0x6423, 52, one}, {0x6423, 53, a}});
        CHECK(sv.size() == 4 && be32(&sv[0].data[0]) == 46986414 && be32(&sv[1].data[0]) == 89631139 &&
              be32(&sv[2].data[0]) == 1 && be32(&sv[3].data[0]) == 4041 && sv[0].param == 50,
              "6423: every pick a declared card until the confirm, then plain");
    }
    {   // a trunk table: (passcode, count) pairs -> the exe's own 7 chunks of 3256 bytes, between start and end
        Bytes c1, c2;
        put32(c1, 89631139), c1.push_back(3), put32(c1, 46986414), c1.push_back(1);
        put32(c2, 999), c2.push_back(2);   // not in the table: dropped
        uint32_t before = s.c.nextIn;
        auto out = serve(s, {{0x3101, 1, {0, 0, 0, 1}}, {0x3102, 2, c1}, {0x3102, 3, c2}, {0x3103, 4, {}}});
        CHECK(out.size() == 9 && out[0].id == 0x3101 && out[8].id == 0x3103, "trunk: start, 7 chunks, end (%zu)", out.size());
        size_t total = 0;
        for (int k = 1; k <= 7; k++) total += out[k].data.size();
        CHECK(total == 0xcb8 && out[1].data.size() == 0x200 && out[7].data.size() == 0xb8, "trunk chunk sizes");
        CHECK(out[1].data[0] == 3 && out[1].data[1] == 1 && out[1].data[2] == 0, "trunk counts by index");
        CHECK(out[0].param == before && out[8].param == before + 8, "trunk renumbered");
    }
    {   // pack / shop / present results, the lists, the trade view
        Bytes p;
        put32(p, 0), put32(p, 89631139), p.push_back(1), put32(p, HIDDEN_MONSTER), p.push_back(0);
        Bytes l;
        put32(l, 0), put32(l, 46986414), put32(l, 0), l.push_back(1);
        Bytes it;   // a 0x5212 line of each type: card (0), pack card (1), PBIN bit (2)
        put32(it, 0);
        for (uint8_t ty : {0, 1, 2}) put32(it, 1), it.push_back(ty), put32(it, ty == 2 ? 784 : 89631139), it.push_back(1), it.insert(it.end(), 3, 0);
        Bytes tr0, tr1;
        put32(tr0, 46986414), tr0.push_back(0), put32(tr1, 7), tr1.push_back(1);
        Bytes ig;
        put16(ig, 1), put16(ig, 784), put16(ig, 2), put32(ig, 89631139), put32(ig, 46986414);
        Bytes sel;   // 0x6610: 17-byte head, a card item and a text item
        sel.resize(17);
        put32(sel, 89631139), put16(sel, 3), put16(sel, 0), put32(sel, 0x1234), put16(sel, 0), put16(sel, 2);
        auto out = serve(s, {{0x4803, 1, p}, {0x5600, 2, l}, {0x5212, 3, it}, {0x7116, 4, tr0}, {0x7116, 5, tr1},
                             {0x5205, 6, ig}, {0x6610, 7, sel}});
        CHECK(out.size() == 7, "results");
        Bytes p1 = {0, 0, 0, 0, 0, 1, 1, 0, 1, 0};
        CHECK(out[0].data == p1, "4803: cards -> u16 index, hidden -> placeholder");
        CHECK(be32(&out[1].data[4]) == 2 && be32(&out[1].data[8]) == 4041 && out[1].data[12] == 1, "5600: index + Konami id");
        CHECK(be32(&out[2].data[4 + 5]) == 1 && be32(&out[2].data[4 + 13 + 5]) == 1 && be32(&out[2].data[4 + 26 + 5]) == 784,
              "5212: card types converted, the PBIN bit not");
        CHECK(be16(&out[3].data[0]) == 2 && be16(&out[4].data[0]) == 7, "7116: op 0 a card, op 1 an index");
        Bytes ig1 = {0, 1, 3, 0x10, 0, 2, 0, 1, 0, 2};
        CHECK(out[5].data == ig1, "5205");
        CHECK(out[6].data.size() == 17 + 16 && be16(&out[6].data[17]) == 1 && be16(&out[6].data[25]) == 0x1234 &&
              be16(&out[6].data[31]) == 0, "6610: card item -> index, text item kept");
    }
    {   // what the exe sends: a deck, the Startup Present pick, a trade offer
        Bytes dk = {0, 0, 0, 2, 0, 1, 0, 2}, pr = {2, 0, 2, 0, 1}, ad = {0x71, 0x13, 0, 2};
        auto sv = exeSends(s, {{0x6601, 9, dk}, {0x8401, 10, pr}, {0x7000, 11, ad}});
        Bytes dk2 = {0, 0, 0, 2};
        put32(dk2, 89631139), put32(dk2, 46986414);
        CHECK(sv.size() == 3 && sv[0].data == dk2 && sv[0].param == 9, "6601 deck -> passcodes");
        CHECK(sv[1].data.size() == 9 && be32(&sv[1].data[1]) == 46986414 && be32(&sv[1].data[5]) == 89631139, "8401");
        CHECK(sv[2].data.size() == 6 && be32(&sv[2].data[2]) == 46986414, "7000/7113");
    }
    {   // the replay: the codec acks the server itself, then gives the exe the v1 record one message per its 0x6013
        Bytes blob(REPLAY_ENTRIES_AT, 0x11);
        blob[REPLAY_COUNT_AT] = 2, blob[REPLAY_COUNT_AT + 1] = blob[REPLAY_COUNT_AT + 2] = blob[REPLAY_COUNT_AT + 3] = 0;
        for (int k = 0; k < 2; k++) {
            Bytes e;
            le32w(e, 0x40), le32w(e, 0), e.push_back(0), e.push_back(0), e.push_back(0), e.push_back(0);
            for (int sl = 0; sl < 8; sl++) le32w(e, sl == 3 ? 89631139 : sl);
            e.push_back(1 << 3), e.push_back(0), e.push_back(0);
            blob.insert(blob.end(), e.begin(), e.end());
        }
        blob.insert(blob.end(), 12, 0);
        Bytes body = rle(blob);
        Bytes head = {0x08, 0x0a, 0, 0xd8, 'p', 'v', 'p', 0};
        put32(head, body.size()), put32(head, blob.size());
        head.insert(head.end(), 40, 0);
        std::vector<Frame> chunks;
        auto out = serve(s, {{0x6010, 1, head}});
        CHECK(out.empty() && framesOf(s.rawOut).size() == 1, "header: held, acked");
        s.rawOut.clear();
        for (size_t k = 0; k < body.size(); k += 1024) {
            out = serve(s, {{0x6011, 2, Bytes(body.begin() + k, body.begin() + std::min(body.size(), k + 1024))}});
            CHECK(out.empty() && framesOf(s.rawOut).size() == 1, "chunk acked");
            s.rawOut.clear();
        }
        out = serve(s, {{0x6016, 3, {0, 0, 0, 0}}});
        s.rawOut.clear();
        out = serve(s, {{0x6012, 4, {}}});
        CHECK(out.size() == 1 && out[0].id == 0x6010, "the converted header after the record is in");
        Bytes got;
        std::vector<uint16_t> ids = {out[0].id};
        uint32_t nSent = be32(&out[0].data[8]), nDec = be32(&out[0].data[12]);
        for (int k = 0; k < 10; k++) {   // the exe acks each one
            bool held = !s.c.deliver.empty();
            auto sv = exeSends(s, {{0x6013, 60, {}}});
            CHECK(sv.empty() == held, "the exe's acks stay with the codec while it delivers, then go on");
            auto f = framesOf(s.toExe);
            s.toExe.clear();
            if (f.empty()) break;
            ids.push_back(f[0].id);
            if (f[0].id == 0x6011) got.insert(got.end(), f[0].data.begin(), f[0].data.end());
        }
        CHECK(ids.size() >= 4 && ids.back() == 0x6012 && ids[ids.size() - 2] == 0x6016, "delivery order");
        Bytes v1 = unrle(got);
        CHECK(got.size() == nSent && v1.size() == nDec && v1.size() == REPLAY_ENTRIES_AT + 2 * 44 + 12, "v1 sizes");
        CHECK(le32(&v1[REPLAY_ENTRIES_AT + 12 + 12]) == 1 && le32(&v1[REPLAY_ENTRIES_AT + 44 + 12 + 12]) == 1 &&
              le32(&v1[REPLAY_ENTRIES_AT + 12 + 8]) == 2, "entries: P3 -> index, the rest kept");
    }
    if (fails) { fprintf(stderr, "cardwire_test: %d failures\n", fails); return 1; }
    printf("cardwire_test ok\n");
    return 0;
}
