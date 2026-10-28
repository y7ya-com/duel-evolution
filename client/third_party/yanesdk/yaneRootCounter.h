//
//	ゲーム用、汎用カウンタ
//		（プレステ開発キットであったらしい）
//

#ifndef __yaneRootCounter_h__
#define __yaneRootCounter_h__

class CRootCounter {
public:
	//	設定
	void	Set(int nStart,int nEnd,int nStep=1);
	void	SetStep(int nStep);
	void	SetStart(int nStart);
	void	SetEnd(int nEnd);

	//	取得
	int		GetStep(void) { return m_nStep; }
	int		GetStart(void) { return m_nStart; }
	int		GetEnd(void) { return m_nEnd; }
	////	オートリバースカウンタ
	void	SetReverse(bool bReverse){ m_bReverse = bReverse;}	//	リバースカウンタにする
	bool*	GetReversing(void){ return &m_bReversing; }			//	反転カウント中か？
	////	初期値
	void	SetInit(int n) { m_bInit = true; m_nInit = n; }

	//	カウンタのリセット
	void	Reset(void);

	//	カウンタのインクリメント(終端まで達すると、再度、初期値に戻る)
	void	Inc(void);		//	加算

	CRootCounter& operator++() { Inc(); return (*this); }
	CRootCounter operator++(int) { CRootCounter _Tmp = *this; Inc(); return (_Tmp); }

	//	カウンタのサチュレーションインクリメント（終端まで達すると、そこで停止する）
	void	IncS(void);

	//	intとの相互変換
	operator int (void) { return m_nRootCount; }
	const int operator = (int n) { m_nRootCount = n; return n; }
	int		Get (void) { return m_nRootCount; }

	//	Incした結果、周回したか？／IncSした結果、終値になったか？
	bool	IsLapAround(void) { return m_bLapAround; }
	//	Incした結果、初期値に戻ったか？
	bool	IsLapAroundI(void) { return m_bLapAroundI; }

	CRootCounter(void);
	CRootCounter(int nEnd);
	CRootCounter(int nStart,int nEnd,int nStep=1);

	virtual ~CRootCounter();

protected:
	int		m_nRootCount;
	int		m_nStart;
	int		m_nEnd;
	int		m_nStep;
	int		m_nRate;	//	nStep<0のときは、ｎ回のInc()で+1される
	bool	m_bLapAround;
	bool	m_bLapAroundI;

	bool	m_bReverse;		//	リバースカウンタ
	bool	m_bReversing;	//	リバース中か？
	bool	m_bInit;		//	初期値が設定されているか？
	int		m_nInit;		//	設定されている初期値
};

//	こちらは、nStart≦nEndでなくて良い
class CRootCounterS {
public:
	//	nStepは一回の増分の絶対値。マイナスは1/nStepの意味
	void	Set(int nStart,int nEnd,int nStep=1) { m_nStart=nStart; m_nEnd=nEnd; m_nStep=nStep; Reset(); }
	void	SetStep(int nStep) { m_nStep = nStep; }
	void	SetStart(int nStart) { m_nStart = nStart; }
	void	SetEnd(int nEnd) { m_nEnd = nEnd; }

	//	取得
	int		GetStep(void) const { return m_nStep; }
	int		GetStart(void) const { return m_nStart; }
	int		GetEnd(void) const { return m_nEnd; }

	//	カウンタのリセット
	void	Reset(void) { m_nRootCount= m_nStart; m_nRate=0; }

	//	property..
	bool	IsEnd(void) const { return m_nRootCount == m_nEnd; }

	CRootCounterS(void);
	CRootCounterS(int nEnd);
	CRootCounterS(int nStart,int nEnd,int nStep=1);

	virtual ~CRootCounterS() {}

	//	intとの相互変換
	operator int (void) { return m_nRootCount; }
	const int operator = (int n) { m_nRootCount = n; return n; }
	int		Get (void) { return m_nRootCount; }

	//	カウンタのインクリメント(終端まで達すると、そこで停止する)
	void	Inc(bool bAdd=true);
	//	加算（＝End方向へインクリメント）／減算（＝Start方向へのインクリメント）

	CRootCounterS& operator++() { Inc(true); return (*this); }
	CRootCounterS operator++(int) { CRootCounterS _Tmp = *this; Inc(true); return (_Tmp); }
	CRootCounterS& operator--() { Inc(false); return (*this); }
	CRootCounterS operator--(int) { CRootCounterS _Tmp = *this; Inc(false); return (_Tmp); }

protected:
	int		m_nRootCount;
	int		m_nStart;
	int		m_nEnd;
	int		m_nStep;
	int		m_nRate;	//	nStep<0のときは、ｎ回のInc()で+1される
};

#endif
