// The web GDI stand-in's glyphs (platform/win32/font.cpp: stb_truetype, GDI cell = OS/2 winAscent+winDescent,
// GGO_GRAY8 levels = (a*64+127)/255) for one font file at one lfHeight > 0, as JSON on stdout: printable ASCII and
// the few other characters the pages use.
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static unsigned be16(const unsigned char* p) { return p[0] << 8 | p[1]; }
static unsigned be32(const unsigned char* p) { return (unsigned)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
int main(int argc, char** argv) {
    FILE* fp = fopen(argv[1], "rb"); int lfHeight = atoi(argv[2]);
    fseek(fp, 0, SEEK_END); long n = ftell(fp); fseek(fp, 0, SEEK_SET);
    unsigned char* d = malloc(n); fread(d, 1, n, fp); fclose(fp);
    stbtt_fontinfo f; stbtt_InitFont(&f, d, stbtt_GetFontOffsetForIndex(d, 0));
    const unsigned char* font = d + f.fontstart; int nt = be16(font + 4), wa = 0, wd = 0;
    for (int i = 0; i < nt; i++) { const unsigned char* r = font + 12 + 16 * i;
        if (!memcmp(r, "OS/2", 4)) { const unsigned char* o = d + be32(r + 8); wa = be16(o + 74); wd = be16(o + 76); } }
    float s = (float)lfHeight / (float)(wa + wd);
    printf("{\"ascent\":%d,\"height\":%d,\"glyphs\":{", (int)lroundf(wa * s), (int)lroundf(wa * s) + (int)lroundf(wd * s));
    static const int extra[] = {0xb7, 0x2015, 0x25cc, 0x25cf, 0x2713};   // · ― ◌ ● ✓ (the sign-in panel)
    for (int k = 0; k < 95 + 5; k++) {
        int cp = k < 95 ? 32 + k : extra[k - 95];
        int adv, lsb, x0, y0, x1, y1; stbtt_GetCodepointHMetrics(&f, cp, &adv, &lsb);
        stbtt_GetCodepointBitmapBox(&f, cp, s, s, &x0, &y0, &x1, &y1);
        int w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) w = h = 0;
        printf("%s\"%d\":{\"adv\":%d,\"x0\":%d,\"y0\":%d,\"w\":%d,\"h\":%d,\"lv\":[", cp > 32 ? "," : "", cp, (int)lroundf(adv * s), x0, y0, w, h);
        unsigned char* g = calloc(w * h + 1, 1);
        if (w) stbtt_MakeCodepointBitmap(&f, g, w, h, w, s, s, cp);
        for (int i = 0; i < w * h; i++) printf("%s%d", i ? "," : "", (g[i] * 64 + 127) / 255);
        printf("]}"); free(g);
    }
    printf("}}\n");
}
