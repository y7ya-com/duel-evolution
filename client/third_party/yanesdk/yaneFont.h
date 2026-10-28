//	yaneFont.h :
//
//		Font Wrapper
//

#ifndef __yaneFont_h__
#define __yaneFont_h__

class CFont {
public:

	//	set text & drawing
	//	[Konami] text is a wide string: SetText takes wstring/LPWSTR, GetText returns LPCWSTR
	void	SetText(const wstring& s);	// 表示文字列の指定（\nで改行が使用できる）
	void	__cdecl SetText(LPWSTR fmt, ... );	//	↑と同じ。printf出力書式が使える。
										//	ただしbufは512文字まで
	void	SetText(int i);				//	数字を表示文字列として指定
	LPCWSTR	GetText() { return m_String.c_str(); }

	LRESULT	GetSize(int& sx,int& sy);	//	描画サイズを得る
	void	OnDraw(HDC hdc,int x=0,int y=0);//	HDCを渡して、そこに描画してもらう

	//	property
	void	SetQuality(int nQuality);	//	フォントクオリティ				(0）
	int		GetQuality() const { return m_nQuality; }

	void	SetSize(int nSize);			// Fontサイズをpt数で指定			(16)
	int		GetSize() const { return m_nSize; }

	void	SetColor(COLORREF rgb);		// テキストカラー指定				(255,255,255)
	COLORREF GetColor() const { return m_nRgb; }

	void	SetBackColor(COLORREF rgb);	// 文字の影つけ						(64,64,64)
	COLORREF GetBackColor() const { return m_nBkRgb; }

	void	SetBGColor(COLORREF rgb);	// 背景色							(CLR_INVALID)
	COLORREF GetBGColor() const { return m_nBGRgb; }

	void	SetHeight(int nHeight);		// 次行までの行間					(20)
	int		GetHeight() const { return m_nHeight; }

	void	SetFont(int nFontNo);		// フォントセレクト（番号で）		(0) : MSゴシック
	void	SetFont(const string& fontname);	// フォントセレクト（フォント名で）
	LPCSTR	GetFont(void) { return m_FontName.c_str(); }
	void	SetWeight(int nWeight);		// 文字の太さ						(300:FW_LIGHT) , FW_BOLDは700
	void	SetItalic(bool b);			// 斜体								(false)
	void	SetUnderLine(bool b);		// 下線の有無						(false)
	void	SetStrikeOut(bool b);		// 打ち消し線の有無					(false)
	void	SetShadowOffset(int nOx,int nOy); // 影のオフセット				(2,2)
	void	GetShadowOffset(int &nOx,int &nOy) const { nOx=m_nShadowOffsetX; nOy=m_nShadowOffsetY; }


	CFont();
	virtual ~CFont();

protected:
	wstring	m_String;			//	[Konami] was string			//	表示する文字列
	int		m_nQuality;			//	フォントクオリティ
	COLORREF m_nRgb;			//	文字色
	COLORREF m_nBkRgb;			//	文字の影
	COLORREF m_nBGRgb;			//	背景色
	int		m_nSize;			//	選択されているフォントサイズ
	string	m_FontName;			//	選択されているフォント名
	int		m_nHeight;			//	次の行までの距離
	int		m_nWeight;			//	文字の太さ
	bool	m_bItalic;			//	斜体
	bool	m_bUnderLine;		//	下線
	bool	m_bStrikeOut;		//	打ち消し線

	int		m_nShadowOffsetX;	//	影のオフセットX座標
	int		m_nShadowOffsetY;	//	影のオフセットY座標

	int		m_nCharSet;			//	[Konami] CreateFont charset, set by SetFont(int) (name is ours)

	//	Auxiliary
	void	TextOut(HDC hdc,int x,int y,const wstring& s);	//	[Konami] wide
};

#endif