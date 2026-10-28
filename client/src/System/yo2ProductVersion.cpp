// Apart from yo2Debug.cpp so a link that only needs the debug helpers needn't supply the version seam.
#include "yo2Debug.h"

// @yo2 0x0060cba0 the exe's product version
const char* yo2ProductVersion() {
    static char version[0x100];
    if (!yo2ExeProductVersion("yo2.exe", "\\StringFileInfo\\041104b0\\ProductVersion", version, sizeof version))
        version[0] = 0;
    return version;
}
