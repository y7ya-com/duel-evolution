// yo2AvatarTexMaker.cpp: CAvatarTexMaker's pixel blend, its load/compose/release cycle with the worker thread, the
// clear rects and the cell split, and a real waist-up part composed the same way.
#include <cstdlib>

#include "Game/Avatar/yo2AvatarTexMaker.h"
#include "avatar_stubs.h"
#include "game_test.h"

static uint32_t blend1(uint32_t s, uint32_t d) {
    ArgbImage src, dst;
    src.resize(1, 1);
    dst.resize(1, 1);
    src.at(0, 0) = s;
    dst.at(0, 0) = d;
    CAvatarTexMaker::Layer l;
    l.w = l.h = 1;
    CAvatarTexMaker::blendLayer(dst, src, l);
    return dst.at(0, 0);
}

static void blend() {
    for (uint32_t v = 0; v < 256; v++) {   // opaque copies exactly, whatever is under it
        uint32_t s = 0xff000000 | v << 16 | (255 - v) << 8 | (v * 7 & 0xff);
        CHECK(blend1(s, 0x12345678) == s && blend1(s, 0) == s);
    }
    CHECK(blend1(0x00ffffff, 0x12345678) == 0x12345678);   // alpha 0: skipped
    CHECK(blend1(0x80ff0000, 0x00000000) >> 24 == 0x80);   // alpha = max(src, dst)
    CHECK(blend1(0x10ff0000, 0xc0000000) >> 24 == 0xc0);
    // half alpha over opaque blue: red ~ 128, blue ~ 127, values truncated
    uint32_t h = blend1(0x80ff0000, 0xff0000ff);
    CHECK(h >> 24 == 0xff && (h >> 8 & 0xff) == 0);
    CHECK(std::abs((int)(h >> 16 & 0xff) - 128) <= 1 && std::abs((int)(h & 0xff) - 127) <= 1);
    // over transparent black the colour gets multiplied by alpha (no un-premultiply)
    uint32_t p = blend1(0x40ffffff, 0);
    CHECK(p >> 24 == 0x40 && std::abs((int)(p & 0xff) - 0x40) <= 1);
    // layer placement: source offset, destination offset, clipping at the destination's edges
    ArgbImage src, dst;
    src.resize(4, 4);
    for (int i = 0; i < 16; i++) src.pixels[i] = 0xff000000 | i;
    dst.resize(3, 3);
    CAvatarTexMaker::Layer l;
    l.srcX = 1, l.srcY = 2, l.w = 3, l.h = 2, l.dstX = 1, l.dstY = -1;
    CAvatarTexMaker::blendLayer(dst, src, l);
    // source rows 2..3, cols 1..3 -> destination rows -1..0, cols 1..3: only row 0 cols 1..2 land
    CHECK(dst.at(1, 0) == (0xff000000 | 13) && dst.at(2, 0) == (0xff000000 | 14));
    CHECK(dst.at(0, 0) == 0 && dst.at(1, 1) == 0);
}

// Drive TM_MAIN until the maker is idle again (the worker composes in between).
static void runToIdle(CTask* root, CAvatarTexMaker* m) {
    for (int i = 0; i < 5000; i++) {
        testFrame(root);
        if (m->state_ == CAvatarTexMaker::IDLE)
            return;
        yo2Sleep(1);
    }
    CHECK(!"CAvatarTexMaker never finished");
}

