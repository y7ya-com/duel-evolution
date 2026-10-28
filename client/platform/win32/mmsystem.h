// winmm for non-Windows: timers (timeGetTime, timeSetEvent), mmio RIFF reading, joysticks (none attached), the
// mixer, MIDI and MCI (no devices). See windows.h.
#pragma once
#include "windows.h"

typedef UINT MMRESULT;
#define MMSYSERR_NOERROR 0
#define MMSYSERR_ERROR 1
#define MMSYSERR_BADDEVICEID 2
#define MMSYSERR_ALLOCATED 4
#define MMSYSERR_INVALHANDLE 5
#define MMSYSERR_NODRIVER 6
#define MMSYSERR_NOMEM 7
#define MMSYSERR_NOTSUPPORTED 8
#define MMSYSERR_INVALFLAG 10
#define MMSYSERR_INVALPARAM 11
#define TIMERR_NOERROR 0
#define TIMERR_NOCANDO 97
#define TIME_ONESHOT 0x0000
#define TIME_PERIODIC 0x0001
#define TIME_CALLBACK_FUNCTION 0x0000
#define CALLBACK_NULL 0x00000000L
#define CALLBACK_WINDOW 0x00010000L
#define CALLBACK_THREAD 0x00020000L
#define CALLBACK_FUNCTION 0x00030000L

typedef struct timecaps_tag { UINT wPeriodMin, wPeriodMax; } TIMECAPS, *LPTIMECAPS;
typedef void (*LPTIMECALLBACK)(UINT id, UINT msg, DWORD_PTR user, DWORD_PTR dw1, DWORD_PTR dw2);
DWORD timeGetTime();
MMRESULT timeGetDevCaps(LPTIMECAPS caps, UINT size);
MMRESULT timeBeginPeriod(UINT ms);
MMRESULT timeEndPeriod(UINT ms);
// The callback runs on its own thread, as winmm's multimedia timers do. DWORD_PTR so `this` survives on 64-bit.
MMRESULT timeSetEvent(UINT delay, UINT resolution, LPTIMECALLBACK fn, DWORD_PTR user, UINT flags);
MMRESULT timeKillEvent(UINT id);

// ---- WAVE
#define WAVE_FORMAT_PCM 1
#define WAVE_MAPPER ((UINT)-1)
typedef struct tWAVEFORMATEX {
    WORD wFormatTag, nChannels;
    DWORD nSamplesPerSec, nAvgBytesPerSec;
    WORD nBlockAlign, wBitsPerSample, cbSize;
} WAVEFORMATEX, *LPWAVEFORMATEX, *PWAVEFORMATEX;
typedef const WAVEFORMATEX* LPCWAVEFORMATEX;
typedef struct pcmwaveformat_tag { struct { WORD wFormatTag, nChannels; DWORD nSamplesPerSec, nAvgBytesPerSec;
                                            WORD nBlockAlign; } wf;
                                   WORD wBitsPerSample; } PCMWAVEFORMAT;
typedef struct waveformat_tag { WORD wFormatTag, nChannels; DWORD nSamplesPerSec, nAvgBytesPerSec; WORD nBlockAlign; } WAVEFORMAT;

