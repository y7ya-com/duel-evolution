<script>
  // The small icons and the scroll bar as SVG / CSS (owner: blurry or pixelated at 2x becomes vector), in the sprite's
  // frame scaled with it: attribute discs, spell / trap symbols, the level star and number, the scroll bar's cells;
  // the 21 monster-type pictures stay pixel art (owner), nearest-neighbour.
  import * as ui from '../../../ui.js';
  import { fontCss } from '../../controls/basic.js';
  import { ATTR_SVG, ICON_PATH } from './art.js';
  let { a, x, y, w, h, alpha = 1 } = $props();
  const id = $props.id();
  const base = () => ui.SHEET.window.url.replace(/[^/]*$/, '');
  // scroll_01_c00's cells (#92979a lines on white, the track #d4e2e4): arrows (columns: normal, disabled, pressed),
  // the thumb's top / middle / bottom slices, the track
  const col = $derived(a.u / 16), line = $derived(['#92979a', '#b1b7bb', '#070707'][col] || '#92979a');
  const thumb = $derived(a.kind === 'scroll' && a.u < 48 && a.v >= 32 && a.v < 56);
  const P = ['50% 22%,82% 54%,82% 78%,18% 78%,18% 54%', '18% 22%,82% 22%,82% 46%,50% 78%,18% 46%',
    '78% 18%,78% 82%,46% 82%,22% 50%,46% 18%', '22% 18%,54% 18%,78% 50%,54% 82%,22% 82%'];
  const dir = $derived([0, 1, , , 2, 3][a.v / 16 | 0] ?? 0);
  const op = $derived(alpha === 1 ? '' : alpha);
</script>

{#if a.kind === 'level'}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" style:opacity={op}
    style:font="italic bold {fontCss(14, h)}" style:color="#4f0d00" style:text-align="center"
    style:text-shadow="0 0 1px #e0bb7e, 0 0 1px #e0bb7e, 0 0 2px #e0bb7e">{a.i}</div>
{:else if a.kind === 'pixel'}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" style:opacity={op}
    style:background-image="url({base()}{a.n})" style:background-position="{-a.u}px {-a.v}px" style:background-repeat="no-repeat"
    style:image-rendering="pixelated"></div>
{:else if a.kind === 'scroll' && a.u >= 48}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" style:opacity={op} style:background="#d4e2e4"></div>
{:else if thumb}
  <div style:position="absolute" style:left="{x + 2 * w / 16}px" style:top="{y}px" style:width="{12 * w / 16}px" style:height="{h}px" style:opacity={op}
    style:box-sizing="border-box" style:background="#fff" style:border-left="1px solid {line}" style:border-right="1px solid {line}"
    style:border-top={a.v === 32 ? `1px solid ${line}` : ''} style:border-bottom={a.v === 48 ? `1px solid ${line}` : ''}></div>
{:else if a.kind === 'scroll'}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w - 2}px" style:height="{h - 2}px" style:opacity={op}
    style:box-sizing="border-box" style:border="1px solid {line}" style:background={col === 2 ? '#92979a' : '#fff'} style:margin="1px">
    <div style:position="absolute" style:inset="1px" style:background={['#92979a', '#e2e9ed', '#fff'][col] || '#92979a'} style:clip-path="polygon({P[dir]})"></div>
  </div>
{:else}
  <div style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" style:opacity={op}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {a.kind === 'star' ? 19 : 16} 16" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      {#if a.kind === 'attr'}
        {@const [rim, top, bot, ink, kanji] = ATTR_SVG[a.i]}
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={top}/><stop offset="1" stop-color={bot}/></linearGradient></defs>
        <circle cx="8" cy="8" r="7.6" fill={rim}/><circle cx="8" cy="8" r="6.4" fill="url(#{id})"/>
        <text x="8" y="11.6" text-anchor="middle" font-size="10" font-weight="bold" fill={ink}
          font-family="'Hiragino Sans','Yu Gothic','Noto Sans CJK JP','Microsoft YaHei',sans-serif">{kanji}</text>
      {:else if a.kind === 'icon'}
        <defs><radialGradient id={id} cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e3b289"/><stop offset=".6" stop-color="#b06e37"/><stop offset="1" stop-color="#7c3904"/></radialGradient></defs>
        <circle cx="8" cy="8" r="7.6" fill="#490e00"/><circle cx="8" cy="8" r="6.9" fill="#fffffd"/>
        <circle cx="8" cy="8" r="5.8" fill={a.i === 6 ? '#490e00' : `url(#${id})`}/>
        {#if ICON_PATH[a.i]}
          <path d={ICON_PATH[a.i]} fill={a.i === 2 || a.i === 0 || a.i === 3 ? 'none' : '#fffffd'} stroke="#fffffd"
            stroke-width={a.i === 2 ? 1.8 : a.i === 1 || a.i === 4 || a.i === 5 ? 0.4 : 1.4} stroke-linecap="round" stroke-linejoin="round"/>
        {/if}
      {:else}
        <defs><radialGradient id={id} cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#e5f41e"/><stop offset=".55" stop-color="#e8701c"/><stop offset=".85" stop-color="#9e2728"/><stop offset="1" stop-color="#3f0607"/></radialGradient></defs>
        <circle cx="7.5" cy="7.5" r="7.2" fill="url(#{id})"/>
        <path d="M7.5 2.6 8.9 6 12.4 6.1 9.6 8.3 10.6 11.8 7.5 9.8 4.4 11.8 5.4 8.3 2.6 6.1 6.1 6Z" fill="#f4f87a"/>
        <path d="M12.6 10.6 17.4 15.4M17.4 10.6 12.6 15.4" stroke="#3f0607" stroke-width="3" stroke-linecap="round"/>
        <path d="M12.6 10.6 17.4 15.4M17.4 10.6 12.6 15.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
      {/if}
    </svg>
  </div>
{/if}
