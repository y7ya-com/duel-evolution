#include "stdafx.h"

#include "yaneFont.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0052ea70 review
CFont::CFont(void){
	SetSize(16);
	SetHeight(20);
	SetFont(0);	// MS ゴシック
//	SetColor(RGB(128,192,128));
//	SetBackColor(RGB(64,128,64));
	SetColor(RGB(255,255,255));
	SetBackColor(RGB(128,128,128));
	SetBGColor(CLR_INVALID);
	SetQuality(2);
	SetWeight(FW_LIGHT);
	SetItalic(false);
	SetUnderLine(false);
	SetStrikeOut(false);
	SetShadowOffset(2,2);
	m_nCharSet = SHIFTJIS_CHARSET;	//	[Konami] (SetFont(0) above set DEFAULT_CHARSET; overridden here)
}

// @yo2 0x0052ebc0 vt
CFont::~CFont(){
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0052ec60 review
void	CFont::SetQuality(int nQuality){
	switch(nQuality) {
	case 0: m_nQuality = DEFAULT_QUALITY; break;
	case 1: m_nQuality = DRAFT_QUALITY; break;
	case 2: m_nQuality = PROOF_QUALITY; break;
	case 3: m_nQuality = ANTIALIASED_QUALITY; break;
	case 4: m_nQuality = NONANTIALIASED_QUALITY; break;
	default: WARNING(true,"CFont::SetQuality 規定外の数値");
	}
}

// @yo2 0x0052ece0 review
void	CFont::SetSize(int nSize){
	m_nSize = nSize;
	m_nHeight = nSize;	//	こいつも更新する価値がある？
}

// @yo2 0x0052ed00 review
void	CFont::SetColor(COLORREF rgb){
	m_nRgb = rgb;
}

// @yo2 0x0052ed20 review
void	CFont::SetBackColor(COLORREF rgb){
	m_nBkRgb	= rgb;
}

// @yo2 0x0052ed40 review
void	CFont::SetBGColor(COLORREF rgb){
	m_nBGRgb	= rgb;
}

// @yo2 0x0052ed60 review
void	CFont::SetHeight(int nHeight){
	m_nHeight = nHeight;
}

// @yo2 0x0052ed80 review
void	CFont::SetWeight(int nWeight){
	m_nWeight = nWeight;
}

// @yo2 0x0052eda0 feat
void	CFont::SetFont(int nFontNo){
	string name;
	//	[Konami] font table per language + charset (was 0:ＭＳ ゴシック 1:ＭＳ Ｐゴシック 2:ＭＳ 明朝 3:ＭＳ Ｐ明朝)
	switch (nFontNo) {
	case 0: name ="MS Sans Serif";		m_nCharSet = DEFAULT_CHARSET; break;
	case 1: name ="Arial";				m_nCharSet = DEFAULT_CHARSET; break;
	case 2: name ="MS Gothic";			m_nCharSet = SHIFTJIS_CHARSET; break;
	case 3: name ="ＭＳ Ｐゴシック";	m_nCharSet = SHIFTJIS_CHARSET; break;
	case 4: name ="ＭＳ 明朝";			m_nCharSet = SHIFTJIS_CHARSET; break;
	case 5: name ="ＭＳ Ｐ明朝";		m_nCharSet = SHIFTJIS_CHARSET; break;
	case 6: name ="GulimChe";			m_nCharSet = HANGEUL_CHARSET; break;
	default: name="";	//	charset unchanged
	}
	if (m_FontName==name) return ;
	m_FontName=name;
}
// @yo2 0x0052f160 review
void	CFont::SetFont(const string& fontname){
	if (m_FontName==fontname) return ;
	m_FontName=fontname;
}

// @yo2? 0x0052f340 order
void	CFont::SetText(const wstring& s){	//	[Konami] wide
	m_String = s;
}

// @yo2 0x0052f4d0 review
void	__cdecl CFont::SetText(LPWSTR fmt, ... ){	//	[Konami] wide
	WCHAR buf[512];
	wvsprintfW(buf,fmt,(va_list)(&fmt+1));
	SetText((wstring)buf);
}

// @yo2 0x0052f630 review
void CFont::SetText(int i){
	WCHAR buf[16];	//	[Konami] wide
	wsprintfW(buf,L"%d",i);
	SetText(buf);
}

// @yo2 0x0052f6f0 review
void	CFont::SetItalic(bool b){
	m_bItalic = b;
}

// @yo2 0x0052f710 review
void	CFont::SetUnderLine(bool b){
	m_bUnderLine = b;
}

// @yo2 0x0052f730 review
void	CFont::SetStrikeOut(bool b){
	m_bStrikeOut = b;
}

// @yo2 0x0052f750 review
void	CFont::SetShadowOffset(int nOx,int nOy){
	m_nShadowOffsetX = nOx;
	m_nShadowOffsetY = nOy;
}

/////////////////////////////////////////////////////////////////////////////////////////

//	drawing

// @yo2 0x0052f780 feat
void	CFont::OnDraw(HDC hdc,int x,int y){

	//	文字列が設定されていなければ帰る
	if (m_String.empty()) return ;

	HFONT hFont = ::CreateFont(m_nSize,0,0,0,m_nWeight,m_bItalic,m_bUnderLine,m_bStrikeOut,m_nCharSet,
		OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, m_nQuality,0,m_FontName.c_str());
	//	[Konami] charset m_nCharSet (was SHIFTJIS_CHARSET), pitch&family 0 (was FF_MODERN)

	if (hFont==NULL) return ; // メモリ足りんのだがや！？

	HFONT hFontLast = (HFONT)::SelectObject(hdc,hFont);

	//	もし背景色付きで描画するならば、
	//	最初の一回はopaque,二回目以降がtransparent,
	bool bFirst = true;

	if (m_nBkRgb!=CLR_INVALID){
		//	これ、重ねる価値がなさそう．．
		POINT point[5] = {
			{m_nShadowOffsetX,m_nShadowOffsetY},		// 1
//			{2,2},		// 1
			{0,1},
			{2,1},		// 2
			{1,2},
			{2,2}		// 3
		};

		::SetTextColor(hdc,m_nBkRgb);
		//	色の変更

		//	背景色の設定
		if (m_nBGRgb==CLR_INVALID) {
			::SetBkMode(hdc, TRANSPARENT);
		} else {
			::SetBkMode(hdc, OPAQUE);
			::SetBkColor(hdc,m_nBGRgb);
		}
		bFirst = false;

		for(int i=0;i<1 /* 5 */;i++){
			TextOut(hdc,x + point[i].x,y + point[i].y,m_String);
			//	文字の表示（WIN32APIではなく、このクラスのstatic関数であることに注意）
		}
	}
	if (m_nRgb!=CLR_INVALID){
		//	背景色の設定
		if (bFirst){
			if (m_nBGRgb==CLR_INVALID) {
				::SetBkMode(hdc, TRANSPARENT);
			} else {
				::SetBkMode(hdc, OPAQUE);
				::SetBkColor(hdc,m_nBGRgb);
			}
		} else if (m_nBGRgb!=CLR_INVALID) {
			//	２回目以降の描画なので透過設定に戻しておかなくては．．
			::SetBkMode(hdc, TRANSPARENT);
		}

		::SetTextColor(hdc,m_nRgb);
		TextOut(hdc,x,y,m_String);	//	文字の表示
	}
	::SelectObject(hdc,hFontLast);
	::DeleteObject(hFont);		// これ一回でええんか？
}

// @yo2 0x0052f930 feat
LRESULT	CFont::GetSize(int& sx,int& sy){
	sx = 0; sy = 0;	// fail safe対策

	//	文字列が設定されていなければ帰る
	if (m_String.empty()) return 1;

	HFONT hFont = ::CreateFont(m_nSize,0,0,0,m_nWeight,m_bItalic,m_bUnderLine,m_bStrikeOut,m_nCharSet,
		OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, m_nQuality,0,m_FontName.c_str());
	//	[Konami] charset m_nCharSet (was SHIFTJIS_CHARSET), pitch&family 0 (was FF_MODERN)
	if (hFont==NULL) return 1; // あじゃー

	SIZE size;
	HDC hdc = ::CreateCompatibleDC(NULL);
	HFONT hFontLast = (HFONT)::SelectObject(hdc,hFont);

	//	[Konami] wide string, GetTextExtentPoint32W/wcslen
	LPCWSTR p = m_String.c_str();
	WCHAR buf[256];	//	この長さまでしか計測不可＾＾；
	LPWSTR q=buf;
	size.cx=0; size.cy=0;
	SIZE size2;
	for(;;){
		*q = *(p++);
		if (*q==L'\n') {
			*q=0;	// 改行コードならば潰す 
			::GetTextExtentPoint32W(hdc,buf,wcslen(buf),&size2);
			//GetTextExtentPointは特定の状況で１ドットずれが発生するそうな^^;
//			size.cy+=size2.cy;
			size.cy+=m_nHeight;	//	fixed by あきら
			if (m_bItalic) size2.cx+=m_nSize/4;	//	APIが斜体のサイズ測定を誤るbug対策
			if (size.cx<size2.cx) size.cx=size2.cx;
			q=buf;
			continue;	//	このときはqを加算されては困る
		} else if (*q==L'\0') {
			::GetTextExtentPoint32W(hdc,buf,wcslen(buf),&size2);
			//GetTextExtentPointは特定の状況で１ドットずれが発生するそうな^^;
			size.cy+=size2.cy;
			if (m_bItalic) size2.cx+=m_nSize/4;	//	APIが斜体のサイズ測定を誤るbug対策
			if (size.cx<size2.cx) size.cx=size2.cx;
			break;	// これにて終了～
		}
		q++;
	}
	sx = size.cx + 4;	//	文字には影があるので	//	[Konami] +4 (was +3)
	sy = size.cy + 3;	//

	::SelectObject(hdc,hFontLast);
	::DeleteObject(hFont);	// これ一回でええんか？

	::DeleteDC(hdc);	//	これ最後にせんとあかんで！(by TearDrop_Stone)

	return 0;
}

// @yo2 0x0052fb90 cg
void	CFont::TextOut(HDC hdc,int x,int y,const wstring& s){	//	[Konami] wide: TextOutW/wcslen

	//	文字列が設定されていなければ帰る
	if (m_String.empty()) return ;

	//	最大の利点は、文字列中に\nを埋め込むことで改行が出来ることである。

	WCHAR buf[256];
	LPCWSTR p = s.c_str();
	LPWSTR q=buf;
	for(;;){
		*q = *(p++);
		if (*q==L'\n') {
			*q=0;	// 改行コードならば潰す 
			::TextOutW(hdc,x,y,buf,wcslen(buf));
			y+=m_nHeight;
			q=buf;
			continue;	//	このときはqを加算されては困る
		} else if (*q==L'\0') {
			::TextOutW(hdc,x,y,buf,wcslen(buf));
			break;	// これにて終了～
		}
		q++;
	}
}

