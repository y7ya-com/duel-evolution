import type { GameLanguage } from '../features/language';
import type { ProfileAction, ProfileState } from '../features/profile';
import type { NpcState } from '../features/npc';
import type { AvatarLoadOptions, AvatarResource } from '../avatars';
import type { WorldScene } from '../world/scene';
import type { AccountAction, AccountState } from '../features/account';
import type { CaptureStatus } from '../parity/live';
import type { AudioAction, AudioState } from '../features/audio';
import type { SocialAction, SocialState } from '../features/social';
import type { OnlineAction, OnlineState } from '../features/online';
import type { TagLobbyAction, TagLobbyState } from '../features/tag';
/** Render-only browser UI contract. No component reads guest memory or opens a socket. */
export type Scene = 'title' | 'characters' | 'lobby' | 'deck' | 'shop' | 'duel' | 'settings';
export type DeckZone = 'main' | 'side' | 'extra';
export interface CharacterView { slot: number; name: string; level?: number; selected?: boolean; /** The 16 avatar bytes Select Player's waist-up portrait wears. */ parts?: number[]; }
export interface PlayerView { id: number; name: string; level?: number; mp?: number; }
export interface CardView {
  id: string;
  passcode?: number;
  name: string;
  description?: string;
  image?: string;
  type?: string;
  attribute?: string | number;
  race?: string | number;
  kind?: number;
  level?: number;
  attack?: number;
  defense?: number;
  owned?: number;
  limit?: number;
  /** false for cards that never go in a deck (gods, tokens). */
  deckAllowed?: boolean;
  /** N, R, SR or UR (the server's card-rarities table). */
  rarity?: string;
  extra?: boolean;
}
export interface DeckView { name: string; main: number[]; side: number[]; extra: number[]; }
export interface DeckEditorView { allCards?: CardView[]; recipes?: (DeckView & { id: string })[]; decks: DeckView[]; current: DeckView | null; collection: CardView[]; dirty?: boolean; loading?: boolean; error?: string; }
export interface LobbyAvatar { id: number; name: string; /** The server's area list (0x... player record): level and the nation code (CNationFlag). */ level?: number; country?: string; x: number; y: number; self?: boolean; npc?: boolean; image?: string; parts?: Uint8Array; /** A famous NPC drawn with its own archive art (CNpcChibiAvatar): its cn_ set, a03 Alexis Rhodes. */ npcArt?: string; /** An NPC's level stars (16 px per level passed, 8 px toward the next). */ stars?: { big: number; small: number }; direction?: number; motion?: 'stand' | 'walk'; world?: 0 | 1; /** In a duel others may watch (the server's duelling states). */ duelling?: boolean; }
export interface ChatLine { id: string; sender: string; text: string; channel: string; }
export interface LobbyView { mapId?: number; /** The area block this player stands in (0x4203), and the players in the whole lobby (the place plate's (n/1000))). */ block?: number; population?: number; rooms?: { id: number; owner: number; name: string; state: number; password?: boolean; /** 3 single, 4 match. */ style?: number; /** Watch On, and who the owner duels (0: waiting). */ watch?: boolean; opponent?: number }[]; invitation?: { name: string; pid: number }; /** The challenge this player sent and is waiting on. */ outgoing?: { name: string }; areas?: { area: number; block: number; name: string; population?: number; /** The area's room kind (13 Domino City, 14 Duel Academy). */ kind?: number }[]; npcs?: { id: number; name: string }[]; name: string; mapImage?: string; width?: number; height?: number; avatars: LobbyAvatar[]; chat: ChatLine[]; channels: string[]; connected: boolean; }
export interface ShopItem { id: number; name: string; price: number; category?: string; /** Packs and decks: the pack id (the catalogue row's param: what GET /api/de/shop/pack names). */ packId?: number; /** Accessories: the avatar part's ownership bit. */ avatarBit?: number; image?: string; imagePath?: string; description?: string; card?: CardView; owned?: boolean; }
/** One purchase's opened cards, for the card-get presentation: whether each was new to the collection, its rarity. */
export interface CardGetView { cards: CardView[]; fresh: boolean[]; rarities: (string | null)[]; }
export interface ShopView { purchased?: CardView[]; opening?: CardGetView; replayed?: boolean; items: ShopItem[]; mp: number; earnedMp?: number; loading?: boolean; available?: boolean; error?: string; }
export type FieldZone = 'deck' | 'hand' | 'monster' | 'spell' | 'graveyard' | 'banished' | 'extra' | 'field';
export interface DuelCardView extends CardView { counters?: { kind: number; count: number }[]; turnCounter?: number; motion?: { x: number; y: number; rotation: number; scaleX: number; opacity?: number; zIndex?: number }; controller: 0 | 1; zone: FieldZone; index: number; faceUp: boolean; position?: 'attack' | 'defense'; }
export interface DuelOption { id: string; label: string; disabled?: boolean; cardId?: string;
  /** The empty board zone this choice refers to (zone selections), so it can be picked on the field. */
  place?: { controller: 0 | 1; zone: FieldZone; index: number }; }
