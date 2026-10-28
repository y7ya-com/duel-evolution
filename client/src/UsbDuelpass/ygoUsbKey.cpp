#include "ygoUsbKey.h"

#include <cstring>

#include "System/yo2Debug.h"

namespace {
// MagicKey only works on NT 5 and later (2000/XP/Vista): not on 9x/Me (platform 1) nor on NT 3/4.
bool osSupported(const OsVersion& v) { return v.platformId == 2 && !(v.major >= 3 && v.major <= 4); }
}  // namespace

// @yo2 0x008cdc70 YgoUsbKey::read: ask MagicKey for the DUELPASS code (thiscall; CApp+0xc5c, `enabled` is the
// config's USB DUELPASS setting, CSystemConfigManager vf34)
void YgoUsbKey::read(bool enabled) {
    char buf[0x100] = {};
    state = STATE_NONE;
    OsVersion os = osVersion();  // asked even when disabled
    int32_t r = enabled && osSupported(os) ? magicKeyGetDuelPassCode(buf, sizeof buf) : -1;
    switch (r) {
    case -1:
        state = STATE_NONE;
        break;
    case 0:
        YO2_ASSERT(false, "バッファ不足");  // "buffer too small" (0x100 always is)
        break;
    case 1:
        state = STATE_READ;
        std::memcpy(code, buf + 0x12, sizeof code);
        break;
    default:
        state = STATE_ERROR;
        break;
    }
}
