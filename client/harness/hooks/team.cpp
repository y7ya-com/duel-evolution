// src/team rewrites under the original ABI: the field accessors (src/team/yo2TeamFlagFields.cpp), which link without
// the rest of the team code. The state machine and the loader are checked by tests/ui_team.
#include <new>

#include "../yo2hook.h"
#include "team/yo2TeamFlag.h"

// IFlagLoadContext slots: ECX is the manager's IFlagLoadContext part (manager + 0x70).
static CTeamFlagManager* manager(IFlagLoadContext* ctx) { return static_cast<CTeamFlagManager*>(ctx); }
YO2_HOOK TeamFlagMap* __thiscall yo2_b05330(IFlagLoadContext* ctx) { return manager(ctx)->CTeamFlagManager::flags(); }
YO2_HOOK bool __thiscall yo2_b05350(IFlagLoadContext* ctx) { return manager(ctx)->CTeamFlagManager::changed(); }
YO2_HOOK void __thiscall yo2_b05370(IFlagLoadContext* ctx, bool on) { manager(ctx)->CTeamFlagManager::setChanged(on); }
YO2_HOOK bool __thiscall yo2_b05d50(IFlagLoadContext* ctx, IFlagLoadState* s) {
    return manager(ctx)->CTeamFlagManager::setState(s);
}

YO2_HOOK bool __thiscall yo2_b06380(CTeamFlagLoader* l) { return l->CTeamFlagLoader::onInit(); }
YO2_HOOK void __thiscall yo2_b06890(CTeamFlagLoader* l) { l->reset(); }

YO2_HOOK TeamFlagBuffer* __thiscall yo2_b05f10(void* p) { return new (p) TeamFlagBuffer; }
YO2_HOOK void __thiscall yo2_b06080(TeamFlagBuffer* b) { b->clear(); }
