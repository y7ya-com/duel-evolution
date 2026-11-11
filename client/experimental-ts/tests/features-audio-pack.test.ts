import { describe, expect, it, vi } from 'vitest';
import { buildAudioPack, matchAudioPart, readAudioPack, unzip, zip } from '../src/features/audio-pack';
import { AUDIO_SLOTS, BrowserAudioManager } from '../src/features/audio';
import { audioPackShim, audioShim } from '../src/ui/htmlui/audio-page';
import type { AudioAction } from '../src/features/audio';

const slot = (id: string) => AUDIO_SLOTS.findIndex(s => s.id === id);
const file = (name: string, body = name) => new File([body], name, { type: 'audio/mpeg' });
async function deflatedZip(path: string, text: string): Promise<Blob> {
  // a deflated entry (method 8), as most zip tools write: patch a stored zip's method and swap in the deflated body
  const raw = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const name = new TextEncoder().encode(path), local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(18, raw.length, true); lv.setUint32(22, text.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
  const dir = new Uint8Array(46 + name.length), dv = new DataView(dir.buffer);
  dv.setUint32(0, 0x02014b50, true); dv.setUint16(10, 8, true); dv.setUint32(20, raw.length, true); dv.setUint32(24, text.length, true); dv.setUint16(28, name.length, true); dir.set(name, 46);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, dir.length, true); end.setUint32(16, local.length + raw.length, true);
  return new Blob([local, raw, dir, end]);
}

