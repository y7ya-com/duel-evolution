// src/Rating: CRatingScene (boot notice: sprites, fade-in, 4 s hold, fade-out into the title) and CRatingTask (the
// hourly in-game reminder and its help text). Covers every function in yo2Rating.cpp:
//   CRatingScene: New 0x997ac0, ~ 0x997d10/0x997ce0, Receive 0x998d20, onInit 0x997dd0, onMain 0x998c00,
//                 onDestroy 0x998cd0
//   CRatingTask:  New 0x998d40, ~ 0x998fa0/0x998f70, Receive 0x999d60, onInit 0x999070, onMain 0x9995a0,
//                 onDestroy 0x999d10
#include <cassert>
#include <cstdio>

#include "Rating/yo2Rating.h"
#include "System/yo2ZSort.h"
#include "stubs.h"

namespace {
void frame(CTask* root) {
    root->call(&g_tmMain);
    CTask::flushDeleted();
}

FakeSprite* sprite(CElement* e) { return dynamic_cast<FakeSprite*>(e); }

bool near(const Vec3& v, float x, float y, float z) { return v.x == x && v.y == y && v.z == z; }

struct TitleScene : CSceneTask {
    bool onInit() override {
        createBaseElement("title");
        return true;
    }
    static CSceneTask* make(CTask* parent, CElement* layer) { return spawn<TitleScene>(parent, layer); }
};

void testScene(CTask* root, CSceneMng* mng) {
    int live = CTask::liveCount();
    mng->change(SCENE_RATING, CSceneMng::FADE_NONE, true);
    frame(root);
    auto* scene = dynamic_cast<CRatingScene*>(mng->scene());
    assert(scene && scene->taskName() == "CRatingScene");

    // onInit: base element under the scene layer, three sprites under it; fade in
    CElement* base = scene->baseElement();
    assert(base->parent() == g_fakeSceneLayer && base->instName() == "CLogoScene::m_pBaseElm");
    assert(base->children().size() == 3);
    FakeSprite* mark = sprite(scene->ratingMark());
    FakeSprite* grade = sprite(scene->gradeTable());
    FakeSprite* back = sprite(scene->background());
    assert(mark && grade && back);
    assert(mark->parent() == base && grade->parent() == base && back->parent() == base);
    assert(mark->texture == "data/etc/korean/rating_all.png" && mark->instName() == "レーティング画像");
    assert(grade->texture == "data/etc/korean/rating1.png" && grade->instName() == "グレード表画像");
    assert(back->texture == "data/etc/korean/back.png" && back->instName() == "白バック画像");
    assert(near(mark->pos_, 677, 50, 100) && near(grade->pos_, 233, 314, 100) && near(back->pos_, 0, 0, 50));
    assert(near(back->scale_, 10, 8, 0) && near(mark->scale_, 1, 1, 1));
    assert(g_faderLog == "in10/61004;" && scene->state() == CRatingScene::FADING_IN);

    // onMain: nothing while the fade runs
    frame(root);
    assert(scene->state() == CRatingScene::FADING_IN);
    // fade done: hold for 4 s (strictly later than now + 4)
    g_fakeFaderState = 0;
    int32_t t0 = g_fakeNow;
    frame(root);
    assert(scene->state() == CRatingScene::SHOWING);
    g_fakeNow = t0 + 4;
    frame(root);
    assert(scene->state() == CRatingScene::SHOWING && mng->nextSceneId() == SCENE_NONE);
    g_fakeNow = t0 + 5;
    frame(root);  // fade out, then the title once the fader is done
    assert(scene->state() == CRatingScene::LEAVING && g_faderLog == "in10/61004;out10/61004;");
    assert(mng->nextSceneId() == SCENE_TITLE && mng->sceneId() == SCENE_RATING);
    frame(root);
    assert(scene->state() == CRatingScene::LEAVING && mng->sceneId() == SCENE_RATING);  // fader still running

    // switch: the rating scene is destroyed and its onDestroy takes the base element (and the sprites) with it
    g_fakeFaderState = 3;
    frame(root);
    assert(mng->sceneId() == SCENE_TITLE);
    assert(g_fakeSceneLayer->children().size() == 2);  // the fader and the title's base element
    // the title scene + its base element replaced the rating scene + base + 3 sprites
    assert(CTask::liveCount() == live + 2);
    std::printf("rating scene: ok\n");
}

void testTask(CTask* root) {
    g_faderLog.clear();
    CElement* layer = CElement::newChild(root, 5);
    int32_t t0 = g_fakeNow;
    CRatingTask* task = CRatingTask::newChild(root, layer);
    assert(task && task->taskName() == "CRatingTask" && task->parent() == root);

    // onInit
    CElement* base = task->base();
    assert(base->parent() == layer && base->instName() == "CLogoScene::m_pBaseElm" && base->children().empty());
    const FakeHelpText& help = g_helpTexts.at(task->helpText().storage());
    assert(help.alive && help.text == u"text#3026" && help.priority == -1);
    assert(task->nextShow() == t0 + 3600 && task->state() == CRatingTask::WAITING);
    assert(g_faderLog == "in10/61004;");

    // the help text goes away 15 s before the showing
    task->helpText().setPriority(7);
    g_fakeNow = t0 + 3585;
    frame(root);
    assert(help.priority == 7);
    g_fakeNow = t0 + 3586;
    frame(root);
    assert(help.priority == -1 && task->state() == CRatingTask::WAITING && !task->ratingMark());

    // the showing: one blended sprite, high help priority
    g_fakeNow = t0 + 3600;
    frame(root);
    assert(task->state() == CRatingTask::WAITING);
    g_fakeNow = t0 + 3601;
    int made = g_spritesMade;
    frame(root);
    assert(task->state() == CRatingTask::SHOWING && g_spritesMade == made + 1);
    FakeSprite* mark = sprite(task->ratingMark());
    assert(mark && mark->parent() == base && mark->texture == "data/etc/korean/rating_all.png");
    assert(mark->instName() == "レーティング画像" && near(mark->pos_, 677, 50, 61105));
    assert(mark->drawMode_ == CElement::BLEND && mark->disp_);
    assert(help.priority == 999);

    // 4 s later it is hidden again and the next showing is an hour away
    g_fakeNow = t0 + 3605;
    frame(root);
    assert(task->state() == CRatingTask::SHOWING);
    g_fakeNow = t0 + 3606;
    frame(root);
    assert(task->state() == CRatingTask::HIDING && task->ratingMark());
    frame(root);
    assert(task->state() == CRatingTask::WAITING && !task->ratingMark() && base->children().empty());
    assert(task->nextShow() == t0 + 3606 + 3600);
    // the second cycle runs the same way
    g_fakeNow = t0 + 3606 + 3601;
    frame(root);
    assert(task->state() == CRatingTask::SHOWING && task->ratingMark());

    // destroy: onDestroy takes the base element (and the sprite); the HelpText dies with the task
    int live = CTask::liveCount();
    const HelpTextStorage* hs = task->helpText().storage();
    task->destroy(__FILE__, __LINE__);
    assert(CTask::liveCount() == live - 3 && layer->children().empty());
    CTask::flushDeleted();
    assert(!g_helpTexts.at(hs).alive);
    std::printf("rating task: ok\n");
}
}  // namespace

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_RATING, &CRatingScene::make);
    CSceneMng::registerScene(SCENE_TITLE, &TitleScene::make);
    CSceneMng* mng = CSceneMng::newChild(root, 1);
    assert(mng && mng->fader());
    testScene(root, mng);
    testTask(root);
    return 0;
}