// ---- mmio: RIFF reading from a file or a memory block (FOURCC_MEM), as kmWaveMmio uses it
typedef DWORD FOURCC;
#define mmioFOURCC(a, b, c, d) ((DWORD)(BYTE)(a) | ((DWORD)(BYTE)(b) << 8) | ((DWORD)(BYTE)(c) << 16) | ((DWORD)(BYTE)(d) << 24))
#define FOURCC_RIFF mmioFOURCC('R', 'I', 'F', 'F')
#define FOURCC_LIST mmioFOURCC('L', 'I', 'S', 'T')
#define FOURCC_MEM mmioFOURCC('M', 'E', 'M', ' ')
#define FOURCC_DOS mmioFOURCC('D', 'O', 'S', ' ')
#define MMIO_READ 0x00000000L
#define MMIO_WRITE 0x00000001L
#define MMIO_READWRITE 0x00000002L
#define MMIO_ALLOCBUF 0x00010000L
#define MMIO_FINDCHUNK 0x0010
#define MMIO_FINDRIFF 0x0020
#define MMIO_FINDLIST 0x0040
#define MMIOERR_CHUNKNOTFOUND 265
DECLARE_HANDLE(HMMIO);
typedef struct _MMIOINFO {
    DWORD dwFlags;
    FOURCC fccIOProc;
    void* pIOProc;
    UINT wErrorRet;
    HANDLE htask;
    LONG cchBuffer;
    char* pchBuffer;
    char* pchNext;
    char* pchEndRead;
    char* pchEndWrite;
    LONG lBufOffset, lDiskOffset;
    DWORD adwInfo[3], dwReserved1, dwReserved2;
    HMMIO hmmio;
} MMIOINFO, *LPMMIOINFO;
typedef struct _MMCKINFO { FOURCC ckid; DWORD cksize; FOURCC fccType; DWORD dwDataOffset, dwFlags; } MMCKINFO, *LPMMCKINFO;
HMMIO mmioOpenA(LPSTR name, LPMMIOINFO info, DWORD flags);
#define mmioOpen mmioOpenA
MMRESULT mmioClose(HMMIO h, UINT flags);
LONG mmioRead(HMMIO h, char* buf, LONG n);
LONG mmioSeek(HMMIO h, LONG off, int origin);
MMRESULT mmioDescend(HMMIO h, LPMMCKINFO ck, const MMCKINFO* parent, UINT flags);
MMRESULT mmioAscend(HMMIO h, LPMMCKINFO ck, UINT flags);

// ---- joystick: never attached here (SDL_GameController is the later backend)
#define JOYERR_NOERROR 0
#define JOYERR_PARMS 165
#define JOYERR_UNPLUGGED 167
#define JOYSTICKID1 0
#define JOYSTICKID2 1
#define JOY_RETURNX 0x00000001
#define JOY_RETURNY 0x00000002
#define JOY_RETURNZ 0x00000004
#define JOY_RETURNR 0x00000008
#define JOY_RETURNU 0x00000010
#define JOY_RETURNV 0x00000020
#define JOY_RETURNPOV 0x00000040
#define JOY_RETURNBUTTONS 0x00000080
#define JOY_RETURNALL 0x000000FF
#define JOY_BUTTON1 0x0001
#define JOY_BUTTON2 0x0002
#define JOY_BUTTON3 0x0004
#define JOY_BUTTON4 0x0008
typedef struct joyinfo_tag { UINT wXpos, wYpos, wZpos, wButtons; } JOYINFO, *LPJOYINFO;
typedef struct joyinfoex_tag {
    DWORD dwSize, dwFlags, dwXpos, dwYpos, dwZpos, dwRpos, dwUpos, dwVpos, dwButtons, dwButtonNumber, dwPOV,
        dwReserved1, dwReserved2;
} JOYINFOEX, *LPJOYINFOEX;
typedef struct tagJOYCAPSA {
    WORD wMid, wPid;
    CHAR szPname[32];
    UINT wXmin, wXmax, wYmin, wYmax, wZmin, wZmax, wNumButtons, wPeriodMin, wPeriodMax, wRmin, wRmax, wUmin, wUmax,
        wVmin, wVmax, wCaps, wMaxAxes, wNumAxes, wMaxButtons;
    CHAR szRegKey[32], szOEMVxD[260];
} JOYCAPS, *LPJOYCAPS;
UINT joyGetNumDevs();
MMRESULT joyGetPos(UINT id, LPJOYINFO info);
MMRESULT joyGetPosEx(UINT id, LPJOYINFOEX info);
MMRESULT joyGetDevCapsA(UINT_PTR id, LPJOYCAPS caps, UINT size);
#define joyGetDevCaps joyGetDevCapsA

