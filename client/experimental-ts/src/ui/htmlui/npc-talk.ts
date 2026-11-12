// An NPC's talk as live shows it (the engine draws it on main; main's Legacy screens leave it alone): the NPC's picture
// full height on the right (the duel's waist-up portrait, duel-scene.ts PORTRAIT_PLACE side 1), the speech balloon
// (CWindowModelBalloon: the speaker's name, the line, the next mark; a click goes on), the green card with the NPC's
// record (Win%, Wins / Losses, Deck Name) on the left and, once the NPC has said yes, the "Start Duel?" question
// (CUYesNoDialog: Yes / No). Places measured from live's capture (live-npc-talk2 / live-npc-next, 2048 x 1536 = 2x).
// The ways out live has: No, Escape (index.ts) and the balloon's own clicks to the end of a line run.
import type { NpcState } from '../../features/npc';
import type { ClientCommand } from '../contracts';
import { PORTRAIT_PLACE, PORTRAIT_SCALE } from '../duel-scene';
import { WindowBuilder, type Ids, type WindowSpec } from './snapshot';
import { dialogLines } from './dialog-text';

/** The stages the talk draws: before a duel (its lines and the question) and the lines after it. */
const TALK = ['opening', 'ask', 'greeting', 'after-duel', 'won', 'lost', 'item'] as const;
export const npcTalkStage = (npc: Readonly<NpcState> | null | undefined): boolean => !!npc?.npc && (TALK as readonly string[]).includes(npc.stage);
/** The talk before a duel: Escape and No leave it. */
export const npcTalkDismissable = (npc: Readonly<NpcState> | null | undefined): boolean =>
  !!npc?.npc && ['opening', 'ask', 'greeting'].includes(npc.stage) && !['pending', 'uncertain'].includes(npc.firstContactStatus);

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
  // the picture, under the chat and the menu bar (live draws them over it)
  if (d.parts && d.parts.length === 16) {
    const at = PORTRAIT_PLACE[1], size = 768 * PORTRAIT_SCALE;
    out.push(new WindowBuilder(d.ids, 'npc-talk:pictures', 'CEnginePictures', { x: 0, y: 0, w: 1024, h: 768 }, { z: 51000,
      pics: [{ key: 'npc', source: { canvas: `portrait:${Array.from(d.parts).join('.')}` }, x: at.x, y: at.y, w: size, h: size, z: 0, shown: true }] }).spec());
  }
  out.push(infoCard(s, d));
  const waiting = s.stage === 'after-duel' && !s.settlementReceived;
  const contactBlocked = ['pending', 'uncertain'].includes(s.firstContactStatus);
  if (s.stage === 'ask' && !s.dialogue) out.push(startDuel(d, contactBlocked));
  else {
    // the line; a click goes on (after a duel only once the server's result is in; before one, after the first
    // meeting is confirmed); the greeting (the NPC's "not duelling?" line) is the last: its click leaves
    const text = s.dialogue?.known ? s.dialogue.text : waiting ? '' : s.dialogue?.text ?? '';
    const blocked = !!d.busy || waiting || s.stage === 'opening' && contactBlocked;
    const command: NpcCommand = s.stage === 'greeting' ? { type: 'npcDismiss' } : { type: 'npcAdvance' };
    const label = ['won', 'lost', 'item'].includes(s.stage) ? 'Receive Gift' : s.stage === 'greeting' ? 'Close' : 'Next';
    out.push(balloon(d, who.name, text, label, blocked, () => d.send(command)));
  }
  return out;
}

// The balloon: 290, 95 to 746, 241 (live: its tail out to the NPC on the right at 192)
function balloon(d: NpcTalkDeps, name: string, text: string, label: string, blocked: boolean, go: () => void): WindowSpec {
  const b = new WindowBuilder(d.ids, 'npc-talk:balloon', 'CNpcTalkBalloon', { x: 290, y: 95, w: 456, h: 146 }, { z: 51010, name, text });
  const next = b.add('CWindowTaskSwitch', 'next', { x: 0, y: 0, w: 456, h: 146 }, { label, state: blocked ? 'disabled' : 'normal', enabled: !blocked },
    { key: 'npc-talk:next', label, click: () => { if (!blocked) go(); } });
  Object.assign(b.win, { next: next.id, label, blocked });
  return b.spec();
}

// The NPC's card: 0, 222, 335 x 382 (live), its name red over the record rows and its text (bio) under them
function infoCard(s: Readonly<NpcState>, d: NpcTalkDeps): WindowSpec {
  const r = s.record;
  return new WindowBuilder(d.ids, 'npc-talk:info', 'CNpcTalkInfo', { x: 0, y: 222, w: 335, h: 382 }, { z: 51005,
    name: s.npc?.name ?? '', record: `Wins${r?.wins ?? 0}/Losses${r?.loses ?? 0}`, deck: '?????', bio: s.bio ?? '' }).spec();
}

