// Native waist-up part names follow the same mapping as
// Game/Avatar/yo2ChibiAvatarElm.cpp::clothesPart. These paths refer to the player's
// own game archive, never copied art in the repository.
const two = n => String(n).padStart(2, '0');
export function cosmeticArtPath(item, gender = 'male') {
  const variant = item.variants?.find(v => v.gender === gender);
  if (!variant) return null;
  const female = gender === 'female', prefix = female ? 'ww' : 'wm', n = variant.number;
  if (item.kind === 'hair') return `data/avatar/wu/${prefix}_h1_${two(n + 1)}_c01.png`;
  if (item.kind !== 'outfit') return null;
  let part = '';
  if (n >= 0x7f) part = `ac_${two(n - 0x7f || 1)}_c01`;
  else {
    const k = n - 0x6f;
    if (!female) {
      if (k >= 0 && k < 5) part = `dc_01_c${two(k || 1)}`;
      else if (k < 8 && k >= 5) part = `dc_02_c${two(n - 0x73)}`;
      else part = ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_05_c01', 'dc_06_c01', 'dc_98_c01'][k - 8] || '';
    } else {
      if (k >= 0 && k <= 1) part = 'dc_01_c01';
      else if (k < 5 && k >= 2) part = `dc_02_c${two(n - 0x70)}`;
      else part = ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_98_c01'][k - 5] || '';
    }
  }
  return part ? `data/avatar/wu/${prefix}_${part}_l.png` : null;
}
