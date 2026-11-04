import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayClient } from '../src/network/gateway';
import type { WebSocketLike } from '../src/network/gateway';
import { BrowserAudioManager } from '../src/features/audio';
import { GAME_LANGUAGES, loadGameLanguage } from '../src/features/language';
import { CardCatalog } from '../src/catalog';

class Socket implements WebSocketLike {
  readyState = 0; bufferedAmount = 0; binaryType = '';
  onopen: WebSocketLike['onopen'] = null; onclose: WebSocketLike['onclose'] = null; onerror: WebSocketLike['onerror'] = null; onmessage: WebSocketLike['onmessage'] = null;
  sent: (string | Uint8Array)[] = [];
  constructor(readonly url: string) {}
  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== 1) throw new Error('closed');
    this.sent.push(typeof data === 'string' ? data : new Uint8Array(ArrayBuffer.isView(data) ? data.buffer : data).slice());
  }
  open(): void { this.readyState = 1; this.onopen?.({} as Event); }
  close(): void { this.readyState = 3; }
  control(value: unknown): void { this.onmessage?.({ data:JSON.stringify(value) } as MessageEvent); }
  frames(): Uint8Array[] { return this.sent.filter((v): v is Uint8Array => typeof v !== 'string'); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('tunnel resume holds sends', () => {
  it('keeps a send made while the socket closes or resumes and sends it once after the resume', async () => {
    vi.useFakeTimers();
    const sockets: Socket[] = [];
    const gateway = new GatewayClient({ url:'ws://game.example/net', sid:'s', socketFactory:url => { const s = new Socket(url); sockets.push(s); return s; } });
    const ready = gateway.connect(); sockets[0].open(); await ready;
    const opening = gateway.open(1234); await Promise.resolve();
    sockets[0].control({ type:'open', id:1, status:0 }); const channel = await opening;
    // The socket is closing (no close event yet): the send is retained, not thrown.
    sockets[0].readyState = 2;
    expect(() => channel.send(0x1001, Uint8Array.of(1))).not.toThrow();
    sockets[0].readyState = 3; sockets[0].onclose?.({} as CloseEvent);
    expect(gateway.status).toBe('reconnecting');
    expect(() => channel.send(0x1002, Uint8Array.of(2))).not.toThrow();
    await vi.advanceTimersByTimeAsync(250);
    sockets[1].open(); sockets[1].control({ type:'resumed', socks:[{ id:channel.id, rx:0 }] });
    expect(gateway.status).toBe('connected');
    expect(sockets[1].frames()).toHaveLength(2);
    expect(sockets[0].frames()).toHaveLength(0);
    gateway.dispose();
  });
});

describe('Sound.dat effects and interrupted playback', () => {
  function archive(items: { name: string; data: number[]; size?: number }[]): Uint8Array {
    const total = 12 + items.length * 268 + items.reduce((n, e) => n + e.data.length, 0), bytes = new Uint8Array(total), view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8, items.length, true);
    let offset = 12 + items.length * 268;
    items.forEach((item, i) => {
      for (let k = 0; k < item.name.length; k++) { const b = item.name.charCodeAt(k); bytes[12 + i * 268 + k] = ((b & 15) << 4) | (b >> 4); }
      view.setUint32(12 + i * 268 + 256, offset, true); view.setUint32(12 + i * 268 + 260, item.size ?? item.data.length, true); view.setUint32(12 + i * 268 + 264, item.data.length, true);
      bytes.set(item.data, offset); offset += item.data.length;
    });
    return bytes;
  }
  function context() {
    const decoded: number[] = [];
    const ctx = { state:'suspended', destination:{}, resume:vi.fn(async () => { ctx.state = 'running'; }), close:vi.fn(async () => {}),
      createGain:() => ({ gain:{ value:1 }, connect:vi.fn(), disconnect:vi.fn() }),
      createBufferSource:() => ({ buffer:null, onended:null, connect:vi.fn(), disconnect:vi.fn(), start:vi.fn(), stop:vi.fn() }),
      decodeAudioData:vi.fn(async (b: ArrayBuffer) => { decoded.push(b.byteLength); return { length:4, numberOfChannels:1 } as AudioBuffer; }) };
    return { ctx, decoded };
  }
  it('plays effects from an archive whose bgm/ entries exceed the effect limit, and refuses an oversized effect', async () => {
    const bytes = archive([{ name:'bgm/b_long.wav', data:[0], size:19 * 1024 * 1024 }, { name:'se/turn_change.wav', data:[1, 2, 3] }, { name:'se/huge.wav', data:[0], size:5 * 1024 * 1024 }]);
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!.map(Number);
      return new Response(bytes.slice(a, b + 1), { status:206, headers:{ 'Content-Range':`bytes ${a}-${b}/${bytes.length}` } });
    }));
    const { ctx, decoded } = context(), onError = vi.fn();
    const manager = new BrowserAudioManager({ storage:false, soundArchiveUrl:'https://game.example/Sound.dat', contextFactory:() => ctx as unknown as AudioContext, onError });
    await manager.activate();
    expect(await manager.playEffect('se/turn_change.wav')).toBe(true);
    expect(decoded).toEqual([3]);
    expect(await manager.playEffect('se/huge.wav')).toBe(false);
    expect(String(onError.mock.calls.at(-1)?.[0])).toContain('Encoded effect exceeds limit');
    manager.dispose();
  });
  it('keeps the scene track when play() is interrupted (AbortError) rather than refused', async () => {
    const { ctx } = context(), media: { paused:boolean; volume:number; src:string; loop:boolean; preload:string; onended:null; onerror:null; play:() => Promise<void>; pause:() => void; load:() => void; removeAttribute:() => void }[] = [];
    const manager = new BrowserAudioManager({ storage:false, contextFactory:() => ctx as unknown as AudioContext, createObjectURL:() => 'blob:x', revokeObjectURL:() => {},
      audioFactory:() => { const m = { paused:true, volume:1, src:'', loop:false, preload:'', onended:null, onerror:null,
        play:vi.fn(async () => { throw new DOMException('The play() request was interrupted', 'AbortError'); }), pause:vi.fn(), load:vi.fn(), removeAttribute:vi.fn() }; media.push(m); return m as unknown as HTMLAudioElement; } });
    manager.setSlotFiles(0, [new File(['x'], 'title.wav')]);
    await manager.playSlot(0); await manager.activate();
    expect(media).toHaveLength(1);
    expect(media[0].pause).not.toHaveBeenCalled();
    expect(media[0].removeAttribute).not.toHaveBeenCalled();
    manager.dispose();
  });
});

