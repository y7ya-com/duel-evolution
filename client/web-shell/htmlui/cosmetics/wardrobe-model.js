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
//  - the variant's worlds (catalog avatarRowWorlds): Domino outfits (dc_*) only outside the Academy, unless the student
//    has graduated (any owned outfit in either world: ranking.ts rankRowAllowed); disks and Academy outfits both;
//  - the rank uniforms (ranking.ts RANK_UNIFORM_BY_BIT: Slifer Red / Ra Yellow / Obelisk Blue, part 0x80 / 0x81 / 0x82
//    for both bodies, default rows) are not catalog items: they are earned by the best school ever reached, Slifer by
//    everyone; worn through the appearance call (they are not in /equip's catalog).
export const TABS = [
  { id: 'outfit', label: 'Outfits', empty: 'No outfits yet.' },
  { id: 'hair', label: 'Hair', empty: 'No hairstyles yet.' },
  { id: 'accessory', label: 'Accessories', empty: 'No accessories yet.' },
  { id: 'dueldisk', label: 'Duel Disks', empty: 'No duel disks yet.' },
];
export const EMPTY_HINT = 'Open boxes in the Card Shop to get wearables.';
export const WORLDS = [{ id: 0, label: 'Domino City' }, { id: 1, label: 'Duel Academy' }];
const WORLD_NAME = { 0: 'Domino City', 1: 'Duel Academy' };
const BODY = { male: 'male', female: 'female' };
const RARITY_ORDER = { ultra: 0, super: 1, rare: 2, common: 3 };
const SLOT_NAME = { 1: 'Hair', 2: 'Face', 6: 'Outfit', 8: 'Duel Disk', 9: 'Glasses' };

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
  const graduated = !!rank?.graduated && item.slot === 6;
  // the body's own rows: a merged item (Afro) lists them all; any of them in a world makes it wearable there
  const worlds = graduated ? [0, 1] : [...new Set((item.variants || []).filter(v => v.gender === body).flatMap(v => v.worlds || []))].sort();
  return { variant, worlds };
}
/** Whether `item` is worn in `world`'s look: any of the body's rows of its slot (Afro's sizes too). */
export function isEquipped(item, body, look) {
  if (!look || (look[0] === 1 ? 'female' : 'male') !== body) return false;
  return (item.variants || []).some(v => v.gender === body && v.number === look[item.slot]);
}
const uniformUnlocked = (u, rank) => u.school === 'slifer' || (rank?.uniforms || []).includes(u.school);

/** Can `body` wear `item` in `world`? { ok, reason } with the player-facing reason when not. */
export function canWear(item, body, world, rank) {
  if (item.uniform) {
    const u = SCHOOLS.find(s => s.school === item.school);
    if (!uniformUnlocked(u, rank)) return { ok: false, reason: `Locked: reach ${u.rank} in ranked Autoduel to unlock this uniform.` };
    return { ok: true, reason: '' };
  }
  const { variant, worlds } = wearInfo(item, body, rank);
  if (!variant) {
    const own = (item.bodies || []).map(b => BODY[b]).join(' and ');
    return { ok: false, reason: item.notice || `This item is for the ${own} body only for now.` };
  }
  if (!worlds.includes(world)) {
    if (item.slot === 6 && worlds.includes(0) && world === 1)
      return { ok: false, reason: 'Domino City outfits can only be worn outside Duel Academy until you graduate.' };
    return { ok: false, reason: `This item can only be worn in ${worldsText(worlds)}.` };
  }
  return { ok: true, reason: '' };
}

/** The rank uniform's status line ("Unlocked by reaching Ra Yellow" / the requirement). */
export function uniformStatus(item, rank) {
  const u = SCHOOLS.find(s => s.school === item.school);
  if (u.school === 'slifer') return 'Every student starts in Slifer Red';
  return uniformUnlocked(u, rank) ? `Unlocked by reaching ${u.rank}` : `Reach ${u.rank} in ranked Autoduel to unlock`;
}

/** Graduation: done, or the progress toward it (rank.graduation). */
export function graduationOf(rank) {
  const g = rank?.graduation || {};
  const level = +g.level || 1, levelRequired = +g.levelRequired || +rank?.graduationLevel || 20;
  const opponents = +g.opponents || 0, opponentsRequired = +g.opponentsRequired || 25;
  return { graduated: !!rank?.graduated, level, levelRequired, opponents, opponentsRequired,
    levelPct: Math.min(100, Math.round(100 * level / levelRequired)), opponentsPct: Math.min(100, Math.round(100 * opponents / opponentsRequired)),
    text: rank?.graduated ? 'Graduated: any outfit you own can be worn in either world.'
      : `Graduation: LV ${Math.min(level, levelRequired)}/${levelRequired} · ${Math.min(opponents, opponentsRequired)}/${opponentsRequired} rivals beaten` };
}

