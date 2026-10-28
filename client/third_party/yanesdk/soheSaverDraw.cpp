#include "stdafx.h"

#ifdef USE_SAVER

#include "soheSaverDraw.h"
#include "yaneTimer.h"

//////////////////////////////////////////////////////////////////////////////

int		CSaverDraw::GetMode	  (void){ return ((CSaverBase*)CAppManager::GetMyApp())->GetMode   ();}	//	スクリーンセーバーのモードを返す
bool	CSaverDraw::IsMain	  (void){ return ((CSaverBase*)CAppManager::GetMyApp())->IsMain	   ();}	//	通常起動されたかどうか
bool	CSaverDraw::IsPreview (void){ return ((CSaverBase*)CAppManager::GetMyApp())->IsPreview ();}	//	プレビューのために起動されたかどうか
bool	CSaverDraw::IsConfig  (void){ return ((CSaverBase*)CAppManager::GetMyApp())->IsConfig  ();}	//	設定かどうか
bool	CSaverDraw::IsPassword(void){ return ((CSaverBase*)CAppManager::GetMyApp())->IsPassword();}	//	パスワードかどうか

CSaverDraw::CSaverDraw(void) {
	CSaverBase* lpSaver = (CSaverBase*)CAppManager::GetMyApp();
	lpSaver->GetHelper()->GetSize(m_nRealWidth, m_nRealHeight);
//	m_nScreenColor	= 16;
//	m_bFullScr		= false;
	m_bAutoSize		= true;

	//	スクリーンセーバーにメニューはいらない
	
	m_nSecondaryOffsetX = 0;
	m_nSecondaryOffsetY = 0;
	m_nBrightness	= 256;

	m_hWnd	= CAppInitializer::GetHWnd();
	CAppManager::Add(this);
	CAppInitializer::Hook(this);		//	フックを開始する

	//	描画ウェイトのために、最小タイムインターバルに設定する
	CTimeBase::timeBeginPeriodMin();
}

CSaverDraw::~CSaverDraw(){
	//	描画ウェイトの最小タイムインターバルを解除する
	CTimeBase::timeEndPeriodMin();

	CAppInitializer::Unhook(this);		//	フックを解除する。
	CAppManager::Del(this);
}
//	暫定的な関数
void	CSaverDraw::CreateSecondary(void) {
	if (m_lpSecondary == NULL) {	//	始めてなら作る
		m_lpSecondary.Add( new CDIB32 );
		if (m_lpSecondary==NULL) {
			Err.Out("CDIBDraw::TestDisplayModeでCreateSecondaryに失敗");
			return ;	//	メモリ足らんのか？＾＾
		}
		m_lpSecondary->UseDIBSection(true); //	GetDCの可能なサーフェース
	}
	//	ここでサイズが要求されるので、ディスプレイモードの変更が完了していること。
	if (m_lpSecondary->CreateSurface(m_nUserScreenXSize, m_nUserScreenYSize)){
		//	メモリ足らんのか？＾＾
		Err.Out("CDIBDraw::TestDisplayModeでCreateSecondaryに失敗");
		m_lpSecondary.Delete();
		return ;
	}
	if (IsAutoSize()) {
		m_vTempDIB.UseDIBSection(true);
		m_vTempDIB.CreateSurface(m_nRealWidth, m_nRealHeight);
	}
	m_bDirty = true;
}

//////////////////////////////////////////////////////////////////////////////
//	ディスプレイモードの設定→変更
//////////////////////////////////////////////////////////////////////////////
LRESULT	CSaverDraw::SetDisplay(bool bFullScr,int nSizeX,int nSizeY,int nColorDepth) {
	m_nUserScreenXSize = nSizeX;
	m_nUserScreenYSize = nSizeY;
	//	セカンダリ生成
	CreateSecondary();
	return 0;
}

//	MEMO 全て無効にしておく。気が向いたら実装
//////////////////////////////////////////////////////////////////////////////

void	CSaverDraw::SetBrightness(int nBright){
	if (m_nBrightness == nBright) return ;
	m_nBrightness = nBright;
	m_bDirty = true;
}

//////////////////////////////////////////////////////////////////////////////

void	CSaverDraw::SetOffset(int ox,int oy){
	//	セカンダリの転送オフセット
	m_nSecondaryOffsetX =	ox;
	m_nSecondaryOffsetY =	oy;
}

void	CSaverDraw::OnDraw(RECT* lpRect,bool bLayerCallBack){
	if (GetSecondary()==NULL) return ;
	HDC hDCS = GetSecondary()->GetDC();
	if (hDCS == NULL) return ;	// ないやん．．
	
	HDC hdc;
	/*
	if (!IsFullScreen()){
		hdc = ::GetDC(m_hWnd);
	} else {
		hdc = ::GetDC(NULL);
	}*/
	hdc = ::GetDC(m_hWnd);
	if (hdc == NULL) return ;	// あじゃー＾＾；


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
/*
	if (!IsFullScreen()){
		::ReleaseDC(m_hWnd,hdc);
	} else {
		::ReleaseDC(NULL,hdc);
	}
*/
	::ReleaseDC(m_hWnd,hdc);
	m_bDirty = false;
}

