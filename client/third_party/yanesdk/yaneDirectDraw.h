// yaneDirectDraw.h
//	 This is DirectDraw wrapper.
//		programmed by yaneurao(M.Isozaki) '99/06/20
//		rewritten by yaneurao(M.Isozaki)  '00/07/08

#ifndef __yaneDirectDraw_h__
#define __yaneDirectDraw_h__

#include "yanePlaneBase.h"
#include "yanePlane.h"
#include "yaneFastPlane.h"
#include "yaneDIB32.h"
#include "yaneWinHook.h"
#include "yaneLayer.h"
#include "yaneSprite.h"

//////////////////////////////////////////////////////////////////////////////
//	surface bpp(bits per pixel manager)
//////////////////////////////////////////////////////////////////////////////

class CBppManager {
public:
	static int GetBpp();
	//	↑いつでも取得できますー＾＾；

	static void Reset();
	//	↑画面のbppが変わったときは、この関数呼び出してね！

protected:
	static int m_nBpp;
};

//////////////////////////////////////////////////////////////////////////////
//	IDirectDraw wrapper
//////////////////////////////////////////////////////////////////////////////

#if defined(USE_DirectDraw) || defined(USE_FastDraw) || defined(USE_DIB32)

//	このクラスは、singletonバージョン
class CDirectDrawBase {
public:
	static LPDIRECTDRAW GetDirectDrawPtr() { return m_lpDirectDraw; }

	CDirectDrawBase(bool bEmulationOnly=false);
	virtual ~CDirectDrawBase();

protected:
	static		LRESULT Initialize(bool bEmulationOnly=false);	//	DirectDraw interfaceを得る
	static		LRESULT Terminate();	//	DirectDraw interfaceを解放する

	static		LPDIRECTDRAW	m_lpDirectDraw; // こいつがインターフェース
	static		int m_nRef;			//	参照カウンタ
};

//	このクラスは、非singletonバージョン
class CDirectDrawBaseM {
public:
	LPDIRECTDRAW GetDirectDrawPtr() { return m_lpDirectDraw; }

	CDirectDrawBaseM(bool bEmulationOnly=false);
	virtual ~CDirectDrawBaseM();

protected:
	LRESULT Initialize(bool bEmulationOnly=false);	//	DirectDraw interfaceを得る
	LRESULT Terminate();	//	DirectDraw interfaceを解放する

	LPDIRECTDRAW	m_lpDirectDraw; // こいつがインターフェース
};


#endif

//////////////////////////////////////////////////////////////////
//	surface bpp manager
//////////////////////////////////////////////////////////////////
#if defined(USE_DirectDraw) || defined(USE_FastDraw)

//	ピクセルフォーマット調べるねん！
class CDirectDrawSurfaceManager {
public:
	static int GetSurfaceType();
	//	↑いつでも取得できますー＾＾；
	/*
		0:	不明(未調査:OnChangeSurfaceがまだ呼び出されていない)
		1:	以下の以外
		2:	8bpp
		3:	16(RGB565)
		4:	16(RGB555)
		5:	24(RGB888)
		6:	24(BGR888)
		7:	32(XRGB8888)
		8:	32(XBGR8888)

		10:	16+a4(ARGB4565)	//	実際は、これが返ってくることは無い
		11:	16+a4(ARGB4555)	//	実際は、これが返ってくることは無い
		12:	32(ARGB8888)	//	実際は、これが返ってくることは無い
		13:	32(ABGR8888)	//	実際は、これが返ってくることは無い

	*/

	static void OnChangeSurface(LPDIRECTDRAWSURFACE);
	//	↑画面のbppが変わったときは、この関数呼び出してね！
	//	そうすれば、上のGetSurfaceTypeで、
	//	そのサーフェースの値が返るようになるので！

	static int GetSurfaceType(LPDIRECTDRAWSURFACE);
	//	↑特定サーフェースのサーフェースタイプを調べることが出来る！

protected:
	static int m_nType;
};

#endif	//	#if defined(USE_DirectDraw) || defined(USE_FastDraw)

//////////////////////////////////////////////////////////////////
//	Window Clipper
//////////////////////////////////////////////////////////////////

#if defined(USE_DirectDraw) || defined(USE_FastDraw)

