// Standard Blowfish (16 rounds), as yaneSDK's FUN_00583ac0 key schedule / FUN_005830c0 encrypt / FUN_005835c0
// decrypt in yo2.exe. TODO(1): those three are yaneSDK (phase 1); switch to its class once it lands.
#pragma once
#include <cstdint>
#include <cstring>

#include "blowfish_tables.h"

struct Blowfish {
    uint32_t P[18];
    uint32_t S[4][256];

    void setKey(const uint8_t* key, int len) {
        memcpy(P, BF_P0, sizeof P);
        memcpy(S, BF_S0, sizeof S);
        for (int i = 0, j = 0; i < 18; i++) {
            uint32_t v = 0;
            for (int k = 0; k < 4; k++, j++) v = v << 8 | key[j % len];
            P[i] ^= v;
        }
        uint32_t l = 0, r = 0;
        for (int i = 0; i < 18; i += 2) { encrypt(&l, &r); P[i] = l; P[i + 1] = r; }
        for (auto& s : S)
            for (int i = 0; i < 256; i += 2) { encrypt(&l, &r); s[i] = l; s[i + 1] = r; }
    }

    uint32_t f(uint32_t x) const {
        return ((S[0][x >> 24] + S[1][x >> 16 & 0xff]) ^ S[2][x >> 8 & 0xff]) + S[3][x & 0xff];
    }

    void encrypt(uint32_t* xl, uint32_t* xr) const {
        uint32_t l = *xl, r = *xr;
        for (int i = 0; i < 16; i++) { l ^= P[i]; r ^= f(l); uint32_t t = l; l = r; r = t; }
        *xl = r ^ P[17];
        *xr = l ^ P[16];
    }

    void decrypt(uint32_t* xl, uint32_t* xr) const {
        uint32_t l = *xl, r = *xr;
        for (int i = 17; i > 1; i--) { l ^= P[i]; r ^= f(l); uint32_t t = l; l = r; r = t; }
        *xl = r ^ P[0];
        *xr = l ^ P[1];
    }
};
