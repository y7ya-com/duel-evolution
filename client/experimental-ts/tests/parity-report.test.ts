import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { acceptanceGaps, acceptanceInventory, acceptanceEvidence } from '../src/parity/acceptance';
import { duelReplayAdapter } from '../src/parity/duel-adapter';
import { compareReplay, WireRecorder } from '../src/parity/replay';
import { syntheticDuelTrace } from '../src/parity/synthetic';

function syntheticEvidence() {
  const { deterministic, first } = compareReplay(syntheticDuelTrace().snapshot(), duelReplayAdapter);
  return { source: 'synthetic browser-reducer trace, not a gameplay recording', deterministic,
    processed: first.processed, supported: first.supported, unsupported: first.unsupported,
    wireCounts: first.wireCounts, supportedOpcodeCounts: first.supportedOpcodeCounts,
    stateDigest: first.stateDigest, outputsDigest: first.outputsDigest };
}

/** Read private reference recordings only. Legacy fixture payloads use client indices/40-byte
 * commands and are NOT current v2 passcode wire captures. Probe rejection/recognition is diagnostic
 * and explicitly excluded from new-client gameplay coverage. No fixture bytes are exported.
 */
function privateFixtureProbe() {
  const fixtureRoot = resolve(process.cwd(), '../../server/gamedata/fixtures/translator');
  const files = existsSync(fixtureRoot) ? readdirSync(fixtureRoot).filter(n => n.endsWith('.json.gz')).sort() : [];
  let packets = 0, recognizedPackets = 0, rejectedPackets = 0, command40 = 0;
  const wireCounts: Record<string, number> = {}, observedOpcodeCounts: Record<string, number> = {};
  let sameTraceDeterministic = true, skippedPackets = 0;
  const selected = files.slice(0, 3);
  for (const file of selected) {
    const data = gunzipSync(readFileSync(resolve(fixtureRoot, file)), { maxOutputLength: 16 * 1024 * 1024 });
    const document: unknown = JSON.parse(data.toString('utf8'));
    if (!document || typeof document !== 'object' || !Array.isArray((document as { steps?: unknown }).steps)) throw new Error('Invalid private fixture schema');
    const recorder = new WireRecorder(); recorder.open(1, 'duel');
    let selectedPackets = 0;
    for (const step of (document as { steps: { out?: unknown; v?: number }[] }).steps) {
      // Only view zero, preserving recorded order; cap the diagnostic work per file.
      if (step.v !== 0 || !Array.isArray(step.out)) continue;
      for (const output of step.out) {
        if (selectedPackets >= 100) break;
        if (!Array.isArray(output) || output.length !== 2 || typeof output[0] !== 'number' || typeof output[1] !== 'string' || !/^(?:[0-9a-f]{2})*$/.test(output[1])) throw new Error('Invalid private output schema');
        const [id, hex] = output as [number, string];
        const payload = new Uint8Array(Buffer.from(hex, 'hex'));
        if (payload.length > 65535) continue;
        recorder.message(1, 'in', { id, param: selectedPackets + 1, data: payload });
        const key = `0x${id.toString(16)}`; wireCounts[key] = (wireCounts[key] ?? 0) + 1;
        if (id === 0x6202 && payload.length % 40 === 0) command40++;
        packets++; selectedPackets++;
      }
    }
    const compared = compareReplay(recorder.snapshot(), duelReplayAdapter);
    sameTraceDeterministic &&= compared.deterministic;
    recognizedPackets += compared.first.supported; rejectedPackets += compared.first.unsupported;
    skippedPackets += compared.first.skipped;
    for (const [opcode, count] of Object.entries(compared.first.supportedOpcodeCounts)) observedOpcodeCounts[opcode] = (observedOpcodeCounts[opcode] ?? 0) + count;
  }
  return { source: 'private legacy reference translator outputs; NOT new-client parity evidence', available: files.length > 0,
    filesAvailable: files.length, filesRead: selected.length, packetLimitPerFile: 100,
    packets, recognizedPackets, rejectedPackets, legacy40ByteCommandPackets: command40,
    wireCounts, observedOpcodeCounts, sameTraceDeterministic, skippedPackets, creditedGameplayFlows: 0,
    gap: files.length ? 'Capture current passcode-wire messages from the new client and compare to an independent visible-state/response oracle.' : 'Private recordings are unavailable; capture current new-client traces.' };
}

it('reports explicit unverified acceptance gaps and actual observed reducer opcode counts', () => {
  expect(new Set(acceptanceInventory.map(f => f.id)).size).toBe(acceptanceInventory.length);
  expect(acceptanceInventory.length).toBeGreaterThan(65);
  for (const flow of acceptanceInventory) { expect(flow.acceptance.length).toBeGreaterThan(15); if (flow.status === 'verified') expect(flow.evidence.length).toBeGreaterThan(0); }
  // Every verified flow names a browser acceptance test that exists and records that flow.
  for (const flow of acceptanceInventory.filter(f => f.status === 'verified')) {
    const e = acceptanceEvidence(flow.id)!, file = e.test.split(' > ')[0]!;
    expect(existsSync(resolve(import.meta.dirname, '..', file)), `${flow.id}: ${file}`).toBe(true);
    expect(readFileSync(resolve(import.meta.dirname, '..', file), 'utf8'), `${flow.id} is recorded by ${file}`).toContain(`'${flow.id}'`);
    expect(e.observed.length, flow.id).toBeGreaterThan(10);
  }
  const synthetic = syntheticEvidence(); expect(synthetic.deterministic).toBe(true); expect(synthetic.supported).toBe(12);
  const gaps = acceptanceGaps(); const fixtureProbe = privateFixtureProbe();
  if (fixtureProbe.available) expect(fixtureProbe.sameTraceDeterministic).toBe(true);
  const report = { schema: 1, parityPassed: gaps.length === 0 && synthetic.deterministic,
    verifiedFlows: acceptanceInventory.length - gaps.length, totalFlows: acceptanceInventory.length,
    gaps, synthetic, legacyFixtureProbe: fixtureProbe,
    missingEvidence: ['No independent expected-state/response oracle for a current-wire gameplay capture.',
      'Outgoing responses, rendering, audio and HTTP flows require separate assertions; their payloads are not recorded.',
      'Observed opcode counts are not a denominator of all supported protocol behaviors.'] };
  const reportPath = process.env.PARITY_REPORT_PATH;
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
});
