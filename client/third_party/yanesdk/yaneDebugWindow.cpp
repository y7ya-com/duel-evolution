#include "stdafx.h"
#include "yaneDebugWindow.h"

// @yo2 0x00435200 vt
LRESULT CDebugWindow::OnPreCreate(CWindowOption &opt){		//	override from CAppBase

	opt.caption		= "でばっぐ表示～";
	opt.classname	= "LISTBOX";
	opt.size_x		= 300;
	opt.size_y		= 200;
	opt.style		=	WS_VISIBLE | WS_CAPTION | LBS_NOINTEGRALHEIGHT | WS_VSCROLL
					| WS_SIZEBOX									//	サイズは可変
					| WS_MAXIMIZEBOX | WS_MINIMIZEBOX| WS_SYSMENU;	//	これを入れると、ウィンドウの×印がつく。

	m_bIdle = true; // Idleモードにする

	return 0;
}

// @yo2 0x004353d0 feat
void	CDebugWindow::Clear(void){
	::SendMessage(GetHWnd(),LB_RESETCONTENT,0,0L);
}

// @yo2 0x00435400 feat
void __cdecl CDebugWindow::Out( LPSTR fmt, ... ) {
	HWND hWnd = GetHWnd();
	if (hWnd == NULL) return ;
	
	CHAR	buf[512];
	::wvsprintf(buf,fmt,(LPSTR)(&fmt+1) );
	
	int n = strlen(buf) - 1;
	if (buf[n] == '\n') buf[n] = '\0'; // 改行を潰す

	::SendMessage(hWnd,LB_ADDSTRING,0,(LPARAM)(LPSTR) buf);	// [portable] LPARAM
	UINT sel = (UINT)::SendMessage(hWnd,LB_GETCOUNT,0,0L);
	if(sel!=LB_ERR) {
		::SendMessage(hWnd,LB_SETCURSEL,sel-1,0L);
	}
}

// @yo2 0x004354c0 tight
void	CDebugWindow::Out(const string& str){
	Out((LPSTR)str.c_str());
}

// @yo2 0x004354f0 feat
void	CDebugWindow::Out(int i){
	CHAR buf[16];
	::wsprintf(buf,"%d",i);
	Out(buf);
}

// @yo2 0x00435540 feat
void	CDebugWindow::Out(LONG*lpl){
	//	可変引数取るか～世話やけんなぁ（笑）
	CHAR	buf[512];
	::wvsprintf(buf,(LPSTR)*lpl,(LPSTR)(lpl+1) );
	Out(buf);
}


//////////////////////////////////////////////////////////////////////////////
//	チェックする

auto_ptrEx<CDebugWindow> CDbg::m_lpDebugWindow;

// @yo2 0x00435640 review
void	CDbg::CheckValid(void){
	if (m_lpDebugWindow==NULL) {
		m_lpDebugWindow.Add( new CDebugWindow );
		m_lpDebugWindow->Run();
	}
}

// @yo2 0x004357b0 feat
void __cdecl CDbg::Out( LPSTR fmt, ... ) {
	CheckValid();

	//	可変引数取るか～世話やけんなぁ（笑）
	CHAR	buf[512];
	::wvsprintf(buf,fmt,(LPSTR)(&fmt+1) );
	m_lpDebugWindow->Out(buf);
}
