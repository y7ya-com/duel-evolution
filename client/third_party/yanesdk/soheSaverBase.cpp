#include "stdafx.h"

#ifdef USE_SAVER
#include "soheSaverBase.h"
//
//　WM_MOUSEWHEEL が未定義となるので追加(何故？
//
#define MY_WM_MOUSEWHEEL				   0x020A

//	基本的にはCAppBaseからのコピペ
//////////////////////////////////////////////////////////////////////////////

LRESULT CSaverBase::OnPreCreate(CWindowOption& opt, HWND& hParent) {
	opt.classname	= "yaneScreenSaver";

	switch (GetMode()) { 
	case modeMain:	  {
		opt.caption		= "yaneScreenSaver";
		opt.style		= WS_POPUP | WS_CLIPCHILDREN | WS_CLIPSIBLINGS | WS_VISIBLE;
		hParent = NULL;
		break;
					  }
	case modePreview: {
		opt.caption		= "yaneScreenSaver Preview";
		opt.style		= WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS | WS_VISIBLE;
		hParent = m_vHelper.GetParent();
		break;
					  }
	case modePassword:{
		opt.caption		= "yaneScreenSaver Password";
		opt.style		= WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
		hParent = NULL;
		break;
					  }
	case modeConfig:  {
		opt.caption		= "yaneScreenSaver Config";
		opt.style		= WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
		hParent = NULL;
		break;
					  }
	}
	m_vHelper.GetSize(opt.size_x, opt.size_y);	
	return 0;
}

LRESULT CSaverBase::OnCreate(void) {
	//	終了判定のために起動時のマウス位置を記録
	::GetCursorPos(&m_MousePosToRestore);
	POINT pt = m_MousePosToRestore;
	::ScreenToClient(GetHWnd(), &pt);
	m_nLastMouseX = pt.x, m_nLastMouseY = pt.y;

	if (IsMain()) {
		::ShowCursor(false);
		m_vIME.Hide();
	}
	return 0;
}
LRESULT CSaverBase::OnDestroy(void) {
	::ShowCursor(true);

	m_vIME.Show();
	return 0;
}

LRESULT CSaverBase::Init(
	string svCaption	//	キャプションで多重起動を判別するので重要
){
	//	多重起動の防止
	//		画面の設定においてプレビュー終了前に、表示プログラムが起きるため、
	//		SingleApp ではプレビューボタンの機能を実装できない？
	//		-> FindWindow を使う
	if (::FindWindow(NULL, svCaption.c_str()))	m_bIsSingle = false;
	else										m_bIsSingle = true;
	return (m_bIsSingle==false);
}
//////////////////////////////////////////////////////////////////////////////

bool CSaverBase::IsThreadValid(void)  {
	m_vIME.Hide();	//	かなり強引^^;

	//	このチェックのときにスレッドの正当性もチェックする
	Err.Out("CSaverBase::IsThreadValid, %d", m_bIdle);
	MSG msg;
	if ( !m_bIdle ){
		while (::PeekMessage(&msg,GetHWnd(),0,0,PM_REMOVE | PM_NOYIELD)) {
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...

			//	メッセージが存在する限り処理しつづける
			::TranslateMessage(&msg); 
			::DispatchMessage(&msg);
		}
	}else{
		// Idleモード追加
		while( ::GetMessage(&msg,GetHWnd(),0,0) ){
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...

			::TranslateMessage(&msg);
			::DispatchMessage(&msg);
			break;
		}
	}
	CAppIntervalTimer::TimerCallBackAll();	//	フックされているタイマにコールバックをかける
	if (m_bWaitIfMinimized) {
		//	WM_QUITか最小化が解除されるのを待つ
		while (GetMyWindow()->IsMinimized() && GetMessage(&msg,GetHWnd(),0,0)) {
			//	⇒ここ、GetHWndにしないとマルチウィンドゥにしたとき、マズイのだが、
			//　どうも、NULLウィンドゥにしか飛んでこないメッセージがあるようで...

		   ::TranslateMessage(&msg);
			::DispatchMessage(&msg);
		}
	}

	return (m_bThreadValid);
}

