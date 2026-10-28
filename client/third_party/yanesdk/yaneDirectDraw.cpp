// DirectDraw Wrapper
//

#include "stdafx.h"
#include "yaneDirectDraw.h"
#include "yaneCOMBase.h"	// COMの利用のため
#include "yaneAppInitializer.h"
#include "yaneAppManager.h"
#include "yaneWMUSER.h"
#include "yanePlane.h"
#include "yaneDIB32.h"
#include "yaneWindow.h"
#include "yaneTimer.h"

//////////////////////////////////////////////////////////////////////////////
//	CDirectDrawBase : DIRECTDRAWインターフェースを用意する
//////////////////////////////////////////////////////////////////////////////

#if defined(USE_DirectDraw) || defined(USE_FastDraw) || defined(USE_DIB32)

////	singletonバージョン

int				CDirectDrawBase::m_nRef = 0;
LPDIRECTDRAW	CDirectDrawBase::m_lpDirectDraw = NULL;

// @yo2 0x0044c9d0 cg
CDirectDrawBase::CDirectDrawBase(bool bEmulationOnly){
	if (m_nRef++ == 0) {
		if (CCOMBase::AddRef()) { // COM使うでー
			//	これ失敗するんかー？もーおっちゃん知らんわ＾＾
			m_lpDirectDraw = NULL;
		} else {
			Initialize(bEmulationOnly);
		}
	}
}

// @yo2 0x0044ca70 vt
CDirectDrawBase::~CDirectDrawBase(){
	if (--m_nRef == 0){
		Terminate(); // 不埒な若者のために一応、終了処理:p
		CCOMBase::Release(); // COM使い終わったでー
	}
}

// @yo2 0x0044caa0 feat
LRESULT CDirectDrawBase::Initialize(bool bEmulationOnly){
	// COM的呼出し
	if (::CoCreateInstance(CLSID_DirectDraw,
			NULL, CLSCTX_ALL, IID_IDirectDraw, (LPVOID*)&m_lpDirectDraw)!=DD_OK){
		Err.Out("CDirectDrawBase::InitializeでCoCreateInstanceに失敗");
		m_lpDirectDraw = NULL;
		return 1;
	}

	if (bEmulationOnly) {
		if (m_lpDirectDraw->Initialize((GUID*)DDCREATE_EMULATIONONLY)!=DD_OK) {
			//--- 修正 '02/04/26  by KAIZA ---
			//	一応、HAL初期化をトライする
			if (m_lpDirectDraw->Initialize(NULL)!=DD_OK) {
				Err.Out("CDirectDrawBase::InitializeでHAL初期化に失敗");
				m_lpDirectDraw = NULL;
				return 1;
			}
			//--------------------------------
		}
	} else {
		if (m_lpDirectDraw->Initialize(NULL)!=DD_OK) {
			//--- 修正 '02/04/26  by KAIZA ---
			Err.Out("CDirectDrawBase::InitializeでHAL初期化に失敗");
			//--------------------------------
			m_lpDirectDraw = NULL;
			return 1;
		}
	}
	return 0;
}

// @yo2 0x0044cb30 cg
LRESULT CDirectDrawBase::Terminate(void){
	RELEASE_SAFE(m_lpDirectDraw);
	return 0;
}

////	こちらは非singletonバージョン
//	（各IDirectDrawごとにプライマリサーフェースを一つしか作れないので
//		こんなことをしないといけなくなる）

// @yo2 0x0044cb60 cg
CDirectDrawBaseM::CDirectDrawBaseM(bool bEmulationOnly){
	if (CCOMBase::AddRef()) { // COM使うでー
			//	これ失敗するんかー？もーおっちゃん知らんわ＾＾
		m_lpDirectDraw = NULL;
	} else {
		Initialize(bEmulationOnly);
	}
}

// @yo2 0x0044cbe0 vt
CDirectDrawBaseM::~CDirectDrawBaseM(){
	Terminate(); // 不埒な若者のために一応、終了処理:p
	CCOMBase::Release(); // COM使い終わったでー
}

// @yo2 0x0044cc00 feat
LRESULT CDirectDrawBaseM::Initialize(bool bEmulationOnly){
	// COM的呼出し
	if (::CoCreateInstance(CLSID_DirectDraw,
			NULL, CLSCTX_ALL, IID_IDirectDraw, (LPVOID*)&m_lpDirectDraw)!=DD_OK){
		Err.Out("CDirectDrawBaseM::InitializeでCoCreateInstanceに失敗");
		m_lpDirectDraw = NULL;
		return 1;
	}

	if (bEmulationOnly) {
		if (m_lpDirectDraw->Initialize((GUID*)DDCREATE_EMULATIONONLY)!=DD_OK) {
			//--- 修正 '02/04/26  by KAIZA ---
			//	一応、HAL初期化をトライする
			if (m_lpDirectDraw->Initialize(NULL)!=DD_OK) {
				Err.Out("CDirectDrawBaseM::InitializeでHAL初期化に失敗");
				m_lpDirectDraw = NULL;
				return 1;
			}
			//--------------------------------
		}
	} else {
		if (m_lpDirectDraw->Initialize(NULL)!=DD_OK) {
			//--- 修正 '02/04/26  by KAIZA ---
			Err.Out("CDirectDrawBaseM::InitializeでHAL初期化に失敗");
			//--------------------------------
			m_lpDirectDraw = NULL;
			return 1;
		}
	}
	return 0;
}

