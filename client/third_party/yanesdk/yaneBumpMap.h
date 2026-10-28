//
//	bump maping
//

#ifndef __yaneBumpMap_h__
#define __yaneBumpMap_h__

class CDIB32;

struct SBumpMapChip {	//	変移量
	LONG	x;
	LONG	y;
	SBumpMapChip() { x = y = 0; }
};

//	BumpMaper
class CBumpMap {
public:
	void	Resize(int x,int y);		//	変移量をリサイズ(Reset兼ねる)する
	void	GetSize(int&x,int&y);		//	Resizeしたサイズを得る
	SBumpMapChip* GetTable(void);		//	変移量の先頭ポインタを得る
	SBumpMapChip** GetStartTable(void);	//	bump tableの各ラインの先頭アドレステーブルを得る
protected:
	auto_array<SBumpMapChip> m_alpBumpMapTable;
	auto_array<SBumpMapChip*> m_alpBumpMapTableStart;
	int		m_nSizeX,m_nSizeY;
};

class CBumpEffecter {
public:
static	void LensEffect1(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate);	//	凸レンズ
	//	nRateは拡大率。10(少し)～2(かなり)ぐらいの間で...
static	void SwirlEffect1(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate);	//	渦巻き(外から)
	//	nRateはねじれ率。100(少し)～10(かなり)ぐらいの間で...
static	void SwirlEffect2(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate);	//	渦巻き(内から)
	//	nRateはねじれ率。3(少し)～10(かなり)ぐらいの間で...
};

/////////////////////////////////////////////////////////////////

#endif
