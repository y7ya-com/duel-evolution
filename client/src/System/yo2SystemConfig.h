// yo2SystemConfig.cpp: the client's machine-wide settings (language, volume, screen, server, fonts, web URLs, the
// last login ID, the operator's feature switches).
//
// They live in "system.bin", an encrypted text file of "key = value" lines. A developer machine also has a plain
// "system.txt": when it exists it is read instead (system.bin then only supplies the last login ID), and save()
// additionally writes one system_<letter>.bin per language, ready to ship. Any value can be overridden from the
// registry ("system" section, see readSystemRegistryValue).
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "vc6.h"

// ---- what this file calls outside System (tests: tests/system/stubs.cpp) ----

// 0x00528640: a file of that name opens (CreateFileA OPEN_EXISTING).
bool yo2FileExists(const char* name);
// yaneSDK CFile Read (vtable slot 7) then ReadLine (slot 13) until it fails: the lines of a plain text file, line
// ends removed. False (no lines) if the file can't be read.
bool yo2ReadTextFileLines(const char* name, std::vector<std::string>& lines);
// The same through CCryptFile (the "nameko!" cipher over CFile); and the whole text encrypted back. Both in
// yo2CryptFile.cpp.
bool yo2ReadCryptFileLines(const char* name, std::vector<std::string>& lines);
bool yo2WriteCryptFile(const char* name, const std::string& data);
// CRT _mkdir (0x00b0c5f5).
void yo2MakeDirectory(const char* path);
// What applyLanguage() pushes into other modules.
void yo2SetFileLanguage(char letter, char fallback);      // yaneSDK CFile's '?' letters, DAT_00c7f1d0/1
void yo2SetDuelFileLanguage(char letter, char fallback);  // the duel's file letters, DAT_012aaa21/20
void yo2SetTextCodePage(uint32_t codePage);               // DAT_0127035c, the MultiByteToWideChar code page
void yo2LoadCardText(int32_t language);                   // 0x0073b640 data/bin/CARD_*.bin
void yo2LoadPackText(int32_t language);                   // 0x00840a90 data/cardpack/PACK_*.bin
void yo2LoadPackInfo();                                   // 0x0084e690 data/cardpack/packinfo_?.txt
// 0x00686450 (Swf sound): master volume level 0..15.
bool yo2SetSoundVolume(uint8_t level);

// ---- the key/value table ----

// Both config managers keep a VC6 std::map<std::string, std::string> at +0x04: every "key = value" line read, plus
// whatever save() puts back. The get/set helpers stand for functions outside this file (0x00617b80 getString,
// 0x00617e80 getInt, 0x006180b0 getBool, 0x00616d30 setString, 0x00616f60 setInt, 0x00617160 setBool). A getter
// leaves `out` alone when neither the registry nor the table has the key.
class ConfigTable {
public:
    // @yo2 0x00627830 map<string,string>::map (allocates the head node)
    ConfigTable() = default;

    // "key = value"; a line without " = " is all key, with an empty value. A later line wins.
    void parseLine(std::string_view line);
    void parseLines(const std::vector<std::string>& lines);
    // Every entry as "key = value\r\n", in key order.
    std::string serialize() const;

    void setString(const char* key, std::string_view value);
    void setInt(const char* key, int32_t value);
    void setBool(const char* key, bool value);
    void getString(const char* key, vc6::string& out) const;
    void getInt(const char* key, int32_t& out) const;
    void getBool(const char* key, bool& out) const;
    const std::string* find(const char* key) const { return map_.find(key); }
    size_t size() const { return map_.size(); }

private:
    vc6::map<std::string, std::string> map_;
};
YO2_SIZEOF(ConfigTable, 0x10);

// 0x00621ed0: the registry value `key` in the "system" section, if there is one. Consulted before the table by
// every ConfigTable getter (so by both config managers).
bool readSystemRegistryValue(const vc6::string& key, vc6::string& out);

// ---- the manager ----

class CSystemConfigManager final {
public:
    enum : int32_t { LANGUAGE_COUNT = 7 };  // japanese english german french italian spanish korean

    CSystemConfigManager();
    ~CSystemConfigManager();
    CSystemConfigManager(const CSystemConfigManager&) = delete;
    CSystemConfigManager& operator=(const CSystemConfigManager&) = delete;

