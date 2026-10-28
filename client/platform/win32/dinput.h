// DirectInput 3/5 subset for non-Windows: the system keyboard (CDirectInput) reads platformKeyboardDik; there are
// no joysticks (EnumDevices finds none), so CDirectInputJoyStick sees zero devices, as on a PC without a pad.
#pragma once
#include "windows.h"

#include "../com.h"

#ifndef DIRECTINPUT_VERSION
#define DIRECTINPUT_VERSION 0x0500
#endif

#define DI_OK S_OK
#define DI_NOTATTACHED S_FALSE
#define DI_POLLEDDEVICE ((HRESULT)0x00000002L)
#define DIERR_INPUTLOST ((HRESULT)0x8007001EL)
#define DIERR_NOTACQUIRED ((HRESULT)0x8007000CL)
#define DIERR_INVALIDPARAM E_INVALIDARG
#define DIERR_NOINTERFACE E_NOINTERFACE
#define DIERR_DEVICENOTREG ((HRESULT)0x80040154L)
#define DISCL_EXCLUSIVE 0x00000001
#define DISCL_NONEXCLUSIVE 0x00000002
#define DISCL_FOREGROUND 0x00000004
#define DISCL_BACKGROUND 0x00000008
#define DIEDFL_ALLDEVICES 0x00000000
#define DIEDFL_ATTACHEDONLY 0x00000001
#define DIDEVTYPE_DEVICE 1
#define DIDEVTYPE_MOUSE 2
#define DIDEVTYPE_KEYBOARD 3
#define DIDEVTYPE_JOYSTICK 4
#define DIENUM_STOP 0
#define DIENUM_CONTINUE 1
#define DIPH_DEVICE 0
#define DIPH_BYOFFSET 1
#define DIPH_BYID 2
#define DIDFT_AXIS 0x00000003
#define DIDFT_ABSAXIS 0x00000002
#define DIDFT_BUTTON 0x0000000C

struct DIDATAFORMAT { DWORD dwSize, dwObjSize, dwFlags, dwDataSize, dwNumObjs; void* rgodf; };
typedef const DIDATAFORMAT* LPCDIDATAFORMAT;
extern const DIDATAFORMAT c_dfDIKeyboard, c_dfDIJoystick, c_dfDIMouse;

typedef struct DIJOYSTATE { LONG lX, lY, lZ, lRx, lRy, lRz, rglSlider[2]; DWORD rgdwPOV[4]; BYTE rgbButtons[32]; } DIJOYSTATE, *LPDIJOYSTATE;
#define DIJOFS_X 0
#define DIJOFS_Y 4
#define DIJOFS_Z 8
#define DIJOFS_RX 12
#define DIJOFS_RY 16
#define DIJOFS_RZ 20
#define DIJOFS_BUTTON(n) (48 + (n))

typedef struct DIPROPHEADER { DWORD dwSize, dwHeaderSize, dwObj, dwHow; } DIPROPHEADER, *LPDIPROPHEADER;
typedef const DIPROPHEADER* LPCDIPROPHEADER;
typedef struct DIPROPRANGE { DIPROPHEADER diph; LONG lMin, lMax; } DIPROPRANGE;
typedef struct DIPROPDWORD { DIPROPHEADER diph; DWORD dwData; } DIPROPDWORD;
#define DIPROP_BUFFERSIZE (*(const GUID*)1)
#define DIPROP_RANGE (*(const GUID*)4)
#define DIPROP_DEADZONE (*(const GUID*)5)

typedef struct DIDEVCAPS { DWORD dwSize, dwFlags, dwDevType, dwAxes, dwButtons, dwPOVs, dwFFSamplePeriod,
                           dwFFMinTimeResolution, dwFirmwareRevision, dwHardwareRevision, dwFFDriverVersion; } DIDEVCAPS, *LPDIDEVCAPS;
