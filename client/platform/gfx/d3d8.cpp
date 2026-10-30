// D3D8 subset on GL. Conventions that make the rest simple:
// - Every render target, the back buffer included, is an FBO stored top row first (the vertex shader flips y), so
//   GL row r == D3D row r: viewports, scissors, read-backs and texture uploads need no flipping. Present flips once.
// - Fixed-function D3D8 is CPU work plus one shader: the world matrix and D3D lighting without lights (emissive +
//   ambient, alpha from the diffuse material source) are applied as vertices are queued, so sprites batch; the
//   shader does view * projection and texture stage 0, driven by uniforms. That is all the game uses (DESIGN.md §2).
// - Textures keep their pixels on the CPU (B,G,R,A, as LockRect hands them out) and are uploaded lazily, as stored,
//   on the GL thread when drawn; the shader swizzles. Loader threads never touch GL.
#include "d3d8.h"

#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <thread>
#include <unordered_map>

#include "gl.h"
#include "platform.h"

// ---------------------------------------------------------------- shader

static const char* VS = R"(
layout(location = 0) in vec3 aPos;   // world space: the world matrix is applied on the CPU
layout(location = 1) in vec4 aColor; // lit R,G,B,A
layout(location = 2) in vec2 aUV;
uniform mat4 uViewProj;
uniform vec2 uPixel;                 // 1/viewport size
out vec4 vColor;
out vec2 vUV;
void main() {
    vec4 p = uViewProj * vec4(aPos, 1.0);   // raw D3D row-major upload = transposed, so this is v*V*P
    p.x += uPixel.x * p.w;            // D3D pixel centres sit on integer coordinates, GL's on .5
    p.y -= uPixel.y * p.w;
    p.y = -p.y;                       // targets are stored top row first
    p.z = 2.0 * p.z - p.w;            // D3D depth range is [0, w]
    gl_Position = p;
    vColor = aColor;
    vUV = aUV;
}
)";

static const char* FS = R"(
in vec4 vColor;
in vec2 vUV;
out vec4 oColor;
uniform sampler2D uTex;
uniform int uHasTex, uTexBGRA, uTexOpaque;
uniform vec2 uPointBias;            // point sampling: 1/64 texel past a texel edge (see applyState)
uniform ivec4 uColorOp, uAlphaOp;    // op, arg1, arg2, arg0
uniform vec4 uTFactor;
uniform int uAlphaFunc;
uniform float uAlphaRef;
vec4 arg(int a, vec4 tex) {
    int s = a & 15;
    vec4 v = s == 2 ? tex : s == 3 ? uTFactor : s == 4 ? vec4(0.0) : vColor;   // DIFFUSE and CURRENT are the same on stage 0
    if ((a & 0x20) != 0) v = vec4(v.a);
    if ((a & 0x10) != 0) v = 1.0 - v;
    return v;
}
vec4 op(ivec4 o, vec4 tex) {
    vec4 a1 = arg(o.y, tex), a2 = arg(o.z, tex), a0 = arg(o.w, tex);
    switch (o.x) {
    case 2: return a1;
    case 3: return a2;
    case 4: return a1 * a2;
    case 5: return 2.0 * a1 * a2;
    case 6: return 4.0 * a1 * a2;
    case 7: return a1 + a2;
    case 8: return a1 + a2 - 0.5;
    case 9: return 2.0 * (a1 + a2 - 0.5);
    case 10: return a1 - a2;
    case 11: return a1 + a2 - a1 * a2;
    case 12: return mix(a2, a1, vColor.a);
    case 13: return mix(a2, a1, tex.a);
    case 14: return mix(a2, a1, uTFactor.a);
    case 15: return a1 + a2 * (1.0 - tex.a);
    case 16: return mix(a2, a1, vColor.a);
    case 25: return a0 + a1 * a2;
    case 26: return a0 * a1 + (1.0 - a0) * a2;
    default: return vColor;          // DISABLE: stage 0 passes the diffuse colour through
    }
}
bool passes(float a) {
    float v = floor(a * 255.0 + 0.5);
    switch (uAlphaFunc) {
    case 1: return false;
    case 2: return v < uAlphaRef;
    case 3: return v == uAlphaRef;
    case 4: return v <= uAlphaRef;
    case 5: return v > uAlphaRef;
    case 6: return v != uAlphaRef;
    case 7: return v >= uAlphaRef;
    default: return true;
    }
}
void main() {
    vec4 tex = vec4(1.0);            // ponytail: no texture bound reads as white
    if (uHasTex == 1) {
        tex = texture(uTex, vUV + uPointBias);
        if (uTexBGRA == 1) tex = tex.bgra;   // CPU textures are uploaded as stored (B,G,R,A); WebGL2 has no BGRA
        if (uTexOpaque == 1) tex.a = 1.0;    // X8R8G8B8: the fourth byte is not alpha
    }
    vec4 c = vec4(clamp(op(uColorOp, tex).rgb, 0.0, 1.0), clamp(op(uAlphaOp, tex).a, 0.0, 1.0));
    if (!passes(c.a)) discard;
    oColor = c;
}
)";

#ifdef __EMSCRIPTEN__
static const char* GLSL_HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
#else
static const char* GLSL_HEAD = "#version 330 core\n";
#endif

enum { U_VIEWPROJ, U_PIXEL, U_TEX, U_HASTEX, U_TEXBGRA, U_TEXOPAQUE, U_COLOROP, U_ALPHAOP, U_TFACTOR, U_ALPHAFUNC,
       U_ALPHAREF, U_POINTBIAS, U_COUNT };
static const char* UNIFORMS[U_COUNT] = {"uViewProj", "uPixel", "uTex", "uHasTex", "uTexBGRA", "uTexOpaque",
    "uColorOp", "uAlphaOp", "uTFactor", "uAlphaFunc", "uAlphaRef", "uPointBias"};

// The program's uniforms as last sent: applyState runs on every flush (~150 a lobby frame, most only for a texture
// change) and resent all of them, each a call through WebGL's validation on the web. Only this program exists and only
// applyState sets its uniforms, so a value equal to the last one sent is skipped.
static struct { bool have[U_COUNT]; uint8_t v[U_COUNT][64]; } sent;   // cleared in init() with the program
static bool changed(int k, const void* v, size_t n) {
    if (sent.have[k] && !memcmp(sent.v[k], v, n)) return false;
    memcpy(sent.v[k], v, n);
    sent.have[k] = true;
    return true;
}
#define UNIFORM(k, fn, T, ...)                                       \
    do {                                                             \
        const T v_[] = {__VA_ARGS__};                                \
        if (changed(k, v_, sizeof v_)) fn(u[k], 1, v_);   \
    } while (0)

static GLuint compile(GLenum type, const char* body) {
    GLuint s = glCreateShader(type);
    const char* src[2] = {GLSL_HEAD, body};
    glShaderSource(s, 2, src, nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[2048];
        glGetShaderInfoLog(s, sizeof log, nullptr, log);
        fprintf(stderr, "gfx: shader: %s\n", log);
    }
    return s;
}

// ---------------------------------------------------------------- helpers

// GL names released by objects that may die on a loader thread: deleted at the next Present
static std::vector<GLuint> deadTextures, deadFbos, deadRenderbuffers;
static uint32_t rbEpoch;   // bumped when renderbuffers are deleted: GL may hand their names out again
static std::thread::id glThread;   // the thread that created the device (its GL context is current there)
extern "C" double rc_upload_ms;   // texture upload time (the GL thread) since the last frame (web/stall.js)
double rc_upload_ms;
static bool onGlThread() { return std::this_thread::get_id() == glThread; }

static D3DMATRIX identity() {
    D3DMATRIX m{};
    for (int i = 0; i < 4; i++) m.m[i][i] = 1;
    return m;
}

static D3DMATRIX mul(const D3DMATRIX& a, const D3DMATRIX& b) {
    D3DMATRIX r{};
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++)
            for (int k = 0; k < 4; k++) r.m[i][j] += a.m[i][k] * b.m[k][j];
    return r;
}

static void bgraToRgba(const uint8_t* src, int srcPitch, int w, int h, bool opaque, std::vector<uint8_t>& out) {
    out.resize((size_t)w * h * 4);
    for (int y = 0; y < h; y++) {
        const uint8_t* s = src + (size_t)y * srcPitch;
        uint8_t* d = out.data() + (size_t)y * w * 4;
        for (int x = 0; x < w; x++, s += 4, d += 4) {
            d[0] = s[2]; d[1] = s[1]; d[2] = s[0]; d[3] = opaque ? 255 : s[3];
        }
    }
}

static void color(D3DCOLOR c, float out[4]) {
    out[0] = (c >> 16 & 255) / 255.f; out[1] = (c >> 8 & 255) / 255.f;
    out[2] = (c & 255) / 255.f; out[3] = (c >> 24) / 255.f;
}

static GLenum glCmp(DWORD f) {
    static const GLenum t[] = {GL_ALWAYS, GL_NEVER, GL_LESS, GL_EQUAL, GL_LEQUAL, GL_GREATER, GL_NOTEQUAL, GL_GEQUAL,
                               GL_ALWAYS};
    return f <= 8 ? t[f] : GL_ALWAYS;
}

static GLenum glBlend(DWORD b) {
    static const GLenum t[] = {GL_ONE, GL_ZERO, GL_ONE, GL_SRC_COLOR, GL_ONE_MINUS_SRC_COLOR, GL_SRC_ALPHA,
                               GL_ONE_MINUS_SRC_ALPHA, GL_DST_ALPHA, GL_ONE_MINUS_DST_ALPHA, GL_DST_COLOR,
                               GL_ONE_MINUS_DST_COLOR};
    return b <= 10 ? t[b] : GL_ONE;
}

