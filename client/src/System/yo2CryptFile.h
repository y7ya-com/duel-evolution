// yo2CryptFile.cpp: CCryptFile, the encrypted file format of system.bin / user.bin / kaban.bin: a 4-byte plain
// length, then the data padded to 8 bytes and Blowfish-encrypted (ECB) with the key "nameko!".
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

#include "Net/blowfish.h"
#include "vc6.h"

class CCryptFile {
public:
    CCryptFile();
    explicit CCryptFile(vc6::string key);
    virtual ~CCryptFile();

    void setKey(const char* key);
    void setKey(const void* key, size_t len);
    bool write(const char* name, const void* data, size_t size);
    bool read(const char* name);
    // After read(): the decrypted data, without the length header and padding.
    const uint8_t* memory() const { return buf_.size() >= 4 ? buf_.data() + 4 : nullptr; }
    size_t size() const { return size_; }

    bool encrypt(void* data, size_t len) const;
    bool decrypt(void* data, size_t len) const;

private:
    std::vector<uint8_t> buf_;  // yaneSDK CFile's buffer in the exe (0x00..0x3f)
    size_t size_ = 0;
    Blowfish cipher_;           // 0x40 yaneSDK CBlowfish
};
