// Audio packs: the live client's web/audiopack.js (recomp/AUDIO_PACKS.md, the pack makers' guide), ported without the
// engine's Module. A pack is one .zip a player drops on the game (or opens from the Audio window) that sets many of
// the 46 audio slots at once. Same format as live, so a pack made on one plays on the other:
//   - audiopack.json anywhere in the zip (its folder is the pack's root), all optional:
//       {"name", "author", "description", "url", "master": 0..1,
//        "slots": {"<part>": "file.mp3" | ["a.mp3", "folder/"] | {"files": ..., "shuffle", "loop", "volume"}}}
//     a path ending in "/" (or naming a folder) is every audio file under it, in name order
//   - without "slots": every audio file goes where its name says, most specific first: the file's own name, then its
//     folders (deepest first), e.g. title.mp3, duel/anything.mp3, my_room/01.ogg, audio/y_gx_04.ogg
// A <part> is a slot id (AUDIO_SLOTS: title, my_room, duel_1, field_yami, ...), the game's own track name for it
// (bgm.txt: y_gx_01, b_du1_1, ...), a plain alias (room, win, pinch, yami, ...) or a group (duel: the ten duel tracks,
// field: every field spell, lobby, menus, jingles; all: every part but the jingles and in-duel layers).
// Slot entries win over groups, groups over "all". Pure: no DOM, no audio manager.

/** bgm.txt's 46 lines: [slot id (AUDIO_SLOTS), the game's track name, aliases...]; index = slot. */
export const AUDIO_PACK_PARTS: readonly (readonly string[])[] = [
  ['title', 'y_gx_01', 'title_screen'], ['deck_editor', 'y_gx_02', 'deck', 'decks', 'deck_edit'],
  ['card_pack', 'b_card', 'card_packs', 'packs', 'pack_opening', 'shop'], ['login', 'y_gx_03', 'notices', 'caution'],
  ['my_room', 'y_gx_04', 'room', 'myroom'], ['yugi_area', 'y_gx_05', 'yugi', 'legacy_area'],
  ['gx_area', 'y_gx_06', 'gx', 'academy', 'duel_academy'], ['event_lobby', 'y_gx_07'],
  ['tournament_lobby', 'y_gx_08', 'tournament'], ['event', 'y_gx_09', 'events'],
  ['janken', 'y_gx_17', 'rock_paper_scissors', 'rps'],
  ['duel_1', 'b_du1_1'], ['duel_2', 'b_du1_2'], ['duel_3', 'b_du1_3'], ['duel_4', 'b_du1_4'], ['duel_5', 'b_du1_5'],
  ['duel_6', 'y_gx_12'], ['duel_7', 'y_gx_13'], ['duel_8', 'y_gx_14'],
  ['duel_tournament_1', 'b_du2_1'], ['duel_tournament_2', 'b_du2_2'],
  ['ritual', 'b_gishi', 'ritual_summon'], ['summon_1', 'b_syou1'], ['summon_2', 'b_syou2'],
  ['duel_winning', 'y_gx_15', 'winning', 'advantage'], ['duel_pinch', 'y_gx_16', 'pinch', 'losing'],
  ['duel_draw', 'y_gx_18', 'draw'], ['duel_lose', 'y_gx_19', 'lose', 'defeat'],
  ['duel_win', 'y_gx_20', 'win', 'victory'], ['updater', 'b_instal', 'patcher'],
  ['field_yami', 'b_yami', 'yami'], ['field_umi', 'b_umi', 'umi'], ['field_mountain', 'b_moun', 'mountain'],
  ['field_sogen', 'b_sogen', 'sogen'], ['field_forest', 'b_forest', 'forest'],
  ['field_wasteland', 'b_kouya', 'wasteland'], ['field_fusion_gate', 'b_fusion', 'fusion_gate'],
  ['field_gaia_power', 'b_gaia', 'gaia_power'], ['field_umiiruka', 'b_water', 'umiiruka', 'water_world'],
  ['field_luminous_spark', 'b_shine', 'luminous_spark'],
  ['field_mystic_plasma_zone', 'b_dark', 'mystic_plasma_zone', 'dark_zone'],
  ['field_rising_air_current', 'b_desert', 'rising_air_current', 'desert_storm'],
  ['field_molten_destruction', 'b_burn', 'molten_destruction', 'burning_blood'],
  ['field_chorus_of_sanctuary', 'b_seiiki', 'chorus_of_sanctuary', 'hymn_of_light', 'sanctuary'],
  ['field_skyscraper', 'y_gx_10', 'skyscraper'], ['field_other', 'y_gx_11', 'other_fields', 'other_field'],
];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const EVERYWHERE = [...range(0, 20), ...range(26, 29)];   // not the jingles or the in-duel layers (they fall back)
const GROUPS: readonly [readonly string[], readonly number[]][] = [
  [['duel', 'duels', 'battle', 'duel_audio'], range(11, 20)], [['field', 'fields', 'field_spells'], range(30, 45)],
  [['lobby', 'lobbies', 'areas', 'world'], range(5, 9)], [['menus', 'menu'], [0, 3, 29]],
  [['jingles', 'summon', 'summons'], range(21, 23)],
];
const ALL = ['all', 'everywhere', 'everything', 'default'];
const TIER = { slot: 0, group: 1, all: 2 } as const;
interface Key { tier: number; slots: readonly number[] }
const KEYS = new Map<string, Key>();
AUDIO_PACK_PARTS.forEach((names, s) => names.forEach(n => KEYS.set(n, { tier: TIER.slot, slots: [s] })));
for (const [names, slots] of GROUPS) for (const n of names) KEYS.set(n, { tier: TIER.group, slots });
for (const n of ALL) KEYS.set(n, { tier: TIER.all, slots: EVERYWHERE });

