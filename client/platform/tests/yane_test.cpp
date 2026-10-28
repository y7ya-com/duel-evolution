// yaneSDK's own classes (third_party/yanesdk, Konami's changes included) on the non-Windows backends: a real
// CAppBase/CAppFrame app on a hidden 1024x768 window drives input, timers and sound, then quits through WM_CLOSE.
// Run: build/third_party/yanesdk/yane_test   (SDL's dummy audio driver; no window shown)
#include "stdafx.h"

#include "yaneAppBase.h"
#include "yaneAppFrame.h"
#include "yaneAppInitializer.h"
#include "yaneDirectInput.h"
#include "yaneFont.h"
#include "yaneIntervalTimer.h"
#include "yaneMouse.h"
#include "yaneSound.h"
#include "yaneTimer.h"

#include <SDL.h>

#include "platform.h"

static int failures;

static void check(bool ok, const char* what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) failures++;
}

class CTicker : public CIntervalTimer {
public:
    volatile int n;
    CTicker() : n(0) {}
    void TimerProc(void) { n++; }
};

// 0.1 s of a 16-bit mono 22.05 kHz tone
static void writeWav(const char* path) {
    const int frames = 2205;
    FILE* f = fopen(path, "wb");
    DWORD riff = 36 + frames * 2, fmtSize = 16, rate = 22050, bps = 44100, data = frames * 2;
    WORD pcm = 1, ch = 1, align = 2, bits = 16;
    fwrite("RIFF", 1, 4, f); fwrite(&riff, 4, 1, f); fwrite("WAVEfmt ", 1, 8, f); fwrite(&fmtSize, 4, 1, f);
    fwrite(&pcm, 2, 1, f); fwrite(&ch, 2, 1, f); fwrite(&rate, 4, 1, f); fwrite(&bps, 4, 1, f);
    fwrite(&align, 2, 1, f); fwrite(&bits, 2, 1, f); fwrite("data", 1, 4, f); fwrite(&data, 4, 1, f);
    for (int i = 0; i < frames; i++) {
        short v = (short)((i / 25) % 2 ? 8000 : -8000);
        fwrite(&v, 2, 1, f);
    }
    fclose(f);
}

