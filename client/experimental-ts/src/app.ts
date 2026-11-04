import { ResourceScope } from './core/scope';
import { GameSession } from './network/session';
import type { SessionState, SessionOptions } from './network/session';
import type { Channel } from './network/gateway';
import type { WireMessage } from './network/codec';
import { createDuelState, reduceDuelMessage, acknowledgePresentation } from './duel/model';
import type { DuelState } from './duel/types';
import { encodeDuelResponse } from './duel/responses';
import { GameApi, GameplayService, DeckEditor, toShopView, toSocialView, expandStarterDeck } from './services';
import { AssetManager } from './assets';
import { SocialController } from './features/social';
import { OnlineController } from './features/online';
import type { GameplayCommand } from './gameplay/binary';
import { CardCatalog } from './catalog';
import { projectDuel, interpretResponse, interpretAction, applyTimeline } from './presentation';
import { DuelTextCatalog } from './duel/text';
import { DuelTimeline } from './duel/timeline';
import { AccountController } from './features/account';
import { WorldNavigator } from './world';
import type { WorldMaps } from './world';
import { LiveCapture, captureDownload } from './parity/live';
import { BrowserAudioManager } from './features/audio';
import type { ClientController, ClientView, ClientCommand, Scene, CardView, SettingsView, DuelView } from './ui/contracts';

export interface AppOptions {
  gatewayUrl: string;
  portOffset?: number;
  api?: GameApi;
  catalog?: CardCatalog;
  assets?: AssetManager;
  audio?: BrowserAudioManager;
  worldMaps?: WorldMaps;
  duelTexts?: DuelTextCatalog;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  sessionFactory?: (options: SessionOptions) => GameSession;
  settings?: Partial<SettingsView>;
  persistSettings?: (settings: SettingsView) => void;
}
const duelIds = new Set([0x6202, 0x6610, 0x6611, 0x6612, 0x6461, 0x6613, 0x649b]);
const channelName = (kind: number) => ({ 0: 'global', 1: 'global', 2: 'trade', 3: 'whisper', 5: 'team' })[kind] ?? 'global';
const initial = (settings: Partial<SettingsView> = {}): ClientView => ({
  scene: 'title', auth: { signedIn: false }, connection: 'offline', status: 'Checking your account…',
  player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null,
  settings: { sound: 0.8, music: 0.5, reducedMotion: false, showCardNames: true, ...settings },
});

