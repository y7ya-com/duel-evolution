import { describe, expect, it } from 'vitest';
import { TouchTaps, TAP_CLICK_WINDOW_MS, type TapPointer } from '../src/ui/htmlui/touch-tap';

// a tiny element stand-in: what TouchTaps reads of an Element (tagName, parentElement, isConnected)
class El { tagName: string; parentElement: El | null; isConnected = true; isContentEditable = false; constructor(tag: string, parent: El | null = null) { this.tagName = tag; this.parentElement = parent; } }
Object.setPrototypeOf(El.prototype, (globalThis as { Element?: { prototype: object } }).Element?.prototype ?? Object.prototype);
(globalThis as { Element?: unknown }).Element ??= El;

function setup() {
  const host = new El('DIV'); let under: El | null = new El('BUTTON', host); let t = 0;
  const clicks: El[] = [];
  const taps = new TouchTaps({ at: () => under as unknown as Element, inside: el => { for (let e: El | null = el as unknown as El; e; e = e.parentElement) if (e === host) return true; return false; },
    click: el => { clicks.push(el as unknown as El); expect(taps.pass({ clientX: 0, clientY: 0 })).toBe(true); }, now: () => t });
  const ev = (o: Partial<TapPointer> & { target?: El | null } = {}): TapPointer => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, ...o, target: (o.target ?? under) as unknown as EventTarget });
  return { host, taps, clicks, ev, set: (e: El | null) => { under = e; }, get under() { return under; }, tick: (ms: number) => { t += ms; } };
}

describe('a touch tap clicks the control under the finger exactly once', () => {
  it('a tap with no move clicks once, and the browser\'s own click for it is dropped', () => {
    const s = setup(), first = s.under!;
    s.taps.pointerDown(s.ev());
    // the pressed look replaced the button the finger went down on
    const redrawn = new El('BUTTON', s.host); first.isConnected = false; s.set(redrawn);
    expect(s.taps.pointerUp(s.ev({ target: first }))).toBe(true);
    expect(s.clicks).toEqual([redrawn]);
    expect(s.taps.pass({ clientX: 100, clientY: 100 })).toBe(false);   // the browser's click: dropped
    expect(s.taps.pass({ clientX: 100, clientY: 100 })).toBe(true);    // the next click is a new one
  });
  it('the release hit-tests nothing in the host: the element it went down on, if still shown, takes the click', () => {
    const s = setup(), btn = s.under!;
    s.taps.pointerDown(s.ev()); s.set(null);
    expect(s.taps.pointerUp(s.ev({ target: btn }))).toBe(true);
    expect(s.clicks).toEqual([btn]);
    btn.isConnected = false; s.taps.pointerDown(s.ev({ target: btn }));
    expect(s.taps.pointerUp(s.ev({ target: btn }))).toBe(false);
    expect(s.clicks.length).toBe(1);
  });
  it('a moved finger (a drag or a scroll), a cancel, a mouse or a text field is not a tap', () => {
    const s = setup();
    s.taps.pointerDown(s.ev()); s.taps.pointerMove(s.ev({ clientX: 130 }));
    expect(s.taps.pointerUp(s.ev())).toBe(false);
    s.taps.pointerDown(s.ev()); s.taps.pointerCancel(s.ev());
    expect(s.taps.pointerUp(s.ev())).toBe(false);
    s.taps.pointerDown(s.ev({ pointerType: 'mouse' }));
    expect(s.taps.pointerUp(s.ev({ pointerType: 'mouse' }))).toBe(false);
    const input = new El('INPUT', s.host); s.set(input);
    s.taps.pointerDown(s.ev()); expect(s.taps.pointerUp(s.ev())).toBe(false);
    s.set(new El('BUTTON', new El('DIV')));   // outside the host
    s.taps.pointerDown(s.ev({ target: s.under })); expect(s.taps.pointerUp(s.ev())).toBe(false);
    expect(s.clicks).toEqual([]);
  });
  it('a late or distant browser click is not swallowed, and a mouse press ends the wait', () => {
    const s = setup();
    s.taps.pointerDown(s.ev()); s.taps.pointerUp(s.ev());
    expect(s.taps.pass({ clientX: 400, clientY: 400 })).toBe(true);
    s.tick(TAP_CLICK_WINDOW_MS + 1);
    expect(s.taps.pass({ clientX: 100, clientY: 100 })).toBe(true);
    s.taps.pointerDown(s.ev()); s.taps.pointerUp(s.ev());
    s.taps.pointerDown(s.ev({ pointerType: 'mouse' }));
    expect(s.taps.pass({ clientX: 100, clientY: 100 })).toBe(true);
    expect(s.clicks.length).toBe(2);
  });
  it('two fingers: only the tap\'s own pointer ends it', () => {
    const s = setup();
    s.taps.pointerDown(s.ev({ pointerId: 7 }));
    expect(s.taps.pointerUp(s.ev({ pointerId: 8 }))).toBe(false);
    expect(s.taps.pointerUp(s.ev({ pointerId: 7 }))).toBe(true);
    expect(s.clicks.length).toBe(1);
  });
});
