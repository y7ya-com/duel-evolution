// yaneWinHook.h
//	WindowMessageHooker
//	  WindowメッセージをフックさせることでWindowのサブクラス化をアシストする
//	  (c) yaneurao '99/06/23
//
//		programmed by yaneurao(M.Isozaki)	'99/06/21
//		reprogrammed by yaneurao			'00/02/25

#ifndef __yaneWinHook_h__
#define __yaneWinHook_h__

#include "yaneCriticalSection.h"

class CWinHook {
public:
	virtual	LRESULT	WndProc(HWND,UINT,WPARAM,LPARAM) = 0;
};

class CWinHookList {
public:
	void	Add(CWinHook*);				//	自分自身をフックに加える
	void	Del(CWinHook*);				//	自分自身をフックから外す
	void	Clear(void);				//	すべてをクリアする

	//	メッセージのDispatcher
	LRESULT Dispatch(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam,WNDPROC pWndProc=NULL);

protected:
	list<CWinHook*>		m_HookPtrList;	//	フックリスト
	CCriticalSection	m_oCriticalSection;
};

#endif

