import type { AccountAction, AccountState } from '../features/account';
import type { CaptureStatus } from '../parity/live';
import type { AudioAction, AudioState } from '../features/audio';
import type { SocialAction, SocialState } from '../features/social';
import type { OnlineAction, OnlineState } from '../features/online';
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
  attribute?: string;
  level?: number;
  attack?: number;
  defense?: number;
  owned?: number;
  limit?: number;
  extra?: boolean;
}
export interface DeckView { name: string; main: number[]; side: number[]; extra: number[]; }
export interface DeckEditorView { decks: DeckView[]; current: DeckView | null; collection: CardView[]; dirty?: boolean; loading?: boolean; error?: string; }
export interface LobbyAvatar { id: number; name: string; x: number; y: number; self?: boolean; npc?: boolean; image?: string; }
export interface ChatLine { id: string; sender: string; text: string; channel: string; }
export interface LobbyView { rooms?: { id: number; owner: number; name: string; state: number; password?: boolean }[]; invitation?: { name: string; pid: number }; areas?: { area: number; block: number; name: string; population?: number }[]; npcs?: { id: number; name: string }[]; name: string; mapImage?: string; width?: number; height?: number; avatars: LobbyAvatar[]; chat: ChatLine[]; channels: string[]; connected: boolean; }
export interface ShopItem { id: number; name: string; price: number; category?: string; image?: string; owned?: boolean; }
export interface ShopView { items: ShopItem[]; mp: number; earnedMp?: number; loading?: boolean; available?: boolean; error?: string; }
export type FieldZone = 'deck' | 'hand' | 'monster' | 'spell' | 'graveyard' | 'banished' | 'extra' | 'field';
export interface DuelCardView extends CardView { motion?: { x: number; y: number; rotation: number; scaleX: number; opacity?: number; zIndex?: number }; controller: 0 | 1; zone: FieldZone; index: number; faceUp: boolean; position?: 'attack' | 'defense'; }
export interface DuelOption { id: string; label: string; disabled?: boolean; cardId?: string; }
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
  numberMin?: number;
  numberMax?: number;
}
export interface DuelView {
  players: readonly [{ name: string; lp: number; deckCount?: number; handCount?: number }, { name: string; lp: number; deckCount?: number; handCount?: number }];
  cards: DuelCardView[];
  prompt: DuelPromptView | null;
  turn: number;
  turnPlayer: 0 | 1;
  phase: string;
  log: string[];
  spectators?: number;
  spectating?: boolean;
  timer?: { player: 0 | 1; seconds: number; paused: boolean; otherSeconds?: number };
  ended?: string;
  waiting?: string;
  /** Only server-issued commands are offered. */
  actions?: DuelOption[];
  effects?: { type: 'attack' | 'chain' | 'damage' | 'recover' | 'flash'; player: 0 | 1; progress: number; cardId?: string; value?: number }[];
}
export interface SocialEntry { id: number | string; name: string; status?: string; online?: boolean; }
export interface SocialView { friends: SocialEntry[]; mail?: { id: string; sender: string; subject: string; body: string }[]; loading?: boolean; }
export interface SettingsView { sound: number; music: number; reducedMotion: boolean; showCardNames: boolean; }
export interface ClientView {
  accountDetail?: AccountState;
  capture?: CaptureStatus;
  audio?: AudioState;
  socialDetail?: SocialState;
  online?: OnlineState;
  scene: Scene;
  auth?: { signedIn: boolean; name?: string };
  preparation?: { phase: string; opponentHand?: number | null };
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
  | { type: 'connect' }
  | { type: 'accountAction'; action: AccountAction }
  | { type: 'captureStart' | 'captureStop' | 'captureDownload' }
  | { type: 'audioAction'; action: AudioAction }
  | { type: 'socialAction'; action: SocialAction }
  | { type: 'onlineAction'; action: OnlineAction }
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
  | { type: 'spectate'; pid: number }
  | { type: 'leaveDuel' }
  | { type: 'selectDeck'; name: string }
  | { type: 'newDeck'; name: string }
  | { type: 'renameDeck'; name: string }
  | { type: 'deckCard'; passcode: number; from: DeckZone | 'collection'; to: DeckZone | 'collection'; index?: number }
  | { type: 'saveDeck' }
  | { type: 'deleteDeck'; name: string }
  | { type: 'buy'; itemId: number; count: number }
  | { type: 'refresh'; scene: Scene }
  | { type: 'duelRespond'; promptId: string; response: DuelResponse }
  | { type: 'duelAction'; actionId: string }
  | { type: 'inspectCard'; cardId: string }
  | { type: 'surrender' }
  | { type: 'settings'; settings: Partial<SettingsView> };
export interface ClientController {
  getState(): ClientView;
  subscribe(listener: (state: ClientView) => void): () => void;
  dispatch(command: ClientCommand): void | Promise<void>;
  /** A leased card-art URL; the view releases it when its final rendered use disappears. */
  loadCardImage?(passcode: number, signal: AbortSignal): Promise<{ url: string; release(): void }>;
}
