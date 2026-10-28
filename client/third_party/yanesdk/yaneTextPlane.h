//
//	yaneTextPlane.h :
//
#ifdef USE_DirectDraw

#ifndef __yaneTextPlane_h__
#define __yaneTextPlane_h__

#include "yaneFont.h"
#include "yanePlane.h"

class CTextPlane : public CPlane {
public:

	CFont*	GetFont(void) { return &m_Font; }
	LRESULT	UpdateText(void);
	void	SetTextPos(int x,int y){ m_nTextX=x; m_nTextY=y; }

	CTextPlane(void);

protected:
	CFont		m_Font;				//	こいつで描画
	int			m_nTextX,m_nTextY;	//	テキスト描画位置
	virtual LRESULT OnDraw(void){ return UpdateText(); }
};

#endif

#endif // USE_DirectDraw
