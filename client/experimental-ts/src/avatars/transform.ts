import type { FootTransform } from '../world/collision';
import type { Point } from '../world/maps';

export const IDENTITY_FOOT_TRANSFORM: Readonly<FootTransform> = Object.freeze({ m00: 1, m01: 0, m10: 0, m11: 1, m30: 0, m31: 0 });
function valid(m: FootTransform): void { if (!['m00', 'm01', 'm10', 'm11', 'm30', 'm31'].every(key => Number.isFinite(m[key as keyof FootTransform]))) throw new RangeError('Invalid avatar world transform'); }
/** D3DX row-vector XY multiplication: local * parentWorld, as CElement::updateMatrix. */
export function multiplyFootTransforms(a: FootTransform, b: FootTransform): FootTransform {
  valid(a); valid(b); const f = Math.fround;
  return { m00: f(a.m00 * b.m00 + a.m01 * b.m10), m01: f(a.m00 * b.m01 + a.m01 * b.m11),
    m10: f(a.m10 * b.m00 + a.m11 * b.m10), m11: f(a.m10 * b.m01 + a.m11 * b.m11),
    m30: f(a.m30 * b.m00 + a.m31 * b.m10 + b.m30), m31: f(a.m30 * b.m01 + a.m31 * b.m11 + b.m31) };
}
export interface PlayerFootTransformOptions {
  /** Actual parent world XY matrix; omitted means the browser's field-local coordinate frame. */
  parentWorld?: FootTransform;
  /** An actual nondefault avatar local matrix may be supplied instead of translation(position). */
  avatarLocal?: FootTransform;
}
/** Source hierarchy: root T(-46,-116) * engine mirrorX * avatarLocal * parentWorld.
 * CChibiAvatarElm createEngine/switchEngine; root inherit flag verified at PE0x670d5d.
 * Default foot center is position.x-6 (normal), position.x+6 (mirrored), position.y.
 * It is deliberately NOT recentered on the network avatar point as the UI preview is. */
export function playerFootTransform(position: Point, direction: number, options: PlayerFootTransformOptions = {}): FootTransform {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isInteger(direction) || direction < 0 || direction > 7) throw new RangeError('Invalid player foot pose');
  const root = { ...IDENTITY_FOOT_TRANSFORM, m30: -46, m31: -116 };
  const engine = { ...IDENTITY_FOOT_TRANSFORM, m00: direction >= 5 ? -1 : 1 };
  const avatar = options.avatarLocal ?? { ...IDENTITY_FOOT_TRANSFORM, m30: Math.fround(position.x), m31: Math.fround(position.y) };
  return multiplyFootTransforms(multiplyFootTransforms(multiplyFootTransforms(root, engine), avatar), options.parentWorld ?? IDENTITY_FOOT_TRANSFORM);
}