export interface DuelCandidate { id: string; label: string; card?: CardView; selected?: boolean; disabled?: boolean; }
export interface DuelPromptView {
  id: string;
  text: string;
  kind: 'choice' | 'attributes' | 'cards' | 'yes-no' | 'position' | 'place' | 'number' | 'announce' | 'acknowledge';
  options: DuelOption[];
  candidates?: DuelCandidate[];
  min?: number;
  max?: number;
  cancelable?: boolean;
  readOnly?: boolean;
  numberMin?: number;
  numberMax?: number;
  /** A card declaration's candidate list, in the original's order (every card the list mode allows; the server still
   * decides what is declarable): `id` is the passcode to declare. */
  declarable?: readonly { id: string; label: string }[];
}
export interface DuelView {
  players: readonly [DuelistView, DuelistView];
  cards: DuelCardView[];
  prompt: DuelPromptView | null;
  /** What to do in a selection made on the board itself (a target, a Tribute, a zone): the original's wording. */
  instruction?: string;
  turn: number;
  turnPlayer: 0 | 1;
  phase: string;
  log: string[];
  /** Archive path of the original duel backdrop for the current field theme. */
  background?: string;
  /** The latest server information box (for example, a refused surrender). */
  notice?: { id: number; text: string };
  spectators?: number;
  spectating?: boolean;
  /** `at`: when `seconds` was current (ms); the clock runs down from there unless paused. */
  timer?: { player: 0 | 1; seconds: number; paused: boolean; otherSeconds?: number; at?: number };
  ended?: string;
  /** What the duel earned: the lobby's 0x4140 PLAYERDATAUPDATE against the profile when the duel began (src/duel/rewards.ts). */
  rewards?: { mp: number; score: number; level: [number, number] };
  /** After an NPC duel: the record against that NPC the server sends with 0x4140 (its NPCBIN row). */
  npcRecord?: { name: string; wins: number; losses: number; draws: number };
  waiting?: string;
  /** The latest duel packet the client rejected whole (the board keeps its last good state). */
  issue?: string;
  /** Only server-issued commands are offered. */
  actions?: DuelOption[];
  /** The server prompt the actions answer; an action sent for an older prompt is refused. */
  actionsFor?: string;
  effects?: { type: 'attack' | 'chain' | 'damage' | 'recover' | 'flash'; player: 0 | 1; progress: number; cardId?: string; value?: number }[];
  /** Presentation cues for the original duel effects (src/duel/cues.ts), oldest first; ids only grow. */
  cues?: readonly DuelCue[];
}
/** `parts`: the 16 avatar bytes the waist-up portrait is composed from (src/ui/duel-portrait.ts). */
export interface DuelistView { name: string; lp: number; deckCount?: number; handCount?: number; turnCounters?: { passcode: number; name: string; turns: number }[]; parts?: Uint8Array }
export interface DuelCuePlace { controller: 0 | 1; zone: FieldZone; index: number }
export interface DuelCue {
  id: number;
  kind: 'start' | 'turn' | 'phase' | 'summon' | 'set' | 'flip' | 'activate' | 'chain-run' | 'attack' | 'destroy' | 'tribute' | 'damage' | 'recover' | 'coin' | 'dice' | 'field';
  player: 0 | 1;
  at?: DuelCuePlace; target?: DuelCuePlace; direct?: boolean; defense?: boolean;
  cardKind?: 'monster' | 'spell' | 'trap';
  phase?: 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';
  /** Chain link number (activate / chain-run). */
  link?: number;
  /** LP amount, die face or field theme. */
  value?: number;
  /** Coin faces, 1 = heads. */
  values?: number[];
}
export interface SocialEntry { id: number | string; name: string; status?: string; online?: boolean; }
export interface SocialView { friends: SocialEntry[]; mail?: { id: string; sender: string; subject: string; body: string }[]; loading?: boolean; }
export interface SettingsView { sound: number; music: number; reducedMotion: boolean; showCardNames: boolean;
  /** The original game's text language letter (features/language.ts); absent means English. */
  language?: GameLanguage;
  /** DUEL OPTIONS (CWindowModelDuelConfig); absent means the engine's defaults (duelOptions). */
  autoTracking?: boolean; autoPlacing?: boolean; activationMessage?: ActivationMessage; }
