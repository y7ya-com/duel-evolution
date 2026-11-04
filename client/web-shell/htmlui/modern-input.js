// Modern HUDs own their DOM controls. Their invisible native controls must not
// intercept canvas input (notably chat / card details over the hand).
export function nativeHudInput() {
  const saved = new Map(), allowed = new Map();
  let heap;
  function restore() {
    if (!heap) return;
    const words = new Uint32Array(heap.buffer);
    for (const [id, { vt, enabled }] of saved) if (words[id >>> 2] === vt) heap[id + 0x350] = enabled;
    saved.clear();
  }
  return {
    restore,
    allow(id) {
      allowed.set(id, (allowed.get(id) || 0) + 1);
      const prior = saved.get(id); if (prior && heap) heap[id + 0x350] = prior.enabled;
      let released = false;
      return () => {
        if (released) return; released = true;
        const count = allowed.get(id) || 0;
        if (count <= 1) allowed.delete(id); else allowed.set(id, count - 1);
      };
    },
    block(snap, bytes, modern) {
      restore(); heap = bytes;
      if (!modern) return;
      const words = new Uint32Array(heap.buffer);
      for (const w of snap.windows) {
        const roster = snap.scene > 7 && (w.cls === 'CPlayerListDlg' || (w.cls === 'CWindowModelInformation' && w.controls.some(c => c.name === '検索ボタン') && w.controls.some(c => /ActiveListbox$/.test(c.cls))));
        const chat = w.cls === 'CChatWindow';
        if (!w.shown || !(roster || chat || (snap.scene === 28 && w.cls === 'CCardDetailViewDlg'))) continue;
        for (const c of w.controls) if (!allowed.has(c.id) && c.enabled !== false && c.id + 0x351 < heap.length) {
          saved.set(c.id, { vt: words[c.id >>> 2], enabled: heap[c.id + 0x350] });
          heap[c.id + 0x350] = 0;
        }
      }
    },
  };
}

// CWindowTaskFactory::dispatch checks target->enabled_ even for WM_CHAR.
// Hold the target through queue flushing AND the next native Present that plays it.
export async function dispatchEnabledInput(router, id, enqueue, nextFrame) {
  const release = id ? router.allow(id) : () => {};
  try { await enqueue(); await nextFrame(); }
  finally { release(); }
}