// ---- mixer: no devices; CAudioMixer fails its open and leaves volumes alone
DECLARE_HANDLE(HMIXEROBJ);
DECLARE_HANDLE(HMIXER);
typedef HMIXER* LPHMIXER;
#define MIXER_OBJECTF_MIXER 0x00000000L
#define MIXER_OBJECTF_HMIXER 0x80000000L
#define MIXER_GETLINEINFOF_DESTINATION 0x00000000L
#define MIXER_GETLINEINFOF_SOURCE 0x00000001L
#define MIXER_GETLINEINFOF_COMPONENTTYPE 0x00000003L
#define MIXER_GETLINECONTROLSF_ALL 0x00000000L
#define MIXER_GETLINECONTROLSF_ONEBYTYPE 0x00000002L
#define MIXER_GETCONTROLDETAILSF_VALUE 0x00000000L
#define MIXER_SETCONTROLDETAILSF_VALUE 0x00000000L
#define MIXERR_INVALLINE 1024
#define MIXERR_INVALCONTROL 1025
#define MIXERLINE_COMPONENTTYPE_DST_SPEAKERS 4
#define MIXERLINE_COMPONENTTYPE_SRC_SYNTHESIZER 0x1004
#define MIXERLINE_COMPONENTTYPE_SRC_COMPACTDISC 0x1005
#define MIXERLINE_COMPONENTTYPE_SRC_WAVEOUT 0x1008
#define MIXERCONTROL_CONTROLTYPE_VOLUME 0x50030001
#define MIXERCONTROL_CONTROLTYPE_MUTE 0x20010002
typedef struct tagMIXERCAPSA { WORD wMid, wPid; UINT vDriverVersion; CHAR szPname[32]; DWORD fdwSupport, cDestinations; } MIXERCAPS, *LPMIXERCAPS;
typedef struct tagMIXERLINEA {
    DWORD cbStruct, dwDestination, dwSource, dwLineID, fdwLine;
    DWORD_PTR dwUser;
    DWORD dwComponentType, cChannels, cConnections, cControls;
    CHAR szShortName[16], szName[64];
    struct { DWORD dwType, dwDeviceID; WORD wMid, wPid; UINT vDriverVersion; CHAR szPname[32]; } Target;
} MIXERLINE, *LPMIXERLINE;
typedef struct tagMIXERCONTROLA {
    DWORD cbStruct, dwControlID, dwControlType, fdwControl, cMultipleItems;
    CHAR szShortName[16], szName[64];
    union { struct { LONG lMinimum, lMaximum; }; struct { DWORD dwMinimum, dwMaximum; }; DWORD dwReserved[6]; } Bounds;
    union { DWORD cSteps, cbCustomData; DWORD dwReserved[6]; } Metrics;
} MIXERCONTROL, *LPMIXERCONTROL;
typedef struct tagMIXERLINECONTROLSA {
    DWORD cbStruct, dwLineID;
    union { DWORD dwControlID, dwControlType; };
    DWORD cControls, cbmxctrl;
    LPMIXERCONTROL pamxctrl;
} MIXERLINECONTROLS, *LPMIXERLINECONTROLS;
typedef struct tMIXERCONTROLDETAILS {
    DWORD cbStruct, dwControlID, cChannels;
    union { HWND hwndOwner; DWORD cMultipleItems; };
    DWORD cbDetails;
    LPVOID paDetails;
} MIXERCONTROLDETAILS, *LPMIXERCONTROLDETAILS;
typedef struct tMIXERCONTROLDETAILS_UNSIGNED { DWORD dwValue; } MIXERCONTROLDETAILS_UNSIGNED;
UINT mixerGetNumDevs();
MMRESULT mixerOpen(LPHMIXER out, UINT id, DWORD_PTR cb, DWORD_PTR inst, DWORD flags);
MMRESULT mixerClose(HMIXER m);
MMRESULT mixerGetDevCapsA(UINT_PTR id, LPMIXERCAPS caps, UINT size);
MMRESULT mixerGetLineInfoA(HMIXEROBJ m, LPMIXERLINE line, DWORD flags);
MMRESULT mixerGetLineControlsA(HMIXEROBJ m, LPMIXERLINECONTROLS c, DWORD flags);
MMRESULT mixerGetControlDetailsA(HMIXEROBJ m, LPMIXERCONTROLDETAILS d, DWORD flags);
MMRESULT mixerSetControlDetails(HMIXEROBJ m, LPMIXERCONTROLDETAILS d, DWORD flags);
#define mixerGetDevCaps mixerGetDevCapsA
#define mixerGetLineInfo mixerGetLineInfoA
#define mixerGetLineControls mixerGetLineControlsA
#define mixerGetControlDetails mixerGetControlDetailsA

