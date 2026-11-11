// The Discord pieces wired to the rewrite's page (main's screens/chat.js hub, playerlist.js poll, duels.js step):
// - open duels: polled every 5 s while the chat's Duels tab is shown (or a ?duel= link waits), every 20 s otherwise;
// - Discord duelists: on entering the world and every 30 s;
// both only while the player is in the online world (a lobby shown, connected). Join: discord.ts joinDuel, then the
// rewrite's duelChallenge to the creator; a Discord row: live's Discord duelist card (windows.ts discordCard, the bust
// under it: index.ts), one card at a time (another player's card open is closed first).
import type { ClientCommand, ClientView } from '../contracts';
import { CHAT_TABS, type HtmlUiLocal } from './windows';
import { capturePending, deeplinkJoiner, fetchDiscordOnline, fetchDuels, joinDuel, readPending, type DiscordDuelist, type FetchLike } from './discord';

export const DUELS_FAST = 5000, DUELS_SLOW = 20000, DISCORD_POLL = 30000;
const DUELS_TAB = CHAT_TABS.findIndex(t => t.key === 'duels');

type Timer = ReturnType<typeof setTimeout>;
export interface DiscordWireDeps {
  ui: HtmlUiLocal; state: () => ClientView; send: (command: ClientCommand) => void; rerender: () => void;
  fetch?: FetchLike; base?: string; search?: string; store?: Parameters<typeof capturePending>[1];
  now?: () => number; setTimer?: (f: () => void, ms: number) => Timer; clearTimer?: (t: Timer) => void;
}

export const inWorld = (s: ClientView) => s.scene === 'lobby' && s.mode !== 'free' && s.connection === 'online' && !!s.lobby?.connected;
export const discordCardText = (p: DiscordDuelist) => [`${p.name} (Discord)`, `LV ${p.lv}`, p.rank?.label ? `Rank: ${p.rank.label}` : ''].filter(Boolean).join('\n');

export function discordWire(deps: DiscordWireDeps) {
  const f: FetchLike = deps.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const base = deps.base ?? ((globalThis as { ENV?: { YO2_DE_HTTP?: string } }).ENV?.YO2_DE_HTTP || '');
  const now = deps.now ?? Date.now, setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)), clearT = deps.clearTimer ?? (t => clearTimeout(t));
  const store = deps.store;
  if (deps.search !== undefined) capturePending(deps.search, store, now());
  const ui = deps.ui;
  const pidOf = (name: string) => deps.state().lobby?.avatars.find(a => a.name === name)?.id ?? null;
  const challenge = (pid: number) => deps.send({ type: 'duelChallenge', playerId: pid });
  const say = (text: string) => { ui.dialog = { kind: 'ok', text }; deps.rerender(); };
  const joiner = deeplinkJoiner({ fetch: f, base, inWorld: () => inWorld(deps.state()), pidOf, challenge, say, now, ...(store !== undefined ? { store } : {}) });
  let duelsTimer: Timer | null = null, discordTimer: Timer | null = null, on = false, dead = false, joining = false, gen = 0;

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const pollDuels = async () => {
    duelsTimer = null; if (!on || dead) return;
    const g = gen, r = await fetchDuels(f, base);
    if (!on || dead || g !== gen) return;
    if (r && !same(r.duels, ui.duels)) { ui.duels = r.duels; deps.rerender(); }
    joiner.tick();
    const fast = ui.chatTab === DUELS_TAB || readPending(store, now()) !== null;
    duelsTimer = setT(() => void pollDuels(), fast ? DUELS_FAST : DUELS_SLOW);
  };
  const pollDiscord = async () => {
    discordTimer = null; if (!on || dead) return;
    const g = gen, r = await fetchDiscordOnline(f, base);
    if (!on || dead || g !== gen) return;
    if (r && !same(r, ui.discord)) { ui.discord = r; deps.rerender(); }
    discordTimer = setT(() => void pollDiscord(), DISCORD_POLL);
  };
  const stop = () => { on = false; gen++; if (duelsTimer) clearT(duelsTimer); if (discordTimer) clearT(discordTimer); duelsTimer = discordTimer = null; };

  ui.onJoinDuel = id => {
    if (joining) return; joining = true;
    void joinDuel(f, id, pidOf, challenge, base).then(r => { joining = false; if (!r.ok) say(r.message); });
  };
  ui.onDiscordCard = p => {
    const card = deps.state().profileDetail;
    if (card && card.selectedPid !== null && card.selectedPid !== card.selfPid) deps.send({ type: 'profileAction', action: { type: 'close' } });
    ui.discordCard = p; deps.rerender();
  };

  return {
    /** each render: start the polls on entering the world, stop them on leaving; the ?duel= auto-join's step */
    tick(): void {
      if (dead) return;
      const world = inWorld(deps.state());
      if (world && !on) { on = true; void pollDuels(); void pollDiscord(); }
      else if (!world && on) stop();
      if (world) joiner.tick();
    },
    dispose(): void { dead = true; stop(); },
    get polling() { return on; },
  };
}
