// yaneKeyBase.cpp

#include "stdafx.h"
#include "yaneKeyBase.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00539ab0 review
CKeyBase::CKeyBase(void){
	m_nKeyBufNo=0;	// — ‚Æ•\‚ğflip‚µ‚ÄA·•ª‚ğ‚Æ‚é‚Ì‚É—˜—p
	ZERO(m_byKeyBuffer);
}

// @yo2 0x00539b10 vt
CKeyBase::~CKeyBase(){
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00539b30 vt
inline bool CKeyBase::IsKeyPress(int key) const {
	return	(m_byKeyBuffer[m_nKeyBufNo][key]) !=0;
};

// @yo2 0x00539b60 vt
inline bool CKeyBase::IsKeyPush(int key) const {
	// ‰Ÿ‚³‚ê‚½uŠÔ‚Étrue‚É‚·‚éê‡
	if (!(m_byKeyBuffer[  m_nKeyBufNo][key])) return false;
	if (  m_byKeyBuffer[1-m_nKeyBufNo][key] ) return false;
	return true;
}

// [Konami] true on the frame a key goes up
// @yo2 0x00539ba0 vt
inline bool CKeyBase::IsKeyRelease(int key) const {
	if (m_byKeyBuffer[  m_nKeyBufNo][key]) return false;
	return m_byKeyBuffer[1-m_nKeyBufNo][key] != 0;
}

// @yo2 0x00539be0 vt
inline BYTE*	CKeyBase::GetKeyData(void) const {
	return	(BYTE*)&m_byKeyBuffer[m_nKeyBufNo];
}

//////////////////////////////////////////////////////////////////////////////

