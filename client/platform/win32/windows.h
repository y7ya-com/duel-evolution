// The slice of <windows.h> that yaneSDK and the game use, for non-Windows builds (native SDL/GL, Emscripten).
// Implemented in win32.cpp on top of platform/ (window, input, time) and std:: (threads, sync). One window: the
// game only ever makes one. This directory is put on the include path ahead of the system headers, so the
// original sources' `#include <windows.h>`, <mmsystem.h>, <dsound.h>, <dinput.h>, <d3d8.h> resolve here.
#pragma once
#ifdef _WIN32
#error "platform/win32 is the non-Windows stand-in for the Windows SDK; on Windows use the real one"
#endif

#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

// ---------------------------------------------------------------- calling conventions, keywords
#define WINAPI
#define CALLBACK
#define APIENTRY
#define PASCAL
#define FAR
#define NEAR
#define far
#define near
#define CONST const
#define IN
#define OUT
#ifndef __stdcall
#define __stdcall
#endif
#ifndef __cdecl
#define __cdecl
#endif
#ifndef _MAX_PATH
#define _MAX_PATH 260
#endif
#define MAX_PATH 260

// ---------------------------------------------------------------- base types (LONG is 32-bit, as on Win32)
typedef int BOOL;
typedef unsigned char BYTE, UCHAR, BOOLEAN;
typedef unsigned short WORD, USHORT, ATOM;
typedef uint32_t DWORD, UINT32;
typedef int32_t LONG, INT32, HRESULT;
typedef uint32_t ULONG;
typedef int INT;
typedef unsigned int UINT;
typedef short SHORT;
typedef char CHAR, TCHAR;
typedef wchar_t WCHAR;   // ponytail: 32-bit off Windows; the wide text code (Konami's CFont) needs a decision first
typedef float FLOAT;
typedef void VOID;
typedef int64_t LONGLONG, INT64;   // __int64 comes from -fms-extensions
typedef uint64_t ULONGLONG, DWORDLONG, UINT64;
typedef intptr_t INT_PTR, LONG_PTR;
typedef uintptr_t UINT_PTR, ULONG_PTR, DWORD_PTR, SIZE_T;
typedef UINT_PTR WPARAM;
typedef LONG_PTR LPARAM, LRESULT;
typedef DWORD COLORREF, *LPCOLORREF;
typedef void *LPVOID, *PVOID;
typedef const void* LPCVOID;
typedef BYTE *LPBYTE, *PBYTE;
typedef WORD *LPWORD, *PWORD;
typedef DWORD *LPDWORD, *PDWORD;
typedef LONG *LPLONG, *PLONG;
typedef BOOL *LPBOOL;
typedef int* LPINT;
typedef UINT* LPUINT;
typedef char *LPSTR, *PSTR, *LPTSTR;
typedef const char *LPCSTR, *PCSTR, *LPCTSTR;
typedef WCHAR *LPWSTR, *PWSTR;
typedef const WCHAR *LPCWSTR, *PCWSTR;

#define TRUE 1
#define FALSE 0
#ifndef NULL
#define NULL 0
#endif
#define TEXT(s) s
#define _T(s) s

#define DECLARE_HANDLE(n) struct n##__ { int unused; }; typedef struct n##__* n
typedef void* HANDLE;
typedef HANDLE* LPHANDLE;
DECLARE_HANDLE(HWND);
DECLARE_HANDLE(HINSTANCE);
DECLARE_HANDLE(HMENU);
DECLARE_HANDLE(HDC);
DECLARE_HANDLE(HICON);
DECLARE_HANDLE(HBRUSH);
DECLARE_HANDLE(HBITMAP);
DECLARE_HANDLE(HFONT);
DECLARE_HANDLE(HPEN);
DECLARE_HANDLE(HRGN);
DECLARE_HANDLE(HPALETTE);
DECLARE_HANDLE(HKEY);
DECLARE_HANDLE(HRSRC);
DECLARE_HANDLE(HIMC);
DECLARE_HANDLE(HMONITOR);
typedef HICON HCURSOR;
typedef HINSTANCE HMODULE;
typedef HANDLE HGLOBAL, HLOCAL, HGDIOBJ;
typedef int (*FARPROC)();

