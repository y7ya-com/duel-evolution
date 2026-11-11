// The title's sign-in (signed out) as live shows it: the 2008 CWindowLogin dialog (256, 256, 464 x 264) as
// client/recomp/rt/session.cpp rearranges it (build / layout: the greeting strip, Sign in with Discord, "or", Username
// and Password over their inputs, the main button at the column's width, "Create account · Reset password", the status
// line; its sign-up, verify and reset modes), drawn by main's generic window renderer (controls/basic.js). Numbers:
// the live window's snapshot (tools/flip.mjs signin --boot --dump, 2026-11-11). Wired to the rewrite's account
// functions: sign in (ClientApp signIn), sign up / verify / reset (features/account.ts through accountAction).
//
// Credentials: the snapshot never carries what is typed in Password (main's renderer draws the field's box; a real
// <input> laid over it holds the text), and the inputs are emptied on submit. Verify's Continue signs in with the
// password typed at Create account, kept in this module's closure (live keeps it in the panel, session.cpp `pass`)
// until the verify view closes.
import { DISCORD_OAUTH } from '../../site';
import type { ClientCommand, ClientView } from '../contracts';
import type { AccountAction } from '../../features/account';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';

export type LoginMode = 'signin' | 'signup' | 'verify' | 'reset';
export interface LoginLocal { mode: LoginMode; username: string; pending?: string;
  /** The title's account panel (its foot) opened by the player. */
  foot?: boolean }
export const loginLocal = (): LoginLocal => ({ mode: 'signin', username: '' });

/** The live panel's numbers (session.cpp: MID, LEFT, WIDE; LINK_Y by mode; OPEN_W). */
const MID = 232, LEFT = 16, WIDE = 432, OPEN_W = 112;
const LINK_Y: Record<LoginMode, number> = { signin: 216, signup: 216, verify: 220, reset: 216 };
const BUTTON: Record<LoginMode, string> = { signin: 'Sign in', signup: 'Create account', verify: 'Continue', reset: 'Reset password' };
const BUSY: Record<LoginMode, string> = { signin: 'Signing in…', signup: 'Creating account…', verify: 'Checking…', reset: 'Resetting…' };
/** The status line's marks (session.cpp status): idle nothing, busy ◌, error ●, done ✓. */
const MARK = { idle: ' ', busy: '◌', err: '●', ok: '✓' } as const;

export interface LoginDeps { state: ClientView; ui: LoginLocal; ids: Ids; send(command: ClientCommand): void; rerender(): void;
  /** Where Sign in with Discord goes (the page's own navigation). */
  discord(): void; open(url: string): void }

const inputs = new WeakMap<HTMLElement, Map<string, HTMLInputElement>>();
const overlays = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

