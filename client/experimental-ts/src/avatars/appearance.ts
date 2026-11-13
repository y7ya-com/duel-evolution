/** Network byte layout from CAvatarData; bytes 13..15 are skin/hair/eye colours. */
export function avatarParts(parts: ArrayLike<number>): Uint8Array {
  if (parts.length !== 16 || Array.from(parts).some(n => !Number.isInteger(n) || n < 0 || n > 255) || parts[0] > 1 || parts[13] > 2 || parts[14] > 6 || parts[15] > 6) throw new Error('Invalid avatar appearance');
  return Uint8Array.from(parts);
}
export function defaultAvatar(sex: 0 | 1 = 0, world: 0 | 1 = 0): Uint8Array {
  return Uint8Array.of(sex, 0, 0x20, 0x30, 0x40, 0x60, world ? 0x80 : 0x70, 0x90, world ? 0xb8 : 0xb0, 0x20, 0, 0, 0, 0, 0, 0);
}
const pad = (n: number): string => String(n).padStart(2, '0');
const part = (s: string, n: number, c = 1): string => `${s}_${pad(n)}_c${pad(c)}`;
function clothesPart(c: number, female: boolean): string | undefined {
  if (c >= 0x7f) return part('ac', Math.max(1, c - 0x7f));
  const k = c - 0x6f;
  if (k < 0) return undefined;
  if (!female) {
    if (k < 5) return part('dc', 1, Math.max(1, k));
    if (k < 8) return part('dc', 2, c - 0x73);
    return ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_05_c01', 'dc_06_c01', 'dc_98_c01'][k - 8];
  }
  if (k <= 1) return 'dc_01_c01';
  if (k < 5) return part('dc', 2, c - 0x70);
  return ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_98_c01'][k - 5];
}
/** Exact filename replacement rules from CChibiAvatarElm::applyMale/FemaleParts.
 * Does not apply the original account/unlock validation (requires PBIN/world tables).
 * Nose and duel-disk byte are not used by these chibi routines; disk follows world.
 */
export function resolveAvatarPngs(names: readonly string[], appearance: ArrayLike<number>, world: 0 | 1): string[] {
  const b = avatarParts(appearance), female = b[0] === 1;
  let hair = b[1] + 1, color = b[14] + 1;
  const bald = !female && hair === 7;
  if (bald) color = 1;
  const hood = female ? b[6] === 117 || b[6] === 119 : b[6] === 120 || b[6] === 124;
  if (hood) hair = b[6] === (female ? 117 : 120) ? 99 : 98;
  let back = part('h2', Math.max(1, b[7] - 0x8f), color);
  if (female) {
    if (hair === 9) back = part('h2', 9, color);
    else if ([6, 7, 8, 10].includes(hair)) back = part('h2', hair, color);
  } else if (hair >= 11 && hair <= 14) back = part('h2', hair, color);
  if (bald || hood) back = 'h1_50_c01';
  let eyes = Math.max(1, b[4] - 0x3f), eyeColor = b[15] + 1;
  if (!female && [3, 4, 6].includes(eyes)) eyeColor = 1;
  const glasses = (female
    ? ['a2_01_c01', 'a2_02_c01', 'a2_02_c02', 'a2_02_c03', 'a2_02_c04', 'a2_02_c05', 'a2_03_c01']
    : ['a2_01_c01', 'a2_02_c01', 'a2_02_c02', 'a2_02_c03', 'a2_03_c01'])[b[9] - 80] ?? 'a2_00_c01';
  const replacements: [string, string][] = [
    ['h1_01_c01', part('h1', hair, hood ? 1 : color)], ['a1_01_c01', part('a1', b[2] - 0x20)],
    ['ey_01_c01', part('ey', eyes, eyeColor)], ['mo_01', `mo_${pad(Math.max(1, b[5] - 0x5f))}`],
    ['bo_01_c01', part('bo', 1, b[13] + 1)], ['dc_01_c01', clothesPart(b[6], female) ?? 'dc_01_c01'],
    ['h2_01_c01', back], ['a2_01_c01', glasses],
  ];
  if (world === 1) replacements.push(['dd_01_c01', 'ad_01_c01']);
  return names.map(name => {
    if (female) name = name.replace('cm', 'cw');
    for (const [from, to] of replacements) name = name.replace(from, to);
    return name;
  });
}
export type AvatarMotion = 'stand' | 'walk' | 'greet' | 'turn' | 'duelStart' | 'duelLoop' | 'duelEnd';
export const AVATAR_MOTIONS = {
  stand: { code: 'n', priority: 100, loop: true, canTurn: true, next: 'stand' },
  walk: { code: 'w', priority: 200, loop: true, canTurn: true, next: 'walk' },
  greet: { code: 'g', priority: 300, loop: false, canTurn: false, next: 'stand' },
  // cm_t: the blink (CChibiAvatarElm's idle motion 3, as an NPC's cn_t; the world plays it over the standing frame)
  turn: { code: 't', priority: 150, loop: true, canTurn: false, next: 'stand' },
  duelStart: { code: 'd01_01', priority: 600, loop: false, canTurn: false, next: 'duelLoop' },
  duelLoop: { code: 'd01_02', priority: 500, loop: false, canTurn: true, next: 'duelLoop' },
  duelEnd: { code: 'd01_03', priority: 700, loop: false, canTurn: false, next: 'stand' },
} as const;
export function avatarPose(motion: AvatarMotion = 'stand', direction = 0) {
  if (!Number.isInteger(direction) || direction < 0 || direction > 7) direction = 0;
  const spec = AVATAR_MOTIONS[motion];
  if (!spec) throw new Error('Unknown avatar motion');
  const facing = [1, 2, 3, 4, 5, 4, 3, 2][direction];
  return { path: `data/Avatar/chibi/cm_${spec.code}${spec.code.length === 1 ? pad(facing) : ''}.txt`, mirrored: direction >= 5, offset: [-46, -116] as const, foot: [40, 116] as const, ...spec };
}
export function avatarDirection(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid direction vector');
  let a = Math.atan2(x, y) * -1.2732395 + 0.5;
  if (a < 0) a += 8;
  return Math.trunc(a) % 8;
}