/** DUEL OPTIONS' Activation Message: 0 Auto Cancel, 1 Semi Auto Cancel, 2 Manual. */
export type ActivationMessage = 0 | 1 | 2;
export interface DuelOptions { autoTracking: boolean; autoPlacing: boolean; activationMessage: ActivationMessage }
/** The DUEL OPTIONS in effect: the engine starts with ON, ON, Semi Auto Cancel (CWindowModelDuelConfig's row1_/row2_/row3_). */
export const duelOptions = (s: Partial<SettingsView>): DuelOptions => ({ autoTracking: s.autoTracking ?? true, autoPlacing: s.autoPlacing ?? true,
  activationMessage: s.activationMessage === 0 || s.activationMessage === 2 ? s.activationMessage : 1 });
/** A starter structure deck on offer (GET /api/de/starter): what main's picker (web-shell/starter.js) shows. */
export interface StarterDeckChoice { id: number; name: string; blurb: string; cover: number; cards: { id: number; name: string; n: number; type: 'monster' | 'spell' | 'trap' | 'extra' }[]; mainCount?: number; extraCount?: number; }
export interface ClientView {
  npc?: Readonly<NpcState>;
  npcCardViews?: Readonly<Record<number, CardView>>;
  /** The deck recipes' names by their PBIN bit (deck-recipes.json recipeBit): a gifted recipe's name. */
  npcGiftRecipes?: Readonly<Record<number, string>>;
  /** Original pack names by pack id, once the pack tables are read. */
  packNames?: Readonly<Record<number, string>>;
  dataStatus?: { loading: boolean; issues: string[] };
  /** Options → Language: a switch in progress, its failure (the previous language stays), cards left in English. */
  languageStatus?: { loading: GameLanguage | null; available: boolean; error?: string; missing?: number };
  mode?: 'world' | 'free';
  profileDetail?: ProfileState;
  /** The titles the character has earned (the PBIN snapshot, features/titles.ts): Change Title's list. */
  titles?: import('../features/titles').OwnedTitle[];
  /** My Profile's '% of Cards Collected': the card types owned, as a percentage of the catalogue. */
  cardsCollected?: number | undefined;
  /** The admin's tournament (network/tournament.ts) and the server's event state (EVENTINFO), online. */
  tournament?: import('../network/tournament').TournamentState | null;
  eventInfo?: import('../network/tournament').EventInfo | null;
  /** The account's admin sanctions from the login result (0x3004): chat input and trade entry points are greyed out. */
  sanctions?: { chat: boolean; trade: boolean };
  /** Where the character stands: the world's lobbies or their own My Room (the private lobby port). */
  location?: 'world' | 'my-room';
  matchmaking?: { status: 'idle' | 'searching' | 'matched'; style: 3 | 6; similarLevel: boolean; opponent: { pid: number; name: string } | null; counts: { single: number; match: number; either: number }; matchSupported: false };
  accountDetail?: AccountState;
  capture?: CaptureStatus;
  audio?: AudioState;
  socialDetail?: SocialState;
  online?: OnlineState;
  tagLobby?: TagLobbyState;
  sideboarding?: { deck: DeckView; original: DeckView; round: number; scores: [number, number, number]; deadline?: number | null; ready: boolean; error?: string };
  match?: { round: number; scores: [number, number, number]; complete: boolean };
  scene: Scene;
  /** A duel record being replayed on the duel screen (the Duel Log's Play): its commands so far of all. */
  replay?: { names: [string, string]; when: number; index: number; total: number; playing: boolean };
  auth?: { signedIn: boolean; name?: string };
  relay?: { active: [0 | 1, 0 | 1]; self: 0 | 1 | 255; players: { pid: number; name: string }[]; canAct: boolean };
  preparation?: { role?: 'player' | 'partner' | 'spectator'; phase: string; opponentHand?: number | null };
  starter?: { claimable: boolean; decks: StarterDeckChoice[] };
  connection: 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error';
  /** A lost lobby or duel connection being re-made (live's window.yo2Net): the notice while it lasts. */
  net?: { reconnecting: boolean; attempt: number; what: 'lobby' | 'duel' | null };
  status: string;
  error?: string;
  busy?: boolean;
  player: PlayerView | null;
  characters: CharacterView[];
  lobby: LobbyView | null;
  deckEditor: DeckEditorView | null;
  shop: ShopView | null;
  duel: DuelView | null;
  social: SocialView | null;
  settings: SettingsView;
  /** Unavailable features are explicit; never pretend their actions succeeded. */
  unavailable?: Partial<Record<Scene, string>>;
}
export type DuelResponse =
  | { optionId: string }
  | { cardIds: string[] }
  | { optionIds: string[] }
  | { number: number }
  | { text: string }
  | { cancel: true };
