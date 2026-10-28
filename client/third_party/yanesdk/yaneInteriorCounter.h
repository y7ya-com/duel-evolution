//
//	CInteriorCounter
//		内分カウンタ
//

#ifndef __yaneInteriorCounter_h__
#define __yaneInteriorCounter_h__

class CInteriorCounter {
public:
	CInteriorCounter();

	//	intとの相互変換
	operator int () { return m_nNow; }
	const int operator = (int n) { m_nNow = m_nStart = n; m_nFramesNow = 0; return n; }

	void	Inc();		//	加算
	CInteriorCounter& operator++() { Inc(); return (*this); }
	CInteriorCounter operator++(int) { CInteriorCounter _Tmp = *this; Inc(); return (_Tmp); }

	void	Dec();		//	減算
	CInteriorCounter& operator--() { Dec(); return (*this); }
	CInteriorCounter operator--(int) { CInteriorCounter _Tmp = *this; Dec(); return (_Tmp); }

	void	Set(int nStart,int nEnd,int nFrames);
	void	Set(int nNow) { *this = nNow; }

	int		GetEnd(){ return m_nEnd;}
	bool	IsEnd(){ return (m_nNow == m_nEnd);}

private:
	int		m_nNow;			//	現在の値
	int		m_nStart;		//	初期値
	int		m_nEnd;			//	終了値
	int		m_nFrames;		//	フレーム分割数（終了値になるまで何回Incをすればいいのか）
	int		m_nFramesNow;	//	現在、何フレーム目か？
};

#endif
