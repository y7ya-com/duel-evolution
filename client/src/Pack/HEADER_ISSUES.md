# include/ layout notes from src/Pack

- The pack catalogue record (FUN_00845670 ctor, 0x6c bytes; also the layout of the CCardPack object built by
  FUN_0084d8a0) has no RTTI class, so include/ has no header: {+0 id, +4 type, +0x08 image, +0x18 name, +0x28 desc,
  +0x38 text3, +0x48 "<id>.iid", +0x58 ydc, +0x68 PBIN bit}, the six strings MSVC6 `std::string` (16 bytes). The table
  is an MSVC6 `std::map<int, record>` at DAT_012ae620 (nil node DAT_0128bc70). src/Pack/CardPack.h uses std::map /
  std::string stand-ins for now.
- `CWindowPackSelect` (include/yo2/Pack/CWindowPackSelect.h): `f_0x3a8` is the task pointer of a
  `CTaskPtr<CNoBackList>` at +0x3a4 (FUN_0085a840 adds the pack lines to it), not a plain int.
- labels.tsv puts FUN_0084d550 / 0084d760 / 0084d8a0 (yo2CardPack.h's table and CCardPack) under System (no
  __FILE__ string in them); they are Pack code.
