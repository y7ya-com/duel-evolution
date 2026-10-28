# include/yo2/Rating issues (for the include/ owner)

`src/Rating/yo2Rating.h` keeps both classes at the generated sizes (CRatingScene 0xb0, CRatingTask 0xd0); no offset
disagrees. What the generated headers miss:

- **CTaskPtr members are flattened.** CRatingScene has `CTaskPtr<CSpriteElm>` at +0x88, +0x94, +0xa0 (ctor inlined
  in 0x997ac0 writes vtable 0xbe748c at each); the header shows only their `task_`/`user_` words as `f_0x8c`, `f_0x90`,
  ... with the vptr in padding. Same in CRatingTask: `CTaskPtr<CElement>` +0x78 (vtable 0xbe9704), `CTaskPtr<CSpriteElm>`
  +0x8c, +0x98, +0xa4 (0x998d40).
- **CRatingTask embeds a HelpText at +0xb0** (`HelpText::HelpText` with ecx = this+0xb0 in 0x998d40; `setText` /
  `setPriority` on this+0xb0 in 0x999070 / 0x9995a0). The header has it as `_pad_0x98[0x38]`.
- **labels.tsv**: CRatingScene::New 0x997ac0, its destructor 0x997d10 and deleting destructor 0x997ce0 are labelled
  `Gunsling`; they are Rating code (vtable 0xbf0618, string "CRatingScene"). src/Rating carries their markers.
