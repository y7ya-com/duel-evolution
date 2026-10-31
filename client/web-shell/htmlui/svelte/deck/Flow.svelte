<script>
  // A paged text (the card detail's text) as the player reads it: the real lines as colour runs, wrapped by words by
  // the browser in a native scroll box (the owner: words, not the engine's character wrap; native scrollers). The box
  // lives as long as its item: the player's place stays while the text does, a new text starts at the top.
  import { fontCss, spacing } from '../../controls/basic.js';
  import { flowLines, TAG_RGB } from '../../screens/deck.js';
  let { text, x, y, w, h, alpha = 1, px } = $props();
  const lines = $derived(flowLines(text));
  let el = $state();
  $effect(() => { text; if (el) el.scrollTop = 0; });
</script>

<div bind:this={el} style:position="absolute" style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px"
  style:overflow-x="hidden" style:overflow-y="auto" style:overscroll-behavior="contain" style:pointer-events="auto" style:scrollbar-width="thin"
  style:font={fontCss(px)} style:white-space="pre-wrap" style:word-break="normal" style:overflow-wrap="break-word" style:opacity={alpha === 1 ? '' : alpha}>
  {#each lines as line}
    <div style:letter-spacing="{spacing(line.map(r => r.s).join(''), px)}px">{#each line as r}<span style:color="#{r.rgb.toString(16).padStart(6, '0')}"
      style:font={r.rgb === TAG_RGB[1] ? `bold ${fontCss(18)}` : null}>{r.s}</span>{/each}{#if !line.length}&nbsp;{/if}</div>
  {/each}
</div>
