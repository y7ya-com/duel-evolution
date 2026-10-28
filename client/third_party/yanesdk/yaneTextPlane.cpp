#include "stdafx.h"

#ifdef USE_DirectDraw

#include "yaneTextPlane.h"

CTextPlane::CTextPlane(void){

	m_nTextX = 0;
	m_nTextY = 0;

	m_bHybrid = true;	//	このプレーンはduplicateしない。

}

LRESULT	CTextPlane::UpdateText(void){
	//	ビットマップを読み込んでいなければマイプレーン生成
	if (!m_bBitmap) {
		int sx,sy;
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
		if (CreateSurface(sx,sy)) return 1;
//		EnableBlendColorKey(true);
	}

	m_bOwnerDraw = true;	//	こいつが呼び出されないことにゃいけない＾＾

	HDC hdc = GetDC();
	if (hdc==NULL) return 1;

	m_Font.OnDraw(hdc,m_nTextX,m_nTextY);

	ReleaseDC();
	return 0;
}

#endif // USE_DirectDraw
