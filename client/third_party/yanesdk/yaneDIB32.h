//
//	Device Independent Bitmap
//
#ifdef USE_DIB32

#ifndef __yaneDIB32_h__
#define __yaneDIB32_h__

#include "yanePlaneBase.h"
#include "yaneFastPlaneInfo.h"

#ifdef USE_DirectDraw
class CPlane;
#endif
/*
	DirectDrawSurfaceとの親和性を計るならば、
		//	DIB32はGDIとは異なり、下位からB,G,R,α
		//	CreateDIBSectionで作った場合も、下位からB,G,R,α。
		//	ちなみにGDIは、下位からR,G,B,0(COLORREF)。RGB(r,g,b)マクロが使える。
*/
//	#define DIB32RGB(r,g,b) ( ((DWORD)r)<<16 | ((DWORD)g)<<8 | b )
//	↑これだが、r,g,b<=255をチェックしたほうが安全なので、そういうコードにする。
inline DWORD DIB32RGB(DWORD r,DWORD g,DWORD b){
	WARNING(r>=256 || g>=256 || b>=256,"DIB32RGBで値がオーバーしています");
	return ( ((DWORD)r)<<16 | ((DWORD)g)<<8 | b );
}

class CDIB32;
class CDIB32P5;
class CDIB32PMMX;
class CDIB32P6;
class CBumpMap;

class CDIB32Base {

	//	こんなん書かんとあかんかー。ダサいのー。
	friend class CDIB32P5;
	friend class CDIB32PMMX;
	friend class CDIB32P6;
	friend class CDIB32Effect;

public:
	////////////////////////////////////////////////////////
	virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=false);

	LRESULT Save(string BitmapFileName,LPRECT lpRect=NULL);

#ifdef USE_YGA
	LRESULT SaveYGA(string YGAFileName,LPRECT lpRect=NULL,bool bCompress = true);
#endif

	LRESULT CreateSurface(int nSizeX,int nSizeY);
	LRESULT Resize(int nSizeX,int nSizeY);
	LRESULT	Release(void);
	bool	IsLoad(void) const;

	////////////////////////////////////////////////////////
	//	CreateDIBSectionを使うのか？

	void	UseDIBSection(bool bUseDIB);
	//	----- CreateDIBSectionを使うときに限り、以下の関数が使用可能 -----

	//	HDC取得(解放は不要。LoadかCreateSurfaceしたあとは解放するまで取得可能)
	HDC		GetDC(void);
	HBITMAP	GetHBITMAP(void);

#ifdef USE_DirectDraw
	LRESULT	BltToPlane(CPlane*lpDstPlane,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL);
	LRESULT	BltFromPlane(CPlane*lpSrcPlane,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL);
