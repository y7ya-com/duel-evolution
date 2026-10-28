// Original-ABI adapters for src/Net (ygpacket, MD5), plus MD5 Encode, rewritten here as a differential-test subject.
#include <new>

#include "../yo2hook.h"
#include "Net/NetAccount.h"
#include "Net/md5.h"
#include "Net/ygpacket.h"

// @yo2 0x00689ea0 recv
YO2_HOOK int32_t __cdecl yo2_689ea0(YgPacket* p, int sock) {
    if (sock < 0) return YG_BAD_ARGS;
    return ygRecv(p, ygSocketTransport(sock));
}

// @yo2 0x0068a320 send
YO2_HOOK int32_t __cdecl yo2_68a320(YgPacket* p, int sock) {
    if (sock < 0) return YG_BAD_ARGS;
    return ygSend(p, ygSocketTransport(sock));
}

// ---- body fields (src/Net/ygpacket.cpp). The originals take the value by pointer; a null one is YG_BAD_ARGS.
// @yo2 0x0068a5a0
YO2_HOOK void __cdecl yo2_68a5a0(YgPacket* p) { ygClear(p); }
// @yo2 0x0068a5f0
YO2_HOOK void __cdecl yo2_68a5f0(YgPacket* p, int32_t id) { ygBegin(p, id); }
// @yo2 0x0068a630
YO2_HOOK void __cdecl yo2_68a630(YgPacket* p) { ygEnd(p); }
// @yo2 0x0068a670
YO2_HOOK void __cdecl yo2_68a670(YgPacket* p) { ygBeginRead(p); }
// @yo2 0x0068a6a0
YO2_HOOK void __cdecl yo2_68a6a0(YgPacket* p) { ygEndRead(p); }

// @yo2 0x0068a6d0 / 0x0068a740 put u8, 0x0068a7b0 / 0x0068a830 put u16, 0x0068a8b0 / 0x0068a930 put u32
YO2_HOOK int32_t __cdecl yo2_68a6d0(YgPacket* p, const uint8_t* v) { return p && v ? ygPut8(p, *v) : YG_BAD_ARGS; }
YO2_HOOK int32_t __cdecl yo2_68a740(YgPacket* p, const uint8_t* v) { return yo2_68a6d0(p, v); }
YO2_HOOK int32_t __cdecl yo2_68a7b0(YgPacket* p, const uint16_t* v) { return p && v ? ygPut16(p, *v) : YG_BAD_ARGS; }
YO2_HOOK int32_t __cdecl yo2_68a830(YgPacket* p, const uint16_t* v) { return yo2_68a7b0(p, v); }
YO2_HOOK int32_t __cdecl yo2_68a8b0(YgPacket* p, const uint32_t* v) { return p && v ? ygPut32(p, *v) : YG_BAD_ARGS; }
YO2_HOOK int32_t __cdecl yo2_68a930(YgPacket* p, const uint32_t* v) { return yo2_68a8b0(p, v); }
// @yo2 0x0068aaf0
YO2_HOOK int32_t __cdecl yo2_68aaf0(YgPacket* p, const void* src, int n) { return ygPutBytes(p, src, n); }

// @yo2 0x0068ac10 / 0x0068ac60 get u8, 0x0068acb0 / 0x0068ad20 get u16, 0x0068ad90 / 0x0068ae20 get u32
YO2_HOOK int32_t __cdecl yo2_68ac10(YgPacket* p, uint8_t* v) { return ygGet8(p, v); }
YO2_HOOK int32_t __cdecl yo2_68ac60(YgPacket* p, uint8_t* v) { return ygGet8(p, v); }
YO2_HOOK int32_t __cdecl yo2_68acb0(YgPacket* p, uint16_t* v) { return ygGet16(p, v); }
YO2_HOOK int32_t __cdecl yo2_68ad20(YgPacket* p, uint16_t* v) { return ygGet16(p, v); }
YO2_HOOK int32_t __cdecl yo2_68ad90(YgPacket* p, uint32_t* v) { return ygGet32(p, v); }
YO2_HOOK int32_t __cdecl yo2_68ae20(YgPacket* p, uint32_t* v) { return ygGet32(p, v); }
// @yo2 0x0068b020
YO2_HOOK int32_t __cdecl yo2_68b020(YgPacket* p, void* dst, int n) { return ygGetBytes(p, dst, n); }
// @yo2 0x0068b0b0
YO2_HOOK int32_t __cdecl yo2_68b0b0(YgPacket* p, char* dst, char delim) { return ygGetString(p, dst, delim); }
// @yo2 0x0068b150
YO2_HOOK int32_t __cdecl yo2_68b150(const YgPacket* p) { return ygReadPos(p); }
// @yo2 0x0068b180
YO2_HOOK void __cdecl yo2_68b180(const uint8_t* key, int len) { ygSetCipherKey(key, len); }
// @yo2 0x0068b1b0
YO2_HOOK void __cdecl yo2_68b1b0(YgPacket* p, int decrypt) { ygCipher(p, decrypt); }

// ---- members. A __thiscall free function takes `this` in ECX exactly like the original method.
// @yo2 0x006a5bc0 (CMyUser, the account-data sub-object at CNetAccount+0x121c)
YO2_HOOK CPlayerInfo* __thiscall yo2_6a5bc0(CMyUser* me, int slot) { return me->player(slot); }

// MD5 (RFC 1321 reference API: MD5Init / MD5Update / MD5Final(digest, ctx)). The original MD5_CTX is
// {state[4], count[2] in BITS, buffer[64]}; Md5 keeps a 64-bit BYTE count there, and MD5Final also wipes the context.
// The differential tests ignore those 8 bytes / the wiped context; see harness/README.md.
static_assert(sizeof(Md5) == 0x58, "MD5_CTX is 88 bytes");

// @yo2 0x006022b0 MD5Init
YO2_HOOK void __cdecl yo2_6022b0(Md5* c) { new (c) Md5; }

// @yo2 0x006022f0 MD5Update
YO2_HOOK void __cdecl yo2_6022f0(Md5* c, const uint8_t* data, uint32_t len) { c->update(data, len); }

// @yo2 0x006024f0 MD5Final
YO2_HOOK void __cdecl yo2_6024f0(uint8_t digest[16], Md5* c) { c->final(digest); }

// @yo2 0x00603440 MD5 Encode: 32-bit words to little-endian bytes, len in bytes (rounded up to whole words)
YO2_HOOK void __cdecl yo2_603440(uint8_t* out, const uint32_t* in, uint32_t len) {
    for (uint32_t i = 0; i < len; i += 4, in++)
        for (int k = 0; k < 4; k++) out[i + k] = (uint8_t)(*in >> (8 * k));
}
