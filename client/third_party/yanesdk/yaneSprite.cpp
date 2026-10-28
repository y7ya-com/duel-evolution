
#include "stdafx.h"
#include "yaneSprite.h"

//////////////////////////////////////////////////////////////////////////////
//	CSprite

// @yo2 0x0056f6d0 feat
void	SSprite::SetPlane(CPlaneBase*lp){
	//	プレーン全域を一つのスプライトとする
	WARNING(lp==NULL,"CSprite::SetPlaneでlp==NULL");

	lpPlane = lp;
	int	sx,sy;
	lpPlane->GetSize(sx,sy);
	::SetRect(&rcRect,0,0,sx,sy);
	nOx = nOy = 0;
	nHeight	= sy;
	bFast	= true;
}

//////////////////////////////////////////////////////////////////////////////
//	CSprite

// @yo2 0x0056f740 review
CSpriteBase::CSpriteBase(void){
	Clear();
}

// @yo2 0x0056f7f0 vt
CSpriteBase::~CSpriteBase(){
	Clear();
}

// @yo2 0x0056f870 cg
void	CSpriteBase::Clear(void){
	m_Animation.clear();
}

// @yo2 0x0056f8e0 review
void	CSpriteBase::SetSprite(SSprite*lpSSprite){
	while (lpSSprite->lpPlane!=NULL) {
		m_Animation.push_back(*lpSSprite);
		lpSSprite++;
	}
}

// @yo2 0x0056fba0 review
void	CSpriteBase::SetSpriteAdd(SSprite*lpSSprite){
	m_Animation.push_back(*lpSSprite);
}

// @yo2 0x0056fe60 manual
SSprite* CSpriteBase::GetSSprite(int nAnimation) {
	WARNING(m_Animation.size() < nAnimation,"CSpriteBase::GetSpriteでnAnimationが範囲外");
	return& m_Animation[nAnimation];
}

// @yo2 0x0056fe80 review
int		CSpriteBase::GetAnimationMax(void){
	return m_Animation.size();
}

//////////////////////////////////////////////////////////////////////////////
//	CSprite : CSpriteBaseのローカライズ版

// @yo2 0x0056fec0 review
CSprite::CSprite(void) {
	m_lpSpriteBase	= NULL;
	m_nAnimation	= 0;
	m_nOx			= 0;
	m_nOy			= 0;
	m_nLayer		= 8;	//	これがディフォルト（深い意味は無い）
	m_bVisible		= true;
	m_nHeight		= 64;
	m_nDirection	= 0;
}

// @yo2 0x0056ff30 vt
CSprite::~CSprite(){
}

// @yo2 0x0056ff50 review
void	CSprite::SetSprite(CSpriteBase*lpSprite){
	m_lpSpriteBase	= lpSprite;
	m_lpSprite		= lpSprite;
	m_nDirection	= 0;
	m_nAnimation	= 0;
}

// @yo2 0x0056ff80 review
void	CSprite::SetOffset(int nOffsetX,int nOffsetY){
	m_nOx = nOffsetX;
	m_nOy = nOffsetY;
}

// @yo2 0x0056ffb0 review
void	CSprite::GetOffset(int& nOffsetX,int& nOffsetY){
	nOffsetX = m_nOx;
	nOffsetY = m_nOy;
}

// @yo2 0x0056ffe0 review
void	CSprite::IncMotion(void){
	m_nAnimation++;
	if (m_nAnimation >= m_lpSprite->GetAnimationMax()) {
		m_nAnimation = 0;
	}
}

// @yo2 0x00570010 review
SSprite* CSprite::GetSSprite(void){
	return m_lpSprite->GetSSprite(m_nAnimation);
}

// @yo2 0x00570030 review
void	CSprite::SetDirection(int nDirection){
	//	方向の変更が無い場合はアニメカウンタをリセットしない（仕様）
	if (m_nDirection != nDirection) {
		m_nAnimation = 0;
	}
	m_nDirection = nDirection;
	m_lpSprite	 = m_lpSpriteBase + nDirection;	//	これ
}

// @yo2 0x00570070 review
int		CSprite::GetDirection(void){
	return m_nDirection;
}

//////////////////////////////////////////////////////////////////////////////

