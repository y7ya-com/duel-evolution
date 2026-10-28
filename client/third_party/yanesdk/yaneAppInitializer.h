//
//	アプリケーションイニシャライザ
//		yaneuraoGameSDK 2ndのためのイニシャライザ。
//		気にいらなければ自由にカスタマイズして使ってくださいな＾＾
//

#ifndef __yaneAppInitializer_h__
#define __yaneAppInitializer_h__

#include "yaneWinHook.h"

class CAppInitializer {
public:
	//	WinMainからそのパラメータをそのまま渡してね。
	static void Init(HINSTANCE hInstance,HINSTANCE hPrevInstance,LPSTR lpCmdLine,int nCmdShow);

	static HINSTANCE GetInstance(void)			{ return m_hInstance; }
	static HINSTANCE GetPrevInstance(void)		{ return m_hPrevInstance; }
	static LPSTR	 GetCmdLine(void)			{ return m_lpCmdLine; }
	static int		 GetCmdShow(void)			{ return m_nCmdShow; }

	//	自分の属するアプリスレッドの保有しているウィンドゥに関連付ける。
	//	（ウィンドゥメッセージがコールバックされるようになる）
	static	void	Hook(CWinHook*p);
	static	void	Unhook(CWinHook*p);

	//	自分の属するアプリスレッドの保有するウィンドゥハンドルを返す
	static	HWND	GetHWnd(void);

	//	フルスクリーンモードかどうかを返す
	static	bool	IsFullScreen(void);

protected:
	//	instance parameter...
	static	HINSTANCE	m_hInstance;
	static	HINSTANCE	m_hPrevInstance;
	static	LPSTR		m_lpCmdLine;
	static	int			m_nCmdShow;
};

#endif
