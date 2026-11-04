import assert from 'node:assert/strict';
import { readPackMetadata, readAvatarMetadata } from './shop-catalog.js';
const memory = new DataView(new ArrayBuffer(0x01300000));
const h = { u32: a => memory.getUint32(a, true), u8: a => memory.getUint8(a) };
const put = (a, n) => memory.setUint32(a, n, true);
const text = s => new TextEncoder().encode(s + '\0');
function file(address, pointer, bytes, encoded = false) {
  put(address + 0x18, pointer); put(address + 0x1c, bytes.length + (encoded ? 4 : 0)); memory.setUint8(address + 0x34, +encoded);
  new Uint8Array(memory.buffer, pointer + (encoded ? 4 : 0), bytes.length).set(bytes);
}
const props = new Uint32Array([0, 3, 7001 | 1 << 15]);
file(0x012ad390, 0x1000, new Uint8Array(props.buffer), true);
const names = text('Booster\0Structure Deck'), descriptions = text('Cards\0Ready-made deck'), images = text('pack.png\0deck.png');
file(0x012ad590, 0x2000, names); file(0x012ad510, 0x3000, descriptions); file(0x012ad450, 0x4000, images);
const index = new Uint32Array([0, 0, 0, 0, 8, 6]);
const imageIndex = new Uint32Array([0, 0, 0, 0, 9, 0]);
file(0x012ad550, 0x5000, new Uint8Array(index.buffer)); file(0x012ad410, 0x6000, new Uint8Array(imageIndex.buffer));
assert.deepEqual(readPackMetadata(h, 7001), { name: 'Structure Deck', description: 'Ready-made deck', image: 'deck.png', packType: 1 });
assert.deepEqual(readPackMetadata(h, 3), { name: 'Booster', description: 'Cards', image: 'pack.png', packType: 0 });
assert.deepEqual(readPackMetadata(h, 99), {});
assert.deepEqual(readPackMetadata(h, -1), {});
// Bad offsets and unavailable language blobs must not read unrelated memory.
put(0x5000 + 16, 0xffffffff); put(0x012ad510 + 0x18, 0);
assert.equal(readPackMetadata(h, 7001).name, ''); assert.equal(readPackMetadata(h, 7001).description, '');
put(0x012ad390 + 0x1c, 3);
assert.deepEqual(readPackMetadata(h, 3), {}, 'truncated encoded file is unavailable');
// Avatar names use the same PBIN dictionary and localized string table as the original shop.
const dictionary = 0x10000, manager = 0x30000, strings = 0x40000, id = 119;
const avatarH = { ...h, ptr: a => h.u32(a + 4), cls: a => a === dictionary ? 'CPbinDictionary' : '?' };
put(0x012bb6b0, manager); put(manager + 0x460, dictionary); put(0x01271840, strings);
const entry = dictionary + 0x70 + id * 0x1c;
put(entry, id); put(entry + 0x0c, 1); put(entry + 0x10, 6); put(entry + 0x14, 77);
const labels = new Map([[77, 'Black Suit'], [0xca3, 'Clothes'], [0xca7, 'Male']]);
const offsets = new Uint32Array(0xd00), content = [];
for (const [key, value] of labels) { offsets[key] = content.length; content.push(...text(value)); }
file(strings + 4, 0x70000, new Uint8Array(content)); file(strings + 0x44, 0x60000, new Uint8Array(offsets.buffer));
assert.deepEqual(readAvatarMetadata(avatarH, id), { name: 'Clothes - Black Suit (Male)' });
put(entry + 0x0c, 10); assert.deepEqual(readAvatarMetadata(avatarH, id), {}, 'non-avatar PBINs cannot invent outfit labels');
assert.deepEqual(readAvatarMetadata(avatarH, 1024), {});
put(0x012bb6b0, 0); assert.deepEqual(readAvatarMetadata(avatarH, id), {});
console.log('shop-catalog_test: ok');
