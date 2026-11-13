import { BinaryReader, BinaryWriter } from '../network/codec';
import type { WireMessage } from '../network/codec';

export type NpcStage = 'idle' | 'opening' | 'ask' | 'greeting' | 'duel' | 'after-duel' | 'won' | 'lost' | 'item' | 'claiming' | 'done';
export type ClaimStatus = 'idle' | 'pending' | 'confirmed' | 'failed' | 'uncertain';
/** Omit unknown progress; never substitute a zero-filled record. */
/** record: this character's wins / losses / draws against the NPC from the server's NPCBIN (bytes 0..2 of the NPC's
 * entry, server persist.ts npcResult), for the NPC result record (CWindowResultNpc). */
export interface NpcOpenContext { npcRank?: number; specialPresentDone?: boolean; record?: readonly [number, number, number] }
export interface NpcRecord { wins: number; loses: number; draws: number }
export interface NpcIdentity { id: number; name: string }
export interface NpcDialogue { npcId: number; line: number | null; text: string; known: boolean }
export interface NpcEligibility { status: ClaimStatus; refreshing: boolean; bits: number[]; cards: number[]; }
export interface NpcState {
  stage: NpcStage; npc: NpcIdentity | null; dialogue: NpcDialogue | null; result: 1 | 2 | 3 | null;
  present: 0 | 1 | 2; packs: number[]; packStatus: ClaimStatus; giftStatus: ClaimStatus;
  cards: { id: number; isNew: boolean }[]; giftCards: number[]; giftBits: number[];
  firstContactStatus: ClaimStatus; settlementReceived: boolean; refreshPending: boolean; error: string | null;
  eligibility: NpcEligibility;
  /** The record against this NPC (CWindowResultNpc): the server's NPCBIN at the talk, plus this duel's server result
   * once it ends (the server counts the same result: persist.ts npcResult, capped at 255). Absent when unknown. */
  record?: NpcRecord | null;
  /** The text on the NPC's card in its talk (CNpcListMenu::conditionText), when the data has it. */
  bio?: string;
}
export interface NpcOptions {
  send(id: number, data: Uint8Array): void;
  onChange?(state: Readonly<NpcState>): void;
  onStartDuel(npcId: number): void | Promise<void>;
  onRefreshCollection?(): void | Promise<void>;
  resolveLine?(npcId: number, line: number): string | null | undefined;
  resolvePresentText?(textId: number): string | null | undefined;
  /** The NPC card's text (its bio) in the chosen language. */
  resolveBio?(npcId: number): string | null | undefined;
  /** Refresh authoritative PBIN/NPCBIN after ITEMGET(1); its receipt can hide right bits. */
  onRefreshProgress?(): void | Promise<void>;
  /** Original duelResultLine (PE 0x007918c0) line for the finished duel, or null while its inputs are incomplete;
   * see `npcResultLine` in ../npcs/result.ts. Call `refreshResultLine()` when they complete. */
  resultLine?(result: 1 | 2 | 3): number | null;
}
const initial = (): NpcState => ({ stage: 'idle', npc: null, dialogue: null, result: null, present: 0,
  packs: [], packStatus: 'idle', giftStatus: 'idle', cards: [], giftBits: [], giftCards: [],
  firstContactStatus: 'idle', settlementReceived: false, refreshPending: false, error: null,
  eligibility: { status: 'idle', refreshing: false, bits: [], cards: [] } });

/** Dialogue and grant orchestration only. The server owns outcomes, inventory and reward eligibility.
 * Reset on logout/character change. Never automatically replay a claim across a reconnect. */
