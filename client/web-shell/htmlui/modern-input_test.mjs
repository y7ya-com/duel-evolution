import assert from 'node:assert/strict';
import { nativeHudInput, dispatchEnabledInput } from './modern-input.js';
const heap = new Uint8Array(4096), words = new Uint32Array(heap.buffer);
const ctl = 512; words[ctl >>> 2] = 0x1234; heap[ctl + 0x350] = 1;
const snap = { scene: 28, windows: [{ cls: 'CChatWindow', shown: true, controls: [{ id: ctl, enabled: true }] }] };
const router = nativeHudInput();
router.block(snap, heap, true); assert.equal(heap[ctl + 0x350], 0, 'native HUD must not swallow hand input');
router.restore(); assert.equal(heap[ctl + 0x350], 1, 'snapshot reads original enabled flags');
const done = router.allow(ctl); router.block(snap, heap, true); assert.equal(heap[ctl + 0x350], 1, 'explicit DOM action still reaches its native control');
done(); router.block(snap, heap, true); assert.equal(heap[ctl + 0x350], 0);
router.block(snap, heap, false); assert.equal(heap[ctl + 0x350], 1, 'legacy mode restores native input');
router.block({ ...snap, scene: 11 }, heap, true); assert.equal(heap[ctl + 0x350], 0, 'invisible lobby chat cannot intercept world clicks');
const openChat = router.allow(ctl);
router.block({ ...snap, scene: 11 }, heap, true); assert.equal(heap[ctl + 0x350], 1, 'opening or sending through DOM chat still reaches its native input');
openChat();
router.block({ ...snap, scene: 11 }, heap, true); assert.equal(heap[ctl + 0x350], 0);
router.block({ ...snap, scene: 11 }, heap, false); assert.equal(heap[ctl + 0x350], 1, 'Legacy chat keeps original input');
router.block(snap, heap, true); words[ctl >>> 2] = 0x5678; router.restore(); assert.equal(heap[ctl + 0x350], 0, 'do not write to a recycled object');
console.log('modern-input_test: ok');
// The lobby roster is exposed as either the concrete or base window class.
for (const cls of ['CPlayerListDlg', 'CWindowModelInformation']) {
  words[ctl >>> 2] = 0x1234; heap[ctl + 0x350] = 1;
  const r = { scene: 11, windows: [{ cls, shown: true, controls: [{ id: ctl, cls: 'CWindowTaskActiveListbox', name: '検索ボタン', enabled: true }] }] };
  router.block(r, heap, true);
  assert.equal(heap[ctl + 0x350], 0, 'hidden roster cannot steal lobby input');
  router.restore(); assert.equal(heap[ctl + 0x350], 1);
}
// The native dispatcher rejects WM_CHAR when enabled_ is zero. A queued submit
// must survive both a delayed flush and an overlapping focus click finishing.
words[ctl >>> 2] = 0x1234; heap[ctl + 0x350] = 1;
router.block(snap, heap, true);
const focusLease = router.allow(ctl);
let flushed, played;
const submission = dispatchEnabledInput(router, ctl,
  () => new Promise(resolve => { flushed = resolve; }), () => new Promise(resolve => { played = resolve; }));
focusLease(); focusLease(); // release is idempotent and cannot release the submit's lease
for (let i = 0; i < 4; i++) router.block(snap, heap, true);
assert.equal(heap[ctl + 0x350], 1, 'target stays enabled while the queue is busy');
flushed(); await Promise.resolve();
router.block(snap, heap, true);
assert.equal(heap[ctl + 0x350], 1, 'the actual native WM_CHAR dispatch accepts the enabled target');
played(); await submission;
router.block(snap, heap, true);
assert.equal(heap[ctl + 0x350], 0, 'idle click-through is restored after dispatch');
await assert.rejects(dispatchEnabledInput(router, ctl, () => Promise.reject(new Error('failed')), () => Promise.resolve()));
router.block(snap, heap, true); assert.equal(heap[ctl + 0x350], 0, 'failed submission releases its lease');
console.log('modern-input_test: queued Enter dispatch stays enabled through focus and native playback');
