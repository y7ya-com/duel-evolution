//	yaneSinTable.h :
//
//		Sin Table
//

#ifndef __yaneSinTable_h__
#define __yaneSinTable_h__

class CSinTable {
public:
	//	n:0-511で一周。結果は<<16されて返る
static LONG	Cos(int n){ return m_lTable[n & 511]; }
static LONG	Sin(int n){ return m_lTable[(n+384) & 511]; }

	//	コンストラクタで初期化するため、
	//	CSinTableクラスを使用する場合は必ずどこかで
	//	コンストラクトする必要がある
	CSinTable(void);

protected:

static	LONG	m_lTable[512];	// cos table
static	bool	m_bInitialize;
};
	//	Visual C++6.0ならば、このクラスのコンストラクタを使わない限り
	//	m_lTableの領域は動的にも確保されない。
	//	また、配列は、最大添え字として使っている範囲でしか確保されない。
	//	例:forで0から255まで回し、そこ以降にアクセスしないことが保証されるならば
	//	　　配列は256個分しか確保されない。(VCの最適化)

#endif