// ---------------------------------------------------------------- macros
#define LOWORD(l) ((WORD)((DWORD_PTR)(l) & 0xffff))
#define HIWORD(l) ((WORD)((DWORD_PTR)(l) >> 16))
#define LOBYTE(w) ((BYTE)((DWORD_PTR)(w) & 0xff))
#define HIBYTE(w) ((BYTE)((DWORD_PTR)(w) >> 8))
#define MAKEWORD(a, b) ((WORD)(((BYTE)(a)) | ((WORD)((BYTE)(b))) << 8))
#define MAKELONG(a, b) ((LONG)(((WORD)(a)) | ((DWORD)((WORD)(b))) << 16))
#define MAKELPARAM(l, h) ((LPARAM)(DWORD)MAKELONG(l, h))
#define MAKEWPARAM(l, h) ((WPARAM)(DWORD)MAKELONG(l, h))
#define MAKELRESULT(l, h) ((LRESULT)(DWORD)MAKELONG(l, h))
#define GET_X_LPARAM(lp) ((int)(short)LOWORD(lp))
#define GET_Y_LPARAM(lp) ((int)(short)HIWORD(lp))
#define RGB(r, g, b) ((COLORREF)(((BYTE)(r) | ((WORD)((BYTE)(g)) << 8)) | (((DWORD)(BYTE)(b)) << 16)))
#define GetRValue(c) ((BYTE)(c))
#define GetGValue(c) ((BYTE)(((WORD)(c)) >> 8))
#define GetBValue(c) ((BYTE)((c) >> 16))
#define CLR_INVALID 0xFFFFFFFF
#define SUCCEEDED(hr) (((HRESULT)(hr)) >= 0)
#define FAILED(hr) (((HRESULT)(hr)) < 0)
#define MAKE_HRESULT(sev, fac, code) ((HRESULT)(((unsigned long)(sev) << 31) | ((unsigned long)(fac) << 16) | ((unsigned long)(code))))
#define S_OK ((HRESULT)0)
#define S_FALSE ((HRESULT)1)
#define E_FAIL ((HRESULT)0x80004005)
#define E_NOINTERFACE ((HRESULT)0x80004002)
#define E_OUTOFMEMORY ((HRESULT)0x8007000E)
#define E_INVALIDARG ((HRESULT)0x80070057)
#define E_POINTER ((HRESULT)0x80004003)
#define E_NOTIMPL ((HRESULT)0x80004001)
#define ZeroMemory(p, n) memset((p), 0, (n))
#define FillMemory(p, n, v) memset((p), (v), (n))
#define CopyMemory(d, s, n) memcpy((d), (s), (n))
#define MoveMemory(d, s, n) memmove((d), (s), (n))
#ifndef NOMINMAX
#define max(a, b) (((a) > (b)) ? (a) : (b))
#define min(a, b) (((a) < (b)) ? (a) : (b))
#endif
#define UNREFERENCED_PARAMETER(p) (void)(p)
#define INVALID_HANDLE_VALUE ((HANDLE)(LONG_PTR)-1)

// ---------------------------------------------------------------- structs
typedef struct tagRECT { LONG left, top, right, bottom; } RECT, *PRECT, *LPRECT;
typedef const RECT* LPCRECT;
typedef struct tagPOINT { LONG x, y; } POINT, *PPOINT, *LPPOINT;
typedef struct tagSIZE { LONG cx, cy; } SIZE, *PSIZE, *LPSIZE;
typedef struct tagMSG { HWND hwnd; UINT message; WPARAM wParam; LPARAM lParam; DWORD time; POINT pt; } MSG, *LPMSG;
typedef LRESULT (*WNDPROC)(HWND, UINT, WPARAM, LPARAM);
typedef void (*TIMERPROC)(HWND, UINT, UINT_PTR, DWORD);
typedef BOOL (*WNDENUMPROC)(HWND, LPARAM);
typedef struct tagWNDCLASSEXA {
    UINT cbSize, style;
    WNDPROC lpfnWndProc;
    int cbClsExtra, cbWndExtra;
    HINSTANCE hInstance;
    HICON hIcon;
    HCURSOR hCursor;
    HBRUSH hbrBackground;
    LPCSTR lpszMenuName, lpszClassName;
    HICON hIconSm;
} WNDCLASSEX, WNDCLASSEXA, *LPWNDCLASSEX;
typedef struct tagWNDCLASSA {
    UINT style;
    WNDPROC lpfnWndProc;
    int cbClsExtra, cbWndExtra;
    HINSTANCE hInstance;
    HICON hIcon;
    HCURSOR hCursor;
    HBRUSH hbrBackground;
    LPCSTR lpszMenuName, lpszClassName;
} WNDCLASS, WNDCLASSA;
typedef struct tagCREATESTRUCTA {
    LPVOID lpCreateParams;
    HINSTANCE hInstance;
    HMENU hMenu;
    HWND hwndParent;
    int cy, cx, y, x;
    LONG style;
    LPCSTR lpszName, lpszClass;
    DWORD dwExStyle;
} CREATESTRUCT, *LPCREATESTRUCT;
typedef struct _GUID { uint32_t Data1; uint16_t Data2, Data3; uint8_t Data4[8]; } GUID, IID, CLSID, *LPGUID, *LPCLSID;
typedef const GUID& REFGUID;
typedef const IID& REFIID;
typedef const CLSID& REFCLSID;
typedef const GUID* LPCGUID;
inline bool operator==(const GUID& a, const GUID& b) { return memcmp(&a, &b, sizeof a) == 0; }
inline bool operator!=(const GUID& a, const GUID& b) { return !(a == b); }
#define IsEqualGUID(a, b) ((a) == (b))
#define IsEqualIID(a, b) ((a) == (b))
#define DEFINE_GUID(n, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8) \
    static const GUID n = {l, w1, w2, {b1, b2, b3, b4, b5, b6, b7, b8}}
typedef union _LARGE_INTEGER { struct { DWORD LowPart; LONG HighPart; }; LONGLONG QuadPart; } LARGE_INTEGER;
typedef struct _SYSTEMTIME { WORD wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds; } SYSTEMTIME;
typedef struct _FILETIME { DWORD dwLowDateTime, dwHighDateTime; } FILETIME;
typedef struct _CRITICAL_SECTION { void* impl; } CRITICAL_SECTION, *LPCRITICAL_SECTION;
typedef struct _SECURITY_ATTRIBUTES { DWORD nLength; LPVOID lpSecurityDescriptor; BOOL bInheritHandle; } SECURITY_ATTRIBUTES, *LPSECURITY_ATTRIBUTES;
typedef DWORD (*LPTHREAD_START_ROUTINE)(LPVOID);
typedef struct tagPALETTEENTRY { BYTE peRed, peGreen, peBlue, peFlags; } PALETTEENTRY, *LPPALETTEENTRY;
typedef struct tagRGBQUAD { BYTE rgbBlue, rgbGreen, rgbRed, rgbReserved; } RGBQUAD;
#pragma pack(push, 2)
typedef struct tagBITMAPFILEHEADER { WORD bfType; DWORD bfSize; WORD bfReserved1, bfReserved2; DWORD bfOffBits; } BITMAPFILEHEADER;
#pragma pack(pop)
typedef struct tagBITMAPINFOHEADER {
    DWORD biSize;
    LONG biWidth, biHeight;
    WORD biPlanes, biBitCount;
    DWORD biCompression, biSizeImage;
    LONG biXPelsPerMeter, biYPelsPerMeter;
    DWORD biClrUsed, biClrImportant;
} BITMAPINFOHEADER, *LPBITMAPINFOHEADER;
typedef struct tagBITMAPINFO { BITMAPINFOHEADER bmiHeader; RGBQUAD bmiColors[1]; } BITMAPINFO, *LPBITMAPINFO;
#define BI_RGB 0
#define BI_BITFIELDS 3

