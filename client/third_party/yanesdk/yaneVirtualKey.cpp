//	yaneVirtualKey.cpp :

#include "stdafx.h"
#include "yaneVirtualKey.h"

//bool	operator <(const CVKeyBase& x,const CVKeyBase& y)  { return x.m_key < y.m_key; }

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00580720 manual
CVirtualKey::CVirtualKey(void){
	ClearKeyDevice();
	ClearKeyList();
	m_bResetKey=false;
}

// @yo2 0x00580880 vt
CVirtualKey::~CVirtualKey() {}
//////////////////////////////////////////////////////////////////////////////

//	キーデバイスの登録
// @yo2 0x005808b0 cg
void	CVirtualKey::ClearKeyDevice(void){
	m_nDeviceMax = 0;
}

// @yo2 0x005808d0 review
void	CVirtualKey::AddDevice(CKeyBase* keybase){
	m_lpDevice[m_nDeviceMax++] = keybase;
}

// @yo2 0x00580900 review
void	CVirtualKey::RemoveDevice(CKeyBase* keybase){
	//	STL使ってないので自前でerase処理:p
	int i;
	for(i=0;i<m_nDeviceMax;i++){
		if (m_lpDevice[i]==keybase){
			for(int j=i+1;j<m_nDeviceMax;j++){
				m_lpDevice[i]=m_lpDevice[j];
			}
			m_nDeviceMax--;
		}
	}

	//	さらに仮想キーの削除作業
	for(i=0;i<VIRTUAL_KEY_MAX;i++){
		CVKeyList::iterator it;
		for(it = m_VKey[i].begin();it!=m_VKey[i].end();){
			if ((*it)->m_lpKeyBase == keybase){
				//	DELETE_SAFE(*it);
				//	↑auto_ptrなので不要
				it = m_VKey[i].erase(it);
			} else {
				it++;
			}
		}
	}
}

// @yo2 0x00580a70 review
CKeyBase* CVirtualKey::GetDevice(int n){
	return m_lpDevice[n];
}

// @yo2 0x00580a90 review
void	CVirtualKey::Input(void){
	m_bResetKey = false;
	for(int i=0;i<m_nDeviceMax;i++)
		m_lpDevice[i]->GetKeyState();
}

//////////////////////////////////////////////////////////////////////////////

//	仮想キーの追加・削除
// @yo2 0x00580ad0 cg
void	CVirtualKey::ClearKeyList(void){
	for(int i=0;i<VIRTUAL_KEY_MAX;i++) {
		m_VKey[i].clear();	//	auto_ptrなので、これでオッケ～
	}
}

// @yo2 0x00580b90 review
void	CVirtualKey::AddKey(int vkey,CKeyBase* base,int key){
	CVKeyBase* lp = new CVKeyBase;
	lp->m_lpKeyBase = base;
	lp->m_key		= key;
	m_VKey[vkey].insert(lp);
}

// @yo2 0x00580bd0 review
void	CVirtualKey::RemoveKey(int vkey,CKeyBase* base,int key){
	CVKeyList::iterator it;
	for(it = m_VKey[vkey].begin();it!=m_VKey[vkey].end();){
		if (((*it)->m_lpKeyBase == base) &&
			((*it)->m_key		== key)){
		//	DELETE_SAFE(*it);
		//	↑auto_ptrなので、不要
			it = m_VKey[vkey].erase(it);
		} else {
			it++;
		}
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00580d00 review
bool	CVirtualKey::IsVKeyPress(int vkey) {					//	仮想キーを調べる
	if (m_bResetKey) return false;
	CVKeyList::iterator it;
	it = m_VKey[vkey].begin();		//	これがあるとこの関数をconstメンバ関数に出来ない
	while (it!=m_VKey[vkey].end()) {
		if ((*it)->m_lpKeyBase->IsKeyPress((*it)->m_key)) return true;
		it++;
	}
	return false;
}

// @yo2 0x00580d70 manual
bool	CVirtualKey::IsVKeyPush(int vkey)  {					//	仮想キーを調べる
	if (m_bResetKey) return false;
	CVKeyList::iterator it;
	it = m_VKey[vkey].begin();
	while (it!=m_VKey[vkey].end()) {
		if ((*it)->m_lpKeyBase->IsKeyPush((*it)->m_key)) return true;
		it++;
	}
	return false;
}

//	[Konami] true on the frame any key bound to vkey is released (name is ours)
// @yo2 0x00580de0 manual
bool	CVirtualKey::IsVKeyRelease(int vkey)  {
	if (m_bResetKey) return false;
	CVKeyList::iterator it;
	it = m_VKey[vkey].begin();
	while (it!=m_VKey[vkey].end()) {
		if ((*it)->m_lpKeyBase->IsKeyRelease((*it)->m_key)) return true;
		it++;
	}
	return false;
}

// @yo2 0x00580e50 review
void	CVirtualKey::ResetKey(void){
	m_bResetKey = true;
}