// "Start Duel?" (CUYesNoDialog, main's duel.js look): 344, 312, 336 x 144; Yes 45, 112 and No 212, 112 (80 x 24)
function startDuel(d: NpcTalkDeps, blocked: boolean): WindowSpec {
  const { text, n } = dialogLines('Start Duel?', 320), w = 336, h = 144, x = 344, y = 312;
  const b = new WindowBuilder(d.ids, 'npc-talk:start', 'CUYesNoDialog', { x, y, w, h }, { modal: true, z: 51170 });
  b.add('CWindowTaskFrameBottomThick', 'frame', { x: 0, y: 0, w, h }, { style: 1, band: 40, alpha: 0.7 });
  b.add('CWindowTaskTextField', 'text', { x: 8, y: 8, w: w - 16, h: n * 16 + 8 }, { text, align: 1, color: [0, 0, 0, 1] });
  const on = !d.busy && !blocked;
  ([['yes', 'Yes', 45, true], ['no', 'No', 212, false]] as const).forEach(([id, label, bx, accept]) => {
    const c = b.add('CWindowTaskTextSwitch', `opt:${id}`, { x: bx, y: 112, w: 80, h: 24 }, { label, align: 1, state: on ? 'normal' : 'disabled', enabled: on });
    b.on(c, { key: `npc-start:${id}`, label, click: () => { if (on) d.send(accept ? { type: 'npcAnswer', accept: true } : { type: 'npcDismiss' }); } });
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
.npc-balloon .says { position: absolute; left: 44px; top: 26px; width: 380px; height: 96px; display: flex; align-items: center; white-space: pre-wrap; }
.npc-balloon .mark { position: absolute; right: 22px; bottom: 6px; width: 14px; height: 14px; }
.npc-balloon .mark::before { content: ''; position: absolute; left: 3px; top: 0; width: 8px; height: 8px; background: #f08a1c; clip-path: polygon(30% 0, 70% 0, 70% 40%, 100% 40%, 50% 100%, 0 40%, 30% 40%); }
.npc-balloon .mark::after { content: ''; position: absolute; left: 0; top: 9px; width: 14px; height: 4px; border: 1px solid #555; border-top: 0; box-sizing: border-box; }
.npc-balloon:disabled .mark { visibility: hidden; }
.npc-info { position: absolute; left: 0; top: 0; width: 335px; height: 382px; box-sizing: border-box; border: 4px solid #4ae36a;
  border-radius: 3px; background: rgba(255,255,255,.62); font: 16px/16px Arial, Helvetica, sans-serif; letter-spacing: 1px; color: #111; }
.npc-info > div { position: absolute; left: 4px; right: 4px; white-space: nowrap; }
.npc-info .name { top: 4px; height: 34px; background: rgba(150,150,150,.35); color: #ec1c1c; text-align: center; line-height: 22px; }
.npc-info .band { top: 38px; height: 32px; background: rgba(140,140,140,.45); }
.npc-info .white { top: 70px; height: 32px; background: rgba(255,255,255,.75); }
.npc-info .bio { top: 104px; bottom: 4px; white-space: pre-wrap; word-break: break-all; line-height: 15.6px; letter-spacing: .75px; overflow: hidden; }
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
    box.onclick = () => { if (!box.disabled && st.next) void api.click(st.next); };
    return st;
  },
  update(win, _prev, root, _api, st) {
    const w = win as BalloonWin, s = st as { box: HTMLButtonElement; who: HTMLElement; says: HTMLElement; next: number };
    s.who.textContent = w.name ?? ''; s.says.textContent = w.text ?? ''; s.next = w.next ?? 0;
    s.box.disabled = !!w.blocked; s.box.setAttribute('aria-label', `${w.name ?? ''}: ${w.text ?? ''} (${w.label ?? 'Next'})`);
    root.style.overflow = 'visible';
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
    s.name.textContent = w.name ?? '';
    const [wl, wv] = s.band.children as unknown as HTMLElement[], [dl, dv] = s.white.children as unknown as HTMLElement[];
    wl!.textContent = 'Win%'; wv!.textContent = w.record ?? ''; dl!.textContent = 'Deck Name'; dv!.textContent = w.deck ?? '';
    s.card.setAttribute('aria-label', `${w.name ?? ''}: ${w.record ?? ''}`);
  },
  unmount(root) { root.replaceChildren(); },
};
