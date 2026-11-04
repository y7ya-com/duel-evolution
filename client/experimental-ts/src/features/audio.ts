import { ArchiveReader, normalizeAssetPath } from '../assets/archive';
const rows: readonly (readonly [string, string, boolean])[] = [
  ['title', 'Title', true], ['deck_editor', 'Deck editor', true], ['card_pack', 'Card pack opening', false],
  ['login', 'Login', true], ['my_room', 'My Room', true], ['yugi_area', 'Yugi area', true], ['gx_area', 'GX area', true],
  ['event_lobby', 'Event lobby', true], ['tournament_lobby', 'Tournament lobby', true], ['event', 'Event', true], ['janken', 'Rock-paper-scissors', true],
  ...Array.from({ length: 8 }, (_, i) => [`duel_${i + 1}`, `Duel ${i + 1}`, true] as const),
  ['duel_tournament_1', 'Tournament duel 1', true], ['duel_tournament_2', 'Tournament duel 2', true],
  ['ritual', 'Ritual Summon', false], ['summon_1', 'Summon 1', true], ['summon_2', 'Summon 2', false],
  ['duel_winning', 'Duel: winning', true], ['duel_pinch', 'Duel: pinch', true], ['duel_draw', 'Duel result: draw', false],
  ['duel_lose', 'Duel result: lose', false], ['duel_win', 'Duel result: win', false], ['updater', 'Updater', true],
  ...[['yami', 'Yami'], ['umi', 'Umi'], ['mountain', 'Mountain'], ['sogen', 'Sogen'], ['forest', 'Forest'],
    ['wasteland', 'Wasteland'], ['fusion_gate', 'Fusion Gate'], ['gaia_power', 'Gaia Power'], ['umiiruka', 'Umiiruka'],
    ['luminous_spark', 'Luminous Spark'], ['mystic_plasma_zone', 'Mystic Plasma Zone'], ['rising_air_current', 'Rising Air Current'],
    ['molten_destruction', 'Molten Destruction'], ['chorus_of_sanctuary', 'Chorus of Sanctuary'], ['skyscraper', 'Skyscraper'],
    ['other', 'Other field spells']].map(([id, label]) => [`field_${id}`, `Field: ${label}`, true] as const),
];
export const AUDIO_SLOTS = Object.freeze(rows.map(([id, label, loop], slot) => Object.freeze({ slot, id, label, loop })));
export interface AudioState {
  activated: boolean;
  currentSlot: number;
  music: number;
  sound: number;
  slots: readonly { slot: number; id: string; label: string; loop: boolean; files: readonly string[] }[];
}
export type AudioAction = { type: 'activate' } | { type: 'stop' } | { type: 'play-slot'; slot: number }
  | { type: 'set-slot-files'; slot: number; files: File[] } | { type: 'set-volumes'; music?: number; sound?: number };
