//	yaneDebugWindow.h :
//		programmed by yaneurao	'00/02/25

#ifndef __yaneDebugWindow_h__
#define __yaneDebugWindow_h__

#include "yaneAppBase.h"

class CDebugWindow : public CAppBase {
public:
	void	Clear(void);					//	文字列をクリアする
	void __cdecl Out(LPSTR fmt, ... );		//	文字列を表示する
	void	Out(int);						//	数字を表示する
	void	Out(const string&);
	void	Out(LONG*);		//	可変引数を取るバージョン
protected:
	LRESULT OnPreCreate(CWindowOption&);		//	overriden from CAppBase
};

//	デバッグウィンドゥのローカライズ版
class CDbg {
public:
	//	関数インターフェースは同じ。すべてCDebugWindowに委譲してしまう
	void	Clear(void)					{ CheckValid(); m_lpDebugWindow->Clear(); }
	void __cdecl Out(LPSTR fmt, ... );
	void	Out(int i)					{ CheckValid(); m_lpDebugWindow->Out(i); }
	void	Out(const string&s)			{ CheckValid(); m_lpDebugWindow->Out(s); }
	void	Out(LONG*lpl)				{ CheckValid(); m_lpDebugWindow->Out(lpl); }

	//	インスタンスのカウントを返す
	static int		GetInstanceCount() { return m_lpDebugWindow!=NULL?1:0; }
	static void		Release() { if (m_lpDebugWindow!=NULL) m_lpDebugWindow.Delete(); }
protected:
	void	CheckValid(void);
	static auto_ptrEx<CDebugWindow> m_lpDebugWindow;
};

#endif
