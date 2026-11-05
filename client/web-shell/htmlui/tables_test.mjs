import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeClasses } from './tables.js';
import VT from './vtables.js';

test('class extension: primary owners before any instance, disable, timeout, old runtime bounds', () => {
  const H = new Uint32Array(300).fill(0xdeadbeef), addr = 16;
  writeClasses(H, 0, 255, () => true, true);
  assert.ok(H.every(v => v === 0xdeadbeef));
  writeClasses(H, addr, 255, c => c === 'CWindowPlayerSelect', true);
  assert.equal(H[4], 1);
  assert.deepEqual(VT[H[5]], ['CWindowPlayerSelect', 0]);
  assert.equal(H[3], 0xdeadbeef);
  assert.equal(H[6], 0xdeadbeef);
  writeClasses(H, addr, 255, () => false, true);
  assert.equal(H[4], 0);
  writeClasses(H, addr, 255, () => true, false);
  assert.equal(H[4], 0);
  writeClasses(H, addr, 1, () => true, true);
  assert.equal(H[4], 1);
  assert.equal(H[6], 0xdeadbeef);
});

test('generic ownership registry follows the window hierarchy, excludes controls', async () => {
  const { WINDOWS } = await import('./tables.js');
  const { readdirSync, readFileSync } = await import('node:fs');
  const base = new URL('../../include/yo2/', import.meta.url), bases = new Map();
  for (const file of readdirSync(base, { recursive: true }).filter(f => f.endsWith('.h'))) {
    const s = readFileSync(new URL(file, base), 'utf8');
    for (const [, cls, parents] of s.matchAll(/class\s+(\w+)\s*:\s*([^\{]+)\{/g))
      bases.set(cls, [...parents.matchAll(/(?:public|protected|private)\s+(\w+)/g)].map(m => m[1]));
  }
  const window = (c, seen = []) => c === 'CWindowTaskModel' || !seen.includes(c) &&
    (bases.get(c) || []).some(b => window(b, [...seen, c]));
  assert.deepEqual([...WINDOWS].sort(), [...bases.keys()].filter(c => window(c)).sort());
  assert.ok(WINDOWS.has('CWindowPlayerSelect'));
  assert.ok(!WINDOWS.has('CWindowTaskButtonMain'));
});