// ---------------------------------------------------------------- window messages and styles
#define WM_NULL 0x0000
#define WM_CREATE 0x0001
#define WM_DESTROY 0x0002
#define WM_MOVE 0x0003
#define WM_SIZE 0x0005
#define WM_ACTIVATE 0x0006
#define WM_SETFOCUS 0x0007
#define WM_KILLFOCUS 0x0008
#define WM_ENABLE 0x000A
#define WM_SETTEXT 0x000C
#define WM_PAINT 0x000F
#define WM_CLOSE 0x0010
#define WM_QUIT 0x0012
#define WM_ERASEBKGND 0x0014
#define WM_SHOWWINDOW 0x0018
#define WM_ACTIVATEAPP 0x001C
#define WM_SETCURSOR 0x0020
#define WM_MOUSEACTIVATE 0x0021
#define WM_GETMINMAXINFO 0x0024
#define WM_WINDOWPOSCHANGING 0x0046
#define WM_WINDOWPOSCHANGED 0x0047
#define WM_NCCREATE 0x0081
#define WM_NCDESTROY 0x0082
#define WM_NCHITTEST 0x0084
#define WM_NCPAINT 0x0085
#define WM_NCACTIVATE 0x0086
#define WM_KEYFIRST 0x0100
#define WM_KEYDOWN 0x0100
#define WM_KEYUP 0x0101
#define WM_CHAR 0x0102
#define WM_SYSKEYDOWN 0x0104
#define WM_SYSKEYUP 0x0105
#define WM_SYSCHAR 0x0106
#define WM_KEYLAST 0x0108
#define WM_IME_STARTCOMPOSITION 0x010D
#define WM_IME_ENDCOMPOSITION 0x010E
#define WM_IME_COMPOSITION 0x010F
#define WM_INITDIALOG 0x0110
#define WM_COMMAND 0x0111
#define WM_SYSCOMMAND 0x0112
#define WM_TIMER 0x0113
#define WM_MOUSEFIRST 0x0200
#define WM_MOUSEMOVE 0x0200
#define WM_LBUTTONDOWN 0x0201
#define WM_LBUTTONUP 0x0202
#define WM_LBUTTONDBLCLK 0x0203
#define WM_RBUTTONDOWN 0x0204
#define WM_RBUTTONUP 0x0205
#define WM_RBUTTONDBLCLK 0x0206
#define WM_MBUTTONDOWN 0x0207
#define WM_MBUTTONUP 0x0208
#define WM_MBUTTONDBLCLK 0x0209
#define WM_MOUSEWHEEL 0x020A
#define WM_MOUSELAST 0x020A
#define WM_ENTERSIZEMOVE 0x0231
#define WM_EXITSIZEMOVE 0x0232
#define WM_IME_SETCONTEXT 0x0281
#define WM_IME_NOTIFY 0x0282
#define WM_IME_CHAR 0x0286
#define WM_USER 0x0400
#define WM_APP 0x8000
#define MK_LBUTTON 0x0001
#define MK_RBUTTON 0x0002
#define MK_SHIFT 0x0004
#define MK_CONTROL 0x0008
#define MK_MBUTTON 0x0010
#define WA_INACTIVE 0
#define WA_ACTIVE 1
#define SIZE_RESTORED 0
#define SIZE_MINIMIZED 1
#define SIZE_MAXIMIZED 2
#define SC_CLOSE 0xF060
#define SC_KEYMENU 0xF100
#define SC_SCREENSAVE 0xF140
#define SC_MONITORPOWER 0xF170
#define PM_NOREMOVE 0x0000
#define PM_REMOVE 0x0001
#define WS_OVERLAPPED 0x00000000L
#define WS_POPUP 0x80000000L
#define WS_CHILD 0x40000000L
#define WS_CHILDWINDOW WS_CHILD
#define WS_MINIMIZE 0x20000000L
#define WS_VISIBLE 0x10000000L
#define WS_DISABLED 0x08000000L
#define WS_CLIPSIBLINGS 0x04000000L
#define WS_CLIPCHILDREN 0x02000000L
#define WS_MAXIMIZE 0x01000000L
#define WS_CAPTION 0x00C00000L
#define WS_BORDER 0x00800000L
#define WS_DLGFRAME 0x00400000L
#define WS_VSCROLL 0x00200000L
#define WS_HSCROLL 0x00100000L
#define WS_SYSMENU 0x00080000L
#define WS_THICKFRAME 0x00040000L
#define WS_SIZEBOX WS_THICKFRAME
#define WS_MINIMIZEBOX 0x00020000L
#define WS_MAXIMIZEBOX 0x00010000L
#define WS_OVERLAPPEDWINDOW (WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)
#define WS_POPUPWINDOW (WS_POPUP | WS_BORDER | WS_SYSMENU)
#define WS_EX_TOPMOST 0x00000008L
#define WS_EX_TOOLWINDOW 0x00000080L
#define WS_EX_APPWINDOW 0x00040000L
#define CS_VREDRAW 0x0001
#define CS_HREDRAW 0x0002
#define CS_DBLCLKS 0x0008
#define CS_OWNDC 0x0020
#define CW_USEDEFAULT ((int)0x80000000)
#define GWL_WNDPROC (-4)
#define GWL_HINSTANCE (-6)
#define GWL_STYLE (-16)
#define GWL_EXSTYLE (-20)
#define GWL_USERDATA (-21)
#define SW_HIDE 0
#define SW_SHOWNORMAL 1
#define SW_NORMAL 1
#define SW_SHOWMINIMIZED 2
#define SW_SHOWMAXIMIZED 3
#define SW_MAXIMIZE 3
#define SW_SHOWNOACTIVATE 4
#define SW_SHOW 5
#define SW_MINIMIZE 6
#define SW_SHOWNA 8
#define SW_RESTORE 9
#define SW_SHOWDEFAULT 10
#define SWP_NOSIZE 0x0001
#define SWP_NOMOVE 0x0002
#define SWP_NOZORDER 0x0004
#define SWP_NOACTIVATE 0x0010
#define SWP_FRAMECHANGED 0x0020
#define SWP_SHOWWINDOW 0x0040
#define SWP_HIDEWINDOW 0x0080
#define HWND_TOP ((HWND)0)
#define HWND_BOTTOM ((HWND)1)
#define HWND_TOPMOST ((HWND)-1)
#define HWND_NOTOPMOST ((HWND)-2)
#define SM_CXSCREEN 0
#define SM_CYSCREEN 1
#define SM_CXVSCROLL 2
#define SM_CYCAPTION 4
#define SM_CXBORDER 5
#define SM_CYBORDER 6
#define SM_CXDLGFRAME 7
#define SM_CYDLGFRAME 8
#define SM_CYMENU 15
#define SM_CXFRAME 32
#define SM_CYFRAME 33
#define SPI_GETWORKAREA 0x0030
#define SPI_SETSCREENSAVERRUNNING 0x0061
#define SPI_SETDESKWALLPAPER 0x0014
#define SPIF_UPDATEINIFILE 0x0001
#define SPIF_SENDWININICHANGE 0x0002
#define IDC_ARROW ((LPCSTR)32512)
#define IDI_APPLICATION ((LPCSTR)32512)
#define COLOR_WINDOW 5
#define BLACK_BRUSH 4
#define WHITE_BRUSH 0
#define MB_OK 0x0
#define MB_OKCANCEL 0x1
#define MB_YESNO 0x4
#define MB_ICONERROR 0x10
#define MB_ICONQUESTION 0x20
#define MB_ICONEXCLAMATION 0x30
#define MB_ICONINFORMATION 0x40
#define MB_SYSTEMMODAL 0x1000
#define MB_TASKMODAL 0x2000
#define MB_SETFOREGROUND 0x10000
#define IDOK 1
#define IDCANCEL 2
#define IDYES 6
#define IDNO 7
#define LB_ADDSTRING 0x0180
#define LB_GETCOUNT 0x018B
#define LB_RESETCONTENT 0x0184
#define LB_SETCURSEL 0x0186
#define LB_ERR (-1)
#define LBS_NOINTEGRALHEIGHT 0x0100

