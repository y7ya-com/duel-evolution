//
//		GUI的ボタンクラス
//
//		programmed by yaneurao(M.Isozaki) '01/02/09-'01/02/26
//

#ifndef __yaneGUIButton_h__
#define __yaneGUIButton_h__

#include "yaneGUIParts.h"
#include "yaneRootCounter.h"

class CPlaneBase;
class CMouseEx;
class CPlaneLoaderBasePre;

//////////////////////////////////////////////////////////////////////////////

//	ボタンが押された時の通知用ハンドラ
//		こいつとmediatorから多重継承して派生させると便利
class CGUIButtonEventListener {
public:
	// @yo2 0x00533680 vt
	virtual void OnInit(void) {}	//	ボタンクラスのOnDrawを呼び出したとき
									//	最初に送られる
			//	その後、ボタンの入力によって、以下のイベントが発生

	// @yo2 0x005336a0 vt
	virtual void OnRBClick(void){}	//	右ボタンクリック
	// @yo2 0x005336c0 vt
	virtual void OnLBClick(void){}	//	左ボタンクリック
	// @yo2 0x005336e0 vt
	virtual void OnRBDown(void){}	//	右ボタン押し下げ
	// @yo2 0x00533700 vt
	virtual	void OnLBDown(void){}	//	左ボタン押し下げ
	// @yo2 0x00533720 vt
	virtual	void OnRBUp(void){}		//	右ボタン押し上げ
	// @yo2 0x00533740 vt
	virtual void OnLBUp(void){}		//	左ボタン押し上げ

	//	--------これらは必ずオーバーライドすること
	// @yo2 0x00533760 vt
	virtual bool IsButton(int px,int py){ return true; }
	//	ボタン画像の(px,py)の地点はボタンの座標か？
	// @yo2 0x00533780 vt
	virtual LRESULT OnDraw(CPlaneBase*lp,int x,int y,bool bPush,bool bIn){ return 0; }
	//	ボタンを(x,y)の座標にbPushの状態で表示する

	// @yo2 0x005337a0 vt
	virtual bool	IsLClick(){ return false; }	//	そのフレーム内にクリックされたか？
	// @yo2 0x005337c0 vt
	virtual bool	IsRClick(){ return false; }	//	そのフレーム内にクリックされたか？
		//	↑受動的にイベントを受けるので、外部のクラスからこれをチェックする

	//	リスナはインターフェースクラスなので、仮想デストラクタが必須
	// @yo2 0x005339e0 vt
	// @yo2 0x0055c980 vt
	// @yo2 0x0055ced0 vt
	// @yo2 0x0055d090 vt
	virtual ~CGUIButtonEventListener(){}
};

//	通常は、このボタンListenerを使うと、便利がいい。
class CGUINormalButtonListener : public CGUIButtonEventListener {
public:
	virtual void SetPlaneLoader(smart_ptr<CPlaneLoaderBasePre> pv,int nNo);

	virtual void	SetPlaneTransiter(smart_ptr<CPlaneTransiter> pv);
	// @yo2 0x00533830 vt
	virtual CPlaneTransiter* GetPlaneTransiter(void){ return m_vPlaneTransiter;}
	virtual bool	IsButton(int px,int py);
	virtual LRESULT OnDraw(CPlaneBase*lp,int x,int y,bool bPush,bool bIn);

	virtual	void	SetType(int nType);
	// @yo2 0x00533850 vt
	virtual	int		GetType() { return m_nType; }

	// @yo2 0x00533870 vt
	virtual	void	SetReverse(bool bReverse) { m_bReverse = bReverse; }	//	反転ボタン
	// @yo2 0x00533890 vt
	virtual	bool	GetReverse() { return m_bReverse; }

	// @yo2 0x005338b0 vt
	virtual void	SetBlinkSpeed(int n) { m_nBlink.SetEnd(n); }
	// @yo2 0x005338d0 vt
	virtual void	SetImageOffset(int n) { m_nImageOffset = n; }
	// @yo2 0x005338f0 vt
	virtual int		GetImageOffset(void) { return m_nImageOffset; }
	virtual CPlaneBase* GetMyPlane(bool bPush=false);	//	表示プレーン取得

	//	ボタンが押されたときの通知
	// @yo2 0x00533910 vt
	virtual void	OnLButtonClick(void) {}	//	派生クラスではこれをオーバーライドする
	// @yo2 0x00533930 vt
	virtual void	OnRButtonClick(void) {}	//	派生クラスではこれをオーバーライドする
		//	↑能動的にイベントを受け付けてmediatorで親クラスにアクセスする
	// @yo2 0x00533950 vt
	virtual bool	IsLClick(){ return m_bLClick; }	//	そのフレーム内にクリックされたか？
		//	↑受動的にイベントを受けるので、外部のクラスからこれをチェックする
	// @yo2 0x00533970 vt
	virtual bool	IsRClick(){ return m_bRClick;}
	CGUINormalButtonListener();

protected:
	// @yo2 0x00533990 vt
	virtual void	OnInit(void) { m_bLClick = false;m_bRClick = false; }
	//	ボタンメッセージのハンドリングのためにoverride
	virtual void	OnLBClick(void);
	virtual void	OnRBClick(void);
	virtual void	OnLBDown(void);

