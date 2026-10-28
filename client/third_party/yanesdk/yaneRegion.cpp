//
//	yaneRegion.cpp
//
#include	"stdafx.h"

#include	"yanePlaneBase.h"
#include	"yaneFastPlane.h"
#include	"yaneDIB32.h"
#include	"yaneRegion.h"

///////////////////
//	bmp読み込み後のCPlaneBase*を渡して、そのサーフェースに設定されている
//	colorkey(ヌキ色)の部分を抜いたリージョンを作成。
//////////////////
// @yo2 0x00557ae0 feat
LRESULT CRegion::Set(CPlaneBase* lpPlane)
{
	HDC hDC = CreateCompatibleDC(NULL);// DC 作成
	if(hDC==NULL)return -1;// DC作成失敗…

	//	元のビットマップデータ取り出し
	LPRECT	lpSrcRect;
	DWORD	dwCkey;

	switch(lpPlane->GetID()) {
	case eDraw_CDIB32:		//	CDIB32
#ifdef USE_DIB32
	{
		CDIB32 *lpDIB = (CDIB32 *)lpPlane;
		lpSrcRect	= lpDIB->GetRect();
		dwCkey		= lpDIB->GetColorKey();
		break;
	}
#endif
	case eDraw_CFastPlane:	//	CFastPlane
#ifdef USE_FastDraw
	{
		CFastPlane *lpFastPlane = (CFastPlane *)lpPlane;
		lpSrcRect	= lpFastPlane->GetPlaneInfo()->GetRect();
		dwCkey		= lpFastPlane->GetColorKey();
		break;
	}
#endif
	case eDraw_CPlane:		//	CPlane
	case eDraw_NullPlane:	//	違法なプレーン
	default:
		WARNING(true,"CRegion::Set で違法なプレーン");
		::DeleteDC(hDC);
		return -1;
	}

	int		nStartX;
	//	リージョンパス生成開始
	if (!::BeginPath(hDC)) {
		return -1;
	}
	for (int y = lpSrcRect->top; y < lpSrcRect->bottom; y++) {
		nStartX = -1;
		long x;	// [portable] MSVC6 for-scope: x is used after the loop
		for (x = lpSrcRect->left; x < lpSrcRect->right; x++) {
			if (lpPlane->GetPixelAlpha(x,y)==0) {// 抜き色か
				if (nStartX >= 0) {
					::MoveToEx(hDC, nStartX, y, NULL);
					::LineTo(hDC, x, y);
					::LineTo(hDC, x, y + 1);
					if (!::CloseFigure(hDC)) {
						::EndPath(hDC);
						::DeleteDC(hDC);
						return -1;
					}
					nStartX = -1;
				}
			} else {
				if (nStartX < 0) {
					nStartX = x;
				}
			}
		}
		if (nStartX >= 0) {
			::MoveToEx(hDC, nStartX, y, NULL);
			::LineTo(hDC, x, y);
			::LineTo(hDC, x, y + 1);
			if (!::CloseFigure(hDC)) {
				::EndPath(hDC);
				::DeleteDC(hDC);
				return -1;
			}
			nStartX = -1;
		}
	}
	::EndPath(hDC);

	Release();// リージョン解放

	m_hRgn = ::PathToRegion(hDC);// 新しいのにする

	::DeleteDC(hDC);// ここでHDC解放

	return 0;
}

///////////////////
//	HRGN を直接指定してそれのコピーを作成
//////////////////
// @yo2 0x00557ce0 feat
LRESULT CRegion::Set(HRGN hRgn)
{
	if (hRgn == NULL)
		return -1;

	if (m_hRgn == NULL) {// ないんなら作る
		m_hRgn = ::CreateRectRgn(0,0,0,0);// 空のリージョンを作成

		if(m_hRgn==NULL) {
			// エラー処理
			return -1;
		}
	}

	if (::CombineRgn(m_hRgn, hRgn, NULL , RGN_COPY)) {
		// エラー処理
		return -1;
	}
	return 0;
}

/////////
//	bmpファイルを読み込んで、そのdwRGBの色を抜いたリージョンを作成。
////////
// @yo2 0x00557d50 review
LRESULT	CRegion::Load(const string szFileName,int r,int g,int b)
{
	smart_ptr<CPlaneBase> lpPlane(CPlaneBase::CreatePlane(),true);
	if (lpPlane->Load(szFileName))
		return -1;
	lpPlane->SetColorKey(r,g,b);
	return Set(lpPlane);
}

/////////
//	bmpファイルを読み込んで、その(nPosX,nPosY)の座標の色を抜いたリージョンを作成。
/////////
// @yo2 0x00557f70 review
LRESULT	CRegion::Load(const string szFileName,int nPosX,int nPosY)
{
	smart_ptr<CPlaneBase> lpPlane(CPlaneBase::CreatePlane(),true);

	if (lpPlane->Load(szFileName))return -1;// 読み込み失敗

	lpPlane->SetColorKey(nPosX,nPosY);
	return Set(lpPlane);
}

/////////
//	空のリージョン作成
/////////
// @yo2 0x00558190 feat
LRESULT CRegion::CreateEmptyRegion(void) {
	Release();// とりあえず、前回の解放

	m_hRgn = ::CreateRectRgn(0,0,0,0);// 空のリージョンを作成
	if(m_hRgn==NULL)return -1;

	return 0;
}

// @yo2 0x005581d0 feat
void	CRegion::Release(void){
	if (m_hRgn!=NULL) {
		::DeleteObject(m_hRgn);
	}
}

// @yo2 0x005581f0 review
CRegion::CRegion(void) {
	m_hRgn = NULL;
}

// @yo2 0x00558240 vt
CRegion::~CRegion(){
	Release();
}

HRGN	CRegion::GetHRGN(void){
	return m_hRgn;
}

///////////
//	regionの加減
///////////
// @yo2 0x00558280 feat
CRegion& CRegion::operator += (const CRegion& oSrc)
{
	HRGN hRgn = const_cast<CRegion*>(&oSrc)->GetHRGN();
	if (m_hRgn == NULL || hRgn == NULL)
		return *this;
	if (::CombineRgn(m_hRgn, m_hRgn, hRgn, RGN_OR)) {
		// エラー処理
		return *this;
	}
	return *this;
}

// @yo2 0x005582c0 feat
CRegion& CRegion::operator -= (const CRegion& oSrc)
{
	HRGN hRgn = const_cast<CRegion*>(&oSrc)->GetHRGN();
	if (m_hRgn == NULL || hRgn == NULL)
		return *this;
	if (::CombineRgn(m_hRgn, m_hRgn, hRgn , RGN_DIFF)) {
		// エラー処理
		return *this;
	}
	return *this;
}

// @yo2 0x00558300 feat
CRegion& CRegion::operator = (const CRegion& oSrc)
{
	HRGN hRgn = const_cast<CRegion*>(&oSrc)->GetHRGN();
	if (hRgn == NULL)
		return *this;

	if (m_hRgn == NULL) {// ないんなら作る
		m_hRgn = ::CreateRectRgn(0,0,0,0);// 空のリージョンを作成

		if(m_hRgn==NULL) {
			// エラー処理
			return *this;
		}
	}

	if (::CombineRgn(m_hRgn, hRgn, NULL , RGN_COPY)) {
		// エラー処理
		return *this;
	}
	return *this;
}
