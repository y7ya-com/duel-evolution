"""stdcall argument counts of yo2.exe's imports (bytes popped = 4*n); None = cdecl (caller pops).
Used by the generated fallback stubs so RC_LENIENT=1 can log an unwritten import and carry on."""
ARGS = {
    # ADVAPI32
    "RegCloseKey": 1, "RegCreateKeyExA": 9, "RegOpenKeyA": 3, "RegQueryValueExA": 6, "RegSetValueExA": 6,
    # GDI32
    "BeginPath": 1, "BitBlt": 9, "CloseFigure": 1, "CombineRgn": 4, "CreateCompatibleDC": 1, "CreateDIBSection": 6,
    "CreateFontA": 14, "CreateFontIndirectA": 1, "CreateRectRgn": 4, "DeleteDC": 1, "DeleteObject": 1,
    "EndPath": 1, "GetDeviceCaps": 2, "GetGlyphOutlineW": 7, "GetPixel": 3, "GetStockObject": 1,
    "GetSystemPaletteEntries": 4, "GetTextExtentPoint32W": 4, "GetTextMetricsA": 2, "LineTo": 3, "MoveToEx": 4,
    "PathToRegion": 1, "SelectObject": 2, "SetBkColor": 2, "SetBkMode": 2, "SetDIBitsToDevice": 12, "SetPixel": 4,
    "SetTextColor": 2, "TextOutA": 5, "TextOutW": 5,
    # IMM32
    "ImmGetCandidateListA": 4, "ImmGetCompositionStringA": 4, "ImmGetContext": 1, "ImmReleaseContext": 2,
    "ImmSetCandidateWindow": 2, "ImmSetCompositionWindow": 2,
    # MSACM32
    "acmFormatSuggest": 5, "acmStreamClose": 2, "acmStreamConvert": 3, "acmStreamOpen": 8,
    "acmStreamPrepareHeader": 3, "acmStreamSize": 4, "acmStreamUnprepareHeader": 3,
    "?GetDuelPassCode@@YA?AW4MagicKeyStatusCode@@PADI@Z": None,
    "#418": 1, "ShellExecuteA": 6,
    # USER32
    "AdjustWindowRect": 3, "BeginPaint": 2, "CallWindowProcA": 5, "ClientToScreen": 2, "CloseClipboard": 0,
    "CreateWindowExA": 12, "DefWindowProcA": 4, "DestroyWindow": 1, "DispatchMessageA": 1, "DrawMenuBar": 1,
    "EmptyClipboard": 0, "EndPaint": 2, "EnumWindows": 2, "GetActiveWindow": 0, "GetAsyncKeyState": 1,
    "GetClientRect": 2, "GetClipboardData": 1, "GetCursorPos": 1, "GetDC": 1, "GetKeyState": 1, "GetMenu": 1,
    "GetMessageA": 4, "GetSystemMetrics": 1, "GetTopWindow": 1, "GetWindow": 2, "GetWindowDC": 1,
    "GetWindowLongA": 2, "GetWindowRect": 2, "GetWindowThreadProcessId": 2, "IntersectRect": 3,
    "IsClipboardFormatAvailable": 1, "KillTimer": 2, "LoadCursorA": 2, "LoadIconA": 2, "LoadStringA": 4,
    "MessageBoxA": 4, "OffsetRect": 3, "OpenClipboard": 1, "PeekMessageA": 5, "PostMessageA": 4,
    "PostQuitMessage": 1, "RegisterClassExA": 1, "ReleaseCapture": 0, "ReleaseDC": 2, "ScreenToClient": 2,
    "SendMessageA": 4, "SetCapture": 1, "SetClipboardData": 2, "SetCursorPos": 2, "SetFocus": 1,
    "SetForegroundWindow": 1, "SetMenu": 2, "SetRect": 5, "SetTimer": 4, "SetWindowLongA": 3, "SetWindowPos": 7,
    "SetWindowRgn": 3, "ShowCursor": 1, "ShowWindow": 2, "SystemParametersInfoA": 4, "TranslateMessage": 1,
    "WINNLSEnableIME": 2, "wsprintfA": None, "wsprintfW": None, "wvsprintfA": 3, "wvsprintfW": 3,
    # VERSION
    "GetFileVersionInfoA": 4, "GetFileVersionInfoSizeA": 2, "VerQueryValueA": 4,
    # WININET
    "HttpEndRequestA": 4, "HttpOpenRequestA": 8, "HttpQueryInfoA": 5, "HttpSendRequestExA": 5,
    "InternetCloseHandle": 1, "InternetConnectA": 8, "InternetOpenA": 5, "InternetOpenUrlA": 6,
    "InternetReadFile": 4, "InternetWriteFile": 4,
    # WINMM
    "joyGetDevCapsA": 3, "joyGetNumDevs": 0, "joyGetPos": 2, "joyGetPosEx": 2, "mciSendCommandA": 4,
    "midiInClose": 1, "midiInGetNumDevs": 0, "midiInOpen": 5, "midiInReset": 1, "midiInStart": 1, "midiInStop": 1,
    "midiOutClose": 1, "midiOutOpen": 5, "mixerClose": 1, "mixerGetControlDetailsA": 3, "mixerGetDevCapsA": 3,
    "mixerGetLineControlsA": 3, "mixerGetLineInfoA": 3, "mixerGetNumDevs": 0, "mixerOpen": 5,
    "mixerSetControlDetails": 3, "timeBeginPeriod": 1, "timeEndPeriod": 1, "timeGetDevCaps": 2, "timeGetTime": 0,
    "timeKillEvent": 1, "timeSetEvent": 5,
    # WSOCK32 by ordinal: closesocket connect htons inet_addr recv send socket gethostbyname WSAAsyncSelect
    # WSAGetLastError WSACancelBlockingCall WSAStartup WSACleanup
    "#3": 1, "#4": 3, "#9": 1, "#10": 1, "#16": 4, "#19": 4, "#23": 3, "#52": 1, "#101": 4, "#111": 0,
    "#113": 0, "#115": 2, "#116": 0,
    "GetOpenFileNameA": 1, "GetSaveFileNameA": 1,
    "Direct3DCreate8": 1,
    "CoCreateInstance": 5, "CoInitialize": 1, "CoUninitialize": 0, "CreateStreamOnHGlobal": 3,
}
