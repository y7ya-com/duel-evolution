// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp) in HTML. The frame, help text, rows,
// levels, Delete and Back are the generic controls (controls/basic.js); what is Select Player's own is the waist-up
// avatar of the hovered character, which the engine keeps drawing under the DOM.
export default {
  classes: ['CWindowPlayerSelect'],
  mode: 'pass',
  passthrough: x => x.cls === 'CWaistUpAvatar',
  mount: () => new Map(),
  update(win, prev, root, api, st) { api.syncWindow(root, win, st); },
  unmount(root, st) { root.replaceChildren(); st.clear(); },
};