    // The vtable, in the exe's slot order (no virtual destructor).
    virtual bool save();
    virtual bool load();
    virtual void setLanguage(int32_t language);
    // @yo2 0x00622b40 CSystemConfigManager::language
    virtual int32_t language() const { return language_; }
    virtual void applyLanguage();
    virtual void setVolume(int32_t volume);
    // @yo2 0x00622b80 CSystemConfigManager::volume
    virtual int32_t volume() const { return volume_; }
    virtual void applyVolume();
    virtual void setDolby(bool on);
    // @yo2 0x00622bc0 CSystemConfigManager::dolby
    virtual bool dolby() const { return dolby_; }
    // @yo2 0x00622be0 CSystemConfigManager::applyDolby (empty)
    virtual void applyDolby() {}
    virtual void setFullscreen(bool on);
    // @yo2 0x00622c20 CSystemConfigManager::fullscreen
    virtual bool fullscreen() const { return fullscreen_; }
    // @yo2 0x00622c40 CSystemConfigManager::applyFullscreen (empty)
    virtual void applyFullscreen() {}
    virtual void setColorDepth(int32_t bits);
    // @yo2 0x00622c80 CSystemConfigManager::colorDepth
    virtual int32_t colorDepth() const { return colorDepth_; }
    // @yo2 0x00622ca0 CSystemConfigManager::applyColorDepth (empty)
    virtual void applyColorDepth() {}
    // @yo2 0x00622cc0 CSystemConfigManager::gateServer
    virtual vc6::string gateServer() const { return gateServer_; }
    // @yo2 0x00622e40 CSystemConfigManager::gatePort
    virtual int32_t gatePort() const { return gatePort_; }
    virtual vc6::string fontName() const;       // fontXn: the current language's normal font
    virtual vc6::string smallFontName() const;  // fontXs: its second (small) font
    // @yo2 0x00622e60 CSystemConfigManager::patchUrl
    virtual vc6::string patchUrl() const { return patchUrl_; }
    virtual void setLastLoginId(vc6::string id);
    // @yo2 0x00623190 CSystemConfigManager::lastLoginId
    virtual vc6::string lastLoginId() const { return lastLoginId_; }
    // @yo2 0x00623310 CSystemConfigManager::homepageUrl
    virtual vc6::string homepageUrl() const { return homepageUrl_; }
    virtual vc6::string duelpassUrl() const;
    // @yo2 0x00623490 CSystemConfigManager::appUrl
    virtual vc6::string appUrl() const { return appUrl_; }
    virtual vc6::string localizedAppUrl() const;
    virtual vc6::string duelLogUrl(int32_t region, int32_t number, int32_t letter) const;
    virtual vc6::string championshipLogUrl(int32_t id) const;
    // @yo2 0x00626f60 CSystemConfigManager::duelLogBaseUrl
    virtual vc6::string duelLogBaseUrl() const { return duelLogUrl_; }
    // @yo2 0x00627610 CSystemConfigManager::teamUrl
    virtual vc6::string teamUrl() const { return teamUrl_; }
    // @yo2 0x00623610 CSystemConfigManager::profilesDir
    virtual vc6::string profilesDir() const { return profilesDir_; }
    // @yo2 0x00623790 CSystemConfigManager::setUsbDuelpass
    virtual void setUsbDuelpass(bool on) { usbDuelpass_ = on; }
    // @yo2 0x006237b0 CSystemConfigManager::usbDuelpass
    virtual bool usbDuelpass() const { return usbDuelpass_; }
    // @yo2 0x006237d0 CSystemConfigManager::setCaptureMode
    virtual void setCaptureMode(int32_t mode) { captureMode_ = mode; }
    // @yo2 0x006237f0 CSystemConfigManager::captureMode
    virtual int32_t captureMode() const { return captureMode_; }
    // The operator's switches (all off by default) that hide features, e.g. for event or kiosk machines.
    // @yo2 0x00623810 CSystemConfigManager::noChangeUserId
    virtual bool noChangeUserId() const { return restrict_[0]; }
    // @yo2 0x00623830 CSystemConfigManager::noDeletePlayer
    virtual bool noDeletePlayer() const { return restrict_[1]; }
    // @yo2 0x00623850 CSystemConfigManager::noEditDeck
    virtual bool noEditDeck() const { return restrict_[2]; }
    // @yo2 0x00623870 CSystemConfigManager::noProfile
    virtual bool noProfile() const { return restrict_[3]; }
    // @yo2 0x00623890 CSystemConfigManager::noComment
    virtual bool noComment() const { return restrict_[4]; }
    // @yo2 0x006238b0 CSystemConfigManager::noDuelConfig
    virtual bool noDuelConfig() const { return restrict_[5]; }
    // @yo2 0x006238d0 CSystemConfigManager::noDmail
    virtual bool noDmail() const { return restrict_[6]; }
    // @yo2 0x006238f0 CSystemConfigManager::noDuelpass
    virtual bool noDuelpass() const { return restrict_[7]; }
    // @yo2 0x00623910 CSystemConfigManager::noBlackList
    virtual bool noBlackList() const { return restrict_[8]; }
    // @yo2 0x00623930 CSystemConfigManager::noFriendList
    virtual bool noFriendList() const { return restrict_[9]; }
    // @yo2 0x00623950 CSystemConfigManager::noDuelMenu
    virtual bool noDuelMenu() const { return restrict_[10]; }
    // @yo2 0x00623970 CSystemConfigManager::noPlayerMenuDuel
    virtual bool noPlayerMenuDuel() const { return restrict_[11]; }
    // @yo2 0x00623990 CSystemConfigManager::noPlayerMenuChat
    virtual bool noPlayerMenuChat() const { return restrict_[12]; }
    // @yo2 0x006239b0 CSystemConfigManager::noPlayerMenuFriendList
    virtual bool noPlayerMenuFriendList() const { return restrict_[13]; }
    // @yo2 0x006239d0 CSystemConfigManager::noPlayerMenuBlackList
    virtual bool noPlayerMenuBlackList() const { return restrict_[14]; }
    // @yo2 0x006239f0 CSystemConfigManager::noPlayerMenuTrade
    virtual bool noPlayerMenuTrade() const { return restrict_[15]; }
    // @yo2 0x00623a10 CSystemConfigManager::noChatInput
    virtual bool noChatInput() const { return restrict_[16]; }
    // @yo2 0x00623a30 CSystemConfigManager::noEventLobby
    virtual bool noEventLobby() const { return restrict_[17]; }
    // @yo2 0x00623a50 CSystemConfigManager::autoPlayLog
    virtual bool autoPlayLog() const { return restrict_[18]; }
    // @yo2 0x00623a70 CSystemConfigManager::autoPlayLogTime
    virtual int32_t autoPlayLogTime() const { return autoPlayLogTime_; }
    virtual void clearRestrictions();

