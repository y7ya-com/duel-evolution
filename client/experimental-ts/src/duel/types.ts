/** Client-side state only. The server remains the sole authority for rules and choices. */
export type Player = 0 | 1;
export type Zone = 'monster' | 'spell' | 'hand' | 'extra' | 'deck' | 'grave' | 'banish';
export interface WireMessage { id: number; data: Uint8Array; param?: number }
export interface Location { player: Player; zone: Zone; index: number }
export interface DuelCard extends Location {
  uid: number; owner: Player; serial: number; passcode: number | null;
  hiddenKind: 'monster' | 'spell' | 'trap' | null;
  faceUp: boolean; defense: boolean; token: boolean;
  attack: number | null; defence: number | null; counters: Record<number, number>;
  value: number; turns: number;
}
export interface DuelSide {
  lp: number; monster: (number | null)[]; spell: (number | null)[];
  hand: (number | null)[]; extra: (number | null)[]; deck: (number | null)[];
  grave: (number | null)[]; banish: (number | null)[];
  nextSerial: number;
  turnCounters: Record<number, number>;
}
export interface LegalAction {
  player: Player; zone: number; index: number; command: number; label: string;
}
export interface ListItem { passcode: number | null; rawId: number; serial: number; owner: number }
export interface DialogItem { value: number; kind: number }
export type PromptKind = 'actions' | 'yesno' | 'option' | 'position' | 'race' | 'attribute' |
  'number' | 'cards' | 'announce-card' | 'field-selection' | 'ritual' | 'discard' | 'unsupported';
export interface DuelPrompt {
  id: number; kind: PromptKind; title: string;
  /** The legacy server does not transmit all cancellation constraints; it will reject invalid cancels. */
  cancelable: boolean; cancellationKnown: boolean;
  actions: LegalAction[]; buttons: number[]; items: ListItem[]; text: DialogItem[];
  min: number; max: number; options: { value: number; label: string }[];
  dialogKind: number; listMode: number; detail: number; hints: number;
}
export interface PresentationEvent {
  sequence: number; type: string; player: Player; params: number[]; card?: number;
}
export interface UnsupportedEvent { sequence: number; messageId: number; kind: number; command: number; reason: string }
export interface DuelState {
  version: 1; sequence: number; status: 'idle' | 'playing' | 'finished' | 'error';
  sides: [DuelSide, DuelSide]; cards: Record<number, DuelCard>;
  turnPlayer: Player; turn: number; phase: 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end' | null;
  chain: { player: Player; zone: number; uid: number | null; link: number; resolving: boolean }[];
  prompt: DuelPrompt | null; promptSequence: number;
  fieldMasks: [number[], number[]]; handMasks: [Record<number, number>, Record<number, number>];
  buttons: [number[], number[]]; inputKind: number; acceptingInput: boolean;
  /** `consumed`: a view already showed this list/dialog text; a later view that sent none of its own must not reuse it. */
  list: { mode: number; items: ListItem[]; owner: number; consumed?: boolean };
  dialog: { expected: number; items: DialogItem[]; consumed?: boolean }; variables: Record<number, number>;
  timer: { player: Player; seconds: number; paused: boolean; otherSeconds: number } | null;
  /** Match sideboarding uses GLOBAL_CLOCK=3; it is not a third board player. */
  matchTimer: { seconds: number; paused: boolean; otherSeconds: number } | null;
  result: { result: number; mode: number } | null;
  /** A bounded presentation queue, separate from authoritative state. Consumers acknowledge events. */
  events: PresentationEvent[]; droppedPresentationEvents: number;
  unsupported: UnsupportedEvent[]; errors: string[];
}
export type DuelResponse =
  | { type: 'action'; player: Player; zone: number; index: number; command: number }
  | { type: 'phase'; phase: number }
  | { type: 'answer'; value: number }
  | { type: 'yesno'; yes: boolean }
  | { type: 'cards'; indices: number[] }
  | { type: 'announce-card'; passcode: number }
  | { type: 'cancel' };
export interface CommandRecord { kind: number; b: number; params: number[]; indexSlots: number; internalSlots: number; hints: number }
