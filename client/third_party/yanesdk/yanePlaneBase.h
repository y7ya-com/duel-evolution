//
//	CPlaneBase
//		CPlaneとCDIB32対等に扱うためのギミック
//		→CPlaneとCDIB32の関数をサポートする必要があるときに使う

#ifndef __yanePlaneBase_h__
#define __yanePlaneBase_h__

//	DIB32RGBと仕様は同じ
//	#define PlaneRGB(r,g,b) ( ((DWORD)r)<<16 | ((DWORD)g)<<8 | b )
//	↑これだが、r,g,b<=255をチェックしたほうが安全なので、そういうコードにする。
inline DWORD PlaneRGB(DWORD r,DWORD g,DWORD b){
	WARNING(r>=256 || g>=256 || b>=256,"PlaneRGBで値がオーバーしています");
	return ( ((DWORD)r)<<16 | ((DWORD)g)<<8 | b );
}

//	CPlaneBase::CreateFactoryで生成するためのfactory
class CPlaneBase;
class CPlaneBaseFactory {
public:
	virtual CPlaneBase* Create() = 0;
};

#ifdef USE_DirectDraw
class CPlaneBaseFactoryForCPlane : public CPlaneBaseFactory {
public:
	virtual CPlaneBase* Create();
};
#endif

#ifdef USE_FastDraw
class CPlaneBaseFactoryForCFastPlane : public CPlaneBaseFactory {
public:
	virtual CPlaneBase* Create();
};
#endif

#ifdef USE_DIB32
class CPlaneBaseFactoryForCDIB32 : public CPlaneBaseFactory {
public:
	virtual CPlaneBase* Create();
};
#endif

//	CPlaneBase::GetIDでRTTIの真似事が出来る
enum EDrawType {
	eDraw_NullPlane,	//	違法なプレーン
	eDraw_CPlane,		//	CPlane
	eDraw_CDIB32,		//	CDIB32
	eDraw_CFastPlane	//	CFastPlane
};

class CPlaneBase {
public:
	virtual ~CPlaneBase() {}	//	merely place holder

	//	CPlaneBaseの派生クラスでは、これをオーバーライドすべし
	// @yo2 0x00435a50 vt
	virtual EDrawType GetID() const { return eDraw_NullPlane; }