export type ClientCommand =
  | { type: 'replayPlay'; key: string }
  | { type: 'replayControl'; action: 'toggle' | 'step' | 'exit' }
  | { type: 'connect'; freeMode?: boolean }
  | { type: 'npcAnswer'; accept: boolean }
  | { type: 'npcAdvance' | 'npcDismiss' | 'npcClose' | 'npcRefreshInventory' }
  | { type: 'npcSelectPack'; pack: number }
  | { type: 'reloadData' }
  | { type: 'profileAction'; action: ProfileAction }
  | { type: 'startMatchmaking'; style?: 3 | 4 | 6; similarLevel?: boolean }
  | { type: 'cancelMatchmaking' | 'refreshMatchmaking' | 'retryMatchmaking' }
  | { type: 'accountAction'; action: AccountAction }
  | { type: 'captureStart' | 'captureStop' | 'captureDownload' }
  | { type: 'audioAction'; action: AudioAction }
  | { type: 'socialAction'; action: SocialAction }
  | { type: 'onlineAction'; action: OnlineAction }
  | { type: 'tagAction'; action: TagLobbyAction }
  | { type: 'disconnect' }
  /** Tournaments: ask the server for the state, entries and bracket (entering it while its entry is open). */
  | { type: 'tournamentRefresh' }
  | { type: 'signIn'; username: string; password: string }
  | { type: 'signOut' }
  | { type: 'createCharacter'; slot: number; name: string; /** the first dressing's look (Change Avatar), worn on entering */ appearance?: number[] }
  | { type: 'deleteCharacter'; slot: number }
  | { type: 'claimStarter'; id: number }
  | { type: 'chooseHand'; hand: 0 | 1 | 2 }
  | { type: 'chooseFirst'; first: boolean }
  | { type: 'beginDuel' }
  | { type: 'selectCharacter'; slot: number }
  | { type: 'openScene'; scene: Scene }
  | { type: 'move'; x: number; y: number }
  | { type: 'moveArea'; area: number; block: number }
  /** The Main Menu's Return to your Room (enter: the private My Room lobby) and its door back to the world. */
  | { type: 'myRoom'; enter: boolean }
  | { type: 'interact'; playerId: number }
  | { type: 'chat'; channel: string; text: string; target?: string }
  | { type: 'duelChallenge'; playerId: number }
  | { type: 'createDuelRoom'; options?: { style?: 3 | 4; mode?: number; password?: string; allowSurrender?: boolean; timeLimit?: boolean; allowWatch?: boolean } }
  | { type: 'deleteDuelRoom' }
  | { type: 'challengeRoom'; roomId: number; password?: string }
  | { type: 'replyChallenge'; accept: boolean }
  | { type: 'cancelChallenge' }
  | { type: 'spectate'; pid: number }
  | { type: 'leaveDuel' }
  | { type: 'selectDeck'; name: string }
  | { type: 'newDeck'; name: string }
  | { type: 'renameDeck'; name: string }
  | { type: 'deckCard'; passcode: number; from: DeckZone | 'collection'; to: DeckZone | 'collection'; index?: number }
  | { type: 'sideboardMove'; passcode: number; from: DeckZone; to: DeckZone; index?: number }
  | { type: 'sideboardSwap'; mainIndex: number; sideIndex: number }
  | { type: 'submitSideboard' }
  | { type: 'deckReorder'; zone: DeckZone; fromIndex: number; toIndex: number }
  | { type: 'replaceDeck'; deck: DeckView; source: 'import' | 'recipe' | 'clear' }
  | { type: 'importLegacyDeck'; bytes: Uint8Array; name: string }
  | { type: 'exportDeck'; format: 'ydc' | 'ydk' | 'json' }
  /** as: 'copy' saves under the draft's new name and keeps the deck it came from (Save New); 'overwrite' replaces
   * another saved deck of that name, keeping the one it came from too. */
  | { type: 'saveDeck'; as?: 'copy' | 'overwrite' }
  | { type: 'deleteDeck'; name: string }
  | { type: 'buy'; itemId: number; count: number }
  | { type: 'refresh'; scene: Scene }
  /** The Friend List's presence: who is online and where (GET /api/de/friends), loaded as the list opens. */
  | { type: 'refreshFriends' }
  | { type: 'duelRespond'; promptId: string; response: DuelResponse }
  | { type: 'duelAction'; actionId: string; promptId?: string }
  | { type: 'inspectCard'; cardId: string }
  | { type: 'surrender' }
  | { type: 'settings'; settings: Partial<SettingsView> };