#endif

	////////////////////////////////////////////////////////

	// 透過キー設定関連
	LRESULT SetColorKey(DWORD dwDIB32RGB);	// 特定の色を転送のときの透過キーに設定する
	LRESULT SetColorKey(int x,int y);	// (x,y)の点を透過キーに設定する
	LRESULT SetColorKey(int r,int g,int b);
	DWORD	GetColorKey(void);

	//	矩形描画
	virtual LRESULT Blt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT BlendBltHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT BlendBlt(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFast(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT AddColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT AddColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT SubColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT SubColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFastWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	// ミラー付き矩形描画
	virtual LRESULT BltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT AddColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT AddColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT SubColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT SubColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFastWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	virtual LRESULT BltNatural(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltNatural(CDIB32* lpDIBSrc32,int x,int y,int nFade,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	// @yo2 0x00435e20 vt
	virtual	bool IsYGA(void) { return m_bYGA; }
	// @yo2 0x00435e40 vt
	virtual bool* GetYGA(void) { return &m_bYGA; }

	virtual LRESULT BltToAlpha(CDIB32* lpSrc,int nSrcMin,int nSrcMax,int nDstMin=0,int nDstMax=255,LPRECT lpRECT=NULL)=0;
	virtual LRESULT FadeBltAlpha(CDIB32* lpSrc,int nFadeRate,LPRECT lpRect=NULL)=0;

	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL) = 0;
	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL) = 0;
	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false) = 0;
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL) = 0;
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL) = 0;
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false) = 0;

	virtual LRESULT RotateBlt(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL) = 0;
	virtual LRESULT RotateBltFast(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL) = 0;
	virtual LRESULT	BumpMapBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL) = 0;
	virtual LRESULT	BumpMapFastBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL) = 0;

	//	このプレーンに対するエフェクト

	virtual LRESULT AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect=NULL) = 0;
	virtual LRESULT SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect=NULL) = 0;
	virtual LRESULT ShadeOff(LPRECT lpSrcRect=NULL) = 0;
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL) = 0;
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL) = 0;
	virtual LRESULT FadeEffect(int nFade,LPRECT lpRect=NULL) = 0;
	virtual LRESULT FadeAlpha(int nFade,LPRECT lpRect=NULL) = 0;
	virtual LRESULT FlushAlpha(LPRECT lpRect=NULL) = 0;

	//	プレーンのピクセル操作
	DWORD	GetPixel(int x,int y);						//	ピクセル取得
	void	SetPixel(int x,int y,DWORD dwDIB32RGB);	//	ピクセル設定

	//	αの抽出(非YGA画像のときは抜き色以外ならば255)
	virtual int	GetPixelAlpha(int x,int y);

	void	GetSize(int& sx,int& sy);					//	プレーンサイズの取得
	LPRECT	GetRect(void);								//	このプレーンのサーフェース矩形取得
	DWORD*	GetPtr(void);								//	サーフェースへのポインタを取得
	RECT	GetClipRect(LPRECT lpRect);					//	このサーフェースでClipされたRectを返す

	LRESULT	Clear(DWORD dwDIB32RGB=CLR_INVALID,LPRECT lpRect=NULL);
	void	SetFillColor(DWORD dwDIB32RGB);		//	Clearする色の設定

	//	CFastPlaneに成りすます＾＾；
	CFastPlaneInfo* GetPlaneInfo() { return &m_vFastPlaneInfo; }

	CDIB32Base();
	virtual ~CDIB32Base();

protected:
	LRESULT InnerCreateSurface(int nSizeX,int nSizeY);
	void	ClearMSByte(void);	//	最上位バイトのクリア

#ifdef USE_YGA
	LRESULT	InnerLoadYGA(string BitmapFileName);	//	YGAのロードルーチン
#endif

	BYTE*	m_lpdwSrcOrg;	//	確保したDIBメモリ
	DWORD*	m_lpdwSrc;		//	確保したものをQWORDでアラインしたもの
	RECT	m_rcRect;		//	DIBのサイズは(m_rcRect.right,m_rcRect.bottom)
	auto_array<DWORD*> m_lpdwLineStart;	//	各ラインの先頭アドレステーブル
	LONG	m_lPitch;		//	１ラインのバイト数(通例m_nSizeX*4)
	//	よってPixel(x,y) = (BYTE*)m_lpdwSrc + x + y * m_lPitch

	//	FastPlaneからもDIBを使用するので、こんな変換子を用意
	CFastPlaneInfo	m_vFastPlaneInfo;

	DWORD	m_dwColorKey;	//	カラーキー
	DWORD	m_dwFillColor;	//	Clearするときの色
	
	//----------------
	LRESULT InnerLoad(string BitmapFileName); // DIBSectionを使っているとき用
	bool	m_bUseDIBSection;	//	DIBSectionを使うのか
	HBITMAP m_hBitmap;
	HDC		m_hDC;
	bool	m_bLoadBitmap;		//	ビットマップを読み込み中なのか？

	///////////////////////////////////////////////
	LRESULT TestClipping(LPRECT lpRectDstDIB, LPRECT lpRectSrcDIB, LPRECT lpRectSrc, LPPOINT lpDstPoint, LPRECT lpClip=NULL);
	
	///////////////////////////////////////////////////////////////////////////
	//	汎用クリッピングルーチン (c) yaneurao

	LRESULT	Clipping(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect);
	LRESULT	ClippingM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect);
	//	非0:転送範囲なしなので、このまま帰るべし
	//	0:	m_bActualSize==true
	//		等倍の転送			転送先矩形 m_rcDstRect
	//							転送元矩形:m_rcSrcRect
	//		m_bMirrorが真ならば左右ミラー
	//	0:	m_dbActualSize==false
	//		拡大縮小込みの転送	転送先矩形 m_rcDstRect
	//							転送元座標　矩形の左上:(m_rcSrcRect.left,m_rcSrcRect.top)
	//		m_bMirrorが真ならば左右ミラー
	//							転送元座標　矩形の右上:(m_rcSrcRect.right,m_rcSrcRect.top)
	//		※　このときのブレゼンハムの初期値,増量,符号反転時に引く量がそれぞれ
	//		m_nInitial,m_nStep,m_nCmpに入る。

	RECT	m_rcSrcRect;
	RECT	m_rcDstRect;
	bool	m_bMirror;		//	ミラーか？
	bool	m_bActualSize;	//	原寸大か？

	int		m_nInitialX;	//	-DX　 :　εの初期値 = -DX
	int		m_nStepX;		//	 2*SX :　ε+=2*SX
	int		m_nCmpX;		//	 2*DX :　ε>0ならばε-=2*DXしてね
	int		m_nStepsX;		//	 SrcXの一回の加算量(整数部)

	int		m_nInitialY;
	int		m_nStepY;
	int		m_nCmpY;
	int		m_nStepsY;

	//	クリップ有りのMorphルーチン
	// Srcのpointが 1辺でもはみ出していた場合、下のフラグが true になる
	bool	m_bSrcClip;		// Srcがクリッピングを要するか？

	bool	m_bYGA;			//	ＹＧＡ画像を扱っているのか？

