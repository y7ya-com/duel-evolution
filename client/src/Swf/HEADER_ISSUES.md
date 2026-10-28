# include/yo2/Swf vs. the exe

src/Swf keeps its own hand-written headers (System's convention). The generated sizes below are wrong. The right ones
are checked by YO2_SIZEOF on i686 and by the difftest (`cases_swf.py`: the exe's reader fills these objects, and every
field is compared).

| Class | generated | real | evidence |
|---|---|---|---|
| CSwfCharaDictionary | 0x14 | 0x24 | `vector<CSwfDefTag*>` @4, `string` name @0x14; CSwfEngine embeds it at +0x300 and the timeline at +0x324 |
| CSwfCtrlTagTable | 0x14 | 0x18 | the reader keeps the deepest PlaceObject2 depth at +0x14 |
| CSwfCtrlTag | 0x4 | 0x8 | type @4 (every subclass's ctor writes it) |
| CSwfCtrlTag_PlaceObject2 | 0x4 | 0x84 | `operator new(0x84)` in addPlaceObject2 (0x6848b0) |
| CSwfCtrlTag_RemoveObject2 | 0x4 | 0xc | `operator new(0xc)`, depth @8 |
| CSwfDefTag | 0x4 | 0xc | type @4, character ID @8 |

Not generated at all, because they have no vtable: CSwfACTIONDATA (0x20), CSwfBUTTONRECORD2 (0x6c) and CSwfBUTTONCONDACTION (0x18).
