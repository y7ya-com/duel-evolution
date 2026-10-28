
#include "stdafx.h"
#include "yaneMIDILoader.h"
#include "yaneMIDIOutput.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053e8c0 review
CMIDILoader::CMIDILoader(void){
}

// @yo2 0x0053e930 vt
CMIDILoader::~CMIDILoader(){
	InnerDelete();	//	これは、こちらのデストラクタで行なう必要あり
}

// @yo2 0x0053ea70 vt
void		CMIDILoader::InnerCreate(void){
	m_lpSound.resize(m_nMax);
}

// @yo2 0x0053ebb0 vt
void		CMIDILoader::InnerDelete(void){
	ReleaseAll();	//	こいつで全解放する
	m_lpSound.clear();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053ec70 tight
CMIDIOutput*	CMIDILoader::GetMIDI(int nNo){
	WARNING(nNo >= m_nMax,"CMIDILoader::GetMIDIで範囲外");

	LRESULT hr;
	hr = Load(nNo);			//	読み込んでいなければここで読み込む必要あり
	if (hr) {
		WARNING(true,"CMIDILoader::GetMIDIでファイル読み込みに失敗");
//		return NULL;	//	だめだこりゃ＾＾
	//	失敗しても正規のポインタを返しておかないと不正な呼び出しになる...
	}

	return m_lpSound[nNo];
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053eca0 vt
LRESULT		CMIDILoader::InnerLoad(int nNo){
	WARNING(m_lpSound[nNo]!=NULL,"CMIDILoader::InnerLoadでm_lpSound[nNo]!=NULL");
	m_lpSound[nNo].Add();			//	CMIDI作成して読み込み
	return m_lpSound[nNo]->Open(m_lpSLOAD_CACHE[nNo].lpszFilename);
}

// @yo2 0x0053ecf0 vt
LRESULT		CMIDILoader::InnerRelease(int nNo){
	m_lpSound[nNo].Delete();		//	解放しちまう
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
