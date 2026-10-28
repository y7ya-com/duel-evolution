// PARTIAL (see yo2ChibiAvatarManager.h).
#include "Game/Avatar/yo2ChibiAvatarManager.h"

#include "Game/Avatar/yo2ChibiAvatar.h"

// @yo2 0x009d4ee0 ChibiStateTable::allows: `state` has a row and it has every bit of `flags`
bool ChibiStateTable::allows(int32_t state, uint32_t flags) const {
    for (int32_t i = 0; i < count; i++)
        if (rows[i][0] == state)
            return (static_cast<uint32_t>(rows[i][1]) & flags) == flags;
    return false;
}

// @yo2 0x009d37b0 CChibiAvatarMng::lockLoader: true if `who` may load now (nobody else is)
bool CChibiAvatarMng::lockLoader(CChibiAvatar* who) {
    if (loading_ && loading_ != who)
        return false;
    loading_ = who;
    return true;
}

// @yo2 0x009d37f0 CChibiAvatarMng::unlockLoader
void CChibiAvatarMng::unlockLoader(CChibiAvatar* who) {
    if (loading_ == who)
        loading_ = nullptr;
}