#ifdef USE_FastDraw
class CFastPlane;	//	Clipで必要となるので前方宣言。
#endif

class CWindowClipper {
public:
#ifdef USE_DirectDraw
	LRESULT Clip(CPlane*lpPrimary,HWND hWnd);	//	こいつをクリップする
#endif
#ifdef USE_FastDraw
	LRESULT Clip(CFastPlane*lpPrimary,HWND hWnd);	//	こいつをクリップする
#endif
	void	Release(void);						//	クリッパを解放する

	CWindowClipper(void);
	virtual ~CWindowClipper();

protected:
	LPDIRECTDRAWCLIPPER m_lpClipper;
};

#endif	//	#if defined(USE_DirectDraw) || defined(USE_FastDraw)

//////////////////////////////////////////////////////////////////////////////
//	CDirectDraw (DirectDrawWrapper)
//////////////////////////////////////////////////////////////////////////////
#ifdef	USE_DirectDraw

class CDirectDraw : public CWinHook,public CPlaneBase {
public:

	//////////////////////////////////////////
	//	ディスプレイモードの変更

	LRESULT		SetDisplay(bool bFullScr=false,int nSizeX=0,int nSizeY=0,int nColorDepth=0);
	void		GetDisplay(bool&bFullScr,int &nSizeX,int &nSizeY,int &nColorDepth);
	bool		IsFullScreen(void);
	int			GetBpp(void);	// 現在のBppの取得

	//	Begin～Endでディスプレイモードを変更する。
	void		BeginChangeDisplay(void);
	void		TestDisplayMode(int nSX,int nSY,bool bFullScr=false,int nColor=0);
	LRESULT		EndChangeDisplay(void);

	//	フリップは使うのか？
	void		SetFlipUse(bool);	// fullscreenでDirectDrawのFlipを使うか？
	bool		GetFlipUse(void);	// 結果の取得
	void		FlipToGDISurface(void); //	GDISurfaceにフリップする

	//////////////////////////////////////////
	//	プライマリとセカンダリの取得

	CPlane*		GetPrimary(void)		{ m_bDirty = true; return &m_Primary; }
	CPlane*		GetSecondary(void)		{ m_bDirty = true; return &m_Secondary; }

	//	汚しフラグを立てる
	void		Invalidate(void) { m_bDirty = true; }

#ifdef USE_DIB32
	LRESULT		CreateSecondaryDIB(void);
	void		ReleaseSecondaryDIB(void);
	CDIB32*		GetSecondaryDIB(void)	{ return m_lpSecondaryDIB; }
#endif

	//	サーフェースのロストチェック
	void		CheckSurfaceLost(void);

	///////////////////////////////////////////////////////////////////////////
	//	Secondaryプレーンへの転送系(基本的にCPlaneに委譲する)
	
	LRESULT		Blt(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BltFast(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBlt(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltFast(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);

	LRESULT		BltR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BltFastR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltFastR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);

	//	override from CPlaneBase
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return -1; // not supported
	}
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {;
		return -1; // not supported
	}
	virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate){
		return -1; // not supported
	}
	virtual bool IsLoaded(void) const;

#ifdef USE_DIB32
	LRESULT		Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL);
#endif

	//////////////////////////////////////////
	//	Secondaryプレーンの描画系(Secondaryプレーンに委譲する)
	
	LRESULT		Clear(LPRECT lpRect=NULL);
	LRESULT		SetFillColor(COLORREF c);		//	Clearする色を指定する(Default==RGB(0,0,0))
	DWORD		GetFillColor(void);				//	FillColorする色

	///////////////////////////////////////////////////////////////////////////
	//	SecondaryDIBへの転送系(基本的にCDIB32に委譲する)
	
	//		関数用意するの面倒だから、GetSecondaryDIB()からやってね＾＾

	//////////////////////////////////////////
	//	Secondary->Primaryプレーンの転送
	
	virtual void	OnDraw(RECT* lpRect=NULL,bool bLayerCallBack=true);//	Secondary->Primaryへの転送
#ifdef USE_DIB32
	virtual void	OnDrawDIB(RECT* lpRect=NULL,bool bLayerCallBack=true);//	SecondaryDIB->Primaryへの転送
