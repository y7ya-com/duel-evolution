// yaneMorpher.h
//	for CDIB32 morphing class

#ifndef __yaneMorpher_h__
#define __yaneMorpher_h__

#include "yaneDIB32.h"
#include <vector>
using namespace std;

#include "YTL/auto_array.h"

//	転送元と転送先の対応点集合を与えると、
//	転送先の任意点に対応する転送元の点が取得できる
class CMorpherCalc {
public:
	void	Clear(void);	//	設定した対応点集合のクリア

	//	転送元と、転送先の対応点集合
	void	Set(int nSrcX,int nSrcY,int nDstX,int nDstY);
	void	SetRev(int nDstX,int nDstY,int nSrcX,int nSrcY);

	//	転送先の点を与えて、転送元の点を取得する
	void	Get(int nDstX,int nDstY,int &nSrcX,int &nSrcY);

protected:
	vector<int>	m_nDstX;
	vector<int>	m_nDstY;
	vector<int>	m_nSrcX;
	vector<int>	m_nSrcY;
};

class CMorpher {
public:
	void	SetDiv(int nSizeX,int nSizeY,int nXDiv,int nYDiv);
	void	GetDiv(int&nSizeX,int&nSizeY,int&nXDiv,int&nYDiv);
	void	Release(void);

	//	転送元と、転送先の対応点集合
	void	Set(int nSrcX,int nSrcY,int nDstX,int nDstY);
	void	SetRev(int nDstX,int nDstY,int nSrcX,int nSrcY);
	void	Calc(void);	//	計算するのだ＾＾

	//	困ったときのため＾＾
	CMorpherCalc*	GetMorph(void) { return& m_MorphCalc; }
	POINT*			GetPointSrc(void) { return m_lpPointSrc; }
	POINT*			GetPointDst(void) { return m_lpPointDst; }

	CMorpher(void);
	~CMorpher();
protected:
	int		m_nXDiv;					//	x方向の分割数
	int		m_nYDiv;					//	y方向の分割数	
	auto_array<POINT>	m_lpPointSrc;	//	ソースの各ポイント
	auto_array<POINT>	m_lpPointDst;	//	転送先の各ポイント
	int		m_nSizeX;					//	転送先サイズ
	int		m_nSizeY;					//	転送先サイズ
	CMorpherCalc m_MorphCalc;			//	Morph計算用
};

#ifdef USE_DIB32
//	CDIB32によるモーフィングクラス
class CDIB32Morph {
public:
	void	SetDiv(int nSizeX,int nSizeY,int nXDiv,int nYDiv);
	void	Release(void);
	//	転送元と、転送先の対応点集合
	void	Set(int nSrcX1,int nSrcY1,int nSrcX2,int nSrcY2);
	void	Calc(void);	//	計算するのだ＾＾

	//	lpSrc1からlpSrc2へモーフィング。nPhaseは0-256,lpTemporaryはSecondaryと同サイズ確保してね。
	void	OnDraw(CDIB32* lpSecondary,CDIB32* lpSrc1,CDIB32* lpSrc2,CDIB32 *lpTemporary,int nPhase);

protected:
	CMorpher	m_Morph;	//	正計算
	CMorpher	m_MorphRev;	//	逆計算
	void	InnerOnDraw(CDIB32* lpTarget,CDIB32* lpSrc,CMorpher*,int nPhase);
};
#endif // #ifdef USE_DIB32

#endif
