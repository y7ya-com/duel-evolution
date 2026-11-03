<script>
  import { placeRows } from './logic.js';
  let { view } = $props();
  const win = $derived(view.win);
  const lines = $derived(placeRows(win));
  const room = $derived(lines.at(-1));
  const detail = $derived(lines.map(l => `${l.name}${l.cap ? ` · ${l.here}/${l.cap}` : ''}`).join(' / '));
</script>
{#if room}
  <div class="mu place-root" style:left="{-win.x}px" style:top="{-win.y}px">
    <div class="location" title={detail} aria-label={detail}><span>{room.name}</span>{#if room.cap}<span class="population" aria-label="{room.here} players here">{room.here} / {room.cap}</span>{/if}</div>
  </div>
{/if}
<style>

  .place-root { width:1024px; height:768px; pointer-events:none; }
  .location { pointer-events:none; position:absolute; right:12px; top:12px; height:27px; max-width:430px; display:flex; align-items:center; gap:10px; padding:0 9px; border:1px solid #b5d5e32e; border-radius:3px; font-size:13px; line-height:1; color:#edf7ff; background:#0a243c83; text-shadow:0 1px 2px #001524; }
  .location > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
  .population { flex:none; padding-left:10px; border-left:1px solid #a0dfff50; color:#d7eaf5; font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; }

</style>
