// The one file-loading call System makes: yaneSDK's CFile::Read (whole file into memory). The shipped exe resolves
// it through yaneSDK (loose files, KCEJYUGI archives, '?' in a name replaced by the language code); the port's
// implementation sits on platform/vfs. Defined by the build that links System (tests: tests/system/stubs.cpp).
#pragma once
#include <cstdint>
#include <vector>

bool yo2LoadFile(const char* name, std::vector<uint8_t>& out);