// @yo2 0x0044cc80 cg
LRESULT CDirectDrawBaseM::Terminate(void){
	RELEASE_SAFE(m_lpDirectDraw);
	return 0;
}


#endif // DirectDrawBase

//////////////////////////////////////////////////////////////////////////////
//	CBppManager これは、汎用なので#ifdef～endifは不要

int CBppManager::m_nBpp = -1;
// @yo2 0x0044ccb0 cg
int CBppManager::GetBpp() {
	if (m_nBpp==-1) Reset();
	return m_nBpp;
}
// @yo2 0x0044cce0 feat
void CBppManager::Reset() {
	//	解像度変更をした場合は、この関数を呼び出す

	HDC		hdc;
	hdc = ::GetDC(NULL);

	m_nBpp = ::GetDeviceCaps(hdc, PLANES) * GetDeviceCaps(hdc, BITSPIXEL);
	if (m_nBpp==0){
		WARNING(true,"CPlane::InnerGetBppでBppがゼロ...");
		::Sleep(1000);	//	ビデオカード変更の余波を受けているのか？
		m_nBpp = ::GetDeviceCaps(hdc, PLANES) * GetDeviceCaps(hdc, BITSPIXEL);
	}

	::ReleaseDC(NULL, hdc);
}

//////////////////////////////////////////////////////////////////////////////
//	CDirectDrawSurfaceManager
//	ピクセルフォーマット調べるねん！
#if defined(USE_DirectDraw) || defined(USE_FastDraw)

// @yo2 0x0044cd60 tight
int CDirectDrawSurfaceManager::GetSurfaceType(){
	return m_nType;
}

// @yo2 0x0044cd80 cg
void CDirectDrawSurfaceManager::OnChangeSurface(LPDIRECTDRAWSURFACE pSurface){
	m_nType = GetSurfaceType(pSurface);
}

// @yo2 0x0044cdb0 review
int CDirectDrawSurfaceManager::GetSurfaceType(LPDIRECTDRAWSURFACE pSurface){
	//	↑画面のbppが変わったときは、この関数呼び出してね！
	if (pSurface==NULL) return -1;

	DDSURFACEDESC dddesc = { sizeof(dddesc) };
	//--- 修正 '02/03/19  by ENRA ---
//*
	// PixelFormatを得るのに、Lockする必要はないし、Millenium G400/450などは
	// PrimaryをLockすることができない。
	dddesc.ddsCaps.dwCaps = DDSD_PIXELFORMAT;
	if(DD_OK!=pSurface->GetSurfaceDesc( &dddesc )){
		Err.Out("CDirectDrawSurfaceManager::GetSurfaceTypeでGetSurfaceDescに失敗");
		return 1;	//	特定に失敗
	}
/*/
	LRESULT hres;
	while ((hres = pSurface->Lock(NULL, &dddesc, 0, NULL)) == DDERR_WASSTILLDRAWING) ;
	if (hres !=DD_OK){
		::Sleep(2000);	//	ビデオカード変更の余波を受けているのか？
		while ((hres = pSurface->Lock(NULL, &dddesc, 0, NULL)) == DDERR_WASSTILLDRAWING) ;
		if (hres !=DD_OK){
			Err.Out("CDirectDrawSurfaceManager::SurfaceのLockに失敗");
			return 1;	//	特定に失敗
		}
	}
//*/
	//-------------------------------
	int nBpp = dddesc.ddpfPixelFormat.dwRGBBitCount;
	DWORD	RMask = dddesc.ddpfPixelFormat.dwRBitMask;
	DWORD	GMask = dddesc.ddpfPixelFormat.dwGBitMask;
	DWORD	BMask = dddesc.ddpfPixelFormat.dwBBitMask;

	int nType;
	switch (nBpp){
	case 8:
		nType = 2;	//	8bpp
		break;
	case 16:
		if		(RMask == 0xf800 && GMask == 0x07e0 && BMask == 0x001f) {
			nType = 3;	// RGB565
		} ef	(RMask == 0x7c00 && GMask == 0x03e0 && BMask == 0x001f) {
			nType = 4;	// RGB555
		} else {
			Err.Out("CDirectDrawSurfaceManager::16bppの不明ピクセルフォーマット検出");
			Err.Out("BMask=0x%x BMask=0x%x BMask=0x%x",RMask,GMask,BMask);
			nType = 1;	//	16bppの不明ピクセルフォーマット．．
		}
		break;
	case 24:
		if		(RMask == 0xff0000 && GMask == 0xff00 && BMask == 0xff) {
			nType = 5;	// RGB888
		}	ef	(RMask == 0xff	   && GMask == 0xff00 && BMask == 0xff0000) {
			nType = 6;	// BGR888
		} else {
			Err.Out("CDirectDrawSurfaceManager::24bppの不明ピクセルフォーマット検出");
			Err.Out("BMask=0x%x BMask=0x%x BMask=0x%x",RMask,GMask,BMask);
			nType = 1;	//	24bppの不明ピクセルフォーマット．．
		}
		break;
	case 32:
		if		(RMask == 0xff0000 && GMask == 0xff00 && BMask == 0xff) {
			nType = 7;	// XRGB888
		}	ef	(RMask == 0xff	   && GMask == 0xff00 && BMask == 0xff0000) {
			nType = 8;	// XBGR888
		} else {
			Err.Out("CDirectDrawSurfaceManager::32bppの不明ピクセルフォーマット検出");
			Err.Out("BMask=0x%x BMask=0x%x BMask=0x%x",RMask,GMask,BMask);
			nType = 1;	//	32bppの不明ピクセルフォーマット．．
		}
		break;
	default:
		Err.Out("CDirectDrawSurfaceManager::bpp不明のピクセルフォーマット検出");
		Err.Out("nBpp=%d BMask=0x%x BMask=0x%x BMask=0x%x",nBpp,RMask,GMask,BMask);
		nType = 1;	//	なんですの、それ？＾＾；
		break;
	}
//	pSurface->Unlock(NULL);
	//	終了ですわ、終了～○(≧∇≦)o
	return nType;
}

