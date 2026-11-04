#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowed = new Set(['--test', '--report', '--json', '--help']);
if (args.some(arg => !allowed.has(arg)) || (args.includes('--test') && args.some(arg => arg === '--report' || arg === '--json'))) {
  console.error('Usage: node tools/parity.mjs [--test | --report [--json]]'); process.exitCode = 2;
} else if (args.includes('--help')) {
  console.log('Default/--report: run parity tests and report acceptance gaps; exit 1 if coverage is missing.\n--json: emit machine-readable report.\n--test: run infrastructure tests only; success is NOT a gameplay parity claim.');
} else {
  const temporary = mkdtempSync(resolve(tmpdir(), 'experimental-client-parity-'));
  try {
    const reportPath = resolve(temporary, 'report.json');
    const result = spawnSync(process.execPath, [resolve(root, 'tools/run.mjs'), 'vitest', 'run',
      'tests/parity-replay.test.ts', 'tests/parity-duel.test.ts', 'tests/parity-report.test.ts'],
    { cwd: root, env: { ...process.env, PARITY_REPORT_PATH: reportPath }, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const log = (result.stdout ?? '') + (result.stderr ?? '');
    if (args.includes('--json')) process.stderr.write(log); else process.stdout.write(log);
    if (result.error || result.status !== 0) {
      console.error(result.error?.message ?? 'Parity tests failed; no acceptance claim is possible.'); process.exitCode = result.status || 2;
    } else if (args.includes('--test')) {
      console.log('Infrastructure tests passed. Gameplay acceptance remains unverified.');
    } else {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`\nGameplay parity gate: ${report.parityPassed ? 'PASS' : 'FAIL'} (${report.verifiedFlows}/${report.totalFlows} verified flows)`);
        console.log(`Synthetic current-wire reducer replay: ${report.synthetic.processed} packets; deterministic=${report.synthetic.deterministic}; supported=${report.synthetic.supported}; unsupported=${report.synthetic.unsupported}`);
        console.log('Observed supported opcode counts:', JSON.stringify(report.synthetic.supportedOpcodeCounts));
        const probe = report.legacyFixtureProbe;
        console.log(`Private legacy translator probe: ${probe.filesRead}/${probe.filesAvailable} files, ${probe.packets} packets, ${probe.rejectedPackets} rejected. Gameplay coverage credited: 0.`);
        for (const gap of report.gaps) console.log(`- ${gap.id} [${gap.status}]: ${gap.acceptance}`);
        console.log('\nNext: add dated new-client browser/response assertions for each flow in PARITY.md and src/parity/acceptance.ts. Synthetic replay and translator tests alone cannot close these gaps.');
      }
      process.exitCode = report.parityPassed ? 0 : 1;
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