static void cycle() {
    CTask* root = CTask::createRoot();
    CAvatarTexMaker* m = CAvatarTexMaker::create(root, 10000);
    CHECK(m && m->taskName() == "CAvatarTexMaker" && m->thread_ != 0);   // onInit started the worker
    CSpriteElm* sprites[4];
    for (auto& s : sprites) s = static_cast<CSpriteElm*>((new CSpriteElm)->CTask::create(root, 1));
    CSpriteElm* grid[4] = {sprites[0], sprites[1], nullptr, sprites[3]};   // cell 2 gets no sprite
    m->setDestSprites(grid, 8, 4, 4, 2);   // 2 x 2 cells of 4 x 2
    CHECK(m->cols_ == 2 && m->rows_ == 2 && m->dest_[0].task() == sprites[0] && !m->dest_[2].task());

    ArgbImage red, blue;
    red.resize(8, 4);
    for (auto& px : red.pixels) px = 0xffff0000;
    blue.resize(2, 2);
    for (auto& px : blue.pixels) px = 0xff0000ff;
    textures().fixtures["red.png"] = red;
    textures().fixtures["blue.png"] = blue;
    CAvatarTexMaker::LayerList layers;
    CAvatarTexMaker::Layer a;
    a.path = "red.png", a.w = 8, a.h = 4;
    CAvatarTexMaker::Layer b;
    b.path = "blue.png", b.w = 2, b.h = 2, b.dstX = 3, b.dstY = 1;   // straddles all four cells
    layers.push_back(a);
    layers.push_back(b);
    m->setLayers(layers);
    CHECK(m->layers_.size() == 2 && m->layers_[1].dstX == 3 && m->layers_[0].path == "red.png");
    int cut[4] = {1, 0, 3, 1};
    m->addClearRect(1, 1, cut);   // cell (1, 1): x 5..6, y 2 of the canvas
    CHECK(m->clearRects_.size() == 1);

    textures().hold = true;
    m->start();
    CHECK(m->state_ == CAvatarTexMaker::REQUEST);
    testFrame(root);
    CHECK(m->state_ == CAvatarTexMaker::LOADING && textures().requests["red.png"] == 1);
    testFrame(root);
    testFrame(root);
    CHECK(m->state_ == CAvatarTexMaker::LOADING && !m->drawOrder_);   // waits for every file
    m->start();   // ignored while busy
    CHECK(m->state_ == CAvatarTexMaker::LOADING);
    textures().hold = false;
    runToIdle(root, m);
    CHECK(textures().releases["red.png"] == 1 && textures().releases["blue.png"] == 1);
    CHECK(m->drawn_ && !m->drawOrder_);

    std::lock_guard<std::mutex> g(spriteImagesLock());
    CHECK(spriteImages().size() == 3);
    const ArgbImage& c0 = spriteImages()[sprites[0]];   // cell (0, 0): x 0..3, y 0..1
    const ArgbImage& c1 = spriteImages()[sprites[1]];   // cell (1, 0): x 4..7, y 0..1
    const ArgbImage& c3 = spriteImages()[sprites[3]];   // cell (1, 1): x 4..7, y 2..3
    CHECK(c0.width == 4 && c0.height == 2);
    CHECK(c0.at(0, 0) == 0xffff0000 && c0.at(3, 1) == 0xff0000ff && c0.at(3, 0) == 0xffff0000);
    CHECK(c1.at(0, 1) == 0xff0000ff && c1.at(1, 1) == 0xffff0000);
    CHECK(c3.at(0, 0) == 0xff0000ff && c3.at(1, 0) == 0 && c3.at(2, 0) == 0 && c3.at(3, 0) == 0xffff0000);
    CHECK(c3.at(1, 1) == 0xffff0000);   // the clear rect is one row high
    spriteImages().clear();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();   // joins the worker
}

// A real waist-up part (768 x 264) onto a 1024 x 512 canvas cut into two 512 x 512 sprites: every pixel is the
// part's colour times its alpha, alpha kept.
static void realData() {
    if (!mergeDat()) {
        std::printf("avatar_texmaker_test: real part skipped (no YO2_MERGE_DAT)\n");
        return;
    }
    gameSetFileProvider(mergeProvider);
    CTask* root = CTask::createRoot();
    CAvatarTexMaker* m = CAvatarTexMaker::create(root, 10000);
    CSpriteElm* s[2] = {static_cast<CSpriteElm*>((new CSpriteElm)->CTask::create(root, 1)),
                        static_cast<CSpriteElm*>((new CSpriteElm)->CTask::create(root, 1))};
    m->setDestSprites(s, 1024, 512, 512, 512);
    CAvatarTexMaker::Layer hair;
    hair.path = "data/avatar/wu/wm_h1_01_c01.png", hair.w = 768, hair.h = 264, hair.dstX = 100, hair.dstY = 160;
    CAvatarTexMaker::LayerList layers;
    layers.push_back(hair);
    m->setLayers(layers);
    m->start();
    runToIdle(root, m);
    const ArgbImage* part = textureImage(hair.path);
    CHECK(part && part->width == 768 && part->height == 264);
    std::lock_guard<std::mutex> g(spriteImagesLock());
    int opaque = 0;
    for (int y = 0; y < 512; y++)
        for (int x = 0; x < 1024; x++) {
            uint32_t got = spriteImages()[s[x / 512]].at(x % 512, y);
            int px = x - 100, py = y - 160;
            uint32_t src = px >= 0 && px < 768 && py >= 0 && py < 264 ? part->at(px, py) : 0;
            uint32_t a = src >> 24;
            CHECK(got >> 24 == a);
            for (int sh = 0; sh < 24; sh += 8)
                CHECK(std::abs((int)(got >> sh & 0xff) - (int)((src >> sh & 0xff) * a + 127) / 255) <= 1);
            opaque += a == 255;
        }
    CHECK(opaque > 10000);
    spriteImages().clear();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    gameSetFileProvider(fixtureProvider);
    std::printf("avatar_texmaker_test: real waist-up hair composed (%d opaque pixels)\n", opaque);
}

int main() {
    gameSetFileProvider(fixtureProvider);
    blend();
    cycle();
    realData();
    std::printf("avatar_texmaker_test ok\n");
}