export const AUDIO_FILE = /\.(mp3|m4a|aac|mp4|wav|flac|aiff?|ogg|oga|opus|webm|weba|caf)$/i;
const MIME: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac',
  aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm',
  weba: 'audio/webm', caf: 'audio/x-caf', json: 'application/json', txt: 'text/plain' };
const ext = (p: string) => (/\.([^./]+)$/.exec(p) ?? [])[1]?.toLowerCase() ?? '';
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const junk = (p: string) => /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(p) || /(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(p);
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

/** A name -> the best key it stands for: as it is, without a leading track number ("01 - Title"), without a trailing
 * copy number ("duel 9", "title (2)"). */
function keyOf(name: string): Key | null {
  const n = norm(name.replace(AUDIO_FILE, '')), forms = [n, n.replace(/^\d+_/, ''), n.replace(/_\d+$/, ''), n.replace(/^\d+_/, '').replace(/_\d+$/, '')];
  for (const f of forms) if (f && KEYS.has(f)) return KEYS.get(f)!;
  return null;
}
/** A file's path -> the most specific key any of its names reaches; the file name before its folders. */
function place(path: string): Key | null {
  const parts = path.split('/'), names = [parts.pop()!, ...parts.reverse()];
  let best: Key | null = null;
  for (const n of names) { const k = keyOf(n); if (k && (!best || k.tier < best.tier)) best = k; }
  return best;
}
/** What a file or folder name stands for: the slots it would fill. */
export const matchAudioPart = (name: string): number[] => [...(place(name)?.slots ?? [])];
export const isAudioPackItem = (path: string, type = ''): boolean => ext(path) === 'zip' || /zip/.test(type) || AUDIO_FILE.test(path)
  || /^audio\//.test(type) || base(path).toLowerCase() === 'audiopack.json';

// ---------------------------------------------------------------- zip (PKZIP: stored and deflated entries)
export interface ZipEntry { path: string; size: number; read(): Promise<File> }
const u16 = (d: DataView, o: number) => d.getUint16(o, true), u32 = (d: DataView, o: number) => d.getUint32(o, true);
const utf8 = new TextDecoder(), enc = new TextEncoder();
const bytes = async (b: Blob): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await b.arrayBuffer());
export async function unzip(blob: Blob): Promise<ZipEntry[]> {
  const tail = Math.min(blob.size, 22 + 65535);
  const end = new DataView(await blob.slice(blob.size - tail).arrayBuffer());
  let e = -1;
  for (let i = end.byteLength - 22; i >= 0; i--) if (u32(end, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("This isn't a zip file (or it is damaged)");
  const count = u16(end, e + 10), size = u32(end, e + 12), at = u32(end, e + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('This zip is too large (ZIP64): split it into packs under 4 GB');
  const dir = new DataView(await blob.slice(at, at + size).arrayBuffer()), out: ZipEntry[] = [];
  for (let o = 0, i = 0; i < count; i++) {
    if (o + 46 > dir.byteLength || u32(dir, o) !== 0x02014b50) throw new Error('This zip is damaged (bad directory)');
    const flags = u16(dir, o + 8), method = u16(dir, o + 10), csize = u32(dir, o + 20), usize = u32(dir, o + 24);
    const nlen = u16(dir, o + 28), xlen = u16(dir, o + 30), clen = u16(dir, o + 32), local = u32(dir, o + 42);
    const path = utf8.decode(new Uint8Array(dir.buffer, dir.byteOffset + o + 46, nlen)).replace(/\\/g, '/');
    o += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue;
    out.push({ path, size: usize, async read() {
      if (flags & 1) throw new Error(`${path} is password-protected`);
      const h = new DataView(await blob.slice(local, local + 30).arrayBuffer());
      if (h.byteLength < 30 || u32(h, 0) !== 0x04034b50) throw new Error(`${path}: this zip is damaged`);
      const start = local + 30 + u16(h, 26) + u16(h, 28), data = blob.slice(start, start + csize);
      const type = MIME[ext(path)] ?? '';
      if (method === 0) return new File([data], base(path), { type });
      if (method !== 8) throw new Error(`${path} uses a compression the game can't open: re-save the zip normally`);
      const raw = await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      return new File([raw], base(path), { type });
    } });
  }
  return out;
}
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Uint8Array) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8); return ~c >>> 0; };
/** entries -> a zip Blob (stored: audio is compressed already). */
export async function zip(entries: readonly { path: string; data: Blob | string }[], now = new Date()): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [], dirs: Uint8Array<ArrayBuffer>[] = [];
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let off = 0;
  for (const { path, data } of entries) {
    const name = enc.encode(path) as Uint8Array<ArrayBuffer>, body = typeof data === 'string' ? enc.encode(data) as Uint8Array<ArrayBuffer> : await bytes(data), sum = crc32(body);
    const fill = (h: DataView, o: number) => {   // the fields local and central headers share, from `o`
      h.setUint16(o, 20, true); h.setUint16(o + 2, 0x800, true); h.setUint16(o + 4, 0, true);
      h.setUint16(o + 6, time, true); h.setUint16(o + 8, date, true); h.setUint32(o + 10, sum, true);
      h.setUint32(o + 14, body.length, true); h.setUint32(o + 18, body.length, true); h.setUint16(o + 22, name.length, true);
    };
    const l = new Uint8Array(30 + name.length), lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true); fill(lv, 4); l.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); fill(cv, 6); cv.setUint32(42, off, true); c.set(name, 46);
    parts.push(l, body); dirs.push(c);
    off += l.byteLength + body.length;
    if (off > 0xfffffff0) throw new Error('Too much audio for one pack (over 4 GB)');
  }
  const size = dirs.reduce((n, c) => n + c.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dirs.length, true); e.setUint16(10, dirs.length, true);
  e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...dirs, e], { type: 'application/zip' });
}

