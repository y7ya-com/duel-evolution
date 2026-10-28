#include "yo2UserConfig.h"

#include <string>

// @yo2 0x006372a0 static init: g_userConfig = new CUserConfigManager
// @yo2 0x00637350 static init: empty
CUserConfigManager* g_userConfig = new CUserConfigManager;

namespace {
// @yo2 0x00637370 static init: atexit(delete g_userConfig) (the handler at 0x637390 is guarded to run once)
const struct UserConfigCleanup {
    ~UserConfigCleanup() {
        delete g_userConfig;
        g_userConfig = nullptr;
    }
} s_userConfigCleanup;
}  // namespace

// @yo2 0x00637560 CUserConfigManager::CUserConfigManager
CUserConfigManager::CUserConfigManager() = default;

// @yo2 0x006373e0 CUserConfigManager::~CUserConfigManager
CUserConfigManager::~CUserConfigManager() = default;

// @yo2 0x006375f0 CUserConfigManager::userFileName: salted MD5 of the ID
vc6::string CUserConfigManager::userFileName(vc6::string id) {
    id = vc6::string("jinjin" + std::string(std::string_view(id)) + "jinjin");
    char hex[33];
    yo2Md5Hex(id.c_str(), static_cast<uint32_t>(id.size()), hex);
    return vc6::string(hex);
}

// @yo2 0x00637e70 CUserConfigManager::setUser: picks the account file in the profiles directory
void CUserConfigManager::setUser(vc6::string id) {
    userId_ = id;
    std::string path = std::string(std::string_view(systemConfig()->profilesDir())) + "\\" +
                       std::string(std::string_view(userFileName(userId_))) + ".bin";
    filePath_ = vc6::string(path);
    hasUser_ = true;
}

// @yo2 0x006377b0 CUserConfigManager::save
bool CUserConfigManager::save() {
    if (!hasUser_)
        return false;
    values_.setBool("issavepassword", savePassword_);
    values_.setString("id", userId_);
    values_.setString("password", password_);
    yo2WriteCryptFile(filePath_.c_str(), values_.serialize());
    return true;
}

// @yo2 0x00637b00 CUserConfigManager::load
bool CUserConfigManager::load() {
    if (!hasUser_)
        return false;
    std::vector<std::string> lines;
    yo2ReadCryptFileLines(filePath_.c_str(), lines);
    values_.parseLines(lines);
    values_.getBool("issavepassword", savePassword_);
    values_.getString("id", userId_);
    values_.getString("password", password_);
    return true;
}
