//
//		GUI的スライダクラス
//
//		programmed by yaneurao(M.Isozaki) '01/06/10
//

#ifndef __yaneGUISlider_h__
#define __yaneGUISlider_h__

#include "yaneGUIParts.h"
#include "yaneRootCounter.h"

class CPlaneBase;
class CMouseEx;
class CPlaneLoaderBasePre;

//////////////////////////////////////////////////////////////////////////////

class CGUISlider;

//	ボタンが押された時の通知用ハンドラ
//		こいつとmediatorから多重継承して派生させると便利
class CGUISliderEventListener {
public:
	// @yo2 0x00535110 vt
	virtual void OnInit(void) {}	//	ボタンクラスのOnDrawを呼び出したとき
									//	最初に送られる
			//	その後、ボタンの入力によって、以下のイベントが発生

	//	--------これらは必ずオーバーライドすること
	// @yo2 0x00535130 vt
	virtual bool IsButton(int px,int py){ return true; }
	//	スライダ画像の(px,py)の地点はボタンの座標か？

	// @yo2 0x00535150 vt
	virtual LRESULT OnDraw(CPlaneBase*lp,int x,int y,int nX,int nY){ return 0; }
	//	ボタンを(x,y)の座標に全体が(nX,nY)項目あるときの状態で表示する

	virtual void GetSliderSize(int nX,int nY,int& sx,int& sy) = 0;
	//	要素が(nX,nY)項目あるときのスライダサイズ(sx,sy)を返す

	//	---	イベント（必要に応じてオーバーライドすること）
	// @yo2 0x00535170 vt
	virtual void OnPageUp(){}		//	スライダの可動域におけるボタン以外の場所で、かつ、ボタンより上部が押されたときの通知ハンドラ(スライダは縦タイプであること)
	// @yo2 0x00535190 vt
	virtual void OnPageDown(){}		//	スライダの可動域におけるボタン以外の場所で、かつ、ボタンより下部が押されたときの通知ハンドラ(スライダは縦タイプであること)

	// @yo2 0x005351b0 vt
	virtual void OnPageLeft(){}		//	スライダの可動域におけるボタン以外の場所で、かつ、ボタンより左部が押されたときの通知ハンドラ(スライダは横タイプであること)
	// @yo2 0x005351d0 vt
	virtual void OnPageRight(){}	//	スライダの可動域におけるボタン以外の場所で、かつ、ボタンより右部が押されたときの通知ハンドラ(スライダは横タイプであること)

	//	--- property..
	//	スライダの最小サイズの設定／取得
	void	SetMinSize(int sx,int sy) { m_nMinX = sx; m_nMinY = sy; }
	void	GetMinSize(int&sx,int&sy) { sx = m_nMinX; sy = m_nMinY; }

	// ---------------------------------------------------------------
public:
	//	親クラスの設定
	void SetSlider(smart_ptr<CGUISlider> v ) { m_vGUISlider = v; }
	smart_ptr<CGUISlider> GetSlider() { return m_vGUISlider; }

	CGUISliderEventListener();
	//	リスナはインターフェースクラスなので、仮想デストラクタが必須
	// @yo2 0x00535220 vt
	virtual ~CGUISliderEventListener(){}

protected:
	smart_ptr<CGUISlider> m_vGUISlider;
	int		m_nMinX,m_nMinY;	//	スライダ最小サイズ

};

class CGUINormalSliderListener : public CGUISliderEventListener {
public:
	virtual void SetPlaneLoader(smart_ptr<CPlaneLoaderBasePre> pv){ m_vPlaneLoader = pv; }

	virtual void GetSliderSize(int nX,int nY,int &sx,int &sy);
	virtual LRESULT OnDraw(CPlaneBase*lp,int x,int y,int nX,int nY);

	//	property..
	virtual void	SetPlaneTransiter(smart_ptr<CPlaneTransiter> pv);
	virtual CPlaneTransiter* GetPlaneTransiter(void){ return m_vPlaneTransiter;}

protected:
	smart_ptr<CPlaneLoaderBasePre> m_vPlaneLoader;	//	このプレーンローダーに登録されている、

	smart_ptr<CPlaneTransiter>	m_vPlaneTransiter;
	bool	m_bPlaneTransiter;

};