static GLenum glBlendOp(DWORD op) {
    static const GLenum t[] = {GL_FUNC_ADD, GL_FUNC_ADD, GL_FUNC_SUBTRACT, GL_FUNC_REVERSE_SUBTRACT, GL_MIN, GL_MAX};
    return op <= 5 ? t[op] : GL_FUNC_ADD;
}

static GLuint depthBuffer(UINT w, UINT h) {
    GLuint rb;
    glGenRenderbuffers(1, &rb);
    glBindRenderbuffer(GL_RENDERBUFFER, rb);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, w, h);
    return rb;
}

static bool isColorFormat(D3DFORMAT f) { return f == D3DFMT_A8R8G8B8 || f == D3DFMT_X8R8G8B8; }
static bool isDepthFormat(D3DFORMAT f) { return f == D3DFMT_D16 || f == D3DFMT_D24S8 || f == D3DFMT_D24X8; }

// Queued vertices were built with the old value: draw them before it changes
template <class T> static void change(IDirect3DDevice8* d, T& slot, T value) {
    if (slot != value) {
        d->flush();
        slot = value;
    }
}

// ---------------------------------------------------------------- surface

UINT IDirect3DSurface8::AddRef() { return owner ? ((D3DUnknown*)owner)->AddRef() : D3DUnknown::AddRef(); }
UINT IDirect3DSurface8::Release() { return owner ? ((D3DUnknown*)owner)->Release() : D3DUnknown::Release(); }

IDirect3DSurface8::~IDirect3DSurface8() {
    if (glFbo) deadFbos.push_back(glFbo);
    if (glColor) deadRenderbuffers.push_back(glColor);
    if (glDepth) deadRenderbuffers.push_back(glDepth);
}

HRESULT IDirect3DSurface8::GetDesc(D3DSURFACE_DESC* d) {
    if (!d) return D3DERR_INVALIDCALL;
    *d = D3DSURFACE_DESC{fmt, D3DRTYPE_SURFACE, usage, pool, w * h * 4, 0, w, h};
    return D3D_OK;
}

HRESULT IDirect3DSurface8::LockRect(D3DLOCKED_RECT* l, const RECT* r, DWORD flags) {
    if (owner) return owner->LockRect(0, l, r, flags);
    if (!l || bits.empty()) return D3DERR_INVALIDCALL;   // GPU surfaces (back buffer, depth) are not lockable
    int x = r ? r->left : 0, y = r ? r->top : 0;
    if (r && (x < 0 || y < 0 || r->right > (int32_t)w || r->bottom > (int32_t)h || x >= r->right || y >= r->bottom))
        return D3DERR_INVALIDCALL;
    l->Pitch = (int32_t)w * 4;
    l->pBits = bits.data() + (size_t)y * w * 4 + x * 4;
    return D3D_OK;
}

HRESULT IDirect3DSurface8::UnlockRect() { return owner ? owner->UnlockRect(0) : D3D_OK; }

bool IDirect3DSurface8::read(std::vector<uint8_t>& out, bool native) {
    if (!bits.empty()) { out = bits; return true; }
    if (owner && !owner->shadow.empty()) { out = owner->shadow; return true; }
    if (!onGlThread()) return false;
    dev->flush();
    if (owner && !owner->glTex) owner->sync();
    GLuint fbo = owner ? owner->glFbo : glFbo;
    if (!fbo && owner) {   // a render-target texture never rendered to: attach it to read it
        glGenFramebuffers(1, &owner->glFbo);
        glBindFramebuffer(GL_FRAMEBUFFER, owner->glFbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, owner->glTex, 0);
        fbo = owner->glFbo;
    }
    if (!fbo) return false;
    UINT pw = w * scale, ph = h * scale;
    std::vector<uint8_t> rgba((size_t)pw * ph * 4);
    glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glPixelStorei(GL_PACK_ALIGNMENT, 4);
    glReadPixels(0, 0, pw, ph, GL_RGBA, GL_UNSIGNED_BYTE, rgba.data());   // rows already top first
    dev->bindTarget();
    if (scale > 1 && !native) {   // what the game drew, at its own size: the mean of each scale x scale block
        std::vector<uint8_t> small((size_t)w * h * 4);
        for (UINT y = 0; y < h; y++)
            for (UINT x = 0; x < w; x++)
                for (int k = 0; k < 4; k++) {
                    unsigned sum = 0;
                    for (UINT j = 0; j < scale; j++)
                        for (UINT i = 0; i < scale; i++) sum += rgba[(((size_t)(y * scale + j) * pw) + x * scale + i) * 4 + k];
                    small[((size_t)y * w + x) * 4 + k] = (uint8_t)((sum + scale * scale / 2) / (scale * scale));
                }
        rgba.swap(small);
        pw = w, ph = h;
    }
    bgraToRgba(rgba.data(), pw * 4, pw, ph, false, out);   // the swap is its own inverse
    return true;
}

bool IDirect3DSurface8::write(const RECT& r, const uint8_t* src, int pitch) {
    int rw = r.right - r.left, rh = r.bottom - r.top;
    if (r.left < 0 || r.top < 0 || r.right > (int)w || r.bottom > (int)h || rw <= 0 || rh <= 0) return false;
    std::vector<uint8_t>* dst = !bits.empty() ? &bits : owner && !owner->shadow.empty() ? &owner->shadow : nullptr;
    if (dst) {
        if (owner && dev->texture == owner && onGlThread()) dev->flush();   // queued draws keep the old texels
        for (int y = 0; y < rh; y++)
            memcpy(dst->data() + ((size_t)(r.top + y) * w + r.left) * 4, src + (size_t)y * pitch, rw * 4);
        if (owner) owner->markDirty(r);
        return true;
    }
    if (!owner || !onGlThread()) return false;   // back buffer / depth; render targets only from the GL thread
    dev->flush();
    std::vector<uint8_t> rgba;   // render-target texture: straight to the GPU
    bgraToRgba(src, pitch, rw, rh, fmt == D3DFMT_X8R8G8B8, rgba);
    owner->sync();
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glTexSubImage2D(GL_TEXTURE_2D, 0, r.left, r.top, rw, rh, GL_RGBA, GL_UNSIGNED_BYTE, rgba.data());
    return true;
}

// ---------------------------------------------------------------- texture

IDirect3DTexture8::~IDirect3DTexture8() {
    IDirect3DDevice8::forgetTexture(this);
    level0.owner = nullptr;   // its own destructor must not forward to us any more
    if (glFbo) deadFbos.push_back(glFbo);
    if (glFboDepth) deadRenderbuffers.push_back(glFboDepth);
    if (glTex) deadTextures.push_back(glTex);
}

HRESULT IDirect3DTexture8::GetLevelDesc(UINT level, D3DSURFACE_DESC* d) {
    return level ? D3DERR_INVALIDCALL : level0.GetDesc(d);
}

HRESULT IDirect3DTexture8::GetSurfaceLevel(UINT level, IDirect3DSurface8** s) {
    if (level || !s) return D3DERR_INVALIDCALL;
    AddRef();
    *s = &level0;
    return D3D_OK;
}

HRESULT IDirect3DTexture8::LockRect(UINT level, D3DLOCKED_RECT* l, const RECT* r, DWORD) {
    if (level || !l || shadow.empty() || isLocked) return D3DERR_INVALIDCALL;   // render targets are not lockable
    locked = r ? *r : RECT{0, 0, (int32_t)level0.w, (int32_t)level0.h};
    if (locked.left < 0 || locked.top < 0 || locked.right > (int32_t)level0.w || locked.bottom > (int32_t)level0.h ||
        locked.left >= locked.right || locked.top >= locked.bottom)
        return D3DERR_INVALIDCALL;
    if (dev->texture == this && onGlThread()) dev->flush();   // queued draws keep the old texels
    isLocked = true;
    l->Pitch = (int32_t)level0.w * 4;
    l->pBits = shadow.data() + ((size_t)locked.top * level0.w + locked.left) * 4;
    return D3D_OK;
}

HRESULT IDirect3DTexture8::UnlockRect(UINT level) {
    if (level || !isLocked) return D3DERR_INVALIDCALL;
    isLocked = false;
    markDirty(locked);   // ponytail: READONLY locks re-upload too
    return D3D_OK;
}

void IDirect3DTexture8::markDirty(const RECT& r) {
    if (dirty.right <= dirty.left) { dirty = r; return; }
    dirty = RECT{min(dirty.left, r.left), min(dirty.top, r.top), max(dirty.right, r.right),
                 max(dirty.bottom, r.bottom)};
}

void IDirect3DTexture8::sync() {
    if (!glTex) {
        glGenTextures(1, &glTex);
        glBindTexture(GL_TEXTURE_2D, glTex);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 0);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, level0.w, level0.h, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    } else {
        glBindTexture(GL_TEXTURE_2D, glTex);
    }
    if (!hq.empty() && !isLocked) {   // the high-resolution pixels replace level 0, with a mip chain for minified draws
        auto t0 = std::chrono::steady_clock::now();
        glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, 1000);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, level0.w * hqScale, level0.h * hqScale, 0, GL_RGBA, GL_UNSIGNED_BYTE,
                     hq.data());
        glGenerateMipmap(GL_TEXTURE_2D);
        rc_upload_ms += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        std::vector<uint8_t>().swap(hq);
        hqMips = true;
        sampler[1] = -1;   // the min filter gets its mipmap form
    }
    if (hqMips) { dirty = RECT{}; return; }   // the shadow (hit tests) stays on the CPU
    if (shadow.empty() || isLocked || dirty.right <= dirty.left) return;
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    glPixelStorei(GL_UNPACK_ROW_LENGTH, level0.w);
    auto t0 = std::chrono::steady_clock::now();
    glTexSubImage2D(GL_TEXTURE_2D, 0, dirty.left, dirty.top, dirty.right - dirty.left, dirty.bottom - dirty.top,
                    GL_RGBA, GL_UNSIGNED_BYTE, shadow.data() + ((size_t)dirty.top * level0.w + dirty.left) * 4);
    rc_upload_ms += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
    dirty = RECT{};
}

