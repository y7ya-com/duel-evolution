// Change Avatar (CWindowDialogAvatarSwitch, src/ChangeAvatar/yo2ChangeAvatar.cpp; scene CHANGE_AVATAR, CChangeAvatarPack)
// through main's screens/avatar.js: the 13 category plates (abmake_btn_01_c01..04, 324 x 44: normal / hover / chosen
// columns), a page of up to 14 items (abmake_btn_02_01, 254 x 34) in the item panel (703, 60), the page arrows
// (shop_arrow_04 next, 10 previous), Confirm / Back (abmake_btn_03_01, 162 x 42). The window is 336 x 550 at 0, 0, its
// controls right of it, as avatar.js expects; the portrait of the look being made is start-scene.ts's. Two uses, as the
// original: first dressing after Create Player's name (no Back), and Change Avatar from the game (the server's parts).
import type { HtmlDialog, BuildContext } from './windows';
import { WindowBuilder, type WindowSpec } from './snapshot';

export type AvatarDialog = Extract<HtmlDialog, { kind: 'avatar' }>;
export interface AvatarChoice { value: number; label: string }
/** One category: the CAvatarData byte it sets, its label, its plate's colour (abmake_btn_01_c0N). */
interface Category { index: number; label: string; plate: 1 | 2 | 3 | 4 }
// the original's categories (the 13 bytes of CAvatarData a player picks: 10..12 are unused) in live's order and words,
// each on its plate's colour (abmake_btn_01_c01 yellow, c02 cyan, c03 orange, c04 blue; the chosen one pink)
export const CATEGORIES: readonly Category[] = [
  { index: 0, label: 'Gender', plate: 1 }, { index: 14, label: 'Hair Colour', plate: 1 }, { index: 1, label: 'Hair Style (Front)', plate: 1 }, { index: 7, label: 'Hair Style (Back)', plate: 1 },
  { index: 15, label: 'Eye Colour', plate: 2 }, { index: 4, label: 'Eyes', plate: 2 }, { index: 3, label: 'Nose', plate: 2 }, { index: 5, label: 'Mouth', plate: 2 },
  { index: 13, label: 'Skin Colour', plate: 3 },
  { index: 6, label: 'Clothes', plate: 4 }, { index: 2, label: 'Facial Accessory 1', plate: 4 }, { index: 9, label: 'Facial Accessory 2', plate: 4 }, { index: 8, label: 'Duel Disk', plate: 4 },
];
/** The category the window opens on (the engine's: Duel Disk, the last plate). */
export const FIRST_CATEGORY = 8;
// The free parts every new character has (gamedata/lobby.json avatar_pbin's initial rows, body 1 male / 2 female; the
// names yo2text_e 3250..3411, as the server's cosmetics-catalog FREE_NAMES). Clothes: Slifer Red, the default outfit
// (the server keeps Slifer Red until level 5, rank uniforms after).
const COLOURS = ['Brown', 'Blonde', 'Black', 'White', 'Red', 'Blue', 'Green'];
const FREE: Record<0 | 1, Record<number, [number, string][]>> = {
  0: { 1: [[0, 'Default'], [1, 'Long Hair'], [2, 'Short Hair'], [3, 'Spiky Hair'], [4, 'Centre Parting'], [5, 'Slick Hair']], 2: [[32, 'None']],
    3: [[48, 'Default'], [49, 'Small']], 4: [[64, 'Default'], [65, 'Cold Eyes'], [66, 'Dark Eyes'], [67, 'Wild Eyes'], [68, 'Large Eyes'], [69, 'Thin Eyes']],
    5: [[96, 'Default'], [97, 'Small'], [98, 'Smirking']], 6: [[128, 'Slifer Red Uniform']], 7: [[144, 'Default'], [145, 'Punk Hair'], [146, 'Long Hair'], [147, 'Ponytail']],
    8: [[176, 'Battle City Model'], [184, 'Duel Academy Model']], 9: [[32, 'None']] },
  1: { 1: [[0, 'Default'], [1, 'Swept Hair'], [2, 'Centre Parting'], [3, 'Short Hair'], [4, 'Fringe']], 2: [[32, 'None'], [33, 'Cheeks']],
    3: [[48, 'Default'], [49, 'Small']], 4: [[64, 'Default'], [65, 'Cold Eyes'], [66, 'Gentle Eyes'], [67, 'Cat eyes']],
    5: [[96, 'Default'], [97, 'Glossy']], 6: [[128, 'Slifer Red Uniform']], 7: [[144, 'Default'], [145, 'Long'], [146, 'Medium']],
    8: [[176, 'Battle City Model'], [184, 'Duel Academy Model']], 9: [[32, 'None']] },
};
/** A new character's free choices for a category (its body's). */
export function freeChoices(index: number, female: boolean): AvatarChoice[] {
  if (index === 0) return [{ value: 0, label: 'Male' }, { value: 1, label: 'Female' }];
  if (index === 13) return [0, 1, 2].map(value => ({ value, label: `Skin Tone ${value + 1}` }));
  if (index === 14 || index === 15) return COLOURS.map((c, value) => ({ value, label: c }));
  return (FREE[female ? 1 : 0][index] ?? []).map(([value, label]) => ({ value, label }));
}
/** A new character's first look: the default parts, or with `random` (live's first dressing: the engine makes a random
 * look) one of each category's free parts at random; always Slifer Red (the server's default outfit, which main's
 * avatar-uniform.js puts on live's random look). */
