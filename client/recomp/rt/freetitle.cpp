// The title's two free-mode entries (ovr/freemode.c), DECK EDITOR and FREE DUEL, drawn in the title's own button art.
// The title movie's rows 3 and 4 (btn_web, btn_clear: OFFICIAL WEBSITE, DELETE LOGIN RECORD) stay in the movie
// (rt/debrand.cpp); their caption images title_botton_0{3,4}_0{1,2,3}_<lang>.png (normal, hover, pressed) are
// rebuilt here at start-up from the player's merge.dat and written to the overlay, like debrand's images. Nothing
// Konami-made is in the repo: only the glyph positions below.
//
// A caption = the empty bar (row 1's, its text covered by the bar's own colour per row: the bar is flat across) +
// glyph fill masks lifted from the English captions + the outline drawn again around the new string, by the rule the
// game's art follows (1 px light above/left of the fill, medium below/right, a corner shade, 2 px dark, a half-dark
// row above). Re-drawing OFFICIAL WEBSITE this way matches the original by eye. The game's art has no K: it is drawn
// as a stem plus two diagonals of the other letters' weight, outlined like them.
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "vfs/vfs.h"
extern "C" {
#include "win.h"
}

#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#include "../../platform/third_party/stb_image.h"

namespace {
const int W = 384, H = 48, TOP = 12, BOTTOM = 37;   // caption size; the glyphs' fill rows

struct Img {
    std::vector<uint8_t> px;   // RGBA
    uint8_t* at(int x, int y) { return &px[(y * W + x) * 4]; }
};

bool load(VfsArchive* a, int row, int state, Img& out) {
    char name[64];
    snprintf(name, sizeof name, "data\\title\\title_botton_%02d_%02d_e.png", row, state);
    const VfsEntry* e = vfsFind(a, name);
    std::vector<uint8_t> b;
    if (!e || !vfsReadAll(a, *e, &b)) return false;
    int w, h, n;
    uint8_t* p = stbi_load_from_memory(b.data(), (int)b.size(), &w, &h, &n, 4);
    if (!p || w != W || h != H) { stbi_image_free(p); return false; }
    out.px.assign(p, p + W * H * 4);
    stbi_image_free(p);
    return true;
}

// ---- PNG out: stored (uncompressed) deflate, what any PNG reader takes
uint32_t crc(const uint8_t* p, size_t n, uint32_t c = 0xffffffffu) {
    for (size_t i = 0; i < n; i++) {
        c ^= p[i];
        for (int k = 0; k < 8; k++) c = c >> 1 ^ (0xedb88320u & -(c & 1));
    }
    return c;
}
void be32(std::vector<uint8_t>& o, uint32_t v) { for (int s = 24; s >= 0; s -= 8) o.push_back((uint8_t)(v >> s)); }
void chunk(std::vector<uint8_t>& o, const char* type, const std::vector<uint8_t>& d) {
    be32(o, (uint32_t)d.size());
    size_t at = o.size();
    o.insert(o.end(), type, type + 4);
    o.insert(o.end(), d.begin(), d.end());
    be32(o, crc(&o[at], o.size() - at) ^ 0xffffffffu);
}
std::vector<uint8_t> png(Img& im) {
    std::vector<uint8_t> raw, z = {0x78, 0x01}, hdr, o = {0x89, 'P', 'N', 'G', 13, 10, 26, 10};
    for (int y = 0; y < H; y++) raw.push_back(0), raw.insert(raw.end(), im.at(0, y), im.at(0, y) + W * 4);
    uint32_t s1 = 1, s2 = 0;
    for (uint8_t b : raw) s1 = (s1 + b) % 65521, s2 = (s2 + s1) % 65521;
    for (size_t i = 0; i < raw.size(); i += 65535) {
        uint16_t n = (uint16_t)std::min<size_t>(65535, raw.size() - i);
        z.push_back(i + n == raw.size()), z.push_back(n & 0xff), z.push_back(n >> 8), z.push_back(~n & 0xff), z.push_back((uint16_t)~n >> 8);
        z.insert(z.end(), raw.begin() + i, raw.begin() + i + n);
    }
    be32(z, s2 << 16 | s1);
    be32(hdr, W), be32(hdr, H), hdr.insert(hdr.end(), {8, 6, 0, 0, 0});
    chunk(o, "IHDR", hdr), chunk(o, "IDAT", z), chunk(o, "IEND", {});
    return o;
}

// ---- glyphs: where each letter's fill lies in the English captions (caption row, x from, x to)
struct Src { char ch; int row, x0, x1, width; };   // width: re-widened to it in the middle columns (0: as is)
const Src SRC[] = {{'O', 3, 51, 71, 0},  {'F', 3, 73, 90, 0},   {'I', 3, 112, 117, 0}, {'C', 3, 119, 138, 0},
                   {'L', 3, 169, 185, 0}, {'E', 3, 226, 243, 0}, {'T', 3, 295, 315, 0}, {'D', 4, 46, 63, 19},
                   {'R', 4, 236, 252, 18}, {'U', 5, 177, 202, 21}};
using Mask = std::set<std::pair<int, int>>;

struct Style { uint8_t fill[4], light[4], med[4], corner[4], dark[4]; };
bool near(const uint8_t* p, const uint8_t* q) {
    for (int i = 0; i < 3; i++) if (abs(p[i] - q[i]) > 60) return false;
    return p[3] > 200;
}

Mask glyph(char ch, Img* rows, const Style& st, int& width) {
    Mask m;
    if (ch == 'K') {   // the stem, and arms 7 px across (the weight of E and C) meeting it mid-height, cut flush
        width = 19;
        for (int y = TOP; y < BOTTOM; y++) {
            int a = 5 + (abs(y - 24) * 2 + 1) / 3;
            for (int x = 0; x < 5; x++) m.insert({x, y});
            for (int x = a; x < a + 7 && x < width; x++) m.insert({x, y});
        }
        return m;
    }
    for (const Src& s : SRC) {
        if (s.ch != ch) continue;
        Img& im = rows[s.row];
        int w = s.x1 - s.x0, want = s.width ? s.width : w, mid = w / 2;
        std::vector<int> cols;   // source column of each output column
        for (int i = 0; i < w; i++) cols.push_back(i);
        if (want < w) cols.erase(cols.begin() + mid - (w - want) / 2, cols.begin() + mid - (w - want) / 2 + (w - want));
        else cols.insert(cols.begin() + mid, (size_t)(want - w), mid);
        for (int i = 0; i < (int)cols.size(); i++)
            for (int y = TOP; y < BOTTOM; y++)
                if (near(im.at(s.x0 + cols[i], y), st.fill)) m.insert({i, y});
        width = want;
        return m;
    }
    width = 0;
    return m;
}

Img caption(const char* text, Img* rows, const Style& st) {
    Mask M;
    std::vector<std::pair<Mask, int>> gl;
    int total = 0;
    for (const char* c = text; *c; c++) {
        int w = 8;   // a space: 8 + the two gaps
        Mask g = *c == ' ' ? Mask() : glyph(*c, rows, st, w);
        gl.push_back({g, w});
        total += w + (c[1] ? 2 : 0);
    }
    int x = W / 2 - total / 2;
    for (auto& [g, w] : gl) {
        for (auto [gx, gy] : g) M.insert({x + gx, gy});
        x += w + 2;
    }
    Img im = rows[1];   // ONLINE's bar, its text covered by each row's colour at x 60
    for (int y = 0; y < H; y++)
        for (int x = 61; x < 330; x++) memcpy(im.at(x, y), im.at(60, y), 4);
    auto f = [&](int x, int y) { return M.count({x, y}) > 0; };
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++) {
            if (f(x, y)) { memcpy(im.at(x, y), st.fill, 4); continue; }
            const uint8_t* c = nullptr;
            if (f(x + 1, y) || f(x, y + 1)) c = st.light;
            else if (f(x - 1, y) || f(x, y - 1)) c = st.med;
            else if (f(x + 1, y + 1) || f(x - 1, y - 1) || f(x + 1, y - 1) || f(x - 1, y + 1)) c = st.corner;
            else {
                bool d2 = false, d3 = false;
                for (int i = -2; i <= 2; i++) {
                    for (int j = -2; j <= 2; j++) d2 |= f(x + i, y + j);
                    d3 |= f(x + i, y + 3);
                }
                if (d2) c = st.dark;
                else if (d3) for (int i = 0; i < 3; i++) im.at(x, y)[i] = (uint8_t)((im.at(x, y)[i] + st.dark[i]) / 2);
            }
            if (c) memcpy(im.at(x, y), c, 4);
        }
    return im;
}
}   // namespace

