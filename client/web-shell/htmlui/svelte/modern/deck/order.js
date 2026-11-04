// Presentation order is independent of the engine's canonical card order. Reconcile counts
// after engine updates, retaining every existing copy and appending only new copies.
export function reconcileOrder(previous, current) {
  const remaining = new Map();
  for (const id of current) remaining.set(id, (remaining.get(id) || 0) + 1);
  const out = [];
  for (const id of previous) if (remaining.get(id)) { out.push(id); remaining.set(id, remaining.get(id) - 1); }
  for (const id of current) if (remaining.get(id)) { out.push(id); remaining.set(id, remaining.get(id) - 1); }
  return out;
}
export function insertCopy(order, from, target) {
  const out = [...order];
  if (from < 0 || from >= out.length || target < 0 || target > out.length) return out;
  const [card] = out.splice(from, 1);
  out.splice(target > from ? target - 1 : target, 0, card);
  return out;
}
export function sortOrder(order, mode, card) {
  if (mode === 'manual') return [...order];
  return [...order].sort((a, b) => {
    const x = card(a), y = card(b);
    if (!x || !y) return 0;
    return (mode === 'atk' ? y.atk - x.atk : mode === 'level' ? y.level - x.level : 0) || x.name.localeCompare(y.name);
  });
}
