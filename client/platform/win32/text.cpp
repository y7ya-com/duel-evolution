// Code pages and wsprintf: MultiByteToWideChar / WideCharToMultiByte for 932 (Shift-JIS, Microsoft's), 1252 and
// UTF-8, from tables generated at configure time (platform/tools/gen_codepages.py); wsprintfA/W with Windows' %s/%S
// meaning (DESIGN.md §5).
#include <windows.h>

#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>

#include "codepages.inc"

namespace {

const WCHAR CP932_DEFAULT = 0x30FB;   // what Windows gives an undefined double-byte pair: KATAKANA MIDDLE DOT

UINT pick(UINT cp) {
    if (cp == CP_ACP || cp == 1 /*CP_OEMCP*/ || cp == 3 /*CP_THREAD_ACP*/) cp = GetACP();
    return cp == 932 || cp == 65001 ? cp : 1252;
}

WCHAR cp1252(unsigned char b) {
    if (b >= 0x80 && b < 0xA0) return cp1252High[b - 0x80] ? cp1252High[b - 0x80] : b;   // 5 undefined: kept, as Windows
    return b;
}

// One character from src[i..n): its UTF-16 value (or code point for UTF-8) and how many bytes it took
WCHAR decode(UINT cp, const unsigned char* s, int n, int& used) {
    used = 1;
    unsigned char b = s[0];
    if (cp == 932) {
        if (!cp932Lead[b]) return cp932Single[b] ? cp932Single[b] : (b < 0x80 ? b : CP932_DEFAULT);
        if (n < 2) return CP932_DEFAULT;   // a lead byte at the end
        unsigned char t = s[1];
        used = 2;
        if (t < 0x40 || t > 0xFC) return CP932_DEFAULT;
        WCHAR w = cp932Double[(b - 0x81) * 189 + (t - 0x40)];
        return w ? w : CP932_DEFAULT;
    }
    if (cp == 1252) return cp1252(b);
    // UTF-8
    if (b < 0x80) return b;
    int len = b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 0;
    if (!len || len > n) return 0xFFFD;
    uint32_t c = b & (0x7F >> len);
    for (int k = 1; k < len; k++) {
        if ((s[k] & 0xC0) != 0x80) return 0xFFFD;
        c = c << 6 | (s[k] & 0x3F);
    }
    used = len;
    return (WCHAR)c;   // WCHAR is 32 bits off Windows: no surrogate pairs needed
}

const std::vector<uint16_t>& cp932Reverse() {   // UTF-16 -> the Shift-JIS bytes (0 = none); first mapping wins
    static std::vector<uint16_t> r;
    if (r.empty()) {
        r.assign(0x10000, 0);
        for (int l = 0x81; l <= 0xFC; l++)
            for (int t = 0x40; t <= 0xFC; t++) {
                WCHAR w = cp932Double[(l - 0x81) * 189 + (t - 0x40)];
                if (w && !r[w]) r[w] = (uint16_t)(l << 8 | t);
            }
        for (int b = 0; b < 256; b++)
            if (cp932Single[b] && !r[cp932Single[b]]) r[cp932Single[b]] = (uint16_t)b;
    }
    return r;
}

// One wide character as bytes in out[]; returns the byte count, 0 when the code page has no such character
int encode(UINT cp, uint32_t w, char out[4]) {
    if (cp == 932) {
        if (w == 0) { out[0] = 0; return 1; }
        uint16_t v = w < 0x10000 ? cp932Reverse()[w] : 0;
        if (!v) return 0;
        if (v < 0x100) { out[0] = (char)v; return 1; }
        out[0] = (char)(v >> 8);
        out[1] = (char)v;
        return 2;
    }
    if (cp == 1252) {
        if (w < 0x80 || (w >= 0xA0 && w < 0x100)) { out[0] = (char)w; return 1; }
        for (int i = 0; i < 32; i++)
            if (cp1252High[i] == w || (!cp1252High[i] && w == 0x80u + i)) { out[0] = (char)(0x80 + i); return 1; }
        return 0;
    }
    if (w < 0x80) { out[0] = (char)w; return 1; }
    if (w < 0x800) { out[0] = (char)(0xC0 | w >> 6); out[1] = (char)(0x80 | (w & 0x3F)); return 2; }
    if (w < 0x10000) {
        out[0] = (char)(0xE0 | w >> 12); out[1] = (char)(0x80 | (w >> 6 & 0x3F)); out[2] = (char)(0x80 | (w & 0x3F));
        return 3;
    }
    out[0] = (char)(0xF0 | w >> 18); out[1] = (char)(0x80 | (w >> 12 & 0x3F));
    out[2] = (char)(0x80 | (w >> 6 & 0x3F)); out[3] = (char)(0x80 | (w & 0x3F));
    return 4;
}

// Windows' wsprintf conventions to C's: in the W form %s/%c are wide and %S/%C narrow; in the A form the reverse.
// C's vs(w)printf wants %ls/%lc for wide and %s/%c for narrow.
template <class C>
std::basic_string<C> cFormat(const C* fmt, bool wide) {
    std::basic_string<C> out;
    for (const C* p = fmt; *p; p++) {
        out += *p;
        if (*p != '%') continue;
        if (p[1] == '%') { out += *++p; continue; }
        while (p[1] > 0 && p[1] < 0x80 && strchr("-+ #0123456789.", (char)p[1])) out += *++p;   // flags, width, precision
        bool l = false, h = false;
        if (p[1] == 'l' || p[1] == 'h') { (p[1] == 'l' ? l : h) = true; p++; }
        C conv = p[1];
        if (!conv) break;
        p++;
        bool wideArg;
        if (conv == 's' || conv == 'c') wideArg = l || (!h && wide);
        else if (conv == 'S' || conv == 'C') wideArg = l || (!h && !wide);
        else { if (l) out += (C)'l'; if (h) out += (C)'h'; out += conv; continue; }
        if (wideArg) out += (C)'l';
        out += (C)(conv == 'S' || conv == 's' ? 's' : 'c');
    }
    return out;
}

}  // namespace

