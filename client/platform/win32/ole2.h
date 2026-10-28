// The slice of OLE yaneSDK's CGraphicLoader uses: a read-only IStream over memory (ole.cpp).
#pragma once
#include <windows.h>

struct IStream : IUnknown {
    virtual HRESULT Read(void* dst, ULONG n, ULONG* got) = 0;
};
typedef IStream* LPSTREAM;
// A stream over the bytes at hGlobal (any memory: CGraphicLoader passes CFile's buffer), size unknown: the reader
// asks for the size it needs.
HRESULT CreateStreamOnHGlobal(HGLOBAL hGlobal, BOOL deleteOnRelease, LPSTREAM* out);
HRESULT OleInitialize(LPVOID reserved);
void OleUninitialize();
