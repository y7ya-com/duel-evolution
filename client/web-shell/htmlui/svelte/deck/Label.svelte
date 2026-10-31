<script>
  // Tagged text as real DOM text (the owner's rule): per line, one text box per colour run at the pen; @1 is
  // AtConverter's bold 18 px style. box: the CTextElm's { align, w, px, ink } as it lays its lines out.
  import { textWidth, spacing, fontCss, textColor } from '../../controls/basic.js';
  import { runs, TAG_RGB } from '../../screens/deck.js';
  let { text, x, y, alpha = 1, box } = $props();
  const size = $derived(box.px ?? 16), ink = $derived(box.ink ?? null);
  const px = r => r.rgb === TAG_RGB[1] ? 18 : size;
  const rw = r => textWidth(r.s, px(r)) + spacing(r.s, px(r)) * [...r.s].length;   // as textBox sets it
  const lines = $derived(text.split('\n').map((line, li) => {
    const rs = runs(line), lw = rs.reduce((n, r) => r.x !== null ? r.x + rw(r) : n + rw(r), 0);
    let pen = box.align === 1 ? Math.floor(((box.w || 0) - lw) / 2) : box.align === 2 ? (box.w || 0) - lw : 0;
    return rs.map(r => {
      if (r.x !== null) pen = r.x;
      const rgb = ink !== null && r.rgb === TAG_RGB[0] ? ink : r.rgb, p = px(r), ls = spacing(r.s, p);
      const o = { s: r.s, x: x + pen, y: y + size * li, p, ls, color: textColor([rgb >> 16, rgb >> 8 & 255, rgb & 255].map(v => v / 255).concat(alpha), true) };
      pen += rw(r);
      return o;
    });
  }).flat());
</script>

{#each lines as r}
  <div class="txt" style:left="{r.x}px" style:top="{r.y}px" style:font={fontCss(r.p, r.p)} style:color={r.color} style:text-align="left"
    style:white-space="pre" style:font-weight={r.p === 18 ? 'bold' : null}><span style:letter-spacing="{r.ls}px" style:margin-right="{-r.ls}px">{r.s}</span></div>
{/each}