// ---------------------------------------------------------------- virtual keys
#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_CANCEL 0x03
#define VK_MBUTTON 0x04
#define VK_BACK 0x08
#define VK_TAB 0x09
#define VK_RETURN 0x0D
#define VK_SHIFT 0x10
#define VK_CONTROL 0x11
#define VK_MENU 0x12
#define VK_PAUSE 0x13
#define VK_CAPITAL 0x14
#define VK_KANA 0x15
#define VK_KANJI 0x19
#define VK_ESCAPE 0x1B
#define VK_CONVERT 0x1C
#define VK_NONCONVERT 0x1D
#define VK_SPACE 0x20
#define VK_PRIOR 0x21
#define VK_NEXT 0x22
#define VK_END 0x23
#define VK_HOME 0x24
#define VK_LEFT 0x25
#define VK_UP 0x26
#define VK_RIGHT 0x27
#define VK_DOWN 0x28
#define VK_SNAPSHOT 0x2C
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_NUMPAD0 0x60
#define VK_NUMPAD1 0x61
#define VK_NUMPAD2 0x62
#define VK_NUMPAD3 0x63
#define VK_NUMPAD4 0x64
#define VK_NUMPAD5 0x65
#define VK_NUMPAD6 0x66
#define VK_NUMPAD7 0x67
#define VK_NUMPAD8 0x68
#define VK_NUMPAD9 0x69
#define VK_MULTIPLY 0x6A
#define VK_ADD 0x6B
#define VK_SUBTRACT 0x6D
#define VK_DECIMAL 0x6E
#define VK_DIVIDE 0x6F
#define VK_F1 0x70
#define VK_F2 0x71
#define VK_F3 0x72
#define VK_F4 0x73
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F8 0x77
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#define VK_NUMLOCK 0x90
#define VK_SCROLL 0x91
#define VK_LSHIFT 0xA0
#define VK_RSHIFT 0xA1
#define VK_LCONTROL 0xA2
#define VK_RCONTROL 0xA3

