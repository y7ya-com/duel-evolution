//
//	yaneTextDraw.h
//

#ifndef __yaneTextDraw_h__
#define __yaneTextDraw_h__

#include "yaneDIB32.h"
#include "yanePlane.h"
#include "yaneFastPlane.h"
#include "yanePlaneBase.h"
#include "yaneFont.h"

//	描画コンテキスト
class CTextDrawContext {
public:

	CTextDrawContext(void);
	virtual ~CTextDrawContext();

	friend class CTextDrawBase;

	//////////////////////////////////////////////////
	//	ユーザーが事前に設定すべき値

	void	SetBaseFontSize(int nFontSize); //	ベースフォントサイズ
	void	SetTextPtr(LPCWSTR lpszText);	//	[Konami] text is wide (LPCWSTR)
	//	ベースフォントサイズの設定、メモリに読み込んだテキスト位置設定には↑を使う。
	//	それ以外は↓を直接設定すること。

	int		m_nWidth;			//	最大で表示する横幅
	int		m_nBlankHeight;		//	行間
	int		m_nBlankHeight2;	//	空行の高さ
	int		m_nHInterval;		//	文字と文字との間隔
	COLORREF m_rgbColorBk;		//	バックの文字の色(ディフォルトではCLR_INVALIDなので描画できない)
	int		m_nIndent;			//	[Konami] indent of the first line in UpdateText (default 0) (name is ours)

	int		m_nBaseSize;		//	基準となるフォントサイズ
	//		⇒これを設定するときは、直接変更せず、SetBaseFontSizeを使うこと
								//	font +1は↑の1.5倍。+2は2倍。+3は3倍。+4は4倍。
								//	font -1は↑の1/1.5倍。-2は1/2倍。-3は1/3倍。-4は1/4倍。

	//	文脈(タグ)によって自動的に設定される値
	int		m_nFontNo;			//	フォントナンバー
	int		m_nFontSize;		//	フォントサイズ
	COLORREF m_rgbColor;		//	文字の色
	
	//	<FONT>タグのネストのためにvectorです＾＾(stackでもいいけど)
	vector<int>		 m_nFontNoOld;		//	</font>で戻すべきフォントナンバー
	vector<int>		 m_nFontSizeOld;	//	</font>で戻すべきフォントサイズ
	vector<COLORREF> m_rgbColorOld;		//	</font>で戻すべき文字色

	bool	m_bBold;			//	太字
	bool	m_bItalic;			//	イタリック体
	bool	m_bUnderLine;		//	アンダーライン
	bool	m_bStrikeOut;		//	取り消し線
	int		m_nAlign;			//	0:左寄せ(通常) 1:センター 2:右寄せ
	int		m_nAlign2;			//	0:下寄せ(通常) 1:センター 2:上寄せ
	int		m_nLineNo;			//	ラインナンバー

	//	ルビ文字も非サポート（折り返し処理が大変なため＾＾；）

	//////////////////////////////////////////////////
	//	現在のコンテクスト位置を返す
	LPCWSTR	GetTextPtrNow(void) { return m_lpStr; }	//	[Konami] wide

protected:
	int		m_nLangMode;		//	[Konami] text language for GetNextMoji (name is ours)
							//	0:auto(by GetSystemDefaultLangID) 1:<LJ> Japanese 2:<LA> ASCII 3:<LK> Korean
							//	reset to 0 at every line/paragraph end
	LPCWSTR	m_lpStr;			//	[Konami] wide			//	現在のコンテクスト位置
	LPCWSTR	m_lpTextAdr;		//	[Konami] wide		//	←ファイルをオープンしたら、SetTextPtrでそのメモリ位置を与えること

	int		GetTextOffset(void);		//	現在のテキスト解析位置を返す
	void	SetTextOffset(int nPos);	//	現在のテキスト解析位置を設定する
										//	↑ただし、事前にSetTextPtrを行なっていなくてはならない。
										//	また、これで設定しても、そこまでを実際に解析するわけではないので
										//	message,VDATA等については設定されない
										//	指定位置に進める必要があるならばCTextDrawBase::SetTextOffsetを使ってね

};

typedef auto_vector_ptr<RECT> VRECTS;
class CSpriteChara;
class SSprite;


