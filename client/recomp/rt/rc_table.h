#pragma once
#include "rc.h"
typedef struct { uint32_t addr; RcFn fn; } RcEntry;
typedef struct { uint32_t iat; RcFn fn; const char *dll, *name; } RcImport;
extern const RcEntry rc_table[];
extern const unsigned rc_table_n;
extern const RcImport rc_imports[];
extern const unsigned rc_imports_n;
