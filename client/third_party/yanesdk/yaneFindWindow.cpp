#include "stdafx.h"

#include "yaneFindWindow.h"
#include "yaneFile.h"

// @yo2 0x0052dde0 cg
LRESULT CFindWindow::Find(LPCSTR szModuleName) {
	if (InitProcessFunction()!=0) return 1; // 初期化失敗
	m_szModuleName = CFile::GetPureFileNameOf(szModuleName);
	return FindSameWindow();
}

// @yo2 0x0052df90 feat
LRESULT		CFindWindow::FindSameWindow( void )
{
// ウィンドウの列挙要求
	if ( !::EnumWindows( (WNDENUMPROC)CFindWindow::EnumWndProc, (LPARAM)this )	/* [portable] LPARAM (= LONG on Win32) */ )
						// ↑このキャストをしないとVC++5で通らないのだ＾＾；；
		return 0;
	return 1;
}

// @yo2 0x0052dfc0 manual
int	CALLBACK	CFindWindow::EnumWndProc( HWND hWnd, LPARAM lParam ){
	return ((CFindWindow*)lParam) ->InnerEnumWndProc(hWnd);
}

// @yo2 0x0052dff0 feat
int		CFindWindow::InnerEnumWndProc( HWND hWnd ){

// インスタンスに対するファイル名の取得
	CHAR	szFileName[_MAX_PATH];
	if (GetWindowModuleName( hWnd , szFileName, _MAX_PATH )!=0)
		return 1;

	// ファイル名が等しいか否かの判定
	if ( ::lstrcmp(m_szModuleName.c_str(),szFileName) == 0 ) {
		// 以前に作成したウィンドウをアクティブにする

		::ShowWindow( hWnd ,SW_SHOWNORMAL);
		::SetForegroundWindow( hWnd );

		return 0;
	}

	return 1;
}

//////////////////////////////////////////////////////////////////////////////
//	プロセスのスナップをとる
//		こうしないと、正確なハンドル名が得られない

// @yo2 0x0052e080 feat
LRESULT	CFindWindow::InitProcessFunction(void)
{
	HANDLE hKernel;
	hKernel = ::GetModuleHandle("KERNEL32.DLL");

	if ( hKernel ) {
		m_lpCreateToolhelp32Snapshot = (CREATESNAPSHOT)GetProcAddress(
			(HINSTANCE)hKernel, "CreateToolhelp32Snapshot");
		m_lpProcess32First =
			(PROCESSWALK)::GetProcAddress((HINSTANCE)hKernel, "Process32First");
		m_lpProcess32Next =
			(PROCESSWALK)::GetProcAddress((HINSTANCE)hKernel, "Process32Next");
	}
	if ( m_lpProcess32First && m_lpProcess32Next && m_lpCreateToolhelp32Snapshot )
		return 0;
	return 1;
}

// @yo2 0x0052e100 feat
LRESULT	CFindWindow::GetWindowModuleName( HWND hWnd , LPTSTR szFileName, DWORD dwSize )
{
	DWORD pid = 0;
	HANDLE hProcessSnap;
	PROCESSENTRY32 pe32;
	LRESULT Ret = 1;

	::GetWindowThreadProcessId(hWnd, &pid);
	hProcessSnap = m_lpCreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if ( hProcessSnap == (HANDLE)-1 )
		return 1;
	pe32.dwSize = sizeof(PROCESSENTRY32);
	if ( m_lpProcess32First(hProcessSnap, &pe32) ) {
		do {
			if ( pid == pe32.th32ProcessID ) {
				::lstrcpyn(szFileName, pe32.szExeFile, dwSize);
				Ret = 0;
				break;
			}
		} while ( m_lpProcess32Next(hProcessSnap, &pe32) );
	}
	::CloseHandle(hProcessSnap);
	return Ret;
}