typedef struct DIDEVICEINSTANCEA {
    DWORD dwSize;
    GUID guidInstance, guidProduct;
    DWORD dwDevType;
    CHAR tszInstanceName[MAX_PATH], tszProductName[MAX_PATH];
    GUID guidFFDriver;
    WORD wUsagePage, wUsage;
} DIDEVICEINSTANCE, *LPDIDEVICEINSTANCE;
typedef const DIDEVICEINSTANCE* LPCDIDEVICEINSTANCE;
typedef struct DIDEVICEOBJECTINSTANCEA {
    DWORD dwSize;
    GUID guidType;
    DWORD dwOfs, dwType, dwFlags;
    CHAR tszName[MAX_PATH];
} DIDEVICEOBJECTINSTANCE, *LPDIDEVICEOBJECTINSTANCE;
typedef const DIDEVICEOBJECTINSTANCE* LPCDIDEVICEOBJECTINSTANCE;
typedef BOOL (*LPDIENUMDEVICESCALLBACK)(LPCDIDEVICEINSTANCE, LPVOID);
typedef BOOL (*LPDIENUMDEVICEOBJECTSCALLBACK)(LPCDIDEVICEOBJECTINSTANCE, LPVOID);

class IDirectInputDevice : public ComObject {
public:
    HRESULT QueryInterface(REFIID iid, void** out);   // IID_IDirectInputDevice2 -> itself
    HRESULT GetCapabilities(LPDIDEVCAPS caps);
    HRESULT GetDeviceInfo(LPDIDEVICEINSTANCE info);
    HRESULT EnumObjects(LPDIENUMDEVICEOBJECTSCALLBACK /*fn*/, LPVOID /*ref*/, DWORD /*flags*/) { return DI_OK; }
    HRESULT GetProperty(REFGUID /*prop*/, LPDIPROPHEADER /*h*/) { return DIERR_INVALIDPARAM; }
    HRESULT SetProperty(REFGUID /*prop*/, LPCDIPROPHEADER /*h*/) { return DI_OK; }
    HRESULT Acquire() { return DI_OK; }
    HRESULT Unacquire() { return DI_OK; }
    HRESULT GetDeviceState(DWORD size, LPVOID data);   // keyboard: 256 bytes of DIK state
    HRESULT SetDataFormat(LPCDIDATAFORMAT /*fmt*/) { return DI_OK; }
    HRESULT SetCooperativeLevel(HWND /*w*/, DWORD /*flags*/) { return DI_OK; }
    HRESULT Poll() { return DI_NOTATTACHED; }           // IDirectInputDevice2
};
typedef IDirectInputDevice IDirectInputDevice2;
typedef IDirectInputDevice* LPDIRECTINPUTDEVICE;
typedef IDirectInputDevice* LPDIRECTINPUTDEVICE2;
typedef IDirectInputDevice* LPDIRECTINPUTDEVICEA;

class IDirectInput : public ComObject {
public:
    HRESULT QueryInterface(REFIID iid, void** out);
    HRESULT Initialize(HINSTANCE /*inst*/, DWORD /*version*/) { return DI_OK; }
    HRESULT CreateDevice(REFGUID guid, LPDIRECTINPUTDEVICE* out, LPUNKNOWN unkOuter);   // GUID_SysKeyboard only
    HRESULT EnumDevices(DWORD /*type*/, LPDIENUMDEVICESCALLBACK /*fn*/, LPVOID /*ref*/, DWORD /*flags*/) { return DI_OK; }
    HRESULT GetDeviceStatus(REFGUID /*guid*/) { return DI_NOTATTACHED; }
};
typedef IDirectInput* LPDIRECTINPUT;
typedef IDirectInput* LPDIRECTINPUTA;

HRESULT DirectInputCreateA(HINSTANCE inst, DWORD version, LPDIRECTINPUTA* out, LPUNKNOWN unkOuter);
#define DirectInputCreate DirectInputCreateA
extern const GUID CLSID_DirectInput, IID_IDirectInput, IID_IDirectInputA, IID_IDirectInput2, IID_IDirectInputDevice,
    IID_IDirectInputDevice2, GUID_SysKeyboard, GUID_SysMouse, GUID_XAxis, GUID_YAxis;

