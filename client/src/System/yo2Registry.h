// The game's registry settings (src\System, file name unknown): three CRegistryManagers, one per product key under
// HKEY_LOCAL_MACHINE, created at start-up as one object (g_registry, DAT_012714d4). Each opens a section's subkey
// once and keeps it (RegCreateKeyEx, so a missing key is created) until it is destroyed.
//   +0x00 Yo2  SOFTWARE\KONAMI\Yu-Gi-Oh! ONLINE 2   ("system" section: CommonDir, fonttexturesize, config overrides)
//   +0x24 Yo1  SOFTWARE\KONAMI\Yu-Gi-Oh! ONLINE
//   +0x48 USB  SOFTWARE\KONAMI\Yu-Gi-Oh_ONLINE      (the "path" value: where yo2.exe runs from)
// Every call returns the Win32 status (ERROR_SUCCESS = 0).
#pragma once
#include <windows.h>

#include <cstdint>

#include "vc6.h"

class CRegistryManager {
public:
    explicit CRegistryManager(const char* base);
    virtual ~CRegistryManager();

    LSTATUS readString(const vc6::string& section, const vc6::string& name, vc6::string& out, DWORD maxLen);
    LSTATUS readBinary(const vc6::string& section, const vc6::string& name, void* out, DWORD size);
    LSTATUS readDword(const vc6::string& section, const vc6::string& name, DWORD& out);
    LSTATUS writeString(const vc6::string& section, const vc6::string& name, const vc6::string& value);
    LSTATUS writeBinary(const vc6::string& section, const vc6::string& name, const void* data, DWORD size);
    LSTATUS writeDword(const vc6::string& section, const vc6::string& name, DWORD value);

private:
    struct RegKey {      // 0x14
        HKEY key;        // 0x00
        vc6::string name;  // 0x04 the section
    };
    LSTATUS openKey(const vc6::string& section, HKEY* out);
    HKEY findKey(const vc6::string& section) const;
    LSTATUS createKey(const vc6::string& section, HKEY* out);

    vc6::string base_;            // 0x04 the product key
    vc6::vector<RegKey*> keys_;   // 0x14 the exe's vector<smart_ptr<RegKey>>
    struct Layout;
};

class CRegistryManagerFacade {
public:
    CRegistryManagerFacade();
    CRegistryManager yo2;  // 0x00
    CRegistryManager yo1;  // 0x24
    CRegistryManager usb;  // 0x48
};

extern CRegistryManagerFacade* g_registry;  // DAT_012714d4
