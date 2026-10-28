#include "stdafx.h"
#include "yaneMouseLayer.h"
#include "yanePlaneBase.h"
#include "yaneAppManager.h"
#include "yaneAppInitializer.h"

// @yo2 0x00542a10 manual
CMouseLayer::CMouseLayer(smart_ptr<CPlaneBase> v,int x,int y){
	SetPlane(v,x,y);
	m_hWnd	=	CAppInitializer::GetHWnd();
	//--- 追加 '02/02/01  by ENRA ---
	memset(&m_LastDrawRect, 0, sizeof(m_LastDrawRect));
	//-------------------------------
}

// @yo2 0x00542b70 manual
void CMouseLayer::SetPlane(smart_ptr<CPlaneBase> v,int x,int y){
	m_bEnable = false;
	m_bShow	  = true;
	Enable(true);
	m_vPlane = v;
	m_nX = x;
	m_nY = y;
	//--- 追加 '02/02/01  by ENRA ---
	m_vPlane->GetSize(m_nWidth, m_nHeight);
	//-------------------------------
}

// @yo2 0x00542ca0 review
CMouseLayer::CMouseLayer(void){
	m_bEnable = false;
	m_bShow	  = true;
	m_nX = 0;
	m_nY = 0;
	m_hWnd	=	CAppInitializer::GetHWnd();
	//--- 追加 '02/02/01  by ENRA ---
	memset(&m_LastDrawRect, 0, sizeof(m_LastDrawRect));
	m_nWidth = 0;
	m_nHeight = 0;
	//-------------------------------
}

// @yo2 0x00542d60 vt
CMouseLayer::~CMouseLayer() {
	Enable(false);
}

// @yo2 0x00542e40 cg
void	CMouseLayer::Enable(bool bEnable){
	if (m_bEnable == bEnable) return ;
	m_bEnable = bEnable;
	InnerShowCursor(!bEnable);
}

// @yo2 0x00542e70 cg
void	CMouseLayer::InnerShowCursor(bool bShow){
	if (m_bShow==bShow) return ;
	m_bShow = bShow;
	CAppManager::GetMyApp()->GetMyWindow()->UseMouseLayer(!bShow);
}

// @yo2 0x00542eb0 vt
void CMouseLayer::InnerOnDraw(CPlaneBase* lpDraw){

	if (!m_bEnable) return ;

	//	CMouseをインストールする手はあるが、
	//	マウス座標を得るだけなので、そこまでする価値は無い

	// ソフトウェアによるカーソル表示（サンプル）
	POINT point,point2 = { 0,0 };
	::GetCursorPos(&point);

	if (!CAppInitializer::IsFullScreen()){
		::ClientToScreen(m_hWnd,&point2);
		if (point.y - point2.y <0){
			InnerShowCursor(true);
			return ;
		} else {
			if (::GetActiveWindow()==m_hWnd) {
		//						↑さらにメインウインドウがアクティブ(ダイアログなどが呼び出されてない)
				InnerShowCursor(false);
			} else {
				InnerShowCursor(true);
				return ;
			}
		}
	} else {
		//	フルスクリーン時にmenu表示してんのか？
		POINT point;
		::GetCursorPos(&point);
		//	この定数わからん。
		int nMenu=0;
#ifdef USE_DIB32
		CDIBDraw* lpDIBDraw = CAppManager::GetMyDIBDraw();
		//	DIBDrawならばメニューを出しているかも＾＾；
		if (lpDIBDraw!=NULL) {
			nMenu = lpDIBDraw->GetMenuHeight();
		}
#endif
#ifdef USE_FastDraw
		CFastDraw* lpFastDraw = CAppManager::GetMyFastDraw();
		//	FastDrawならばメニューを出しているかも＾＾；
		if (lpFastDraw!=NULL) {
			nMenu = lpFastDraw->GetMenuHeight();
		}
#endif
#if (defined(USE_DIB32) || defined(USE_FastDraw))
		int y = point.y; // yが0未満の可能性を排除
		if (y>=0 && y<nMenu) {
			InnerShowCursor(true);
			return ;
		} else {
			InnerShowCursor(false);
		}
#else
		InnerShowCursor(false);
#endif
	}

	//--- 追加 '02/02/01  by ENRA ---
	// DirtyRect対策^^;
	m_LastDrawRect.left = point.x - point2.x - m_nX;
	m_LastDrawRect.top = point.y - point2.y - m_nY;
	m_LastDrawRect.right = m_LastDrawRect.left + m_nWidth;
	m_LastDrawRect.bottom = m_LastDrawRect.top + m_nHeight;
	//-------------------------------
	lpDraw->BltNatural(m_vPlane, m_LastDrawRect.left, m_LastDrawRect.top);
}
