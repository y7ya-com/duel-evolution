//	yaneGameObjectBase.cpp

#include "stdafx.h"
#include "yaneGameObjectBase.h"

//////////////////////////////////////////////////////////////////////////////

set<CGameObjectBase*> CGameObjectBase::m_GameObjectList;

// @yo2 0x00530ac0 review
CGameObjectBase::CGameObjectBase(void){
	m_GameObjectList.insert(this);
	m_bValid = true;
	m_nX = m_nY = 0;
	m_nID = 0;
}

// @yo2 0x00530c60 vt
CGameObjectBase::~CGameObjectBase(){
	m_GameObjectList.erase(this);
}

// @yo2 0x00530dc0 vt
void	CGameObjectBase::Kill(void) {
	m_bValid = false;
}

// @yo2 0x00530de0 vt
int		CGameObjectBase::GetReleaseLevel(void) {
	return 0;	//	ディフォルトで0
}

/////////////////////////////////////////////
//	まーこれはいるやろ、みたいな（笑）

// @yo2 0x00530e00 review
void	CGameObjectBase::SetPos(int x,int y){
	m_nX = x; m_nY = y;
}

// @yo2 0x00530e30 review
void	CGameObjectBase::GetPos(int&x,int&y){
	x = m_nX; y = m_nY;
}

/////////////////////////////////////////////

//	全インスタンスに関わる操作

// @yo2 0x00530e60 review
void	CGameObjectBase::OnPreDrawAll(void){
	for(set<CGameObjectBase*>::iterator it = m_GameObjectList.begin();it!=m_GameObjectList.end();it++){
		if ((*it)->m_bValid)
			(*it)->OnPreDraw();
	}
}

// @yo2 0x00530ef0 review
void	CGameObjectBase::OnDrawAll(void){
	for(set<CGameObjectBase*>::iterator it = m_GameObjectList.begin();it!=m_GameObjectList.end();it++){
		if ((*it)->m_bValid)
			(*it)->OnDraw();
	}
}

// @yo2 0x00530f80 review
void	CGameObjectBase::OnMoveAll(void){
	for(set<CGameObjectBase*>::iterator it = m_GameObjectList.begin();it!=m_GameObjectList.end();it++){
		if ((*it)->m_bValid)
			(*it)->OnMove();
	}
}

// @yo2 0x00531010 review
void	CGameObjectBase::KillAll(int nReleaseLevel){
	// このレベル以下のものをKillする
	for(set<CGameObjectBase*>::iterator it = m_GameObjectList.begin();it!=m_GameObjectList.end();it++){
		if ((*it)->GetReleaseLevel() <= nReleaseLevel){
			(*it)->Kill();
		}
	}
}

// @yo2 0x005310a0 review
void	CGameObjectBase::Garbage(void){
	//	ガーベジする (C) yaneurao '00/08/01
	for(set<CGameObjectBase*>::iterator it = m_GameObjectList.begin();it!=m_GameObjectList.end();){
		if (!(*it)->IsValid()) {
			CGameObjectBase* lp = *it;
			it++;
			DELETE_SAFE(lp);	//	イテレータはeraseするときにその要素を
								//	指していると不正になる
		} else {
			it++;
		}
	}
}

/////////////////////////////////////////////
