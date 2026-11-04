import { words } from '../duel/decode';
import { WireRecorder } from './replay';

/** Synthetic protocol inputs. These are not captured gameplay or acceptance evidence. */
export function command(kind: number, b = 0, params: number[] = []): Uint8Array {
  const data = new Uint8Array(43); data.set(words(kind, b, ...Array.from({ length: 8 }, (_, i) => params[i] ?? 0))); return data;
}
export function syntheticDuelTrace(): WireRecorder {
  const recorder = new WireRecorder(); recorder.open(1, 'duel');
  const timer = new Uint8Array(10), view = new DataView(timer.buffer);
  timer[0] = 1; view.setInt32(1, 60); view.setInt32(6, 45);
  const messages: { id: number; data: Uint8Array }[] = [
    ...[command(0, 1), command(0, 4), command(0, 0x0c), command(0, 0x26, [7000]), command(0, 0x25, [500])]
      .map(data => ({ id: 0x6202, data })),
    { id: 0x6461, data: timer },
    { id: 0x6610, data: new Uint8Array(17) },
    { id: 0x6611, data: new Uint8Array(110) },
    { id: 0x6612, data: new Uint8Array([0, 0, 0, 0, 1, 0]) },
    { id: 0x6613, data: words(1, 2, 3, 4, 5, 6, 7, 8, 9) },
    { id: 0x649b, data: new Uint8Array([2, 1]) },
    { id: 0x6202, data: command(0x4d, 0, [1, 0]) },
  ];
  messages.forEach((message, i) => recorder.message(1, 'in', { ...message, param: i + 1 }));
  recorder.close(1); return recorder;
}
