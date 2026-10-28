// CWindowModelThinImg (see yo2WindowThinImg.h).
#include "System/window/yo2WindowThinImg.h"

// @yo2 0x005e45a0 CWindowModelThinImg::CWindowModelThinImg
CWindowModelThinImg::CWindowModelThinImg() { setTaskName("背景絵のウィンドウ"); }

// @yo2 0x005e4a00 CWindowModelThinImg::create
CWindowModelThinImg* CWindowModelThinImg::create(CTask* parent, float x, float y, const vc6::string& picture) {
    auto* w = new CWindowModelThinImg;
    w->setup(x, y, picture);
    return dynamic_cast<CWindowModelThinImg*>(w->CTask::create(parent, 10000));
}

// @yo2 0x005e4c10 CWindowModelThinImg::setup
void CWindowModelThinImg::setup(float x, float y, const vc6::string& picture) {
    x_ = x;
    y_ = y;
    picture_ = picture;
}

// @yo2 0x005e48f0 CWindowModelThinImg::~CWindowModelThinImg
// @yo2 0x005e48c0 CWindowModelThinImg deleting destructor
CWindowModelThinImg::~CWindowModelThinImg() = default;

// @yo2 0x005e55f0 CWindowTaskTextField::setTextColor (CWindowTask.h inline)
// @yo2 0x005e5630 CWindowTaskTextField::setBackColor (CWindowTask.h inline)
// @yo2 0x005e5670 CWindowTaskTextField::clearBack (CWindowTask.h inline: setBackColor(0, 0, 0, 0))
// @yo2 0x005e4de0 CWindowModelThinImg::onInit: the picture (the window takes its size), a text field in black on
// a clear back plane, the opening zoom's values; shown, modal
bool CWindowModelThinImg::onInit() {
    callback_ = nullptr;   // (the exe drops it without deleting it)
    image_.setUser(this);
    windowSpriteCreate(image_, this, 10000, picture_);
    CElement* img = windowElement(image_);
    windowNameTask(img, "CWindowModelThinIngの背景");
    img->setDrawMode(CElement::BLEND);
    img->inheritTransform_ = true;
    float tw, th;
    windowSpriteTextureSize(image_, &tw, &th);
    w_ = tw;
    h_ = th;
    textField_ = CWindowTaskTextField::create(this, this);
    windowNameTask(textField_, "CWindowModelThinImgのテキストフィールド");
    textField_->text_->setColor(0, 0, 0, 1);
    textField_->back_->setColor(0, 0, 0, 0);
    openAnim_.kind = 2;
    openAnim_.frames = 15;
    openAnim_.unk0c = 0;
    openAnim_.unk10 = 0;
    windowShowElement(this, true);
    openAnim_.cx = static_cast<int32_t>(w_ * 0.5f + x_);
    openAnim_.cy = static_cast<int32_t>(h_ * 0.5f + y_);
    openAnim_.stepW = static_cast<int32_t>(w_ * (1.0 / 30));
    openAnim_.stepH = static_cast<int32_t>(h_ * (1.0 / 30));
    layout();
    modal_ = true;
    return true;
}

// @yo2 0x005e56b0 CWindowModelThinImg::layout
void CWindowModelThinImg::layout() {
    pos_ = {x_, y_, z_};
    textField_->setText(title_.c_str());
    textField_->x_ = textField_->pos_.x = 8;
    textField_->y_ = textField_->pos_.y = 8;
    textField_->w_ = w_ - 16;
    textField_->h_ = h_ - 16;
    textField_->layout();
    textField_->posZ_ = 0;
    textField_->layout();
}

// @yo2 0x005e57a0 CWindowModelThinImg::setText
void CWindowModelThinImg::setText(const WChar* s) { title_ = s; }

// @yo2 0x005e4810 CWindowModelThinImg::onControlCommand (the exe also formats z_ into an unused buffer)
void CWindowModelThinImg::onControlCommand(CWindowTaskControll*) {
    bringToFront();
    layout();
}
