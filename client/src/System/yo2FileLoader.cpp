#include "yo2FileLoader.h"

#include "CTextureManager.h"
#include "yo2Debug.h"
#include "yo2File.h"

// @yo2 0x006108d0 static init: g_fileLoader
// @yo2 0x00610ce0 static init: atexit(~g_fileLoader)
CFileLoader g_fileLoader;

// ---- CFileInfo ----

// @yo2 0x00610550 CFileLoader::CFileInfo::CFileInfo
CFileLoader::CFileInfo::CFileInfo() = default;

// @yo2 0x006106e0 CFileLoader::CFileInfo::~CFileInfo: never while its thread runs
// @yo2 0x006106b0 CFileLoader::CFileInfo deleting destructor
// @yo2 0x00612130 pair<const string, CFileInfo>::~pair
// @yo2 0x00613640 pair<const string, CFileInfo> deleting destructor
CFileLoader::CFileInfo::~CFileInfo() {
    YO2_ASSERT(!loading, "現在読み込み中");  // still loading
    delete[] pixels;
    pixels = nullptr;
}

// ---- CFileLoader ----

// @yo2 0x006108f0 CFileLoader::CFileLoader (the map's head node)
// @yo2 0x00610a10 CFileLoader::~CFileLoader: list what is still loaded, then free it
// @yo2 0x006109e0 CFileLoader deleting destructor
// @yo2 0x00610ba0 map<string, CFileInfo>::~map
// @yo2 0x00612cf0 map<string, CFileInfo>::_Erase (the subtree)
CFileLoader::~CFileLoader() { printLoadedFiles(); }

// @yo2 0x00611b90 CFileLoader::find
// @yo2 0x00613120 map<string, CFileInfo>::lower_bound
CFileLoader::CFileInfo* CFileLoader::find(const vc6::string& name) {
    std::string key(name.c_str(), name.size());
    return files_.find(key) ? &files_[key] : nullptr;
}

// @yo2 0x00610d30 CFileLoader::request: one more user of `name`; the first starts its loader thread
// @yo2 0x00612a70 CFileLoader::CFileInfo::CFileInfo(const CFileInfo&)
// @yo2 0x00611160 CFile::operator= (the info copied into the map)
// @yo2 0x00613420 pair<const string, CFileInfo>::pair (the map node's value)
// @yo2 0x006135b0 vector<string>::vector(const vector&) (CFile's)
// @yo2 0x006121c0 vector<string>::size
// @yo2 0x006121f0 uninitialized_copy<string*>
// @yo2 0x00613260 copy<string*>
// @yo2 0x00612dd0 map<string, CFileInfo>::_Insert
void CFileLoader::request(const vc6::string& name, int32_t mode) {
    if (CFileInfo* info = find(name)) {
        ++info->refs;
        return;
    }
    files_[std::string(name.c_str(), name.size())];
    CFileInfo* info = find(name);
    YO2_ASSERT(info != nullptr, "error add order [%s]", name.c_str());
    info->loading = true;
    info->refs = 1;
    info->loaded = false;
    info->name = name;
    info->pixels = nullptr;
    if (mode == FILE) {
        yo2BeginThread(&CFileLoader::loadFile, &info->name);
    } else if (mode == IMAGE) {
        yo2BeginThread(&CFileLoader::loadImage, &info->name);
    } else {
        YO2_ASSERT(false, "illegal Mode[%d]\n", mode);
    }
}

// @yo2 0x00611470 CFileLoader::isLoaded: a name never requested is an error when `requested` says it was
bool CFileLoader::isLoaded(const vc6::string& name, bool requested) {
    if (CFileInfo* info = find(name))
        return info->loaded;
    if (requested)
        YO2_ASSERT(false, "依頼したはずなのに");  // "it should have been requested"
    return false;
}

// @yo2 0x006115f0 CFileLoader::file
const std::vector<uint8_t>* CFileLoader::file(const vc6::string& name) {
    CFileInfo* info = find(name);
    return info ? &info->data : nullptr;
}

// @yo2 0x00611650 CFileLoader::Clear: one user fewer; the last one frees the data (never mid-load)
// @yo2 0x00612990 map<string, CFileInfo>::find
// @yo2 0x006123a0 map<string, CFileInfo>::erase
void CFileLoader::release(const vc6::string& name) {
    CFileInfo* info = find(name);
    YO2_ASSERT(info != nullptr, "no info [%s]", name.c_str());
    --info->refs;
    YO2_ASSERT(info->refs >= 0, "illegal Clear() [%s]", name.c_str());
    if (info->refs != 0)
        return;
    std::string key(name.c_str(), name.size());
    YO2_ASSERT(files_.find(key) != nullptr, "error[%s]", name.c_str());
    YO2_ASSERT(!info->loading, "読み込み中 %s", name.c_str());  // still loading
    files_.erase(key);
}

// @yo2 0x00611ad0 CFileLoader::PrintLoadedFile
void CFileLoader::printLoadedFiles() const {
    yo2Trace("==== CFileLoader::PrintLoadedFile() ====\n");
    yo2Trace("no :                data_name                 : ref : file : tex_buf\n");
    int i = 0;
    for (const auto& kv : files_) {
        const CFileInfo& f = kv.second;
        yo2Trace("%2d : %-40s : %3d : %s : %p : %p\n", i++, f.name.c_str(), f.refs, f.loaded ? "loaded" : "     ",
                 static_cast<const void*>(&f.data), static_cast<const void*>(f.pixels));
    }
}

// @yo2 0x00611c10 CFileLoader's FILE thread: read the whole file
void CFileLoader::loadFile(void* arg) {
    const vc6::string& name = *static_cast<vc6::string*>(arg);
    CFileInfo* info = g_fileLoader.find(name);
    if (!yo2LoadFile(name.c_str(), info->data))
        YO2_ASSERT(false, "read error[%s]", name.c_str());
    info->loaded = true;
    info->loading = false;
}

// @yo2 0x00611da0 CFileLoader's IMAGE thread: read, then decode into a buffer of the texture's size
void CFileLoader::loadImage(void* arg) {
    const vc6::string& name = *static_cast<vc6::string*>(arg);
    CFileInfo* info = g_fileLoader.find(name);
    if (!yo2LoadFile(name.c_str(), info->data))
        YO2_ASSERT(false, "read error[%s]", name.c_str());
    D3DXIMAGE_INFO image{};
    D3DXGetImageInfoFromFileInMemory(info->data.data(), static_cast<UINT>(info->data.size()), &image);
    UINT w = image.Width, h = image.Height;
    CD3DTextureManager::checkRequirements(&w, &h);
    info->pixels = new (std::nothrow) uint32_t[size_t(w) * h]();
    YO2_ASSERT(info->pixels != nullptr, "memory error %s", name.c_str());
    info->width = w;
    info->height = h;
    yo2DecodePng(info->pixels, static_cast<int32_t>(w * 4), info->data.data(), info->data.size());
    info->loaded = true;
    info->loading = false;
}
