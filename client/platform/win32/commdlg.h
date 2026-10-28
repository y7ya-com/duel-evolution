// Common dialogs (comdlg32), as yaneSDK's CFileDialog uses them: there is no file dialog here. GetOpenFileName and
// GetSaveFileName return FALSE with CommDlgExtendedError() == 0, which is what Windows reports when the user
// pressed Cancel, so CFileDialog returns "no file chosen". (win32_nodevice.cpp)
#pragma once
#include "windows.h"

typedef UINT_PTR (CALLBACK* LPOFNHOOKPROC)(HWND, UINT, WPARAM, LPARAM);

typedef struct tagOFNA {
    DWORD lStructSize;
    HWND hwndOwner;
    HINSTANCE hInstance;
    LPCSTR lpstrFilter;
    LPSTR lpstrCustomFilter;
    DWORD nMaxCustFilter, nFilterIndex;
    LPSTR lpstrFile;
    DWORD nMaxFile;
    LPSTR lpstrFileTitle;
    DWORD nMaxFileTitle;
    LPCSTR lpstrInitialDir, lpstrTitle;
    DWORD Flags;
    WORD nFileOffset, nFileExtension;
    LPCSTR lpstrDefExt;
    LPARAM lCustData;
    LPOFNHOOKPROC lpfnHook;
    LPCSTR lpTemplateName;
} OPENFILENAMEA, *LPOPENFILENAMEA;
typedef OPENFILENAMEA OPENFILENAME;
typedef LPOPENFILENAMEA LPOPENFILENAME;

#define OFN_READONLY 0x00000001
#define OFN_OVERWRITEPROMPT 0x00000002
#define OFN_HIDEREADONLY 0x00000004
#define OFN_NOCHANGEDIR 0x00000008
#define OFN_SHOWHELP 0x00000010
#define OFN_ENABLEHOOK 0x00000020
#define OFN_ENABLETEMPLATE 0x00000040
#define OFN_ENABLETEMPLATEHANDLE 0x00000080
#define OFN_NOVALIDATE 0x00000100
#define OFN_ALLOWMULTISELECT 0x00000200
#define OFN_EXTENSIONDIFFERENT 0x00000400
#define OFN_PATHMUSTEXIST 0x00000800
#define OFN_FILEMUSTEXIST 0x00001000
#define OFN_CREATEPROMPT 0x00002000
#define OFN_SHAREAWARE 0x00004000
#define OFN_NOREADONLYRETURN 0x00008000
#define OFN_NOTESTFILECREATE 0x00010000
#define OFN_NONETWORKBUTTON 0x00020000
#define OFN_NOLONGNAMES 0x00040000
#define OFN_EXPLORER 0x00080000
#define OFN_NODEREFERENCELINKS 0x00100000
#define OFN_LONGNAMES 0x00200000
#define OFN_ENABLEINCLUDENOTIFY 0x00400000
#define OFN_ENABLESIZING 0x00800000

BOOL GetOpenFileNameA(LPOPENFILENAMEA ofn);
BOOL GetSaveFileNameA(LPOPENFILENAMEA ofn);
DWORD CommDlgExtendedError();
#define GetOpenFileName GetOpenFileNameA
#define GetSaveFileName GetSaveFileNameA
