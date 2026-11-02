<script>
  // The modern deck editor (owned: the DOM takes the input), over the whole Edit Deck scene: the card shown large on the
  // left, the deck in the middle (Main, Fusion, Side), the trunk on the right as a grid of full cards with its filters
  // always in view. Every change is the engine's own (engine.js: its drag and drop, side buttons, file list); what shows
  // is the snapshot's deck (CWindowTaskDeck grids, read/deck.js) and the trunk's counts (yo2Deck.trunk).
  import { deckCheck } from '../logic.js';
  import Icon from '../Icon.svelte';
  import GameButton from '../game/GameButton.svelte';
  import GamePanel from '../game/GamePanel.svelte';
  import GameTabs from '../game/GameTabs.svelte';
  import { picture, cached } from './pictures.js';
  import * as E from './engine.js';
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { NO_FILTER, TYPES, SORTS, SECTIONS, view as poolView, copies, blocked, home, group, typeLine, isFusion, trunkCard } from './editor.js';
  let { view } = $props();

  // the card data (read/deck.js yo2Deck) can arrive after the editor opens, and the trunk's counts change with no deck
  // window change (its own snapshot): a tick follows the reader's version until the cards are in
  let tick = $state(0), seenV = -1;
  $effect(() => {
    const t = setInterval(() => { const d = globalThis.yo2Deck; if (d && (d.v !== seenV || !d.cards())) { seenV = d.v; tick++; } }, 250);
    return () => clearInterval(t);
  });
  const db = $derived((tick, globalThis.yo2Deck));
  const win = $derived(view.win);
  const all = $derived((win, tick, db?.cards?.() || []));
  const deck = $derived(win.controls.find(c => c.cls === 'CWindowTaskDeck'));
  const grids = $derived(deck?.grids || { main: [], side: [], extra: [] });
  const counts = $derived(deck?.counts || { main: 0, side: 0, extra: 0, missing: 0 });
  const check = $derived(deckCheck(counts));
  const inDeck = $derived(copies(grids));
  const trunk = $derived((win, tick, new Map(db?.trunk || [])));
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
  // the cards the player has: copies left in the trunk or in the deck (the legacy trunk lists both)
  const pool = $derived(poolView(all, { ...f, attr: [...f.attr], level: [...f.level], atk: [...f.atk], def: [...f.def] }, id => left(id) + (inDeck.get(id) || 0), db?.desc));
  const filtered = $derived(f.type !== 'all' || f.attr.length || f.level[0] > 0 || f.level[1] < 12 || f.atk.some(v => v !== '') || f.def.some(v => v !== '') || !f.owned);
  // the filters (not the search) behind one button; its badge counts those set, so nothing is hidden
  let filtersOpen = $state(false), filtersBtn = $state(null), filtersPanel = $state(null);
  const active = $derived((f.type !== 'all') + f.attr.length + (f.level[0] > 0 || f.level[1] < 12) + f.atk.some(v => v !== '') + f.def.some(v => v !== '') + !f.owned);
  $effect(() => {
    if (!filtersOpen) return;
    const off = e => { if (!filtersPanel?.contains(e.target) && !filtersBtn?.contains(e.target)) filtersOpen = false; };
    addEventListener('pointerdown', off, true);
    return () => removeEventListener('pointerdown', off, true);
  });
  const reset = () => { f = structuredClone(NO_FILTER); q = ''; };
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
  // why a card can't go from `from` to `to` ('pool' the trunk; '' when it can, 'same' for no move)
  function why(id, from, to) {
    if (!to || from === to) return 'same';
    if (from === 'pool') return blocked(db.card(id), to, { inDeck: inDeck.get(id) || 0, left: left(id), counts });
    if (to === 'pool') return '';
    if (from === 'extra' || to === 'extra') return 'Fusion monsters stay in the Fusion Deck';
    if (counts[to] >= (to === 'side' ? 15 : 80)) return `The ${to === 'side' ? 'Side' : 'Main'} Deck is full`;
    return '';
  }
  // the one move, the engine's own (deck/engine.js: added from the trunk, taken out, Main <-> Side); resolves true once done
  function act(id, from, to) {
    const no = why(id, from, to), c = db.card(id);
    if (no) { if (no !== 'same') say(`${c?.name}: ${no}`, true); return Promise.resolve(false); }
    if (from === 'pool') return run(E.add(c, to), `${c.name} could not be added`);
    return run(E.move(id, from, to === 'pool' ? null : to), to === 'pool' ? 'The card could not be taken out' : 'The card could not be moved');
  }
  const put = (c, to = home(c)) => act(c.id, 'pool', to);
  const take = (id, from) => act(id, from, 'pool');
  const swap = (id, from) => act(id, from, from === 'main' ? 'side' : 'main');

  // ---- drag and drop: the card itself lifts and follows the pointer, the section under it lights (red where it can't
  // go); let go, it flies to its place in that grid while the engine moves it, or back where it came from. The grids
  // reflow by FLIP (animate:flip), a new card scales in, a last copy out.
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = n => (still ? 0 : n);
  let ed = $state(null), lift = $state(null), press = null;
  const local = (cx, cy) => { const r = ed.getBoundingClientRect(), k = r.width / 1024; return [(cx - r.left) / k, (cy - r.top) / k]; };
  const rectOf = el => { const r = el.getBoundingClientRect(), b = ed.getBoundingClientRect(), k = b.width / 1024;
    return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k }; };
  const zoneAt = (cx, cy) => document.elementFromPoint(cx, cy)?.closest('[data-zone]')?.dataset.zone || '';
  const wait = n => new Promise(r => setTimeout(r, n));
  function down(e, id, from, tile = '') {
    if (e.button !== 0 || lift || (from === 'pool' && left(id) <= 0)) return;   // a used-up trunk card stays put
    press = { id, from, tile, cx: e.clientX, cy: e.clientY, el: e.currentTarget };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
    addEventListener('pointercancel', up, { once: true });
  }
  function move(e) {
    if (!press) return;
    if (!lift) {
      if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) < 5) return;
      const r = rectOf(press.el), [px, py] = local(press.cx, press.cy);
      lift = { id: press.id, from: press.from, tile: press.tile, src: r, dx: px - r.x, dy: py - r.y, ...r, zone: '', no: '', state: 'drag' };
    }
    const [x, y] = local(e.clientX, e.clientY), z = zoneAt(e.clientX, e.clientY);
    lift.x = x - lift.dx;
    lift.y = y - lift.dy;
    if (z !== lift.zone) { lift.zone = z; lift.no = why(lift.id, lift.from, z); }
  }
  // the card's place in section `to` ('pool' the trunk): its tile there, else the next cell after the last tile
  function landing(id, to) {
    const zone = ed.querySelector(`[data-zone="${to}"]`);
    const el = [...(zone?.querySelectorAll(`[data-card="${id}"]`) || [])].at(-1);   // a new copy lands after the others
    if (el) return rectOf(el);
    if (to === 'pool' || !zone) { const r = rectOf(zone || ed); return { x: r.x + r.w / 2 - TW / 2, y: r.y + r.h / 2 - TH / 2, w: TW, h: TH }; }
    const g = rectOf(zone.querySelector('.grid')), tiles = zone.querySelectorAll('.tile');
    if (!tiles.length) return { x: g.x + 6, y: g.y + 6, w: TW, h: TH };
    const t = rectOf(tiles[tiles.length - 1]);
    return t.x + 2 * t.w + 4 > g.x + g.w ? { x: g.x + 6, y: t.y + t.h + 4, w: t.w, h: t.h } : { x: t.x + t.w + 4, y: t.y, w: t.w, h: t.h };
  }
  async function fly(r, state = 'fly', time = 220) {
    if (!lift) return;
    Object.assign(lift, { state, x: r.x, y: r.y, w: r.w, h: r.h });
    await wait(ms(time) + 20);
  }
  async function up() {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    press = null;
    const L = lift;
    if (!L || L.state !== 'drag') return;
    const to = L.zone;
    if (!to || to === L.from || L.no) {   // back where it came from (and why not, when it says)
      if (L.no && L.no !== 'same') say(`${db.card(L.id)?.name}: ${L.no}`, true);
      await fly(L.src, 'back');
      lift = null;
      return;
    }
    const done = act(L.id, L.from, to);
    await fly(landing(L.id, to));
    lift.state = 'wait';
    const ok = await done;
    // the engine's own result: onto the real tile (the grid may have sorted it elsewhere), or back
    await fly(ok ? landing(L.id, to) : L.src, ok ? 'settle' : 'back', 160);
    lift = null;
  }
  // the deck's grids never scroll: ten tiles a row in a fixed height (Main 4 rows, Fusion and Side 2); past that the
  // rows overlap, each showing the top of its cards (name and art), so 60 cards still fit
  const TW = 36, TH = 53, GAP = 3, ROWS = { main: 4, extra: 2, side: 2 };
  const step = (key, n) => {
    const rows = Math.max(1, Math.ceil(n / 10)), room = ROWS[key] * TH + (ROWS[key] - 1) * GAP;
    return rows <= ROWS[key] ? TH + GAP : (room - TH) / (rows - 1);
  };
  // a section's cards: every copy its own tile, in the order the deck holds them (owner: duplicates side by side, as
  // the original and EDOPro); a copy's key is its card and which copy it is, so the grid's FLIP follows each one
  const copiesOf = key => { const seen = new Map(); return (grids[key] || []).map(id => { const k = seen.get(id) || 0; seen.set(id, k + 1); return { id, key: id + '#' + k }; }); };

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
      else if (e.key === 'Escape' && filtersOpen) { filtersOpen = false; filtersBtn?.focus(); }
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

