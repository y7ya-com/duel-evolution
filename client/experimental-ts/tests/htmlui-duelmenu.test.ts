import { describe, expect, it } from 'vitest';
// main's duel menu (999cf53 / cea1f39): the rewrite's Duel menu, Auto Duel and Create Duel go through main's
// screens/duelsetup.js prep(), whose relayout gives the legacy skin's clearer layout; ranked is Auto Duel only (a5adb7c)
import { relayout } from '@htmlui/screens/duelsetup.js';
import menu from '@htmlui/mock/duelsetup-menu.json';
import wait from '@htmlui/mock/duelsetup-wait.json';
import { CHALLENGE_WAIT_MS, lobbyErrorText } from '../src/network/session';

type C = { text?: string; label?: string; shown?: boolean };
const words = (w: { controls: C[] }) => w.controls.filter(c => c.shown !== false).map(c => c.text ?? c.label ?? '');
const first = (m: unknown) => (Array.isArray(m) ? m[0] : (m as { windows?: unknown[] }).windows?.[0] ?? m) as { cls: string; controls: C[] };

describe('htmlui duel menu (main 999cf53)', () => {
  it('labels Auto Duel ranked and Create Duel unranked, with the counts under them', () => {
    const out = words(relayout(first(menu)));
    expect(out).toContain('Auto Duel (Ranked)');
    expect(out).toContain('Create Duel (Unranked)');
    expect(out.some(t => /^Players searching: \d+$/.test(t))).toBe(true);
    expect(out.some(t => /^Open rooms: \d+$/.test(t))).toBe(true);
  });
  it('says a created duel never changes the rating', () => {
    const out = words(relayout(first(wait)));
    expect(out).toContain('Create Duel (Unranked)');
    expect(out.join('\n')).toMatch(/Created duels don't change your rating/);
  });
});

describe('duel requests always resolve (main cea1f39)', () => {
  it('gives up a request after 45 s with the no-answer text', () => {
    expect(CHALLENGE_WAIT_MS).toBe(45_000);
    expect(lobbyErrorText(-616)).toBe('There is no response from your opponent.');
    expect(lobbyErrorText(-600)).toBe('The opponent has left the lobby.');
  });
});
