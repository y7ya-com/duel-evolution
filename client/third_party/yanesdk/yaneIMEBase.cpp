#include "stdafx.h"
#include "yaneImeBase.h"
#include "yaneAppInitializer.h"

//	static‚È•Ï”
int CIMEBase::m_nStat = 0;
//	Œ»İ‚Ìó‘Ô 0:•s’è 1:Show 2:Hide
//	Ë˜A‘±“I‚ÈŒÄ‚Ño‚µ‚ğ–h~‚·‚é

//	2001/07/31 sohei
//		http://www.hcn.zaq.ne.jp/no-ji/reseach/980715.htm
//		‚ğQl‚É‚³‚¹‚Ä’¸‚«‚Ü‚µ‚½
//
#include "winnls32.h"	//	Win3.1‘ã‚ÌˆâYOOG

// @yo2 0x005366a0 feat
void	CIMEBase::Show(void){
	if (m_nStat==1) return ;
	m_nStat = 1;
	::WINNLSEnableIME(CAppInitializer::GetHWnd(),TRUE);		 // ‚h‚l‚d‚ğŒ»‚·
}

// @yo2 0x005366e0 feat
void	CIMEBase::Hide(void) {
	if (m_nStat==2) return ;
	m_nStat = 2;
	::WINNLSEnableIME(CAppInitializer::GetHWnd(),FALSE);	 // ‚h‚l‚d‚ğÁ‚·
}

/*
HIMC	CIMEBase::m_hIME = NULL;

void	CIMEBase::Show(void){
	if (m_hIME!=NULL) {
		::ImmAssociateContext(NULL,m_hIME);		// IME On
	}
}

void	CIMEBase::Hide(void) {
	if (m_hIME==NULL) {
		m_hIME=::ImmAssociateContext(NULL,NULL);	// IME Off
	}
}
*/
