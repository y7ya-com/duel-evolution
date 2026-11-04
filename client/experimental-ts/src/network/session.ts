import { defaultAvatar } from '../avatars/appearance';
import { BinaryReader, BinaryWriter, latin1, md5, type WireMessage } from './codec';
import { Channel, GatewayClient, type GatewayOptions, type GatewayStatus } from './gateway';

export interface Character {
  slot: number; name: string; level: number; score: number; mp: number; wins: number; losses: number;
  avatarA: Uint8Array; avatarB: Uint8Array;
}
export interface ServerEntry { id: number; kind: number; name: string; host: string; port: number; population: number; language: number; roomKind: number }
export interface Player { pid: number; name: string; level: number; wins: number; losses: number; country: string; areaBlock: number; x?: number; y?: number; direction?: number; parts?: Uint8Array; state?: number }
export interface Npc { id: number; name: string; parts: Uint8Array; threshold: number; spot: number; previous: number }
export interface Area { block: number; area: number; kind: number; population: number }
export interface DuelRoom { id: number; owner: number; opponent: number; state: number; style: number; mode: number; password: boolean; options: number[] }
export interface DuelOffer { host: string; port: number; address: Uint8Array; source: 'npc' | 'pvp' }
export interface DuelChallenge { pid: number; name: string; level: number; title: number; parts: Uint8Array }
export interface DuelRoomOptions { style?: 3 | 4; mode?: number; password?: string; allowSurrender?: boolean; timeLimit?: boolean; allowWatch?: boolean }
export interface SessionChat { channel: number; pid: number; name: string; text: string }
export interface SessionProfile { pid: number; level: number; score: number; mp: number }
export type SessionPhase = 'idle' | 'connecting' | 'characters' | 'loading-character' | 'changing-lobby' | 'lobby' | 'preparing-duel' | 'rock-paper-scissors' | 'choose-first' | 'duel' | 'sideboarding' | 'error' | 'closed';
export interface MatchmakingOptions { style?:3|4|6; similarLevel?:boolean; allowSurrender?:boolean; timeLimit?:boolean }
export interface MatchmakingState {
  status:'idle'|'searching'|'matched'; style:3|6; similarLevel:boolean;
  opponent:DuelChallenge|null;
  /** Counts of waiting rooms in the visible room list, not eligible-opponent counts. */
  counts:{ single:number; match:number; either:number };
  matchSupported:false;
}
export interface RelayPlayer { pid:number; name:string; avatarA:Uint8Array; avatarB:Uint8Array }
export interface RelayState {
  /** Own team's pilot, opposing team's pilot, and this recipient's team member index. */
  active: [0 | 1, 0 | 1]; self: 0 | 1 | 255;
  /** Own captain, own partner, opposing captain, opposing partner. */
  players: RelayPlayer[];
  canAct: boolean;
}
export interface MatchState {
  round: number;
  /** Server scores from this player's perspective: wins, losses, draws. */
  scores: [number, number, number];
  stage: 'preparing' | 'playing' | 'sideboarding' | 'complete';
  /** The previous game's loser chooses first; a draw requires rock-paper-scissors. */
  chooser: boolean | null;
  complete: boolean;
  sideboardDeadline: number | null;
  original: DuelDeck;
  deck: DuelDeck;
}
export interface SessionState {
  location:'world'|'my-room'; lobbyTransition:'entering-my-room'|'leaving-my-room'|null; returnArea:number|null; appearanceWorld:0|1;
  phase: SessionPhase; connection: GatewayStatus; characters: Character[]; servers: ServerEntry[];
  selectedSlot: number | null; profile: SessionProfile | null; collection: ReadonlyMap<number, number>;
  /** Authoritative snapshots; unknown until the corresponding complete account packet arrives. */
  pbin?:Uint8Array; npcbin?:Uint8Array;
  players: Player[]; areas: Area[]; npcs: Npc[]; rooms: DuelRoom[]; chat: SessionChat[]; area: number; areaBlock: number;
  duelOffer: DuelOffer | null; challenge: DuelChallenge | null; outgoingChallengeRoom: number | null; spectating: boolean;
  matchmaking:MatchmakingState; relay: RelayState | null; duelRole: 'player' | 'partner' | 'spectator'; match: MatchState | null; duelFirst: number | null; opponentHand: number | null; rpsLost: boolean; error: string | null;
}
export interface DuelDeck { main: number[]; extra: number[]; side?: number[] }
export interface SessionOptions extends Omit<GatewayOptions, 'onMessage' | 'onStatus' | 'onChannelClose'> {
  language?: number;
  freeMode?: boolean;
  onState?: (state: SessionState) => void;
  onMessage?: (channel: Channel, message: WireMessage) => void;
  onDuelOffer?: (offer: DuelOffer) => void;
  /** A 32-byte DEV fixture login only. Live identity always comes from the authenticated WebSocket cookie. */
  loginBlob?: Uint8Array;
}
interface RightsRefresh { account:Channel; slot:number; epoch:number; promise:Promise<void> }
const EMPTY = () => new Uint8Array(0);
/** Result codes the original client words itself: login (server/src/game/hub.ts AUTH_*) and character creation
 * (server/src/game/accounts.ts REG_NAME_*, the 2008 client's own wording). */
const RESULT_TEXT: Record<string, Record<number, string>> = {
  // CNetAccountTask::errorText (0x006a6eb0) text ids, original English wording.
  Login: {
    [-240]: 'Incorrect User ID or Password. Sign out and sign in again.',
    [-241]: 'Invalid User ID.',
    [-242]: 'This User ID is already logged in. Close the other window, or wait a minute and try again.',
    [-244]: 'This User ID has not been used for over 180 days.',
    [-246]: 'You have a Login ban.',
    [-200]: 'Failed to connect to server.',
  },
  'Character creation': {
    [-260]: 'This Player Name is already in use. Please create another.',
    [-262]: 'There are incompatible characters in this name. Please create another.',
    [-263]: 'Inappropriate name. Please create another.',
  },
};
const checkResult = (message: WireMessage, label: string): void => {
  const result = new BinaryReader(message.data).i32();
  if (result !== 0) throw new Error(RESULT_TEXT[label]?.[result] ?? `${label} refused (${result})`);
};
const parseRows = <T>(data: Uint8Array, width: number, decode: (row: BinaryReader) => T): T[] => {
  if (data.length % width) throw new Error(`Invalid ${width}-byte table`);
  const out: T[] = [];
  for (let i = 0; i < data.length; i += width) out.push(decode(new BinaryReader(data.subarray(i, i + width))));
  return out;
};
export function decodeCharacters(data: Uint8Array): Character[] {
  const result = new BinaryReader(data); if (result.i32() !== 0) throw new Error('Character list refused');
  return parseRows(data.subarray(4), 76, (r) => {
    const slot = r.u8(), name = r.s(16), level = r.u8(), score = r.i32();
    r.u32(); r.u32(); r.u16(); const mp = r.u32(); r.u16(); const wins = r.u16(), losses = r.u16(); r.u16();
    return { slot, name, level, score, mp, wins, losses, avatarA: r.bytes(16), avatarB: r.bytes(16) };
  });
}
export function decodeServers(data: Uint8Array): ServerEntry[] {
  return parseRows(data, 48, (r) => {
    const id = r.u32(), kind = r.u32(), name = r.s(16), host = r.s(15), port = r.u16(), population = r.u16(), language = r.u8(), roomKind = r.u8();
    r.u8(); r.u16(); return { id, kind, name, host, port, population, language, roomKind };
  });
}
function decodePlayers(data: Uint8Array): Player[] {
  return parseRows(data, 36, (r) => {
    const pid = r.u32(), name = r.s(16), level = r.u8(), wins = r.u16(), losses = r.u16(); r.u16(); r.u16(); r.u8();
    const country = r.s(4); r.u8(); return { pid, name, level, wins, losses, country, areaBlock: r.u8() };
  });
}
function decodeNpcs(data: Uint8Array): Npc[] {
  return parseRows(data, 61, (r) => {
    const id = r.u32(), name = r.s(16), parts = r.bytes(16); r.u8(); r.u32(); r.u32();
    const threshold = r.u32(), spot = r.u32(); r.u32(); return { id, name, parts, threshold, spot, previous: r.u32() };
  });
}
function decodeRooms(data: Uint8Array): DuelRoom[] {
  return parseRows(data, 19, (r) => ({ id: r.u32(), owner: r.u32(), opponent: r.u32(), state: r.u8(), style: r.u8(), mode: r.u8(), password: !!r.u8(), options: [r.u8(), r.u8(), r.u8()] }));
}

