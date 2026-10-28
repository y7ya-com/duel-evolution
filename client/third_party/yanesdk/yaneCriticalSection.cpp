#include "stdafx.h"
#include "yaneCriticalSection.h"

// @yo2 0x004350e0 feat
CCriticalSection::CCriticalSection(void){
	::InitializeCriticalSection(&m_oCriticalSection);
}

// @yo2 0x00435140 vt
CCriticalSection::~CCriticalSection(){
	::DeleteCriticalSection(&m_oCriticalSection);
}

// @yo2 0x00435170 feat
void CCriticalSection::Enter(void){
	::EnterCriticalSection(&m_oCriticalSection);
}

// @yo2 0x00435190 feat
void CCriticalSection::Leave(void){
	::LeaveCriticalSection(&m_oCriticalSection);
}
