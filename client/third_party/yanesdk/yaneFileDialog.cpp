#include "stdafx.h"

#include "yaneFileDialog.h"
#include "yaneAppInitializer.h"

// @yo2 0x0052dbc0 manual
LRESULT CFileDialog::GetOpenFile(LPSTR filename){
	// ファイルダイアログを出す
	::ZeroMemory(filename,256);
	ofn.lpstrFile	= filename;
	ofn.Flags		= OFN_FILEMUSTEXIST;

//	ysDraw.ShowCursor(true);	// ソフトウェアマウスカーソル不可

	if (::GetOpenFileName(&ofn)) {
		return 0;
	} else {
		return 1;
	}
}

// @yo2 0x0052dc00 manual
LRESULT CFileDialog::GetSaveAsFile(LPSTR filename){
	// ファイルダイアログを出す
	::ZeroMemory(filename,256);
	ofn.lpstrFile	= filename;
	ofn.Flags		= OFN_OVERWRITEPROMPT;

//	ysDraw.ShowCursor(true);	// ソフトウェアマウスカーソル不可

	if (::GetSaveFileName(&ofn)) {
		return 0;
	} else {
		return 1;
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0052dc40 review
void CFileDialog::SetFillter(LPCTSTR p,LPTSTR q){
	ofn.lpstrFilter = p;
	ofn.lpstrCustomFilter = q;
}

// @yo2 0x0052dc70 review
void CFileDialog::SetFlag(DWORD dw){
	m_flag = dw;
}

// @yo2 0x0052dc90 review
OPENFILENAME * CFileDialog::GetOfn(void){
	return &ofn;
}

// @yo2 0x0052dcb0 review
void CFileDialog::SetExt(LPSTR p){
	ofn.lpstrDefExt	= p;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0052dcd0 review
CFileDialog::CFileDialog(void){
	m_flag = 0;
	ZERO(ofn);
	ofn.lStructSize		= sizeof(OPENFILENAME);
	ofn.hwndOwner		= CAppInitializer::GetHWnd();
	ofn.lpstrFilter		= "All files {*.*}\0*.*\0\0";
	ofn.lpstrDefExt		= "txt";
	ofn.nMaxFile		= 256;
}

// @yo2 0x0052dd70 vt
CFileDialog::~CFileDialog(){}

