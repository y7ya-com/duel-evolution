// An NPC's talk as live shows it (the engine draws it on main; main's Legacy screens leave it alone): the NPC's picture
// full height on the right (the duel's waist-up portrait, duel-scene.ts portraitLeft side 1), the speech balloon
// (CWindowModelBalloon: the speaker's name, the line, the next mark; a click goes on), the green card with the NPC's
// record (Win%, Wins / Losses, Deck Name) on the left and, once the NPC has said yes, the "Start Duel?" question
// (CUYesNoDialog: Yes / No). Places measured from live's capture (live-npc-talk2 / live-npc-next, 2048 x 1536 = 2x).
// The ways out live has: clicks to the end of its lines (on the balloon or anywhere off it: live's balloon takes the
// screen's clicks the chat and the menu bar leave), and No (then the NPC's decline line); Escape does nothing (index.ts).
import type { NpcState } from '../../features/npc';
import type { ClientCommand } from '../contracts';
import { portraitLeft } from '../duel-scene';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';
import { PICTURE_ENTERED } from './pictures';
import { dialogLines } from './dialog-text';
import { npcWaistUpSet } from '../npc-waistup';

/** The stages the talk draws: before a duel (its lines and the question) and the lines after it. */
const TALK = ['opening', 'ask', 'greeting', 'after-duel', 'won', 'lost', 'item'] as const;
export const npcTalkStage = (npc: Readonly<NpcState> | null | undefined): boolean => !!npc?.npc && (TALK as readonly string[]).includes(npc.stage);

/** The talk's commands (the app's NPC controller). */
export type NpcCommand = Extract<ClientCommand, { type: 'npcAnswer' | 'npcAdvance' | 'npcDismiss' | 'npcClose' | 'npcRefreshInventory' | 'npcSelectPack' }>;
export interface NpcTalkDeps {
  ids: Ids;
  send(command: NpcCommand): void;
  busy?: boolean;
  /** The NPC's 16 waist-up parts (its lobby avatar), for its picture. */
  parts?: ArrayLike<number> | null;
}

export function npcTalkWindows(npc: Readonly<NpcState> | null | undefined, d: NpcTalkDeps): WindowSpec[] {
  if (!npcTalkStage(npc)) return [];
  const s = npc!, who = s.npc!, out: WindowSpec[] = [];
  // the picture, under the chat and the menu bar (live draws them over it): a famous NPC's own (its csv's tiles,
  // npc-waistup.ts: Alexis Rhodes a03, at 874 - its csv's x), another NPC's waist-up from its parts
  const set = npcWaistUpSet(who.id);
  // live's portrait slides in from the right as the talk comes and out as it ends (not into the duel or the gifts)
  const slide = { enter: true, exit: !['ask', 'won', 'lost', 'item'].includes(s.stage) };
  if (set) {
    out.push(new WindowBuilder(d.ids, 'npc-talk:pictures', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51000,
      pics: [{ key: 'npc', source: { canvas: `npc:${set}` }, x: 0, y: 0, w: 1024, h: 768, z: 0, shown: true, slide }] }).spec());
  } else if (d.parts && d.parts.length === 16) {
    // live's CWaistUpAvatar on the right at full size (duel-scene.ts portraitLeft: 548 for a female look, 529 a male)
    out.push(new WindowBuilder(d.ids, 'npc-talk:pictures', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51000,
      pics: [{ key: 'npc', source: { canvas: `portrait:${Array.from(d.parts).join('.')}` }, x: portraitLeft(1, d.parts[0] === 1), y: 0, w: 768, h: 768, z: 0, shown: true, slide }] }).spec());
  }
  out.push(infoCard(s, d));
  const waiting = s.stage === 'after-duel' && !s.settlementReceived;
  // (a first meeting's acknowledgement does not hold the talk: live sends it and goes on)
  if (s.stage === 'ask' && !s.dialogue) out.push(startDuel(d, false));
  else {
    // the line; a click goes on (after a duel only once the server's result is in; before one, after the first
    // meeting is confirmed); the greeting (the NPC's "not duelling?" line) is the last: its click leaves
    const text = s.dialogue?.known ? s.dialogue.text : waiting ? '' : s.dialogue?.text ?? '';
    const blocked = !!d.busy || waiting;
    const command: NpcCommand = s.stage === 'greeting' ? { type: 'npcDismiss' } : { type: 'npcAdvance' };
    const label = ['won', 'lost', 'item'].includes(s.stage) ? 'Receive Gift' : s.stage === 'greeting' ? 'Close' : 'Next';
    out.push(...balloon(d, who.name, text, label, blocked, () => d.send(command)));
  }
  return out;
}

