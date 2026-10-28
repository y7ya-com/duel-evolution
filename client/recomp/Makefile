# Build the recompiled yo2 (run through tools/buildslot.py). `make -j2` at most: the Mac is shared.
OUT := out
B := build
# ccache when installed: one cache for every worktree (the generated chunks build with -g0 and relative paths, so a
# chunk any session already compiled is a hit). Web: EM_COMPILER_WRAPPER wraps emcc's own clang.
CCACHE := $(shell command -v ccache 2>/dev/null)
export EM_COMPILER_WRAPPER := $(CCACHE)
CC := $(CCACHE) clang
CXX := $(CCACHE) clang++
OPT ?= -O1
CFLAGS := $(OPT) -g0 -w -Irt -I$(OUT)
RC_SRCS := $(wildcard $(OUT)/rc_[0-9]*.c)
RC_OBJS := $(patsubst $(OUT)/%.c,$(B)/%.o,$(RC_SRCS))
# strong f_XXXXXXXX overrides of recompiled functions (README "Overrides")
OVR_SRCS := $(wildcard ovr/*.c)
RT_SRCS := rt/rt.c rt/mem.c rt/k32.c rt/k32io.c rt/cp932.c rt/winmm.c rt/misc.c rt/wsock.c rt/wininet.c rt/gate.c rt/prof.c rt/decktap.c rt/audioui.c
RT_CXX := rt/audio.cpp rt/user32.cpp rt/debrand.cpp rt/session.cpp rt/ui_kit.cpp ../platform/vfs/vfs.cpp rt/d3d8.cpp rt/gdi32.cpp rt/plat_glue.cpp rt/comobj.cpp rt/dinput.cpp rt/dsound.cpp ../platform/audio/dsound.cpp ../platform/sdl/platform.cpp ../platform/gfx/d3d8.cpp \
  ../platform/win32/gdi.cpp ../platform/win32/font.cpp ../platform/win32/text.cpp
SDL_CFLAGS := $(shell sdl2-config --cflags)
SDL_LIBS := $(shell sdl2-config --libs) -framework OpenGL -framework AudioToolbox -framework CoreFoundation
PLAT_INC := -I../platform/win32 -I../platform/sdl -I../platform/gfx -I../platform -I../platform/third_party -Irt
RT_HDRS := rt/audioslots.h rt/rt.h rt/rc.h rt/win.h rt/codepages.inc

all: $(B)/rcdiff $(B)/yo2rc

# out/ follows the recompiler: an included stamp is remade first, then make restarts and sees the new chunks (gen.py
# rewrites only what changed: ~2 s when its cache holds). ponytail: the exe and functions2.jsonl aren't tracked.
-include $(OUT)/gen.stamp
$(OUT)/gen.stamp: gen.py emit.py cfg.py image.py hooks.py winapi_args.py
	.venv/bin/python gen.py && touch $@

rt/codepages.inc: ../platform/tools/gen_codepages.py
	python3 -I $< $@

$(B):
	mkdir -p $(B)

$(B)/%.o: $(OUT)/%.c rt/rc.h | $(B)
	$(CC) $(CFLAGS) -c $< -o $@

$(B)/librc.a: $(RC_OBJS) $(B)/rc_table.o
	rm -f $@ && ar rcs $@ $^

RT_CFLAGS := -O1 -g -Wall -Wno-unused-function -Irt -I$(OUT)

$(B)/rcdiff: rt/rcdiff.c rt/rt.c rt/mem.c $(RT_HDRS) $(B)/librc.a
	$(CC) $(RT_CFLAGS) rt/rcdiff.c rt/rt.c rt/mem.c $(B)/librc.a -o $@

winmm_test: $(B)/winmm_test
$(B)/winmm_test: rt/winmm_test.c rt/winmm.c $(RT_HDRS) | $(B)
	$(CC) $(RT_CFLAGS) -pthread rt/winmm_test.c rt/winmm.c -o $@

$(B)/cxx/%.o: %.cpp $(RT_HDRS) | $(B)
	mkdir -p $(dir $@)
	$(CXX) -MMD -MP -std=c++17 -O1 -g -Wall -Wno-unused-function $(SDL_CFLAGS) $(PLAT_INC) -Irt -I$(OUT) -c $< -o $@

RT_CXX_OBJS := $(patsubst %.cpp,$(B)/cxx/%.o,$(subst ../,up/,$(RT_CXX)))
$(B)/cxx/up/%.o: ../%.cpp | $(B)
	mkdir -p $(dir $@)
	$(CXX) -MMD -MP -std=c++17 -O1 -g -w $(SDL_CFLAGS) $(PLAT_INC) -c $< -o $@

# originals an override still calls (ovr/orig.txt), copied out of out/ as o_XXXXXXXX
$(B)/ovr_orig.c: ovr/orig.txt ovr/orig.py $(RC_SRCS) | $(B)
	python3 -I ovr/orig.py ovr/orig.txt $(OUT) > $@

$(B)/ovr_orig.o: $(B)/ovr_orig.c rt/rc.h
	$(CC) $(CFLAGS) -c $< -o $@

# the runtime's and the overrides' C as cached objects (header deps via -MMD): a link only links
RT_C_OBJS := $(patsubst %.c,$(B)/cobj/%.o,rt/main.c $(RT_SRCS) $(OVR_SRCS))
$(B)/cobj/%.o: %.c | $(B)
	mkdir -p $(dir $@)
	$(CC) -MMD -MP $(RT_CFLAGS) -c $< -o $@
-include $(RT_C_OBJS:.o=.d)

$(B)/yo2rc: $(RT_C_OBJS) $(RT_CXX_OBJS) $(B)/ovr_orig.o $(B)/librc.a
	clang++ $(RT_C_OBJS) $(B)/ovr_orig.o $(RT_CXX_OBJS) $(B)/librc.a $(SDL_LIBS) -o $@

# ---- web (Emscripten, browser MVP): `make web` -> build-web/yo2rc.{html,js,wasm}; `node web/serve.mjs` serves it.
# Guest address == wasm address (rt.c: rc_mem = 0): Emscripten's own data sits above the guest's 1 GB, in a fixed
# 2 GB shared memory. Guest threads are pthreads; the guest main thread yields to the browser through JSPI.
WB := build-web
# Guest address 0 is real memory here: without this, clang folds `rc_mem + a != NULL` (GS(a) ? .. : ..) to
# `rc_mem != NULL`, i.e. false, and every guest string read that way comes back empty (the window class, ...)
WEB_NULL := -fno-delete-null-pointer-checks
WEB_CFLAGS := $(OPT) -g0 -w -pthread $(WEB_NULL) -Irt -I$(OUT)
WEB_RC_OBJS := $(patsubst $(OUT)/%.c,$(WB)/%.o,$(RC_SRCS))
WEB_RT_CXX := $(RT_CXX) rt/web_net.cpp ../platform/net/net_ws.cpp
WEB_RT_CXX_OBJS := $(patsubst %.cpp,$(WB)/cxx/%.o,$(subst ../,up/,$(WEB_RT_CXX)))
WEB_CXXFLAGS := -std=c++17 -O1 -g0 -w -pthread $(WEB_NULL) -sUSE_SDL=2 $(PLAT_INC) -I../src -I../platform/net -Irt -I$(OUT)
# wasm-opt over ~150 MB of generated code is the memory risk at link time; raise once it is measured
WEB_LINK_OPT ?= -O0
WEB_RT_C_OBJS := $(patsubst %.c,$(WB)/c/%.o,rt/main.c rt/web.c $(RT_SRCS) $(OVR_SRCS))
WEB_LDFLAGS := $(WEB_LINK_OPT) -pthread -sJSPI -sPTHREAD_POOL_SIZE=8 \
  -sGLOBAL_BASE=1073741824 -sINITIAL_MEMORY=2147483648 -sMAXIMUM_MEMORY=2147483648 -sALLOW_MEMORY_GROWTH=0 \
  -sSTACK_SIZE=8MB -sDEFAULT_PTHREAD_STACK_SIZE=2MB -sASSERTIONS=0 -sENVIRONMENT=web,worker \
  -sUSE_SDL=2 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -lwebsocket.js -lidbfs.js \
  -sFORCE_FILESYSTEM=1 '-sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE=$$ENV' --profiling-funcs \
  --pre-js web/lazyfs.js --pre-js web/yieldguard.js --pre-js web/audio.js --pre-js web/audiopage.js --pre-js web/sfx.js --shell-file web/shell.html

web: $(WB)/yo2rc.html
# the script tag Emscripten writes, swapped for one that picks the build: JSPI if the browser has it (and the page has no
# ?async), else ASYNCIFY (make web-async). Firefox always gets ASYNCIFY: its JSPI (on by default from 158) breaks the
# synchronous Range XHRs from a suspended stack and its WebGL refuses views of the JSPI build's 2 GB heap
WEB_PICK := <script>{const s = document.createElement("script"); s.async = true; s.src = "Suspending" in WebAssembly \&\& navigator.userAgent.indexOf("Firefox/") < 0 \&\& !new URLSearchParams(location.search).has("async") ? "yo2rc.js" : "yo2rc-async.js"; document.body.append(s);}</script>

$(WB)/%.o: $(OUT)/%.c rt/rc.h
	@mkdir -p $(WB)
	emcc $(WEB_CFLAGS) -c $< -o $@

$(WB)/librc.a: $(WEB_RC_OBJS) $(WB)/rc_table.o
	rm -f $@ && emar rcs $@ $^

$(WB)/c/%.o: %.c $(RT_HDRS) rt/web_wsock.c
	@mkdir -p $(dir $@)
	emcc -O1 -g0 -Wall -Wno-unused-function -pthread $(WEB_NULL) -Irt -I$(OUT) -c $< -o $@

$(WB)/cxx/%.o: %.cpp $(RT_HDRS)
	@mkdir -p $(dir $@)
	em++ $(WEB_CXXFLAGS) -c $< -o $@

$(WB)/cxx/up/%.o: ../%.cpp
	@mkdir -p $(dir $@)
	em++ $(WEB_CXXFLAGS) -c $< -o $@

$(WB)/ovr_orig.o: $(B)/ovr_orig.c rt/rc.h
	@mkdir -p $(WB)
	emcc $(WEB_CFLAGS) -c $< -o $@

$(WB)/yo2rc.html: $(WEB_RT_C_OBJS) $(WEB_RT_CXX_OBJS) $(WB)/ovr_orig.o $(WB)/librc.a web/lazyfs.js web/yieldguard.js web/audio.js web/audiopage.js web/sfx.js web/shell.html
	em++ $(WEB_RT_C_OBJS) $(WEB_RT_CXX_OBJS) $(WB)/ovr_orig.o $(WB)/librc.a $(WEB_LDFLAGS) -o $@
	sed -i.bak 's#<script async type="text/javascript" src="yo2rc.js"></script>#$(WEB_PICK)#' $@ && rm -f $@.bak
	grep -q yo2rc-async.js $@

# ASYNCIFY fallback (WebKit/Safari and Firefox have no JSPI yet): the same objects, but the guest main thread's yields
# (emscripten_sleep, rt/web.c) unwind and rewind the wasm stack through Binaryen's asyncify instead of suspending.
# Output build-web/yo2rc-async.{js,wasm} beside the JSPI build; yo2rc.html loads whichever the browser can run.
# ASYNCIFY_ADVISE marks ~all 79k functions (every guest call goes through rc_icall's indirect call); instrumenting all
# of them gives 132 MB that V8 won't even compile (f_008df280: too many locals). So only web/async-only.txt is
# instrumented: the frames recorded on the stack at real yields (?yieldlog, web/yieldguard.js), ~50 functions, about
# the JSPI build's size. The same list goes into the page (web/asyncguard.js), which skips a yield from any other
# stack instead of letting it corrupt the unwind.
WEB_ASYNC_FLAGS ?= -sASYNCIFY -sASYNCIFY_IMPORTS=emscripten_sleep -sASYNCIFY_STACK_SIZE=1048576 \
  -sASYNCIFY_ONLY=@$(WB)/async-only.json --pre-js web/asyncguard.js
# 2 GB - 64 KB of memory: Firefox's WebGL rejects a heap view of exactly 2 GB ("can't be ... larger than 2 GB"), and
# Emscripten only switches its GL glue to copies above 2 GB. The guest uses the first 1 GB; Emscripten's heap loses a page.
WEB_ASYNC_MEM := 2147418112
WEB_ASYNC_LDFLAGS := $(subst =2147483648,=$(WEB_ASYNC_MEM),$(subst -sJSPI,$(WEB_ASYNC_FLAGS),$(WEB_LDFLAGS)))
web-async: $(WB)/yo2rc-async.js
$(WB)/async-only.json: web/async-only.txt
	@mkdir -p $(WB)
	python3 -I -c 'import json,sys; print(json.dumps([l.rstrip("\n") for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]))' $< > $@
$(WB)/yo2rc-async.js: $(WEB_RT_C_OBJS) $(WEB_RT_CXX_OBJS) $(WB)/ovr_orig.o $(WB)/librc.a $(WB)/async-only.json web/asyncguard.js web/wasmnames.py web/lazyfs.js web/yieldguard.js web/audio.js web/audiopage.js
	em++ $(WEB_RT_C_OBJS) $(WEB_RT_CXX_OBJS) $(WB)/ovr_orig.o $(WB)/librc.a $(filter-out --shell-file web/shell.html,$(WEB_ASYNC_LDFLAGS)) -o $@
	python3 -I web/wasmnames.py $(WB)/yo2rc-async.wasm $(WB)/async-only.json > $(WB)/async-only-idx.json
	python3 -I -c 'import sys; p, l = sys.argv[1:]; s = open(p).read(); assert "__RC_ASYNC_ONLY__" in s; open(p, "w").write(s.replace("__RC_ASYNC_ONLY__", open(l).read().strip()))' $@ $(WB)/async-only-idx.json

clean:
	rm -rf $(B) $(WB)
.PHONY: all clean web web-async

# header dependencies of the C++ runtime objects (platform/win32/d3d8.h etc.): a struct change rebuilds its users
-include $(RT_CXX_OBJS:.o=.d)
