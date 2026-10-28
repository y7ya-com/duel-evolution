//	yaneIntervalTimer.cpp
#include "stdafx.h"
#include "yaneAppIntervalTimer.h"

chain<CAppIntervalTimer> CAppIntervalTimer::m_alpTimerList;	//	コールバックすべきリスト

// @yo2 0x0042bef0 review
CAppIntervalTimer::CAppIntervalTimer(void){
	m_bStop	 = true;
}

// @yo2 0x0042bf60 cg
CAppIntervalTimer::~CAppIntervalTimer(){
	Stop();
	m_alpTimerList.erase(this);	//	自前で削除しなくてはならない
}

// @yo2 0x0042c000 cg
bool	CAppIntervalTimer::IsTimer(void) const {
	return !m_bStop;
}

// @yo2 0x0042c020 tight
LRESULT CAppIntervalTimer::Start(void){
	//	setの仕様により、既に存在するのならばinsertされない
	m_alpTimerList.insert(this);
	m_bStop = false;
	return 0;
}

// @yo2 0x0042c070 cg
LRESULT CAppIntervalTimer::Stop(void){
//	m_alpTimerList.erase(this);
	//	↑ここでeraseすると、コールバックの中で困る^^;
	m_bStop = true;
	return 0;
}

// @yo2 0x0042c090 cg
void	CAppIntervalTimer::TimerCallBackAll(void){
	//	生きているすべてのタイマにコールバックをかける
	chain<CAppIntervalTimer>::iterator it = m_alpTimerList.begin();
	while (it!=m_alpTimerList.end()){
		if (!(*it)->IsTimer()) {
			//	ガーベジャーを兼ねる＾＾；
			m_alpTimerList.erase(it++);	// [portable] was it = erase(it) (VC6 set::erase returned an iterator)
		} else {
			(*it)->TimerProc();
			it++;
		}
	}
}
