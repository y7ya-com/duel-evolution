# include/ layout notes from src/Deck part B (trade, TP)

Found while reimplementing tradeEntry.cpp / yo2TradeWindow.cpp / tpEntry.cpp; checked against the disassembly.

- `CWindowTaskTrade` (include/yo2/Deck/CWindowTaskTrade.h): `f_0x384..f_0x390` and `f_0x394..f_0x3a0` are two
  MSVC6 `std::vector<CWindowTaskTradeCard*>` (allocator byte + first/last/end): the partner's row and mine
  (FUN_00993090 / FUN_009932f0 grow them, FUN_00993550 / FUN_00993680 erase). `f_0x410` / `f_0x414` are the two
  10-capped counters, `f_0x418` "enabled", `f_0x419` "my ready pressed" (row step 40 instead of 72).
- `CWindowTaskTradeCard` (include/yo2/System/CWindowTaskTradeCard.h, foldered under System but its code is
  yo2TradeWindow.cpp): `f_0x374 f_0x378 f_0x384 f_0x388 f_0x38c f_0x390` are floats (x, y, z and the slot position;
  FUN_00993a40 copies float bit patterns), `+0x394` the card id, `+0x398` selected, `+0x3a0` last-of-row,
  `+0x3a2` enabled, `+0x39c` hover frames.
- `CTradeScene` (include/yo2/Deck/CTradeScene.h): `f_0x80` is a pointer to a 3-byte-per-card box
  {copies, not-tradeable, -} indexed from +9; `f_0x84` the saved deck list fixed after a trade; `f_0x154` is the
  `CNetLobby*`; `f_0x158` state, `f_0x15c` resume state, `f_0x160` partner left, `f_0x161` completed, `f_0x162`
  closing. Size 0x168 and every offset used here agree.
- `CTpScene` (include/yo2/System/CTpScene.h, again foldered under System): agrees (0xc0 Yes/No, 0xcc OK, 0xd8 busy,
  0x108 card limit).
- `CNetLobby` (src/Net stand-in, not include/): the trade block lives at +0x1bb4 inside `_11bc` padding and the result
  array at +0x7e0 (`FUN_006adfb0`, 0x70 s32 slots, -150 = none) straddles several named fields; both are reached
  through the padding here (deck_b_externs.h) until src/Net gives them members.