	//	矩形描画
	virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	//	ブレンド転送(CDIB32,CPlaneでサポート。CFastPlaneでは非サポート)
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) = 0;

	//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
	// @yo2 0x00435a70 vt
	virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return BlendBlt(lpSrc,x,y
			,PlaneRGB(255-byFadeRate,255-byFadeRate,255-byFadeRate)
			,PlaneRGB(byFadeRate,byFadeRate,byFadeRate)
			,lpSrcRect,lpDstSize,lpClipRect);
	}
	// @yo2 0x00435af0 vt
	virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
		,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		return BlendBltFast(lpSrc,x,y
			,PlaneRGB(255-byFadeRate,255-byFadeRate,255-byFadeRate)
			,PlaneRGB(byFadeRate,byFadeRate,byFadeRate)
			,lpSrcRect,lpDstSize,lpClipRect);
	}

	//	α付き画像転送系(ただしCDIB32,CFastPlaneでしか実装されておらず)
	// @yo2 0x00435b70 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) { return 0; }
		//	CDIB32でしか実装されておらず
	// @yo2 0x00435b90 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y
				,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) { return 0; }
		//	α固定系YGA画像転送。CFastPlaneでのみ、特化されたルーチン有り
	// @yo2 0x00435bb0 vt
	virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpSrc,int x,int y,BYTE byFadeRate
				,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		return BlendBltFastAlpha(lpSrc,x,y
			,PlaneRGB(255-byFadeRate,255-byFadeRate,255-byFadeRate)
			,PlaneRGB(byFadeRate,byFadeRate,byFadeRate)
			,lpSrcRect,lpDstSize,lpClipRect);
	}
		//	CDIB32,CFastPlaneでしか実装されておらず
	virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate)=0;

	//	Mosaic（そのプレーンに対するエフェクト）
	virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL) = 0;

	//	Flush （そのプレーンに対するエフェクト）
	virtual LRESULT FlushEffect(LPRECT lpRect=NULL) = 0;

	//	 サイズ取得
	virtual	void	GetSize(int &x,int &y) = 0;

	//	読み込まれているかどうか
	virtual	bool	IsLoaded(void) const = 0;
	//	YGA画像なのかどうか
	// @yo2 0x00435c30 vt
	virtual	bool	IsYGA(void) { return false; }

	//	画面クリア
	virtual LRESULT	ClearRect(LPRECT lpRect=NULL) = 0;

	//	自然な転送(CPlaneならばBlt
	//		CDIB32ならばBlt,CDIB32でyga画像ならばBlendBltFastAlpha,CFastDrawも同様)
	// @yo2 0x00435c50 vt
	virtual LRESULT BltNatural(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (!lpSrc->IsYGA()) {
			return Blt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			return BlendBltFastAlpha(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	// @yo2 0x00435cc0 vt
	virtual LRESULT BltNatural(CPlaneBase* lpSrc,int x,int y,int nFadeRate,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL) {
		if (nFadeRate>=255) {
			return BltNatural(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		if (!lpSrc->IsYGA()) {
			return BlendBlt(lpSrc,x,y,nFadeRate,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			return BlendBltFastAlpha(lpSrc,x,y,nFadeRate,lpSrcRect,lpDstSize,lpClipRect);
		}
	}
	virtual LRESULT BltNaturalPos(CPlaneBase* lpSrc,int x,int y,int nMode,int nFade=256);
	//	nMode == ベース位置(0:画像中心 1:左上 2:右上 3:左下 4:右下)

	//////////////////////////////////////////////////////////////////////////
	// ビットマップ関連
	virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=false) = 0;
	// bLoadPalette==falseだと、現在のパレットカラーに準じてSetDIBitsToDeviceで
	// 読み込まれる。WM_PALETTECHANGEDに応答するアプリの場合、これで読み込む必要あり

	virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
			,bool bLoadPalette=true) = 0;
	// 256色モードならば、別のファイルを読む場合は、これをオーバーライド

	virtual LRESULT	Release(void) = 0;
	virtual LRESULT SetColorKey(int x,int y) = 0;	// (x,y)の点を透過キーに設定する
	virtual LRESULT SetColorKey(int r,int g,int b) = 0;

	//	サーフェースの生成(CFastPlaneは、bYGAを指定しないといけない)
	// @yo2 0x00435d60 vt
	virtual LRESULT CreateSurface(int sx,int sy,bool bYGA=false) { return 1; } // not support

	//	(x,y)のα値を返す(DIB32,CFastPlaneのみ)
	//	非αサーフェースならば抜き色と同じであれば0,違うのならば255を返す
	// @yo2 0x00435d80 vt
	virtual int	GetPixelAlpha(int x,int y){
		//	ディフォルトでは、範囲外であるかどうかで判定
		int sx,sy;
		GetSize(sx,sy);
		if (x<0 || x>=sx || y<0 || y>=sy) return 0;
		return 255;
	}

	//	サーフェースのバックアップを作成して返す
	smart_ptr<CPlaneBase> GetBackup(void);

	static CPlaneBase* CreatePlane(void);
	//	生成関数。現在CDirectDrawを使っているのかCDIBDrawを使っているのかに応じて
	//	CPlane,CDIB32,CFastPlaneを生成する。

	//	CreatePlaneのためのFactoryを設定する
	static void SetPlaneBaseFactory(smart_ptr<CPlaneBaseFactory> pv) {
		m_pvPlaneFactory = pv;
	}

private:
	static smart_ptr<CPlaneBaseFactory> m_pvPlaneFactory;

};	//	とりあえず、それだけあれば十分っしょ＾＾；

#endif
