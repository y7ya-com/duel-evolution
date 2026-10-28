// src/System files: CFileLoader (requests, sharing, release), CCryptFile round trip, CKabanManager, debug texts.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/CD3DDevice.h"
#include "System/yo2CryptFile.h"
#include "System/yo2Debug.h"
#include "System/yo2FileLoader.h"
#include "System/yo2KabanManager.h"
#include "System/yo2NameChecker.h"

extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles, g_fakeSaved;
extern std::map<std::string, std::string> g_fakeTextFiles;

struct Checker : CNameChecker {
    uint32_t minLength() const override { return 2; }
    uint32_t maxLength() const override { return 8; }
};

static void put(const char* name, const std::string& s) { g_fakeFiles[name].assign(s.begin(), s.end()); }

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);

    // loader: the first request reads (here at once), later ones share; the last release frees
    put("a.txt", "hello");
    // a 2x1 RGBA PNG: (11 22 33 80) (aa bb cc ff)
    static const uint8_t kPng[] = {
        0x89, 0x50, 0x4e, 0x47, 0xd, 0xa, 0x1a, 0xa, 0x0, 0x0, 0x0, 0xd, 0x49, 0x48, 0x44, 0x52, 0x0, 0x0, 0x0,
        0x2, 0x0, 0x0, 0x0, 0x1, 0x8, 0x6, 0x0, 0x0, 0x0, 0xf4, 0x22, 0x7f, 0x8a, 0x0, 0x0, 0x0, 0x11, 0x49,
        0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x10, 0x54, 0x32, 0x6e, 0x58, 0xb5, 0xfb, 0xcc, 0x7f, 0x0, 0xc,
        0xa1, 0x4, 0x17, 0x66, 0xb1, 0xcd, 0x9d, 0x0, 0x0, 0x0, 0x0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
        0x82};
    g_fakeFiles["b.png"].assign(kPng, kPng + sizeof kPng);
    CFileLoader& fl = g_fileLoader;
    fl.request("a.txt", CFileLoader::FILE);
    fl.request("a.txt", CFileLoader::FILE);
    assert(fl.isLoaded("a.txt", true) && fl.size() == 1);
    const std::vector<uint8_t>* d = fl.file("a.txt");
    assert(d && std::string(d->begin(), d->end()) == "hello" && fl.find("a.txt")->refs == 2);
    assert(!fl.isLoaded("nope", false) && fl.file("nope") == nullptr);
    fl.release("a.txt");
    assert(fl.size() == 1);
    fl.release("a.txt");
    assert(fl.size() == 0);
    fl.request("b.png", CFileLoader::IMAGE);  // decoded into a buffer of the texture size
    CFileLoader::CFileInfo* img = fl.find("b.png");
    assert(img->loaded && !img->loading && img->width == 2 && img->height == 1 && img->pixels[0] == 0x80112233 &&
           img->pixels[1] == 0xffaabbcc);
    fl.printLoadedFiles();
    fl.release("b.png");

    // crypt: length + padded Blowfish blocks; reading it back gives the plain data
    CCryptFile cf;
    const char text[] = "key = value\r\n";
    assert(cf.write("system.bin", text, sizeof text - 1));
    const std::vector<uint8_t>& raw = g_fakeSaved["system.bin"];
    assert(raw.size() == 4 + 16 && raw[0] == 13 && std::memcmp(raw.data() + 4, text, 8) != 0);
    g_fakeFiles["system.bin"] = raw;
    CCryptFile in;
    assert(in.read("system.bin") && in.size() == 13 && std::memcmp(in.memory(), text, 13) == 0);
    CCryptFile other(vc6::string("other"));
    assert(other.read("system.bin") && std::memcmp(other.memory(), text, 13) != 0);
    uint8_t odd[7] = {};
    assert(!cf.encrypt(odd, 0) && !cf.encrypt(odd, 7));  // whole 8-byte blocks only

    // kaban: 3 bytes per card number, totals of the first two
    CKabanManager::create();
    CKabanManager& k = *g_kabanManager;
    k.entry(1) = {1, 3, 0};
    k.entry(0x1000) = {1, 2, 9};
    assert(k.save());
    const std::vector<uint8_t>& kb = g_fakeSaved["\\kaban.bin"];
    assert(kb.size() == 0x3000 && kb[0] == 1 && kb[1] == 3 && kb[0x2fff] == 9);
    g_fakeFiles["\\kaban.bin"] = kb;
    CKabanManager k2;
    assert(k2.load() && k2.flagTotal() == 2 && k2.countTotal() == 5 && k2.entry(0x1000).extra == 9);
    delete g_kabanManager;

    // name checker: bounds, then words, then characters
    g_fakeTextFiles["ng.txt"] = "bad\nevil\n";
    Checker nc;
    nc.loadWords("ng.txt");
    nc.setBadChars(" @");
    assert(nc.check("a") == CNameChecker::TOO_SHORT && nc.check("abcdefghi") == CNameChecker::TOO_LONG);
    assert(nc.check("xbadx") == CNameChecker::BAD_WORD && nc.check("a@b") == CNameChecker::BAD_CHAR);
    assert(nc.check("good") == CNameChecker::OK);

    // debug texts
    assert(std::strcmp(yo2ProductVersion(), "1.0.0.0") == 0);
    assert(std::strcmp(d3dErrorText(0), "D3D_OK") == 0);
    assert(std::strncmp(d3dErrorText(static_cast<int32_t>(0x88760868)), "D3DERR_DEVICELOST", 17) == 0);
    assert(std::strncmp(d3dErrorText(static_cast<int32_t>(0x88760869)), "D3DERR_DRIVERINTERNALERROR", 26) == 0);
    assert(*d3dErrorText(1) == 0);
    std::printf("file_test ok\n");
    return 0;
}
