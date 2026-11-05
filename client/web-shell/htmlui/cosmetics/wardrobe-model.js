// The Wardrobe's view model (pure: cosmetics/wardrobe.js draws it; wardrobe_test.mjs checks it). From the server's
// cosmetics state (GET /api/de/cosmetics through cosmetics/api.js; server/src/game/cosmetics.ts state()):
//   inventory   the account's items (itemOut: the catalog item + owned, copies = spare copies, compatible)
//   appearance  { gender, world, parts, looks: { "0": parts, "1": parts } }: the character's look per world (parts[slot]
//               = the part's native number; parts[0] the body, 0 male 1 female)
//   rank        ranking.ts rankView: bestSchool, uniforms (the schools whose uniform is unlocked, for good), graduated,
//               graduation { level, levelRequired, opponents, opponentsRequired }
// Rules (the server's, mirrored so the panel can say why before a press; the server's answer still decides):
//  - an item is worn by its body's variant (the body's first: cosmeticEquip); no variant for this body: can't wear it
//    yet (its notice says so);
//  - one look for both worlds (owner, 2026-11-05): no world rule; what this body can wear is worn everywhere;
//  - the rank uniforms (ranking.ts RANK_UNIFORM_BY_BIT: Slifer Red / Ra Yellow / Obelisk Blue, part 0x80 / 0x81 / 0x82
//    for both bodies, default rows): Slifer is a free inventory item; Ra and Obelisk stay rank-authored.
//    The UI wears uniforms through the appearance call; the free Slifer entry also supports /equip.
// outfitLocked: true below LV5, exposed on wardrobeView and every tile (also supplied by the server).
// The tabs and their sub-categories, the character editor's own (ChangeAvatar/yo2ChangeAvatar.cpp kCategories: Hair
// Colour, Hair Style Front / Back, Eye Colour, Eyes, Nose, Mouth, Skin Colour, Clothes, Facial Accessory 1 / 2, Duel
// Disk), by the look byte an item fills. One sub-category's grid shows at a time: the grid never mixes unlike things.
// Premium and prize items sit where they are worn (a hair under Hair, glasses under Face).
export const SUBS = [
  { id: 'front', tab: 'hair', slot: 1, label: 'Front', row: 'Front hair' },
  { id: 'back', tab: 'hair', slot: 7, label: 'Back', row: 'Back hair' },
  { id: 'haircolour', tab: 'hair', slot: 14, label: 'Colour', row: 'Hair colour', colour: true },
  { id: 'eyes', tab: 'face', slot: 4, label: 'Eyes', row: 'Eyes' },
  { id: 'eyecolour', tab: 'face', slot: 15, label: 'Eye colour', row: 'Eye colour', colour: true },
  { id: 'nose', tab: 'face', slot: 3, label: 'Nose', row: 'Nose' },
  { id: 'mouth', tab: 'face', slot: 5, label: 'Mouth', row: 'Mouth' },
  { id: 'skin', tab: 'face', slot: 13, label: 'Skin', row: 'Skin', colour: true },
  { id: 'accessory', tab: 'face', slot: 2, label: 'Accessories', row: 'Accessory' },
  { id: 'glasses', tab: 'face', slot: 9, label: 'Glasses', row: 'Glasses' },
  { id: 'outfit', tab: 'outfit', slot: 6, label: 'Outfits', row: 'Outfit' },
  { id: 'dueldisk', tab: 'dueldisk', slot: 8, label: 'Duel disks', row: 'Disk' },
];
export const TABS = [
  { id: 'hair', label: 'Hair', empty: 'No hair yet.' },
  { id: 'face', label: 'Face', empty: 'No face parts yet.' },
  { id: 'outfit', label: 'Outfit', empty: 'No outfits yet.' },
  { id: 'dueldisk', label: 'Disk', empty: 'No duel disks yet.' },
];
const KIND_SUB = { hair: 'front', accessory: 'accessory', face: 'eyes', outfit: 'outfit', dueldisk: 'dueldisk' };
/** The sub-category an item is listed under: its look byte's, else its kind's. */
export const subOf = item => SUBS.find(s => s.slot === item?.slot) || SUBS.find(s => s.id === KIND_SUB[item?.kind]) || null;
// the editor's part names carry their category ("Eye Colour: Brown"); under that category the rest is the name
const PREFIX = /^(Hair Colour|Eye Colour|Back Hair|Hair|Eyes|Nose|Mouth)\s*:\s*/i;
/** An item's name in its sub-category's grid ("Eye Colour: Brown" -> "Brown", "Skin Tone 2" -> "Tone 2"). */
export const shortName = item => !item?.free ? item?.name || '' : String(item.name).replace(PREFIX, '').replace(/^Skin Tone /i, 'Tone ');
export const EMPTY_HINT = 'Win items from the Cosmetic Boxes in the Card Shop.';
/** The slots an item can be taken off from (the face mark, the glasses: their "none" is 0x20); hair, outfit and disk
 *  can only be changed for another. */
