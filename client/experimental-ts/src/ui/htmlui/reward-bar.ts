// The bar under the NPC reward scenes as live shows it (livetour2 54-reward-pack, 55-card-get): not the lobby's menu
// bar but the duel's bar without its wrench: the strip (a horizontal gradient, cyan at the left, brightest round the
// ring's spot at 212..285, deep blue at the right; light top rows, a darker foot), the ring's spot left open over the
// pack scene and holding the sword ring over the card get, and the help field (391..1017 x 743..761, white rim, a
// little see-through) with the scene's line (the pack's description). Live draws the card get's under its dim veil:
// `dim` (the card get, as live), not the pack pick (live's dimming of the pack scene is a bug the rewrite does not copy).
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

/** live's duel bar strip, sampled across its width (49-duel-hand: x 5, 100, 200, 230, 300, 380, 700, 1016). */
export const BAR_STRIP = 'linear-gradient(to bottom, rgba(255,255,255,.6) 0 3px, transparent 3px calc(100% - 5px), rgba(0,40,90,.3) calc(100% - 5px)), '
  + 'linear-gradient(to right, #63e2ff 0, #a8efff 9.8%, #c9feff 19.5%, #c1feff 22.5%, #98ecff 29.3%, #6cc4fe 37.1%, #237bfd 68.4%, #0056fb 99.2%)';

export function rewardBar(ids: Ids, o: { message: string; ring: boolean; dim: boolean; load?: ((path: string, image: HTMLImageElement) => void) | null }): WindowSpec {
  // (what it shows is in the window, so the layer redraws it when that changes)
  const b = new WindowBuilder(ids, 'reward-bar', 'CRewardBar', { x: 0, y: 736, w: 1024, h: 32 }, { z: 51320, modal: false, message: o.message, ring: o.ring, dim: o.dim });
  const spec = b.spec();
  spec.after = root => {
    let bar = root.querySelector<HTMLElement>('.de-reward-bar');
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'de-reward-bar'; bar.setAttribute('role', 'status');
      Object.assign(bar.style, { position: 'absolute', left: '0', top: '0', width: '1024px', height: '32px', pointerEvents: 'none' });
      const piece = (x: number, w: number) => { const p = document.createElement('div'); Object.assign(p.style, { position: 'absolute', left: x + 'px', top: '0', width: w + 'px', height: '32px', background: BAR_STRIP, backgroundSize: '1024px 32px', backgroundPosition: `${-x}px 0` }); return p; };
      const ring = document.createElement('div'); ring.className = 'de-reward-ring';
      Object.assign(ring.style, { position: 'absolute', left: '212px', top: '0', width: '73px', height: '32px', background: BAR_STRIP, backgroundSize: '1024px 32px', backgroundPosition: '-212px 0' });
      const sword = document.createElement('img'); sword.alt = ''; sword.draggable = false;
      Object.assign(sword.style, { position: 'absolute', left: '20px', top: '0', width: '32px', height: '32px' });
      const glow = document.createElement('img'); glow.alt = ''; glow.draggable = false;
      Object.assign(glow.style, { position: 'absolute', left: '12px', top: '-8px', width: '48px', height: '48px', opacity: '.8' });
      ring.append(glow, sword);
      const field = document.createElement('div'); field.className = 'de-reward-field';
      Object.assign(field.style, { position: 'absolute', left: '391px', top: '7px', width: '626px', height: '18px', boxSizing: 'border-box', border: '1px solid #fff', background: 'rgba(255,255,255,.88)',
        font: '14px/16px Arial, sans-serif', letterSpacing: '.04em', color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: '4px' });
      bar.append(piece(0, 212), ring, piece(285, 739), field); root.append(bar);
    }
    const ring = bar.querySelector<HTMLElement>('.de-reward-ring')!, [glow, sword] = Array.from(ring.querySelectorAll('img'));
    ring.style.display = o.ring ? '' : 'none';
    if (o.ring && sword && glow && !sword.dataset.asked) { sword.dataset.asked = '1'; o.load?.('data/common/window/icon/menuicon_03_04.png', sword); o.load?.('data/common/window/icon/menuicon_03_00.png', glow); }
    const field = bar.querySelector<HTMLElement>('.de-reward-field')!; if (field.textContent !== o.message) field.textContent = o.message;
    bar.setAttribute('aria-label', o.message);
    bar.style.filter = o.dim ? 'brightness(.5)' : '';
  };
  return spec;
}
