#include "Game/Avatar/yo2AvatarTexMaker.h"

#include "System/yo2Debug.h"

// Template instances in this block (the containers are ours: vc6::vector<ClearRect>, ObjVector<Layer>):
// @yo2 0x009c1410 vector<ClearRect>::~vector
// @yo2 0x009c1510 copy<ClearRect*> (vector<ClearRect>::insert)
// @yo2 0x009c1560 uninitialized_fill_n<ClearRect*>
// @yo2 0x009c1780 construct<ClearRect>
// @yo2 0x009c1450 vector<Layer>::~vector
// @yo2 0x009c14a0 destroy<Layer*> (empty)
// @yo2 0x009c14c0 uninitialized_copy<Layer*>
// @yo2 0x009c15a0 construct<Layer> (Layer's copy constructor)
// @yo2 0x009c17b0 Layer::operator=
// @yo2 0x009c19a0 Layer::~Layer
// @yo2 0x009c1970 Layer scalar deleting destructor

// @yo2 0x009bed30 CAvatarTexMaker::create (new + CTask::create)
CAvatarTexMaker* CAvatarTexMaker::create(CTask* parent, uint32_t priority) {
    return dynamic_cast<CAvatarTexMaker*>((new CAvatarTexMaker)->CTask::create(parent, priority));
}

// @yo2 0x009bf8c0 CAvatarTexMaker::CAvatarTexMaker
CAvatarTexMaker::CAvatarTexMaker() {
    setTaskName("CAvatarTexMaker");
}

// @yo2 0x009bfad0 CAvatarTexMaker::~CAvatarTexMaker
// @yo2 0x009bfaa0 CAvatarTexMaker deleting destructor
// The exe sets quit_ and spins (Sleep(1)) while drawOrder_ is up; the worker is never joined and keeps reading the
// freed object, and if it saw quit_ before drawOrder_ the spin never ends. Joining covers both.
CAvatarTexMaker::~CAvatarTexMaker() {
    quit_ = true;
    if (thread_)
        yo2JoinThread(thread_);
}

// @yo2 0x009bfc40 CAvatarTexMaker::onInit: start the worker
bool CAvatarTexMaker::onInit() {
    thread_ = yo2BeginThread(threadMain, this);
    YO2_ASSERT(thread_ != 0, "error CAvatarTexMaker beginthread");
    return true;
}

// @yo2 0x009bff60 CAvatarTexMaker::onDestroy: tell the worker to stop
void CAvatarTexMaker::onDestroy() {
    if (thread_)
        quit_ = true;
}

// @yo2 0x009bff90 CAvatarTexMaker::threadMain: compose whenever drawOrder_ goes up, until quit_
void CAvatarTexMaker::threadMain(void* arg) {
    auto* self = static_cast<CAvatarTexMaker*>(arg);
    YO2_ASSERT(CTask::isValid(self), "死んでる");   // "it's dead"
    while (!self->quit_) {
        yo2Sleep(1);
        if (self->drawOrder_)
            self->compose();
    }
}

// @yo2 0x009bedf0 CAvatarTexMaker::setDestSprites: a texW x texH canvas cut into cellW x cellH cells, cell k drawn
// into sprites[k] (null entries keep the old sprite)
void CAvatarTexMaker::setDestSprites(CSpriteElm* const* sprites, uint32_t texW, uint32_t texH, uint32_t cellW,
                                     uint32_t cellH) {
    texW_ = texW;
    texH_ = texH;
    cellW_ = cellW;
    cellH_ = cellH;
    cols_ = texW / cellW;
    rows_ = texH / cellH;
    for (uint32_t k = 0; k < cols_ * rows_; k++) {
        CSpriteElm* s = sprites[k];
        if (!s)
            continue;
        YO2_ASSERT(k < MAX_SPRITES, "error DstSprNum over %d", k);
        dest_[k].setUser(this);
        dest_[k].set(s);
        YO2_ASSERT(s->alive() && CTask::isValid(s), "error SetDestSprite[%d:%p(%s)] not valid", k, (void*)s,
                   s->instName().c_str());
    }
}

// @yo2 0x009bf2e0 CAvatarTexMaker::addClearRect (vector<ClearRect>::push_back inlined)
void CAvatarTexMaker::addClearRect(int32_t col, int32_t row, const int32_t rect[4]) {
    clearRects_.push_back({col, row, rect[0], rect[1], rect[2], rect[3]});
}

// @yo2 0x009bf5e0 CAvatarTexMaker::setLayers (vector<Layer>::operator= inlined)
void CAvatarTexMaker::setLayers(const LayerList& layers) {
    layers_ = layers;
}

// @yo2 0x009bf890 CAvatarTexMaker::start: begin a pass unless one is running
void CAvatarTexMaker::start() {
    if (state_ != IDLE)
        return;
    drawOrder_ = false;
    drawn_ = false;
    state_ = REQUEST;
}

