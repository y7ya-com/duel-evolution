//	yaneTimer.cpp
#include "stdafx.h"
#include "yaneTimer.h"

//////////////////////////////////////////////////////////////////////////////
int			CTimeBase::m_nRef = 0;			//	参照カウント
bool		CTimeBase::m_bUseTGT;
TIMECAPS	CTimeBase::m_dwTimeCaps;
//MMTIME		CTimeBase::m_mmtime;
CTimeBase	CTimeBaseInitializer;			//	こいつが起動時にCTimeBase::CTimeBase(void)を呼び出す
CTimeBase __timebase_dummy;	// コンストラクタで初期化するためのもの

// @yo2 0x0057f260 feat
CTimeBase::CTimeBase(void) {
	if (::timeGetDevCaps(&m_dwTimeCaps,sizeof(TIMECAPS))!=TIMERR_NOERROR) {
		//	なんや？タイマ腐ってんのか？
		m_dwTimeCaps.wPeriodMin = 1;	//	のつもりになる:p
		m_bUseTGT	= false;			// GetTickCountを使用する
		return ;
	}
	if (m_dwTimeCaps.wPeriodMin>=10) {
		//	これより大きいと使いものにならん
		m_dwTimeCaps.wPeriodMin = 1;		//	のつもりになる:p
		m_bUseTGT	= false;		// GetTickCountを使用する
	} else {
		m_bUseTGT	= true;			// timeGetTimeを使用する
//		m_mmtime.wType = TIME_MS;	//	timeGetSystemTime
	}
}

//////////////////////////////////////////////////////////////////////////////

//	timeBeginPeriodとtimeEndPeriodは同じ分解能にて対応させること。
//	また、同じ分解能に対してはネスティング出来ない。（逆アセして調べた）

// @yo2 0x0057f2b0 feat
int CTimeBase::timeBeginPeriodMin(void){

	//---	（コンストラクタでやっているのと同じ内容）
	//::timeGetDevCaps(&m_dwTimeCaps,sizeof(TIMECAPS));
	if (::timeGetDevCaps(&m_dwTimeCaps,sizeof(TIMECAPS))!=TIMERR_NOERROR) {
		//	なんや？タイマ腐ってんのか？
		m_dwTimeCaps.wPeriodMin = 1;	//	のつもりになる:p
		m_bUseTGT	= false;			// GetTickCountを使用する
		return m_dwTimeCaps.wPeriodMin;
	}
	if (m_dwTimeCaps.wPeriodMin>=10) {
	//	これより大きいと使いものにならん
		m_dwTimeCaps.wPeriodMin = 1;		//	のつもりになる:p
		m_bUseTGT	= false;		// GetTickCountを使用する
	} else {
		m_bUseTGT	= true;			// timeGetTimeを使用する
//		m_mmtime.wType = TIME_MS;	//	timeGetSystemTime
	}
	//---

	if (m_nRef++==0 && m_bUseTGT) {
		// timeGetTimeを使わないならばtimeBeginPeriodは無意味
		::timeBeginPeriod(m_dwTimeCaps.wPeriodMin);
	}
	return m_dwTimeCaps.wPeriodMin;
}

// @yo2 0x0057f340 feat
void CTimeBase::timeEndPeriodMin(void){
	if (--m_nRef==0 && m_bUseTGT) {
		::timeEndPeriod(m_dwTimeCaps.wPeriodMin);
	}
}

//////////////////////////////////////////////////////////////////////////////

set<CTimer*>	CTimer::m_aTimer;	//	全インスタンスのチェーン

// @yo2 0x0057f550 manual
CTimer::CTimer(void){
	m_aTimer.insert(this);	//	チェインにインスタンス追加
	Reset();
}

// @yo2 0x0057f660 manual
CTimer::~CTimer(){
	m_aTimer.erase(this);
}

// @yo2 0x0057f7c0 feat
DWORD CTimer::Get(void) {
	if (m_bPaused>0) return m_dwPauseTime-m_dwOffsetTime;
	return (DWORD)(CTimeBase::timeGetTime()-m_dwOffsetTime);
}

// @yo2 0x0057f810 feat
void CTimer::Set(DWORD dw) {
	if (m_bPaused>0) {
		//	いらんかな～？
		m_dwOffsetTime = m_dwPauseTime-dw;
	} else {
		m_dwOffsetTime = (DWORD)(CTimeBase::timeGetTime() - dw);
	}
}

// @yo2 0x0057f880 feat
void CTimer::Reset(void) {
	m_dwOffsetTime = CTimeBase::timeGetTime();
	m_bPaused = 0;
}

// @yo2 0x0057f8c0 feat
void CTimer::Pause(void){
	if (m_bPaused++ == 0) {
	//	Pauseさせる
		m_dwPauseTime = CTimeBase::timeGetTime();
	}
}

// @yo2 0x0057f900 feat
void CTimer::Restart(void){
	if (--m_bPaused == 0) {
	//	Pause解除
		m_dwOffsetTime += CTimeBase::timeGetTime() - m_dwPauseTime;
	}
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0057f950 review
LRESULT CTimer::PauseAll(void){
	if (m_aTimer.empty()) return 0;
	for (set<CTimer*>::iterator it=m_aTimer.begin();it!=m_aTimer.end();it++){
		(*it)->Pause();
	}
	return 0;
}

// @yo2 0x0057f9e0 review
LRESULT CTimer::RestartAll(void){
	if (m_aTimer.empty()) return 0;
	for (set<CTimer*>::iterator it=m_aTimer.begin();it!=m_aTimer.end();it++){
		(*it)->Restart();
	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//	class CTimerEx

// static members..
DWORD	CTimerEx::m_dwTimeGetTime = 0;

// @yo2 0x0057fa70 review
DWORD	CTimerEx::Get(void){
	if (m_bPaused>0) return m_dwPauseTime-m_dwOffsetTime;
	return (DWORD)(m_dwTimeGetTime-m_dwOffsetTime);
}

// @yo2 0x0057faa0 feat
void	CTimerEx::Flush(void){
	m_dwTimeGetTime = CTimeBase::timeGetTime();
}

// @yo2 0x0057fae0 review
void	CTimerEx::Set(DWORD dw) {
	if (m_bPaused>0) {
		//	いらんかな～？
		m_dwOffsetTime = m_dwPauseTime-dw;
	} else {
		m_dwOffsetTime = (DWORD)(m_dwTimeGetTime - dw);
	}
}

// @yo2 0x0057fb20 review
void	CTimerEx::Reset(void) {
	m_dwOffsetTime = m_dwTimeGetTime;
	m_bPaused = 0;
}

// @yo2 0x0057fb40 review
void	CTimerEx::Pause(void){
	if (m_bPaused++ == 0) {
	//	Pauseさせる
		m_dwPauseTime = m_dwTimeGetTime;
	}
}

// @yo2 0x0057fb70 review
void	CTimerEx::Restart(void){
	if (--m_bPaused == 0) {
	//	Pause解除
		m_dwOffsetTime += m_dwTimeGetTime - m_dwPauseTime;
	}
}
