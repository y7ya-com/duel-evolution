// yaneFileDialog.h
//
//	このクラス、突貫工事で作ったから、マルチスレッド対応が弱い。
//	そのへん注意して使うこと。

#ifndef __yaneFileDialog_h__
#define __yaneFileDialog_h__

#include <commdlg.h>
#pragma comment(lib,"comdlg32.lib")

class CFileDialog {
public:
	LRESULT GetOpenFile(LPSTR filename);
	// filanameバッファは256バイト以上確保しておくこと
	LRESULT	GetSaveAsFile(LPSTR filename);
	// 名前をつけて保存を選ぶ。filenameバッファは256バイト以上確保しておくこと。

	//////////////////////////////////////////////////////////////////////

	void SetFlag(DWORD flag);			// どんなファイルを開くのか設定する
	void SetFillter(LPCTSTR p,LPTSTR q);
	void SetExt(LPSTR p);				// ディフォルト拡張子の設定
	OPENFILENAME * GetOfn(void);		// 最悪、これ直接いじって:p

	//////////////////////////////////////////////////////////////////////

	CFileDialog(void);
	virtual ~CFileDialog();
	//////////////////////////////////////////////////////////////////////
protected:
	OPENFILENAME ofn;
	DWORD	m_flag;
};

#endif