// ---------------------------------------------------------------- kernel: errors, waits, threads, memory
#define ERROR_SUCCESS 0L
#define ERROR_FILE_NOT_FOUND 2L
#define ERROR_ACCESS_DENIED 5L
#define ERROR_INVALID_HANDLE 6L
#define ERROR_ALREADY_EXISTS 183L
#define INFINITE 0xFFFFFFFF
#define WAIT_OBJECT_0 0x00000000L
#define WAIT_ABANDONED 0x00000080L
#define WAIT_TIMEOUT 0x00000102L
#define WAIT_FAILED 0xFFFFFFFF
#define STILL_ACTIVE 0x00000103L
#define THREAD_PRIORITY_NORMAL 0
#define THREAD_PRIORITY_HIGHEST 2
#define THREAD_PRIORITY_ABOVE_NORMAL 1
#define THREAD_PRIORITY_BELOW_NORMAL (-1)
#define THREAD_PRIORITY_LOWEST (-2)
#define THREAD_PRIORITY_IDLE (-15)
#define THREAD_PRIORITY_TIME_CRITICAL 15
#define CREATE_SUSPENDED 0x00000004
#define CREATE_NO_WINDOW 0x08000000
#define NORMAL_PRIORITY_CLASS 0x00000020
#define STARTF_USESHOWWINDOW 0x00000001
typedef struct _STARTUPINFOA {
    DWORD cb;
    LPSTR lpReserved, lpDesktop, lpTitle;
    DWORD dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    WORD wShowWindow, cbReserved2;
    LPBYTE lpReserved2;
    HANDLE hStdInput, hStdOutput, hStdError;
} STARTUPINFO, STARTUPINFOA, *LPSTARTUPINFO;
typedef struct _PROCESS_INFORMATION { HANDLE hProcess, hThread; DWORD dwProcessId, dwThreadId; } PROCESS_INFORMATION, *LPPROCESS_INFORMATION;
#define GMEM_FIXED 0x0000
#define GMEM_MOVEABLE 0x0002
#define GMEM_ZEROINIT 0x0040
#define GHND (GMEM_MOVEABLE | GMEM_ZEROINIT)
#define GPTR (GMEM_FIXED | GMEM_ZEROINIT)
#define CP_ACP 0
#define CP_OEMCP 1
#define CP_UTF8 65001
#define MB_PRECOMPOSED 0x00000001
#define LANG_JAPANESE 0x11
#define LANG_ENGLISH 0x09
#define LANG_KOREAN 0x12
#define PRIMARYLANGID(l) ((WORD)(l) & 0x3ff)

// kernel32
DWORD GetLastError();
void SetLastError(DWORD e);
void Sleep(DWORD ms);
DWORD GetTickCount();
BOOL QueryPerformanceCounter(LARGE_INTEGER* c);
BOOL QueryPerformanceFrequency(LARGE_INTEGER* f);
DWORD GetCurrentThreadId();
HANDLE GetCurrentThread();
HANDLE GetCurrentProcess();
DWORD GetCurrentProcessId();
HANDLE CreateThread(LPSECURITY_ATTRIBUTES sa, SIZE_T stack, LPTHREAD_START_ROUTINE fn, LPVOID arg, DWORD flags, LPDWORD id);
BOOL SetThreadPriority(HANDLE thread, int priority);
int GetThreadPriority(HANDLE thread);
BOOL TerminateThread(HANDLE thread, DWORD code);
BOOL GetExitCodeThread(HANDLE thread, LPDWORD code);
DWORD ResumeThread(HANDLE thread);
void ExitThread(DWORD code);
HANDLE CreateEventA(LPSECURITY_ATTRIBUTES sa, BOOL manualReset, BOOL initial, LPCSTR name);
#define CreateEvent CreateEventA
BOOL SetEvent(HANDLE e);
BOOL ResetEvent(HANDLE e);
HANDLE CreateMutexA(LPSECURITY_ATTRIBUTES sa, BOOL owned, LPCSTR name);
#define CreateMutex CreateMutexA
BOOL ReleaseMutex(HANDLE m);
DWORD WaitForSingleObject(HANDLE h, DWORD ms);
DWORD WaitForMultipleObjects(DWORD n, const HANDLE* hs, BOOL all, DWORD ms);
BOOL CloseHandle(HANDLE h);
void InitializeCriticalSection(LPCRITICAL_SECTION cs);
void DeleteCriticalSection(LPCRITICAL_SECTION cs);
void EnterCriticalSection(LPCRITICAL_SECTION cs);
void LeaveCriticalSection(LPCRITICAL_SECTION cs);
BOOL TryEnterCriticalSection(LPCRITICAL_SECTION cs);
LONG InterlockedIncrement(volatile LONG* p);
LONG InterlockedDecrement(volatile LONG* p);
LONG InterlockedExchange(volatile LONG* p, LONG v);
int MulDiv(int a, int b, int c);
void OutputDebugStringA(LPCSTR s);
#define OutputDebugString OutputDebugStringA
HMODULE LoadLibraryA(LPCSTR name);
#define LoadLibrary LoadLibraryA
FARPROC GetProcAddress(HMODULE m, LPCSTR name);
BOOL FreeLibrary(HMODULE m);
HMODULE GetModuleHandleA(LPCSTR name);
#define GetModuleHandle GetModuleHandleA
DWORD GetModuleFileNameA(HMODULE m, LPSTR buf, DWORD size);
#define GetModuleFileName GetModuleFileNameA
HRSRC FindResourceA(HMODULE m, LPCSTR name, LPCSTR type);
#define FindResource FindResourceA
HGLOBAL LoadResource(HMODULE m, HRSRC r);
LPVOID LockResource(HGLOBAL r);
DWORD SizeofResource(HMODULE m, HRSRC r);
BOOL CreateProcessA(LPCSTR app, LPSTR cmd, LPSECURITY_ATTRIBUTES pa, LPSECURITY_ATTRIBUTES ta, BOOL inherit,
                    DWORD flags, LPVOID env, LPCSTR dir, LPSTARTUPINFO si, LPPROCESS_INFORMATION pi);
