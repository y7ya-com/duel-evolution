// DirectDraw Wrapper
//

#include "stdafx.h"

#ifdef USE_DIB32

#include "yaneDirectDraw.h"
#include "yaneAppInitializer.h"
#include "yaneAppManager.h"
#include "yaneWMUSER.h"
#include "yaneDIB32.h"
#include "yaneTimer.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x004490a0 feat
CDIBDraw::CDIBDraw(void) {
	m_nScreenXSize	= 640;
	m_nScreenYSize	= 480;
	m_nScreenColor	= 16;
	m_bFullScr		= false;

	m_nSecondaryOffsetX = 0;
	m_nSecondaryOffsetY = 0;

	{
	RECT rc,rc2;
	::SetRect(&rc,0,0,0,0);
	::SetRect(&rc2,0,0,0,0);
	::AdjustWindowRect(&rc,WS_CAPTION | WS_SYSMENU,true);
	::AdjustWindowRect(&rc2,WS_CAPTION ,false);
	//	フルスクリーン時のメニューサイズを正確に算出するため、メニュー高さを調べる(c)yaneurao'00/12/15
	//	（なんとメニュー高さはＯＳごとに異なる＾＾； ）
	m_nMenu = (rc.bottom-rc.top) - (rc2.bottom-rc2.top);
	}

	m_nBrightness	= 256;

	m_hWnd	= CAppInitializer::GetHWnd();
	CAppManager::Add(this);
	CAppInitializer::Hook(this);		//	フックを開始する

	//	描画ウェイトのために、最小タイムインターバルに設定する
	CTimeBase::timeBeginPeriodMin();
}

// @yo2 0x00449320 vt
CDIBDraw::~CDIBDraw(){
	//	描画ウェイトの最小タイムインターバルを解除する
	CTimeBase::timeEndPeriodMin();

	CAppInitializer::Unhook(this);		//	フックを解除する。
	CAppManager::Del(this);
}


//////////////////////////////////////////////////////////////////////////////
//	ディスプレイモードの設定→変更
//////////////////////////////////////////////////////////////////////////////
//	CDirectDrawからコピペ＾＾；

// @yo2 0x004494f0 review
void CDIBDraw::BeginChangeDisplay(void){
	m_bDirty		= true;

	m_bDisplayChanging = true;
	m_bChangeDisplayMode = false;

#ifdef USE_DIRECTX // 追加
	if (GetDDraw()==NULL) return ;

	// FullScreenModeでFlip用にアタッチしてたら、解放する必要なしだが...
	//	セカンダリ、クリッパ、プライマリの解放

	if (m_bFullScr) {	//	現在、フルスクリーンモードならば、それを戻す必要がある
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_NORMAL)){
			Err.Out("CDirectDraw::BeginChangeDisplayでSetCooperativeLevelに失敗..");
		}
		// ウィンドゥモードにするときは、これを行なう必要あり
		if (GetDDraw()->RestoreDisplayMode()){
			Err.Out("CDirectDraw::BeginChangeDisplayでRestoreDisplayModeに失敗..");
		}
	}
#endif
}

// @yo2 0x00449540 review
void CDIBDraw::TestDisplayMode(int nSX,int nSY,bool bFullScr,int nColor){
	if (!m_bDisplayChanging) return ; // already changing!!

#ifdef USE_DIRECTX	// 追加
	if (GetDDraw()==NULL) return ;

	if (!bFullScr) {
		// Windowモードの指定があるならば仕方がない。
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_NORMAL)){
			Err.Out("CDirectDraw::TestDisplayModeのSetCooperativeLevelにDDSC_NORMALで失敗");
			return ; // これであかんかったらはっきり言ってシャレならんのやけど...
		}
	} else {
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_EXCLUSIVE|DDSCL_FULLSCREEN)!=DD_OK){
			Err.Out("CDirectDraw::TestDisplayModeのSetCooperativeLevelにDDSC_EXCLUSIVEで失敗");
			return ; // 他のアプリ使ってんちゃうん？
		}
		if (GetDDraw()->SetDisplayMode(nSX,nSY,nColor)!=DD_OK){
			Err.Out("CDirectDraw::TestDisplayModeのSetDisplayModeに失敗");
			return ; // 非対応け？
		}
	}
