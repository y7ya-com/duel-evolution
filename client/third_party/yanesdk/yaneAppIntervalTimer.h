// yaneAppIntervalTimer.h :
//
//	CAppBaseに寄生するタイマ＾＾；

#ifndef __yaneAppIntervalTime_h__
#define __yaneAppIntervalTime_h__

class CAppIntervalTimer {
public:

	CAppIntervalTimer(void);
	virtual ~CAppIntervalTimer();

	//	タイマを開始する
	LRESULT Start(void);
	LRESULT Stop(void);						//	タイマを止める
	bool	IsTimer(void) const;			//	タイマが回っているのか
	// @yo2 0x0042bf10 vt
	virtual void TimerProc(void) { }		//	コールバックされる関数

	static void	TimerCallBackAll(void);			//	生きているすべてのタイマにコールバックをかける

protected:
	bool	m_bStop;							//	タイマ止まってる？

	static	chain<CAppIntervalTimer> m_alpTimerList;	//	コールバックすべきリスト
};

#endif
