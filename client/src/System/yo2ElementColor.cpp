// CElement's one Direct3D call, apart from yo2Element.cpp so the element tree links without a device.
#include "CD3DSprite.h"
#include "yo2Element.h"

namespace {
// c = r, g, b, a in 0..1; out-of-range channels carry into the next byte, as in the exe
D3DCOLOR argb(const float c[4]) {
    auto b = [](float f) { return static_cast<uint32_t>(static_cast<int32_t>(f * 255.0f)); };
    return ((((b(c[3]) << 8) + b(c[0])) << 8) + b(c[1])) * 256u + b(c[2]);
}
}  // namespace

// @yo2 0x006100d0 CElement::applyColor: material emissive = the element colour, TEXTUREFACTOR = its additive
// colour. With D3D's default LIGHTING (never turned off) the lit vertex colour is the emissive, so for the
// blended modes the sprite's vertex colour only carries alpha.
void CElement::applyColor(CD3DSpriteBase* sprite) const {
    IDirect3DDevice8* dev = g_d3d->device();
    D3DMATERIAL8 m;
    m.Diffuse = m.Ambient = m.Specular = {1, 1, 1, 1};
    m.Power = 1;
    if (drawMode_ == OPA || drawMode_ == CUT) {
        m.Emissive = {inheritColor4_[0], inheritColor4_[1], inheritColor4_[2], 1};
        dev->SetMaterial(&m);
        g_d3d->setRenderState(D3DRS_TEXTUREFACTOR, argb(inheritAddColor_));
        return;
    }
    g_d3d->setRenderState(D3DRS_TEXTUREFACTOR, argb(inheritAddColor_));
    m.Emissive = {inheritColor4_[0], inheritColor4_[1], inheritColor4_[2], inheritColor4_[3]};
    dev->SetMaterial(&m);
    sprite->setColor(argb(inheritColor4_) & 0xff000000);
}
