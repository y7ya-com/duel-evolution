//
//	soheSaverDraw.h
//		スクリーンセーバー用の描画クラス
//		基本的に CDIBDraw だが、勝手にウィンドウを作ったりしない
//			2001/07/31	sohei create
//
#ifdef  USE_SAVER	//	スクリーンセーバ関係のクラスを使うかどうか

#ifndef __soheSaverDraw_H__
#define __soheSaverDraw_H__

//	CDIBDraw, CDirectDraw に相当するクラス。
//	スクリーンセーバーの描画を担当する。
//	とりあえず、DirectDraw を使わない実装のみ（汗
//
//	実装メモ
//		ScreenSize     - Windows のスクリーンの大きさ
//		UserScreenSize - クラスの使用者が想定するウィンドウの大きさ
//		RealSize       - スクリーンセーバーとして表示している画面サイズ
//	現時点では解像度の変更、色数の変更は行えない
//	その内実装しよっと（汗
//
//	時間がないので手抜きなのは仕方がない。
//	汎用性の高いのはまた今度
//
#include "yaneDirectDraw.h"
#include "yanePlaneBase.h"
#include "yaneSprite.h"
#include "yanePalette.h"
#include "yaneAppInitializer.h"
#include "yaneDIB32.h"
#include "soheSaverBase.h"

class CSaverDraw : public CWinHook,public CPlaneBase {
public:
    CSaverDraw(void);
    virtual ~CSaverDraw();

//	virtual	void	Restore(void);
	int		GetMode   (void);	//	スクリーンセーバーのモードを返す
	bool	IsMain    (void);	//	通常起動されたかどうか
	bool	IsPreview (void);	//	プレビューのために起動されたかどうか
	bool	IsConfig  (void);	//	設定かどうか
	bool	IsPassword(void);	//	パスワードかどうか

	void	SetAutoSize(bool bAuto) {
		m_bAutoSize = bAuto;
	}
	bool	IsAutoSize(void)        { 
		if (CAppInitializer::IsFullScreen()) return false;
		return m_bAutoSize && (m_nRealWidth!=m_nUserScreenXSize) && (m_nRealHeight!=m_nUserScreenYSize); 
	}
	void	GetRealSize(int&w, int&h) {
		w = m_nRealWidth;
		h = m_nRealHeight;
	}
protected:
	virtual	void	CreateSecondary(void);

private:
	bool	m_bAutoSize;
	int		m_nRealWidth, m_nRealHeight;
	int		m_nUserScreenXSize, m_nUserScreenYSize;
	CDIB32	m_vTempDIB;
///////////////////////////////////////////////////////
///		CDIBDraw と 同じにするには以下を実装
public:
    //////////////////////////////////////////
    //  ディスプレイモードの変更

    LRESULT     SetDisplay(bool bFullScr=false,int nSizeX=640,int nSizeY=480,int nColorDepth=0);
/*
    void        GetDisplay(bool&bFullScr,int &nSizeX,int &nSizeY,int &nColorDepth);
    bool        IsFullScreen(void);
    int         GetBpp(void);   // 現在のBppの取得

    //  Begin～Endでディスプレイモードを変更する。
    void        BeginChangeDisplay(void);
    void        TestDisplayMode(int nSX,int nSY,bool bFullScr=false,int nColor=0);
    LRESULT     EndChangeDisplay(void);
*/
    //////////////////////////////////////////
    //  プライマリとセカンダリの取得

    CDIB32*     GetSecondary(void)  { m_bDirty = true; return m_lpSecondary; }

    //  汚しフラグを立てる
    void        Invalidate(void) { m_bDirty = true; }

    ///////////////////////////////////////////////////////////////////////////
    //  Secondaryプレーンへの転送系(すべてCDIBに委譲する)

