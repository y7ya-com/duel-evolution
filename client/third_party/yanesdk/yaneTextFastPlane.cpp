#include "stdafx.h"

#ifdef USE_FastDraw

#include "yaneTextFastPlane.h"
#include "yaneTextDIB32.h"

// @yo2 0x0057e500 review
CTextFastPlane::CTextFastPlane(){
	m_nTextX = 0;
	m_nTextY = 0;
	m_nUpdateType = 0;
	m_bVertical = false;
}

// @yo2 0x0057e640 vt
LRESULT	CTextFastPlane::OnDraw(){
	//	リストア用関数
	switch (m_nUpdateType){
	case 1: return UpdateText();
	case 2: return UpdateTextA();
	case 3: return UpdateTextAA();
	}
	return 0;
}

// @yo2 0x0057e680 review
LRESULT	CTextFastPlane::UpdateText(){
	int sx,sy;
	if (!IsLoaded()) {	//	ビットマップ読み込んでないならば．．．
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
		if (IsVertical()) {	// 縦書き
			swap(sx, sy);	// 逆になる
		}
		if (CreateSurface(sx,sy,false)) return 1;
	}
	CTextDIB32 dib;
	*dib.GetFont() = m_Font;
	dib.SetTextPos(m_nTextX,m_nTextY);
	dib.SetVertical(IsVertical());	// 縦書きかどうかを設定
	dib.UpdateText();
	Blt(&dib,0,0);
	m_nUpdateType = 1;

	return 0;
}

// @yo2 0x0057e900 review
LRESULT	CTextFastPlane::UpdateTextA(){	//	アンチェリ付き描画
	int sx,sy;
	if (!IsLoaded()) {	//	ビットマップ読み込んでないならば．．．
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
		if (IsVertical()) {	// 縦書き
			swap(sx, sy);	// 逆になる
		}
		if (CreateSurface(sx,sy,true)) return 1;
	}
	CTextDIB32 dib;
	*dib.GetFont() = m_Font;
	dib.SetTextPos(m_nTextX,m_nTextY);
	dib.SetVertical(IsVertical());	// 縦書きかどうかを設定
	dib.UpdateTextA();
	Blt(&dib,0,0);
	m_nUpdateType = 2;

	return 0;
}

//	↑上のコピペした＾＾；
// @yo2 0x0057eb80 review
LRESULT	CTextFastPlane::UpdateTextAA(){	//	アンチェリ付き描画
	int sx,sy;
	if (!IsLoaded()) {	//	ビットマップ読み込んでないならば．．．
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
		if (IsVertical()) {	// 縦書き
			swap(sx, sy);	// 逆になる
		}
		if (CreateSurface(sx,sy,true)) return 1;
	}
	CTextDIB32 dib;
	*dib.GetFont() = m_Font;
	dib.SetTextPos(m_nTextX,m_nTextY);
	dib.SetVertical(IsVertical());	// 縦書きかどうかを設定
	dib.UpdateTextAA();
	Blt(&dib,0,0);
	m_nUpdateType = 3;

	return 0;
}

#endif
