#include "stdafx.h"
#include "yaneWinHook.h"

// @yo2? 0x00582bc0 order
void CWinHookList::Add(CWinHook* hook)
{
	m_oCriticalSection.Enter();
	{
		m_HookPtrList.push_back(hook);
	}
	m_oCriticalSection.Leave();
}

// @yo2 0x00582e40 review
void CWinHookList::Del(CWinHook* hook){

	// 自分がHookしたやつを探して削除してゆく（複数ありうる）
	m_oCriticalSection.Enter();	//	削除中に他のプロセスが介入してくると死ぬため
	{
		for(list<CWinHook*>::iterator it=m_HookPtrList.begin();it!=m_HookPtrList.end();) {
			if (*it==hook) {
				it = m_HookPtrList.erase(it);
			} else {
				it ++;
			}
		}
	}
	m_oCriticalSection.Leave();
}

// @yo2 0x00582ec0 review
void CWinHookList::Clear(void){

	m_oCriticalSection.Enter();	//	削除中に他のプロセスが介入してくると死ぬため
	{
		m_HookPtrList.clear();
	}
	m_oCriticalSection.Leave();
}

//	message dispatcher
//	  CWindowのWndProcから呼び出されるので、このCriticalSectionは、各ウィンドゥにつき一つ存在することになる。
//	  つまりこのCriticalSectionは、メッセージループと、それに対応するメインスレッド間での相互排他のためのものである。
// @yo2 0x00582f30 feat
LRESULT CWinHookList::Dispatch(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam,WNDPROC pWndProc){

	m_oCriticalSection.Enter();
	{
		list<CWinHook*>::iterator it=m_HookPtrList.begin();
		while (it!=m_HookPtrList.end()) {
			LRESULT l;
			l = (*it)->WndProc(hWnd,uMsg,wParam,lParam);
			if (l) {
				m_oCriticalSection.Leave();
				return l; // 返し値として０以外を持つならばメッセージは処理されたと見なす
			}
			it ++ ;
		}
	}
	m_oCriticalSection.Leave();

	if (pWndProc == NULL) {
		return ::DefWindowProc(hWnd,uMsg,wParam,lParam);
	} else {
		//	hookしたウィンドゥ関数を呼び出す
		return ::CallWindowProc(pWndProc,hWnd,uMsg,wParam,lParam);
	}
}
