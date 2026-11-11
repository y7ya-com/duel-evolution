import { serverInfoText } from './duel/server-info';
import { ResourceScope } from './core/scope';
import { GameSession } from './network/session';
import type { SessionState, SessionOptions } from './network/session';
import type { Channel } from './network/gateway';
import type { WireMessage } from './network/codec';
import { createDuelState, reduceDuelMessage, acknowledgePresentation } from './duel/model';
import { recordMessages, type DuelRecord } from './duel/record';
import { idbRecordStore, type DuelRecordStore } from './services/duel-records';
import { loadDuelSpeed } from './ui/htmlui/duel-dialogs';
import type { DuelState } from './duel/types';
import { encodeDuelResponse } from './duel/responses';
import { GameApi, GameplayService, DeckEditor, toShopView, toSocialView, expandStarterDeck } from './services';
import { AssetManager } from './assets';
import { loadPackCatalog, packImagePath } from './shop/packs';
import type { Preloader } from './features/preload';
import type { SceneLoadEvents } from './ui/htmlui/scene-loading';
import { readableError } from './shop/errors';
import type { PackInfo } from './shop/packs';
import type { ShopCatalog } from './services/api';
import { ApiError } from './services/http';
import { SocialController } from './features/social';
import type { SocialBox } from './features/social';
import { OnlineController } from './features/online';
import { TagLobbyController } from './features/tag';
import type { GameplayCommand } from './gameplay/binary';
import { CardCatalog } from './catalog';
import { projectDuel, interpretResponse, interpretAction, applyTimeline, describeEvent } from './presentation';
import { fieldThemeKindForPasscode } from './duel/theme';
import { describeNotice } from './duel/text';
import { DuelTextCatalog } from './duel/text';
import { DuelTimeline } from './duel/timeline';
import { DuelCueQueue } from './duel/cues';
import { DuelAudioDirector } from './duel/audio';
import { duelRewards, pduNpcRecord, type NpcRecord, type ProfileSnapshot } from './duel/rewards';
import { fieldAudioSlotForPasscode } from './duel/theme';
import { AccountController } from './features/account';
import { ProfileController } from './features/profile';
import { NpcController,npcOpeningPresent } from './features/npc';
import type { NpcDialogueCatalog } from './npcs/dialogue';
import { AvatarLoader } from './avatars';
import type { AvatarLoadOptions } from './avatars';
import type { AvatarResource } from './avatars';
import type { WorldScene } from './world/scene';
import { WorldNavigator } from './world';
import { chooseInitialArrival } from './world/arrival';
import { isWalkable } from './world/pathfinding';
import { WorldRuntime } from './world/runtime';
import { chooseArrival } from './world/exits';
import type { ExitTrigger } from './world/exits';
import type { WorldMap, WorldPosition } from './world/maps';
import { SceneLoader } from './world/scene';
import type { WorldMaps } from './world';
import { LiveCapture, captureDownload } from './parity/live';
import { BrowserAudioManager } from './features/audio';
import { gameLanguage, isGameLanguage, loadGameLanguage, type GameLanguage, type LocalizedGameText } from './features/language';
import { decodeDialogTable, decodeStringTable } from './features/ui-text';
import type { ClientController, ClientView, ClientCommand, Scene, CardView, SettingsView, DuelView } from './ui/contracts';
import { serializeDeck } from './ui/deck';
import { CardDetailsCatalog, decodeLegacyDeck, encodeLegacyDeck } from './cards';
import type { OriginalCardTextCatalog } from './cards/original-text';
import type { DeckView } from './ui/contracts';
import type { ClientData } from './data';
import type {RecipeCatalog} from './recipes';
import { ownedTitles } from './features/titles';
import { createNpcResultContext, npcResultLine, reduceNpcResultContext } from './npcs/result';

