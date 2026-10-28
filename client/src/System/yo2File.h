// The one file-loading call System makes: yaneSDK's CFile::Read (whole file into memory). The shipped exe resolves
// it through yaneSDK (loose files, KCEJYUGI archives, '?' in a name replaced by the language code); the port's
// implementation sits on platform/vfs. Defined by the build that links System (tests: tests/system/stubs.cpp).
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

bool yo2LoadFile(const char* name, std::vector<uint8_t>& out);
// yaneSDK CFile::Write (0x0052b140): create or truncate the file and write it whole.
bool yo2SaveFile(const char* name, const void* data, size_t size);
