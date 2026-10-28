#include "yo2TextElm.h"

#include "yo2Debug.h"
#include "yo2Widen.h"

// @yo2 0x00635090 narrowText: WideCharToMultiByte(g_textCodePage)
vc6::string narrowText(const vc6::wstring& s) { return vc6::string(yo2Utf16ToCodePage(g_textCodePage, s)); }

// ---- CTextElm ----

// @yo2 0x00634900 CTextElm::CTextElm
CTextElm::CTextElm() { setTaskName("CTextElm"); }

// @yo2 0x00634bf0 CTextElm::~CTextElm
// @yo2 0x00634a60 CTextElm deleting destructor
CTextElm::~CTextElm() = default;

// @yo2 0x00634470 CTextElm::newChild
CTextElm* CTextElm::newChild(CTask* parent, uint32_t priority) {
    auto* e = new CTextElm;
    return dynamic_cast<CTextElm*>(e->create(parent, priority));
}

// @yo2 0x00635220 CTextElm::onInit: point-filtered blend; a 16-pixel font, 8 for the ruby; a 256 x 256 box
bool CTextElm::onInit() {
    setDrawMode(BLEND_POINT);
    for (CD3DTextSprite* s : {&sprite_, &ruby_}) {
        int32_t height = s == &sprite_ ? 16 : 8;
        CD3DTextTexture& t = s->texture();
        t.outline().font().width = 0;
        t.outline().font().height = height;
        t.outline().setDirty();
        if (t.unk124() != 0 || t.unk120() != height)
            t.setDirty();
    }
    wrap_ = false;
    align_ = 0;
    rect_[2] = 256;
    rect_[3] = 256;
    firstLine_ = 0;
    lineCount_ = 100;
    return true;
}

// @yo2 0x00634850 CTextElm::setText: with ruby, the ruby sprite gets the text and both are laid out together
void CTextElm::setText(const vc6::wstring& text) {
    sprite_.setText(text.c_str());
    if (sprite_.mode() == CD3DTextSprite::HAS_RUBY) {
        ruby_.setRubyText(text.c_str(), &sprite_.texture(), true);
        sprite_.setRubyText(text.c_str(), &ruby_.texture(), false);
    }
}

// @yo2 0x006348e0 CTextElm::text
const vc6::wstring& CTextElm::text() const { return sprite_.tex_.text(); }

// @yo2 0x00634530 CTextElm::draw ("CTextElm::Draw"/"CTextElm::DrawMatrix"): the raw text, or the wrapped lines in
// rect_'s size (with the ruby sprite) under the element's world matrix
void CTextElm::draw(int32_t) {
    if (!showText_)
        return;
    g_d3d->setMode(blendOp_);
    applyColor(&sprite_);
    if (sprite_.mode() == CD3DTextSprite::HAS_RUBY)
        applyColor(&ruby_);
    const D3DMATRIX* world = reinterpret_cast<const D3DMATRIX*>(&world_);
    if (wrap_) {
        float w = static_cast<float>(rect_[2]), h = static_cast<float>(rect_[3]);
        sprite_.drawWrapped(world, w, h, firstLine_, lineCount_, align_);
        if (sprite_.mode() == CD3DTextSprite::HAS_RUBY)
            ruby_.drawWrapped(world, w, h, firstLine_, lineCount_, align_);
    } else {
        sprite_.drawText(world);
    }
}

// @yo2 0x00634f20 CTextElm::Receive
int32_t CTextElm::receive(CTaskMessage* msg) {
    if (msg->tag == TM_DISP_STATUS) {
        auto* s = static_cast<CTmDispStatus*>(msg);
        s->print("---- CTextElm ----\n");
        s->print("TextStr = \"%s\"\n", narrowText(text()).c_str());
        if (!s->chain)
            return TR_HANDLED;
    }
    return CElement::receive(msg);
}

struct CTextElm::Layout {
    YO2_AT(CTextElm, sprite_, 0x340);
    YO2_AT(CTextElm, ruby_, 0x544);
    YO2_AT(CTextElm, wrap_, 0x748);
    YO2_AT(CTextElm, align_, 0x74c);
    YO2_AT(CTextElm, lineCount_, 0x754);
    YO2_AT(CTextElm, showText_, 0x758);
};

// ---- CTextTextureManager ----

// @yo2 0x00635360 GlyphKey::operator<
bool GlyphKey::operator<(const GlyphKey& o) const {
    if (code != o.code)
        return code < o.code;
    if (unk4 != o.unk4)
        return unk4 < o.unk4;
    return unk8 < o.unk8;
}

// @yo2 0x00635410 CTextTextureManager::CTextTextureManager
CTextTextureManager::CTextTextureManager() = default;

// @yo2 0x00635680 CTextTextureManager::~CTextTextureManager
CTextTextureManager::~CTextTextureManager() { clear(); }

// @yo2 0x006360e0 CTextTextureManager::clear: release the pages, forget the cells
void CTextTextureManager::clear() {
    for (IDirect3DTexture8* p : pages_)
        p->Release();
    pages_.clear();
    cells_.clear();
}

// @yo2 0x00636200 CTextTextureManager::onTooManyPages (empty)
static void onTooManyPages() {}

// @yo2 0x006357f0 CTextTextureManager::ReserveTexture: a new managed A8R8G8B8 page. The exe checks
// CreateTexture's result the wrong way round: success returns false and the page is lost, failure "adds" it.
bool CTextTextureManager::reserveTexture() {
    if (!g_d3d || !g_d3d->device()) {  // the exe: !g_d3d->initialized, with a MessageBox
        yo2Trace("CTextTextureManager::ReserveTexture(): CD3DDevice not initialised\n");
        return false;
    }
    if (pages_.size() > 0x28)
        onTooManyPages();
    IDirect3DDevice8* dev = g_d3d->device();
    UINT w = 256, h = 256;
    D3DXCheckTextureRequirements(dev, &w, &h, nullptr, 0, nullptr, D3DPOOL_MANAGED);
    IDirect3DTexture8* tex = nullptr;
    if (dev->CreateTexture(w, h, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &tex) == D3D_OK) {
        // (leaked, as in the exe)
        return false;
    }
    pages_.push_back(tex);
    return true;
}

// @yo2 0x00635ab0 CTextTextureManager::allocate: a size x size cell: {x, y, unkD8, unkDC}
void CTextTextureManager::allocate(int32_t out[4], int32_t size) {
    int32_t x = cursorX_, y = cursorY_;
    cursorX_ += size;
    if (cursorX_ > 0x100) {
        x = 0;
        y += rowHeight_;
        cursorY_ += rowHeight_;
        cursorX_ = size;
        rowHeight_ = 0;
    }
    if (cursorY_ + size > 0x100) {
        reserveTexture();
        x = y = 0;
        cursorX_ = size;
        cursorY_ = 0;
        rowHeight_ = 0;
    }
    if (rowHeight_ < size)
        rowHeight_ = size;
    out[0] = x;
    out[1] = y;
    out[2] = unkD8_;
    out[3] = unkDC_;
}

struct CTextTextureManager::Layout {
    YO2_AT(CTextTextureManager, pages_, 0x10);
    YO2_AT(CTextTextureManager, outline_, 0x20);
    YO2_AT(CTextTextureManager, cursorX_, 0xd0);
    YO2_AT(CTextTextureManager, rowHeight_, 0xe0);
};
