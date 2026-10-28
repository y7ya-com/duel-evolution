// yaneTimer.h :
//
//	CTimer			:	経過時間をカウントするタイマ
//
//		programmed by yaneurao(M.Isozaki) '99/07/25
//		modified by yaneurao '00/02/28-'00/03/13
//

#ifndef __yaneTime_h__
#define __yaneTime_h__

//	早い話がtimeGetTime wrapper
class CTimeBase {
public:
	static int		timeBeginPeriodMin(void);	//	タイマを最小設定にする（返し値 interval[ms]）
	static void		timeEndPeriodMin(void);		//	タイマ最小設定解除
	static DWORD	timeGetTime(void) {
		if (m_bUseTGT) {
//			::timeGetSystemTime(&m_mmtime,sizeof(MMTIME));
//			return m_mmtime.u.ms;
			return ::timeGetTime();
		} else {
			return ::GetTickCount();
		}
	}
	///////////////////////////////////////////////////////////////////////
	CTimeBase(void);	// Initilizer
protected:
	static bool		m_bUseTGT;			//	timeGetTimeを使用するのか？
	static int		m_nRef;				//	timeBeginPeriodMin～timeEndPeriodMinの参照カウント
	static TIMECAPS	m_dwTimeCaps;		//	タイマー性能
//	static MMTIME	m_mmtime;			//	高速化のためtimeGetSystemTimeを使用
//		↑速いかと思ってたら、速くなかった
};

//////////////////////////////////////////////////////////////////////////////

class CTimer {
public:
	void	Reset(void);
	DWORD	Get(void);					//	時刻の取得
	void	Set(DWORD);					//	時刻の設定
	void	Pause(void);				//	Pause機能
	void	Restart(void);				//	Pause解除
	static LRESULT	PauseAll(void);		//	全インスタンスのPause
	static LRESULT	RestartAll(void);	//	全インスタンスのPause解除

	/////////////////////////////////////////////////////////////////
public:
	CTimer(void);
	virtual ~CTimer();
protected:
	static set<CTimer*>	m_aTimer;			//	全インスタンスのチェーン
	DWORD	m_dwOffsetTime;					//	オフセット値
	DWORD	m_dwPauseTime;					//	PauseかけたときのTime
	int		m_bPaused;						//	pause中か？
};

//////////////////////////////////////////////////////////////////////////////

class CTimerEx : public CTimer {
public:
	void	Reset(void);
	DWORD	Get(void);					//	時刻の取得
	void	Set(DWORD);					//	時刻の設定
	void	Pause(void);				//	Pause機能
	void	Restart(void);				//	Pause解除

	static	void Flush(void);			//	時刻のフラッシュ

protected:
	static DWORD m_dwTimeGetTime;			//	前回Flushした時間
};

#endif
