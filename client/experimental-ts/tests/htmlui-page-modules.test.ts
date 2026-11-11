// main's page modules in the rewrite (src/ui/htmlui/page-modules.ts): the Missions button's badge counts the rewards
// ready to claim from its cached /api/de/rewards view; the starter chooser over the lobby saves the claimed deck (the
// "Save a playable owned deck" mission), so its closing asks the server again. And the rewrite's keys stay off main's
// card shop, whose MP (i) (shop/mpinfo.js .mpi) is live's 16 px round plate.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getView = vi.fn(async () => ({}));
vi.mock('@htmlui/cosmetics/wardrobe-launcher.js', () => ({ wardrobeLauncherFrame: vi.fn() }));
vi.mock('@htmlui/rewards/launcher.js', () => ({ missionsLauncherFrame: vi.fn() }));
vi.mock('@htmlui/cosmetics/trade-cosmetics.js', () => ({ tradeOverlayFrame: vi.fn() }));
vi.mock('@htmlui/rewards/api.js', () => ({ getView, peekView: () => null }));
import { pageModules } from '../src/ui/htmlui/page-modules';
import { CLIENT_CSS } from '../src/ui/styles';

afterEach(() => { vi.unstubAllGlobals(); getView.mockClear(); });
const snap = { v: 1, frame: 1, scene: 0, mouse: null, focus: 0, windows: [], tasks: [], cursor: null } as never;

describe('page modules: the Missions badge after the starter chooser', () => {
  it('asks the rewards view again once the starter chooser closes', async () => {
    const starter = { open: false };
    vi.stubGlobal('yo2Starter', starter);
    const mods = pageModules({ online: () => true, overworld: () => true, trade: () => false });
    mods.frame(snap);   // loads the modules
    await new Promise(r => setTimeout(r, 50));
    mods.frame(snap);
    expect(getView).not.toHaveBeenCalled();
    starter.open = true; mods.frame(snap); mods.frame(snap);
    expect(getView).not.toHaveBeenCalled();
    starter.open = false; mods.frame(snap);
    expect(getView).toHaveBeenCalledWith({ force: true });
    mods.frame(snap);
    expect(getView).toHaveBeenCalledTimes(1);
    mods.dispose();
  });
  it('offline it never asks', async () => {
    const starter = { open: true };
    vi.stubGlobal('yo2Starter', starter);
    const mods = pageModules({ online: () => false, overworld: () => true, trade: () => false });
    mods.frame(snap); starter.open = false; mods.frame(snap);
    expect(getView).not.toHaveBeenCalled();
  });
});

describe('main\'s card shop keeps its own buttons', () => {
  it('the rewrite\'s key looks skip .de-card-shop (its MP (i) stays a 16 px round plate)', () => {
    const skin = readFileSync(new URL('../src/ui/skin.ts', import.meta.url), 'utf8');
    for (const css of [CLIENT_CSS, skin]) for (const rule of css.split('\n').filter(l => /^\.de-client (button(\.gold)?[ ,:]|:is\(button)/.test(l)))
      expect(rule.split('{')[0]).toContain('.de-card-shop *');
  });
});