#ifdef USE_YGA
	//	YPGのヘッダー
	struct SYPGHeader {
		DWORD dwIdentifier;
		DWORD dwSizeX;
		DWORD dwSizeY;
		DWORD bCompress;
		DWORD dwOriginalSize;
		DWORD dwCompressSize;
		SYPGHeader() { dwIdentifier = 0x616779; /* "yga" */ }
	};
#endif
};

///////////////////////////////////////////////////////////////////////////////


//	Pentium用コード
class CDIB32P5 : public CDIB32Base {
public:
	// 矩形描画
	virtual LRESULT Blt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBlt(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFast(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	virtual LRESULT AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect=NULL);
	virtual LRESULT SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect=NULL);
	virtual LRESULT ShadeOff(LPRECT lpSrcRect=NULL);
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL);
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL);
	virtual LRESULT FadeEffect(int nFade,LPRECT lpRect=NULL);
	virtual LRESULT FadeAlpha(int nFade,LPRECT lpRect=NULL);
	virtual LRESULT FlushAlpha(LPRECT lpRect=NULL);

	virtual LRESULT BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	// ミラー付き矩形描画
	virtual LRESULT BltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	virtual LRESULT BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	virtual LRESULT BltToAlpha(CDIB32* lpSrc,int nSrcMin,int nSrcMax,int nDstMin=0,int nDstMax=255,LPRECT lpRECT=NULL);
	virtual LRESULT FadeBltAlpha(CDIB32* lpSrc,int nFadeRate,LPRECT lpRect=NULL);

	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL);
	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL);
	virtual LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false);
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL);
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL);
	virtual LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false);
	virtual LRESULT RotateBlt(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL);
	virtual LRESULT RotateBltFast(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL);
	virtual LRESULT	BumpMapBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL);
	virtual LRESULT	BumpMapFastBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL);

protected:
};

//	MMX用コード
class CDIB32PMMX : public CDIB32P5 {
	//	必要な関数をオーバーライドする
public:
	// 矩形描画
	virtual LRESULT Blt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBlt(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFast(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect=NULL);
	virtual LRESULT SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect=NULL);
	virtual LRESULT BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlpha(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	// ミラー付き矩形描画
	virtual LRESULT BltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BltFastWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	//
protected:
};
//	PentiumPro,II用コード
class CDIB32P6 : public CDIB32PMMX {
	//	必要な関数をオーバーライドする
/*	virtual LRESULT Blt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
*/
};

////////////////////////////////////////////////////////////////////////////////////////

//	これはCDIB32Baseの代理母（デザインパターンで言うところのproxyパターン）
class CDIB32 : public CPlaneBase {
public:

	//	CPlaneBaseの派生クラスでは、これをオーバーライドすべし
	// @yo2 0x00435e60 vt
	virtual EDrawType GetID() const { return eDraw_CDIB32; }