int CDirectDrawSurfaceManager::m_nType=0;

//	CWindowClipper
#ifdef USE_DirectDraw
LRESULT CWindowClipper::Clip(CPlane*lpPrimary,HWND hWnd){
	//	Windowモードでなければ意味は無い

	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;

	if (lpDraw->CreateClipper(0,&m_lpClipper,NULL)!=DD_OK){
		Err.Out("CWindowClipper::ClipでClipper構築失敗");
		return 2;
	}
	if (m_lpClipper->SetHWnd(0,hWnd)!=DD_OK){
		Err.Out("CWindowClipper::ClipでhWNDをセットできない");
		return 3;
	}
	if (lpPrimary->GetSurface()->SetClipper(m_lpClipper)!=DD_OK){
		Err.Out("CWindowClipper::ClipでSetClipperに失敗");
		return 4;
	}

	return 0;
}
#endif // CWindowClipper::Clip(CPlane*lpPrimary,HWND hWnd)

// @yo2 0x0044cfc0 review
void	CWindowClipper::Release(void){
	RELEASE_SAFE(m_lpClipper);
}

// @yo2 0x0044cff0 review
CWindowClipper::CWindowClipper(void){
	m_lpClipper = NULL;
}

// @yo2 0x0044d040 vt
CWindowClipper::~CWindowClipper(){
	Release();
}
#endif	//	CWindowClipper

//////////////////////////////////////////////////////////////////////////////
//	CDirectDraw : 画面解像度を切り替えるなど
//////////////////////////////////////////////////////////////////////////////
#ifdef	USE_DirectDraw

CDirectDraw::CDirectDraw(void) {
	m_nScreenXSize	= 640;
	m_nScreenYSize	= 480;
	m_nScreenColor	= 16;
	m_bFullScr		= false;
	m_bUseFlip		= true;

	m_nSecondaryOffsetX = 0;
	m_nSecondaryOffsetY = 0;

	m_nBrightness	= 256;
	m_bLostSurface	= false; 

#ifdef USE_DIB32
	m_lpSecondaryDIB = NULL;
#endif

	m_hWnd	= CAppInitializer::GetHWnd();
	CAppManager::Add(this);
	CAppInitializer::Hook(this);		//	フックを開始する

	//	描画ウェイトのために、最小タイムインターバルに設定する
	CTimeBase::timeBeginPeriodMin();
}

CDirectDraw::~CDirectDraw(){

	//	描画ウェイトの最小タイムインターバルを解除する
	CTimeBase::timeEndPeriodMin();

#ifdef USE_DIB32
	DELETE_SAFE(m_lpSecondaryDIB);		//	これ解放しとかなきゃ
#endif
	CAppInitializer::Unhook(this);		//	フックを解除する。
	CAppManager::Del(this);
}

//////////////////////////////////////////////////////////////////////////////

void CDirectDraw::BeginChangeDisplay(void){
	m_bDirty		= true;

	m_bDisplayChanging = true;
	m_bChangeDisplayMode = false;
	if (GetDDraw()==NULL) return ;

/*
	CPlane::ReleaseBufferAll();
	// 読み込んでいたファイル名だけは残す

	if (m_ScreenMode!=FullScreenMode || !m_bUseDirectDrawFlip2) {
	// FullScreenModeでFlip用にアタッチしてたら、解放する必要なし。
		RELEASE_SAFE(m_lpSecondary);
	} else {
		m_lpSecondary = NULL;
	}

	// パレットのデタッチ（アタッチしていたPaletteの解放）
	if (m_lpPrimary!=NULL && m_lpPrimary->SetPalette(NULL)== DDERR_SURFACELOST ) {
		m_lpPrimary->Restore(); // このエラーチェックは...いらんでしょう...
		m_lpPrimary->SetPalette(NULL);
	}
	
	RELEASE_SAFE(m_lpClipper);
	RELEASE_SAFE(m_lpPrimary);
	RELEASE_SAFE(m_lpPaletteMain);
*/

	// FullScreenModeでFlip用にアタッチしてたら、解放する必要なしだが...
	//	セカンダリ、クリッパ、プライマリの解放

	/*
	if (m_bUseFlip) {
		LPDIRECTDRAWSURFACE lp = m_Primary.GetSurface();
		LRESULT hr;
		if (lp!=NULL) {
			m_Primary.Restore();
			m_Secondary.Restore();
	
			if ((hr=lp->DeleteAttachedSurface(0,m_Secondary.GetSurface()))!=DD_OK){
				Err.Out("CDirectDraw::Surfaceのデタッチに失敗 %d",hr);	
				//	何と、DDERR_SURFACELOSTが返ってきて、デタッチに失敗する
				//	Err.Out("DDERR_SURFACELOST          %d",DDERR_SURFACELOST);
		}
	}
	*/
 
	m_Secondary.Release();
	m_WindowClipper.Release();
	m_Primary.Release();

	if (m_bFullScr) {	//	もしフルスクリーンモードならばそれを戻す必要がある
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_NORMAL)){
			Err.Out("CDirectDraw::BeginChangeDisplayでSetCooperativeLevelに失敗..");
		}
		// ウィンドゥモードにするときは、これを行なう必要あり
		if (GetDDraw()->RestoreDisplayMode()){
			Err.Out("CDirectDraw::BeginChangeDisplayでRestoreDisplayModeに失敗..");
		}
	}

}