<div class="mu ed" bind:this={ed} class:dragging={lift?.state === 'drag'} style:left="{-win.x}px" style:top="{-win.y}px" style:clip-path={holes} class:waiting={dialogs.length} aria-busy={busy > 0}>
  {#if busy && dialogs.length}<div class="veil" role="status"><span class="spin" aria-hidden="true"></span>{saving ? 'Saving…' : 'Working…'}</div>{/if}
  <!-- the bar: the screen's name, the deck's, its check, the file actions -->
  <header class="mu-head bar">
    <h1 class="word">Edit Deck</h1>
    <div class="file">
      <span class="fname" title="The deck file being edited">{name || 'Untitled deck'}</span>
      {#if dirty}<span class="dot" title="Changed since it was saved"></span>{/if}
    </div>
    <div class="check" class:ok={check?.ok} title={check?.parts.map(p => `${p.label} ${p.n} (${p.rule})`).join(' · ')}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{#if check?.ok}<path d="M5 10.5l3.2 3.2L15 7" />{:else}<path d="M10 5.5v5.5M10 14.2v.3" />{/if}</svg>
      {check?.ok ? 'Ready to duel' : 'Not legal yet'}
    </div>
    <span class="status" role="status" aria-live="polite" title={note}>{#if note}<span class:bad={noteBad}>{note}</span>{:else if busy}Working…{/if}</span>
    <nav class="acts" aria-label="Deck files">
      <GameButton label="Load" onclick={() => openPicker('load')} aria-expanded={picker?.kind === 'load'} title="Load a saved deck (Ctrl+O)" />
      <GameButton label="Structure Deck" onclick={() => openPicker('recipe')} aria-expanded={picker?.kind === 'recipe'} title="Start from a Structure Deck" />
      <GameButton label="Clear" onclick={() => sideBtn('ClearBtn')} title="Empty the deck" />
      <span class="sep"></span>
      <div class="as">
        <GameButton label="Save As…" onclick={openAs} aria-expanded={asOpen} title="Save under a new name (Ctrl+Shift+S)" />
        {#if asOpen}
          <GamePanel title="Save As" class="pop" role="dialog" onclose={() => (asOpen = false)}>
            <form class="body" onsubmit={e => { e.preventDefault(); save(asName); }}>
              <label for="ed-as">Deck name</label>
              <input id="ed-as" class="mu-field" bind:this={asField} bind:value={asName} oninput={() => (asName = cleanName(asName))} maxlength="20" autocomplete="off" spellcheck="false" aria-describedby="ed-as-hint" />
              <small id="ed-as-hint">Letters and numbers. A deck of the same name is replaced.</small>
              <div class="row"><GameButton label="Cancel" onclick={() => (asOpen = false)} /><GameButton type="submit" gold label="Save" disabled={!asName.trim()} /></div>
            </form>
          </GamePanel>
        {/if}
      </div>
      <GameButton gold onclick={() => save()} title="Save (Ctrl+S)">{#snippet icon()}<Icon name="log" size={15} />{/snippet}Save</GameButton>
      <button type="button" class="mu-icon-btn exit" onclick={() => sideBtn('ExitBtn')} title="Leave the deck editor" aria-label="Exit"><Icon name="exit" /></button>
    </nav>
  </header>

  {#if picker}
    <GamePanel title={PICK[picker.kind][1]} class="pop picker" role="dialog" onclose={unpick}>
      <div class="body">
        {#if picker.names.length}
          <div class="rows mu-list mu-scroll" bind:this={pickList}>
            {#each picker.names as n, i (i)}<button type="button" class="mu-row" class:cur={picker.kind === 'load' && n === name} onclick={() => pick(i)}>{n}</button>{/each}
          </div>
        {:else}<p class="none">{PICK[picker.kind][2]}</p>{/if}
        <div class="row"><GameButton label="Cancel" onclick={unpick} /></div>
      </div>
    </GamePanel>
  {/if}

  <!-- the card shown large -->
  <GamePanel title="Card" class="preview" role="region"><div class="body">
    {#if shown}
      <div class="big">{@render face(shown.id)}</div>
      <h2 class="preview-name">{shown.name}</h2>
      <p class="kind">
        {#if group(shown) === 'monster'}<span>{attrName(shown)}</span><span class="stars" aria-label="Level {shown.level}">Level {shown.level}</span><span>{raceName(shown)}</span>{/if}
        <span>{typeLine(shown)}</span>
      </p>
      {#if group(shown) === 'monster'}<p class="pw"><span>ATK <b>{stat(shown.atk)}</b></span><span>DEF <b>{stat(shown.def)}</b></span></p>{/if}
      <div class="text mu-list mu-scroll">{text}</div>
      <p class="owned">In deck <b>{inDeck.get(shown.id) || 0}</b> · in trunk <b>{left(shown.id)}</b>{#if limitTag(shown)} · <em>{limitTag(shown)} {shown.limit}</em>{/if}</p>
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
  </div></GamePanel>

  <!-- the deck -->
  <GamePanel title="Deck" class="deck" role="region"><div class="body">
    {#each SECTIONS as [key, title, cap] (key)}
      {@const part = check?.parts.find(p => p.key === key)}
      {@const gs = copiesOf(key)}
      <div class="sec {key}" class:over={lift && lift.zone === key && !lift.no} class:refuse={lift && lift.zone === key && lift.no && lift.no !== 'same'} data-zone={key} role="group" aria-label={title}>
        <h3><span>{title}</span><b class:bad={part && !part.ok}>{counts[key]}</b>{#if part}<small>{part.rule}</small>{/if}</h3>
        <div class="grid mu-list" class:tight={step(key, gs.length) < TH + GAP} style:grid-auto-rows="{step(key, gs.length)}px" style:--step="{step(key, gs.length)}px">
          {#each gs as g (g.key)}
            {@const id = g.id}
            {@const c = db.card(id)}
            <button type="button" class="tile" class:lifted={lift?.tile === g.key && lift.from === key} data-card={id} title={c?.name}
              animate:flip={{ duration: ms(240), easing: cubicOut }} in:scale={{ duration: ms(200), start: 0.6, easing: cubicOut }} out:scale={{ duration: ms(160), start: 0.6 }}
              onpointerdown={e => down(e, id, key, g.key)}
              onmouseenter={() => (hover = id)} onmouseleave={() => (hover = 0)} onfocus={() => (pinned = id)} onclick={() => (pinned = id)}
              ondblclick={e => (e.shiftKey ? swap(id, key) : take(id, key))}
              oncontextmenu={e => { e.preventDefault(); e.shiftKey ? swap(id, key) : take(id, key); }}
              onkeydown={e => deckKey(e, id, key)}>
              {@render face(id)}
            </button>
          {:else}
            <p class="none">{key === 'main' ? 'Add 40 to 60 cards from the trunk.' : key === 'extra' ? 'Fusion monsters go here.' : 'Up to 15 cards to switch in between duels.'}</p>
          {/each}
        </div>
      </div>
    {/each}
    {#if counts.missing}<p class="missing">{counts.missing} card{counts.missing > 1 ? 's' : ''} in this deck aren't in your trunk.</p>{/if}
  </div></GamePanel>

  <!-- the trunk -->
  <GamePanel title="Trunk" class="pool{lift && lift.zone === 'pool' && lift.from !== 'pool' ? ' over' : ''}" role="region"><div class="body" data-zone="pool">
    <div class="find">
      <div class="search-row">
        <div class="search">
          <Icon name="search" size={16} />
          <input class="mu-field" bind:this={search} bind:value={q} type="search" placeholder="Search cards" aria-label="Search the trunk" autocomplete="off" spellcheck="false" />
          <kbd>/</kbd>
        </div>
        <button type="button" class="mu-btn filters-btn" class:on={filtersOpen} aria-expanded={filtersOpen} aria-controls="ed-filters" bind:this={filtersBtn}
          onclick={() => (filtersOpen = !filtersOpen)} title="Type, attribute, level, ATK / DEF, sort">
          Filters{#if active}<b class="badge" aria-label="{active} active">{active}</b>{/if}
        </button>
      </div>
      <div class="summary">
        <span class="total">{pool.length.toLocaleString()} card{pool.length === 1 ? '' : 's'}</span>
        {#if filtered || q}<button type="button" class="clear" onclick={reset}>Clear filters</button>{/if}
      </div>
      {#if filtersOpen}
      <div class="mu-plate filters" id="ed-filters" role="dialog" aria-label="Filters" bind:this={filtersPanel} transition:scale={{ duration: ms(140), start: 0.96, easing: cubicOut }}
        onkeydown={e => { if (e.key === 'Escape') { e.stopPropagation(); filtersOpen = false; filtersBtn?.focus(); } }}>
      <GameTabs label="Card type" tabs={TYPES.map(([key, label]) => ({ key, label }))} value={f.type} onselect={k => (f.type = k)} />
      <div class="mu-tabs attrs" role="group" aria-label="Attribute">
        {#each attrs as [a, l] (a)}<button type="button" class="mu-tab" class:on={f.attr.includes(a)} aria-pressed={f.attr.includes(a)} onclick={() => toggleAttr(a)}>{l}</button>{/each}
      </div>
      <div class="ranges">
        <label>Level <select class="mu-field" bind:value={f.level[0]} aria-label="Lowest level">{#each Array(13) as _, i}<option value={i}>{i || 'Any'}</option>{/each}</select>
          – <select class="mu-field" bind:value={f.level[1]} aria-label="Highest level">{#each Array(13) as _, i}<option value={12 - i}>{12 - i === 12 ? 'Any' : 12 - i}</option>{/each}</select></label>
        <label class="sort">Sort <select class="mu-field" bind:value={f.sort}>{#each SORTS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
      </div>
      <div class="ranges">
        <label>ATK <input class="mu-field" inputmode="numeric" placeholder="min" bind:value={f.atk[0]} aria-label="Lowest ATK" />–<input class="mu-field" inputmode="numeric" placeholder="max" bind:value={f.atk[1]} aria-label="Highest ATK" /></label>
        <label>DEF <input class="mu-field" inputmode="numeric" placeholder="min" bind:value={f.def[0]} aria-label="Lowest DEF" />–<input class="mu-field" inputmode="numeric" placeholder="max" bind:value={f.def[1]} aria-label="Highest DEF" /></label>
      </div>
      <div class="foot">
        <label class="own"><input type="checkbox" checked={!f.owned} onchange={e => (f.owned = !e.currentTarget.checked)} /> Cards I don't have</label>
        {#if filtered}<button type="button" class="clear" onclick={() => { const v = q; reset(); q = v; }}>Clear filters</button>{/if}
        <GameButton label="Done" onclick={() => { filtersOpen = false; filtersBtn?.focus(); }} />
      </div>
      </div>
      {/if}
    </div>
    <div class="cards mu-scroll" role="list">
      {#each pool as c (c.id)}
        {@const used = inDeck.get(c.id) || 0}
        {@const n = left(c.id)}
        {@const no = blocked(c, home(c), { inDeck: used, left: n, counts })}
        {@const tc = trunkCard(n, used)}
        <div role="listitem">
          <button type="button" class="card" class:notown={tc.notown} class:spent={tc.out} data-card={c.id} aria-disabled={tc.out || tc.notown}
            title="{c.name}: {tc.owned ? `${tc.n} of ${tc.owned} left to add${used ? `, ${used} in the deck` : ''}` : 'not in your trunk'}{no && n ? ' — ' + no : ''}"
            onpointerdown={e => down(e, c.id, 'pool')}
            onmouseenter={() => (hover = c.id)} onmouseleave={() => (hover = 0)} onfocus={() => (pinned = c.id)} onclick={() => (pinned = c.id)}
            ondblclick={e => put(c, e.shiftKey && !isFusion(c) ? 'side' : home(c))}
            oncontextmenu={e => { e.preventDefault(); put(c, e.shiftKey && !isFusion(c) ? 'side' : home(c)); }}
            onkeydown={e => poolKey(e, c)}>
            {@render face(c.id)}
            {#if tc.owned}<span class="n" class:out={tc.out}>×{tc.n}</span>{/if}
            {#if c.limit < 3}<span class="lim l{c.limit}">{c.limit === 0 ? 'Forbidden' : 'Limit ' + c.limit}</span>{/if}
          </button>
        </div>
      {:else}
        <div class="empty-pool">
          <p>{filtered || q ? `No cards match${q ? ` “${q}”` : ''}.` : 'No cards in your trunk yet.'}</p>
          {#if filtered || q}<GameButton label="Clear filters" onclick={reset} />{/if}
        </div>
      {/each}
    </div>
  </div></GamePanel>

  {#if lift}
    <div class="lift {lift.state}" class:no={lift.no && lift.no !== 'same' && lift.zone} style:left="{lift.x}px" style:top="{lift.y}px"
      style:width="{lift.w}px" style:height="{lift.h}px" aria-hidden="true"><img class="face" src={cached(lift.id)} alt="" draggable="false" /></div>
  {/if}
</div>

<style>
  :global(html.mu-deck-driving .win:is([data-cls=CWindowModelFileList], [data-cls=CWindowModelDialogYesNo])) { visibility: hidden !important; }
  .ed { position: absolute; width: 1024px; height: 736px; overflow: hidden; pointer-events: auto;
    background: var(--stage); }
  .ed.waiting::after { content: ''; position: absolute; inset: 0; background: color-mix(in srgb, var(--p900) 40%, transparent); }
  .veil { position: absolute; left: 50%; top: 50%; z-index: 3; display: flex; align-items: center; gap: 10px; transform: translate(-50%, -50%);
    height: 44px; padding: 0 20px; border-radius: 22px; font-size: 14px; font-weight: 800; color: var(--n0);
    background: var(--sel); box-shadow: 0 0 0 1px var(--n0), 0 12px 28px -8px color-mix(in srgb, var(--p900) 80%, transparent); }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid color-mix(in srgb, var(--n0) 35%, transparent); border-top-color: var(--n0); animation: ed-spin .8s linear infinite; }
  @keyframes ed-spin { to { transform: rotate(360deg); } }

  /* the bar */
  /* the shared title band (theme.js .mu-head: its palette), the full width */
  .bar { position: absolute; left: 0; top: 0; right: 0; height: 52px; gap: 12px; padding: 0 12px 0 14px; border-radius: 0; z-index: 2; }
  .file { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 210px; height: 28px; padding: 0 12px; border-radius: 14px;
    background: color-mix(in srgb, var(--p900) 45%, transparent); box-shadow: inset 0 1px 2px color-mix(in srgb, var(--p900) 50%, transparent); color: var(--n0); font-weight: 700; }
  .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--n0); box-shadow: 0 0 0 2px color-mix(in srgb, var(--n0) 35%, transparent); flex: none; }
  .check { display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px 0 6px; border-radius: 12px; font-size: 12px; font-weight: 800; white-space: nowrap;
    color: var(--warm); background: var(--n0); box-shadow: 0 0 0 1px var(--n300); }
  .check svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .check.ok { color: var(--n0); background: var(--ok); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink-strong) 25%, transparent), inset 0 1px 0 color-mix(in srgb, var(--n0) 30%, transparent); }
  .status { flex: 1; min-width: 0; color: var(--n0); font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status .bad { padding: 3px 9px; border-radius: 10px; background: var(--bad); box-shadow: 0 0 0 1px color-mix(in srgb, var(--n0) 40%, transparent); }
  .acts { display: flex; align-items: center; gap: 6px; }
  .sep { width: 1px; height: 22px; background: color-mix(in srgb, var(--n0) 35%, transparent); margin: 0 2px; }
  .exit { color: var(--n0); }
  .exit:hover { background: color-mix(in srgb, var(--n0) 22%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--n0) 60%, transparent); color: var(--n0); }
  .as { position: relative; }


  /* the shared pieces (theme.js Game UI), sized for the editor */
  .acts :global(.mu-btn) { height: 32px; padding: 0 12px; font-size: 12px; }
  .word { margin: 0; font-family: var(--display); font-size: 21px; font-weight: 400; letter-spacing: .07em; text-transform: uppercase; color: var(--n0); white-space: nowrap;
    text-shadow: 0 2px 8px color-mix(in srgb, var(--p900) 60%, transparent); }
  /* the panels (GamePanel): their places on the stage, a body under the plaque */
  .ed :global(.mu-plate) { position: absolute; display: flex; flex-direction: column; }
  .ed :global(.preview) { left: 8px; top: 58px; width: 205px; height: 648px; }
  .ed :global(.deck) { left: 219px; top: 58px; width: 429px; height: 648px; }
  .ed :global(.pool) { left: 654px; top: 58px; width: 362px; height: 648px; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 12px; }
    .ed :global(.pool .body) { padding: 8px 8px 0 12px; gap: 0; }
  .ed :global(.pool.over .cards) { background: color-mix(in srgb, var(--p500) 10%, transparent); }
  .ed :global(.pop) { right: 0; top: 44px; width: 280px; z-index: 5; }
  .ed :global(.picker) { right: 12px; top: 56px; width: 310px; }
  .ed :global(.pop .body) { gap: 8px; }
  .body > label { font-size: 12px; font-weight: 700; color: var(--ink-2); }
  .body > small { font-size: 11px; color: var(--ink-3); }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
  .rows { display: grid; max-height: 320px; padding: 4px 0; }
  .rows .mu-row { width: 100%; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rows .mu-row.cur::after { content: ' · open now'; font-weight: 600; opacity: .7; }
  .body > .none { margin: 0; font-size: 12px; color: var(--ink-3); }
  .preview-name { margin: 4px 0 0; font-size: 15px; font-weight: 800; line-height: 1.2; color: var(--ink-strong); }
  .text { flex: 1; min-height: 0; padding: 7px 9px; font-size: 12px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; overflow-wrap: break-word; }
  .sec h3 { margin: 0 0 5px; display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 400; }
  .sec h3 span { font-family: var(--display); letter-spacing: .07em; text-transform: uppercase; }
  .sec h3 b, .sec h3 small { font-family: inherit; }
  /* ten 36 x 53 tiles a row in a fixed height (step() sets the row step: overlapping rows past the room) */
  .grid { display: grid; grid-template-columns: repeat(10, 36px); column-gap: 3px; row-gap: 0; align-content: start; flex: none; height: 231px; padding: 5px; overflow: visible; }
  .find { position: relative; }
  .search-row { display: flex; gap: 6px; }
  .search { position: relative; flex: 1; min-width: 0; }
  .filters-btn { height: 32px; padding: 0 12px; font-size: 12px; gap: 6px; }
  .filters-btn.on { background: var(--btn-hover); box-shadow: 0 0 0 1px var(--p500), inset 0 1px 2px color-mix(in srgb, var(--ink-strong) 20%, transparent); }
  .badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 11px; font-weight: 800;
    color: var(--n0); background: var(--sel); box-shadow: 0 0 0 1px var(--n0); }
  .summary { display: flex; align-items: center; gap: 10px; min-height: 18px; font-size: 11.5px; font-weight: 700; color: var(--ink-3); }
  .summary .clear { margin-left: auto; }
  /* the filters: a panel over the trunk's cards (they never move), under the search row */
  .find :global(.filters) { left: -4px; right: -2px; top: 40px; z-index: 6; display: grid; gap: 8px; padding: 14px 14px 12px; }
  .foot :global(.mu-btn) { margin-left: auto; height: 28px; padding: 0 14px; font-size: 12px; }
  .search :global(.mu-ico) { position: absolute; left: 10px; top: 8px; color: var(--ink-3); pointer-events: none; }
  .search .mu-field { padding: 0 34px; }
  .search kbd { position: absolute; right: 8px; top: 7px; }
  .find :global(.mu-tab) { flex: 1 1 auto; min-width: 0; height: 26px; padding: 0 5px; font-size: 11.5px; letter-spacing: 0; text-align: center; }
  .attrs { flex-wrap: wrap; }
  .attrs .mu-tab { flex: 1 0 22%; height: 24px; font-size: 11px; }
  .ranges .mu-field { width: 54px; height: 26px; padding: 0 6px; font-size: 12px; }
  .ranges select.mu-field { width: auto; padding: 0 4px; }

  /* the card shown large */
  .big { width: 100%; aspect-ratio: 216 / 313; flex: none; border-radius: 6px; overflow: hidden; background: var(--p900);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink-strong) 35%, transparent), 0 10px 22px -10px color-mix(in srgb, var(--p900) 80%, transparent); }
  .big .face { width: 100%; height: 100%; }
  .big.empty { background: var(--stage); box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--n0) 18%, transparent), 0 0 0 1px color-mix(in srgb, var(--ink-strong) 35%, transparent); }
  .big.empty svg { width: 100%; height: 100%; fill: none; stroke: color-mix(in srgb, var(--n0) 28%, transparent); stroke-width: 3; }
  .kind { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
  .pw { margin: 0; display: flex; gap: 14px; font-size: 12px; color: var(--ink-2); }
  .pw b { font-size: 14px; color: var(--ink-strong); }
  .owned { margin: 0; font-size: 11.5px; color: var(--ink-3); }
  .owned b { color: var(--ink-strong); }
  .owned em { font-style: normal; font-weight: 800; color: var(--bad); }
  .hint { margin: 6px 0 0; font-weight: 700; color: var(--ink-2); }
  .keys { margin: 0; padding: 0 0 0 16px; display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); }
  kbd { font: inherit; font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 4px; color: var(--ink-strong); background: var(--n0);
    box-shadow: inset 0 -1px 0 var(--n300), 0 0 0 1px var(--n300); white-space: nowrap; }

  /* the deck's sections, their labels in the display face */
  .sec { display: flex; flex-direction: column; min-height: 0; border-radius: 10px; padding: 4px 4px 4px; transition: background .14s, box-shadow .14s; }
  .sec.over { background: color-mix(in srgb, var(--p500) 14%, transparent); box-shadow: inset 0 0 0 2px var(--p500); }
  .sec h3 span { color: var(--ink-strong); }
  .sec h3 b { font-size: 14px; color: var(--p700); }
  .sec h3 b.bad { color: var(--bad); }
  .sec h3 small { font-size: 11px; font-weight: 700; color: var(--ink-3); }
  .sec.extra .grid, .sec.side .grid { height: 119px; }
  .tile { position: relative; width: 36px; height: 53px; touch-action: none; border-radius: 3px; overflow: hidden; background: var(--p900); cursor: grab;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink-strong) 40%, transparent); transition: transform var(--release) var(--spring), box-shadow .14s; }
  /* a card under the press goes in at once and springs back (theme.js --press / --release / --spring, as .mu-btn) */
  .tile:active, .card:active { transition-duration: var(--press), .14s; transform: translateY(1px) scale(.96); }
  .tile:hover, .tile:focus-visible { transform: translateY(-2px) scale(1.06); box-shadow: 0 0 0 2px var(--n0), 0 0 0 4px var(--p500), 0 6px 12px -4px color-mix(in srgb, var(--p900) 60%, transparent); z-index: 1; }
  .face { display: block; width: 100%; height: 100%; object-fit: cover; }
  .none { grid-column: 1 / -1; margin: 0; align-self: center; text-align: center; font-size: 12px; color: var(--ink-3); }
  .missing { margin: 0; font-size: 12px; font-weight: 700; color: var(--bad); }

  /* the trunk: search and filters always in view, then the grid of cards */
  .find { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; padding: 0 4px 8px 0; border-bottom: 1px solid var(--n200); }
  .ranges { display: flex; gap: 14px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
  .ranges label { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
  .ranges .sort { margin-left: auto; }
  .foot { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--ink-2); font-weight: 700; }
  .foot .own { display: flex; align-items: center; gap: 4px; font-weight: 600; }
  .foot .own input { accent-color: var(--p700); margin: 0; }
  .clear { color: var(--link); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .cards { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 76px); grid-auto-rows: 110px; gap: 8px 6px; align-content: start; padding: 10px 4px 12px 1px; }
  .card { position: relative; width: 76px; height: 110px; touch-action: none; border-radius: 5px; overflow: hidden; background: var(--p900); cursor: grab;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink-strong) 35%, transparent), 0 4px 8px -4px color-mix(in srgb, var(--p900) 50%, transparent); transition: transform var(--release) var(--spring), box-shadow .14s, filter .14s; }
  .card:hover, .card:focus-visible { transform: translateY(-3px); box-shadow: 0 0 0 2px var(--n0), 0 0 0 4px var(--p500), 0 10px 18px -6px color-mix(in srgb, var(--p900) 60%, transparent); z-index: 1; }
  /* not in the trunk at all ("Cards I don't have"): grey; every copy in the deck: full colour, its label says so */
  .card.notown .face { filter: grayscale(.9) brightness(.8); }
  .card.spent .face { filter: grayscale(.85) brightness(.72); }
  .card.notown, .card.spent { cursor: default; }
  .card.spent:hover { transform: none; }
  /* drag and drop: the lifted card over everything, a little larger and tilted, its shadow deep; it flies (left / top /
     size) to where it lands; the section under it lights blue, red where it can't go */
  .lift { position: absolute; z-index: 20; pointer-events: none; border-radius: 5px; overflow: hidden; background: var(--p900);
    transform: scale(1.08) rotate(-2.5deg); box-shadow: 0 0 0 2px var(--n0), 0 18px 32px -10px color-mix(in srgb, var(--p900) 85%, transparent);
    transition: transform .14s var(--ease), box-shadow .14s; }
  .lift.no { box-shadow: 0 0 0 2px var(--n0), 0 0 0 5px var(--bad), 0 18px 32px -10px color-mix(in srgb, var(--p900) 85%, transparent); }
  .lift:is(.fly, .back, .settle, .wait) { transform: none; box-shadow: 0 0 0 1px var(--n0), 0 4px 10px -4px color-mix(in srgb, var(--p900) 70%, transparent);
    transition: left .22s var(--ease), top .22s var(--ease), width .22s var(--ease), height .22s var(--ease), transform .22s var(--ease), box-shadow .22s; }
  .lift.settle { transition-duration: .16s; }
  .lift .face { width: 100%; height: 100%; object-fit: cover; }
  .ed.dragging, .ed.dragging * { cursor: grabbing !important; }
  .tile.lifted { opacity: .25; transition: opacity .12s; }
  .sec.refuse { background: color-mix(in srgb, var(--bad) 10%, transparent); box-shadow: inset 0 0 0 2px var(--bad); }
  @media (prefers-reduced-motion: reduce) { .lift, .lift:is(.fly, .back, .settle, .wait) { transition: none; } }
  /* the trunk's copies left to add: a small plate in the corner, ×N; ×0 hollow on a greyed card when every copy is in the deck */
  .n { position: absolute; right: 2px; bottom: 2px; min-width: 18px; height: 15px; padding: 0 4px; border-radius: 4px; pointer-events: none;
    font-size: 10px; font-weight: 800; line-height: 15px; text-align: center; color: var(--n0); letter-spacing: 0;
    background: color-mix(in srgb, var(--ink-strong) 82%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--n0) 55%, transparent); }
  .n.out { color: var(--ink-strong); background: color-mix(in srgb, var(--n0) 88%, transparent); box-shadow: 0 0 0 1px var(--n300); }
  .lim { position: absolute; left: 3px; top: 3px; color: var(--n0); background: var(--bad); box-shadow: 0 0 0 1px var(--n0); }
  .lim.l2 { background: var(--warm); }
  .empty-pool { grid-column: 1 / -1; display: grid; justify-items: center; gap: 10px; padding: 40px 0; color: var(--ink-2); font-weight: 700; }
  .empty-pool p { margin: 0; }
</style>