export class NpcController {
  private value = initial();
  private disposed = false;
  private generation = 0;
  private refreshing = false;
  private refreshToken = 0;
  private presentReceived = false;
  private refreshAgain = false;
  private authFlags = 0;
  private openingBlocked = false;
  private contacts = new Map<number, ClaimStatus>();
  /** The lines still to come in the balloon's run (npcLineRun): a click shows the next before the talk goes on. */
  private run: number[] = [];
  constructor(private readonly options: NpcOptions) {}
  get state(): Readonly<NpcState> { return this.value; }
  private emit(): void { if (!this.disposed) this.options.onChange?.(this.value); }
  private patch(patch: Partial<NpcState>): void { this.value = { ...this.value, ...patch }; this.emit(); }
  private dialogue(line: number | null): NpcDialogue {
    const npcId = this.value.npc!.id;
    const text = line === null ? null : this.options.resolveLine?.(npcId, line);
    return { npcId, line, text: text || (line === 10 ? '…?' : '[Original NPC dialogue unavailable]'), known: !!text };
  }
  /** The NPC says `line` and the rest of its run (live's waist-up balloon: Kain's first meeting is lines 0 to 4, then
   * "Start Duel?"); the lines that follow are shown one per click. */
  private say(line: number | null): NpcDialogue {
    const npcId = this.value.npc!.id;
    this.run = line === null ? [] : npcLineRun(line).filter((l, i, all) => all.slice(0, i + 1).every(k => !!this.options.resolveLine?.(npcId, k)));
    return this.dialogue(line);
  }
  /** The next line of the balloon's run, if any is left. */
  private nextInRun(): boolean {
    const next = this.run.shift(); if (next === undefined) return false;
    this.patch({ dialogue: this.dialogue(next) }); return true;
  }
  /** Original CAreaMapScene::onInit requests ITEMGET(1,0), not a guessed NPC gift.
   * Serialize it with all uncorrelated ITEMGET receipts and never replay uncertain sends. */
  checkEligibility(): boolean {
    const s = this.value;
    if (this.disposed || !['idle', 'done'].includes(s.stage) || s.eligibility.refreshing || ['pending', 'uncertain'].includes(s.eligibility.status) ||
      ['pending', 'uncertain'].includes(s.firstContactStatus) || ['pending', 'uncertain'].includes(s.giftStatus) || s.packStatus === 'pending' || s.packs.length > 0 && s.packStatus === 'idle') return false;
    this.patch({ eligibility: { status: 'pending', refreshing: false, bits: [], cards: [] }, error: null });
    try { this.options.send(0x5204, new BinaryWriter().u16(1).u32(0).bytes()); }
    catch { if (this.value.eligibility.status === 'pending') this.patch({ eligibility: { ...this.value.eligibility, status: 'uncertain' }, error: 'NPC eligibility delivery is uncertain. Disconnect and reconnect to refresh progress; do not replay the request.' }); }
    return true;
  }
  private async refreshEligibilityProgress(): Promise<void> {
    const generation = this.generation;
    try { await this.options.onRefreshProgress?.(); }
    catch { if (!this.disposed && generation === this.generation) this.patch({ error: 'NPC progress refresh failed. Re-enter the world to refresh eligibility before trying again.' }); }
    finally { if (!this.disposed && generation === this.generation) this.patch({ eligibility: { ...this.value.eligibility, refreshing: false } }); }
  }
  open(npc: NpcIdentity, authFlags = 0, context?: NpcOpenContext): void {
    if (this.disposed || !['idle', 'done'].includes(this.value.stage)) return;
    if (!Number.isInteger(npc.id) || npc.id < 1 || npc.id > 0xffff) throw new RangeError('Invalid NPC');
    if (this.value.eligibility.refreshing || this.value.eligibility.status === 'pending') throw new Error('NPC eligibility is still being checked. Wait for the server before trying again.');
    if (this.value.eligibility.status === 'uncertain') throw new Error('NPC eligibility delivery is uncertain. Disconnect and reconnect to refresh progress before trying again.');
    if (context?.npcRank !== undefined && (!Number.isInteger(context.npcRank) || context.npcRank < 0 || context.npcRank > 255 || npc.id >= 128)) throw new RangeError('Invalid NPC progress');
    // (an earlier first meeting's acknowledgement still out does not hold the next talk: live sends ITEMGET(4) and goes on;
    // the server answers in order, and a late empty acknowledgement grants nothing)
    this.generation++; this.presentReceived = false; this.authFlags = authFlags; this.openingBlocked = false; this.run = [];
    const rec = context?.record, byte = (n: number | undefined) => Number.isInteger(n) && n! >= 0 && n! <= 255;
    this.value = { ...initial(), eligibility: this.value.eligibility, npc: { ...npc }, stage: 'ask',
      record: rec && rec.length === 3 && rec.every(byte) ? { wins: rec[0], loses: rec[1], draws: rec[2] } : null };
    const bio = this.options.resolveBio?.(npc.id); if (bio) this.value.bio = bio;
    if (context) {
      this.value.stage = 'opening';
      const present = npcOpeningPresent(npc.id);
      if (present && context.specialPresentDone !== true) {
        this.openingBlocked = true;
        const lines = Array.from({ length: 5 }, (_, index) => this.options.resolvePresentText?.(present.textId + index));
        const known = lines.every(line => typeof line === 'string');
        this.value.dialogue = { npcId: npc.id, line: null, text: known ? lines.join('\n').trim() : '[Original NPC eligibility dialogue unavailable]', known };
        this.value.error = context.specialPresentDone === false ? 'This NPC requires a duel right that this character does not currently have.' : 'NPC eligibility data is unavailable. Refresh progress before duelling.';
      } else {
        const seen = this.contacts.get(npc.id) === 'confirmed';
        this.value.dialogue = this.say(seen || (context.npcRank !== undefined && context.npcRank > 0) ? 5 : context.npcRank === 0 ? 0 : null);
        if (context.npcRank === 0 && !seen) {
          this.contacts.set(npc.id, 'pending'); this.value.firstContactStatus = 'pending';
          try { this.options.send(0x5204, new BinaryWriter().u16(4).u32(npc.id).bytes()); }
          catch { if (this.contacts.get(npc.id) === 'pending') { this.contacts.set(npc.id, 'uncertain'); this.value.firstContactStatus = 'uncertain'; this.value.error = 'First-contact delivery is uncertain. Reload authoritative NPC progress; do not replay.'; } }
        }
      }
    } else if (authFlags & 0x100) { this.value.stage = 'greeting'; this.value.dialogue = this.say(10); }
    this.emit();
  }
  async answer(yes: boolean): Promise<void> {
    // (live asks "Start Duel?" without waiting for the first meeting's acknowledgement)
    if (this.disposed || this.value.stage !== 'ask') return;
    if (!yes) { this.patch({ stage: 'greeting', dialogue: this.say(10) }); return; }
    const generation = this.generation, id = this.value.npc!.id;
    this.run = []; this.patch({ stage: 'duel', dialogue: null, error: null });
    try { await this.options.onStartDuel(id); }
    catch (error) {
      if (!this.disposed && generation === this.generation) this.patch({ stage: 'done', error: `NPC duel failed: ${String(error)}` });
    }
  }
  /** Called once for this NPC after a server result, including after lobby handoff. */
  afterDuel(result: 1 | 2 | 3): void {
    if (this.disposed || this.value.stage !== 'duel') return;
    const r = this.value.record, bump = (n: number) => Math.min(n + 1, 255);
    const record = r ? { wins: result === 1 ? bump(r.wins) : r.wins, loses: result === 2 ? bump(r.loses) : r.loses, draws: result === 3 ? bump(r.draws) : r.draws } : r;
    this.patch({ stage: 'after-duel', result, record, dialogue: this.say(this.options.resultLine?.(result) ?? null) });
  }
  /** Re-reads `resultLine` while the result-opening line is still unresolved (the duel's type0x4d finish record
   * arrives after C_DUEL_END). A resolved line, a later stage or another NPC session is never rewritten. */
  refreshResultLine(): void {
    const s = this.value;
    if (this.disposed || s.stage !== 'after-duel' || !s.result || s.dialogue?.line != null) return;
    const line = this.options.resultLine?.(s.result) ?? null;
    if (line !== null) this.patch({ dialogue: this.say(line) });
  }
  advance(): void {
    if (this.disposed) return;
    const s = this.value;
    // the balloon's run first (a result line waits for the server's settlement, as the talk after it does)
    if (s.dialogue && ['opening', 'greeting', 'won', 'lost', 'item'].includes(s.stage) && !(s.stage === 'opening' && this.openingBlocked) && this.nextInRun()) return;
    if (s.dialogue && s.stage === 'after-duel' && s.settlementReceived && this.nextInRun()) return;
    if (s.stage === 'opening') {
      // a special NPC's refusal (no duel right yet): its click ends the talk, as live (no panel left to close)
      if (this.openingBlocked) { this.patch({ stage: 'done', dialogue: null }); this.close(); }
      else if (this.authFlags & 0x100) this.patch({ stage: 'greeting', dialogue: this.say(10) });
      // the run said, live asks "Start Duel?" (CNpcListMenu::stepAsk)
      else this.patch({ stage: 'ask', dialogue: null });
    } else if (s.stage === 'ask' && s.dialogue) this.patch({ dialogue: null });
    // the decline said, the talk ends (CNpcListMenu::stepTalkDone: the menu closes, the NPC goes back)
    else if (s.stage === 'greeting') { this.patch({ stage: 'done', dialogue: null }); this.close(); }
    else if (s.stage === 'after-duel' && s.settlementReceived) {
      if (s.present === 1) this.patch({ stage: s.result === 1 ? 'won' : 'lost', dialogue: this.say(s.result === 1 ? 0x45 : 0x4a) });
      else if (s.present === 2) this.patch({ stage: 'item', dialogue: this.say(0x4f) });
      else this.patch({ stage: 'done', dialogue: null });
    } else if (['won', 'lost', 'item'].includes(s.stage) && s.giftStatus === 'idle') {
      this.patch({ stage: 'claiming', dialogue: null, giftStatus: 'pending' });
      this.sendClaim('giftStatus', 0x5204, new BinaryWriter().u16(3).u32(0).bytes());
    }
  }
  /** Leave the talk before a duel (the original's balloon and Start Duel? close with No, Escape or a click away):
   * nothing was claimed, so nothing waits on the server. A first meeting still being confirmed stays. */
  dismiss(): boolean {
    const s = this.value;
    if (this.disposed || !['opening', 'ask', 'greeting'].includes(s.stage) || !npcTalkClosable({ ...s, stage: 'done' })) return false;
    this.patch({ stage: 'done', dialogue: null });
    return this.close();
  }
  selectPack(pack: number): void {
    if (this.disposed || !this.value.result || !this.value.settlementReceived || this.value.packStatus !== 'idle' || !this.value.packs.includes(pack)) return;
    this.patch({ packStatus: 'pending', error: null });
    this.sendClaim('packStatus', 0x4802, new BinaryWriter().u16(pack).bytes());
  }
  private sendClaim(key: 'giftStatus' | 'packStatus', id: number, data: Uint8Array): void {
    try { this.options.send(id, data); }
    catch { if (this.value[key] !== 'pending') return; this.patch({ [key]: 'uncertain', error: 'Claim delivery is uncertain. Refresh inventory; do not replay the claim.' }); }
  }
  /** Transport interruption: preserve confirmed receipts, mark unresolved claims uncertain. */
  disconnected(): void {
    if (this.disposed) return;
    if (this.value.firstContactStatus === 'pending') this.contacts.set(this.value.npc!.id, 'uncertain');
    this.patch({ eligibility: this.value.eligibility.status === 'pending' ? { ...this.value.eligibility, status: 'uncertain' } : this.value.eligibility,
      firstContactStatus: this.value.firstContactStatus === 'pending' ? 'uncertain' : this.value.firstContactStatus,
      packStatus: this.value.packStatus === 'pending' ? 'uncertain' : this.value.packStatus,
      giftStatus: this.value.giftStatus === 'pending' ? 'uncertain' : this.value.giftStatus });
  }
  async refreshCollection(): Promise<void> {
    if (this.disposed || !this.options.onRefreshCollection) return;
    if (this.refreshing) { this.refreshAgain = true; this.patch({ refreshPending: true }); return; }
    const generation = this.generation, token = ++this.refreshToken; this.refreshing = true;
    this.patch({ refreshPending: true });
    try { await this.options.onRefreshCollection(); }
    catch { if (generation === this.generation && !this.disposed) this.patch({ error: 'Inventory refresh failed. Refresh again to reconcile confirmed rewards.' }); }
    finally { if (token === this.refreshToken && !this.disposed) { this.refreshing = false; if (generation === this.generation) this.patch({ refreshPending: false }); if (this.refreshAgain) { this.refreshAgain = false; void this.refreshCollection(); } } }
  }
  receive(message: WireMessage): void {
    if (this.disposed) return;
    if (message.id === 0x5205 && ['pending', 'uncertain'].includes(this.value.eligibility.status)) {
      try {
        const grant = readGrant(message.data);
        this.patch({ eligibility: { status: 'confirmed', refreshing: !!this.options.onRefreshProgress, ...grant }, error: null });
        if (grant.cards.length) void this.refreshCollection();
        if (this.options.onRefreshProgress) void this.refreshEligibilityProgress();
      } catch { this.patch({ error: 'Malformed NPC eligibility acknowledgement' }); }
      return;
    }
    if (!this.value.npc) return;
    if (message.id === 0x5205 && ['pending', 'uncertain'].includes(this.value.firstContactStatus)) {
      if (message.data.length !== 4 || message.data.some(byte => byte !== 0)) { this.patch({ error: 'Malformed NPC first-contact acknowledgement' }); return; }
      this.contacts.set(this.value.npc.id, 'confirmed'); this.patch({ firstContactStatus: 'confirmed', error: null }); return;
    }
    if (['idle', 'opening', 'ask', 'greeting'].includes(this.value.stage) || (this.value.stage === 'done' && this.value.result === null)) return;
    const { id, data } = message;
    if (![0x4237, 0x4800, 0x4803, 0x5205].includes(id)) return;
    try {
      const r = new BinaryReader(data);
      if (id === 0x4237) {
        if (this.presentReceived || this.value.settlementReceived || data.length !== 4) return;
        const kind = r.u32(); if (kind > 2) throw new Error('Unknown NPC present kind');
        this.presentReceived = true; this.patch({ present: kind as 0 | 1 | 2 });
      } else if (id === 0x4800) {
        if (this.value.settlementReceived) return;
        if (data.length % 2 || data.length > 512) throw new Error('Invalid pack list');
        const packs: number[] = []; while (r.remaining) { const pack = r.u16(); if (!pack) throw new Error('Invalid pack'); if (!packs.includes(pack)) packs.push(pack); }
        this.patch({ packs, settlementReceived: true });
      } else if (id === 0x4803 && ['pending', 'uncertain'].includes(this.value.packStatus)) {
        const result = r.u32();
        if (result) { this.patch({ packStatus: 'failed', error: `Server refused NPC pack (${result})` }); return; }
        if (!r.remaining || r.remaining % 5 || r.remaining > 2400) throw new Error('Invalid card receipt');
        const cards: NpcState['cards'] = [];
        while (r.remaining) { const card = r.u32(), flag = r.u8(); if (!card || flag > 1) throw new Error('Invalid card'); cards.push({ id: card, isNew: flag === 1 }); }
        this.patch({ cards, packStatus: 'confirmed' }); void this.refreshCollection();
      } else if (id === 0x5205 && ['pending', 'uncertain'].includes(this.value.giftStatus)) {
        const count = r.u16(); if (count > 480) throw new Error('Too many gift bits');
        const giftBits = Array.from({ length: count }, () => r.u16());
        const cardCount = r.u16(); if (cardCount + count > 480 || r.remaining !== cardCount * 4) throw new Error('Invalid gift receipt');
        const giftCards = Array.from({ length: cardCount }, () => r.u32());
        if (giftCards.some(c => !c)) throw new Error('Invalid gift card');
        this.patch({ stage: 'done', giftStatus: 'confirmed', giftBits, giftCards }); void this.refreshCollection();
      }
    } catch { this.patch({ error: 'Malformed NPC reward message' }); }
  }
  /** Dismiss completed presentation without forgetting per-session contact attempts. */
  close(): boolean {
    // live never holds the player in a talk for a background check: the world's eligibility check and a first contact's
    // acknowledgement go on after it (eligibility is kept across the close, contacts by NPC id); only a reward the
    // server is still settling, or a pack still to pick, keeps the talk open
    if (this.disposed || !npcTalkClosable(this.value)) return false;
    this.generation++; this.refreshToken++; this.refreshing = false; this.refreshAgain = false; this.presentReceived = false; this.run = [];
    this.value = { ...initial(), eligibility: this.value.eligibility }; this.emit(); return true;
  }
  reset(): void { if (this.disposed) return; this.run = []; this.generation++; this.refreshToken++; this.refreshing = false; this.refreshAgain = false; this.presentReceived = false; this.contacts.clear(); this.openingBlocked = false; this.authFlags = 0; this.value = initial(); this.emit(); }
  dispose(): void { this.reset(); this.disposed = true; }
}

