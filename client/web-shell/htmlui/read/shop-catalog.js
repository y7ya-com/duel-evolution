// The native pack catalogue, without walking an undocumented STL node layout.
// src/Pack/PackInfo.cpp pins the CFile globals and PACK_Prop/Indx/Indx2 formats.
// third_party/yanesdk/yaneFile.h pins CFile's vector, stream, data(+0x18), size(+0x1c),
// flags(+0x34). GetMemory/GetSize (00527d30/00527d10) skip the four-byte encoded header.
const SJIS = new TextDecoder('shift_jis');
const FILES = { prop: 0x012ad390, name: 0x012ad590, index: 0x012ad550, description: 0x012ad510,
  image: 0x012ad450, imageIndex: 0x012ad410 };

function fileReader(h) {
  const file = address => {
    const pointer = h.u32(address + 0x18), size = h.u32(address + 0x1c), skip = h.u8(address + 0x34) ? 4 : 0;
    return pointer && size >= skip && size <= 4 * 1024 * 1024 ? { pointer: pointer + skip, size: size - skip } : null;
  };
  const word = (f, offset) => f && offset >= 0 && offset + 4 <= f.size ? h.u32(f.pointer + offset) : null;
  const string = (f, offset) => {
    if (!f || offset == null || offset < 0 || offset >= f.size) return '';
    const bytes = [];
    for (let i = offset; i < f.size && bytes.length < 4096; i++) {
      const byte = h.u8(f.pointer + i); if (!byte) break; bytes.push(byte);
    }
    return SJIS.decode(new Uint8Array(bytes));
  };
  return { file, word, string };
}

export function readPackMetadata(h, id) {
  const { file, word, string } = fileReader(h);
  const prop = file(FILES.prop);
  if (!prop || !Number.isInteger(id) || id <= 0) return {};
  for (let slot = 1; slot <= 0xc0 && (slot + 1) * 4 <= prop.size; slot++) {
    const value = word(prop, slot * 4);
    // packInfoId/Type: src/Pack/PackInfo.cpp 00841140/008411a0.
    if ((value << 17 >> 17) !== id) continue;
    const index = file(FILES.index), imageIndex = file(FILES.imageIndex);
    return {
      name: string(file(FILES.name), word(index, slot * 8)),
      description: string(file(FILES.description), word(index, slot * 8 + 4)),
      image: string(file(FILES.image), word(imageIndex, slot * 8)),
      packType: value << 13 >> 28,
    };
  }
  return {};
}

export function readAvatarMetadata(h, id) {
  if (!Number.isInteger(id) || id < 0 || id >= 1024) return {};
  // Game/yo2GameManager.h: singleton DAT_012bb6b0, pbinDict_ task pointer +0x45c.
  // Game/yo2PlayerBin.h: CPbinDictionary::info_ +0x70, 1024 PbinInfo records of0x1c.
  const manager = h.u32(0x012bb6b0), dictionary = manager && h.ptr(manager + 0x45c);
  if (!dictionary || h.cls(dictionary) !== 'CPbinDictionary') return {};
  const entry = dictionary + 0x70 + id * 0x1c, kind = h.u32(entry + 0x0c), slot = h.u32(entry + 0x10);
  if (h.u32(entry) !== id || ![1, 2].includes(kind) || slot < 1 || slot > 9) return {};
  // System/yo2StringDB.h: globalDAT_01271840, native CFiles bin+0x04 / index+0x44.
  // CPbinDictionary::displayName (00ad65e0) defines the localized slot/name/gender format.
  const strings = h.u32(0x01271840);
  if (!strings) return {};
  const { file, word, string } = fileReader(h), bin = file(strings + 4), index = file(strings + 0x44);
  const text = n => string(bin, word(index, n * 4));
  const name = text(h.u32(entry + 0x14));
  if (!name) return {};
  const slots = [0xc97, 0xc99, 0xc9e, 0xc9f, 0xca0, 0xca3, 0xca5, 0xcad, 0xc9a];
  const slotName = text(slots[slot - 1]), gender = text(kind === 1 ? 0xca7 : 0xca8);
  return { name: `${slotName ? slotName + ' - ' : ''}${name}${gender ? ' (' + gender + ')' : ''}` };
}
