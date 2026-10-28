//
//	DirectDrawSurface wrapper
//
#ifdef USE_DirectDraw

#ifndef __yanePlane_h__
#define __yanePlane_h__

#include "yanePlaneBase.h"

class CDirectDraw;
#ifdef USE_DIB32
class CDIB32;
#endif

class CPlane : public CPlaneBase {
public:

	//////////////////////////////////////////////////////////////////////////
	//	CPlaneBaseの派生クラスでは、これをオーバーライドすべし
	virtual EDrawType GetID() const { return eDraw_CPlane; }

	//////////////////////////////////////////////////////////////////////////
	// ビットマップ関連
	virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=true);
	// bLoadPalette==falseだと、現在のパレットカラーに準じてSetDIBitsToDeviceで
	// 読み込まれる。WM_PALETTECHANGEDに応答するアプリの場合、これで読み込む必要あり

	virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette=true);
	// 256色モードならば、別のファイルを読む場合

	//	ビットマップファイルとして保存する
	LRESULT	Save(LPSTR szFileName,LPRECT lpRect=NULL);

	virtual void	GetSize(int &x,int &y);		// 生成されたSurfaceのサイズを得る
	virtual LRESULT	Release(void);

	//////////////////////////////////////////////////////////////////////////
	// 透過キー設定関連
	LRESULT	SetColorKey(COLORREF rgb);	// 特定の色を転送のときの透過キーに設定する
	LRESULT SetColorKey(int r,int g,int b);
	static DWORD DDColorMatch(LPDIRECTDRAWSURFACE pdds, COLORREF rgb); // 同じ色を探す

	virtual LRESULT SetColorKey(int x,int y);	// (x,y)の点を透過キーに設定する
	static DWORD DDGetPixel(LPDIRECTDRAWSURFACE pdds,int x,int y); // 特定の点の色を調べる

	//////////////////////////////////////////////////////////////////////////
	//	通常転送系

	LRESULT		Blt(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BltFast(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBlt(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltFast(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPRECT lpClipDstRect=NULL);

	//	拡縮込み
	LRESULT		BltR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BltFastR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BlendBltFastR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);

#ifdef USE_DIB32
	//	CDIB32とのやりとり
	LRESULT		Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL);
	LRESULT		BltTo(CDIB32*lpDst,int x,int y,LPRECT lpSrcRect=NULL,LPRECT lpClipRect=NULL);
#endif
	//////////////////////////////////////////////////////////////////////////
	//	通常エフェクト系

	LRESULT		Clear(LPRECT lpRect=NULL);		//	矩形クリア
	LRESULT		SetFillColor(COLORREF c);		//	Clearする色を指定する(Default==RGB(0,0,0))
	DWORD		GetFillColor(void);				//	FillColorする色

	//	Mosaic（そのプレーンに対するエフェクト）
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL);
	//	Flush （そのプレーンに対するエフェクト）
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL);

	//////////////////////////////////////////////////////////////////////////
	//	各種設定
	LRESULT	SetSystemMemoryUse(bool bEnable);	//	システムメモリを使うのか

	//////////////////////////////////////////////////////////////////////////
	//	HDCを得て、直接書き書き:p
	HDC		GetDC(void);
	void	ReleaseDC(void);

	//	オーナードローサーフェースの生成
	virtual LRESULT CreateSurface(int sx,int sy,bool bYGA=false);		//	サイズ指定でプレーン作成

	//	owner drawing bitmap(複合プレーン)フラグ取得
	bool*	GetHybrid(void) { return& m_bHybrid; }

	//	プライマリサーフェースの生成
	LRESULT	CreatePrimary(bool& bUseFilp,int nSx=0,int nSy=0);
	//	セカンダリサーフェースの生成
	LRESULT CreateSecondary(CPlane*lpPrimary,bool& bUseFlip);

	//　他プレーンと入れ換える機能
	void	SwapPlane(CPlane*lpPlane);

	//////////////////////////////////////////////////////////////////////////
	//	property...

	//	ビットマップが読み込まれていればtrue
	bool	IsLoaded(void) const { return m_bBitmap; }
	//	ファイル名を返す
	string	GetFileName(void) const;

	LPDIRECTDRAWSURFACE GetSurface(void);
	LPDIRECTDRAWPALETTE GetPalette(void);

	//////////////////////////////////////////////////////////////////////////
	//	static members..
	static	int	GetBpp(void);			//	現在のbppを取得

	// WM_ACTIVATEAPP時にサーフェースのリストアを行なうためのもの
	static LRESULT RestoreAll(void);		//	全プレーンのリストア

	CPlane(void);
	virtual ~CPlane();

	friend class CDirectDraw;

