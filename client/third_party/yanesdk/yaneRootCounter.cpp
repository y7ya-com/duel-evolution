#include "stdafx.h"
#include "yaneRootCounter.h"
#include <limits.h>

// @yo2 0x00558b50 review
CRootCounter::CRootCounter(void) {
	Set(0,INT_MAX,1);
	m_bInit = false;
	m_bReverse = false;
	Reset();
}

// @yo2 0x00558b90 review
CRootCounter::CRootCounter(int nEnd){
	Set(0,nEnd,1);
	m_bInit = false;
	m_bReverse = false;
	Reset();
}

// @yo2 0x00558bd0 review
CRootCounter::CRootCounter(int nStart,int nEnd,int nStep){
	Set(nStart,nEnd,nStep);
	m_bInit = false;
	m_bReverse = false;
	Reset();
}

// @yo2 0x00558c20 vt
CRootCounter::~CRootCounter() {
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00558c40 review
void	CRootCounter::Reset(void){
	m_nRate			= 0;
	m_bLapAround	= false;
	m_bLapAroundI	= false;
	m_bReversing	= false;
	if (!m_bInit) {
		m_nRootCount	= m_nStart;
	} else {
		m_nRootCount	= m_nInit;
	}
}

// @yo2 0x00558c80 review
void	CRootCounter::SetStep(int nStep){
	m_nStep = nStep;
}

// @yo2 0x00558ca0 review
void	CRootCounter::SetStart(int nStart){
	m_nStart	= nStart;
}

// @yo2 0x00558cc0 review
void	CRootCounter::SetEnd(int nEnd){
	m_nEnd = nEnd;
}

// @yo2 0x00558ce0 review
void	CRootCounter::Set(int nStart,int nEnd,int nStep){
	m_nStep		= nStep;
	m_nStart	= nStart;
	m_nEnd		= nEnd;
}


//	カウンタのインクリメント
// @yo2 0x00558d10 review
void	CRootCounter::Inc(void){
	if (m_bReverse){
		if (!m_bReversing) {
			if (m_nStep>0) {
				m_nRootCount+=m_nStep;
				if (m_nRootCount>=m_nEnd) {
					m_nRootCount = m_nEnd;
					m_bLapAround = true;
					m_bLapAroundI = false;
					m_bReversing = true;	//	ダウンカウントの開始
				} else {
					m_bLapAround = false;
					m_bLapAroundI = false;
				}
			} else {
				m_nRate++;
				if (m_nRate==-m_nStep) {
					m_nRate = 0;
					m_nRootCount++;
					if (m_nRootCount>=m_nEnd) {
						m_nRootCount = m_nStart;
						m_bLapAround = true;
						m_bLapAroundI = false;
						m_bReversing = true;	//	ダウンカウントの開始
					} else {
						m_bLapAround = false;
						m_bLapAroundI = false;
					}
				}
			}
		} else {
			if (m_nStep>0) {
				m_nRootCount-=m_nStep;
				if (m_nRootCount<=m_nStart) {
					m_nRootCount = m_nStart;
					m_bLapAround = true;
					m_bLapAroundI = true;
					m_bReversing = false;	//	アップカウントの開始
				} else {
					m_bLapAround = false;
					m_bLapAroundI = false;
				}
			} else {
				m_nRate++;
				if (m_nRate==-m_nStep) {
					m_nRate = 0;
					m_nRootCount--;	//	ダウンカウント
					if (m_nRootCount<=m_nStart) {
						m_nRootCount = m_nStart;
						m_bLapAround = true;
						m_bLapAroundI = true;	//	この時に限りtrue
						m_bReversing = false;	//	アップカウントの開始
					} else {
						m_bLapAround = false;
						m_bLapAround = false;
					}
				}
			}
		}
	} else {
	//	リバースカウンタでないならば、リバース状態であるかに関わらず前方加算
		if (m_nStep>0) {
			m_nRootCount+=m_nStep;
			if (m_nRootCount>=m_nEnd) {
				m_nRootCount = m_nStart;
				m_bLapAround = true;
			} else {
				m_bLapAround = false;
			}
		} else {
			m_nRate++;
			if (m_nRate==-m_nStep) {
				m_nRate = 0;
				m_nRootCount++;
				if (m_nRootCount>=m_nEnd) {
					m_nRootCount = m_nStart;
					m_bLapAround = true;
				} else {
					m_bLapAround = false;
				}
			}
		}
	}
}

//	カウンタのサチュレーションインクリメント
// @yo2 0x00558e80 review
void	CRootCounter::IncS(void){
//	if (m_bReverse){
	//	↑リバースカウンタかどうかにかかわらず、
	//	　　　↓これを見て判断すべき
		if (!m_bReversing) {
			if (m_nStep>0) {
				m_nRootCount+=m_nStep;
				if (m_nRootCount>=m_nEnd) {
					m_nRootCount = m_nEnd;
					m_bLapAround = true;
				//	m_bReversing = true;	//	ダウンカウントの開始
				} else {
					m_bLapAround = false;
				}
			} else {
				m_nRate++;
				if (m_nRate==-m_nStep) {
					m_nRate = 0;
					m_nRootCount++;
					if (m_nRootCount>=m_nEnd) {
						m_nRootCount = m_nEnd;
						m_bLapAround = true;
					//	m_bReversing = true;	//	ダウンカウントの開始
					} else {
						m_bLapAround = false;
					}
				}
			}
		} else {
			if (m_nStep>0) {
				m_nRootCount-=m_nStep;
				if (m_nRootCount<=m_nStart) {
					m_nRootCount = m_nStart;
					m_bLapAround = true;
				//	m_bReversing = false;	//	アップカウントの開始
				} else {
					m_bLapAround = false;
				}
			} else {
				m_nRate++;
				if (m_nRate==-m_nStep) {
					m_nRate = 0;
					m_nRootCount--;	//	ダウンカウント
					if (m_nRootCount<=m_nStart) {
						m_nRootCount = m_nStart;
						m_bLapAround = true;
				//		m_bReversing = false;	//	アップカウントの開始
					} else {
						m_bLapAround = false;
					}
				}
			}
		}
//	}
}

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00558f50 review
CRootCounterS::CRootCounterS(void) {
	Set(0,INT_MAX,1);
	Reset();
}

// @yo2 0x00558fc0 review
CRootCounterS::CRootCounterS(int nEnd){
	Set(0,nEnd,1);
	Reset();
}

// @yo2 0x00559000 review
CRootCounterS::CRootCounterS(int nStart,int nEnd,int nStep){
	Set(nStart,nEnd,nStep);
	Reset();
}

// @yo2 0x00559040 review
void CRootCounterS::Inc(bool bAdd){
	bool bInc = (m_nStart > m_nEnd) ^ bAdd; // 逆方向カウンタ？
	if (bInc) {
	//	インクリメント
		if (m_nStep>0) {
		//	整数インクリメント
			m_nRootCount += m_nStep;
		} else {
		//	分数インクリメント
			m_nRate++; if (m_nRate>=(-m_nStep)) { m_nRate = 0; m_nRootCount++; }
		}
		//	サチュレートしたのか？
		int nMax = m_nStart < m_nEnd ? m_nEnd : m_nStart;
		if (m_nRootCount > nMax) m_nRootCount = nMax;
	} else {
	//	デクリメント
		if (m_nStep>0) {
		//	整数デクリメント
			m_nRootCount -= m_nStep;
		} else {
		//	分数デクリメント
			m_nRate--; if (m_nRate<=(m_nStep)) { m_nRate = 0; m_nRootCount--; }
			//	⇒　m_nRate++でないことに注意。
			//	++のあと--して、数の整合性がとれなくてはならない
			//	かつ、nStep<0のとき最初の１回目の--でRootCounterが
			//	1減ってはいけない。よってこういう実装になる
		}
		//	サチュレートしたのか？
		int nMin = m_nStart < m_nEnd ? m_nStart : m_nEnd;
		if (m_nRootCount < nMin) m_nRootCount = nMin;
	}
}
