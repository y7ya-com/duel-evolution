# game-b (0x00a60000..0x00b3ffff): what is blocked, and on what

Rows of the work order not rewritten yet because the class they belong to builds on something not on main:

| Rows | Class | Blocked on |
|---|---|---|
| 0x00a75050..0x00a7a060 | CChatWindow | its base CWindowModelChatWindow (System, 0x005f23a0) |
| 0x00a7e190..0x00a80b90 | CWindowModelMenu (the menu bar) | CWindowTaskMenubar (phase2-game 676c5da9, not on main yet). Written and syntax-checked against that header; it goes in with main's next merge |
| 0x00a822a0 | CWindowModelAboutEvent::onInit (4.8 KB of string-table concatenations) | not core (only its create is); later |
| 0x00ace150..0x00ad1100 | std::set<std::string> instances (CChatWindow's name set, nil node DAT_012bbb78) | CChatWindow. They copy keys COW (the exe's string shares the buffer and bumps the refcount byte), so a byte-exact difftest needs COW emulation; they come with CChatWindow |
| 0x00ad3130..0x00ad4020 | the 0x2c-byte {int, wstring, 6 ints} record's operator=, wstring compare, the sort partition | its user (the friend / team lists) |
| 0x00a9c580..0x00aaa5d0 | CDuelLogTask | its windows (CWindowModelDuellog*): its onMain reads their fields throughout |

Native stubs owned by game-b (trace/stubs.tsv):
- `pbinTest` / `pbinSet` (glue, Deck's TpEntry): forwarded in yo2GlueGameB.cpp to Net's CPlayerBinData on the account.
- `yo2MakeDirectory` 0x00b0c5f5 (CRT `_mkdir`, System's yo2SystemConfig on phase2-system) and `dk::fileStat`
  0x00b0bdc8 (CRT `_stat`): yo2GlueGameB.cpp, over the platform's mkdir / stat.
- `cardDbSyncTrunk` 0x00ad7d80: yo2CardDbSync.cpp (on g_kabanManager; the exe's named mutex dropped).
- `yo2AssertBox` "0x00b0ae12": misattributed. 0x00b0ae12 is CRT `exit` (doexit(code, 0, 0)); the assert box is
  FUN_0060cff0 (System). Pack's comment above the declaration names both and gen_stubs takes the nearer line's.