	// @yo2 0x00435e80 vt
	virtual LRESULT Load(string BitmapFileName,bool bLoadPalette=false) {
		return m_lpDIB->Load(BitmapFileName,bLoadPalette);
	}
	LRESULT Save(string BitmapFileName,LPRECT lpRect=NULL){ return m_lpDIB->Save(BitmapFileName,lpRect); }

#ifdef USE_YGA
	LRESULT SaveYGA(string BitmapFileName,LPRECT lpRect=NULL, bool bCompress = true ){ return m_lpDIB->SaveYGA(BitmapFileName,lpRect,bCompress); }
#endif

	//	CDIB32にはYGAの概念は関係無いので、このフラグは無視して良い
	// @yo2 0x00435f50 vt
	virtual LRESULT CreateSurface(int nSizeX,int nSizeY,bool bYGA=false) { return m_lpDIB->CreateSurface(nSizeX,nSizeY); }
	LRESULT Resize(int nSizeX,int nSizeY) { return m_lpDIB->Resize(nSizeX,nSizeY); }
	// @yo2 0x00435f80 vt
	virtual LRESULT	Release(void) { return m_lpDIB->Release(); }
	bool	IsLoad(void) const { return m_lpDIB->IsLoad(); }
	// @yo2 0x00435fa0 vt
	virtual bool IsLoaded(void) const { return m_lpDIB->IsLoad(); }

	// 透過キー設定関連
	LRESULT SetColorKey(DWORD dwDIB32RGB) { return m_lpDIB->SetColorKey(dwDIB32RGB); }	// 特定の色を転送のときの透過キーに設定する
	// @yo2 0x00435fc0 vt
	virtual LRESULT SetColorKey(int x,int y){ return m_lpDIB->SetColorKey(x,y); }	// (x,y)の点を透過キーに設定する
	// @yo2 0x00435ff0 vt
	virtual LRESULT SetColorKey(int r,int g,int b){ return m_lpDIB->SetColorKey(r,g,b); }	// (x,y)の点を透過キーに設定する
	DWORD	GetColorKey(void)				{	return m_lpDIB->GetColorKey(); }	//	カラーキーの取得

	////////////////////////////////////////////////////////
	//	CreateDIBSectionを使うのか？

	void	UseDIBSection(bool bUseDIB)	{ m_lpDIB->UseDIBSection(bUseDIB); }

	//	CreateDIBSectionを使うときに限り、以下の関数が使用可能
	HDC		GetDC(void)					{ return m_lpDIB->GetDC(); }
	HBITMAP GetHBITMAP(void)			{ return m_lpDIB->GetHBITMAP(); }
	//	GetDCとの辻褄合わせ。(CDIBDrawとCDirectDrawの両方で動くクラス設計をするときのために)
	LRESULT	ReleaseDC(void)				{ return 0; } // 何もしましぇん＾＾；

#ifdef USE_DirectDraw
	//	HDC取得(解放は不要。LoadかCreateSurfaceしたあとは解放するまで取得可能)
	LRESULT	BltToPlane(CPlane*lpSrcPlane,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltToPlane(lpSrcPlane,x,y,lpSrcRect,lpClipRect);
	}
	LRESULT	BltFromPlane(CPlane*lpSrcPlane,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltFromPlane(lpSrcPlane,x,y,lpSrcRect,lpClipRect);
	}
#endif
	////////////////////////////////////////////////////////