// ---------------------------------------------------------------- device

// YO2_RENDER_SCALE=1|2, else 2 when the drawable has at least 1.5 physical pixels per game pixel each way (a HiDPI
// screen, or a big window), so card art and text get the detail instead of a stretched 1x frame.
// ponytail: decided once, at CreateDevice; a window later moved to another screen keeps it.
static UINT renderScale(UINT w, UINT h) {
    if (const char* e = getenv("YO2_RENDER_SCALE")) return atoi(e) >= 2 ? 2 : 1;
    int dw = 0, dh = 0;
    platformDrawableSize(&dw, &dh);
    return 2 * (UINT)dw >= 3 * w && 2 * (UINT)dh >= 3 * h ? 2 : 1;
}

bool IDirect3DDevice8::init(const D3DPRESENT_PARAMETERS& p) {
    pp = p;
    scale = renderScale(pp.BackBufferWidth, pp.BackBufferHeight);
    glThread = std::this_thread::get_id();
    GLuint vs = compile(GL_VERTEX_SHADER, VS), fs = compile(GL_FRAGMENT_SHADER, FS);
    glProgram = glCreateProgram();
    memset(&sent, 0, sizeof sent);   // a new program (GL may reuse the old name) has its defaults
    glAttachShader(glProgram, vs);
    glAttachShader(glProgram, fs);
    glLinkProgram(glProgram);
    glDeleteShader(vs);
    glDeleteShader(fs);
    GLint ok = 0;
    glGetProgramiv(glProgram, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[2048];
        glGetProgramInfoLog(glProgram, sizeof log, nullptr, log);
        fprintf(stderr, "gfx: link: %s\n", log);
        return false;
    }
    for (int i = 0; i < U_COUNT; i++) u[i] = glGetUniformLocation(glProgram, UNIFORMS[i]);
    glGenVertexArrays(1, &glVao);
    glGenBuffers(1, &glVbo);
    glBindVertexArray(glVao);
    glBindBuffer(GL_ARRAY_BUFFER, glVbo);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, x));
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(Vertex), (void*)offsetof(Vertex, c));
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, u));

    // back buffer + auto depth
    backBuffer = new IDirect3DSurface8;
    backBuffer->dev = this;
    backBuffer->w = pp.BackBufferWidth;
    backBuffer->h = pp.BackBufferHeight;
    backBuffer->fmt = D3DFMT_X8R8G8B8;
    backBuffer->pool = D3DPOOL_DEFAULT;
    backBuffer->usage = D3DUSAGE_RENDERTARGET;
    backBuffer->scale = scale;
    glGenRenderbuffers(1, &backBuffer->glColor);
    glBindRenderbuffer(GL_RENDERBUFFER, backBuffer->glColor);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, backBuffer->w * scale, backBuffer->h * scale);
    glGenFramebuffers(1, &backBuffer->glFbo);
    glBindFramebuffer(GL_FRAMEBUFFER, backBuffer->glFbo);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, backBuffer->glColor);
    if (pp.EnableAutoDepthStencil) {
        autoDepth = new IDirect3DSurface8;
        autoDepth->dev = this;
        autoDepth->w = backBuffer->w;
        autoDepth->h = backBuffer->h;
        autoDepth->fmt = pp.AutoDepthStencilFormat;
        autoDepth->pool = D3DPOOL_DEFAULT;
        autoDepth->usage = D3DUSAGE_DEPTHSTENCIL;
        autoDepth->scale = scale;
        autoDepth->glDepth = depthBuffer(autoDepth->w * scale, autoDepth->h * scale);
    }

    // D3D8 defaults
    rs[D3DRS_ZENABLE] = pp.EnableAutoDepthStencil ? 1 : 0;
    rs[D3DRS_FILLMODE] = 3;
    rs[D3DRS_SHADEMODE] = 2;
    rs[D3DRS_ZWRITEENABLE] = 1;
    rs[D3DRS_SRCBLEND] = D3DBLEND_ONE;
    rs[D3DRS_DESTBLEND] = D3DBLEND_ZERO;
    rs[D3DRS_CULLMODE] = D3DCULL_CCW;
    rs[D3DRS_ZFUNC] = D3DCMP_LESSEQUAL;
    rs[D3DRS_ALPHAFUNC] = D3DCMP_ALWAYS;
    rs[D3DRS_TEXTUREFACTOR] = 0xffffffff;
    rs[D3DRS_LIGHTING] = 1;
    rs[D3DRS_COLORVERTEX] = 1;
    rs[D3DRS_DIFFUSEMATERIALSOURCE] = D3DMCS_COLOR1;
    rs[D3DRS_SPECULARMATERIALSOURCE] = D3DMCS_COLOR2;
    rs[D3DRS_COLORWRITEENABLE] = 0xf;
    rs[D3DRS_BLENDOP] = D3DBLENDOP_ADD;
    tss[D3DTSS_COLOROP] = D3DTOP_MODULATE;
    tss[D3DTSS_COLORARG1] = D3DTA_TEXTURE;
    tss[D3DTSS_COLORARG2] = D3DTA_CURRENT;
    tss[D3DTSS_ALPHAOP] = D3DTOP_SELECTARG1;
    tss[D3DTSS_ALPHAARG1] = D3DTA_TEXTURE;
    tss[D3DTSS_ALPHAARG2] = D3DTA_CURRENT;
    tss[D3DTSS_COLORARG0] = tss[D3DTSS_ALPHAARG0] = D3DTA_CURRENT;
    tss[D3DTSS_ADDRESSU] = tss[D3DTSS_ADDRESSV] = D3DTADDRESS_WRAP;
    tss[D3DTSS_MAGFILTER] = tss[D3DTSS_MINFILTER] = D3DTEXF_POINT;
    world = view = proj = identity();
    return SetRenderTarget(backBuffer, autoDepth) == D3D_OK;
}

static void deleteInterp(IDirect3DDevice8* d);

IDirect3DDevice8::~IDirect3DDevice8() {
    deleteInterp(this);
    if (texture) texture->Release();
    if (target) target->Release();
    if (depth) depth->Release();
    if (autoDepth) autoDepth->Release();
    if (backBuffer) backBuffer->Release();
    glDeleteBuffers(1, &glVbo);
    glDeleteVertexArrays(1, &glVao);
    glDeleteProgram(glProgram);
}

HRESULT IDirect3DDevice8::Reset(D3DPRESENT_PARAMETERS* p) {
    // ponytail: same back-buffer size only (windowed <-> fullscreen keeps 800x600); the window itself is SDL's job
    if (!p || p->BackBufferWidth != pp.BackBufferWidth || p->BackBufferHeight != pp.BackBufferHeight)
        return D3DERR_INVALIDCALL;
    flush();
    pp = *p;
    return D3D_OK;
}

static double nowMs();
static double swapWorst;   // RC_60_LOG: the longest platformPresent since the last report
// a back-buffer-sized FBO onto the window (y flipped) and shown
static void toScreen(IDirect3DDevice8* d, GLuint fbo) {
    int dw, dh;
    platformDrawableSize(&dw, &dh);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, fbo);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
    glDisable(GL_SCISSOR_TEST);
    glColorMask(1, 1, 1, 1);
    int bw = (int)(d->backBuffer->w * d->scale), bh = (int)(d->backBuffer->h * d->scale);
    glBlitFramebuffer(0, 0, bw, bh, 0, dh, dw, 0, GL_COLOR_BUFFER_BIT, dw == bw && dh == bh ? GL_NEAREST : GL_LINEAR);
    double t0 = nowMs();
    platformPresent();
    swapWorst = max(swapWorst, nowMs() - t0);
    d->shown++;
}

static void presentInterp(IDirect3DDevice8* d);
static void dropFrames(IDirect3DDevice8* d);

