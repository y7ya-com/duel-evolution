import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as K from '../../../server/src/duel/translator/consts';
import * as L from '../../../server/src/duel/translator/lockstep';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';

/** Every engine command (0x6202 type 0), record type and view sub-command the server can emit must reach a handler in
 * model.ts: none may fall to missing('Unknown engine command...'), 'Unknown command record type' or
 * 'Unknown view/prompt command'. The list is read from the server source itself, so a new command added there fails
 * here until the rewrite's model handles it. */
const SERVER = join(__dirname, '../../../server/src/duel');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : name.endsWith('.ts') ? [path] : [];
  });
}
const exported: Record<string, unknown> = { ...L, ...K };
function resolve(file: string, name: string): number[] {
  if (/^0x[0-9a-f]+$|^\d+$/i.test(name)) return [Number(name)];
  const bare = name.replace(/^K\./, '');
  const value = exported[bare] ?? (() => {
    const local = new RegExp(`\\b${bare}\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)`).exec(readFileSync(file, 'utf8'));
    return local ? Number(local[1]) : undefined;
  })();
  if (typeof value === 'number') return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) return value as number[];
  throw new Error(`${file}: cannot resolve ${name}`);
}
function emitted(): { engine: Set<number>; kinds: Set<number>; views: Set<number> } {
  const out = { engine: new Set<number>(), kinds: new Set<number>(), views: new Set<number>() };
  for (const file of sources(SERVER)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bengine\(\s*((?:K\.)?[A-Za-z_][A-Za-z_0-9]*|0x[0-9a-fA-F]+)/g)) {
      if (m[1] === 'cmd') continue;   // the definition itself
      for (const v of resolve(file, m[1])) out.engine.add(v);
    }
    for (const m of text.matchAll(/\bsetcommand\(\s*((?:K\.)?T_[A-Z0-9_]+)(?:\s*,\s*((?:K\.)?[A-Za-z_][A-Za-z_0-9]*|0x[0-9a-fA-F]+))?/g)) {
      const [kind] = resolve(file, m[1]);
      out.kinds.add(kind);
      if ((kind === L.T_VIEW || kind === L.T_VIEW1C) && m[2]) for (const v of resolve(file, m[2])) out.views.add(v);
    }
  }
  return out;
}

describe('every server duel command has a client handler', () => {
  const found = emitted();
  const unknown = (data: Uint8Array) => {
    const state = reduceDuelMessage(createDuelState(), { id: 0x6202, data });
    return state.unsupported.filter((u) => /^Unknown (engine command|command record type|view\/prompt command)/.test(u.reason));
  };
  it('finds the server commands (sanity: the scan is not empty)', () => {
    expect(found.engine.size).toBeGreaterThan(40);
    for (const c of [L.C_DUEL_START, L.C_TURN_CHANGE, L.C_DUEL_END, L.C_DRAW, K.C_CHAIN_SET, K.C_COIN, K.C_DICE]) expect(found.engine).toContain(c);
    expect(found.kinds).toContain(L.T_VIEW);
  });
  it('handles every engine command (0x6202 type 0) the server emits', () => {
    const missing = [...found.engine].filter((cmd) => unknown(L.engine(cmd, 0)).length || unknown(L.engine(cmd, 1)).length);
    expect(missing.map((c) => `0x${c.toString(16)}`)).toEqual([]);
  });
  it('handles every record type and view sub-command the server emits', () => {
    const kinds = [...found.kinds].filter((kind) => kind !== L.T_VIEW && kind !== L.T_ENGINE && unknown(L.setcommand(kind, 0, [1, 0, 0])).length);
    const views = [...found.views].filter((b) => unknown(L.setcommand(L.T_VIEW, b, [1, 0, 0])).length);
    expect(kinds.map((c) => `0x${c.toString(16)}`)).toEqual([]);
    expect(views.map((c) => `0x${c.toString(16)}`)).toEqual([]);
  });
});