#define CreateProcess CreateProcessA
HGLOBAL GlobalAlloc(UINT flags, SIZE_T bytes);
LPVOID GlobalLock(HGLOBAL h);
BOOL GlobalUnlock(HGLOBAL h);
HGLOBAL GlobalFree(HGLOBAL h);
SIZE_T GlobalSize(HGLOBAL h);
// Local* = Global* (both are plain heap blocks here; the LMEM_ flags have the GMEM_ values)
inline HLOCAL LocalAlloc(UINT flags, SIZE_T bytes) { return GlobalAlloc(flags, bytes); }
inline LPVOID LocalLock(HLOCAL h) { return GlobalLock(h); }
inline BOOL LocalUnlock(HLOCAL h) { return GlobalUnlock(h); }
inline HLOCAL LocalFree(HLOCAL h) { return GlobalFree(h); }
inline SIZE_T LocalSize(HLOCAL h) { return GlobalSize(h); }
typedef WORD LANGID;
LANGID GetSystemDefaultLangID();
LANGID GetUserDefaultLangID();
UINT GetACP();
int MultiByteToWideChar(UINT cp, DWORD flags, LPCSTR src, int srcLen, LPWSTR dst, int dstLen);
int WideCharToMultiByte(UINT cp, DWORD flags, LPCWSTR src, int srcLen, LPSTR dst, int dstLen, LPCSTR def, LPBOOL used);
void GetLocalTime(SYSTEMTIME* t);
void GetSystemTime(SYSTEMTIME* t);
int lstrlenA(LPCSTR s);
LPSTR lstrcpyA(LPSTR d, LPCSTR s);
LPSTR lstrcpynA(LPSTR d, LPCSTR s, int n);
LPSTR lstrcatA(LPSTR d, LPCSTR s);
int lstrcmpA(LPCSTR a, LPCSTR b);
int lstrcmpiA(LPCSTR a, LPCSTR b);
#define lstrlen lstrlenA
#define lstrcpy lstrcpyA
#define lstrcpyn lstrcpynA
#define lstrcat lstrcatA
#define lstrcmp lstrcmpA
#define lstrcmpi lstrcmpiA
int wsprintfA(LPSTR buf, LPCSTR fmt, ...);
int wsprintfW(LPWSTR buf, LPCWSTR fmt, ...);
int wvsprintfW(LPWSTR buf, LPCWSTR fmt, va_list ap);
int wvsprintfA(LPSTR buf, LPCSTR fmt, va_list ap);
#define wsprintf wsprintfA
#define wvsprintf wvsprintfA

// files: POSIX underneath. Paths are Windows-style; win32.cpp turns '\\' into '/', drops drive letters and
// resolves each component case-insensitively (the data was made on a case-insensitive file system).
#define GENERIC_READ 0x80000000L
#define GENERIC_WRITE 0x40000000L
#define FILE_SHARE_READ 0x00000001
#define FILE_SHARE_WRITE 0x00000002
#define CREATE_NEW 1
#define CREATE_ALWAYS 2
#define OPEN_EXISTING 3
#define OPEN_ALWAYS 4
#define TRUNCATE_EXISTING 5
#define FILE_ATTRIBUTE_READONLY 0x00000001
#define FILE_ATTRIBUTE_HIDDEN 0x00000002
#define FILE_ATTRIBUTE_SYSTEM 0x00000004
#define FILE_ATTRIBUTE_DIRECTORY 0x00000010
#define FILE_ATTRIBUTE_ARCHIVE 0x00000020
#define FILE_ATTRIBUTE_NORMAL 0x00000080
#define FILE_FLAG_SEQUENTIAL_SCAN 0x08000000
#define FILE_FLAG_RANDOM_ACCESS 0x10000000
#define INVALID_FILE_SIZE ((DWORD)0xFFFFFFFF)
#define INVALID_FILE_ATTRIBUTES ((DWORD)-1)
#define INVALID_SET_FILE_POINTER ((DWORD)-1)
#define FILE_BEGIN 0
#define FILE_CURRENT 1
#define FILE_END 2
#define GMEM_DISCARDABLE 0x0100
#define GMEM_NOCOMPACT 0x0010
#define GMEM_DDESHARE 0x2000
typedef struct _OVERLAPPED { ULONG_PTR Internal, InternalHigh; DWORD Offset, OffsetHigh; HANDLE hEvent; } OVERLAPPED, *LPOVERLAPPED;
typedef struct _WIN32_FIND_DATAA {
    DWORD dwFileAttributes;
    FILETIME ftCreationTime, ftLastAccessTime, ftLastWriteTime;
    DWORD nFileSizeHigh, nFileSizeLow, dwReserved0, dwReserved1;
    CHAR cFileName[MAX_PATH], cAlternateFileName[14];
} WIN32_FIND_DATA, WIN32_FIND_DATAA, *LPWIN32_FIND_DATA;
HANDLE CreateFileA(LPCSTR name, DWORD access, DWORD share, LPSECURITY_ATTRIBUTES sa, DWORD disposition, DWORD flags,
                   HANDLE tmpl);