#endif

#ifndef USE_DIRECTX	//	追加
	WARNING(m_bFullScr==true,"フルスクリーンに出来ないよ");
#endif

	// ウインドウモードでかつ変更なしか
	m_bChangeDisplayMode |= (m_bFullScr!=bFullScr) || m_bFullScr;// 追加

	//	画面モードを反映させて...
	m_bFullScr	= bFullScr;

	m_lpSecondary.Add( new CDIB32 );
	if (m_lpSecondary==NULL) {
		Err.Out("CDIBDraw::TestDisplayModeでCreateSecondaryに失敗");
		return ;	//	メモリ足らんのか？＾＾
	}
	m_lpSecondary->UseDIBSection(true); //	GetDCの可能なサーフェース

	//	ここでサイズが要求されるので、ディスプレイモードの変更が完了していること。
	if (m_lpSecondary->CreateSurface(nSX,nSY)){
		//	メモリ足らんのか？＾＾
		Err.Out("CDIBDraw::TestDisplayModeでCreateSecondaryに失敗");
		m_lpSecondary.Delete();
		return ;
	}

	//	ここでウィンドゥモードを反映しておく
	CWindow::ChangeScreen(bFullScr);
	CAppManager::GetMyApp()->GetMyWindow()->ChangeWindowStyle();

	m_bDisplayChanging	= false;	//	画面モードの変更に成功！
	m_nScreenColor	= nColor;
	m_nScreenXSize	= nSX;
	m_nScreenYSize	= nSY;
	return ;
}

// @yo2 0x00449740 feat
LRESULT CDIBDraw::EndChangeDisplay(void){
#ifdef USE_DIRECTX	// 追加
	if (GetDDraw()==NULL) return 1;
#endif

	if (m_bDisplayChanging) { // Changeされていない！！
		Err.Out("CDirectDraw::BeginChangeDisplay～EndChangeDisplayに失敗");
		return 1;
	}

	// ディスプレイモードに変更があれば
	if(m_bChangeDisplayMode) {// 追加
		::Sleep(500);	//	ビデオモードの変更の余波を受ける可能性がある
	}

	//	プレーンのbpp再取得
	CBppManager::Reset();

/*
	// パレットの再構築
	m_bBrightnessChanged = true;
*/

	// 自前で描画するならば関係ないのだが...
	// CAppManager::GetMyApp()->GetMyWindow()->ShowCursor(!m_bFullScr);
	//	↑DIBDrawなので、描画しても良いはずだ．．

	// ウィンドゥサイズの変更
	CAppManager::GetMyApp()->GetMyWindow()->SetSize(m_nScreenXSize,m_nScreenYSize);
	//	↓でChangeWindowStyleでも行なうので、ここでResizeすると二重にやることになる。

	// ウィンドゥスタイルの変更
	CAppManager::GetMyApp()->GetMyWindow()->ChangeScreen(m_bFullScr);
	//	自分の所属ウィンドゥには告知してやる。
	//	（本当は、すべてのウィンドウにブロードキャストする必要がある）
	CAppManager::GetMyApp()->GetMyWindow()->ChangeWindowStyle();

#ifdef USE_DirectDraw
	// プレーンの再構築（もし消失していれば）
	CPlane::RestoreAll();
#endif

	//	DIBの復帰処理
	if (m_lpSecondary!=NULL){
		m_lpSecondary->Resize(m_nScreenXSize,m_nScreenYSize);
	}

	return 0;
}

/////// 使用例:p) ////////////////////////////////////////////////////////////

// @yo2 0x00449800 review
LRESULT CDIBDraw::ChangeDisplay(bool bFullScr){
#ifdef USE_DIRECTX	// 追加
	if (GetDDraw()==NULL) return 1; //	だめだこりゃ...
#endif

	BeginChangeDisplay();
		if (bFullScr) {
			TestDisplayMode(m_nScreenXSize,m_nScreenYSize,true,m_nScreenColor);
		}
		TestDisplayMode(m_nScreenXSize,m_nScreenYSize); // ウィンドゥモード
	if (EndChangeDisplay()) return 2;	//	ディスプレイモード変更に失敗
	return 0;
}

