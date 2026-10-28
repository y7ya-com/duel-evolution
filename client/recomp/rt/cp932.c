// Shift-JIS (cp932) <-> UTF-16 for MultiByteToWideChar / WideCharToMultiByte; tables from platform/tools.
#include "win.h"
#include "codepages.inc"

uint32_t rc_sjis_to_utf16(const char *s, uint32_t n, uint16_t *out, uint32_t outn) {
    uint32_t k = 0;
    for (uint32_t i = 0; i < n;) {
        uint8_t b = (uint8_t)s[i];
        uint16_t w;
        if (cp932Lead[b] && i + 1 < n) {
            uint8_t t = (uint8_t)s[i + 1];
            w = (t >= 0x40 && t <= 0xfc) ? cp932Double[(b - 0x81) * 189 + (t - 0x40)] : 0;
            if (!w) w = 0x30fb;
            i += 2;
        } else {
            w = cp932Single[b] ? cp932Single[b] : (b < 0x80 ? b : 0x30fb);
            i++;
        }
        if (out) {
            if (k >= outn) return 0;
            out[k] = w;
        }
        k++;
    }
    return k;
}

static uint16_t rev[0x10000];
uint32_t rc_utf16_to_sjis(const uint16_t *s, uint32_t n, char *out, uint32_t outn) {
    if (!rev['A']) {
        for (int l = 0xfc; l >= 0x81; l--)
            for (int t = 0xfc; t >= 0x40; t--) {
                uint16_t w = cp932Double[(l - 0x81) * 189 + (t - 0x40)];
                if (w) rev[w] = (uint16_t)(l << 8 | t);
            }
        for (int b = 255; b >= 0; b--)
            if (cp932Single[b]) rev[cp932Single[b]] = (uint16_t)b;
    }
    uint32_t k = 0;
    for (uint32_t i = 0; i < n; i++) {
        uint16_t v = s[i] ? rev[s[i]] : 0;
        if (s[i] && !v) v = '?';
        int len = v > 0xff ? 2 : 1;
        if (out) {
            if (k + len > outn) return 0;
            if (len == 2) out[k] = (char)(v >> 8), out[k + 1] = (char)v;
            else out[k] = (char)v;
        }
        k += len;
    }
    return k;
}
