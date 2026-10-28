// src/System yo2SystemConfig / yo2UserConfig: defaults, setters and their apply hooks, URL building, the system.bin
// save/load round trip (and the system.txt developer mode), registry overrides, the per-account file.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/yo2CryptFile.h"
#include "System/yo2Registry.h"
#include "System/yo2UserConfig.h"
#include "System/yo2Widen.h"

extern std::map<std::string, std::string> g_fakeTextFiles, g_fakeRegistry;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles, g_fakeSaved;

// The .bin files on the fake disk as plain text, through the real cipher.
static std::string crypt(const std::string& name) {
    CCryptFile f;
    return f.read(name.c_str()) ? std::string(reinterpret_cast<const char*>(f.memory()), f.size()) : "";
}
static void setCrypt(const std::string& name, const std::string& text) {
    CCryptFile().write(name.c_str(), text.data(), text.size());
}
extern std::string g_fakeConfigLog, g_fakeMd5Input;

static void resetFakes() {
    g_fakeTextFiles.clear();
    g_fakeFiles.clear();
    g_fakeSaved.clear();
    g_fakeRegistry.clear();
    g_fakeConfigLog.clear();
}

static bool logHas(const char* s) { return g_fakeConfigLog.find(s) != std::string::npos; }

static void testDefaults() {
    CSystemConfigManager c;
    assert(c.language() == 0 && c.volume() == 8 && !c.dolby() && !c.fullscreen() && c.colorDepth() == 32);
    assert(c.gateServer() == "yugi-gate01.yugioh-online.net" && c.gatePort() == 5730);
    assert(c.version() == "release.2006.10.10.001");
    assert(c.fontName() == "\x82\x6c\x82\x72 \x82\x6f\x83\x53\x83\x56\x83\x62\x83\x4e" && c.smallFontName() == "MS Gothic");
    assert(c.patchUrl() == "http://download.yugioh-online.net/yo2/");
    assert(c.lastLoginId().empty() && c.profilesDir() == "./profiles");
    assert(c.usbDuelpass() && c.captureMode() == 0 && !c.noEditDeck() && !c.autoPlayLog() && c.autoPlayLogTime() == 60);
    assert(systemConfig() == g_systemConfig && g_systemConfig && g_userConfig);
}

static void testSetters() {
    resetFakes();
    CSystemConfigManager c;
    c.setLanguage(1);
    assert(c.language() == 1 && c.fontName() == "Arial" && c.smallFontName() == "MS Sans Serif");
    assert(g_fakeConfigLog == "duel(ee)file(ej)card(1)pack(1)packinfo" && g_textCodePage == 1252);
    g_fakeConfigLog.clear();
    c.setLanguage(6);  // korean
    assert(logHas("file(kj)") && g_textCodePage == 949 && c.fontName() == "Dotum");
    c.setLanguage(9);  // out of range: back to japanese
    assert(c.language() == 0 && logHas("file(jj)") && g_textCodePage == 932);

    g_fakeConfigLog.clear();
    c.setVolume(12);
    assert(c.volume() == 12 && g_fakeConfigLog == "vol(12)");
    c.setVolume(16);  // apply resets anything outside 0..15
    assert(c.volume() == 8 && logHas("vol(8)"));
    c.setDolby(true);
    c.setFullscreen(true);
    c.setColorDepth(16);
    assert(c.dolby() && c.fullscreen() && c.colorDepth() == 16);
    c.setLastLoginId("kaiba");
    assert(c.lastLoginId() == "kaiba");
    c.setUsbDuelpass(false);
    c.setCaptureMode(3);
    assert(!c.usbDuelpass() && c.captureMode() == 3);
}

static void testUrls() {
    CSystemConfigManager c;
    c.setLanguage(1);
    assert(c.duelpassUrl() == "http://www.yugioh-online.net/top/english/duelpass/");
    assert(c.localizedAppUrl() == "http://www.yugioh-online.net/app/english/");
    assert(c.duelLogBaseUrl() == "http://download.yugioh-online.net/duellogs/last/");
    assert(c.duelLogUrl(3, 12, 2) == "http://download.yugioh-online.net/duellogs/last/Italian/12/C/");
    assert(c.championshipLogUrl(2008) ==
           "http://download.yugioh-online.net/duellogs/last/World/ChampionShipDuellogs/20080017/");
    assert(c.teamUrl() == "http://download.yugioh-online.net/team/" && c.homepageUrl() == "http://www.yugioh-online.net/");
    assert(c.appUrl() == "http://www.yugioh-online.net/app/");
}