void CDirectDraw::TestDisplayMode(int nSX,int nSY,bool bFullScr,int nColor){
	if (!m_bDisplayChanging) return ; // already changing!!
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

	// ウインドウモードでディスプレイモードを変更しないか
	m_bChangeDisplayMode |= (m_bFullScr!=bFullScr) || m_bFullScr;// 追加

	//	画面モードを反映させて...
	m_bFullScr	= bFullScr;

	m_bUseFlip2 = m_bUseFlip;
	//	プライマリサーフェースの作成
	if (m_Primary.CreatePrimary(m_bUseFlip2,nSX,nSY)!=0) {
		Err.Out("CDirectDraw::TestDisplayModeでCreatePrimaryに失敗");
		return ;
	}

	//	ウィンドゥモードならばクリッパを仕掛ける
	m_WindowClipper.Release();
	if (!bFullScr){
		if (m_WindowClipper.Clip(&m_Primary,m_hWnd)!=0) {
			Err.Out("CDirectDraw::TestDisplayModeでClipに失敗");
			return ;
		}
	}

	//	セカンダリサーフェースの作成
	if (m_Secondary.CreateSecondary(&m_Primary,m_bUseFlip2)!=0) {
		Err.Out("CDirectDraw::TestDisplayModeでCreateSecondaryに失敗");
		return ;
	}

/*
	// 256でないならばパレットの設定は無意味
	if (m_nScreenColorMode2==8) InstallPalette();
*/
	//	ここでウィンドゥモードを反映しておく
	CWindow::ChangeScreen(bFullScr);
	CAppManager::GetMyApp()->GetMyWindow()->ChangeWindowStyle();

	m_bDisplayChanging	= false;	//	画面モードの変更に成功！
	m_nScreenColor	= nColor;
	m_nScreenXSize	= nSX;
	m_nScreenYSize	= nSY;
	return ;
}

LRESULT CDirectDraw::EndChangeDisplay(void){
	if (GetDDraw()==NULL) return 1;
	
	if (m_bDisplayChanging) { // Changeされていない！！
		Err.Out("CDirectDraw::BeginChangeDisplay～EndChangeDisplayに失敗");
		return 1;
	}

	// ウインドウモードで、ディスプレイモードが変わってないなら待たない
	if(m_bChangeDisplayMode) {// 追加
		::Sleep(500);	//	ビデオモードの変更の余波を受ける可能性がある
	}

	//	プレーンのbpp再取得
	CPlane::InnerGetBpp();

/*
	// パレットの再構築
	m_bBrightnessChanged = true;
*/

	// 自前で描画するならば関係ないのだが...
	CAppManager::GetMyApp()->GetMyWindow()->ShowCursor(!m_bFullScr);
	// ウィンドゥサイズの変更
	CAppManager::GetMyApp()->GetMyWindow()->SetSize(m_nScreenXSize,m_nScreenYSize);
	// ウィンドゥスタイルの変更
	CAppManager::GetMyApp()->GetMyWindow()->ChangeScreen(m_bFullScr);
	//	自分の所属ウィンドゥには告知してやる。
	//	（本当は、すべてのウィンドウにブロードキャストする必要がある）
	CAppManager::GetMyApp()->GetMyWindow()->ChangeWindowStyle();

	// プレーンの再構築（もし消失していれば）
	CPlane::RestoreAll();

#ifdef USE_DIB32
	//	DIBの復帰処理
	if (m_lpSecondaryDIB!=NULL){
		m_lpSecondaryDIB->Resize(m_nScreenXSize,m_nScreenYSize);
	}
#endif

	return 0;
}

/////// 使用例:p) ////////////////////////////////////////////////////////////

