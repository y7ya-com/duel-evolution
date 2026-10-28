//	yaneThread.h :
//		programmed by yaneurao	'00/02/26
//		同期オブジェクトの導入 '01/11/19

#ifndef __yaneThread_h__
#define __yaneThread_h__

class CThread {
public:
	virtual void ThreadProc() = 0;	//	これをオーバーライドしてね！

	virtual LRESULT CreateThread();
	virtual LRESULT StopThread();
	virtual LRESULT JumpToThread();	//	スレッドを作らずにジャンプ
	// @yo2 0x00426250 vt
	virtual bool IsThreadExecute()const { return m_bThreadExecute; }
	// @yo2 0x00426270 vt
	virtual bool IsThreadValid()const	{ return m_bThreadValid;   }
	virtual void InvalidateThread();

	//	Threadが生きていることを示す同期オブジェクト
	virtual	LRESULT ThreadSleep(int nTime);
	//	nTime [ms]待つ。待っている最中に、同期オブジェクトがシグナル状態
	//	（スレッドを終了させなさい、という状態）になれば、非0が返る。

	CThread();
	virtual ~CThread();

protected:
	volatile bool m_bThreadExecute;	//	Threadは実行中なのか？
	volatile bool m_bThreadValid;	//	Threadを停止させたいときはfalseにする
//	static DWORD WINAPI ThreadCallBack(LPVOID lpVoid);
	static void ThreadCallBack(LPVOID lpVoid);
	volatile DWORD	m_dwThreadID;		//	スレッドハンドル
	HANDLE	m_hEventObject;				//	同期オブジェクト
	virtual void InnerCreateEvent();	//	↑の作成
	virtual void InnerDeleteEvent();	//	↑の解体
};

#endif
