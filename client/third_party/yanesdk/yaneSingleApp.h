#ifndef __yaneSingleApp_h__
#define __yaneSingleApp_h__

#include "yaneMutex.h"

class CSingleApp {
public:
	CSingleApp(void);

	bool	IsValid(void);	//　他に自分と同じアプリが起動していなかったか？

protected:
	CMutex	m_oMutex;
	bool	m_bValid;
};

#endif
