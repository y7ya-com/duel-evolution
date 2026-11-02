// The start screens' backdrop (the title, Change Avatar, the patcher: CBgCommon with data/menu/abmake_bg_01 / _02), drawn by
// the page behind the canvas in both UIs, sharp at any DPR (owner: "basically the same but better so let's include this
// improvement in the legacy ui as well. make sure any instances of the old less sharp one is gone"). The same composition,
// colours and motion as the game's, measured from it (CBgCommon's m_elmBack sprites at 2x, texel by texel):
// - base (abmake_bg_01, still): the azure across (17 stops sampled off its grid lines), a little lighter high up and
//   darker low (+-3.5 %), a grid of lines 11 % lighter on a 12.8 x 16 px pitch;
// - veil (abmake_bg_02, two copies 768 apart): a checker of rgb(111,117,238) squares on those cells, 1 px apart,
//   192 / 255 at the left and right edges fading to none 236 px in, scrolling DOWN 60 px a second, seamless.
// While read.js finds those sprites shown (snapshot.backdrop), Module.yo2TransparentTitle tells the runtime to leave the
// canvas clear where they were (yo2-native-gfx: it skips the abmake_bg textures, everything else still the engine's), and
// the canvas is lifted above this layer; otherwise nothing changes. A runtime without the flag keeps drawing its own.
export function backdrop(canvas) {
  const el = document.createElement('div');
  el.id = 'mu-titlebg';
  el.hidden = true;
  el.ariaHidden = 'true';
  el.innerHTML = '<div class="mu-stage"><i class="mu-base"></i><i class="mu-veil"></i></div>';
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  if (canvas?.parentElement) canvas.parentElement.insertBefore(el, canvas);
  const stage = el.firstElementChild;
  let lifted = false;
  return {
    // each frame: shown while the engine's backdrop sprites are (not through a scene load)
    frame(snap, wait) {
      const show = !wait && !!snap?.backdrop?.shown;
      if (globalThis.Module) Module.yo2TransparentTitle = show;
      if (el.hidden === show) el.hidden = !show;
      if (show !== lifted) {
        lifted = show;
        Object.assign(canvas.style, show ? { position: 'relative', zIndex: '1' } : { position: '', zIndex: '' });
      }
      if (!show) return;
      const r = canvas.getBoundingClientRect(), k = r.width / 1024;
      const css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      if (el.style.cssText !== css) { el.style.cssText = css; stage.style.transform = `scale(${k})`; }
    },
  };
}

const CSS = `
#mu-titlebg { position: fixed; z-index: 0; overflow: hidden; pointer-events: none; }
#mu-titlebg[hidden] { display: none; }
#mu-titlebg .mu-stage { position: absolute; left: 0; top: 0; width: 1024px; height: 768px; overflow: hidden; transform-origin: 0 0; }
#mu-titlebg .mu-base { position: absolute; inset: 0;
  background:
    repeating-linear-gradient(90deg, transparent 0 10px, rgba(255, 255, 255, .11) 10px 12px, transparent 12px 12.8px),
    repeating-linear-gradient(180deg, transparent 0 14px, rgba(255, 255, 255, .11) 14px 16px),
    linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, .05) 10%, rgba(255, 255, 255, .02) 35%,
      rgba(0, 25, 80, .025) 70%, rgba(0, 25, 80, .03) 78%, rgba(255, 255, 255, 0) 100%),
    linear-gradient(90deg, rgb(59, 164, 245) 0%, rgb(57, 164, 245) 6.25%, rgb(56, 163, 245) 12.5%, rgb(67, 168, 246) 18.75%,
      rgb(93, 179, 247) 25%, rgb(123, 193, 248) 31.25%, rgb(152, 207, 250) 37.5%, rgb(179, 220, 251) 43.75%,
      rgb(201, 230, 252) 50%, rgb(197, 228, 252) 56.25%, rgb(173, 216, 251) 62.5%, rgb(140, 201, 249) 68.75%,
      rgb(108, 186, 248) 75%, rgb(81, 173, 246) 81.25%, rgb(60, 162, 245) 87.5%, rgb(55, 159, 245) 93.75%, rgb(57, 159, 245) 100%); }
/* the veil: one pattern period (32 px) taller than the screen, translated down a period and back to 0, seamless */
#mu-titlebg .mu-veil { position: absolute; left: 0; top: -32px; width: 1024px; height: 800px; will-change: transform;
  background: repeating-conic-gradient(from -90deg, rgb(111, 117, 238) 0 25%, transparent 0 50%) 0 0 / 25.6px 32px;
  -webkit-mask-image: linear-gradient(90deg, rgba(0, 0, 0, .753) 0, transparent 236px, transparent calc(100% - 236px), rgba(0, 0, 0, .753) 100%),
    repeating-linear-gradient(90deg, #000 0 11.8px, transparent 11.8px 12.8px), repeating-linear-gradient(180deg, #000 0 15px, transparent 15px 16px);
  -webkit-mask-composite: source-in, source-in;
  mask-image: linear-gradient(90deg, rgba(0, 0, 0, .753) 0, transparent 236px, transparent calc(100% - 236px), rgba(0, 0, 0, .753) 100%),
    repeating-linear-gradient(90deg, #000 0 11.8px, transparent 11.8px 12.8px), repeating-linear-gradient(180deg, #000 0 15px, transparent 15px 16px);
  mask-composite: intersect;
  animation: mu-veil .5333s linear infinite; }
@keyframes mu-veil { to { transform: translate3d(0, 32px, 0); } }
@media (prefers-reduced-motion: reduce) { #mu-titlebg .mu-veil { animation: none; } }
`;
