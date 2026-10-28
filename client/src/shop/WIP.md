# src/shop: unfinished start (for the misc session, which owns src/shop now)

`yo2ShopParts.cpp.wip`, `yo2shopEntry.h`, `yo2ShopVec.h`, `yo2ShopExtern.h` come from phase2-ui-a e7a362a, a helper's
work saved mid-task: never built or tested. The .cpp is renamed so the build skips it. On i686 it fails
`YO2_SIZEOF(CShopPricePlate, ...)`; check the class layouts against the exe before using any of it.
The shop's message layer (CNetLobby 0x52xx / shop results) is done in src/Net/NetLobby_Shop.cpp.

## Verified (game-b, 2026-10-27)
The 16 markers on main (all in `yo2ShopVec.h` now; ShopLineVec moved there from yo2shopEntry.h) are checked:
the 14 POD vector instances by difftest (`harness/difftest/cases/shop.py`, 14/14 pass; the two allocator
constructors and the copy constructor were fixed to copy the allocator byte), ShopLineVec (0xb027f0 / 0xb025f0) by
`tests/ui_shop/shopvec_test.cpp`. `yo2ShopParts.cpp.wip` and the classes in `yo2shopEntry.h` are still unchecked
(no markers count from them); game-b ports them in work order.
