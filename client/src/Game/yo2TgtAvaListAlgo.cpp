// yo2TgtAvaListDlg.cpp's MSVC6 algorithm instances on CChibiAvatar* ranges (their own file so the difftest can
// link them without the avatar classes).
#include "Game/yo2TgtAvaListDlg.h"

// @yo2 0x00adad10 find<CChibiAvatar**>
CChibiAvatar** avatarFind(CChibiAvatar** first, CChibiAvatar** last, CChibiAvatar* const& v) {
    while (first != last && *first != v)
        ++first;
    return first;
}

// @yo2 0x00adad40 remove_copy<CChibiAvatar**>
CChibiAvatar** avatarRemoveCopy(CChibiAvatar** first, CChibiAvatar** last, CChibiAvatar** out, CChibiAvatar* const& v) {
    for (; first != last; ++first)
        if (*first != v)
            *out++ = *first;
    return out;
}

// @yo2 0x00adac90 copy<CChibiAvatar**>
// @yo2 0x00adacd0 copy<CChibiAvatar**> (a second instance)
CChibiAvatar** avatarCopy(CChibiAvatar* const* first, CChibiAvatar* const* last, CChibiAvatar** out) {
    for (; first != last; ++first)
        *out++ = *first;
    return out;
}
