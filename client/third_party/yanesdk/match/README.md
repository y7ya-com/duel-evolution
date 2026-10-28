# match/: how the `@yo2` markers in yaneSDK were produced

Python 3 with numpy (`/opt/homebrew/bin/python3.13`; run with `-I`). Reads `../` (this yaneSDK tree) and
`$YO2_DATA` (default `../yo2-decomp-data`: functions2.jsonl, labels.tsv, decompiled/, islands/, yo2.exe).

    python3.13 -I vt2.py        # exe vtables with their COL offsets -> vt2.json
    python3.13 -I align.py      # global source/exe alignment -> match.json (holdout tests: HOLD=1)
    python3.13 -I markers.py    # (re)writes the // @yo2 markers above every matched definition, -> markers.tsv
    python3.13 -I show.py CFile::Open | 0x5273e0   # source next to the decompilation
    python3.13 -I vtdiff.py CFile                  # computed vs exe vtable, slot by slot

- `yo.py` loads the exe side (functions, thunks, labels, vtables, decompilation; plus the code islands Ghidra never
  created, from `$YO2_DATA/islands/`, found by `islands.py` and decompiled read-only with `DecompileAt.java`:
  `tools/ghidra.py DecompileAt.java <addr file> <outdir> -scriptPath <this dir>`).
- `src.py` parses .cpp definitions in link order with Konami's configuration (`anchors.DEFS`); `hdr.py` parses class
  declarations and computes MSVC vtable layouts; `anchors.py` turns layouts that agree with the exe into exact anchors.
- `overrides.json`: hand-established facts the alignment must respect: files not linked, source functions absent
  from the exe, pairs found while porting Konami's changes (`manual`) and the hand review of every link-order-only
  pair (`review`), plus pairs reviewed as wrong (`forbid`).
- `patch.py`: edit a Shift-JIS/CRLF source file from UTF-8 `[old, new]` pairs.
