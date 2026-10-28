//
//	DirectDrawSurface+DIB wrapper
//
//  yaneFastPlane1.cpp … 基本実装
//  yaneFastPlane2.cpp … 通常Blt実装
//  yaneFastPlane3.cpp … ブレンド系Blt実装
//  yaneFastPlane4.cpp … 加色減色系Blt実装
//  yaneFastPlane5.cpp … アフィン変換系Blt実装


#ifndef __yaneFastPlane_h__
#define __yaneFastPlane_h__

#ifdef USE_FastDraw

#include "yanePlaneBase.h"
#include "yaneFastPlaneInfo.h"

#ifdef USE_DIB32
class CDIB32;
#endif

class CFastPlane : public CPlaneBase {
/**
	CPlaneに代わる、新しい描画プレーンクラス
*/
public:

	/// CPlaneBaseの派生クラスでは、これをオーバーライドすべし
	// @yo2 0x004522e0 vt
	virtual EDrawType GetID() const { return eDraw_CFastPlane; }

	////////////////////////////////////////////////////////////////////////
	//　ビットマップ関連
	virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=true);
	///　bLoadPalette==falseだと、現在のパレットカラーに準じてSetDIBitsToDeviceで
	///　読み込まれる。WM_PALETTECHANGEDに応答するアプリの場合、これで読み込む必要あり

	///　ビットマップファイルとして保存する
	LRESULT	Save(LPSTR szFileName,LPRECT lpRect=NULL);

	///　生成されたSurfaceのサイズを得る
	virtual void	GetSize(int &x,int &y);	

	virtual LRESULT	Release();

	////////////////////////////////////////////////////////////////////////
	//　透過キー設定関連
	///　特定の色を転送のときの透過キーに設定する
	virtual LRESULT	SetColorKey(COLORREF rgb);
	// @yo2 0x00452300 vt
	virtual LRESULT SetColorKey(int r,int g,int b){ return SetColorKey(RGB(r,g,b)); }

	///　(x,y)の点を透過キーに設定する
	virtual LRESULT SetColorKey(int x,int y);

	///　上記関数で設定されたカラーキー（画面モード依存）のデータを返す
	///　これで返ってきた値は、CFastPlaneRGB???::SetRGB()で設定することが出来る
	// @yo2 0x00452340 vt
	virtual DWORD GetColorKey() const { return m_dwColorKey; }

	//////////////////////////////////////////////////////////////////////////
	///　通常転送系
	///　ただし、Fastは抜き色を無視する
	LRESULT		Blt(CFastPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	LRESULT		BltFast(CFastPlane*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);

	///　ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
	///　CDIB32,CPlaneとほぼ同じ仕様だが、ブレンド比率は、０～２５５（２５６では無く！）なので、注意すること。
	virtual LRESULT BlendBlt(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFast(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　こちらのブレンド転送は、　転送先　＝　転送先×α　＋　転送元×β
	///　α＋β≦２５５という演算
	virtual LRESULT BlendBltAB(CFastPlane* lpSrc,int x,int y,BYTE bySrcFadeRate,BYTE byDstFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT BlendBltFastAB(CFastPlane* lpSrc,int x,int y,BYTE bySrcFadeRate,BYTE byDstFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　α付き画像転送系(ただしCDIB32,CFastPlaneでしか実装されておらず)
	virtual LRESULT BlendBltFastAlpha(CFastPlane* lpSrc,int x,int y
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　α付き画像の減衰率指定転送(BltFadeAlphaと同じ)
	// @yo2 0x00452360 vt
	virtual LRESULT BlendBltFastAlpha(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return FadeAlphaBlt(lpSrc,x,y,byFadeRate,lpSrcRect,lpDstSize,lpClipRect);
	}

	///　CDIB32,CFastPlaneでしか実装されておらず
	///　(lpSrcRect..等を指定できるのは、CFastPlaneのみ)
	///　仕様が違うので、FadeBltAlpha　⇒　FadeAlphaBltと関数名変更
	virtual LRESULT FadeAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

#ifdef USE_DIB32
	///　CDIB32とのやりとり
	LRESULT		Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	LRESULT		BltTo(CDIB32*lpDst,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
#endif

	///　alpha channelに転送。このサーフェースは、α付き(CreateSurfaceの第３パラメータをtrueで作成)であることが前提となる
	virtual	LRESULT BltToAlpha(CFastPlane* lpSrc,int nSrcMin,int nSrcMax,int nDstMin,int nDstMax,int x,int y,LPRECT lpSrcRECT=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　DIB32と同じインターフェースのほうも用意しておく
	// @yo2 0x004523a0 vt
	virtual	LRESULT BltToAlpha(CFastPlane* lpSrc,int nSrcMin,int nSrcMax,int nDstMin=0,int nDstMax=255,LPRECT lpSrcRect=NULL){
		if (lpSrcRect==NULL) {
			return BltToAlpha(lpSrc,nSrcMin,nSrcMax,nDstMin,nDstMax,0,0);
		} else {
			return BltToAlpha(lpSrc,nSrcMin,nSrcMax,nDstMin,nDstMax,lpSrcRect->left,lpSrcRect->top,lpSrcRect);
		}
	}

	///　定数倍加色／減色コピー
	virtual LRESULT AddColorBlt(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorBltFast(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBlt(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorBltFast(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　減衰率指定の定数倍加色／減色コピー
	virtual LRESULT AddColorAlphaBltFast(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT AddColorAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorAlphaBltFast(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
	virtual LRESULT SubColorAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　αサーフェース⇒αサーフェースへα値以外をコピーする
	virtual LRESULT BltFastWithoutAlpha(CFastPlane* lpSrc,int x,int y
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	///　マスクパターン付きの転送
	///　(16×16のαマスクBYTE alphamask[256(x+y*16)]を渡して、
	///　そいつでマスクをとりながら転送する)
	virtual LRESULT BltMask16(CFastPlane*lpSrc,int x,int y,BYTE* abyAlphaTable,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);
	virtual LRESULT BltFastMask16(CFastPlane*lpSrc,int x,int y,BYTE* abyAlphaTable,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipDstRect=NULL);

	//////////////////////////////////////////////////////////////////////////
	//　アフィン変換系
	///　任意の点列から任意の点列への転送
	LRESULT MorphBlt(CFastPlane*lpSrc,LPPOINT lpSrcPoint, LPPOINT lpDstPoint,LPRECT lpClipDstRect=NULL, bool bContinual=false, int nPoints=4);
	LRESULT MorphBltFast(CFastPlane*lpSrc,LPPOINT lpSrcPoint, LPPOINT lpDstPoint,LPRECT lpClipDstRect=NULL, bool bContinual=false, int nPoints=4);

	///　画像を回転して転送
	LRESULT RotateBlt(CFastPlane* lpSrc, int x,int y, int nAngle,int nRate,int nType, LPRECT lpSrcRect=NULL, LPRECT lpClipDstRect=NULL);
	LRESULT RotateBltFast(CFastPlane* lpSrc, int x,int y, int nAngle,int nRate,int nType, LPRECT lpSrcRect=NULL, LPRECT lpClipDstRect=NULL);

	//////////////////////////////////////////////////////////////////////////
	//	通常エフェクト系（そのプレーンに対して）

	LRESULT		Clear(LPRECT lpRect=NULL);		//	矩形クリア
	LRESULT		SetFillColor(COLORREF c);		//	Clearする色を指定する(Default==RGB(0,0,0))
	COLORREF	GetFillColor();					//	Clearする色の取得
		//	⇒ただし、α付きサーフェースに対するClearは、
		//		α == 0になることが保証されるものとする

	///　Mosaic（そのプレーンに対するエフェクト）
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL);
	///　Flush （そのプレーンに対するエフェクト）
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL);

	///　加色合成、減色合成
	virtual LRESULT AddColorFast(COLORREF clAddRGB,LPRECT lpSrcRect=NULL);
	virtual LRESULT SubColorFast(COLORREF clSubRGB,LPRECT lpSrcRect=NULL);

	///　ブライトネスを下げる(nFadeRateが255 == 100%)
	LRESULT		FadeEffect(BYTE nFadeRate,LPRECT lpRect=NULL);

	///　α値を反転させる（αサーフェースに対してのみ有効）
	LRESULT		FlushAlpha(LPRECT lpRect=NULL);

	//////////////////////////////////////////////////////////////////////////

	//	各種設定
//	void	SetDirectDrawSurface(bool bEnable);	//	DirectDrawSurfaceにするのか
	LRESULT	SetSystemMemoryUse(bool bEnable);	//	システムメモリを使うのか
	//	↑これらは、途中変更は不可。
	//	次にCreateSurafeceもしくは、LoadBitmapしたときから有効。

	/*
		上の２つの設定は、
			プライマリ：true  - false
			セカンダリ：false - true   or	true  - true
			普通のサーフェース　　：false - true
		が標準的だと考えられる。
	*/

	//////////////////////////////////////////////////////////////////////////
	//	HDCを得て、直接書き書き:p

	HDC		GetDC();
		//	↑ただし、かならず取得できるとは限らない。
		//	必ず取得しなければならないのであれば、
		//	SetDirectDrawSurface(true)にしておくこと。
		//	取得できなかった場合、NULLが返る
	void	ReleaseDC();

	//	オーナードローサーフェースの生成
	virtual LRESULT CreateSurface(int sx,int sy,bool bYGA=false);		//	サイズ指定でプレーン作成

	//	プライマリサーフェースの生成
	LRESULT	CreatePrimary(bool& bUseFilp,int nSx=0,int nSy=0);
	//	セカンダリサーフェースの生成
	LRESULT CreateSecondary(CFastPlane*lpPrimary,bool& bUseFlip);

	//////////////////////////////////////////////////////////////////////////
	//	property...

	//	ビットマップが読み込まれていればtrue
	// @yo2 0x00452430 vt
	bool	IsLoaded() const { return !m_szBitmapFile.empty(); }
	//	読み込んでいるビットマップのファイル名を返す
	string	GetFileName() const;

	//	YGA画像なのかどうか
	// @yo2 0x00452450 vt
	virtual	bool	IsYGA(void) { return m_bYGA; }
	bool*	GetYGA() { return& m_bYGA; }

	void	SetYGAUse(bool bUse) { m_bYGAUse = bUse; }
	bool	GetYGAUse() { return m_bYGAUse; }
	//	これでtrueを設定すれば↑Loadするときや、CreateSurfaceするとき、
	//	強制的に常にα付きサーフェースを作成する。
	//	ディフォルトではfalse

	//	α値を得る
	virtual int	GetPixelAlpha(int x,int y);
	//	ピクセルの色を得る
	COLORREF	GetPixel(int x,int y);
	//	色を、現在のサーフェースの色に合わせて変換する
	DWORD		GetMatchColor(COLORREF rgb);

	//	自動修復サーフェースにする(default:false)
	//		(これだとLostしない。ただし、32bpp->16bppのような変換によってビット深度が失われる)
	void	SetAutoRestore(bool bEnable) { m_bAutoRestore = bEnable; }
	bool	GetAutoRestore() { return m_bAutoRestore; }

	LPDIRECTDRAWSURFACE GetSurface();
	LPDIRECTDRAWPALETTE GetPalette();
	//	↑DirectDrawSurfaceとは限らないので、この２つは
	//		取得できるかどうかわからない．．
	//		取得できなかったときは、NULLが返る

	LRESULT Lock();	
		//	この関数を呼び出すと、GetPlaneInfoが正しい値を返す
		//	Surfaceを本当にロックしているとは限らない
	LRESULT	Unlock();
		//	Lockしたものは、これで解放する
	CFastPlaneInfo* GetPlaneInfo() { return& m_vFastPlaneInfo; }

	int		GetSurfaceType() { return m_nSurfaceType; }
	//	CDirectDrawSurfaceManagerで取得できるサーフェースの種類

	//	0～1(不明)の場合、DIB(16bpp)を作りにかかります。
	//	それ以外の場合、m_bMemorySurfaceがtrueであれば、メモリサーフェース
	//	さもなくば、DirectDrawSurfaceですから、m_lpSurfaceが有効ということに
	//	なります。

	//	不明の場合、セカンダリを作るときは、何が何でも
	//	こいつをプライマリへ転送してやる必要があるので、
	//	DIBSectionを作るべき？
	//	というか、こいつが不明ってどういうこと？？

	//////////////////////////////////////////////////////////////////////////

	CFastPlane();
	virtual ~CFastPlane();

	friend class CFastDraw;

protected:
	// WM_ACTIVATEAPP時にサーフェースのリストアを行なうためのもの
	static LRESULT RestoreAll();		//	全プレーンのリストア

public:
	// [Konami] added: total surface memory of all planes in bytes (name is ours)
	static int GetTotalSurfaceSize();
protected:

	LPDIRECTDRAWSURFACE m_lpSurface;
	//	DirectDrawSurfaceのときは、そのポインタ
	LPDIRECTDRAWPALETTE m_lpPalette;
	//	DirectDrawPaletteのときは、そのポインタ

	//	プレーン情報(lockしたあとに有効になる)
	CFastPlaneInfo	m_vFastPlaneInfo;

	//	256色モードの時に読み込んだ画像は、そのときのHDCに依存するので
	//	RGB555に変更されたときは、読み直す必要がある
	bool	m_bLoad256;

	//	CreateDIBSectionで作ったサーフェースの場合
	//	(不明ピクセルフォーマットに対してセカンダリのみ、これで有り得る)
	HBITMAP m_hBitmap;
	HDC		m_hDC;

	//	気持ち悪いので、参照カウンタは用意しない。

	//	プレーンのサイズ
	int		m_nSizeX;
	int		m_nSizeY;

	//	bitmapファイル名
	string	m_szBitmapFile;				// ファイル名保存しとかなくっちゃ
	bool	m_bLoadPalette;				//	パレットを読み込んでいるのか？
		//	ビットマップを読み込んでいないときは、ファイル名は空である

	//////////////////////////////////////////////////////////////////////////
	//	サーフェースの復帰処理
	//	リストアは内部的に呼び出される（ユーザーは通常、直接呼び出すことは無い）
	virtual LRESULT	Restore();
	//	リストア処理を書くには、この関数をオーバーライドする（通常、その必要は無い）

	// @yo2 0x00452470 vt
	virtual LRESULT OnDraw(){ return 0; }
	//	プレーンの復元のためこれが呼び出される（これをオーバーライドする）

	//	内部的に使用(派生クラスで必要であればoverrideしてね)
	virtual void	ResetColorKey();		//	カラーキーのリセット
	virtual LRESULT	InnerLoad(string szFileName,bool bLoadPalette);
	virtual LRESULT InnerCreateSurface(int sx,int sy,bool bYGA=false,bool bSecondary256=false);
	//	サイズ指定でプレーン作成
	LRESULT InnerCreateMySurface(int sx,int sy,int nSurfaceType);

	LRESULT InnerRestoreSurface();		//	サーフェースのリストア処理（内部用）
	LRESULT	UpdateSurfaceInfo();		//	サーフェース情報を更新する（内部用）
	//	呼び出し元はGetSurface()が不正でないことを保証すべき

	void	ClearMSB();	//	ビデオカードのバグ対策で最上位バイトを潰す

	//////////////////////////////////////////////////////////////////////////

	// 透過キー関連
	bool	m_bUsePosColorKey;			//　位置指定型のColorKeyか(true)、色指定型か？(false)
	COLORREF m_ColorKey;				//　色指定型　透過カラーキー
	int		m_nCX,m_nCY;				//　位置指定型　透過カラーキー
	LRESULT	SetColorKey();				//	復帰用（内部的に使用）
	DWORD	m_dwColorKey;				//	その色を現在のサーフェースに変換したもの

	bool	m_bUseSystemMemory;			//	強制的にシステムメモリを使うオプション
//	bool	m_bUseDirectDrawSurface;	//	強制的にDirectDrawSurfaceを使うオプション

	COLORREF m_FillColor;				//	矩形クリアする色
	DWORD	m_dwFillColor;				//	その色を現在のサーフェースに変換したもの

	//////////////////////////////////////////////////////////////////////////

	//	サーフェース情報
	int		m_nSurfaceType;			//	サーフェースの種類を保持
	bool	m_bYGA;					//	YGA画像であるか
	bool	m_bYGAUse;				//	強制的にα付きサーフェースを作成する
	bool	m_bAutoRestore;			//	自動リストアするのか
	bool	m_bMySurface;			//	自分でnewしたSurfaceか？
	bool	m_bSecondary256;		//	256色用のセカンダリ
									//	（このサーフェースは256色モードでもRGB555ではなく256色）
	bool	m_bSecondary256DIB;		//	256色用のセカンダリ
									//	（このサーフェースは、RGB555かつDIBSection）

	//////////////////////////////////////////////////////////////////////////

	//	全プレーンへのインスタンスのチェイン
	//	このチェインにはPrimary,Secondaryも含むので注意が必要
	static set<CFastPlane*>	m_lpPlaneList;

	//	内部YGA画像の読み込み用
	LRESULT InnerLoadYGA(string szFilename);

protected:
//	static DWORD DDColorMatch(LPDIRECTDRAWSURFACE pdds, COLORREF rgb); // 同じ色を探す
//	static DWORD DDGetPixel(LPDIRECTDRAWSURFACE pdds,int x,int y); // 特定の点の色を調べる
	//	↑このサーフェースはDirectDrawSurfaceとは限らないので、これでは使いものにならない！ヽ(`Д´)ノ

	static void	InnerGetBpp();	//	bpp managerのリセット
	static int	GetBpp();		//	bppの取得

	//////////////////////////////////////////////////////////////////////////
	//	override from CPlaneBase
	//	これらは、直接呼び出されることは無い
private:

	//	overriden from CPlaneBase
	// @yo2 0x00452490 vt
	virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
		,bool bLoadPalette=true)  {
		return 1;	//	not supported
	}

	//	矩形描画
	// @yo2 0x00452510 vt
	virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		//	これ、lpSrcは、CFastPlane*をアップキャストしたものと仮定して良いのか？
		return BltFast((CFastPlane*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00452550 vt
	virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		//	これ、lpSrcは、CFastPlane*をアップキャストしたものと仮定して良いのか？
		return Blt((CFastPlane*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	//	画面クリア
	// @yo2 0x00452590 vt
	virtual LRESULT	ClearRect(LPRECT lpRect=NULL) { return Clear(lpRect); }

	//	ブレンド転送(CDIB32,CPlaneでサポート。CFastPlaneでは非サポート)
	// @yo2 0x004525b0 vt
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) { return 1; }
	// @yo2 0x004525d0 vt
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) { return 1; }

	//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
	// @yo2 0x004525f0 vt
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return BlendBlt((CFastPlane*)lpSrc,x,y,byFadeRate,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00452630 vt
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return BlendBltFast((CFastPlane*)lpSrc,x,y,byFadeRate,lpSrcRect,lpDstSize,lpClipRect);
	}

	//	α付き画像転送系(ただしCDIB32,CFastPlaneでしか実装されておらず)
	// @yo2 0x00452670 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return BlendBltFastAlpha((CFastPlane*)lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	//	α付き画像の減衰率指定転送(BltFadeAlphaと同じ)
	// @yo2 0x004526b0 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return FadeAlphaBlt((CFastPlane*)lpSrc,x,y,byFadeRate,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x004526f0 vt
	virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate){
		return FadeAlphaBlt((CFastPlane*)lpSrc,x,y,nFadeRate,NULL,NULL,NULL);
	}
};

#endif	// USE_FastDraw

#endif	// ifdef __yaneFastDraw_h__

