#include "stdafx.h"
#include "yaneFastPlaneInfo.h"

// @yo2 0x00525ac0 cg
RECT	CFastPlaneInfo::GetClipRect(LPRECT lpRect){
	RECT r;
	if(lpRect == NULL){
		r = m_rcRect;
	} else {
		r = *lpRect;
	}

	// クリッピングする
	LPRECT lpClip = &m_rcRect;

	if (lpClip->left > r.left)	{ r.left   = lpClip->left;	 }
	if (lpClip->right< r.right) { r.right  = lpClip->right;	 }
	if (lpClip->top	 > r.top)	{ r.top	   = lpClip->top;	 }
	if (lpClip->bottom<r.bottom){ r.bottom = lpClip->bottom; }

	//	invalid rect,but..
	//	if (r.left >= r.right || r.top	>= r.bottom) return 1;

	return r;
}
