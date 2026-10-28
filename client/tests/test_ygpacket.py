"""Checks the rewritten codec (ygpacket.cpp) against YOLaucher's proto.py, which matches the real client on the wire.
Run: python3 -I test_ygpacket.py   (needs c++ on PATH)
"""
import os
import random
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get("YO2_PROTO_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu/yo2srv/red"))
import proto  # noqa: E402

CLI = r'''
#include "ygpacket.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
// encode <id> <param> <hex>  -> wire hex
// decode <chunk> <hex wire>   -> "<result> <id> <param> <hex data>" per packet, fed <chunk> bytes at a time
static std::vector<uint8_t> unhex(const char* s) {
    std::vector<uint8_t> v;
    for (; s[0] && s[1]; s += 2) { unsigned x; sscanf(s, "%2x", &x); v.push_back((uint8_t)x); }
    return v;
}
struct Feed { std::vector<uint8_t> in; size_t pos = 0; int chunk; std::vector<uint8_t> out; };
static int rd(void* c, uint8_t* b, int n) {
    Feed* f = (Feed*)c;
    if (f->pos >= f->in.size()) return 0;
    int k = n < f->chunk ? n : f->chunk;
    if ((size_t)k > f->in.size() - f->pos) k = (int)(f->in.size() - f->pos);
    memcpy(b, f->in.data() + f->pos, k); f->pos += k; return k;
}
static int wr(void* c, const uint8_t* b, int n) { Feed* f = (Feed*)c; f->out.insert(f->out.end(), b, b + n); return n; }
int main(int argc, char** argv) {
    static YgPacket p;
    Feed f; YgTransport t{&f, rd, wr};
    if (!strcmp(argv[1], "encode")) {
        std::vector<uint8_t> d = unhex(argv[4]);
        memset(&p, 0, sizeof p);
        p.id = atoi(argv[2]); p.param = atoi(argv[3]); p.len = (int)d.size(); memcpy(p.data, d.data(), d.size());
        int r = ygSend(&p, t);
        if (r) { printf("ERR %d\n", r); return 0; }
        for (uint8_t b : f.out) printf("%02x", b);
        printf("\n");
    } else {
        f.chunk = atoi(argv[2]); f.in = unhex(argv[3]);
        memset(&p, 0, sizeof p);
        for (;;) {
            int r = ygRecv(&p, t);
            if (r == YG_PENDING) continue;
            printf("%d %d %d ", r, p.id, p.param);
            if (r == 0) for (int i = 0; i < p.len; i++) printf("%02x", p.data[i]);
            printf("\n");
            if (r != 0 || f.pos >= f.in.size()) break;
        }
    }
}
'''


def main():
    tmp = tempfile.mkdtemp()
    cli = os.path.join(tmp, "cli.cpp")
    exe = os.path.join(tmp, "cli")
    open(cli, "w").write(CLI)
    subprocess.check_call(["c++", "-std=c++17", "-O2", "-Wall", "-I", os.path.join(HERE, "..", "src", "Net"), cli, os.path.join(HERE, "..", "src", "Net", "ygpacket.cpp"), "-o", exe])
    run = lambda *a: subprocess.check_output([exe, *map(str, a)], text=True).split("\n")
    rnd = random.Random(1)
    cases = [(0x2005, 1, b"Ver.080912.00"), (0x0005, 7, b""), (0x6202, 99, bytes(range(256)) * 4)]
    cases += [(rnd.randrange(65536), rnd.randrange(1, 1 << 31), rnd.randbytes(rnd.randrange(0, 1025))) for _ in range(200)]
    for mid, param, data in cases:
        wire = run("encode", mid, param, data.hex())[0]
        assert wire == proto.pack(mid, data, param).hex(), (hex(mid), len(data))
        for chunk in (1, 7, 4096):
            got = run("decode", chunk, proto.pack(mid, data, param).hex())[0].split(" ")
            assert got[:3] == ["0", str(mid), str(param)] and got[3] == data.hex(), (hex(mid), len(data), chunk, got[:3])
    # two packets back to back, then edge cases
    two = proto.pack(1, b"a", 1) + proto.pack(2, b"bc", 2)
    assert [l.split(" ")[:3] for l in run("decode", 3, two.hex())[:2]] == [["0", "1", "1"], ["0", "2", "2"]]
    bad = bytearray(proto.pack(0x3001, b"hello", 1))
    bad[-1] ^= 0xff
    assert run("decode", 4096, bad.hex())[0].split(" ")[0] == "-209"            # bad MD5
    head = bytearray(proto.xor(proto.pack(1, b"", 1)[:24]))
    head[2:4] = (0x401).to_bytes(2, "big")
    assert run("decode", 4096, proto.xor(bytes(head)).hex())[0].split(" ")[0] == "-206"   # len > 0x400
    assert run("decode", 4096, proto.pack(5, b"x", 1)[:10].hex())[0].split(" ")[0] == "-101"  # closed mid-header
    print(f"ok: {len(cases)} packets x 3 chunkings round-trip with proto.py; MD5, length and EOF errors match")


if __name__ == "__main__":
    main()