// @yo2 0x00449880 review
LRESULT		CDIBDraw::SetDisplay(bool bFullScr,int nSizeX,int nSizeY,int nColorDepth){
	if (nSizeX!=0) {
		m_nScreenXSize	=	nSizeX;
	}
	if (nSizeY!=0) {
		m_nScreenYSize	=	nSizeY;
	}
	if (nColorDepth!=0) {
		m_nScreenColor	=	nColorDepth;
	} else {
		m_nScreenColor	=	16; // fixed '01/04/08
	}
	ChangeDisplay(bFullScr);
	//	このパラメータだけはじかに渡す
	//	（m_bFullScrは現在の画面モードを保持しているので）
	return 0;
}

// @yo2 0x004498f0 review
void		CDIBDraw::GetDisplay(bool&bFullScr,int &nSizeX,int &nSizeY,int &nColorDepth){
	bFullScr		=	m_bFullScr;
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
	nColorDepth		=	m_nScreenColor;
}

/*
void		CDIBDraw::GetSize(int &nSizeX,int &nSizeY){ // GetDisplayModeのx,yだけ得られる版
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
}
*/
	
// @yo2 0x00449930 cg
bool		CDIBDraw::IsFullScreen(void){
	return		m_bFullScr;
}

// @yo2 0x00449950 review
void	CDIBDraw::SetBrightness(int nBright){
	if (m_nBrightness == nBright) return ;
	m_nBrightness = nBright;
	m_bDirty = true;
}

