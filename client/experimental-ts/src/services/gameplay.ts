import type { DeckView } from '../ui/contracts';
import { GameApi } from './api';
import type { DeckList, DeckMode, Friends, Purchase, PurchaseRequest, Session, ShopCatalog, StarterInfo, Wallet } from './api';
import { DeckEditor } from './deck-editor';
import type { RequestOptions } from './http';

export interface ResourceState<T> { data: T | null; loading: boolean; error: string | null; }
/** Latest request wins, including when fetch ignores abort. Failed refreshes retain data. */
export class Resource<T> {
  private value: ResourceState<T> = { data: null, loading: false, error: null };
  private revision = 0;
  private request: AbortController | null = null;
  private listeners = new Set<(state: ResourceState<T>) => void>();
  private disposed = false;
  get state(): ResourceState<T> { return structuredClone(this.value); }
  subscribe(listener: (state: ResourceState<T>) => void): () => void {
    this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); };
  }
  private emit(): void { for (const listener of this.listeners) listener(this.state); }
  /** Invalidate pending reads while retaining the last successful data. */
  invalidate(): void { this.revision++; this.request?.abort(); this.request = null; this.value.loading = false; this.emit(); }
  set(data: T): void { this.invalidate(); this.value = { data: structuredClone(data), loading: false, error: null }; this.emit(); }
  clear(): void { this.invalidate(); this.value = { data: null, loading: false, error: null }; this.emit(); }
  async load(loader: (signal: AbortSignal) => Promise<T>, options: RequestOptions = {}): Promise<T> {
    if (this.disposed) throw new Error('Resource disposed');
    this.request?.abort(); const request = new AbortController(), revision = ++this.revision;
    this.request = request;
    const abort = () => request.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    this.value = { ...this.value, loading: true, error: null }; this.emit();
    try {
      request.signal.throwIfAborted();
      const data = await loader(request.signal);
      request.signal.throwIfAborted();
      if (revision !== this.revision) throw new DOMException('Superseded request', 'AbortError');
      this.value = { data: structuredClone(data), loading: false, error: null }; return data;
    } catch (e) {
      if (revision === this.revision) this.value = { ...this.value, loading: false, error: request.signal.aborted ? null : e instanceof Error ? e.message : String(e) };
      throw e;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (revision === this.revision) { this.request = null; this.emit(); }
    }
  }
  dispose(): void { this.disposed = true; this.invalidate(); this.listeners.clear(); }
}