// The balloon: 290, 95 to 746, 241 (live: its tail out to the NPC on the right at 192); under it the whole screen goes
// on too (over the NPC's picture and the world, under the info card's pass-through, the menu bar and the chat)
function balloon(d: NpcTalkDeps, name: string, text: string, label: string, blocked: boolean, go: () => void): WindowSpec[] {
  const click = () => { if (!blocked) go(); };
  const b = new WindowBuilder(d.ids, 'npc-talk:balloon', 'CNpcTalkBalloon', { x: 290, y: 95, w: 456, h: 146 }, { z: 51010, name, text });
  const next = b.add('CWindowTaskSwitch', 'next', { x: 0, y: 0, w: 456, h: 146 }, { label, state: blocked ? 'disabled' : 'normal', enabled: !blocked },
    { key: 'npc-talk:next', label, click });
  Object.assign(b.win, { next: next.id, label, blocked });
  const c = new WindowBuilder(d.ids, 'npc-talk:off', 'CNpcTalkCatch', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51002 });
  const off = c.add('CWindowTaskSwitch', 'next', { x: 0, y: 0, w: 1024, h: 768 }, { label, state: blocked ? 'disabled' : 'normal', enabled: !blocked },
    { key: 'npc-talk:off', label, click });
  Object.assign(c.win, { next: off.id, blocked });
  return [b.spec(), c.spec()];
}

// The NPC's card (CNpcListMenu, 336 wide, its bottom at 607): its name red over the record rows and its text (bio) under
// them; the window here is the tallest card's room (0, 222 to 607), the card itself as tall as its text (npcInfoScreen)
function infoCard(s: Readonly<NpcState>, d: NpcTalkDeps): WindowSpec {
  const r = s.record;
  return new WindowBuilder(d.ids, 'npc-talk:info', 'CNpcTalkInfo', { x: 0, y: 222, w: 336, h: 385 }, { z: 51005,
    name: s.npc?.name ?? '', record: `Wins${r?.wins ?? 0}/Losses${r?.loses ?? 0}`, deck: '?????', bio: s.bio ?? '' }).spec();
}

// "Start Duel?" (CUYesNoDialog, main's duel.js look): 344, 312, 336 x 144; Yes 45, 112 and No 212, 112 (80 x 24)
function startDuel(d: NpcTalkDeps, blocked: boolean): WindowSpec {
  const { text, n } = dialogLines('Start Duel?', 320), w = 336, h = 144, x = 344, y = 312;
  const b = new WindowBuilder(d.ids, 'npc-talk:start', 'CUYesNoDialog', { x, y, w, h }, { modal: true, z: 51170 });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w, h }, { style: 1, band: 40, alpha: 0.7 });
  // the field's white plane fills the body down to the buttons' band (live: an opaque box, the world not through it)
  b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: w - 16, h: Math.max(n * 16 + 8, 96) }, { text, align: 1, color: [0, 0, 0, 1] });
  const on = !d.busy && !blocked;
  ([['yes', 'Yes', 45, true], ['no', 'No', 212, false]] as const).forEach(([id, label, bx, accept]) => {
    const c = b.add('CWindowTaskTextSwitch', `opt:${id}`, { x: bx, y: 112, w: 80, h: 24 }, { label, align: 1, state: on ? 'normal' : 'disabled', enabled: on });
    // Yes starts the duel; No is the NPC's decline line (10) before the talk ends, as live (CNpcListMenu::stepAsking)
    b.on(c, { key: `npc-start:${id}`, label, click: () => { if (on) d.send({ type: 'npcAnswer', accept }); } });
  });
  return b.spec();
}

