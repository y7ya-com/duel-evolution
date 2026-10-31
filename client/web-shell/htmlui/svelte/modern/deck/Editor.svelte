<script>
  // The modern deck editor (owned: the DOM takes the input), over the whole Edit Deck scene: the card shown large on the
  // left, the deck in the middle (Main, Fusion, Side), the trunk on the right as a grid of full cards with its filters
  // always in view. Every change is the engine's own (engine.js: its drag and drop, side buttons, file list); what shows
  // is the snapshot's deck (CWindowTaskDeck grids, read/deck.js) and the trunk's counts (yo2Deck.trunk).
  import { deckCheck } from '../logic.js';
  import Icon from '../Icon.svelte';
  import { picture, cached } from './pictures.js';
  import * as E from './engine.js';
  import { NO_FILTER, TYPES, SORTS, SECTIONS, view as poolView, copies, blocked, home, group, typeLine, isFusion } from './editor.js';
  let { view } = $props();

  const db = globalThis.yo2Deck;
  const win = $derived(view.win);
  const all = $derived((win, db?.cards?.() || []));
  const deck = $derived(win.controls.find(c => c.cls === 'CWindowTaskDeck'));
  const grids = $derived(deck?.grids || { main: [], side: [], extra: [] });
  const counts = $derived(deck?.counts || { main: 0, side: 0, extra: 0, missing: 0 });
  const check = $derived(deckCheck(counts));
  const inDeck = $derived(copies(grids));
  const trunk = $derived((win, new Map(db?.trunk || [])));
  const left = id => trunk.get(id) || 0;
  const s = $derived((win, globalThis.yo2Html?.snapshot?.()));
  const name = $derived(E.deckName(s));
  // the scene's dialogs (file lists, questions, the name prompt): the editor waits under a scrim, cut around them
  const dialogs = $derived((s?.windows || []).filter(w => w.shown && /FileList|DialogYesNo|InputValue|DialogOk|Input1/.test(w.cls)));

  // ---- the trunk's filters
  let f = $state(structuredClone(NO_FILTER));
  let q = $state('');
  let qt = 0;
  $effect(() => { const v = q; clearTimeout(qt); qt = setTimeout(() => { f.q = v; }, 90); });
  const attrs = $derived([1, 2, 3, 4, 5, 6, 7].map(a => [a, db?.dlg?.(a + 0x212) || ''])  .filter(a => a[1]));
  const pool = $derived(poolView(all, { ...f, attr: [...f.attr], level: [...f.level], atk: [...f.atk], def: [...f.def] }, left, db?.desc));
  const filtered = $derived(f.type !== 'all' || f.attr.length || f.level[0] > 0 || f.level[1] < 12 || f.atk.some(v => v !== '') || f.def.some(v => v !== '') || !f.owned);
  const reset = () => { const o = f.owned; f = structuredClone(NO_FILTER); f.owned = o; q = ''; };
  const toggleAttr = a => { f.attr = f.attr.includes(a) ? f.attr.filter(x => x !== a) : [...f.attr, a]; };

  // ---- the card shown large: what is hovered, else the last one picked
  let hover = $state(0), pinned = $state(0);
  const shown = $derived(db?.card?.(hover || pinned) || null);
  const text = $derived(shown ? db.desc(shown.id) : '');
  const attrName = c => db?.dlg?.(c.attr + 0x212) || '';
  const raceName = c => db?.dlg?.(c.race + 500) || '';
  const stat = v => (v < 0 ? '?' : v);

  // ---- actions (one at a time, queued): what they say back goes to the status line
  let busy = $state(0), note = $state(''), noteBad = $state(false), dirty = $state(false);
  let nt = 0;
  const say = (m, bad = false) => { note = m; noteBad = bad; clearTimeout(nt); nt = setTimeout(() => { note = ''; }, 3200); };
  const run = async (p, fail) => { busy++; try { const ok = await p; if (ok) dirty = true; else if (fail) say(fail, true); return ok; } finally { busy--; } };
  function put(c, to = home(c)) {
    const why = blocked(c, to, { inDeck: inDeck.get(c.id) || 0, left: left(c.id), counts });
    if (why) return say(`${c.name}: ${why}`, true);
    run(E.add(c, to), `${c.name} could not be added`);
  }
  const take = (id, from) => run(E.move(id, from), 'The card could not be taken out');
  function swap(id, from) {
    if (from === 'extra') return say('Fusion monsters stay in the Fusion Deck', true);
    const to = from === 'main' ? 'side' : 'main';
    if (counts[to] >= (to === 'side' ? 15 : 80)) return say(`The ${to === 'side' ? 'Side' : 'Main'} Deck is full`, true);
    run(E.move(id, from, to), 'The card could not be moved');
  }

  // ---- drag and drop between the trunk and the sections (the browser's own)
  let over = $state('');
  const dragStart = (e, id, from) => { e.dataTransfer.setData('text/plain', JSON.stringify({ id, from })); e.dataTransfer.effectAllowed = 'move'; };
  const dragData = e => { try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; } };
  function drop(e, to) {
    e.preventDefault();
    over = '';
    const d = dragData(e);
    if (!d || d.from === to) return;
    if (d.from === 'pool') return to !== 'pool' && put(db.card(d.id), to);
    if (to === 'pool') return take(d.id, d.from);
    if (d.from === 'extra' || to === 'extra') return say('Only Fusion monsters go in the Fusion Deck, and they stay there', true);
    run(E.move(d.id, d.from, to), 'The card could not be moved');
  }
  const dropZone = to => ({ ondragover: e => { e.preventDefault(); over = to; }, ondragleave: e => { if (!e.currentTarget.contains(e.relatedTarget)) over = ''; }, ondrop: e => drop(e, to) });

  // ---- files: Save (as the deck's own name), Save As, Load, Structure Deck, Clear, Exit (the engine's side buttons)
  let saving = $state(false), asOpen = $state(false), asName = $state(''), asField = $state(null);
  const legalToSave = $derived(counts.main >= 40 && counts.main <= 80 && counts.side <= 15 && counts.extra <= 30);
  async function save(as) {
    if (!legalToSave) return say('A deck needs 40 to 80 Main Deck cards to be saved', true);
    const n = (as ?? name).trim();
    if (!n) return openAs();
    asOpen = false;
    busy++;
    saving = true;
    try {
      if (await E.saveAs(view.api, n)) { dirty = false; say(`Saved as “${n}”`); } else say('The deck was not saved', true);
    } finally { busy--; saving = false; }
  }
  // the game's name prompt takes letters and numbers only (a space never reaches the file name)
  const cleanName = v => String(v).replace(/[^A-Za-z0-9]/g, '');
  function openAs() { asName = cleanName(name || ''); asOpen = true; queueMicrotask(() => asField?.select()); }
  const sideBtn = n => E.side(n);
  // Load and Structure Deck: the engine's list opened out of sight, its rows picked here
  const PICK = { load: ['LoadBtn', 'Load a deck', 'No saved decks yet.'], recipe: ['RecipeBtn', 'Start from a Structure Deck', 'No Structure Decks here.'] };
  let picker = $state(null), pickList = $state(null);
  async function openPicker(kind) {
    if (picker || busy) return;
    asOpen = false;
    busy++;
    const names = await E.openList(PICK[kind][0]).finally(() => busy--);
    if (!names) return say('The list could not be opened', true);
    picker = { kind, names };
    queueMicrotask(() => pickList?.querySelector('button')?.focus());
  }
  async function pick(i) {
    const p = picker;
    picker = null;
    busy++;
    try {
      if (!(await E.pickRow(view.api, i))) return say('That could not be opened', true);
      dirty = p.kind === 'recipe';
      say(p.kind === 'load' ? `Loaded “${p.names[i]}”` : `“${p.names[i]}” is in the editor: save it under a name to keep it`);
    } finally { busy--; }
  }
  const unpick = () => { picker = null; E.closeList(); };
  // while the editor drives the engine's dialogs (an action, a picker), their windows stay out of sight
  $effect(() => {
    document.documentElement.classList.toggle('mu-deck-driving', busy > 0 || !!picker);
    return () => document.documentElement.classList.remove('mu-deck-driving');
  });

  // ---- keys: / search, Esc clears it, Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O load
  let search = $state(null);
  $effect(() => {
    const key = e => {
      if (dialogs.length && !picker) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      let hit = true;
      if (e.key === '/' && !typing) search?.focus();
      else if (e.key === 'Escape' && e.target === search) { if (q) q = ''; else search.blur(); }
      else if (mod && e.key.toLowerCase() === 's') e.shiftKey ? openAs() : save();
      else if (mod && e.key.toLowerCase() === 'o') openPicker('load');
      else hit = false;
      if (hit) { e.preventDefault(); e.stopPropagation(); }
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });
  // a card's keys: Enter adds / takes out, Shift+Enter the Side Deck / swaps Main and Side, Delete takes out
  const poolKey = (e, c) => { if (e.key === 'Enter') { e.preventDefault(); put(c, e.shiftKey && !isFusion(c) ? 'side' : home(c)); } };
  const deckKey = (e, id, from) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); swap(id, from); }
    else if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); take(id, from); }
  };
  // the dialogs' rects (drawn: a file list's buttons sit below its nominal rect), overlapping ones merged (an even-odd
  // path would fill their overlap again), cut out of the editor: the engine's own dialogs show and take the mouse there
  // (none while the editor's own action plays the dialogs: they flash by under "Saving…")
  const holes = $derived.by(() => {
    if (busy || picker) return 'none';
    const rs = [];
    for (let r of dialogs.map(w => w.drawn || w)) {
      r = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
      for (let i = rs.length - 1; i >= 0; i--) {
        const o = rs[i];
        if (o.x0 < r.x1 && r.x0 < o.x1 && o.y0 < r.y1 && r.y0 < o.y1) { r = { x0: Math.min(o.x0, r.x0), y0: Math.min(o.y0, r.y0), x1: Math.max(o.x1, r.x1), y1: Math.max(o.y1, r.y1) }; rs.splice(i, 1); }
      }
      rs.push(r);
    }
    return rs.length ? `path(evenodd, 'M0 0H1024V736H0Z ${rs.map(r => `M${r.x0} ${r.y0}H${r.x1}V${r.y1}H${r.x0}Z`).join(' ')}')` : 'none';
  });
  const limitTag = c => (c.limit === 0 ? 'Forbidden' : c.limit === 1 ? 'Limited' : c.limit === 2 ? 'Semi-limited' : '');
