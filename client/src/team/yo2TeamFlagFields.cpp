// yo2TeamFlag.cpp's field accessors, in a file of their own: they have no other dependencies, so the difftest
// (harness/hooks/team.cpp) links them without the rest of the team code.
#include "yo2TeamFlag.h"

// @yo2 0x00b05330 CTeamFlagManager::flags (IFlagLoadContext slot 2)
TeamFlagMap* CTeamFlagManager::flags() { return &flags_; }
// @yo2 0x00b05d50 CTeamFlagManager::setState (IFlagLoadContext slot 3)
bool CTeamFlagManager::setState(IFlagLoadState* state) {
    state_ = state;
    return true;
}
// @yo2 0x00b05350 CTeamFlagManager::changed (IFlagLoadContext slot 4)
bool CTeamFlagManager::changed() { return changed_; }
// @yo2 0x00b05370 CTeamFlagManager::setChanged (IFlagLoadContext slot 5)
void CTeamFlagManager::setChanged(bool on) { changed_ = on; }

// @yo2 0x00b05f10 TeamFlagBuffer::TeamFlagBuffer
TeamFlagBuffer::TeamFlagBuffer() : data(nullptr), unk04{}, unk14(-1) {}

// @yo2 0x00b06080 TeamFlagBuffer::clear: free and reset (what the destructor runs)
void TeamFlagBuffer::clear() {
    if (data)
        ::operator delete(data);
    data = nullptr;
    unk04[0] = unk04[1] = unk04[2] = unk04[3] = 0;
    unk14 = -1;
}

// @yo2 0x00b06380 CTeamFlagLoader::onInit
bool CTeamFlagLoader::onInit() {
    finished_ = busy_ = ok_ = false;
    task_ = nullptr;
    return true;
}

// @yo2 0x00b06890 CTeamFlagLoader::reset (labelled 3rd-party): forget the last result, unless downloading
void CTeamFlagLoader::reset() {
    if (busy_)
        return;
    busy_ = ok_ = finished_ = false;
}
