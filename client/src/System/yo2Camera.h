// yo2Camera.cpp: COrthoCamera, the element whose world matrix is the view: drawing it sets the view (its inverse
// world matrix), an orthographic projection and the viewport. CApp makes one ("メインカメラ") looking down -z at a
// 1024x768 screen with y pointing down.
#pragma once
#include "CD3DDevice.h"
#include "yo2Element.h"

class COrthoCamera : public CElement {
public:
    COrthoCamera();
    ~COrthoCamera() override;
    static COrthoCamera* newChild(CTask* parent, uint32_t priority);

    void draw(int32_t arg) override;
    bool onMain() override;

    // @yo2 0x0060c130 COrthoCamera::setNear
    void setNear(float z) { near_ = z; }
    // @yo2 0x0060c150 COrthoCamera::setFar
    void setFar(float z) { far_ = z; }
    // @yo2 0x0060c170 COrthoCamera::setSize: the projected width and height
    void setSize(float w, float h) {
        width_ = w;
        height_ = h;
    }
    void setViewport(DWORD x, DWORD y, DWORD w, DWORD h);
    void applyProjection() const;
    float nearZ() const { return near_; }
    float farZ() const { return far_; }
    const D3DVIEWPORT8& viewport() const { return viewport_; }

private:
    float near_ = 1.0f;       // 0x340
    float far_ = 1000.0f;     // 0x344
    float width_ = 1024.0f;   // 0x348
    float height_ = 768.0f;   // 0x34c
    D3DVIEWPORT8 viewport_{};  // 0x350
    struct Layout;
};
YO2_SIZEOF(COrthoCamera, 0x368);
