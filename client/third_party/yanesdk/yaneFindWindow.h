//
//	２重起動防止時のフォーカスの移動
//

#ifndef __yaneFindWindow_h__
#define __yaneFindWindow_h__

#include <tlhelp32.h>

typedef BOOL (WINAPI *PROCESSWALK)(HANDLE hSnapshot, LPPROCESSENTRY32 lppe);
typedef HANDLE (WINAPI *CREATESNAPSHOT)(DWORD dwFlags, DWORD th32ProcessID);

class CFindWindow {
public:
	//	実行モジュール名を与えると、その保有ウィンドゥにフォーカスを移す
	LRESULT Find(LPCSTR szModuleName);

protected:
	LRESULT	FindSameWindow( void );
	int		InnerEnumWndProc( HWND hWnd );
	static int	CALLBACK	EnumWndProc( HWND hWnd, LPARAM lParam );
	string	m_szModuleName;

	//	----- プロセスのスナップをとる from MSDN sample
	LRESULT	InitProcessFunction(void);
	LRESULT	GetWindowModuleName( HWND hWnd , LPTSTR szFileName, DWORD dwSize );

	CREATESNAPSHOT	m_lpCreateToolhelp32Snapshot;
	PROCESSWALK		m_lpProcess32First;
	PROCESSWALK		m_lpProcess32Next;
};

#endif