// Every room the server announces shows at its My Room door, whatever the player's level. The door's room list
// (FUN_0082e170) shows an entry only if (LV <= 1 and kind == 1) or (LV >= 2 and kind != 1): an LV 0-1 player got
// only the Beginners' Room at the red door and "Room not available" at the blue one (Domino City unreachable), and
// LV 2+ never saw the Beginners' Room again. hooks.py swaps the second test's immediates for these: LV >= 0 and
// kind != 0 (no door lists kind 0), so every entry passes.
#include <stdint.h>

uint32_t rc_room_min_lv = 0, rc_room_hidden_kind = 0;