// DIK_* (PC set-1 scancodes)
#define DIK_ESCAPE 0x01
#define DIK_1 0x02
#define DIK_2 0x03
#define DIK_3 0x04
#define DIK_4 0x05
#define DIK_5 0x06
#define DIK_6 0x07
#define DIK_7 0x08
#define DIK_8 0x09
#define DIK_9 0x0A
#define DIK_0 0x0B
#define DIK_MINUS 0x0C
#define DIK_EQUALS 0x0D
#define DIK_BACK 0x0E
#define DIK_TAB 0x0F
#define DIK_Q 0x10
#define DIK_W 0x11
#define DIK_E 0x12
#define DIK_R 0x13
#define DIK_T 0x14
#define DIK_Y 0x15
#define DIK_U 0x16
#define DIK_I 0x17
#define DIK_O 0x18
#define DIK_P 0x19
#define DIK_LBRACKET 0x1A
#define DIK_RBRACKET 0x1B
#define DIK_RETURN 0x1C
#define DIK_LCONTROL 0x1D
#define DIK_A 0x1E
#define DIK_S 0x1F
#define DIK_D 0x20
#define DIK_F 0x21
#define DIK_G 0x22
#define DIK_H 0x23
#define DIK_J 0x24
#define DIK_K 0x25
#define DIK_L 0x26
#define DIK_SEMICOLON 0x27
#define DIK_APOSTROPHE 0x28
#define DIK_GRAVE 0x29
#define DIK_LSHIFT 0x2A
#define DIK_BACKSLASH 0x2B
#define DIK_Z 0x2C
#define DIK_X 0x2D
#define DIK_C 0x2E
#define DIK_V 0x2F
#define DIK_B 0x30
#define DIK_N 0x31
#define DIK_M 0x32
#define DIK_COMMA 0x33
#define DIK_PERIOD 0x34
#define DIK_SLASH 0x35
#define DIK_RSHIFT 0x36
#define DIK_MULTIPLY 0x37
#define DIK_LMENU 0x38
#define DIK_SPACE 0x39
#define DIK_CAPITAL 0x3A
#define DIK_F1 0x3B
#define DIK_F2 0x3C
#define DIK_F3 0x3D
#define DIK_F4 0x3E
#define DIK_F5 0x3F
#define DIK_F6 0x40
#define DIK_F7 0x41
#define DIK_F8 0x42
#define DIK_F9 0x43
#define DIK_F10 0x44
#define DIK_NUMLOCK 0x45
#define DIK_SCROLL 0x46
#define DIK_NUMPAD7 0x47
#define DIK_NUMPAD8 0x48
#define DIK_NUMPAD9 0x49
#define DIK_SUBTRACT 0x4A
#define DIK_NUMPAD4 0x4B
#define DIK_NUMPAD5 0x4C
#define DIK_NUMPAD6 0x4D
#define DIK_ADD 0x4E
#define DIK_NUMPAD1 0x4F
#define DIK_NUMPAD2 0x50
#define DIK_NUMPAD3 0x51
#define DIK_NUMPAD0 0x52
#define DIK_DECIMAL 0x53
#define DIK_F11 0x57
#define DIK_F12 0x58
#define DIK_NUMPADENTER 0x9C
#define DIK_RCONTROL 0x9D
#define DIK_DIVIDE 0xB5
#define DIK_RMENU 0xB8
#define DIK_HOME 0xC7
#define DIK_UP 0xC8
#define DIK_PRIOR 0xC9
#define DIK_LEFT 0xCB
#define DIK_RIGHT 0xCD
#define DIK_END 0xCF
#define DIK_DOWN 0xD0
#define DIK_NEXT 0xD1
#define DIK_INSERT 0xD2
#define DIK_DELETE 0xD3
