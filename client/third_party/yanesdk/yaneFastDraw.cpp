//
//	DirectDrawSurface and MemorySurface Wrapper
//

#include "stdafx.h"

#ifdef USE_FastDraw

#include "yaneDirectDraw.h"
#include "yaneFastDraw.h"
#include "yaneCOMBase.h"	// COMの利用のため
#include "yaneAppInitializer.h"
#include "yaneAppManager.h"
#include "yaneWMUSER.h"
#include "yaneFastPlane.h"
#include "yaneDIB32.h"
#include "yaneWindow.h"
#include "yaneGTL.h"
#include "yaneTimer.h"

//////////////////////////////////////////////////////////////////////////////
//	CWindowClipper

// @yo2 0x0044fc20 review
LRESULT CWindowClipper::Clip(CFastPlane*lpPrimary,HWND hWnd){
	//	Windowモードでなければ意味は無い？

	LPDIRECTDRAW lpDraw = CAppManager::GetMyFastDraw()->GetDDraw();

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

//////////////////////////////////////////////////////////////////////////////
//	CFastDraw : 画面解像度を切り替えるなど
//////////////////////////////////////////////////////////////////////////////

// [Konami] added: static switch for the DirectDraw emulation-only flag (initially true) (name is ours)
bool CFastDraw::m_bEmulationOnly = true;
// [Konami] added: setter for m_bEmulationOnly; must be called before CFastDraw is constructed (name is ours)
// @yo2 0x0044fcb0 review
void CFastDraw::SetEmulationOnly(bool bEmulationOnly){
	m_bEmulationOnly = bEmulationOnly;
}

// @yo2 0x0044fcd0 feat
CFastDraw::CFastDraw() :
	m_DirectDrawBase(m_bEmulationOnly)	//	DirectDraw emulation only	// [Konami] was m_DirectDrawBase(true)
	//	何と、DirectDrawはEmulation Onlyのほうが速い！	
{
	m_nScreenXSize	= 640;
	m_nScreenYSize	= 480;
	m_nScreenColor	= 16;
	m_bFullScr		= false;

	//	FullScr時のフリップの使用。使えるものならば使ったほうが良い
//	m_bUseFlip		= false;

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

	m_nSecondaryOffsetX = 0;
	m_nSecondaryOffsetY = 0;

	m_nBrightness	= 256;
	m_bLostSurface	= false; 

	m_bEraseBackground = false; // ディフォルトで自動的に背景を消去しない

	m_hWnd	= CAppInitializer::GetHWnd();
	CAppManager::Add(this);
	CAppInitializer::Hook(this);		//	フックを開始する

	//	プライマリはハードウェアメモリ上に確保
	GetPrimary()->SetSystemMemoryUse(false);
//	GetPrimary2()->SetSystemMemoryUse(false);
	//	そこ以外は、すべてシステムメモリ上に確保する
	//	CFastPlaneは、ディフォルトでシステムメモリなので、これでＯＫ

	//	セカンダリに関しては、自動リストアサーフェースとしておく
	//	（どうせ、OnDrawはオーバーライドされていないので）
//	GetPrimary2()->SetAutoRestore(true);
	GetSecondary()->SetAutoRestore(true);

	// yaneGTL.hで使用する、ブレンドテーブルを初期化
	CFastPlaneBlendTable::InitTable();	

	//	描画ウェイトのために、最小タイムインターバルに設定する
	CTimeBase::timeBeginPeriodMin();

	m_bMenuDrawing = false;
}

// @yo2 0x00450370 vt
CFastDraw::~CFastDraw(){
	//	描画ウェイトの最小タイムインターバルを解除する
	CTimeBase::timeEndPeriodMin();

	CAppInitializer::Unhook(this);		//	フックを解除する。
	CAppManager::Del(this);
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00450600 feat
int		CFastDraw::GetMenuHeight(void){
//	メニューがついているならば、そのメニュー高さを返す
//	（ついていなければ０）
	if (::GetMenu(m_hWnd)!=NULL) return m_nMenu;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00450630 review
void CFastDraw::BeginChangeDisplay(void){

	m_bDisplayChanging = true;
	m_bChangeDisplayMode = false;
	if (GetDDraw()==NULL) return ;

	// FullScreenModeでFlip用にアタッチしてたら、解放する必要なしだが...
	//	セカンダリ、クリッパ、プライマリの解放
 
	m_Secondary256.Release();
//	m_Secondary.Release();
	//	↑このセカンダリは、システムメモリ上に作成された
	//	仮想セカンダリサーフェースなので解放する必要が無い
	//	（むしろ、解放しないことによって、AutoRestoreの対象としたい）

	m_WindowClipper.Release();
//	m_Primary2.Release();
	m_Primary.Release();

	if (m_bFullScr) {	//	もしフルスクリーンモードならばそれを戻す必要がある
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_NORMAL)){
			Err.Out("CFastDraw::BeginChangeDisplayでSetCooperativeLevelに失敗..");
		}
		// ウィンドゥモードにするときは、これを行なう必要あり
		if (GetDDraw()->RestoreDisplayMode()){
			Err.Out("CFastDraw::BeginChangeDisplayでRestoreDisplayModeに失敗..");
		}
	}
}

// @yo2 0x004506b0 manual
void CFastDraw::TestDisplayMode(int nSX,int nSY,bool bFullScr,int nColor){
	if (!m_bDisplayChanging) return ; // already changing!!
	if (GetDDraw()==NULL) return ;

	if (!bFullScr) {
		// Windowモードの指定があるならば仕方がない。
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_NORMAL)){
			Err.Out("CFastDraw::TestDisplayModeのSetCooperativeLevelにDDSC_NORMALで失敗");
			return ; // これであかんかったらはっきり言ってシャレならんのやけど...
		}
	} else {
		if (GetDDraw()->SetCooperativeLevel(m_hWnd,DDSCL_EXCLUSIVE|DDSCL_FULLSCREEN)!=DD_OK){
			Err.Out("CFastDraw::TestDisplayModeのSetCooperativeLevelにDDSC_EXCLUSIVEで失敗");
			return ; // 他のアプリ使ってんちゃうん？
		}
		if (GetDDraw()->SetDisplayMode(nSX,nSY,nColor)!=DD_OK){
			Err.Out("CFastDraw::TestDisplayModeのSetDisplayModeに失敗");
			return ; // 非対応け？
		}
	}

	// ウインドウモードでディスプレイモードを変更しないか
	m_bChangeDisplayMode |= (m_bFullScr!=bFullScr) || m_bFullScr;// 追加

	//	画面モードを反映させて...
	m_bFullScr	= bFullScr;

	//	m_bUseFlip	: フリップを使用するのか？（ユーザーの意思	）
	//	m_bUseFlip2 : フリップが実際にハードウェア的に使えて、
	//				そして使うときにtrue