class CTestFrame : public CAppFrame {
protected:
    void MainThread(void) {
        CDirectInput key;
        CMouseEx mouse;
        char buf[160];

        // DirectInput keyboard: press, hold, release (IsKeyRelease is Konami's)
        platformTestKey(SDL_SCANCODE_A, true);
        key.GetKeyState();
        check(key.IsKeyPress(DIK_A) && key.IsKeyPush(DIK_A), "CDirectInput: A pressed this frame");
        key.GetKeyState();
        check(key.IsKeyPress(DIK_A) && !key.IsKeyPush(DIK_A), "CDirectInput: A held, no second push");
        platformTestKey(SDL_SCANCODE_A, false);
        key.GetKeyState();
        check(!key.IsKeyPress(DIK_A) && key.IsKeyRelease(DIK_A), "CDirectInput: A released (Konami IsKeyRelease)");

        // Mouse: the button arrives as WM_LBUTTONDOWN through the window's hook chain, the position from
        // GetCursorPos, scaled by Konami's 1024/client-width rule (identity at 1024x768)
        platformTestMouse(512, 384);
        SDL_Event e;
        memset(&e, 0, sizeof e);
        e.type = SDL_MOUSEBUTTONDOWN;
        e.button.button = SDL_BUTTON_LEFT;
        e.button.state = SDL_PRESSED;
        e.button.clicks = 1;
        e.button.x = 512;
        e.button.y = 384;
        SDL_PushEvent(&e);
        IsThreadValid();   // pumps the message
        mouse.Flush();
        int x = -1, y = -1;
        mouse.GetXY(x, y);
        snprintf(buf, sizeof buf, "CMouseEx: left down via WM_LBUTTONDOWN at (%d,%d), click count %d", x, y,
                 mouse.GetLClickCount());
        check(mouse.LButton() && x == 512 && y == 384 && mouse.GetLClickCount() == 1, buf);

        // CTimer on timeGetTime
        CTimer timer;
        DWORD t0 = timer.Get();
        ::Sleep(50);
        DWORD dt = timer.Get() - t0;
        snprintf(buf, sizeof buf, "CTimer: Sleep(50) measured %u ms", (unsigned)dt);
        check(dt >= 45 && dt < 500, buf);

        // CIntervalTimer: multimedia timer (timeSetEvent) calling back on its own thread
        CTicker tick;
        tick.Start(10);
        ::Sleep(125);
        tick.Stop();
        snprintf(buf, sizeof buf, "CIntervalTimer: 10 ms period over 125 ms -> %d ticks", (int)tick.n);
        check(tick.n >= 6 && tick.n <= 14, buf);

        // CSound: load a WAV through Konami's CFile and the PCM readers, play it to the end on DirectSound
        writeWav("yane_test.wav");
        CSound snd;
        check(snd.Load("yane_test.wav") == 0, "CSound: Load(yane_test.wav)");
        snd.Play();
        check(snd.IsPlay(), "CSound: playing");
        DWORD start = ::timeGetTime();
        while (snd.IsPlay() && ::timeGetTime() - start < 2000) {
            IsThreadValid();
            ::Sleep(5);
        }
        DWORD took = ::timeGetTime() - start;
        snprintf(buf, sizeof buf, "CSound: 100 ms one-shot finished after %u ms", (unsigned)took);
        check(!snd.IsPlay() && took >= 60, buf);
        ::DeleteFile("yane_test.wav");

        // CFont (Konami's wide text) through the GDI stand-ins: measure, then draw into a 32 bpp DIB section
        CFont font;
        font.SetText(wstring(L"Duel"));
        int fx = 0, fy = 0;
        font.GetSize(fx, fy);
        snprintf(buf, sizeof buf, "CFont: \"Duel\" at 16 px measures %dx%d", fx, fy);
        check(fx > 20 && fx < 80 && fy >= 16 && fy < 30, buf);
        BITMAPINFO bi;
        memset(&bi, 0, sizeof bi);
        bi.bmiHeader.biSize = sizeof bi.bmiHeader;
        bi.bmiHeader.biWidth = fx;
        bi.bmiHeader.biHeight = -fy;
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        DWORD* px = NULL;
        HBITMAP bmp = ::CreateDIBSection(NULL, &bi, DIB_RGB_COLORS, (void**)&px, NULL, 0);
        HDC hdc = ::CreateCompatibleDC(NULL);
        HGDIOBJ old = ::SelectObject(hdc, bmp);
        font.OnDraw(hdc, 0, 0);
        int white = 0, shadow = 0;
        for (int i = 0; i < fx * fy; i++) {
            white += (px[i] & 0xFFFFFF) == 0xFFFFFF;
            shadow += (px[i] & 0xFFFFFF) == 0x808080;   // Konami's default shadow, (128,128,128) at +2,+2
        }
        snprintf(buf, sizeof buf, "CFont::OnDraw: %d white text pixels over %d shadow pixels", white, shadow);
        check(white > 20 && shadow > 5, buf);
        ::SelectObject(hdc, old);
        ::DeleteDC(hdc);
        ::DeleteObject(bmp);

        // Quit the way the window's close box does
        ::PostMessage(GetMyApp()->GetHWnd(), WM_CLOSE, 0, 0);
        int frames = 0;
        while (IsThreadValid() && frames < 100) frames++;
        check(frames < 100, "WM_CLOSE ends the app loop");
    }
};

class CTestApp : public CAppBase {
protected:
    LRESULT OnPreCreate(CWindowOption& opt) {
        CAppBase::OnPreCreate(opt);
        opt.size_x = 1024;   // the game's own size (CMouse::GetXY scales to 1024x768)
        opt.size_y = 768;
        return 0;
    }
    void MainThread(void) {
        CTestFrame frame;
        frame.Start();
    }
};

#ifdef __EMSCRIPTEN__
#include "coop.h"
#endif

static int testMain() {
    setenv("YO2_HIDDEN", "1", 1);
    setenv("SDL_AUDIODRIVER", "dummy", 0);
    CAppInitializer::Init(NULL, NULL, (LPSTR) "", SW_SHOW);
    {
        CTestApp app;
        check(app.Run() == 0, "CAppBase::Run returns after the app thread ends");
    }
    printf(failures ? "FAILED %d\n" : "PASS\n", failures);
    return failures ? 1 : 0;
}

int main() {
#ifdef __EMSCRIPTEN__   // the whole app, its threads included, on the browser thread's fiber scheduler
    static int rc;
    coop::run([](void*) { rc = testMain(); }, nullptr);
    return rc;
#else
    return testMain();
#endif
}
