//
//	yaneShell.h :
//
//		シェルコマンド実行用
//

#ifndef __yaneShell_h__
#define __yaneShell_h__

class CShell {
public:
	LRESULT	Execute(string szExeName,bool bWait=false); //　ファイル実行
	LRESULT	OpenFolder(string szPathName);	//	フォルダをexplorerで開く
	LRESULT SetWallPaper(string szFileName);
	LRESULT CopyAndSetWallPaper(string szFileName);
};

#endif