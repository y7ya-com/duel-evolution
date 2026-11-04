import { ApiError, HttpClient, ResponseError } from '../services/http';

export type BoxId = 'hair' | 'dueldisk' | 'outfit';
export type Rarity = 'common' | 'rare' | 'super' | 'ultra';
export interface Player { pid: number; name: string }
export interface Cosmetic {
  id: string; name: string; kind: BoxId; rarity: Rarity; slot: number;
  variants: { gender: 'male' | 'female'; bit: number; number: number; worlds: number[]; name?: string }[];
  owned: boolean; compatible: boolean; copies: number; tradable: number; artwork?: string;
}
export type Odds = Record<Rarity, number>;
export interface CosmeticBox {
  id: BoxId; name: string; price: number; available: boolean; baseOdds: Odds; nextOdds: Odds;
  pity: { superMisses: number; ultraMisses: number; superAt: number; ultraAt: number | null };
  pool: (Cosmetic & { baseChance: number; nextChance: number })[];
}
export interface TradeLine { id: string; count: number }
export interface CosmeticOffer {
  id: string; fromPid: number; fromName: string; toPid: number; toName: string;
  give: TradeLine[]; want: TradeLine[]; outbound: boolean; expiresAt: number;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
}
export interface AppearanceOption { index: number; label: string; choices: { value: number; label: string }[] }
export interface CosmeticsState {
  available: true; wallet: { total: number; bound: number; earned: number }; nextRequestId: string; selfPid: number;
  players: Player[]; boxes: CosmeticBox[]; inventory: Cosmetic[]; catalog: Cosmetic[]; trades: CosmeticOffer[];
  appearance: { gender: 'male' | 'female'; world: number; parts: number[]; looks: Record<'0' | '1', number[]> };
  appearanceOptions: AppearanceOption[]; appearanceOptionsByWorld: Record<'0' | '1', AppearanceOption[]>;
  requestId?: string; reward?: Cosmetic & { duplicate: boolean }; replay?: boolean;
  offer?: CosmeticOffer; equipped?: { id: string; world: number; parts: number[] }; appearanceUpdated?: boolean;
}
export interface TagInvitation {
  id: string; hostPid: number; expires: number; outbound: boolean;
  seats: (Player & { role: 'captain' | 'opponent' | 'teammate' | 'opponent-teammate'; accepted: boolean })[];
}
export interface TagState {
  self: Player; active: boolean; available: boolean; reason?: string; players: Player[]; invitations: TagInvitation[];
  event?: { id: string; kind: string; at: number; name?: string }; started?: boolean;
}
export type OnlineAction =
  | { type: 'refresh' }
  | { type: 'open-box'; boxId: BoxId; requestId?: string }
  | { type: 'equip'; id: string; world?: number }
  | { type: 'appearance'; world?: number; gender?: 'male' | 'female'; parts?: number[] }
  | { type: 'trade'; targetPid: number; give: TradeLine[]; want: TradeLine[]; requestId: string }
  | { type: 'trade-accept' | 'trade-decline' | 'trade-cancel'; offerId: string }
  | { type: 'tag-invite'; teammatePid: number; opponentPid: number; opponentTeammatePid: number }
  | { type: 'tag-accept' | 'tag-decline' | 'tag-cancel'; id: string };
export interface OnlineState {
  drafts: Record<string, string>;
  cosmetics: CosmeticsState | null; tag: TagState | null; loading: boolean; pending: OnlineAction['type'] | null;
  error: string | null; retryAction: OnlineAction | null;
  receipt: { action: OnlineAction['type']; cosmetics?: CosmeticsState; tag?: TagState } | null;
}

