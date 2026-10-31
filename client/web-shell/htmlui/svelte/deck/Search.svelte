<script module>
  import { FONT, fontCss } from '../../controls/basic.js';
  // the deck editor's own look (sampled from the engine's frame): silver chips with the trunk rows' card-colour
  // stripe, the side menu's blue bevel for buttons, a popup built like the Deck / Trunk panels (deck.js SEARCH_CSS)
  const BEVEL = 'linear-gradient(to bottom, #fff 0 1px, rgb(105 255 255) 1px, rgb(80 228 255) 18%, rgb(62 178 255) 30%, rgb(37 120 254) 72%, rgb(6 94 254) 80%, rgb(0 0 254) 96%, #fff 96%)';
  const BEVEL_HOVER = 'linear-gradient(to bottom, #fff 0 1px, rgb(207 255 255) 1px, rgb(152 255 255) 20%, rgb(134 237 255) 28%, rgb(118 221 255) 72%, rgb(81 209 255) 82%, rgb(12 188 255) 96%, #fff 96%)';
  const CSS = `
.dk-search { position: absolute; pointer-events: auto; color: #000; }
.dk-field { position: absolute; box-sizing: border-box; height: 22px; margin: 0; padding: 0 20px 0 6px; border: 1px solid;
  border-color: #808080 #e8e8e8 #e8e8e8 #808080; border-radius: 0; background: #fff; box-shadow: inset 1px 1px 0 #c0c0c0;
  font: ${fontCss(14, 20)}; color: #000; outline: none; }
.dk-field:focus { border-color: #1059ff #8fb0ff #8fb0ff #1059ff; }
.dk-field::placeholder { color: #8a8a8a; }
.dk-sel { padding: 0 2px; }
.dk-x { position: absolute; width: 16px; height: 16px; border: 0; padding: 0; background: none; color: #666; font: bold 13px/16px ${FONT}; }
.dk-chip { position: absolute; box-sizing: border-box; height: 20px; margin: 0; padding: 0 4px 0 8px; border: 1px solid #8a8a8a;
  border-radius: 2px; background: linear-gradient(#f6f7f9, #d3d6dc); box-shadow: inset 4px 0 0 var(--c);
  font: ${fontCss(12, 18)}; color: #222; white-space: nowrap; }
.dk-chip:hover { background: linear-gradient(#fff, #e4e7ec); }
.dk-chip[aria-pressed=true] { background: #fff; border-color: #2b3a5c; color: #000; font-weight: bold;
  box-shadow: inset 4px 0 0 var(--c), 0 0 0 1px #2b3a5c; }
.dk-btn { position: absolute; box-sizing: border-box; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 3px;
  background: ${BEVEL}; color: #fff; font: bold ${fontCss(14, 24)}; white-space: nowrap; letter-spacing: 0.3px;
  text-shadow: -1px 0 #1059ff, 1px 0 #1059ff, 0 -1px #1059ff, 0 1px #1059ff, 0 0 2px #0013fe; box-shadow: 0 0 0 1px #fff, 0 1px 2px rgb(0 0 60 / 0.5); }
.dk-btn:hover { background: ${BEVEL_HOVER}; color: #fdff45;
  text-shadow: -1px 0 #ff9d10, 1px 0 #ff9d10, 0 -1px #ff9d10, 0 1px #ff9d10, 0 0 2px #c06000; }
.dk-btn:active { filter: brightness(0.92); }
.dk-pop { position: absolute; box-sizing: border-box; background: #a1a1a1; border: 1px solid #6e7486;
  box-shadow: inset 3px 3px 0 #dadfe8, inset 5px 5px 0 #c0c5cf, inset 7px 7px 0 #b6bbc5,
    inset -3px -3px 0 #8d919f, inset -5px -5px 0 #a5a9b7, inset -7px -7px 0 #bcc0cb, 0 4px 12px rgb(0 0 40 / 0.45); }
.dk-head { position: absolute; left: 7px; right: 7px; top: 7px; height: 28px;
  background: linear-gradient(to bottom, #fff 0 1px, #c6c7d6 1px 2px, #8e8fad 2px, #757f9d 27px, #8a8fab 27px); }
.dk-strip { position: absolute; left: 7px; right: 7px; height: 26px; background: #cccccb; border-top: 1px solid #e0e1dc;
  border-bottom: 1px solid #a1a1a1; }
.dk-lbl { position: absolute; left: 8px; color: #000; font: ${fontCss(14, 24)}; }
.dk-dash { position: absolute; color: #000; font: ${fontCss(14, 24)}; }
.dk-count { position: absolute; color: #fff; white-space: nowrap; font: ${fontCss(13, 20)}; text-shadow: 0 0 2px #000, 0 0 1px #000; }
`;
  let cssDone = false;
