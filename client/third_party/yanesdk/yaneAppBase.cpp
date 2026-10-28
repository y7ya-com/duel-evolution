#include "stdafx.h"
#include "yaneAppBase.h"
#include "yaneAppManager.h"
#include "yaneAppInitializer.h"
#include "yaneAppIntervalTimer.h"

CAppBase*	CAppBase::m_lpMainApp=NULL;

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0042b0a0 review
CAppBase::CAppBase(void) {
	m_bIdle		=	false;
	m_bMessage	=	false;
	m_bWaitIfMinimized = false;
	m_bClose	=	false;	//	OnPreCloseを無視してCloseする状態なのか？

	CAppManager::Inc();	//	参照カウントのインクリメント
}

// @yo2 0x0042b260 vt
CAppBase::~CAppBase(void) {
/*
	//	メインスレッドは、スレッドでは無いのだ＾＾；
	StopThread();
	//	メッセージループとメインスレッドの終了を待つ
	while (IsMessage()) {
		::Sleep(100);
	}
*/

	StopThread();
	CAppManager::Dec();	//	参照カウントのデクリメント
	//	このクラスは、CThread派生クラスなので、
	//	↑DecがStopThreadより先になってしまう。
	//	よって、先行して、StopThreadを呼び出すことによって、
	//	スレッドの停止が保証される。
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0042b300 vt
LRESULT CAppBase::OnPreCreate(CWindowOption& opt){

//	opt.caption		= "あぷりちゃん";
//	opt.classname	= "YANEAPPLICATION";
	opt.caption		= "CAPTION";		//	[Konami] default caption
	opt.classname	= "CLASSNAME";	//	[Konami] default class name
	opt.size_x		= 640;
	opt.size_y		= 480;
//	opt.style		= WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_CAPTION;
	opt.style		= WS_MINIMIZEBOX | WS_CAPTION | WS_SYSMENU;

	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0042b4c0 vt
LRESULT CAppBase::Run(void){
	//	これが第一インスタンスならば、これを親ウィンドゥとみなす
	if (m_lpMainApp==NULL) m_lpMainApp = this;

	if (IsMainApp()) {
		return JumpToThread();
	}
	//	メインウィンドゥ以外ならば、それ専用にスレッドを作る↓

	m_nThreadStatus = -1;
	if (CreateThread()) return 1;

	//	ウィンドゥの完成まで待つ
	while (true){
		if (m_bMessage || m_nThreadStatus>=0) break;
		::Sleep(100);
	}
	return 0;
}

//	これが作成されたメインスレッド
// @yo2 0x0042b550 vt
void CAppBase::ThreadProc(void){		//	override from CThread
	//	ウィンドゥの作成とWorkThreadの作成とMessageLoop
	if (OnInit()) return ;
	CWindowOption opt;
	if (OnPreCreate(opt)) return ;			//	ウィンドゥが作られる前に呼び出される
	if (m_oWindow.Create(opt)) return ;		//	ウィンドゥの作成
	if (OnCreate()) return ;				//	ウィンドゥが作られてから呼び出される
	CAppManager::Add(this);					//	このCAppBaseの登録
	CAppInitializer::Hook(this);			//	メッセージフック開始
	m_bMessage = true;						//	やっとウィンドゥは完成した
	MainThread();							//	ユーザー側で用意された、メイン関数
	m_bMessage = false;						//	ウィンドゥは破壊されるので...
	OnDestroy();							//	終了直前
	//	Threadでappを判別しているのでHookしたThreadがDelしなくてはならない
	//	::SendMessage(GetHWnd(),WM_CLOSE,0,0);	//	メッセージスレッドを停止させる
	::SendMessage(GetHWnd(),WM_DESTROY,0,0);	//	メッセージスレッドを停止させる
	//	WM_Destoryを処理しなくてはならないのでここでフック解除
	CAppInitializer::Unhook(this);			//	メッセージフックの終了

	/*
		ここでCAppManagerから切り離すと、StopThreadされる前に、
		終了判定が行なわれ、スレッドが残存する可能性がある。
		よって、CThreadの全てのスレッドが終了したのを確認してから停止すべき
	*/

	CAppManager::Del(this);					//	このCAppBaseの削除
	InnerStopThread();						//	スレッドを停止
}

// @yo2 0x0042b8a0 feat
bool CAppBase::IsThreadValid(void)	{
	//	このチェックのときにスレッドの正当性もチェックする
	MSG msg;
	LRESULT lr;
	if ( !m_bIdle ){
		while (::PeekMessage(&msg, NULL /* GetHWnd() */,0,0,PM_REMOVE)) {
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...

			//	メッセージが存在する限り処理しつづける
			::TranslateMessage(&msg); 
			::DispatchMessage(&msg);
		}
	}else{
		// Idleモード追加
		while( (lr = ::GetMessage(&msg, NULL ,0,0)) ){
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...
			if (lr==-1) break;
			//	エラーコードが返ってきている場合、それを
			//	dispatchしてはいけない。
			//	しかし、この場合、アプリを終了させるべきだろうか？

			::TranslateMessage(&msg);
			::DispatchMessage(&msg);
			break;
		}
	}
	CAppIntervalTimer::TimerCallBackAll();	//	フックされているタイマにコールバックをかける
	if (m_bWaitIfMinimized) {
		//	WM_QUITか最小化が解除されるのを待つ
		while (GetMyWindow()->IsMinimized() && (lr = GetMessage(&msg,NULL,0,0))) {
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...
			if (lr==-1) break;
			//	エラーコードが返ってきている場合、それを
			//	dispatchしてはいけない。
			//	しかし、この場合、アプリを終了させるべきだろうか？

			::TranslateMessage(&msg);
			::DispatchMessage(&msg);
		}
	}
	return (m_bThreadValid);
}

// @yo2 0x0042b9c0 cg
void	CAppBase::InnerStopThread(void){
	if (IsMainApp()) {
		CAppManager::StopAllThread();			//	全スレッドを停止させる
		m_bThreadValid = false;					//	シングルスレッドなので、こうね！
	} else {
		//	シングルスレッドならばこれは呼び出すまでもなく、停止しているはずだが
//		StopThread();							//	メインスレッドの終了待機する
		m_bThreadValid = false;					//	シングルスレッドなので、こうね！
	}
}

// @yo2 0x0042b9f0 vt
void	CAppBase::InvalidateThread(void){	//	overriden from CThread
//	Idleモードを採用しているので、メッセージが来ない限り、
//	IsThreadValidが呼び出されない、すなわち、WM_CLOSEに応答して閉じることが出来ない
	if (m_bIdle){
		HWND hWnd = GetHWnd();
		if (hWnd!=NULL) {	//	このメッセージ送って破壊してまう
			//	::SendMessage(hWnd,WM_CLOSE,0,0);
			//	こいつは、メッセージキューに積まれるため、
			//	これを呼び出したスレッドのメッセージループが呼ばれる
			//	まで、これの実行が遅延される。
			//	よって、
			::PostMessage(hWnd,WM_CLOSE,0,0);
			//	これが正解。
		}
	}
	CThread::InvalidateThread();	//	superクラスに委譲する
}

//////////////////////////////////////////////////////////////////////////////
//	このクラスのメッセージ処理用
//		新たにメッセージを処理したいときは、CWinHookから派生させたクラスを作って、
//		そいつでフックをかけてねん。
// @yo2 0x0042ba30 vt
LRESULT CAppBase::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){

	switch (uMsg){

	///////////////////////////////////////////////////////////////////////////
/*
	//	GetMessageで自分の属するウィンドゥメッセージしか取り出していないので、
	//	アプリが切り替わったときにWM_PAINTが拾えないことがあるようだが…(Windows2000βのバグ?)
	case WM_ACTIVATEAPP : {
		if( wParam ) UpdateWindow(hWnd);
		break;
						  }
*/
	case WM_CLOSE: { // ウインドウが閉じられた
		if (!m_bClose && OnPreClose()) return 1; // 処理したことにして帰る
		InvalidateThread();
//		InnerStopThread();		//	これでWorkerを停止させてからでないと
								//	WM_DESTORYでhWndが無効になると、その途端、
								//	ワーカースレッドが困ることになる
		return 1;
		//	invalidateしておけば、ワーカースレッドは自動的に帰還する
		//	帰還したワーカースレッドにWM_DESTROYを発行してもらう
				   }

	case WM_DESTROY:{

		if (IsMainApp()) {
			PostQuitMessage(0); //	メインウィンドゥだったなら終了する
		}
		break;
					}
	}
	return 0;
}

// @yo2 0x0042bab0 vt
void	CAppBase::Close(void){
	m_bClose=true;
	::SendMessage(GetHWnd(),WM_CLOSE,0,0);
}
