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
export type Scene = 'title' | 'characters' | 'lobby' | 'deck' | 'shop' | 'duel' | 'social' | 'settings';
export type DeckZone = 'main' | 'side' | 'extra';
export interface CharacterView { slot: number; name: string; level?: number; selected?: boolean; }
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
export interface LobbyAvatar { id: number; name: string; x: number; y: number; self?: boolean; npc?: boolean; image?: string; parts?: Uint8Array; direction?: number; motion?: 'stand' | 'walk'; world?: 0 | 1; /** In a duel others may watch (the server's duelling states). */ duelling?: boolean; }
export interface ChatLine { id: string; sender: string; text: string; channel: string; }
export interface LobbyView { mapId?: number; rooms?: { id: number; owner: number; name: string; state: number; password?: boolean; /** Watch On, and who the owner duels (0: waiting). */ watch?: boolean; opponent?: number }[]; invitation?: { name: string; pid: number }; /** The challenge this player sent and is waiting on. */ outgoing?: { name: string }; areas?: { area: number; block: number; name: string; population?: number }[]; npcs?: { id: number; name: string }[]; name: string; mapImage?: string; width?: number; height?: number; avatars: LobbyAvatar[]; chat: ChatLine[]; channels: string[]; connected: boolean; }
export interface ShopItem { id: number; name: string; price: number; category?: string; /** Accessories: the avatar part's ownership bit. */ avatarBit?: number; image?: string; imagePath?: string; description?: string; card?: CardView; owned?: boolean; }
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
  language?: GameLanguage; }
export interface ClientView {
  npc?: Readonly<NpcState>;
  npcCardViews?: Readonly<Record<number, CardView>>;
  /** Original pack names by pack id, once the pack tables are read. */
  packNames?: Readonly<Record<number, string>>;
  dataStatus?: { loading: boolean; issues: string[] };
  /** Options → Language: a switch in progress, its failure (the previous language stays), cards left in English. */
  languageStatus?: { loading: GameLanguage | null; available: boolean; error?: string; missing?: number };
  mode?: 'world' | 'free';
  profileDetail?: ProfileState;
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
  auth?: { signedIn: boolean; name?: string };
  relay?: { active: [0 | 1, 0 | 1]; self: 0 | 1 | 255; players: { pid: number; name: string }[]; canAct: boolean };
  preparation?: { role?: 'player' | 'partner' | 'spectator'; phase: string; opponentHand?: number | null };
  starter?: { claimable: boolean; decks: { id: number; name: string; mainCount?: number; extraCount?: number }[] };
  connection: 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error';
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
  | { type: 'connect'; freeMode?: boolean }
  | { type: 'npcAnswer'; accept: boolean }
  | { type: 'npcAdvance' | 'npcClose' | 'npcRefreshInventory' }
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
  | { type: 'signIn'; username: string; password: string }
  | { type: 'signOut' }
  | { type: 'createCharacter'; slot: number; name: string }
  | { type: 'deleteCharacter'; slot: number }
  | { type: 'claimStarter'; id: number }
  | { type: 'chooseHand'; hand: 0 | 1 | 2 }
  | { type: 'chooseFirst'; first: boolean }
  | { type: 'beginDuel' }
  | { type: 'selectCharacter'; slot: number }
  | { type: 'openScene'; scene: Scene }
  | { type: 'move'; x: number; y: number }
  | { type: 'moveArea'; area: number; block: number }
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
  | { type: 'saveDeck' }
  | { type: 'deleteDeck'; name: string }
  | { type: 'buy'; itemId: number; count: number }
  | { type: 'refresh'; scene: Scene }
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
}
