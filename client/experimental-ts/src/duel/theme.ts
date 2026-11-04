import { fieldAudioSlot } from './audio';

/** Static reconstruction of original view7 callee 0x00704100 (via 0x004064dd).
 * Its input is the original internal card ID, never a property row/legacy deck ID.
 * Unknown internal IDs return zero in the original, not the common field theme. */
export function fieldThemeKind(internalId: number): number {
  if (!Number.isInteger(internalId) || internalId < 0 || internalId > 0xffff) throw new Error('Invalid internal field identity');
  if (internalId >= 0x10f0 && internalId <= 0x10f5) return internalId - 0x10f0 + 1;
  if (internalId >= 0x1344 && internalId <= 0x1349) return internalId - 0x1344 + 8;
  return OTHER_FIELDS.get(internalId) ?? 0;
}
const OTHER_FIELDS = new Map<number, number>([
  [0x1323, 7], [0x149c, 14], [0x14d1, 15], [0x150b, 16], [0x159d, 17], [0x169f, 18],
  [0x175e, 19], [0x183f, 20], [0x187f, 21], [0x18ff, 22], [0x19f2, 23], [0x1a0c, 24],
  [0x1a77, 25], [0x1a67, 26], [0x1a66, 27], [0x1aa7, 28], [0x1b5b, 29], [0x1b5c, 30],
  [0x1ba7, 31], [0x1bd9, 32], [0x1bfc, 33], [0x1c8b, 34], [0x1d21, 35], [0x1dcb, 36],
  [0x1dc8, 37], [0x1dca, 38],
]);

/** FIELD_CHANGE v2 has a passcode; metadata converts it to the original internal ID.
 * Absent metadata stays null so callers can retain current music instead of guessing.
 * Explicit passcode zero removes the field without requiring a metadata lookup. */
export function fieldThemeKindForPasscode(passcode: number, internalForPasscode: (passcode: number) => number | undefined): number | null {
  if (!Number.isSafeInteger(passcode) || passcode < 0 || passcode > 0xffffffff) throw new Error('Invalid field passcode');
  if (passcode === 0) return 0;
  const id = internalForPasscode(passcode);
  return id === undefined ? null : fieldThemeKind(id);
}
export function fieldAudioSlotForPasscode(passcode: number, baseSlot: number, internalForPasscode: (passcode: number) => number | undefined): number | null {
  const kind = fieldThemeKindForPasscode(passcode, internalForPasscode);
  return kind === null ? null : fieldAudioSlot(kind, baseSlot);
}
