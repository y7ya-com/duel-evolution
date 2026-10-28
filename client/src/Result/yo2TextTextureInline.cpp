// An inline CD3DTextTexture setter that MSVC emitted into yo2ResultWindow.cpp. Kept in a file of its own (no other
// dependencies) so the difftest (harness/hooks/result.cpp) can link it without the window framework.
#include "yo2UiStandIns.h"

// @yo2 0x008c8a00 CD3DTextTexture::setFont (inline): the next render uses this LOGFONT size
void CD3DTextTextureView::setFont(int32_t width, int32_t height) {
    fontWidth_ = width;
    fontHeight_ = height;
    outlineDirty_ = true;
    if (curWidth_ != width || curHeight_ != height)
        dirty_ = true;
}