protected:
	LPDIRECTDRAWSURFACE m_lpSurface;
	LPDIRECTDRAWPALETTE m_lpPalette;
	int		m_nSurfaceRef;	//	サーフェースの参照カウンタ
							//	DirectDrawのDuplicateはバグ有りなので自前でやる＾＾

	//	プレーンのサイズ
	int		m_nSizeX;
	int		m_nSizeY;

	//	bitmapファイル名
	string	m_szBitmapFile;				// ファイル名保存しとかなくっちゃ
	string	m_szBitmapFile2;			// LoadBitmapFileWでの多色モードのファイル名
	bool	m_bBitmapW;					// m_DirectDrawBitmap2は有効なのか？
	bool	m_bLoadPalette;

	//	bitmapを読み込んているのか、それとも
	//	CreateSurfaceによって作成されたプレーンか？
	bool	m_bBitmap;
	virtual LRESULT OnDraw(void);		//	CreateSurfaceによって作成した場合、
										//	プレーンの消失に関してこれが呼び出される

	//	内部的に使用(派生クラスで必要であればoverrideしてね)
	virtual void	ResetColorKey(void);		//	カラーキーのリセット
	virtual LRESULT	InnerLoad(string szFileName,bool bLoadPalette);
	virtual LRESULT InnerCreateSurface(int sx,int sy);	//	サイズ指定でプレーン作成

	bool	m_bOwnerDraw;				//	読み込んでいるのはビットマップではなくオーナードロー型なのか？
	LRESULT Restore(void);				//	サーフェースのリストア

	//////////////////////////////////////////////////////////////////////////

	// 透過キー関連
	bool	m_bUsePosColorKey;			// 位置指定型のColorKeyか(true)、色指定型か？(false)
	COLORREF m_ColorKey;				// 色指定型　透過カラーキー
	int		m_nCX,m_nCY;				// 位置指定型　透過カラーキー
	HDC		m_hDC;						// BeginPaint～EndPaint用
	LRESULT	SetColorKey(void);			//	復帰用（内部的に使用）
	bool	m_bUseSystemMemory;			//	強制的にシステムメモリを使うオプション

	COLORREF m_FillColor;				//	矩形クリアする色
	DWORD	m_dwFillColor;				//	その色を現在の画面モードに合わせて変換したもの

	bool	m_bHybrid;					//	owner drawing bitmapか？
	bool	CheckDuplicate(string szFileName);	//	Duplicate可能か？
	void	ReleaseDDSurface(void);		//	参照カウントつきのリリース
	void	ClearMSB(void);				//	32bppモードで最上位バイトに乗り上げたゴミを除去

	//////////////////////////////////////////////////////////////////////////

	//	全プレーンへのインスタンスのチェイン
	//	このチェインにはPrimary,Secondaryも含むので注意が必要
	static set<CPlane*>	m_lpPlaneList;

	//////////////////////////////////////////////////////////////////////////

	static void	InnerGetBpp(void);	//	現在のbppを取得

	//////////////////////////////////////////////////////////////////////////
	//	override from CPlaneBase
	//	これらは、直接呼び出されることは無いのでprotectedにしておけば良い。

	virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (lpDstSize==NULL) {
		//	lpSrcがCPlane*をアップキャストしたものであることは保証されない
		//	よって本来ならばdynamic_cast<CPlane*>(lpSrc)が非NULLかチェックすべき
			return Blt((CPlane*)lpSrc,x,y,lpSrcRect,lpClipRect);
		} else {
			return BltR((CPlane*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (lpDstSize==NULL) {
			return BltFast((CPlane*)lpSrc,x,y,lpSrcRect,lpClipRect);
		} else {
			return BltFastR((CPlane*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (lpDstSize==NULL) {
			return BlendBlt((CPlane*)lpSrc,x,y
				,dwSrcRGBRate>>16,(dwSrcRGBRate>>8)&0xff,dwSrcRGBRate & 0xff
				,dwDstRGBRate>>16,(dwDstRGBRate>>8)&0xff,dwDstRGBRate & 0xff
				,lpSrcRect,lpClipRect);
		} else {
			return BlendBltR((CPlane*)lpSrc,x,y
				,dwSrcRGBRate>>16,(dwSrcRGBRate>>8)&0xff,dwSrcRGBRate & 0xff
				,dwDstRGBRate>>16,(dwDstRGBRate>>8)&0xff,dwDstRGBRate & 0xff
				,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (lpDstSize==NULL) {
			return BlendBltFast((CPlane*)lpSrc,x,y
				,dwSrcRGBRate>>16,(dwSrcRGBRate>>8)&0xff,dwSrcRGBRate & 0xff
				,dwDstRGBRate>>16,(dwDstRGBRate>>8)&0xff,dwDstRGBRate & 0xff
				,lpSrcRect,lpClipRect);
		} else {
			return BlendBltFastR((CPlane*)lpSrc,x,y
				,dwSrcRGBRate>>16,(dwSrcRGBRate>>8)&0xff,dwSrcRGBRate & 0xff
				,dwDstRGBRate>>16,(dwDstRGBRate>>8)&0xff,dwDstRGBRate & 0xff
				,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return -1; // 未実装
	}
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return -1; // 未実装
	}
	virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate){
		return -1; // 未実装
	}
	virtual LRESULT	ClearRect(LPRECT lpRect=NULL){
		return Clear(lpRect);
	}


};

#endif

#endif // USE_DirectDraw
