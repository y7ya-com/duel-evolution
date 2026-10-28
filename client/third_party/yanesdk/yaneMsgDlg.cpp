#include "stdafx.h"
#include "yaneMsgDlg.h"
#include "yaneAppManager.h"
#include "yaneAppInitializer.h"
#include "yaneDirectDraw.h"
#include "yaneWindow.h"

// @yo2 0x00543ce0 feat
void	CMsgDlg::Out(string caption,string message){
	// フルスクリーンでフリップ使ってるかも知れないので
#ifdef USE_DirectDraw
	CDirectDraw* lpDraw = CAppManager::GetMyDirectDraw();
	if (lpDraw!=NULL){
		lpDraw->FlipToGDISurface();
	}
#endif
	CWindow* lpWindow = CAppManager::GetMyApp()->GetMyWindow();
	bool bShowCursor;
	if (lpWindow!=NULL) {
		bShowCursor = lpWindow->IsShowCursor();
		lpWindow->ShowCursor(true);
	}
	::MessageBox(CAppInitializer::GetHWnd(),message.c_str(),caption.c_str(),MB_OK|MB_SYSTEMMODAL|MB_SETFOREGROUND);
	if (lpWindow!=NULL) {
		lpWindow->ShowCursor(bShowCursor);
	}
}
