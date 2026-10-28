# include/yo2 issues seen while porting src/Result (for the include/ owner)

`src/Result/yo2ResultWindow.h` keeps CWindowResult (0x3f0), CWindowTaskResultNext (0x5b8) and CWindowResultNpc
(0x430) at the generated sizes; no offset disagrees.

- **CTaskPtr members are flattened** into `f_` words (vptr in padding): CWindowResult `CTaskPtr<CTextElm>` at +0x3a8,
  +0x3b4, +0x3c0 (ctor 0x8c6ae0, vtable 0xbe76dc); CWindowResultNpc `CTaskPtr<CSpriteElm>` +0x398/+0x3a4,
  `CTaskPtr<CWindowTaskShadowText>` x7 from +0x3b0, `CTaskPtr<CWindowResultScroll>` +0x404 (New 0x8c9ea0).
- **CWindowResult**: +0x398/+0x3a0/+0x3a4 are raw pointers to its frame, text and scroll bar (init 0x8c6ee0), +0x3d4 a
  std::string (name), +0x3e4..+0x3ec three ints. The header has `_pad_0x398[0xc]`, `f_0x3a4` int32.
- **CWindowTaskModel slot 10** returns an int (`(int)(z + 5.0f)`, 0x8c6d20 / 0x8ca140), so it isn't `void`
  as `CWindowTaskModel_vf10()` is declared.
- **CWindowTaskShadowText** (System): +0x36c and +0x378 are `CTaskPtr<CWindowTaskText>` (main text, shadow),
  +0x384/+0x388 the shadow offset, +0x38c/+0x390 the position (ints) — 0x83d380, 0x8cc8a0.
- **labels.tsv**: yo2ResultWindow.cpp starts before 0x8c71d0. 0x8c4c40..0x8c6ee0 (CWindowTaskResultBase,
  CWindowResultScroll, CWindowResultNext, and CWindowResult's New/init/dtor/inline virtuals) are labelled `duel`.
  src/Result ports CWindowResult's: 0x8c6ae0 0x8c6ee0 0x8c6e00 0x8c6dd0 0x8c6d00 0x8c6d20 0x8c6d50 0x8c6d70
  0x8c6d90 0x8c6db0. The rest of that block (0x8c4c40..0x8c6ab0) is not ported.
- 0x8c8a00 (CD3DTextTexture font setter), 0x8cc8a0 / 0x8cc960 (CWindowTaskShadowText shadow setters) are System
  inlines that MSVC emitted into this object; they're labelled Result and ported here.
