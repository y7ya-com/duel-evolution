//	yaneApp.h :
//		application thread class
//			programmed by yaneurao	'00/02/25

#ifndef __yaneAppBase_h__
#define __yaneAppBase_h__

#include "yaneWinHook.h"
#include "yaneWindow.h"
#include "yaneThread.h"

class CAppBase : public CWinHook,public CThread {
public:

	virtual LRESULT Run(void);			//	窓の作成（とメッセージループ for MainApp

	HWND	GetHWnd(void) const { return m_oWindow.GetHWnd(); } //	ウィンドゥハンドル取得
	CWindow*GetMyWindow(void)	{ return &m_oWindow; }		//	ウィンドゥクラス取得

	bool	IsMainApp(void) const { return this==m_lpMainApp; }
	bool	IsMessage(void) const { return m_bMessage; }			//	メッセージループスレッドは生きているか

	//	これ使うかな？
	static	CAppBase* GetMainApp(void)	 { return m_lpMainApp; }
	static	HWND	GetMainWnd(void)	 { return GetMainApp()->GetHWnd(); }

	//	スレッドの正当性チェック overriden from CThread
	bool	IsThreadValid(void);

	//	スレッドのInvalidate。
	virtual void InvalidateThread(void);	//	overriden from CThread

	//	ウィンドゥ最小化時に待機するか
	volatile bool*	GetWaitIfMinimized(void) {	return &m_bWaitIfMinimized; }

	//	OnPreCloseを処理せずに強制的にWM_CLOSEを実行する
	virtual void	Close(void);

	//	Idleモード(default:false)にするのか
	bool* GetIdle(void) { return &m_bIdle;}

	CAppBase(void);
	virtual ~CAppBase();

protected:
	//////////////////////////////////////////////////////////////////////////
	//	継承するといいことあるかも（笑）関数の一覧

	//	これが実行スレッドなので継承して、こいつを用意してね！
	//	ウィンドゥ作成後(OnCreate()のあと)に呼び出されるの。
	// @yo2 0x0042b140 vt
	virtual void MainThread(void) { while (IsThreadValid()) ThreadSleep(20); }

	//	その他も適宜オーバーライドしてねん
	// @yo2 0x0042b180 vt
	virtual LRESULT OnInit(void)	{ return 0; }		//	生成直後
	virtual LRESULT OnPreCreate(CWindowOption& opt);	//	ウィンドゥ作成直前
	// @yo2 0x0042b1a0 vt
	virtual LRESULT OnCreate(void)	{ return 0; }		//	ウィンドゥ作成直後
	// @yo2 0x0042b1c0 vt
	virtual LRESULT OnDestroy(void) { return 0; }		//	終了直前

	// @yo2 0x0042b1e0 vt
	virtual LRESULT OnPreClose(void) { return 0; }
	//	WM_CLOSE処理前に呼び出され、これを非0を返せばWM_CLOSEは実行されない
	//	その状況下においてウィンドゥをCLOSEさせるためには、Closeを呼び出すこと

	//	brief Window Message to override
	// @yo2 0x0042b200 vt
	virtual void OnPaint(void)		{ }

	//////////////////////////////////////////////////////////////////////////
protected:
	CWindow m_oWindow;			//	保有しているwindow
	bool	m_bMessage;			//	メッセージループスレッドは生きているか

	static CAppBase* m_lpMainApp;	//	メインウィンドゥ（これの終了をプログラム終了とみなす）

	virtual void	ThreadProc(void);					//	override from CThread
	virtual LRESULT WndProc(HWND,UINT,WPARAM,LPARAM);	//	override in CWinHook
	void	InnerStopThread(void);

	volatile bool	m_bWaitIfMinimized;		//	ウィンドゥ最小化時に待機するか

	bool	m_bClose;			//	OnPreCloseを呼ばずにWM_CLOSEを処理するか？
	bool	m_bIdle;			//	Idleモード

private:
	static	DWORD WINAPI RunPrepare(LPVOID lpVoid); //	Runからのジャンプ台
	LRESULT RunThread(void);						//	ウィンドゥの作成とWorkThreadの作成とMessageLoop
	LRESULT MessageLoop(void);						//	MessageLoop
	volatile LONG	m_nThreadStatus;				//	スレッドのステータス
};

#endif
