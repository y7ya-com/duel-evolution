"""Emitter hooks (kept apart from emit.py: gen.py's per-function cache re-emits only the functions a hook's address
falls in, instead of everything when emit.py changes)."""

# Immediates replaced by a runtime value: {address: (C literal as emitted, C expression)}.
# CD3DTextureManager (0x59c6d0) starts 128 texture loader threads, each spinning Sleep(1) over its slot (0x59f2f0):
# ~128k wake-ups a second per process. The thread-creating loop and the free-slot search use only rc_texloaders
# slots (YO2_TEXLOADERS, default 4; the slot-mutex wait loop at 0x59cad0 sees NULL mutexes for the rest and returns).
# ponytail: until the loader is rewritten with wake-ups (phase1-yanesdk)
IMM_HOOKS = {0x59c8ed: ("0x80u", "rc_texloaders"), 0x59f3a0: ("0x80u", "rc_texloaders"),
             0x6deebc: ("0x2u", "rc_first_scene"),   # the patcher's next scene: the title, not the KONAMI logo
             0x7fa658: ("0x5u", "rc_online_scene()"),  # ONLINE's next scene: the login, not the rules page (rt/debrand.cpp);
                                                        # the call also tells rt/session.cpp that ONLINE was pressed
             0x82e753: ("0x2u", "rc_room_min_lv"), 0x82e75f: ("0x1u", "rc_room_hidden_kind")}   # ovr/allrooms.c

# ovr/newstyle.c: the chibi motion records' address (0x012b6a30: 56 x 0x4c, PNG table +0 (+4 begin, +8 end), dictionary
# +0x10, timeline +0x34) in requestTextures 0x9c9ca0, releaseTextures 0x9ca1c0, texturesLoaded 0x9ca6c0 and createEngine
# 0x9cca40 is the record set of the elm being worked on: the legacy one or a new-style avatar's
IMM_HOOKS.update({
    0x9c9d7e: ("0x12b6a30u", "rc_ns_rec()"),
    0x9c9d90: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9c9d9e: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9c9dba: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9c9dc0: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9c9e0f: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9c9e24: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9c9e37: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9c9ea3: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9c9ea9: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca29e: ("0x12b6a30u", "rc_ns_rec()"),
    0x9ca2b0: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca2be: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca2da: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca2e0: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca32f: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca344: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca357: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca3c3: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca3c9: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca70c: ("0x12b6a30u", "rc_ns_rec()"),
    0x9ca71e: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca72c: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca748: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca74e: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca79d: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca7b2: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ca7c5: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca82f: ("0x12b6a38u", "rc_ns_rec8()"),
    0x9ca835: ("0x12b6a34u", "rc_ns_rec4()"),
    0x9ccadb: ("0x12b6a30u", "rc_ns_rec()"),
    0x9ccd89: ("0x12b6a64u", "rc_ns_rec34()"),
    0x9ccd8f: ("0x12b6a40u", "rc_ns_rec10()"),
})