static void testRoundTrip() {
    resetFakes();
    CSystemConfigManager a;
    a.setLanguage(2);
    a.setVolume(5);
    a.setFullscreen(true);
    a.setColorDepth(24);
    a.setLastLoginId("yugi");
    assert(a.save());
    const std::string bin = crypt("system.bin");
    assert(bin.find("language = 2\r\n") != std::string::npos && bin.find("fullscreen = 1\r\n") != std::string::npos);
    assert(bin.find("color = 24\r\n") != std::string::npos && bin.find("lastloginID = yugi\r\n") != std::string::npos);
    assert(bin.compare(0, 15, "appURL = http:/") == 0);  // key order
    assert(g_fakeSaved.size() == 1);                        // no system.txt: no per-language copies

    setCrypt("system.bin", crypt("system.bin") + "NoEditDeck = 1\r\nAutoPlayLog = 1\r\nAutoPlayLogTime = 30\r\ncapturemode = 2\r\n");
    g_fakeConfigLog.clear();
    CSystemConfigManager b;
    assert(b.load());
    assert(b.language() == 2 && b.volume() == 5 && b.fullscreen() && !b.dolby() && b.colorDepth() == 24);
    assert(b.lastLoginId() == "yugi" && b.fontName() == "Arial" && b.captureMode() == 2);
    assert(b.noEditDeck() && b.autoPlayLog() && !b.noComment() && b.autoPlayLogTime() == 30);
    assert(logHas("mkdir(./profiles)") && logHas("card(2)") && logHas("vol(5)"));
    b.clearRestrictions();
    assert(!b.noEditDeck() && !b.autoPlayLog() && b.autoPlayLogTime() == 30);

    // "takano" never survives a load; the registry beats the file
    setCrypt("system.bin", crypt("system.bin") + "lastloginID = takano\r\n");
    g_fakeRegistry["SOFTWARE\\KONAMI\\Yu-Gi-Oh! ONLINE 2\\system\\gatePort"] = "9999";
    g_fakeRegistry["SOFTWARE\\KONAMI\\Yu-Gi-Oh! ONLINE 2\\system\\dolby"] = "1";
    CSystemConfigManager r;
    r.load();
    assert(r.lastLoginId().empty() && r.gatePort() == 9999 && r.dolby());

    // a missing file keeps the defaults
    resetFakes();
    CSystemConfigManager d;
    assert(d.load() && d.gatePort() == 5730 && d.volume() == 8 && d.values().size() == 0);
}

// yaneSDK ReadLine's rules: only CR LF ends a line, the last one needs none, 255 characters stop the reading
static void testCryptLines() {
    resetFakes();
    setCrypt("x.bin", "a\r\nb\nc\r\n\r\nd");
    std::vector<std::string> lines;
    assert(yo2ReadCryptFileLines("x.bin", lines));
    assert((lines == std::vector<std::string>{"a", "b\nc", "", "d"}));
    setCrypt("y.bin", "ok\r\n" + std::string(255, 'x') + "\r\nlost\r\n");
    lines.clear();
    assert(yo2ReadCryptFileLines("y.bin", lines) && (lines == std::vector<std::string>{"ok"}));
    assert(!yo2ReadCryptFileLines("missing.bin", lines));
}

// CRegistryManager: a section is a subkey of the product key ("" = the key itself); a miss leaves out alone
static void testRegistry() {
    resetFakes();
    CRegistryManager m("SOFTWARE\\X");
    assert(m.writeString("s", "a", "hello") == ERROR_SUCCESS && g_fakeRegistry["SOFTWARE\\X\\s\\a"] == "hello");
    assert(m.writeString("", "path", "C:\\yo2") == ERROR_SUCCESS && g_fakeRegistry["SOFTWARE\\X\\path"] == "C:\\yo2");
    vc6::string out = "keep";
    assert(m.readString("s", "missing", out, 0x100) != ERROR_SUCCESS && std::strcmp(out.c_str(), "keep") == 0);
    assert(m.readString("s", "a", out, 0x100) == ERROR_SUCCESS && std::strcmp(out.c_str(), "hello") == 0);
}

static void testDevConfig() {
    resetFakes();
    g_fakeTextFiles["system.txt"] = "language = 1\r\ngateServer = localhost\r\nlastloginID = fromtxt\r\nbare line\r\n";
    setCrypt("system.bin", "lastloginID = frombin\r\ngateServer = ignored\r\n");
    CSystemConfigManager c;
    c.load();
    assert(c.language() == 1 && c.gateServer() == "localhost" && c.lastLoginId() == "frombin");
    const std::string* bare = c.values().find("bare line");
    assert(bare && bare->empty());

    assert(c.save());
    assert(g_fakeSaved.count("system_j.bin") && g_fakeSaved.count("system_k.bin"));
    assert(crypt("system_g.bin").find("language = 2\r\n") != std::string::npos);
    assert(crypt("system.bin").find("language = 1\r\n") != std::string::npos);
    assert(c.values().find("language") && *c.values().find("language") == "1");  // restored after the copies
    assert(crypt("system.bin").find("bare line = \r\n") != std::string::npos);
}

static void testUserConfig() {
    resetFakes();
    CUserConfigManager u;
    assert(!u.save() && !u.load() && !u.hasUser());

    vc6::string name = CUserConfigManager::userFileName("yugi");
    assert(g_fakeMd5Input == "jinjinyugijinjin" && name.size() == 32);
    u.setUser("yugi");
    assert(u.hasUser() && u.userId() == "yugi");
    std::string path = std::string("./profiles\\") + name.c_str() + ".bin";
    assert(u.filePath() == path);

    u.setSavePassword(true);
    u.setPassword("blue-eyes");
    assert(u.save());
    assert(crypt(path) == "id = yugi\r\nissavepassword = 1\r\npassword = blue-eyes\r\n");

    CUserConfigManager v;
    v.setUser("yugi");
    assert(v.load() && v.savePassword() && v.password() == "blue-eyes" && v.userId() == "yugi");
}

int main() {
    testDefaults();
    testSetters();
    testUrls();
    testRoundTrip();
    testCryptLines();
    testRegistry();
    testDevConfig();
    testUserConfig();
    std::puts("config_test ok");
}