function bad(): never { throw new ResponseError('Invalid online response'); }
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(); return v as Record<string, unknown>; }
function str(v: unknown, max = 256): string { if (typeof v !== 'string' || v.length > max) return bad(); return v; }
function bool(v: unknown): boolean { if (typeof v !== 'boolean') return bad(); return v; }
function num(v: unknown, max = Number.MAX_SAFE_INTEGER): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return bad(); return v; }
function nat(v: unknown, max = Number.MAX_SAFE_INTEGER): number { const n = num(v, max); if (!Number.isSafeInteger(n)) return bad(); return n; }
function list<T>(v: unknown, read: (x: unknown) => T, max = 2048): T[] { if (!Array.isArray(v) || v.length > max) return bad(); return v.map(read); }
function one<T extends string>(v: unknown, choices: readonly T[]): T { if (!choices.includes(v as T)) return bad(); return v as T; }
const kinds = ['hair', 'dueldisk', 'outfit'] as const;
const rarities = ['common', 'rare', 'super', 'ultra'] as const;
const genders = ['male', 'female'] as const;
function player(v: unknown): Player { const o = obj(v); return { pid: nat(o.pid), name: str(o.name) }; }
function parts(v: unknown): number[] { const a = list(v, x => nat(x, 255), 16); if (a.length !== 16) return bad(); return a; }
function world(v: unknown): number { return nat(v, 1); }
function token(v: unknown): string { const s = str(v, 15); if (!/^(0|[1-9][0-9]{0,14})$/.test(s)) return bad(); return s; }
function cosmetic(v: unknown): Cosmetic {
  const o = obj(v);
  return { id: str(o.id), name: str(o.name), kind: one(o.kind, kinds), rarity: one(o.rarity, rarities), slot: nat(o.slot, 15),
    owned: bool(o.owned), compatible: bool(o.compatible), copies: nat(o.copies), tradable: nat(o.tradable),
    ...(o.artwork === undefined ? {} : { artwork: str(o.artwork) }),
    variants: list(o.variants, x => { const a = obj(x); return { gender: one(a.gender, genders), bit: nat(a.bit), number: nat(a.number, 255), worlds: list(a.worlds, world, 2), ...(a.name === undefined ? {} : { name: str(a.name) }) }; }, 16) };
}
function odds(v: unknown): Odds { const o = obj(v); return { common: num(o.common, 100), rare: num(o.rare, 100), super: num(o.super, 100), ultra: num(o.ultra, 100) }; }
function line(v: unknown): TradeLine { const o = obj(v); const count = nat(o.count, 99); if (!count) return bad(); return { id: str(o.id), count }; }
function offer(v: unknown): CosmeticOffer { const o = obj(v); return { id: str(o.id, 100), fromPid: nat(o.fromPid), fromName: str(o.fromName), toPid: nat(o.toPid), toName: str(o.toName), give: list(o.give, line, 10), want: list(o.want, line, 10), outbound: bool(o.outbound), expiresAt: nat(o.expiresAt), status: one(o.status, ['pending', 'accepted', 'cancelled', 'expired'] as const) }; }
function options(v: unknown): AppearanceOption[] { return list(v, x => { const o = obj(x); return { index: nat(o.index, 15), label: str(o.label), choices: list(o.choices, x => { const c = obj(x); return { value: nat(c.value, 255), label: str(c.label) }; }, 256) }; }, 16); }
export function decodeCosmetics(value: unknown): CosmeticsState {
  const o = obj(value), w = obj(o.wallet), a = obj(o.appearance), looks = obj(a.looks), byWorld = obj(o.appearanceOptionsByWorld);
  if (o.available !== true) return bad();
  const result: CosmeticsState = { available: true, wallet: { total: nat(w.total), bound: nat(w.bound), earned: nat(w.earned) }, nextRequestId: token(o.nextRequestId), selfPid: nat(o.selfPid),
    players: list(o.players, player), catalog: list(o.catalog, cosmetic), inventory: list(o.inventory, cosmetic), trades: list(o.trades, offer, 32),
    appearance: { gender: one(a.gender, genders), world: world(a.world), parts: parts(a.parts), looks: { '0': parts(looks['0']), '1': parts(looks['1']) } },
    appearanceOptions: options(o.appearanceOptions), appearanceOptionsByWorld: { '0': options(byWorld['0']), '1': options(byWorld['1']) },
    boxes: list(o.boxes, x => { const b = obj(x), p = obj(b.pity); return { id: one(b.id, kinds), name: str(b.name), price: nat(b.price), available: bool(b.available), baseOdds: odds(b.baseOdds), nextOdds: odds(b.nextOdds),
      pity: { superMisses: nat(p.superMisses), ultraMisses: nat(p.ultraMisses), superAt: nat(p.superAt), ultraAt: p.ultraAt === null ? null : nat(p.ultraAt) },
      pool: list(b.pool, x => { const c = obj(x); return { ...cosmetic(c), baseChance: num(c.baseChance, 100), nextChance: num(c.nextChance, 100) }; }) }; }, 3) };
  if (o.reward !== undefined) result.reward = { ...cosmetic(o.reward), duplicate: bool(obj(o.reward).duplicate) };
  if (o.requestId !== undefined) result.requestId = token(o.requestId);
  if (o.replay !== undefined) result.replay = bool(o.replay);
  if (o.offer !== undefined) result.offer = offer(o.offer);
  if (o.equipped !== undefined) { const e = obj(o.equipped); result.equipped = { id: str(e.id), world: world(e.world), parts: parts(e.parts) }; }
  if (o.appearanceUpdated !== undefined) result.appearanceUpdated = bool(o.appearanceUpdated);
  return result;
}
export function decodeOnlineTag(value: unknown): TagState {
  const o = obj(value), roles = ['captain', 'opponent', 'teammate', 'opponent-teammate'] as const;
  const result: TagState = { self: player(o.self), active: bool(o.active), available: bool(o.available), players: list(o.players, player),
    invitations: list(o.invitations, x => { const i = obj(x); const seats = list(i.seats, x => { const s = obj(x); return { ...player(s), role: one(s.role, roles), accepted: bool(s.accepted) }; }, 4);
      if (seats.length !== 4 || new Set(seats.map(s => s.pid)).size !== 4 || seats.some((s, i) => s.role !== roles[i]) || i.hostPid !== seats[0]?.pid) return bad();
      return { id: str(i.id, 100), hostPid: nat(i.hostPid), expires: nat(i.expires), outbound: bool(i.outbound), seats }; }, 16) };
  if (o.reason !== undefined) result.reason = str(o.reason);
  if (o.started !== undefined) result.started = bool(o.started);
  if (o.event !== undefined) { const e = obj(o.event); result.event = { id: str(e.id, 100), kind: str(e.kind), at: nat(e.at), ...(e.name === undefined ? {} : { name: str(e.name) }) }; }
  return result;
}
const initial = (): OnlineState => ({ drafts: {}, cosmetics: null, tag: null, loading: false, pending: null, error: null, receipt: null, retryAction: null });
export class OnlineController {
  private current = initial();
  private generation = 0;
  private abort = new AbortController();
  private disposed = false;
  constructor(private readonly config: { http: HttpClient; onChange: (state: OnlineState) => void }) {}
  get state(): OnlineState { return this.current; }
  private publish(update: Partial<OnlineState>): void { this.current = { ...this.current, ...update }; this.config.onChange(this.current); }
  private begin(): number { this.abort.abort(); this.abort = new AbortController(); return ++this.generation; }
  reset(): void { if (this.disposed) return; this.begin(); this.current = initial(); this.config.onChange(this.current); }
  dispose(): void { this.disposed = true; this.begin(); }
  async refresh(): Promise<void> {
    if (this.disposed || this.current.pending) return;
    const gen = this.begin(); this.publish({ loading: true, error: null });
    const signal = this.abort.signal;
    const results = await Promise.allSettled([
      this.config.http.request('GET', '/api/de/cosmetics', decodeCosmetics, undefined, { signal }),
      this.config.http.request('GET', '/api/de/tag', decodeOnlineTag, undefined, { signal }),
    ]);
    if (this.disposed || gen !== this.generation) return;
    const [cosmetics, tag] = results;
    const errors = results.flatMap(r => r.status === 'rejected' ? [this.message(r.reason)] : []);
    this.publish({ loading: false, error: errors.length ? errors.join('; ') : null,
      ...(cosmetics.status === 'fulfilled' ? { cosmetics: cosmetics.value } : {}), ...(tag.status === 'fulfilled' ? { tag: tag.value } : {}) });
  }
  private message(e: unknown): string { return e instanceof Error ? e.message.slice(0, 512) : 'Online request failed'; }
  async dispatch(input: OnlineAction): Promise<void> {
    if (this.disposed || this.current.pending) return;
    if (input.type === 'refresh') return this.refresh();
    let action: Exclude<OnlineAction, { type: 'refresh' }> = input;
    try {
      const unresolved = this.current.retryAction;
      if (unresolved && !action.type.startsWith('tag-') && action.type !== 'open-box' && JSON.stringify(action) !== JSON.stringify(unresolved)) throw new Error('Retry the unresolved request before another cosmetic mutation.');
      if (unresolved?.type === 'trade' && action.type === 'open-box') throw new Error('Retry the unresolved trade first.');
      if (action.type === 'open-box') {
        const retry = this.current.retryAction;
        if (retry && retry.type === 'open-box' && (retry.boxId !== action.boxId || (action.requestId !== undefined && action.requestId !== retry.requestId))) throw new Error('Retry the unresolved box request before opening another box.');
        action = { ...action, requestId: action.requestId ?? (retry?.type === 'open-box' ? retry.requestId : this.current.cosmetics?.nextRequestId) };
        if (action.requestId === undefined) throw new Error('Refresh cosmetics before opening a box.');
        token(action.requestId);
      }
      if (action.type === 'trade' && !/^[a-zA-Z0-9_-]{8,80}$/.test(action.requestId)) throw new Error('Invalid trade request token');
    } catch (e) { this.publish({ error: this.message(e) }); return; }
    // Snapshot mutable caller payload before awaiting, so retries preserve exactly the submitted intent.
    action = JSON.parse(JSON.stringify(action)) as Exclude<OnlineAction, { type: 'refresh' }>;
    const gen = this.begin(), signal = this.abort.signal;
    this.publish({ pending: action.type, loading: false, error: null, receipt: null });
    try {
      const { type, ...body } = action;
      if (type.startsWith('tag-')) {
        const tag = await this.config.http.request('POST', `/api/de/tag/${type.slice(4)}`, decodeOnlineTag, body, { signal });
        if (!this.disposed && gen === this.generation) this.publish({ tag, pending: null, receipt: { action: type, tag } });
      } else {
        const route = type === 'open-box' ? 'open' : type.startsWith('trade-') ? `trade/${type.slice(6)}` : type;
        const cosmetics = await this.config.http.request('POST', `/api/de/cosmetics/${route}`, value => {
          const result = decodeCosmetics(value);
          if (action.type === 'open-box' && (!result.reward || result.requestId !== action.requestId)) throw new ResponseError('Missing box receipt');
          if (action.type === 'equip' && !result.equipped) throw new ResponseError('Missing equip receipt');
          if (action.type === 'appearance' && result.appearanceUpdated !== true) throw new ResponseError('Missing appearance receipt');
          if (action.type.startsWith('trade') && !result.offer) throw new ResponseError('Missing trade receipt');
          return result;
        }, body, { signal });
        if (!this.disposed && gen === this.generation) this.publish({ cosmetics, pending: null, retryAction: null, receipt: { action: type, cosmetics } });
      }
    } catch (e) {
      if (!this.disposed && gen === this.generation) this.publish({ pending: null, error: this.message(e),
        ...((action.type === 'open-box' || action.type === 'trade') && !(e instanceof ApiError && e.status < 500) ? { retryAction: action } : {}) });
    }
  }
}