//	<If n>～<Endif>タグに対するリスナ
class CScenarioIfListener {
public:
	virtual bool Abstract_If(int nNo) = 0;
	//	⇒　これをオーバーライドして、nNoに対する真偽判定を返す関数を書く。
	virtual ~CScenarioIfListener() {}
};


class CTextDrawBase {
public:
	 // 描画コンテキストの設定と取得
	void	SetContext(const CTextDrawContext& context){ m_context_now = context; }
	CTextDrawContext* GetContext(void) { return& m_context_now; }

	//	テキスト位置を設定・取得する
	int		GetTextOffset(void) { return m_context_now.GetTextOffset(); }
	LRESULT SetTextOffset(int nPos);

	//	未知のタグを飛ばす(default:飛ばす)
	void	SkipUnknownTag(bool bSkip) { m_bSkipUnknownTag = bSkip; }

	//	描画コンテキストに基づいてテキストDIBの更新
	//	(antialiasされているので、Alpha系のBltを使って描画すること)
	LRESULT UpdateText(bool bDraw=true);	//	<HR>まで
	//	m_context_now～を描画する。m_context_nowは変更しない。m_context_nextを変更する。
	//	bDraw==falseならば描画なしに終了する
	LRESULT UpdateTextFast(void);			//	<HR>まで
	//	上のとほぼ同じ仕様だが、空読み(文字位置等を確定させない)ので、高速である。
	//	GetRectsで得られる情報は嘘である。

	//	Update後、以下の関数が有効になる
	CTextDrawContext* GetNextContext(void) { return& m_context_next; }
	void	SetNextContext(CTextDrawContext&v) { m_context_next = v; }
	void	GoNextContext(void) {
		m_context_now = m_context_next;
	} // 次の段落へ
	VRECTS* GetRects(void) { return& m_vRects; }
	vector<int>* GetVData(void) { return& m_vData[0]; }
	vector<LPCWSTR>* GetTagList(void) { return &m_vTagList; }	//	[Konami] wide
	LPSTR	GetComment(void) { return& m_szUserMes[0]; }
	vector<int>* GetSelectTag(void) { return& m_vSelectTag; }

	//	禁則処理の有効化(ディフォルトで無効==empty)
	//	ここで禁則処理する文字列を設定する
	void	SetProhibitString(string sz) { m_szProhibition = sz; }

	//	グレーカラー表示（バックログの表示等に使うと便利）
	bool*	GetGrayColorFlag(){ return &m_bGrayColor;}	//	グレーカラー表示は有効なのか？
	COLORREF*	GetGrayColor() { return &m_rgbGrayColor; }		//	この色で表示する
	COLORREF*	GetGrayColorBk() { return &m_rgbGrayColorBk; }	//	文字の影の色

	//	外字の設定
	void	SetGaiji(smart_ptr<CSpriteChara> v) { m_vGaiji = v; }
	smart_ptr<CSpriteChara> GetGaiji() { return m_vGaiji; }

	//	置換文字列の設定
	void	SetRepString(smart_ptr<vector<string> > v) { m_vRepString = v; }
	smart_ptr<vector<string> > GetRepString() { return m_vRepString;}

	//	インデントのための配列の設定
	int*	GetIndent() { return & m_anIndent[0]; }

	//　縦書き設定
	void	SetVertical(bool bVertical = true) { m_bVertical = bVertical; }	//　縦書きに設定する
	bool	IsVertical() { return m_bVertical; }

	//	<if n> ～ <endif>用の条件判定Listenerを渡す
	smart_ptr<CScenarioIfListener> GetScenarioIfListener() { return m_vScenarioIfListener; }
	void	SetScenarioIfListener(smart_ptr<CScenarioIfListener> v) { m_vScenarioIfListener = v; }

	//	DIB,Planeの取得は、派生クラス側で行なう
	virtual CPlaneBase* GetPlaneBase(void) = 0;

	CTextDrawBase(void);
	virtual ~CTextDrawBase();

protected:
	//	サポート用の関数
	class CLineInfo {
	public:
		CLineInfo(void) { Reset();}
		void Reset(void) { cx=cy=sx=0; } 
		int sx;		//	開始座標(align補整込み)
		int cx,cy;	//	そのラインのサイズ
	};

