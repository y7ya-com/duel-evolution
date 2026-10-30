// Select Player (CWindowPlayerSelect, src/PlayerSelect/yo2PlayerSelect.cpp) in HTML. The frame, help text, rows,
// levels, Delete and Back are the generic controls (controls/basic.js); what is Select Player's own is the waist-up
// avatar of the hovered character, which the engine keeps drawing under the DOM. The bust's sprites hang off the
// scene (waistUpAvatarNew(CPlayerSelectScene, this, ...)), but the parts it is composed from each frame
// (CAvatarTexMaker) hang off the window's one plain CElement child: hidden with the window, the bust stops animating
// (live: frozen on hover, owner's report), so that element passes.
export default {
  classes: ['CWindowPlayerSelect'],
  mode: 'pass',
  passthrough: x => x.cls === 'CWaistUpAvatar' || x.cls === 'CElement',
  mount: () => new Map(),
  update(win, prev, root, api, st) { api.syncWindow(root, win, st); },
  unmount(root, st) { root.replaceChildren(); st.clear(); },
};
