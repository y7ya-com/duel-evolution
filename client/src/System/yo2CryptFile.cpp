#include "yo2CryptFile.h"

#include <cstring>
#include <string>

#include "yo2File.h"
#include "yo2SystemConfig.h"

namespace {
size_t padding(size_t n) { return n % 8 ? 8 - n % 8 : 0; }
}  // namespace

// @yo2 0x0060c780 CCryptFile::CCryptFile
CCryptFile::CCryptFile() { setKey("nameko!"); }

// @yo2 0x0060c850 CCryptFile::CCryptFile(key)
CCryptFile::CCryptFile(vc6::string key) { setKey(key.c_str(), key.size()); }

// @yo2 0x0060c920 CCryptFile::~CCryptFile
// @yo2 0x0060c820 CCryptFile deleting destructor
CCryptFile::~CCryptFile() = default;

// @yo2 0x0060c9a0 CCryptFile::setKey
void CCryptFile::setKey(const char* key) { setKey(key, std::strlen(key)); }

void CCryptFile::setKey(const void* key, size_t len) {
    cipher_.setKey(static_cast<const uint8_t*>(key), static_cast<int>(len));
}

// @yo2 0x0060c6e0 CCryptFile::encrypt: whole 8-byte blocks only
bool CCryptFile::encrypt(void* data, size_t len) const {
    if (len == 0 || len % 8)
        return false;
    auto* w = static_cast<uint32_t*>(data);
    for (size_t i = 0; i < len / 4; i += 2)
        cipher_.encrypt(&w[i], &w[i + 1]);
    return true;
}

// @yo2 0x0060c730 CCryptFile::decrypt
bool CCryptFile::decrypt(void* data, size_t len) const {
    if (len == 0 || len % 8)
        return false;
    auto* w = static_cast<uint32_t*>(data);
    for (size_t i = 0; i < len / 4; i += 2)
        cipher_.decrypt(&w[i], &w[i + 1]);
    return true;
}

// @yo2 0x0060c9e0 CCryptFile::Write: the length, then the padded, encrypted data
bool CCryptFile::write(const char* name, const void* data, size_t size) {
    if (size == 0 || !data)
        return false;
    size_t body = size + padding(size);
    std::vector<uint32_t> out(1 + body / 4);  // word-aligned for the cipher
    out[0] = static_cast<uint32_t>(size);
    std::memcpy(out.data() + 1, data, size);
    encrypt(out.data() + 1, body);
    yo2SaveFile(name, out.data(), 4 + body);
    return true;
}

// @yo2 0x0060cab0 CCryptFile::Read
// @yo2 0x0060cb30 CCryptFile::GetMemory (past the length header)
bool CCryptFile::read(const char* name) {
    std::vector<uint8_t> raw;
    if (!yo2LoadFile(name, raw) || raw.size() < 4)
        return false;
    uint32_t n;
    std::memcpy(&n, raw.data(), 4);
    size_t body = n + padding(n);
    if (raw.size() < 4 + body)
        return false;
    std::vector<uint32_t> words(body / 4);
    std::memcpy(words.data(), raw.data() + 4, body);
    decrypt(words.data(), body);
    buf_.assign(raw.begin(), raw.begin() + 4);
    buf_.insert(buf_.end(), reinterpret_cast<uint8_t*>(words.data()), reinterpret_cast<uint8_t*>(words.data()) + n);
    size_ = n;
    return true;
}

// The config loaders' CCryptFile::Read, then yaneSDK CFile::ReadLine(buf, 256) (vtable slot 13) until it fails: a
// line ends at CR LF or at the end of the data, and one of 255 characters or more ends the reading.
bool yo2ReadCryptFileLines(const char* name, std::vector<std::string>& lines) {
    CCryptFile f;
    if (!f.read(name))
        return false;
    const char* p = reinterpret_cast<const char*>(f.memory());
    const char* end = p + f.size();
    while (p < end) {
        std::string line;
        for (;;) {
            if (line.size() == 255)
                return true;  // ReadLine's "buffer over": the loaders stop
            if (p >= end || (p[0] == '\r' && p + 1 < end && p[1] == '\n')) {
                p += 2;
                break;
            }
            line += *p++;
        }
        lines.push_back(line);
    }
    return true;
}

// The savers' CCryptFile::Write (vtable slot 1) of the whole text.
bool yo2WriteCryptFile(const char* name, const std::string& data) { return CCryptFile().write(name, data.data(), data.size()); }
