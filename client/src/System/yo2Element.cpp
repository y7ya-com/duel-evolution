#include "yo2Element.h"

#include "yo2Debug.h"
#include "yo2ZSort.h"

namespace {
const char* const kDrawModeNames[CElement::DRAW_MODES] = {"OPA",         "CUT",       "BLEND",     "ADD",
                                                          "BLEND_POINT", "SWF_POINT", "SWF_LINEAR"};
const int32_t kBlendOps[CElement::DRAW_MODES] = {1, 3, 4, 6, 5, 8, 9};

CElement* parentElement(const CTask* t) { return dynamic_cast<CElement*>(t->parent()); }
}  // namespace

// @yo2 0x0060e4e0 CElement::CElement
CElement::CElement() {
    setTaskName("CElement");
    setQueue(&g_zsortSet->layer[CZSortSet::NONE]);
}

// @yo2 0x00593ac0 CElement::~CElement
// @yo2 0x00593cb0 CElement deleting destructor
CElement::~CElement() = default;

// @yo2 0x0060e380 CElement::createRoot
CElement* CElement::createRoot() {
    auto* e = new CElement;
    e->priority_ = 0;
    e->alive_ = true;
    ++s_liveTasks;
    CTmInit init;
    if (e->receive(&init) == TR_DESTROY) {
        e->destroy(__FILE__, __LINE__);
        return nullptr;
    }
    return e;
}

// @yo2 0x0060e2c0 CElement::newChild
CElement* CElement::newChild(CTask* parent, uint32_t priority) {
    auto* e = new CElement;
    return dynamic_cast<CElement*>(e->create(parent, priority));
}

// @yo2 0x00593aa0 CElement::draw (empty; shared by every empty one-argument virtual)
void CElement::draw(int32_t) {}
// @yo2 0x00593c90 CElement::onInit (shared `return true`)
bool CElement::onInit() { return true; }
// @yo2 0x00593790 CElement::onDestroy (shared empty)
void CElement::onDestroy() {}
// @yo2 0x005937b0 CElement::onTaskDestroyed (shared empty)
void CElement::onTaskDestroyed(CTmDestroyed*) {}

// @yo2 0x0060f9e0 CElement::onMain: update the matrix, then queue for drawing if shown
bool CElement::onMain() {
    updateMatrix();
    if (isVisible(true) && !hiddenByParent_) {
        for (CZSort* q : queues_)
            q->add(this, worldTranslation().z, 0);
    }
    return true;
}

// @yo2 0x0060e8f0 CElement::Receive
int32_t CElement::receive(CTaskMessage* msg) {
    switch (msg->tag) {
    case TM_INIT:
        if (!onInit())
            return TR_DESTROY;
        break;
    case TM_MAIN:
        updateHidden();
        if (!onMain())
            return TR_DESTROY;
        break;
    case TM_DESTROY:
        onDestroy();
        break;
    case TM_DESTROYED:
        onTaskDestroyed(static_cast<CTmDestroyed*>(msg));
        break;
    case TM_CAP_UTIL:
        if (static_cast<CTmCapUtil*>(msg)->code == CTmCapUtil::CYCLE_DRAW_MODE) {
            int32_t m = drawMode_ + 1;
            if (m > SWF_LINEAR)
                m = OPA;
            yo2Trace("%d\n", m);
            setDrawMode(m);
        }
        break;
    case TM_DISP_STATUS: {
        auto* s = static_cast<CTmDispStatus*>(msg);
        s->print("---- CElement ----\n");
        s->print("t          = ( %f, %f, %f )\n", pos_.x, pos_.y, pos_.z);
        s->print("s          = ( %f, %f, %f )\n", scale_.x, scale_.y, scale_.z);
        s->print("col        = ( %f, %f, %f, %f )\n", color_[0], color_[1], color_[2], color_[3]);
        s->print("add_col    = ( %f, %f, %f, %f )\n", addColor_[0], addColor_[1], addColor_[2], addColor_[3]);
        s->print("rect       = ( %d, %d, %d, %d )\n", rect_[0], rect_[1], rect_[2], rect_[3]);
        s->print("WorldPos   = ( %f, %f, %f )\n", worldPos_.x, worldPos_.y, worldPos_.z);
        s->print("WorldScale = ( %f, %f, %f )\n", worldScale_.x, worldScale_.y, worldScale_.z);
        s->print("InheritCol = ( %f, %f, %f, %f )\n", inheritColor4_[0], inheritColor4_[1], inheritColor4_[2],
                 inheritColor4_[3]);
        // the exe prints InheritCol[0] where InheritAddCol[0] belongs
        s->print("InheritAddCol = ( %f, %f, %f, %f )\n", inheritColor4_[0], inheritAddColor_[1],
                 inheritAddColor_[2], inheritAddColor_[3]);
        s->print("DrawMode   = %d:%s\n", drawMode_, kDrawModeNames[drawMode_]);
        for (int r = 0; r < 4; ++r)
            s->print(r == 0 ? "m_Matrix    = [%f, %f, %f, %f]\n" : "              [%f, %f, %f, %f]\n",
                     world_.m[r][0], world_.m[r][1], world_.m[r][2], world_.m[r][3]);
        for (int r = 0; r < 4; ++r)
            s->print(r == 0 ? "m_LocalMtx  = [%f, %f, %f, %f]\n" : "              [%f, %f, %f, %f]\n",
                     local_.m[r][0], local_.m[r][1], local_.m[r][2], local_.m[r][3]);
        if (!s->chain)
            return TR_HANDLED;
        break;
    }
    case TM_SET_DISP:
        setDisp(static_cast<CTmSetDisp*>(msg)->show, true);
        break;
    case TM_UPDATE_DISP:
        updateHidden();
        break;
    case TM_UPDATE_MATRIX:
        updateMatrix();
        break;
    }
    return CTask::receive(msg);
}

