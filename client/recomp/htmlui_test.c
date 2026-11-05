// Native regression of the actual runtime table builder / ancestor walk, with synthetic guest objects.
// After gen.py, from recomp/: cc -O1 -ffunction-sections -fdata-sections -Irt -Iout htmlui_test.c
//   -Wl,--gc-sections -o <scratch>/htmlui-test && <scratch>/htmlui-test (Linux).
#include <assert.h>
#include "ovr/htmlui.c"
uint8_t *rc_mem;
static void draw(CPU *c) { assert(rc_mem[c->ecx + 0xc6] == 1); }
int main(void) {
 uint8_t mem[4096] = {0}; const uint8_t *m = mem;
 #define W(a,v) (*(uint32_t *)(mem + (a)) = (v))
 W(256, 1024); W(512, 2048); W(512+8,256); W(768,2048); W(768+8,512);
 build(); assert(!active); assert(!suppressed(m,768));
 tab.classes.n=1; tab.classes.vt[0]=1024; build();
 assert(active); assert(suppressed(m,256)); assert(suppressed(m,768)); // undiscovered instance and descendants
 tab.npass=1; tab.pass[0]=512; build(); assert(!suppressed(m,768)); // bust under class hide
 tab.nhide=1; tab.hide[0]=768; build(); assert(suppressed(m,768)); // nearest address still decides
 tab.pass[1]=768; tab.npass=2; build(); assert(!suppressed(m,768)); // pass wins a same-address hide
 tab.classes.n=0; build(); assert(!suppressed(m,256)); // old bridge: extension cleared
 tab.nhide=1; tab.hide[0]=256; tab.npass=0; build(); assert(suppressed(m,768)); // legacy address hide
 tab.nhide=0; build(); assert(!active); // disabled: empty fast path
 tab.classes.n=1; build(); rc_mem=mem;
 CPU c={0}; c.ecx=256;
 onMainHidden(&c,draw); assert(mem[256+0xc6]==0); // draw suppressed for the call, then restored
 mem[256+0xc6]=1; onMainHidden(&c,draw); assert(mem[256+0xc6]==1);
 return 0;
}
