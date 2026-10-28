# include/yo2 issues found while porting src/caution (for the include/ owner)

- `include/yo2/Net/CHttpDownload.h` says size 0x4 (iface). It is 0x3c: CCautionScene embeds three of them at +0x80,
  +0xbc, +0xf8 (ctor 0x69fee0 called on each from CCautionScene::New 0x7fb6a0), and the members run to +0x38 (0x69fee0
  initialises +0x04..+0x34; 0x6a0180 clears +0x38; status +0x28 is read by 0x6a0450 and data +0x2c by 0x7fd780).
  `src/caution/HttpDownload.h` carries the layout until src/Net ports the class.
- `include/yo2/caution/CCautionScene.h` has the right size (0x178) but shows the three downloads and the first CTaskPtr
  as padding (`_pad_0x80[0xb8]`), and `f_0x138` / `f_0x144` / ... are the `task_` words of CTaskPtrs at +0x134, +0x140,
  +0x14c, +0x158, +0x164 (CBgCommon, then four CInfoDlgCommon).
- `CWindowLogin` vtable slots 5, 8 and 21 (0x7fdd30, 0x7fdd80, 0x7fdd50), its deleting destructor (0x7fddb0),
  destructor (0x7fdde0) and New (0x7fdac0) sit in cautionEntry.obj's address range, so labels.tsv files them under
  caution. They are inline members of src/login's class.
