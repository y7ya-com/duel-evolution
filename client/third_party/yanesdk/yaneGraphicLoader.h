//
//	yaneGraphicLoader.h
//
//		BMP,JPEG,GIF,...や必要に応じてSusie-Plug inを自動的に読み込むクラス
//		programmed by yaneurao(M.Isozaki)	'00/05/15
//		reprogrammed by yaneurao(M.Isozaki) '00/06/21
//
//			SPI読み込み部分のサンプルソースをくださった、にっくるさんに感謝！
//

#ifndef __yaneGraphicLoader_h__
#define __yaneGraphicLoader_h__

#include <olectl.h>	//	IPicture

#include "yaneFile.h"
#include "YTL/prototype_factory.h"

///////////////////////////////////////////////////////////////////////////

typedef struct SpiPictureInfo {
	long left,top;					//	画像を展開する位置
	long width;						//	画像の幅(pixel)
	long height;					//	画像の高さ(pixel)
	WORD x_density;					//	画素の水平方向密度
	WORD y_density;					//	画素の垂直方向密度
	short colorDepth;				//	１画素当たりのbit数
	HLOCAL hInfo;					//	画像内のテキスト情報
} SpiPictureInfo, *LPSpiPictureInfo;

typedef	int (PASCAL *SpiFuncIsSupported)(LPSTR, DWORD);
typedef	int (PASCAL *SpiFuncGetPictureInfo)(LPSTR, long, unsigned int, SpiPictureInfo*);
typedef	int (PASCAL *SpiFuncGetPicture)(LPSTR, long, unsigned int, HLOCAL*, HLOCAL*, FARPROC, long);

///////////////////////////////////////////////////////////////////////////

class CGraphicLoader {
public:
	virtual LRESULT LoadPicture(CFile& file);			//	これで読み込む返し値が0ならば成功

	virtual LRESULT GetSize(LONG& x,LONG& y);			//	これで読み込んだ画像のサイズを取得
	virtual LRESULT Render(DWORD* p,LONG lPitch);		//	CDIB32のサーフェースへのポインタを渡して、そこに描画してもらう
	virtual LRESULT	Render(HDC hdc);					//	hdcを渡して、そこに描画してもらう
	virtual LRESULT	ReleasePicture();					//	これで解放する

	virtual LRESULT	GetPalette(PALETTEENTRY pal[256]);	//	パレットの取得

	//	うひゃー。かっちょええ～＾＾；
	static PrototypeFactory<CGraphicLoader>* GetPrototypeFactory() { return& m_factory; }

	//	PrototypeFactoryで明示的に作ってね＾＾；
	CGraphicLoader();
	virtual ~CGraphicLoader();

protected:

	virtual LRESULT LoadPictureByOwn(CFile& file);	//	bmp
	virtual LRESULT LoadPictureByOLE(CFile& file);	//	jpeg,gif
	virtual LRESULT LoadPictureBySPI(CFile& file);	//	using by SPI

	//	for LoadPictureByOwn
	BITMAPFILEHEADER*	m_lpBF;
	BITMAPINFOHEADER*	m_lpBI;
	void*				m_lpBits;

	//	for OLELoadPicture
	IPicture*	m_lpiPicture;

	//	for SPI
	HMODULE		m_hDLL;
	SpiFuncIsSupported		m_pIsSupported;
	SpiFuncGetPictureInfo	m_pGetPictureInfo;
	SpiFuncGetPicture		m_pGetPicture;
	CFile*		m_lpFile;
	HLOCAL		m_hBm;
	HLOCAL		m_hBmInfo;
	virtual void	FreeLocalMemory();

	//	うひゃー。かっちょええ～＾＾；
	static PrototypeFactory<CGraphicLoader> m_factory;
};

#endif
