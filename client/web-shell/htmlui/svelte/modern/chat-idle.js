// Recent lobby speech stays readable over the world, then fades without retaining a mouse hit area.
export const CHAT_PREVIEW_LIFETIME = 12000;
export function chatPreview(rows, now, enteredAt, limit = 4) {
  return rows.slice(-limit).flatMap(row => {
    const time = Number.isFinite(row.t) ? row.t : enteredAt;
    const age = Math.max(0, now - time);
    if (age >= CHAT_PREVIEW_LIFETIME) return [];
    return [{ ...row, opacity: Math.min(1, (CHAT_PREVIEW_LIFETIME - age) / 4000) }];
  });
}
