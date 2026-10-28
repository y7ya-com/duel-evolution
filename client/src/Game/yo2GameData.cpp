#include "Game/yo2GameData.h"

static GameFileProvider g_provider;

void gameSetFileProvider(GameFileProvider p) { g_provider = p; }

bool gameReadFile(const char* path, std::string* bytes) { return g_provider && g_provider(path, bytes); }

int32_t GameFile::read(const char* path) {
    data_.clear();
    pos_ = 0;
    open_ = gameReadFile(path, &data_);
    return open_ ? 0 : 1;
}

int32_t GameFile::readLine(char* buf, uint32_t size) {
    if (!open_)
        return 3;
    if (pos_ >= data_.size())
        return 1;
    for (uint32_t i = 0; i + 1 < size; i++) {
        // CFile keeps a NUL after the data, so the CR LF test can look one byte past the end
        if (pos_ >= data_.size() || (data_[pos_] == '\r' && pos_ + 1 < data_.size() && data_[pos_ + 1] == '\n')) {
            *buf = '\0';
            pos_ += 2;
            return 0;
        }
        *buf++ = data_[pos_++];
    }
    *buf = '\0';
    return 2;
}