/** Owns one client session. UI components can only dispatch semantic commands. */
export class ClientApp implements ClientController {
  readonly catalog: CardCatalog;
  readonly services: GameplayService;
  readonly social: SocialController;
  readonly online: OnlineController;
  readonly account: AccountController;
  readonly capture = new LiveCapture();
  private scope = new ResourceScope();
  private connectionScope = this.scope.child();
  private view: ClientView;
  private listeners = new Set<(state: ClientView) => void>();
  private game: GameSession | null = null;
  private editor: DeckEditor | null = null;
  private duelState: DuelState = createDuelState();
  private timeline = new DuelTimeline(this.duelState);
  private animationFrame: number | null = null;
  private lastFrame: number | null = null;
  private settledDuel: DuelView | null = null;
  private duelLog: string[] = [];
  private audioSlot = -1;
  private world = new WorldNavigator({ send: p => this.requireGame().move(p.x, p.y, p.direction) });
  private worldArea: number | null = null;
  private worldFrame: number | null = null;
  private worldLastFrame: number | null = null;
  private submittedPrompt: number | null = null;
  private collectionRef: ReadonlyMap<number, number> | null = null;
  private collection: CardView[] = [];
  private projections = new Map<string, { source: unknown; result: unknown }>();
  private disposed = false;
  private epoch = 0;
  private lockToken: object | null = null;
  private attachingOffer = false;
  private observedAccountSession: unknown = null;
  constructor(private options: AppOptions) {
    this.catalog = options.catalog ?? new CardCatalog();
    this.services = new GameplayService(options.api ?? new GameApi());
    this.view = initial(options.settings);
    this.timeline.setReducedMotion(this.view.settings.reducedMotion || !this.frameRequest);
    if (options.audio) { options.audio.setVolumes(this.view.settings); this.view.audio = options.audio.getState(); }
    this.social = new SocialController({ send: command => this.sendGameplay(command), onChange: socialDetail => this.patch({ socialDetail }) });
    this.online = new OnlineController({ http: this.services.api.http, onChange: online => this.patch({ online }) });
    this.account = new AccountController({ http: this.services.api.http, onChange: accountDetail => {
      const changed = accountDetail.session !== this.observedAccountSession; this.observedAccountSession = accountDetail.session;
      this.patch({ accountDetail, ...(changed && accountDetail.session ? { auth: { signedIn: accountDetail.session.signedIn, ...(accountDetail.session.signedIn && accountDetail.session.name ? { name: accountDetail.session.name } : {}) } } : {}) });
    } });
    this.view = { ...this.view, accountDetail: this.account.state, capture: this.capture.status };
  }
  getState(): ClientView { return this.view; }
  get diagnostics(): { duel: DuelState; assetBytes: number; resources: number } {
    return { duel: structuredClone(this.duelState), assetBytes: this.options.assets?.cacheBytes ?? 0, resources: this.scope.size };
  }
  subscribe(listener: (state: ClientView) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private emit(): void { if (!this.disposed) { this.view = { ...this.view, capture: this.capture.status }; this.syncAudioScene(); for (const listener of this.listeners) listener(this.view); } }
  private patch(patch: Partial<ClientView>): void { this.view = { ...this.view, ...patch }; this.emit(); }
  async initialize(): Promise<void> {
    try { const auth = await this.services.refreshSession({ signal: this.scope.signal });
      if (!this.disposed) this.patch({ auth: { signedIn: auth.signedIn, ...(auth.signedIn && auth.name ? { name: auth.name } : {}) }, status: auth.signedIn ? 'Ready to go online.' : 'Sign in to enter Duel Academy.' });
    } catch (e) { if (!this.disposed) this.failure(e); }
  }
  async loadCardImage(passcode: number, signal: AbortSignal): Promise<{ url: string; release(): void }> {
    if (!this.options.assets) throw new Error('Original card art is not configured.');
    const lease = await this.options.assets.loadCard(passcode, signal);
    return { url: lease.value.url, release: () => lease.release() };
  }
  private failure(e: unknown): void {
    if (this.disposed || e instanceof DOMException && e.name === 'AbortError') return;
    this.patch({ error: e instanceof Error ? e.message : String(e), status: 'The action could not be completed.' });
  }
  private assertEpoch(epoch: number): void { if (this.disposed || epoch !== this.epoch) throw new DOMException('Session changed', 'AbortError'); }
  private requireGame(): GameSession { if (!this.game) throw new Error('Go online first.'); return this.game; }
  private project<S, T>(key: string, source: S, convert: (source: S) => T): T {
    const cached = this.projections.get(key);
    if (cached && cached.source === source) return cached.result as T;
    const result = convert(source); this.projections.set(key, { source, result }); return result;
  }
  private updateSession(state: SessionState): void {
    if (this.disposed) return;
    if (state.collection !== this.collectionRef) {
      this.collectionRef = state.collection;
      this.collection = [...state.collection].map(([pc, n]) => this.catalog.card(pc, n));
      this.editor?.setCollection(this.collection);
    }
    const selected = state.characters.find(c => c.slot === state.selectedSlot);
    const profile = state.profile;
    const worldMap = this.options.worldMaps?.maps.find(m => m.id === state.area);
    const self = state.players.find(p => p.pid === profile?.pid);
    if (worldMap && self?.x !== undefined && self.y !== undefined && (this.worldArea !== state.area || !this.world.moving)) {
      this.world.reset(worldMap, { x: self.x, y: self.y, direction: (self.direction ?? 0) & 7 }); this.worldArea = state.area;
    }
    const connection = state.connection === 'connected' ? 'online' : state.connection === 'connecting' ? 'connecting'
      : state.connection === 'reconnecting' ? 'reconnecting' : state.connection === 'error' ? 'error' : 'offline';
    const duelPreparing = ['preparing-duel', 'rock-paper-scissors', 'choose-first'].includes(state.phase);
    let scene = this.view.scene;
    if (state.phase === 'characters' && !profile) scene = 'characters';
    if (state.phase === 'lobby' && ['title', 'characters', 'duel'].includes(scene)) scene = 'lobby';
    if ((duelPreparing || state.phase === 'duel') && scene !== 'settings') scene = 'duel';
    this.view = { ...this.view, connection, scene,
      characters: state.characters.map(c => ({ slot: c.slot, name: c.name, level: c.level, selected: c.slot === state.selectedSlot })),
      player: profile ? { id: profile.pid, name: selected?.name ?? this.view.auth?.name ?? 'Duelist', level: profile.level, mp: profile.mp } : null,
      lobby: profile ? {
        name: `Duel Academy · Area ${state.area}`, width: worldMap?.width ?? 1600, height: worldMap?.height ?? 1200, connected: connection === 'online',
        areas: this.project('areas', state.areas, areas => areas.map(a => ({ ...a, name: `Area ${a.area}` }))),
        npcs: this.project('npcs', state.npcs, npcs => npcs.map(n => ({ id: n.id, name: n.name }))),
        rooms: this.project('rooms', state.rooms, rooms => rooms.map(r => ({ id: r.id, owner: r.owner, name: state.players.find(p => p.pid === r.owner)?.name ?? `Room ${r.id}`, state: r.state, password: r.password }))),
        invitation: this.project('invitation', state.challenge, challenge => challenge ? { name: challenge.name, pid: challenge.pid } : undefined),
        avatars: state.players.map(p => ({ id: p.pid, name: p.name, x: p.x ?? 0, y: p.y ?? 0, self: p.pid === profile.pid })),
        chat: this.project('chat', state.chat, chat => chat.map((m, i) => ({ id: String(i), sender: m.name, text: m.text, channel: channelName(m.channel) }))),
        channels: ['global', 'trade', 'whisper', 'team'],
      } : null,
      preparation: duelPreparing ? { phase: state.duelFirst !== null ? 'ready' : state.phase, opponentHand: state.opponentHand } : undefined,
      status: state.phase === 'lobby' ? 'Online in Duel Academy.' : state.phase.replaceAll('-', ' '),
      ...(state.error ? { error: state.error } : {}),
    };
    if (this.view.duel && this.view.duel.spectating !== state.spectating) {
      this.view = { ...this.view, duel: { ...this.view.duel, spectating: state.spectating } };
      if (this.settledDuel) this.settledDuel = { ...this.settledDuel, spectating: state.spectating };
    }
    this.syncEditor(); this.emit();
  }
  private sendGameplay(command: GameplayCommand): void {
    const game = this.requireGame();
    if (command.channel === 'account') { if (!game.account) throw new Error('Account channel unavailable'); game.account.send(command.id, command.data); }
    else if (command.channel === 'duel') game.sendDuel(command.id, command.data);
    else game.sendLobby(command.id, command.data);
  }
  private receive(channel: Channel, message: WireMessage): void {
    if (this.disposed) return;
    this.capture.receive(channel, message, channel === this.game?.duel ? 'duel' : channel === this.game?.lobby ? 'lobby' : 'account');
    if (channel === this.game?.lobby) this.social.receive(message);
    if ( !duelIds.has(message.id) || channel !== this.game?.duel) return;
    const previousPrompt = this.duelState.prompt?.id;
    const previous = this.duelState;
    this.duelState = reduceDuelMessage(previous, message);
    this.duelLog = [...this.duelLog, ...this.duelState.events.filter(e => e.sequence > previous.sequence).map(e => `${e.sequence}: ${e.type}`)].slice(-100);
    this.timeline.enqueue(previous, this.duelState);
    if (this.duelState.prompt?.id !== previousPrompt) this.submittedPrompt = null;
    this.syncDuel();
  }
  private stopWorld(): void {
    this.world.cancel();
    if (this.worldFrame !== null) (this.options.cancelFrame ?? globalThis.cancelAnimationFrame)?.(this.worldFrame);
    this.worldFrame = null; this.worldLastFrame = null;
  }
  private scheduleWorld(): void {
    const request = this.frameRequest;
    if (!request || !this.world.moving || this.worldFrame !== null || this.disposed) return;
    this.worldFrame = request(time => {
      this.worldFrame = null; if (this.disposed) return;
      const delta = this.worldLastFrame === null ? 1000 / 30 : time - this.worldLastFrame; this.worldLastFrame = time;
      try {
        this.world.update(delta);
        const position = this.world.position, lobby = this.view.lobby;
        if (position && lobby) this.patch({ lobby: { ...lobby, avatars: lobby.avatars.map(a => a.self ? { ...a, x: position.x, y: position.y } : a) } });
        if (this.world.moving) this.scheduleWorld(); else this.worldLastFrame = null;
      } catch (e) { this.stopWorld(); this.failure(e); }
    });
  }
  private get frameRequest(): ((callback: FrameRequestCallback) => number) | undefined {
    return this.options.requestFrame ?? (typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame.bind(globalThis) : undefined);
  }
  private cancelAnimation(): void {
    if (this.animationFrame !== null) {
      const cancel = this.options.cancelFrame ?? globalThis.cancelAnimationFrame;
      cancel?.(this.animationFrame); this.animationFrame = null;
    }
    this.lastFrame = null;
  }
  private resetDuel(): void {
    this.cancelAnimation(); this.duelState = createDuelState(); this.duelLog = []; this.submittedPrompt = null;
    this.timeline = new DuelTimeline(this.duelState, { reducedMotion: this.view.settings.reducedMotion || !this.frameRequest });
    this.settledDuel = null;
  }
  private syncDuel(): void {
    const name = this.view.player?.name ?? 'You';
    this.settledDuel = { ...projectDuel(this.duelState, this.catalog, [name, 'Opponent'], this.submittedPrompt, this.options.duelTexts), log: this.duelLog,
      spectating: this.game?.state.spectating ?? false, ...(this.duelState.timer ? { timer: { ...this.duelState.timer } } : {}) };
    this.renderDuelFrame(); this.scheduleAnimation();
  }
  private renderDuelFrame(): void {
    if (!this.settledDuel || this.disposed) return;
    this.patch({ duel: applyTimeline(this.settledDuel, this.timeline.sample(), this.catalog) });
    this.duelState = acknowledgePresentation(this.duelState, this.timeline.acknowledgedThrough);
  }
  private scheduleAnimation(): void {
    if (this.animationFrame !== null || !this.timeline.pending || this.disposed) return;
    const request = this.frameRequest;
    if (!request) { this.timeline.skip(); this.renderDuelFrame(); return; }
    this.animationFrame = request(time => {
      this.animationFrame = null;
      if (this.disposed) return;
      const delta = this.lastFrame === null ? 1 : Math.max(0, Math.min(60, (time - this.lastFrame) * 60 / 1000));
      this.lastFrame = time; this.timeline.advance(delta); this.renderDuelFrame();
      if (this.timeline.pending) this.scheduleAnimation(); else this.lastFrame = null;
    });
  }
  private syncAudioScene(): void {
    const audio = this.options.audio;
    if (!audio) return;
    const scene = this.view.scene;
    // Scene slots have source evidence in recomp/audio-slots.md; duel base selection is provisional.
    const slot = scene === 'title' ? 0 : scene === 'characters' ? 3 : scene === 'deck' ? 1
      : scene === 'duel' ? this.duelState.result ? this.duelState.result.result === 1 ? 28 : this.duelState.result.result === 2 ? 27 : 26
      : this.view.preparation ? 10 : this.duelState.sides[0].lp - this.duelState.sides[1].lp >= 3000 ? 24
      : this.duelState.sides[1].lp - this.duelState.sides[0].lp >= 3000 ? 25 : 11
      : scene === 'settings' ? this.audioSlot : [4,5,6,7].includes(this.game?.state.area ?? 4) ? 6 : 5;
    if (slot >= 0 && slot !== this.audioSlot) {
      this.audioSlot = slot;
      void audio.playSlot(slot).catch(e => this.failure(e));
      this.view = { ...this.view, audio: audio.getState() };
    }
  }
  private syncEditor(): void {
    if (!this.editor && !this.view.deckEditor) return;
    this.view = { ...this.view, deckEditor: { decks: this.services.decks.state.data?.decks ?? [], current: this.editor?.deck ?? null,
      collection: this.collection, dirty: this.editor?.dirty ?? false, loading: this.services.decks.state.loading } };
  }
  private async connect(): Promise<void> {
    if (!this.view.auth?.signedIn) throw new Error('Sign in before going online.');
    if (this.game) { this.patch({ scene: this.view.player ? 'lobby' : 'characters' }); return; }
    const epoch = ++this.epoch;
    const make = this.options.sessionFactory ?? (o => new GameSession(o));
    const game = make({ url: this.options.gatewayUrl, portOffset: this.options.portOffset ?? 1000,
      onState: state => { if (this.game === game && epoch === this.epoch) this.updateSession(state); },
      onMessage: (channel, message) => this.receive(channel, message),
      onOutgoing: (channel, message) => this.capture.outgoing(channel, message, channel === this.game?.duel ? 'duel' : channel === this.game?.lobby ? 'lobby' : 'account'),
      onDuelOffer: offer => {
        if (offer.source !== 'pvp' || this.attachingOffer) return;
        this.attachingOffer = true;
        queueMicrotask(() => {
          if (this.disposed || this.game !== game) { this.attachingOffer = false; return; }
          this.resetDuel(); this.syncDuel();
          void (async () => game.acceptDuelOffer(this.currentDeck()))().catch(e => this.failure(e)).finally(() => { this.attachingOffer = false; });
        });
      },
    });
    this.game = game;
    try { await game.start(); } catch (e) { if (this.game === game) { this.game = null; game.dispose(); } throw e; }
  }
  private disconnect(): void {
    ++this.epoch; this.lockToken = null; this.stopWorld(); this.worldArea = null;
    this.connectionScope.dispose(); this.connectionScope = this.scope.child();
    this.services.reset(); this.social.reset(); this.online.reset(); this.account.reset(); this.capture.sessionBoundary();
    this.game?.dispose(); this.game = null;
    this.collectionRef = null; this.collection = []; this.editor = null; this.projections.clear();
    this.resetDuel(); this.attachingOffer = false;
    this.view = { ...initial(this.view.settings), auth: this.view.auth, status: 'Disconnected.' }; this.emit();
  }
  private async refresh(scene: Scene): Promise<void> {
    const options = { signal: this.connectionScope.signal }, epoch = this.epoch;
    if (scene === 'deck') {
      await this.requireGame().refreshCollection();
      const data = await this.services.refreshDecks(options);
      if (epoch !== this.epoch || this.disposed) throw new DOMException('Session changed', 'AbortError');
      if (!this.editor) {
        const deck = data.decks.find(d => d.name === data.current.world) ?? data.decks[0];
        if (deck) this.editor = new DeckEditor(deck, this.collection);
      }
      this.syncEditor(); this.emit();
    } else if (scene === 'shop') {
      const shop = await this.services.refreshShop(options);
      if (epoch === this.epoch && !this.disposed) { this.patch({ shop: toShopView(shop) }); await this.online.refresh(); }
    } else if (scene === 'social') {
      const friends = await this.services.refreshFriends(options);
      if (epoch === this.epoch && !this.disposed) { this.patch({ social: toSocialView(friends) }); this.social.dispatch({ type: 'refreshMail' }); this.social.dispatch({ type: 'refreshTeam' }); }
    } else if (scene === 'lobby') {
      await this.requireGame().refreshNpcs();
      const starter = await this.services.refreshStarter(options);
      if (epoch === this.epoch && !this.disposed) this.patch({ starter: { claimable: starter.claimable, decks: starter.claimable ? starter.decks.map(d => ({ id: d.id, name: d.name, mainCount: d.cards.filter(c => c.type !== 'extra').reduce((n, c) => n + c.n, 0), extraCount: d.cards.filter(c => c.type === 'extra').reduce((n, c) => n + c.n, 0) })) : [] } });
    } else if (scene === 'characters') await this.requireGame().refreshCharacters();
  }
  private currentDeck(): { main: number[]; side: number[]; extra: number[] } {
    const data = this.services.decks.state.data;
    const deck = data?.decks.find(d => d.name === data.current.world) ?? this.editor?.deck;
    if (!deck) throw new Error('Save and select a deck before starting a duel.');
    return { main: [...deck.main], side: [...deck.side], extra: [...deck.extra] };
  }
  async dispatch(command: ClientCommand): Promise<void> {
    if (this.disposed) throw new Error('Client is disposed.');
    // Reject rather than queue stale prompt actions behind an unrelated request.
    if (this.lockToken && !['disconnect', 'move', 'settings', 'inspectCard'].includes(command.type)) throw new Error('Wait for the current action to finish.');
    const locking = !['move', 'settings', 'inspectCard', 'disconnect'].includes(command.type);
    const token = {};
    if (locking) { this.lockToken = token; this.patch({ busy: true, error: undefined }); }
    const epoch = this.epoch;
    try {
      switch (command.type) {
        case 'connect': await this.connect(); break;
        case 'disconnect': this.disconnect(); break;
        case 'signIn': {
          const auth = await this.services.signIn(command.username, command.password, { signal: this.connectionScope.signal });
          if (!this.disposed) this.patch({ auth: { signedIn: auth.signedIn, ...(auth.signedIn && auth.name ? { name: auth.name } : {}) }, status: 'Signed in. Go online to select a character.' }); break;
        }
        case 'signOut': this.disconnect(); this.lockToken = token; this.patch({ busy: true, auth: { signedIn: false } }); await this.services.signOut({ signal: this.connectionScope.signal }); this.patch({ auth: { signedIn: false }, status: 'Signed out.' }); break;
        case 'createCharacter': await this.requireGame().createCharacter(command.slot, command.name); break;
        case 'deleteCharacter': await this.requireGame().deleteCharacter(command.slot); break;
        case 'selectCharacter': await this.requireGame().selectCharacter(command.slot); this.assertEpoch(epoch); await this.refresh('lobby'); await this.refresh('deck'); this.assertEpoch(epoch); this.patch({ scene: 'lobby' }); break;
        case 'claimStarter': {
          const claim = await this.services.claimStarter(command.id, { signal: this.connectionScope.signal }); this.assertEpoch(epoch);
          const deck = expandStarterDeck(claim.deck); await this.services.saveDeck(deck, 'world', { signal: this.connectionScope.signal });
          this.editor = new DeckEditor(deck, this.collection); await this.refresh('deck'); await this.refresh('lobby'); break;
        }
        case 'openScene':
          if (command.scene !== 'lobby') this.stopWorld();
          if (this.view.unavailable?.[command.scene]) throw new Error(this.view.unavailable[command.scene]);
          if (!['title', 'settings', 'characters'].includes(command.scene) && !this.view.player) throw new Error('Select a character first.');
          if ((this.view.scene === 'duel' || ['preparing-duel', 'rock-paper-scissors', 'choose-first', 'duel'].includes(this.game?.state.phase ?? '')) && this.duelState.status !== 'finished' && !['duel', 'settings'].includes(command.scene)) throw new Error('Finish or surrender the duel first.');
          if (command.scene === 'lobby' && this.duelState.status === 'finished') await this.requireGame().finishDuel();
          this.patch({ scene: command.scene });
          if (['deck', 'shop', 'social'].includes(command.scene)) await this.refresh(command.scene); break;
        case 'refresh': await this.refresh(command.scene); break;
        case 'move':
          this.requireGame();
          if (!this.options.worldMaps || !this.world.position) throw new Error('Original collision data is unavailable. Generate the world maps before walking.');
          if (!this.frameRequest) throw new Error('Animated movement is unavailable.');
          if (!this.world.moveTo({ x: command.x, y: command.y })) throw new Error('That destination is blocked or unreachable.');
          this.scheduleWorld(); break;
        case 'moveArea': this.stopWorld(); await this.requireGame().enterArea(command.area); break;
        case 'chat': {
          if (!['global', 'trade', 'whisper', 'team'].includes(command.channel)) throw new Error('Unknown chat channel.');
          let targetPid: number | undefined;
          if (command.channel === 'whisper') {
            const target = this.requireGame().state.players.find(p => String(p.pid) === command.target || p.name.toLowerCase() === command.target?.toLowerCase());
            if (!target) throw new Error('Choose an online player to whisper.'); targetPid = target.pid;
          }
          await this.services.api.sendChat({ channel: command.channel as 'global' | 'trade' | 'whisper' | 'team', text: command.text, ...(targetPid === undefined ? {} : { targetPid }), requestId: crypto.randomUUID() }, { signal: this.connectionScope.signal }); break;
        }
        case 'interact':
          if (command.playerId < 0) {
            if (!this.services.decks.state.data) await this.refresh('deck');
            this.stopWorld(); this.resetDuel(); this.syncDuel();
            await this.requireGame().startNpcDuel(-command.playerId, this.currentDeck());
          } else this.patch({ status: `Selected ${this.requireGame().state.players.find(p => p.pid === command.playerId)?.name ?? 'player'}.` });
          break;
        case 'duelChallenge': {
          if (!this.services.decks.state.data) await this.refresh('deck');
          const result = await this.services.api.http.request('POST', '/api/de/duel/challenge', value => {
            if (!value || typeof value !== 'object' || !('room' in value) || !Number.isSafeInteger(value.room)) throw new Error('Invalid duel invitation response.');
            return { room: Number(value.room) };
          }, { pid: command.playerId }, { signal: this.connectionScope.signal });
          this.requireGame().challengeRoom(result.room); break;
        }
        case 'createDuelRoom': if (!this.services.decks.state.data) await this.refresh('deck'); await this.requireGame().createDuelRoom(command.options); break;
        case 'deleteDuelRoom': await this.requireGame().deleteDuelRoom(); break;
        case 'challengeRoom': if (!this.services.decks.state.data) await this.refresh('deck'); this.requireGame().challengeRoom(command.roomId, command.password); break;
        case 'replyChallenge': if (command.accept && !this.services.decks.state.data) await this.refresh('deck'); this.requireGame().replyToChallenge(command.accept); break;
        case 'spectate': this.resetDuel(); this.syncDuel(); await this.requireGame().watchDuel(command.pid); this.syncDuel(); break;
        case 'leaveDuel': if (!this.requireGame().state.spectating && this.duelState.status !== 'finished') throw new Error('Finish or surrender this duel first.'); this.resetDuel(); await this.requireGame().finishDuel(); this.patch({ scene: 'lobby', duel: null }); break;
        case 'chooseHand': await this.requireGame().chooseHand(command.hand); break;
        case 'chooseFirst': await this.requireGame().chooseFirst(command.first); break;
        case 'beginDuel': this.requireGame().beginDuel(); break;
        case 'selectDeck': {
          const deck = this.services.decks.state.data?.decks.find(d => d.name === command.name);
          if (!deck) throw new Error('Deck no longer exists.');
          await this.services.selectDeck(command.name, 'world', { signal: this.connectionScope.signal });
          this.editor = new DeckEditor(deck, this.collection); await this.services.refreshDecks({ signal: this.connectionScope.signal }); this.syncEditor(); this.emit(); break;
        }
        case 'newDeck': {
          if (this.editor?.dirty) throw new Error('Save your current deck before creating another.');
          const next = new DeckEditor({ name: command.name, main: [], side: [], extra: [] }, this.collection);
          if (!next.rename(command.name).ok) throw new Error('Invalid deck name.');
          if (this.services.decks.state.data?.decks.some(d => d.name === command.name)) throw new Error('A deck with that name already exists.');
          this.editor = next; this.syncEditor(); this.emit(); break;
        }
        case 'renameDeck': { const result = this.editor?.rename(command.name); if (!result?.ok) throw new Error(result && !result.ok ? result.reason : 'Choose a deck first.'); this.syncEditor(); this.emit(); break; }
        case 'deckCard': { const result = this.editor?.move(command.passcode, command.from, command.to, command.index); if (!result?.ok) throw new Error(result && !result.ok ? result.reason : 'Choose a deck first.'); this.syncEditor(); this.emit(); break; }
        case 'saveDeck': if (!this.editor) throw new Error('Choose a deck first.'); await this.services.saveEditor(this.editor, 'world', { signal: this.connectionScope.signal }); await this.services.refreshDecks({ signal: this.connectionScope.signal }); this.syncEditor(); this.emit(); break;
        case 'deleteDeck': await this.services.deleteDeck(command.name, { signal: this.connectionScope.signal }); if (this.editor?.deck.name === command.name) this.editor = null; await this.refresh('deck'); break;
        case 'buy': {
          const pending = this.services.pendingPurchase;
          if (pending && (pending.itemId !== command.itemId || pending.count !== command.count)) throw new Error('Retry your pending purchase first.');
          const result = pending ? await this.services.retryPurchase({ signal: this.connectionScope.signal }) : await this.services.buy(command.itemId, command.count, { signal: this.connectionScope.signal }); this.assertEpoch(epoch);
          this.patch({ shop: toShopView(result), status: 'Purchase confirmed.' }); await this.requireGame().refreshCollection(); break;
        }
        case 'duelRespond': {
          if (this.submittedPrompt === this.duelState.prompt?.id) throw new Error('This choice has already been sent.');
          const response = interpretResponse(this.duelState, command.promptId, command.response);
          const messages = encodeDuelResponse(this.duelState, response);
          this.submittedPrompt = this.duelState.prompt?.id ?? null;
          for (const m of messages) this.requireGame().sendDuel(m.id, m.data);
          this.syncDuel(); break;
        }
        case 'duelAction': {
          if (this.submittedPrompt === this.duelState.prompt?.id) throw new Error('This choice has already been sent.');
          const response = interpretAction(this.duelState, command.actionId), messages = encodeDuelResponse(this.duelState, response);
          this.submittedPrompt = this.duelState.prompt?.id ?? null;
          for (const m of messages) this.requireGame().sendDuel(m.id, m.data);
          this.syncDuel(); break;
        }
        case 'surrender': {
          if (!this.game?.duel) throw new Error('No active duel.');
          // Surrender is a protocol request, never a locally asserted outcome.
          const bytes = new Uint8Array(16), dv = new DataView(bytes.buffer); dv.setUint32(4, 13); dv.setUint32(12, 10);
          this.game.sendDuel(0x6350, bytes); break;
        }
        case 'inspectCard': break;
        case 'accountAction': await this.account.dispatch(command.action); break;
        case 'captureStart': this.capture.start(); this.emit(); break;
        case 'captureStop': this.capture.stop(); this.emit(); break;
        case 'captureDownload': {
          const output = captureDownload(this.capture), url = URL.createObjectURL(output.blob);
          const release = this.scope.own(() => URL.revokeObjectURL(url));
          try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = output.filename; anchor.click(); }
          finally { this.scope.timeout(release, 1000); }
          break;
        }
        case 'audioAction': {
          if (!this.options.audio) throw new Error('Audio is unavailable.');
          // Dispatch starts synchronously to preserve browser gesture activation.
          await this.options.audio.dispatch(command.action);
          this.patch({ audio: this.options.audio.getState() }); break;
        }
        case 'socialAction': this.social.dispatch(command.action); break;
        case 'onlineAction': await this.online.dispatch(command.action); break;
        case 'settings': {
          const next = { ...this.view.settings, ...command.settings };
          for (const key of ['sound', 'music'] as const) if (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 1) throw new Error('Invalid volume.');
          if (typeof next.reducedMotion !== 'boolean' || typeof next.showCardNames !== 'boolean') throw new Error('Invalid settings.');
          this.options.persistSettings?.(next); this.options.audio?.setVolumes(next);
          this.timeline.setReducedMotion(next.reducedMotion || !this.frameRequest);
          this.patch({ settings: next, ...(this.options.audio ? { audio: this.options.audio.getState() } : {}) });
          if (this.settledDuel) this.renderDuelFrame(); break;
        }
        default: { const unknownCommand: never = command; throw new Error(`Unknown client command: ${String(unknownCommand)}`); }
      }
    } catch (e) { if (epoch === this.epoch || command.type === 'connect') this.failure(e); throw e; }
    finally { if (locking && this.lockToken === token) { this.lockToken = null; if (!this.disposed) this.patch({ busy: false }); } }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; ++this.epoch; this.cancelAnimation(); this.stopWorld(); this.world.dispose();
    const game = this.game;
    const cleanup = [() => game?.dispose(), () => this.social.dispose(), () => this.account.dispose(), () => this.capture.dispose(), () => this.online.dispose(), () => this.services.dispose(), () => this.scope.dispose(), () => this.options.assets?.dispose(), () => this.options.audio?.dispose()];
    this.game = null; this.listeners.clear(); this.projections.clear();
    const errors: unknown[] = [];
    for (const close of cleanup) try { close(); } catch (e) { errors.push(e); }
    if (errors.length) throw new AggregateError(errors, 'Client shutdown failed');
  }
}