HRESULT IDirect3DDevice8::Present(const RECT*, const RECT*, HWND, const void*) {
    flush();
    if (interp && onGlThread()) {
        presentInterp(this);
    } else {
        toScreen(this, backBuffer->glFbo);
        if (ip && onGlThread()) dropFrames(this);   // turned off: nothing recorded carries over to when it's back on
    }
    if (!deadTextures.empty()) glDeleteTextures((GLsizei)deadTextures.size(), deadTextures.data());
    if (!deadFbos.empty()) glDeleteFramebuffers((GLsizei)deadFbos.size(), deadFbos.data());
    if (!deadRenderbuffers.empty()) {
        glDeleteRenderbuffers((GLsizei)deadRenderbuffers.size(), deadRenderbuffers.data());
        rbEpoch++;
    }
    deadTextures.clear();
    deadFbos.clear();
    deadRenderbuffers.clear();
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetBackBuffer(UINT i, D3DBACKBUFFER_TYPE, IDirect3DSurface8** s) {
    if (i || !s) return D3DERR_INVALIDCALL;
    backBuffer->AddRef();
    *s = backBuffer;
    return D3D_OK;
}

static void fillCaps(D3DCAPS8& c) {
    c = D3DCAPS8{};
    c.DeviceType = D3DDEVTYPE_HAL;
    c.Caps = 0x20000;                    // READ_SCANLINE
    c.Caps2 = 0x20000000;                // CANRENDERWINDOWED
    c.Caps3 = 0x20;                      // ALPHA_FULLSCREEN_FLIP_OR_DISCARD
    c.PresentationIntervals = 0x8000000F;   // IMMEDIATE | ONE..FOUR
    c.DevCaps = 0x1A750;                 // EXECUTESYSTEMMEMORY .. HWTRANSFORMANDLIGHT, DRAWPRIMTLVERTEX, HWRASTERIZATION
    c.PrimitiveMiscCaps = 0x2CF2;        // CULLNONE/CW/CCW, COLORWRITEENABLE, BLENDOP, MASKZ
    c.RasterCaps = 0x0157D191;
    c.ZCmpCaps = c.AlphaCmpCaps = 0xFF;
    c.SrcBlendCaps = c.DestBlendCaps = 0x1FFF;
    c.ShadeCaps = 0x00084208;
    // What a typical 2008 card reported: POW2 + NONPOW2CONDITIONAL, so D3DX rounds texture sizes up to powers of two
    c.TextureCaps = 0x0001CC45 | D3DPTEXTURECAPS_POW2 | D3DPTEXTURECAPS_NONPOW2CONDITIONAL;
    c.TextureFilterCaps = 0x03030300;    // MIN/MAG POINT+LINEAR, MIP POINT+LINEAR
    c.TextureAddressCaps = c.LineCaps = 0x1F;
    c.MaxTextureWidth = c.MaxTextureHeight = 4096;
    c.MaxTextureRepeat = 8192;
    c.MaxTextureAspectRatio = 4096;
    c.MaxAnisotropy = 1;
    c.MaxVertexW = 1e10f;
    c.GuardBandLeft = c.GuardBandTop = -32768.f;
    c.GuardBandRight = c.GuardBandBottom = 32768.f;
    c.FVFCaps = 0x80008;                 // 8 texture coordinate sets, PSIZE
    c.TextureOpCaps = 0x03FFFFFF;        // every op, MULTIPLYADD and LERP included
    c.MaxTextureBlendStages = c.MaxSimultaneousTextures = 8;
    c.VertexProcessingCaps = 0x3B;
    c.MaxActiveLights = 8;
    c.MaxUserClipPlanes = 6;
    c.MaxPointSize = 64.f;
    c.MaxPrimitiveCount = c.MaxVertexIndex = 0xFFFFF;
    c.MaxStreams = 8;
    c.MaxStreamStride = 1024;
}

HRESULT IDirect3DDevice8::GetDeviceCaps(D3DCAPS8* caps) {
    if (!caps) return D3DERR_INVALIDCALL;
    fillCaps(*caps);
    return D3D_OK;
}

HRESULT IDirect3DDevice8::CreateTexture(UINT w, UINT h, UINT, DWORD usage, D3DFORMAT fmt, D3DPOOL pool,
                                        IDirect3DTexture8** out) {
    if (!out || !w || !h || w > 4096 || h > 4096 || !isColorFormat(fmt)) return D3DERR_INVALIDCALL;
    if ((usage & D3DUSAGE_RENDERTARGET) && pool != D3DPOOL_DEFAULT) return D3DERR_INVALIDCALL;
    IDirect3DTexture8* t = new IDirect3DTexture8;   // no GL here: loader threads create textures (sync() makes glTex)
    t->dev = this;
    IDirect3DSurface8& s = t->level0;
    s.dev = this;
    s.owner = t;
    s.w = w;
    s.h = h;
    s.fmt = fmt;
    s.pool = pool;
    s.usage = usage;
    if (!(usage & D3DUSAGE_RENDERTARGET)) {
        t->shadow.assign((size_t)w * h * 4, 0);   // zeros = transparent black, both A8 and X8
        t->dirty = RECT{0, 0, (int32_t)w, (int32_t)h};   // the first sync defines every texel
    }
    *out = t;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::CreateImageSurface(UINT w, UINT h, D3DFORMAT fmt, IDirect3DSurface8** out) {
    if (!out || !w || !h || !isColorFormat(fmt)) return D3DERR_INVALIDCALL;
    IDirect3DSurface8* s = new IDirect3DSurface8;
    s->dev = this;
    s->w = w;
    s->h = h;
    s->fmt = fmt;
    s->bits.assign((size_t)w * h * 4, 0);
    *out = s;
    return D3D_OK;
}

// Copies between surfaces with pixels on the CPU; a GPU source (back buffer, render-target texture) is read back
HRESULT IDirect3DDevice8::CopyRects(IDirect3DSurface8* src, const RECT* rects, UINT count, IDirect3DSurface8* dst,
                                    const POINT* points) {
    std::vector<uint8_t> px;
    if (!src || !dst || !src->read(px)) return D3DERR_INVALIDCALL;   // both formats are 32-bit B,G,R,A(X)
    for (UINT i = 0; i < (rects ? count : 1); i++) {
        RECT r = rects ? rects[i] : RECT{0, 0, (int32_t)src->w, (int32_t)src->h};
        if (r.left < 0 || r.top < 0 || r.right > (int32_t)src->w || r.bottom > (int32_t)src->h ||
            r.left >= r.right || r.top >= r.bottom)
            return D3DERR_INVALIDCALL;
        int dx = points ? points[i].x : r.left, dy = points ? points[i].y : r.top;
        RECT d{dx, dy, dx + (r.right - r.left), dy + (r.bottom - r.top)};
        if (!dst->write(d, px.data() + ((size_t)r.top * src->w + r.left) * 4, src->w * 4)) return D3DERR_INVALIDCALL;
    }
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetRenderTarget(IDirect3DSurface8* rt, IDirect3DSurface8* ds) {
    if (!rt) rt = target;   // D3D8: NULL keeps the current colour target
    if (!rt || !(rt->usage & D3DUSAGE_RENDERTARGET)) return D3DERR_INVALIDCALL;
    if (rt != target || ds != depth) flush();
    rt->AddRef();
    if (ds) ds->AddRef();
    if (target) target->Release();
    if (depth) depth->Release();
    target = rt;
    depth = ds;
    vp = D3DVIEWPORT8{0, 0, rt->w, rt->h, 0, 1};   // D3D8 resets the viewport to the whole target
    return D3D_OK;
}

// Re-attaching to an FBO, even the same object, dirties it: Apple's GL then ends the Metal render pass at the next draw
// and syncs the queue (~55% of main-thread time when it ran on every flush). Attach only when it changes.
static void attachDepth(IDirect3DSurface8* target, GLuint rb) {
    uint64_t key = (uint64_t)rbEpoch << 32 | rb;
    if (target->fboDepth == key) return;
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, rb);
    target->fboDepth = key;
}

void IDirect3DDevice8::bindTarget() {
    if (!target->owner) {   // back buffer: its depth is fixed
        glBindFramebuffer(GL_FRAMEBUFFER, target->glFbo);
        attachDepth(target, depth ? depth->glDepth : 0);
        return;
    }
    IDirect3DTexture8* t = target->owner;
    if (!t->glTex) t->sync();
    if (!t->glFbo) {
        glGenFramebuffers(1, &t->glFbo);
        glBindFramebuffer(GL_FRAMEBUFFER, t->glFbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t->glTex, 0);   // glTex never changes
    }
    glBindFramebuffer(GL_FRAMEBUFFER, t->glFbo);
    GLuint rb = 0;
    if (depth && depth->w * depth->scale == target->w && depth->h * depth->scale == target->h) {   // texture: scale 1
        rb = depth->glDepth;
    } else if (depth) {   // WebGL2 wants equal attachment sizes: give the texture a depth buffer of its own
        if (!t->glFboDepth) t->glFboDepth = depthBuffer(target->w, target->h);
        rb = t->glFboDepth;
    }
    attachDepth(target, rb);
}

HRESULT IDirect3DDevice8::GetRenderTarget(IDirect3DSurface8** s) {
    if (!s) return D3DERR_INVALIDCALL;
    target->AddRef();
    *s = target;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetDepthStencilSurface(IDirect3DSurface8** s) {
    if (!s) return D3DERR_INVALIDCALL;
    *s = depth;
    if (!depth) return D3DERR_NOTAVAILABLE;
    depth->AddRef();
    return D3D_OK;
}

static void recordClear(IDirect3DDevice8* d, DWORD count, const D3DRECT* rects, DWORD flags, D3DCOLOR c, float z,
                        DWORD stencil);

HRESULT IDirect3DDevice8::Clear(DWORD count, const D3DRECT* rects, DWORD flags, D3DCOLOR c, float z, DWORD stencil) {
    flush();
    GLbitfield mask = 0;
    if (flags & D3DCLEAR_TARGET) {
        float f[4];
        color(c, f);
        glClearColor(f[0], f[1], f[2], target->fmt == D3DFMT_X8R8G8B8 ? 1.f : f[3]);   // X8 has no alpha: keep it 1
        glColorMask(1, 1, 1, 1);
        mask |= GL_COLOR_BUFFER_BIT;
    }
    if ((flags & D3DCLEAR_ZBUFFER) && depth) {
        glClearDepthf(z);
        glDepthMask(1);
        mask |= GL_DEPTH_BUFFER_BIT;
    }
    if ((flags & D3DCLEAR_STENCIL) && depth) {
        glClearStencil((GLint)stencil);
        glStencilMask(0xff);
        mask |= GL_STENCIL_BUFFER_BIT;
    }
    if (!mask) return D3D_OK;
    if (interp && target == backBuffer && onGlThread()) recordClear(this, count, rects, flags, c, z, stencil);
    bindTarget();
    glEnable(GL_SCISSOR_TEST);   // D3D clears only the viewport (and the rects inside it)
    for (DWORD i = 0; i < (rects ? count : 1); i++) {
        int x0 = vp.X, y0 = vp.Y, x1 = vp.X + vp.Width, y1 = vp.Y + vp.Height;
        if (rects) {
            x0 = x0 > rects[i].x1 ? x0 : rects[i].x1; y0 = y0 > rects[i].y1 ? y0 : rects[i].y1;
            x1 = x1 < rects[i].x2 ? x1 : rects[i].x2; y1 = y1 < rects[i].y2 ? y1 : rects[i].y2;
        }
        if (x1 <= x0 || y1 <= y0) continue;
        int s = (int)target->scale;
        glScissor(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);   // top-first storage: D3D rows are GL rows
        glClear(mask);
    }
    glDisable(GL_SCISSOR_TEST);
    return D3D_OK;
}

static D3DMATRIX* transform(IDirect3DDevice8* d, D3DTRANSFORMSTATETYPE s) {
    return s == D3DTS_WORLD ? &d->world : s == D3DTS_VIEW ? &d->view : s == D3DTS_PROJECTION ? &d->proj : nullptr;
}

HRESULT IDirect3DDevice8::SetTransform(D3DTRANSFORMSTATETYPE s, const D3DMATRIX* m) {
    D3DMATRIX* t = transform(this, s);
    if (!m) return D3DERR_INVALIDCALL;
    if (!t) return D3D_OK;   // texture transforms are accepted and ignored: TEXTURETRANSFORMFLAGS is never set
    if (t != &world && memcmp(t, m, sizeof *m)) flush();   // the world matrix is applied per vertex as it is queued
    *t = *m;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetTransform(D3DTRANSFORMSTATETYPE s, D3DMATRIX* m) {
    D3DMATRIX* t = transform(this, s);
    if (!t || !m) return D3DERR_INVALIDCALL;
    *m = *t;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetViewport(const D3DVIEWPORT8* v) {
    if (!v || v->X + v->Width > target->w || v->Y + v->Height > target->h) return D3DERR_INVALIDCALL;
    if (memcmp(v, &vp, sizeof vp)) flush();
    vp = *v;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetViewport(D3DVIEWPORT8* v) {
    if (!v) return D3DERR_INVALIDCALL;
    *v = vp;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetMaterial(const D3DMATERIAL8* m) {
    if (!m) return D3DERR_INVALIDCALL;
    material = *m;   // applied per vertex as it is queued: no flush
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetMaterial(D3DMATERIAL8* m) {
    if (!m) return D3DERR_INVALIDCALL;
    *m = material;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetRenderState(D3DRENDERSTATETYPE s, DWORD v) {
    if (s >= 256) return D3DERR_INVALIDCALL;
    bool perVertex = s == D3DRS_LIGHTING || s == D3DRS_AMBIENT || s == D3DRS_COLORVERTEX ||
                     (s >= D3DRS_DIFFUSEMATERIALSOURCE && s <= D3DRS_EMISSIVEMATERIALSOURCE);
    if (perVertex) rs[s] = v;
    else change(this, rs[s], v);
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetRenderState(D3DRENDERSTATETYPE s, DWORD* v) {
    if (s >= 256 || !v) return D3DERR_INVALIDCALL;
    *v = rs[s];
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetTexture(DWORD stage, IDirect3DTexture8* t) {
    if (stage >= 8) return D3DERR_INVALIDCALL;
    if (stage) return t ? D3DERR_INVALIDCALL : D3D_OK;   // stage 1+ never textured by the game
    if (t == texture) return D3D_OK;
    flush();
    if (t) t->AddRef();
    if (texture) texture->Release();
    texture = t;
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE type, DWORD v) {
    if (stage >= 8 || type >= 29) return D3DERR_INVALIDCALL;
    if (stage) return D3D_OK;   // ponytail: stages 1+ stay DISABLE; the mode tables only touch stage 0
    change(this, tss[type], v);
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE type, DWORD* v) {
    if (stage >= 8 || type >= 29 || !v) return D3DERR_INVALIDCALL;
    *v = stage ? (type == D3DTSS_COLOROP || type == D3DTSS_ALPHAOP ? D3DTOP_DISABLE : 0) : tss[type];
    return D3D_OK;
}

HRESULT IDirect3DDevice8::SetVertexShader(DWORD f) {
    // FVF only: XYZ, optional DIFFUSE, 0 or 1 texture coordinate set (the game uses XYZ|DIFFUSE|TEX1)
    if ((f & 0xe) != D3DFVF_XYZ || (f & ~(DWORD)(0xe | D3DFVF_DIFFUSE | 0xf00)) || (f >> 8 & 0xf) > 1)
        return D3DERR_INVALIDCALL;
    fvf = f;   // only how DrawPrimitiveUP reads vertices: no flush
    return D3D_OK;
}

HRESULT IDirect3DDevice8::GetVertexShader(DWORD* f) {
    if (!f) return D3DERR_INVALIDCALL;
    *f = fvf;
    return D3D_OK;
}

void IDirect3DDevice8::applyState() {
    glUseProgram(glProgram);
    bindTarget();
    glDisable(GL_SCISSOR_TEST);
    // the render scale is only the GL viewport: vertices stay in game pixels (uPixel's half-pixel shift included),
    // so a game pixel covers scale x scale screen pixels and a scale-x texture maps texel for pixel
    UINT s = target->scale;
    glViewport(vp.X * s, vp.Y * s, vp.Width * s, vp.Height * s);
    glDepthRangef(vp.MinZ, vp.MaxZ);
    D3DMATRIX vpm = mul(view, proj);
    if (changed(U_VIEWPROJ, &vpm, sizeof vpm)) glUniformMatrix4fv(u[U_VIEWPROJ], 1, GL_FALSE, &vpm.m[0][0]);
    UNIFORM(U_PIXEL, glUniform2fv, GLfloat, 1.f / vp.Width, 1.f / vp.Height);
    UNIFORM(U_COLOROP, glUniform4iv, GLint, (GLint)tss[D3DTSS_COLOROP], (GLint)tss[D3DTSS_COLORARG1],
            (GLint)tss[D3DTSS_COLORARG2], (GLint)tss[D3DTSS_COLORARG0]);
    // D3D: with COLOROP DISABLE the alpha op is disabled too
    UNIFORM(U_ALPHAOP, glUniform4iv, GLint, (GLint)(tss[D3DTSS_COLOROP] == D3DTOP_DISABLE ? D3DTOP_DISABLE : tss[D3DTSS_ALPHAOP]),
            (GLint)tss[D3DTSS_ALPHAARG1], (GLint)tss[D3DTSS_ALPHAARG2], (GLint)tss[D3DTSS_ALPHAARG0]);
    float f[4];
    color(rs[D3DRS_TEXTUREFACTOR], f);
    UNIFORM(U_TFACTOR, glUniform4fv, GLfloat, f[0], f[1], f[2], f[3]);
    UNIFORM(U_ALPHAFUNC, glUniform1iv, GLint, (GLint)(rs[D3DRS_ALPHATESTENABLE] ? (int)rs[D3DRS_ALPHAFUNC] : D3DCMP_ALWAYS));
    UNIFORM(U_ALPHAREF, glUniform1fv, GLfloat, (float)(rs[D3DRS_ALPHAREF] & 255));
    UNIFORM(U_TEX, glUniform1iv, GLint, 0);
    UNIFORM(U_HASTEX, glUniform1iv, GLint, texture ? 1 : 0);
    UNIFORM(U_TEXBGRA, glUniform1iv, GLint, texture && !texture->shadow.empty() ? 1 : 0);   // render targets hold real RGBA
    UNIFORM(U_TEXOPAQUE, glUniform1iv, GLint, texture && texture->level0.fmt == D3DFMT_X8R8G8B8 ? 1 : 0);
    // Integer-aligned sprites put D3D's pixel centres exactly on texel edges, where point sampling takes the texel
    // after the edge only in exact arithmetic: a hair less picks the one before (the duel bust's chest seam under
    // Wine, at its arm cut-out's edge). 1/64 texel puts every edge sample past the edge; centre samples stay put.
    bool point = texture && tss[D3DTSS_MAGFILTER] < D3DTEXF_LINEAR;
    UNIFORM(U_POINTBIAS, glUniform2fv, GLfloat, point ? 1.f / (64 * texture->level0.w) : 0, point ? 1.f / (64 * texture->level0.h) : 0);

    if (rs[D3DRS_ZENABLE] && depth) {
        glEnable(GL_DEPTH_TEST);
        glDepthFunc(glCmp(rs[D3DRS_ZFUNC]));
        glDepthMask(rs[D3DRS_ZWRITEENABLE] ? 1 : 0);
    } else {
        glDisable(GL_DEPTH_TEST);
    }
    if (rs[D3DRS_ALPHABLENDENABLE]) {
        glEnable(GL_BLEND);
        glBlendFunc(glBlend(rs[D3DRS_SRCBLEND]), glBlend(rs[D3DRS_DESTBLEND]));
        glBlendEquation(glBlendOp(rs[D3DRS_BLENDOP]));
    } else {
        glDisable(GL_BLEND);
    }
    // The y flip turns D3D's on-screen clockwise into GL's counter-clockwise
    if (rs[D3DRS_CULLMODE] == D3DCULL_NONE) {
        glDisable(GL_CULL_FACE);
    } else {
        glEnable(GL_CULL_FACE);
        glFrontFace(GL_CCW);
        glCullFace(rs[D3DRS_CULLMODE] == D3DCULL_CCW ? GL_BACK : GL_FRONT);
    }
    DWORD cw = rs[D3DRS_COLORWRITEENABLE];
    glColorMask(cw & 1, cw >> 1 & 1, cw >> 2 & 1, (cw >> 3 & 1) && target->fmt != D3DFMT_X8R8G8B8);

    glActiveTexture(GL_TEXTURE0);
    if (!texture) {
        glBindTexture(GL_TEXTURE_2D, 0);
        return;
    }
    texture->sync();   // binds it, uploading what changed since
    bool mips = texture->hqMips;
    auto filter = [](DWORD f) { return (int32_t)(f >= D3DTEXF_LINEAR ? GL_LINEAR : GL_NEAREST); };
    auto wrap = [](DWORD a) {
        return (int32_t)(a == D3DTADDRESS_WRAP ? GL_REPEAT : a == D3DTADDRESS_MIRROR ? GL_MIRRORED_REPEAT
                                                                                       : GL_CLAMP_TO_EDGE);
    };
    int32_t minf = filter(tss[D3DTSS_MINFILTER]);
    if (mips) minf = minf == GL_LINEAR ? GL_LINEAR_MIPMAP_LINEAR : GL_NEAREST_MIPMAP_NEAREST;
    int32_t want[4] = {filter(tss[D3DTSS_MAGFILTER]), minf, wrap(tss[D3DTSS_ADDRESSU]), wrap(tss[D3DTSS_ADDRESSV])};
    static const GLenum names[4] = {GL_TEXTURE_MAG_FILTER, GL_TEXTURE_MIN_FILTER, GL_TEXTURE_WRAP_S,
                                    GL_TEXTURE_WRAP_T};
    for (int i = 0; i < 4; i++)
        if (texture->sampler[i] != want[i]) glTexParameteri(GL_TEXTURE_2D, names[i], texture->sampler[i] = want[i]);
}

void IDirect3DDevice8::flush() {
    if (batch.empty()) return;
    if (!onGlThread()) {   // a state change from a loader thread: the GL thread draws the batch at its next flush
        static bool warned;
        if (!warned) fprintf(stderr, "gfx: draw state changed off the GL thread\n");
        warned = true;
        return;
    }
    applyState();
    if (interp && target == backBuffer) record();
    glBindVertexArray(glVao);
    glBindBuffer(GL_ARRAY_BUFFER, glVbo);
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)(batch.size() * sizeof(Vertex)), batch.data(), GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLES, 0, (GLsizei)batch.size());
    batch.clear();
    batchCalls.clear();
}

// D3D lighting without lights: rgb = emissive + ambient * D3DRS_AMBIENT, alpha from the diffuse source
static void lit(const IDirect3DDevice8* d, D3DCOLOR vertexColor, bool hasColor, uint8_t out[4]) {
    float vc[4], r[4];
    color(hasColor ? vertexColor : 0xffffffff, vc);
    if (d->rs[D3DRS_LIGHTING]) {
        bool cv = d->rs[D3DRS_COLORVERTEX] && hasColor;
        auto src = [&](D3DRENDERSTATETYPE state, const D3DCOLORVALUE& m) {
            return cv && d->rs[state] == D3DMCS_COLOR1 ? vc : &m.r;
        };
        const float* dif = src(D3DRS_DIFFUSEMATERIALSOURCE, d->material.Diffuse);
        const float* amb = src(D3DRS_AMBIENTMATERIALSOURCE, d->material.Ambient);
        const float* emi = src(D3DRS_EMISSIVEMATERIALSOURCE, d->material.Emissive);
        float ga[4];
        color(d->rs[D3DRS_AMBIENT], ga);
        for (int i = 0; i < 3; i++) r[i] = emi[i] + amb[i] * ga[i];
        r[3] = dif[3];
    } else {
        memcpy(r, vc, sizeof r);
    }
    for (int i = 0; i < 4; i++) out[i] = (uint8_t)(min(max(r[i], 0.f), 1.f) * 255.f + 0.5f);
}

static void describeCall(IDirect3DDevice8* d, size_t v0);
static bool noteCursor(IDirect3DDevice8* d, const IDirect3DDevice8::Vertex* v, UINT n);

HRESULT IDirect3DDevice8::DrawPrimitiveUP(D3DPRIMITIVETYPE type, UINT count, const void* v, UINT stride) {
    // ponytail: triangles only (the game draws strips); points and lines would need a batch of their own
    if (!v || !count || type < D3DPT_TRIANGLELIST || type > D3DPT_TRIANGLEFAN || !fvf) return D3DERR_INVALIDCALL;
    bool hasColor = fvf & D3DFVF_DIFFUSE, hasUV = fvf & 0xf00;
    UINT need = 12 + (hasColor ? 4 : 0) + (hasUV ? 8 : 0);
    if (stride < need) return D3DERR_INVALIDCALL;
    UINT n = type == D3DPT_TRIANGLELIST ? count * 3 : count + 2;
    static std::vector<Vertex> verts;
    verts.resize(n);
    const D3DMATRIX& w = world;
    for (UINT i = 0; i < n; i++) {
        const uint8_t* p = (const uint8_t*)v + (size_t)i * stride;
        float x, y, z;
        memcpy(&x, p, 4); memcpy(&y, p + 4, 4); memcpy(&z, p + 8, 4);
        Vertex& o = verts[i];
        float ww = x * w.m[0][3] + y * w.m[1][3] + z * w.m[2][3] + w.m[3][3];
        float inv = ww != 0 && ww != 1 ? 1.f / ww : 1.f;   // ponytail: a projective world matrix divides early
        o.x = (x * w.m[0][0] + y * w.m[1][0] + z * w.m[2][0] + w.m[3][0]) * inv;
        o.y = (x * w.m[0][1] + y * w.m[1][1] + z * w.m[2][1] + w.m[3][1]) * inv;
        o.z = (x * w.m[0][2] + y * w.m[1][2] + z * w.m[2][2] + w.m[3][2]) * inv;
        D3DCOLOR c = 0;
        if (hasColor) memcpy(&c, p + 12, 4);
        lit(this, c, hasColor, o.c);
        if (hasUV) { memcpy(&o.u, p + need - 8, 4); memcpy(&o.v, p + need - 4, 4); }
        else o.u = o.v = 0;
    }
    if (hwCursor && texture && texture->cursor && target == backBuffer && noteCursor(this, verts.data(), n))
        return D3D_OK;
    size_t v0 = batch.size();
    if (type == D3DPT_TRIANGLELIST) {
        batch.insert(batch.end(), verts.begin(), verts.end());
    } else {
        for (UINT i = 0; i < count; i++) {
            if (type == D3DPT_TRIANGLESTRIP) {   // keep the winding of odd triangles
                batch.push_back(verts[i + (i & 1)]); batch.push_back(verts[i + 1 - (i & 1)]); batch.push_back(verts[i + 2]);
            } else {
                batch.push_back(verts[0]); batch.push_back(verts[i + 1]); batch.push_back(verts[i + 2]);
            }
        }
    }
    if (interp && target == backBuffer) describeCall(this, v0);
    return D3D_OK;
}

// ---------------------------------------------------------------- in-between frames (60 Hz on a 30 Hz game)
// The game steps at a fixed 30 Hz (CApp::frameLoop's 33 ms slots) and counts frames for every animation, fade and
// timer, so a faster step would play everything faster. Instead the screen gets a frame between each two steps: every
// back-buffer draw of a step is recorded as it goes out, and its Present shows the step halfway from the one before:
// each sprite (one DrawPrimitiveUP) is matched to the nearest same sprite last step (same texture, vertex count and
// UVs; else same texture, vertex count and size, i.e. its next animation frame) and drawn at the midpoint of the two
// positions and colours, the camera likewise. The step's own frame is held aside and shown half a step later
// (presentHeld, from the host's main-thread sleep). Game logic, timing, input and everything the game reads back are
// untouched; the screen trails the step by half a step (~17 ms). Unmatched sprites (new, or moved more than kJump) show
// where this step put them; render-target draws are not recorded (the in-between frame reads their textures as they
// are). Off by itself (back to presenting each step once) while steps run late or the in-between frame costs too much.
static double nowMs() {
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}
namespace {
constexpr float kJump = 128;   // game pixels a sprite may move in one step and still be in-betweened
uint32_t fnv(uint32_t h, const void* p, size_t n) {
    for (size_t i = 0; i < n; i++) h = (h ^ ((const uint8_t*)p)[i]) * 16777619u;
    return h;
}
}  // namespace

struct D3DInterp {
    struct Batch {
        DWORD rs[256], tss[29];
        IDirect3DTexture8* tex;   // null when it died since (forgetTexture): the batch is skipped
        D3DVIEWPORT8 vp;
        D3DMATRIX view, proj;
        bool depth, clear, dead;
        uint32_t v0, vn, c0, cn;   // its vertices and calls in the frame (a clear: its rects)
        DWORD cflags, cstencil;
        D3DCOLOR ccolor;
        float cz;
    };
    struct Frame {
        std::vector<Batch> batches;
        std::vector<IDirect3DDevice8::Vertex> verts;
        std::vector<IDirect3DDevice8::Call> calls;
        std::vector<uint32_t> callBatch;
        std::vector<D3DRECT> rects;
        void clear() { batches.clear(), verts.clear(), calls.clear(), callBatch.clear(), rects.clear(); }
    };
    Frame cur, prev;
    std::vector<int32_t> match;   // per call of cur: its call in prev, or -1
    std::mutex mu;                // the frames' textures, against a texture dying on a loader thread
    IDirect3DSurface8 *surf = nullptr, *depthSurf = nullptr;   // the in-between frame's target
    GLuint heldFbo = 0, heldColor = 0;                         // this step's frame, shown half a step later
    bool pending = false;
    double dueAt = 0;
    double last = 0, interval = 33.3, cost = 0;   // averages: ms between steps' Presents, ms an in-between frame takes
    uint64_t late = 0;                            // the last 64 steps, a bit each: came over 45 ms after the one before
    uint64_t costly = 0;                          // the last 64 in-between frames, a bit each: took over 8 ms
    bool off = false;
    double offUntil = 0, backoff = 10e3;
};
static IDirect3DDevice8* interpDev;   // the device with recorded frames (textures die after their device, at exit)

static void dropFrames(IDirect3DDevice8* d) {
    std::lock_guard<std::mutex> lock(d->ip->mu);
    d->ip->cur.clear(), d->ip->prev.clear(), d->ip->pending = false;
}

static void deleteInterp(IDirect3DDevice8* d) {
    if (!d->ip) return;
    delete d->ip->surf;
    delete d->ip->depthSurf;
    if (d->ip->heldFbo) deadFbos.push_back(d->ip->heldFbo);
    if (d->ip->heldColor) deadRenderbuffers.push_back(d->ip->heldColor);
    delete d->ip;
    d->ip = nullptr;
    if (interpDev == d) interpDev = nullptr;
}

// a vertex (world applied) through view, projection and viewport: game pixels; false behind the camera
static bool screenPx(const IDirect3DDevice8* d, const D3DMATRIX& m, const IDirect3DDevice8::Vertex& v, float* px, float* py) {
    float w = v.x * m.m[0][3] + v.y * m.m[1][3] + v.z * m.m[2][3] + m.m[3][3];
    if (w <= 0) return false;
    *px = d->vp.X + ((v.x * m.m[0][0] + v.y * m.m[1][0] + v.z * m.m[2][0] + m.m[3][0]) / w + 1) * 0.5f * d->vp.Width;
    *py = d->vp.Y + (1 - (v.x * m.m[0][1] + v.y * m.m[1][1] + v.z * m.m[2][1] + m.m[3][1]) / w) * 0.5f * d->vp.Height;
    return true;
}

// The cursor sprite's texels and place (hwCursor): false draws it as usual (not a plain on-screen quad of the shadow)
static bool noteCursor(IDirect3DDevice8* d, const IDirect3DDevice8::Vertex* v, UINT n) {
    IDirect3DTexture8* t = d->texture;
    if (t->shadow.empty() || n < 3) return false;
    D3DMATRIX m = mul(d->view, d->proj);
    float x0 = 1e9f, y0 = 1e9f, u0 = 1e9f, v0 = 1e9f, u1 = -1e9f, v1 = -1e9f;
    for (UINT i = 0; i < n; i++) {
        float px, py;
        if (!screenPx(d, m, v[i], &px, &py)) return false;
        x0 = min(x0, px), y0 = min(y0, py);
        u0 = min(u0, v[i].u), v0 = min(v0, v[i].v), u1 = max(u1, v[i].u), v1 = max(v1, v[i].v);
    }
    int tw = (int)t->level0.w, th = (int)t->level0.h;
    IDirect3DDevice8::CursorDraw c{t, (int)lroundf(u0 * tw), (int)lroundf(v0 * th), (int)lroundf((u1 - u0) * tw),
                                   (int)lroundf((v1 - v0) * th), x0, y0, true};
    if (c.u < 0 || c.v < 0 || c.w <= 0 || c.h <= 0 || c.u + c.w > tw || c.v + c.h > th) return false;
    d->cursorDraw = c;
    return true;
}

// One draw call's identity for matching (exact: texture, vertex count, UVs; loose: texture, vertex count, size on
// screen) and its centre on screen, in game pixels
static void describeCall(IDirect3DDevice8* d, size_t v0) {
    if (d->ip && d->ip->off) return;
    D3DMATRIX m = mul(d->view, d->proj);
    uint32_t n = (uint32_t)(d->batch.size() - v0), key = fnv(2166136261u, &d->texture, sizeof d->texture);
    key = fnv(key, &n, 4);
    float sx = 0, sy = 0, x0 = 1e9f, y0 = 1e9f, x1 = -1e9f, y1 = -1e9f;
    bool behind = false;
    for (size_t i = v0; i < d->batch.size(); i++) {
        const IDirect3DDevice8::Vertex& v = d->batch[i];
        key = fnv(key, &v.u, 8);
        float px, py;
        if (!screenPx(d, m, v, &px, &py)) { behind = true; continue; }
        sx += px, sy += py;
        x0 = min(x0, px), y0 = min(y0, py), x1 = max(x1, px), y1 = max(y1, py);
    }
    IDirect3DDevice8::Call c{key, 0, (uint32_t)v0, n, 0, 0};
    if (behind || !n) {
        c.sx = c.sy = NAN;   // never matched
    } else {
        c.sx = sx / n, c.sy = sy / n;
        int32_t size[2] = {(int32_t)((x1 - x0) * 0.5f + 0.5f), (int32_t)((y1 - y0) * 0.5f + 0.5f)};
        c.loose = fnv(fnv(fnv(2166136261u, &d->texture, sizeof d->texture), &n, 4), size, 8);
    }
    d->batchCalls.push_back(c);
}

// flush(): the batch about to go to the back buffer, with the state it draws with
void IDirect3DDevice8::record() {
    if (!ip) ip = new D3DInterp, interpDev = this;
    if (ip->off) return;
    std::lock_guard<std::mutex> lock(ip->mu);
    D3DInterp::Frame& f = ip->cur;
    D3DInterp::Batch b;
    memcpy(b.rs, rs, sizeof rs);
    memcpy(b.tss, tss, sizeof tss);
    b.tex = texture, b.vp = vp, b.view = view, b.proj = proj;
    b.depth = depth != nullptr, b.clear = false, b.dead = false;
    b.v0 = (uint32_t)f.verts.size(), b.vn = (uint32_t)batch.size();
    b.c0 = (uint32_t)f.calls.size(), b.cn = 0;
    size_t covered = 0;
    for (const Call& c : batchCalls) covered += c.n;
    if (covered == batch.size()) {   // else the calls are not all described (interp turned on mid-batch): none match
        for (Call c : batchCalls) {
            c.v0 += b.v0;
            f.calls.push_back(c);
            f.callBatch.push_back((uint32_t)f.batches.size());
        }
        b.cn = (uint32_t)batchCalls.size();
    }
    f.verts.insert(f.verts.end(), batch.begin(), batch.end());
    f.batches.push_back(b);
}

static void recordClear(IDirect3DDevice8* d, DWORD count, const D3DRECT* rects, DWORD flags, D3DCOLOR c, float z,
                        DWORD stencil) {
    if (!d->ip) d->ip = new D3DInterp, interpDev = d;
    if (d->ip->off) return;
    std::lock_guard<std::mutex> lock(d->ip->mu);
    D3DInterp::Frame& f = d->ip->cur;
    D3DInterp::Batch b{};
    b.vp = d->vp, b.depth = d->depth != nullptr, b.clear = true;
    b.c0 = (uint32_t)f.rects.size(), b.cn = rects ? count : 0;
    if (rects) f.rects.insert(f.rects.end(), rects, rects + count);
    b.cflags = flags, b.ccolor = c, b.cz = z, b.cstencil = stencil;
    f.batches.push_back(b);
}

void IDirect3DDevice8::forgetTexture(IDirect3DTexture8* t) {
    IDirect3DDevice8* d = interpDev;
    if (!d || !d->ip) return;
    std::lock_guard<std::mutex> lock(d->ip->mu);
    for (D3DInterp::Frame* f : {&d->ip->cur, &d->ip->prev})
        for (D3DInterp::Batch& b : f->batches)
            if (!b.clear && b.tex == t) b.tex = nullptr, b.dead = true;
}

// each call of cur to the nearest unused call of prev with its exact key, then the rest by their loose key
static void matchFrames(D3DInterp& ip) {
    const D3DInterp::Frame &c = ip.cur, &p = ip.prev;
    ip.match.assign(c.calls.size(), -1);
    std::vector<char> used(p.calls.size());
    std::unordered_map<uint32_t, std::vector<uint32_t>> by;
    auto nearest = [&](const IDirect3DDevice8::Call& cc, uint32_t key) {
        auto it = by.find(key);
        if (it == by.end() || cc.sx != cc.sx) return -1;
        int best = -1;
        float bd = kJump * kJump;
        for (uint32_t j : it->second) {
            if (used[j]) continue;
            float dx = p.calls[j].sx - cc.sx, dy = p.calls[j].sy - cc.sy, dd = dx * dx + dy * dy;
            if (dd < bd) bd = dd, best = (int)j;
        }
        return best;
    };
    for (int pass = 0; pass < 2; pass++) {
        by.clear();
        for (uint32_t j = 0; j < p.calls.size(); j++)
            if (!used[j] && p.calls[j].sx == p.calls[j].sx && !p.batches[p.callBatch[j]].dead)
                by[pass ? p.calls[j].loose : p.calls[j].key].push_back(j);
        for (uint32_t i = 0; i < c.calls.size(); i++) {
            if (ip.match[i] >= 0) continue;
            int j = nearest(c.calls[i], pass ? c.calls[i].loose : c.calls[i].key);
            if (j >= 0) used[j] = 1, ip.match[i] = j;
        }
    }
}

// cur's draws, matched ones moved t of the way from prev, into ip->surf
void IDirect3DDevice8::drawInterp(float t) {
    D3DInterp& ip = *this->ip;
    const D3DInterp::Frame &c = ip.cur, &p = ip.prev;
    IDirect3DSurface8 *sTarget = target, *sDepth = depth;
    IDirect3DTexture8* sTex = texture;
    DWORD sRs[256], sTss[29];
    memcpy(sRs, rs, sizeof rs);
    memcpy(sTss, tss, sizeof tss);
    D3DMATRIX sView = view, sProj = proj;
    D3DVIEWPORT8 sVp = vp;
    std::vector<Vertex> sBatch;
    sBatch.swap(batch);
    std::vector<Call> sCalls;
    sCalls.swap(batchCalls);
    interp = false;   // flush and Clear below don't record
    target = ip.surf;
    auto lerp = [t](float a, float b) { return a + (b - a) * t; };
    for (const D3DInterp::Batch& b : c.batches) {
        if (b.dead) continue;
        vp = b.vp;
        depth = b.depth ? ip.depthSurf : nullptr;
        if (b.clear) {
            Clear(b.cn, b.cn ? &c.rects[b.c0] : nullptr, b.cflags, b.ccolor, b.cz, b.cstencil);
            continue;
        }
        memcpy(rs, b.rs, sizeof rs);
        memcpy(tss, b.tss, sizeof tss);
        texture = b.tex, view = b.view, proj = b.proj;
        batch.assign(c.verts.begin() + b.v0, c.verts.begin() + b.v0 + b.vn);
        int cam = -1;
        for (uint32_t k = 0; k < b.cn; k++) {
            int j = ip.match[b.c0 + k];
            if (j < 0) continue;
            const Call &cc = c.calls[b.c0 + k], &pc = p.calls[j];
            if (cam < 0) cam = (int)p.callBatch[j];
            for (uint32_t i = 0; i < cc.n; i++) {
                Vertex& v = batch[cc.v0 - b.v0 + i];
                const Vertex& w = p.verts[pc.v0 + i];
                v.x = lerp(w.x, v.x), v.y = lerp(w.y, v.y), v.z = lerp(w.z, v.z);
                for (int ch = 0; ch < 4; ch++) v.c[ch] = (uint8_t)(lerp(w.c[ch], v.c[ch]) + 0.5f);
            }
        }
        if (cam >= 0) {   // the camera of the batch its sprites came from, in between too
            const D3DInterp::Batch& pb = p.batches[cam];
            for (int i = 0; i < 16; i++) {
                (&view.m[0][0])[i] = lerp((&pb.view.m[0][0])[i], (&b.view.m[0][0])[i]);
                (&proj.m[0][0])[i] = lerp((&pb.proj.m[0][0])[i], (&b.proj.m[0][0])[i]);
            }
        }
        flush();
    }
    interp = true;
    target = sTarget, depth = sDepth, texture = sTex;
    memcpy(rs, sRs, sizeof rs);
    memcpy(tss, sTss, sizeof tss);
    view = sView, proj = sProj, vp = sVp;
    batch.swap(sBatch);
    batchCalls.swap(sCalls);
}

static void presentInterp(IDirect3DDevice8* d) {
    if (!d->ip) d->ip = new D3DInterp, interpDev = d;
    D3DInterp& ip = *d->ip;
    double t0 = nowMs();
    if (ip.last && t0 - ip.last < 100) {   // a load is no step
        ip.interval += (t0 - ip.last - ip.interval) * 0.1;
        ip.late = ip.late << 1 | (t0 - ip.last > 45);
    }
    ip.last = t0;
    ip.pending = false;
    int bw = (int)(d->backBuffer->w * d->scale), bh = (int)(d->backBuffer->h * d->scale);
    bool between = !ip.off && !ip.prev.batches.empty() && !ip.cur.batches.empty();
    if (between) {
        if (!ip.heldFbo) {
            glGenRenderbuffers(1, &ip.heldColor);
            glBindRenderbuffer(GL_RENDERBUFFER, ip.heldColor);
            glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, bw, bh);
            glGenFramebuffers(1, &ip.heldFbo);
            glBindFramebuffer(GL_FRAMEBUFFER, ip.heldFbo);
            glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, ip.heldColor);
            ip.surf = new IDirect3DSurface8(*d->backBuffer);   // same size, format and scale; its own GL objects
            ip.surf->fboDepth = ~0ull;
            glGenRenderbuffers(1, &ip.surf->glColor);
            glBindRenderbuffer(GL_RENDERBUFFER, ip.surf->glColor);
            glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, bw, bh);
            glGenFramebuffers(1, &ip.surf->glFbo);
            glBindFramebuffer(GL_FRAMEBUFFER, ip.surf->glFbo);
            glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, ip.surf->glColor);
            ip.depthSurf = new IDirect3DSurface8;
            ip.depthSurf->glDepth = depthBuffer(bw, bh);
            // Opaque from the start: the back buffer is X8 (draws never write its alpha) and the game seldom clears all
            // of it, so a fresh target's alpha would stay 0 where only draws land. WebKit composites that canvas as
            // transparent (black screens); Chrome and Firefox ignore it.
            glDisable(GL_SCISSOR_TEST);
            glColorMask(1, 1, 1, 1);
            glClearColor(0, 0, 0, 1);
            for (GLuint fbo : {ip.heldFbo, ip.surf->glFbo}) {
                glBindFramebuffer(GL_FRAMEBUFFER, fbo);
                glClear(GL_COLOR_BUFFER_BIT);
            }
        }
        glBindFramebuffer(GL_READ_FRAMEBUFFER, d->backBuffer->glFbo);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, ip.heldFbo);
        glDisable(GL_SCISSOR_TEST);
        glColorMask(1, 1, 1, 1);
        glBlitFramebuffer(0, 0, bw, bh, 0, 0, bw, bh, GL_COLOR_BUFFER_BIT, GL_NEAREST);
        {
            std::lock_guard<std::mutex> lock(ip.mu);
            matchFrames(ip);
            d->drawInterp(0.5f);
        }
        double took = nowMs() - t0;
        ip.cost += (took - ip.cost) * 0.1;
        ip.costly = ip.costly << 1 | (took > 8);
        static const bool logging = getenv("RC_60_LOG");   // every 300 in-between frames: how much of them moved
        static unsigned frames, calls, matched;
        frames++, calls += (unsigned)ip.match.size();
        for (int32_t j : ip.match) matched += j >= 0;
        if (logging && frames % 300 == 0) {
            fprintf(stderr, "gfx: in-between frames: %u calls a frame, %.0f%% matched, %.2f ms each, swap worst %.0f ms\n",
                    calls / 300, calls ? 100.0 * matched / calls : 0.0, ip.cost, swapWorst);
            calls = matched = 0, swapWorst = 0;
        }
        toScreen(d, ip.surf->glFbo);
        ip.pending = true;
        ip.dueAt = t0 + min(max(ip.interval, 25.0), 45.0) / 2;
    } else {
        toScreen(d, d->backBuffer->glFbo);
    }
    // ponytail: thresholds from a 30 Hz step (33 ms): a quarter of the last 64 steps late, or of the last 64 in-between
    // frames over 8 ms, turn it off for a while (a lone slow one, a load or the first frame's setup, is no reason)
    int lateSteps = __builtin_popcountll(ip.late), costlyFrames = __builtin_popcountll(ip.costly);
    if (!ip.off && (lateSteps > 16 || costlyFrames > 16)) {
        fprintf(stderr, "gfx: in-between frames off for %.0f s (%d of 64 steps late, %d of 64 in-between frames over 8 ms)\n",
                ip.backoff / 1e3, lateSteps, costlyFrames);
        ip.off = true, ip.offUntil = t0 + ip.backoff, ip.backoff = min(ip.backoff * 2, 600e3);
        ip.cost = 0, ip.costly = 0;
    } else if (ip.off && t0 >= ip.offUntil && lateSteps < 4) {
        ip.off = false;
    }
    std::lock_guard<std::mutex> lock(ip.mu);
    std::swap(ip.prev, ip.cur);
    ip.cur.clear();
    if (ip.off) ip.prev.clear();
}

IDirect3DSurface8* IDirect3DDevice8::inBetweenTarget() { return ip ? ip->surf : nullptr; }

int IDirect3DDevice8::heldDueMs() {
    if (!ip || !ip->pending) return -1;
    double left = ip->dueAt - nowMs();
    return left > 0 ? (int)left + 1 : 0;
}

int IDirect3DDevice8::presentHeld(bool now) {
    if (!ip || !ip->pending || !onGlThread()) return -1;
    if (!now && nowMs() < ip->dueAt) return 0;
    ip->pending = false;
    toScreen(this, ip->heldFbo);
    return 1;
}

// ---------------------------------------------------------------- IDirect3D8

static const D3DDISPLAYMODE MODES[] = {
    {640, 480, 60, D3DFMT_X8R8G8B8}, {800, 600, 60, D3DFMT_X8R8G8B8}, {1024, 768, 60, D3DFMT_X8R8G8B8},
    {1280, 720, 60, D3DFMT_X8R8G8B8}, {1280, 1024, 60, D3DFMT_X8R8G8B8}};

UINT IDirect3D8::GetAdapterModeCount(UINT adapter) { return adapter ? 0 : sizeof MODES / sizeof MODES[0]; }

HRESULT IDirect3D8::EnumAdapterModes(UINT adapter, UINT mode, D3DDISPLAYMODE* out) {
    if (adapter || !out || mode >= GetAdapterModeCount(0)) return D3DERR_INVALIDCALL;
    *out = MODES[mode];
    return D3D_OK;
}

HRESULT IDirect3D8::GetAdapterDisplayMode(UINT adapter, D3DDISPLAYMODE* out) {
    if (adapter || !out) return D3DERR_INVALIDCALL;
    *out = D3DDISPLAYMODE{1920, 1080, 60, D3DFMT_X8R8G8B8};   // ponytail: the game only reads Format from this
    return D3D_OK;
}

HRESULT IDirect3D8::GetDeviceCaps(UINT adapter, D3DDEVTYPE type, D3DCAPS8* caps) {
    if (adapter || !caps) return D3DERR_INVALIDCALL;
    fillCaps(*caps);
    caps->DeviceType = type;
    return D3D_OK;
}

HRESULT IDirect3D8::CheckDeviceFormat(UINT adapter, D3DDEVTYPE, D3DFORMAT, DWORD usage, D3DRESOURCETYPE,
                                      D3DFORMAT fmt) {
    if (adapter) return D3DERR_INVALIDCALL;
    bool ok = usage & D3DUSAGE_DEPTHSTENCIL ? isDepthFormat(fmt) : isColorFormat(fmt);
    return ok ? D3D_OK : D3DERR_NOTAVAILABLE;
}

HRESULT IDirect3D8::CreateDevice(UINT adapter, D3DDEVTYPE type, HWND, DWORD, D3DPRESENT_PARAMETERS* pp,
                                 IDirect3DDevice8** out) {
    if (adapter || type != D3DDEVTYPE_HAL || !pp || !out) return D3DERR_NOTAVAILABLE;
    if (!pp->BackBufferWidth || !pp->BackBufferHeight) return D3DERR_INVALIDCALL;   // ponytail: no "use window size"
    IDirect3DDevice8* d = new IDirect3DDevice8;
    if (!d->init(*pp)) {
        d->Release();
        return D3DERR_NOTAVAILABLE;
    }
    *out = d;
    return D3D_OK;
}

IDirect3D8* Direct3DCreate8(UINT sdkVersion) { return sdkVersion == 220 ? new IDirect3D8 : nullptr; }