/** HTTP gameplay state only. Characters, collection and world state come from the network controller. */
export class GameplayService {
  readonly session = new Resource<Session>();
  readonly decks = new Resource<DeckList>();
  readonly starter = new Resource<StarterInfo>();
  readonly shop = new Resource<ShopCatalog>();
  readonly wallet = new Resource<Wallet>();
  readonly friends = new Resource<Friends>();
  private pending: PurchaseRequest | null = null;
  private readonly editorSaves = new WeakMap<DeckEditor, number>();
  private buying = false;
  private disposed = false;
  constructor(readonly api = new GameApi()) {}
  get pendingPurchase(): PurchaseRequest | null { return this.pending ? { ...this.pending } : null; }
  refreshSession(options?: RequestOptions): Promise<Session> { return this.session.load(signal => this.api.session({ signal }), options); }
  refreshDecks(options?: RequestOptions): Promise<DeckList> { return this.decks.load(signal => this.api.decks({ signal }), options); }
  refreshStarter(options?: RequestOptions): Promise<StarterInfo> { return this.starter.load(signal => this.api.starter({ signal }), options); }
  refreshShop(options?: RequestOptions): Promise<ShopCatalog> { return this.shop.load(signal => this.api.shop({ signal }), options); }
  refreshWallet(options?: RequestOptions): Promise<Wallet> { return this.wallet.load(signal => this.api.wallet({ signal }), options); }
  refreshFriends(options?: RequestOptions): Promise<Friends> { return this.friends.load(signal => this.api.friends({ signal }), options); }
  async signIn(username: string, password: string, options?: RequestOptions): Promise<Session> {
    await this.api.signIn(username, password, options); return this.refreshSession(options);
  }
  async signOut(options?: RequestOptions): Promise<void> {
    await this.api.signOut(options);
    for (const resource of [this.decks, this.starter, this.shop, this.wallet, this.friends]) resource.clear();
    this.pending = null; this.session.set({ signedIn: false });
  }
  async saveDeck(deck: DeckView, current?: DeckMode, options?: RequestOptions): Promise<{ updated: number }> {
    this.decks.invalidate(); const result = await this.api.saveDeck(deck, current, options); this.decks.invalidate(); return result;
  }
  async saveEditor(editor: DeckEditor, current?: DeckMode, options?: RequestOptions): Promise<{ updated: number }> {
    const snapshot = editor.deck, generation = editor.generation;
    const save = (this.editorSaves.get(editor) ?? 0) + 1; this.editorSaves.set(editor, save);
    const result = await this.saveDeck(snapshot, current, options);
    if (!this.disposed && editor.generation === generation && this.editorSaves.get(editor) === save) editor.markSaved(snapshot);
    return result;
  }
  async selectDeck(name: string, mode: DeckMode = 'world', options?: RequestOptions): Promise<{ updated: number }> {
    this.decks.invalidate(); const result = await this.api.selectDeck(name, mode, options); this.decks.invalidate(); return result;
  }
  async deleteDeck(name: string, options?: RequestOptions): Promise<{ updated: number }> {
    this.decks.invalidate(); const result = await this.api.deleteDeck(name, options); this.decks.invalidate(); return result;
  }
  async claimStarter(id: number, options?: RequestOptions) {
    this.starter.invalidate(); this.decks.invalidate();
    const result = await this.api.claimStarter(id, options); this.starter.invalidate(); this.decks.invalidate(); return result;
  }
  /** Requires a server-issued token. A failed/aborted call retains this exact request for explicit retry. */
  async buy(itemId: number, count: number, options?: RequestOptions): Promise<Purchase> {
    if (this.pending) throw new Error('Resolve the pending purchase before starting another.');
    if (!Number.isSafeInteger(itemId) || itemId < 0 || !Number.isSafeInteger(count) || count < 1 || count > 50) throw new Error('Invalid purchase');
    const catalog = this.shop.state.data;
    if (!catalog?.available || !catalog.nextRequestId) throw new Error('Refresh the shop before purchasing.');
    this.pending = { itemId, count, requestId: catalog.nextRequestId };
    return this.retryPurchase(options);
  }
  async retryPurchase(options?: RequestOptions): Promise<Purchase> {
    if (this.disposed) throw new Error('Gameplay service disposed');
    if (this.buying) throw new Error('Purchase already in progress.');
    if (!this.pending) throw new Error('No pending purchase.');
    this.buying = true;
    const request = { ...this.pending };
    this.shop.invalidate(); this.wallet.invalidate();
    try {
      const result = await this.api.purchase(request, options);
      if (!this.disposed && this.pending?.requestId === request.requestId) {
        this.pending = null; this.shop.set(result); this.wallet.set(result.wallet);
      }
      return result;
    } finally { this.buying = false; }
  }
  /** Explicitly abandon after reconciling with the server; never called automatically on network errors. */
  abandonPurchase(): void {
    if (this.buying) throw new Error('Purchase still in progress.');
    this.pending = null; this.shop.clear();
  }
  reset(): void {
    for (const resource of [this.decks, this.starter, this.shop, this.wallet, this.friends]) resource.clear();
    this.pending = null;
  }
  dispose(): void {
    this.disposed = true; this.api.dispose();
    for (const resource of [this.session, this.decks, this.starter, this.shop, this.wallet, this.friends]) resource.dispose();
  }
}
