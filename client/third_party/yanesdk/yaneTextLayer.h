//
//	yaneTextLayer.h :
//

#ifndef __yaneTextLayer_h__
#define __yaneTextLayer_h__

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "yaneFont.h"
#include "yaneLayer.h"

class CTextLayer : public CHDCLayer {
public:
	virtual void	OnDraw(HDC);	// overriden from CHDCLayer

	CFont*	GetFont(void) { return &m_Font; }

protected:
	CFont		m_Font;	//	‚±‚¢‚Â‚Å•`‰æ
};

#endif