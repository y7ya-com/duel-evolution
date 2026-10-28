
#include "stdafx.h"
#include "yaneSpriteLoader.h"
#include "yaneSpriteChara.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00571fb0 review
CSpriteLoader::CSpriteLoader(void){
}

// @yo2 0x00572020 vt
CSpriteLoader::~CSpriteLoader(){
	InnerDelete();	//	これは、こちらのデストラクタで行なう必要あり
}

// @yo2 0x005720c0 vt
void		CSpriteLoader::InnerCreate(void){
	m_lpChara.resize(m_nMax);
}

// @yo2 0x005720e0 vt
void		CSpriteLoader::InnerDelete(void){
	m_lpChara.clear();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00572120 tight
CSpriteBase*	CSpriteLoader::GetSprite(int nNo){
	WARNING(nNo >= m_nMax,"CSpriteLoader::GetSpriteで範囲外");

	LRESULT hr;
	hr = Load(nNo);			//	読み込んでいなければここで読み込む必要あり
	if (hr) {
		WARNING(true,"CSpriteLoader::GetSpriteでファイル読み込みに失敗");
		return NULL;	//	だめだこりゃ＾＾
	}

	return m_lpChara[nNo].GetSprite();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00572160 vt
LRESULT		CSpriteLoader::InnerLoad(int nNo){
	return m_lpChara[nNo].Load(m_lpSLOAD_CACHE[nNo].lpszFilename);
}

// @yo2 0x00572190 vt
LRESULT		CSpriteLoader::InnerRelease(int nNo){
	m_lpChara[nNo].Release();
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