//	m_bUseFlip2 = m_bUseFlip;

	bool bUseFilp = false;
	//	プライマリサーフェースの作成
	if (m_Primary.CreatePrimary(bUseFilp,nSX,nSY)!=0) {
		Err.Out("CFastDraw::TestDisplayModeでCreatePrimaryに失敗");
		return ;
	}

	//	ウィンドゥモードならばクリッパを仕掛ける
	m_WindowClipper.Release();
	if (!bFullScr){
		if (m_WindowClipper.Clip(&m_Primary,m_hWnd)!=0) {
			Err.Out("CFastDraw::TestDisplayModeでClipに失敗");
			return ;
		}
	}

/*
	if (m_bUseFlip2){
		if (m_Primary2.CreatePrimary2(&m_Primary,m_bUseFlip2)!=0){
			//	これ失敗してたら、フリップ使用しない、とする
			m_bUseFlip2 = false;
		}
	}
*/

	bool b256 = m_Primary.GetSurfaceType()==2;
	if (b256) {
		m_Secondary.m_bSecondary256DIB = true;
		//	RGB555のDIBにしてもらうで！
	}

	//	セカンダリサーフェースの作成
	if (m_Secondary.CreateSecondary(&m_Primary,bUseFilp)!=0) {
		Err.Out("CFastDraw::TestDisplayModeでCreateSecondaryに失敗");
		return ;
	}

