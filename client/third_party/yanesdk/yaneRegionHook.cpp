//
//	yaneRegion.cpp
//
#include	"stdafx.h"

#include	"yaneRegion.h"
#include	"yaneRegionHook.h"
#include	"yaneAppInitializer.h"
#include	"yaneAppManager.h"

// @yo2 0x005583e0 review
CRegionHook::CRegionHook(){
	m_bDrag	= false;
	m_hRgn	= NULL;
	CAppInitializer::Hook(this);
}
// @yo2 0x00558460 review
CRegionHook::CRegionHook(CPlaneBase *lp){
	m_bDrag	= false;
	m_hRgn	= NULL;
	CAppInitializer::Hook(this);
	Set(lp);// リージョン設定
}
// @yo2 0x005584a0 vt
CRegionHook::~CRegionHook(){
	Release();
	CAppInitializer::Unhook(this);
}

// @yo2 0x005584d0 vt
LRESULT	CRegionHook::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){
	switch (uMsg){
	/*
	case WM_CREATE : {
		InnerSetRegion();
		break;
					}
	*/
	case WM_LBUTTONDOWN : {	//	左ボタンでのドラッグ＆ドロップ
		int x,y;
		x = LOWORD(lParam); y = HIWORD(lParam);
		m_ptDrag.x = x; m_ptDrag.y = y;
		//	この座標をドラッグするのかは、仮想関数を呼び出して判定する
		if (!m_bDrag && MustBeDrag(m_ptDrag)) {
			m_bDrag = true;
			::SetCapture(hWnd);	//	キャプチャ開始！
		}
		break;
						  }
	case WM_LBUTTONUP	: { // ドラッグの終了
		if (!m_bDrag) break;
		m_bDrag = false;
		::ReleaseCapture();	//	フォーカスを解放
		break;
						  }
	case WM_CAPTURECHANGED : {
		if (m_bDrag) m_bDrag = false;	//	オレ様のフォーカス奪うなよー＾＾；
		break;
							 }
	case WM_MOUSEMOVE :{
		if (!m_bDrag) break;
		int x,y;
		x = (signed short)LOWORD(lParam); y = (signed short)HIWORD(lParam);
		//	ウィンドゥ外、すなわち、負数もありうるので
		//	キャストして16ビット符号付き整数にするのが正しい
		//	（MAKEPOINTSマクロを使っても良い）
		POINT pt;
		pt.x = x-m_ptDrag.x; pt.y = y-m_ptDrag.y;
		::ClientToScreen(hWnd,&pt);
		::SetWindowPos(hWnd,0,pt.x,pt.y,0,0,SWP_NOZORDER|SWP_NOSIZE);
		break;
					   }

	}
	return 0;
}

//	bmp読み込み後のCPlaneBase*を渡して、そのサーフェースに設定されている
//	colorkey(ヌキ色)の部分を抜いたリージョンを作成。
// @yo2 0x00558650 review
LRESULT CRegionHook::Set(CPlaneBase* lpPlane) {
	CRegion rgn;// テンポラリリージョン
	if(rgn.Set(lpPlane)!=0)return 1;// リージョンの作成

	InnerSetRegion(rgn.GetHRGN());// リージョンをウインドウに関連付け
	return 0;
}

// リージョン直接設定
// @yo2 0x00558720 review
LRESULT CRegionHook::Set(const CRegion &rgn) {
	InnerSetRegion(const_cast<CRegion*>(&rgn)->GetHRGN());// リージョンをウインドウに関連付け
	return 0;
}

//	bmpファイルを読み込んで、そのdwRGBの色を抜いたリージョンを作成。
// @yo2 0x00558750 review
LRESULT	CRegionHook::Load(const string szFileName,int r,int g,int b) {
	CRegion rgn;// テンポラリリージョン
	if(rgn.Load(szFileName,r,g,b)!=0)return 1;// リージョンを読み込み
	InnerSetRegion(rgn.GetHRGN());// リージョンをウインドウに関連付け
	return 0;
}

//	bmpファイルを読み込んで、その(nPosX,nPosY)の座標の色を抜いたリージョンを作成。
// @yo2 0x005588d0 review
LRESULT	CRegionHook::Load(const string szFileName,int nPosX,int nPosY) {
	CRegion rgn;// テンポラリリージョン
	if(rgn.Load(szFileName,nPosX,nPosY)!=0)return 1;// リージョンを読み込み
	InnerSetRegion(rgn.GetHRGN());// リージョンをウインドウに関連付け
	return 0;
}

//	リージョン解放
// @yo2 0x00558a50 feat
void	CRegionHook::Release(void) {
	// リージョンのデタッチ
	::SetWindowRgn(CAppInitializer::GetHWnd(),NULL,true);
	::DeleteObject(m_hRgn);// リージョン解放
	m_hRgn = NULL;
}

// リージョンをウインドウに関連付け
// @yo2 0x00558a90 feat
void	CRegionHook::InnerSetRegion(HRGN hRGN) {
	HRGN hRgn = ::CreateRectRgn(0,0,0,0);// 空のリージョン作成
	::CombineRgn(hRgn,hRGN,NULL,RGN_COPY);// リージョンをコピー

	::SetWindowRgn(CAppInitializer::GetHWnd(),hRgn,true);// ウインドウに関連付け

	::DeleteObject(m_hRgn);// 一つ前のリージョン解放
	m_hRgn = hRgn;// 現在のリージョン保持
}