export interface BrowserAudioOptions {
  soundArchiveUrl?: string;
  /** Remains caller-owned. */
  archive?: Pick<ArchiveReader, 'read'>;
  audioFactory?: () => HTMLAudioElement;
  contextFactory?: () => AudioContext;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  onError?: (error: unknown) => void;
  maxDecodedBytes?: number;
}
interface Decoded { buffer: AudioBuffer; bytes: number; refs: number; }
interface Voice { source: AudioBufferSourceNode; entry: Decoded; }
const MiB = 1024 * 1024;
const layer = (slot: number): boolean => slot === 24 || slot === 25 || slot >= 30;
export class BrowserAudioManager {
  private readonly files = new Map<number, File[]>();
  private readonly budget: number;
  private archive?: Pick<ArchiveReader, 'read'>;
  private ownedArchive?: ArchiveReader;
  private readonly abort = new AbortController();
  private context?: AudioContext;
  private output?: GainNode;
  private media?: HTMLAudioElement;
  private url?: string;
  private activated = false;
  private closed = false;
  private requested = -1;
  private base = -1;
  private playing = -1;
  private item = 0;
  private musicToken = 0;
  private effectToken = 0;
  private musicVolume = 1;
  private soundVolume = 1;
  private readonly decoded = new Map<string, Decoded>();
  private decodedSize = 0;
  private readonly pending = new Map<string, Promise<Decoded>>();
  private decodeTail: Promise<unknown> = Promise.resolve();
  private readonly voices = new Set<Voice>();
  constructor(private readonly options: BrowserAudioOptions = {}) {
    this.budget = options.maxDecodedBytes ?? 16 * MiB;
    if (!Number.isSafeInteger(this.budget) || this.budget < 1 || this.budget > 64 * MiB) throw new RangeError('Invalid decoded audio budget');
    this.archive = options.archive;
  }
  get currentSlot(): number { return this.requested; }
  get isActivated(): boolean { return this.activated && !this.closed; }
  get volumes(): Readonly<{ music: number; sound: number }> { return { music: this.musicVolume, sound: this.soundVolume }; }
  get decodedBytes(): number { return this.decodedSize; }
  getState(): AudioState {
    return { activated: this.isActivated, currentSlot: this.requested, ...this.volumes,
      slots: AUDIO_SLOTS.map(slot => ({ ...slot, files: (this.files.get(slot.slot) ?? []).map(file => file.name) })) };
  }
  /** Call in the originating event handler so activate keeps browser user activation. */
  async dispatch(action: AudioAction): Promise<void> {
    switch (action.type) {
      case 'activate': await this.activate(); break;
      case 'stop': this.stop(); break;
      case 'play-slot': {
        this.check(); this.checkSlot(action.slot);
        // Select first so activation starts the requested preview, not the previous scene.
        const selected = this.playSlot(action.slot);
        await this.activate(); await selected; break;
      }
      case 'set-slot-files': this.setSlotFiles(action.slot, action.files); break;
      case 'set-volumes': this.setVolumes(action); break;
    }
  }
  getSlotFiles(slot: number): readonly File[] { this.checkSlot(slot); return [...(this.files.get(slot) ?? [])]; }
  private check(): void { if (this.closed) throw new Error('Audio manager disposed'); }
  private checkSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= AUDIO_SLOTS.length) throw new RangeError('Invalid audio slot');
  }
  private report(error: unknown): void { try { this.options.onError?.(error); } catch { /* Reporting cannot break cleanup. */ } }
  /** Invoke directly inside a trusted event handler. No context or playback exists before activation. */
  async activate(): Promise<boolean> {
    this.check();
    try {
      if (!this.context) {
        this.context = this.options.contextFactory?.() ?? new AudioContext();
        this.output = this.context.createGain(); this.output.gain.value = this.soundVolume;
        this.output.connect(this.context.destination);
      }
      // Both resume() and HTMLMediaElement.play() must originate in this gesture,
      // rather than starting the latter after resume's asynchronous completion.
      const resumed = this.context.resume();
      this.activated = true;
      const started = this.updateMusic();
      await resumed;
      if (this.closed) return false;
      this.activated = this.context.state === 'running';
      await started;
      if (!this.activated) this.releaseMusic();
      return this.activated;
    } catch (error) { this.activated = false; this.releaseMusic(); this.report(error); return false; }
  }
  setSlotFiles(slot: number, files: File[]): void {
    this.check(); this.checkSlot(slot);
    if (files.length > 8 || files.some(file => !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * MiB)) throw new RangeError('Audio playlist limit exceeded');
    let count = files.length, bytes = files.reduce((n, file) => n + file.size, 0);
    for (const [other, list] of this.files) if (other !== slot) { count += list.length; bytes += list.reduce((n, file) => n + file.size, 0); }
    if (count > 256 || bytes > 256 * MiB) throw new RangeError('Total audio file limit exceeded');
    if (files.length) this.files.set(slot, [...files]); else this.files.delete(slot);
    if (slot === this.playing) this.releaseMusic();
    void this.updateMusic();
  }
  async playSlot(slot: number): Promise<boolean> {
    this.check(); this.checkSlot(slot);
    if (slot >= 21 && slot <= 23 && !this.files.has(slot)) return this.playing >= 0;
    if (slot === this.requested) return !!this.media && !this.media.paused;
    this.requested = slot;
    if (slot >= 10 && slot <= 20) this.base = slot;
    return this.updateMusic();
  }
  private resolve(): number {
    return this.files.has(this.requested) ? this.requested : this.requested >= 0 && layer(this.requested) && this.files.has(this.base) ? this.base : -1;
  }
  private async updateMusic(): Promise<boolean> {
    if (this.closed) return false;
    const slot = this.resolve();
    if (slot === this.playing && this.media) return !this.media.paused;
    this.releaseMusic();
    if (!this.activated || slot < 0) return false;
    this.playing = slot; this.item = 0;
    return this.startTrack(this.musicToken, 0);
  }
  private async startTrack(token: number, failures: number): Promise<boolean> {
    if (this.closed || token !== this.musicToken) return false;
    const list = this.files.get(this.playing);
    if (!list?.length || failures >= list.length) { this.releaseMusic(); return false; }
    this.releaseMedia();
    let media: HTMLAudioElement;
    try {
      media = this.options.audioFactory?.() ?? new Audio(); this.media = media;
      this.url = (this.options.createObjectURL ?? (file => URL.createObjectURL(file)))(list[this.item]);
      media.preload = 'none'; media.src = this.url; media.loop = AUDIO_SLOTS[this.playing].loop && list.length === 1;
      this.applyMusicVolume();
      media.onended = () => { if (this.media === media) void this.advance(token, 0); };
      media.onerror = () => {
        if (token !== this.musicToken || this.media !== media) return;
        this.report(new Error(`Cannot play local audio: ${list[this.item]?.name ?? 'file'}`));
        void this.advance(token, failures + 1);
      };
      await media.play();
      return !this.closed && token === this.musicToken && this.media === media;
    } catch (error) {
      if (token === this.musicToken && this.media === media!) { this.report(error); this.releaseMusic(); }
      return false;
    }
  }
  private advance(token: number, failures: number): Promise<boolean> {
    if (token !== this.musicToken || this.closed) return Promise.resolve(false);
    const list = this.files.get(this.playing)!;
    this.item++;
    if (this.item >= list.length) {
      if (!AUDIO_SLOTS[this.playing].loop) { this.releaseMusic(); return Promise.resolve(false); }
      this.item = 0;
    }
    return this.startTrack(token, failures);
  }
  private releaseMedia(): void {
    if (this.media) {
      this.media.onended = null; this.media.onerror = null;
      this.media.pause(); this.media.removeAttribute('src'); this.media.load(); this.media = undefined;
    }
    if (this.url) { (this.options.revokeObjectURL ?? (url => URL.revokeObjectURL(url)))(this.url); this.url = undefined; }
  }
  private releaseMusic(): void { ++this.musicToken; this.releaseMedia(); this.playing = -1; }
  setVolumes(volumes: { music?: number; sound?: number }): void {
    this.check();
    for (const value of [volumes.music, volumes.sound]) if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError('Audio volume must be between 0 and 1');
    if (volumes.music !== undefined) this.musicVolume = volumes.music;
    if (volumes.sound !== undefined) this.soundVolume = volumes.sound;
    if (this.output) this.output.gain.value = this.soundVolume;
    this.applyMusicVolume();
  }
  private applyMusicVolume(): void { if (this.media) this.media.volume = this.musicVolume * (this.voices.size && this.soundVolume > 0 ? 0.35 : 1); }
  async playEffect(path: string): Promise<boolean> {
    this.check(); path = normalizeAssetPath(path);
    if (!/^se\/.+\.wav$/.test(path)) throw new Error('Expected an SE/*.wav effect path');
    if (!this.activated || !this.soundVolume || this.context?.state !== 'running' || this.voices.size >= 16) return false;
    const token = this.effectToken;
    try {
      const entry = await this.decodeEffect(path);
      if (this.closed || token !== this.effectToken || !this.soundVolume || this.voices.size >= 16 || this.context?.state !== 'running' || this.decoded.get(path) !== entry) return false;
      const source = this.context.createBufferSource(); source.buffer = entry.buffer; source.connect(this.output!);
      const voice = { source, entry }; entry.refs++; this.voices.add(voice); this.applyMusicVolume();
      source.onended = () => this.releaseVoice(voice);
      try { source.start(); } catch (error) { this.releaseVoice(voice); throw error; }
      return true;
    } catch (error) { if (!this.closed) this.report(error); return false; }
  }
  private decodeEffect(path: string): Promise<Decoded> {
    const cached = this.decoded.get(path);
    if (cached) { this.decoded.delete(path); this.decoded.set(path, cached); return Promise.resolve(cached); }
    const pending = this.pending.get(path); if (pending) return pending;
    if (this.pending.size >= 4) return Promise.reject(new Error('Effect decode queue full'));
    const work = this.decodeTail.then(async () => {
      if (this.closed) throw new Error('Audio manager disposed');
      if (!this.archive && this.options.soundArchiveUrl) {
        this.ownedArchive = new ArchiveReader(this.options.soundArchiveUrl, undefined, { maxEntryBytes: 4 * MiB, maxStoredBytes: 4 * MiB }); this.archive = this.ownedArchive;
      }
      if (!this.archive) throw new Error('No Sound.dat archive configured');
      const bytes = await this.archive.read(path, this.abort.signal);
      if (this.closed) throw new Error('Audio manager disposed');
      if (bytes.byteLength > 4 * MiB) throw new Error('Encoded effect exceeds limit');
      const buffer = await this.context!.decodeAudioData(bytes.slice().buffer);
      if (this.closed) throw new Error('Audio manager disposed');
      const size = buffer.length * buffer.numberOfChannels * 4;
      if (!Number.isSafeInteger(size) || size < 1 || size > Math.min(8 * MiB, this.budget)) throw new Error('Decoded effect exceeds limit');
      for (const [key, entry] of this.decoded) {
        if (this.decodedSize + size <= this.budget) break;
        if (!entry.refs) { this.decoded.delete(key); this.decodedSize -= entry.bytes; }
      }
      if (this.decodedSize + size > this.budget) throw new Error('Decoded audio budget occupied by active effects');
      const entry = { buffer, bytes: size, refs: 0 }; this.decoded.set(path, entry); this.decodedSize += size;
      return entry;
    });
    // The serialization tail must not retain the last decoded AudioBuffer.
    this.decodeTail = work.then(() => undefined, () => undefined); this.pending.set(path, work);
    void work.finally(() => { if (this.pending.get(path) === work) this.pending.delete(path); }).catch(() => {});
    return work;
  }
  private releaseVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null; voice.source.disconnect(); voice.source.buffer = null;
    voice.entry.refs--; this.applyMusicVolume();
  }
  stop(): void {
    if (this.closed) return;
    this.requested = -1; this.base = -1; ++this.effectToken; this.releaseMusic();
    for (const voice of [...this.voices]) { try { voice.source.stop(); } catch { /* Already ended. */ } this.releaseVoice(voice); }
  }
  dispose(): void {
    if (this.closed) return;
    this.stop(); this.closed = true; this.activated = false; this.abort.abort(); this.ownedArchive?.dispose();
    this.files.clear(); this.decoded.clear(); this.decodedSize = 0; this.output?.disconnect();
    if (this.context) void this.context.close().catch(error => this.report(error));
    this.context = undefined; this.output = undefined; this.archive = undefined; this.ownedArchive = undefined;
    this.pending.clear();
  }
}
