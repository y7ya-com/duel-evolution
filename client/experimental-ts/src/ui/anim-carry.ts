// The stage is drawn anew on every state change (index.ts render: replaceChildren, then each scene's elements), so a
// looping CSS animation on a rebuilt element started again from its first frame each time: the janken scene's drifting
// hexagons and its thinking dots, the duel bar's scrolling help line, a target zone's pulse and a counter's hourglass
// restarted on every server message or clock tick, so they jumped back, stuttered or seemed frozen (live's engine draws
// them on and on). Before a render takes the old elements down, carry() notes where each running loop is; after the
// render, resume() puts the same loop on the new element (the same place in the tree, the same animation, the same
// text) back where it was. A loop on a new element, or on one whose text changed (a new help line), starts afresh, and
// one-shot animations (a counter's pop, a fade) are left alone: they start with their element, as before.

/** An element's place under the root: each step its tag, key (data-key) or classes, and its index among its siblings
 * of the same kind, plus its text (a new line of text is a new loop). */
function identity(el: Element, root: Element): string {
  const steps: string[] = [];
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
    const kind = `${e.tagName}${(e as HTMLElement).dataset?.key ? `#${(e as HTMLElement).dataset.key}` : `.${typeof e.className === 'string' ? e.className.trim().replace(/\s+/g, '.') : ''}`}`;
    let n = 0; for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName && s.className === e.className) n++;
    steps.push(`${kind}:${n}`);
  }
  return `${steps.reverse().join('/')}|${(el.textContent ?? '').slice(0, 120)}`;
}

const looping = (a: Animation): a is CSSAnimation =>
  typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && a.effect?.getTiming().iterations === Infinity;

export class AnimationCarry {
  private saved = new Map<string, number>();
  /** Notes each running loop under `root` (call it before the root's children are replaced). */
  carry(root: Element): void {
    this.saved.clear();
    if (typeof root.getAnimations !== 'function') return;
    const now = document.timeline?.currentTime;
    for (const a of root.getAnimations({ subtree: true })) {
      if (!looping(a) || a.playState !== 'running') continue;
      const el = (a.effect as KeyframeEffect | null)?.target; if (!el) continue;
      const start = a.startTime ?? now; if (typeof start !== 'number') continue;
      this.saved.set(`${identity(el, root)}|${a.animationName}`, start);
    }
  }
  /** Puts each carried loop back on its rebuilt element (call it once the new children are in the page). */
  resume(root: Element): void {
    if (!this.saved.size || typeof root.getAnimations !== 'function') return;
    for (const a of root.getAnimations({ subtree: true })) {
      if (!looping(a)) continue;
      const el = (a.effect as KeyframeEffect | null)?.target; if (!el) continue;
      const start = this.saved.get(`${identity(el, root)}|${a.animationName}`);
      if (start !== undefined && a.startTime !== start) a.startTime = start;
    }
    this.saved.clear();
  }
}
