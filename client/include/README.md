# include/ — generated class headers (phase 0b)

`include/yo2/` is generated from yo2.exe's MSVC RTTI plus the decompiled cache in `../yo2-decomp-data`:

```
python3 -I include/gen/gen.py      # rewrites include/yo2/ wholesale (~8 s, ~160 MB peak), prints coverage + layout problems
```

Don't hand-edit `include/yo2/`: fix the generator (or add a naming table to it) and regenerate.

| File | What |
|---|---|
| `gen/rtti.py` | TypeDescriptor ← CompleteObjectLocator ← vtable[-1]; ClassHierarchyDescriptor/BaseClassArray → bases and offsets; MSVC type-name demangler |
| `gen/analyze.py` | Reads `decompiled/*.c`: constructors/destructors, `operator_new(N)` sizes, `this`-relative field accesses, embedded member objects |
| `gen/gen.py` | Sizes, slot identities, signatures, and emission |
| `yo2/<srcdir>/<Class>.h` | One header per class, foldered by the majority source dir of its functions (`labels.tsv`); nested classes live in their outer class's header |
| `yo2/yane_stub/`, `yo2/lib_stub/` | Stand-ins for the 15 yaneSDK / VC6-library classes that game classes derive from |
| `yo2/fwd.h`, `yo2/base.h`, `yo2/all.h` | Forward declarations (+ primary templates, enums), shared macros, everything in one TU |
| `yo2/classes.tsv` | Manifest: reference rank, size and its source, slot and field counts, header |

`yo2/all.h` compiles as one TU with host clang, `i686-w64-mingw32-g++`, and `clang -target i686-pc-windows-msvc
-ffreestanding` (the original ABI). Layout `static_assert`s only fire on 32-bit targets (`YO2_ABI32`).

## What a header says

```cpp
// .?AVCWindowTaskModel@@  size 0x398 (mi)  vtables 0x00be8988@+0x0, 0x00be896c@+0x340
class CWindowTaskModel : public CElement, public IWindowTaskMediator {
public:
    ~CWindowTaskModel() override;                      // @yo2-decl 0x005def20 slot 1
    void CElement_vf06() override;                     // @yo2-decl 0x005df4c0 slot 6
    virtual void CWindowTaskModel_vf09() = 0;          // pure slot 9
    uint8_t f_0x344;
    uint32_t f_0x348;   // ...
};
YO2_SIZE(CWindowTaskModel, 0x398);  YO2_OFFSET(CWindowTaskModel, f_0x348, 0x348);
// elsewhere: class CSceneTask : public CEasyTask { ... uint32_t f_0x70; CTaskPtr<CElement> f_0x74; };
```

- **Inheritance** comes straight from the BaseClassArray (bases declared in `mdisp` order, so MSVC and Itanium pick
  the same primary base). Virtual bases are omitted; only 10 library classes (mtknLib, iostreams) have them.
- **Virtual slots**: a slot's identity is the class that introduced it plus its index, found by walking the hierarchy.
  New slots are declared in vtable order; overrides are declared only when the class's slot target differs from its
  base's, with `override` so the compiler checks them. Names are `<Introducer>_vfNN`, except destructors (the slot whose
  targets are scalar deleting destructors). `_purecall` slots are `= 0`.
- **Signatures**: the stack-argument count comes from each implementation's `ret n` (majority across every override of
  that slot); types come from the Ghidra signature that matches it, mapped to fixed-width types; return type by vote,
  with `float`/`double` kept (x87 return). All overrides of a slot share one signature.
- **Addresses**: each slot carries `// @yo2-decl 0xADDR` (the real function, incremental-link thunks followed).
  Deliberately not `// @yo2 0xADDR`: `tools/coverage.py` scans `include/` too and would count every declared virtual
  as reimplemented. Rewrites keep using `// @yo2 0xADDR` on definitions.
- **Fields** are `f_0xOFF`, typed by the majority access width at that offset; gaps are explicit `_pad_` byte arrays,
  so every class fills its size exactly (which also stops Itanium tail-padding reuse from diverging from MSVC).
  Embedded objects seen in constructors (a member's vptr stored at `this+o`, or an `eh vector constructor iterator`
  over `this+o`) become typed members or arrays. Accesses are routed down to the base whose region holds them.

## Size sources and confidence

| Label | Evidence | Confidence |
|---|---|---|
| `new` | `operator_new(N)` followed by a constructor call or inlined vptr stores on the result; element size of an array ctor/dtor iterator | verified |
| `mi` | the next base's `mdisp` in a multiply-inheriting class (`CWindowTaskModel` = 0x398) | verified |
| `member` | a run of same-type embedded members at one stride, or a member gap equal to the field lower bound | verified |
| `template` | another specialisation of the same template with the same bases and vtable length is verified | high |
| `ctor` | a derived ctor's first member write right after an out-of-line base ctor call equals the field lower bound | high |
| `known` | VC6 `std::vector` (16), yaneSDK `mediator<T>` (4) | high |
| `iface` / `nofields` | nothing ever touches an own field: the vptr (interfaces) or the bases' end | medium |
| `min` | highest field access seen, rounded to 4 — a lower bound; no `YO2_SIZE` assert | low |

Fields carry `YO2_OFFSET` asserts in verified classes; those check the absolute offsets the emitter computed, so a
verified class's layout is right even when an unverified base's split between base and derived is not.

Known gaps: field types are widths, not meanings; a field only ever touched by inline code in another class is a
`_pad_`; MSVC6 constructors store the vptr *after* member init and elide inlined bases' stores, so destructors can look
like base constructors — the generator only trusts constructors that return `this`. Under MinGW (Itanium ABI) a
virtual destructor takes two vtable slots, so slot indices only match the original exe with an MSVC-ABI compiler
(`clang-cl`/`-target i686-pc-windows-msvc`).

## yaneSDK

Game classes derive from 11 yaneSDK classes (`CVirtualKey`, `CThread`, `CFile`, `CMouseEx`, ...). Their stand-ins in
`yo2/yane_stub/` are generated the same way and wrapped in `#ifndef YO2_REAL_YANESDK`. When phase 1's headers land,
define `YO2_REAL_YANESDK`, include them first, and add their method names to the generator so game-class overrides
(`CVirtualKey_vf03`) match the real names.
