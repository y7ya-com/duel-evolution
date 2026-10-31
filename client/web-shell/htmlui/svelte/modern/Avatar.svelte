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
  const linkY = $derived(chosen ? chosen.c.y + chosen.c.h / 2 : 85);
  const look = c => c.checked ? 'chosen' : c.state;
</script>

<div class="mu">
  <div class="mu-plate panel"></div>
  <div class="link" style:top="{linkY - 1}px"></div>
  {#each p.switches as s (s.c.id)}
    {@const c = s.c}
    {#if s.kind === 'arrow'}
      <div class="arrow" data-look={look(c)} style:left="{c.x}px" style:top="{c.y + c.h / 2 - 18}px">
        <svg viewBox="0 0 20 20" class="mu-ico"><path d={c.x > 860 ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} /></svg>
      </div>
    {:else}
      <div class="sw {s.kind}" class:gold={s.kind === 'category' ? !!c.checked : s.label.trim() === 'Confirm'} data-look={look(c)}
        style:left="{c.x}px" style:top="{c.y}px" style:width="{c.w}px" style:height="{c.h}px"><span>{s.label}</span></div>
    {/if}
  {/each}
  {#each p.loose as t (t.id)}
    <div class="loose" style:left="{t.x}px" style:top="{t.y}px" style:width="{t.w}px" style:text-align={['left', 'center', 'right'][t.align || 0]}>{t.text}</div>
  {/each}
</div>

<style>
  .panel { left: 703px; top: 60px; width: 292px; height: 612px; border-radius: 18px 18px 6px 18px; }
  .link { position: absolute; left: 652px; width: 52px; height: 3px; border-radius: 2px;
    background: linear-gradient(90deg, #f4d558, #0985ff); transition: top .2s var(--ease); }
  .sw { position: absolute; display: flex; align-items: center; padding: 0 18px; border-radius: 12px 12px 12px 4px; font-weight: 700; color: var(--ink-strong);
    white-space: nowrap; overflow: hidden; background: var(--sky-glass);
    box-shadow: 0 0 0 1px #3a9de6, inset 0 1px 0 #fff, inset 0 -2px 0 rgba(41, 120, 210, .2), 0 3px 6px rgba(10, 60, 130, .25);
    transition: transform .14s var(--ease), box-shadow .14s, background .14s; }
  .sw span { overflow: hidden; text-overflow: ellipsis; }
  .category { font-size: 16px; letter-spacing: .02em; }
  .item { font-size: 13.5px; padding: 0 14px; }
  .action { justify-content: center; font-size: 15px; letter-spacing: .04em; }
  .sw[data-look='hover'] { transform: translateX(3px); background: var(--sky-glass-hover);
    box-shadow: 0 0 0 1px #0985ff, 0 0 0 3px rgba(0, 180, 255, .3), inset 0 1px 0 #fff, 0 8px 16px -6px rgba(0, 120, 230, .5); }
  .sw[data-look='pressed'] { transform: none; filter: brightness(.95); }
  .sw[data-look='disabled'] { opacity: .5; }
  .sw.gold { color: var(--gold-ink);
    background: linear-gradient(180deg, #ffffc8 0%, #fff97f 30%, #f9e45f 50%, #f4d558 62%, #f0be45 85%, #eca430 100%);
    box-shadow: 0 0 0 1px var(--gold-edge), inset 0 1px 0 #fff, inset 0 -2px 0 rgba(200, 100, 0, .25), 0 4px 10px rgba(160, 80, 0, .35); }
  .arrow { position: absolute; display: grid; place-items: center; width: 36px; height: 36px; margin-left: -2px; border-radius: 50%; color: var(--gold-ink);
    background: radial-gradient(circle at 35% 30%, #ffffc8, #f9e45f 55%, #eca430); box-shadow: 0 0 0 1px var(--gold-edge), 0 3px 8px rgba(160, 80, 0, .4);
    transition: transform .14s var(--ease); }
  .arrow .mu-ico { width: 20px; height: 20px; stroke-width: 2.4; }
  .arrow[data-look='hover'] { transform: scale(1.1); }
  .arrow[data-look='pressed'] { transform: scale(.94); }
  .loose { position: absolute; font-size: 13px; font-weight: 700; color: var(--ink-strong); white-space: pre-wrap; text-shadow: 0 1px 0 #fff; }
</style>
