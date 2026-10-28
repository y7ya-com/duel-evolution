#include "loginWindowInline.h"

// @yo2 0x007fdd30 CWindowLogin::onMain: re-layout every frame
bool CWindowLoginView::onMain() {
    relayout();
    return true;
}

// @yo2 0x007fdd80 CWindowLogin vf08: back to the resting depth, re-layout
void CWindowLoginView::resetDepth() {
    depth() = homeDepth();  // (the exe null-checks the cast pointer first; a null window would fault on the call)
    relayout();
}

// @yo2 0x007fdd50 CWindowLogin vf21 (CWindowModelDialogWithBtns): store the button mode, re-layout
void CWindowLoginView::setButtonMode(int32_t m) {
    buttonMode() = m;
    relayout();
}
