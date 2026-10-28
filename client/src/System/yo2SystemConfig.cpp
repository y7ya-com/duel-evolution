#include "yo2SystemConfig.h"

#include <clocale>
#include <cstdio>
#include <cstdlib>

#include "yo2Debug.h"
#include "yo2Registry.h"
#include "yo2StringDB.h"

namespace {

// PTR_s_japanese_00c8cf6c: the game's language order (the setlocale names; the first letter is the file letter).
const char* const kLanguageNames[CSystemConfigManager::LANGUAGE_COUNT] = {
    "japanese", "english", "german", "french", "italian", "spanish", "korean"};
// DAT_00c8cf88: the text code page per language.
const uint32_t kCodePages[CSystemConfigManager::LANGUAGE_COUNT] = {932, 1252, 1252, 1252, 1252, 1252, 949};
// PTR_s_Japanese__00c8cfa4, PTR_DAT_00c8cfc4, PTR_DAT_00c8d018: the duel-log directory levels.
const char* const kLogRegions[] = {"Japanese/", "English/", "German/", "Italian/",
                                   "French/",   "Spanish/", "World/",  "Korean/"};
const char* const kLogNumbers[] = {"0/",  "1/",  "2/",  "3/",  "4/",  "5/",  "6/",  "7/",  "8/",  "9/", "10/",
                                   "11/", "12/", "13/", "14/", "15/", "16/", "17/", "18/", "19/", "20/"};
const char* const kLogLetters[] = {"A/", "B/", "C/", "D/", "E/", "F/", "G/", "H/", "I/", "J/",
                                   "K/", "L/", "M/", "N/", "O/", "P/", "Q/", "R/", "S/", "T/"};
constexpr int kWorldRegion = 6;

const char kSystemTxt[] = "system.txt";
const char kKeySeparator[] = " = ";  // DAT_00c8bcf8
const char kLineEnd[] = "\r\n";      // DAT_00c8bcf4

// The keys of the switches at 0x1b0, in field order.
const char* const kRestrictionKeys[] = {
    "NoChangeUserID",   "NoDeletePlayer",   "NoEditDeck",     "NoProfile",      "NoComment",
    "NoDuelConfig",     "NoDmail",          "NoDuelpass",     "NoBlackList",    "NoFriendList",
    "NoDuelMenu",       "NoPlayerMenuDuel", "NoPlayerMenuChat", "NoPlayerMenuFL", "NoPlayerMenuBL",
    "NoPlayerMenuTRADE", "NoChatInput",     "NoEventLobby",   "AutoPlayLog"};
const char* const kFontKeys[CSystemConfigManager::LANGUAGE_COUNT] = {"fontJn", "fontEn", "fontGn", "fontFn",
                                                                     "fontIn", "fontSn", "fontKn"};
const char* const kSmallFontKeys[CSystemConfigManager::LANGUAGE_COUNT] = {"fontJs", "fontEs", "fontGs", "fontFs",
                                                                          "fontIs", "fontSs", "fontKs"};

std::string str(const vc6::string& s) { return std::string(std::string_view(s)); }

}  // namespace

// @yo2 0x00621ad0 static init: g_systemConfig = new CSystemConfigManager
CSystemConfigManager* g_systemConfig = new CSystemConfigManager;

// ---- ConfigTable ----

void ConfigTable::parseLine(std::string_view line) {
    size_t pos = line.find(kKeySeparator);
    if (pos == std::string_view::npos)
        map_[std::string(line)] = std::string();
    else
        map_[std::string(line.substr(0, pos))] = std::string(line.substr(pos + sizeof kKeySeparator - 1));
}

void ConfigTable::parseLines(const std::vector<std::string>& lines) {
    for (const std::string& line : lines)
        parseLine(line);
}

