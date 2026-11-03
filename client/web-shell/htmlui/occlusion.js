// Shop task surfaces sit below regular factory windows, including HTML modal dialogs.
export function surfaceOrder(snapshot, orderWindows) {
  const windows = orderWindows(snapshot.windows || []), tasks = snapshot.tasks || [];
  return snapshot.scene === 14 ? [...tasks, ...windows] : [...windows, ...tasks];
}

export function foregroundRects(surface, windows, owned, box, ahead) {
  const i = windows.indexOf(surface), shop = /^CShop/.test(surface.cls || '');
  return windows.filter((other, j) => other !== surface && other.shown && !owned.has(other.id) && (shop || ahead(other, j, surface, i)))
    .map(other => other.drawn === undefined ? other : other.drawn).filter(rect => rect &&
      rect.x < box.x + box.w && rect.x + rect.w > box.x && rect.y < box.y + box.h && rect.y + rect.h > box.y);
}

// A clip-path for box (its own coordinates from box.x, box.y) with holes where rects lie (game px). Overlapping rects
// are merged first (into their bounding box, until none overlap): under evenodd two overlapping holes cancel.
export function clip(rects, box, origin = box) {
  const rs = rects.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < rs.length && !merged; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j])) {
      const a = rs[i], b = rs.splice(j, 1)[0], x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      rs[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
      merged = true;
      break;
    }
  }
  const inside = rs.filter(o => hit(o, box));
  if (!inside.length) return '';
  const r = o => `M${o.x - origin.x} ${o.y - origin.y}h${o.w}v${o.h}h${-o.w}z`;
  return `path(evenodd, "M${box.x - origin.x} ${box.y - origin.y}h${box.w}v${box.h}h${-box.w}z${inside.map(r).join('')}")`;
}