// ---------------------------------------------------------------- reading a pack
export interface AudioPackSlot { files: File[]; shuffle?: boolean; loop?: boolean; volume?: number }
export interface AudioPackPlan {
  name: string; author: string; description: string; url: string; master?: number;
  /** slot index -> what the pack sets there */
  slots: Record<number, AudioPackSlot>;
  unused: string[]; notes: string[]; manifest: boolean;
}
export type AudioPackItem = Blob | { path: string; file: Blob };
interface Entry extends ZipEntry { rel?: string }
async function entriesOf(items: AudioPackItem | readonly AudioPackItem[]): Promise<Entry[]> {
  const list: AudioPackItem[] = items instanceof Blob ? [items] : Array.isArray(items) ? [...items as readonly AudioPackItem[]] : [items as AudioPackItem], out: Entry[] = [];
  for (const it of list) {
    const file = it instanceof Blob ? it : it.file;
    const path = (it instanceof Blob ? (file as File).webkitRelativePath || (file as File).name : it.path) || 'file';
    if (ext(path) === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      const inner = await unzip(file), pre = list.length > 1 ? path.replace(/\.zip$/i, '') + '/' : '';
      out.push(...inner.map(x => ({ ...x, path: pre + x.path })));
    } else {
      const named = file instanceof File ? file : new File([file], base(path), { type: MIME[ext(path)] ?? '' });
      out.push({ path, size: file.size, read: async () => named });
    }
  }
  const kept = out.filter(x => !junk(x.path));
  const top = kept.length && kept.every(x => x.path.includes('/')) ? kept[0]!.path.split('/')[0]! : '';
  if (top && kept.every(x => x.path.startsWith(top + '/')) && !keyOf(top)) for (const x of kept) x.path = x.path.slice(top.length + 1);
  return kept;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v > 1 ? v / 100 : v)) : undefined);