export const OFF_SLOTS = [2, 9], NONE = 0x20;
export const WORLDS = [{ id: 0, label: 'Domino City' }, { id: 1, label: 'Duel Academy' }];
const WORLD_NAME = { 0: 'Domino City', 1: 'Duel Academy' };
const BODY = { male: 'male', female: 'female' };
const RARITY_ORDER = { ultra: 0, super: 1, rare: 2, common: 3 };
const SLOT_NAME = { 1: 'Hair', 2: 'Face', 6: 'Outfit', 7: 'Back hair', 8: 'Duel Disk', 9: 'Glasses' };

export const SCHOOLS = [
  { school: 'slifer', name: 'Slifer Red Uniform', rank: 'Slifer Red', number: 0x80 },
  { school: 'ra', name: 'Ra Yellow Uniform', rank: 'Ra Yellow', number: 0x81 },
  { school: 'obelisk', name: 'Obelisk Blue Uniform', rank: 'Obelisk Blue', number: 0x82 },
];
/** The uniform items as the Wardrobe lists them (API-item shaped, so art.js draws them: ac_01..03). */
export const uniformItem = u => ({ id: `uniform:${u.school}`, name: u.name, kind: 'outfit', slot: 6, rarity: 'rank', school: u.school,
  uniform: true, variants: ['male', 'female'].map(g => ({ gender: g, bit: (g === 'female' ? 256 : 0) + u.number, number: u.number, worlds: [0, 1] })),
  bodies: ['male', 'female'] });

export const bodyOf = info => info?.appearance?.gender === 'female' || info?.appearance?.parts?.[0] === 1 ? 'female' : 'male';
export const lookOf = (info, world) => info?.appearance?.looks?.[String(world)] || (info?.appearance?.world === world ? info.appearance.parts : null);
export const worldsText = ws => (ws.includes(0) && ws.includes(1) ? 'Both worlds' : ws.length ? ws.map(w => WORLD_NAME[w]).join(' and ') : 'Nowhere yet');

/** Where `item` can be worn by `body`, with the graduation rule: { variant, worlds } (variant null: not this body). */
export function wearInfo(item, body, rank) {
  const variant = (item.variants || []).find(v => v.gender === body) || null;
  if (!variant) return { variant: null, worlds: [] };
  // one look for both worlds (owner, 2026-11-05): an item this body can wear is worn everywhere
  return { variant, worlds: [0, 1] };
}
/** Whether `item` is worn in `world`'s look: any of the body's rows of its slot (Afro's sizes too). */
export function isEquipped(item, body, look) {
  if (!look || (look[0] === 1 ? 'female' : 'male') !== body) return false;
  const cur = OFF_SLOTS.includes(item.slot) && !look[item.slot] ? NONE : look[item.slot];   // no glasses: 0 or 0x20
  return (item.variants || []).some(v => v.gender === body && v.number === cur);
}
const uniformUnlocked = (u, rank) => u.school === 'slifer' || (rank?.uniforms || []).includes(u.school);

