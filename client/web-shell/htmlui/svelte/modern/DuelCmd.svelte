<script>
  // A duel command menu (logic.js duelCmd: Summon / Set, Activate, Attack ...; owner: "I can pick between set and normal
  // summon, it's so buggy and weird"): a compact translucent panel where the engine put its list (by the card), one
  // real button per option the engine offers. A press is the engine's own choice: its row clicked at the row's centre
  // (the pointer first over the list: the engine ignores a press where its mouse already rests), once.
  let { m, win, api } = $props();
  let busy = $state(false);
  async function pick(o) {
    if (busy) return;
    busy = true;
    api.hover(m.list.id);
    await new Promise(r => setTimeout(r, 60));
    await api.click(m.list.id, o.gp);
    setTimeout(() => { busy = false; }, 400);
  }
</script>

<div class="mu-plate cmd" role="menu" aria-label="Choose an action">
  {#each m.options as o, i (o.label + i)}
    <button type="button" class="mu-btn opt" class:gold={i === 0} role="menuitem" disabled={busy} onclick={() => pick(o)}>{o.label}</button>
  {/each}
</div>

<style>
  .cmd { left: 0; top: 0; min-width: 150px; display: flex; flex-direction: column; gap: 8px; padding: 12px; pointer-events: auto; }
  .cmd::after { background: rgba(244, 248, 253, .82) !important; backdrop-filter: blur(6px); }
  .opt { height: 30px; font-size: 13px; pointer-events: auto; }
</style>
