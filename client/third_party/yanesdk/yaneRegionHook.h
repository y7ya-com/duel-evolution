//
//	yaneRegionHook.h :
//
#ifndef __yaneRegionHook_h__
#define __yaneRegionHook_h__

#include "yaneRegion.h"
#include "yaneWinHook.h"

class CRegionHook : public CWinHook {
public:
	CRegionHook();
	CRegionHook(CPlaneBase *lp);
	virtual ~CRegionHook();

	//	bmp読み込み後のCPlaneBase*を渡して、そのサーフェースに設定されている
	//	colorkey(ヌキ色)の部分を抜いたリージョンを作成。
	LRESULT Set(CPlaneBase* lpPlane);
	// リージョン直接設定
	LRESULT Set(const CRegion &rgn);

	//	bmpファイルを読み込んで、そのdwRGBの色を抜いたリージョンを作成。
	LRESULT	Load(const string szFileName,int r,int g,int b);
	//	bmpファイルを読み込んで、その(nPosX,nPosY)の座標の色を抜いたリージョンを作成。
	LRESULT	Load(const string szFileName,int nPosX=0,int nPosY=0);

	//	リージョン解放
	void	Release(void);

	bool*	IsDrag(void) { return& m_bDrag; }	//	ドラッグでの移動中であるか？

protected:
	// @yo2 0x00558410 vt
	virtual	bool MustBeDrag(const POINT& pt){
		//	この座標をドラッグするのか？
		return true;	//	デイフォルトでドラッグする
	}

	HRGN	m_hRgn;// めんどいので直接ハンドルを持っとこう(ダサ)
	void	InnerSetRegion(HRGN hRgn);					//	リージョンをウインドウに関連付け
	virtual LRESULT WndProc(HWND,UINT,WPARAM,LPARAM);	//	override in CWinHook
	bool	m_bDrag;									//	ドラッグによるウィンドゥ移動中か？
	POINT	m_ptDrag;									//	ドラッグされた座標を保存しておく
};

#endif
