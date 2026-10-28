// What the lobby's room / match / chat / pack handlers need from other subsystems. Each is a call (or global write)
// in the exe that belongs to another folder; the game provides them, tests stub them.
#pragma once
#include <cstdint>
#include <string>

// FUN_006054f0 (System): MultiByteToWideChar with the game's code page (DAT_0127035c), for the chat log.
std::u16string lobbyWiden(const char* s);
// 0x43a0 with mode 1: *(DAT_012bb6b0 + 0x9c) = 1 and DAT_00cd82dc = pid (Game's auto-duel globals).
void lobbyAutoDuelStarted(int32_t pid);
// FUN_0085e1a0 (Lobby/) on *(DAT_012711ac + 0xc50): the friend list's player ids (count at +0x65ec).
int lobbyFriendCount();
uint32_t lobbyFriendId(int i);
