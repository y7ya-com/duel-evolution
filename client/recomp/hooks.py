"""Emitter hooks (kept apart from emit.py: gen.py's per-function cache re-emits only the functions a hook's address
falls in, instead of everything when emit.py changes)."""

# Immediates replaced by a runtime value: {address: (C literal as emitted, C expression)}.
# CD3DTextureManager (0x59c6d0) starts 128 texture loader threads, each spinning Sleep(1) over its slot (0x59f2f0):
# ~128k wake-ups a second per process. The thread-creating loop and the free-slot search use only rc_texloaders
# slots (YO2_TEXLOADERS, default 4; the slot-mutex wait loop at 0x59cad0 sees NULL mutexes for the rest and returns).
# ponytail: until the loader is rewritten with wake-ups (phase1-yanesdk)
IMM_HOOKS = {0x59c8ed: ("0x80u", "rc_texloaders"), 0x59f3a0: ("0x80u", "rc_texloaders"),
             0x6deebc: ("0x2u", "rc_first_scene"),   # the patcher's next scene: the title, not the KONAMI logo
             0x7fa658: ("0x5u", "rc_online_scene()")}  # ONLINE's next scene: the login, not the rules page (rt/debrand.cpp);
                                                        # the call also tells rt/session.cpp that ONLINE was pressed
