#include "stdafx.h"

#ifdef USE_SAVER

#include "soheSaverHelper.h"
/*
//
//　WM_MOUSEWHEEL が未定義となるので追加(何故？
//
#define MY_WM_MOUSEWHEEL                   0x020A
*/
LRESULT CSaverHelper::Init(void){
	SetCmdLine( CAppInitializer::GetCmdLine() );

	//	起動時のカレントディレクトリがルートディレクトリだったりするので無理矢理アプリのパスにあわせる
	string apppath;	char buf[_MAX_PATH];
	::GetModuleFileName(NULL, buf, _MAX_PATH); apppath = buf;
	CFile::GetParentDir( apppath );
	CFile::SetCurrentDir( apppath );
	return 0;
}
//	コマンドライン解析
void CSaverHelper::SetCmdLine(LPSTR lpCmdLine) {
/*	スクリーンセーバーが処理すべき引数
-----------------------------------------------------------
	/S 　　　　本体の実行
	/C 　　　　設定ウィンドウの表示
	/P HWND　　プレビュー（画面のプロパティ内への表示）
	/A [数字]　パスワードへの対応
*/
	char cParam;
	if (lpCmdLine[0] != '/')	{	//	エクスプローラーで設定が押されたときは引数がない
		cParam = 'c';
	} else {
		cParam = (char)tolower((int)lpCmdLine[1]);
	}
	if (cParam == 'p') {
		m_nMode = modePreview;

		m_hParent = (HWND)atoi(lpCmdLine + 2);
		RECT rc;
		::GetWindowRect(m_hParent, &rc);
		SetSize(rc.right  - rc.left, rc.bottom - rc.top);
	} else if (cParam == 'c') {
		m_nMode = modeConfig;
		SetSize(640, 480);
	} else if (cParam == 'a'){
		m_nMode = modePassword;
		//atoi(lpCmdLine + 2);
		SetSize(640, 480);
	} else {
		m_nMode = modeMain;
		int w,h;	CWindow::GetScreenSize(w, h);
		SetSize(w, h);
	}
}

#endif