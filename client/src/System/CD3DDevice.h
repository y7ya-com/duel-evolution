// CD3DDevice.cpp: the game's Direct3D 8 device wrapper (one instance, g_d3d), written against the D3D8 API (platform/win32/d3d8.h off Windows).
// Besides device creation it owns the 12 render modes: each is a list of render states and stage-0 texture stage
// states; switching modes applies a precomputed delta (the new mode's states, plus mode-0 defaults for whatever the
// old mode set and the new one doesn't).
#pragma once
#include <cstdint>
#include <mutex>
#include <vector>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>  // d3d8.h takes HRESULT/DWORD/RECT from it
#endif
#include <d3d8.h>  // platform/win32/d3d8.h off Windows (D3D8 on GL/WebGL2), the real one on Windows

class CD3DDevice {
public:
    enum { MODES = 12 };

    CD3DDevice();
    virtual ~CD3DDevice();
    static void release();

    bool initialize(HWND window, UINT width, UINT height, bool fullscreen);
    bool setFullscreen(bool fullscreen);
    void setMode(int32_t mode);
    HRESULT setRenderState(D3DRENDERSTATETYPE state, DWORD value);

    IDirect3DDevice8* device() const { return dev_; }
    int32_t mode() const { return mode_; }
    bool multiplyAdd() const { return multiplyAdd_; }
    bool fullscreen() const { return fullscreen_; }

    static void buildModeTables(bool multiplyAdd);

private:
    IDirect3D8* d3d_ = nullptr;          // 0x004
    IDirect3DDevice8* dev_ = nullptr;    // 0x008
    D3DPRESENT_PARAMETERS pp_{};         // 0x00c
    bool initialized_ = false;           // 0x040
    bool fullscreen_ = false;            // 0x041
    UINT width_ = 0, height_ = 0;        // 0x048
    std::mutex* d3dxMutex_;              // 0x050 "D3DXMutex", taken by the texture loader thread
    bool multiplyAdd_ = false;           // 0x054 caps.TextureOpCaps has D3DTEXOPCAPS_MULTIPLYADD
    D3DCAPS8 caps_{};                    // 0x058 (the real D3DCAPS8 is 0xd4 bytes)
    int32_t mode_ = 0;                   // 0x12c
};

extern CD3DDevice* g_d3d;  // DAT_0126f310