//	GUIコンパチスライダ。すなわち、左クリックで押し下げ。
class CGUISlider : public IGUIParts {
public:
	//	設定して欲しいやつ＾＾
	void	SetEvent(smart_ptr<CGUISliderEventListener> pv);

	//	property..
	smart_ptr<CGUISliderEventListener> GetEvent() { return m_pvSliderEvent; }
	bool	IsDraged(void) { return m_bDraged; }
	bool	IsIn(void) { return m_bIn; }
	bool	IsUpdate(void) { return m_bUpdate; }
	//	どうでも良いが、IsUpdateというのは英語的にどうなのか...かと言って
	//	HasUpdatedだとか、そういうのもなんだか鬱陶しい気もするのだが．．

	//	スライダの可動矩形の設定(実際の位置は、これにIGUIParts::SetXY,SetXYOffsetで
	//	設定した値を加算したものになる)
	void	SetRect(LPRECT lprc) { m_rcRect = *lprc; }
	LPRECT	GetRect() { return &m_rcRect; }

	//	選択されている項目位置を設定／取得
	void	SetSelectedItem(int nX,int nY) { m_nSelectedItemX = nX; m_nSelectedItemY = nY; }
	void	GetSelectedItem(int& nX,int& nY) { nX = m_nSelectedItemX; nY = m_nSelectedItemY; }
	//	項目数の設定／取得
	void	SetItemNum(int nX,int nY) { m_nItemNumX = nX; m_nItemNumY = nY; }
	void	GetItemNum(int& nX,int& nY) { nX = m_nItemNumX; nY = m_nItemNumY; }
	//	現在の座標の設定／取得（通常使用では使うことは無い？）
	void	GetPos(int &nX,int &nY) { nX = m_nPosX; nY = m_nPosY; }
	void	SetPos(int nX,int nY) { m_nPosX = nX; m_nPosY = nY; }
	//	スライダの種類(0:縦(default) 1:横 2:縦横)
	void	SetType(int nType) { m_nType = nType; }
	int		GetType() { return m_nType; }

	//	トランジッタを得る(CGUINormalSliderListenerのときのみ）
	CPlaneTransiter* GetPlaneTransiter();

	//	実際の使用は、毎フレームこれを呼び出す
	//	MouseExは、外部でflushしていると仮定している
//	virtual LRESULT	OnDraw(CPlaneBase*lp);

	virtual LRESULT OnSimpleDraw(CPlaneBase*lp);
	virtual LRESULT OnSimpleMove(CPlaneBase*lp);

	// -------
	virtual void Reset();
	virtual void GetXY(int &x,int&y);

	// -------
	void		CalcSliderPos(int&x,int&y,int &nSx,int &nSy,int&w,int&h);
	// スライダ位置の計算
	//	(x,y)は、表示する座標。(nSx,nSy)は、スライダボタンサイズ
	//	(w,h)は、ボタン部を含まないスライダ部の可動広さ

	CGUISlider();
	// @yo2 0x00535a20 vt
	virtual ~CGUISlider() {}	// merely place holder

protected:
	smart_ptr<CGUISliderEventListener>	m_pvSliderEvent;
	int			m_nItemNumX;		//	X方向の項目数
	int			m_nItemNumY;		//	Y方向の項目数
	int			m_nSelectedItemX;	//	X方向の選択番号
	int			m_nSelectedItemY;	//	Y方向の選択番号
	int			m_nPosX,m_nPosY;	//	現在の座標(相対)

private:
	int			m_nType;		//	スライダの種類(0:縦 , 1:横 , 2:縦横)
	bool		m_bDraged;		//	ボタンドラッグ中なのか？
	int			m_nDragPosX;	//	ドラッグされ始めたX座標(相対座標)
	int			m_nDragPosY;	//	ドラッグされ始めたY座標(相対座標)
	bool		m_bFocusing;	//	（前回はフォーカスが無く）今回フォーカスがあるのか？
	int			m_nButton;		//	（前回の）マウスのボタン情報
	bool		m_bIn;			//	（前回の）マウスがボタン外部にあったか
	bool		m_bUpdate;		//	（前回から）スライダ位置が変更(違う項目を指す状態)になった
	RECT		m_rcRect;		//	スライダの可動域
};

#endif