LRESULT CDirectDraw::ChangeDisplay(bool bFullScr){
	if (GetDDraw()==NULL) return 1; //	だめだこりゃ...
	BeginChangeDisplay();
		if (bFullScr) {
			TestDisplayMode(m_nScreenXSize,m_nScreenYSize,true,m_nScreenColor);
		}
		TestDisplayMode(m_nScreenXSize,m_nScreenYSize); // ウィンドゥモード
	if (EndChangeDisplay()) return 2;	//	ディスプレイモード変更に失敗
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//	ディスプレイモードの設定→変更

LRESULT		CDirectDraw::SetDisplay(bool bFullScr,int nSizeX,int nSizeY,int nColorDepth){
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

void		CDirectDraw::GetDisplay(bool&bFullScr,int &nSizeX,int &nSizeY,int &nColorDepth){
	bFullScr		=	m_bFullScr;
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
	nColorDepth		=	m_nScreenColor;
}

void		CDirectDraw::GetSize(int &nSizeX,int &nSizeY){	// GetDisplayModeのx,yだけ得られる版
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
}
	
bool		CDirectDraw::IsFullScreen(void){
	return		m_bFullScr;
}

void		CDirectDraw::SetFlipUse(bool bFlip){
	m_bUseFlip	= bFlip;
}

bool		CDirectDraw::GetFlipUse(void){
	return m_bUseFlip2;
}

void		CDirectDraw::FlipToGDISurface(void){
	if (CAppInitializer::IsFullScreen() && m_bUseFlip2) {
		if (GetDDraw()!=NULL) {
		   GetDDraw()->FlipToGDISurface();
		}
	}
}

void		CDirectDraw::CheckSurfaceLost(void){
	LPDIRECTDRAWSURFACE lpSurface = GetSecondary()->GetSurface();
	if (lpSurface==NULL) return ;
	if (lpSurface->IsLost()){
		ChangeDisplay(m_bFullScr);
		//	プライマリサーフェースの再構築から行なうべき
	}
}

int			CDirectDraw::GetBpp(void){	// 現在のBppの取得
	return CPlane::GetBpp();
}

void	CDirectDraw::SetBrightness(int nBright){
	if (m_nBrightness == nBright) return ;
	m_nBrightness = nBright;
	m_bDirty = true;
}

#ifdef USE_DIB32
//	DIBはLostしないので復帰処理等は一切不要。ええやつやなぁ（笑）
LRESULT		CDirectDraw::CreateSecondaryDIB(void){
	m_lpSecondaryDIB = new CDIB32;
	if (m_lpSecondaryDIB==NULL) return 1;	//	メモリ足らんのか？＾＾
	m_lpSecondaryDIB->UseDIBSection(true);	//	GetDCの可能なサーフェース

	//	ここでサイズが要求されるので、ディスプレイモードの変更が完了していること。
	if (m_lpSecondaryDIB->CreateSurface(m_nScreenXSize,m_nScreenYSize)){
		//	メモリ足らんのか？＾＾
		DELETE_SAFE(m_lpSecondaryDIB);
		return 2;
	}
	return 0;
}

void		CDirectDraw::ReleaseSecondaryDIB(void){
	DELETE_SAFE(m_lpSecondaryDIB);
}
#endif

//////////////////////////////////////////////////////////////////////////////
//	転送系　（これらはすべてCPlaneに委譲する）
LRESULT		CDirectDraw::Blt(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->Blt(lpSrc,x,y,lpSrcRect,lpClipDstRect);
}

LRESULT		CDirectDraw::BltFast(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BltFast(lpSrc,x,y,lpSrcRect,lpClipDstRect);
}

LRESULT		CDirectDraw::BlendBlt(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BlendBlt(lpSrc,x,y,ar,ag,ab,br,bg,bb,lpSrcRect,lpClipDstRect);
}

LRESULT		CDirectDraw::BlendBltFast(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BlendBltFast(lpSrc,x,y,ar,ag,ab,br,bg,bb,lpSrcRect,lpClipDstRect);
}

LRESULT		CDirectDraw::BltR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BltR(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipDstRect);
}

LRESULT		CDirectDraw::BltFastR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BltFastR(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipDstRect);
}

LRESULT		CDirectDraw::BlendBltR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BlendBltR(lpSrc,x,y,ar,ag,ab,br,bg,bb,lpSrcRect,lpDstSize,lpClipDstRect);
}

LRESULT		CDirectDraw::BlendBltFastR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect){
	m_bDirty		= true;
	return GetSecondary()->BlendBltFastR(lpSrc,x,y,ar,ag,ab,br,bg,bb,lpSrcRect,lpDstSize,lpClipDstRect);
}

#ifdef USE_DIB32
LRESULT		CDirectDraw::Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipRect){
	m_bDirty		= true;
	return GetSecondary()->Blt(lpSrc,x,y,lpSrcRect,lpClipRect);
}
#endif

	////////////////////////////////////////////////
	//	こいつらも全部委譲しちまう＾＾

LRESULT		CDirectDraw::Clear(LPRECT lpRect){
	m_bDirty		= true;
	return GetSecondary()->Clear(lpRect);
}

LRESULT		CDirectDraw::SetFillColor(COLORREF c){
	return GetSecondary()->SetFillColor(c);
}

DWORD		CDirectDraw::GetFillColor(void){
	return GetSecondary()->GetFillColor();
}

