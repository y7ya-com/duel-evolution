//
//	soheSaverBase.h
//		スクリーンセーバー用アプリのベースクラス。
//		CAppBase　では作りにくい^^;
//			2001/07/31	sohei create
//
#ifdef  USE_SAVER	//	スクリーンセーバ関係のクラスを使うかどうか

#ifndef __soheSaverBase_H__
#define __soheSaverBase_H__

#include "yaneAppBase.h"
#include "yaneAppManager.h"
#include "yaneAppIntervalTimer.h"
#include "yaneIMEBase.h"
#include "soheSaverHelper.h"

class CSaverBase: public CAppBase {
public:
	CSaverBase() : CAppBase() {
		m_vHelper.Init();
		m_nMouseCount = 0;
	}
	virtual			LRESULT Run(void);
	CSaverHelper*	GetHelper(void) { return &m_vHelper;			}	//	スクリーンセーバーヘルパに直接アクセスしたいとき使う
	int				GetMode(void)	{ return m_vHelper.GetMode();	}	//	スクリーンセーバーのモードを返す
	HWND			GetParent(void)	{ return m_vHelper.GetParent(); }	//	親ウィンドウを返す
	bool			IsSingle(void)	{ return m_bIsSingle;			}	//	CSingleApp 代わりの関数。
	bool			IsMain    (void){ return m_vHelper.IsMain    ();}	//	スクリーンセーバーのモードを返す
	bool			IsPreview (void){ return m_vHelper.IsPreview ();}	//	スクリーンセーバーのモードを返す
	bool			IsConfig  (void){ return m_vHelper.IsConfig  ();}	//	スクリーンセーバーのモードを返す
	bool			IsPassword(void){ return m_vHelper.IsPassword();}	//	スクリーンセーバーのモードを返す

	bool			IsThreadValid(void);	//	override from AppBase
protected:	//	override from AppBase
    virtual void MainThread(void) { while (IsThreadValid()) ::Sleep(20); }

	//	override from AppBase
    //  その他も適宜オーバーライドしてねん
    virtual LRESULT OnInit(void)    { return 0; }					//  生成直後
	virtual LRESULT OnPreCreate(CWindowOption& opt, HWND& hParent);	//  ウィンドゥ作成直前
    virtual LRESULT OnCreate(void);									//  ウィンドゥ作成直後
    virtual LRESULT OnDestroy(void);								//  終了直前

    virtual LRESULT OnPreClose(void) { return 0; }
    //  WM_CLOSE処理前に呼び出され、これを非0を返せばWM_CLOSEは実行されない
    //  その状況下においてウィンドゥをCLOSEさせるためには、Closeを呼び出すこと

    //  brief Window Message to override
    virtual void OnPaint(void) {  }

    virtual void    ThreadProc(void);                   //  override from CAppBase
    virtual LRESULT WndProc(HWND,UINT,WPARAM,LPARAM);   //  override in CAppBase

	CSaverHelper	m_vHelper;
	
	LRESULT		Init(
	   string svCaption  ="yaneScreenSaver"
	 );
private:
/*
    static  DWORD WINAPI RunPrepare(LPVOID lpVoid); //  Runからのジャンプ台
    LRESULT RunThread(void);                        //  ウィンドゥの作成とWorkThreadの作成とMessageLoop
    LRESULT MessageLoop(void);                      //  MessageLoop
*/
    volatile LONG   m_nThreadStatus;                //  スレッドのステータス
	bool	m_bIsSingle;
	int		m_nLastMouseX, m_nLastMouseY;
	int		m_nMouseCount;

	POINT	m_MousePosToRestore;
	CIMEBase	m_vIME;

	UINT_PTR	timerID;

	bool	m_bFinish;		//	終了すべきかどうか
};

#endif

#endif