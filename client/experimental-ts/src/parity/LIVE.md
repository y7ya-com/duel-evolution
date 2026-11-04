# Live capture integration contract

Import `LiveCapture`, `captureDownload`, and the types from `./parity/live` (extensionless).
Only these three assigned files are owned here: `live.ts`, `LIVE.md`, and `tests/parity-live.test.ts`; this document serves as the integration.md contract.

```ts
const capture = new LiveCapture(); // optional Partial<TraceLimits> constructor argument
capture.start();                    // explicit opt-in; starts a fresh capture; active start is a no-op
capture.open(channel, 'duel');       // optional explicit OPEN boundary; forces a new generation
capture.receive(channel, message, 'duel'); // every incoming packet; auto-opens if necessary
capture.outgoing(channel, message, 'duel'); // optional; all outgoing bodies/params redacted
capture.close(channel);             // actual CLOSE boundary, stale closes are ignored
capture.sessionBoundary();          // disconnect/reconnect or session replacement; keeps recorded history
capture.stop();                     // idempotent; freezes records; no packets recorded afterward
const status = capture.status;      // detached readonly status; poll after packets/commands for UI
const json = capture.export();      // existing strict version-1 WireTrace JSON, not app state
const { blob, filename } = captureDownload(capture); // Blob + fixed safe filename only
capture.reset();                    // clear capture, return to idle; does not opt in
capture.dispose();                  // clear capture, terminal disposed state
```

`channel` is `{ id: number; port: number }` (pass the actual Channel object). Optional stream is `'duel' | 'account' | 'lobby'`; omission defaults conservatively to account/auth redaction, never guesses duel from message IDs or ports. Reusing the same id/port with a new Channel object creates a new generation; call `open` when reopening the same object. Call `sessionBoundary` on session replacement even if transport identifiers repeat. Never pass credentials, URLs, cookies, or session/app state.

Status fields: `state: 'idle' | 'recording' | 'stopped' | 'limit' | 'error' | 'disposed'`, `recording`, `records`, `payloadBytes`, `jsonBytes`, `partial`, `initializedDuels`, `gateEligible: false`, and `reason: string | null`. Bounds or invalid packets stop capture with a fixed visible reason and never escape into gameplay callbacks. Constructor rejects invalid limits as configuration errors. `start()` after stop/limit/error starts a fresh trace. Stop does not append closes, so it works even at an exact limit; existing replay permits open channels at end of trace.

A duel stream remains redacted (`game` in WireTrace) until a 0x6202 packet whose **first** decoded command is DUEL_INIT (kind 0, low 12 bits of b equal 1). A new trace channel begins at that packet. Safe duel packets before initialization mark `partial` permanently for that capture and remain redacted, so replay cannot credit a midduel fragment. Authentication/unknown/outgoing payloads are always redacted by WireRecorder. No pre-start packet buffer exists. Export is deterministic, without timestamps or private transport IDs/ports. This capture never grants gameplay acceptance credit (`gateEligible` is always false).

UI/root integration: start/stop/reset/status controls belong to the UI/app owners. Invoke `captureDownload` only after a user download command, then root may create/click/revoke an object URL. The utility has no globals, DOM access, automatic downloads, timers, storage, network, or hooks. Filename includes `partial` if applicable; partial status is also enforced in exported trace via redaction, not only the filename.