/** One tile's view. */
export function tileOf(item, info, world) {
  const body = bodyOf(info), rank = info?.rank, look = lookOf(info, world);
  const wear = canWear(item, body, world, rank), { worlds } = wearInfo(item, body, rank);
  const equippedIn = [0, 1].filter(w => isEquipped(item, body, lookOf(info, w)));
  const locked = !!item.uniform && !canWear(item, body, world, rank).ok;
  const single = !item.uniform && (item.bodies || []).length === 1 ? item.bodies[0] : null;
  return {
    id: item.id, item, name: item.name, rarity: item.rarity, kind: item.kind, uniform: !!item.uniform, school: item.school || null,
    equipped: isEquipped(item, body, look), equippedIn, locked, wearable: wear.ok, reason: wear.reason,
    spares: item.uniform ? 0 : Math.max(0, +item.copies || 0), single, otherBody: single && single !== body,
    worlds: item.uniform ? [0, 1] : worlds, where: item.uniform ? 'Both worlds' : wearInfo(item, body, rank).variant ? worldsText(worlds) : `${single ? BODY[single][0].toUpperCase() + BODY[single].slice(1) + ' body' : 'Not this body'} only for now`,
    status: item.uniform ? uniformStatus(item, rank) : '', slotName: SLOT_NAME[item.slot] || '',
  };
}

/** The whole view: { body, world, tab, tabs, tiles, selected, empty, graduation, total }. */
export function wardrobeView(info, { world, tab = 'outfit', selectedId } = {}) {
  const w = world === 0 || world === 1 ? world : info?.appearance?.world === 0 ? 0 : 1;
  const owned = (info?.inventory || []).filter(i => i.owned !== false || (+i.copies || 0) > 0);
  const byKind = k => owned.filter(i => i.kind === k);
  const tabs = TABS.map(t => ({ ...t, count: byKind(t.id).length + (t.id === 'outfit' ? SCHOOLS.filter(u => uniformUnlocked(u, info?.rank)).length : 0) }));
  const order = (a, b) => (b.equipped - a.equipped) || (b.wearable - a.wearable) || (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || a.name.localeCompare(b.name);
  const tiles = byKind(tab).map(i => tileOf(i, info, w)).sort(order);
  // the rank uniforms after the outfits: earned ones first, then the locked with their requirement
  const uniforms = tab === 'outfit' ? SCHOOLS.map(u => tileOf(uniformItem(u), info, w)) : [];
  const all = [...tiles, ...uniforms];
  const selected = all.find(t => t.id === selectedId) || all.find(t => !t.locked) || null;
  return { body: bodyOf(info), world: w, tab, tabs, tiles: all, items: tiles, uniforms, selected,
    empty: !tiles.length, emptyAll: !owned.length, emptyText: TABS.find(t => t.id === tab)?.empty || '', hint: EMPTY_HINT,
    graduation: graduationOf(info?.rank), total: owned.length };
}

/** The tab an item belongs to (openWardrobe({ focusId })). */
export const tabOfId = (info, id) => (String(id).startsWith('uniform:') ? 'outfit' : (info?.inventory || []).find(i => i.id === id)?.kind || null);

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
export const defaultLook = (body, world) => [body === 'female' ? 1 : 0, 0, 0x20, 0x30, 0x40, 0x60, world === 1 ? 0x80 : 0x70, 0x90,
  world === 1 ? 0xb8 : 0xb0, 0x20, 0, 0, 0, 0, 0, 0];

/** What the bust shows for tile `t` in `world`: { parts, state, saved }. state 'wearing' (the saved look: the item is
 *  worn, or nothing is selected), 'preview' (the saved look with the item put on, as the server's cosmeticEquip would:
 *  the body's variant for that world, parts[slot] = its number) or 'cant' (the saved look unchanged: the reason is
 *  the tile's). saved: the world's saved look (the default one when the world has none yet). */
export function previewOf(info, t, world) {
  const body = bodyOf(info), saved = [...(lookOf(info, world) || defaultLook(body, world))];
  if (!t || t.equipped) return { parts: saved, saved, state: 'wearing' };
  if (t.locked || !t.wearable) return { parts: saved, saved, state: 'cant', reason: t.locked ? t.status : t.reason };
  const item = t.item, graduated = item.slot === 6 && !!info?.rank?.graduated;
  const v = item.uniform ? item.variants[0]
    : (item.variants || []).find(x => x.gender === body && (graduated || (x.worlds || []).includes(world)));
  if (!v) return { parts: saved, saved, state: 'cant', reason: t.reason };
  const parts = [...saved];
  parts[item.slot] = v.number;
  return { parts, saved, state: 'preview' };
}
