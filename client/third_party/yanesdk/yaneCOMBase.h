// yaneCOM.h :
//	initialize/terminate COM
//
//	COMを使用する最初と最後で初期化／終了処理が必要なので、
// こんなもんが必要になってくる...
//

#ifndef __yaneCOMBase_h__
#define __yaneCOMBase_h__

#include "yaneCriticalSection.h"

class CCOMBase {
public:
	static LRESULT AddRef(void);	// COMの参照カウントの加算
	static void Release(void);		// COMの参照カウントの減算

protected:
	static	CCriticalSection m_oCriticalSection;
	static  map<DWORD,int> m_vCount;
	//		mapping from GetCurrentThreadId to RefCount

};

#endif
