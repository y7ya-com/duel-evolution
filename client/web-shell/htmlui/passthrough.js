// Task-owned raw parts (the shop's picture banners) need the same native-art
// exemptions as control-owned parts. Deduplicate before writing the finite pass table.
export function passthroughIds(owner, predicate) {
  const ids = [];
  const parts = (p, control) => {
    for (const part of [...p?.sprites || [], ...p?.labels || [], ...p?.swfs || []]) {
      if (predicate(part, control)) ids.push(part.id);
    }
  };
  for (const control of [...owner.controls || [], ...owner.extras || []]) {
    if (predicate(control)) ids.push(control.id);
    parts(control.parts, control);
  }
  parts(owner.parts);
  return [...new Set(ids)];
}