// @yo2 0x00449980 review
int		CDIBDraw::GetBpp(void){
	// 現在のBppの取得
	return CBppManager::GetBpp();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x004499a0 review
void	CDIBDraw::SetOffset(int ox,int oy){
	//	セカンダリの転送オフセット
	m_nSecondaryOffsetX =	ox;
	m_nSecondaryOffsetY =	oy;
}

// @yo2 0x004499d0 vt
void	CDIBDraw::OnDraw(RECT* lpRect,bool bLayerCallBack){
	if (GetSecondary()==NULL) return ;
	HDC hDCS = GetSecondary()->GetDC();
	if (hDCS == NULL) return ;	// ないやん．．
	
	HDC hdc;
	if (!IsFullScreen()){
		hdc = ::GetDC(m_hWnd);
	} else {
		hdc = ::GetWindowDC(m_hWnd);
	}
	if (hdc == NULL) return ;	// あじゃー＾＾；
/*

れむさんより：('01/08/12)

> GetDC(NULL) としたために WM_PAINT がすべてのウインドウに送られるため、
>			^^^^^^
> GetWindowDC(m_hWnd) とすれば WM_PAINT は送られない…ということだと思います。

*/

	//////////////////////////////////////////////////////////
	//	Layer callback

	if ( bLayerCallBack ){
	//	Layerをセカンダリに描画してもらう＾＾
	m_LayerList.OnDraw(this);

	//	HDCLayerをセカンダリに描画してもらう＾＾
	if (!m_HDCLayerList.IsEmpty()){
		m_HDCLayerList.OnDraw(hDCS);
		Invalidate();	//	書き書きしたんで、汚しフラグ立てる
	}

	//	AfterLayerをセカンダリに描画してもらう＾＾
	m_AfterLayerList.OnDraw(this);
	}
	//////////////////////////////////////////////////////////

	//	プライマリが汚れていなければリターン
	if (!m_bDirty) goto ExitDraw;

	//	ブライトネスに応じて、セカンダリを減衰
	if (m_nBrightness!=256){
		GetSecondary()->FadeEffect(m_nBrightness);
	}
	InnerOnDraw(hdc,hDCS,lpRect);

ExitDraw:;
	if (!IsFullScreen()){
		::ReleaseDC(m_hWnd,hdc);
	} else {
		::ReleaseDC(m_hWnd,hdc);
	}

	m_bDirty = false;
}

// @yo2 0x00449b00 feat
void	CDIBDraw::InnerOnDraw(HDC hDst,HDC hSrc,RECT* lpRect){
	//	最小化されているならば描画せずにリターン
	if (CAppManager::GetMyApp()->GetMyWindow()->IsMinimized()) return ;

	//	MenuのPopup処理
	int nMenu = 0;
	//	FullScrで、メニューありで、マウスが画面上のメニュー領域にさしかかったのならば...
	if (IsFullScreen() && ::GetActiveWindow()==m_hWnd) {
	//						↑さらにメインウインドウがアクティブ(ダイアログなどが呼び出されてない)
		POINT point;
		::GetCursorPos(&point);
		if (point.y<m_nMenu) {
			if (::GetMenu(m_hWnd)!=NULL){
//				↑このメニューサイズを正確に算出するため、メニュー高さを調べる(c)yaneurao'00/12/15
				nMenu = m_nMenu;
				//	Paintしなおすぜー
//				::SetMenu(m_hWnd,GetMenu(m_hWnd));	//	メニュー領域の再描画
				::DrawMenuBar(m_hWnd);
			}
		}
	}


	if (m_nSecondaryOffsetX || m_nSecondaryOffsetY) {
		//	転送先オフセットがかかっているのか？
		RECT r; // source rect
		RECT r2; // distination rect
		if ( lpRect == NULL ){
			::SetRect(&r,0,nMenu,m_nScreenXSize,m_nScreenYSize);
			::SetRect(&r2,0,nMenu,m_nScreenXSize,m_nScreenYSize);	//	同一サイズと仮定して良い
			
			//	a clipping algorithm
			//		between the same size rect (C) yaneurao'1999
			if (m_nSecondaryOffsetX>0) {
				r.right		-= m_nSecondaryOffsetX;
				r2.left		+= m_nSecondaryOffsetX;
			} else {
				r.left		-= m_nSecondaryOffsetX;
				r2.right	+= m_nSecondaryOffsetX;
			}
			if (m_nSecondaryOffsetY>0) {
				r.bottom	-= m_nSecondaryOffsetY;
				r2.top		+= m_nSecondaryOffsetY;
			} else {
				r.top		-= m_nSecondaryOffsetY;
				r2.bottom	+= m_nSecondaryOffsetY;
			}
			
			::BitBlt(hDst,r2.left,r2.top,r.right-r.left,r.bottom-r.top,hSrc,r.left,r.top,SRCCOPY);
			
			
			RECT br;
			// fix '01/04/25 kaine
			int top;
			top = r2.top;
			if ( nMenu && top > 0 ) top = nMenu;
			::SetRect(&br,0,nMenu,m_nScreenXSize,top);					//	上領域	
			//::SetRect(&br,0,nMenu,m_nScreenXSize,r2.top);					//	上領域	
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,0,r2.top,r2.left,r2.bottom);					//	左領域
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,r2.right,r2.top,m_nScreenXSize,r2.bottom);	//	右領域
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,0,r2.bottom,m_nScreenXSize,m_nScreenYSize);	//	下領域
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
		}else{
			// オフセット転送の部分更新なので、ずれた黒背景は描画しない
			r = *lpRect;	// source rest;
			r2 = *lpRect;	// dest	 rest;

			r2.left += m_nSecondaryOffsetX;
			r2.top += m_nSecondaryOffsetY;

			if ( nMenu && nMenu > r2.top ) {
				r.top += - r2.top+nMenu;
				r2.top = nMenu;
			}
				
			::BitBlt(hDst,r2.left,r2.top,r.right-r.left,r.bottom-r.top,hSrc,r.left,r.top,SRCCOPY);
			
		}
		
	} else {
		if ( lpRect == NULL ){
			//	転送先オフセット無しの、普通の転送
			::BitBlt(hDst,0,nMenu,
				m_nScreenXSize,m_nScreenYSize-nMenu,hSrc,0,nMenu,SRCCOPY);
		}else{
			// オフセットなし、矩形有り
			RECT r = *lpRect;
			if ( nMenu > r.top ) r.top = nMenu;
			::BitBlt(hDst,r.left,r.top,r.right-r.left,r.bottom-r.top,hSrc,r.left,r.top,SRCCOPY);
		}
	}
}

