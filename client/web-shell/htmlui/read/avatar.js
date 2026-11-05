// CWindowDialogAvatarSwitch layout: src/ChangeAvatar/yo2ChangeAvatar.h. Read only;
// the screen applies the beginner uniform through the engine's normal item buttons.
export default ({ u8, i32, ptr, shown }) => ({ windows: {
  CWindowDialogAvatarSwitch: w => ({
    avatarCreation: !shown(ptr(w + 0x688 + 12)), // Back is hidden only during first dressing
    avatarSex: u8(w + 0x738), avatarClothes: u8(w + 0x738 + 6),
    avatarCategory: i32(w + 0x6e8),
    avatarClothingButton: ptr(w + 0x400 + 9 * 12),
    avatarItems: Array.from({ length: 14 }, (_, i) => ({ id: ptr(w + 0x538 + i * 12), value: i32(w + 0x6f0 + i * 4) })),
  }),
} });
