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
export type SessionPhase = 'idle' | 'connecting' | 'characters' | 'loading-character' | 'lobby' | 'preparing-duel' | 'rock-paper-scissors' | 'choose-first' | 'duel' | 'error' | 'closed';
export interface SessionState {
  phase: SessionPhase; connection: GatewayStatus; characters: Character[]; servers: ServerEntry[];
  selectedSlot: number | null; profile: SessionProfile | null; collection: ReadonlyMap<number, number>;
  players: Player[]; areas: Area[]; npcs: Npc[]; rooms: DuelRoom[]; chat: SessionChat[]; area: number; areaBlock: number;
  duelOffer: DuelOffer | null; challenge: DuelChallenge | null; outgoingChallengeRoom: number | null; spectating: boolean;
  duelFirst: number | null; opponentHand: number | null; error: string | null;
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
const EMPTY = () => new Uint8Array(0);
const checkResult = (message: WireMessage, label: string): void => {
  const result = new BinaryReader(message.data).i32();
  if (result !== 0) throw new Error(`${label} refused (${result})`);
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
    phase: 'idle', connection: 'idle', characters: [], servers: [], selectedSlot: null, profile: null,
    collection: new Map(), players: [], areas: [], npcs: [], rooms: [], chat: [], area: 0, areaBlock: 0,
    duelOffer: null, challenge: null, outgoingChallengeRoom: null, spectating: false,
    duelFirst: null, opponentHand: null, error: null,
  };
  account: Channel | null = null;
  lobby: Channel | null = null;
  duel: Channel | null = null;
  private disposed = false;
  private pendingNpc = false;
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
    if (!name.trim() || name.length > 16 || name.includes('\0') || [...name].some((c) => c.charCodeAt(0) > 255)) throw new Error('Character name must contain 1–16 Latin-1 characters');
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
    this.phase('loading-character'); this.state.selectedSlot = slot;
    try {
      await this.account.request(0x3100, Uint8Array.of(slot), 0x3103);
      await this.account.request(0x3114, Uint8Array.of(slot), 0x4234);
      const advertised = this.state.servers.find((s) => s.kind === 3 && s.roomKind === 14 && s.language === 6)
        ?? this.state.servers.find((s) => s.kind === 3 && s.roomKind === 14)
        ?? this.state.servers.find((s) => s.kind === 3 && s.roomKind !== 12);
      const port = roomPort ?? (advertised ? advertised.port - (this.options.portOffset ?? 0) : undefined);
      if (port === undefined) throw new Error('Server did not advertise a playable room');
      this.lobby = await this.gateway.open(port); await this.authenticate(this.lobby);
      checkResult(await this.lobby.request(0x4100, Uint8Array.of(this.options.language ?? 1, slot), 0x4101), 'Character selection');
      await this.lobby.request(0x4200, EMPTY(), 0x4201);
      await this.lobby.request(0x4202, Uint8Array.of(0, 0), 0x4213);
      const world = this.state.area >= 4 && this.state.area <= 7 ? 1 : 0;
      await this.lobby.request(0x4170, new BinaryWriter().u32(world).raw(world ? character.avatarB : character.avatarA).u32(0).bytes(), 0x4171);
      await this.lobby.request(0x4214, EMPTY(), 0x4217);
      await this.refreshNpcs(); await this.refreshRooms();
      this.phase('lobby');
    } catch (error) { this.report(error); throw error; }
  }
  async refreshCollection(): Promise<void> {
    this.assertLive();
    const channel = this.account;
    if (!channel || channel.closed || this.state.selectedSlot === null) throw new Error('No active character account');
    await channel.request(0x3100, Uint8Array.of(this.state.selectedSlot), 0x3103);
  }
  async refreshNpcs(): Promise<void> { await this.requireLobby().request(0x4230, EMPTY(), 0x4233); }
  async refreshRooms(): Promise<void> { await this.requireLobby().request(0x4280, EMPTY(), 0x4286); }
  move(x: number, y: number, direction = 0): void {
    if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535) || !Number.isInteger(direction) || direction < 0 || direction > 255)
      throw new RangeError('Invalid movement');
    this.requireLobby().send(0x5300, new BinaryWriter().u32(this.state.profile?.pid ?? 0).u16(x).u16(y).u8(direction).u8(0).bytes());
    this.pendingPosition = { x,y,direction };
    this.state.players = this.state.players.map(player => player.pid === this.state.profile?.pid ? { ...player,x,y,direction } : player);
  }
  async enterArea(area: number): Promise<void> {
    const target = this.state.areas.find((entry) => entry.area === area);
    if (!target) throw new RangeError('Unknown area');
    const lobby = this.requireLobby(); this.pendingPosition = null;
    await lobby.request(0x4202, Uint8Array.of(target.block, 1), 0x4213);
    await lobby.request(0x4214, EMPTY(), 0x4217);
    const character = this.state.characters.find((c) => c.slot === this.state.selectedSlot);
    if (character) {
      const world = [4,5,6,7].includes(area) ? 1 : 0;
      await lobby.request(0x4170, new BinaryWriter().u32(world).raw(world ? character.avatarB : character.avatarA).u32(0).bytes(), 0x4171);
    }
    await this.refreshNpcs();
  }
  sendLobby(id: number, data: Uint8Array = EMPTY()): void { this.requireLobby().send(id, data); }
  sendDuel(id: number, data: Uint8Array = EMPTY()): void {
    if (this.state.spectating && ![0x0005,0x6702,0x6703].includes(id)) throw new Error('Spectators cannot submit duel actions');
    if (!this.duel || this.duel.closed) throw new Error('Duel channel is unavailable'); this.duel.send(id, data); }
  private requireLobby(): Channel { this.assertLive(); if (!this.lobby || this.lobby.closed) throw new Error('Join the lobby first'); return this.lobby; }
  async startNpcDuel(npcId: number, deck: DuelDeck): Promise<void> {
    if (this.options.freeMode) throw new Error('NPC duels are unavailable in free mode');
    if (!this.state.npcs.some((n) => n.id === npcId)) throw new Error('Unknown NPC');
    const lobby = this.requireLobby(); this.pendingNpc = true; this.phase('preparing-duel');
    const ready = lobby.waitFor(0x4306);
    const payload = new BinaryWriter().u8(3).u8(0).u8(0).u8(0).raw(new Uint8Array(16)).u8(0).u8(1).u8(1).u8(1).u32(npcId).bytes();
    try { checkResult(await lobby.request(0x4288, payload, 0x428a), 'NPC duel'); await this.attachDuel((await ready).data, deck); }
    catch (error) { void ready.catch(() => {}); this.report(error); throw error; }
    finally { this.pendingNpc = false; }
  }
  async createDuelRoom(options: DuelRoomOptions = {}): Promise<void> {
    const password = options.password ?? '';
    if (password.length > 16 || password.includes('\0') || [...password].some(c => c.charCodeAt(0) > 255)) throw new Error('Room password must contain at most 16 Latin-1 characters');
    const style = options.style ?? 3, mode = options.mode ?? 0;
    if (![3,4].includes(style) || !Number.isInteger(mode) || mode < 0 || mode > 255) throw new Error('Invalid duel room settings');
    const payload = new BinaryWriter().u8(style).u8(mode).u8(0).u8(password ? 1 : 0).raw(password ? md5(new BinaryWriter().s(password,password.length).bytes()) : new Uint8Array(16)).u8(0)
      .u8(options.allowSurrender === false ? 0 : 1).u8(options.timeLimit === false ? 0 : 1).u8(options.allowWatch === false ? 0 : 1).u32(0).bytes();
    checkResult(await this.requireLobby().request(0x4288,payload,0x428a),'Duel room'); await this.refreshRooms();
  }
  async deleteDuelRoom(): Promise<void> {
    checkResult(await this.requireLobby().request(0x4290,EMPTY(),0x4292),'Duel room removal'); await this.refreshRooms();
  }
  challengeRoom(roomId: number, password = ''): void {
    if (!Number.isInteger(roomId) || roomId <= 0 || roomId > 0xffffffff || password.length > 16 || password.includes('\0') || [...password].some(c => c.charCodeAt(0) > 255)) throw new Error('Invalid room challenge');
    const lobby = this.requireLobby(); this.state.outgoingChallengeRoom = roomId;
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
    if (!Number.isInteger(pid) || pid <= 0 || pid > 0xffffffff) throw new Error('Invalid spectator target');
    if (this.duel && !this.duel.closed) throw new Error('Finish the current duel before spectating');
    const lobby = this.requireLobby(); this.phase('preparing-duel');
    try {
      const result = await lobby.request(0x4320,new BinaryWriter().u32(pid).bytes(),0x4321);
      checkResult(result,'Spectating'); const address = new BinaryReader(result.data.subarray(4)); address.s(15);
      const port = address.u16() - (this.options.portOffset ?? 0);
      this.state.spectating = true; this.state.duelFirst = null; this.state.duelOffer = null;
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
    if (deck.main.length > 80 || deck.extra.length > 30 || ![...deck.main, ...deck.extra].every((n) => Number.isInteger(n) && n > 0 && n < 0xffffff00)) throw new Error('Invalid duel deck');
    this.stopWatchPolling(); this.state.spectating = false; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null;
    const previous = this.duel; this.duel = null; previous?.close();
    this.duel = await this.gateway.open(port);
    if (this.options.freeMode) this.duel.send(0xca10, Uint8Array.of(1));
    const booked = await this.duel.request(0x6001, new BinaryWriter().u32(this.state.profile.pid).bytes(), 0x6007);
    if (new BinaryReader(booked.data).i32() !== 1) throw new Error('Duel reservation refused');
    this.duel.send(0x6600, new BinaryWriter().u32(deck.main.length).u32(0).u32(deck.extra.length).bytes());
    this.duel.send(0x6601, new BinaryWriter().u32(deck.main.length).raw(new BinaryWriterCards(deck.main).bytes()).bytes());
    this.duel.send(0x6603, new BinaryWriter().u32(deck.extra.length).raw(new BinaryWriterCards(deck.extra).bytes()).bytes());
    await this.duel.request(0x600b, EMPTY(), 0x6005); await this.duel.request(0x6100, EMPTY(), 0x6100);
    this.state.duelFirst = null; this.state.opponentHand = null; this.phase('rock-paper-scissors');
  }
  async chooseHand(hand: number): Promise<'draw' | 'win' | 'lose'> {
    if (![0, 1, 2].includes(hand) || this.state.phase !== 'rock-paper-scissors' || !this.duel) throw new Error('Rock-paper-scissors is unavailable');
    const result = await this.duel.request(0x6101, Uint8Array.of(hand), 0x6101);
    if (result.data.length < 2) throw new Error('Invalid rock-paper-scissors result');
    const rival = result.data[1], delta = (rival - hand + 3) % 3;
    this.state.opponentHand = rival;
    if (delta === 0) { this.emit(); return 'draw'; }
    this.duel.send(0x6102);
    if (delta === 1) this.phase('choose-first'); else this.emit();
    return delta === 1 ? 'win' : 'lose';
  }
  async chooseFirst(first: boolean): Promise<void> {
    if (this.state.phase !== 'choose-first' || !this.duel) throw new Error('First player choice is unavailable');
    await this.duel.request(0x6103, Uint8Array.of(first ? 0 : 1), 0x6103);
  }
  beginDuel(manualPlacement = true): void { if (this.state.spectating) throw new Error('Spectator duel is already running'); this.sendDuel(0x61fe, Uint8Array.of(manualPlacement ? 1 : 0)); this.phase('duel'); }
  async finishDuel(): Promise<void> {
    this.stopWatchPolling(); this.state.spectating = false; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null;
    const duel = this.duel; this.duel = null; duel?.close();
    this.state.duelFirst = null; this.state.opponentHand = null;
    await this.requireLobby().request(0x4210, EMPTY(), 0x4213); await this.refreshRooms(); this.phase('lobby');
  }
  private receive(channel: Channel, message: WireMessage): void {
    const { id, data } = message;
    if (id === 0x2003) this.state.servers.push(...decodeServers(data));
    else if (id === 0x3012) this.state.characters = decodeCharacters(data);
    else if (channel === this.lobby && id === 0x4306) {
      const r = new BinaryReader(data), host = r.s(15), port = r.u16();
      this.state.duelOffer = { host, port, address: data.slice(), source: this.pendingNpc ? 'npc' : 'pvp' };
      this.state.challenge = null; this.state.outgoingChallengeRoom = null;
      this.options.onDuelOffer?.(this.state.duelOffer);
    } else if (channel === this.lobby && id === 0x4302) {
      const r = new BinaryReader(data), pid = r.u32(), name = r.s(16); r.u8();
      const level = r.u8(), title = r.u16(); r.u16(); this.state.challenge = { pid, name, level, title, parts:r.bytes(16) };
    } else if (channel === this.lobby && [0x4305,0x4308].includes(id)) this.state.challenge = null;
    else if (channel === this.lobby && id === 0x4301) {
      const code = new BinaryReader(data).i32();
      if (code !== 0) { this.state.outgoingChallengeRoom = null; this.state.error = `Duel challenge refused (${code})`; }
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
        return { population, area, kind, block };
      });
    } else if (id === 0x4203) {
      const r = new BinaryReader(data); if (r.i32() !== 0) throw new Error('Area entry refused');
      this.state.areaBlock = r.u8(); const announced = r.u8();
      this.state.area = this.state.areas.find((entry) => entry.block === this.state.areaBlock)?.area ?? announced;
    } else if (id === 0x4211) this.listPlayers = [];
    else if (id === 0x4212) this.listPlayers.push(...decodePlayers(data));
    else if (id === 0x4213) this.state.players = this.listPlayers.slice();
    else if (id === 0x4216) {
      const r = new BinaryReader(data);
      while (r.remaining) {
        const pid = r.u32(), state = r.u8(), parts = r.bytes(16), x = r.u16(), y = r.u16(), direction = r.u8();
        if (state >= 0x67 && state <= 0x6a) r.bytes(23);
        this.state.players = this.state.players.map((player) => player.pid === pid ? { ...player, state, parts, x, y, direction } : player);
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
    else if (id === 0x4286) this.state.rooms = this.listRooms.slice();
    else if (id === 0x3113) {
      for (const room of decodeRooms(data)) this.state.rooms = [...this.state.rooms.filter((r) => r.id !== room.id), ...(room.owner ? [room] : [])];
    } else if (id === 0x5300 && data.length === 10) {
      const r = new BinaryReader(data), pid = r.u32(), x = r.u16(), y = r.u16(), direction = r.u8();
      if (pid === this.state.profile?.pid && this.pendingPosition) {
        const pending = this.pendingPosition;
        if (x !== pending.x || y !== pending.y || direction !== pending.direction) return;
        this.pendingPosition = null;
      }
      this.state.players = this.state.players.map((p) => p.pid === pid ? { ...p, x, y, direction } : p);
    } else if (id === 0x4402 && data.length >= 27) {
      const r = new BinaryReader(data); r.u8(); const channel = r.u8(), pid = r.u32(); r.u32(); const name = r.s(16), text = latin1(r.bytes(r.remaining));
      this.state.chat = [...this.state.chat.slice(-199), { channel, pid, name, text }];
    } else if (channel === this.duel && id === 0x6701 && data.length >= 3) {
      this.state.duelFirst = data[2];
    } else if (channel === this.duel && id === 0x6103 && data.length) {
      this.state.duelFirst = data[0];
    } else if (id === 0x649b) this.state.error = 'The server rejected this deck or duel action';
    else return; // Duel packets are emitted by the duel model; avoid a redundant session render for each command.
    this.emit();
  }
  private report(error: unknown): void { this.state.error = error instanceof Error ? error.message : String(error); this.phase('error'); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.stopWatchPolling();
    if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null;
    // Goodbye before closing clears the server's 90-second "already in use" lease on intentional exits.
    for (const channel of [this.account, this.lobby, this.duel]) try { channel?.close(); } catch { /* transport already gone */ }
    this.gateway.dispose(); this.account = null; this.lobby = null; this.duel = null;
    this.trunk.clear(); this.state.collection = new Map(); this.state.players = []; this.state.npcs = []; this.state.rooms = []; this.state.chat = []; this.state.characters = []; this.state.servers = []; this.state.areas = [];
    this.pendingPosition = null; this.state.selectedSlot = null; this.state.profile = null; this.state.duelOffer = null; this.state.challenge = null; this.state.outgoingChallengeRoom = null; this.state.spectating = false;
    this.listPlayers = []; this.listNpcs = []; this.listRooms = []; this.state.phase = 'closed';
  }
}
class BinaryWriterCards extends BinaryWriter { constructor(cards: number[]) { super(); for (const card of cards) this.u32(card); } }
