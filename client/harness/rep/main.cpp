// yo2rep.dll: the function-replacement DLL. Deployed next to yo2.exe as version.dll (same trick as YOLaucher's
// yo2net.c: yo2.exe imports version.dll, it is not a KnownDLL, so Windows/Wine load ours first; under Wine set the
// override version=native,builtin). On load it:
//   1. forwards the 17 version.dll exports to the system DLL,
//   2. loads YOLaucher's network DLL if it sits next to the exe renamed as yo2net.dll (its DllMain installs its hooks),
//   3. patches `jmp yo2_<addr>` over the first 5 bytes of every original function we export a replacement for.
// YO2REP=off skips step 3; unset/all patches everything; YO2REP=689ea0,68a320 patches only those (bisecting a bad replacement). Log: yo2rep.log.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

static const DWORD YO2_TIMESTAMP = 0x48fef7e7;   // yo2.exe Ver.080912 PE header TimeDateStamp

// ------------------------------------------------------------------ version.dll forwarding (as in yo2net.c)
#define N_EXPORTS 17
static const char* const NAMES[N_EXPORTS] = {
    "GetFileVersionInfoA", "GetFileVersionInfoByHandle", "GetFileVersionInfoExA", "GetFileVersionInfoExW",
    "GetFileVersionInfoSizeA", "GetFileVersionInfoSizeExA", "GetFileVersionInfoSizeExW", "GetFileVersionInfoSizeW",
    "GetFileVersionInfoW", "VerFindFileA", "VerFindFileW", "VerInstallFileA", "VerInstallFileW", "VerLanguageNameA",
    "VerLanguageNameW", "VerQueryValueA", "VerQueryValueW",
};
extern "C" {
void* g_real[N_EXPORTS];   // C name: the stubs jump through _g_real
}

#define STR2(x) #x
#define STR(x) STR2(x)
#define STUB(i, n) \
    extern "C" __attribute__((naked)) void stub_##n() { __asm__("jmp *" STR(__USER_LABEL_PREFIX__) "g_real+4*" #i); }
STUB(0, GetFileVersionInfoA)
STUB(1, GetFileVersionInfoByHandle)
STUB(2, GetFileVersionInfoExA)
STUB(3, GetFileVersionInfoExW)
STUB(4, GetFileVersionInfoSizeA)
STUB(5, GetFileVersionInfoSizeExA)
STUB(6, GetFileVersionInfoSizeExW)
STUB(7, GetFileVersionInfoSizeW)
STUB(8, GetFileVersionInfoW)
STUB(9, VerFindFileA)
STUB(10, VerFindFileW)
STUB(11, VerInstallFileA)
STUB(12, VerInstallFileW)
STUB(13, VerLanguageNameA)
STUB(14, VerLanguageNameW)
STUB(15, VerQueryValueA)
STUB(16, VerQueryValueW)

static bool loadSystemVersion() {
    char path[MAX_PATH + 16];
    UINT n = GetSystemDirectoryA(path, MAX_PATH);   // full path, or the loader hands us back ourselves
    if (n == 0 || n >= MAX_PATH) return false;
    strcpy(path + n, "\\version.dll");
    HMODULE m = LoadLibraryA(path);
    if (!m) return false;
    for (int i = 0; i < N_EXPORTS; i++) g_real[i] = (void*)GetProcAddress(m, NAMES[i]);
    return true;
}

// ------------------------------------------------------------------ patching
static FILE* g_log;

static bool wanted(const char* hex, const char* only) {
    if (!only) return true;
    size_t n = strlen(hex);
    for (const char* p = only; (p = strstr(p, hex)); p += n)
        if ((p == only || p[-1] == ',') && (p[n] == 0 || p[n] == ',')) return true;
    return false;
}

static bool patchJmp(BYTE* at, void* to) {
    DWORD old;
    if (!VirtualProtect(at, 5, PAGE_EXECUTE_READWRITE, &old)) return false;
    at[0] = 0xe9;
    *(DWORD*)(at + 1) = (DWORD)((BYTE*)to - (at + 5));
    VirtualProtect(at, 5, old, &old);
    FlushInstructionCache(GetCurrentProcess(), at, 5);
    return true;
}

// Every export named yo2_<hex> replaces the original function at <hex>.
static void patchAll(HMODULE self) {
    BYTE* exe = (BYTE*)GetModuleHandleA(nullptr);
    IMAGE_NT_HEADERS* ent = (IMAGE_NT_HEADERS*)(exe + ((IMAGE_DOS_HEADER*)exe)->e_lfanew);
    if (ent->FileHeader.TimeDateStamp != YO2_TIMESTAMP) {
        fprintf(g_log, "not yo2.exe Ver.080912 (timestamp %08lx): nothing patched\n", ent->FileHeader.TimeDateStamp);
        return;
    }
    BYTE* text = exe + 0x1000;
    DWORD textSize = 0x7e30d3;
    const char* only = getenv("YO2REP");
    if (only && !strcmp(only, "off")) { fprintf(g_log, "YO2REP=off: nothing patched\n"); return; }
    if (only && (!*only || !strcmp(only, "all"))) only = nullptr;

    BYTE* base = (BYTE*)self;
    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)(base + ((IMAGE_DOS_HEADER*)base)->e_lfanew);
    IMAGE_DATA_DIRECTORY d = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
    IMAGE_EXPORT_DIRECTORY* ex = (IMAGE_EXPORT_DIRECTORY*)(base + d.VirtualAddress);
    DWORD* names = (DWORD*)(base + ex->AddressOfNames);
    WORD* ords = (WORD*)(base + ex->AddressOfNameOrdinals);
    DWORD* funcs = (DWORD*)(base + ex->AddressOfFunctions);
    int done = 0;
    for (DWORD i = 0; i < ex->NumberOfNames; i++) {
        const char* name = (const char*)(base + names[i]);
        if (strncmp(name, "yo2_", 4) || !wanted(name + 4, only)) continue;
        BYTE* at = (BYTE*)(uintptr_t)strtoul(name + 4, nullptr, 16);
        if (at < text || at + 5 > text + textSize) { fprintf(g_log, "%s: outside .text, skipped\n", name); continue; }
        bool ok = patchJmp(at, base + funcs[ords[i]]);
        fprintf(g_log, "%s %s\n", name, ok ? "patched" : "VirtualProtect FAILED");
        done += ok;
    }
    fprintf(g_log, "%d replacement(s) active\n", done);
}

BOOL WINAPI DllMain(HINSTANCE self, DWORD why, LPVOID) {
    if (why != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls(self);
    if (!loadSystemVersion()) return FALSE;
    g_log = fopen("yo2rep.log", "w");
    if (!g_log) g_log = stderr;
    if (LoadLibraryA("yo2net.dll")) fprintf(g_log, "yo2net.dll loaded (YOLaucher network hooks)\n");
    patchAll(self);
    fflush(g_log);
    return TRUE;
}