// @yo2 0x00627910 pair<const string,string>::pair (the map[key] lookup per written line)
std::string ConfigTable::serialize() const {
    std::string text;
    for (const auto& [key, value] : map_)
        text += key + kKeySeparator + value + kLineEnd;
    return text;
}

void ConfigTable::setString(const char* key, std::string_view value) { map_[key] = std::string(value); }

void ConfigTable::setInt(const char* key, int32_t value) {
    char buf[16];
    std::snprintf(buf, sizeof buf, "%d", value);
    map_[key] = buf;
}

void ConfigTable::setBool(const char* key, bool value) { setInt(key, value ? 1 : 0); }

void ConfigTable::getString(const char* key, vc6::string& out) const {
    vc6::string reg;
    if (readSystemRegistryValue(key, reg))
        out = reg;
    else if (const std::string* v = map_.find(key))
        out = vc6::string(*v);
}

void ConfigTable::getInt(const char* key, int32_t& out) const {
    vc6::string reg;
    if (readSystemRegistryValue(key, reg))
        out = std::atoi(reg.c_str());
    else if (const std::string* v = map_.find(key))
        out = std::atoi(v->c_str());
}

void ConfigTable::getBool(const char* key, bool& out) const {
    vc6::string reg;
    if (readSystemRegistryValue(key, reg))
        out = std::atoi(reg.c_str()) == 1;
    else if (const std::string* v = map_.find(key))
        out = std::atoi(v->c_str()) == 1;
}

// @yo2 0x00621ed0 registry override: "system" section, value named after the key, 256-byte buffer
bool readSystemRegistryValue(const vc6::string& key, vc6::string& out) {
    return g_registry && g_registry->yo2.readString("system", key, out, 0x100) == ERROR_SUCCESS;
}

// ---- CSystemConfigManager ----

// @yo2 0x00622030 CSystemConfigManager::CSystemConfigManager
CSystemConfigManager::CSystemConfigManager()
    : fileName_("system.bin"),
      gateServer_("yugi-gate01.yugioh-online.net"),
      version_("release.2006.10.10.001"),
      fonts_{"\x82\x6c\x82\x72 \x82\x6f\x83\x53\x83\x56\x83\x62\x83\x4e",  // MS P Gothic in Shift-JIS
             "Arial", "Arial", "Arial", "Arial", "Arial", "Dotum"},
      smallFonts_{"MS Gothic", "MS Sans Serif", "MS Sans Serif", "MS Sans Serif", "MS Sans Serif", "MS Sans Serif",
                  "Dotum"},
      patchUrl_("http://download.yugioh-online.net/yo2/"),
      homepageUrl_("http://www.yugioh-online.net/"),
      appUrl_("http://www.yugioh-online.net/app/"),
      duelLogUrl_("http://download.yugioh-online.net/duellogs/last/"),
      teamUrl_("http://download.yugioh-online.net/team/"),
      lastLoginId_(""),
      profilesDir_("./profiles") {}

// @yo2 0x00621c10 CSystemConfigManager::~CSystemConfigManager
CSystemConfigManager::~CSystemConfigManager() = default;

// Copies every field save() persists into the table.
void CSystemConfigManager::writeValues() {
    values_.setString("version", version_);
    values_.setInt("language", language_);
    values_.setInt("volume", volume_);
    values_.setBool("dolby", dolby_);
    values_.setBool("fullscreen", fullscreen_);
    values_.setInt("color", colorDepth_);
    values_.setString("gateServer", gateServer_);
    values_.setInt("gatePort", gatePort_);
    for (int i = 0; i < LANGUAGE_COUNT; ++i)
        values_.setString(kFontKeys[i], fonts_[i]);
    for (int i = 0; i < LANGUAGE_COUNT; ++i)
        values_.setString(kSmallFontKeys[i], smallFonts_[i]);
    values_.setString("patchURL", patchUrl_);
    values_.setString("hpURL", homepageUrl_);
    values_.setString("appURL", appUrl_);
    values_.setString("dlogURL", duelLogUrl_);
    values_.setString("teamURL", teamUrl_);
    values_.setString("lastloginID", lastLoginId_);
    values_.setString("profilesDir", profilesDir_);
    values_.setBool("usbDuelpass", usbDuelpass_);
}