describe('original game-text languages', () => {
  const utf16 = (...strings: string[]) => { const parts = strings.map(s => { const b = new Uint8Array((s.length + 1) * 2); for (let i = 0; i < s.length; i++) new DataView(b.buffer).setUint16(i * 2, s.charCodeAt(i), true); return b; });
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
  function tables(letter: string, names: string[], descriptions: string[], pack: string) {
    const properties = new Uint8Array(names.length * 8), index = new Uint8Array(names.length * 8 + 8);
    let n = 0, d = 0;
    names.forEach((name, row) => {
      new DataView(properties.buffer).setUint32(row * 8, 100 + row, true);
      new DataView(index.buffer).setUint32(row * 8, n, true); new DataView(index.buffer).setUint32(row * 8 + 4, d, true);
      n += (name.length + 1) * 2; d += (descriptions[row].length + 1) * 2;
    });
    const latin = (s: string) => Uint8Array.from([...s].map(c => c.charCodeAt(0)).concat(0));
    const packIndex = new Uint8Array(16); new DataView(packIndex.buffer).setUint32(8, 0, true); new DataView(packIndex.buffer).setUint32(12, 0, true);
    const packProp = new Uint8Array(8); new DataView(packProp.buffer).setUint32(4, 7, true);
    return new Map<string, Uint8Array>([
      ['data/bin#/card_prop.bin', properties], [`data/bin#/card_indx_${letter}.bin`, index], [`data/bin#/card_name_${letter}.bin`, utf16(...names)], [`data/bin#/card_desc_${letter}.bin`, utf16(...descriptions)],
      ['data/cardpack/pack_prop.bin', packProp], ['data/cardpack/pack_img.bin', latin('p.png')], ['data/cardpack/pack_indx2.bin', packIndex],
      [`data/cardpack/pack_name_${letter}.bin`, latin(pack)], [`data/cardpack/pack_indx_${letter}.bin`, packIndex], [`data/cardpack/pack_desc_${letter}.bin`, latin(pack + ' Beschreibung')],
    ]);
  }
  const assets = (files: Map<string, Uint8Array>) => ({ readScene: vi.fn(async (path: string) => {
    const bytes = files.get(path.toLowerCase()); if (!bytes) throw new Error('missing ' + path);
    return { value:{ bytes, url:'', mimeType:'' }, release:vi.fn() } as never;
  }) });
  it('offers the original seven languages in the Options flag order', () => {
    expect(GAME_LANGUAGES.map(l => l.code)).toEqual(['J', 'E', 'G', 'F', 'I', 'S', 'K']);
  });
  it('joins localized rows to verified passcodes, counts cards left in English and reads that language\'s pack tables', async () => {
    const files = tables('g', ['Dunkler Magier', 'Kuriboh'], ['Der ultimative Magier.', 'Ein Kuriboh.'], 'Paket 1');
    const text = await loadGameLanguage(assets(files), 'G', [{ passcode:46986414, internalId:100 }, { passcode:40640057, internalId:101 }, { passcode:1, internalId:999 }]);
    expect(text.cards).toEqual([{ passcode:46986414, name:'Dunkler Magier', description:'Der ultimative Magier.' }, { passcode:40640057, name:'Kuriboh', description:'Ein Kuriboh.' }]);
    expect(text.missing).toBe(1);
    expect(text.packs.get(7)).toMatchObject({ name:'Paket 1', description:'Paket 1 Beschreibung' });
    const catalog = new CardCatalog(); catalog.install([{ passcode:46986414, name:'Dark Magician' }, { passcode:1, name:'Server card' }]);
    catalog.installLocalizedTexts(text.cards, text.language);
    expect([catalog.card(46986414).name, catalog.card(46986414).descriptionSource, catalog.card(1).name]).toEqual(['Dunkler Magier', 'original-g', 'Server card']);
  });
  it('fails without partial text when a language table is missing', async () => {
    const files = tables('f', ['Magicien Sombre'], ['Le magicien.'], 'Paquet 1'); files.delete('data/bin#/card_desc_f.bin');
    await expect(loadGameLanguage(assets(files), 'F', [{ passcode:46986414, internalId:100 }])).rejects.toThrow(/missing/);
  });
});
