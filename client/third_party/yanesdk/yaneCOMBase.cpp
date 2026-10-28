#include "stdafx.h"
#include <objbase.h>
#include "yaneCOMBase.h"

CCriticalSection CCOMBase::m_oCriticalSection;
map<DWORD,int> CCOMBase::m_vCount;

// @yo2 0x00433ef0 feat
LRESULT CCOMBase::AddRef(void){

	DWORD	dwThreadID = ::GetCurrentThreadId();
	int nCount;

	m_oCriticalSection.Enter();
	{

	map<DWORD,int>::iterator p = m_vCount.find(dwThreadID);
	if (p == m_vCount.end()){
		nCount = 0;
		m_vCount.insert(pair<DWORD,int>(dwThreadID,1)); // キー挿入
	} else {
		nCount = p->second;
		p->second = nCount+1;
	}

	}
	m_oCriticalSection.Leave();

	if (nCount==0) {
		if (::CoInitialize(NULL)) {
			Err.Out("CoInitializeに失敗...");
			return 1;
		}
	}
	return 0;
}

// @yo2 0x00433fd0 feat
void CCOMBase::Release(void){
	DWORD	dwThreadID = ::GetCurrentThreadId();

	m_oCriticalSection.Enter();
	{

	int nCount;
	map<DWORD,int>::iterator p = m_vCount.find(dwThreadID);
	if (p == m_vCount.end()){
		return ;	//	そんなん無いで？
	} else {
		nCount = p->second;
	}
	nCount--;
	p->second = nCount;


	if (nCount==0) {
//		  CoUnitialize(); // DirectXのマニュアルの誤記？
		::CoUninitialize(); // COMのシャットダウン

		m_vCount.erase(p);	//	消してまえ！
	}

	}
	m_oCriticalSection.Leave();
}