int MultiByteToWideChar(UINT cp, DWORD, LPCSTR src, int srcLen, LPWSTR dst, int dstLen) {
    if (!src) { SetLastError(87); return 0; }
    cp = pick(cp);
    if (srcLen < 0) srcLen = (int)strlen(src) + 1;
    const unsigned char* s = (const unsigned char*)src;
    int out = 0;
    for (int i = 0; i < srcLen;) {
        int used;
        WCHAR w = decode(cp, s + i, srcLen - i, used);
        i += used;
        if (dstLen) {
            if (out >= dstLen) { SetLastError(122 /*ERROR_INSUFFICIENT_BUFFER*/); return 0; }
            dst[out] = w;
        }
        out++;
    }
    return out;
}

int WideCharToMultiByte(UINT cp, DWORD, LPCWSTR src, int srcLen, LPSTR dst, int dstLen, LPCSTR def, LPBOOL used) {
    if (!src) { SetLastError(87); return 0; }
    cp = pick(cp);
    if (srcLen < 0) srcLen = (int)wcslen(src) + 1;
    if (used) *used = FALSE;
    int out = 0;
    for (int i = 0; i < srcLen; i++) {
        char b[4];
        int n = encode(cp, (uint32_t)src[i], b);
        if (!n) {   // no such character: the default character ('?' unless given)
            b[0] = def && *def ? *def : '?';
            n = 1;
            if (used) *used = TRUE;
        }
        if (dstLen) {
            if (out + n > dstLen) { SetLastError(122); return 0; }
            memcpy(dst + out, b, n);
        }
        out += n;
    }
    return out;
}

// wsprintf output is capped at 1024 characters, as on Windows
int wvsprintfA(LPSTR buf, LPCSTR fmt, va_list ap) {
    int n = vsnprintf(buf, 1024, cFormat(fmt, false).c_str(), ap);
    return n < 0 ? 0 : n > 1023 ? 1023 : n;
}
int wsprintfA(LPSTR buf, LPCSTR fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = wvsprintfA(buf, fmt, ap);
    va_end(ap);
    return n;
}
int wvsprintfW(LPWSTR buf, LPCWSTR fmt, va_list ap) {
    int n = vswprintf(buf, 1024, cFormat(fmt, true).c_str(), ap);
    if (n < 0) {   // too long (vswprintf fails instead of truncating): what fits
        buf[1023] = 0;
        n = (int)wcslen(buf);
    }
    return n;
}
int wsprintfW(LPWSTR buf, LPCWSTR fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = wvsprintfW(buf, fmt, ap);
    va_end(ap);
    return n;
}
