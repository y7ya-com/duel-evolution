#include "yo2Camera.h"

#include <d3dx8.h>

namespace {
// D3DXMatrixInverse (statically linked D3DX) for the general 4x4 case; a singular matrix comes back unchanged.
D3DMATRIX inverse(const Mat4& a) {
    const float* m = &a.m[0][0];
    float inv[16];
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] +
             m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] -
             m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] +
             m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] -
              m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] -
             m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] +
             m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] -
             m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] +
              m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] +
             m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] -
             m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] +
              m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] -
              m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] -
             m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] +
             m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] -
              m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] +
              m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    D3DMATRIX r;
    float det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (det == 0) {
        std::memcpy(&r, &a, sizeof r);
        return r;
    }
    for (int i = 0; i < 16; ++i)
        (&r.m[0][0])[i] = inv[i] / det;
    return r;
}
}  // namespace

// @yo2 0x0060c270 COrthoCamera::COrthoCamera
COrthoCamera::COrthoCamera() {
    setTaskName("COrthoCamera");
    setViewport(0, 0, static_cast<DWORD>(width_), static_cast<DWORD>(height_));
    applyProjection();
}

// @yo2 0x0060c420 COrthoCamera::~COrthoCamera (CElement's teardown inlined)
// @yo2 0x0060c3f0 COrthoCamera deleting destructor
COrthoCamera::~COrthoCamera() = default;

// @yo2 0x0060c070 COrthoCamera::Create
COrthoCamera* COrthoCamera::newChild(CTask* parent, uint32_t priority) {
    auto* c = new COrthoCamera;
    return dynamic_cast<COrthoCamera*>(c->create(parent, priority));
}

// @yo2 0x0060c1a0 COrthoCamera::setViewport (depth 0..1)
void COrthoCamera::setViewport(DWORD x, DWORD y, DWORD w, DWORD h) { viewport_ = {x, y, w, h, 0.0f, 1.0f}; }

// @yo2 0x0060c620 COrthoCamera::applyProjection
void COrthoCamera::applyProjection() const {
    D3DMATRIX proj;
    D3DXMatrixOrthoLH(&proj, width_, height_, near_, far_);
    g_d3d->device()->SetTransform(D3DTS_PROJECTION, &proj);
}

// @yo2 0x0060c1f0 COrthoCamera::Draw: view = inverse(world), then the projection and viewport
void COrthoCamera::draw(int32_t) {
    D3DMATRIX view = inverse(world_);
    g_d3d->device()->SetTransform(D3DTS_VIEW, &view);
    applyProjection();
    g_d3d->device()->SetViewport(&viewport_);
}

// @yo2 0x0060c600 COrthoCamera::onMain: keep the matrix current (it is never queued for drawing)
bool COrthoCamera::onMain() {
    updateMatrix();
    return true;
}

struct COrthoCamera::Layout {
    YO2_AT(COrthoCamera, near_, 0x340);
    YO2_AT(COrthoCamera, far_, 0x344);
    YO2_AT(COrthoCamera, width_, 0x348);
    YO2_AT(COrthoCamera, viewport_, 0x350);
};
