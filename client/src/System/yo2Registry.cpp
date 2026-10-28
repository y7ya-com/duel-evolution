#include "yo2Registry.h"

#include <cstring>
#include <string>
#include <vector>

// @yo2 0x00619c30 g_registry's dynamic initializer: new CRegistryManagerFacade
// @yo2 0x00619c10 island: its __xc entry
CRegistryManagerFacade* g_registry = new CRegistryManagerFacade;

// @yo2 0x0061a1e0 CRegistryManagerFacade::~CRegistryManagerFacade (implicit: the three managers)
CRegistryManagerFacade::CRegistryManagerFacade()
    : yo2("SOFTWARE\\KONAMI\\Yu-Gi-Oh! ONLINE 2"), yo1("SOFTWARE\\KONAMI\\Yu-Gi-Oh! ONLINE"),
      usb("SOFTWARE\\KONAMI\\Yu-Gi-Oh_ONLINE") {}

// @yo2 0x0061a010 vector<smart_ptr<RegKey>>::vector
// @yo2 0x00619e60 string::assign(const char*, n) (CRegistryManager's copy)
CRegistryManager::CRegistryManager(const char* base) : base_(base) {}

// @yo2 0x00618ba0 CRegistryManager::~CRegistryManager: close every key it opened
// @yo2 0x00618ce0 CRegistryManager deleting destructor
// @yo2 0x0061a040 CRegistryManagerFacade::CRegistryManagerYo2 deleting destructor
// @yo2 0x0061a070 CRegistryManagerFacade::CRegistryManagerYo1 deleting destructor
// @yo2 0x0061a0a0 CRegistryManagerFacade::CRegistryManagerUSB deleting destructor
// @yo2 0x00618d10 vector<smart_ptr<RegKey>>::_Tidy
// @yo2 0x0061a350 smart_ptr<RegKey>::release (the last owner deletes)
// @yo2 0x0061a410 smart_ptr<RegKey>::~smart_ptr
// @yo2 0x0061a4d0 smart_ptr<RegKey> deleting destructor
// @yo2 0x0061a570 RegKey::~RegKey
CRegistryManager::~CRegistryManager() {
    for (RegKey* k : keys_) {
        RegCloseKey(k->key);
        delete k;
    }
}

// @yo2 0x00619000 CRegistryManager::findKey: the key opened for this section, or 0
HKEY CRegistryManager::findKey(const vc6::string& section) const {
    for (RegKey* k : keys_)
        if (std::strcmp(k->name.c_str(), section.c_str()) == 0)
            return k->key;
    return nullptr;
}

// @yo2 0x00618d80 CRegistryManager::createKey: RegCreateKeyEx(HKLM, base [+ "\" + section], all access, inheritable)
LSTATUS CRegistryManager::createKey(const vc6::string& section, HKEY* out) {
    std::string path = base_.c_str();
    if (*section.c_str())
        path = path + "\\" + section.c_str();
    SECURITY_ATTRIBUTES sa{sizeof sa, nullptr, TRUE};
    DWORD disposition;
    return RegCreateKeyExA(HKEY_LOCAL_MACHINE, path.c_str(), 0, nullptr, 0, KEY_ALL_ACCESS, &sa, out, &disposition);
}

// @yo2 0x00619300 CRegistryManager::openKey: the kept key, else a new one (kept even when creating it failed)
// @yo2 0x00619120 CRegistryManager::addKey
// @yo2 0x0061a260 vector<smart_ptr<RegKey>>::push_back
// @yo2 0x0061a5c0 vector<smart_ptr<RegKey>>::insert(pos, n, value)
// @yo2 0x0061a960 construct<smart_ptr<RegKey>> (copy: joins the owner ring)
// @yo2 0x0061a9d0 smart_ptr<RegKey>::operator=
LSTATUS CRegistryManager::openKey(const vc6::string& section, HKEY* out) {
    *out = findKey(section);
    if (*out)
        return ERROR_SUCCESS;
    LSTATUS r = createKey(section, out);
    keys_.push_back(new RegKey{*out, section});
    return r;
}

// The query/set methods each hold a heap buffer or nothing: smart_ptr<BYTE> (vptr 0x00be9978).
// @yo2 0x0061a490 smart_ptr<BYTE>::~smart_ptr
// @yo2 0x0061a500 smart_ptr<BYTE> deleting destructor

// @yo2 0x006197e0 CRegistryManager::readString (REG_SZ into a maxLen buffer; out untouched on failure)
LSTATUS CRegistryManager::readString(const vc6::string& section, const vc6::string& name, vc6::string& out,
                                     DWORD maxLen) {
    std::vector<BYTE> buf(maxLen + 1);  // (+1: a value filling the buffer still ends in a NUL)
    HKEY key;
    openKey(section, &key);
    DWORD type = REG_BINARY;
    LSTATUS r = RegQueryValueExA(key, name.c_str(), nullptr, &type, buf.data(), &maxLen);
    if (r == ERROR_SUCCESS)
        out = reinterpret_cast<const char*>(buf.data());
    return r;
}

// @yo2 0x006199b0 CRegistryManager::readBinary
LSTATUS CRegistryManager::readBinary(const vc6::string& section, const vc6::string& name, void* out, DWORD size) {
    HKEY key;
    openKey(section, &key);
    DWORD type = REG_BINARY;
    return RegQueryValueExA(key, name.c_str(), nullptr, &type, static_cast<BYTE*>(out), &size);
}

// @yo2 0x00619ae0 CRegistryManager::readDword
LSTATUS CRegistryManager::readDword(const vc6::string& section, const vc6::string& name, DWORD& out) {
    HKEY key;
    openKey(section, &key);
    DWORD type = REG_DWORD, size = 4;
    return RegQueryValueExA(key, name.c_str(), nullptr, &type, reinterpret_cast<BYTE*>(&out), &size);
}

// @yo2 0x00619440 CRegistryManager::writeString (REG_SZ; the size given is the string's length, without the NUL)
LSTATUS CRegistryManager::writeString(const vc6::string& section, const vc6::string& name, const vc6::string& value) {
    HKEY key;
    openKey(section, &key);
    return RegSetValueExA(key, name.c_str(), 0, REG_SZ, reinterpret_cast<const BYTE*>(value.c_str()),
                          static_cast<DWORD>(value.size()));
}

// @yo2 0x006195a0 CRegistryManager::writeBinary
LSTATUS CRegistryManager::writeBinary(const vc6::string& section, const vc6::string& name, const void* data,
                                      DWORD size) {
    HKEY key;
    openKey(section, &key);
    return RegSetValueExA(key, name.c_str(), 0, REG_BINARY, static_cast<const BYTE*>(data), size);
}

// @yo2 0x006196c0 CRegistryManager::writeDword
LSTATUS CRegistryManager::writeDword(const vc6::string& section, const vc6::string& name, DWORD value) {
    HKEY key;
    openKey(section, &key);
    return RegSetValueExA(key, name.c_str(), 0, REG_DWORD, reinterpret_cast<const BYTE*>(&value), 4);
}

struct CRegistryManager::Layout {
    YO2_AT(CRegistryManager, base_, 0x04);
    YO2_AT(CRegistryManager, keys_, 0x14);
    YO2_SIZEOF(CRegistryManager, 0x24);
    YO2_AT(CRegistryManagerFacade, yo1, 0x24);
    YO2_AT(CRegistryManagerFacade, usb, 0x48);
    YO2_SIZEOF(CRegistryManagerFacade, 0x6c);
    YO2_SIZEOF(RegKey, 0x14);
};
