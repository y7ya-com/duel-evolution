#include "yo2Scene.h"

#include "yo2Debug.h"

// @yo2 0x0061aa70 CSceneTask::CSceneTask
CSceneTask::CSceneTask() { setTaskName("CSceneTask"); }

// @yo2 0x0061ac00 CSceneTask::~CSceneTask
// @yo2 0x0061abd0 CSceneTask deleting destructor
CSceneTask::~CSceneTask() = default;

// @yo2 0x0061ac80 CSceneTask::createBaseElement: a CElement under the scene layer, at priority 10000
void CSceneTask::createBaseElement(const vc6::string& instName) {
    baseElm_.setUser(this);
    baseElm_.set(CElement::newChild(baseParent_, 10000));
    YO2_ASSERT(dynamic_cast<CElement*>(baseElm_.task()) != nullptr, "error CSceneTask::m_pBaseElm::Create()");
    baseElm_.get()->setInstName(instName);
    baseParent_ = nullptr;
}

struct CSceneTask::Layout {
    YO2_AT(CSceneTask, baseParent_, 0x70);
    YO2_AT(CSceneTask, baseElm_, 0x74);
};
