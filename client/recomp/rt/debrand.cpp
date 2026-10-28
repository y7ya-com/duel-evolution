// No KONAMI / NAS / TV TOKYO / Kazuki Takahashi marks and no QUIT, DELETE LOGIN RECORD or OFFICIAL WEBSITE on the
// start screens. merge.dat is never edited: the game's file loader tries a loose "merge/<archive path>" before the
// archive, and the runtime resolves reads in the write overlay (YO2_WRITE) first, so at start-up the replacements are
// written there:
//   - every KONAMI or copyright PNG of the title, patcher (menu) and logo movies: a transparent 1x1 PNG;
//   - the title movie (a SWF text dump, data/title/title_flash_01.txt, read from the player's merge.dat) without the
//     PlaceObject2/RemoveObject2 tags of the KONAMI badge (depth 21), the copyright line (23), and btn_quit (25),
//     btn_clear (29) and btn_web (33). ONLINE (40) and OPTIONS (37) keep their rows, the top two of the five, so the
//     menu has no gap. The title only compares a clicked object's name, so the missing buttons never fire.
// The KONAMI logo scene itself is skipped in the patcher: emit.py's IMM_HOOKS turns its `push 2` (0x6deebc, the scene
// id for FUN_0061c2c0) into rc_first_scene, the title. Likewise ONLINE on the title (push 5 at 0x7fa658) goes to the
// login (6), not the rules page (CCautionScene). That page only fetches info.html / stoplogin.html and sets the app's
// +0xc7c, which nothing reads (the app ctor 0x607fd0 clears it; 0x7fc4ff is the only other access).
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "vfs/vfs.h"
extern "C" {
#include "win.h"
}

extern "C" uint32_t rc_first_scene;   // emit.py IMM_HOOKS, defined in rt.c

namespace {
const uint8_t CLEAR_PNG[] = {
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00,
    0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00,
    0x01, 0x7a, 0x5e, 0xab, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82};
const int TITLE_DROP[] = {21, 23, 25, 29, 33};

void put(const std::string& name, const void* data, size_t n) {   // name: the archive's, "data\title\x.png"
    char out[1024];
    std::string g = "merge/" + name;
    for (char& ch : g)
        if (ch == '\\') ch = '/';
    rc_host_path(g.c_str(), 1, out, sizeof out);
    if (FILE* f = fopen(out, "wb")) {
        fwrite(data, 1, n, f);
        fclose(f);
    }
}

std::string lower(std::string s) {
    for (char& ch : s) ch = (char)tolower((unsigned char)ch);
    return s;
}

// The dump is one "SWF::Element::Tag::<Name>->new(...)" block per tag; drop the placements of TITLE_DROP's depths.
std::string filter_title(const std::string& t) {
    const std::string sep = "\nSWF::Element::Tag::";
    std::string out;
    size_t at = 0;
    while (at < t.size()) {
        size_t next = t.find(sep, at + 1);
        if (next == std::string::npos) next = t.size();
        std::string tag = t.substr(at, next - at);
        bool drop = false;
        if (!tag.compare(0, sep.size(), sep) &&
            (!tag.compare(sep.size(), 12, "PlaceObject2") || !tag.compare(sep.size(), 13, "RemoveObject2"))) {
            size_t d = tag.find("Depth => ");
            int depth = d == std::string::npos ? -1 : atoi(tag.c_str() + d + 9);
            for (int x : TITLE_DROP) drop |= depth == x;
        }
        if (!drop) out += tag;
        at = next;
    }
    return out;
}
}   // namespace

extern "C" void rc_debrand(void) {
    char path[1024];
    rc_host_path("merge.dat", 0, path, sizeof path);
    VfsArchive* a = vfsMount(vfsOpenFile(path));
    if (!a) {
        rc_log("debrand: no merge.dat at %s", path);
        return;
    }
    int n = 0;
    for (const VfsEntry& e : a->entries) {
        std::string l = lower(e.name);
        bool start_screen = !l.compare(0, 11, "data\\title\\") || !l.compare(0, 10, "data\\menu\\") ||
                            !l.compare(0, 10, "data\\logo\\");
        if (start_screen && l.size() > 4 && !l.compare(l.size() - 4, 4, ".png") &&
            (l.find("konami") != std::string::npos || l.find("_copy_") != std::string::npos)) {
            put(e.name, CLEAR_PNG, sizeof CLEAR_PNG);
            n++;
        }
    }
    std::vector<uint8_t> t;
    if (const VfsEntry* e = vfsFind(a, "data\\title\\title_flash_01.txt"); e && vfsReadAll(a, *e, &t)) {
        std::string f = filter_title(std::string(t.begin(), t.end()));
        put(e->name, f.data(), f.size());
        rc_log("debrand: %d images cleared, title movie %zu -> %zu bytes", n, t.size(), f.size());
    }
    vfsUnmount(a);
}
