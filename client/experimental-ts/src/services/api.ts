import type { DeckView, ShopView, SocialView, ChatLine } from '../ui/contracts';
import { HttpClient, ResponseError } from './http';
import type { RequestOptions } from './http';

export type DeckMode = 'world' | 'free';
export type Session = { signedIn: false } | { signedIn: true; userId: string; name: string | null; roles: string[]; discord: boolean; password: boolean };
export interface SavedDeck extends DeckView { updated: number; }
export interface DeckList { decks: SavedDeck[]; current: Record<DeckMode, string | null>; deleted: { name: string; updated: number }[]; }
export interface Wallet { total: number; bound: number; earned: number; }
export interface ShopProduct { id: number; itemId: number; kind: number; param: number; price: number; internalId: number | null; rarity: string | null; category: string; name: string; owned: boolean; }
export interface ShopCatalog { available: boolean; wallet: Wallet; items: ShopProduct[]; nextRequestId: string; }
export interface PurchaseRequest { itemId: number; count: number; requestId: string; }
export interface Purchase extends ShopCatalog { purchased: { itemId: number; kind: number; passcode: number; internalId: number | null; rarity: string | null }[]; replayed: boolean; }
export interface StarterDeck { id: number; name: string; main: [number, number][]; extra: [number, number][]; }
export interface StarterChoice { id: number; name: string; blurb: string; cover: number; cards: { id: number; name: string; n: number; type: 'monster' | 'spell' | 'trap' | 'extra' }[]; }
export type StarterInfo = { claimable: true; decks: StarterChoice[] } | { claimable: false; reason: string; claimed?: StarterDeck | null };
export interface StarterClaim { ok: true; id: number; cards: number; deck: StarterDeck; }
export interface Friends { friends: { pid: number; name: string; online: boolean; place?: string }[]; }
export type ChatChannel = 'global' | 'trade' | 'whisper' | 'team';
export interface ChatMessage { id: number; at: number; channel: ChatChannel; pid: number; name: string; text: string; targetPid?: number; }
export interface ChatFeed { ok: { cursor: number; reset: boolean; pid: number; name: string; players: { pid: number; name: string }[]; messages: ChatMessage[] }; }

export const CARD_RARITIES = ['N', 'R', 'SR', 'UR'] as const;
export type CardRarity = typeof CARD_RARITIES[number];

// Decode the actual route envelopes at the boundary; no unchecked generic casts enter gameplay state.
const bad = (): never => { throw new ResponseError('Unexpected API response shape'); };
const obj = (x: unknown): Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : bad();
const str = (x: unknown): string => typeof x === 'string' ? x : bad();
const bool = (x: unknown): boolean => typeof x === 'boolean' ? x : bad();
const num = (x: unknown): number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : bad();
const nullable = <T>(x: unknown, decode: (v: unknown) => T): T | null => x === null ? null : decode(x);
const list = <T>(x: unknown, decode: (v: unknown) => T): T[] => Array.isArray(x) ? x.map(decode) : bad();
const oneOf = <T extends string>(x: unknown, values: readonly T[]): T => values.includes(x as T) ? x as T : bad();
const wallet = (x: unknown): Wallet => { const o = obj(x); return { total: num(o.total), bound: num(o.bound), earned: num(o.earned) }; };
const stamp = (x: unknown): { updated: number } => ({ updated: num(obj(x).updated) });
const deck = (x: unknown): SavedDeck => { const o = obj(x); return { name: str(o.name), main: list(o.main, num), side: list(o.side, num), extra: list(o.extra, num), updated: num(o.updated) }; };
const product = (x: unknown): ShopProduct => { const o = obj(x); return { id: num(o.id), itemId: num(o.itemId), kind: num(o.kind), param: num(o.param), price: num(o.price), internalId: nullable(o.internalId, num), rarity: nullable(o.rarity, str), category: str(o.category), name: str(o.name), owned: bool(o.owned) }; };
const shop = (x: unknown): ShopCatalog => { const o = obj(x); return { available: bool(o.available), wallet: wallet(o.wallet), items: list(o.items, product), nextRequestId: str(o.nextRequestId) }; };
const pair = (x: unknown): [number, number] => { if (!Array.isArray(x) || x.length !== 2) return bad(); return [num(x[0]), num(x[1])]; };
const starterDeck = (x: unknown): StarterDeck => { const o = obj(x); return { id: num(o.id), name: str(o.name), main: list(o.main, pair), extra: list(o.extra, pair) }; };
const message = (x: unknown): ChatMessage => { const o = obj(x); return { id: num(o.id), at: num(o.at), channel: oneOf(o.channel, ['global', 'trade', 'whisper', 'team']), pid: num(o.pid), name: str(o.name), text: str(o.text), ...(o.targetPid === undefined ? {} : { targetPid: num(o.targetPid) }) }; };