/** Independent session lifecycle over the existing server, without a guest executable or memory bridge. */
export class GameSession {
  readonly gateway: GatewayClient;
  readonly state: SessionState = {
    location:'world',lobbyTransition:null,returnArea:null,appearanceWorld:0,
    phase: 'idle', connection: 'idle', characters: [], servers: [], selectedSlot: null, profile: null,
    collection: new Map(), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 0, areaBlock: 0,
    duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false,
    matchmaking:{ status:'idle',style:3,similarLevel:true,opponent:null,counts:{ single:0,match:0,either:0 },matchSupported:false }, relay:null, duelRole:'player', match: null, duelFirst: null, rpsLost: false, opponentHand: null, error: null,
  };
  account: Channel | null = null;
  lobby: Channel | null = null;
  duel: Channel | null = null;
  private disposed = false;
  private lobbyMove:{target:'world'|'my-room';promise:Promise<void>}|null = null;
  private lobbyEpoch = 0;
  private joiningRoomKind = 14;
  private cachedWorld:{port:number;area:number}|null = null;
  private accountPing:{account:Channel;promise:Promise<void>}|null = null;
  private rightsEpoch = 0;
  private rightsRefresh: RightsRefresh | null = null;
  private rightsInFlight: RightsRefresh | null = null;
  private rightsNeedsBarrier = false;
  private pendingNpc = false;
  private pendingMatchmaking = false;
  private submittingSideboard = false;
  private roomStyle = 3;
  private myRoomPosition:{x:number;y:number;direction:number}|null = null;
  private pendingPosition: { x:number; y:number; direction:number } | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private trunk = new Map<number, number>();
  private listPlayers: Player[] = [];
  private listNpcs: Npc[] = [];
  private listRooms: DuelRoom[] = [];
  private readonly blob: Uint8Array;
  constructor(readonly options: SessionOptions) {
    this.blob = options.loginBlob?.slice() ?? new Uint8Array(32);
    if (this.blob.length !== 32) throw new RangeError('Login blob must be 32 bytes');
    this.gateway = new GatewayClient({ ...options,
      onMessage: (channel, message) => { this.receive(channel, message); options.onMessage?.(channel, message); },
      onStatus: (status, error) => {
        this.state.connection = status;
        if (status === 'error' && !this.disposed) { this.state.phase = 'error'; this.state.error = error?.message ?? 'Connection failed'; }
        this.emit();
      },
      onChannelClose: (channel, error) => {
        if (this.disposed || channel !== this.lobby && channel !== this.duel) return;
        this.state.error = error.message;
        if (channel === this.lobby) { this.lobby = null; this.state.phase = 'error'; }
        if (channel === this.duel) { this.duel = null; this.stopWatchPolling(); }
        this.emit();
      },
    });
  }
  private emit(): void { if (!this.disposed) this.options.onState?.(this.state); }
  private phase(phase: SessionPhase): void { this.state.phase = phase; this.emit(); }
  private assertLive(): void { if (this.disposed) throw new Error('Session is disposed'); }
  private async authenticate(channel: Channel): Promise<void> {
    if (this.options.freeMode) channel.send(0xca10, Uint8Array.of(1));
    await channel.request(0x3001, EMPTY(), 0x3002);
    checkResult(await channel.request(0x3003, this.blob, 0x3004), 'Login');
  }
  async start(): Promise<Character[]> {
    this.assertLive(); if (this.state.phase !== 'idle') throw new Error('Session already started');
    this.phase('connecting');
    try {
      await this.gateway.connect();
      const gate = await this.gateway.open(5730);
      this.state.servers = [];
      await gate.request(0x2005, new Uint8Array(4), 0x2004); gate.close();
      const accountPort = this.state.servers.find((s) => s.kind === 1)?.port;
      if (accountPort === undefined) throw new Error('Server did not advertise accounts');
      this.account = await this.gateway.open(accountPort - (this.options.portOffset ?? 0));
      await this.authenticate(this.account); await this.refreshCharacters();
      this.phase('characters');
      this.heartbeat = setInterval(() => {
        if (this.gateway.status !== 'connected') return;
        try { for (const channel of [this.account, this.lobby, this.duel]) if (channel && !channel.closed) channel.send(0x0005); }
        catch (error) { this.report(error); }
      }, 30000);
      return this.state.characters;
    } catch (error) { this.report(error); throw error; }
  }
  async refreshCharacters(): Promise<Character[]> {
    this.assertLive(); if (!this.account) throw new Error('Accounts channel is unavailable');
    await this.account.request(0x3010, EMPTY(), 0x3012); return this.state.characters;
  }
  async createCharacter(slot: number, name: string): Promise<void> {
    this.assertLive(); this.validateSlot(slot);
    if (!this.account) throw new Error('Accounts channel is unavailable');
    // The original asks again unless the name is longer than 3 characters (CNetAccountTask NEW_WAIT_PROMPT); the
    // 16-byte wire name carries Latin-1 only, which the original reports with its -262 wording.
    if (name.length > 16 || name.includes('\0') || [...name].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) > 255)) throw new Error(RESULT_TEXT['Character creation']![-262]!);
    if (name.trim().length <= 3) throw new Error('Enter a name of at least 4 characters.');
    checkResult(await this.account.request(0x3020, new BinaryWriter().u8(slot).s(name, 16).bytes(), 0x3022), 'Character creation');
    await this.refreshCharacters();
  }
  async deleteCharacter(slot: number): Promise<void> {
    this.assertLive(); this.validateSlot(slot); if (!this.account) throw new Error('Accounts channel is unavailable');
    checkResult(await this.account.request(0x3030, Uint8Array.of(slot), 0x3032), 'Character deletion'); await this.refreshCharacters();
  }
  private validateSlot(slot: number): void { if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new RangeError('Invalid character slot'); }
  async selectCharacter(slot: number, roomPort?: number): Promise<void> {
    this.assertLive(); this.validateSlot(slot);
    const character = this.state.characters.find((c) => c.slot === slot);
    if (!character || !this.account) throw new Error('Select an existing character');
    const selectionEpoch = ++this.rightsEpoch; if (this.rightsRefresh || this.rightsInFlight) this.rightsNeedsBarrier = true;
    this.state.pbin = undefined; this.state.npcbin = undefined;
    this.phase('loading-character'); this.state.selectedSlot = slot;
    try {
      await this.account.request(0x3100, Uint8Array.of(slot), 0x3103);
      await this.refreshPlayerBits();
      const advertised = this.state.servers.find((s) => s.kind === 3 && s.roomKind === 14 && s.language === 6)
        ?? this.state.servers.find((s) => s.kind === 3 && s.roomKind === 14)
        ?? this.state.servers.find((s) => s.kind === 3 && s.roomKind !== 12);
      const port = roomPort ?? (advertised ? advertised.port - (this.options.portOffset ?? 0) : undefined);
      if (port === undefined) throw new Error('Server did not advertise a playable room');
      this.joiningRoomKind = this.state.servers.find(server=>server.port-(this.options.portOffset??0)===port)?.roomKind ?? 14;
      this.lobby = await this.gateway.open(port); await this.authenticate(this.lobby);
      checkResult(await this.lobby.request(0x4100, Uint8Array.of(this.options.language ?? 1, slot), 0x4101), 'Character selection');
      await this.lobby.request(0x4200, EMPTY(), 0x4201);
      await this.lobby.request(0x4202, Uint8Array.of(0, 0), 0x4213);
      const world = this.state.area >= 4 && this.state.area <= 7 ? 1 : 0; this.state.appearanceWorld = world;
      const worlds:(0|1)[] = this.joiningRoomKind === 12 ? [world===0?1:0,world] : [world];
      for (const appearanceWorld of worlds) await this.lobby.request(0x4170, new BinaryWriter().u32(appearanceWorld).raw(characterAppearance(character,appearanceWorld)).u32(0).bytes(), 0x4171);
      await this.lobby.request(0x4214, EMPTY(), 0x4217);
      await this.refreshNpcs(); await this.refreshRooms();
      this.state.location = this.joiningRoomKind === 12 ? 'my-room' : 'world';
      if (this.state.location === 'world') this.cachedWorld = {port,area:this.state.area};
      this.phase('lobby');
    } catch (error) {
      if (this.disposed || selectionEpoch !== this.rightsEpoch) throw new DOMException('Character selection changed','AbortError');
      this.report(error); throw error;
    }
  }
  async refreshCollection(): Promise<void> {
    this.assertLive();
    const channel = this.account;
    if (!channel || channel.closed || this.state.selectedSlot === null) throw new Error('No active character account');
    await channel.request(0x3100, Uint8Array.of(this.state.selectedSlot), 0x3103);
  }
  /** Re-read native PBIN ownership and NPCBIN progression after an acknowledged grant or settlement. */
  refreshPlayerBits(): Promise<void> {
    try { this.assertLive(); } catch (error) { return Promise.reject(error); }
    const account = this.account, slot = this.state.selectedSlot, epoch = this.rightsEpoch;
    if (!account || account.closed || slot === null) return Promise.reject(new Error('No active character account'));
    const previous = this.rightsRefresh;
    if (previous && previous.account === account && previous.slot === slot && previous.epoch === epoch) return previous.promise;
    const query: RightsRefresh = { account,slot,epoch,promise:Promise.resolve() };
    const current = () => {
      if (this.disposed || this.account !== account || this.state.selectedSlot !== slot || this.rightsEpoch !== epoch)
        throw new DOMException('Character rights request changed','AbortError');
    };
    query.promise = Promise.resolve().then(async () => {
      if (previous) await previous.promise.catch(() => {});
      await this.gateway.connect(); current();
      if (this.rightsNeedsBarrier) {
        // Responses have no request ID. An ordered account ping drains a late timed-out snapshot
        // before a new 4234 waiter can be installed on the same native channel.
        await this.drainAccount(account); current(); this.rightsNeedsBarrier = false;
      }
      this.rightsInFlight = query;
      await account.request(0x3114,Uint8Array.of(slot),0x4234); current();
    }).catch(error => {
      if (!this.disposed && this.account === account) this.rightsNeedsBarrier = true;
      throw error;
    }).finally(() => {
      if (this.rightsInFlight === query) this.rightsInFlight = null;
      if (this.rightsRefresh === query) this.rightsRefresh = null;
    });
    this.rightsRefresh = query; return query.promise;
  }
  private drainAccount(account:Channel): Promise<void> {
    if (this.accountPing?.account === account) return this.accountPing.promise;
    const ping = {account,promise:Promise.resolve()};
    ping.promise = this.gateway.connect().then(async () => {
      this.assertLive(); if (this.account !== account || account.closed) throw new Error('Account channel is unavailable');
      await account.request(0x3001,EMPTY(),0x3002);
    }).finally(() => { if (this.accountPing === ping) this.accountPing = null; });
    this.accountPing = ping; return ping.promise;
  }
  private acceptsRightsSnapshot(channel: Channel): boolean {
    if (this.disposed || channel !== this.account || this.state.selectedSlot === null || this.rightsNeedsBarrier) return false;
    const query = this.rightsInFlight;
    return !query || query.account === channel && query.slot === this.state.selectedSlot && query.epoch === this.rightsEpoch;
  }
  async refreshNpcs(): Promise<void> { if (this.joiningRoomKind === 12) { this.state.npcs = []; return; } await this.requireLobby().request(0x4230, EMPTY(), 0x4233); }
  async refreshRooms(): Promise<void> { await this.requireLobby().request(0x4280, EMPTY(), 0x4286); }
  move(x: number, y: number, direction = 0): void {
    if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535) || !Number.isInteger(direction) || direction < 0 || direction > 255)
      throw new RangeError('Invalid movement');
    this.requireLobby().send(0x5300, new BinaryWriter().u32(this.state.profile?.pid ?? 0).u16(x).u16(y).u8(direction).u8(0).bytes());
    this.pendingPosition = { x,y,direction };
    if (this.joiningRoomKind === 12) this.myRoomPosition = {x,y,direction};
    this.state.players = this.state.players.map(player => player.pid === this.state.profile?.pid ? { ...player,x,y,direction } : player);
  }
  async enterArea(area: number): Promise<void> {
    if (area === 8) { await this.enterMyRoom(); return; }
    if (this.state.location === 'my-room') throw new Error('Leave My Room before selecting a world area');
    const target = this.state.areas.find((entry) => entry.area === area);
    if (!target) throw new RangeError('Unknown area');
    const lobby = this.requireLobby(); this.pendingPosition = null;
    await lobby.request(0x4202, Uint8Array.of(target.block, 1), 0x4213);
    await lobby.request(0x4214, EMPTY(), 0x4217);
    const character = this.state.characters.find((c) => c.slot === this.state.selectedSlot);
    if (character) {
      const world = [4,5,6,7].includes(area) ? 1 : 0; this.state.appearanceWorld = world;
      await lobby.request(0x4170, new BinaryWriter().u32(world).raw(characterAppearance(character,world)).u32(0).bytes(), 0x4171);
    }
    await this.refreshNpcs();
  }
  /** Native My Room is an authenticated private lobby port, not world block 8. */
  enterMyRoom(): Promise<void> {
    if (this.lobbyMove?.target === 'my-room') return this.lobbyMove.promise;
    if (this.state.location === 'my-room' && !this.lobbyMove) return !this.disposed && this.state.phase === 'lobby' && this.lobby && !this.lobby.closed ? Promise.resolve() : Promise.reject(new Error('Join an active character lobby first'));
    return this.switchLobby('my-room');
  }
  /** The source My Room door returns to the cached world server/area, not hardcoded area zero. */
  leaveMyRoom(): Promise<void> {
    if (this.lobbyMove?.target === 'world') return this.lobbyMove.promise;
    if (this.state.location === 'world' && !this.lobbyMove) return !this.disposed && this.state.phase === 'lobby' && this.lobby && !this.lobby.closed ? Promise.resolve() : Promise.reject(new Error('Join an active character lobby first'));
    return this.switchLobby('world');
  }
  private switchLobby(target:'world'|'my-room'): Promise<void> {
    try {
      this.assertLive();
      if (this.lobbyMove || this.state.phase !== 'lobby' || this.duel && !this.duel.closed || this.state.duelOffer || this.state.challenge || this.state.outgoingChallengeRoom || this.state.match && !this.state.match.complete)
        throw new Error('Finish the current interaction before changing lobbies');
      if (this.state.matchmaking.status === 'searching') throw new Error('Cancel the automatic opponent search first');
      if (!this.account || this.account.closed || !this.lobby || this.lobby.closed || this.state.selectedSlot === null) throw new Error('Join a character lobby first');
    } catch (error) { return Promise.reject(error); }
    const account = this.account!, slot = this.state.selectedSlot!, oldLobby = this.lobby!, epoch = ++this.lobbyEpoch;
    if (target === 'my-room') { this.cachedWorld = {port:oldLobby.port,area:this.state.area}; this.state.returnArea = this.state.area; }
    const room = target === 'my-room' ? this.state.servers.find(server=>server.kind===3&&server.roomKind===12) : null;
    const defaultWorld = this.state.servers.find(server=>server.kind===3&&server.roomKind===14&&server.language===6)
      ?? this.state.servers.find(server=>server.kind===3&&server.roomKind===14)
      ?? this.state.servers.find(server=>server.kind===3&&server.roomKind!==12);
    const destination:{port:number;area:number|null}|null = target === 'my-room' ? room ? {port:room.port-(this.options.portOffset??0),area:8} : null
      : this.cachedWorld ?? (defaultWorld ? {port:defaultWorld.port-(this.options.portOffset??0),area:null} : null);
    if (!destination) return Promise.reject(new Error(target === 'my-room' ? 'Server did not advertise My Room' : 'No previous world lobby is available'));
    const move = {target,promise:Promise.resolve()}; this.lobbyMove = move;
    this.state.lobbyTransition = target === 'my-room' ? 'entering-my-room' : 'leaving-my-room'; this.state.phase = 'changing-lobby';
    const current = () => { if (this.disposed || this.lobbyEpoch !== epoch || this.account !== account || this.state.selectedSlot !== slot) throw new DOMException('Lobby transition changed','AbortError'); };
    move.promise = Promise.resolve().then(async () => {
      await this.gateway.connect(); current();
      // Read the authoritative saved looks; profile/wardrobe edits may have changed them since character selection.
      await this.refreshCharacters(); current();
      if (this.state.location === 'world') oldLobby.send(0x5310,new BinaryWriter().u32(this.state.profile!.pid).u8(this.state.areaBlock).u8(1).bytes());
      this.lobby = null; oldLobby.close();
      await this.drainAccount(account); current();
      this.pendingPosition = null; this.myRoomPosition = null; this.state.players = []; this.state.areas = []; this.state.npcs = []; this.state.rooms = [];
      this.listPlayers = []; this.listNpcs = []; this.listRooms = [];
      this.joiningRoomKind = target === 'my-room' ? 12 : this.state.servers.find(server=>server.port-(this.options.portOffset??0)===destination.port)?.roomKind ?? 14;
      const channel = await this.gateway.open(destination.port); current(); this.lobby = channel;
      await this.authenticate(channel); current();
      checkResult(await channel.request(0x4100,Uint8Array.of(this.options.language??1,slot),0x4101),'Character lobby'); current();
      await channel.request(0x4200,EMPTY(),0x4201); current();
      const useDefaultArea = target === 'world' && destination.area === null;
      const area = target === 'my-room' || useDefaultArea ? this.state.areas[0] : this.state.areas.find(area=>area.area===destination.area);
      if (!area) throw new Error('Destination area was not advertised by the selected lobby');
      await channel.request(0x4202,Uint8Array.of(useDefaultArea?0:area.block,target==='my-room'||useDefaultArea?0:1),0x4213); current();
      const character = this.state.characters.find(character=>character.slot===slot)!;
      if (target === 'world') this.state.appearanceWorld = this.state.area>=4&&this.state.area<=7 ? 1 : 0;
      const worlds:(0|1)[] = target === 'my-room' ? [this.state.appearanceWorld===0?1:0,this.state.appearanceWorld] : [this.state.appearanceWorld];
      for (const world of worlds) { await channel.request(0x4170,new BinaryWriter().u32(world).raw(characterAppearance(character,world)).u32(0).bytes(),0x4171); current(); }
      await channel.request(0x4214,EMPTY(),0x4217); current();
      if (target === 'world') { await this.refreshNpcs(); current(); }
      await this.refreshRooms(); current();
      this.state.location = target;
      if (target === 'world') { this.cachedWorld = {port:destination.port,area:this.state.area}; this.state.returnArea = this.state.area; }
      this.state.lobbyTransition = null; this.phase('lobby');
    }).catch(error => {
      if (!this.disposed && this.lobbyEpoch === epoch) { this.state.lobbyTransition = null; this.report(error); }
      throw error;
    }).finally(() => { if (this.lobbyMove === move) this.lobbyMove = null; });
    this.emit(); return move.promise;
  }
  sendLobby(id: number, data: Uint8Array = EMPTY()): void { this.requireLobby().send(id, data); }
  sendDuel(id: number, data: Uint8Array = EMPTY()): void {
    if (this.state.relay && !this.state.relay.canAct && [0x6350,0x6423,0x6432,0x6351].includes(id)) throw new Error('Only the active relay pilot can submit duel actions');
    if (this.state.spectating && ![0x0005,0x6702,0x6703].includes(id)) throw new Error('Spectators cannot submit duel actions');
    if (!this.duel || this.duel.closed) throw new Error('Duel channel is unavailable'); this.duel.send(id, data); }
  private requireLobby(): Channel { this.assertLive(); if (!this.lobby || this.lobby.closed) throw new Error('Join the lobby first'); return this.lobby; }
  async startNpcDuel(npcId: number, deck: DuelDeck): Promise<void> {
    if (this.state.matchmaking.status === 'searching') throw new Error('Cancel the automatic opponent search first');
    if (this.options.freeMode) throw new Error('NPC duels are unavailable in free mode');
    if (!this.state.npcs.some((n) => n.id === npcId)) throw new Error('Unknown NPC');
    const lobby = this.requireLobby(); this.roomStyle = 3; this.pendingNpc = true; this.phase('preparing-duel');
    const ready = lobby.waitFor(0x4306);
    const payload = new BinaryWriter().u8(3).u8(0).u8(0).u8(0).raw(new Uint8Array(16)).u8(0).u8(1).u8(1).u8(1).u32(npcId).bytes();
    try { checkResult(await lobby.request(0x4288, payload, 0x428a), 'NPC duel'); await this.attachDuel((await ready).data, deck); }
    catch (error) { void ready.catch(() => {}); this.report(error); throw error; }
    finally { this.pendingNpc = false; }
  }
  async createDuelRoom(options: DuelRoomOptions = {}): Promise<void> {
    if (this.state.matchmaking.status === 'searching') throw new Error('Cancel the automatic opponent search first');
    const password = options.password ?? '';
    if (password.length > 16 || password.includes('\0') || [...password].some(c => c.charCodeAt(0) > 255)) throw new Error('Room password must contain at most 16 Latin-1 characters');
    const style = options.style ?? 3, mode = options.mode ?? 0;
    if (![3,4].includes(style) || !Number.isInteger(mode) || mode < 0 || mode > 255) throw new Error('Invalid duel room settings');
    const payload = new BinaryWriter().u8(style).u8(mode).u8(0).u8(password ? 1 : 0).raw(password ? md5(new BinaryWriter().s(password,password.length).bytes()) : new Uint8Array(16)).u8(0)
      .u8(options.allowSurrender === false ? 0 : 1).u8(options.timeLimit === false ? 0 : 1).u8(options.allowWatch === false ? 0 : 1).u32(0).bytes();
    checkResult(await this.requireLobby().request(0x4288,payload,0x428a),'Duel room'); this.roomStyle = style; await this.refreshRooms();
  }
  async startMatchmaking(options: MatchmakingOptions = {}): Promise<void> {
    const lobby = this.requireLobby(), style = options.style ?? 3;
    if (style === 4) throw new Error('Automatic MATCH pairing is not supported by the current server; create a Match room instead');
    if (![3,6].includes(style)) throw new Error('Invalid automatic duel style');
    if (this.state.phase !== 'lobby' || this.state.duelOffer || this.duel && !this.duel.closed) throw new Error('Return to the lobby before finding an opponent');
    const similarLevel = options.similarLevel !== false;
    const payload = new BinaryWriter().u8(style).u8(0).u8(1).u8(0).raw(new Uint8Array(16)).u8(0)
      .u8(options.allowSurrender === false ? 0 : 1).u8(options.timeLimit === false ? 0 : 1).u8(similarLevel ? 1 : 0).u32(0).bytes();
    if (this.pendingMatchmaking) throw new Error('An automatic duel search request is already pending');
    this.pendingMatchmaking = true; this.state.matchmaking = { ...this.state.matchmaking,opponent:null };
    try {
      checkResult(await lobby.request(0x4288,payload,0x428a),'Automatic duel'); this.roomStyle = 3;
      this.state.matchmaking = { ...this.state.matchmaking,status:this.state.matchmaking.status === 'matched' ? 'matched' : 'searching',style:style as 3|6,similarLevel };
      await this.refreshRooms(); this.emit();
    } finally { this.pendingMatchmaking = false; }
  }
  async cancelMatchmaking(): Promise<void> {
    if (this.state.matchmaking.status === 'matched' || this.state.duelOffer) throw new Error('An opponent has already been found');
    if (this.state.matchmaking.status !== 'searching') return;
    await this.deleteDuelRoom();
    if (this.state.duelOffer || (this.state.matchmaking.status as string) === 'matched') throw new Error('An opponent was found before cancellation completed');
    this.state.matchmaking = { ...this.state.matchmaking,status:'idle',opponent:null }; this.emit();
  }
  async refreshMatchmaking(): Promise<void> { await this.refreshRooms(); }
  /** Existing 42a0 reset/retry request; the server makes another pairing attempt after its normal delay. */
  async retryMatchmaking(): Promise<void> {
    if (this.state.matchmaking.status !== 'searching') throw new Error('No automatic duel search is active');
    checkResult(await this.requireLobby().request(0x42a0,EMPTY(),0x42a2),'Automatic duel search'); await this.refreshRooms();
  }
  private updateMatchmakingCounts(): void {
    const waiting = this.state.rooms.filter(room => room.state === 1 && !room.opponent);
    let status = this.state.matchmaking.status;
    if (status === 'searching' && !this.pendingMatchmaking) {
      const own = this.state.rooms.find(room => room.owner === this.state.profile?.pid && room.state === 1);
      if (own?.opponent) status = 'matched'; else if (!own && !this.state.duelOffer) status = 'idle';
    }
    this.state.matchmaking = { ...this.state.matchmaking,status,counts:{ single:waiting.filter(room => room.style === 3).length,match:waiting.filter(room => room.style === 4).length,either:waiting.filter(room => room.style === 6).length } };
  }
  async deleteDuelRoom(): Promise<void> {
    checkResult(await this.requireLobby().request(0x4290,EMPTY(),0x4292),'Duel room removal'); await this.refreshRooms();
  }
  challengeRoom(roomId: number, password = ''): void {
    if (this.state.matchmaking.status === 'searching') throw new Error('Cancel the automatic opponent search first');
    if (!Number.isInteger(roomId) || roomId <= 0 || roomId > 0xffffffff || password.length > 16 || password.includes('\0') || [...password].some(c => c.charCodeAt(0) > 255)) throw new Error('Invalid room challenge');
    const lobby = this.requireLobby(); this.roomStyle = this.state.rooms.find(room => room.id === roomId)?.style ?? 3; this.state.outgoingChallengeRoom = roomId;
    lobby.send(0x4300,new BinaryWriter().u32(roomId).raw(md5(new BinaryWriter().s(password,password.length).bytes())).bytes()); this.emit();
  }
  replyToChallenge(accept: boolean): void {
    if (!this.state.challenge) throw new Error('No duel challenge is waiting');
    this.requireLobby().send(0x4303,new BinaryWriter().u32(accept ? 1 : 0).bytes());
    this.state.challenge = null; this.emit();
  }
  async cancelChallenge(): Promise<void> {
    checkResult(await this.requireLobby().request(0x4304,EMPTY(),0x4309),'Duel challenge cancellation');
    this.state.outgoingChallengeRoom = null; this.emit();
  }
  async acceptDuelOffer(deck: DuelDeck): Promise<void> {
    const offer = this.state.duelOffer; if (!offer) throw new Error('No duel reservation is waiting');
    this.phase('preparing-duel'); await this.attachDuel(offer.address,deck);
  }
  async watchDuel(pid: number): Promise<void> {
    if (this.state.matchmaking.status === 'searching') throw new Error('Cancel the automatic opponent search first');
    if (!Number.isInteger(pid) || pid <= 0 || pid > 0xffffffff) throw new Error('Invalid spectator target');
    if (this.duel && !this.duel.closed) throw new Error('Finish the current duel before spectating');
    const lobby = this.requireLobby(); this.phase('preparing-duel');
    try {
      const result = await lobby.request(0x4320,new BinaryWriter().u32(pid).bytes(),0x4321);
      checkResult(result,'Spectating'); const address = new BinaryReader(result.data.subarray(4)); address.s(15);
      const port = address.u16() - (this.options.portOffset ?? 0);
      this.state.spectating = true; this.state.relay = null; this.state.duelRole = 'spectator'; this.state.match = null; this.state.duelFirst = null; this.state.duelOffer = null;
      this.duel = await this.gateway.open(port);
      if (this.options.freeMode) this.duel.send(0xca10,Uint8Array.of(1));
      await this.duel.request(0x6700,EMPTY(),0x6006);
      this.phase('duel'); this.requestWatchBatch();
      this.watchTimer = setInterval(() => {
        try { if (this.gateway.status === 'connected' && this.duel && !this.duel.closed) this.requestWatchBatch(); }
        catch (error) { this.stopWatchPolling(); this.report(error); }
      },1000);
    } catch (error) { this.stopWatchPolling(); this.report(error); throw error; }
  }
  requestWatchBatch(): void {
    if (!this.state.spectating || !this.duel || this.duel.closed) throw new Error('No spectator stream is active');
    this.duel.send(0x6702);
  }
  private stopWatchPolling(): void { if (this.watchTimer) clearInterval(this.watchTimer); this.watchTimer = null; }
  async attachDuel(address: Uint8Array, deck: DuelDeck): Promise<void> {
    this.assertLive(); const addressReader = new BinaryReader(address); addressReader.s(15); const port = addressReader.u16() - (this.options.portOffset ?? 0);
    if (!this.state.profile) throw new Error('No selected character');
    validateDuelDeck(deck);
    this.state.relay = null; this.state.duelRole = 'player';
    this.stopWatchPolling(); this.state.spectating = false; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null;
    this.state.match = this.roomStyle === 4 ? { round:1, scores:[0,0,0], stage:'preparing', chooser:null, complete:false, sideboardDeadline:null, original:copyDeck(deck), deck:copyDeck(deck) } : null;
    const previous = this.duel; this.duel = null; previous?.close();
    this.duel = await this.gateway.open(port);
    if (this.options.freeMode) this.duel.send(0xca10, Uint8Array.of(1));
    // A relay partner receives buffered preparation immediately on attach, before 6007.
    const prepared = this.duel.waitFor(0x6005); void prepared.catch(() => {});
    const booked = await this.duel.request(0x6001, new BinaryWriter().u32(this.state.profile.pid).bytes(), 0x6007);
    if (new BinaryReader(booked.data).i32() !== 1) throw new Error('Duel reservation refused');
    this.uploadDeck(deck);
    this.duel.send(0x600b); await prepared;
    this.state.duelFirst = null; this.state.opponentHand = null; this.state.rpsLost = false;
    // Relay partners share the captain's preparation but do not participate in RPS.
    // The relay starts once all four seats are ready (tagRelay.ts READY); the captain's placement choice is the team's.
    if ((this.state.duelRole as string) === 'partner') { this.sendDuel(0x61fe, Uint8Array.of(1)); this.phase('preparing-duel'); return; }
    await this.duel.request(0x6100, EMPTY(), 0x6100); this.phase('rock-paper-scissors');
  }
  private uploadDeck(deck: DuelDeck): void {
    this.sendDuel(0x6600, new BinaryWriter().u32(deck.main.length).u32(0).u32(deck.extra.length).bytes());
    this.sendDuel(0x6601, new BinaryWriter().u32(deck.main.length).raw(new BinaryWriterCards(deck.main).bytes()).bytes());
    this.sendDuel(0x6603, new BinaryWriter().u32(deck.extra.length).raw(new BinaryWriterCards(deck.extra).bytes()).bytes());
  }
  /** Continue a MATCH on its existing reservation. Side cards stay local, as in the legacy protocol. */
  async submitSideboard(deck: DuelDeck): Promise<void> {
    const match = this.state.match, duel = this.duel;
    if (!match || match.complete || match.stage !== 'sideboarding' || !duel || duel.closed || this.submittingSideboard) throw new Error('Sideboarding is unavailable');
    if (this.gateway.status !== 'connected') throw new Error('Wait for the connection to resume before submitting the sideboard');
    validateSideboard(match.original,deck);
    this.submittingSideboard = true;
    this.state.duelFirst = null; this.state.opponentHand = null; this.state.rpsLost = false; this.state.error = null;
    try {
      this.uploadDeck(deck);
      await duel.request(0x6100,EMPTY(),0x6100);
      if (!this.state.match || this.state.match.complete || this.disposed) throw new Error('The match ended while preparing the next game');
      // Commit only after server acknowledgement. Uploads overwrite the same next-game deck,
      // so a timed-out request can be retried after tunnel resume without advancing a round twice.
      if (match.chooser !== null) duel.send(0x6102);
      this.state.match = { ...this.state.match, round:match.round + 1, stage:'preparing', deck:copyDeck(deck), sideboardDeadline:null };
      this.phase('preparing-duel');
      if (match.chooser === null) this.phase('rock-paper-scissors');
      else {
        if (match.chooser) this.phase('choose-first');
        else this.emit();
      }
    } finally { this.submittingSideboard = false; }
  }
  async chooseHand(hand: number): Promise<'draw' | 'win' | 'lose'> {
    if (![0, 1, 2].includes(hand) || this.state.phase !== 'rock-paper-scissors' || !this.duel) throw new Error('Rock-paper-scissors is unavailable');
    const result = await this.duel.request(0x6101, Uint8Array.of(hand), 0x6101);
    if (result.data.length < 2) throw new Error('Invalid rock-paper-scissors result');
    const rival = result.data[1], delta = (rival - hand + 3) % 3;
    this.state.opponentHand = rival;
    // The loser waits for the winner's turn-order choice; another hand would be a request the server never answers.
    this.state.rpsLost = delta === 2;
    if (delta === 0) { this.emit(); return 'draw'; }
    this.duel.send(0x6102);
    if (delta === 1) this.phase('choose-first'); else this.emit();
    return delta === 1 ? 'win' : 'lose';
  }
  async chooseFirst(first: boolean): Promise<void> {
    if (this.state.phase !== 'choose-first' || !this.duel) throw new Error('First player choice is unavailable');
    await this.duel.request(0x6103, Uint8Array.of(first ? 0 : 1), 0x6103);
  }
  beginDuel(manualPlacement = true): void { if (this.state.spectating) throw new Error('Spectator duel is already running'); this.sendDuel(0x61fe, Uint8Array.of(manualPlacement ? 1 : 0)); if (this.state.match) this.state.match = { ...this.state.match,stage:'playing' }; this.phase('duel'); }
  async finishDuel(): Promise<void> {
    if (this.state.match && !this.state.match.complete) throw new Error('Complete the match before returning to the lobby');
    this.stopWatchPolling(); this.state.spectating = false; this.state.relay = null; this.state.duelRole = 'player'; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null;
    const duel = this.duel; this.duel = null; duel?.close();
    this.state.duelFirst = null; this.state.opponentHand = null; this.state.rpsLost = false;
    this.state.matchmaking = { ...this.state.matchmaking,status:'idle',opponent:null };
    const lobby = this.requireLobby();
    await lobby.request(0x4210, EMPTY(), 0x4213); await lobby.request(0x4214, EMPTY(), 0x4217); await this.refreshRooms(); this.phase('lobby');
  }
  private receive(channel: Channel, message: WireMessage): void {
    const { id, data } = message;
    if (id === 0x2003) this.state.servers.push(...decodeServers(data));
    else if (id === 0x3012) this.state.characters = decodeCharacters(data);
    else if (channel === this.lobby && id === 0x4306) {
      const r = new BinaryReader(data), host = r.s(15), port = r.u16();
      this.state.duelOffer = { host, port, address: data.slice(), source: this.pendingNpc ? 'npc' : 'pvp' };
      if (!this.pendingNpc && (this.pendingMatchmaking || this.state.matchmaking.status === 'searching')) this.state.matchmaking = { ...this.state.matchmaking,status:'matched' };
      this.state.challenge = null; this.state.outgoingChallengeRoom = null;
      this.options.onDuelOffer?.(this.state.duelOffer);
    } else if (channel === this.lobby && id === 0x43a0 && data.length === 42) {
      if (this.pendingNpc || !this.pendingMatchmaking && !['searching','matched'].includes(this.state.matchmaking.status)) return;
      const r = new BinaryReader(data), pid = r.u32(), name = r.s(16), level = r.u8(), title = r.u16(); r.u16();
      this.state.matchmaking = { ...this.state.matchmaking,opponent:{ pid,name,level,title,parts:r.bytes(16) } };
    } else if (channel === this.lobby && id === 0x4302) {
      const r = new BinaryReader(data), pid = r.u32(), name = r.s(16); r.u8();
      const level = r.u8(), title = r.u16(); r.u16(); this.state.challenge = { pid, name, level, title, parts:r.bytes(16) };
    } else if (channel === this.lobby && [0x4305,0x4308].includes(id)) this.state.challenge = null;
    else if (channel === this.lobby && id === 0x4301) {
      const code = new BinaryReader(data).i32();
      if (code !== 0) { this.state.outgoingChallengeRoom = null; this.state.error = `Duel challenge refused (${code})`; }
    } else if (channel === this.account && id === 0x3114) {
      if (data.length !== 128) throw new Error('Invalid 128-byte player ownership snapshot');
      if (!this.acceptsRightsSnapshot(channel)) return; this.state.pbin = data.slice();
    } else if (channel === this.account && id === 0x4234) {
      if (data.length !== 512) throw new Error('Invalid 512-byte NPC progression snapshot');
      if (!this.acceptsRightsSnapshot(channel)) return; this.state.npcbin = data.slice();
    } else if (id === 0x3101) this.trunk = new Map();
    else if (id === 0x3102) {
      if (data.length % 5) throw new Error('Invalid card collection');
      const r = new BinaryReader(data); while (r.remaining) this.trunk.set(r.u32(), r.u8());
    } else if (id === 0x3103) this.state.collection = new Map(this.trunk);
    else if (id === 0x4101) {
      const r = new BinaryReader(data); if (r.i32() !== 0) return;
      const pid = r.u32(); r.u32(); r.u16(); r.u32(); r.u32(); r.u32();
      this.state.profile = { pid, level: r.u8(), score: r.u32(), mp: r.u32() };
    } else if (id === 0x4140 && this.state.profile) {
      const r = new BinaryReader(data); this.state.profile = { ...this.state.profile, level: r.u8(), score: r.u32(), mp: r.u32() };
    } else if (id === 0x4201) {
      const r = new BinaryReader(data); r.u16();
      this.state.areas = parseRows(r.bytes(r.remaining), 5, (entry) => {
        const population = entry.u16(), area = entry.u8(), kind = entry.u8(), block = entry.u8();
        return { population, area:this.joiningRoomKind === 12 ? 8 : area, kind, block };
      });
    } else if (id === 0x4203) {
      const r = new BinaryReader(data); if (r.i32() !== 0) throw new Error('Area entry refused');
      this.state.areaBlock = r.u8(); const announced = r.u8();
      this.state.area = this.joiningRoomKind === 12 ? 8 : this.state.areas.find((entry) => entry.block === this.state.areaBlock)?.area ?? announced;
    } else if (id === 0x4211) this.listPlayers = [];
    else if (id === 0x4212) this.listPlayers.push(...decodePlayers(data));
    else if (id === 0x4213) this.state.players = this.listPlayers.slice();
    else if (id === 0x4216) {
      const r = new BinaryReader(data);
      while (r.remaining) {
        const pid = r.u32(), state = r.u8(), parts = r.bytes(16), x = r.u16(), y = r.u16(), direction = r.u8();
        if (state >= 0x67 && state <= 0x6a) r.bytes(23);
        const position = pid === this.state.profile?.pid && this.joiningRoomKind === 12 ? this.myRoomPosition ?? {x,y,direction} : {x,y,direction};
        this.state.players = this.state.players.map((player) => player.pid === pid ? { ...player, state, parts, ...position } : player);
      }
    } else if (id === 0x3112 && data.length >= 6) {
      const r = new BinaryReader(data), pid = r.u32(), operation = r.u8(), areaBlock = r.u8();
      if (operation === 0) this.state.players = this.state.players.filter((player) => player.pid !== pid);
      else if (operation === 1 && r.remaining >= 36) {
        const [player] = decodePlayers(r.bytes(36)); player.areaBlock = areaBlock;
        if (r.remaining >= 22) {
          player.state = r.u8(); player.parts = r.bytes(16); player.x = r.u16(); player.y = r.u16(); player.direction = r.u8();
        }
        this.state.players = [...this.state.players.filter((p) => p.pid !== pid), player];
      }
    }
    else if (id === 0x4231) this.listNpcs = [];
    else if (id === 0x4232) this.listNpcs.push(...decodeNpcs(data));
    else if (id === 0x4233) this.state.npcs = this.listNpcs.slice();
    else if (id === 0x4282) this.listRooms = [];
    else if (id === 0x4284) this.listRooms.push(...decodeRooms(data));
    else if (id === 0x4286) { this.state.rooms = this.listRooms.slice(); this.updateMatchmakingCounts(); }
    else if (id === 0x3113) {
      for (const room of decodeRooms(data)) this.state.rooms = [...this.state.rooms.filter((r) => r.id !== room.id), ...(room.owner ? [room] : [])];
      this.updateMatchmakingCounts();
    } else if (id === 0x5300 && data.length === 10) {
      const r = new BinaryReader(data), pid = r.u32(), x = r.u16(), y = r.u16(), direction = r.u8();
      if (pid === this.state.profile?.pid && this.pendingPosition) {
        const pending = this.pendingPosition;
        if (x !== pending.x || y !== pending.y || direction !== pending.direction) return;
        this.pendingPosition = null;
      }
      this.state.players = this.state.players.map((p) => p.pid === pid ? { ...p, x, y, direction } : p);
    } else if (channel === this.duel && id === 0x600c && data.length === 168 && this.state.profile) {
      const r = new BinaryReader(data.subarray(32));
      this.state.duelRole = [r.u32(),r.u32()].includes(this.state.profile.pid) ? 'player' : 'partner';
      if (this.state.duelRole === 'partner') this.state.match = null;
    } else if (id === 0x4402 && data.length >= 27) {
      const r = new BinaryReader(data); r.u8(); const channel = r.u8(), pid = r.u32(); r.u32(); const name = r.s(16), text = latin1(r.bytes(r.remaining));
      if (channel === 10 && pid === 0) {
        const relay = decodeRelayIdentity(text); if (!relay) return; this.state.relay = relay; this.state.match = null;
        // Identities go out when all four seats are ready: the partner's duel has begun.
        if (this.state.duelRole === 'partner' && this.state.phase === 'preparing-duel' && this.duel && !this.duel.closed) this.state.phase = 'duel';
      } else this.state.chat = [...this.state.chat.slice(-199), { channel, pid, name, text }];
    } else if (channel === this.duel && id === 0x6701 && data.length >= 3) {
      this.state.duelFirst = data[2];
    } else if (channel === this.duel && id === 0x6103 && data.length) {
      this.state.duelFirst = data[0];
    } else if (channel === this.duel && id === 0x6613 && this.state.match) {
      if (data.length !== 36) throw new Error('Invalid match score');
      const r = new BinaryReader(data);
      this.state.match = { ...this.state.match, scores:[r.u32(),r.u32(),r.u32()] };
    } else if (channel === this.duel && id === 0x6202 && this.state.match) {
      if (data.length % 43) throw new Error('Invalid duel command record');
      let finished = false;
      for (let offset = 0; offset < data.length; offset += 43) {
        const r = new BinaryReader(data.subarray(offset,offset + 43));
        if (r.u32() !== 0x4d) continue;
        r.u32(); const result = r.u32();
        this.state.match = { ...this.state.match, stage:this.state.match.complete ? 'complete' : 'sideboarding', chooser:result === 3 ? null : result === 2 };
        finished = true;
      }
      if (!finished) return;
      if (!this.state.match.complete) this.state.phase = 'sideboarding';
    } else if (channel === this.duel && id === 0x6461 && this.state.match && data.length >= 6 && data[0] === 3) {
      const r = new BinaryReader(data); r.u8(); const seconds = r.i32(), paused = r.u8();
      this.state.match = { ...this.state.match, sideboardDeadline:paused ? null : Date.now() + Math.max(0,seconds) * 1000 };
    } else if (channel === this.lobby && id === 0x4800 && this.state.match) {
      this.state.match = { ...this.state.match,stage:'complete',complete:true,sideboardDeadline:null };
    } else if (id === 0x649b && data[0] === 1) this.state.error = 'The server rejected this deck or duel action';
    else return; // Duel packets are emitted by the duel model; avoid a redundant session render for each command.
    this.emit();
  }
  private report(error: unknown): void { this.state.error = error instanceof Error ? error.message : String(error); this.phase('error'); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.lobbyEpoch++; this.lobbyMove = null; this.accountPing = null; this.state.lobbyTransition = null; this.rightsEpoch++; this.rightsRefresh = null; this.rightsInFlight = null; this.rightsNeedsBarrier = true; this.stopWatchPolling();
    if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null;
    // Goodbye before closing clears the server's 90-second "already in use" lease on intentional exits.
    for (const channel of [this.account, this.lobby, this.duel]) try { channel?.close(); } catch { /* transport already gone */ }
    this.gateway.dispose(); this.account = null; this.lobby = null; this.duel = null;
    this.state.pbin = undefined; this.state.npcbin = undefined;
    this.trunk.clear(); this.state.collection = new Map(); this.state.players = []; this.state.npcs = []; this.state.rooms = []; this.state.chat = []; this.state.characters = []; this.state.servers = []; this.state.areas = [];
    this.pendingPosition = null; this.myRoomPosition = null; this.cachedWorld = null; this.state.returnArea = null; this.state.selectedSlot = null; this.state.profile = null; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null; this.state.spectating = false; this.state.match = null; this.state.relay = null; this.state.duelRole = 'player'; this.state.matchmaking = { ...this.state.matchmaking,status:'idle',opponent:null,counts:{single:0,match:0,either:0} };
    this.listPlayers = []; this.listNpcs = []; this.listRooms = []; this.state.phase = 'closed';
  }
}
class BinaryWriterCards extends BinaryWriter { constructor(cards: number[]) { super(); for (const card of cards) this.u32(card); } }

