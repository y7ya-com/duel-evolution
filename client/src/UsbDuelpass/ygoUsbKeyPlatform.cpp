// Off Windows there is no MagicKey.dll: an NT-like OS with no stick in. (Windows: harness/hooks/usbduelpass.cpp.)
#include "ygoUsbKey.h"

#if !defined(_WIN32)
OsVersion osVersion() { return {2, 5}; }
int32_t magicKeyGetDuelPassCode(char*, int32_t) { return -1; }
#endif
