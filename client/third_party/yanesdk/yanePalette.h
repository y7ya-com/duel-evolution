//	yanePalette.h :
//		programmed by yaneurao	'00/10/16

	//
	//	作りかけ
	//

#ifndef __yanePalette_h__
#define __yanePalette_h__

class CPalette {
public:
	LRESULT	Get(HDC hdc);	//	Paletteを取得
	LRESULT	Set(HDC hdc);	//	Paletteを設定

	//	直接的にパレットを取得
	LPPALETTEENTRY GetPalette(void);

	CPalette(void);
	virtual ~CPalette();

protected:
	PALETTEENTRY m_pal[256];
};

#endif