const copyDeck = (deck: DuelDeck): DuelDeck => ({ main:[...deck.main],extra:[...deck.extra],side:[...(deck.side ?? [])] });
function validateDuelDeck(deck: DuelDeck): void {
  if (deck.main.length > 80 || deck.extra.length > 30 || (deck.side?.length ?? 0) > 15 || ![...deck.main,...deck.extra,...(deck.side ?? [])].every(n => Number.isInteger(n) && n > 0 && n < 0xffffff00)) throw new Error('Invalid duel deck');
}
/** The 2008 editor permits Main/Side swaps; Fusion/Extra cards remain in Extra. */
export function validateSideboard(original: DuelDeck, deck: DuelDeck): void {
  validateDuelDeck(deck);
  if (deck.main.length !== original.main.length || deck.extra.length !== original.extra.length || (deck.side?.length ?? 0) !== (original.side?.length ?? 0)) throw new Error('Sideboarding must preserve Main, Side and Extra card counts');
  const key = (cards: number[]) => [...cards].sort((a,b) => a-b).join(',');
  if (key(deck.extra) !== key(original.extra) || key([...deck.main,...(deck.side ?? [])]) !== key([...original.main,...(original.side ?? [])])) throw new Error('Sideboarding must preserve the original card pool and Extra deck');
}