// ---- the rewrite's own screens for the two windows the engine draws on live (registered in layer.ts EXTRA)
const CSS = `.npc-balloon { position: absolute; left: 0; top: 0; width: 446px; height: 142px; box-sizing: border-box; background: #fbfbfb;
  border: 2px solid #3a3f44; border-radius: 22px; box-shadow: inset 0 0 0 2px #cfdbe3; font: 16px/20px Arial, Helvetica, sans-serif;
  letter-spacing: 1px; color: #1a1a1a; cursor: pointer; padding: 0; text-align: left; }
.npc-balloon::after { content: ''; position: absolute; right: -16px; top: 84px; width: 18px; height: 18px; background: #fbfbfb; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.npc-balloon::before { content: ''; position: absolute; right: -21px; top: 81px; width: 22px; height: 24px; background: #3a3f44; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.npc-balloon:disabled { cursor: default; }
.npc-balloon .who { position: absolute; left: 13px; top: 8px; }
.npc-balloon .says { position: absolute; left: 44px; top: 40px; width: 380px; height: 84px; font-size: 15px; line-height: 16px; white-space: pre-wrap; overflow: hidden; }
.npc-balloon .mark { position: absolute; right: 22px; bottom: 6px; width: 14px; height: 14px; }
.npc-balloon .mark::before { content: ''; position: absolute; left: 3px; top: 0; width: 8px; height: 8px; background: #f08a1c; clip-path: polygon(30% 0, 70% 0, 70% 40%, 100% 40%, 50% 100%, 0 40%, 30% 40%); }
.npc-balloon .mark::after { content: ''; position: absolute; left: 0; top: 9px; width: 14px; height: 4px; border: 1px solid #555; border-top: 0; box-sizing: border-box; }
.npc-balloon:disabled .mark { visibility: hidden; }
.npc-info { position: absolute; left: 0; top: 0; width: 336px; height: 116px; box-sizing: border-box; font: 16px/16px Arial, Helvetica, sans-serif;
  letter-spacing: 1px; color: #111; border: 4px solid; border-color: rgb(120,248,206) rgb(56,226,100) rgb(48,214,88) rgb(86,248,150);
  box-shadow: inset 0 0 0 3px rgb(71,248,121), inset 0 0 0 4px rgb(240,249,248); }
.npc-info > div { position: absolute; left: 4px; right: 4px; white-space: nowrap; }
.npc-info .name, .npc-info .bio { background: rgba(255,255,255,.7); }
.npc-info .name { top: 4px; height: 36px; color: #ff0000; text-align: center; white-space: pre; }
.npc-info .band { top: 40px; height: 32px; background: rgba(204,204,204,.83); }
.npc-info .white { top: 72px; height: 32px; background: linear-gradient(rgba(255,255,255,.82) 0 16px, rgba(255,255,255,.92) 16px); }
.npc-info .bio { top: 104px; bottom: 4px; white-space: pre-wrap; word-break: break-all; letter-spacing: .75px; overflow: hidden; }
.npc-info .l { line-height: 16px; } .npc-info .v { text-align: right; line-height: 16px; }`;
const css = () => { if (!document.getElementById('npc-talk-css')) { const st = document.createElement('style'); st.id = 'npc-talk-css'; st.textContent = CSS; document.head.append(st); } };
type BalloonWin = { name?: string; text?: string; next?: number; label?: string; blocked?: boolean };

export const npcBalloonScreen: HtmlUiScreen = {
  classes: ['CNpcTalkBalloon'],
  mode: 'owned',
  mount(_win, root, api) {
    css();
    const box = document.createElement('button'); box.type = 'button'; box.className = 'npc-balloon'; box.dataset.key = 'npc-talk:next';
    const who = document.createElement('span'), says = document.createElement('span'), mark = document.createElement('i');
    who.className = 'who'; says.className = 'says'; mark.className = 'mark';
    box.append(who, says, mark); root.append(box); root.style.overflow = 'visible';
    const st = { box, who, says, next: 0 };
    // live's balloon comes once the portrait has slid in (8 frames after the card): hidden until the picture is home
    // (pictures.ts PICTURE_ENTERED), 266 ms at least, 1.5 s at most; at once under reduced motion
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true || !!root.closest?.('[data-motion="reduced"]');
    if (!reduced && typeof setTimeout === 'function') {
      box.style.visibility = 'hidden';
      const pic = !!document.querySelector('[data-window-class="CEnginePictures"] [data-picture="npc"]');
      let min = false, home = !pic;
      const show = () => { if (min && home) done(); };
      const done = () => { box.style.visibility = ''; globalThis.removeEventListener?.(PICTURE_ENTERED, onHome); clearTimeout(cap); };
      const onHome = (e: Event) => { if ((e as CustomEvent).detail === 'npc') { home = true; show(); } };
      globalThis.addEventListener?.(PICTURE_ENTERED, onHome);
      setTimeout(() => { min = true; show(); }, 266);
      const cap = setTimeout(done, 1500);
    }
    box.onclick = () => { if (!box.disabled && st.next) void api.click(st.next); };
    return st;
  },
  update(win, _prev, root, _api, st) {
    const w = win as BalloonWin, s = st as { box: HTMLButtonElement; who: HTMLElement; says: HTMLElement; next: number };
    // the engine's font has no '…': live draws its missing-glyph box there ("□Who are you?")
    s.who.textContent = w.name ?? ''; s.says.textContent = (w.text ?? '').replace(/… ?/g, '□'); s.next = w.next ?? 0;
    s.box.disabled = !!w.blocked; s.box.setAttribute('aria-label', `${w.name ?? ''}: ${w.text ?? ''} (${w.label ?? 'Next'})`);
    root.style.overflow = 'visible';
  },
  unmount(root) { root.replaceChildren(); },
};