/** Can `body` wear `item` in `world`? { ok, reason } with the player-facing reason when not. */
export function canWear(item, body, world, rank) {
  if (item.slot === 6 && item.school !== 'slifer' && Number(rank?.graduation?.level ?? 1) < 5) return { ok: false, reason: 'You can change out of the Slifer Red uniform at level 5.' };
  if (item.uniform) {
    const u = SCHOOLS.find(s => s.school === item.school);
    if (!uniformUnlocked(u, rank)) return { ok: false, reason: `Reach ${u.rank} in ranked to unlock.` };
    return { ok: true, reason: '' };
  }
  const { variant, worlds } = wearInfo(item, body, rank);
  if (!variant) {
    const own = (item.bodies || []).map(b => BODY[b]).join(' and ');
    return { ok: false, reason: `${own[0]?.toUpperCase() || ''}${own.slice(1)} body only for now.` };
  }
  void worlds; void world;
  return { ok: true, reason: '' };
}

/** The rank uniform's status line ("Unlocked by reaching Ra Yellow" / the requirement). */
export function uniformStatus(item, rank) {
  const u = SCHOOLS.find(s => s.school === item.school);
  if (u.school === 'slifer') return 'Every student starts in Slifer Red';
  return uniformUnlocked(u, rank) ? `Unlocked by reaching ${u.rank}` : `Reach ${u.rank} in ranked to unlock`;
}

/** Graduation: done, or the progress toward it (rank.graduation). */
export function graduationOf(rank) {
  const g = rank?.graduation || {};
  const level = +g.level || 1, levelRequired = +g.levelRequired || +rank?.graduationLevel || 20;
  const opponents = +g.opponents || 0, opponentsRequired = +g.opponentsRequired || 25;
  return { graduated: !!rank?.graduated, level, levelRequired, opponents, opponentsRequired,
    levelPct: Math.min(100, Math.round(100 * level / levelRequired)), opponentsPct: Math.min(100, Math.round(100 * opponents / opponentsRequired)),
    text: rank?.graduated ? 'Graduated'
      : `Graduation: LV ${Math.min(level, levelRequired)}/${levelRequired} · ${Math.min(opponents, opponentsRequired)}/${opponentsRequired} rivals beaten` };
}

/** One tile's view. */
export function tileOf(item, info, world) {
  const body = bodyOf(info), rank = info?.rank, look = lookOf(info, world);
  const effectiveRank = info?.outfitLocked === undefined ? rank : { ...rank, graduation: { ...rank?.graduation, level: info.outfitLocked ? 1 : Math.max(5, Number(rank?.graduation?.level || 5)) } };
  const wear = canWear(item, body, world, effectiveRank), { worlds } = wearInfo(item, body, rank);
  const equippedIn = [0, 1].filter(w => isEquipped(item, body, lookOf(info, w)));
  const outfitLocked = info?.outfitLocked ?? (Number(rank?.graduation?.level ?? 1) < 5);
  const locked = !wear.ok && (!!item.uniform || (outfitLocked && item.slot === 6));
  const single = !item.uniform && (item.bodies || []).length === 1 ? item.bodies[0] : null;
  return {
    id: item.id, item, free: !!item.free, name: shortName(item), fullName: item.name, sub: subOf(item)?.id || null, rarity: item.rarity, kind: item.kind, uniform: !!item.uniform, school: item.school || null,
    equipped: isEquipped(item, body, look), equippedIn, locked, outfitLocked, wearable: wear.ok, reason: wear.reason,
    spares: item.uniform ? 0 : Math.max(0, +item.copies || 0), single, otherBody: single && single !== body,
    worlds: item.uniform ? [0, 1] : worlds, where: item.uniform ? 'Both worlds' : wearInfo(item, body, rank).variant ? worldsText(worlds) : `${single ? BODY[single][0].toUpperCase() + BODY[single].slice(1) + ' body' : 'Not this body'} only for now`,
    status: locked && outfitLocked && item.slot === 6 ? wear.reason : item.uniform ? uniformStatus(item, rank) : '', slotName: SLOT_NAME[item.slot] || '',
    canTakeOff: isEquipped(item, body, look) && OFF_SLOTS.includes(item.slot) && !(item.variants || []).some(v => v.number === NONE),   // not "None" itself
  };
}

/** The whole view: { body, world, tab, tabs, sub, subs, tiles, selected, empty, graduation, total }. A sub-category
 *  shows one equipped tile at most (the first in its order). */