#endif
	void	SetOffset(int ox,int oy);	//	セカンダリの転送オフセット
	void	SetBrightness(int nBright); //	フェード

	//////////////////////////////////////////
	//	レイヤの管理

	//	Layerのリストを返す
	CLayerList* GetLayerList(void) { return &m_LayerList; }
	CLayerList* GetAfterLayerList(void) { return &m_AfterLayerList; }
	CLayerList* GetHDCLayerList(void) { return &m_HDCLayerList; }

	//////////////////////////////////////////
	//	CPlaneBaseとして振舞うための関数(すべてSecondaryへ委譲する)

	//	CPlaneBaseの関数の実装を保証
	virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRat
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL);
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL);
	virtual void	GetSize(int &x,int &y);
	virtual LRESULT ClearRect(LPRECT lpRect=NULL);
	virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=false);
	virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette=true);
	virtual LRESULT Release(void);
	virtual LRESULT SetColorKey(int x,int y);
	virtual LRESULT SetColorKey(int r,int g,int b);

	//////////////////////////////////////////
	//	スプライト描画

	//	通常描画
	void	Blt(CSprite*lpSprite,LPRECT lpClip=NULL){int x,y;lpSprite->GetPos(x,y);Blt(lpSprite,x,y,lpClip);}
	//	(x,y)に描画
	void	Blt(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL){ BltFix(lpSprite,x,y,lpClip); lpSprite->IncMotion(); }
	//	通常描画(モーション進めず)
	void	BltFix(CSprite*lpSprite,LPRECT lpClip=NULL){int x,y;lpSprite->GetPos(x,y);BltFix(lpSprite,x,y,lpClip);}
	//	(x,y)に描画(モーション進めず)
	void	BltFix(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL);
	//	ケツになっていたら、それ以上は加算しない
	void	BltOnce(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL);

	//////////////////////////////////////////
	//	おまけ

	//	これでDirectDrawPtrを取得する
	LPDIRECTDRAW	GetDDraw() { return m_DirectDrawBase.GetDirectDrawPtr(); }

	//////////////////////////////////////////

	CDirectDraw(void);
	virtual ~CDirectDraw();

protected:
	//	マルチウィンドゥ対応版と差し替え
	CDirectDrawBaseM m_DirectDrawBase;

	//	これでDirectDrawPtrを取得する
//	LPDIRECTDRAW	GetDDraw(void) { return m_DirectDrawBase.GetDirectDrawPtr(); }

	//	画面モードの変更関連
	LRESULT		ChangeDisplay(bool bFullScr);	//	現在のディスプレイモードを反映させる
	bool	m_bFullScr;			//	フルスクリーンモードか？
	int		m_nScreenXSize;		//	画面サイズ
	int		m_nScreenYSize;
	int		m_nScreenColor;		//	画面bpp
	bool	m_bDisplayChanging; //	解像度変更中
	bool	m_bChangeDisplayMode;// ディスプレイモードを変更するか // 追加

	//	プライマリサーフェースとセカンダリサーフェース
	CPlane	m_Primary;
	CPlane	m_Secondary;
	bool	m_bUseFlip;			//	フルスクリーン時にフリップを使うのか(ユーザーの希望)
	bool	m_bUseFlip2;		//	フリップを使うモードになっているのか(現状)
	CWindowClipper m_WindowClipper;
	int		m_nSecondaryOffsetX;		//	セカンダリの転送オフセット量
	int		m_nSecondaryOffsetY;

#ifdef USE_DIB32
	//	セカンダリDIB32サーフェース
	CDIB32* m_lpSecondaryDIB;
#endif

	bool	m_bDirty;			//	セカンダリプレーンは前回プライマリに転送したときから汚れたか？
	HWND	m_hWnd;				//	いちいちCAppInitializerから取得すると遅くなるので

	//	for Layer management
	CLayerList	m_LayerList;
	CLayerList	m_AfterLayerList;
	CLayerList	m_HDCLayerList;

	//	画面のフェード関連(OnDrawで利用される)
	int		m_nBrightness;
	void	RealizeBrightness(int nBrightness);

	//	サーフェースのロストチェック（内部用）
	bool	m_bLostSurface;

	// override from CWinHook
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);
};
#endif //  #if defined(USE_DirectDraw) || defined(USE_FastDraw)

//////////////////////////////////////////////////////////////////////////////

#endif // __yaneDirectDraw_h__
