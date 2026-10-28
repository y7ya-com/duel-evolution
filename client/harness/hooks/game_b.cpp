// src/Game rewrites under the original ABI (game-b's file).
#include "../yo2hook.h"
#include "Game/yo2TgtAvaListDlg.h"

YO2_HOOK CChibiAvatar** __cdecl yo2_adad10(CChibiAvatar** a, CChibiAvatar** b, CChibiAvatar* const* v) {
    return avatarFind(a, b, *v);
}
YO2_HOOK CChibiAvatar** __cdecl yo2_adad40(CChibiAvatar** a, CChibiAvatar** b, CChibiAvatar** o, CChibiAvatar* const* v) {
    return avatarRemoveCopy(a, b, o, *v);
}
YO2_HOOK CChibiAvatar** __cdecl yo2_adac90(CChibiAvatar** a, CChibiAvatar** b, CChibiAvatar** o) { return avatarCopy(a, b, o); }
YO2_HOOK CChibiAvatar** __cdecl yo2_adacd0(CChibiAvatar** a, CChibiAvatar** b, CChibiAvatar** o) { return avatarCopy(a, b, o); }