// ---- MIDI out: no devices (Konami compiled MCI/DirectMusic out; CMIDIOutput only builds CSoundNullDevice)
#define MIDI_MAPPER ((UINT)-1)
#define MIM_OPEN 0x3C1
#define MIM_CLOSE 0x3C2
#define MIM_DATA 0x3C3
DECLARE_HANDLE(HMIDIOUT);
typedef HMIDIOUT* LPHMIDIOUT;
UINT midiOutGetNumDevs();
MMRESULT midiOutOpen(LPHMIDIOUT out, UINT id, DWORD_PTR cb, DWORD_PTR inst, DWORD flags);
MMRESULT midiOutClose(HMIDIOUT h);
MMRESULT midiOutShortMsg(HMIDIOUT h, DWORD msg);
MMRESULT midiOutReset(HMIDIOUT h);

// ---- MIDI in: no devices
DECLARE_HANDLE(HMIDIIN);
typedef HMIDIIN* LPHMIDIIN;
UINT midiInGetNumDevs();
MMRESULT midiInOpen(LPHMIDIIN out, UINT id, DWORD_PTR cb, DWORD_PTR inst, DWORD flags);
MMRESULT midiInClose(HMIDIIN h);
MMRESULT midiInStart(HMIDIIN h);
MMRESULT midiInStop(HMIDIIN h);
MMRESULT midiInReset(HMIDIIN h);