//////////////////////////////////////////////////////////////////////////////
//	CPlaneBaseのメンバ関数。全部、委譲＾＾；
// @yo2 0x00449f50 vt
LRESULT CDIBDraw::Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->Blt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x00449f90 vt
LRESULT CDIBDraw::BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BltFast(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x00449fd0 vt
LRESULT CDIBDraw::BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBlt(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a020 vt
LRESULT CDIBDraw::BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBltFast(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a070 vt
LRESULT CDIBDraw::MosaicEffect(int d, LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->MosaicEffect(d,lpRect);
}
// @yo2 0x0044a0a0 vt
LRESULT CDIBDraw::FlushEffect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->FlushEffect(lpRect);
}
// @yo2 0x0044a0d0 vt
void	CDIBDraw::GetSize(int &x,int &y) {
	static_cast<CPlaneBase*>(GetSecondary())->GetSize(x,y);
}
// @yo2 0x0044a100 vt
LRESULT CDIBDraw::ClearRect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->ClearRect(lpRect);
}
// @yo2 0x0044a130 vt
LRESULT CDIBDraw::Load(string szBitmapFileName,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->Load(szBitmapFileName,bLoadPalette);
}
// @yo2 0x0044a220 vt
LRESULT CDIBDraw::LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->LoadW(
		szBitmapFileName256,szBitmapFileNameElse,bLoadPalette);
}
// @yo2 0x0044a340 vt
LRESULT CDIBDraw::Release(void){
	return static_cast<CPlaneBase*>(GetSecondary())->Release();
}
// @yo2 0x0044a360 vt
LRESULT CDIBDraw::SetColorKey(int x,int y){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(x,y);
}
// @yo2 0x0044a390 vt
LRESULT CDIBDraw::SetColorKey(int r,int g,int b){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(r,g,b);
}

// @yo2 0x0044a3c0 vt
bool CDIBDraw::IsLoaded(void) const {
	//	GetSecondary()では、const性が失われるので…
	return m_lpSecondary->IsLoaded();
}