#define CreateFile CreateFileA
BOOL ReadFile(HANDLE f, LPVOID buf, DWORD n, LPDWORD got, LPOVERLAPPED ov);
BOOL WriteFile(HANDLE f, LPCVOID buf, DWORD n, LPDWORD put, LPOVERLAPPED ov);
DWORD SetFilePointer(HANDLE f, LONG dist, PLONG distHigh, DWORD method);
DWORD GetFileSize(HANDLE f, LPDWORD high);
BOOL SetEndOfFile(HANDLE f);
BOOL FlushFileBuffers(HANDLE f);
BOOL DeleteFileA(LPCSTR name);
BOOL MoveFileA(LPCSTR from, LPCSTR to);
BOOL CopyFileA(LPCSTR from, LPCSTR to, BOOL failIfExists);
BOOL CreateDirectoryA(LPCSTR name, LPSECURITY_ATTRIBUTES sa);
BOOL RemoveDirectoryA(LPCSTR name);
DWORD GetFileAttributesA(LPCSTR name);
HANDLE FindFirstFileA(LPCSTR pattern, LPWIN32_FIND_DATA out);

// Registry (System's CRegistryManager). Declared only: the platform keeps settings in a key=value file (DESIGN.md).
typedef LONG LSTATUS;
typedef HKEY *PHKEY;
#define HKEY_LOCAL_MACHINE ((HKEY)(ULONG_PTR)0x80000002)
enum : DWORD { REG_SZ = 1, REG_BINARY = 3, REG_DWORD = 4, KEY_ALL_ACCESS = 0xf003f };
LSTATUS RegCreateKeyExA(HKEY key, LPCSTR sub, DWORD reserved, LPSTR cls, DWORD options, DWORD access,
                        LPSECURITY_ATTRIBUTES sa, PHKEY out, LPDWORD disposition);
LSTATUS RegQueryValueExA(HKEY key, LPCSTR name, LPDWORD reserved, LPDWORD type, LPBYTE data, LPDWORD size);
LSTATUS RegSetValueExA(HKEY key, LPCSTR name, DWORD reserved, DWORD type, const BYTE* data, DWORD size);
LSTATUS RegCloseKey(HKEY key);
BOOL FindNextFileA(HANDLE find, LPWIN32_FIND_DATA out);
BOOL FindClose(HANDLE find);
DWORD GetTempPathA(DWORD n, LPSTR buf);
UINT GetTempFileNameA(LPCSTR dir, LPCSTR prefix, UINT unique, LPSTR out);
DWORD GetCurrentDirectoryA(DWORD n, LPSTR buf);
BOOL SetCurrentDirectoryA(LPCSTR dir);
UINT GetWindowsDirectoryA(LPSTR buf, UINT n);
DWORD GetLogicalDrives();
DWORD GetFullPathNameA(LPCSTR name, DWORD n, LPSTR buf, LPSTR* filePart);
#define DeleteFile DeleteFileA
#define MoveFile MoveFileA
#define CopyFile CopyFileA
#define CreateDirectory CreateDirectoryA
#define RemoveDirectory RemoveDirectoryA
#define GetFileAttributes GetFileAttributesA
#define FindFirstFile FindFirstFileA
#define FindNextFile FindNextFileA
#define GetTempPath GetTempPathA
#define GetTempFileName GetTempFileNameA
#define GetCurrentDirectory GetCurrentDirectoryA
#define SetCurrentDirectory SetCurrentDirectoryA
#define GetWindowsDirectory GetWindowsDirectoryA
#define GetFullPathName GetFullPathNameA
HGLOBAL GlobalReAlloc(HGLOBAL h, SIZE_T bytes, UINT flags);
// The MSVC CRT took Windows paths too: yaneSDK's CFile (Konami's archive/stream code) calls ::fopen directly
FILE* win32_fopen(const char* name, const char* mode);
#define fopen win32_fopen

// ---------------------------------------------------------------- user32
ATOM RegisterClassExA(const WNDCLASSEX* wc);
ATOM RegisterClassA(const WNDCLASS* wc);
#define RegisterClassEx RegisterClassExA
#define RegisterClass RegisterClassA
BOOL UnregisterClassA(LPCSTR name, HINSTANCE inst);
#define UnregisterClass UnregisterClassA
HWND CreateWindowExA(DWORD exStyle, LPCSTR cls, LPCSTR title, DWORD style, int x, int y, int w, int h, HWND parent,
                     HMENU menu, HINSTANCE inst, LPVOID param);
#define CreateWindowEx CreateWindowExA
#define CreateWindowA(cls, title, style, x, y, w, h, parent, menu, inst, param) \
    CreateWindowExA(0, cls, title, style, x, y, w, h, parent, menu, inst, param)
