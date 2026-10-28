// In the game (yo2rep.dll, i686 only): what the duel rewrite calls but doesn't implement yet goes straight to the
// exe's own function, so a partly rewritten duel still runs. The scene hooks have typed call-throughs; the engine's
// eng_<addr> placeholders are variadic cdecl, so they are a bare jmp to <addr> (the caller pushed the arguments and
// pops them, exactly as for the original).
#if defined(_WIN32) && defined(__i386__)
#include "EngineInternal.h"

template <class F> static F exe(uint32_t addr) { return reinterpret_cast<F>(addr); }

void duelView(int view, uintptr_t a, uintptr_t b, uintptr_t c) {
    exe<void(__cdecl*)(int, uint32_t, uint32_t, uint32_t)>(0x0073dd80)(view, (uint32_t)a, (uint32_t)b, (uint32_t)c);
}
void yo2LoadCardText(int32_t language) { exe<void(__cdecl*)(int32_t)>(0x0073b640)(language); }
int duelViewBusy(int view) { return exe<int(__cdecl*)(int)>(0x00743130)(view); }
bool soundEnabled() { return exe<char(__cdecl*)()>(0x00a58630)() != 0; }
void duelPlayBgm(int bgm, int loop, int fade) { exe<void(__cdecl*)(int, int, int)>(0x0073d4b0)(bgm, loop, fade); }

#define EXE_JMP(mangled, addr) \
    asm(".globl " mangled "\n" mangled ":\n\tmovl $" #addr ", %eax\n\tjmp *%eax\n")
EXE_JMP("__Z10eng_754340z", 0x00754340);
EXE_JMP("__Z10eng_722690z", 0x00722690);
EXE_JMP("__Z10eng_72ca70z", 0x0072ca70);
#endif
