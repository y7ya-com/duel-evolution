// CAffectIcon (yo2AffectIcon.cpp): see SceneAffectIcon.h.
#include "SceneAffectIcon.h"

#include <cstdio>

#include "EngineInternal.h"
#include "SceneCard.h"

namespace ds {

#if !YO2_IN_EXE
uint32_t g_affectMarks[21];   // DAT_012a6140
#endif

CAffectIcon::CAffectIcon() : CGameObject(1) {   // (made inline by the scene)
    for (auto& i : icons) i.setUser(this);
}

// @yo2 0x00751d20 CAffectIcon::~CAffectIcon: the icons still up are destroyed
// @yo2 0x00751cf0 CAffectIcon scalar deleting destructor
CAffectIcon::~CAffectIcon() {
    for (auto& i : icons)
        if (dynamic_cast<CSwfEngine*>(i.task())) i.get()->destroy(__FILE__, 0x34);
}

// @yo2 0x00752070 slot 2
void CAffectIcon::update() { hovered = g_cardHover; }

// @yo2 0x00752090 an icon of `kind` (relation 1..7, 8 the other fighter, 0x100 a chain link) on the card centred at
// pos: nothing new if one is already there (it is kept), else the first free icon plays duel_eff_cion_0<kind>
void CAffectIcon::addIcon(const int32_t* pos, int32_t kind) {
    YO2_ASSERT(!(kind > 7 && kind != 8 && kind != 0x100), "no equip spell above 8");   // "８より大きい装備魔法はないよ"
    bool found = false;
    for (int32_t i = 0; i < 30; i++) {
        CSwfEngine* s = dynamic_cast<CSwfEngine*>(icons[i].task());
        if (!s) continue;
        if ((float)(pos[0] - 0x19) == icons[i]->pos_.x && (float)(pos[1] - 0x19) == icons[i]->pos_.y) {
            found = true;
            used[i] = 1;
        }
    }
    if (found) return;
    int32_t i = 0;
    while (dynamic_cast<CSwfEngine*>(icons[i].task())) {
        if (++i > 29) return;
    }
    if (kind == 0x100) kind = 7;
    else if (kind == 8) kind = 6;
    else if (kind > 5) kind = 2;
    char path[0x80];
    std::snprintf(path, sizeof path, "Data/Y/duel/effect/duel_eff_cion_0%d.txt", kind);
    icons[i].set(swfCreate(sceneRoot(), 0, vc6::string(path), 1));
    YO2_ASSERT(dynamic_cast<CSwfEngine*>(icons[i].task()), "SwfEngine create failed <card icon>");   // "SwfEngine 生成失敗＜カードアイコン＞"
    icons[i]->setInstName("SwfEngine Affect Icon");
    swfPlay(icons[i].get(), 1);
    swfHold(icons[i].get()) = 1;
    icons[i]->pos_.z = (float)order_ + 5.0f;
    icons[i]->pos_.x = (float)(pos[0] - 0x19);
    icons[i]->pos_.y = (float)(pos[1] - 0x19);
    used[i] = 1;
}

// @yo2 0x00752c40 slot 3: the icons around the hovered card; the ones not placed again this frame go
void CAffectIcon::draw() {
    if (!g_cardHover) {
        for (int32_t i = 0; i < 30; i++) {
            if (dynamic_cast<CSwfEngine*>(icons[i].task())) icons[i].get()->destroy(__FILE__, 0x78);
            used[i] = 0;
        }
        return;
    }
    uint16_t code;
    g_cardHover->getCode(&code);
    uint32_t slot = (code >> 6 & 0xff) + (code >> 1 & 0x1f), side = code & 1u;
    if (slot > 10) return;
    EngSlot* me = engSlotRaw(side, slot);
    if ((me->card & 0x3fff) == 0) return;
    int32_t pos[2];
    bool mark = false;
    if (me->faceUp == 0) {   // a face-down card: only this player's own spells / traps with a live effect
        if (slot >= 5 && side == g_eng.viewer && eng6f76f0(side, slot)) mark = true;
    } else if ((me->flags & 0x100) || eng6f4c40(side, (int)slot)) {
        mark = true;
    }
    if (mark) {
        matPos(side, slot, 0, &pos[0], &pos[1]);
        addIcon(pos, 4);
    }
    EngStats meStats, other;
    engStatsOf2(side, (int)slot, &meStats);
    for (uint32_t p = 0; p < 2; p++) {
        for (int32_t s = 0; s < 11; s++) {
            EngSlot* o = engSlotRaw(p, (uint32_t)s);
            if (o->card & 0x3fff) {
                engStatsOf2(p, s, &other);
                int32_t rel = engRelation(&other, p, s, side, (int)slot);
                if (rel == 0) rel = engRelation(&meStats, side, (int)slot, p, s);
                if (rel) {
                    matPos(p, (uint32_t)s, 0, &pos[0], &pos[1]);
                    addIcon(pos, (int16_t)rel);
                }
                if (engChainTargets(p, (uint8_t)s, side, slot) || engChainTargets(side, (uint8_t)slot, p, (uint32_t)s)) {
                    matPos(p, (uint32_t)s, 0, &pos[0], &pos[1]);
                    addIcon(pos, 0x100);
                }
                if (g_eng.phase == 3) {   // battle: the other fighter
                    if (battleIsFighter(side, (int32_t)slot) && slot < 5 && battleIsFighter(p, s) && s < 5) {
                        matPos(p, (uint32_t)s, 0, &pos[0], &pos[1]);
                        addIcon(pos, 8);
                    }
                } else {
                    battleClearFighters();
                }
            }
            g_affectMarks[p * 10 + (uint32_t)s] = (o->card & 0x3fff) == 0x1432 ? o->value : 0;
        }
    }
    for (int32_t i = 0; i < 30; i++) {
        if (!used[i] && dynamic_cast<CSwfEngine*>(icons[i].task())) icons[i].get()->destroy(__FILE__, 0xbf);
        used[i] = 0;
    }
}

}   // namespace ds
