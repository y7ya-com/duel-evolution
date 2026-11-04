// Native input points in 1024×768 game pixels. Shop tasks are not CElement parents;
// their controls can sit under separate base elements. Only the drawn world position
// is reliable; wait for the first draw rather than clicking another shop control.
export function controlPoint(snapshot, id) {
  for (const owner of snapshot?.windows || []) for (const control of owner.controls || []) {
    if (control.id === id) return [owner.x + control.x + control.w / 2, owner.y + control.y + control.h / 2];
  }
  for (const owner of snapshot?.tasks || []) for (const control of owner.controls || []) {
    if (control.id !== id) continue;
    const drawn = control.wz > 0 && Number.isFinite(control.wx) && Number.isFinite(control.wy);
    return drawn ? [control.wx + control.w / 2, control.wy + control.h / 2] : null;
  }
  return null;
}