export interface AppOptions {
  gatewayUrl: string;
  /** Where the server's duel records are kept (default: this browser's IndexedDB). */
  duelRecords?: DuelRecordStore;
  /** Idle prefetch of the next likely scenes and a starting duel's art (features/preload.ts). */
  preloader?: Preloader;
  /** Scene loads (the overlay and the dev timing log). */
  sceneLoads?: SceneLoadEvents;
  portOffset?: number;
  freeMode?: boolean;
  api?: GameApi;
  catalog?: CardCatalog;
  cardDetails?: CardDetailsCatalog;
  cardTexts?: OriginalCardTextCatalog;
  npcDialogue?: NpcDialogueCatalog;
  dataIssues?: string[];
  reloadData?: (signal:AbortSignal)=>Promise<ClientData>;
  recipes?:RecipeCatalog;
  assets?: AssetManager;
  audio?: BrowserAudioManager;
  worldMaps?: WorldMaps;
  random?: () => number;
  duelTexts?: DuelTextCatalog;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  sessionFactory?: (options: SessionOptions) => GameSession;
  settings?: Partial<SettingsView>;
  persistSettings?: (settings: SettingsView) => void;
  /** The character's own Friend List and deleted mail (the original's per-character files); the browser's storage in main.ts. */
  socialBox?: SocialBox;
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
  readonly tagLobby: TagLobbyController;
  readonly account: AccountController;
  readonly profile: ProfileController;
  readonly npc: NpcController;
  readonly loadWorldScene?: (mapId:number,signal:AbortSignal)=>Promise<WorldScene>;
  readonly loadAvatar?: (parts:Uint8Array,options:AvatarLoadOptions)=>Promise<AvatarResource>;
  readonly capture = new LiveCapture();
  private scope = new ResourceScope();
  private connectionScope = this.scope.child();
  private view: ClientView;
  private listeners = new Set<(state: ClientView) => void>();
  private game: GameSession | null = null;
  private editor: DeckEditor | null = null;
  private packCatalog: Promise<Map<number, PackInfo>> | null = null;
  private localized: LocalizedGameText | null = null;
  private languageToken = 0;
  private lastShop: ShopCatalog | null = null;
  private connectionLostAt = 0;
  /** The other duelist of a player-versus-player duel, from the challenge either side made. */
  private duelIsPvp = false;
  /** The Duel Log's Play: a record's 0x6202s fed through the duel model as a spectator sees them. */
  private replay: { names: [string, string]; when: number; messages: WireMessage[]; index: number; playing: boolean; timer: ReturnType<typeof setTimeout> | null; back: Scene } | null = null;
  private recordStore: DuelRecordStore | null = null;
  private get records(): DuelRecordStore { return this.recordStore ??= this.options.duelRecords ?? idbRecordStore(); }
  private pvpOpponent: string | null = null;
  private chatSeen: SessionState['chat'] | null = null;
  private timerSeen: unknown = null; private timerSeenAt = 0;
  /** Notice ids only grow (also across the games of a match), so a dismissed notice never hides a later one. */
  private noticeIds = 0;
  private nextOpponent: string | null = null;
  private duelChallengeRequest: Promise<{ room: number }> | null = null;
  private duelNotice: { id: number; text: string } | null = null;
  private sideboard: DeckView | null = null;
  private sideboardRound: number | null = null;
  private duelState: DuelState = createDuelState();
  /** Process-lifetime, like the original's never-cleared result category global; never reset with a session. */
  private npcResult = createNpcResultContext();
  private timeline = new DuelTimeline(this.duelState);
  private duelCues = new DuelCueQueue({ cardKind: pc => { const t = this.catalog.card(pc).type?.toLowerCase() ?? ''; return t.startsWith('spell') ? 'spell' : t.startsWith('trap') ? 'trap' : t ? 'monster' : undefined; },
    fieldKind: pc => { try { return fieldThemeKindForPasscode(pc, id => this.options.cardDetails?.get(id)?.internalId); } catch { return null; } } });
  private duelPortraits: [Uint8Array | undefined, Uint8Array | undefined] = [undefined, undefined];
  private duelAudio = new DuelAudioDirector();
  /** The profile when the duel began, and the NPC record the server sent after it (the result board's rewards). */
  private duelStartProfile: ProfileSnapshot | null = null;
  private duelNpcRecord: NpcRecord | null = null;
  private animationFrame: number | null = null;
  private lastFrame: number | null = null;
  private settledDuel: DuelView | null = null;
  private duelLog: string[] = [];
  private audioSlot = -1;
  private fieldPasscode = 0;
  private fieldAudioSlot = 11;
  private world = new WorldNavigator({ send: p => this.requireGame().move(p.x, p.y, p.direction) });
  private worldRuntime: WorldRuntime | null = null;
  private runtimeMap: number | null = null;
  private runtimeLoad: Promise<void> | null = null;
  private worldTransition = false;
  private arrivalFrom: {from:number;to:number} | null = null;
  private scenes: SceneLoader | null = null;
  private avatars: AvatarLoader | null = null;
  private worldArea: number | null = null;
  private worldSpawnContext: string | null = null;
  private worldFrame: number | null = null;
  private worldLastFrame: number | null = null;
  private submittedPrompt: number | null = null;
  /** The last board action sent, so a Tribute choice after a summon reads as one (presentation.ts boardInstruction). */
  private lastDuelAction: import('./duel/types').DuelResponse | null = null;
  private collectionRef: ReadonlyMap<number, number> | null = null;
  private limitsRef: ReadonlyMap<number, number> | null = null;
  private collection: CardView[] = [];
  private catalogCards: CardView[] | null = null;
  private projections = new Map<string, { source: unknown; result: unknown }>();
  private disposed = false;
  private epoch = 0;
  private lockToken: object | null = null;
  private attachingOffer = false;
  private observedAccountSession: unknown = null;
  private profileContext: string | null = null;
  private npcPlayer: string | null = null;
  private eligibilityDue=false;
  private eligibilityQueued=false;
  private freeMode: boolean;
  constructor(private options: AppOptions) {
    this.freeMode = options.freeMode ?? false;
    this.catalog = options.catalog ?? new CardCatalog();
    if (options.cardDetails) this.catalog.installDetails(options.cardDetails);
    if (options.cardTexts) this.catalog.installOriginalTexts(options.cardTexts);
    if (options.assets) {
      this.scenes = new SceneLoader({assets:options.assets}); this.avatars = new AvatarLoader(options.assets);
      this.loadWorldScene = (mapId,signal)=>{const work=this.scenes!.load(mapId,signal),end=options.sceneLoads?.begin(`map:${mapId}`);if(end)void work.then(end,end);return work;};
      this.loadAvatar = (parts,options)=>this.avatars!.load(parts,options);
    }
    this.resetWorldRuntime();
    this.services = new GameplayService(options.api ?? new GameApi());
    this.view = { ...initial(options.settings), mode:this.freeMode ? 'free' : 'world' };
    this.timeline.setReducedMotion(this.view.settings.reducedMotion || !this.frameRequest);
    this.duelAudio.setReducedMotion(this.view.settings.reducedMotion || !this.frameRequest);
    this.duelAudio.setMuted(!options.audio || this.view.settings.sound === 0);
    if (options.audio) { options.audio.setVolumes(this.view.settings); this.view.audio = options.audio.getState(); }
    this.social = new SocialController({ send: command => this.sendGameplay(command), onChange: socialDetail => this.patch({ socialDetail }), ...(options.socialBox ? { box: options.socialBox } : {}) });
    // A cosmetics response carries the authoritative wallet: the shop's wallet plate follows it.
    let cosmetics: unknown = null;
    this.online = new OnlineController({ http: this.services.api.http, onChange: online => {
      // Only a new server response counts; a loading or error notification repeats the previous one.
      const fresh = online.cosmetics !== cosmetics; cosmetics = online.cosmetics;
      const wallet = fresh ? online.cosmetics?.wallet : undefined, shop = this.view.shop;
      this.patch({ online, ...(wallet && shop && (shop.mp !== wallet.total || shop.earnedMp !== wallet.earned) ? { shop: { ...shop, mp: wallet.total, earnedMp: wallet.earned } } : {}) });
    } });
    this.tagLobby = new TagLobbyController({ http: this.services.api.http, onChange: tagLobby => this.patch({ tagLobby }) });
    if (options.assets) this.loadArchiveImage = (path, signal) => this.readArchiveImage(path, signal);
    this.profile = new ProfileController({send:command=>this.sendGameplay(command),onChange:profileDetail=>this.patch({profileDetail})});
    this.npc = new NpcController({send:(id,data)=>this.requireGame().sendLobby(id,data),onChange:npc=>{ if (npc.packs.length) this.loadPackNames(); this.patch({npc,
      npcCardViews:Object.fromEntries([...npc.cards.map(c=>c.id),...npc.giftCards].map(id=>[id,this.catalog.card(id)]))}); },
      onStartDuel:id=>this.startNpcDuel(id),onRefreshCollection:async()=>{const game=this.requireGame();await game.refreshCollection();await game.refreshPlayerBits();},
      onRefreshProgress:()=>this.requireGame().refreshPlayerBits(),
      resolveLine:(id,line)=>this.npcLine(id,line),resolvePresentText:id=>(this.languageTexts.table?.[id]?.trim() ? this.languageTexts.table[id]! : this.options.npcDialogue?.resolveText(id)),
      resultLine:()=>npcResultLine(this.npcResult)});
    this.account = new AccountController({ http: this.services.api.http, onChange: accountDetail => {
      const changed = accountDetail.session !== this.observedAccountSession; this.observedAccountSession = accountDetail.session;
      this.patch({ accountDetail, ...(changed && accountDetail.session ? { auth: { signedIn: accountDetail.session.signedIn, ...(accountDetail.session.signedIn && accountDetail.session.name ? { name: accountDetail.session.name } : {}) } } : {}) });
    } });
    this.view = { ...this.view, accountDetail: this.account.state, profileDetail:this.profile.state, npc:this.npc.state, capture: this.capture.status,
      ...(options.reloadData ? {dataStatus:{loading:false,issues:[...(options.dataIssues ?? [])]}} : {}),
      languageStatus:{ loading:null, available:!!options.assets && !!options.cardTexts?.size } };
    const language = this.view.settings.language;
    if (language && language !== 'E') { this.view = { ...this.view, settings:{ ...this.view.settings, language:'E' } }; void this.applyLanguage(language); }
  }
  getState(): ClientView { return this.view; }
  /** Options → Language (COptionDlg flags → CSystemConfigManager::applyLanguage): card names/rules and pack names and
   * descriptions are read again from the original tables of that language. A late or failed load never replaces the
   * text of a later choice; on failure the previous language stays and the error offers another try. */
  private async applyLanguage(language: GameLanguage): Promise<void> {
    const token = ++this.languageToken, previous = this.view.settings.language ?? 'E';
    const done = (localized: LocalizedGameText | null) => {
      this.localized = localized; this.installLanguageTexts();
      this.packCatalog = localized ? Promise.resolve(new Map(localized.packs)) : null;
      this.catalogCards = null; this.collectionRef = null; this.projections.clear();
      const settings = { ...this.view.settings, language }; this.options.persistSettings?.(settings);
      this.view = { ...this.view, settings, languageStatus:{ loading:null, available:true, ...(localized?.missing ? { missing:localized.missing } : {}) } };
      if (this.game) this.updateSession(this.game.state);
      if (this.settledDuel) this.syncDuel();
      if (this.view.packNames) { this.view = { ...this.view, packNames:undefined }; this.loadPackNames(); }
      const shop = this.lastShop;
      if (shop && this.view.shop) void this.shopView(shop).then(view => { if (token === this.languageToken && !this.disposed && this.view.shop) this.patch({ shop:{ ...this.view.shop, ...view } }); }).catch(() => {});
      this.emit();
    };
    if (language === 'E') { this.languageTexts = { table: null, dialogs: null }; done(null); return; }
    const name = gameLanguage(language).english;
    if (!this.options.assets || !this.options.cardTexts?.size) { this.patch({ languageStatus:{ loading:null, available:false, error:`${name} needs the original game data, which is not available here.` } }); return; }
    this.patch({ languageStatus:{ loading:language, available:true } });
    try {
      // NPC dialogue (yo2text_?) and the duel dialog texts (dlg_text_?) of that language; either missing keeps English
      const [localized, table, dialogs] = await Promise.all([loadGameLanguage(this.options.assets, language, this.options.cardTexts.entries, this.scope.signal),
        this.gameTextTable(language, this.scope.signal).catch(() => null), this.loadDialogs(language).catch(() => null)]);
      if (token === this.languageToken && !this.disposed) { this.languageTexts = { table, dialogs }; done(localized); }
    } catch (error) {
      if (token !== this.languageToken || this.disposed || error instanceof DOMException && error.name === 'AbortError') return;
      this.patch({ languageStatus:{ loading:null, available:true, error:`Could not load the ${name} game text (${error instanceof Error ? error.message : String(error)}). Still showing ${gameLanguage(previous).english}; choose ${gameLanguage(language).name} again to retry.` } });
    }
  }
  /** The chosen language's yo2text table and duel dialog texts (null: English, or not in the original data). */
  private languageTexts: { table: readonly string[] | null; dialogs: ReadonlyMap<number, string> | null } = { table: null, dialogs: null };
  private async loadDialogs(language: GameLanguage): Promise<ReadonlyMap<number, string>> {
    const assets = this.options.assets!, letter = language.toLowerCase();
    const read = async (path: string) => { const lease = await assets.readScene(path, this.scope.signal); try { return lease.value.bytes.slice(); } finally { lease.release(); } };
    const [index, text] = await Promise.all([read(`data/bin#/dlg_indx_${letter}.bin`), read(`data/bin#/dlg_text_${letter}.bin`)]);
    return decodeDialogTable(index, text);
  }
  /** An NPC's balloon line in the chosen language: the five strings from its text id (CFukiDictionary), else English. */
  private npcLine(npc: number, line: number): string | null | undefined {
    const table = this.languageTexts.table, textId = this.options.npcDialogue?.textId(npc, line);
    if (table && textId !== undefined) {
      const rows = table.slice(textId, textId + 5).filter(row => row.trim()).map(row => row.trim());
      if (rows.length) return rows.join('\n');
    }
    return this.options.npcDialogue?.resolve(npc, line);
  }
  private installLanguageTexts(): void {
    this.options.duelTexts?.localizeDialogs(this.languageTexts.dialogs);
    if (this.options.cardTexts) this.catalog.installOriginalTexts(this.options.cardTexts);
    if (this.localized) this.catalog.installLocalizedTexts(this.localized.cards, this.localized.language);
  }
  get diagnostics(): { duel: DuelState; assetBytes: number; resources: number } {
    return { duel: structuredClone(this.duelState), assetBytes: this.options.assets?.cacheBytes ?? 0, resources: this.scope.size };
  }
  subscribe(listener: (state: ClientView) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private emit(): void { if (!this.disposed) { this.view = { ...this.view, capture: this.capture.status, ...this.place() }; this.syncAudioScene(); this.options.preloader?.observe(this.view.scene, this.game?.state.area ?? null, this.game?.state.phase ?? null); for (const listener of this.listeners) listener(this.view);this.scheduleNpcEligibility(); } }
  private scheduleNpcEligibility():void {
    const game=this.game,state=this.npc?.state;
    if(!this.eligibilityDue || this.eligibilityQueued || this.view.busy || this.freeMode || !game || game.state.phase!=='lobby' || !game.state.pbin || !game.state.npcbin || !state ||
      !['idle','done'].includes(state.stage) || state.eligibility.refreshing || [state.eligibility.status,state.firstContactStatus,state.giftStatus].some(s=>s==='pending'||s==='uncertain') || state.packStatus==='pending' || state.packs.length>0&&state.packStatus==='idle')return;
    const epoch=this.epoch;this.eligibilityQueued=true;
    queueMicrotask(()=>{this.eligibilityQueued=false;if(this.disposed || epoch!==this.epoch || this.game!==game || this.view.busy || !this.eligibilityDue)return;
      this.eligibilityDue=false;if(!this.npc.checkEligibility())this.eligibilityDue=true;});
  }
  private patch(patch: Partial<ClientView>): void { this.view = { ...this.view, ...patch }; this.emit(); }
  async initialize(): Promise<void> {
    try { const auth = await this.services.refreshSession({ signal: this.scope.signal });
      if (!this.disposed) this.patch({ auth: { signedIn: auth.signedIn, ...(auth.signedIn && auth.name ? { name: auth.name } : {}) }, status: auth.signedIn ? 'Ready to go online.' : 'Sign in to enter Duel Academy.' });
    } catch (e) { if (!this.disposed) this.failure(e); }
  }
  cardView(passcode: number): CardView { return this.catalog.card(passcode); }
  async loadCardImage(passcode: number, signal: AbortSignal): Promise<{ url: string; release(): void }> {
    if (!this.options.assets) throw new Error('Original card art is not configured.');
    const lease = await this.options.assets.loadCard(passcode, signal);
    return { url: lease.value.url, release: () => lease.release() };
  }
  private loadPackCatalog(): Promise<Map<number, PackInfo>> | null {
    if (!this.options.assets) return null;
    return this.packCatalog ??= loadPackCatalog(this.options.assets, this.scope.signal).catch(error => { this.packCatalog = null; throw error; });
  }
  private rarities: Promise<void> | null = null;
  /** Card rarities for the inspector, once per client; the editor redraws when they arrive. */
  private loadRarities(): void {
    const api = this.services.api; if (this.rarities || typeof api.cardRarities !== 'function') return;
    this.rarities = api.cardRarities({ signal: this.scope.signal }).then(table => {
      if (this.disposed) return;
      this.catalog.installRarities(table); this.catalogCards = null; this.collectionRef = null; this.projections.clear();
      const game = this.game?.state; if (game) this.collection = [...game.collection].map(([pc, n]) => this.catalog.card(pc, n));
      this.editor?.setCollection(this.collection); this.syncEditor(); this.emit();
    }).catch(() => { this.rarities = null; });
  }
  /** Reward packs are named from the same original tables as the shop. */
  private loadPackNames(): void {
    if (this.view.packNames) return;
    void this.loadPackCatalog()?.then(packs => { if (!this.disposed) this.patch({ packNames: Object.fromEntries([...packs].map(([id, pack]) => [id, pack.name])) }); }).catch(() => {});
  }
  /** Names, descriptions and art from the original pack tables and card catalogue; the server only sends ids. */
  private async shopView(shop: ShopCatalog): Promise<ClientView['shop'] & object> {
    this.lastShop = shop;
    const view = toShopView(shop), assets = this.options.assets;
    let packs: Map<number, PackInfo> | null = null;
    if (assets) {
      try { packs = await this.loadPackCatalog(); } catch { packs = null; }
    }
    view.items = view.items.map((item, i) => {
      const product = shop.items[i]!;
      if (product.kind === 0 && product.param > 0) { const card = this.catalog.card(product.param), known = card.name !== `Card ${product.param}`; return { ...item, name: (this.localized && card.name) || (known ? card.name : product.name || card.name), card, ...(card.description ? { description: card.description } : {}) }; }
      const pack = product.kind === 1 ? packs?.get(product.param) : undefined;
      if (product.kind === 1) item = { ...item, packId: product.param };
      if (!pack) return item;
      const imagePath = packImagePath(pack.image);
      return { ...item, name: (this.localized && pack.name) || product.name || pack.name || item.name, ...(pack.description ? { description: pack.description } : {}), ...(imagePath ? { imagePath } : {}) };
    });
    this.options.preloader?.warmPaths(view.items.flatMap(item => item.imagePath ? [item.imagePath] : []));
    return view;
  }
  /** Original artwork by archive path, limited to the pack, duel and card-back folders the UI draws from.
   * Absent without configured assets, so the UI draws its own fallbacks instead of broken images. */
  readonly loadArchiveImage?: (path: string, signal: AbortSignal) => Promise<{ url: string; release(): void }>;
  private async readArchiveImage(path: string, signal: AbortSignal): Promise<{ url: string; release(): void }> {
    if (!this.options.assets) throw new Error('Original artwork is not configured.');
    // Duel effects are also movie/sheet scripts (.txt) next to their PNGs; the waist-up avatar parts are listed in .csv;
    // the menu bar and windows use data/common/window and data/common/icon; card-get uses data/y/result and data/card_get;
    // the shop data/shop and its clerk's picture data/avatar/npc (tiles listed in its .csv); the trade's lamps data/deck; the lobby data/menu.
    if (!/^data\/(?:(?:cardpack|y\/duel|y\/duel_end|y\/janken|y\/result|card_get|card|avatar\/wu|avatar\/npc|shop|deck|common\/window|common\/icon|menu)\/(?:[\w#.-]+\/)*[\w#.-]+\.png|(?:y2?\/duel\/(?:[\w#.-]+\/)*[\w#.-]+\.txt|menu\/menu_mark_a01\.txt|y2\/duel\/(?:[\w#.-]+\/)*[\w#.-]+\.png|avatar\/wu\/w[mw]_data\.csv|avatar\/npc\/[ad]\d\d\.csv))$/i.test(path) || path.includes('..')) throw new Error('Not an original artwork path.');
    const lease = await this.options.assets.readScene(path, signal);
    return { url: lease.value.url, release: () => lease.release() };
  }
  private gameTexts = new Map<string, Promise<readonly string[]>>();
  /** A language's whole UI string table (CStringDB: data/common/yo2text_?.idx / .bin, the language's letter), by id. */
  readonly gameTextTable = (language: GameLanguage, signal?: AbortSignal): Promise<readonly string[]> => {
    const assets = this.options.assets; if (!assets) return Promise.reject(new Error('The original game text is not configured.'));
    let table = this.gameTexts.get(language);
    if (!table) {
      const read = async (path: string) => { const lease = await assets.readScene(path, signal); try { return lease.value.bytes.slice(); } finally { lease.release(); } };
      const base = `data/common/yo2text_${language.toLowerCase()}`;
      table = Promise.all([read(`${base}.idx`), read(`${base}.bin`)]).then(([idx, bin]) => Object.freeze(decodeStringTable(idx, bin, gameLanguage(language).encoding)));
      this.gameTexts.set(language, table); table.catch(() => this.gameTexts.delete(language));
    }
    return table;
  };
  /** The original's own UI strings in the chosen language, by text id. */
  readonly gameText = async (ids: readonly number[], signal: AbortSignal): Promise<ReadonlyMap<number, string>> => {
    const table = await this.gameTextTable(this.view.settings.language ?? 'E', signal), out = new Map<number, string>();
    for (const id of ids) if (Number.isInteger(id) && id >= 0 && id < table.length && table[id]) out.set(id, table[id]!);
    return out;
  };
  /** Whether `password` is the signed-in account's: the original compares the typed password with the login's before
   * it deletes a character (NetAccountTask.cpp DEL_PROMPT). The browser keeps no password, so the server checks it with a
   * password sign-in of this account; null when the account has no password to check (Discord only, signed out). */
  readonly checkPassword = async (password: string, signal: AbortSignal): Promise<boolean | null> => {
    const session = await this.services.api.session({ signal });
    if (!session.signedIn || !session.password || !session.name) return null;
    if (!password || password.length > 128) return false;
    try { await this.services.api.signIn(session.name, password, { signal }); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 401) return false; throw e; }
  };
  private failure(e: unknown): void {
    if (this.disposed || e instanceof DOMException && e.name === 'AbortError') return;
    // A 401 means the browser's sign-in ended (signed out elsewhere, expired cookie), not a broken action.
    if (e instanceof ApiError && e.status === 401) { this.patch({ error: 'Your sign-in has ended. Reload the page and sign in again to continue.', status: 'Signed out.' }); return; }
    this.patch({ error: e instanceof Error ? e.message : String(e), status: 'The action could not be completed.' });
  }
  private assertEpoch(epoch: number): void { if (this.disposed || epoch !== this.epoch) throw new DOMException('Session changed', 'AbortError'); }
  private requireGame(): GameSession { if (!this.game) throw new Error('Go online first.'); return this.game; }
  /** The earned titles (Change Title) and whether the character is in their My Room, from the game session. */
  private place(): Pick<ClientView, 'titles' | 'location' | 'tournament' | 'eventInfo' | 'sanctions'> {
    const game = this.game?.state; if (!game) return { titles: undefined, location: undefined, tournament: null, eventInfo: null, sanctions: undefined };
    return { titles: this.project('titles', game.pbin, pbin => ownedTitles(pbin)), location: game.location === 'my-room' ? 'my-room' : 'world',
      tournament: game.tournament ?? null, eventInfo: game.eventInfo ?? null, sanctions: game.sanctions };
  }
  private project<S, T>(key: string, source: S, convert: (source: S) => T): T {
    const cached = this.projections.get(key);
    if (cached && cached.source === source) return cached.result as T;
    const result = convert(source); this.projections.set(key, { source, result }); return result;
  }
  private updateSession(state: SessionState): void {
    if (this.disposed) return;
    // A connection that was in play and is now lost for good (refused or expired resume, a failed transport): the old
    // channels are gone, so leave the dead scene for the title with the reason and Go Online.
    if (state.connection === 'error' && this.game && ['online', 'reconnecting'].includes(this.view.connection)) {
      const game = this.game, reason = state.error ?? 'The connection was lost.';
      queueMicrotask(() => { if (this.disposed || this.game !== game) return; this.disconnect(); this.connectionLostAt = Date.now(); this.patch({ error: `${reason.replace(/[.!]?$/, '.')} Go Online to connect again.`, status: 'Connection lost.' }); });
    }
    if (state.challenge) this.nextOpponent = state.challenge.name;
    if (state.chat !== this.chatSeen) {
      // The server's own lines (pid 0, e.g. an opponent's lost connection) are not visible on the duel screen otherwise.
      const fresh = this.chatSeen ? state.chat.filter(m => !this.chatSeen!.includes(m)) : []; this.chatSeen = state.chat;
      // Channel 9 is the server's duel text log (the duel screen keeps its own); 10 tag relay identities.
      const line = fresh.filter(m => m.pid === 0 && m.channel !== 9 && m.channel !== 10 && m.text.trim()).at(-1);
      if (line && this.duelState.status === 'playing' && ['duel', 'sideboarding'].includes(state.phase)) { this.duelNotice = { id: ++this.noticeIds, text: line.text.trim() }; this.duelLog = [...this.duelLog, line.text.trim()].slice(-100); this.syncDuel(); }
    }
    if ((state.limits ?? null) !== this.limitsRef) {
      // the server's forbidden/limited list: the deck's marks, limits and checks follow it (CLimitationList)
      this.limitsRef = state.limits ?? null; this.catalog.installLimits(this.limitsRef);
      this.catalogCards = null; this.collectionRef = null; this.projections.clear();
    }
    if (state.collection !== this.collectionRef) {
      this.collectionRef = state.collection;
      this.collection = [...state.collection].map(([pc, n]) => this.catalog.card(pc, n));
      this.editor?.setCollection(this.collection);
    }
    const selected = state.characters.find(c => c.slot === state.selectedSlot);
    const profile = state.profile;
    // The Tag Duel lobby polls only while this character stands in a lobby; a duel owns the seats.
    const tagPolling = state.phase === 'lobby' && !!profile && state.connection === 'connected'; queueMicrotask(() => { if (this.disposed) return; if (tagPolling) this.tagLobby.start(); else this.tagLobby.stop(); });
    const npcPlayer=profile ? `${profile.pid}:${state.selectedSlot}` : null;
    if (npcPlayer !== this.npcPlayer) {this.npcPlayer=npcPlayer;this.npc.reset();}
    if (state.connection !== 'connected' && this.view.connection === 'online') this.npc.disconnected();
    const context = profile ? `${profile.pid}:${state.areaBlock}` : null;
    if (context !== this.profileContext) {
      this.profileContext = context;this.eligibilityDue=profile!==null;this.profile.reset(); this.profile.dispatch({type:'setSelf',pid:profile?.pid ?? null}); this.social.setOwner(profile?.pid ?? null);
    }
    const worldMap = this.options.worldMaps?.maps.find(m => m.id === state.area);
    const self = state.players.find(p => p.pid === profile?.pid);
    const spawnContext = self && profile ? `${profile.pid}:${state.areaBlock}:${state.area}` : null;
    let spawn: ReturnType<typeof chooseInitialArrival> | null = null;
    if (worldMap && self?.x !== undefined && self.y !== undefined && spawnContext !== this.worldSpawnContext) {
      this.worldSpawnContext = spawnContext;
      // A fresh server presence uses (0,0) until the client sends its initial move.
      if (this.arrivalFrom?.to===state.area || self.x === 0 && self.y === 0 && (!worldMap.grid || !isWalkable(worldMap.grid,self as {x:number;y:number})) && worldMap.entries.some(e=>e.from===8)) {
        spawn = this.arrivalFrom?.to===state.area ? chooseArrival(worldMap,this.arrivalFrom.from,{crossings:true,random:this.options.random}) : chooseInitialArrival(worldMap,this.options.random);
        this.arrivalFrom=null;
        const game = this.game, epoch = this.epoch, position = spawn;
        queueMicrotask(()=> {
          if (this.disposed || this.game !== game || epoch !== this.epoch || this.worldSpawnContext !== spawnContext) return;
          try { game!.move(position.x,position.y,position.direction); this.updateSession(game!.state); } catch(error) { this.failure(error); }
        });
      }
    }
    if (worldMap && self?.x !== undefined && self.y !== undefined && (this.worldArea !== state.area || !this.world.moving)) {
      this.world.reset(worldMap, spawn ?? { x:self.x,y:self.y,direction:(self.direction ?? 0)&7 }); this.worldArea = state.area;
      if(this.worldRuntime && this.runtimeMap!==state.area) this.loadWorldRuntime(worldMap,this.world.position!);
    }
    const connection = state.connection === 'connected' ? 'online' : state.connection === 'connecting' ? 'connecting'
      : state.connection === 'reconnecting' ? 'reconnecting' : state.connection === 'error' ? 'error' : 'offline';
    const duelPreparing = ['preparing-duel', 'rock-paper-scissors', 'choose-first'].includes(state.phase);
    let scene = this.view.scene;
    if (state.phase === 'characters' && !profile) scene = 'characters';
    // a Duel Log replay holds the duel screen while the session sits in the lobby (any lobby update kept sending it back)
    if (state.phase === 'lobby' && ['title', 'characters', 'duel'].includes(scene) && !(scene === 'duel' && this.replay)) scene = 'lobby';
    if ((duelPreparing || state.phase === 'duel' || state.phase === 'sideboarding') && scene !== 'settings') scene = 'duel';
    if (state.match?.stage === 'sideboarding' && !state.match.complete && this.sideboardRound !== state.match.round) {
      this.sideboard = { name:'Match Deck', main:[...state.match.deck.main], side:[...(state.match.deck.side ?? [])], extra:[...state.match.deck.extra] };
      this.sideboardRound = state.match.round;
    }
    if (!state.match || state.match.complete) { this.sideboard = null; this.sideboardRound = null; }
    // live's window.yo2Net = {reconnecting, attempt} (ovr/lobbyretry.c), for the page and its tests
    const net = state.net ?? { reconnecting:false, attempt:0, what:null };
    try { (globalThis as { yo2Net?: unknown }).yo2Net = { reconnecting:net.reconnecting, attempt:net.attempt }; } catch { /* read-only global */ }
    this.view = { ...this.view, connection, scene, net,
      characters: state.characters.map(c => ({ slot: c.slot, name: c.name, level: c.level, selected: c.slot === state.selectedSlot, parts: Array.from(c.avatarA) })),
      player: profile ? { id: profile.pid, name: selected?.name ?? this.view.auth?.name ?? 'Duelist', level: profile.level, mp: profile.mp } : null,
      lobby: profile ? {
        mapId:state.area, name: `Duel Academy · Area ${state.area}`, width: worldMap?.width ?? 1600, height: worldMap?.height ?? 1200, connected: connection === 'online',
        areas: this.project('areas', state.areas, areas => areas.map(a => ({ ...a, name: `Area ${a.area}` }))),
        npcs: this.freeMode ? [] : this.project('npcs', state.npcs, npcs => npcs.map(n => ({ id: n.id, name: n.name }))),
        rooms: this.project('rooms', state.rooms, rooms => rooms.map(r => ({ id: r.id, owner: r.owner, name: state.players.find(p => p.pid === r.owner)?.name ?? `Room ${r.id}`, state: r.state, style: r.style, password: r.password, watch: r.mode !== 0, opponent: r.opponent }))),
        invitation: this.project('invitation', state.challenge, challenge => challenge ? { name: challenge.name, pid: challenge.pid } : undefined),
        outgoing: this.project('outgoing', state.outgoingChallengeRoom, room => room ? { name: this.nextOpponent ?? state.players.find(p => state.rooms.some(r => r.id === room && r.owner === p.pid))?.name ?? 'your opponent' } : undefined),
        // All areas of a world share one server block; only players in this area (its area block) are on this map.
        avatars: state.players.filter(p => p.pid === profile.pid || p.areaBlock === state.areaBlock).map(p => ({ id:p.pid,name:p.name,x:p.pid === profile.pid && spawn ? spawn.x : p.x ?? 0,y:p.pid === profile.pid && spawn ? spawn.y : p.y ?? 0,self:p.pid === profile.pid,parts:p.parts,direction:p.direction,world:([4,5,6,7].includes(state.area)?1:0) as 0|1,duelling:p.state !== undefined && p.state >= 0x67 && p.state <= 0x6a,motion:p.pid === profile.pid && this.world.walking ? 'walk' as const : 'stand' as const })),
        chat: this.project('chat', state.chat, chat => chat.map((m, i) => ({ id: String(i), sender: m.name, text: m.text, channel: channelName(m.channel) }))),
        channels: ['global', 'trade', 'whisper', 'team'],
      } : null,
      preparation: duelPreparing ? { role:state.duelRole, phase: state.duelFirst !== null ? 'ready' : state.phase === 'rock-paper-scissors' && state.rpsLost ? 'waiting-for-first' : state.phase, opponentHand: state.opponentHand } : undefined,
      relay: this.project('relay',state.relay,relay => relay ? { active:[...relay.active] as [0|1,0|1], self:relay.self, players:relay.players.map(p => ({pid:p.pid,name:p.name})),canAct:relay.canAct } : undefined),
      matchmaking:this.project('matchmaking',state.matchmaking,matchmaking=>({...matchmaking,opponent:matchmaking.opponent ? {pid:matchmaking.opponent.pid,name:matchmaking.opponent.name,level:matchmaking.opponent.level} : null})),
      match: state.match ? { round:state.match.round, scores:[...state.match.scores], complete:state.match.complete } : undefined,
      sideboarding: state.match?.stage === 'sideboarding' && !state.match.complete && this.sideboard ? {
        deck:structuredClone(this.sideboard), original:{ name:'Match Deck', main:[...state.match.original.main], side:[...(state.match.original.side ?? [])], extra:[...state.match.original.extra] },
        round:state.match.round, scores:[...state.match.scores], deadline:state.match.sideboardDeadline,
        ready:false,
      } : undefined,
      status: state.phase === 'lobby' ? 'Online in Duel Academy.' : state.phase.replaceAll('-', ' '),
      ...(state.error ? { error: state.error } : {}),
    };
    if (this.view.duel && this.view.duel.spectating !== (state.spectating || !!this.replay)) {
      this.view = { ...this.view, duel: { ...this.view.duel, spectating: state.spectating || !!this.replay } };
      if (this.settledDuel) this.settledDuel = { ...this.settledDuel, spectating: state.spectating || !!this.replay };
    }
    this.syncEditor();
    if (this.settledDuel) this.renderDuelFrame(); else this.emit();
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
    if (channel === this.game?.lobby) { this.social.receive(message); this.profile.receive(message); this.npc.receive(message); }
    if (channel === this.game?.lobby && message.id === 0x4140) { const record = pduNpcRecord(message.data); if (record) this.duelNpcRecord = record; }
    if ( !duelIds.has(message.id) || channel !== this.game?.duel) return;
    if (this.replay) this.stopReplay();
    this.applyDuel(message);
  }
  /** One duel message through the model, the log, the timeline and the cues (a live duel's or a replay's). */
  private applyDuel(message: WireMessage): void {
    const previousPrompt = this.duelState.prompt?.id;
    // A spectator's stream is the server's public view: no side is this client's own (never show a hand face up).
    const observer = !!this.game?.state.spectating && !this.replay;
    const previous = observer && !this.duelState.observer ? { ...this.duelState, observer } : this.duelState;
    this.duelState = reduceDuelMessage(previous, message);
    const npcResult = this.npcResult; try { this.npcResult = reduceNpcResultContext(npcResult, this.duelState, message); } catch { /* malformed packet: keep the last context */ }
    const names = this.duelNames();
    this.duelLog = [...this.duelLog, ...this.duelState.events.filter(e => e.sequence > previous.sequence).map(e => describeEvent(this.duelState, this.catalog, names, e, this.options.duelTexts)).filter((line): line is string => line !== null)].slice(-100);
    for (const event of this.duelState.events) if (event.sequence > previous.sequence && event.type === 'notice') this.duelNotice = { id: ++this.noticeIds, text: describeNotice(event.params[0] ?? 0, this.options.duelTexts) };
    for(const event of this.duelState.events) if(event.sequence>previous.sequence && event.type==='engine:14') this.fieldPasscode=event.params[0];
    for (const event of this.duelState.events) if (event.sequence > previous.sequence && event.type === 'server-notice') { const text = serverInfoText(event.params[0] ?? 0, event.player === 1, names[1]); if (text) { this.duelNotice = { id: ++this.noticeIds, text }; this.duelLog = [...this.duelLog, text].slice(-100); } }
    this.timeline.enqueue(previous, this.duelState); this.duelCues.collect(previous, this.duelState);
    if (this.duelState.sequence > previous.sequence) this.duelAudio.enqueue(previous,this.duelState);
    if (!this.replay && this.duelState.result && [1,2,3].includes(this.duelState.result.result)) this.npc.afterDuel(this.duelState.result.result as 1|2|3);
    if (this.npcResult.complete && !npcResult.complete) this.npc.refreshResultLine();
    if (this.duelState.prompt?.id !== previousPrompt) this.submittedPrompt = null;
    this.syncDuel();
  }
  private stopWorld(): void {
    this.world.cancel();
    if (this.worldFrame !== null) (this.options.cancelFrame ?? globalThis.cancelAnimationFrame)?.(this.worldFrame);
    this.worldFrame = null; this.worldLastFrame = null;
  }
  private resetWorldRuntime(): void {
    this.world.dispose();this.worldRuntime?.dispose();this.runtimeMap=null;this.runtimeLoad=null;
    this.worldRuntime=this.options.assets ? new WorldRuntime({assets:this.options.assets,crossings:true}) : null;
    this.world=new WorldNavigator({send:p=>this.requireGame().move(p.x,p.y,p.direction),...(this.worldRuntime ? {physics:this.worldRuntime} : {}),
      onExit:exit=>this.enterWorldExit(exit),onError:error=>{this.stopWorld();this.failure(error);}});
  }
  private loadWorldRuntime(map:WorldMap,position:WorldPosition): void {
    const runtime=this.worldRuntime;if(!runtime)return;const epoch=this.epoch;
    this.runtimeMap=map.id;const load=runtime.load(map,position,this.connectionScope.signal);this.runtimeLoad=load;const ended=this.options.sceneLoads?.begin(`world:${map.id}`);if(ended)void load.then(ended,ended);
    // its art unreachable is the world view's own failure to say (Map artwork could not be loaded, Retry Map), never a
    // bare "Failed to fetch" dialog over the lobby; anything else is the app's
    void load.catch(error=>{if(this.worldRuntime!==runtime || epoch!==this.epoch)return;if(/Failed to fetch|NetworkError|Load failed/.test(String((error as Error)?.message))){console.warn('world runtime:',error);return;}this.failure(error);}).finally(()=>{if(this.runtimeLoad===load)this.runtimeLoad=null;});
  }
  private async enterWorldExit(exit:ExitTrigger): Promise<void> {
    if(this.worldTransition || !this.game || this.game.state.phase!=='lobby')return;
    const game=this.game,epoch=this.epoch,from=game.state.area;this.worldTransition=true;this.arrivalFrom={from,to:exit.destination};this.stopWorld();
    try {await game.enterArea(exit.destination);this.assertEpoch(epoch);}
    catch(error) {if(epoch===this.epoch){this.arrivalFrom=null;throw error;}}
    finally {if(epoch===this.epoch)this.worldTransition=false;}
  }
  private scheduleWorld(): void {
    const request = this.frameRequest;
    if (!request || !this.world.moving || this.worldFrame !== null || this.disposed) return;
    this.worldFrame = request(time => {
      this.worldFrame = null; if (this.disposed) return;
      const delta = this.worldLastFrame === null ? 1000 / 30 : time - this.worldLastFrame; this.worldLastFrame = time;
      try {
        this.world.update(delta);
        if(this.worldRuntime?.status.error)throw new Error(this.worldRuntime.status.error);
        const position = this.world.position, lobby = this.view.lobby;
        if (position && lobby) this.patch({ lobby: { ...lobby, avatars: lobby.avatars.map(a => a.self ? { ...a,x:position.x,y:position.y,direction:position.direction,motion:this.world.walking ? 'walk' : 'stand' } : a) } });
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
  readonly duelRecords = async (): Promise<readonly { key: string; when: number; names: [string, string] }[]> =>
    (await this.records.list().catch(() => [])).map(r => ({ key: r.key, when: r.when, names: r.names }));
  private async saveRecord(record: DuelRecord): Promise<void> {
    try { await this.records.save(record); } catch (e) { console.warn('[duel record] not saved', e); }
  }
  /** The Duel Log's Play: the record on the duel screen, from its first command, at the duel speed. */
  private async startReplay(key: string): Promise<void> {
    const stored = (await this.records.list()).find(r => r.key === key);
    if (!stored) throw new Error('This duel was not saved in this browser.');
    const messages = recordMessages(stored.record);
    if (!messages.length) throw new Error('This duel record has no commands.');
    if (this.view.scene === 'duel' && !this.replay) throw new Error('Finish the current duel first.');
    this.stopReplay(); this.stopWorld(); this.resetDuel();
    this.replay = { names: stored.names, when: stored.when, messages, index: 0, playing: true, timer: null, back: this.view.scene };
    this.patch({ scene: 'duel' }); this.syncReplay(); this.syncDuel(); this.tickReplay();
  }
  private syncReplay(): void {
    const r = this.replay;
    this.patch({ replay: r ? { names: [...r.names], when: r.when, index: r.index, total: r.messages.length, playing: r.playing } : undefined });
  }
  /** One command, then the next once the board's animations have played (the duel speed paces both). */
  private tickReplay(): void {
    const r = this.replay; if (!r || !r.playing || r.timer) return;
    r.timer = setTimeout(() => {
      r.timer = null; if (this.replay !== r || !r.playing || this.disposed) return;
      if (this.timeline.pending) { this.tickReplay(); return; }
      this.stepReplay(); this.tickReplay();
    }, Math.round(250 / loadDuelSpeed()));
  }
  private stepReplay(): void {
    const r = this.replay; if (!r) return;
    const m = r.messages[r.index]; if (!m) { r.playing = false; this.syncReplay(); return; }
    r.index++; this.applyDuel(m);
    if (r.index >= r.messages.length) r.playing = false;
    this.syncReplay();
  }
  private controlReplay(action: 'toggle' | 'step' | 'exit'): void {
    const r = this.replay; if (!r) return;
    if (action === 'exit') { const back = r.back; this.stopReplay(); this.resetDuel(); this.patch({ scene: back === 'duel' ? 'lobby' : back, duel: null }); return; }
    if (action === 'step') { r.playing = false; if (r.timer) clearTimeout(r.timer); r.timer = null; this.timeline.skip(); this.stepReplay(); return; }
    r.playing = !r.playing && r.index < r.messages.length; this.syncReplay(); this.tickReplay();
  }
  private stopReplay(): void {
    const r = this.replay; if (!r) return;
    if (r.timer) clearTimeout(r.timer);
    this.replay = null; this.patch({ replay: undefined });
  }
  private resetDuel(): void {
    this.stopReplay();   // a live duel (an offer, an NPC) takes the duel screen from a replay
    this.cancelAnimation(); this.duelState = createDuelState(); this.duelLog = []; this.submittedPrompt = null; this.lastDuelAction = null;
    this.timeline = new DuelTimeline(this.duelState, { reducedMotion: this.view.settings.reducedMotion || !this.frameRequest });
    this.duelAudio.reset(this.duelState.sequence); this.duelCues.reset(); this.duelPortraits = [undefined, undefined];
    this.settledDuel = null;
    this.fieldPasscode=0;this.fieldAudioSlot=11; this.duelIsPvp = false; this.duelNotice = null;
    const profile = this.game?.state.profile; this.duelStartProfile = profile ? { level: profile.level, score: profile.score, mp: profile.mp } : null; this.duelNpcRecord = null;
  }
  /** The result board's extras once the duel is over: the profile's change since it began, and an NPC duel's record. */
  private duelResultExtras(): Pick<DuelView, 'rewards' | 'npcRecord'> {
    if (this.duelState.status !== 'finished' || this.game?.state.spectating) return {};
    const rewards = duelRewards(this.duelStartProfile, this.game?.state.profile), record = this.duelIsPvp ? null : this.duelNpcRecord;
    return { ...(rewards ? { rewards } : {}), ...(record ? { npcRecord: { name: this.duelNames()[1], wins: record.wins, losses: record.losses, draws: record.draws } } : {}) };
  }
  private syncDuel(): void {
    const background = this.duelBackground();
    this.settledDuel = { ...projectDuel(this.duelState, this.catalog, this.duelNames(), this.submittedPrompt, this.options.duelTexts, this.lastDuelAction), log: this.duelLog, ...(background ? { background } : {}), ...(this.duelNotice ? { notice: this.duelNotice } : {}),
      spectating: (this.game?.state.spectating ?? false) || !!this.replay, ...(this.duelState.timer ? { timer: { ...this.duelState.timer, at: this.timerAt() } } : {}) };
    this.renderDuelFrame(); this.scheduleAnimation();
  }
  /** Each duelist's avatar bytes for the waist-up portraits, kept from the first time they are known in this duel. */
  private duelParts(): [Uint8Array | undefined, Uint8Array | undefined] {
    const state = this.game?.state, self = state?.profile?.pid;
    if (!state) return this.duelPortraits;
    const [mine, theirs] = this.duelPortraits, opponent = this.duelIsPvp ? this.duelNames()[1] : null;
    this.duelPortraits = [mine ?? state.players.find(p => p.pid === self)?.parts,
      theirs ?? (this.duelIsPvp ? state.players.find(p => p.name === opponent && p.pid !== self)?.parts : state.npcs.find(n => n.id === this.npc.state.npc?.id)?.parts)];
    return this.duelPortraits;
  }
  /** When the duel's current clock reading arrived. */
  private timerAt(): number { if (this.duelState.timer !== this.timerSeen) { this.timerSeen = this.duelState.timer; this.timerSeenAt = Date.now(); } return this.timerSeenAt; }
  private duelNames(): [string, string] {
    if (this.replay) return [...this.replay.names];
    const watched = this.game?.state.spectating ? this.game.state.watchNames : null; if (watched) return [...watched];
    // A tag relay shares each captain's field: each side is named by the partner piloting it (TAG1 order: own team first).
    const relay = this.game?.state.relay;
    if (relay) return [relay.players[relay.active[0]]?.name ?? 'Your team', relay.players[2 + relay.active[1]]?.name ?? 'Opponents'];
    const opponent = this.duelIsPvp ? this.pvpOpponent ?? this.roomOpponentName() : this.npc.state.npc?.name;
    return [this.view.player?.name ?? 'You', opponent ?? 'Opponent'];
  }
  private roomOpponentName(): string | null {
    const state = this.game?.state, self = this.view.player?.id; if (!state || self === undefined) return null;
    const room = state.rooms.find(r => r.owner === self || r.opponent === self); if (!room) return null;
    const other = room.owner === self ? room.opponent : room.owner;
    return state.players.find(p => p.pid === other)?.name ?? null;
  }
  /** data/y/duel/field/duel_field.txt: line 1 is the Academy hall, line k+1 the backdrop of field theme k. */
  private duelBackground(): string | null {
    if (!this.options.assets) return null;
    let kind: number | null = 0;
    try { kind = fieldThemeKindForPasscode(this.fieldPasscode, pc => this.options.cardDetails?.get(pc)?.internalId); } catch { kind = 0; }
    return kind && kind <= 28 ? `data/y/duel/field/duel_filed_${String(kind).padStart(2, '0')}.png` : 'data/y/duel/field/duelbg_a_03.png';
  }
  private renderDuelFrame(): void {
    if (!this.settledDuel || this.disposed) return;
    const sample = this.timeline.sample(), timed = applyTimeline(this.settledDuel,sample,this.catalog,!!this.duelState.observer), relay = this.game?.state.relay;
    const parts = this.duelParts(), duel = { ...timed, ...this.duelResultExtras(), cues: this.duelCues.release(this.timeline.acknowledgedThrough),
      players: timed.players.map((p, i) => parts[i] ? { ...p, parts: parts[i] } : p) as unknown as typeof timed.players };
    for (const cue of this.duelAudio.consumeSample(sample)) {
      const play = () => { if (!this.disposed) void this.options.audio?.playEffect(cue.path, cue.gain).catch(error=>this.failure(error)); };
      // Frame-timed sounds (the die's landings) play at their moment of the effect that starts now.
      if (cue.delay) setTimeout(play, cue.delay); else play();
    }
    // a replay answers nothing: its prompts are the record's, already answered by the commands after them
    if (this.replay) { const { waiting: _w, ...rest } = duel; this.patch({ duel: { ...rest, prompt: null, actions: [] } }); }
    else this.patch({ duel: relay && !relay.canAct ? { ...duel, prompt:null, actions:[], waiting:relay.self === 255 ? 'Watching a tag duel.' : duel.turnPlayer === 1 ? `The opponents are playing. ${relay.players[relay.active[0]]?.name ?? 'Your teammate'} answers for your team.` : `Waiting for ${relay.players[relay.active[0]]?.name ?? 'your teammate'} to play.` } : duel });
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
    if(scene==='duel') {
      const field=fieldAudioSlotForPasscode(this.fieldPasscode,11,pc=>this.options.cardDetails?.get(pc)?.internalId);
      if(field!==null) this.fieldAudioSlot=field;
    }
    // Scene slots have source evidence in recomp/audio-slots.md; duel base selection is provisional.
    const slot = scene === 'title' ? 0 : scene === 'characters' ? 3 : scene === 'deck' ? 1
      : scene === 'duel' ? this.duelState.result ? this.duelState.result.result === 1 ? 28 : this.duelState.result.result === 2 ? 27 : 26
      : this.view.preparation ? 10 : this.duelState.sides[0].lp - this.duelState.sides[1].lp >= 3000 ? 24
      : this.duelState.sides[1].lp - this.duelState.sides[0].lp >= 3000 ? 25 : this.fieldAudioSlot
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
      collection: this.collection, allCards: this.catalogCards ??= this.catalog.allCards(),
      recipes:this.project('recipes',this.game?.state.pbin,pbin=>this.options.recipes?.available(pbin ?? null,this.freeMode) ?? []),
      dirty: this.editor?.dirty ?? false, loading: this.services.decks.state.loading } };
  }
  private get deckMode(): 'world' | 'free' { return this.freeMode ? 'free' : 'world'; }
  private async connect(freeMode = this.freeMode): Promise<void> {
    if (!this.view.auth?.signedIn) throw new Error('Sign in before going online.');
    if (this.game) {
      if (this.freeMode !== freeMode) throw new Error('Disconnect before changing game modes.');
      this.patch({ scene: this.view.player ? 'lobby' : 'characters' }); return;
    }
    this.freeMode = freeMode; this.patch({ mode:this.deckMode, unavailable:this.freeMode ? {shop:'Card purchases are available in World mode.'} : undefined });
    const epoch = ++this.epoch;
    const make = this.options.sessionFactory ?? (o => new GameSession(o));
    const game = make({ url: this.options.gatewayUrl, portOffset: this.options.portOffset ?? 1000, freeMode:this.freeMode,
      onState: state => { if (this.game === game && epoch === this.epoch) this.updateSession(state); },
      onMessage: (channel, message) => this.receive(channel, message),
      onOutgoing: (channel, message) => this.capture.outgoing(channel, message, channel === this.game?.duel ? 'duel' : channel === this.game?.lobby ? 'lobby' : 'account'),
      onDuelRecord: record => { void this.saveRecord(record); },
      onDuelOffer: offer => {
        if (offer.source !== 'pvp' || this.attachingOffer) return;
        this.attachingOffer = true;
        queueMicrotask(() => {
          if (this.disposed || this.game !== game) { this.attachingOffer = false; return; }
          this.stopWorld();if (this.npc.state.stage === 'ask' || this.npc.state.stage === 'greeting') this.npc.reset();
          this.resetDuel(); this.duelIsPvp = true; this.pvpOpponent = this.nextOpponent ?? this.roomOpponentName(); this.nextOpponent = null; this.syncDuel();
          void (async () => game.acceptDuelOffer(this.currentDeck()))().catch(e => this.failure(e)).finally(() => { this.attachingOffer = false; });
        });
      },
    });
    this.game = game;
    try { await game.start(); } catch (e) { if (this.game === game) { this.game = null; game.dispose(); } throw e; }
  }
  /** The server holds a dropped tunnel's sockets for a resume (world.ts RESUME_HOLD_MS, 45 s) and refuses another login
   * of that user meanwhile. Going online again soon after a lost connection waits for that hold instead of failing. */
  private async connectAfterLoss(freeMode?: boolean): Promise<void> {
    for (;;) {
      try { await this.connect(freeMode); return; }
      catch (error) {
        if (!this.game && !this.disposed) this.patch({ connection: 'offline' });
        const signal = this.connectionScope.signal;
        if (Date.now() - this.connectionLostAt > 50000 || !(error instanceof Error) || !/already logged in/.test(error.message) || signal.aborted) throw error;
        this.patch({ status: 'Waiting for the previous connection to close…', error: undefined });
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Session changed', 'AbortError')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 3000);
          signal.addEventListener('abort', abort, { once: true });
        });
      }
    }
  }
  private disconnect(): void {
    ++this.epoch;this.eligibilityDue=false;this.eligibilityQueued=false;this.lockToken = null; this.stopWorld(); this.worldArea = null; this.worldSpawnContext = null;this.worldTransition=false;this.arrivalFrom=null;this.resetWorldRuntime();
    this.connectionScope.dispose(); this.connectionScope = this.scope.child();
    this.services.reset(); this.social.reset(); this.profile.reset(); this.profileContext = null; this.npc.reset(); this.npcPlayer=null; this.online.reset(); this.tagLobby.reset(); this.account.reset(); this.capture.sessionBoundary();
    this.game?.dispose(); this.game = null;
    this.collectionRef = null; this.collection = []; this.editor = null; this.projections.clear();
    this.sideboard = null; this.sideboardRound = null;
    this.resetDuel(); this.attachingOffer = false;
    this.view = { ...initial(this.view.settings), mode:this.deckMode, auth:this.view.auth,
      accountDetail:this.account.state, profileDetail:this.profile.state, npc:this.npc.state, online:this.online.state, tagLobby:this.tagLobby.state, socialDetail:this.social.state, languageStatus:this.view.languageStatus,
      ...(this.options.reloadData ? {dataStatus:{loading:false,issues:[...(this.options.dataIssues ?? [])]}} : {}),
      ...(this.options.audio ? {audio:this.options.audio.getState()} : {}), status:'Disconnected.' }; this.emit();
  }
  /** The Friend List's presence (the server's friendsInfo: each friend online or not, and where). */
  private async refreshFriends(): Promise<void> {
    const epoch = this.epoch, friends = await this.services.refreshFriends({ signal: this.connectionScope.signal });
    if (epoch === this.epoch && !this.disposed) this.patch({ social: toSocialView(friends) });
  }
  private async refresh(scene: Scene): Promise<void> {
    const options = { signal: this.connectionScope.signal }, epoch = this.epoch;
    if (scene === 'deck') {
      await this.requireGame().refreshCollection();
      await this.requireGame().refreshPlayerBits();
      this.loadRarities();
      const data = await this.services.refreshDecks(options);
      if (epoch !== this.epoch || this.disposed) throw new DOMException('Session changed', 'AbortError');
      if (!this.editor) {
        const deck = data.decks.find(d => d.name === data.current[this.deckMode]);
        if (deck) this.editor = new DeckEditor(deck, this.collection);
        else if (this.freeMode) {
          // Free Duel tests decks from the whole card pool. Without a free deck yet, start from a copy of the world deck
          // under its own name, so saving it can never rewrite (or rename) the saved world deck.
          const source = data.decks.find(d => d.name === data.current.world) ?? data.decks[0];
          if (source) {
            const taken = new Set(data.decks.map(d => d.name)), base = `${source.name.slice(0, 24)} (Free)`;
            let name = base; for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 26)} ${n}`;
            const copy = new DeckEditor({ name, main: [...source.main], side: [...(source.side ?? [])], extra: [...source.extra] }, this.collection);
            this.editor = copy.rename(name).ok ? copy : new DeckEditor({ name: 'Free Deck', main: [...source.main], side: [...(source.side ?? [])], extra: [...source.extra] }, this.collection);
          }
        } else if (data.decks[0]) this.editor = new DeckEditor(data.decks[0], this.collection);
      }
      this.syncEditor(); this.emit();
    } else if (scene === 'shop') {
      const shop = await this.services.refreshShop(options);
      if (epoch === this.epoch && !this.disposed) { const view = await this.shopView(shop); if (epoch === this.epoch && !this.disposed) { this.patch({ shop: view }); await this.online.refresh(); } }
    } else if (scene === 'lobby') {
      if (this.freeMode) { this.patch({starter:undefined}); return; }
      await this.requireGame().refreshNpcs();
      const starter = await this.services.refreshStarter(options);
      if (epoch === this.epoch && !this.disposed) this.patch({ starter: { claimable: starter.claimable, decks: starter.claimable ? starter.decks.map(d => ({ id: d.id, name: d.name, blurb: d.blurb, cover: d.cover, cards: d.cards.map(c => ({ ...c })), mainCount: d.cards.filter(c => c.type !== 'extra').reduce((n, c) => n + c.n, 0), extraCount: d.cards.filter(c => c.type === 'extra').reduce((n, c) => n + c.n, 0) })) : [] } });
    } else if (scene === 'characters') await this.requireGame().refreshCharacters();
  }
  private currentDeck(): { main: number[]; side: number[]; extra: number[] } {
    const data = this.services.decks.state.data;
    const deck = data?.decks.find(d => d.name === data.current[this.deckMode]) ?? this.editor?.deck;
    if (!deck) throw new Error('Save and select a deck before starting a duel.');
    return { main: [...deck.main], side: [...deck.side], extra: [...deck.extra] };
  }
  private async startNpcDuel(id:number): Promise<void> {
    if (this.freeMode) throw new Error('NPC duels are available in World mode.');
    if (!this.services.decks.state.data) await this.refresh('deck');
    this.stopWorld(); this.resetDuel(); this.syncDuel();
    await this.requireGame().startNpcDuel(id,this.currentDeck());
  }
  async dispatch(command: ClientCommand): Promise<void> {
    if (this.disposed) throw new Error('Client is disposed.');
    // Reject rather than queue stale prompt actions behind an unrelated request.
    // The Tag Duel window serializes its own requests (TagLobbyController.busy); picking seats never waits on the lobby.
    if (this.lockToken && !['disconnect', 'move', 'settings', 'inspectCard', 'tagAction', 'tournamentRefresh'].includes(command.type)) throw new Error('Wait for the current action to finish.');
    const locking = !['move', 'settings', 'inspectCard', 'disconnect', 'tagAction', 'tournamentRefresh'].includes(command.type);
    const token = {};
    if (locking) { this.lockToken = token; this.patch({ busy: true, error: undefined }); }
    const epoch = this.epoch;
    try {
      switch (command.type) {
        case 'connect': await this.connectAfterLoss(command.freeMode); break;
        case 'replayPlay': await this.startReplay(command.key); break;
        case 'replayControl': this.controlReplay(command.action); break;
        case 'disconnect': this.disconnect(); break;
        case 'tournamentRefresh': this.requireGame().requestTournament(); break;
        case 'signIn': {
          // A refused sign-in is a 401 too, but it is a wrong User ID or Password, not an ended session (failure()).
          const auth = await this.services.signIn(command.username, command.password, { signal: this.connectionScope.signal })
            .catch((e: unknown) => { throw e instanceof ApiError && e.status === 401 ? new Error('Incorrect User ID or Password.') : e; });
          if (!this.disposed) this.patch({ auth: { signedIn: auth.signedIn, ...(auth.signedIn && auth.name ? { name: auth.name } : {}) }, status: 'Signed in. Go online to select a character.' }); break;
        }
        case 'signOut': this.disconnect(); this.lockToken = token; this.patch({ busy: true, auth: { signedIn: false } }); await this.services.signOut({ signal: this.connectionScope.signal }); this.patch({ auth: { signedIn: false }, status: 'Signed out.' }); break;
        case 'createCharacter': await this.requireGame().createCharacter(command.slot, command.name, command.appearance); break;
        case 'deleteCharacter': await this.requireGame().deleteCharacter(command.slot); break;
        case 'selectCharacter': await this.requireGame().selectCharacter(command.slot); this.assertEpoch(epoch); await this.refresh('lobby'); await this.refresh('deck'); this.assertEpoch(epoch); this.patch({ scene: 'lobby' }); break;
        case 'claimStarter': {
          const claim = await this.services.claimStarter(command.id, { signal: this.connectionScope.signal }); this.assertEpoch(epoch);
          await this.requireGame().refreshPlayerBits();this.assertEpoch(epoch);
          const deck = expandStarterDeck(claim.deck); await this.services.saveDeck(deck, this.deckMode, { signal: this.connectionScope.signal });
          this.editor = new DeckEditor(deck, this.collection); await this.refresh('deck'); await this.refresh('lobby'); break;
        }
        case 'openScene':
          if (command.scene !== 'lobby') this.stopWorld();
          if (this.view.unavailable?.[command.scene]) throw new Error(this.view.unavailable[command.scene]);
          if (!['title', 'settings', 'characters'].includes(command.scene) && !this.view.player) throw new Error('Select a character first.');
          if ((this.view.scene === 'duel' || ['preparing-duel', 'rock-paper-scissors', 'choose-first', 'duel', 'sideboarding'].includes(this.game?.state.phase ?? '')) && (this.duelState.status !== 'finished' || this.game?.state.match && !this.game.state.match.complete) && !['duel', 'settings'].includes(command.scene)) throw new Error('Finish or surrender the duel first.');
          if (command.scene === 'lobby' && this.duelState.status === 'finished') {this.eligibilityDue=true;await this.requireGame().finishDuel();}
          this.patch({ scene: command.scene });
          if (['deck', 'shop'].includes(command.scene)) await this.refresh(command.scene); break;
        case 'refresh': await this.refresh(command.scene); break;
        case 'refreshFriends': await this.refreshFriends(); break;
        case 'move':
          this.requireGame();
          if (!this.options.worldMaps || !this.world.position) throw new Error('Original collision data is unavailable. Generate the world maps before walking.');
          if (!this.frameRequest) throw new Error('Animated movement is unavailable.');
          if(this.worldRuntime){this.worldRuntime.retry();await this.runtimeLoad;this.assertEpoch(epoch);await this.worldRuntime.prepare(this.world.position,this.connectionScope.signal);this.assertEpoch(epoch);}
          if (!this.world.moveTo({ x: command.x, y: command.y })) throw new Error('That destination is blocked or unreachable.');
          this.scheduleWorld(); break;
        case 'myRoom': this.stopWorld();this.arrivalFrom=null;if(command.enter)await this.requireGame().enterMyRoom();else await this.requireGame().leaveMyRoom();break;
        case 'moveArea': this.stopWorld();this.arrivalFrom=null;await this.requireGame().enterArea(command.area);break;
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
            if (this.freeMode) throw new Error('NPC duels are available in World mode.');
            const npc=this.requireGame().state.npcs.find(n=>n.id===-command.playerId); if (!npc) throw new Error('That NPC is unavailable.');
            this.stopWorld();
            const state=this.requireGame().state, special=npcOpeningPresent(npc.id);
            this.npc.open({id:npc.id,name:npc.name},0,state.npcbin ? {npcRank:state.npcbin[npc.id*4+3],
              ...(npc.id*4+2 < state.npcbin.length ? {record:[state.npcbin[npc.id*4]!,state.npcbin[npc.id*4+1]!,state.npcbin[npc.id*4+2]!] as const} : {}),
              ...(special && state.pbin ? {specialPresentDone:!!(state.pbin[special.completionBit>>3] & 1 << (special.completionBit&7))} : {})} : undefined);
          } else this.profile.dispatch({type:'open',pid:command.playerId});
          break;
        case 'npcAnswer': await this.npc.answer(command.accept); break;
        case 'npcAdvance': this.npc.advance(); break;
        case 'npcSelectPack': this.npc.selectPack(command.pack); break;
        case 'npcRefreshInventory': await this.npc.refreshCollection(); break;
        case 'npcClose':
          if(!this.npc.close())throw new Error('Finish this NPC interaction and reward selection first.');break;
        case 'duelChallenge': {
          this.nextOpponent = this.game?.state.players.find(p => p.pid === command.playerId)?.name ?? null;
          if (!this.services.decks.state.data) await this.refresh('deck');
          // concurrent Duel presses share one request (main cea1f39); a refusal (409: "That player is not accepting
          // duel requests." and the rest of lobby.ts SAY) rejects it, so it ends in failure()'s message, never a wait
          if (this.duelChallengeRequest) { await this.duelChallengeRequest; break; }
          const request = this.services.api.http.request('POST', '/api/de/duel/challenge', value => {
            if (!value || typeof value !== 'object' || !('room' in value) || !Number.isSafeInteger(value.room)) throw new Error('Invalid duel invitation response.');
            return { room: Number(value.room) };
          }, { pid: command.playerId }, { signal: this.connectionScope.signal });
          this.duelChallengeRequest = request;
          try { this.requireGame().challengeRoom((await request).room); } finally { if (this.duelChallengeRequest === request) this.duelChallengeRequest = null; }
          break;
        }
        case 'createDuelRoom': if (!this.services.decks.state.data) await this.refresh('deck'); await this.requireGame().createDuelRoom(command.options); break;
        case 'deleteDuelRoom': await this.requireGame().deleteDuelRoom(); break;
        case 'startMatchmaking': if (!this.services.decks.state.data) await this.refresh('deck'); await this.requireGame().startMatchmaking(command); break;
        case 'cancelMatchmaking': await this.requireGame().cancelMatchmaking(); break;
        case 'refreshMatchmaking': await this.requireGame().refreshMatchmaking(); break;
        case 'retryMatchmaking': await this.requireGame().retryMatchmaking(); break;
        case 'challengeRoom': if (!this.services.decks.state.data) await this.refresh('deck'); this.requireGame().challengeRoom(command.roomId, command.password); break;
        case 'cancelChallenge': await this.requireGame().cancelChallenge(); break;
        case 'replyChallenge': if (command.accept && !this.services.decks.state.data) await this.refresh('deck'); this.requireGame().replyToChallenge(command.accept); break;
        case 'spectate': this.stopWorld();this.resetDuel(); this.syncDuel(); await this.requireGame().watchDuel(command.pid); this.syncDuel(); break;
        case 'leaveDuel': if (this.replay) { this.controlReplay('exit'); break; } if (!this.requireGame().state.spectating && this.duelState.status !== 'finished') throw new Error('Finish or surrender this duel first.');this.eligibilityDue=true;this.resetDuel(); await this.requireGame().finishDuel(); this.patch({ scene: 'lobby', duel: null }); break;
        case 'chooseHand': await this.requireGame().chooseHand(command.hand); break;
        case 'chooseFirst': await this.requireGame().chooseFirst(command.first); break;
        case 'beginDuel': this.requireGame().beginDuel(); break;
        case 'selectDeck': {
          const deck = this.services.decks.state.data?.decks.find(d => d.name === command.name);
          if (!deck) throw new Error('Deck no longer exists.');
          await this.services.selectDeck(command.name, this.deckMode, { signal: this.connectionScope.signal });
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
        case 'sideboardMove': {
          const match = this.requireGame().state.match, deck = this.sideboard;
          if (!deck || match?.stage !== 'sideboarding' || match.complete) throw new Error('Sideboarding is unavailable.');
          if (!['main','side'].includes(command.from) || !['main','side'].includes(command.to) || command.from === command.to) throw new Error('Only Main and Side cards may be exchanged.');
          const from = command.from as 'main' | 'side', to = command.to as 'main' | 'side', index = command.index ?? deck[from].indexOf(command.passcode);
          if (!Number.isSafeInteger(index) || index < 0 || deck[from][index] !== command.passcode) throw new Error('That card is no longer at the selected position.');
          const capacity = to === 'main' ? 95 : 30;
          if (deck[to].length >= capacity) throw new Error('Temporary sideboarding capacity reached.');
          this.sideboard = structuredClone(deck); this.sideboard[from].splice(index,1); this.sideboard[to].push(command.passcode);
          this.updateSession(this.requireGame().state); break;
        }
        case 'sideboardSwap': {
          const match = this.requireGame().state.match, deck = this.sideboard;
          if (!deck || match?.stage !== 'sideboarding' || match.complete) throw new Error('Sideboarding is unavailable.');
          if (![command.mainIndex,command.sideIndex].every(Number.isSafeInteger) || command.mainIndex < 0 || command.mainIndex >= deck.main.length || command.sideIndex < 0 || command.sideIndex >= deck.side.length) throw new Error('That card is no longer at the selected position.');
          this.sideboard = structuredClone(deck);
          [this.sideboard.main[command.mainIndex],this.sideboard.side[command.sideIndex]] = [deck.side[command.sideIndex],deck.main[command.mainIndex]];
          this.updateSession(this.requireGame().state); break;
        }
        case 'submitSideboard': {
          const match = this.requireGame().state.match;
          if (!this.sideboard || match?.stage !== 'sideboarding' || match.complete || this.sideboard.main.length !== match.original.main.length || this.sideboard.side.length !== (match.original.side?.length ?? 0)) throw new Error('Restore the original Main and Side counts before continuing.');
          const deck = structuredClone(this.sideboard);
          // The next game of the same match: still player versus player, against the same opponent.
          const pvp = this.duelIsPvp; this.resetDuel(); this.duelIsPvp = pvp; this.patch({ duel:null }); await this.requireGame().submitSideboard(deck); break;
        }
        case 'deckReorder': { const result = this.editor?.reorder(command.zone, command.fromIndex, command.toIndex); if (!result?.ok) throw new Error(result && !result.ok ? result.reason : 'Choose a deck first.'); this.syncEditor(); this.emit(); break; }
        case 'replaceDeck': {
          const editor = this.editor ?? new DeckEditor({ name: command.deck.name, main: [], side: [], extra: [] }, this.collection);
          const result = editor.replace(command.deck); if (!result.ok) throw new Error(result.reason);
          this.editor = editor; this.syncEditor(); this.patch({ status: 'Deck draft updated. Save to use it in a duel.' }); break;
        }
        case 'importLegacyDeck': {
          const deck = { name:command.name, ...decodeLegacyDeck(command.bytes, this.options.cardDetails ?? new CardDetailsCatalog()) };
          const editor = this.editor ?? new DeckEditor({ name:deck.name,main:[],side:[],extra:[] },this.collection);
          const result = editor.replace(deck); if (!result.ok) throw new Error(result.reason);
          this.editor = editor; this.syncEditor(); this.patch({ status:'Native deck imported. Save to use it in a duel.' }); break;
        }
        case 'exportDeck': {
          if (!this.editor) throw new Error('Choose a deck first.');
          const deck = this.editor.deck;
          if (command.format === 'ydc') {
            const bytes = encodeLegacyDeck(deck,this.options.cardDetails ?? new CardDetailsCatalog());
            this.download(new Blob([bytes.slice().buffer], { type:'application/octet-stream' }),`${deck.name}.ydc`);
          } else this.download(new Blob([serializeDeck(deck,command.format)], { type:command.format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }),`${deck.name}.${command.format}`);
          break;
        }
        case 'saveDeck': {
          if (!this.editor) throw new Error('Choose a deck first.');
          // A saved deck saved under another name is renamed: the new name is written (and made current) first, then the old one removed.
          const from = this.editor.savedName, to = this.editor.deck.name, saved = this.services.decks.state.data?.decks ?? [];
          if (from !== to && command.as !== 'overwrite' && saved.some(d => d.name === to)) throw new Error(`A deck named “${to}” already exists. Choose another name.`);
          await this.services.saveEditor(this.editor, this.deckMode, { signal: this.connectionScope.signal });
          if (from !== to && !command.as && saved.some(d => d.name === from)) await this.services.deleteDeck(from, { signal: this.connectionScope.signal });
          await this.services.refreshDecks({ signal: this.connectionScope.signal }); this.syncEditor(); this.emit(); break;
        }
        case 'deleteDeck': {
          await this.services.deleteDeck(command.name, { signal: this.connectionScope.signal }); if (this.editor?.deck.name === command.name) this.editor = null; await this.refresh('deck');
          // Deleting the active deck leaves the server without one: the deck now shown becomes active, as the original selects the next deck.
          const data = this.services.decks.state.data, shown = this.editor?.savedName;
          if (data && !data.current[this.deckMode] && shown && data.decks.some(d => d.name === shown)) { await this.services.selectDeck(shown, this.deckMode, { signal: this.connectionScope.signal }); await this.services.refreshDecks({ signal: this.connectionScope.signal }); this.syncEditor(); this.emit(); }
          break;
        }
        case 'buy': {
          const pending = this.services.pendingPurchase;
          if (pending && (pending.itemId !== command.itemId || pending.count !== command.count)) throw new Error('Retry your pending purchase first.');
          const had = new Set(this.collection.filter(c => (c.owned ?? 0) > 0).map(c => c.passcode));
          const result = await (pending ? this.services.retryPurchase({ signal: this.connectionScope.signal }) : this.services.buy(command.itemId, command.count, { signal: this.connectionScope.signal })).catch(e => { throw readableError(e); }); this.assertEpoch(epoch);
          const view = await this.shopView(result); this.assertEpoch(epoch);
          // Accessories (kind 2) are avatar parts, not cards. A card is new once: the first copy of a passcode not owned before
          // (unknown for a replayed receipt, whose cards are already in the collection).
          const cards = result.purchased.filter(c => c.kind !== 2 && c.passcode > 0), seen = new Set<number>();
          const fresh = cards.map(c => { const n = !had.has(c.passcode) && !seen.has(c.passcode); seen.add(c.passcode); return n; });
          const purchased = cards.map(c => this.catalog.card(c.passcode));
          this.patch({ shop: { ...view, purchased, ...(purchased.length ? { opening: { cards: purchased, fresh: result.replayed ? fresh.map(() => false) : fresh, rarities: cards.map(c => c.rarity) } } : {}), replayed:result.replayed }, status: 'Purchase confirmed.' }); void this.online.refresh(); await this.requireGame().refreshCollection();await this.requireGame().refreshPlayerBits();break;
        }
        case 'duelRespond': {
          if (this.submittedPrompt === this.duelState.prompt?.id) throw new Error('This choice has already been sent.');
          const response = interpretResponse(this.duelState, command.promptId, command.response, text => this.catalog.named(text));
          const messages = encodeDuelResponse(this.duelState, response);
          this.submittedPrompt = this.duelState.prompt?.id ?? null; this.lastDuelAction = null;
          for (const m of messages) this.requireGame().sendDuel(m.id, m.data);
          this.syncDuel(); break;
        }
        case 'duelAction': {
          if (this.submittedPrompt === this.duelState.prompt?.id) throw new Error('This choice has already been sent.');
          // Action ids name a zone and index, so one rendered for an earlier prompt could act on a different card now.
          if (command.promptId !== undefined && command.promptId !== String(this.duelState.prompt?.id)) throw new Error('This choice has expired.');
          const response = interpretAction(this.duelState, command.actionId), messages = encodeDuelResponse(this.duelState, response);
          this.submittedPrompt = this.duelState.prompt?.id ?? null; this.lastDuelAction = response;
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
          const output = captureDownload(this.capture); this.download(output.blob, output.filename);
          break;
        }
        case 'audioAction': {
          if (!this.options.audio) throw new Error('Audio is unavailable.');
          if (command.action.type === 'export-pack') {
            const a = command.action, name = (a.name || 'My audio pack').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
            this.download(await this.options.audio.exportPack({ name: a.name, author: a.author, description: a.description }), `${name}.zip`); break;
          }
          // Dispatch starts synchronously to preserve browser gesture activation.
          await this.options.audio.dispatch(command.action);
          if (command.action.type === 'set-volumes' || command.action.type === 'restore' || (command.action.type === 'apply-pack' && command.action.master !== undefined)) {
            const settings = {...this.view.settings,...this.options.audio.volumes}; this.options.persistSettings?.(settings); this.patch({settings});
            this.duelAudio.setMuted(settings.sound === 0);
          }
          this.patch({ audio:this.options.audio.getState() });
          void this.options.audio.flushPersistence().then(()=>{if (!this.disposed) this.patch({audio:this.options.audio!.getState()});}).catch(error=>this.failure(error)); break;
        }
        case 'socialAction': this.social.dispatch(command.action); break;
        case 'profileAction': this.profile.dispatch(command.action); break;
        case 'onlineAction': await this.online.dispatch(command.action); break;
        case 'tagAction': await this.tagLobby.dispatch(command.action); break;
        case 'reloadData': {
          if (!this.options.reloadData) throw new Error('Game data cannot be reloaded in this configuration.');
          this.patch({dataStatus:{loading:true,issues:this.view.dataStatus?.issues ?? []}});
          try {
            const data=await this.options.reloadData(this.connectionScope.signal); this.assertEpoch(epoch);
            if(data.catalog) this.catalog.install(data.catalog.allCards());
            for(const key of ['cardDetails','cardTexts','npcDialogue','duelTexts','worldMaps','recipes'] as const) if(data[key]) Object.assign(this.options,{[key]:data[key]});
            if(this.options.cardDetails) this.catalog.installDetails(this.options.cardDetails);
            this.installLanguageTexts();
            this.options.dataIssues=[...data.issues]; this.catalogCards=null;this.collectionRef=null;this.projections.clear();
            if(data.worldMaps) {this.stopWorld();this.worldArea=null;this.runtimeMap=null;}
            if(this.game) this.updateSession(this.game.state);
            if(this.settledDuel) this.syncDuel();
            this.patch({dataStatus:{loading:false,issues:[...data.issues]},status:data.issues.length ? 'Some game data is still unavailable.' : 'Game data loaded.'});
          } catch(error) {if(epoch===this.epoch) this.patch({dataStatus:{loading:false,issues:this.view.dataStatus?.issues ?? []}});throw error;}
          break;
        }
        case 'settings': {
          const { language, ...changes } = command.settings;
          if (language !== undefined && !isGameLanguage(language)) throw new Error('Unsupported language.');
          if (language !== undefined && (language !== (this.view.settings.language ?? 'E') || this.view.languageStatus?.error)) void this.applyLanguage(language);
          const next = { ...this.view.settings, ...changes };
          for (const key of ['sound', 'music'] as const) if (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 1) throw new Error('Invalid volume.');
          if (typeof next.reducedMotion !== 'boolean' || typeof next.showCardNames !== 'boolean') throw new Error('Invalid settings.');
          this.options.persistSettings?.(next); this.options.audio?.setVolumes(next);
          this.timeline.setReducedMotion(next.reducedMotion || !this.frameRequest);
          this.duelAudio.setReducedMotion(next.reducedMotion || !this.frameRequest); this.duelAudio.setMuted(!this.options.audio || next.sound === 0);
          this.patch({ settings: next, ...(this.options.audio ? { audio: this.options.audio.getState() } : {}) });
          if (this.settledDuel) this.renderDuelFrame(); break;
        }
        default: { const unknownCommand: never = command; throw new Error(`Unknown client command: ${String(unknownCommand)}`); }
      }
    } catch (e) { if (epoch === this.epoch || command.type === 'connect') this.failure(e); throw e; }
    finally { if (locking && this.lockToken === token) { this.lockToken = null; if (!this.disposed) this.patch({ busy: false }); } }
  }
  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob), release = this.scope.own(() => URL.revokeObjectURL(url));
    try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); }
    finally { this.scope.timeout(release, 1000); }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; ++this.epoch; this.cancelAnimation(); this.stopWorld(); this.world.dispose();this.worldRuntime?.dispose(); this.duelAudio.dispose();
    const game = this.game;
    const cleanup = [() => game?.dispose(), () => this.social.dispose(), () => this.profile.dispose(), () => this.npc.dispose(), () => this.account.dispose(), () => this.capture.dispose(), () => this.online.dispose(), () => this.tagLobby.dispose(), () => this.services.dispose(), () => this.scope.dispose(), () => this.avatars?.dispose(), () => this.scenes?.dispose(), () => this.options.assets?.dispose(), () => this.options.audio?.dispose()];
    this.game = null; this.listeners.clear(); this.projections.clear();
    const errors: unknown[] = [];
    for (const close of cleanup) try { close(); } catch (e) { errors.push(e); }
    if (errors.length) throw new AggregateError(errors, 'Client shutdown failed');
  }
}