void	CDirectDraw::BltFix(CSprite*lpSprite,int x,int y,LPRECT lpClip){
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
		GetSecondary()->Blt(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	} else {
		GetSecondary()->BltFast(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	}
}

void	CDirectDraw::BltOnce(CSprite*lpSprite,int x,int y,LPRECT lpClip){
	BltFix(lpSprite,x,y,lpClip);
	
	//	ケツになっていたら、それ以上は加算しない
	int n=lpSprite->GetMotion();
	lpSprite->IncMotion();
	if (lpSprite->GetMotion()==0) {
		lpSprite->SetMotion(n);
	}
}

//////////////////////////////////////////////////////////////////////////////
//	CPlaneBaseのメンバ関数。全部、委譲＾＾；
LRESULT CDirectDraw::Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->Blt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CDirectDraw::BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BltFast(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CDirectDraw::BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBlt(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CDirectDraw::BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBltFast(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CDirectDraw::MosaicEffect(int d, LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->MosaicEffect(d,lpRect);
}
LRESULT CDirectDraw::FlushEffect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->FlushEffect(lpRect);
}
/*	//	CPlane::CreateSecondaryから参照されるので、これはまずい
void	CDirectDraw::GetSize(int &x,int &y) {
	static_cast<CPlaneBase*>(GetSecondary())->GetSize(x,y);
}
*/
LRESULT CDirectDraw::ClearRect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->ClearRect(lpRect);
}
LRESULT CDirectDraw::Load(string szBitmapFileName,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->Load(szBitmapFileName,bLoadPalette);
}
LRESULT CDirectDraw::LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->LoadW(
		szBitmapFileName256,szBitmapFileNameElse,bLoadPalette);
}
LRESULT CDirectDraw::Release(void){
	return static_cast<CPlaneBase*>(GetSecondary())->Release();
}
LRESULT CDirectDraw::SetColorKey(int x,int y){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(x,y);
}
LRESULT CDirectDraw::SetColorKey(int r,int g,int b){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(r,g,b);
}

bool CDirectDraw::IsLoaded(void) const {
	//	GetSecondary()では、const性が失われるので…
	return m_Secondary.IsLoaded();
}

//////////////////////////////////////////////////////////////////////////////

void	CDirectDraw::SetOffset(int ox,int oy){
	//	セカンダリの転送オフセット
	m_nSecondaryOffsetX =	ox;
	m_nSecondaryOffsetY =	oy;
}

void	CDirectDraw::OnDraw(RECT*lpRect,bool bLayerCallBack){
	
	//	もし、サーフェースが消失していれば...
	if (m_bLostSurface) {
		//	スレッドがもう破棄されるのならばリストアは無効...
		if (!CAppManager::GetMyApp()->IsThreadValid()) return ;
		CheckSurfaceLost();
		//	このフラグは、メッセージポンプ側で
		//	リストアイベントに応じて設定される
		m_bLostSurface = false;
		return ;
	}
	
	LPDIRECTDRAWSURFACE lpPrimary = GetPrimary()->GetSurface();
	if (lpPrimary==NULL) return ;
	LPDIRECTDRAWSURFACE lpSecondary = GetSecondary()->GetSurface();
	if (lpSecondary==NULL) return ;
	
	//////////////////////////////////////////////////////////
	//	Layer callback
	if ( bLayerCallBack ){
		//	Layerをセカンダリに描画してもらう＾＾
		m_LayerList.OnDraw(this);
		
		//	HDCLayerをセカンダリに描画してもらう＾＾
		if (!m_HDCLayerList.IsEmpty()){
			HDC hdc = GetSecondary()->GetDC();
			if (hdc!=NULL){
				m_HDCLayerList.OnDraw(hdc);
				GetSecondary()->ReleaseDC();
			}
			Invalidate();	//	書き書きしたんで、汚しフラグ立てる
		}
		
		//	AfterLayerをセカンダリに描画してもらう＾＾
		m_AfterLayerList.OnDraw(this);
	}
	//////////////////////////////////////////////////////////
	
	//	プライマリが汚れていなければリターン
	if (!m_bDirty) return ;
	
	//	DirtyRect管理は行なっていない
	//	どうせFullScreenでFlipを使うと最小更新差分では管理できない
	
	//	ブライトネスに応じて、セカンダリを減衰
	RealizeBrightness(m_nBrightness);
	
	RECT r; // source rect
	::SetRect(&r,0,0,m_nScreenXSize,m_nScreenYSize);
	
	if (m_nSecondaryOffsetX || m_nSecondaryOffsetY) {
		//	転送先オフセットがかかっているのか？
		RECT r2; // distination rect
		if ( lpRect == NULL ){	// 部分更新か？
			::SetRect(&r2,0,0,m_nScreenXSize,m_nScreenYSize);	//	同一サイズと仮定して良い
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
			
			if (CAppInitializer::IsFullScreen()){
				// フルスクリーンでも、Bltなのら！
				DDBLTFX fx;
				ZERO(fx);	//	一応初期化
				fx.dwSize = sizeof(fx);
				fx.dwFillColor = GetSecondary()->GetFillColor();
				RECT br;
				::SetRect(&br,0,0,m_nScreenXSize,r2.top);					//	上領域
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				//	main画像
				lpPrimary->BltFast(r2.left,r2.top,lpSecondary,&r,DDBLTFAST_WAIT);
				::SetRect(&br,0,r2.top,r2.left,r2.bottom);				//	左領域
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				::SetRect(&br,r2.right,r2.top,m_nScreenXSize,r2.bottom);	//	右領域
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				::SetRect(&br,0,r2.bottom,m_nScreenXSize,m_nScreenYSize);	//	下領域
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				
			} else {
				// DirectDrawClipperを利用するにはBltにしなくてはならない。
				// しかし、なんちゅー制限や。いい加減にして欲しい>Clipper君！
				POINT cp;
				cp.x = cp.y = 0;
				::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！
				
				DDBLTFX fx;
				ZERO(fx);	//	一応初期化
				fx.dwSize = sizeof(fx);
				fx.dwFillColor = GetSecondary()->GetFillColor();
				
				RECT br;
				::SetRect(&br,0,0,m_nScreenXSize,r2.top);					//	上領域
				::OffsetRect(&br,cp.x,cp.y);
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				
				//	main画像
				br = r2;
				::OffsetRect(&br,cp.x,cp.y);
				lpPrimary->Blt(&br,lpSecondary,&r,DDBLT_WAIT,NULL);
				
				::SetRect(&br,0,r2.top,r2.left,r2.bottom);					//	左領域
				::OffsetRect(&br,cp.x,cp.y);
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				::SetRect(&br,r2.right,r2.top,m_nScreenXSize,r2.bottom);	//	右領域
				::OffsetRect(&br,cp.x,cp.y);
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
				::SetRect(&br,0,r2.bottom,m_nScreenXSize,m_nScreenYSize);	//	下領域
				::OffsetRect(&br,cp.x,cp.y);
				lpPrimary->Blt(&br,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
			}
		}else{
			// 部分更新
				r = *lpRect;	// source rest;
				r2 = *lpRect;	// dest	 rest;
			if (CAppInitializer::IsFullScreen()){
				// from CPlane DRAW_CLIPPER
				RECT& sr = r;			
				int x = m_nSecondaryOffsetX;
				int y = m_nSecondaryOffsetY;
				{
					RECT clip;
					::SetRect(&clip,0,0,m_nScreenXSize,m_nScreenYSize);
					int x2,y2;													
					x2 = x + sr.right - sr.left; /* x + Width  */				
					y2 = y + sr.bottom - sr.top; /* y + Height */				
					if (x2<clip.left || y2<clip.top								
						|| x>=clip.right || y>=clip.bottom) return;	 /* 画面外 */ 
					int t;														
					t = clip.left-x;										
					if (t>0)	{ sr.left	+= t;	x = clip.left;	}		
					t = clip.top -y;										
					if (t>0)	{ sr.top	+= t;	y = clip.top;	}		
					t = x2-clip.right;										
					if (t>0)	{ sr.right	-= t;	x2= clip.right; }		
					t = y2-clip.bottom;										
					if (t>0)	{ sr.bottom -= t;	y2= clip.bottom;}		
					if (sr.right<=sr.left || sr.bottom<=sr.top) return; // invalid rect
				}
				lpPrimary->BltFast(x,y,lpSecondary,&r,DDBLTFAST_WAIT);
			}else{
				// オフセット転送の部分更新なので、ずれた黒背景は描画しない
				// DirectDrawClipperを利用するにはBltにしなくてはならない。
				// しかし、なんちゅー制限や。いい加減にして欲しい>Clipper君！
				POINT cp;
				cp.x = cp.y = 0;
				::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！
				::OffsetRect(&r2,m_nSecondaryOffsetX,m_nSecondaryOffsetY);
				::OffsetRect(&r2,cp.x,cp.y); 
				lpPrimary->Blt(&r2,lpSecondary,&r,DDBLT_WAIT,NULL);
			}
			
		}
		
	} else {
		//	転送オフセットが指定されていないフツーの場合
		
		if (CAppInitializer::IsFullScreen()){
			if (m_bUseFlip2 && lpRect == NULL ){
				lpPrimary->Flip(NULL,DDFLIP_WAIT);
			} else {
				if ( lpRect != NULL ){
					r = *lpRect;
				}
				lpPrimary->BltFast(0,0,lpSecondary,&r,DDBLTFAST_WAIT);
			}
		} else {
			// DirectDrawClipperを利用するにはBltにしなくてはならない。
			// しかし、なんちゅー制限や。いい加減にして欲しい>Clipper君！
			POINT cp;
			cp.x = cp.y = 0;
			::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！
			if ( lpRect != NULL ) {
				r = *lpRect;
			}
			RECT sr = r;
			::OffsetRect(&sr,cp.x,cp.y);
			lpPrimary->Blt(&sr,lpSecondary,&r,DDBLT_WAIT,NULL);
		}
	}
	
	m_bDirty = false;
}
#ifdef USE_DIB32
//	上の関数のDIBバージョン
void	CDirectDraw::OnDrawDIB(RECT*lpRect,bool bLayerCallBack){
	//	DIB->Secondaryに転送して、OnDrawに委譲。
	//	少し遅くなるが、どうせFullScreenならばフリップするし、
	//	こうしておけばWindowClipperが作用するし、プログラムは楽＾＾
	m_lpSecondaryDIB->BltToPlane(GetSecondary(),m_nSecondaryOffsetX,m_nSecondaryOffsetY,lpRect);
	m_bDirty = true;
	OnDraw(lpRect,bLayerCallBack);
}
#endif

//////////////////////////////////////////////////////////////////////////////
void	CDirectDraw::RealizeBrightness(int nBrightness){
	if (GetBpp()==8) return ; // 256色は非対応
	if (m_nBrightness==256) return ;

	// 多色モードなのでセカンダリを直接書き書きする
	// サーフェースの直書き！（得意技:p）
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (GetSecondary()->GetSurface()->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("RealizeBrightnessでSurfaceのLockに失敗");
		return ;
	}

	LONG lPitch	 = dddesc.lPitch;

	// ピクセルフォーマットを参照しないと
	// たとえ65536色表示でも32ビット使用している可能性がある
	switch (dddesc.ddpfPixelFormat.dwRGBBitCount) {
	case 16: { // 65536色モード
		// DWORDずつまとめて面倒を見る！
		DWORD RMask, GMask, BMask;
		DWORD RMask2, GMask2, BMask2;

		RMask = dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = dddesc.ddpfPixelFormat.dwBBitMask;
		RMask2 = dddesc.ddpfPixelFormat.dwRBitMask <<16;
		GMask2 = dddesc.ddpfPixelFormat.dwGBitMask <<16;
		BMask2 = dddesc.ddpfPixelFormat.dwBBitMask <<16;

		DWORD *p = (DWORD*)dddesc.lpSurface;
		
		for(int y=0;y<m_nScreenYSize;y++){
			for (int x=0; x<(m_nScreenXSize>>1);x++) {
				DWORD pixel, px;
				px	= p[x];
				pixel  = ((DWORD)(((px&RMask )*m_nBrightness)>>8)&RMask);
				pixel |= ((DWORD)(((px&GMask )*m_nBrightness)>>8)&GMask);
				pixel |= ((DWORD)(((px&BMask )*m_nBrightness)>>8)&BMask);
				pixel |= ((DWORD)(((px&RMask2)>>8)*m_nBrightness)&RMask2);
				pixel |= ((DWORD)(((px&GMask2)>>8)*m_nBrightness)&GMask2);
				pixel |= ((DWORD)(((px&BMask2)>>8)*m_nBrightness)&BMask2);
				p[x] = pixel;
			}
			p = (DWORD*)((BYTE*)p + lPitch); // １ラスタ分の増量
			// BYTEにキャストしておかないと計算間違う:p
		}
	} break;

	case 24: {
	  // これでええわ。もう知らん:p
	  // 実際のところ、ずいぶん遅い気がする。（DWORD単位で処理できないため）
	  // まだtrue colorのほうが幾分マシ。これは、もう8x86の宿命としか言いようがない。

#if 0
		BYTE* p = (BYTE*)dddesc.lpSurface;
		// 色変換テーブル作ってまう！
		// これがbyte単位だから遅いという話もあるが...
		BYTE table[256];
		for(int i=0;i<256;i++){
			table[i] = (BYTE)(i * m_nBrightness >> 8);
		}

		DWORD width = m_nScreenXSize;
		for(int y=0;y<m_nScreenYSize;y++){
			/*
			for (int x=0;x<m_nScreenXSize;x++) {
				*p = table[*p]; p++; // テーブル化手法(C)yaneurao
				*p = table[*p]; p++;
				*p = table[*p]; p++;
			}
			p += lPitch - m_nScreenXSize*3; // １ラスタ分の増量(bytes)
			*/

			// BYTEアクセスってやっぱ遅いなぁ
			_asm {
				mov ecx,width // Counter
				mov edx,p
				lea ebx,table
				xor eax,eax	 // reset
			slp:
				// STOSBが使いたいなー
				mov al,[edx]
				mov al,[ebx+eax]
				mov [edx],al
				inc edx
				mov al,[edx]
				mov al,[ebx+eax]
				mov [edx],al
				inc edx
				mov al,[edx]
				mov al,[ebx+eax]
				mov [edx],al
				inc edx
				loop slp
			}
			p += lPitch;
		}
#endif
//////////// 案その２ ///////////////////////////////////////////////////////
		BYTE table[256];
		for(int i=0;i<256;i++){
			table[i] = (BYTE)(i * m_nBrightness >> 8);
		}
		DWORD* p = (DWORD*)dddesc.lpSurface;
		int LP = m_nScreenXSize * 3 >> 2;
		for(int y=0;y<m_nScreenYSize;y++){
			_asm {
				push edi
				push esi
				lea edi,table
				mov esi,p
				mov ecx,LP	// loop counter
				xor ebx,ebx
			lpp:	// ワンループで４バイトずつ処理する
				mov eax,[esi]
				mov bl,al
				mov dl,[edi+ebx]
				mov bl,ah
				mov dh,[edi+ebx]

				mov [esi],dx
				shr eax,16
				mov bl,al
				mov dl,[edi+ebx]
				shr eax,8
				mov dh,[edi+eax]

				mov [esi+2],dx
				add esi,4

				loop lpp
				pop esi
				pop edi
			}
		
			p = (DWORD*) ((BYTE*)p+ lPitch);
		}

		   } break;

	case 32: {
		DWORD RMask, GMask, BMask;

		RMask = dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = dddesc.ddpfPixelFormat.dwBBitMask;

		DWORD *p = (DWORD*)dddesc.lpSurface;
		
		for(int y=0;y<m_nScreenYSize;y++){
			for (int x=0; x<m_nScreenXSize;x++) {
				DWORD pixel, px;
				px	= p[x];
				// 桁あふれ起こすかー？シャレならんなぁ...
				// ULONGLONGを持ち出すのはちょっと大人げないような気もするけど:p
				pixel  = (DWORD)((((ULONGLONG)(px&RMask))*m_nBrightness)>>8)&RMask;
				pixel |= (DWORD)((((ULONGLONG)(px&GMask))*m_nBrightness)>>8)&GMask;
				pixel |= (DWORD)((((ULONGLONG)(px&BMask))*m_nBrightness)>>8)&BMask;
				p[x] = pixel;
			}
			p = (DWORD*)((BYTE*)p + lPitch); // １ラスタ分の増量
		}

	  } break; // end case
	} // end switch 
	GetSecondary()->GetSurface()->Unlock(NULL);
}

//////////////////////////////////////////////////////////////////////////////
LRESULT		CDirectDraw::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){

	switch(uMsg){
	case WM_PAINT : {
		//	dirty rectが発生
		m_bDirty = true;
//		OnDraw();	//	一応、再描画してまう。
		/*
			これ外していたのだが、もしコメントを外すとしても
			WM_PAINTの処理中にはGetDCは使えないので注意が必要。
			（GetDCで取得したデバイスコンテキストに描画するとWM_PAINTが発生するから）
			WM_PAINTの処理中にWM_PAINTが発生するんで、アプリケーションはWM_PAINTの
			処理しかできなくなる！
		*/

		return 0;	//	DefWindowProcを呼び出しに行く。
					//	これを呼び出しておかないと再度WM_PAINTが送られてくる
					}

	case WM_ACTIVATEAPP: {
		UINT bActive = wParam;
		if(bActive) {
			//	メッセージポンプ側ではなく、ワーカースレッド側でリストアすべき...
			m_bLostSurface = true;
		}
		return 0;
						 }

	} // end switch

	return 0;
}

#endif // USE_DirectDraw