// @yo2 0x00623a90 CSystemConfigManager::save: system.bin, plus system_<letter>.bin per language on a dev machine
bool CSystemConfigManager::save() {
    writeValues();
    yo2WriteCryptFile(fileName_.c_str(), values_.serialize());
    if (yo2FileExists(kSystemTxt)) {
        for (int i = 0; i < LANGUAGE_COUNT; ++i) {
            values_.setInt("language", i);
            std::string name = std::string("system_") + kLanguageNames[i][0] + ".bin";
            yo2WriteCryptFile(name.c_str(), values_.serialize());
        }
        values_.setInt("language", language_);
    }
    return true;
}

// @yo2 0x00624a10 CSystemConfigManager::load
bool CSystemConfigManager::load() {
    std::vector<std::string> lines;
    if (yo2FileExists(kSystemTxt))
        yo2ReadTextFileLines(kSystemTxt, lines);
    else
        yo2ReadCryptFileLines(fileName_.c_str(), lines);
    values_.parseLines(lines);

    values_.getString("version", version_);
    values_.getInt("language", language_);
    YO2_ASSERT(language_ >= 0 && language_ <= 6, "Bad language");
    values_.getInt("volume", volume_);
    YO2_ASSERT(volume_ >= 0 && volume_ <= 255, "Bad volume");
    values_.getBool("dolby", dolby_);
    values_.getBool("fullscreen", fullscreen_);
    values_.getInt("color", colorDepth_);
    YO2_ASSERT(colorDepth_ == 16 || colorDepth_ == 24 || colorDepth_ == 32, "Bad color");
    values_.getString("gateServer", gateServer_);
    values_.getInt("gatePort", gatePort_);
    for (int i = 0; i < LANGUAGE_COUNT; ++i)
        values_.getString(kFontKeys[i], fonts_[i]);
    for (int i = 0; i < LANGUAGE_COUNT; ++i)
        values_.getString(kSmallFontKeys[i], smallFonts_[i]);
    values_.getString("patchURL", patchUrl_);
    values_.getString("hpURL", homepageUrl_);
    values_.getString("appURL", appUrl_);
    values_.getString("dlogURL", duelLogUrl_);
    values_.getString("teamURL", teamUrl_);
    values_.getString("lastloginID", lastLoginId_);
    if (lastLoginId_ == "takano")  // a developer's ID left in shipped files
        lastLoginId_ = "";
    values_.getString("profilesDir", profilesDir_);
    yo2MakeDirectory(profilesDir_.c_str());
    values_.getBool("usbDuelpass", usbDuelpass_);
    values_.getInt("capturemode", captureMode_);
    for (int i = 0; i < kRestrictionCount; ++i)
        values_.getBool(kRestrictionKeys[i], restrict_[i]);
    values_.getInt("AutoPlayLogTime", autoPlayLogTime_);

    // system.txt is hand-edited and never written: the last login ID still comes from system.bin.
    if (yo2FileExists(kSystemTxt)) {
        ConfigTable saved;
        lines.clear();
        yo2ReadCryptFileLines(fileName_.c_str(), lines);
        saved.parseLines(lines);
        saved.getString("lastloginID", lastLoginId_);
    }

    applyLanguage();
    applyVolume();
    return true;
}

// @yo2 0x00622b20 CSystemConfigManager::setLanguage
void CSystemConfigManager::setLanguage(int32_t language) {
    language_ = language;
    applyLanguage();
}