	LRESULT GetRect(RECT&rc);
	//	m_context_nextに基づき、次の文字Rectを求める。
	//	（m_context_nextは、その文字分だけ進むことになる）
	//	返し値は、改行ならば 1,水平線ならば2。ファイル終端ならば3。
	//	正常終了ならば0。
	bool	m_bGaiji;	//	この関数呼び出し後、外字のときは、これがtrueになる

	LRESULT GetNextMoji(DWORD&dwMoji);
	//	m_context_nextに基づき、次の文字を取得。
	//	その間に、コンテキストの変更があればそれらはm_context_nextに反映される
	//	返し値は、改行ならば 1,水平線ならば2。ファイル終端ならば3。
	//	正常終了ならば0。

	//	派生クラスでオーバーライドしてね
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji)=0;	//	現在のコンテキストに基づいて文字を描画する
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos)=0;	//	RECTの最終調整が行える
	virtual void CreateSurface(int x,int y)=0;					//	プレーンの生成
	//	外字の表示のための仮想関数
	// @yo2 0x0057a810 vt
	virtual void OnDrawSprite(SSprite*,int x,int y){}
	//	また、CDIB32A系であれば、非ヌキ部分に対してα値をffで埋める必要がある..

	//	コンテキストに基づいて文字をCFontに設定する
	void	SetContext(CFont&font,const CTextDrawContext& context,LPCWSTR lpStr);	//	[Konami] wide

private:
	//	CStringScannerに委譲＾＾；
	//	[Konami] all helpers take wide strings (CStringScanner wide overloads)
	bool	IsToken(LPCWSTR &lp,LPCWSTR lp2);	//	トークンチェック
	//	一致後は、その分だけlpは前進する
	LRESULT SkipTo(LPCWSTR &lp,LPCWSTR lp2);	//	指定トークンまで読み飛ばし
	//	一致後は、その分だけlpは前進する。'\0'に出くわしたら非0が返る
	LRESULT SkipTo2(LPCWSTR &lp,LPCWSTR lp2,LPWSTR lp3); //	指定トークンまで読み飛ばし
	//	一致後は、その分だけlpは前進する。'\0'に出くわしたら非0が返る
	//	lp3(bufは呼び出し側で用意すること)には、スキップするまでの文字列が入る
	LRESULT SkipSpace(LPCWSTR &lp);	//	スペース、タブ、改行を切り詰める
	//	'\0'に出くわしたら非0が返る
	LRESULT GetStrNum(LPCWSTR &lp,int& nRate);
	//	"+1"という文字列ならばnRateには1が返る
	LRESULT GetNum(LPCWSTR &lp,int& nVal);
	//	+1という文字列ならばnRateには1が返る
	LRESULT GetStrColor(LPCWSTR &lp,COLORREF& nFontColor);
	// "#ff0000"という文字列ならばRGB(255,0,0)が返る

	LPCSTR	m_lpszNext;
	CTextDrawContext m_context_now;
	CTextDrawContext m_context_next;

	VRECTS	m_vRects;			//	描画（した）矩形集合

	vector<int> m_vData[16];	//	隠しタグVDATA(<VDATA="n,1,2,3,..">のように書く)の値
	vector<LPCWSTR> m_vTagList;	//	[Konami] wide (never filled any more: unknown tags are no longer skipped)	//	検出した未知のタグリスト
	CHAR	m_szUserMes[256];	//	ユーザーメッセージ用バッファ<!>タグで埋めることが出来る。
	//	↑これ便利なので使ってね＾＾
	bool	m_bSkipUnknownTag;	//	未知のタグをskipする
	int		m_nIndentForBracket;//	２行目以降を括弧のためにインデントするか？
	//	（インデントする文字数が入る）
	int		m_anIndent[16];		//	16個分のインデントを入れることが出来る＾＾；	//	<IndentForBracket -n>で指定する。n-1の要素が参照される

	vector<int>	m_vSelectTag;	//	<Select n>で囲まれているタグが、何文字目にあかを検出する
	//	あいう<Select 1>えお</Select 1>とあれば、m_vSelectTag[2]=3 と [3]=5
	//	が代入される。Selectタグが使われていなければ、m_vSelectTag.size() == 0


	bool	IsProhibitMoji(DWORD dwMoji);	//	禁則文字列かどうかを調べる
	bool	IsProhibit(void) { return m_szProhibition.empty(); } // 禁則処理中か？
	string	m_szProhibition;	//	禁則文字列
	DWORD	m_dwMojiBuffer;		//	禁則処理のために次行に押し出された文字
	LRESULT m_lrMojiBuffer;		//	その時の帰り値

	DWORD	m_dwMojiLast;		//	GetRectしたときの文字列

	//	グレーカラー表示（バックログ表示用）
	bool		m_bGrayColor;		//	グレーカラー表示は有効なのか？
	COLORREF	m_rgbGrayColor;		//	この色で表示する
	COLORREF	m_rgbGrayColorBk;	//	文字の影の色

	//	外字処理
	smart_ptr<CSpriteChara> m_vGaiji;	//	外字（実体はCSpriteChara）

	//	置換文字列
	LPCWSTR		m_lpRepString;	//	[Konami] wide				//　のためのポインタ
	smart_ptr<vector<string> >	m_vRepString;	//　置換文字列群

	bool	m_bVertical;	//　縦書きかどうか

	//	条件タグ(<if n>～<endif>)
	smart_ptr<CScenarioIfListener> m_vScenarioIfListener;

};