export class GameApi {
  constructor(readonly http = new HttpClient()) {}
  session(options?: RequestOptions): Promise<Session> {
    return this.http.request('GET', '/api/de/session', x => {
      const o = obj(x); if (!bool(o.signedIn)) return { signedIn: false };
      return { signedIn: true, userId: str(o.userId), name: nullable(o.name, str), roles: list(o.roles, str), discord: bool(o.discord), password: bool(o.password) };
    }, undefined, options);
  }
  /** Password auth returns better-auth's token/user envelope. Never persist its token. Read session() afterward. */
  async signIn(username: string, password: string, options?: RequestOptions): Promise<void> {
    await this.http.request('POST', '/api/auth/sign-in/username', x => { const o = obj(x); str(o.token); obj(o.user); return undefined; }, { username, password }, options);
  }
  async signOut(options?: RequestOptions): Promise<void> {
    await this.http.request('POST', '/api/auth/sign-out', x => { if (obj(x).success !== true) bad(); }, {}, options);
  }
  decks(options?: RequestOptions): Promise<DeckList> {
    return this.http.request('GET', '/api/de/decks', x => { const o = obj(x), c = obj(o.current); return {
      decks: list(o.decks, deck), current: { world: nullable(c.world, str), free: nullable(c.free, str) },
      deleted: list(o.deleted, x => { const d = obj(x); return { name: str(d.name), updated: num(d.updated) }; }),
    }; }, undefined, options);
  }
  saveDeck(deck: DeckView, current?: DeckMode, options?: RequestOptions): Promise<{ updated: number }> {
    return this.http.request('PUT', '/api/de/decks', stamp, { ...deck, ...(current ? { current: true, mode: current } : {}) }, options);
  }
  selectDeck(name: string, mode: DeckMode = 'world', options?: RequestOptions): Promise<{ updated: number }> {
    return this.http.request('PUT', '/api/de/decks/current', stamp, { name, mode }, options);
  }
  deleteDeck(name: string, options?: RequestOptions): Promise<{ updated: number }> {
    return this.http.request('DELETE', `/api/de/decks/${encodeURIComponent(name)}`, stamp, undefined, options);
  }
  /** The game-wide rarity of each card (server/src/game/card-rarity.ts): Common, Rare, Super Rare, Ultra Rare. */
  cardRarities(options?: RequestOptions): Promise<Record<string, CardRarity>> {
    return this.http.request('GET', '/api/de/card-rarities', x => Object.fromEntries(Object.entries(obj(obj(x).byPasscode)).map(([pc, r]) => [pc, oneOf(r, CARD_RARITIES)])), undefined, options);
  }
  wallet(options?: RequestOptions): Promise<Wallet> { return this.http.request('GET', '/api/de/wallet', wallet, undefined, options); }
  shop(options?: RequestOptions): Promise<ShopCatalog> { return this.http.request('GET', '/api/de/shop', shop, undefined, options); }
  purchase(body: PurchaseRequest, options?: RequestOptions): Promise<Purchase> {
    return this.http.request('POST', '/api/de/shop/buy', x => { const o = obj(x); return { ...shop(o), replayed: bool(o.replayed), purchased: list(o.purchased, x => {
      const p = obj(x); return { itemId: num(p.itemId), kind: num(p.kind), passcode: num(p.passcode), internalId: nullable(p.internalId, num), rarity: nullable(p.rarity, str) };
    }) }; }, body, options);
  }
  starter(options?: RequestOptions): Promise<StarterInfo> {
    return this.http.request('GET', '/api/de/starter', x => {
      const o = obj(x); if (!bool(o.claimable)) return { claimable: false, reason: str(o.reason), ...(o.claimed === undefined ? {} : { claimed: nullable(o.claimed, starterDeck) }) };
      return { claimable: true, decks: list(o.decks, x => { const d = obj(x); return { id: num(d.id), name: str(d.name), blurb: str(d.blurb), cover: num(d.cover), cards: list(d.cards, x => {
        const c = obj(x); return { id: num(c.id), name: str(c.name), n: num(c.n), type: oneOf(c.type, ['monster', 'spell', 'trap', 'extra']) };
      }) }; }) };
    }, undefined, options);
  }
  claimStarter(id: number, options?: RequestOptions): Promise<StarterClaim> {
    return this.http.request('POST', '/api/de/starter/claim', x => { const o = obj(x); if (o.ok !== true) bad(); return { ok: true, id: num(o.id), cards: num(o.cards), deck: starterDeck(o.deck) }; }, { id }, options);
  }
  friends(options?: RequestOptions): Promise<Friends> {
    return this.http.request('GET', '/api/de/friends', x => ({ friends: list(obj(x).friends, x => {
      const f = obj(x); return { pid: num(f.pid), name: str(f.name), online: bool(f.online), ...(f.place === undefined ? {} : { place: str(f.place) }) };
    }) }), undefined, options);
  }
  chat(after = 0, options?: RequestOptions): Promise<ChatFeed> {
    return this.http.request('GET', `/api/de/chat?after=${encodeURIComponent(after)}`, x => { const o = obj(obj(x).ok); return { ok: {
      cursor: num(o.cursor), reset: bool(o.reset), pid: num(o.pid), name: str(o.name), players: list(o.players, x => { const p = obj(x); return { pid: num(p.pid), name: str(p.name) }; }), messages: list(o.messages, message),
    } }; }, undefined, options);
  }
  sendChat(body: { channel: ChatChannel; text: string; targetPid?: number; requestId?: string }, options?: RequestOptions): Promise<{ ok: ChatMessage }> {
    return this.http.request('POST', '/api/de/chat', x => ({ ok: message(obj(x).ok) }), body, options);
  }
  dispose(): void { this.http.dispose(); }
}
export const toShopView = (s: ShopCatalog): ShopView => ({ items: s.items.map(i => ({ id: i.id, name: i.name || `Item ${i.id}`, price: i.price, category: i.category, owned: i.owned })), mp: s.wallet.total, earnedMp: s.wallet.earned, available: s.available });
export const toSocialView = (f: Friends): SocialView => ({ friends: f.friends.map(p => ({ id: p.pid, name: p.name, online: p.online, status: p.place })) });
export const toChatLine = (m: ChatMessage): ChatLine => ({ id: String(m.id), sender: m.name, text: m.text, channel: m.channel });
export function expandStarterDeck(d: StarterDeck): DeckView {
  const expand = (pairs: [number, number][]): number[] => {
    if (pairs.reduce((n, p) => n + p[1], 0) > 1024 || pairs.some(p => !Number.isSafeInteger(p[1]) || p[1] < 0)) throw new ResponseError('Starter deck exceeds expansion bound');
    return pairs.flatMap(([pc, n]) => Array<number>(n).fill(pc));
  };
  return { name: d.name, main: expand(d.main), side: [], extra: expand(d.extra) };
}
