#include "stdafx.h"
#include "yaneSoundLoader.h"
#include "yaneSound.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0056f130 review
CSoundLoader::CSoundLoader(void){
}

// @yo2 0x0056f1a0 vt
CSoundLoader::~CSoundLoader(){
	InnerDelete();	//	これは、こちらのデストラクタで行なう必要あり
}

// @yo2 0x0056f270 vt
void		CSoundLoader::InnerCreate(void){
	m_lpSound.resize(m_nMax);
}

// @yo2 0x0056f3b0 vt
void		CSoundLoader::InnerDelete(void){
	ReleaseAll();	//	こいつで全解放する
	m_lpSound.clear();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0056f470 tight
CSound*	CSoundLoader::GetSound(int nNo){
	WARNING(nNo >= m_nMax,"CSoundLoader::GetSoundで範囲外");

	LRESULT hr;
	hr = Load(nNo);			//	読み込んでいなければここで読み込む必要あり
	if (hr) {
		WARNING(true,"CSoundLoader::GetSoundでファイル読み込みに失敗");
		return NULL;	//	だめだこりゃ＾＾
	}

	m_lpnStaleTime[nNo] = 0;	//	使用したでフラグをＯｎ＾＾；
	return m_lpSound[nNo];
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0056f4c0 vt
LRESULT		CSoundLoader::InnerLoad(int nNo){
	WARNING(m_lpSound[nNo]!=NULL,"CSoundLoader::InnerLoadでm_lpSound[nNo]!=NULL");
	m_lpSound[nNo].Add();		//	CSound作成して読み込み
	return m_lpSound[nNo]->Load(m_lpSLOAD_CACHE[nNo].lpszFilename);
}

// @yo2 0x0056f630 vt
LRESULT		CSoundLoader::InnerRelease(int nNo){
	m_lpSound[nNo].Delete();	//	解放しちまう
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
