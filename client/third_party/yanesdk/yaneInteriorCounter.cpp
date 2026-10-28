//
//	CInteriorCounter
//		内分カウンタ
//

#include "stdafx.h"
#include "yaneInteriorCounter.h"

// @yo2 0x00536770 review
CInteriorCounter::CInteriorCounter(){
	m_nStart	= 0;
	m_nEnd		= 0;
	m_nNow		= 0;
	m_nFrames	= 0;
	m_nFramesNow = 0;
}

// @yo2 0x005367a0 review
void	CInteriorCounter::Set(int nStart,int nEnd,int nFrames){
	WARNING(nFrames == 0,"CInteriorCounter::SetでnFrames == 0");
	m_nStart	= nStart;
	m_nEnd		= nEnd;
	m_nNow		= nStart;
	m_nFrames	= nFrames;
	m_nFramesNow = 0;
}

// @yo2 0x005367e0 review
void	CInteriorCounter::Inc(){
	//	カウンタは終了値か？
	if (m_nFramesNow >= m_nFrames) {
		m_nNow = m_nEnd;
		return ;
	}
	m_nFramesNow++;
	//	内分処理
	m_nNow =  m_nStart + m_nFramesNow * (m_nEnd-m_nStart) / m_nFrames;
}

// @yo2 0x00536820 review
void	CInteriorCounter::Dec(){
	//	カウンタは初期値か？
	if (m_nFramesNow == 0) return ;
	m_nFramesNow--;
	//	内分処理
	m_nNow =  m_nStart + m_nFramesNow * (m_nEnd-m_nStart) / m_nFrames;
}