/** Server-reserved chat channel 10 carries TAG1 identities; never accept public chat as pilot authority. */
export function decodeRelayIdentity(text: string): RelayState | null {
  if (!/^TAG1:[0-9a-f]{422}$/i.test(text)) return null;
  const bytes = Uint8Array.from(text.slice(5).match(/../g)!,pair => parseInt(pair,16));
  const r = new BinaryReader(bytes), own = r.u8(), rival = r.u8(), self = r.u8();
  if (own > 1 || rival > 1 || ![0,1,255].includes(self)) return null;
  const players: RelayPlayer[] = [];
  for (let i = 0; i < 4; i++) players.push({ pid:r.u32(),name:r.s(16),avatarA:r.bytes(16),avatarB:r.bytes(16) });
  if (new Set(players.map(p => p.pid)).size !== 4 || players.some(p => !p.pid)) return null;
  return { active:[own as 0|1,rival as 0|1],self:self as 0|1|255,players,canAct:self !== 255 && own === self };
}

/** CAvatarData::setDefault initializes native new-character looks (yo2AvatarData.cpp:18).
 * Empty account-list slots are zero-filled by the server; preserve every nonempty custom appearance verbatim.
 */
function characterAppearance(character: Character, world: 0 | 1): Uint8Array {
  const parts = world ? character.avatarB : character.avatarA;
  return parts.some(byte => byte !== 0) ? parts : defaultAvatar(0,world);
}
