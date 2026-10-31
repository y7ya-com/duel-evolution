// The card mini-picture name (0x922010, miniFile: thiscall, (vc6::string *out, int id), ret 8): it copies entry id of
// the data/MINI/list_card.txt table (16-byte vc6 strings, begin [this+0x18], end [this+0x1c]) with no bounds check. An
// id past the table (the structure-deck list's starter 8001 on live, 2026-10-31) copied an empty name, its callers
// loaded "data/MINI/" and CTextureManager's check ended the game. An id outside the table, or an empty entry, takes
// entry 0 ("0000.png") instead (reported once); every other id runs the original.
#include "rt.h"

void o_00922010(CPU *restrict c);

void f_00922010(CPU *restrict c) {
    uint32_t tab = c->ecx, id = ARG(1), begin = RD32m(tab + 0x18), end = RD32m(tab + 0x1c);
    uint32_t n = end > begin ? (end - begin) / 16 : 0;
    if (n && (id >= n || !RD32m(begin + id * 16 + 8))) {
        static int warned;
        if (!warned++) rc_log("rc_report: card mini picture: id %d outside the table (%u names) or empty: 0000.png", (int)id, n);
        WR32m(c->esp + 8, 0);   // the id argument (esp: the return address, +4 out, +8 id)
    }
    o_00922010(c);
}
