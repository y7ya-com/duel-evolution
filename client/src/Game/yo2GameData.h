// Game data files. Every loader in the exe opens them with yaneSDK's CFile: Read(path) (merge.dat and the KCEJYUGI
// archives, see third_party/yanesdk/KONAMI_CHANGES.md), then ReadLine / GetMemory. yaneSDK only builds for Windows
// so far, so src/Game reads through this seam instead: a provider maps a path to the file's bytes (the platform's
// merge.dat VFS, a test fixture, or yaneSDK's CFile once it builds everywhere).
#pragma once
#include <cstdint>
#include <string>

using GameFileProvider = bool (*)(const char* path, std::string* bytes);

void gameSetFileProvider(GameFileProvider p);
bool gameReadFile(const char* path, std::string* bytes);   // false if there is no provider or no such file

// CFile after a successful Read(): the file in memory, read line by line.
class GameFile {
public:
    // CFile::Read: 0 on success
    int32_t read(const char* path);
    // CFile::ReadLine(LPSTR, DWORD) (0x52b480): 0 = a line (CR LF ends it; a lone LF stays in the line),
    // 1 = end of file, 2 = more than size-1 bytes (the rest of the line comes with the next call), 3 = nothing read.
    // The last line needs no CR LF.
    int32_t readLine(char* buf, uint32_t size);
    const std::string& bytes() const { return data_; }

private:
    std::string data_;
    size_t pos_ = 0;
    bool open_ = false;
};
