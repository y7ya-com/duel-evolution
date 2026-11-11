// The lobby's reader extension (screens/lobby.js), two parts:
// - a player's card (CPlayerListMenu, src/Lobby/yo2PlayerListMenu.h) knows whose it is: pid_ +0x4d8 (COnlinePlayer::pid
//   / PlayerListEntry::pid, YO2_AT pinned) and level_ +0x4f8, so screens/lobby.js can ask GET /api/de/rank?pid= for that
//   player's standing (an NPC's card is the same class: its pid is the NPC's, under PID_BASE, and the server answers
//   known: false);
// - a CWindowTaskHelp's size. The player / NPC card (CPlayerListMenu, CNpcListMenu: src/Lobby/yo2PlayerListMenu.cpp,
//   yo2NpcListMenu.cpp) is built of Helps, a text on a back plane (include/yo2/System/CWindowTaskHelp.h: back plane
//   +0x36c, text +0x378), placed with windowHelpSetPosition (0x00596470: +0x384 / +0x388 and pos_) and sized with
//   windowHelpSetSize (0x00598d80: +0x38c / +0x390, then layout; src/Lobby/yo2LobbyExtern.h). The base reader has its
//   place (pos_) but no size (an unknown class): w, h from +0x38c / +0x390, floats as the setters take them; a value
//   that can't be a size (an older layout) is left out.
export default ({ i32, f32 }) => ({
  windows: {
    CPlayerListMenu: w => ({ pid: i32(w + 0x4d8), level: i32(w + 0x4f8) }),
  },
  controls: {
    CWindowTaskHelp: c => {
      const w = f32(c + 0x38c), h = f32(c + 0x390);
      return [w, h].every(v => Number.isFinite(v) && v >= 0 && v < 4096) ? { w, h } : {};
    },
  },
});