// ---- MCI: no devices (no CD drive). Every mciSendCommand fails with MCIERR_DEVICE_NOT_INSTALLED, so CCDDA::Open
// returns 1 and never plays; nothing ever posts MM_MCINOTIFY. (win32_nodevice.cpp)
typedef UINT MCIDEVICEID;
typedef DWORD MCIERROR;
#define MCIERR_BASE 256
#define MCIERR_INVALID_DEVICE_ID (MCIERR_BASE + 1)
#define MCIERR_UNRECOGNIZED_COMMAND (MCIERR_BASE + 5)
#define MCIERR_HARDWARE (MCIERR_BASE + 6)
#define MCIERR_INVALID_DEVICE_NAME (MCIERR_BASE + 7)
#define MCIERR_DEVICE_NOT_READY (MCIERR_BASE + 20)
#define MCIERR_DEVICE_NOT_INSTALLED (MCIERR_BASE + 50)
#define MM_MCINOTIFY 0x3B9
#define MCI_NOTIFY_SUCCESSFUL 0x0001
#define MCI_NOTIFY_SUPERSEDED 0x0002
#define MCI_NOTIFY_ABORTED 0x0004
#define MCI_NOTIFY_FAILURE 0x0008
// commands
#define MCI_OPEN 0x0803
#define MCI_CLOSE 0x0804
#define MCI_PLAY 0x0806
#define MCI_SEEK 0x0807
#define MCI_STOP 0x0808
#define MCI_PAUSE 0x0809
#define MCI_INFO 0x080A
#define MCI_GETDEVCAPS 0x080B
#define MCI_SET 0x080D
#define MCI_STATUS 0x0814
#define MCI_RESUME 0x0855
// flags common to all commands
#define MCI_NOTIFY 0x00000001L
#define MCI_WAIT 0x00000002L
#define MCI_FROM 0x00000004L
#define MCI_TO 0x00000008L
#define MCI_TRACK 0x00000010L
// MCI_OPEN
#define MCI_OPEN_SHAREABLE 0x00000100L
#define MCI_OPEN_ELEMENT 0x00000200L
#define MCI_OPEN_ALIAS 0x00000400L
#define MCI_OPEN_ELEMENT_ID 0x00000800L
#define MCI_OPEN_TYPE_ID 0x00001000L
#define MCI_OPEN_TYPE 0x00002000L
// MCI_STATUS
#define MCI_STATUS_ITEM 0x00000100L
#define MCI_STATUS_START 0x00000200L
#define MCI_STATUS_LENGTH 0x00000001L
#define MCI_STATUS_POSITION 0x00000002L
#define MCI_STATUS_NUMBER_OF_TRACKS 0x00000003L
#define MCI_STATUS_MODE 0x00000004L
#define MCI_STATUS_MEDIA_PRESENT 0x00000005L
#define MCI_STATUS_TIME_FORMAT 0x00000006L
#define MCI_STATUS_READY 0x00000007L
#define MCI_STATUS_CURRENT_TRACK 0x00000008L
// MCI_SET
#define MCI_SET_DOOR_OPEN 0x00000100L
#define MCI_SET_DOOR_CLOSED 0x00000200L
#define MCI_SET_TIME_FORMAT 0x00000400L
#define MCI_SET_AUDIO 0x00000800L
#define MCI_SET_VIDEO 0x00001000L
#define MCI_SET_ON 0x00002000L
#define MCI_SET_OFF 0x00004000L
#define MCI_FORMAT_MILLISECONDS 0
#define MCI_FORMAT_HMS 1
#define MCI_FORMAT_MSF 2
#define MCI_FORMAT_FRAMES 3
#define MCI_FORMAT_TMSF 10
#define MCI_MODE_NOT_READY 524
#define MCI_MODE_STOP 525
#define MCI_MODE_PLAY 526
#define MCI_MODE_RECORD 527
#define MCI_MODE_SEEK 528
#define MCI_MODE_PAUSE 529
#define MCI_MODE_OPEN 530
#define MCI_DEVTYPE_VCR 513
#define MCI_DEVTYPE_VIDEODISC 514
#define MCI_DEVTYPE_OVERLAY 515
#define MCI_DEVTYPE_CD_AUDIO 516
#define MCI_DEVTYPE_DAT 517
#define MCI_DEVTYPE_SCANNER 518
#define MCI_DEVTYPE_ANIMATION 519
#define MCI_DEVTYPE_DIGITAL_VIDEO 520
#define MCI_DEVTYPE_OTHER 521
#define MCI_DEVTYPE_WAVEFORM_AUDIO 522
#define MCI_DEVTYPE_SEQUENCER 523
#define MCI_MSF_MINUTE(msf) ((BYTE)(msf))
#define MCI_MSF_SECOND(msf) ((BYTE)(((WORD)(msf)) >> 8))
#define MCI_MSF_FRAME(msf) ((BYTE)((msf) >> 16))
#define MCI_MAKE_MSF(m, s, f) ((DWORD)(((BYTE)(m) | ((WORD)(s) << 8)) | (((DWORD)(BYTE)(f)) << 16)))
#define MCI_TMSF_TRACK(tmsf) ((BYTE)(tmsf))
#define MCI_TMSF_MINUTE(tmsf) ((BYTE)(((WORD)(tmsf)) >> 8))
#define MCI_TMSF_SECOND(tmsf) ((BYTE)((tmsf) >> 16))
#define MCI_TMSF_FRAME(tmsf) ((BYTE)((tmsf) >> 24))
#define MCI_MAKE_TMSF(t, m, s, f) ((DWORD)(((BYTE)(t) | ((WORD)(m) << 8)) | (((DWORD)(BYTE)(s) | ((WORD)(f) << 8)) << 16)))
typedef struct tagMCI_GENERIC_PARMS { DWORD_PTR dwCallback; } MCI_GENERIC_PARMS, *LPMCI_GENERIC_PARMS;
typedef struct tagMCI_OPEN_PARMSA {
    DWORD_PTR dwCallback;
    MCIDEVICEID wDeviceID;
    LPCSTR lpstrDeviceType, lpstrElementName, lpstrAlias;
} MCI_OPEN_PARMS, *LPMCI_OPEN_PARMS;
typedef struct tagMCI_PLAY_PARMS { DWORD_PTR dwCallback; DWORD dwFrom, dwTo; } MCI_PLAY_PARMS, *LPMCI_PLAY_PARMS;
typedef struct tagMCI_SEEK_PARMS { DWORD_PTR dwCallback; DWORD dwTo; } MCI_SEEK_PARMS, *LPMCI_SEEK_PARMS;
typedef struct tagMCI_STATUS_PARMS {
    DWORD_PTR dwCallback, dwReturn;
    DWORD dwItem, dwTrack;
} MCI_STATUS_PARMS, *LPMCI_STATUS_PARMS;
typedef struct tagMCI_SET_PARMS { DWORD_PTR dwCallback; DWORD dwTimeFormat, dwAudio; } MCI_SET_PARMS, *LPMCI_SET_PARMS;
MCIERROR mciSendCommandA(MCIDEVICEID id, UINT msg, DWORD_PTR flags, DWORD_PTR param);
BOOL mciGetErrorStringA(MCIERROR err, LPSTR buf, UINT size);
#define mciSendCommand mciSendCommandA
#define mciGetErrorString mciGetErrorStringA