void	CSaverDraw::InnerOnDraw(HDC hDst,HDC hSrc,RECT* lpRect){
	//	最小化されているならば描画せずにリターン
	if (CAppManager::GetMyApp()->GetMyWindow()->IsMinimized()) return ;

	int nMenu = 0;/*
	if (m_nSecondaryOffsetX || m_nSecondaryOffsetY) {
		//	転送先オフセットがかかっているのか？
		RECT r; // source rect
		RECT r2; // distination rect
		if ( lpRect == NULL ){
			::SetRect(&r,0,nMenu,m_nUserScreenXSize,m_nUserScreenYSize);
			::SetRect(&r2,0,nMenu,m_nUserScreenXSize,m_nUserScreenYSize);	//	同一サイズと仮定して良い
			
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
			::SetRect(&br,0,nMenu,m_nUserScreenXSize,top);					//	上領域	
			//::SetRect(&br,0,nMenu,m_nUserScreenXSize,r2.top);					//	上領域	
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,0,r2.top,r2.left,r2.bottom);					//	左領域
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,r2.right,r2.top,m_nUserScreenXSize,r2.bottom);	//	右領域
			::BitBlt(hDst,br.left,br.top,br.right-br.left,br.bottom-br.top,hSrc,r.left,r.top,BLACKNESS);
			::SetRect(&br,0,r2.bottom,m_nUserScreenXSize,m_nUserScreenYSize);	//	下領域
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
		
	} else {*/
		if ( lpRect == NULL ){
			//	転送先オフセット無しの、普通の転送
			if (IsAutoSize()) {
				SIZE size = {m_nRealWidth, m_nRealHeight-nMenu};
				m_vTempDIB.Blt(GetSecondary(), 0, 0, NULL, &size);
				hSrc = m_vTempDIB.GetDC();
			}
			::BitBlt(hDst,0,nMenu,
				m_nRealWidth,m_nRealHeight-nMenu,hSrc,0,nMenu,SRCCOPY);
		} else{
			// オフセットなし、矩形有り
			RECT r = *lpRect;
			if ( nMenu > r.top ) r.top = nMenu;
			if (IsAutoSize()) {
				SIZE size = {m_nRealWidth, m_nRealHeight-nMenu};
				m_vTempDIB.Blt(GetSecondary(), 0, 0, NULL, &size);
				hSrc = m_vTempDIB.GetDC();
			} 
			::BitBlt(hDst,r.left,r.top,r.right-r.left,r.bottom-r.top,hSrc,r.left,r.top,SRCCOPY);
		}
//	}
}

//////////////////////////////////////////////////////////////////////////////
//	CPlaneBaseのメンバ関数。全部、委譲＾＾；
LRESULT CSaverDraw::Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->Blt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BltFast(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBlt(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return static_cast<CPlaneBase*>(GetSecondary())->BlendBltFast(lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::MosaicEffect(int d, LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->MosaicEffect(d,lpRect);
}
LRESULT CSaverDraw::FlushEffect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->FlushEffect(lpRect);
}
void	CSaverDraw::GetSize(int &x,int &y) {
	static_cast<CPlaneBase*>(GetSecondary())->GetSize(x,y);
}
LRESULT CSaverDraw::ClearRect(LPRECT lpRect){
	return static_cast<CPlaneBase*>(GetSecondary())->ClearRect(lpRect);
}
LRESULT CSaverDraw::Load(string szBitmapFileName,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->Load(szBitmapFileName,bLoadPalette);
}
LRESULT CSaverDraw::LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette){
	return static_cast<CPlaneBase*>(GetSecondary())->LoadW(
		szBitmapFileName256,szBitmapFileNameElse,bLoadPalette);
}
LRESULT CSaverDraw::Release(void){
	return static_cast<CPlaneBase*>(GetSecondary())->Release();
}
LRESULT CSaverDraw::SetColorKey(int x,int y){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(x,y);
}
LRESULT CSaverDraw::SetColorKey(int r,int g,int b){
	return static_cast<CPlaneBase*>(GetSecondary())->SetColorKey(r,g,b);
}

bool CSaverDraw::IsLoaded(void) const {
	//	GetSecondary()では、const性が失われるので…
	return m_lpSecondary->IsLoaded();
}

LRESULT CSaverDraw::BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltFastClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlpha(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::FadeBltAlpha(CPlaneBase* lpDIBSrc32,int x,int y,int nFadeRate){
	return ((CPlaneBase*)GetSecondary())->FadeBltAlpha(lpDIBSrc32,x,y,nFadeRate);
}

LRESULT CSaverDraw::BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltFastClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BlendBltFastAlphaM(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
}

void	CSaverDraw::BltFix(CSprite*lpSprite,int x,int y,LPRECT lpClip){
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

void	CSaverDraw::BltOnce(CSprite*lpSprite,int x,int y,LPRECT lpClip){
	BltFix(lpSprite,x,y,lpClip);
	
	//	ケツになっていたら、それ以上は加算しない
	int n=lpSprite->GetMotion();
	lpSprite->IncMotion();
	if (lpSprite->GetMotion()==0) {
		lpSprite->SetMotion(n);
	}
}

LRESULT CSaverDraw::Clear(DWORD dwDIB32RGB,LPRECT lpRect){
	return GetSecondary()->Clear(dwDIB32RGB,lpRect);
}

LRESULT CSaverDraw::BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltNatural(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
}
LRESULT CSaverDraw::BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,int nFade,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	return GetSecondary()->BltNatural(lpDIBSrc32,x,y,nFade,lpSrcRect,lpDstSize,lpClipRect);
}

LRESULT CSaverDraw::RealizePalette(void){
	HDC hdc = ::GetDC(NULL);	//	プライマリ取得して、そのパレットを設定
	if (hdc==NULL) return 1;
	LRESULT lr=0;
	if (m_Palette.Set(hdc)) lr=2;
	::ReleaseDC(NULL,hdc);
	return lr;
}
//////////////////////////////////////////////////////////////////////////////
LRESULT CSaverDraw::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){
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
		hdc = ::BeginPaint(m_hWnd,&paintstruct);
		InnerOnDraw(hdc,hDCS);
		::EndPaint(m_hWnd,&paintstruct);
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
#endif