export function starterLook(female = false, random?: () => number): number[] {
  const look = Array<number>(16).fill(0);
  for (const { index } of CATEGORIES) { const cs = freeChoices(index, female); look[index] = cs[random ? Math.min(cs.length - 1, Math.floor(random() * cs.length)) : 0]?.value ?? 0; }
  look[0] = female ? 1 : 0; look[6] = 0x80;
  return look;
}
/** Switching body keeps each choice where the other body has it, else its first. */
export function changeBody(look: number[], female: boolean): number[] {
  const next = [...look]; next[0] = female ? 1 : 0;
  for (const { index } of CATEGORIES) { if (index === 0) continue; const cs = freeChoices(index, female); if (!cs.some(c => c.value === next[index])) next[index] = cs[0]?.value ?? 0; }
  return next;
}

/** Change Avatar's Confirm from the game: one call to the server's appearance route (server/src/game/cosmetics.ts
 * cosmeticAppearance) with the whole look, and the body too when it changed: the server switches the body and puts
 * these parts on in the same step. Before, a body change sent the body alone, and the other picks were lost (the
 * server re-dressed the new body with its own stand-ins). */
export function changeAvatarAction(look: number[], current?: { gender: 'male' | 'female'; world: number } | null): { type: 'appearance'; world: number; parts: number[]; gender?: 'male' | 'female' } {
  const gender = look[0] === 1 ? 'female' : 'male', world = current?.world ? 1 : 0;
  return { type: 'appearance', world, parts: [...look], ...(current && current.gender !== gender ? { gender } : {}) };
}

const PER_PAGE = 14;
// a plate's four sprites (CWindowTaskPictureSwitch: normal, hover, pressed, checked), each a column of its atlas: the
// layer's applyPointer shows the one for the pointer (hover on pointerover, pressed on pointerdown / Enter / Space).
// Categories and items: normal 0, hover 1, chosen 2 (pressed shows chosen); Confirm / Back: normal 0, hover 1, pressed 2
const art = (tex: string, w: number, h: number, checked = false) => {
  const look = (col: number, shown: boolean) => ({ tex: `data/menu/${tex}.png`, src: [col * w, 0, w, h], shown });
  return { normal: look(0, !checked), hover: look(1, false), pressed: look(2, false), checked: look(2, checked) };
};
// the page arrows' sprites (shop_arrow_04..06 next, 10..12 previous: normal, hover, pressed)
const arrowArt = (first: number) => {
  const look = (k: number, shown: boolean) => ({ tex: `data/shop/shop_arrow_${String(k).padStart(2, '0')}_c01.png`, src: [0, 0, 32, 64], shown });
  return { normal: look(first, true), hover: look(first + 1, false), pressed: look(first + 2, false) };
};

