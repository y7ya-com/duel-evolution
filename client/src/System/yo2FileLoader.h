// yo2FileLoader.cpp: background file loading, shared by name with a reference count. request() starts a loader
// thread for a name not seen yet (or just counts another user); isLoaded() polls; the data stays until the last
// user calls release(). An IMAGE request also decodes the PNG into a 32-bit pixel buffer sized for a texture.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "vc6.h"

// ---- what this file calls outside System (tests: tests/system/stubs.cpp) ----
void yo2BeginThread(void (*fn)(void*), void* arg);   // _beginthread; the thread ends when fn returns
// 0x0059cfd0 (CTextureManager.cpp's libpng reader): decode a PNG into A8R8G8B8 rows of `pitch` bytes.
bool yo2DecodePng(uint32_t* out, int32_t pitch, const void* data, size_t size);

class CFileLoader {
public:
    enum Mode : int32_t { FILE = 0, IMAGE = 1 };

    struct CFileInfo {
        CFileInfo();
        virtual ~CFileInfo();
        CFileInfo(const CFileInfo&) = delete;
        CFileInfo& operator=(const CFileInfo&) = delete;

        bool loading = false;          // 0x04 a loader thread is working on it
        int32_t refs = 0;              // 0x08 request() calls not yet released
        bool loaded = false;           // 0x0c
        vc6::string name;              // 0x10
        std::vector<uint8_t> data;     // 0x20 yaneSDK CFile in the exe
        uint32_t* pixels = nullptr;    // 0x60 IMAGE: the decoded image
        uint32_t width = 0, height = 0;
    };

    CFileLoader() = default;
    virtual ~CFileLoader();

    void request(const vc6::string& name, int32_t mode);
    bool isLoaded(const vc6::string& name, bool requested);
    const std::vector<uint8_t>* file(const vc6::string& name);
    void release(const vc6::string& name);
    void printLoadedFiles() const;
    CFileInfo* find(const vc6::string& name);
    size_t size() const { return files_.size(); }

private:
    static void loadFile(void* name);
    static void loadImage(void* name);

    vc6::map<std::string, CFileInfo> files_;  // 0x04
};

extern CFileLoader g_fileLoader;  // DAT_01271480
