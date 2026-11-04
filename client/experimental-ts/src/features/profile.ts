import { command, payload, PayloadReader } from '../gameplay/binary';
import type { GameplayCommand } from '../gameplay/binary';
import { worldCommands } from '../gameplay/commands';
import { decodeComments, decodePlayers, decodePresence } from '../gameplay/world';
import type { PlayerSummary } from '../gameplay/world';
import type { WireMessage } from '../network/codec';

/** Exact legacy order: NetLobby_Rooms.cpp onPlayerInfo. Unknown fields retain offset names. */
export interface ProfileDetails {
  pid: number; name: string; level: number; score: number; mp: number;
  w0b0: readonly number[]; turns: number; surrenderMe: number; surrenderOpponent: number;
  lpTotal: number; sideSwaps: number; w0e0: readonly number[]; u0ec: readonly number[];
  comebackWins: number; comebackLosses: number; unk108: number; unk10c: number; unk110: number;
  titleId: number; unk116: number; tp: number;
}
export interface ProfileLocation { pid: number; name: string; x: number; y: number; direction: number }
export function decodeProfileDetails(data: Uint8Array): { result: number; details: ProfileDetails | null } {
  const r = new PayloadReader(data), result = r.i32();
  if (result !== 0) { r.end(); return { result, details: null }; }
  const pid = r.u32(), name = r.text(16), level = r.u8(), score = r.u32(), mp = r.u32();
  const w0b0 = Array.from({ length: 15 }, () => r.u16()); w0b0.splice(11, 0, 0);
  const turns = r.u32(), surrenderMe = r.u16(), surrenderOpponent = r.u16(), lpTotal = r.u32(), sideSwaps = r.u32();
  const w0e0 = Array.from({ length: 6 }, () => r.u16()), u0ec = Array.from({ length: 6 }, () => r.u32());
  const comebackWins = r.u16(), comebackLosses = r.u16(), unk108 = r.u16(), unk10c = r.i32(), unk110 = r.u16(), titleId = r.u16(), unk116 = r.u16(), tp = r.u32();
  w0b0[11] = r.u16(); r.end();
  return { result, details: { pid, name, level, score, mp, w0b0, turns, surrenderMe, surrenderOpponent, lpTotal, sideSwaps, w0e0, u0ec, comebackWins, comebackLosses, unk108, unk10c, unk110, titleId, unk116, tp } };
}
export function decodeProfileLocation(data: Uint8Array): { result: number; location: ProfileLocation | null } {
  const r = new PayloadReader(data), result = r.i32();
  if (result !== 0) { r.end(); return { result, location: null }; }
  const location = { pid: r.u32(), name: r.text(16), x: r.u16(), y: r.u16(), direction: r.u8() }; r.end();
  return { result, location };
}
export type ProfileDraft = 'playerId' | 'comment' | 'title';
export type ProfileAction =
  | { type: 'setSelf'; pid: number | null }
  | { type: 'open'; pid: number }
  | { type: 'close' }
  | { type: 'refresh' }
  | { type: 'editDraft'; field: ProfileDraft; value: string }
  | { type: 'saveComment'; line: 0 | 1 }
  | { type: 'setTitle'; bit: number };
export interface ProfileState {
  selfPid: number | null; selectedPid: number | null; details: ProfileDetails | null; location: ProfileLocation | null;
  summary: PlayerSummary | null; comments: readonly [string | null, string | null];
  drafts: Readonly<Record<ProfileDraft, string>>; loading: boolean;
  pending: 'comment' | 'title' | null; status: string; error: string | null;
}
const initial = (): ProfileState => ({ selfPid: null, selectedPid: null, details: null, location: null, summary: null, comments: [null, null], drafts: { playerId: '', comment: '', title: '' }, loading: false, pending: null, status: 'Choose a player.', error: null });
function validPid(n: number): number { if (!Number.isInteger(n) || n <= 0 || n >= 0xffffffff) throw new Error('Enter a valid player id.'); return n; }