	//	矩形描画
	LRESULT Blt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL){
		return m_lpDIB->Blt(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltFast(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BlendBltHalf(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltFastHalf(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL
		,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BlendBltFastHalf(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBlt(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBlt(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect
			,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltFast(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFast(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate
				,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT AddColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->AddColorBlt(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT AddColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->AddColorBltFast(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT SubColorBlt(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->SubColorBlt(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT SubColorBltFast(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->SubColorBltFast(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltFastClearAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	//	override from CPlane
	// @yo2 0x00436020 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFastAlpha((CDIB32*)lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00436060 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFastAlpha((CDIB32*)lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate
				,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BltWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltWithoutAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltFastWithoutAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltFastWithoutAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	//	ミラー付き矩形描画
	LRESULT BltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltFastM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BlendBltHalfM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltFastHalfM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL
		,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BlendBltFastHalfM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltM(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect
			,lpDstSize,lpClipRect);
	}

	LRESULT BlendBltFastM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFastM(lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate
				,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT AddColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->AddColorBltM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT AddColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->AddColorBltFastM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT SubColorBltM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->SubColorBltM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT SubColorBltFastM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->SubColorBltFastM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltFastClearAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFastAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BlendBltFastAlphaM(CPlaneBase* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return m_lpDIB->BlendBltFastAlphaM((CDIB32*)lpDIBSrc32,x,y,dwDstRGBRate,dwSrcRGBRate
				,lpSrcRect,lpDstSize,lpClipRect);
	}
	LRESULT BltWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL){
		return m_lpDIB->BltWithoutAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	LRESULT BltFastWithoutAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL
		,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltFastWithoutAlphaM(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	// @yo2 0x004360b0 vt
	virtual LRESULT BltToAlpha(CDIB32* lpSrc,int nSrcMin,int nSrcMax,int nDstMin=0,int nDstMax=255,LPRECT lpRect=NULL){
		return m_lpDIB->BltToAlpha(lpSrc,nSrcMin,nSrcMax,nDstMin,nDstMax,lpRect);
	}
	// @yo2 0x004360f0 vt
	virtual LRESULT FadeAlpha(int nFade,LPRECT lpRect=NULL){
		return m_lpDIB->FadeAlpha(nFade,lpRect);
	}

	//	同一サイズのプレーンでないといけない＾＾；
	// @yo2 0x00436120 vt
	virtual LRESULT FadeBltAlpha(CDIB32* lpSrc,int nFade,LPRECT lpRect=NULL){
		return m_lpDIB->FadeBltAlpha(lpSrc,nFade,lpRect);
	}

	LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL) {
		return m_lpDIB->MorphBlt(lpDIB32, lpSrcPoint, lpDstRect, lpClip);
	}
	LRESULT MorphBlt(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL) {
		return m_lpDIB->MorphBlt(lpDIB32, lpSrcRect, lpDstPoint, lpClip);
	}
	LRESULT MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false){
		return m_lpDIB->MorphBlt(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, bContinual);
	}

	LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip = NULL) {
		return m_lpDIB->MorphBltFast(lpDIB32, lpSrcPoint, lpDstRect, lpClip);
	}
	LRESULT MorphBltFast(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip = NULL) {
		return m_lpDIB->MorphBltFast(lpDIB32, lpSrcRect, lpDstPoint, lpClip);
	}
	LRESULT MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip = NULL, bool bContinual = false){
		return m_lpDIB->MorphBltFast(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, bContinual);
	}

	LRESULT RotateBlt(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL){
		return m_lpDIB->RotateBlt(lpDIB32,lpSrcRect,x,y,nAngle,nRate,nType,lpClip);
	}
	LRESULT RotateBltFast(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType=0,LPRECT lpClip=NULL){
		return m_lpDIB->RotateBltFast(lpDIB32,lpSrcRect,x,y,nAngle,nRate,nType,lpClip);
	}

	LRESULT	BumpMapBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL){
		return m_lpDIB->BumpMapBlt(lpSrc,lpBumpMap,x,y,lpSrcRect);
	}
	LRESULT	BumpMapFastBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClip = NULL){
		return m_lpDIB->BumpMapFastBlt(lpSrc,lpBumpMap,x,y,lpSrcRect);
	}	//	ソースクリップ無し


	//	このプレーンに対するエフェクト

	LRESULT AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect=NULL){
		return m_lpDIB->AddColorFast(dwAddRGB,lpSrcRect);
	}
	LRESULT SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect=NULL){
		return m_lpDIB->SubColorFast(dwSubRGB,lpSrcRect);
	}
	LRESULT ShadeOff(LPRECT lpSrcRect=NULL) {
		return m_lpDIB->ShadeOff(lpSrcRect);
	}
	// @yo2 0x00436150 vt
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL){
		return m_lpDIB->MosaicEffect(d,lpRect);
	}
	// @yo2 0x00436180 vt
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL){
		return m_lpDIB->FlushEffect(lpRect);
	}
	// @yo2 0x004361b0 vt
	virtual LRESULT FadeEffect(int nFade,LPRECT lpRect=NULL){
		return m_lpDIB->FadeEffect(nFade,lpRect);
	}
	// @yo2 0x004361e0 vt
	virtual LRESULT FlushAlpha(LPRECT lpRect=NULL){
		return m_lpDIB->FlushAlpha(lpRect);
	}

	//	プレーンのピクセル操作
	DWORD	GetPixel(int x,int y){	return m_lpDIB->GetPixel(x,y); }
	void	SetPixel(int x,int y,DWORD dwDIB32RGB) { m_lpDIB->SetPixel(x,y,dwDIB32RGB); }
	// @yo2 0x00436210 vt
	virtual void GetSize(int& sx,int& sy) { m_lpDIB->GetSize(sx,sy); }
	LPRECT	GetRect(void) { return m_lpDIB->GetRect(); }
	DWORD*	GetPtr(void) { return m_lpDIB->GetPtr(); }
	RECT	GetClipRect(LPRECT lpRect) { return m_lpDIB->GetClipRect(lpRect); }

	LRESULT	Clear(DWORD dwDIB32RGB=CLR_INVALID,LPRECT lpRect=NULL){ return m_lpDIB->Clear(dwDIB32RGB,lpRect); }
	void	SetFillColor(DWORD dwDIB32RGB){ m_lpDIB->SetFillColor(dwDIB32RGB); }	//	Clearする色の設定

	//	YGAを扱うためのフラグ
	// @yo2 0x00436240 vt
	bool	IsYGA(void) { return m_lpDIB->IsYGA(); }
	bool*	GetYGA(void) { return m_lpDIB->GetYGA(); }
	//	自然な転送
	// @yo2 0x00436260 vt
	virtual LRESULT BltNatural(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltNatural(reinterpret_cast<CDIB32*>(lpSrc),x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x004362a0 vt
	virtual LRESULT BltNatural(CPlaneBase* lpSrc,int x,int y,int nFadeRate,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return m_lpDIB->BltNatural(reinterpret_cast<CDIB32*>(lpSrc),x,y,nFadeRate,lpSrcRect,lpDstSize,lpClipRect);
	}
	CFastPlaneInfo* GetPlaneInfo() { return m_lpDIB->GetPlaneInfo(); }

	CDIB32();
	virtual ~CDIB32();

	//	おまけ
	CDIB32Base* GetDIB32BasePtr(void) { return m_lpDIB; }

protected:
	auto_ptrEx<CDIB32Base>	m_lpDIB;	//	こいつを保持

	//////////////////////////////////////////////////////////////////////////
	//	override from CPlaneBase
	//	これらは、直接呼び出されることは無いのでprotectedにしておけば良い。

	// @yo2 0x004362f0 vt
	virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		//	lpSrcがCDIB32*をアップキャストしたものであることは保証されない
		//	よって本来ならばdynamic_cast<CDIB32*>(lpSrc)が非NULLかチェックすべき
		return Blt((CDIB32*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00436330 vt
	virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return BltFast((CDIB32*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00436370 vt
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return BlendBlt((CDIB32*)lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x004363c0 vt
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return BlendBltFast((CDIB32*)lpSrc,x,y,dwDstRGBRate,dwSrcRGBRate,lpSrcRect,lpDstSize,lpClipRect);
	}

	// @yo2 0x00436410 vt
	virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate){
		//	改善したのだ＾＾； ('01/02/28)
		DWORD dwRate = PlaneRGB(nFadeRate,nFadeRate,nFadeRate);
		return BlendBltFastAlpha(lpSrc,x,y,0xffffff-dwRate,dwRate);
	}

	// @yo2 0x00436460 vt
	virtual LRESULT ClearRect(LPRECT lpRect=NULL){
		return Clear(CLR_INVALID,lpRect);
	}
	// @yo2 0x00436490 vt
	virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette=true) {
		return 1;	//	unsupported!!
	}

	//	αの抽出(非YGA画像のときは抜き色以外ならば255)
	// @yo2 0x00436510 vt
	virtual int	GetPixelAlpha(int x,int y){
		return m_lpDIB->GetPixelAlpha(x,y);
	}
};

#endif

#endif // ifdef USE_DIB32