// @yo2 0x009bfdb0 CAvatarTexMaker::onMain: request the files, wait for them, let the worker compose, release them
bool CAvatarTexMaker::onMain() {
    switch (state_) {
    case REQUEST:
        for (const Layer& l : layers_)
            textureRequest(l.path, 2, false);
        state_ = LOADING;
        break;
    case LOADING: {
        bool all = true;
        for (const Layer& l : layers_)
            all &= textureLoaded(l.path);
        if (!all)
            break;
        drawn_ = false;   // the exe raises drawOrder_ first; this order can't lose the worker's drawn_
        drawOrder_ = true;
        state_ = COMPOSING;
        break;
    }
    case COMPOSING:
        if (!drawn_)
            break;
        drawOrder_ = false;
        for (const Layer& l : layers_)
            textureRelease(l.path);
        state_ = IDLE;
        break;
    }
    return true;
}

// Source over destination in float, the way the exe's x87 code does it (the worker thread runs at the default
// 53-bit precision; values it stores are rounded to float), alpha = the larger of the two.
static uint32_t blendPixel(uint32_t s, uint32_t d) {
    const double k = 1.0f / 255.0f;   // the float constant at 0x00beb01c
    auto ch = [](uint32_t c, int shift) { return static_cast<double>((c >> shift) & 0xff); };
    double sR = ch(s, 16) * k;   // stays on the FPU stack, unrounded
    float sG = static_cast<float>(ch(s, 8) * k), sB = static_cast<float>(ch(s, 0) * k);
    float sA = static_cast<float>(ch(s, 24) * k);
    float dR = static_cast<float>(ch(d, 16) * k), dG = static_cast<float>(ch(d, 8) * k);
    float dB = static_cast<float>(ch(d, 0) * k), dA = static_cast<float>(ch(d, 24) * k);
    double inv = 1.0 - sA;
    float r = static_cast<float>(static_cast<float>(dR * inv) + sR * sA);
    float g = static_cast<float>(static_cast<float>(dG * inv) + static_cast<float>(sG * static_cast<double>(sA)));
    float b = static_cast<float>(static_cast<float>(dB * inv) + static_cast<float>(sB * static_cast<double>(sA)));
    float a = dA > sA ? dA : sA;
    auto toByte = [](float v) { return static_cast<uint32_t>(static_cast<int32_t>(v * 255.0)); };   // __ftol
    return toByte(a) << 24 | toByte(r) << 16 | toByte(g) << 8 | toByte(b);
}

// @yo2 0x009c0d80 CAvatarTexMaker::blendLayer: layer's w x h pixels from (srcX, srcY) of src onto dst at
// (dstX, dstY); fully transparent source pixels and pixels off dst are skipped. (The exe doesn't check src's
// bounds; reading past it is skipped here too.)
void CAvatarTexMaker::blendLayer(ArgbImage& dst, const ArgbImage& src, const Layer& layer) {
    for (int32_t y = 0; y < layer.h; y++) {
        int32_t dy = layer.dstY + y, sy = layer.srcY + y;
        if (dy < 0 || dy >= dst.height || sy < 0 || sy >= src.height)
            continue;
        for (int32_t x = 0; x < layer.w; x++) {
            int32_t dx = layer.dstX + x, sx = layer.srcX + x;
            if (dx < 0 || dx >= dst.width || sx < 0 || sx >= src.width)
                continue;
            uint32_t s = src.at(sx, sy);
            if (s & 0xff000000)
                dst.at(dx, dy) = blendPixel(s, dst.at(dx, dy));
        }
    }
}

// @yo2 0x009c0140 CAvatarTexMaker::compose (worker thread): layers in order onto a cleared canvas, the clear rects
// cut out, each cell copied into its sprite; then drawn_ up, drawOrder_ down. (The exe holds the D3D device mutex
// around each device call; the texture and sprite functions here do their own locking.)
void CAvatarTexMaker::compose() {
    ArgbImage canvas;
    canvas.resize(static_cast<int32_t>(texW_), static_cast<int32_t>(texH_));
    for (const Layer& l : layers_)
        if (const ArgbImage* img = textureImage(l.path))
            blendLayer(canvas, *img, l);
    for (const ClearRect& r : clearRects_) {
        int32_t left = cellW_ * r.col + r.left, right = cellW_ * r.col + r.right;
        int32_t top = cellH_ * r.row + r.top, bottom = cellH_ * r.row + r.bottom;
        YO2_ASSERT(left >= 0 && top >= 0 && left <= right && top <= bottom && right <= canvas.width &&
                       bottom <= canvas.height,
                   "error D3DXLoadSurfaceFromMemory [%X]\n%s", 0x8876086cu, "D3DERR_INVALIDCALL");
        for (int32_t y = top; y < bottom; y++)
            for (int32_t x = left; x < right; x++)
                canvas.at(x, y) = 0;
    }
    for (uint32_t row = 0; row < rows_; row++)
        for (uint32_t col = 0; col < cols_; col++) {
            CTaskPtr<CSpriteElm>& d = dest_[row * cols_ + col];
            if (!dynamic_cast<CSpriteElm*>(d.task()))
                continue;
            int32_t rect[4] = {static_cast<int32_t>(cellW_ * col), static_cast<int32_t>(cellH_ * row),
                               static_cast<int32_t>(cellW_ * (col + 1)), static_cast<int32_t>(cellH_ * (row + 1))};
            spriteLoadImage(d.get(), canvas, rect);
        }
    drawn_ = true;
    drawOrder_ = false;
}