// Called by rc_debrand with merge.dat mounted; put(archive name, bytes, size) writes the overlay file.
void rc_free_title(VfsArchive* a, const std::function<void(const std::string&, const void*, size_t)>& put) {
    if (getenv("RC_NOFREEMODE")) return;
    static const char* const TEXT[2] = {"DECK EDITOR", "FREE DUEL"};
    int n = 0;
    for (int state = 1; state <= 3; state++) {
        Img rows[6];
        bool ok = true;
        for (int r = 1; r <= 5; r++) ok = ok && load(a, r, state, rows[r]);
        if (!ok) { rc_log("freetitle: button art for state %d not found", state); return; }
        Style st;   // the colours of row 3's I (fill at x 112-116, rows 12-36)
        Img& i = rows[3];
        memcpy(st.fill, i.at(114, 24), 4), memcpy(st.light, i.at(111, 24), 4), memcpy(st.med, i.at(117, 24), 4);
        memcpy(st.corner, i.at(117, 11), 4), memcpy(st.dark, i.at(110, 19), 4);
        for (int k = 0; k < 2; k++) {
            Img c = caption(TEXT[k], rows, st);
            std::vector<uint8_t> out = png(c);
            for (char lang : std::string("efgijks")) {
                char name[64];
                snprintf(name, sizeof name, "data\\title\\title_botton_%02d_%02d_%c.png", 3 + k, state, lang);
                put(name, out.data(), out.size());
                n++;
            }
        }
    }
    rc_log("freetitle: %d captions (DECK EDITOR, FREE DUEL)", n);
}
