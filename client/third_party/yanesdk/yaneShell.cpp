#include "stdafx.h"
#include "yaneShell.h"
#include "yaneFile.h"

// @yo2 0x0056b550 feat
LRESULT	CShell::Execute(string szExeName,bool bWait){
	//　ファイル実行
	CHAR buf[512];
	::lstrcpy(buf,szExeName.c_str());

	STARTUPINFO startupInfo = { 0 } ;
	PROCESS_INFORMATION ProcessInfo;
	
	if (!::CreateProcess(NULL,buf,NULL,NULL,FALSE,
		CREATE_NO_WINDOW,NULL,NULL,&startupInfo,&ProcessInfo))
		//	CREATE_NO_WINDOWは、MS-DOS窓を作らないオプション
		//	（標準出力を殺したいので）
		return 1;	// unable open..

	if (bWait){
		::WaitForSingleObject(ProcessInfo.hProcess ,INFINITE);
	}

	return 0;
}

// @yo2 0x0056b680 feat
LRESULT	CShell::OpenFolder(string szPathName){
	//	フォルダをexplorerで開く

	CHAR buf[512];
	::lstrcpy(buf,"explorer ");
	::lstrcat(buf,szPathName.c_str());

	STARTUPINFO startupInfo = { 0 };
	PROCESS_INFORMATION ProcessInfo;

	if (!::CreateProcess(NULL,buf,NULL,NULL,FALSE,
		0,NULL,NULL,&startupInfo,&ProcessInfo))
		return 1;	// unable open..

	return 0;
}

// @yo2 0x0056b7b0 tight
LRESULT CShell::CopyAndSetWallPaper(string szFileName){
	CFile file;
	if (file.Read(szFileName)!=0) return 1;

	//	Windowsフォルダにコピー
	string name;
	name =	CFile::GetWindowsDir() + file.GetPureFileName();
	if (file.WriteBack(name)!=0) return 1;
	return SetWallPaper(name);
}

// @yo2 0x0056bac0 feat
LRESULT CShell::SetWallPaper(string szFileName){
	//	壁紙を設定する

	//	アクティブデスクトップのために、レジストリも変更しなければならない

//	HKEY_CURRENT_USER/Desktop/WindowMetrics/WallPaper
//										   /WallpaperStyle/←0
//	↑このセクションの存在の有無は調べなくてはならない

	return ::SystemParametersInfo(
		SPI_SETDESKWALLPAPER,		//	壁紙の変更
		0,
		(void*)szFileName.c_str(),
		SPIF_UPDATEINIFILE | SPIF_SENDWININICHANGE
		//	変更は通知したほうがいいだろう..
	)?0:1;

}