LRESULT CSaverBase::Run(void){
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
void CSaverBase::ThreadProc(void){		  //  override from CThread
	//	ウィンドゥの作成とWorkThreadの作成とMessageLoop
	if (OnInit()) return ;
 
	if (IsPreview()) {
		m_bIdle = true;	//	アイドルモードにしておく -> さもないと Win2000 で反応無くなる（謎
		timerID = ::SetTimer(GetHWnd(), NULL, 15, NULL);
	}
	
	CWindowOption opt;	HWND hParent;
	if (OnPreCreate(opt, hParent)) return ;				//	ウィンドゥが作られる前に呼び出される
	Init(opt.caption);
	if (IsSingle() == false)	return;					//	多重起動は禁止^^;
	if (m_oWindow.CreateSimpleWindow(opt, hParent)) return;	//	ウィンドゥの作成
	if (OnCreate()) return ;							//	ウィンドゥが作られてから呼び出される
	
	if (IsMain()) {										//	最前列に表示
		::SetWindowPos(GetHWnd(), (HWND)HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE|SWP_NOMOVE);
	}

	CAppManager::Add(this);								//	このCSaverBaseの登録
	CAppInitializer::Hook(this);						//	メッセージフック開始

	m_bMessage = true;									//	やっとウィンドゥは完成した
	MainThread();										//	ユーザー側で用意された、メイン関数
	m_bMessage = false;									//	ウィンドゥは破壊されるので...
	OnDestroy();										//	終了直前

	if (IsPreview()) {
		::KillTimer(GetHWnd(), timerID);
	}
//	タスクバーに残る問題の対策コード
	::ShowWindow(GetHWnd(), SW_HIDE);
	::SetWindowLong(GetHWnd(), GWL_STYLE, WS_POPUP);
	//	↑最悪のドライバのバグにそなえて、
	//	これを反映させるために(ShowWindowかSetWindowPosする必要がある)
	::SetWindowPos(GetHWnd(), (HWND)HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOSIZE|SWP_NOMOVE);

	//	Threadでappを判別しているのでHookしたThreadがDelしなくてはならない
	//	::SendMessage(GetHWnd(),WM_CLOSE,0,0);	//	メッセージスレッドを停止させる
	::SendMessage(GetHWnd(),WM_DESTROY,0,0);	//	メッセージスレッドを停止させる

	//	WM_Destoryを処理しなくてはならないのでここでフック解除
	CAppInitializer::Unhook(this);			//	メッセージフックの終了
	CAppManager::Del(this);					//	このCSaverBaseの削除
	InnerStopThread();						//	スレッドを停止
}
//////////////////////////////////////////////////////////////////////////////
//	このクラスのメッセージ処理用
//		新たにメッセージを処理したいときは、CWinHookから派生させたクラスを作って、
//		そいつでフックをかけてねん。
LRESULT CSaverBase::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){
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
		InnerStopThread();		//	これでWorkerを停止させてからでないと
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
//
//	柔軟性無くなるかなぁ
//		マウスなどによる終了の判定
//
	if (IsMain()) {
		switch (uMsg){
		case WM_MOUSEMOVE: {
			m_nMouseCount++;

			int nMouseX, nMouseY;
			nMouseX = LOWORD(lParam);
			nMouseY = HIWORD(lParam);
			if (abs(nMouseX-m_nLastMouseX) + abs(nMouseY-m_nLastMouseY) >= 5) {
				if (m_nMouseCount > 5)
					::PostMessage(hWnd, WM_CLOSE, 0, 0);
			}
			m_nLastMouseX = nMouseX;	m_nLastMouseY = nMouseY;
			break;
						   }
		case WM_LBUTTONDOWN: case WM_RBUTTONDOWN: case WM_MBUTTONDOWN:	case MY_WM_MOUSEWHEEL: {
			::PostMessage(hWnd, WM_CLOSE, 0, 0);
			break;
							 }
		case WM_KEYDOWN:	case WM_SYSKEYDOWN:	{
			::PostMessage(hWnd, WM_CLOSE, 0, 0);
			break;
							}
		case WM_ACTIVATE:	case WM_ACTIVATEAPP:	{
			::PostMessage(hWnd, WM_CLOSE, 0, 0);
			break;
							}
		}
	}
	return 0;
}
#endif