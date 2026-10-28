//////////////////////////////////////////////////////////////////////////////
//
//	デバッグ画面也ー
//		original program was programmed by Roual '00/05/01 ( for Yobai Mania )
//		remade by yaneurao '00/12/01 ( for Happy Hotaru Sou )
//

#ifndef __yaneDebugger_h__
#define __yaneDebugger_h__

#include "yaneLayer.h"

class CMouseEx;
class CFlagDebugger : public CHDCLayer {
public:
	//	これ、最初に設定してね！
	void	SetMouse(CMouseEx*lp) { m_lpMouse = lp; }
	void	SetFlag(DWORD*lpdw,int nSize) { m_lpdw = lpdw; m_nSize = nSize; }

	//	これは、Hookすれば自動的にコールバックされる。
	void	OnDraw(HDC hdc);

	CFlagDebugger(void);
	virtual ~CFlagDebugger();

protected:
	CMouseEx* GetMouse(void) { return m_lpMouse; }
	void	ShowGameFlagList(HDC hdc);

private:
	CMouseEx* 	m_lpMouse;	//	親のCMouseEx
	DWORD*		m_lpdw;		//	表示すべきDWORD配列
	int			m_nSize;	//	配列サイズ
	int 		m_nGameFlagOffset;		//	現在の表示されている左上のゲームフラグ
	int			m_nSelectedGameFlag;	//	現在選択されているゲームフラグ
};

#endif
