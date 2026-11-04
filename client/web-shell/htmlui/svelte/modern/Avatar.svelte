<script module>
  // Character creation, modern (CWindowDialogAvatarSwitch, src/ChangeAvatar/yo2ChangeAvatar.cpp). Pass mode, as the
  // legacy screen: the game takes the input at its own places and draws the character in the middle (the window's
  // plain CElement passes). The categories (324 wide), the items of a page (254 wide), Confirm / Back (162 wide) and the
  // page arrows (32 x 64) are redrawn where they are: glass rows, the chosen category gold, the items in a plate, round
  // arrows; each switch's own label inside it (the text that sits on it), states from the snapshot.
  import { avatarParts } from './logic.js';
</script>

<script>
  let { view } = $props();
  const win = $derived(view.win);
  const p = $derived(avatarParts(win));
  const chosen = $derived(p.switches.find(s => s.kind === 'category' && s.c.checked));
  const categories = $derived(p.switches.filter(s => s.kind === 'category').sort((a, b) => a.c.y - b.c.y));
  const number = c => String(categories.findIndex(s => s.c.id === c.id) + 1).padStart(2, '0');
  const look = c => c.checked ? 'chosen' : c.state;
</script>

<div class="mu">
  <div class="creator-heading" aria-hidden="true">Create Duelist</div>
  <div class="panel"></div>
  <div class="options-heading" aria-hidden="true"><span>Customize</span><b>{chosen?.label || 'Choose a feature'}</b></div>
  {#each p.switches as s (s.c.id)}
    {@const c = s.c}
    {#if s.kind === 'arrow'}
      <div class="arrow" data-look={look(c)} style:left="{c.x}px" style:top="{c.y + c.h / 2 - 18}px">
        <svg viewBox="0 0 20 20" class="mu-ico"><path d={c.x > 860 ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} /></svg>
      </div>
    {:else}
      <div class="sw {s.kind}" class:gold={s.kind === 'category' ? !!c.checked : s.label.trim() === 'Confirm'} data-look={look(c)}
        style:left="{c.x}px" style:top="{c.y}px" style:width="{c.w}px" style:height="{c.h}px">
        {#if s.kind === 'category'}<span class="number">{number(c)}</span>{/if}
        {#if s.kind === 'item'}<span class="item-mark">{c.checked ? '✓' : ''}</span>{/if}
        <span class="label">{s.label}</span>
        {#if s.kind === 'category'}<span class="indicator">{c.checked ? 'SELECTED' : '›'}</span>{/if}
      </div>
    {/if}
  {/each}
  {#each p.loose as t (t.id)}
    <div class="loose" style:left="{t.x}px" style:top="{t.y}px" style:width="{t.w}px" style:text-align={['left', 'center', 'right'][t.align || 0]}>{t.text}</div>
  {/each}
</div>

<style>

  .creator-heading { position:absolute; left:340px; top:-22px; width:324px; height:31px; padding:5px 12px; border:1px solid #206fb7; border-radius:3px; color:#fff; font:700 17px Arial,sans-serif; text-shadow:0 1px #18588f; background:var(--band); box-shadow:inset 0 1px #dcffff; }
  .panel { position:absolute; left:703px; top:60px; width:292px; height:612px; border:3px solid #8ce5ff; border-radius:3px; background:var(--plate); box-shadow:0 0 0 1px #1b76bd,0 3px 8px #194e7955; }
  .options-heading { position:absolute; left:703px; top:25px; width:292px; height:31px; padding:0 10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #1764ad; border-radius:3px 3px 0 0; background:var(--band); color:#fff; text-shadow:0 1px #18558d; }
  .options-heading span { font-size:12px; }
  .options-heading b { max-width:175px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
  .sw { position:absolute; display:flex; align-items:center; box-sizing:border-box; gap:9px; overflow:hidden; white-space:nowrap; color:var(--ink-strong); }
  .sw .label { min-width:0; overflow:hidden; text-overflow:ellipsis; }
  .category { padding:0 11px 0 0; border:1px solid #397eaf; border-radius:3px; font-size:15px; font-weight:700; background:var(--btn); box-shadow:inset 0 1px #fff,0 1px #246b9f; }
  .number { display:grid; place-items:center; align-self:stretch; flex:none; width:35px; border-right:1px solid #2e77b1; color:#e4f8ff; background:var(--sel); font-size:12px; font-weight:700; }
  .indicator { margin-left:auto; color:#276597; font-size:20px; }
  .category.gold { color:#483409; border-color:#bb871e; background:var(--gold); }
  .category.gold .number { color:#513a08; background:#efd072; border-color:#ca992f; }
  .category.gold .indicator { color:#795816; font-size:10px; letter-spacing:0; }
  .item { padding:0 8px; border-bottom:1px solid #9ccae1; border-radius:1px; font-size:14px; font-weight:600; background:#e4f8ffb3; }
  .item-mark { display:grid; place-items:center; flex:none; width:17px; height:17px; border:1px solid #76a7c6; border-radius:2px; background:#f2ffff; color:#145a9a; font-size:12px; }
  .item[data-look='chosen'] { color:#fff; background:var(--sel); border-color:#3a80c3; }
  .item[data-look='chosen'] .item-mark { color:#4f3e15; background:var(--gold); border-color:#c4952e; }
  .action { justify-content:center; padding:0 12px; border:1px solid var(--btn-edge); border-radius:3px; font-size:14px; font-weight:700; background:var(--btn); box-shadow:inset 0 1px #fff,0 1px #2c70a3; }
  .action.gold { color:var(--gold-ink); border-color:var(--gold-edge); background:var(--gold); }
  .sw[data-look='hover'] { filter:brightness(1.1); outline:1px solid #d7ffff; }
  .sw[data-look='pressed'] { filter:brightness(.96); }
  .sw[data-look='disabled'] { opacity:.5; }
  .arrow { position:absolute; display:grid; place-items:center; width:32px; height:36px; border:1px solid #2373b5; border-radius:3px; color:#fff; background:var(--band); box-shadow:inset 0 1px #ddffff,0 1px #195795; }
  .arrow .mu-ico { width:21px; height:21px; stroke-width:2.4; }
  .arrow[data-look='hover'] { background:var(--gold); color:#63501b; border-color:#bd8c2c; }
  .arrow[data-look='pressed'] { filter:brightness(.9); }
  .loose { position:absolute; font-size:13px; font-weight:700; color:var(--ink-strong); white-space:pre-wrap; text-shadow:0 1px #fff; }

</style>
