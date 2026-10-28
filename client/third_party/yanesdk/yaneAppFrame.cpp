#include "stdafx.h"
#include "yaneAppFrame.h"
#include "yaneTimer.h"

// @yo2 0x0042bb30 feat
void	CAppFrame::MesSleep(int nTime) {
	CTimer t;
	while (IsThreadValid() && t.Get()<nTime)
		::Sleep(10);	//	‚¿‚å‚Ò‚Á‚Æ‚¸‚ÂOOG
}

//	ƒRƒ“ƒXƒgƒ‰ƒNƒ^`ƒfƒXƒgƒ‰ƒNƒ^‚ÅACAppManager‚É“o˜^‚µ‚Ä‚¨‚­
// @yo2 0x0042bbf0 cg
CAppFrame::CAppFrame(void) {
	CAppManager::Add(this);
}

// @yo2 0x0042bc50 vt
CAppFrame::~CAppFrame(){
	CAppManager::Del(this);
}