// @yo2 0x0060fa70 CElement::updateMatrix: local = S * Rz * Ry * Rx * T; world = local (* parent world); colours
void CElement::updateMatrix() {
    if (matrixLocked_)
        return;
    CElement* parent = parentElement(this);
    if (autoLocal_) {
        Mat4 r = Mat4::rotationZ(rot_.z) * (Mat4::rotationY(rot_.y) * Mat4::rotationX(rot_.x));
        local_ = Mat4::scaling(scale_.x, scale_.y, scale_.z) * r;
        local_ = local_ * Mat4::translation(pos_.x, pos_.y, pos_.z);
    }
    if (!inheritTransform_ || !parent) {
        world_ = local_;
        worldPos_ = worldTranslation();
        worldScale_ = scale_;
    } else {
        world_ = local_ * parent->world_;
        worldPos_ = worldTranslation();
        worldScale_ = scale_ * parent->worldScale_;
        if (keepLocalZ_) {
            worldPos_.z = pos_.z;
            world_.m[3][2] = pos_.z;
        }
    }
    if (parent && inheritColor_) {
        for (int i = 0; i < 4; ++i) {
            inheritColor4_[i] = parent->inheritColor4_[i] * color_[i];
            inheritAddColor_[i] = addColor_[i] + parent->inheritAddColor_[i];
        }
    } else {
        for (int i = 0; i < 4; ++i) {
            inheritColor4_[i] = color_[i];
            inheritAddColor_[i] = addColor_[i];
        }
    }
}

// @yo2 0x0060f970 CElement::updateHidden: hidden if the parent is, or if the parent hides its children
void CElement::updateHidden() {
    if (!parent_)
        return;
    CElement* p = parentElement(this);
    hiddenByParent_ = p && (p->hiddenByParent_ || p->hideChildren_);
}

// @yo2 0x0060e170 CElement::setDisp: hiding with `propagate` tells the subtree once (TM_UPDATE_DISP)
// @yo2 0x0060e200 CElement::broadcastDispUpdate
void CElement::setDisp(bool show, bool propagate) {
    disp_ = show;
    if (!show && propagate) {
        bool was = hideChildren_;
        hideChildren_ = true;
        if (!was) {
            CTmUpdateDispFlg m;
            call(&m);
        }
    } else {
        hideChildren_ = false;
    }
}

// @yo2 0x0060e1c0 CElement::isVisible: own = just the flag; otherwise also not hidden by an ancestor
bool CElement::isVisible(bool own) const {
    if (own)
        return disp_;
    return disp_ && !hiddenByParent_;
}

// @yo2 0x0060dc20 CElement::setDrawMode
void CElement::setDrawMode(int32_t mode) {
    drawMode_ = mode;
    setQueue(&g_zsortSet->layer[mode == OPA || mode == CUT ? CZSortSet::NONE : CZSortSet::MIDDLE]);
    if (mode >= 0 && mode < DRAW_MODES)
        blendOp_ = kBlendOps[mode];
}

// @yo2 0x0060dd30 CElement::setQueue: draw into this queue only
// @yo2 0x0060ffa0 vector<CZSort*>::size
// @yo2 0x0060ffd0 uninitialized_copy<CZSort**>
// @yo2 0x00610010 uninitialized_fill_n<CZSort**>
// @yo2 0x00610050 construct<CZSort*>
// @yo2 0x0060feb0 destroy<CZSort**>
void CElement::setQueue(CZSort* q) {
    queues_.clear();
    queues_.push_back(q);
}

