// yaneTimer.h :
//
//	CIntervalTimer	:	マルチメディアタイマ
//						と通常のインターバルタイマーの統合クラス
//
//		programmed by yaneurao(M.Isozaki) '99/07/25
//		modified by yaneurao '00/02/28-'00/03/13
//

#ifndef __yaneIntervalTime_h__
#define __yaneIntervalTime_h__

// マルチメディアタイマー
class CIntervalTimer {
public:

	CIntervalTimer(void);
	virtual ~CIntervalTimer();

	//	タイマを開始する
	LRESULT Start(DWORD dwInterval,bool bMultiMediaTimer = true);

	//	こちらは、一発タイマを何度も呼び出す
	LRESULT	StartM(DWORD dwInterval);

	LRESULT Stop(void);					//	タイマを止める
	bool	IsTimer(void) const;		//	タイマが回っているのか
	// @yo2 0x005368f0 vt
	virtual void TimerProc(void) { }	//	コールバックされる関数

protected:
	UINT		m_hTimer;
	UINT_PTR	m_uTimer;	// [portable] UINT_PTR (= UINT on Win32): holds the SetTimer id, which is `this`
	DWORD		m_dwIntervalMin;	//	タイマcall backの最小インターバル
	bool		m_bStop;			//	StartMで回しているタイマの制御用

	DWORD		m_dwDelay;			//	StartMで使う
	DWORD		m_dwInterval;

private:
	//	TimerProcへのJump台　（マルチメディアタイマのとき）
	static void CALLBACK StaticTimeProc(UINT uID,UINT uMsg,DWORD_PTR dwUser,DWORD_PTR dw1,DWORD_PTR dw2);	// [portable] DWORD_PTR (= DWORD on Win32)
	//	TimerProcへのJump台　（通常のインターバルタイマのとき）
	static void CALLBACK StaticTimerProc(HWND hwnd,UINT uMsg,UINT_PTR idEvent,DWORD dwTime);	// [portable] UINT_PTR
	//	TimerProcへのJump台　（マルチメディアタイマでワンショットタイマのとき）
	static void CALLBACK StaticTimeProcM(UINT uID,UINT uMsg,DWORD_PTR dwUser,DWORD_PTR dw1,DWORD_PTR dw2);	// [portable] DWORD_PTR
};

#endif
