// src/Swf adapters: the original ABI around the rewritten text-dump reader.
#include <new>

#include "../yo2hook.h"
#include "Swf/yo2SwfReader.h"
#include "System/yo2File.h"

// yaneSDK's CFile, seen only through its vtable: slot 0x34 is ReadLine(string&), 0 while there are lines.
struct YaneFile {
    void** vtbl;
};

class YaneLineSource : public SwfLineSource {
    YaneFile* file_;

public:
    explicit YaneLineSource(YaneFile* file) : file_(file) {}
    bool readLine(vc6::string& line) override {
        using ReadLine = int(__thiscall*)(YaneFile*, vc6::string*);
        return reinterpret_cast<ReadLine>(file_->vtbl[0x34 / 4])(file_, &line) == 0;
    }
};

// 0x006793d0 readTags: thiscall (ECX unused), the result string through the hidden pointer
YO2_HOOK vc6::string* __thiscall yo2_6793d0(void*, vc6::string* ret, YaneFile* file, SwfVec<vc6::string>* png,
                                           CSwfCharaDictionary* dict, CSwfCtrlTagTable* timeline) {
    YaneLineSource src(file);
    return new (ret) vc6::string(SwfReader::readTags(src, png, dict, timeline));
}

// System's file hook (System/yo2File.h) for code running inside the game: read through the exe's own CFile (yaneSDK,
// merge.dat aware). Called at the exe addresses, thiscall. sizeof(CFile) = 0x40 (third_party/yanesdk/KONAMI_CHANGES.md).
// ponytail: the name string and the file image cross the DLL/exe heap boundary; fine while both sides only read them.
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    struct ExeCFile { alignas(4) uint8_t raw[0x40]; } f;
    using Fn = int32_t(__thiscall*)(ExeCFile*);
    using Read = int32_t(__thiscall*)(ExeCFile*, const vc6::string*);
    using Memory = const uint8_t*(__thiscall*)(ExeCFile*);
    reinterpret_cast<Fn>(0x525dc0)(&f);                           // CFile::CFile
    vc6::string n(name);
    bool ok = reinterpret_cast<Read>(0x52a490)(&f, &n) == 0;      // CFile::Read
    if (ok) {
        const uint8_t* p = reinterpret_cast<Memory>(0x527d30)(&f);   // CFile::GetMemory
        out.assign(p, p + reinterpret_cast<Fn>(0x527d10)(&f));       // CFile::GetSize
    }
    reinterpret_cast<Fn>(0x525fb0)(&f);                           // CFile::Close
    reinterpret_cast<Fn>(0x525e80)(&f);                           // CFile::~CFile
    return ok;
}