</script>

{#snippet face(id, extra = '')}
  <img class="face {extra}" use:picture={id} alt="" draggable="false" src={cached(id)} />
{/snippet}

<div class="mu ed" style:left="{-win.x}px" style:top="{-win.y}px" style:clip-path={holes} class:waiting={dialogs.length} aria-busy={busy > 0}>
  {#if busy && dialogs.length}<div class="veil" role="status"><span class="spin" aria-hidden="true"></span>{saving ? 'Saving…' : 'Working…'}</div>{/if}
  <!-- the bar: the screen's name, the deck's, its check, the file actions -->
  <header class="bar">
    <h1 class="word">Edit Deck</h1>
    <div class="file">
      <span class="fname" title="The deck file being edited">{name || 'Untitled deck'}</span>
      {#if dirty}<span class="dot" title="Changed since it was saved"></span>{/if}
    </div>
    <div class="check" class:ok={check?.ok} title={check?.parts.map(p => `${p.label} ${p.n} (${p.rule})`).join(' · ')}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{#if check?.ok}<path d="M5 10.5l3.2 3.2L15 7" />{:else}<path d="M10 5.5v5.5M10 14.2v.3" />{/if}</svg>
      {check?.ok ? 'Ready to duel' : 'Not legal yet'}
    </div>
    <span class="status" class:bad={noteBad} role="status" aria-live="polite">{note || (busy ? 'Working…' : '')}</span>
    <nav class="acts" aria-label="Deck files">
      <button type="button" class="mu-btn" onclick={() => openPicker('load')} aria-expanded={picker?.kind === 'load'} title="Load a saved deck (Ctrl+O)">Load</button>
      <button type="button" class="mu-btn" onclick={() => openPicker('recipe')} aria-expanded={picker?.kind === 'recipe'} title="Start from a Structure Deck">Structure Deck</button>
      <button type="button" class="mu-btn" onclick={() => sideBtn('ClearBtn')} title="Empty the deck">Clear</button>
      <span class="sep"></span>
      <div class="as">
        <button type="button" class="mu-btn" onclick={openAs} aria-expanded={asOpen} title="Save under a new name (Ctrl+Shift+S)">Save As…</button>
        {#if asOpen}
          <form class="pop mu-plate" onsubmit={e => { e.preventDefault(); save(asName); }} onkeydown={e => { if (e.key === 'Escape') { e.stopPropagation(); asOpen = false; } }}>
            <label for="ed-as">Deck name</label>
            <input id="ed-as" bind:this={asField} bind:value={asName} oninput={() => (asName = cleanName(asName))} maxlength="20" autocomplete="off" spellcheck="false" aria-describedby="ed-as-hint" />
            <small id="ed-as-hint">Letters and numbers. A deck of the same name is replaced.</small>
            <div class="row"><button type="button" class="mu-btn" onclick={() => (asOpen = false)}>Cancel</button><button type="submit" class="mu-btn gold" disabled={!asName.trim()}>Save</button></div>
          </form>
        {/if}
      </div>
      <button type="button" class="mu-btn gold" onclick={() => save()} title="Save (Ctrl+S)"><Icon name="log" size={15} />Save</button>
      <button type="button" class="mu-icon-btn exit" onclick={() => sideBtn('ExitBtn')} title="Leave the deck editor" aria-label="Exit"><Icon name="exit" /></button>
    </nav>
  </header>

  {#if picker}
    <div class="mu-plate pop picker" role="dialog" aria-label={PICK[picker.kind][1]} onkeydown={e => { if (e.key === 'Escape') { e.stopPropagation(); unpick(); } }}>
      <h2>{PICK[picker.kind][1]}</h2>
      {#if picker.names.length}
        <div class="rows mu-scroll" bind:this={pickList}>
          {#each picker.names as n, i (i)}<button type="button" class:cur={picker.kind === 'load' && n === name} onclick={() => pick(i)}>{n}</button>{/each}
        </div>
      {:else}<p class="none">{PICK[picker.kind][2]}</p>{/if}
      <div class="row"><button type="button" class="mu-btn" onclick={unpick}>Cancel</button></div>
    </div>
  {/if}

  <!-- the card shown large -->
  <aside class="mu-plate preview" aria-label="Card">
    {#if shown}
      <div class="big">{@render face(shown.id)}</div>
      <h2>{shown.name}</h2>
      <p class="kind">
        {#if group(shown) === 'monster'}<span>{attrName(shown)}</span><span class="stars" aria-label="Level {shown.level}">Level {shown.level}</span><span>{raceName(shown)}</span>{/if}
        <span>{typeLine(shown)}</span>
      </p>
      {#if group(shown) === 'monster'}<p class="pw"><span>ATK <b>{stat(shown.atk)}</b></span><span>DEF <b>{stat(shown.def)}</b></span></p>{/if}
      <div class="text mu-scroll">{text}</div>
      <p class="own">In deck <b>{inDeck.get(shown.id) || 0}</b> · in trunk <b>{left(shown.id)}</b>{#if limitTag(shown)} · <em>{limitTag(shown)} {shown.limit}</em>{/if}</p>
    {:else}
      <div class="big empty" aria-hidden="true">
        <svg viewBox="0 0 216 313"><circle cx="108" cy="156" r="78" /><circle cx="108" cy="156" r="58" /><circle cx="108" cy="156" r="20" /><path d="M108 66v30M108 216v30M18 156h30M168 156h30" /></svg>
      </div>
      <p class="hint">Point at a card to see it here.</p>
      <ul class="keys">
        <li><kbd>Double-click</kbd> or <kbd>right-click</kbd> adds or takes out</li>
        <li><kbd>Shift</kbd> with it: the Side Deck</li>
        <li>Drag cards between the trunk and the deck</li>
        <li><kbd>/</kbd> search · <kbd>Ctrl S</kbd> save · <kbd>Ctrl O</kbd> load</li>
      </ul>
    {/if}
  </aside>

  <!-- the deck -->
  <section class="mu-plate deck" aria-label="Deck">
    {#each SECTIONS as [key, title, cap] (key)}
      {@const part = check?.parts.find(p => p.key === key)}
      <div class="sec {key}" class:over={over === key} {...dropZone(key)} role="group" aria-label={title}>
        <h3><span>{title}</span><b class:bad={part && !part.ok}>{counts[key]}</b>{#if part}<small>{part.rule}</small>{/if}</h3>
        <div class="grid mu-scroll">
          {#each grids[key] as id, i (key + i + ':' + id)}
            {@const c = db.card(id)}
            <button type="button" class="tile" draggable="true" title={c?.name}
              onmouseenter={() => (hover = id)} onmouseleave={() => (hover = 0)} onfocus={() => (pinned = id)} onclick={() => (pinned = id)}
              ondblclick={e => (e.shiftKey ? swap(id, key) : take(id, key))}
              oncontextmenu={e => { e.preventDefault(); e.shiftKey ? swap(id, key) : take(id, key); }}
              ondragstart={e => dragStart(e, id, key)} onkeydown={e => deckKey(e, id, key)}>
              {@render face(id)}
            </button>
          {:else}
            <p class="none">{key === 'main' ? 'Add 40 to 60 cards from the trunk.' : key === 'extra' ? 'Fusion monsters go here.' : 'Up to 15 cards to switch in between duels.'}</p>
          {/each}
        </div>
      </div>
    {/each}
    {#if counts.missing}<p class="missing">{counts.missing} card{counts.missing > 1 ? 's' : ''} in this deck aren't in your trunk.</p>{/if}
  </section>

  <!-- the trunk -->
  <section class="mu-plate pool" class:over={over === 'pool'} {...dropZone('pool')} aria-label="Trunk">
    <div class="find">
      <div class="search">
        <Icon name="search" size={16} />
        <input bind:this={search} bind:value={q} type="search" placeholder="Search names and card text" aria-label="Search the trunk" autocomplete="off" spellcheck="false" />
        <kbd>/</kbd>
      </div>
      <div class="seg" role="radiogroup" aria-label="Card type">
        {#each TYPES as [k, l] (k)}<button type="button" role="radio" aria-checked={f.type === k} class:on={f.type === k} onclick={() => (f.type = k)}>{l}</button>{/each}
      </div>
      <div class="chips" role="group" aria-label="Attribute">
        {#each attrs as [a, l] (a)}<button type="button" class:on={f.attr.includes(a)} aria-pressed={f.attr.includes(a)} onclick={() => toggleAttr(a)}>{l}</button>{/each}
      </div>
      <div class="ranges">
        <label>Level <select bind:value={f.level[0]} aria-label="Lowest level">{#each Array(13) as _, i}<option value={i}>{i || 'Any'}</option>{/each}</select>
          – <select bind:value={f.level[1]} aria-label="Highest level">{#each Array(13) as _, i}<option value={12 - i}>{12 - i === 12 ? 'Any' : 12 - i}</option>{/each}</select></label>
        <label class="sort">Sort <select bind:value={f.sort}>{#each SORTS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
      </div>
      <div class="ranges">
        <label>ATK <input inputmode="numeric" placeholder="min" bind:value={f.atk[0]} aria-label="Lowest ATK" />–<input inputmode="numeric" placeholder="max" bind:value={f.atk[1]} aria-label="Highest ATK" /></label>
        <label>DEF <input inputmode="numeric" placeholder="min" bind:value={f.def[0]} aria-label="Lowest DEF" />–<input inputmode="numeric" placeholder="max" bind:value={f.def[1]} aria-label="Highest DEF" /></label>
      </div>
      <div class="foot">
        <label class="own"><input type="checkbox" checked={!f.owned} onchange={e => (f.owned = !e.currentTarget.checked)} /> Cards I don't have</label>
        {#if filtered || q}<button type="button" class="clear" onclick={reset}>Clear filters</button>{/if}
        <span class="n">{pool.length.toLocaleString()} card{pool.length === 1 ? '' : 's'}</span>
      </div>
    </div>
    <div class="cards mu-scroll" role="list">
      {#each pool as c (c.id)}
        {@const why = blocked(c, home(c), { inDeck: inDeck.get(c.id) || 0, left: left(c.id), counts })}
        <div role="listitem">
          <button type="button" class="card" class:dim={!!why} draggable={!why} title="{c.name}{why ? ' — ' + why : ''}"
            onmouseenter={() => (hover = c.id)} onmouseleave={() => (hover = 0)} onfocus={() => (pinned = c.id)} onclick={() => (pinned = c.id)}
            ondblclick={e => put(c, e.shiftKey && !isFusion(c) ? 'side' : home(c))}
            oncontextmenu={e => { e.preventDefault(); put(c, e.shiftKey && !isFusion(c) ? 'side' : home(c)); }}
            ondragstart={e => dragStart(e, c.id, 'pool')} onkeydown={e => poolKey(e, c)}>
            {@render face(c.id)}
            <span class="have" title="Copies in your trunk">×{left(c.id)}</span>
            {#if inDeck.get(c.id)}<span class="used" title="Copies in the deck">{inDeck.get(c.id)}</span>{/if}
            {#if c.limit < 3}<span class="lim l{c.limit}">{c.limit === 0 ? 'Forbidden' : 'Limit ' + c.limit}</span>{/if}
          </button>
        </div>
      {:else}
        <div class="empty-pool">
          <p>No cards match{q ? ` “${q}”` : ''}.</p>
          {#if filtered || q}<button type="button" class="mu-btn" onclick={reset}>Clear filters</button>{/if}
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  :global(html.mu-deck-driving .win:is([data-cls=CWindowModelFileList], [data-cls=CWindowModelDialogYesNo])) { visibility: hidden !important; }
  .ed { position: absolute; width: 1024px; height: 736px; overflow: hidden; pointer-events: auto;
    background: repeating-linear-gradient(90deg, rgba(255, 255, 255, .28) 0 1px, transparent 1px 3px),
      linear-gradient(180deg, #f6f9fc 0%, #dfe7f0 45%, #c7d3e1 100%); }
  .ed.waiting::after { content: ''; position: absolute; inset: 0; background: rgba(4, 17, 43, .35); }
  .veil { position: absolute; left: 50%; top: 50%; z-index: 3; display: flex; align-items: center; gap: 10px; transform: translate(-50%, -50%);
    height: 44px; padding: 0 20px; border-radius: 22px; font-size: 14px; font-weight: 800; color: #fff; text-shadow: 0 1px 0 #0e3a9a;
    background: var(--sel); box-shadow: 0 0 0 1px #fff, 0 12px 28px -8px rgba(0, 20, 80, .7); }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid rgba(255, 255, 255, .35); border-top-color: #fff; animation: ed-spin .8s linear infinite; }
  @keyframes ed-spin { to { transform: rotate(360deg); } }

  /* the bar */
  .bar { position: absolute; left: 0; top: 0; right: 0; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 14px;
    background: linear-gradient(180deg, #4a96f0 0%, #2b7ee8 22%, #1f6fe0 50%, #1a5fd6 62%, #1650c8 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), inset 0 -1px 0 #1240a8, 0 2px 8px rgba(10, 60, 130, .3); z-index: 2; }
  .word { margin: 0; font-size: 22px; font-weight: 900; font-style: italic; letter-spacing: .02em; text-transform: uppercase; color: #fff; white-space: nowrap;
    text-shadow: -1.5px 0 #0a3fc8, 1.5px 0 #0a3fc8, 0 -1.5px #0a3fc8, 0 1.5px #0a3fc8, 0 2px 6px rgba(0, 30, 120, .5); }
  .file { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 170px; height: 28px; padding: 0 12px; border-radius: 14px;
    background: rgba(4, 30, 100, .35); box-shadow: inset 0 1px 2px rgba(0, 0, 40, .35); color: #fff; font-weight: 700; }
  .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold-300); box-shadow: 0 0 0 1px var(--gold-edge); flex: none; }
  .check { display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px 0 6px; border-radius: 12px; font-size: 12px; font-weight: 800; white-space: nowrap;
    color: var(--gold-ink); background: linear-gradient(180deg, #ffffc8, #f4d558); box-shadow: 0 0 0 1px var(--gold-edge); }
  .check svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .check.ok { color: #fff; background: linear-gradient(180deg, #2fb45a, #0b7a2a); box-shadow: 0 0 0 1px #08561d; text-shadow: 0 1px 0 #064a18; }
  .status { flex: 1; min-width: 0; color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 0 #0e3a9a; }
  .status.bad { color: #ffe08a; }
  .acts { display: flex; align-items: center; gap: 6px; }
  .acts .mu-btn { height: 30px; padding: 0 11px; font-size: 12px; }
  .sep { width: 1px; height: 22px; background: rgba(255, 255, 255, .35); margin: 0 2px; }
  .exit { color: #fff; }
  .exit:hover { background: rgba(255, 255, 255, .22); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .6); color: #fff; }
  .as { position: relative; }
  .pop { position: absolute; right: 0; top: 40px; width: 250px; padding: 14px; display: grid; gap: 8px; z-index: 5; }
  .pop label { font-size: 12px; font-weight: 700; color: var(--ink-2); }
  .pop input, .search input, .ranges input, select { font: inherit; color: var(--ink-strong); border: 0; border-radius: var(--r-row); background: var(--well); box-shadow: var(--well-shadow); }
  .pop input { height: 32px; padding: 0 10px; font-size: 14px; }
  .picker { right: 12px; left: auto; top: 56px; width: 300px; position: absolute; }
  .picker h2 { margin: 0; font-size: 14px; font-weight: 800; color: var(--ink-strong); }
  .picker .rows { display: grid; gap: 2px; max-height: 320px; padding: 4px; border-radius: var(--r-row); background: var(--well); box-shadow: var(--well-shadow); }
  .picker .rows button { height: 30px; padding: 0 10px; border-radius: 6px; font-weight: 700; color: var(--ink-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .picker .rows button:hover, .picker .rows button:focus-visible { color: #fff; background: var(--sel); outline: none; }
  .picker .rows button.cur::after { content: ' · open now'; font-weight: 600; opacity: .7; }
  .picker .none { margin: 0; font-size: 12px; color: var(--ink-3); }
  .pop small { font-size: 11px; color: var(--ink-3); }
  .pop .row { display: flex; justify-content: flex-end; gap: 8px; }

  /* the three plates */
  .preview { left: 8px; top: 60px; width: 236px; height: 644px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .deck { left: 252px; top: 60px; width: 392px; height: 644px; padding: 8px 6px 8px; display: flex; flex-direction: column; gap: 6px; }
  .pool { left: 652px; top: 60px; width: 364px; height: 644px; padding: 10px 6px 0 10px; display: flex; flex-direction: column; }

  /* the card shown large */
  .big { width: 216px; height: 313px; flex: none; border-radius: 6px; overflow: hidden; background: #2a3a58;
    box-shadow: 0 0 0 1px rgba(11, 42, 92, .35), 0 10px 22px -10px rgba(10, 40, 100, .7); }
  .big .face { width: 100%; height: 100%; }
  .big.empty { background: radial-gradient(circle at 50% 42%, #4a96f0, #1650c8 70%, #0e3a9a); box-shadow: inset 0 0 0 4px rgba(255, 255, 255, .18), 0 0 0 1px rgba(11, 42, 92, .35); }
  .big.empty svg { width: 100%; height: 100%; fill: none; stroke: rgba(255, 255, 255, .28); stroke-width: 3; }
  .preview h2 { margin: 4px 0 0; font-size: 15px; font-weight: 800; line-height: 1.2; color: var(--ink-strong); }
  .kind { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
  .pw { margin: 0; display: flex; gap: 14px; font-size: 12px; color: var(--ink-2); }
  .pw b { font-size: 14px; color: var(--ink-strong); }
  .text { flex: 1; min-height: 0; padding: 7px 9px; border-radius: var(--r-row); background: var(--well); box-shadow: var(--well-shadow);
    font-size: 12px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; overflow-wrap: break-word; }
  .preview .own { margin: 0; font-size: 11.5px; color: var(--ink-3); }
  .preview .own b { color: var(--ink-strong); }
  .preview .own em { font-style: normal; font-weight: 800; color: var(--bad); }
  .hint { margin: 6px 0 0; font-weight: 700; color: var(--ink-2); }
  .keys { margin: 0; padding: 0 0 0 16px; display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); }
  kbd { font: inherit; font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 4px; color: var(--ink-strong); background: #fff;
    box-shadow: inset 0 -1px 0 rgba(11, 42, 92, .25), 0 0 0 1px rgba(65, 171, 239, .6); white-space: nowrap; }

  /* the deck's sections: the 2008 headers' colours (Deck green, Fusion violet, Side green) */
  .sec { display: flex; flex-direction: column; min-height: 0; border-radius: 10px; padding: 4px 4px 4px; transition: background .14s, box-shadow .14s; }
  .sec.main { flex: 1; }
  .sec.over { background: rgba(0, 180, 255, .14); box-shadow: inset 0 0 0 2px var(--azure-400); }
  .sec h3 { margin: 0 0 4px; display: flex; align-items: baseline; gap: 8px; font-size: 15px; font-weight: 900; font-style: italic; letter-spacing: .01em; }
  .sec h3 span { color: #0b8a2a; }
  .sec.extra h3 span { color: #7a2bc4; }
  .sec h3 b { font-style: normal; font-size: 14px; color: var(--ink-strong); }
  .sec h3 b.bad { color: var(--bad); }
  .sec h3 small { font-style: normal; font-size: 11px; font-weight: 700; color: var(--ink-3); }
  .grid { display: grid; grid-template-columns: repeat(10, 33px); grid-auto-rows: 48px; gap: 3px; align-content: start; min-height: 101px; flex: 1;
    padding: 4px; border-radius: 8px; background: rgba(11, 42, 92, .08); box-shadow: inset 0 1px 3px rgba(11, 42, 92, .2); }
  .sec.extra .grid, .sec.side .grid { flex: none; height: 107px; }
  .tile { position: relative; width: 33px; height: 48px; border-radius: 3px; overflow: hidden; background: #2a3a58; cursor: grab;
    box-shadow: 0 1px 2px rgba(0, 0, 40, .4); transition: transform .14s var(--ease), box-shadow .14s; }
  .tile:hover, .tile:focus-visible { transform: translateY(-2px) scale(1.06); box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--azure-400), 0 6px 12px -4px rgba(0, 40, 120, .6); z-index: 1; }
  .face { display: block; width: 100%; height: 100%; object-fit: cover; }
  .none { grid-column: 1 / -1; margin: 0; align-self: center; text-align: center; font-size: 12px; color: var(--ink-3); }
  .missing { margin: 0; font-size: 12px; font-weight: 700; color: var(--bad); }

  /* the trunk: search and filters always in view, then the grid of cards */
  .find { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; padding: 0 4px 8px 0; border-bottom: 1px solid rgba(65, 171, 239, .45); }
  .search { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 6px 0 10px; border-radius: var(--r-ctl); background: var(--well); box-shadow: var(--well-shadow); color: var(--ink-3); }
  .search:focus-within { box-shadow: var(--well-shadow), 0 0 0 2px var(--azure-500); }
  .search input { flex: 1; min-width: 0; height: 100%; padding: 0; background: none; box-shadow: none; font-size: 13.5px; }
  .search input:focus-visible { outline: none; }
  .search input::placeholder, .ranges input::placeholder { color: var(--ink-3); }
  .seg { display: flex; padding: 2px; gap: 2px; border-radius: 9px; background: rgba(11, 42, 92, .1); box-shadow: inset 0 1px 2px rgba(11, 42, 92, .2); }
  .seg button { flex: 1; height: 24px; border-radius: 7px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); text-align: center; transition: background .14s, color .14s; }
  .seg button:hover { background: rgba(255, 255, 255, .6); color: var(--ink-strong); }
  .seg button.on { color: #fff; background: var(--sel); box-shadow: 0 1px 3px rgba(10, 60, 130, .4); text-shadow: 0 1px 0 #0e3a9a; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { height: 22px; padding: 0 9px; border-radius: 11px; font-size: 11px; font-weight: 700; color: var(--ink-2); background: rgba(255, 255, 255, .7);
    box-shadow: inset 0 0 0 1px rgba(65, 171, 239, .6); transition: background .14s, color .14s; }
  .chips button:hover { background: #fff; color: var(--ink-strong); }
  .chips button.on { color: var(--gold-ink); background: linear-gradient(180deg, #ffffc8, #f4d558); box-shadow: inset 0 0 0 1px var(--gold-edge); }
  .ranges { display: flex; gap: 14px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
  .ranges label { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
  .ranges input { width: 52px; height: 24px; padding: 0 5px; font-size: 12px; }
  select { height: 24px; padding: 0 4px; font-size: 12px; }
  .ranges .sort { margin-left: auto; }
  .foot { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--ink-2); font-weight: 700; }
  .foot .own { display: flex; align-items: center; gap: 4px; font-weight: 600; }
  .foot .own input { accent-color: var(--brand); margin: 0; }
  .foot .n { margin-left: auto; color: var(--ink-3); }
  .clear { color: var(--link); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .cards { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 80px); grid-auto-rows: 116px; gap: 8px 7px; align-content: start; padding: 10px 4px 12px 1px; }
  .card { position: relative; width: 80px; height: 116px; border-radius: 5px; overflow: hidden; background: #2a3a58; cursor: grab;
    box-shadow: 0 1px 2px rgba(0, 0, 40, .35), 0 4px 8px -4px rgba(0, 30, 90, .5); transition: transform .14s var(--ease), box-shadow .14s, filter .14s; }
  .card:hover, .card:focus-visible { transform: translateY(-3px); box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--azure-400), 0 10px 18px -6px rgba(0, 40, 120, .6); z-index: 1; }
  .card.dim { cursor: default; }
  .card.dim .face { filter: grayscale(.85) brightness(.75); }
  .have, .used, .lim { position: absolute; font-size: 10.5px; font-weight: 800; line-height: 16px; height: 16px; padding: 0 5px; border-radius: 8px; }
  .have { right: 3px; bottom: 3px; color: #fff; background: rgba(4, 17, 43, .78); }
  .used { left: 3px; bottom: 3px; color: #fff; background: var(--sel); box-shadow: 0 0 0 1px #fff; }
  .lim { left: 3px; top: 3px; color: #fff; background: var(--bad); box-shadow: 0 0 0 1px #fff; }
  .lim.l2 { color: var(--gold-ink); background: var(--gold-400); box-shadow: 0 0 0 1px var(--gold-edge); }
  .pool.over .cards { background: rgba(0, 180, 255, .1); }
  .empty-pool { grid-column: 1 / -1; display: grid; justify-items: center; gap: 10px; padding: 40px 0; color: var(--ink-2); font-weight: 700; }
  .empty-pool p { margin: 0; }
</style>
