// main's page-level modules that bridge.js runs every frame beside the screens (bridge.js: tradeOverlayFrame,
// wardrobeLauncherFrame, missionsLauncherFrame), mounted unchanged and fed the rewrite's snapshot (layer.ts). Each one
// reads the menu bar (CWindowModelMenu's CWindowTaskPictureSwitch buttons) or the trade window from the snapshot and
// places itself over #canvas (deck-stage.ts keeps one over the stage). They talk to the server themselves
// (/api/de/cosmetics, /api/de/rewards, the trade's cosmetics), same-origin with the session cookie, so they run online
// only. Loaded on demand: the modules touch the DOM.
import type { HtmlSnapshot } from './snapshot';

/** The trade scene's engine number on main (trade-cosmetics.js CARD_SWAP): the trade overlay comes up only there. */
const CARD_SWAP = 0x26;

export interface PageModulesView {
  /** Online (cosmetics, rewards): the modules run; offline they stay down. */
  online(): boolean;
  /** The overworld with its menu bar (the rewrite's lobby, no full-screen overlay): the launchers' place. */
  overworld(): boolean;
  /** The rewrite's Card Swap trade window is up (trade.ts tradeScene). */
  trade(): boolean;
  /** A scene's loading veil is up and not yet fading (scene-loading.ts sceneVeilUp): the launchers wait under it and come
   * back as it starts to fade, fading in with it (main bridge.js wait). */
  veil?(): boolean;
}

type Frames = {
  wardrobe: (snap: unknown, wait?: boolean) => void;
  missions: (snap: unknown, wait?: boolean) => void;
  trade: (snap: unknown, wait?: boolean) => void;
};

/** main's starter deck chooser (client/web-shell/starter.js window.yo2Starter; htmlui/starter.ts opens it over the lobby). */
const starterOpen = () => !!(globalThis as { yo2Starter?: { open?: boolean } }).yo2Starter?.open;

export function pageModules(view: PageModulesView, onError: (e: unknown) => void = e => console.warn('htmlui: page modules', e)) {
  let frames: Frames | null = null, loading = false, dead = false, failed = 0, picking = false;
  let rewards: { getView(opts?: { force?: boolean }): Promise<unknown> } | null = null;
  const load = () => {
    if (loading) return; loading = true;
    Promise.all([import('@htmlui/cosmetics/wardrobe-launcher.js'), import('@htmlui/rewards/launcher.js'), import('@htmlui/cosmetics/trade-cosmetics.js'), import('@htmlui/rewards/api.js')])
      .then(([w, m, t, r]) => { if (!dead) { frames = { wardrobe: w.wardrobeLauncherFrame, missions: m.missionsLauncherFrame, trade: t.tradeOverlayFrame }; rewards = r; } }, onError);
  };
  const run = (name: keyof Frames, snap: unknown, wait: boolean) => {
    try { frames?.[name](snap, wait); } catch (e) { if (failed++ < 5) onError(e); }
  };
  return {
    /** Each draw of the layer (and its once-a-second tick): bridge.js's per-frame calls. */
    frame(snap: HtmlSnapshot | null): void {
      if (dead) return;
      const on = !!snap && view.online();
      if (!on && !frames) return;
      if (!frames) { load(); return; }
      // the starter deck chooser sits over the lobby, so the Missions button stays up and keeps the view it read on
      // arriving (launcher.js asks again only on coming back to the bar, or after a minute). Its claim saves the deck
      // (app.ts claimStarter: PUT /api/de/decks, the server's "Save a playable owned deck" mission): once it closes, ask
      // the server again, and the badge (api.js onChange) shows the reward ready to claim at once
      const pick = on && starterOpen();
      if (picking && !pick && on) rewards?.getView({ force: true }).catch(() => {});
      picking = pick;
      const trade = on && view.trade(), veil = !!view.veil?.();
      // the launchers live on the overworld's bar; away from it (a duel, the deck editor, the shop, a trade) they go
      run('wardrobe', snap, !on || trade || veil || !view.overworld());
      run('missions', snap, !on || trade || veil || !view.overworld());
      // the trade panel keys on Card Swap's scene number: the rewrite's trade opens over its lobby
      run('trade', trade ? { ...snap, scene: CARD_SWAP } : snap, !trade);
    },
    dispose(): void {
      if (frames) for (const k of ['wardrobe', 'missions', 'trade'] as const) run(k, null, true);
      dead = true; frames = null; rewards = null;
    },
  };
}
