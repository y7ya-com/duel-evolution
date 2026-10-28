// MouseInput.h :
//	マウス入力用
//		programmed by yaneurao(M.Isozaki) '99/7/31
//
//	たいしたクラスではない。:p
//
//		※　ダブルクリックの感知はしない。
//

#ifndef __yaneMouseInput_h__
#define __yaneMouseInput_h__

#include "yaneWinHook.h"

class CMouse : public CWinHook {
public:
	virtual LRESULT GetXY(int &x,int &y)const;			//	マウスポジションを得る（クライアント座標系にて）
	virtual bool	RButton()const;						//	右ボタン状態を得る
	virtual bool	LButton()const;						//	左ボタン状態を得る
	virtual LRESULT GetInfo(int &x,int &y,int &b)const;	// マウスポジションとボタン状態を返す
	virtual void	GetButton(bool&bL,bool&bR);			//	前回のGetButtonから押されたか？
	virtual void	ResetButton();						//	↑ボタン状態リセット

	virtual LRESULT SetXY(int x,int y);					//	マウスを指定のポジションに移動（クライアント座標系にて）

	virtual void	SetOutScreenInput(bool bEnable);
	//	押したまま、マウスを画面外にやったとき、どうなるのか？
	//		true  == ボタンは押したままだと見なされる
	//		false == ボタンは離されたものと見なされる
	//		defaultではfalse

	// [Konami] click counters: +1 per button-down, +2 per double-click (names are ours)
	// @yo2 0x00541fb0 vt
	virtual int		GetLClickCount() const { return m_nLClickCount; }
	// @yo2 0x00541fd0 vt
	virtual int		GetRClickCount() const { return m_nRClickCount; }
	// @yo2 0x00541ff0 vt
	virtual void	ResetLClickCount() { m_nLClickCount = 0; }
	// @yo2 0x00542010 vt
	virtual void	ResetRClickCount() { m_nRClickCount = 0; }

	CMouse();
	virtual ~CMouse();

protected:
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam); // メッセージのコールバック

	bool	m_bRB;					//　マウスボタン状態
	bool	m_bLB;
	bool	m_bHistRB;				//	履歴
	bool	m_bHistLB;
	bool	m_bOutScreenInput;
	int		m_nRClickCount;		// [Konami]
	int		m_nLClickCount;		// [Konami]		//	画面外での入力
};

class CMouseEx : public CMouse {
public:
	virtual LRESULT GetXY(int &x,int &y)const;			//	マウスポジションを得る（クライアント座標系にて）
	virtual LRESULT GetFlushedXY(int &x,int &y)const;	//	[Konami] same as GetXY (name is ours)
	virtual bool	RButton()const;						//	右ボタン状態を得る
	virtual bool	LButton()const;						//	左ボタン状態を得る
	virtual LRESULT GetInfo(int &x,int &y,int &b)const;	// マウスポジションとボタン状態を返す

	//	前回のFlushから押されたか？
	virtual void	GetButton(bool&bL,bool&bR);
	virtual bool	IsPushRButton()const;
	virtual bool	IsPushLButton()const;
	//	前回のFlushから押し上げられたか？
	virtual void	GetUpButton(bool&bL,bool&bR);
	virtual bool	IsPushUpRButton()const;
	virtual bool	IsPushUpLButton()const;

	virtual void	ResetButton();						//	↑ボタン状態リセット

	virtual LRESULT SetXY(int x,int y);					//	マウスを指定のポジションに移動（クライアント座標系にて）
														//	いますぐ情報更新＾＾；
	//	フラッシュさせる
	virtual LRESULT	Flush();

	//	ガードタイム中かどうかを返す
	virtual bool	IsGuardTime()const;
	//	ガードタイムを設定する
	void	SetGuardTime(int nTime);

	CMouseEx();
	virtual ~CMouseEx();

protected:
	bool	m_bRBN;					//　Flushしたときのマウスボタン状態
	bool	m_bLBN;
	int		m_nRLBN;				//	Flushしたときのマウスボタン状態
	int		m_nX,m_nY;				//	Flushしたときのマウスのポジション
	int		m_nGuardTime;			//	ガードタイム
};

#endif