	smart_ptr<CPlaneTransiter>	m_vPlaneTransiter;
	bool	m_bPlaneTransiter;
	smart_ptr<CPlaneLoaderBasePre> m_vPlaneLoader;	//	このプレーンローダーに登録されている、
	int		m_nPlaneStart;							//	この開始番号からのボタンを表示する

	int		m_nType;								//	ボタンタイプ
	//	0:無効
	//	+1:On/Offボタン(通常ボタン)
	//	+2:On1/Off1,On2/Off2の４つの表示を持つボタン(On2/Off2はReverseモード)
	//		（このタイプでなければ、SetReverseは無効になる。
	//	+4:YGA画像の場合、画像のα≠0の部分だけ有効（通常は画像の矩形全体が有効）
	//	+8:On/Offボタンだが、カーソルを上に置くとアクティブになり、
	//		左クリック押し下げの瞬間に押したことになる。
	//		（このタイプでなければ、WindowsGUIボタン互換となる）
	//	+16:点滅(On/Offを繰り返す)。入力は受付けない。押されたことを示すのに使う。
	//		+8のカーソルを押すと押し下げ状態になるボタンで使うと効果的。
	//		点滅スピードはSetBlinkSpeedで設定する
	//	+32:入力情報を完全に無視して SetImageOffsetで設定されたボタンを表示。
	//	+64:入力は行なうが、表示は常にSetImageOffsetで設定されたボタンを表示する。

	bool	m_bReverse;								//	反転モードか？
	bool	m_bLClick;								//	そのフレーム内にクリックされたか？
	bool	m_bRClick;
	CRootCounter m_nBlink;							//	これが点滅スピード
	int		m_nImageOffset;							//	強制的にこれを表示する(default:0)
};


//	GUIコンパチボタン。すなわち、左クリックで押し下げ。
class CGUIButton : public IGUIParts {
public:
	//	設定して欲しいやつ＾＾
	void	SetEvent(smart_ptr<CGUIButtonEventListener> pv) { Reset(); m_pvButtonEvent = pv; }


	//	設定したければしてもいいやつ＾＾
	void	SetLeftClick(bool b) { m_bLeftClick = b; }
		//	左クリックで反応するボタンか？(default:true)
	void	SetRightClick(bool b) { m_bRightClick = b; }
		//	右クリックで反応するボタンか？(default:false)

	//	property..
	smart_ptr<CGUIButtonEventListener> GetEvent() { return m_pvButtonEvent; }
	bool	IsPushed(void) { return m_bPushed; }
	bool	IsIn(void) { return m_bIn; }

	//	リスナを間接的に呼び出すことも出来る。
	bool	IsLClick(){ return m_pvButtonEvent->IsLClick(); }
	bool	IsRClick(){ return m_pvButtonEvent->IsRClick(); }
		//	そのフレーム内にクリックされたか？

	//	トランジッタを得る(CGUINormalButtonListenerのときのみ)
	CPlaneTransiter* GetPlaneTransiter();

	//	前回、フォーカスが無くて、今回、このボタンのフォーカス内に入ったか？
	bool	IsFocusing(){ return m_bFocusing;}

	//	実際の使用は、毎フレームこれを呼び出す
	//	MouseExは、外部でflushしていると仮定している
//	virtual LRESULT	OnDraw(CPlaneBase*lp);

	virtual LRESULT OnSimpleMove(CPlaneBase*lp);// イベント処理のみ
	virtual LRESULT OnSimpleDraw(CPlaneBase*lp);// 描画のみ

	// -------
	virtual void Reset();
	virtual void GetXY(int &x,int&y);

	CGUIButton();
	// @yo2 0x00534690 vt
	virtual ~CGUIButton() {}	// merely place holder

protected:
	smart_ptr<CGUIButtonEventListener>	m_pvButtonEvent;

private:
	bool		m_bPushed;		//	ボタンの押し下げ情報
	int			m_nButton;		//	（前回の）マウスのボタン情報
	bool		m_bIn;			//	（前回の）マウスがボタン外部にあったか

	bool		m_bLeftClick;	//	左クリックで反応するボタンか？(default:true)
	bool		m_bRightClick;	//	右クリックで反応するボタンか？(default:false)
	bool		m_bFocusing;	//	前回、フォーカスが無くて、今回、このボタンのフォーカス内に入ったか？
};

#endif
