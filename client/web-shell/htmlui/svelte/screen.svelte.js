// A Svelte component as a bridge screen module (CONTRACT.md: classes / mode / mount / update / unmount ...). The
// window's snapshot is one $state.raw value, replaced whole each changed frame (no deep proxy of the snapshot): the
// component derives everything from it ($derived), so nothing it shows can outlive the snapshot it came from.
// flushSync: the DOM is current when update() returns, as with the plain screens (the bridge clips and stacks after).
import { mount, unmount, flushSync } from 'svelte';

export class View {
  win = $state.raw(null);
  constructor(win, api) { this.win = win; this.api = api; }
}

// components: { [window class]: Component }; mod: the rest of the screen module (mode, parts, clip, hide, backdrop ...)
export function screen(components, mod = {}) {
  return {
    ...mod,
    classes: Object.keys(components),
    mount(win, root, api) {
      const view = new View(win, api), app = mount(components[win.cls], { target: root, props: { view } });
      flushSync();
      return { view, app };
    },
    update(win, prev, root, api, st) {
      if (st.view.win === win) return;
      st.view.win = win;
      st.view.api = api;
      flushSync();
    },
    unmount(root, st) { unmount(st.app); },
  };
}