export function wardrobeView(info, { world, tab = 'outfit', sub, selectedId } = {}) {
  const w = world === 0 || world === 1 ? world : info?.appearance?.world === 0 ? 0 : 1;
  const owned = (info?.inventory || []).filter(i => (i.owned !== false || (+i.copies || 0) > 0) && (!i.free || (i.bodies || []).includes(bodyOf(info))));
  const inSub = id => owned.filter(i => subOf(i)?.id === id);
  const extraUniforms = SCHOOLS.filter(u => uniformUnlocked(u, info?.rank) && !owned.some(i => i.id === `uniform:${u.school}`)).length;
  const subsAll = SUBS.map(s => ({ ...s, count: inSub(s.id).length + (s.id === 'outfit' ? extraUniforms : 0) }));
  const tabs = TABS.map(t => ({ ...t, count: subsAll.filter(s => s.tab === t.id).reduce((n, s) => n + s.count, 0) }));
  if (!TABS.some(t => t.id === tab)) tab = 'outfit';
  const subs = subsAll.filter(s => s.tab === tab && (s.count || s.id === tab));
  const picked = selectedId ? subOf(owned.find(i => i.id === selectedId))?.id : null;
  const cur = subs.find(s => s.id === sub) || subs.find(s => s.id === picked) || subs[0] || null;
  // the free parts in the character editor's order (their part numbers); the rest worn first, then rarest
  const num = t => (t.item.variants || []).find(x => x.gender === bodyOf(info))?.number ?? 0;
  const order = (a, b) => (Number(a.free) - Number(b.free)) || (a.free && b.free ? num(a) - num(b) : 0) || (b.equipped - a.equipped) || (b.wearable - a.wearable) || (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || a.name.localeCompare(b.name, undefined, { numeric: true });
  const tiles = cur ? inSub(cur.id).map(i => tileOf(i, info, w)).sort(order) : [];
  // the rank uniforms after the outfits: earned ones first, then the locked with their requirement
  const uniforms = cur?.id === 'outfit' ? SCHOOLS.filter(u => !owned.some(i => i.id === `uniform:${u.school}`)).map(u => tileOf(uniformItem(u), info, w)) : [];
  const all = oneEquipped([...tiles, ...uniforms]), items = all.slice(0, tiles.length);
  const selected = all.find(t => t.id === selectedId) || all.find(t => !t.locked) || null;
  return { outfitLocked: info?.outfitLocked ?? (Number(info?.rank?.graduation?.level ?? 1) < 5), body: bodyOf(info), world: w, tab, tabs,
    sub: cur?.id || null, subs: subs.length > 1 ? subs : [], tiles: all, items, uniforms: all.slice(tiles.length), selected,
    empty: !tiles.length, emptyAll: !owned.length, emptyText: TABS.find(t => t.id === tab)?.empty || '', hint: EMPTY_HINT,
    graduation: graduationOf(info?.rank), total: owned.length };
}
// one equipped tile per sub-category (two items can name one part): the first keeps it
function oneEquipped(tiles) {
  let seen = false;
  return tiles.map(t => { if (!t.equipped) return t; if (seen) return { ...t, equipped: false, canTakeOff: false }; seen = true; return t; });
}
/** What is worn, one row per sub-category in the editor's order: [{ sub, tab, tile|null }]. */
export function wornRows(info, { world } = {}) {
  return SUBS.map(s => {
    const v = wardrobeView(info, { world, tab: s.tab, sub: s.id });
    return { sub: s, tab: s.tab, tile: v.sub === s.id ? v.tiles.find(t => t.equipped) || null : null };
  });
}

// A free part's thumbnail: the player's bust with that part swapped in, framed on what it changes (waistup.js steps:
// 0 back hair, 2 hair shade, 3 eye shade, 4 mouth, 5 eyes, 6 nose, 7 eyebrows, 8 face mark, 9 glasses, 11 front hair).
// min: the crop's least height in canvas px (the 768 art; a 64px card at 2x is ~116 device px, so ~120 draws about
// 1:1). The colour bytes (13 skin, 14 hair, 15 eyes) also get a chip of the colour.
const HEAD = [0, 2, 11, 5, 7], EYES = [3, 5, 7], FACE = [3, 4, 5, 6, 7];
const THUMB = {
  1: { steps: HEAD, min: 160, pad: 0 }, 7: { steps: HEAD, min: 160, pad: 0 }, 14: { steps: HEAD, min: 160, pad: 0 },
  4: { steps: EYES, min: 112, pad: 0.06 }, 15: { steps: [5], min: 96, pad: 0.06 },
  3: { steps: [6], min: 84, pad: 0.3 }, 5: { steps: [4], min: 84, pad: 0.3 },
  13: { steps: FACE, min: 176, pad: 0.06 },
  2: { steps: [5, 7, 8], min: 160, pad: 0.08 }, 9: { steps: [5, 7, 9], min: 144, pad: 0.08 },
};
// the chips: the art's own tones (c01..c07 hair and eyes, c01..c03 skin), sampled from the male 768 waist-up pictures:
// the front hair's median, the irises' (the eyes' saturated pixels; black: the median), the body's skin
export const CHIP = {
  13: ['#fecda5', '#fee5c2', '#ba7053'],
  14: ['#db7727', '#f7b200', '#4c4c4c', '#bbffff', '#bd251b', '#0066d3', '#00773b'],
  15: ['#864d16', '#cea60a', '#454852', '#30b1b7', '#8e0e00', '#004ab1', '#006434'],
};
/** How the Wardrobe pictures `item`: { kind: 'bust', steps, min, pad, chip } for a free face or hair part (framed on
 *  the part it changes; chip: a colour's swatch, else null), { kind: 'art' } otherwise (the item's own art). */
export function thumbOf(item) {
  const t = item?.free && !item.uniform ? THUMB[item.slot] : null;
  if (!t) return { kind: 'art' };
  return { kind: 'bust', steps: t.steps, min: t.min, pad: t.pad, chip: CHIP[item.slot]?.[item.variants?.[0]?.number] || null };
}

/** The tab an item belongs to (openWardrobe({ focusId })). */
export const tabOfId = (info, id) => subOfId(info, id) && SUBS.find(s => s.id === subOfId(info, id)).tab;
/** The sub-category an item is listed under, by id. */
export const subOfId = (info, id) => String(id).startsWith('uniform:') ? 'outfit' : subOf((info?.inventory || []).find(i => i.id === id))?.id || null;
/** The world's look with tile `t`'s slot taken off (a face mark or glasses: "none"), or null when it can't be. */
export function takeOffParts(info, t, world) {
  if (!t?.canTakeOff) return null;
  const parts = [...(lookOf(info, world) || defaultLook(bodyOf(info), world))];
  parts[t.item.slot] = NONE;
  return parts;
}

/** The appearance parts that put a uniform on in `world` (the look there with the clothes replaced). */
export function uniformParts(info, item, world) {
  const look = lookOf(info, world);
  if (!look) return null;
  const parts = [...look];
  parts[6] = item.variants[0].number;
  return parts;
}

// CAvatarData::setDefault's look (Game/Avatar/yo2AvatarData.cpp; GX: the red uniform and the Academy disk): the bust
// of a world with no saved look yet
export const defaultLook = (body, world) => [body === 'female' ? 1 : 0, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90,
  0xb8, 0x20, 0, 0, 0, 0, 0, 0];

/** What the bust shows for tile `t` in `world`: { parts, state, saved }. state 'wearing' (the saved look: the item is
 *  worn, or nothing is selected), 'preview' (the saved look with the item put on, as the server's cosmeticEquip would:
 *  the body's variant for that world, parts[slot] = its number) or 'cant' (the saved look unchanged: the reason is
 *  the tile's). saved: the world's saved look (the default one when the world has none yet). */
export function previewOf(info, t, world) {
  const body = bodyOf(info), saved = [...(lookOf(info, world) || defaultLook(body, world))];
  if (!t || t.equipped) return { parts: saved, saved, state: 'wearing' };
  if (t.locked || !t.wearable) return { parts: saved, saved, state: 'cant', reason: t.locked ? t.status : t.reason };
  const item = t.item;
  const v = item.uniform ? item.variants[0] : (item.variants || []).find(x => x.gender === body);
  if (!v) return { parts: saved, saved, state: 'cant', reason: t.reason };
  const parts = [...saved];
  parts[item.slot] = v.number;
  return { parts, saved, state: 'preview' };
}
