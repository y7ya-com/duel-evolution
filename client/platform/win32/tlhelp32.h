// Process snapshots (CFindWindow's "is another copy running" check): none here, so the check always passes.
#pragma once
#include "windows.h"

#define TH32CS_SNAPPROCESS 0x00000002
typedef struct tagPROCESSENTRY32 {
    DWORD dwSize, cntUsage, th32ProcessID;
    ULONG_PTR th32DefaultHeapID;
    DWORD th32ModuleID, cntThreads, th32ParentProcessID;
    LONG pcPriClassBase;
    DWORD dwFlags;
    CHAR szExeFile[MAX_PATH];
} PROCESSENTRY32, *LPPROCESSENTRY32;
inline HANDLE CreateToolhelp32Snapshot(DWORD, DWORD) { return INVALID_HANDLE_VALUE; }
inline BOOL Process32First(HANDLE, LPPROCESSENTRY32) { return FALSE; }
inline BOOL Process32Next(HANDLE, LPPROCESSENTRY32) { return FALSE; }
