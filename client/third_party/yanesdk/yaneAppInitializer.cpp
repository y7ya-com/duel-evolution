#include "stdafx.h"

#include "yaneAppInitializer.h"
#include "yaneAppManager.h"
#include "yaneAppBase.h"
#include "yaneWindow.h"
#include "yaneFile.h"

HINSTANCE	CAppInitializer::m_hInstance;
HINSTANCE	CAppInitializer::m_hPrevInstance;
LPSTR		CAppInitializer::m_lpCmdLine;
int			CAppInitializer::m_nCmdShow;

//	WinMainからそのパラメータをそのまま渡してね。
// @yo2 0x0042bcc0 cg
void	 CAppInitializer::Init(HINSTANCE hInstance,HINSTANCE hPrevInstance,LPSTR lpCmdLine,int nCmdShow){

	//	パラメータをそのまま保存:p
	m_hInstance		=	hInstance;
	m_hPrevInstance	=	hPrevInstance;
	m_lpCmdLine		=	lpCmdLine;
	m_nCmdShow		=	nCmdShow;

	//	カレントディレクトリの設定
	CFile::SetCurrentDir();
}

//////////////////////////////////////////////////////////////////////////////
//	魔法システムその１:p
// @yo2 0x0042bd00 cg
void	CAppInitializer::Hook(CWinHook*p){
	CAppManager::GetMyApp()->GetMyWindow()->GetHookList()->Add(p);
}

// @yo2 0x0042bd30 cg
void	CAppInitializer::Unhook(CWinHook*p){
	CAppManager::GetMyApp()->GetMyWindow()->GetHookList()->Del(p);
}

//	魔法システムその２:p
// @yo2 0x0042bd60 cg
HWND	CAppInitializer::GetHWnd(void) {
	CAppBase* lp = CAppManager::GetMyApp();
	if (lp==NULL) return NULL;
	return lp->GetHWnd();
}

//	魔法システムその３:p
// @yo2 0x0042bd80 cg
bool	CAppInitializer::IsFullScreen(void){
	return CWindow::IsFullScreen();
}

//////////////////////////////////////////////////////////////////////////////

