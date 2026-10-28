// RFC 1321 MD5 (FUN_006022b0 init / FUN_006022f0 update / FUN_006024f0 final in yo2.exe).
#pragma once
#include <cstdint>
#include <cstring>

// @yo2 0x006022b0 MD5Init (the member initialisers)
struct Md5 {
    uint32_t s[4] = {0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476};
    uint64_t bytes = 0;
    uint8_t buf[64];

    static uint32_t rol(uint32_t x, int c) { return x << c | x >> (32 - c); }

    // @yo2 0x00602890 MD5Transform
    // @yo2 0x006034b0 Decode (little-endian bytes to words: the m[] loop)
    void block(const uint8_t* p) {
        static const uint32_t K[64] = {
            0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
            0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
            0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
            0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
            0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
            0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
            0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
            0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391};
        static const int R[16] = {7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21};
        uint32_t m[16];
        for (int i = 0; i < 16; i++) m[i] = p[i * 4] | p[i * 4 + 1] << 8 | p[i * 4 + 2] << 16 | (uint32_t)p[i * 4 + 3] << 24;
        uint32_t a = s[0], b = s[1], c = s[2], d = s[3];
        for (int i = 0; i < 64; i++) {
            uint32_t f;
            int g;
            if (i < 16) { f = (b & c) | (~b & d); g = i; }
            else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
            else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
            else { f = c ^ (b | ~d); g = (7 * i) & 15; }
            uint32_t t = d;
            d = c;
            c = b;
            b = b + rol(a + f + K[i] + m[g], R[(i >> 4) * 4 + (i & 3)]);
            a = t;
        }
        s[0] += a; s[1] += b; s[2] += c; s[3] += d;
    }

    // @yo2 0x006022f0 MD5Update
    // @yo2 0x006023d0 MD5Update, a second copy
    // @yo2 0x00603520 MD5_memcpy (the byte copy into buf)
    void update(const void* data, size_t n) {
        const uint8_t* p = (const uint8_t*)data;
        size_t have = bytes & 63;
        bytes += n;
        while (n--) {
            buf[have++] = *p++;
            if (have == 64) { block(buf); have = 0; }
        }
    }

    // @yo2 0x006024f0 MD5Final, then the context is wiped
    // @yo2 0x00603440 Encode (words to little-endian bytes: the out[] loop)
    // @yo2 0x00603550 MD5_memset (the wipe)
    void final(uint8_t out[16]) {
        uint64_t bits = bytes * 8;
        uint8_t pad = 0x80, zero = 0, len[8];
        update(&pad, 1);
        while ((bytes & 63) != 56) update(&zero, 1);
        for (int i = 0; i < 8; i++) len[i] = (uint8_t)(bits >> (8 * i));
        update(len, 8);
        for (int i = 0; i < 16; i++) out[i] = (uint8_t)(s[i >> 2] >> (8 * (i & 3)));
        memset(this, 0, sizeof *this);
    }
};
