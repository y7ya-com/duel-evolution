// CBattleManager (yo2BattleManager.cpp): see SceneBattleManager.h. The small engine-facing functions are labelled
// System in the exe's map (0x00754040..0x007549c0) but are this class's.
#include "SceneBattleManager.h"

#include <cmath>
#include <utility>

#include "CardDB.h"
#include "EngineInternal.h"
#include "SceneCard.h"

namespace ds {

#if !YO2_IN_EXE
CBattleManager* g_battleManager;   // DAT_012a6790
int32_t g_attackAngle;             // DAT_012a6794
#endif

namespace {
enum : uint32_t { SE_ATTACK_HIT = 0x10000009, SE_ATTACK_SWING = 0x10000006 };

// the arrow's angle from (x0, y0) towards (x1, y1): 0 straight up, 0x200 a turn (fpatan * 256 / pi)
int32_t angleUp(int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    return ftol(std::atan2((double)(x1 - x0), -(double)(y1 - y0)) * 256.0 / 3.141592653589793);
}
// the same measured downwards and negated (the opponent's arrows)
int32_t angleDown(int32_t x0, int32_t y0, int32_t x1, int32_t y1) {
    return ftol(std::atan2((double)(x1 - x0), (double)(y1 - y0)) * -256.0 / 3.141592653589793);
}
}   // namespace

uint32_t slotUid(uint32_t side, int32_t slot) {
    uint32_t w = engSlotRaw(side & 1, (uint32_t)slot)->card;
    return (w >> 14 & 1) + (w >> 23 & 0xff) * 2;
}

// ================================================================ the engine's calls

// @yo2 0x00754040 an attack phase starts for `side`: arrows on its monsters (attack_new.txt), nothing picked
void battleStart(uint32_t side) {
    CBattleManager* b = g_battleManager;
    b->targetSide = side == 0;
    b->attackerSide = side;
    planeLoadY(&b->sheets, "duel/effect/attack_new.txt");
    for (int32_t i = 0; i < 3; i++) planeEnsure(&b->sheets, i);
    b->state = 1;
    b->counter = 0;
    b->targetSlot = -1;
    b->attackerSlot = -1;
}

// @yo2 0x007541e0
void battleReset() { g_battleManager->state = 0; }

// @yo2 0x00754200 the same as battleStart for the side already set
void battleRestart() {
    CBattleManager* b = g_battleManager;
    planeLoadY(&b->sheets, "duel/effect/attack_new.txt");
    for (int32_t i = 0; i < 3; i++) planeEnsure(&b->sheets, i);
    b->state = 1;
    b->counter = 0;
    b->targetSlot = -1;
    b->attackerSlot = -1;
}

// @yo2 0x00754270
void battleSetAttackerSlot(int32_t slot) {
    CBattleManager* b = g_battleManager;
    b->state = 2;
    if (b->attackerSlot < 0) b->counter = 0;
    b->attackerSlot = slot;
}

// @yo2 0x007542b0
void battleSetAttacker(uint32_t side, int32_t slot) {
    CBattleManager* b = g_battleManager;
    int32_t prev = b->attackerSlot;
    b->attackerSide = side;
    b->state = 2;
    if (prev < 0) b->counter = 0;
    b->attackerSlot = slot;
    b->attackerUid = slotUid(side, slot);
}

// @yo2 0x00754340 aiming (the engine calls it as eng_754340)
void battleAim() { g_battleManager->state = 3; }

// @yo2 0x00754360 the target: `side` < 0 means the attacker's opponent
void battleSetTarget(int32_t side, int32_t slot) {
    CBattleManager* b = g_battleManager;
    int32_t c = b->counter;
    b->state = 4;
    if (c > 0x80) c = 0x80;
    b->counter = c;
    b->targetSide = side < 0 ? 1 - b->attackerSide : (uint32_t)side;
    b->targetSlot = slot;
    b->targetUid = slotUid((uint32_t)side, slot);
}

// @yo2 0x00754400
bool battleActive() { return g_battleManager->isActive(); }
// @yo2 0x00754430
void battleSetResult(int32_t d0, int32_t d1, uint32_t f0, uint32_t f1) { g_battleManager->setResult(d0, d1, f0, f1); }
// @yo2 0x00754460
bool battleIsFighter(uint32_t side, int32_t slot) { return g_battleManager->isFighter(side, slot); }
// @yo2 0x00754490
void battleClearFighter(int32_t which) { g_battleManager->clearFighter(which); }
// @yo2 0x007544c0
void battleClearFighters() { g_battleManager->clearFighters(); }

// ================================================================ CBattleManager

// @yo2 0x007544e0 CBattleManager::CBattleManager (group 1, drawn at order 0x108; the one instance)
CBattleManager::CBattleManager() : CGameObject(1) {
    movie.setUser(this);
    planeConstruct(&sheets, 0);
    order_ = 0x108;
    g_battleManager = this;
}

// @yo2 0x00754660 CBattleManager::~CBattleManager
// @yo2 0x00754630 CBattleManager scalar deleting destructor
CBattleManager::~CBattleManager() { planeDestruct(&sheets); }

// @yo2 0x00754600 slot 1
bool CBattleManager::isActive() const { return state == 4 || state == 6 || state == 7; }

// @yo2 0x00754790 the outcome: damage and flags per player; the target slides off (6) unless it survived
void CBattleManager::setResult(int32_t d0, int32_t d1, uint32_t f0, uint32_t f1) {
    damage[0] = d0;
    flags[0] = f0;
    damage[1] = d1;
    flags[1] = f1;
    counter = 0;
    uint32_t def = attackerSide == 0;
    if (targetSlot < 5 && (flags[def] & 2) == 0 && damage[def] == 0) state = 6;
    else state = 7;
}

// @yo2 0x00754810 is (side, slot) the attacker or the target of the attack under way (and still the same card)
bool CBattleManager::isFighter(uint32_t side, int32_t slot) const {
    if (state <= 3) return false;
    uint16_t key = (uint16_t)((uint8_t)slot << 8 | (side & 0xff));
    if ((uint16_t)((uint8_t)attackerSlot << 8 | (attackerSide & 0xff)) == key && attackerUid == slotUid(side, slot))
        return true;
    if ((uint16_t)((uint8_t)targetSlot << 8 | (targetSide & 0xff)) == key && targetUid == slotUid(side, slot))
        return true;
    return false;
}

// @yo2 0x00754930
void CBattleManager::clearFighter(int32_t which) {
    if (which != 0) attackerUid = 0;
    else targetUid = 0;
}

// @yo2 0x00754960
void CBattleManager::clearFighters() {
    attackerUid = 0;
    targetUid = 0;
}

// @yo2 0x00754980 slot 2: the states' timers; at the hit, the hit cards flash and the gauges count the damage
void CBattleManager::update() {
    switch (state) {
    case 3:
        if (counter < 0x80) counter += 0x10;
        return;
    case 4:
        counter += 0x10;
        if (counter > 0x1ff) state++;
        return;
    case 6:
        counter += 0x10;
        if (counter == 0x200) {
            counter = 0;
            state++;
        }
        return;
    case 7:
        break;
    default:
        return;
    }
    if (counter == 0) {
        bool hitSound = false;
        uint32_t f = flags[attackerSide == 0];
        if (targetSlot < 5 && ((f & 2) || (f & 0x1c) == 4)) {
            if (CCard* c = cardAt(targetSide, 0, (uint32_t)targetSlot)) {
                c->flash = 2;
                c->flashLevel = 0x100;
            }
            hitSound = true;
        }
        f = flags[attackerSide];
        if ((f & 2) || (f & 0x1c) == 4) {
            if (CCard* c = cardAt(attackerSide, 0, (uint32_t)attackerSlot)) {
                c->flash = 2;
                c->flashLevel = 0x100;
            }
            hitSound = true;
        }
        for (uint32_t i = 0; i < 2; i++) {
            if (damage[i] == 0) continue;
            uint32_t side = i == attackerSide ? attackerSide : targetSide;
            int32_t slot = i == attackerSide ? attackerSlot : targetSlot;
            if (targetSlot > 4) slot = -1;
            if (flags[i] & 8) {
                side ^= 1;
                slot = -1;
            }
            if (flags[i] & 0x10) slot = -1;
            lpGaugeDamage(side, -damage[i], slot, true);
            hitSound = false;
        }
        if (hitSound) playSe(SE_ATTACK_HIT, 0);
    }
    counter += 8;
    if (counter == 0x100) {
        counter = 0;
        state++;
    }
}

// @yo2 0x00754bb0 slot 3: the attack movie and the arrows
void CBattleManager::draw() {
    float z = (float)order_;
    int32_t tx = 0, ty = 0;   // where the attack goes
    if (CWindowTaskModel* w = sceneModalWindow()) {   // a window over the mat (the scene's +0x104): only if it lets
        if (!w->windowSlot18()) return;
    }
    CSwfEngine* mv = dynamic_cast<CSwfEngine*>(movie.task());
    if (!mv) {
        movie.set(swfCreate(sceneRoot(), 4000, vc6::string("Data/Y/duel/effect/duel_ef_attack_a.txt"), 1));
        YO2_ASSERT(dynamic_cast<CSwfEngine*>(movie.task()), "SwfEngine create failed <plane 0>");   // "SwfEngine 生成失敗＜プレーン０＞"
        movie->setInstName("SwfEngine Plane0");
        swfHold(movie.get()) = 0;
        movie->setDisp(false, true);
        taskLock(movie.get(), 2, true);
    } else if (swfEnded(movie.get())) {
        swfEnded(movie.get()) = 0;
        movie->setDisp(false, true);
        taskLock(movie.get(), 2, true);
    }
    if (state != 0) {
        if (targetSlot < 5) {
            matPos(targetSide, 0, (uint32_t)targetSlot, &tx, &ty);
            if (dynamic_cast<CSwfEngine*>(movie.task())) {
                movie->scale_.x = 1.0f;
                movie->scale_.y = 1.0f;
            }
        } else {
            tx = 512;   // DAT_00bed658: a direct attack goes to the player's side of the screen
            ty = attackerSide != g_eng.viewer ? 0x218 : 0x40;
            if (dynamic_cast<CSwfEngine*>(movie.task())) {
                float s = 2.0f;   // the bigger the attacker, the bigger the hit
                if (attackerSlot != -1 && (engSlotRaw(attackerSide & 1, (uint32_t)attackerSlot)->card & 0x3fff) != 0) {
                    EngStats st;
                    engStatsOf2(attackerSide, attackerSlot, &st);
                    s = st.atk < 1000 ? 1.0f : st.atk < 2000 ? 2.0f : 3.0f;
                }
                movie->scale_.x = s;
                movie->scale_.y = s;
            }
        }
        for (int32_t s = 0; s < 5; s++) {   // the arrows on the monsters that can still attack
            int32_t px, py;
            matPos(attackerSide, 0, (uint32_t)s, &px, &py);
            if (!engCardIdAt(attackerSide, 0, s) || !cardSettled(attackerSide, 0, (uint32_t)s)) continue;
            if (state >= 3 && state <= 5 && s == attackerSlot) continue;
            if (!engFieldMaskBit((int)attackerSide, s)) continue;
            planeSetZ(&sheets, 0, z + 1.0f);
            spriteDrawRot(planeSprite(&sheets, 0), px, py, (int32_t)(attackerSide == (g_eng.viewer ^ 1)) << 8,
                          0x10000, 0x10000, 0xa0);
        }
    }
    if (state == 3) {   // aiming: the arrow follows the mouse, growing in over 8 frames
        int32_t ax, ay, mx = 0, my = 0;
        matPos(attackerSide, 0, (uint32_t)attackerSlot, &ax, &ay);
        mousePos(appMouse(), &mx, &my);
        int32_t a = angleUp(ax, ay, mx, my);
        int32_t k = counter < 0x81 ? counter : 0x80;
        planeSetZ(&sheets, 0, z + 1.0f);
        spriteDrawRotScale(planeSprite(&sheets, 0), ax, ay, k * a / 128, 1.0f);
        return;
    }
    if (state == 6) {   // the destroyed target slides out of its zone
        if (counter > 0xff) return;
        int32_t dx, dy;
        matPos(targetSide, 0, (uint32_t)targetSlot, &dx, &dy);
        int32_t w = g_miniW, h = g_miniH;
        if (flags[attackerSide == 0] & 1) std::swap(w, h);   // in defense
        int32_t sw, sh;
        spriteSize(planeSprite(&sheets, 3), &sw, &sh);
        int32_t clip[4] = {dx - w / 2, dy - h / 2, 0, 0};
        clip[2] = clip[0] + w;
        clip[3] = clip[1] + h;
        int32_t px = ((w / 2 + dx) * (0x100 - counter) + (clip[0] - sw) * counter) / 256;
        planeSetZ(&sheets, 3, z + 2.0f);
        spriteDrawPart(planeSprite(&sheets, 3), px, dy - sh / 2, nullptr, 0, clip);
        return;
    }
    if (state != 4) return;
    if (attackerSide == 1) {   // the opponent attacks: the attack's voice (and "that's lethal")
        int32_t lp = *reinterpret_cast<int32_t*>(g_duelScene + 0xac4);
        uint32_t card = g_eng.pl[1].slot[attackerSlot].card & 0x3fff;
        int32_t dmg = engBattleCalc();
        int32_t voice;
        if (targetSlot < 5) {
            uint32_t j = targetSide & 1;
            EngSlot* t = engSlotRaw(j, (uint32_t)targetSlot);
            int16_t faceUp = (int16_t)t->faceUp, def = (int16_t)t->def;
            int32_t defVal = cardDef((int)(t->card & 0x3fff));
            int32_t atk = engAtk(targetSide, targetSlot);
            voice = 0xe;
            if (*reinterpret_cast<int32_t*>(reinterpret_cast<uint8_t*>(g_netDuel) + 0x66c) == cardPropIndex((int)card))
                voice = 0x21;
            int32_t d;
            bool check = false;
            if (!engMayAttackDirect(attackerSide, attackerSlot)) {
                if (faceUp == 1 && def == 0) d = dmg - atk, check = true;
            } else if (faceUp == 1) {
                if (def == 0) d = dmg - atk, check = true;
                else if ((d = dmg - defVal) > 0) check = true;
            }
            if (check && lp <= d) voice = 0x10;
        } else {
            voice = 0xf;
            if (*reinterpret_cast<int32_t*>(reinterpret_cast<uint8_t*>(g_netDuel) + 0x66c) == cardPropIndex((int)card))
                voice = 0x21;
            if (lp == dmg || lp - dmg < 0) voice = 0x10;
        }
        duelPlayBgm(voice, 1, (int)card);
    }
    int32_t ax, ay;
    matPos(attackerSide, 0, (uint32_t)attackerSlot, &ax, &ay);
    int32_t k = counter;
    if (k < 0x81) {   // the arrow turns to the target
        int32_t rot;
        if (targetSide == (g_eng.viewer ^ 1)) rot = angleUp(ax, ay, tx, ty) * k / 128;
        else rot = angleDown(ax, ay, tx, ty) * k / 128 + 0x100;
        planeSetZ(&sheets, 0, z + 2.0f);
        spriteDrawRotScale(planeSprite(&sheets, 0), ax, ay, rot, 1.0f);
        return;
    }
    if (k == 0x90) playSe(SE_ATTACK_SWING, 0);
    if (k > 0xff) {   // the hit: the movie at the target, the hit mark fading out
        if (k > 0x1ff) return;
        int32_t alpha = (0x200 - k) * 2;
        if (alpha < 1) alpha = 0;
        if (k == 0x100 && dynamic_cast<CSwfEngine*>(movie.task())) {
            CSwfEngine* m = movie.get();
            taskLock(m, 2, false);
            m->setDisp(true, true);
            swfHold(m) = 0;
            m->pos_.x = (float)tx;
            m->pos_.y = (float)ty;
            m->pos_.z = z + 1.0f;
            m->rot_.z = (float)g_attackAngle * (float)3.141592653589793 * 0.00390625f;
            swfPlayLabel(m, 0, "this");
        }
        planeSetZ(&sheets, 1, z + 2.0f);
        spriteDrawRot(planeSprite(&sheets, 1), tx, ty, angleUp(ax, ay, tx, ty), 0x10000, 0x10000, alpha);
        return;
    }
    // the arrow flies along a sine ease from the attacker to the target
    int32_t t = 0x100 - (g_sinTable[(uint32_t)(k - 0x80) & 0x1ff] >> 8);
    int32_t px = (ax * (0x100 - t) + t * tx) / 256;
    int32_t py = ((0x100 - t) * ay + t * ty) / 256;
    int32_t a = angleUp(px, py, tx, ty);
    g_attackAngle = a;
    planeSetZ(&sheets, 0, z + 1.0f);
    spriteDrawRotScale(planeSprite(&sheets, 0), px, py, a, 1.0f);
}

}   // namespace ds
