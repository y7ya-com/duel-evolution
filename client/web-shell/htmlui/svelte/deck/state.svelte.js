// The deck editor's shared state: every live deck window's plan (a hole in one, a dragged card, cuts every window and
// the scene backdrop), the co-drawn ids the bridge passes through, the atlases as they load. Replaces deck.js's live
// map / reclip / per-window keys: a component reads from here and re-renders when its part changes, nothing else.
import { SvelteMap } from 'svelte/reactivity';
import * as ui from '../../../ui.js';
import { artName } from '../../screens/deck.js';
import { plan } from './art.js';

class Deck {
  wins = new SvelteMap();   // window id -> { win, plan, key }
  holes = $derived([...this.wins.values()].flatMap(L => L.plan.holes));
  co = $derived(new Set([...this.wins.values()].flatMap(L => L.plan.co)));
  api = null;               // the bridge's api (a list's native scroll bar sets the game's value through it)
  sheets = new SvelteMap(); // atlas name -> { url, w, h, alpha }, once loaded
  #asked = new Set();       // not state: a template asking for an atlas must not write state

  // a window's new snapshot: replanned unless only the scene's mouse changed (the side buttons' hover, the backdrop's);
  // an item equal to last frame's keeps its object, so only changed items re-render
  set(win, editor) {
    const key = JSON.stringify(win, (k, v) => k === 'mouse' ? undefined : v), old = this.wins.get(win.id);
    if (old?.key === key) return;
    const p = plan(win, editor), prev = new Map((old?.plan.items || []).map(it => [it.id, it]));
    p.items = p.items.map(it => {
      const o = prev.get(it.id), sig = JSON.stringify(it);
      return o?.sig === sig ? o : Object.assign(it, { sig });
    });
    this.wins.set(win.id, { win, plan: p, key });
  }
  drop(id) { this.wins.delete(id); }

  // an atlas by game path, loaded once: null until it is (the reader re-renders then). '?' is the language letter:
  // 'e', else 'j' (deck_cardcount_01 only exists as _j). ui.sprite needs its alpha up front (opaque cells: one image)
  sheet(tex) {
    const name = artName(tex);
    const s = this.sheets.get(name);
    if (s || this.#asked.has(name)) return s ?? null;
    this.#asked.add(name);
    const base = ui.SHEET.window.url.replace(/[^/]*$/, ''), j = tex.includes('?') ? name.replace(/_e\.png$/, '_j.png') : null;
    const img = n => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok([i, n]); i.onerror = no; i.src = base + 'clamp/' + n; });
    img(name).catch(e => { if (!j) throw e; return img(j); }).then(([m, n]) => {
      const c = new OffscreenCanvas(m.width, m.height).getContext('2d', { willReadFrequently: true });
      c.drawImage(m, 0, 0);
      const d = c.getImageData(0, 0, m.width, m.height).data, alpha = new Uint8Array(d.length / 4);
      for (let i = 0; i < alpha.length; i++) alpha[i] = d[4 * i + 3];
      this.sheets.set(name, { url: base + n, w: m.width - 1, h: m.height - 1, ready: true, alpha });
    }, () => console.warn('htmlui deck: no art for', tex));
    return null;
  }
}
export const deck = new Deck();