function opts(o: Record<string, unknown>): Omit<AudioPackSlot, 'files'> {
  const r: Omit<AudioPackSlot, 'files'> = {};
  if (typeof o.shuffle === 'boolean') r.shuffle = o.shuffle;
  if (typeof o.loop === 'boolean') r.loop = o.loop;
  const v = num(o.volume); if (v !== undefined) r.volume = v;
  return r;
}

/** A zip Blob/File, or loose files / {path, file} (a dropped folder, several zips) -> what the pack would set.
 * Nothing changes until the plan is applied. */
export async function readAudioPack(items: AudioPackItem | readonly AudioPackItem[]): Promise<AudioPackPlan> {
  const entries = await entriesOf(items), notes: string[] = [];
  const man = entries.filter(x => base(x.path).toLowerCase() === 'audiopack.json')
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  let meta: Record<string, unknown> = {};
  if (man) {
    let parsed: unknown;
    try { parsed = JSON.parse(await (await man.read()).text()); } catch (e) { throw new Error(`audiopack.json can't be read: ${e instanceof Error ? e.message : String(e)}`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('audiopack.json must be an object ({...})');
    meta = parsed as Record<string, unknown>;
  }
  const root = man ? man.path.slice(0, man.path.length - base(man.path).length) : '';
  const audio = entries.filter(x => AUDIO_FILE.test(x.path) && x.path.startsWith(root))
    .map(x => ({ ...x, rel: x.path.slice(root.length) })).sort((a, b) => natural(a.rel, b.rel));
  type A = (typeof audio)[number];
  const assigned = new Map<number, { tier: number; items: A[]; opts: Omit<AudioPackSlot, 'files'> }>();
  const give = (k: Key, items: A[], o: Omit<AudioPackSlot, 'files'> = {}) => {
    for (const s of k.slots) {
      const a = assigned.get(s);
      if (!a || k.tier < a.tier) assigned.set(s, { tier: k.tier, items: [...items], opts: o });
      else if (k.tier === a.tier) for (const it of items) if (!a.items.includes(it)) a.items.push(it);
    }
  };
  if (meta.slots && typeof meta.slots === 'object') {
    for (const [key, v] of Object.entries(meta.slots as Record<string, unknown>)) {
      const k = KEYS.get(norm(key));
      if (!k) { notes.push(`audiopack.json: "${key}" isn't a part of the game; left out`); continue; }
      const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : { files: v }) as Record<string, unknown>;
      const paths = ([] as unknown[]).concat(o.files ?? o.file ?? []).filter((p): p is string => typeof p === 'string');
      const items: A[] = [];
      for (const p of paths) {
        const want = p.replace(/\\/g, '/').replace(/^\.?\//, ''), dir = want.replace(/\/?$/, '/');
        const hit = audio.filter(x => x.rel === want || dir === '/' || x.rel.startsWith(dir));
        if (!hit.length) notes.push(`audiopack.json: "${p}" (for ${key}) isn't in the pack`);
        items.push(...hit.filter(x => !items.includes(x)));
      }
      if (items.length || !paths.length) give(k, items, opts(o));
    }
  } else {
    for (const x of audio) { const k = place(x.rel); if (k) give(k, [x]); }
  }
  const used = new Set([...assigned.values()].flatMap(a => a.items));
  const unused = audio.filter(x => !used.has(x)).map(x => x.rel);
  // each file read once (the same File object in every slot that uses it)
  const files = new Map<A, Promise<File | null>>(), slots: Record<number, AudioPackSlot> = {};
  for (const [s, a] of [...assigned].sort((x, y) => x[0] - y[0])) {
    const list: File[] = [];
    for (const it of a.items) {
      if (!files.has(it)) files.set(it, it.read().catch(e => { notes.push(String(e instanceof Error ? e.message : e)); return null; }));
      const f = await files.get(it);
      if (f) list.push(f);
    }
    if (list.length || !a.items.length) slots[s] = { files: list, ...a.opts };
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : '');
  const master = num(meta.master);
  return { name: str(meta.name), author: str(meta.author), description: str(meta.description), url: str(meta.url),
    ...(master !== undefined ? { master } : {}), slots, unused, notes, manifest: !!man };
}

/** A pack's link (a GitHub file page and a Dropbox share become their downloads) -> its plan. */
export async function fetchAudioPack(url: string, fetcher: typeof fetch = fetch, here = globalThis.location?.href ?? 'https://localhost/'): Promise<AudioPackPlan> {
  let u: URL;
  try { u = new URL(url.trim(), here); } catch { throw new Error("That doesn't look like a link"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links can be downloaded');
  const gh = u.hostname === 'github.com' && /^\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
  if (gh) u = new URL(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}`);
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) u.searchParams.set('dl', '1');
  let r: Response;
  try { r = await fetcher(u.href, { mode: 'cors', credentials: 'omit' }); } catch {
    throw new Error("That site doesn't let the game download the pack directly. Download the .zip yourself, then drop it here.");
  }
  if (!r.ok) throw new Error(`The download failed (${r.status}${r.statusText ? ' ' + r.statusText : ''}). Check the link.`);
  const blob = await r.blob(), name = decodeURIComponent(u.pathname.split('/').pop() || 'pack.zip');
  return readAudioPack([{ path: /\.zip$/i.test(name) ? name : name + '.zip', file: new File([blob], name, { type: 'application/zip' }) }]);
}

// ---------------------------------------------------------------- building a pack
export interface AudioPackSource { master: number; slots: readonly { id: string; files: readonly File[]; shuffle: boolean; loop: boolean; volume: number }[] }
export interface AudioPackMeta { name?: string; author?: string; description?: string }
const README = 'Duel Evolution audio pack.\n\nTo use it: drop this .zip anywhere on the game (or open it from Main Menu > Audio).\n\n'
  + 'audiopack.json says which file plays where; the files are in audio/. To make your own pack, use Create\n'
  + "audio pack on the game's Audio page, or put your files in audio/ and list them under \"slots\". A file or\n"
  + 'folder named after a part also works without audiopack.json: title.mp3, my_room/, duel/ (every duel), field/.\n';
/** The player's setup (or, with nothing set, an empty template over all 46 parts) as a pack zip, live's format. */
export async function buildAudioPack(source: AudioPackSource, meta: AudioPackMeta = {}): Promise<Blob> {
  const slots = source.slots.filter(s => s.files.length), entries: { path: string; data: Blob | string }[] = [];
  const names = new Map<File, string>(), taken = new Set<string>();
  const nameFor = (f: File) => {
    const known = names.get(f); if (known) return known;
    let n = (f.name || 'audio').replace(/[\\/:*?"<>|]/g, '_'), i = 1;
    const dot = n.lastIndexOf('.'), stem = dot > 0 ? n.slice(0, dot) : n, x = dot > 0 ? n.slice(dot) : '';
    while (taken.has(n.toLowerCase())) n = `${stem} (${++i})${x}`;
    taken.add(n.toLowerCase()); names.set(f, n);
    entries.push({ path: 'audio/' + n, data: f });
    return n;
  };
  const man: { name: string; author: string; description: string; master: number; slots: Record<string, unknown> } = {
    name: meta.name || 'My audio pack', author: meta.author || '', description: meta.description || '', master: source.master, slots: {} };
  for (const s of slots) man.slots[s.id] = { files: s.files.map(f => 'audio/' + nameFor(f)), shuffle: !!s.shuffle, loop: s.loop !== false, volume: s.volume ?? 1 };
  if (!slots.length) { man.name = ''; for (const s of source.slots) man.slots[s.id] = []; }
  return zip([{ path: 'audiopack.json', data: JSON.stringify(man, null, 2) + '\n' }, { path: 'README.txt', data: README }, ...entries]);
}
