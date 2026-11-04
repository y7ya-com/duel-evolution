// The lobby's reader extension (screens/lobby.js): a CWindowTaskHelp's size. The player / NPC card (CPlayerListMenu,
// CNpcListMenu: src/Lobby/yo2PlayerListMenu.cpp, yo2NpcListMenu.cpp) is built of Helps, a text on a back plane
// (include/yo2/System/CWindowTaskHelp.h: back plane +0x36c, text +0x378), placed with windowHelpSetPosition
// (0x00596470: +0x384 / +0x388 and pos_) and sized with windowHelpSetSize (0x00598d80: +0x38c / +0x390, then layout;
// src/Lobby/yo2LobbyExtern.h). The base reader has its place (pos_) but no size (an unknown class): w, h from
// +0x38c / +0x390, floats as the setters take them; a value that can't be a size (an older layout) is left out.
export default ({ f32 }) => ({
  controls: {
    CWindowTaskHelp: c => {
      const w = f32(c + 0x38c), h = f32(c + 0x390);
      return [w, h].every(v => Number.isFinite(v) && v >= 0 && v < 4096) ? { w, h } : {};
    },
  },
});