    const vc6::string& version() const { return version_; }
    const ConfigTable& values() const { return values_; }

private:
    struct Layout;
    static constexpr int kRestrictionCount = 19;
    void writeValues();

    ConfigTable values_;                          // 0x004 every key read, plus what save() writes back
    vc6::string fileName_;                        // 0x014 "system.bin"
    int32_t language_ = 0;                        // 0x024 index into kLanguageNames below, 0..6
    int32_t volume_ = 8;                          // 0x028 0..15 (load accepts up to 255; apply resets to 8)
    bool dolby_ = false;                          // 0x02c
    bool fullscreen_ = false;                     // 0x02d
    int32_t colorDepth_ = 32;                     // 0x030 "color": 16, 24 or 32
    vc6::string gateServer_;                      // 0x034
    int32_t gatePort_ = 5730;                     // 0x044
    vc6::string version_;                         // 0x048
    vc6::string fonts_[LANGUAGE_COUNT];           // 0x058 fontJn fontEn fontGn fontFn fontIn fontSn fontKn
    vc6::string smallFonts_[LANGUAGE_COUNT];      // 0x0c8 fontJs ... fontKs
    vc6::string patchUrl_;                        // 0x138
    vc6::string homepageUrl_;                     // 0x148 "hpURL"
    vc6::string appUrl_;                          // 0x158
    vc6::string duelLogUrl_;                      // 0x168 "dlogURL"
    vc6::string teamUrl_;                         // 0x178
    vc6::string lastLoginId_;                     // 0x188 "lastloginID"
    vc6::string profilesDir_;                     // 0x198
    bool usbDuelpass_ = true;                     // 0x1a8
    int32_t captureMode_ = 0;                     // 0x1ac
    bool restrict_[kRestrictionCount] = {};       // 0x1b0 NoChangeUserID .. NoEventLobby, AutoPlayLog
    int32_t autoPlayLogTime_ = 60;                // 0x1c4
};
struct CSystemConfigManager::Layout {
    YO2_AT(CSystemConfigManager, values_, 0x004);
    YO2_AT(CSystemConfigManager, fileName_, 0x014);
    YO2_AT(CSystemConfigManager, language_, 0x024);
    YO2_AT(CSystemConfigManager, volume_, 0x028);
    YO2_AT(CSystemConfigManager, dolby_, 0x02c);
    YO2_AT(CSystemConfigManager, fullscreen_, 0x02d);
    YO2_AT(CSystemConfigManager, colorDepth_, 0x030);
    YO2_AT(CSystemConfigManager, gateServer_, 0x034);
    YO2_AT(CSystemConfigManager, gatePort_, 0x044);
    YO2_AT(CSystemConfigManager, version_, 0x048);
    YO2_AT(CSystemConfigManager, fonts_, 0x058);
    YO2_AT(CSystemConfigManager, smallFonts_, 0x0c8);
    YO2_AT(CSystemConfigManager, patchUrl_, 0x138);
    YO2_AT(CSystemConfigManager, homepageUrl_, 0x148);
    YO2_AT(CSystemConfigManager, appUrl_, 0x158);
    YO2_AT(CSystemConfigManager, duelLogUrl_, 0x168);
    YO2_AT(CSystemConfigManager, teamUrl_, 0x178);
    YO2_AT(CSystemConfigManager, lastLoginId_, 0x188);
    YO2_AT(CSystemConfigManager, profilesDir_, 0x198);
    YO2_AT(CSystemConfigManager, usbDuelpass_, 0x1a8);
    YO2_AT(CSystemConfigManager, captureMode_, 0x1ac);
    YO2_AT(CSystemConfigManager, restrict_, 0x1b0);
    YO2_AT(CSystemConfigManager, autoPlayLogTime_, 0x1c4);
};
YO2_SIZEOF(CSystemConfigManager, 0x1c8);

extern CSystemConfigManager* g_systemConfig;  // DAT_0127188c

// @yo2 0x006380f0 the g_systemConfig accessor (an out-of-line copy in yo2UserConfig.obj)
inline CSystemConfigManager* systemConfig() { return g_systemConfig; }