/** The screen off the balloon: a click there goes on as the balloon's own does (live: the next line, or the talk's end). */
export const npcCatchScreen: HtmlUiScreen = {
  classes: ['CNpcTalkCatch'],
  mode: 'owned',
  mount(_win, root, api) {
    const pad = document.createElement('div'); pad.className = 'npc-talk-off'; pad.dataset.key = 'npc-talk:off';
    Object.assign(pad.style, { position: 'absolute', inset: '0' });
    root.append(pad);
    const st = { pad, next: 0, blocked: false };
    pad.onclick = () => { if (!st.blocked && st.next) void api.click(st.next); };
    return st;
  },
  update(win, _prev, _root, _api, st) {
    const w = win as { next?: number; blocked?: boolean }, s = st as { next: number; blocked: boolean };
    s.next = w.next ?? 0; s.blocked = !!w.blocked;
  },
  unmount(root) { root.replaceChildren(); },
};

type InfoWin = { name?: string; record?: string; deck?: string; bio?: string };
export const npcInfoScreen: HtmlUiScreen = {
  classes: ['CNpcTalkInfo'],
  mode: 'pass',
  rootInput: 'none',
  mount(_win, root) {
    css();
    const card = document.createElement('div'); card.className = 'npc-info'; card.setAttribute('role', 'region');
    const row = (cls: string, top: number, html: [string, string][]) => { const r = document.createElement('div'); r.className = cls; if (top >= 0) r.style.top = `${top}px`;
      for (const [k, c] of html) { const e = document.createElement('div'); e.className = c; e.dataset.f = k; r.append(e); } card.append(r); return r; };
    row('name', -1, []);
    const band = row('band', -1, [['wl', 'l'], ['wv', 'v']]), white = row('white', -1, [['dl', 'l'], ['dv', 'v']]);
    const bio = row('bio', -1, []);
    root.append(card);
    return { card, name: card.querySelector('.name') as HTMLElement, band, white, bio };
  },
  update(win, _prev, _root, _api, st) {
    const w = win as InfoWin, s = st as { card: HTMLElement; name: HTMLElement; band: HTMLElement; white: HTMLElement; bio: HTMLElement };
    s.bio.textContent = w.bio ?? '';
    // live's card is as tall as its text (CNpcListMenu::showInfo): name 8, Win% 44, Deck Name 76, the biography's 16-px
    // lines from 108, 8 under them; its bottom at 607 (kOpenBottom): 116 high without a biography
    s.bio.style.bottom = 'auto'; const bioH = w.bio ? Math.ceil(s.bio.scrollHeight / 16) * 16 : 0; s.bio.style.bottom = '';
    const h = 116 + bioH;
    if (s.card.style.height !== `${h}px`) Object.assign(s.card.style, { height: `${h}px`, top: `${385 - h}px` });
    // the name as live prints it ("%8s": padded to eight places, then centred)
    s.name.textContent = (w.name ?? '').padStart(8);
    const [wl, wv] = s.band.children as unknown as HTMLElement[], [dl, dv] = s.white.children as unknown as HTMLElement[];
    wl!.textContent = 'Win%'; wv!.textContent = w.record ?? ''; dl!.textContent = 'Deck Name'; dv!.textContent = w.deck ?? '';
    s.card.setAttribute('aria-label', `${w.name ?? ''}: ${w.record ?? ''}`);
  },
  unmount(root) { root.replaceChildren(); },
};