#define CreateWindow CreateWindowA
BOOL DestroyWindow(HWND w);
BOOL IsWindow(HWND w);
BOOL ShowWindow(HWND w, int cmd);
BOOL UpdateWindow(HWND w);
BOOL IsIconic(HWND w);
BOOL IsZoomed(HWND w);
BOOL IsWindowVisible(HWND w);
BOOL SetWindowPos(HWND w, HWND after, int x, int y, int cx, int cy, UINT flags);
BOOL MoveWindow(HWND w, int x, int y, int cx, int cy, BOOL repaint);
BOOL SetWindowTextA(HWND w, LPCSTR s);
#define SetWindowText SetWindowTextA
int GetWindowTextA(HWND w, LPSTR s, int n);
#define GetWindowText GetWindowTextA
LONG_PTR GetWindowLongA(HWND w, int index);   // LONG_PTR so pointers survive on 64-bit hosts
LONG_PTR SetWindowLongA(HWND w, int index, LONG_PTR v);
#define GetWindowLong GetWindowLongA
#define SetWindowLong SetWindowLongA
#define GetWindowLongPtr GetWindowLongA
#define SetWindowLongPtr SetWindowLongA
LRESULT CallWindowProcA(WNDPROC proc, HWND w, UINT msg, WPARAM wp, LPARAM lp);
#define CallWindowProc CallWindowProcA
LRESULT DefWindowProcA(HWND w, UINT msg, WPARAM wp, LPARAM lp);
#define DefWindowProc DefWindowProcA
BOOL GetMessageA(LPMSG m, HWND w, UINT min, UINT max);
BOOL PeekMessageA(LPMSG m, HWND w, UINT min, UINT max, UINT remove);
#define GetMessage GetMessageA
#define PeekMessage PeekMessageA
BOOL TranslateMessage(const MSG* m);
LRESULT DispatchMessageA(const MSG* m);
#define DispatchMessage DispatchMessageA
BOOL PostMessageA(HWND w, UINT msg, WPARAM wp, LPARAM lp);
#define PostMessage PostMessageA
BOOL PostThreadMessageA(DWORD thread, UINT msg, WPARAM wp, LPARAM lp);
#define PostThreadMessage PostThreadMessageA
LRESULT SendMessageA(HWND w, UINT msg, WPARAM wp, LPARAM lp);
#define SendMessage SendMessageA
void PostQuitMessage(int code);
BOOL WaitMessage();
UINT_PTR SetTimer(HWND w, UINT_PTR id, UINT ms, TIMERPROC fn);
BOOL KillTimer(HWND w, UINT_PTR id);
BOOL GetClientRect(HWND w, LPRECT r);
BOOL GetWindowRect(HWND w, LPRECT r);
BOOL ClientToScreen(HWND w, LPPOINT p);
BOOL ScreenToClient(HWND w, LPPOINT p);
BOOL AdjustWindowRect(LPRECT r, DWORD style, BOOL menu);
BOOL AdjustWindowRectEx(LPRECT r, DWORD style, BOOL menu, DWORD exStyle);
BOOL GetCursorPos(LPPOINT p);
BOOL SetCursorPos(int x, int y);
int ShowCursor(BOOL show);
HCURSOR SetCursor(HCURSOR c);
HCURSOR LoadCursorA(HINSTANCE inst, LPCSTR name);
HICON LoadIconA(HINSTANCE inst, LPCSTR name);
#define LoadCursor LoadCursorA
#define LoadIcon LoadIconA
HWND SetCapture(HWND w);
BOOL ReleaseCapture();
HWND GetCapture();
HWND SetFocus(HWND w);
HWND GetFocus();
HWND GetActiveWindow();
HWND GetForegroundWindow();
BOOL SetForegroundWindow(HWND w);
HMENU GetMenu(HWND w);
BOOL SetMenu(HWND w, HMENU m);
BOOL DrawMenuBar(HWND w);
int GetSystemMetrics(int index);
BOOL SystemParametersInfoA(UINT action, UINT param, LPVOID pv, UINT winIni);
#define SystemParametersInfo SystemParametersInfoA
SHORT GetAsyncKeyState(int vk);
SHORT GetKeyState(int vk);
BOOL GetKeyboardState(LPBYTE state);
BOOL SetRect(LPRECT r, int l, int t, int ri, int b);
BOOL SetRectEmpty(LPRECT r);
BOOL OffsetRect(LPRECT r, int dx, int dy);
BOOL IntersectRect(LPRECT d, const RECT* a, const RECT* b);
BOOL PtInRect(const RECT* r, POINT p);
BOOL InvalidateRect(HWND w, const RECT* r, BOOL erase);
int MessageBoxA(HWND w, LPCSTR text, LPCSTR caption, UINT type);
#define MessageBox MessageBoxA
BOOL EnumWindows(WNDENUMPROC fn, LPARAM lp);
DWORD GetWindowThreadProcessId(HWND w, LPDWORD pid);
HWND FindWindowA(LPCSTR cls, LPCSTR title);
#define FindWindow FindWindowA
int GetClassNameA(HWND w, LPSTR buf, int n);
#define GetClassName GetClassNameA
BOOL OpenClipboard(HWND w);
BOOL CloseClipboard();
BOOL EmptyClipboard();
HANDLE GetClipboardData(UINT fmt);
HANDLE SetClipboardData(UINT fmt, HANDLE h);
BOOL IsClipboardFormatAvailable(UINT fmt);
#define CF_TEXT 1

// ---------------------------------------------------------------- resources, GDI stock objects
#define MAKEINTRESOURCE(i) ((LPSTR)(ULONG_PTR)((WORD)(i)))
#define RT_BITMAP MAKEINTRESOURCE(2)
#define RT_MENU MAKEINTRESOURCE(4)
#define RT_RCDATA MAKEINTRESOURCE(10)
#define WHITE_BRUSH_ 0
#define BLACK_PEN 7
#define NULL_BRUSH 5
HGDIOBJ GetStockObject(int index);
#include "wingdi.h"   // GDI drawing, text, regions

// ---------------------------------------------------------------- COM (enough for CoCreateInstance of DirectX objects)
typedef struct IUnknown* LPUNKNOWN;
struct IUnknown {
    virtual HRESULT QueryInterface(REFIID, void**) { return E_NOINTERFACE; }
    virtual ULONG AddRef() = 0;
    virtual ULONG Release() = 0;
    virtual ~IUnknown() {}
};
#define CLSCTX_INPROC_SERVER 0x1
#define CLSCTX_ALL 0x17
#define COINIT_APARTMENTTHREADED 0x2
#define COINIT_MULTITHREADED 0x0
HRESULT CoInitialize(LPVOID reserved);
HRESULT CoInitializeEx(LPVOID reserved, DWORD flags);
void CoUninitialize();
HRESULT CoCreateInstance(REFCLSID clsid, LPUNKNOWN unkOuter, DWORD ctx, REFIID iid, LPVOID* out);

// Window-walking and other user32 bits only the "no device" yaneSDK files need (win32_nodevice.cpp)
#include "winuser_extra.h"
