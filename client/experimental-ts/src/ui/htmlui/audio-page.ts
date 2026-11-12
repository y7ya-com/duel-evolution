// The Main Menu's Audio window as live has it: main's Audio page (client/recomp/web/audiopage.js, imported in place
// through '@recomp-web', so its commits flow in) over the game frame. On live it drives web/audio.js's Module.yo2Audio
// and web/audiopack.js's Module.yo2AudioPack; here both are shims over the rewrite's audio manager
// (features/audio.ts BrowserAudioManager) and pack reader (features/audio-pack.ts), and Module.canvas is the layer's
// #canvas box (layer.ts), the 1024 x 768 frame the page scales itself to. Writes go through the controller
// ('audioAction'), so the app's view, the saved settings (the master volume is the background audio volume) and the
// stored files follow; reads (the slots' files) come from the manager. The page also takes an audio pack dropped
// anywhere on the game (its own window listeners), as live.
import { AUDIO_SLOTS, type AudioAction, type BrowserAudioManager } from '../../features/audio';
import { AUDIO_FILE, buildAudioPack, fetchAudioPack, isAudioPackItem, readAudioPack, unzip, zip, matchAudioPart, type AudioPackItem, type AudioPackMeta, type AudioPackPlan, type AudioPackSlot } from '../../features/audio-pack';

export interface AudioPageDeps {
  audio: BrowserAudioManager;
  /** The controller's audioAction (ClientApp.dispatch). */
  dispatch(action: AudioAction): void | Promise<void>;
}
type Change = Partial<AudioPackSlot> & { files?: Blob[] };
type Changes = Record<string | number, Change> | readonly (readonly [string | number, Change])[];
interface PageApi { open(): Promise<void>; close(): void }
type ModuleShim = { canvas?: HTMLElement | null; yo2Audio?: unknown; yo2AudioPack?: unknown; rcAudioUI?: PageApi };

const slotOf = (id: string | number): number => {
  const s = typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : AUDIO_SLOTS.findIndex(x => x.id === id);
  if (!(s >= 0 && s < AUDIO_SLOTS.length)) throw new RangeError(`no audio slot ${id}`);
  return s;
};

/** Module.yo2Audio (web/audio.js's API) over the rewrite's manager. */
export function audioShim(d: AudioPageDeps) {
  const a = d.audio;
  const conf = (s: number) => { const v = a.getState().slots[s]!; return { shuffle: !!v.shuffle, loop: v.loop !== false, volume: v.volume ?? 1, files: [...a.getSlotFiles(s)] }; };
  let previewing = -1, before = -1;
  async function setMany(changes: Changes, { replace = false, master }: { replace?: boolean; master?: number; progress?: unknown; strict?: boolean } = {}) {
    const slots: Record<number, AudioPackSlot> = {};
    for (const [k, ch] of Array.isArray(changes) ? changes : Object.entries(changes)) {
      const s = slotOf(k as string | number), c = { ...conf(s), ...ch };
      slots[s] = { files: [...(c.files ?? [])] as File[], shuffle: c.shuffle, loop: c.loop, volume: c.volume };
    }
    await d.dispatch({ type: 'apply-pack', slots, replace, ...(master !== undefined ? { master } : {}) });
    return { failed: [] as { name: string; error: string }[] };
  }
  return {
    ready: a.restore().catch(() => false),
    listSlots: () => AUDIO_SLOTS.map(s => ({ slot: s.slot, id: s.id, label: s.label, ...conf(s.slot) })),
    set: (id: string | number, change: Change) => setMany([[id, change]], { strict: true }),
    setMany,
    master(v?: number) {
      if (v === undefined) return a.volumes.music;
      return Promise.resolve(d.dispatch({ type: 'set-volumes', music: v }));
    },
    // Listen: the slot plays until stopped, then what was playing before comes back
    preview(id: string | number, on: boolean) {
      const s = slotOf(id);
      if (on) { if (previewing < 0) before = a.currentSlot; previewing = s; void d.dispatch({ type: 'play-slot', slot: s }); return; }
      if (previewing !== s) return;
      previewing = -1;
      if (before >= 0) void a.playSlot(before).catch(() => {}); else a.stop();
    },
    current: () => a.currentSlot,
    slotIds: () => AUDIO_SLOTS.map(s => s.id),
  };
}

/** Module.yo2AudioPack (web/audiopack.js's API) over features/audio-pack.ts. */
export function audioPackShim(d: AudioPageDeps, audio: ReturnType<typeof audioShim>) {
  return {
    AUDIO: AUDIO_FILE,
    read: (items: AudioPackItem | readonly AudioPackItem[]) => readAudioPack(items),
    fromUrl: (url: string) => fetchAudioPack(url),
    apply: (plan: AudioPackPlan, { replace = false }: { replace?: boolean; progress?: unknown } = {}) =>
      audio.setMany(plan.slots, { replace, ...(plan.master !== undefined ? { master: plan.master } : {}) }),
    build: (meta: AudioPackMeta = {}) => buildAudioPack(d.audio.packSource(), meta),
    match: matchAudioPart, zip, unzip,
    isPackItem: (path: string, type = '') => isAudioPackItem(path, type),
  };
}

let page: PageApi | null = null, loading: Promise<void> | null = null;
/** Puts the shims on Module and loads main's page (once: it installs its window drop listeners). */
export function installAudioPage(d: AudioPageDeps): Promise<void> {
  if (loading) return loading;
  const g = globalThis as { Module?: ModuleShim };
  const m = (g.Module ??= {}) as ModuleShim;
  if (!Object.getOwnPropertyDescriptor(m, 'canvas')) Object.defineProperty(m, 'canvas', { configurable: true, get: () => document.getElementById('canvas') });
  const audio = audioShim(d);
  m.yo2Audio = audio; m.yo2AudioPack = audioPackShim(d, audio);
  // over main's windows (the layer's host stands at 45 here; on live the page's 10 is over the engine canvas)
  if (!document.getElementById('rc-audio-rewrite-css')) {
    const st = document.createElement('style'); st.id = 'rc-audio-rewrite-css';
    st.textContent = '#rc-audio, #rc-audio-drop { z-index: 47 !important; }';
    document.head.append(st);
  }
  loading = import('@recomp-web/audiopage.js').then(() => { page = m.rcAudioUI ?? null; }, e => { console.warn('audio page', e); });
  return loading;
}
/** The Main Menu's Audio: main's page over the frame. */
export function openAudioPage(): void { void (loading ?? Promise.resolve()).then(() => page?.open()); }
export function closeAudioPage(): void { page?.close(); }
