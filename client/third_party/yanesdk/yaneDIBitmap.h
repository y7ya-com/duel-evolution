//
//	Device Independent Bitmap
//

#ifndef __yaneDIBitmap_h__
#define __yaneDIBitmap_h__

//	DIBitmapはGDIと同じく、下位からR,G,B,α

class CDIBitmap {
public:

	LRESULT Load(string szFileName,int nBpp=24);
	LRESULT Load(HDC hDC,LPRECT lpRect,int nBpp=24);
	LRESULT Save(string szFileName,LPRECT lpRect=NULL);
	LRESULT CreateSurface(int nSizeX,int nSizeY,int nBpp=24);
	LRESULT	Release();

	//	LoadBitmap/CreateSurface以降、いつでもDCの取得は可能
	HDC		GetDC() { return m_hDC; }
	HBITMAP GetHBITMAP() { return m_hBitmap; }

	LRESULT	GetSize(LONG& x,LONG& y);
	BYTE*	GetPtr() { return (BYTE*)m_lpdwSrc; }

	CDIBitmap();
	virtual ~CDIBitmap();

protected:
	DWORD	m_lpdwSrc;		//	ソースバッファ
	LONG	m_nSizeX;
	LONG	m_nSizeY;
	int		m_nBpp;
	HBITMAP m_hBitmap;
	HDC		m_hDC;


};

#endif