/*
	// 256でないならばパレットの設定は無意味
	if (b256) InstallPalette();
*/

	//	もし、フルスクリーンモードの256色でかつ、フリップを使用するならば、
	//	Secondary256は不要なのだが．．．
	if (b256) {
		//	256変換用サーフェース
		m_Secondary256.InnerCreateSurface(nSX,nSY,false,true);
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

// @yo2 0x00450880 feat
LRESULT CFastDraw::EndChangeDisplay(void){
	if (GetDDraw()==NULL) return 1;
	
	if (m_bDisplayChanging) { // Changeされていない！！
		Err.Out("CFastDraw::BeginChangeDisplay～EndChangeDisplayに失敗");
		return 1;
	}

	// ウインドウモードで、ディスプレイモードが変わってないなら待たない
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
	CAppManager::GetMyApp()->GetMyWindow()->ShowCursor(!m_bFullScr);
	// ウィンドゥサイズの変更
	CAppManager::GetMyApp()->GetMyWindow()->SetSize(m_nScreenXSize,m_nScreenYSize);
	// ウィンドゥスタイルの変更
	CAppManager::GetMyApp()->GetMyWindow()->ChangeScreen(m_bFullScr);
	//	自分の所属ウィンドゥには告知してやる。
	//	（本当は、すべてのウィンドウにブロードキャストする必要がある）
	CAppManager::GetMyApp()->GetMyWindow()->ChangeWindowStyle();

	// プレーンの再構築（もし消失していれば）
	CFastPlane::RestoreAll();

	//	（パレットのリアライズ後に）
	// yaneGTL.hで使用する、RGB555⇒256の変換テーブルの初期化
	CFastPlaneBlendTable::OnChangePalette();	

	return 0;
}

/////// 使用例:p) ////////////////////////////////////////////////////////////

// @yo2 0x00450940 cg
LRESULT CFastDraw::ChangeDisplay(bool bFullScr){
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

// @yo2 0x004509c0 review
LRESULT		CFastDraw::SetDisplay(bool bFullScr,int nSizeX,int nSizeY,int nColorDepth){
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

// @yo2 0x00450a30 review
void		CFastDraw::GetDisplay(bool&bFullScr,int &nSizeX,int &nSizeY,int &nColorDepth){
	bFullScr		=	m_bFullScr;
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
	nColorDepth		=	m_nScreenColor;
}

// @yo2 0x00450a70 review
void		CFastDraw::GetSize(int &nSizeX,int &nSizeY){	// GetDisplayModeのx,yだけ得られる版
	nSizeX			=	m_nScreenXSize;
	nSizeY			=	m_nScreenYSize;
}
	
// @yo2 0x00450aa0 cg
bool	CFastDraw::IsFullScreen(){
	return		m_bFullScr;
}

// @yo2 0x00450ac0 cg
void	CFastDraw::CheckSurfaceLost(){
	LPDIRECTDRAWSURFACE lpSurface = GetPrimary()->GetSurface();
	//	システムメモリ上のサーフェースはLostしないのである＾＾；
	if (lpSurface==NULL) return ;
	if (lpSurface->IsLost()){
		ChangeDisplay(m_bFullScr);
		//	プライマリサーフェースの再構築から行なうべき
	}
}

// @yo2 0x00450b00 review
int		CFastDraw::GetBpp(){	// 現在のBppの取得
	return CBppManager::GetBpp();
}

// @yo2 0x00450b20 review
void	CFastDraw::SetBrightness(int nBright){
	if (m_nBrightness == nBright) return ;
	m_nBrightness = nBright;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00450b50 review
void	CFastDraw::SetOffset(int ox,int oy){
	//	セカンダリの転送オフセット
	m_nSecondaryOffsetX =	ox;
	m_nSecondaryOffsetY =	oy;
}

//	この範囲に対してrepaintする Add by KAIZA 02/06/21
// @yo2 0x00450b80 vt
void	CFastDraw::OnDraw(CDirtyRect* lpDirtyRect,bool bLayerCallBack) {
	if(lpDirtyRect == NULL) return;

	//	最小化されているならば描画せずにリターン
	if (CAppManager::GetMyApp()->GetMyWindow()->IsMinimized()) return ;

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

	/*
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
//			Invalidate();	//	書き書きしたんで、汚しフラグ立てる
		}
		
		//	AfterLayerをセカンダリに描画してもらう＾＾
		m_AfterLayerList.OnDraw(this);
	}
	//////////////////////////////////////////////////////////

	//	ブライトネスに応じて、セカンダリを減衰
	RealizeBrightness(m_nBrightness);
	*/

	//	MenuのPopup処理
	InnerOnMenuDraw();

	// DirtyRectに積まれている矩形を全て描画する
	int nSize = lpDirtyRect->GetRectNum();
	for(int i = 0; i < nSize; i++) {
		LPRECT lpRect = &((RECT*)lpDirtyRect->GetRect())[i];
		InnerOnDraw(lpRect);
	}
}

//  この矩形に対してrepaintする
// @yo2 0x00450c40 vt
void	CFastDraw::OnDraw(RECT*lpRect,bool bLayerCallBack){

	m_bMenuDrawing = false;	// [Konami] added: reset menu flag every frame (InnerOnMenuDraw only sets it)

	//	最小化されているならば描画せずにリターン
	if (CAppManager::GetMyApp()->GetMyWindow()->IsMinimized()) return ;

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
//			Invalidate();	//	書き書きしたんで、汚しフラグ立てる
		}
		
		//	AfterLayerをセカンダリに描画してもらう＾＾
		m_AfterLayerList.OnDraw(this);
	}
	//////////////////////////////////////////////////////////
	
	//	プライマリが汚れていなければリターン
//	if (!m_bDirty) return ;
	
	//	DirtyRect管理は行なっていない
	//	どうせFullScreenでFlipを使うと最小更新差分では管理できない
	
	//	ブライトネスに応じて、セカンダリを減衰
	RealizeBrightness(m_nBrightness);

	//	MenuのPopup処理
	InnerOnMenuDraw();

	InnerOnDraw( lpRect );
}

//////////////////////////////////////////////////////////////////////////////
//
// MENUの描画  Add by KAIZA 02/06/21
//
// @yo2 0x00450d60 feat
void	CFastDraw::InnerOnMenuDraw( void ) {
	//	MenuのPopup処理
	int nMenu = 0;
	//	FullScrで、メニューありで、マウスが画面上のメニュー領域にさしかかったのならば...
	if (IsFullScreen()) {
		if(::GetActiveWindow()==m_hWnd) {
		//						↑さらにメインウインドウがアクティブ(ダイアログなどが呼び出されてない)
			POINT point;
			::GetCursorPos(&point);
			if (point.y<m_nMenu) {
				if (::GetMenu(m_hWnd)!=NULL){
				//	↑このメニューサイズを正確に算出するため、メニュー高さを調べる(c)yaneurao'00/12/15
					nMenu = m_nMenu;
					//	Paintしなおすぜー
					//::SetMenu(m_hWnd,GetMenu(m_hWnd));	//	メニュー領域の再描画
					::DrawMenuBar(m_hWnd);

				}
			}

			// FullScreenならメニュー描画中かを記録しておく
			// （WM_PAINTで、画面のリストアに使用する）
			if(nMenu) {
				m_bMenuDrawing = true;
			}
			// [Konami] removed: else { m_bMenuDrawing = false; } (OnDraw(RECT*) resets it now)
		}
	} else {
		// WindowならメニューはWindow自体に張り付いているので常に false
		m_bMenuDrawing = false;
	}
}

//////////////////////////////////////////////////////////////////////////////
//
// CDIBDraw::InnerOnDraw を参照 (^^;  Add by S.SHIMA 02/04/06
//
// @yo2 0x00450e00 feat
void	CFastDraw::InnerOnDraw(RECT* lpRect){
	//	Menuのサイズ分ずらす
	int nMenu = 0;
	if(m_bMenuDrawing) {
		nMenu = m_nMenu;
	}

	LPDIRECTDRAWSURFACE lpPrimary = GetPrimary()->GetSurface();
	if (lpPrimary==NULL) return ;

	LPDIRECTDRAWSURFACE lpSecondary;
	CFastPlane* lpSecondarySurface;
	if (m_Primary.GetSurfaceType()==2){	//	8bppか...
		//	Secondaryは、実はRGB555なので転送してやる必要あり
		GetSecondary256()->BltFast(GetSecondary(),0,0);
		lpSecondary = GetSecondary256()->GetSurface();
		lpSecondarySurface = GetSecondary256();
	} else {
		lpSecondary = GetSecondary()->GetSurface();
		lpSecondarySurface = GetSecondary();
	}
	if (lpSecondary==NULL) return ;

	RECT r; // source rect
	::SetRect(&r,0,nMenu,m_nScreenXSize,m_nScreenYSize);

	// [Konami] added: an all-zero update rect draws nothing
	if (lpRect != NULL && lpRect->left == 0 && lpRect->top == 0
		&& lpRect->right == 0 && lpRect->bottom == 0) return ;
	
	if (m_nSecondaryOffsetX || m_nSecondaryOffsetY) {
		//	転送先オフセットがかかっているのか？
		RECT r2; // distination rect
		if ( lpRect == NULL ){	// 部分更新か？
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

			// menu 領域チェック(以下の上領域に影響)
			int top = r2.top;
			if ( nMenu && top > 0 ){
				top = nMenu;
			}

			DDBLTFX fx;
			ZERO(fx);	//	一応初期化
			fx.dwSize = sizeof(fx);
			fx.dwFillColor = lpSecondarySurface->GetFillColor();

			RECT br[4];
			::SetRect(&br[0],0,nMenu,m_nScreenXSize,top);					//	上領域
			::SetRect(&br[1],0,r2.top,r2.left,r2.bottom);					//	左領域
			::SetRect(&br[2],r2.right,r2.top,m_nScreenXSize,r2.bottom);		//	右領域
			::SetRect(&br[3],0,r2.bottom,m_nScreenXSize,m_nScreenYSize);	//	下領域

			if (CAppInitializer::IsFullScreen()){
				// フルスクリーンでも、Bltなのら！
				lpPrimary->Blt(&br[0],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 上領域

				//	main画像
				lpPrimary->BltFast(r2.left,r2.top,lpSecondary,&r,DDBLTFAST_WAIT);

				lpPrimary->Blt(&br[1],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 左領域
				lpPrimary->Blt(&br[2],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 右領域
				lpPrimary->Blt(&br[3],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 下領域
			} else {
				// DirectDrawClipperを利用するにはBltにしなくてはならない。
				// しかし、なんちゅー制限や。いい加減にして欲しい>Clipper君！
				POINT cp;
				cp.x = cp.y = 0;
				::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！

				::OffsetRect  (&br[0],cp.x,cp.y);
				lpPrimary->Blt(&br[0],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 上領域

				//	main画像
				RECT br2 = r2;
				::OffsetRect(&br2,cp.x,cp.y);
				lpPrimary->Blt(&br2,lpSecondary,&r,DDBLT_WAIT,NULL);

				::OffsetRect  (&br[1],cp.x,cp.y);
				lpPrimary->Blt(&br[1],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 左領域
				::OffsetRect  (&br[2],cp.x,cp.y);
				lpPrimary->Blt(&br[2],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 右領域
				::OffsetRect  (&br[3],cp.x,cp.y);
				lpPrimary->Blt(&br[3],NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx); // 下領域
			}
		}else{
			// 部分更新
			r  = *lpRect;	// source rest;
			r2 = *lpRect;	// dest	 rest;
			if (CAppInitializer::IsFullScreen()){
				// from CPlane DRAW_CLIPPER
				RECT& sr = r;
				int x = m_nSecondaryOffsetX;
				int y = m_nSecondaryOffsetY;
				{
					RECT clip;
					::SetRect(&clip,0,nMenu,m_nScreenXSize,m_nScreenYSize);
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
				::OffsetRect(&r2,m_nSecondaryOffsetX,m_nSecondaryOffsetY);
				if ( nMenu && nMenu > r2.top ) {
					r.top += - r2.top+nMenu;
					r2.top = nMenu;
				}

				POINT cp;
				cp.x = cp.y = 0;
				::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！
				::OffsetRect(&r2,cp.x,cp.y); 

				lpPrimary->Blt(&r2,lpSecondary,&r,DDBLT_WAIT,NULL);
			}
			
		}
		
	} else {
		//	転送オフセットが指定されていないフツーの場合
		
		if (CAppInitializer::IsFullScreen()){
			if (/*m_bUseFlip2*/ false && lpRect == NULL ){
				lpPrimary->Flip(NULL,DDFLIP_WAIT);
			} else {
				if ( lpRect != NULL ){
					r = *lpRect;
					if ( r.top < nMenu ){
						r.top = nMenu;
					}
				}
				lpPrimary->BltFast(r.left,r.top,lpSecondary,&r,DDBLTFAST_WAIT);
			}
		} else {
			// DirectDrawClipperを利用するにはBltにしなくてはならない。
			// しかし、なんちゅー制限や。いい加減にして欲しい>Clipper君！
			POINT cp;
			cp.x = cp.y = 0;
			::ClientToScreen(m_hWnd,&cp); // クライアントウィンドゥの矩形内左上！
			if ( lpRect != NULL ) {
				r = *lpRect;
				if ( r.top < nMenu ){
					r.top = nMenu;
				}
			}
			RECT sr = r;
			::OffsetRect(&sr,cp.x,cp.y);
			lpPrimary->Blt(&sr,lpSecondary,&r,DDBLT_WAIT,NULL);
		}
	}
	
//	m_bDirty = false;
}

/******************************************************************************/
/*●概要	引数のウィンドウが子供（孫も含む）かどうか調べる
/*　　　	NULLになるまで再帰的に調べていく
/*●引数	I  [1]:このHWNDが自分の子供かどうかを調べる
/*●戻値	引数のウィンドウが子孫なら true
/*　　　	赤の他人なら false
/*●備考	なし
/*●履歴	Generate at 02.04.26  S.SHIMA
/*　　　	Update   at
/******************************************************************************/
// @yo2 0x00451660 feat
bool CFastDraw::IsChildWindow( HWND hWnd )
{
	HWND hWnd_P = ::GetWindow( hWnd, GW_OWNER ); // オーナーウィンドウGET

	if( hWnd_P == m_hWnd ){
		return true; // 私はhWnd のオーナーである
	}
	else if( hWnd_P == NULL ){
		return false; // 私はhWnd のオーナーではない
	}
	else{
		// わからなかったらさらに親を調べていく
		return IsChildWindow( hWnd_P );
	}
}

/******************************************************************************/
/*●概要	自分のウィンドウより上にあるウィンドウのサイズを取得する
/*●引数	I  [1]:これにRECT構造体をつめていく
/*●機能	一番TOPのウィンドウをGETして、そこから順次下のウィンドウをGETしてく
/*　　　	自分になるまでのウィンドウのRECT構造体をvector にSETしていく
/*　　　	そのとき、サイズが 0 のウィンドウや、自分のウィンドウサイズより
/*　　　	大きなウィンドウは無視する
/*●戻値	自分の上にウィンドウが重なっていなかったら true
/*　　　	重なっているウィンドウがあったら false
/*●備考	なし
/*●履歴	Generate at 02.04.26  S.SHIMA
/*　　　	Update   at 02.06.21  KAIZA    下部にはみ出したウィンドウが取れないバグ対応
/******************************************************************************/
// @yo2 0x004516b0 feat
bool CFastDraw::GetAllWindowRect( vector<RECT> &vRect )
{
	HWND hWnd = ::GetTopWindow(NULL); // 一度一番上のウィンドウをGETして
	RECT rc; // メッセージボックスなどのウィンドウのサイズ

	do{
		// たぶん一番最初にチェックするだけでいいと思うけど一応毎回チェック
		if( hWnd == NULL ){ break; }

		if( IsChildWindow( hWnd ) ){ // hWndが子孫だったら

			GetWindowRect( hWnd, &rc ); // そのウィンドウの大きさGET

			// 大きさ0、領域外にあるウィンドウとか、画面ウィンドウより大きいウィンドウは無視
			if( 0 < rc.right  &&
				0 < rc.bottom &&
				rc.left <= m_nScreenXSize &&
				rc.top  <= m_nScreenYSize &&
				(rc.right -rc.left) <= m_nScreenXSize &&
				(rc.bottom-rc.top ) <= m_nScreenYSize )
			{
				vRect.push_back( rc ); // そのRECT構造体をSETしていく
			}
		}

		hWnd=::GetNextWindow( hWnd, GW_HWNDNEXT); // 一段下にあるウィンドウをGET

	}while( hWnd!=m_hWnd ); // 自分じゃなかったらループ続行

	return vRect.empty(); // 自分の上にウィンドウが無かったら true
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x004517d0 review
void	CFastDraw::RealizeBrightness(int nBrightness){
	if (m_nBrightness==256) return ;
	//	これだけでええんか＾＾；　得した＾＾；
	GetSecondary()->FadeEffect(nBrightness);
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00451810 review
void	CFastDraw::SetEraseBackground(bool bErase) {
	m_bEraseBackground = bErase;
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00451830 vt
LRESULT		CFastDraw::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){

	switch(uMsg){
	case WM_ERASEBKGND :
		//  背景を自動消去しない
		return m_bEraseBackground ? 0 : 1;

	case WM_PAINT : {
		//	dirty rectが発生
//		m_bDirty = true;
//		if (!CWindow::IsFullScreen()) OnDraw();	//	一応、再描画してまう。
//		OnDraw();
		/*
			これ外していたのだが、もしコメントを外すとしても
			WM_PAINTの処理中にはGetDCは使えないので注意が必要。
			（GetDCで取得したデバイスコンテキストに描画するとWM_PAINTが発生するから）
			WM_PAINTの処理中にWM_PAINTが発生するんで、アプリケーションはWM_PAINTの
			処理しかできなくなる！
		*/

		if(hWnd != m_hWnd) return 0;		// 自分のウィンドウじゃなけりゃ無視

		PAINTSTRUCT paintstruct;
		::BeginPaint(m_hWnd,&paintstruct);  // 描き直すべき最小矩形領域をGET
		RECT rcPaint = paintstruct.rcPaint; // ← こいつはクライアント座標
		::EndPaint(m_hWnd,&paintstruct);

		//	もし、サーフェースが消失していれば...
		if (m_bLostSurface) {
			//	スレッドがもう破棄されるのならばリストアは無効...
			if (!CAppManager::GetMyApp()->IsThreadValid()) return 0;
			CheckSurfaceLost();
			//	このフラグは、メッセージポンプ側で
			//	リストアイベントに応じて設定される
			m_bLostSurface = false;
		}

		if( !CAppInitializer::IsFullScreen() ){ // フルスクリーンじゃなかったら
			InnerOnDraw( &rcPaint ); // その最小矩形領域をかきかきしてもらう
			return 0; // で、すぐ終わり
		}

		////////////////////////////////////////////////////////////////////////////////
		// ここから下はフルスクリーンのときの処理
		////////////////////////////////////////////////////////////////////////////////

		// メニューが出ている場合はその分を補正
		if(m_bMenuDrawing) {
			rcPaint.top    += m_nMenu;
			rcPaint.bottom += m_nMenu;
		}

		// 1.まず画面全体を更新領域とする
		m_DirtyRect.Clear();
		m_DirtyRect.AddRect( rcPaint );

		// 2.次に重なっている全ウィンドウのRECT構造体を取得する
		vector<RECT> vRect;
		if( GetAllWindowRect( vRect ) ){ // もし重なってるウィンドウが無かったら
			// GETした最小矩形領域をかきかきしてもらい、すぐ終わり
			InnerOnDraw( &rcPaint );
			return 0;
		}

		// 3.つぎにメッセージボックスやダイアログなどの領域を除く
		int nLoop = vRect.size(); // 重なっている全ウィンドウの個数
		for( int i = 0; i < nLoop; i++ ){
			// スクリーン座標からクライアント座標に変換してあげる
			POINT p;
			p.x = vRect[i].left;
			p.y = vRect[i].top;
			::ScreenToClient(hWnd, &p);

			// メニューを表示しているならその分を高さに足してあげる
			if(m_bMenuDrawing)	p.y += m_nMenu;

			int sx = vRect[i].right  - vRect[i].left;
			int sy = vRect[i].bottom - vRect[i].top;

			// DirtyRectからこの矩形を減算する
			m_DirtyRect.SubRectSize( p.x, p.y, sx, sy );
		}

		m_DirtyRect.Refresh(); // ガベージ

		// 4.残った領域のみ描画
		OnDraw( &m_DirtyRect );

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

	// [Konami] added: entering a menu loop in full screen marks the menu as drawn
	case WM_ENTERMENULOOP: {
		m_bMenuDrawing = IsFullScreen();
		return 0;
						   }
	case WM_PALETTECHANGED: {
		//	（パレットのリアライズ後に）
		// yaneGTL.hで使用する、RGB555⇒256の変換テーブルの初期化
		CFastPlaneBlendTable::OnChangePalette();	
		return 0;
							}

	} // end switch


	return 0;
}

#endif // USE_FastDraw