</script>
<script>
  // The trunk's search (the owner: "modern, like EDOPro"): a live text box, the category chips, the hit count and a
  // Filters popup in words (one dropdown per field, the ATK / DEF ranges). The filtering is the engine's (apply hands
  // the filter to the game's list); hits: the list's count as the snapshot has it.
  import { emptyFilter, filterCount, textArt } from '../../screens/deck.js';
  import { CATS, FILTER_ROWS } from './art.js';
  import TextArt from './TextArt.svelte';
  let { hits, apply } = $props();
  if (!cssDone) { cssDone = true; const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); }
  const f = $state(emptyFilter());
  let open = $state(false), input = $state();
  let timer = 0;
  const changed = (now = false) => { clearTimeout(timer); timer = setTimeout(() => apply($state.snapshot(f)), now ? 0 : 150); };
  const n = $derived(filterCount(f));
  const TITLE = textArt({ tex: 'deck_moji_01.png', src: [0, 5 * 28] });   // "Card Search", glowing like the trunk's
  // the popup's rows from y 40, 28 apart; the buttons 6 below
  const rows = FILTER_ROWS.map((r, i) => ({ kind: r[0], title: r[1], key: r[2], opts: r[3], top: 40 + 28 * i }));
  const foot = 40 + 28 * rows.length + 6;
  const cur = key => { const v = Array.isArray(f[key]) ? f[key][0] : f[key]; return v == null ? '' : String(v); };
  const pick = (key, value) => {
    const v = value === '' ? null : key === 'sort' ? value : +value;
    if (Array.isArray(f[key])) f[key] = v == null ? [] : [v]; else f[key] = v ?? '';
    changed(true);
  };
</script>

<div class="dk-search">
  <!-- the header's plate (#b0b0c3): the search box over the "Rearrange" row, chips and count over the icon row -->
  <div style:position="absolute" style:left="2px" style:top="28px" style:width="284px" style:height="58px" style:background="#b0b0c3"></div>
  <!-- text, not type="search": that one brings the browser's own clear button (a second ×) beside ours -->
  <input bind:this={input} class="dk-field" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" spellcheck="false"
    placeholder="Search name or card text" aria-label="Search the trunk" style:left="8px" style:top="31px" style:width="192px"
    bind:value={f.text} oninput={() => changed()} />
  <button type="button" class="dk-x" aria-pressed="false" aria-label="Clear the search" hidden={!f.text} style:left="180px" style:top="34px"
    onclick={() => { f.text = ''; changed(true); input.focus(); }}>×</button>
  <button type="button" class="dk-btn" aria-pressed="false" aria-expanded={open} style:left="204px" style:top="30px" style:width="80px"
    onclick={() => { open = !open; }}>{n ? `Filters (${n})` : 'Filters'}</button>
  <div style:position="absolute" style:left="8px" style:top="60px" style:width="274px" style:display="flex" style:gap="2px">
    {#each CATS as [name, v, c]}
      <button type="button" class="dk-chip" aria-pressed={f.cat === v} style:position="static" style:flex="1 1 auto" style:padding="0 0 0 4px"
        style:--c={c} onclick={() => { f.cat = v; changed(true); }}>{name}</button>
    {/each}
  </div>
  <!-- the hits, beside the "Trunk" title (the engine's own count box beside them is the deck's size) -->
  <div class="dk-count" style:left="104px" style:top="4px">{hits == null ? '' : `${hits} shown`}</div>
  {#if open}
    <div class="dk-pop" role="dialog" aria-label="Card Search" style:left="4px" style:top="86px" style:width="280px" style:height="{foot + 24 + 14}px">
      <div class="dk-head"></div>
      <TextArt art={TITLE} x={12} y={9} />
      <button type="button" class="dk-btn" aria-pressed="false" aria-label="Close" style:left="{280 - 2 - 7 - 26}px" style:top="9px" style:width="22px"
        style:height="20px" style:line-height="20px" style:font-size="16px" onclick={() => { open = false; }}>×</button>
      {#each rows as r}
        <div class="dk-strip" style:top="{r.top - 2}px"></div>
        <div class="dk-lbl" style:top="{r.top - 1}px" style:left="14px">{r.title}</div>
        {#if r.kind === 'select'}
          <select class="dk-field dk-sel" aria-label={r.title} style:left="96px" style:top="{r.top}px" style:width="172px"
            value={cur(r.key)} onchange={e => pick(r.key, e.currentTarget.value)}>
            {#each [[r.key === 'sort' ? 'Default' : 'Any', ''], ...r.opts] as [label, v]}<option value={String(v)}>{label}</option>{/each}
          </select>
        {:else}
          {#each [0, 1] as k}
            <input class="dk-field" inputmode="numeric" placeholder={k ? 'max' : 'min'} aria-label="{r.title} {k ? 'at most' : 'at least'}"
              style:left="{96 + 94 * k}px" style:top="{r.top}px" style:width="78px" style:padding-right="4px" value={f[r.key][k] ?? ''}
              onchange={e => { const v = parseInt(e.currentTarget.value); f[r.key][k] = Number.isFinite(v) ? v : null; changed(true); }} />
          {/each}
          <div class="dk-dash" style:left="179px" style:top="{r.top - 1}px">–</div>
        {/if}
      {/each}
      <button type="button" class="dk-btn" aria-pressed="false" style:left="14px" style:top="{foot}px" style:width="120px"
        onclick={() => { Object.assign(f, emptyFilter(), { text: f.text, cat: f.cat }); changed(true); }}>Clear filters</button>
      <button type="button" class="dk-btn" aria-pressed="false" style:left="146px" style:top="{foot}px" style:width="120px" onclick={() => { open = false; }}>Done</button>
    </div>
  {/if}
</div>
