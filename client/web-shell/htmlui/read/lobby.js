// The lobby's own window state, over read.js's helpers: a player's card (CPlayerListMenu,
// src/Lobby/yo2PlayerListMenu.h) knows whose it is: pid_ +0x4d8 (COnlinePlayer::pid / PlayerListEntry::pid, YO2_AT
// pinned) and level_ +0x4f8, so screens/lobby.js can ask GET /api/de/rank?pid= for that player's standing (an NPC's
// card is the same class: its pid is the NPC's, under PID_BASE, and the server answers known: false).
export default ({ i32 }) => ({
  windows: {
    CPlayerListMenu: w => ({ pid: i32(w + 0x4d8), level: i32(w + 0x4f8) }),
  },
});
