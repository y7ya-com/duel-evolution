//	yaneFPSLayer.h :
//
//		FPS displaying
//

#ifndef __yaneFPSLayer_h__
#define __yaneFPSLayer_h__

#include "yaneLayer.h"
#include "yaneFont.h"
#include "yaneFPSTimer.h"

class CFPSLayer : public CHDCLayer {
public:
	virtual void	OnDraw(HDC hdc);

	void SetSkipFrameDraw(bool b) { m_bSkipFrameDraw = b; }

	CFPSLayer(CFPSTimer*);
	virtual ~CFPSLayer();

protected:
	CFont		m_Font;	//	こいつで描画
	CFPSTimer*	m_lpFpsTime;
	bool		m_bSkipFrameDraw;	//	スキップフレーム数を描画するのか(*false)
};

#endif