// yaneMutex.h :
//
//	programmed by M.Isozaki '99/06/19
//	毎回ハンドルを取得するので遅いでやんす:p

#ifndef __yaneMutex_h__
#define __yaneMutex_h__

class CMutex {
public:
	LRESULT Open(string szMutexName);

	// Result
	//	0 : 他に同名のものは存在しない→所有権獲得成功！
	//	1 : 他に同名のものが存在する。(error)
	
	void Wait(void);	// 所有権が獲得できるまで待つ

	void Release(void);	//	Mutexを解放する

	CMutex(void);
	virtual ~CMutex();
protected:
	HANDLE	m_hMutex; // Mutex ハンドル 
};

//	MutexによるLock～unlock
//		CCriticalSectionと同じ感覚で使える
class CMutexSection {
public:
	void	Enter(string szMutexName);	//	MutexSectionに入る
	void	Leave();					//	MutexSectionから出る

	//	デストラクタではCMutexを解放するので、そのときに
	//	自動的にMutexは解放される。

protected:
	CMutex m_vMutex;
};

#endif
