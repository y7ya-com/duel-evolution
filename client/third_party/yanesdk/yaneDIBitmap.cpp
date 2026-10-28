#include "stdafx.h"
#include "yaneDIBitmap.h"
#include "yaneGraphicLoader.h"
#include "yaneFile.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044ab00 review
CDIBitmap::CDIBitmap(){
	m_lpdwSrc = NULL;
	m_hDC	  = NULL;
	m_hBitmap = NULL;
}

// @yo2 0x0044ab60 vt
CDIBitmap::~CDIBitmap() {
	Release();
}

// @yo2 0x0044ab80 feat
LRESULT	CDIBitmap::Release(){
	if (m_hDC!=NULL){
		::DeleteDC(m_hDC);
		m_hDC = NULL;
	}
	if (m_hBitmap!=NULL){
		::DeleteObject(m_hBitmap);
		m_hBitmap = NULL;
	}
	m_lpdwSrc = NULL;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044abc0 feat
LRESULT CDIBitmap::CreateSurface(int nSizeX,int nSizeY,int nBpp){
	Release();

	BITMAPINFO bmi;
	ZERO(bmi);
	bmi.bmiHeader.biSize		= sizeof(BITMAPINFOHEADER);
	bmi.bmiHeader.biWidth		=  nSizeX;
	bmi.bmiHeader.biHeight		= -nSizeY;
	bmi.bmiHeader.biPlanes		= 1;
	bmi.bmiHeader.biBitCount	= nBpp;
	bmi.bmiHeader.biCompression	= BI_RGB;

	/*
		//	test code
		bmi.bmiHeader.biCompression = BI_BITFIELDS;
		*(LPDWORD)(bmi.bmiColors  ) = 0x1f<<11;		//	5
		*(LPDWORD)(bmi.bmiColors+1) = 0x3f<<5;		//	6
		*(LPDWORD)(bmi.bmiColors+2) = (DWORD)0x1f;	//	5
	*/

	HDC hdc = ::GetDC(NULL); // hWndのほうがええんか？
	if (hdc == NULL) return 1;
	m_hBitmap = ::CreateDIBSection(hdc /* NULL*/, &bmi , DIB_RGB_COLORS, (void**)&m_lpdwSrc, NULL, 0 );
	::ReleaseDC(NULL,hdc);
	if (m_hBitmap==NULL) return 1;

	m_nSizeX = nSizeX;
	m_nSizeY = nSizeY;
	m_nBpp	 = nBpp;

	m_hDC = ::CreateCompatibleDC(NULL);
	::SelectObject(m_hDC,m_hBitmap);

	return 0;
}

// @yo2 0x0044ace0 cg
LRESULT	CDIBitmap::GetSize(LONG& x,LONG& y){
	if (m_hDC == NULL) return 1;

	x = m_nSizeX;
	y = m_nSizeY;

	return 0;
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044ad20 tight
LRESULT CDIBitmap::Load(string BitmapFileName,int nBpp){
	CFile file;
	file.Read(BitmapFileName);

	auto_ptrEx<CGraphicLoader> gl(CGraphicLoader::GetPrototypeFactory()->CreateInstance());
	if (gl->LoadPicture(file)) return 1;

	LONG x,y;
	if (gl->GetSize(x,y)) return 2;
	if (CreateSurface(x,y,nBpp)) return 3;
	if (nBpp==32 && gl->Render((DWORD*)GetPtr(),m_nSizeX*4)==0) return 0;
	//	32bppのときは、自前によるbmp読み込みをトライする
	if (gl->Render(GetDC())) return 4;

	return 0;
}

// @yo2 0x0044b040 feat
LRESULT CDIBitmap::Load(HDC hDC,LPRECT lpRect,int nBpp){
	if (lpRect == NULL) return 1;

	int sx = lpRect->right - lpRect->left;
	int sy = lpRect->bottom - lpRect->top;
	if (CreateSurface(sx,sy,nBpp)) return 1;

	HDC hdc = GetDC();
	for(int y=lpRect->top,y2=0;y<lpRect->bottom;y++,y2++){
		for(int x=lpRect->left,x2=0;x<lpRect->right;x++,x2++){
			::SetPixel(hdc,x2,y2,::GetPixel(hDC,x,y));
		}
	}
	return 0;
}

// @yo2 0x0044b120 feat
LRESULT CDIBitmap::Save(string BitmapFileName,LPRECT lpRect){
	if (m_hDC == NULL) return 0;	//	Openしていないファイル

	RECT rc;
	if (lpRect==NULL) {
		SetRect(&rc,0,0,m_nSizeX,m_nSizeY);
		lpRect = &rc;
	}

	WARNING(rc.left < 0 || rc.top < 0 || rc.right>m_nSizeX || rc.bottom>m_nSizeY,
		"CDIBitmap::Saveで矩形外が指定されている。");

	//	ビットマップメモリ確保
	long lPitch = ((lpRect->right - lpRect->left)*3 + 3) & ~3;	// 一ライン当たりのバイト数
	long size = sizeof(BITMAPFILEHEADER)+sizeof(BITMAPINFOHEADER)
		+lPitch * (lpRect->bottom - lpRect->top);	//	これが画像ファイルサイズ（のはず）

	auto_array<BYTE> bitmap(size);

	//	ビットマップヘッダーの定義
	BITMAPFILEHEADER *BF = (BITMAPFILEHEADER*)(BYTE*)bitmap;
	BF->bfType			= 0x4D42;
	BF->bfSize			= size;
	BF->bfReserved1		= 0;
	BF->bfReserved2		= 0;
	BF->bfOffBits		= sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
	
	BITMAPINFOHEADER *BI = (BITMAPINFOHEADER*)((BYTE*)bitmap + sizeof(BITMAPFILEHEADER));
	BI->biSize			= sizeof(BITMAPINFOHEADER);
	BI->biWidth			= lpRect->right	 - lpRect->left;	// size to be saved...
	BI->biHeight		= lpRect->bottom - lpRect->top;
	BI->biPlanes		= 1;
	BI->biBitCount		= 24;		//	フルカラー
	BI->biCompression	= 0;		//	非圧縮
	BI->biSizeImage		= 0;		//	非圧縮のときは0
	BI->biXPelsPerMeter	= 3780;	//	96dpi(こんなところ見ているソフトはないだろうけど)
	BI->biYPelsPerMeter	= 3780;
	BI->biClrUsed		= 0;
	BI->biClrImportant	= 0;

	BYTE *image = (BYTE*)bitmap + sizeof(BITMAPFILEHEADER)+sizeof(BITMAPINFOHEADER);

	//	イメージ転送なりり！
	int y2 = lpRect->bottom-lpRect->top-1;		//	上下は反転させる必要がある
	for(int y=lpRect->top;y<lpRect->bottom;y++,y2--){
		int x2 = 0;
		for(int x=lpRect->left;x<lpRect->right;x++,x2++){
			COLORREF c = ::GetPixel(m_hDC,x,y);	//	まあ、ちょっとぐらい遅くてもええわな^^
			*(image + x2*3 + y2*lPitch + 0) = GetBValue(c);	//	B
			*(image + x2*3 + y2*lPitch + 1) = GetGValue(c);	//	G
			*(image + x2*3 + y2*lPitch + 2) = GetRValue(c);	//	R
		}
	}

	return CFile().Write(BitmapFileName,bitmap,size);	//	そんだけ:p
}
