// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp) in HTML. The frame, help text, rows,
// levels, Delete and Back are the generic controls (controls/basic.js); what is Select Player's own is the waist-up
// avatar of the hovered character, which the engine keeps drawing under the DOM.
// The level texts ("Lv01") are the window's own CWindowTaskTexts drawn at the row's z + 3 (onInit sets posZ_ and
// pos_.z, not the z_ the snapshot sorts by, which reads 0), so they go last: under the rows' buttons they vanish.
const level = c => c.cls === 'CWindowTaskText' && !c.parent;

export default {
  classes: ['CWindowPlayerSelect'],
  mode: 'pass',
  // the bust's parts are composed each frame (CAvatarTexMaker) under the window's one plain CElement child: hidden with
  // the window, the bust stopped animating (live: frozen on hover, owner's report; htmlui-select 0641ba2), so it passes
  passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement',
  mount: () => new Map(),
  update(win, prev, root, api, st) {
    api.syncWindow(root, { ...win, controls: [...win.controls.filter(c => !level(c)), ...win.controls.filter(level)] }, st);
  },
  unmount(root, st) { root.replaceChildren(); st.clear(); },
};