/** The talk may end now (close): it is said and done, and no reward is waiting on the server or on the player's pick. */
/** The lines a balloon that opens with `line` runs through (fuki_index.csv's layout, as live plays it): the first
 * meeting 0-4 and the next meetings 5-9 are runs of five, 10 (the decline) to 33 (the duel's lines) single lines, and
 * from 34 the result and present lines runs of five again (34-38 ... 79-83). A run ends at its first missing line. */
export function npcLineRun(line: number): number[] {
  const end = line < 10 ? Math.floor(line / 5) * 5 + 4 : line < 34 ? line : 34 + Math.floor((line - 34) / 5) * 5 + 4;
  return Array.from({ length: Math.max(0, Math.min(end, 83) - line) }, (_, i) => line + 1 + i);
}

export function npcTalkClosable(s: Readonly<Pick<NpcState, 'stage' | 'giftStatus' | 'packStatus' | 'packs'>>): boolean {
  return ['idle', 'done'].includes(s.stage) && s.giftStatus !== 'pending' && s.packStatus !== 'pending' && !(s.packs.length > 0 && s.packStatus === 'idle');
}

function readGrant(data: Uint8Array): { bits: number[]; cards: number[] } {
  const r = new BinaryReader(data), count = r.u16();
  if (count > 480) throw new Error('Too many item bits');
  const bits = Array.from({ length: count }, () => r.u16()), cardCount = r.u16();
  if (count + cardCount > 480 || r.remaining !== cardCount * 4) throw new Error('Invalid item receipt');
  const cards = Array.from({ length: cardCount }, () => r.u32()); if (cards.some(card => !card)) throw new Error('Invalid item card');
  return { bits, cards };
}

/** Static original predicates, not server grant rights. PE 0xa56060 / 0xa55cd0, source presentFor. */
export function npcOpeningPresent(npcId: number): { completionBit: number; textId: number } | null {
  if (npcId === 0x36) return { completionBit: 0x250, textId: 0x63e2 };
  if (npcId === 0x42) return { completionBit: 0x251, textId: 0x655e };
  if (npcId === 0x4b) return { completionBit: 0x252, textId: 0x6aae };
  return null;
}