#ifdef USE_DIB32
//	CDIB32版
class CTextDrawDIB32 : public CTextDrawBase {
public:
	CDIB32* GetDIB() { return &m_dib; }
protected:
	virtual CPlaneBase* GetPlaneBase(void) { return &m_dib; }
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
	virtual void CreateSurface(int x,int y) { m_dib.CreateSurface(x,y); }
	virtual void OnDrawSprite(SSprite*,int x,int y);
	CDIB32	m_dib;
};

//	CDIB32によるアンチェリ付きバージョン
class CTextDrawDIB32A : public CTextDrawDIB32 {
protected:
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
	virtual void CreateSurface(int x,int y) { m_dib.CreateSurface(x,y); *m_dib.GetYGA() = true; }
	//	YGA画像と設定することにより、BltNaturalでBlendBltFastAlphaが選択されるようにしておく
	virtual void OnDrawSprite(SSprite*,int x,int y);
};

//	CDIB32による精細なアンチェリ付きバージョン（遅い＾＾；）
class CTextDrawDIB32AA : public CTextDrawDIB32A {
protected:
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
};
#endif // USE_DIB32

#ifdef USE_DirectDraw
//	CPlane版
class CTextDrawPlane : public CTextDrawBase {
public:
	CPlane* GetPlane() { return &m_plane; }
protected:
	virtual CPlaneBase* GetPlaneBase(void) { return &m_plane; }
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
	virtual void CreateSurface(int x,int y) { m_plane.CreateSurface(x,y); }
	virtual void OnDrawSprite(SSprite*,int x,int y);
	CPlane	m_plane;
};
#endif // USE_DirectDraw

#ifdef USE_FastDraw
//	CFastDraw版
class CTextDrawFastPlane : public CTextDrawBase {
public:
	CFastPlane* GetFastPlane() { return &m_plane; }
protected:
	virtual CPlaneBase* GetPlaneBase() { return &m_plane; }
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
	virtual void CreateSurface(int x,int y) { m_plane.CreateSurface(x,y,false); }
	virtual void OnDrawSprite(SSprite*,int x,int y);
	CFastPlane	m_plane;
};

//	CFastDrawによるアンチェリ付きバージョン
class CTextDrawFastPlaneA : public CTextDrawFastPlane {
protected:
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
	virtual void CreateSurface(int x,int y) { m_plane.CreateSurface(x,y,true);}
	//	YGA画像と設定することにより、BltNaturalでBlendBltFastAlphaが選択されるようにしておく
	virtual void OnDrawSprite(SSprite*,int x,int y);
};

//	CFastDrawによる精細なアンチェリ付きバージョン（遅い＾＾；）
class CTextDrawFastPlaneAA : public CTextDrawFastPlaneA {
protected:
//	virtual void OnDrawText(const CTextDrawContext&,int x,int y,DWORD moji);
	virtual void OnDrawText(const CTextDrawContext&,DWORD moji,LPRECT lpDrawPos);
};
#endif // USE_FastDraw


#endif
