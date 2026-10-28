// yo2UserConfig.cpp: the per-account login settings (the ID, and the password when "save password" is ticked).
//
// Each account has its own encrypted "key = value" file in the profiles directory, named after a salted MD5 of the
// ID so the ID itself isn't visible on disk: <profilesDir>\<md5("jinjin" id "jinjin")>.bin. Nothing is read or
// written until setUser() has named the account.
#pragma once
#include <cstdint>

#include "vc6.h"
#include "yo2SystemConfig.h"

// 0x00602580: the 32 lowercase hex digits of the MD5 of `data`, NUL-terminated.
void yo2Md5Hex(const void* data, uint32_t size, char out[33]);

class CUserConfigManager final {
public:
    CUserConfigManager();
    ~CUserConfigManager();
    CUserConfigManager(const CUserConfigManager&) = delete;
    CUserConfigManager& operator=(const CUserConfigManager&) = delete;

    // The vtable (two slots, no virtual destructor). Both return false until setUser().
    virtual bool save();
    virtual bool load();

    void setUser(vc6::string id);
    // md5("jinjin" + id + "jinjin") in hex: the account file's name without the extension.
    static vc6::string userFileName(vc6::string id);

    bool hasUser() const { return hasUser_; }
    const vc6::string& filePath() const { return filePath_; }
    const vc6::string& userId() const { return userId_; }
    bool savePassword() const { return savePassword_; }
    void setSavePassword(bool on) { savePassword_ = on; }
    const vc6::string& password() const { return password_; }
    void setPassword(const vc6::string& password) { password_ = password; }

private:
    struct Layout;

    ConfigTable values_;          // 0x04
    vc6::string filePath_;        // 0x14 <profilesDir>\<userFileName>.bin
    bool hasUser_ = false;        // 0x24 set by setUser()
    bool savePassword_ = false;   // 0x25 "issavepassword" (the exe's constructor leaves it uninitialised)
    vc6::string userId_;          // 0x28 "id"
    vc6::string password_;        // 0x38 "password"
    vc6::string unk48_;           // 0x48 not touched by this file
};
struct CUserConfigManager::Layout {
    YO2_AT(CUserConfigManager, values_, 0x04);
    YO2_AT(CUserConfigManager, filePath_, 0x14);
    YO2_AT(CUserConfigManager, hasUser_, 0x24);
    YO2_AT(CUserConfigManager, savePassword_, 0x25);
    YO2_AT(CUserConfigManager, userId_, 0x28);
    YO2_AT(CUserConfigManager, password_, 0x38);
    YO2_AT(CUserConfigManager, unk48_, 0x48);
};
YO2_SIZEOF(CUserConfigManager, 0x58);

extern CUserConfigManager* g_userConfig;  // DAT_01271b10
