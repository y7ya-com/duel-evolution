#include "stdafx.h"
#include "yaneSingleApp.h"
#include "yaneAppInitializer.h"
#include "yaneFindWindow.h"

// @yo2 0x0056bb90 feat
CSingleApp::CSingleApp(void) {

	//	起動Exe名を、多重起動防止のMutex名とする
	CHAR szFileName[_MAX_PATH],szFileName2[_MAX_PATH];
	::GetModuleFileName(CAppInitializer::GetInstance(),szFileName,_MAX_PATH);
	::lstrcpy(szFileName2,szFileName);	//	コピーして持っておく

	//	Mutex名には\は使えないので+に置換
	for(int i=0;i<_MAX_PATH;i++){
		if (szFileName[i]=='\\') szFileName[i] = '+'; // + はファイル名には出現しないのでＯＫ
		else if (szFileName[i]=='\0') break;
	}

	if (m_oMutex.Open(szFileName)) {	// あかんやん...

		//	この起動ファイルと同名の実行ファイルを探す．．．
		//	しかし、WindowClass名が無ければ一意に特定できないようだ...

		CFindWindow fw;
		fw.Find(szFileName2);

		m_bValid = false;
	} else {
		m_bValid = true;
	}
}

// @yo2 0x0056bda0 review
bool	CSingleApp::IsValid(void){
	return m_bValid;
}