export class ProfileController {
  private current = initial();
  private disposed = false;
  private infoPending: number | null = null;
  private locationPending: number | null = null;
  private mutation: { type: 'comment'; line: 0 | 1; text: string; pid: number } | { type: 'title'; bit: number; pid: number } | null = null;
  constructor(private readonly options: { send: (command: GameplayCommand) => void; onChange: (state: ProfileState) => void }) {}
  get state(): ProfileState { return this.current; }
  private update(patch: Partial<ProfileState>): void { this.current = { ...this.current, ...patch }; this.options.onChange(this.current); }
  reset(): void { if (this.disposed) return; this.infoPending = this.locationPending = null; this.mutation = null; this.current = initial(); this.options.onChange(this.current); }
  dispose(): void { this.disposed = true; this.infoPending = this.locationPending = null; this.mutation = null; }
  private requestDetails(): void {
    const pid = this.current.selectedPid; if (pid === null) return;
    if (this.infoPending === null) { this.infoPending = pid; try { this.options.send(worldCommands.playerInfo(pid)); } catch (error) { this.infoPending = null; this.update({ loading: false }); throw error; } }
    if (this.locationPending === null) { this.locationPending = pid; try { this.options.send(worldCommands.avatarInfo(pid)); } catch (error) { this.locationPending = null; this.update({ loading: this.infoPending !== null }); throw error; } }
  }
  dispatch(action: ProfileAction): void {
    if (this.disposed) return;
    try {
      if (action.type === 'setSelf') { if (action.pid !== null) validPid(action.pid); this.update({ selfPid: action.pid }); return; }
      if (action.type === 'editDraft') {
        const max = action.field === 'playerId' ? 10 : 31;
        if (!Object.hasOwn(this.current.drafts, action.field) || action.value.length > max) throw new Error(`Draft exceeds ${max} characters.`);
        this.update({ drafts: { ...this.current.drafts, [action.field]: action.value } }); return;
      }
      if (action.type === 'close') {
        // Late replies for the closed player are ignored by the pid checks in receive().
        this.update({ selectedPid: null, details: null, location: null, summary: null, comments: [null, null], loading: false, error: null, status: 'Choose a player.' }); return;
      }
      if (action.type === 'open' || action.type === 'refresh') {
        const pid = validPid(action.type === 'open' ? action.pid : this.current.selectedPid ?? 0);
        if (pid !== this.current.selectedPid) this.update({ selectedPid: pid, details: null, location: null, summary: null, comments: [null, null] });
        this.update({ loading: true, error: null, status: 'Loading profile…' });
        this.requestDetails();
        this.options.send(worldCommands.players(pid)); this.options.send(worldCommands.comments(0, pid)); this.options.send(worldCommands.comments(1, pid)); return;
      }
      const s = this.current;
      if (s.selfPid === null || s.selectedPid !== s.selfPid) throw new Error('Open your own profile to edit it.');
      if (this.mutation) throw new Error('Wait for the pending profile update.');
      let cmd: GameplayCommand;
      if (action.type === 'saveComment') {
        if (action.line !== 0 && action.line !== 1) throw new Error('Invalid comment line.');
        const text = s.drafts[action.line === 0 ? 'comment' : 'title'];
        if (text.length > 31 || /[^\x20-\xff]/.test(text)) throw new Error('Use at most 31 printable Latin-1 characters.');
        cmd = worldCommands.comment(action.line, text); this.mutation = { type: 'comment', line: action.line, text, pid: s.selfPid };
      } else {
        if (!Number.isInteger(action.bit) || action.bit < 0 || action.bit > 65535) throw new Error('Invalid title ownership bit.');
        cmd = command(0x4174, payload().u32(action.bit).build()); this.mutation = { type: 'title', bit: action.bit, pid: s.selfPid };
      }
      this.update({ pending: this.mutation.type, error: null, status: 'Awaiting server confirmation…' });
      try { this.options.send(cmd); } catch (error) { this.mutation = null; this.update({ pending: null }); throw error; }
    } catch (error) { this.update({ error: error instanceof Error ? error.message : String(error) }); }
  }
  receive(message: Pick<WireMessage, 'id' | 'data'>): void {
    if (this.disposed) return;
    const { id, data } = message;
    try {
      if (id === 0x4160 || id === 0x5340) {
        const info = id === 0x4160, expected = info ? this.infoPending : this.locationPending;
        if (expected === null) return;
        const decoded = info ? decodeProfileDetails(data) : decodeProfileLocation(data);
        const value = 'details' in decoded ? decoded.details : decoded.location;
        if (value && value.pid !== expected) return;
        if (info) this.infoPending = null; else this.locationPending = null;
        if (expected === this.current.selectedPid) {
          if (decoded.result !== 0) this.update({ error: `Profile request rejected (${decoded.result}).` });
          else if ('details' in decoded) this.update({ details: decoded.details, status: 'Profile received. Statistics in this response are server placeholders.' });
          else this.update({ location: decoded.location });
        }
        if (expected !== this.current.selectedPid) this.requestDetails();
        this.update({ loading: this.infoPending !== null || this.locationPending !== null }); return;
      }
      if (id === 0x4212) { const summary = decodePlayers(data).find(p => p.pid === this.current.selectedPid); if (summary) this.update({ summary }); return; }
      if (id === 0x3112) {
        const p = decodePresence(data); if (p.pid !== this.current.selectedPid) return;
        if (p.kind === 'join') this.update({ summary: p.player });
        else if (p.kind === 'leave') this.update({ summary: null, status: 'Player left this block.' });
        else if (this.current.summary) this.update({ summary: { ...this.current.summary, state: p.state, block: p.block } }); return;
      }
      if (id === 0x421a || id === 0x421e || id === 0x4180) {
        let line: 0 | 1, entries: { pid: number; text: string }[];
        if (id === 0x4180) { const r = new PayloadReader(data), pid = r.u32(), index = r.u8(), text = r.text(32); r.end(); if (index > 1) throw new Error('Invalid comment line'); line = index as 0 | 1; entries = [{ pid, text }]; }
        else { line = id === 0x421a ? 0 : 1; entries = decodeComments(data); }
        const entry = entries.find(e => e.pid === this.current.selectedPid);
        if (entry) { const comments: [string | null, string | null] = [...this.current.comments]; comments[line] = entry.text; this.update({ comments }); } return;
      }
      if (id === 0x4173 || id === 0x4175) {
        const pending = this.mutation;
        if (!pending || (id === 0x4173) !== (pending.type === 'comment')) return;
        const r = new PayloadReader(data), result = r.i32(); r.end(); this.mutation = null;
        if (result === 0 && pending.type === 'comment' && this.current.selectedPid === pending.pid) {
          const comments: [string | null, string | null] = [...this.current.comments]; comments[pending.line] = pending.text; this.update({ comments });
        }
        this.update({ pending: null, status: result === 0 ? pending.type === 'comment' ? 'Server accepted comment for this session.' : 'Server accepted title update.' : `Profile update rejected (${result}).`, error: result === 0 ? null : `Server rejected profile update (${result}).` });
      }
    } catch (error) { this.update({ error: `Profile message: ${error instanceof Error ? error.message : String(error)}` }); }
  }
}