    //  CPlaneBaseの関数の実装を保証
    virtual LRESULT Blt(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BltFast(CPlaneBase* lpSrc,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BlendBlt(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
                ,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BlendBltFast(CPlaneBase* lpSrc,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRat
                ,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BltNatural(CPlaneBase* lpDIBSrc32,int x,int y,int nFade,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

    virtual LRESULT MosaicEffect(int d, LPRECT lpRect=NULL);
    virtual LRESULT FlushEffect(LPRECT lpRect=NULL);
    virtual void    GetSize(int &x,int &y);
    virtual LRESULT ClearRect(LPRECT lpRect=NULL);

    virtual LRESULT Load(string szBitmapFileName,bool bLoadPalette=false);
    virtual LRESULT LoadW(string szBitmapFileName256,string szBitmapFileNameElse
            ,bool bLoadPalette=true);
    virtual LRESULT Release(void);
    virtual LRESULT SetColorKey(int x,int y);
    virtual LRESULT SetColorKey(int r,int g,int b);
    virtual bool IsLoaded(void) const;

    //////////////////////////////////////////
    //  Secondaryプレーンの描画系(Secondaryプレーンに委譲する)
    
    LRESULT Clear(DWORD dwDIB32RGB=0,LPRECT lpRect=NULL);

    LRESULT BltClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    LRESULT BltFastClearAlpha(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    //  override from CPlaneBase
    virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT BlendBltFastAlpha(CPlaneBase* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
                ,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    virtual LRESULT FadeBltAlpha(CPlaneBase* lpSrc,int x,int y,int nFadeRate);

    LRESULT BltClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    LRESULT BltFastClearAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);
    LRESULT BlendBltFastAlphaM(CDIB32* lpDIBSrc32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRat
                ,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

    //////////////////////////////////////////
    //  Secondary->Primaryプレーンの転送
    
    virtual void    OnDraw(RECT* lpRect=NULL,bool bLayerCallBack=true);     //  Secondary->Primaryへの転送
                                            //  bLayerCallBack=falseの時はレイヤーを呼ばない
    void    SetOffset(int ox,int oy);   //  セカンダリの転送オフセット
    void    SetBrightness(int nBright); //  フェード

    //////////////////////////////////////////
    //  レイヤの管理

    //  Layerのリストを返す
    CLayerList* GetLayerList(void) { return &m_LayerList; }
    CLayerList* GetHDCLayerList(void) { return &m_HDCLayerList; }
    CLayerList* GetAfterLayerList(void) { return &m_AfterLayerList; }

    //////////////////////////////////////////
    //  スプライト描画

    //  通常描画
    void    Blt(CSprite*lpSprite,LPRECT lpClip=NULL){int x,y;lpSprite->GetPos(x,y);Blt(lpSprite,x,y,lpClip);}
    //  (x,y)に描画
    void    Blt(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL){ BltFix(lpSprite,x,y,lpClip); lpSprite->IncMotion(); }
    //  通常描画(モーション進めず)
    void    BltFix(CSprite*lpSprite,LPRECT lpClip=NULL){int x,y;lpSprite->GetPos(x,y);BltFix(lpSprite,x,y,lpClip);}
    //  (x,y)に描画(モーション進めず)
    void    BltFix(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL);
    //  ケツになっていたら、それ以上は加算しない
    void    BltOnce(CSprite*lpSprite,int x,int y,LPRECT lpClip=NULL);

    //////////////////////////////////////////
    //  パレット処理（作りかけ）

    CPalette*   GetPalette(void){ return& m_Palette; }  //  パレットの取得
    LRESULT     RealizePalette(void); // m_Paletteの実現
/*
    //////////////////////////////////////////
    //  property..

    int     GetMenuHeight(void);
    //  メニューがついているならば、そのメニュー高さを返す

    //////////////////////////////////////////
*/
protected:
    CDirectDrawBase m_DirectDrawBase;

    //  これでDirectDrawPtrを取得する
    LPDIRECTDRAW    GetDDraw(void) { return m_DirectDrawBase.GetDirectDrawPtr(); }
/*
    //  画面モードの変更関連
    LRESULT     ChangeDisplay(bool bFullScr);   //  現在のディスプレイモードを反映させる
    bool    m_bFullScr;         //  フルスクリーンモードか？
    int     m_nScreenXSize;     //  画面サイズ
    int     m_nScreenYSize;
    int     m_nScreenColor;     //  画面bpp
    bool    m_bDisplayChanging; //  解像度変更中
    int     m_nMenu;            //  メニュー高さ
*/
    //  セカンダリDIB32サーフェース
    auto_ptrEx<CDIB32>  m_lpSecondary;
    int     m_nSecondaryOffsetX;        //  セカンダリの転送オフセット量
    int     m_nSecondaryOffsetY;

    bool    m_bDirty;           //  セカンダリプレーンは前回プライマリに転送したときから汚れたか？
    HWND    m_hWnd;             //  いちいちCAppInitializerから取得すると遅くなるので

	int		m_nScreenColor;		//	画面の色数
	bool	m_bFullScr;			//	フルスクリーンかどうか

    //  for Layer management
    CLayerList  m_LayerList;
    CLayerList  m_AfterLayerList;
    CLayerList  m_HDCLayerList;

    //  画面のフェード関連(OnDrawで利用される)
    int     m_nBrightness;
    void    RealizeBrightness(int nBrightness);
    //  内部的な描画
    void    InnerOnDraw(HDC hDst,HDC hSrc,RECT* lpRect=NULL);

    //  パレット持ってんねん＾＾；
    CPalette    m_Palette;

    // override from CWinHook
    LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);
};

#endif

#endif