export function loginWindow(d: LoginDeps): WindowSpec {
  const { state, ui } = d, acc = state.accountDetail;
  // the verify view is the account's (a registration answered with a code)
  if (acc?.panel === 'verify' && acc.verification) ui.mode = 'verify';
  else if (ui.mode === 'verify') ui.mode = 'signin';
  if (ui.mode !== 'verify' && ui.mode !== 'signup') ui.pending = undefined;
  const m = ui.mode, busy = !!state.busy || !!acc?.busy;
  const b = new WindowBuilder(d.ids, 'login', 'CWindowLogin', { x: 256, y: 256, w: 464, h: 264 }, { modal: true, z: 51153 });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w: 464, h: 264 }, { band: 206, style: 1, alpha: 0.7 });
  const text = (name: string, x: number, y: number, w: number, h: number, t: string, align = 0, extra: Record<string, unknown> = {}) =>
    b.add('CWindowTaskText', name, { x, y, w, h }, { text: t, align, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 100, color: [1, 1, 1, 1], ...extra });
  const button = (name: string, x: number, y: number, w: number, h: number, label: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskTextSwitch', name, { x, y, w, h }, { label, state: run && !busy ? 'normal' : 'disabled', checked: false, align: 1, color: [0, 0, 0, 1], shadow: null },
      { key, click: () => { if (run && !busy) run(); } });
  // the greeting in the dialog's own header field, cut to its two lines (session.cpp build)
  b.add('CWindowTaskTextField', 'header', { x: 8, y: 8, w: 448, h: 42 }, { text: 'Welcome to the world of Duel Evolution!\nPlease sign in to play.', align: 1, fontSize: 16, lineGap: 0, firstLine: 0, pageLines: 2, color: [1, 1, 1, 1] });
  const fields = m !== 'verify';
  // v2 (site.ts DISCORD_OAUTH off): live's Discord app can't return here, so the strip says so instead of a dead button
  if (m !== 'verify' && DISCORD_OAUTH) button('discord', LEFT, 56, WIDE, 24, 'Sign in with Discord', 'login-discord', d.discord);
  else if (m !== 'verify') text('discord-off', LEFT, 60, WIDE, 16, 'No Discord sign-in here yet: use your username and password.', 1, { fontSize: 14 });
  if (m === 'signin' || m === 'signup') text('or', LEFT + 4, 88, 424, 16, '――――――――――   or   ――――――――――', 1);
  if (fields) {
    text('label1', LEFT, 104, 256, 16, m === 'reset' ? 'Reset code from Discord' : 'Username');
    text('label2', LEFT, 140, 256, 16, m === 'reset' ? 'New password' : 'Password');
    // the boxes only (value ''): the typed text is the real inputs' (after)
    for (const [name, y] of [['input1', 112], ['input2', 148]] as const)
      b.add('CWindowTaskInput', name, { x: LEFT - 8, y, w: WIDE + 16, h: 32 }, { value: '', password: name === 'input2', caret: null, caretOn: false, maxLen: 20, multiLine: false });
  }
  const verification = acc?.verification;
  if (m === 'verify' && verification) {
    text('note', LEFT + 4, 56, 424, 16, 'Your verification code', 1);
    text('code', LEFT + 4, 72, 424, 36, verification.code.split('').join(' '), 1, { fontSize: 28 });
    button('copy', MID - 46 - 36, 118 - 12, 72, 24, 'Copy', 'login-copy', () => { void globalThis.navigator?.clipboard?.writeText(verification.code).catch(() => {}); });
    const invite = verification.inviteUrl ?? acc?.inviteUrl;
    button('open', MID + 10, 118 - 10, OPEN_W, 20, 'Open Discord', 'login-open-discord', invite ? () => d.open(invite) : null);
    text('steps', LEFT, 130, 424, 64, `1. Open Discord and join the server.\n2. In #verify type: /verify ${verification.code}\n3. Then press Continue. (Or tap Verify my account.)`);
  } else if (m === 'reset') {
    text('note', LEFT, 86, 424, 16, 'Get a code in #reset-password.');
    const invite = acc?.inviteUrl;
    button('open', LEFT + WIDE - OPEN_W, 93 - 10, OPEN_W, 20, 'Open Discord', 'login-open-discord', invite ? () => d.open(invite) : null);
  }
  const submit = (root?: HTMLElement) => {
    if (busy) return;
    const box = root && inputs.get(root), one = box?.get('input1'), two = box?.get('input2');
    const v1 = (one?.value ?? '').trim(), v2 = two?.value ?? '';
    const act = (action: AccountAction) => d.send({ type: 'accountAction', action });
    if (m === 'verify') { if (!verification || !ui.pending) { act({ type: 'show', panel: 'register' }); ui.mode = 'signup'; d.rerender(); return; } act({ type: 'continueVerification', username: verification.username, password: ui.pending }); return; }
    if (!v1 || !v2) return;
    if (two) two.value = '';
    if (m === 'signin') { ui.username = v1; d.send({ type: 'signIn', username: v1, password: v2 }); }
    else if (m === 'signup') { ui.username = v1; ui.pending = v2; act({ type: 'register', username: v1, password: v2 }); }
    else { if (one) one.value = ''; act({ type: 'resetPassword', code: v1, newPassword: v2 }); }
  };
  let rootRef: HTMLElement | undefined;
  button('ok', LEFT, m === 'verify' ? 188 : 182, WIDE, 24, BUTTON[m], 'login-submit', () => submit(rootRef));
  // the links: "Create account · Reset password" around the centre, else one centred "Back to sign in"
  const to = (next: LoginMode) => () => { if (busy) return; ui.mode = next; ui.pending = undefined; if (next === 'reset') d.send({ type: 'accountAction', action: { type: 'show', panel: 'reset' } }); else if (acc && acc.panel !== 'overview') d.send({ type: 'accountAction', action: { type: 'show', panel: 'overview' } }); d.rerender(); };
  const ly = LINK_Y[m], links: { name: string; x: number; w: number; label: string; run: () => void }[] = m === 'signin'
    ? [{ name: 'link1', x: MID - 10 - 200, w: 200, label: 'Create account', run: to('signup') }, { name: 'link2', x: MID + 10, w: 200, label: 'Reset password', run: to('reset') }]
    : [{ name: 'link1', x: MID - 100, w: 200, label: 'Back to sign in', run: to('signin') }];
  for (const l of links) text(l.name, l.x, ly, l.w, 16, l.label, m === 'signin' ? (l.name === 'link1' ? 2 : 0) : 1);
  if (m === 'signin') text('mid', MID - 3, ly, 16, 16, '·');
  // the status line: a mark by state, then the text (session.cpp status / reason)
  const error = acc?.error ?? (m === 'signin' ? state.error : null) ?? null;
  const [mark, line] = busy ? [MARK.busy, BUSY[m]] : error ? [MARK.err, error] : [MARK.idle, ''];
  text('dot', LEFT, 240, 16, 16, mark);
  text('status', LEFT + 16, 240, 424, 16, line);
  const spec = b.spec();
  const linkW = (label: string) => Math.round(label.length * 8.6);
  spec.after = root => {
    rootRef = root;
    const font = root.querySelector<HTMLElement>('.txt span');
    const css = font ? getComputedStyle(font) : null;
    // the real inputs over the drawn boxes (8 in: the field's text and caret place, CWindowTaskInput::layout)
    const box = inputs.get(root) ?? new Map<string, HTMLInputElement>(); inputs.set(root, box);
    for (const name of ['input1', 'input2'] as const) {
      let input = box.get(name);
      if (!fields) { input?.remove(); box.delete(name); continue; }
      if (!input) {
        input = document.createElement('input'); input.className = 'de-login-input'; box.set(name, input);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (name === 'input1') box.get('input2')?.focus(); else submit(root); } });
        if (name === 'input1') input.addEventListener('input', () => { if (ui.mode !== 'reset') ui.username = input!.value; });
        Object.assign(input.style, { position: 'absolute', left: `${LEFT}px`, top: `${(name === 'input1' ? 112 : 148) + 8}px`, width: `${WIDE}px`, height: '16px', padding: '0', margin: '0', border: '0', outline: 'none', background: 'transparent', color: '#000', caretColor: '#000', zIndex: '2' });
      }
      if (input.parentNode !== root) {
        root.append(input);
        // the dialog opens with its caret in the first field (live: CWindowTaskInput focused, caret on), unless the
        // player is already in another control
        if (name === 'input1' && (!document.activeElement || document.activeElement === document.body)) input.focus({ preventScroll: true });
      }
      if (css) { input.style.font = css.font; input.style.letterSpacing = css.letterSpacing; }
      const reset = m === 'reset', secret = name === 'input2';
      const want = { type: secret ? 'password' : 'text', name: secret ? 'password' : reset ? 'code' : 'username', autocomplete: secret ? (m === 'signin' ? 'current-password' : 'new-password') : reset ? 'one-time-code' : 'username' };
      if (input.dataset.mode !== m) {
        input.dataset.mode = m; input.type = want.type; input.name = want.name; input.autocomplete = want.autocomplete as AutoFill;
        input.dataset.key = secret ? 'password' : reset ? 'reset-code' : 'username';
        input.setAttribute('aria-label', name === 'input1' ? (reset ? 'Reset code from Discord' : 'Username') : reset ? 'New password' : 'Password');
        input.maxLength = secret ? 128 : reset ? 32 : 64; input.value = name === 'input1' && !reset ? ui.username : '';
      }
      input.disabled = busy;
    }
    // the links and the status as the page reads them: the engine's labels have no element of their own (main draws
    // text the pointer passes through), so a link is a transparent button over its drawn words, underlined on hover as
    // live's (session.cpp underline), and the status line is announced
    const over = overlays.get(root) ?? new Map<string, HTMLElement>(); overlays.set(root, over);
    const keep = new Set<string>();
    for (const l of links) {
      const key = `link:${l.label}`; keep.add(key);
      let el = over.get(key) as HTMLButtonElement | undefined;
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'de-login-link'; el.textContent = l.label; over.set(key, el);
        Object.assign(el.style, { position: 'absolute', height: '18px', padding: '0', margin: '0', border: '0', background: 'transparent', color: 'transparent', cursor: 'pointer', zIndex: '2', textDecoration: 'none' });
        el.addEventListener('pointerenter', () => { el!.style.borderBottom = '1px solid #000'; });
        el.addEventListener('pointerleave', () => { el!.style.borderBottom = '0'; });
      }
      el.onclick = l.run;
      el.dataset.key = `login-${l.label.toLowerCase().replace(/ /g, '-')}`;
      const w = linkW(l.label), x = m === 'signin' ? (l.name === 'link1' ? l.x + l.w - w : l.x) : MID - w / 2;
      Object.assign(el.style, { left: `${x}px`, top: `${ly}px`, width: `${w}px` });
      el.disabled = busy;
      if (el.parentNode !== root) root.append(el);
    }
    let status = over.get('status');
    if (!status) { status = document.createElement('p'); status.className = 'de-login-status'; Object.assign(status.style, { position: 'absolute', left: `${LEFT + 16}px`, top: '240px', width: '424px', height: '16px', margin: '0', color: 'transparent', pointerEvents: 'none', overflow: 'hidden' }); over.set('status', status); }
    keep.add('status');
    status.setAttribute('role', error && !busy ? 'alert' : 'status'); status.textContent = line;
    if (status.parentNode !== root) root.append(status);
    for (const [k, el] of over) if (!keep.has(k)) { el.remove(); over.delete(k); }
  };
  return spec;
}
