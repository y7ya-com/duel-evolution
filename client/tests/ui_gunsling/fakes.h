#pragma once
#include "System/yo2Scene.h"

struct FakeAreaMap : CSceneTask {
    bool loaded = false, frozen = false, leaving = false;
    bool onInit() override {
        createBaseElement("map");
        return true;
    }
};