export interface ClientController {
  getState(): ClientView;
  subscribe(listener: (state: ClientView) => void): () => void;
  dispatch(command: ClientCommand): void | Promise<void>;
  /** A leased card-art URL; the view releases it when its final rendered use disappears. */
  loadWorldScene?(mapId: number, signal: AbortSignal): Promise<WorldScene>;
  loadAvatar?(parts: Uint8Array, options: AvatarLoadOptions): Promise<AvatarResource>;
  loadCardImage?(passcode: number, signal: AbortSignal): Promise<{ url: string; release(): void }>;
  /** Display data for a card the server named by passcode (catalogue name, stats, text). */
  cardView?(passcode: number): CardView;
  /** A leased original image by archive path (shop packs, duel backdrop/field/phase sprites, card back). */
  loadArchiveImage?(path: string, signal: AbortSignal): Promise<{ url: string; release(): void }>;
  /** One original file's bytes for main's page modules (htmlui/lazy-shim.ts). */
  readGameFile?(path: string, signal?: AbortSignal): Promise<Uint8Array>;
  /** A card's big art by YO2 id for main's page modules (lazyfs.js cardArt: card.dat's 2x art, merge.dat's as fallback). */
  readCardArt?(id: number, signal?: AbortSignal): Promise<Uint8Array | null>;
  /** The original's own UI strings (data/common/yo2text_?) by text id; absent without the original data. */
  gameText?(ids: readonly number[], signal: AbortSignal): Promise<ReadonlyMap<number, string>>;
  /** A language's whole yo2text table by id (the English one indexes the labels the rewrite gives main's screens). */
  gameTextTable?(language: import('../features/language').GameLanguage, signal?: AbortSignal): Promise<readonly string[]>;
  /** The duel records kept in this browser (services/duel-records.ts), newest first: what the Duel Log can Play. */
  duelRecords?(): Promise<readonly { key: string; when: number; names: [string, string] }[]>;
  /** Whether `password` is the signed-in account's (asked before deleting a character); null when it has none. */
  checkPassword?(password: string, signal: AbortSignal): Promise<boolean | null>;
}
