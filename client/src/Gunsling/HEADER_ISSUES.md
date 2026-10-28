# Issues found while porting src/Gunsling (for the include/ owner)

- `include/yo2/Gunsling/CGunsMng.h` matches (0x98; step +0x70, event kind +0x74, CTaskPtrs +0x7c / +0x88).
- labels.tsv files CRatingScene::New and its destructors (0x997ac0, 0x997ce0, 0x997d10) under Gunsling; they are
  src/Rating's and are ported there (ui-a), so src/Gunsling doesn't mark them.
