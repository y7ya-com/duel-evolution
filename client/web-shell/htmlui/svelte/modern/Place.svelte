<script module>
  // The place banner, modern (CWindowModelPlace, src/Game/yo2MenuPlace.cpp): each of its ShadowTexts as one line of a
  // location chip: the place's name, its "(here/capacity)" as a count. "Lobby (1/1000)" -> Lobby, 1 / 1000.
  export const parse = s => {
    const m = /^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/.exec(s);
    return m ? { name: m[1], here: m[2], cap: m[3] } : { name: s, here: '', cap: '' };
  };
</script>

<script>
  import Icon from './Icon.svelte';
  let { view } = $props();
  const f = $derived(view.win.controls.find(c => c.cls === 'CWindowTaskFramePlace'));
  // a row: its ShadowTexts left to right ('Duelist Academy' then '(1/1000)': the name and the count are two texts)
  const lines = $derived.by(() => {
    const ts = view.win.controls.filter(c => c.cls === 'CWindowTaskShadowText' && !c.parent && c.shown && c.text);
    const rows = [];
    for (const t of ts.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const r = rows.find(r => Math.abs(r.y - t.y) < 6);
      r ? r.parts.push(t) : rows.push({ y: t.y, id: t.id, parts: [t] });
    }
    return rows.map(r => ({ id: r.id, ...parse(r.parts.sort((a, b) => a.x - b.x).map(t => t.text).join(' ')) }));
  });
</script>

{#if f?.shown && lines.length}
  <div class="mu">
    <div class="mu-plate chip" style:left="{f.x + 8}px" style:top="{f.y + 8}px">
      <Icon name="pin" size={20} class="pin" />
      <div class="lines">
        {#each lines as l, i (l.id)}
          <div class="line" class:first={i === 0}>
            <span class="name">{l.name}</span>
            {#if l.cap}<span class="count" title="{l.here} here of {l.cap}"><Icon name="people" size={13} />{l.here}<i>/</i>{l.cap}</span>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .chip { display: flex; align-items: center; gap: 10px; padding: 6px 14px 7px 10px; border-radius: 14px 14px 14px 5px; min-width: 190px; }
  .chip :global(.pin) { color: var(--gold-300); filter: drop-shadow(0 1px 1px rgba(2, 10, 30, .6)); }
  .lines { display: flex; flex-direction: column; gap: 1px; }
  .line { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; }
  .name { font-size: 12px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
  .first .name { font-size: 14.5px; font-weight: 700; color: #fff; text-shadow: 0 1px 1px rgba(2, 10, 30, .55); }
  .count { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--sky-300); }
  .count i { font-style: normal; opacity: .5; }
</style>
