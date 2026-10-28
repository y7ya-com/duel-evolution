#include "stdafx.h"
#include "yaneThread.h"
#include <process.h> 

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0057ef20 review
CThread::CThread(){
	m_dwThreadID	 = -1;
	//	-1はエラー値。(スレッドハンドルとしてはありえない値)
	//	（_beginthreadexは理論上は０が返ってくることがある）

	m_bThreadExecute = false;
	m_bThreadValid	 = false;
	m_hEventObject	= NULL;
}

// @yo2 0x0057ef80 vt
CThread::~CThread(){
	StopThread();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0057efa0 vt
LRESULT CThread::CreateThread() {
	StopThread();
//	return !::CreateThread(NULL,0,ThreadCallBack,this,NULL,&m_dwThreadID);
	m_dwThreadID = ::_beginthread(ThreadCallBack,0,(void*)this);
	/*
					↑ここでコンパイルエラーが出るとしたら、
				リンクするライブラリがシングルスレッドになっているからです。
		プロジェクトの設定⇒「C/C++」⇒「コード生成」で、
		「使用するランタイムライブラリ」は、マルチスレッド用のものを使用してください。
	*/

	if (m_dwThreadID==-1) {
		return 1;
	}
	return 0;
		//	⇒_beginthreadexは、エラー時、-1が返ってくる
	/*
		CreateThreadではなく_beginthreadでスレッドを生成しないと、
		C言語のランタイムを呼び出している場合、小規模なメモリリークが発生する。(80バイト程度)
		あと、コンパイルするときは、マルチスレッド用のライブラリをリンクするように。
	*/
}

// @yo2 0x0057efe0 feat
LRESULT CThread::StopThread() {
	InvalidateThread();			//	止まって欲しいねん！

/*
	while (m_bThreadExecute)	//	まだかな、まだかな...
		::Sleep(10);
	↑この方法で、スレッドの終了を待つと、スレッドの後処理が終了していないのに
	このフラグが倒れた瞬間、スレッドが終了したものとして、メインスレッドが
	終了してしまい、このスレッドが残骸として残る可能性がある。
*/
	if (m_dwThreadID==-1) return 0;
	//	スレッド動いてへんで？

	//	[Konami] called from the thread itself: do not wait for ourselves
	//	(compares the _beginthread handle with the current thread id, as the exe does)
	if (m_dwThreadID == ::GetCurrentThreadId()) return 2;
	//	[Konami] thread already finished: nothing to wait for
	if (!m_bThreadExecute) return 0;

	//	これ、あまり良くないとは思うけど、スレッドハンドルが重複するほど長時間
	//	（おそらく、数年）電源を入れっぱなしで使用
	//	続けることは無いと思われるので、考えないことにする
	DWORD dwResult = ::WaitForSingleObject((HANDLE)m_dwThreadID,INFINITE);
	m_dwThreadID = -1;
	if (dwResult != WAIT_OBJECT_0) {
		//	きっと、このスレッドハンドルの所有権がすでに
		//	破棄されていたのだと思う..
		return 1;
	}
	//	終了したので．．
	return 0;
}

// @yo2 0x0057f060 vt
LRESULT CThread::JumpToThread() {
	InnerCreateEvent();
	ThreadProc();				//	これを実行するのだが
	InnerDeleteEvent();
	return 0;
}

// @yo2 0x0057f090 tight
void CThread::ThreadCallBack(LPVOID lpVoid){
	CThread* pThread = reinterpret_cast<CThread*>(lpVoid);
	pThread->InnerCreateEvent();
	pThread->ThreadProc();
	pThread->InnerDeleteEvent();	// 同期オブジェクトを解体しとこっと＾＾；
}

// @yo2 0x0057f0c0 vt
void	CThread::InvalidateThread(){
	m_bThreadValid = false;
	//	同期オブジェクトもシグナル状態にしてやる

	::SetEvent(m_hEventObject);
}

///////////////////////////////////////////////////////////////////////////
//	同期オブジェクトの投入 '01/11/19


// @yo2 0x0057f0e0 vt
void	CThread::InnerCreateEvent(){
	InnerDeleteEvent();	//	前のやつを解体せねば！
	m_hEventObject = ::CreateEvent(
		NULL,	//	security descriptor
		FALSE,	//	auto reset
		FALSE,	//	not signal state
		NULL	//	event object name
	);
	//	NULLならば生成エラーなのだが．．
	m_bThreadExecute = true;
	m_bThreadValid	 = true;
}

// @yo2 0x0057f120 vt
void	CThread::InnerDeleteEvent(){
	if (m_hEventObject!=NULL){
		::CloseHandle(m_hEventObject);
		m_hEventObject = NULL;
	}
	m_bThreadExecute = false;
}

// @yo2 0x0057f150 vt
LRESULT CThread::ThreadSleep(int nTime){
//	nTime [ms]待つ。待っている最中に、同期オブジェクトがシグナル状態
//	（スレッドを終了させなさい、という状態）になれば、非0が返る。
	if (m_hEventObject == NULL) return -1;

	DWORD dwResult = ::WaitForSingleObject(m_hEventObject,nTime);
	if (dwResult == WAIT_TIMEOUT) {
		//	オッケー！　まだまだいける（笑）
		return 0;
	}

	return 1;
}
