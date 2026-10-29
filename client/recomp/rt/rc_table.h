#pragma once
#include "rc.h"
typedef struct { uint32_t addr; RcFn fn; } RcEntry;
typedef struct { uint32_t iat; RcFn fn; const char *dll, *name; } RcImport;
extern const RcEntry rc_table[];
extern const unsigned rc_table_n;
extern const RcImport rc_imports[];
extern const unsigned rc_imports_n;
// the image bytes the boot copies instead of reading the exe's .text: its headers first, then the .text ranges the
// code reads as data (jump tables, switch byte tables), back to back in rc_textdata_bytes (gen.py text_reads)
typedef struct { uint32_t va, n; } RcTextData;
extern const RcTextData rc_textdata[];
extern const unsigned rc_textdata_n;
extern const uint8_t rc_textdata_bytes[];
