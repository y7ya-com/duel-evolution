// yo2Scene.cpp: CSceneTask, the base of every screen (title, lobby, duel, ...). A scene is a task under the scene
// manager; what it draws hangs off its base element, created under the app's scene layer.
#pragma once
#include "yo2EasyTask.h"
#include "yo2Element.h"
#include "yo2TaskPtr.h"

class CSceneTask : public CEasyTask {
public:
    CSceneTask();
    ~CSceneTask() override;

    // Every scene's New(parent, layer): `layer` becomes the base element's parent.
    template <class T>
    static T* spawn(CTask* parent, CElement* layer) {
        T* s = new T;
        s->baseParent_ = layer;
        return dynamic_cast<T*>(s->create(parent, 10000));
    }

    void createBaseElement(const vc6::string& instName);
    CElement* baseElement() const { return baseElm_.get(); }

protected:
    CTask* baseParent_ = nullptr;  // 0x70 consumed by createBaseElement()
    CTaskPtr<CElement> baseElm_;   // 0x74 "m_pBaseElm"
    struct Layout;
};
YO2_SIZEOF(CSceneTask, 0x80);
