# Issues found while porting src/title (for the include/ and src/System owners)

- **src/System `CTmDestroyed` is missing its CTaskPtr.** When a CTaskPtr's target dies, the exe's
  `CTaskPtrBase::onTaskDestroyed` (0x6343a0) sends a 0x18-byte CTmDestroyed whose +0x14 is the CTaskPtr itself
  (`mov [esp+0x14],ecx`). CTitleScene::Receive (0x7fa450) relies on it: `msg+0x14 == &m_option` re-enters the title
  when the option dialog closes. src/System's CTmDestroyed ends at `sender` (+0x10) and its onTaskDestroyed doesn't
  pass the pointer, so src/title asks for it through `destroyedTaskPtr()` (titleExt.h) until System adds the field.
- **src/System `CTask` has no way to set lock bits from outside.** The title ORs 2 into `lockFlags_` (+0x20) of the
  world UI's windows it hides; titleEntry.cpp reaches the protected member through a derived-class pointer to
  member. A public `lock(mask)` would be cleaner.
- `include/yo2/title/CTitleScene.h`: `f_0x84` / `f_0x90` / `f_0x9c` are the `task_` words of three CTaskPtrs at
  +0x80 (CWindowModelDialogYesNo), +0x8c (CSwfEngine), +0x98 (COptionDlg); `f_0x88` etc. are their users.
- The scene's New / destructors (0x7f8c60, 0x7f8e80, 0x7f8ed0) and COptionDlg's (0x7f1cb0, 0x7f1f50, 0x7f1fa0) are
  labelled System in labels.tsv although they are emitted from src/title's .cpp files.