// @yo2 0x00626600 CSystemConfigManager::applyLanguage: locale, file letters, code page, then reload every text table
void CSystemConfigManager::applyLanguage() {
    if (language_ > 6 || language_ < 0)
        language_ = 0;
    const char* name = kLanguageNames[language_];
    std::setlocale(LC_COLLATE, name);
    std::setlocale(LC_CTYPE, name);
    std::setlocale(LC_MONETARY, name);
    std::setlocale(LC_TIME, name);
    std::setlocale(LC_NUMERIC, "english");
    yo2SetDuelFileLanguage(name[0], 'e');
    yo2SetTextCodePage(kCodePages[language_]);
    yo2SetFileLanguage(name[0], 'j');
    g_stringDB->load();
    yo2LoadCardText(language_);
    yo2LoadPackText(language_);
    yo2LoadPackInfo();
}

// @yo2 0x00622b60 CSystemConfigManager::setVolume
void CSystemConfigManager::setVolume(int32_t volume) {
    volume_ = volume;
    applyVolume();
}

// @yo2 0x00626720 CSystemConfigManager::applyVolume: out of 0..15 resets to 8
void CSystemConfigManager::applyVolume() {
    if (volume_ > 15 || volume_ < 0)
        volume_ = 8;
    yo2SetSoundVolume(static_cast<uint8_t>(volume_));
}

// @yo2 0x00622ba0 CSystemConfigManager::setDolby
void CSystemConfigManager::setDolby(bool on) {
    dolby_ = on;
    applyDolby();
}

// @yo2 0x00622c00 CSystemConfigManager::setFullscreen
void CSystemConfigManager::setFullscreen(bool on) {
    fullscreen_ = on;
    applyFullscreen();
}

// @yo2 0x00622c60 CSystemConfigManager::setColorDepth
void CSystemConfigManager::setColorDepth(int32_t bits) {
    colorDepth_ = bits;
    applyColorDepth();
}

// @yo2 0x00626750 CSystemConfigManager::fontName
vc6::string CSystemConfigManager::fontName() const { return fonts_[language_]; }

// @yo2 0x006268d0 CSystemConfigManager::smallFontName
vc6::string CSystemConfigManager::smallFontName() const { return smallFonts_[language_]; }

// @yo2 0x00622fe0 CSystemConfigManager::setLastLoginId
void CSystemConfigManager::setLastLoginId(vc6::string id) { lastLoginId_ = id; }

// @yo2 0x00626a60 CSystemConfigManager::duelpassUrl: <hpURL>top/<language>/duelpass/
vc6::string CSystemConfigManager::duelpassUrl() const {
    return vc6::string(str(homepageUrl_) + "top/" + kLanguageNames[language_] + "/duelpass/");
}

// @yo2 0x00626d30 CSystemConfigManager::localizedAppUrl: <appURL><language>/
vc6::string CSystemConfigManager::localizedAppUrl() const {
    return vc6::string(str(appUrl_) + kLanguageNames[language_] + "/");
}

// @yo2 0x006270e0 CSystemConfigManager::duelLogUrl: <dlogURL><Region>/<number>/<letter>/
vc6::string CSystemConfigManager::duelLogUrl(int32_t region, int32_t number, int32_t letter) const {
    return vc6::string(str(duelLogUrl_) + kLogRegions[region] + kLogNumbers[number] + kLogLetters[letter]);
}

// @yo2 0x006273b0 CSystemConfigManager::championshipLogUrl: <dlogURL>World/ChampionShipDuellogs/<id:04><0017>/
vc6::string CSystemConfigManager::championshipLogUrl(int32_t id) const {
    char dir[64];
    std::snprintf(dir, sizeof dir, "ChampionShipDuellogs/%04d%04d/", id, 17);
    return vc6::string(str(duelLogUrl_) + kLogRegions[kWorldRegion] + dir);
}

// @yo2 0x00627790 CSystemConfigManager::clearRestrictions
void CSystemConfigManager::clearRestrictions() {
    for (bool& r : restrict_)
        r = false;
}