describe('audio pack format (live web/audiopack.js)', () => {
  it('places files by name, track name and folder, slot names before groups before "all"', async () => {
    const pack = await zip([
      { path: 'MyPack/title.mp3', data: 'a' }, { path: 'MyPack/duel/one.ogg', data: 'b' }, { path: 'MyPack/duel/b_du1_3.ogg', data: 'c' },
      { path: 'MyPack/all/any.mp3', data: 'd' }, { path: 'MyPack/notes.txt', data: 'x' }, { path: 'MyPack/random.mp3', data: 'e' },
      { path: '__MACOSX/MyPack/._title.mp3', data: 'junk' },
    ]);
    const plan = await readAudioPack(new File([pack], 'MyPack.zip', { type: 'application/zip' }));
    expect(plan.manifest).toBe(false);
    expect(plan.slots[slot('title')]!.files.map(f => f.name)).toEqual(['title.mp3']);
    expect(plan.slots[slot('duel_3')]!.files.map(f => f.name)).toEqual(['b_du1_3.ogg']);   // its own track name wins over duel/
    expect(plan.slots[slot('duel_1')]!.files.map(f => f.name)).toEqual(['one.ogg']);
    expect(plan.slots[slot('my_room')]!.files.map(f => f.name)).toEqual(['any.mp3']);       // "all" fills the rest
    expect(plan.slots[slot('summon_1')]).toBeUndefined();                                    // never the jingles
    expect(plan.unused).toEqual(['random.mp3']);
    expect(await plan.slots[slot('title')]!.files[0]!.text()).toBe('a');
    expect(matchAudioPart('01 - Title.mp3')).toEqual([slot('title')]);
    expect(matchAudioPart('field')).toHaveLength(16);
  });
  it('follows audiopack.json: folders, options, master, unknown parts and missing files noted', async () => {
    const manifest = { name: 'Night', author: 'Kai', master: 80, slots: {
      room: { files: ['a/'], shuffle: true, loop: false, volume: 0.5 }, b_yami: 'x.mp3', nowhere: 'x.mp3', title: 'missing.mp3' } };
    const pack = await zip([{ path: 'p/audiopack.json', data: JSON.stringify(manifest) }, { path: 'p/a/2.mp3', data: '2' }, { path: 'p/a/10.mp3', data: '10' }, { path: 'p/x.mp3', data: 'x' }]);
    const plan = await readAudioPack(pack);
    expect(plan).toMatchObject({ name: 'Night', author: 'Kai', master: 0.8, manifest: true });
    expect(plan.slots[slot('my_room')]).toMatchObject({ shuffle: true, loop: false, volume: 0.5 });
    expect(plan.slots[slot('my_room')]!.files.map(f => f.name)).toEqual(['2.mp3', '10.mp3']);   // natural order
    expect(plan.slots[slot('field_yami')]!.files.map(f => f.name)).toEqual(['x.mp3']);
    expect(plan.notes.join('\n')).toMatch(/"nowhere" isn't a part/);
    expect(plan.notes.join('\n')).toMatch(/"missing.mp3" \(for title\) isn't in the pack/);
  });
  it('opens deflated entries and rejects what is not a zip', async () => {
    const entries = await unzip(await deflatedZip('title.mp3', 'hello hello hello'));
    expect(await (await entries[0]!.read()).text()).toBe('hello hello hello');
    await expect(readAudioPack(new File(['nope'], 'x.zip'))).rejects.toThrow(/isn't a zip/);
    await expect(readAudioPack(await zip([{ path: 'audiopack.json', data: '[1]' }]))).rejects.toThrow(/must be an object/);
  });
  it('a built pack reads back to the same setup; an empty setup builds the 46-part template', async () => {
    const shared = file('loop.mp3');
    const source = { master: 0.7, slots: AUDIO_SLOTS.map(s => ({ id: s.id, files: s.id === 'title' ? [file('a.mp3'), file('a.mp3', 'other')] : s.id === 'duel_1' || s.id === 'duel_2' ? [shared] : [], shuffle: s.id === 'title', loop: true, volume: s.id === 'title' ? 0.4 : 1 })) };
    const blob = await buildAudioPack(source, { name: 'Mine' });
    const names = (await unzip(blob)).map(e => e.path);
    expect(names).toEqual(['audiopack.json', 'README.txt', 'audio/a.mp3', 'audio/a (2).mp3', 'audio/loop.mp3']);
    const plan = await readAudioPack(blob);
    expect(plan).toMatchObject({ name: 'Mine', master: 0.7 });
    expect(plan.slots[slot('title')]).toMatchObject({ shuffle: true, loop: true, volume: 0.4 });
    expect(await Promise.all(plan.slots[slot('title')]!.files.map(f => f.text()))).toEqual(['a.mp3', 'other']);
    expect(plan.slots[slot('duel_2')]!.files[0]!.name).toBe('loop.mp3');
    const template = JSON.parse(await (await (await unzip(await buildAudioPack({ master: 1, slots: source.slots.map(s => ({ ...s, files: [] })) })))[0]!.read()).text());
    expect(Object.keys(template.slots)).toHaveLength(46);
  });
});

describe('audio manager packs', () => {
  it('applies a pack over the setup or alone, validated whole, and saves it as a pack', async () => {
    const m = new BrowserAudioManager({ storage: false });
    m.setSlotFiles(slot('login'), [file('keep.mp3')]);
    m.setMany({ [slot('title')]: { files: [file('t.mp3')], shuffle: true, volume: 0.3 } }, { master: 0.6 });
    expect(m.getSlotFiles(slot('login'))).toHaveLength(1);
    expect(m.getState().slots[slot('title')]).toMatchObject({ shuffle: true, volume: 0.3, files: ['t.mp3'] });
    expect(m.volumes.music).toBe(0.6);
    expect(() => m.setMany({ [slot('event')]: { files: Array.from({ length: 300 }, (_, i) => file(`${i}.mp3`)) } })).toThrow();
    expect(m.getSlotFiles(slot('event'))).toHaveLength(0);
    const plan = await readAudioPack(await m.exportPack({ name: 'Back' }));
    expect(Object.keys(plan.slots).map(Number)).toEqual([slot('title'), slot('login')]);
    await m.dispatch({ type: 'apply-pack', slots: { [slot('janken')]: { files: [file('j.mp3')] } }, replace: true });
    expect(m.getState().slots.filter(s => s.files.length).map(s => s.id)).toEqual(['janken']);
    expect(m.getState().slots[slot('title')]).toMatchObject({ shuffle: false, volume: 1 });
    await m.dispatch({ type: 'clear-all' });
    expect(m.getState().slots.some(s => s.files.length)).toBe(false);
    m.dispose();
  });
});

describe("main's Audio page over the rewrite's manager (htmlui/audio-page.ts)", () => {
  // the controller's audioAction: the manager's own dispatch (the app adds its view and saved settings)
  const setup = () => {
    const m = new BrowserAudioManager({ storage: false }), sent: AudioAction[] = [];
    const d = { audio: m, dispatch: (a: AudioAction) => { sent.push(a); return m.dispatch(a); } };
    const A = audioShim(d); return { m, sent, A, P: audioPackShim(d, A) };
  };
  it('lists the slots with their files and sets one, a group or everything as web/audio.js does', async () => {
    const { m, sent, A } = setup();
    expect(A.listSlots()).toHaveLength(46);
    await A.set('title', { files: [file('t.mp3')], volume: 0.5 });
    expect(A.listSlots()[slot('title')]).toMatchObject({ id: 'title', volume: 0.5, files: [expect.objectContaining({ name: 't.mp3' })] });
    // a change without files keeps the slot's files (live's {...conf(s), ...change})
    await A.set(slot('title'), { shuffle: true });
    expect(m.getSlotFiles(slot('title')).map(f => f.name)).toEqual(['t.mp3']);
    expect(m.getState().slots[slot('title')]).toMatchObject({ shuffle: true, volume: 0.5 });
    const r = await A.setMany([[slot('login'), { files: [file('l.mp3')] }], [slot('my_room'), { files: [file('r.mp3')] }]]);
    expect(r.failed).toEqual([]);
    expect(m.getState().slots.filter(s => s.files.length).map(s => s.id)).toEqual(['title', 'login', 'my_room']);
    await A.setMany(A.listSlots().map(s => [s.slot, { files: [] }] as const));
    expect(m.getState().slots.some(s => s.files.length)).toBe(false);
    expect(A.master()).toBe(1); await A.master(0.4); expect(A.master()).toBe(0.4);
    expect(sent.at(-1)).toEqual({ type: 'set-volumes', music: 0.4 });
    m.dispose();
  });
  it('reads a pack and uses it alone, its master volume too', async () => {
    const { m, A, P } = setup();
    await A.set('janken', { files: [file('j.mp3')] });
    const plan = await P.read(await zip([{ path: 'audiopack.json', data: JSON.stringify({ name: 'Night', master: 0.7, slots: { title: 't.mp3' } }) }, { path: 't.mp3', data: 't' }]));
    expect(plan.name).toBe('Night');
    await P.apply(plan, { replace: true });
    expect(m.getState().slots.filter(s => s.files.length).map(s => s.id)).toEqual(['title']);
    expect(A.master()).toBe(0.7);
    expect(P.isPackItem('a.zip')).toBe(true); expect(P.isPackItem('x.txt')).toBe(false);
    expect((await readAudioPack(await P.build({ name: 'Back' }))).slots[slot('title')]?.files).toHaveLength(1);
    m.dispose();
  });
});
