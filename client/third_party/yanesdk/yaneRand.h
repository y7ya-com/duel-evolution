//
//	Mersenne Twister法による高精度乱数発生
//	　2^19937-1という非常に長い周期性を持った乱数を高速に生成する！
//

#ifndef __yaneRand_h__
#define __yaneRand_h__

#include "yaneSerialize.h"

class CRand : public CArchive { // このクラスは、シリアライズ対応！
public:
	DWORD	Get(void);				//	乱数の取得
	DWORD	Get(int n){				//	0～n-1の乱数の取得
		//WARNING(n==0,"CRandでn==0");
		if (n==0) return 0;
		return Get() % n;
	}

	void	SetSeed(DWORD dwSeed);	//	乱数の種の設定。必ず一度呼び出す必要がある

	void	Randomize(void){		//	ランダマイズ
		SetSeed(::GetTickCount());
	}

	CRand(void) { m_nMti = 624+1; } /* means m_dwMt is not initialized */
	CRand(DWORD dwSeed) { SetSeed(dwSeed); }
	// @yo2 0x00607140 vt
	virtual ~CRand() {}

protected:
	DWORD	m_dwMt[624];	// the array for the state vector
	int		m_nMti;			// initialization counter

protected:
	//	override from CArchive
	// @yo2 0x00606ff0 vt
	virtual void Serialize(CSerialize& s){
		s.Store(ArraySerialize(m_dwMt));	//	メンバ変数まるごと、
		s << m_nMti;						//	シリアライズするのだ！
	}
};

#endif