// @yo2 0x0044a3e0 review
LRESULT CDIBDraw::BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a420 review
LRESULT CDIBDraw::BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltFastClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a460 vt
LRESULT CDIBDraw::BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a4a0 vt
LRESULT CDIBDraw::BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlpha(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a4f0 vt
LRESULT CDIBDraw::FadeBltAlpha(CPlaneBase* lpDIBSrc32,int x,int y,int nFadeRate){
	return ((CPlaneBase*)GetSecondary())->FadeBltAlpha(lpDIBSrc32,x,y,nFadeRate);
}

// @yo2 0x0044a530 review
LRESULT CDIBDraw::BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a570 review
LRESULT CDIBDraw::BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltFastClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a5b0 review
LRESULT CDIBDraw::BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a5f0 review
LRESULT CDIBDraw::BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlphaM(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}

// @yo2 0x0044a640 review
void	CDIBDraw::BltFix(CSprite*lpSprite,int x,int y,LPRECT lpClip){
	m_bDirty = true;

	//	有効か？
	if (!lpSprite->IsEnable()) return ;

	//	CDirectDrawで描画する場合Layer無視
	SSprite* lpSS = lpSprite->GetSSprite();

	int ox,oy;
	lpSprite->GetOffset(ox,oy);
	ox+=x+lpSS->nOx;
	oy+=y+lpSS->nOy;

	//	そのまま委譲してまうとすっか～
	if (!lpSS->bFast) {
		static_cast<CPlaneBase*>(GetSecondary())->Blt(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	} else {
		static_cast<CPlaneBase*>(GetSecondary())->BltFast(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	}
}

// @yo2 0x0044a700 review
void	CDIBDraw::BltOnce(CSprite*lpSprite,int x,int y,LPRECT lpClip){
	BltFix(lpSprite,x,y,lpClip);
	
	//	ケツになっていたら、それ以上は加算しない
	int n=lpSprite->GetMotion();
	lpSprite->IncMotion();
	if (lpSprite->GetMotion()==0) {
		lpSprite->SetMotion(n);
	}
}

// @yo2 0x0044a750 review
LRESULT CDIBDraw::Clear(DWORD dwDIB32RGB,LPRECT lpRect){
	return GetSecondary()->Clear(dwDIB32RGB,lpRect);
}

// @yo2 0x0044a780 vt
LRESULT CDIBDraw::BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltNatural(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
// @yo2 0x0044a7c0 vt
LRESULT CDIBDraw::BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,int nFade,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltNatural(lpDIBSrc32,x,y,nFade,lpSrcRect,lpDstSize,lpClipRect);
}

// @yo2 0x0044a810 feat
LRESULT CDIBDraw::RealizePalette(void){
	HDC hdc = ::GetDC(NULL);	//	プライマリ取得して、そのパレットを設定
	if (hdc==NULL) return 1;
	LRESULT lr=0;
	if (m_Palette.Set(hdc)) lr=2;
	::ReleaseDC(NULL,hdc);
	return lr;
}

// @yo2 0x0044a860 feat
int		CDIBDraw::GetMenuHeight(void){
//	メニューがついているならば、そのメニュー高さを返す
//	（ついていなければ０）
	if (::GetMenu(m_hWnd)!=NULL) return m_nMenu;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0044a890 vt
LRESULT CDIBDraw::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){

	switch(uMsg){
	case WM_PAINT : {
		//	dirty rectが発生
		//	フルスクリーンで発生したWM_PAINTはどこかおかしい＾＾；
		/*
		↑'00/11/28 メッセージボックス表示してると発生するか…
			しかし、ウィンドゥをスクリーン座標の(0,0)から描画しているので、
			BeginPaint～EndPaintでは正しく表示されない。
			SetWindowPosで、クライアント座標(0,0)がスクリーン座標の(0,0)に
			来るように指定しておく手はあるが、そうすると今度はメニューバーを
			自前で描画しなくてはならなくなる。また、BeginPaint～EndPaintのhWndに
			NULLを渡そうとしても、前面にウィンドゥがいるのでバックグラウンドを
			いくら更新しても無効。

			そして、GetDC(NULL)しようにも、WM_PAINTの処理中にはGetDCは使えない。
			GetDCで取得したデバイスコンテキストに描画するとWM_PAINTが発生するから>
			WM_PAINTの処理中にWM_PAINTが発生するんで、アプリケーションはWM_PAINTの
			処理しかできなくなる！

			現実的な解決策としては、メニューウィンドゥを自前で描画することを前提に、
			以下にある if (IsFullScreen()) return 0;の行を外し、
			ウィンドゥ生成時にクライアント座標(0,0)がスクリーン座標の(0,0)に
			来るように移動させ、InnerOnDrawでは、フルスクリーンメニュー描画の処理を
			行なわないようにすること。それが嫌ならば、ダイアログボックスを自前で
			描画すること＾＾；

			前者の場合に徹するならば、ウィンドゥハンドルは不要ということになるので、
			あまり一般的ではないが、フルスクリーン時は、ウィンドゥを作らずに
			済ませることは出来る。

			いちばん消極的な回避手段としては、フルスクリーン時のメッセージボックス
			には「移動できない」スタイルを指定しておくことである。

		*/
		m_bDirty = true;	//	これ倒しておかないと再描画されない
//		if (IsFullScreen()) return 0;

		if (GetSecondary()==NULL) return 0;
		HDC hDCS = GetSecondary()->GetDC();
		if (hDCS == NULL) return 0; // ないやん．．
		PAINTSTRUCT paintstruct;
		HDC hdc;
		if(IsFullScreen()) {// フルスクリーンなら GetWindowDC 取得
			// これで動く(謎)
			// GetWindowDC では WM_PAINT は飛んでこない？
			hdc = ::GetWindowDC(m_hWnd);
		} else {
			hdc = ::BeginPaint(m_hWnd,&paintstruct);
		}
		InnerOnDraw(hdc,hDCS);
		if(IsFullScreen()) {
			// これで動く(謎)
			::ReleaseDC(m_hWnd,hdc);
		} else {
			::EndPaint(m_hWnd,&paintstruct);
		}
		return 0;	//	DefWindowProcを呼び出しに行く。
		//	これを呼び出しておかないと再度WM_PAINTが送られてくる
					}

	case WM_ACTIVATEAPP: {
		UINT bActive = wParam;
		if(bActive) {
			//	メッセージポンプ側ではなく、ワーカースレッド側でリストアすべき...
			//	m_bLostSurface = true;
		}
		return 0;
						 }

	} // end switch

	return 0;
}

#endif // USE_DIB32