export interface AvatarDeps {
  /** The choices of a category for this look (Change Avatar: the server's owned parts; first dressing: the free ones). */
  choices(index: number, look: number[]): AvatarChoice[];
  confirm(look: number[]): void;
  /** Back (Change Avatar only; first dressing has none, as the original hides it). */
  back?: () => void;
  busy?: boolean;
}
// live's places (its snapshot of CWindowDialogAvatarSwitch): the plates 350, 63 + 45 n (324 x 44), their labels 8 in
// and 6 down (32 px); the items 722, 89 + 40 n (254 x 34), their labels 8 in and 5 down (24 px, 238 wide); Confirm
// 684, 683 and Back 852, 683 (162 x 42), their labels 9 down in the plate's first 146 px
export function avatarSwitch(ctx: Pick<BuildContext, 'ids' | 'rerender'>, dialog: AvatarDialog, deps: AvatarDeps): WindowSpec {
  const b = new WindowBuilder(ctx.ids, 'avatar', 'CWindowDialogAvatarSwitch', { x: 0, y: 0, w: 336, h: 550 }, { modal: true, z: 51203 });
  const text = (name: string, t: string, x: number, y: number, w: number, px: number) => b.add('CWindowTaskText', name, { x, y, w, h: px }, { text: t, align: 1, fontSize: px, color: [0, 0, 0, 1] });
  const look = dialog.look;
  CATEGORIES.forEach((cat, i) => {
    const x = 350, y = 63 + i * 45, chosen = dialog.category === cat.index;
    b.add('CWindowTaskPictureSwitch', `cat${cat.index}`, { x, y, w: 324, h: 44 }, { state: 'normal', checked: chosen, art: art(`abmake_btn_01_c0${cat.plate}`, 324, 44, chosen) },
      { key: `avatar-category:${cat.index}`, label: cat.label, click: () => { dialog.category = cat.index; dialog.page = 0; ctx.rerender(); } });
    text(`cat${cat.index}-label`, cat.label, x + 8, y + 6, 308, 32);
  });
  const cat = CATEGORIES.find(c => c.index === dialog.category);
  if (cat) {
    const choices = deps.choices(cat.index, look), pages = Math.max(1, Math.ceil(choices.length / PER_PAGE));
    dialog.page = Math.min(dialog.page, pages - 1);
    choices.slice(dialog.page * PER_PAGE, dialog.page * PER_PAGE + PER_PAGE).forEach((choice, i) => {
      const x = 722, y = 89 + i * 40, on = look[cat.index] === choice.value;
      b.add('CWindowTaskPictureSwitch', `item${i}`, { x, y, w: 254, h: 34 }, { state: 'normal', checked: on, art: art('abmake_btn_02_01', 254, 34, on) },
        { key: `avatar-item:${cat.index}:${choice.value}`, label: choice.label, click: () => {
          dialog.look = cat.index === 0 ? changeBody(look, choice.value === 1) : Object.assign([...look], { [cat.index]: choice.value }); ctx.rerender(); } });
      text(`item${i}-label`, choice.label, x + 8, y + 5, 238, 24);
    });
    if (pages > 1) {
      b.add('CWindowTaskPictureSwitch', 'prev', { x: 724, y: 600, w: 32, h: 64 }, { state: dialog.page > 0 ? 'normal' : 'disabled', art: arrowArt(10) },
        { key: 'avatar-page-prev', label: 'Previous page', click: () => { if (dialog.page > 0) { dialog.page--; ctx.rerender(); } } });
      b.add('CWindowTaskPictureSwitch', 'next', { x: 942, y: 600, w: 32, h: 64 }, { state: dialog.page < pages - 1 ? 'normal' : 'disabled', art: arrowArt(4) },
        { key: 'avatar-page-next', label: 'Next page', click: () => { if (dialog.page < pages - 1) { dialog.page++; ctx.rerender(); } } });
    }
  }
  const plate = (name: string, label: string, x: number, key: string, click: () => void) => {
    b.add('CWindowTaskPictureSwitch', name, { x, y: 683, w: 162, h: 42 }, { state: deps.busy ? 'disabled' : 'normal', art: art('abmake_btn_03_01', 162, 42) }, { key, label, click: () => { if (!deps.busy) click(); } });
    text(`${name}-label`, label, x, 692, 146, 24);
  };
  plate('confirm', 'Confirm', 684, 'avatar-confirm', () => deps.confirm([...dialog.look]));
  if (deps.back) plate('back', 'Back', 852, 'avatar-back', deps.back);
  return b.spec();
}
