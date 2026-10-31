<script module>
  // D-Mail, modern (CWindowModelDMail, the inbox; CWindowModelDMailSend, Write Mail; logic.js mail). The inbox is a
  // mail client: its actions up top (Write Mail in gold), the mails as rows, the open mail below. Write Mail is a form:
  // each field named by the game's own label, the message a text area, Send in gold. Every button, row and field is the
  // engine's own; Esc is Close / Cancel.
  import { mail, leaveButton } from './logic.js';
  const GOLD = /^(Write Mail|Send|Send Mail)$/;
</script>

<script>
  import Icon from './Icon.svelte';
  import Field from './Field.svelte';
  let { view } = $props();
  const win = $derived(view.win);
  const m = $derived(mail(win));
  const api = $derived(view.api);
  const head = $derived(m.buttons.filter(b => b.y < win.h / 2));
  const foot = $derived(m.buttons.filter(b => b.y >= win.h / 2));
  // a row: a click at its place (a DMailItem reads 0 x 0)
  const openRow = r => api.click(r.id, [win.x + r.x + 200, win.y + r.y + 16]);
  function keys(e) { if (e.key === 'Escape' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); const b = leaveButton(m.buttons); b && api.click(b.id); } }
  const icon = l => ({ 'Write Mail': 'comment', 'Send Mail': 'send', Send: 'send', Delete: 'trash', Close: 'close', Cancel: 'close' })[l.trim()];
</script>

{#snippet btn(b)}
  <button type="button" class="mu-btn" class:gold={GOLD.test(b.label.trim())} data-state={b.state} disabled={b.state === 'disabled'} onclick={() => api.click(b.id)}>
    {#if icon(b.label)}<Icon name={icon(b.label)} size={15} />{/if}{b.label}</button>
{/snippet}

<div class="mu">
  <div class="scrim" style:left="{-win.x}px" style:top="{-win.y}px"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="mu-plate box" style:width="{win.w}px" style:height="{win.h}px" aria-label={m.title} onkeydown={keys}>
    <header class="mu-head">
      <Icon name="mail" class="lead" />
      <h2>{m.title}</h2>
    </header>
    {#if m.compose}
      <div class="form">
        {#each m.fields as f (f.c.id)}
          <label class:grow={f.area}>
            <span>{f.label || (f.area ? 'Message' : 'Text')}</span>
            <Field c={f.c} {api} label={f.label} area={f.area} rows={f.area ? 11 : 1} />
          </label>
        {/each}
      </div>
    {:else}
      <div class="actions">{#each head as b (b.id)}{@render btn(b)}{/each}</div>
      <ul class="rows mu-scroll" aria-label="Mail">
        {#each m.rows as row (row.r.id)}
          <li><button type="button" onclick={() => openRow(row.r)}>
            <Icon name="mail" size={15} />
            {#each row.text as t, i}<span class:main={i === 0}>{t}</span>{/each}
          </button></li>
        {:else}
          <li class="empty">No mail yet.</li>
        {/each}
      </ul>
      <article class="body mu-scroll" aria-label="Message">{m.body || 'Choose a mail to read it here.'}</article>
    {/if}
    <footer>{#each (m.compose ? m.buttons : foot) as b (b.id)}{@render btn(b)}{/each}</footer>
  </section>
</div>

<style>
  .scrim { position: absolute; width: 1024px; height: 768px; background: rgba(2, 10, 30, .45); }
  .box { left: 0; top: 0; display: flex; flex-direction: column; }
  .box :global(.lead) { color: var(--gold-300); }
  .actions { display: flex; gap: 8px; padding: 12px 16px 0; }
  .actions :global(.mu-btn:last-child:not(:first-child)) { margin-left: auto; }
  .rows { list-style: none; margin: 10px 16px 0; padding: 4px; height: 178px; flex: none; border-radius: 10px;
    background: rgba(4, 17, 43, .42); box-shadow: inset 0 1px 3px rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(150, 205, 255, .12); }
  .rows button { display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border-radius: 8px; color: var(--ink-2);
    transition: background .12s; }
  .rows button:hover { background: rgba(150, 205, 255, .14); color: #fff; }
  .rows button :global(.mu-ico) { color: var(--gold-300); }
  .rows span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rows .main { flex: 1; font-weight: 650; color: #fff; }
  .empty { padding: 10px; color: var(--ink-3); }
  .body { flex: 1; min-height: 0; margin: 10px 16px 0; padding: 12px 14px; border-radius: 10px; white-space: pre-wrap; line-height: 1.5;
    color: var(--ink); user-select: text; background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(150, 205, 255, .16); }
  .form { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 0; }
  .form label { display: flex; flex-direction: column; gap: 5px; }
  .form label.grow { flex: 1; min-height: 0; }
  .form label.grow :global(textarea) { flex: 1; min-height: 0; }
  .form span { font-size: 11.5px; font-weight: 650; color: var(--sky-300); letter-spacing: .02em; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px 14px; }
</style>
