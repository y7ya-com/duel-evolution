// yo2TgtAvaListDlg.cpp: CTgtAvaListDlg, the "which avatar?" list that pops up when a click on the map hits several
// avatars. (GameCtrl, which other code reaches through this header, is in yo2GameCtrl.h.)
// What the list does with the avatars it lists (the area map's NPC lookups, the player info / NPC talk windows a pick
// opens) goes through yo2TgtAvaListExtern.h.
#pragma once
#include <cstdint>

#include "Game/yo2GameCtrl.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CWindowModelList;
class CChibiAvatarMng;
class CChibiAvatar;

class CTgtAvaListDlg : public CEasyTask {
public:
    enum : uint32_t {
        OPEN_INFO = 1,     // picking an avatar opens its player info (or talks to the NPC)
        CLOSE_ON_PICK = 2,
    };
    static CTgtAvaListDlg* create(CTask* parent, uint32_t priority, uint32_t flags, CChibiAvatarMng* mng);
    CTgtAvaListDlg();
    ~CTgtAvaListDlg() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    // Lists the avatars at world (wx, wy) but `exclude` (the player's own) at screen x, y; false if there are none.
    bool open(int32_t x, int32_t y, int32_t wx, int32_t wy, CChibiAvatar* exclude);
    void close();

    uint32_t flags_ = 0;                         // 0x70
    CTaskPtr<CWindowModelList> list_;            // 0x74
    CTaskPtr<CChibiAvatarMng> avatarMng_;        // 0x80
    vc6::vector<CChibiAvatar*> avatars_;         // 0x8c the avatars listed
    CTaskPtr<CChibiAvatar> target_;              // 0x9c
};
YO2_AT(CTgtAvaListDlg, flags_, 0x70);
YO2_AT(CTgtAvaListDlg, list_, 0x74);
YO2_AT(CTgtAvaListDlg, avatarMng_, 0x80);
YO2_AT(CTgtAvaListDlg, avatars_, 0x8c);
YO2_AT(CTgtAvaListDlg, target_, 0x9c);
YO2_SIZEOF(CTgtAvaListDlg, 0xa8);

// The MSVC6 algorithm instances open() uses, on CChibiAvatar* ranges.
CChibiAvatar** avatarFind(CChibiAvatar** first, CChibiAvatar** last, CChibiAvatar* const& v);
CChibiAvatar** avatarRemoveCopy(CChibiAvatar** first, CChibiAvatar** last, CChibiAvatar** out, CChibiAvatar* const& v);
CChibiAvatar** avatarCopy(CChibiAvatar* const* first, CChibiAvatar* const* last, CChibiAvatar** out);
