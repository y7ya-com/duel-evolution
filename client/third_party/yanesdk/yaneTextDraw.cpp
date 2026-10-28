#include "stdafx.h"
#include  <mbctype.h> // _ismbblead
#include "yaneTextDraw.h"
#include "yaneTextPlane.h"
#include "yaneTextDIB32.h"
#include "yaneStringScanner.h"
#include "yaneSpriteChara.h"
#include "yaneDIB32Effect.h"

// @yo2 0x0057a430 review
CTextDrawContext::CTextDrawContext(void){
	m_nFontNo	= 0;
	m_nBaseSize	= 28;
	m_nFontSize	= m_nBaseSize;
	m_bBold		= false;
	m_bItalic	= false;
	m_bUnderLine= false;
	m_bStrikeOut= false;
	m_rgbColor	= RGB(255,255,255);
	m_rgbColorBk= CLR_INVALID;	//	影はいらねーや！
	m_nWidth	= 640;
	m_nBlankHeight	= 2;							//	行間
	m_nBlankHeight2 = m_nBaseSize+m_nBlankHeight;	//	空行高さ
	m_nLineNo	= 1;
	m_nAlign	= 0;
	m_nAlign2	= 0;
	m_nHInterval= 4; // 文字と文字との間隔
	m_lpTextAdr = m_lpStr = NULL;
	m_nIndent	= 0;	//	[Konami]
	m_nLangMode = 0;	//	[Konami]
}

// @yo2 0x0057a500 manual
CTextDrawContext::~CTextDrawContext(){	//	merely place holder
}

// @yo2 0x0057a580 review
void	CTextDrawContext::SetBaseFontSize(int nFontSize){
	m_nBaseSize	= nFontSize;
	m_nFontSize	= m_nBaseSize;
	m_nBlankHeight2 = m_nFontSize+m_nBlankHeight;	//	空行高さ
}

// @yo2 0x0057a5b0 review
void	CTextDrawContext::SetTextPtr(LPCWSTR lpszText){	//	[Konami] wide
	m_lpTextAdr = m_lpStr = lpszText;
}

// @yo2 0x0057a5d0 review
int		CTextDrawContext::GetTextOffset(void){
	//	現在のテキスト解析位置を返す
	return m_lpStr - m_lpTextAdr;
}

// @yo2 0x0057a5f0 review
void	CTextDrawContext::SetTextOffset(int nPos){
	//	現在のテキスト解析位置を設定する
	m_lpStr = m_lpTextAdr + nPos;
}

	//////////////////////////////////////////////////////////////

// @yo2 0x0057a610 review
CTextDrawBase::CTextDrawBase(void){
	*m_szUserMes = '\0';
	m_bSkipUnknownTag = true;	//	未知のタグを飛ばす

	m_dwMojiBuffer = 0;			//	禁則処理で発生するヒステリシスを吸収する
	m_lrMojiBuffer = 0;

	m_bGrayColor= false;
	m_rgbGrayColor=RGB(128,128,128);
	m_rgbGrayColorBk=CLR_INVALID;
	m_lpRepString = NULL;
	ZERO(m_anIndent);

	m_bVertical = false;
}

// @yo2 0x0057a900 vt
CTextDrawBase::~CTextDrawBase(){
}

// @yo2 0x0057ab50 tight
LRESULT	CTextDrawBase::UpdateTextFast(void){
	//	m_context_nowをベースに<HR>までのサイズを計算する
	m_context_next = m_context_now;
	CTextDrawContext& context = m_context_next;
	m_vRects.clear();	//	一応クリアしといたるわ！＾＾；
	m_vTagList.clear();

	DWORD dwMoji;
	LRESULT lr;

	while ((lr = GetNextMoji(dwMoji))){
		if (lr==1) continue; // 改行
		if (lr==2) break;	 // <HR>
		if (lr!=0) return lr; // error
	}
	return 0;
}

// @yo2 0x0057ad70 cg
LRESULT	CTextDrawBase::UpdateText(bool bDraw /* =true */ ){
	//	m_context_nowをベースに<HR>までのサイズを計算する
	m_context_next = m_context_now;
	CTextDrawContext& context = m_context_next;

	RECT rc;
	LRESULT lr;
	CLineInfo lineinfo;
	int nAlign;

	//	これ入れておかないとサーフェースが作られないときにまずい
	m_vTagList.clear();

	m_nIndentForBracket = 0;

	//	描画矩形のクリア
	m_vRects.clear();
	m_vSelectTag.clear();
	//	外字であるのか
	vector<bool> abGaiji;
	//	縦方向のアライン情報
	vector<int>	 anAlign;

	int nStartRect=0;
	int nHeight=0;	//	生成するDIBの高さ
	int nWidthMax=0;

	int nIndent = context.m_nIndent;	//	[Konami] first line indent (was 0)
	bool bProhibit = false; // その行の禁則処理は２度目か？
	while (true){
		nAlign = context.m_nAlign;
		lr = GetRect(rc);
		bool bProhi = IsProhibitMoji(m_dwMojiLast);

		//	行が折り返すべき位置まで来ているか？
		bool bOver = nIndent + lineinfo.cx + rc.right > context.m_nWidth;
		if (lr==0 && bOver && bProhi && !bProhibit){
			//	禁則文字列ならば１回だけならラインオーバーして入ってきても良い

			//	（次の文字が禁則文字で無いのならば禁則処理を行なう）
			DWORD dwNextMoji;
			LRESULT lr = GetNextMoji(dwNextMoji);
			{	//	ヒステリシス吸収バッファにrejectする
				if (lr!=0) dwNextMoji = -1;
				m_dwMojiBuffer = dwNextMoji;
				m_lrMojiBuffer = lr;
			}
			if ((lr!=0) || !IsProhibitMoji(dwNextMoji)){
				bOver = false;
				bProhibit = true;
			}
		}
		if (bOver
				 || lr==1 || lr==2) {	//	行あふれ
			bProhibit = false;

			switch (nAlign) {
				//	行からはみ出した文字の一文字前の位置における
				//	コンテクストのアライン情報に基づいてインデントを施す
			case 0 : lineinfo.sx =	nIndent + 0; break;
			case 1 : lineinfo.sx = (context.m_nWidth - lineinfo.cx)>>1; break;
			case 2 : lineinfo.sx =	context.m_nWidth - lineinfo.cx; break;
			}
			//	行の位置関係が定まったので、補整を行なう
			int nLeft = lineinfo.sx;
			for(int i=nStartRect;i<m_vRects.size();i++){
				//	マージンは、ラインで指定されたマージンに準拠
				int nW = m_vRects[i]->right;

				m_vRects[i]->left	+= nLeft;
				m_vRects[i]->right	+= nLeft;
				
				if (m_vRects[i]->right > nWidthMax) nWidthMax = m_vRects[i]->right;
				//	禁則で追い出された文字があるので、最大幅はここで計算せねばならない

				nLeft += nW +(context.m_nHInterval-4); // かぶりがあるので＾＾；

		/*
			nHeight は、その行の上部
			lineinfo.cyは、その行高さ
		*/
				if (!IsVertical()) {
					// 横書き
					switch (anAlign[i]) {
					case 0: {
						//	高さはベースラインに準拠
						m_vRects[i]->top	+= nHeight + lineinfo.cy-m_vRects[i]->bottom;
						m_vRects[i]->bottom	 = nHeight + lineinfo.cy;
							} break;
					case 1: {
						//	高さはセンタリング
						int nH = (lineinfo.cy -m_vRects[i]->bottom)/2;
						m_vRects[i]->top	+= nHeight + nH;
						m_vRects[i]->bottom	 = nHeight + lineinfo.cy -nH;
							} break;
					case 2: {
						//	高さは上寄せで
						m_vRects[i]->top	+= nHeight;
						m_vRects[i]->bottom	 = nHeight + m_vRects[i]->bottom;
							} break;
					}
				} else {
					// 縦書きの時は逆になる
					switch (anAlign[i]) {
					case 0: {
						//	高さは上寄せで
						m_vRects[i]->top	+= nHeight;
						m_vRects[i]->bottom	 = nHeight + m_vRects[i]->bottom;
							} break;
					case 1: {
						//	高さはセンタリング
						int nH = (lineinfo.cy -m_vRects[i]->bottom)/2;
						m_vRects[i]->top	+= nHeight + nH;
						m_vRects[i]->bottom	 = nHeight + lineinfo.cy -nH;
							} break;
					case 2: {
						//	高さはベースラインに準拠
						m_vRects[i]->top	+= nHeight + lineinfo.cy-m_vRects[i]->bottom;
						m_vRects[i]->bottom	 = nHeight + lineinfo.cy;
							} break;
					}
				}

				//	位置、補正しとこか＾＾；
				m_vRects[i]->right -= 4;

				//	外字に対する最終調整
				if (abGaiji[i]) m_vRects[i]->right+=2;
			
			}
			nStartRect = m_vRects.size();
			if (lineinfo.cy!=0) {
				nHeight += lineinfo.cy + context.m_nBlankHeight;
			} else {
				if (lr!=2) {
					//	なんでい！空行かよ！
					nHeight += context.m_nBlankHeight2;
				}
			}
			lineinfo.Reset();
			if (m_nIndentForBracket) {
				//	インデントのために次行以降の幅を縮めておく
				nIndent = (rc.right + context.m_nHInterval-4)* m_nIndentForBracket;
				m_nIndentForBracket = 0;
			} else {
				nIndent = 0;	//	[Konami] only the first line is indented
			}
		}
		if (lr==1) continue; // 改行
		if (lr==2) break;	 // 最終ライン終了 
		if (lr!=0) return lr; // error

		lineinfo.cx+=rc.right + (context.m_nHInterval-4);

		if (!m_bGaiji) {
			if (lineinfo.cy < rc.bottom) lineinfo.cy = rc.bottom;	// サイズ加算
		} else {
			//	外字用に行間の補正
			if (lineinfo.cy < rc.bottom+2) lineinfo.cy = rc.bottom+2;	// サイズ加算
		}

		//	もし、外字ばかりであるなどの理由により、通常テキストより小さい行幅であるならば補正する
		if (lineinfo.cy < context.m_nBlankHeight2) lineinfo.cy = context.m_nBlankHeight2;

		//	矩形情報を保存する
		auto_ptrEx<RECT> lpRect(new RECT);
		*lpRect = rc;
		m_vRects.insert(lpRect);
		abGaiji.push_back(m_bGaiji);
		//	アライン情報も保存
		anAlign.push_back(context.m_nAlign2);
	}

	if (!bDraw) return 0;	//	描画しないなら、ここで終了

	if (nHeight == 0 || nWidthMax == 0) {
		//	return -1; // サイズおかしいやん...
		m_vRects.clear();
		CreateSurface(1,1);	//	size 1×1のDIBをダミーで作成
		return 0;
	}


//----------------------------追加
	// 縦書きのための座標変換
	if (IsVertical()) {
		// 幅と高さを入れ替え
		swap(nWidthMax, nHeight);
	}
//----------------------------


	//	これで各列の情報が求まった。これに基づいてDIBを作成する
	CreateSurface(nWidthMax,nHeight);	//	サーフェース完成～

	//	コンテクストを引き戻して、再スキャンして文字配置
	m_context_next = m_context_now;
	m_vTagList.clear();
//	m_vSelectTag.clear();

	auto_vector_ptr<RECT>::iterator it = m_vRects.begin();
	while (true) {
		//	↑終了チェックは、ここで行なわず、lr==2で行なう。
		DWORD dwMoji;
		lr = GetNextMoji(dwMoji);
		if (lr==2) break;
		if (lr==1) continue;
		if (lr!=0) return lr; // ありえないが...

//----------------------------追加
		//	縦書きのための座標変換
		if (IsVertical()) {
			const int left	= (*it)->left;	// バックアップ^^
			(*it)->left		= nWidthMax-(*it)->bottom;	// 縦書きの行は右→左
			(*it)->bottom	= (*it)->right;
			(*it)->right	= nWidthMax-(*it)->top;		// 縦書きの行は右→左
			(*it)->top		= left;
		}
//----------------------------

		//	---　外字の処理
		int nGaiji = -((int)dwMoji) - 1;
		if (nGaiji >= 0) {
			if (m_vGaiji->GetSpriteMax() <= nGaiji) {
				return 1; // 範囲外の外字
			}
			//	スプライトは、アニメーションがあろうと、先頭ので良い
			SSprite* lpSp = m_vGaiji->GetSprite()[nGaiji].GetSSprite(0);
			// そのスプライトを表示
			OnDrawSprite(lpSp,(*it)->left,(*it)->top);
			//	このスプライト、Contextに応じて拡大すべきのような気もするが？
			//	また、CDIB32A系であれば、非ヌキ部分に対してα値をffで埋める必要がある..

		} else {
		//	通常の描画
			//OnDrawText(m_context_next,(*it)->left,(*it)->top, dwMoji);
			OnDrawText(m_context_next, dwMoji, *it);	//	OnDrawTextでRECTの最終調整が行われる
		}
		it++;
	}
	return 0;
}

// @yo2 0x0057b720 cg
bool	CTextDrawBase::IsProhibitMoji(DWORD dwMoji){
	//	禁則文字のひとつか？
	if (m_szProhibition.empty()) return false;	//	禁則処理を行なわない？

	LPCSTR lp = m_szProhibition.c_str();
	while (*lp!='\0'){
		DWORD dw = (DWORD)*((BYTE*)lp++);
//		if ((dw >=0x80 && dw<=0xa0) || (dw>=0xe0 && dw<=0xff)) {
		if (_ismbblead(dw)){
			//	漢字の１バイト目らしい
			dw |= (DWORD)*(lp++) << 8;
		}
		if (dw == dwMoji) return true;	//	禁則文字に一致した
	}
	return false;
}

// @yo2 0x0057b7a0 feat
LRESULT	CTextDrawBase::GetRect(RECT&rc){
	LRESULT lr;
	m_bGaiji = false;
	lr = GetNextMoji(m_dwMojiLast);
	//	もし必要ならばこのm_dwMojiLastを介してアクセスすること
	if (lr!=0) return lr;
	//	m_context_nextに基づき、フォントを作成。
	//	その後、m_dwMojiLastの文字のRECTを求めれば良い

	//	外字なの？
	int nGaiji = -((int)m_dwMojiLast) - 1;
	if (nGaiji >= 0) {
		if (m_vGaiji->GetSpriteMax() <= nGaiji) {
			return -1; // 範囲外の外字
		}
		//	スプライトは、アニメーションがあろうと、先頭ので良い
		SSprite* lpSp = m_vGaiji->GetSprite()[nGaiji].GetSSprite(0);
		// そのスプライトのスプライト矩形サイズをコピー
		::SetRect(&rc,0,0,lpSp->rcRect.right - lpSp->rcRect.left+2,lpSp->rcRect.bottom - lpSp->rcRect.top);
		//	文字になぞらえて横サイズ+2しとこか＾＾；
		m_bGaiji = true;
		return 0;
	}

	CTextDrawContext& context = m_context_next;
	CFont f;
	SetContext(f,context,(LPCWSTR)&m_dwMojiLast);	//	[Konami] wide

	const string font_name(f.GetFont());
	if (!IsVertical()) {	//	横書きの場合
		//	横書きの時は追加処理なし
	} else {				//	縦書きの場合
		if (!font_name.empty() && font_name[0]=='@') {
			//	元から縦書きフォントだから何もしない
		} else {
			//	一時的に縦書きフォントに変更する
			f.SetFont('@'+font_name);
		}
		//	↑このようにフォントを縦書き用に変更しておかないと、
		//	　ただx,yを入れ替えるだけとかでは半角文字(縦にならない文字)が正しく表示されない
	}
	int x,y;
	if (f.GetSize(x,y)!=0) return -1;
	::SetRect(&rc,0,0,x,y);

	//	フォントを元に戻す
	f.SetFont(font_name);

	return 0;
}

// @yo2 0x0057bb00 tight
LRESULT	CTextDrawBase::SetTextOffset(int nPos){
	m_context_next = m_context_now;
	m_context_next.SetTextOffset(0);	//	reset
	DWORD dwMoji;
	while (m_context_next.GetTextOffset()<nPos)
		if (GetNextMoji(dwMoji)==3) return 1;
	m_context_now = m_context_next;
	return 0;
}

//	独自に作ったHTML風言語＾＾；の解析
// @yo2 0x0057be50 feat
LRESULT CTextDrawBase::GetNextMoji(DWORD&dwMoji){
	//	返し値は、改行ならば 1,水平線ならば2。ファイル終端ならば3。
	//	正常終了ならば0。

	//	dwMojiは、外字ならばマイナスの値。

	//	[Konami] rewritten:
	//	- the text is wide (LPCWSTR); each WCHAR is read as a byte ((BYTE)*lpSrc)
	//	- end of text now returns 2 (was 3), like <HR>
	//	- removed tags: <!-- -->,<head>,<html>,<body>,<U>,<S>,<I>,<P>,<P align=>,
	//	  <VDATA=>,<IndentForBracket>,<GAIJI>,<ReplaceString>,<Bottom>,<Middle>,<Top>,
	//	  <if>/<else>/<endif>, <FONT face=> and the skipping of unknown tags
	//	  (m_vTagList is no longer filled)
	//	- added language tags <LJ> <LA> <LK> (context.m_nLangMode) that control how a
	//	  double-byte character is decoded, see below
	//	- context.m_nLangMode is reset to 0 whenever a line/paragraph/text ends

	CTextDrawContext& context = m_context_next;

	//	禁則文字列の差し戻しバッファ
	if (m_dwMojiBuffer != 0) {
		//	ヒステリシス処理
		dwMoji = m_dwMojiBuffer;
		m_dwMojiBuffer = 0;
		context.m_nLangMode = 0;	//	[Konami]
		return m_lrMojiBuffer;
	}

	/*
		もし置換文字列ならば、そいつを与える。
	*/
	if (m_lpRepString != NULL) {
		dwMoji = (BYTE)*(m_lpRepString++);	//	LPSTRは何とsignedなのだ＾＾；
		if (_ismbblead(dwMoji)){
			//	漢字の１バイト目らしい
			dwMoji |= (DWORD)((BYTE)*(m_lpRepString++)) << 8;
		}
		//	文字列終端に達したならば、そこで終わり！
		if (*m_lpRepString == L'\0') m_lpRepString = NULL;
		context.m_nLangMode = 0;	//	[Konami]
		return 0;
	}

	LPCWSTR& lpSrc = context.m_lpStr;

	//	最上位バイトが0であることを利用する
	while (true) {
		if (*lpSrc==L'\0') {
			context.m_nLangMode = 0;	//	[Konami]
			return 2;	//	[Konami] was 3
		}
		if (IsToken(lpSrc,L"<BR>"))	{	// break rule : 改行
			context.m_nLangMode = 0;	//	[Konami]
			return 1;
		}
		if (IsToken(lpSrc,L"</P>")) {	//	閉じタグは改行扱い
			context.m_nAlign = 0;
			context.m_nLangMode = 0;	//	[Konami]
			return 1;
		}
		if (IsToken(lpSrc,L"<HR>")) {	// horizontal rule : 水平線＝次の段落へ
			context.m_nLangMode = 0;	//	[Konami]
			return 2;	//	end of paragraph
		}
		if (IsToken(lpSrc,L"&lt;")) {	// これは <
			dwMoji = '<'; break;
		}
		if (IsToken(lpSrc,L"&gt;")) { // これは >
			dwMoji = '>'; break;
		}
		if (IsToken(lpSrc,L"&amp;")){ // これば &
			dwMoji = '&'; break;
		}
		//	[Konami] language tags
		if (IsToken(lpSrc,L"<LJ>")) {	//	Japanese (Shift-JIS)
			context.m_nLangMode = 1;
			continue;
		}
		if (IsToken(lpSrc,L"<LA>")) {	//	ASCII (no double-byte characters)
			context.m_nLangMode = 2;
			continue;
		}
		if (IsToken(lpSrc,L"<LK>")) {	//	Korean
			context.m_nLangMode = 3;
			continue;
		}
		//	[Konami] removed: <!-- -->, <head>, <html>, </html>, <body>, </body>
		if (IsToken(lpSrc,L"<B>")) {	// bold
			context.m_bBold = true;
			continue;
		}
		if (IsToken(lpSrc,L"</B>")) {// unbold
			context.m_bBold = false;
			continue;
		}
		if (IsToken(lpSrc,L"<FONT")){	//	font
			//	現在のフォント属性を保存する
			context.m_nFontNoOld.push_back(context.m_nFontNo);
			context.m_nFontSizeOld.push_back(context.m_nFontSize);
			context.m_rgbColorOld.push_back(context.m_rgbColor);

			while (true){
				if (SkipSpace(lpSrc)!=0) { context.m_nLangMode = 0; return 3; }	//	[Konami] resets m_nLangMode
				if (IsToken(lpSrc,L"size=")){
				//	サイズ指定
					int nRate;
					if (GetStrNum(lpSrc,nRate)!=0) { context.m_nLangMode = 0; return 3; }	//	"+1" => 1が返る
					switch (nRate){
					case -4: context.m_nFontSize = context.m_nBaseSize/4; break;
					case -3: context.m_nFontSize = context.m_nBaseSize/3; break;
					case -2: context.m_nFontSize = context.m_nBaseSize/2; break;
					case -1: context.m_nFontSize = context.m_nBaseSize*2/3; break;
					case  0: context.m_nFontSize = context.m_nBaseSize; break;
					case  1: context.m_nFontSize = context.m_nBaseSize*3/2; break;
					case  2: context.m_nFontSize = context.m_nBaseSize*2; break;
					case  3: context.m_nFontSize = context.m_nBaseSize*3; break;
					case  4: context.m_nFontSize = context.m_nBaseSize*4; break;
					default: context.m_nFontSize = context.m_nBaseSize*nRate;
					}
					continue;
				}
				if (IsToken(lpSrc,L"color=")){
				//	カラー指定
					if (GetStrColor(lpSrc,context.m_rgbColor)!=0) { context.m_nLangMode = 0; return 3; } // "#ff0000" => RGB(255,0,0)が返る
					continue;
				}
				//	[Konami] removed: face="ＭＳ ゴシック" etc.
				if (IsToken(lpSrc,L">")) break; // fontの終了記号
			}
			continue;
		}
		if (IsToken(lpSrc,L"</FONT>")) { // unfont
			if (context.m_nFontNoOld.empty()) {
				Err.Out("CTextDrawで<Font>の存在していない</Font>タグ");
				continue;
			}
			context.m_nFontNo = *context.m_nFontNoOld.rbegin();
			context.m_nFontNoOld.pop_back();
			context.m_nFontSize = *context.m_nFontSizeOld.rbegin();
			context.m_nFontSizeOld.pop_back();
			context.m_rgbColor = *context.m_rgbColorOld.rbegin();
			context.m_rgbColorOld.pop_back();
			continue;
		}
		//	[Konami] removed: <U> </U> <S> </S> <I> </I> <P> <P ...> <VDATA="..">
		//	<IndentForBracket> <GAIJI > <ReplaceString > <Bottom> <Middle> <Top>

		//	セレクトタグか？
		if (IsToken(lpSrc,L"<Select ")){	//	select
			int n;
			if (CStringScanner::GetNumFromCsv(lpSrc,n)!=0) return 3;
			if (n<0) return 3; // なぜじゃー
			n <<= 1; // ２倍して、、
			if (m_vSelectTag.size()<n+1) {
			//	配列サイズが小さければ、サイズ拡張を行なう
				m_vSelectTag.resize(n+1,-1);
			}
			//	２度目ではvRectの数が確定しているので、
			//	ここが何文字目かを取得することは不可能。よって、
			//	一度目に、vRect.size()から、位置を確定させてしまう
			if (m_vSelectTag[n]==-1){
				m_vSelectTag[n] = m_vRects.size(); // ここの文字数を入れる
			}
			if (!IsToken(lpSrc,L">")) return 3;	//	タグ閉じてへんやん..
			continue ;
		}

		//	閉じセレクトタグか？
		if (IsToken(lpSrc,L"</Select ")){	//	select
			int n;
			if (CStringScanner::GetNumFromCsv(lpSrc,n)!=0) return 3;
			if (n<0) return 3; // なぜじゃー
			n = n*2 + 1; // ２倍して１加算、、
			//	↑この部分以外は、上のSelectTagと同じ処理！
			if (m_vSelectTag.size()<n+1) {
			//	配列サイズが小さければ、サイズ拡張を行なう
				m_vSelectTag.resize(n+1,-1);
			}
			//	２度目ではvRectの数が確定しているので、
			//	ここが何文字目かを取得することは不可能。よって、
			//	一度目に、vRect.size()から、位置を確定させてしまう
			if (m_vSelectTag[n]==-1){
				m_vSelectTag[n] = m_vRects.size(); // ここの文字数を入れる
			}
			if (!IsToken(lpSrc,L">")) return 3;	//	タグ閉じてへんやん..
			continue ;
		}

		//	[Konami] removed: <if n> <else> <endif>, and the skipping of unknown tags
		//	(m_bSkipUnknownTag / m_vTagList.push_back)

		{	//	それら以外ということは、おそらくは文字なのだ
			dwMoji = (BYTE)*(lpSrc++);	//	[Konami] low byte of the WCHAR
			if (dwMoji == 0x0a) { continue; }	//	LF
			if (dwMoji == 0x0d) { context.m_nLineNo++; continue; } // CR

			//	[Konami] double-byte handling by language (replaces _ismbblead):
			//	mode 1 (<LJ>) : Shift-JIS lead 81-9F,E0-FC. Decoded on a Japanese system;
			//	                elsewhere half-width kana A1-DF => '?', DBCS => "??".
			//	mode 3 (<LK>) : lead 81-FD, trail 41-FE. Decoded on a Korean system,
			//	                elsewhere => "??".
			//	mode 2 (<LA>) : single bytes; on a Japanese system kana => '?' and
			//	                Shift-JIS lead => "??", on a Korean system a Korean lead
			//	                => "??" (the trail byte is NOT consumed in mode 2).
			//	mode 0 (no tag): 1 on a Japanese system (0x411), 3 on Korean (0x412), else 2.
			//	The decoded double-byte value is lead | trail<<8 as before.
			DWORD dwNext = (BYTE)*lpSrc;	//	2nd byte candidate (next WCHAR)
			LANGID nLangID = ::GetSystemDefaultLangID();
			int nLang = context.m_nLangMode;
			if (nLang!=1 && nLang!=2 && nLang!=3) {
				if (nLangID==0x411) {
					context.m_nLangMode = 1;
				} ef (nLangID==0x412) {
					context.m_nLangMode = 3;
				} else {
					context.m_nLangMode = 2;
				}
			}
			nLang = context.m_nLangMode;
			bool bSJISLead = (0x81<=dwMoji && dwMoji<=0x9f) || (0xe0<=dwMoji && dwMoji<=0xfc);
			if (nLangID==0x411) {
				if (nLang==1) {
					if (bSJISLead) {
						if (dwNext<0x40 && dwNext>0xfc) return 0;	//	(sic: never true)
						dwMoji |= (DWORD)((BYTE)*(lpSrc++)) << 8;
					}
					return 0;
				}
			} else {
				if (nLang==1) {
					if (0xa0<dwMoji && dwMoji<0xe0) {	//	half-width kana
						dwMoji = '?';
						return 0;
					}
					if (bSJISLead) {
						dwMoji = 0x3f3f;	//	"??"
						lpSrc++;
					}
					return 0;
				}
			}
			if (nLang==3) {
				if (dwMoji<0x81 || dwMoji>0xfd) return 0;
				if (dwNext<0x41 || dwNext>0xfe) return 0;
				if (nLangID==0x412) {
					dwMoji |= (DWORD)((BYTE)*lpSrc) << 8;
				} else {
					dwMoji = 0x3f3f;	//	"??"
				}
				lpSrc++;
				return 0;
			}
			if (nLangID==0x411) {
				if (nLang!=2) return 0;
				if (0xa0<dwMoji && dwMoji<0xe0) {	//	half-width kana
					dwMoji = '?';
					return 0;
				}
				if (!bSJISLead) return 0;
				if (dwNext<0x40 && dwNext>0xfc) return 0;	//	(sic: never true)
				dwMoji = 0x3f3f;	//	"??" (trail byte not consumed)
				return 0;
			}
			if (nLangID==0x412) {
				if (nLang!=2) return 0;
				if (dwMoji<0x81 || dwMoji>0xfd) return 0;
				if (dwNext<0x41 || dwNext>0xfe) return 0;
				dwMoji = 0x3f3f;	//	"??" (trail byte not consumed)
			}
			return 0;
		}
	}
	//	文字コードはdwMojiに入っている
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//	ヘルパ関数 (CStringScannerに委譲)
	//	CStringScannerに委譲＾＾；
//	[Konami] wide versions (CStringScanner wide overloads)
// @yo2 0x0057cca0 cg
bool	CTextDrawBase::IsToken(LPCWSTR &lp,LPCWSTR lp2){
	return CStringScanner::IsToken(lp,lp2);
}
// @yo2 0x0057ccd0 cg
LRESULT	CTextDrawBase::SkipTo(LPCWSTR &lp,LPCWSTR lp2){
	return CStringScanner::SkipTo(lp,lp2);
}
// @yo2 0x0057cd00 tight
LRESULT	CTextDrawBase::SkipTo2(LPCWSTR &lp,LPCWSTR lp2,LPWSTR lp3){
	return CStringScanner::SkipTo2(lp,lp2,lp3);
}
// @yo2 0x0057cd30 cg
LRESULT CTextDrawBase::SkipSpace(LPCWSTR &lp){
	return CStringScanner::SkipSpace(lp);
}
// @yo2 0x0057cd50 cg
LRESULT	CTextDrawBase::GetStrNum(LPCWSTR &lp,int& nRate){
	return CStringScanner::GetStrNum(lp,nRate);
}
// @yo2 0x0057cd80 cg
LRESULT	CTextDrawBase::GetNum(LPCWSTR &lp,int& nVal){
	return CStringScanner::GetNum(lp,nVal);
}
// @yo2 0x0057cdb0 cg
LRESULT CTextDrawBase::GetStrColor(LPCWSTR &lp,COLORREF& nFontColor){
	return CStringScanner::GetStrColor(lp,nFontColor);
}

////////////////////////////////////////////////////////////////////////

void	CTextDrawBase::SetContext(CFont&font,const CTextDrawContext& context,LPCWSTR lpStr){	//	[Konami] wide
	font.SetText(lpStr);
	if (!context.m_bBold){
		font.SetWeight(FW_NORMAL);
//		font.SetWeight(FW_THIN);
	} else {
		font.SetWeight(FW_SEMIBOLD);	//	[Konami] 600 (was FW_BOLD)
	}
	font.SetSize(context.m_nFontSize);
	font.SetFont(context.m_nFontNo);

	//	グレーカラーに対応
	if (!m_bGrayColor) {
		font.SetColor(context.m_rgbColor);
		font.SetBackColor(context.m_rgbColorBk);
	} else {
		font.SetColor(m_rgbGrayColor);
		font.SetBackColor(m_rgbGrayColorBk);
	}

	font.SetItalic(context.m_bItalic);
	font.SetUnderLine(context.m_bUnderLine);
	font.SetStrikeOut(context.m_bStrikeOut);
	font.SetQuality(4); // NONANTIALIASED_QUALITY
}

////////////////////////////////////////////////////////////////////////
#ifdef USE_DIB32
// @yo2 0x0057cfb0 manual
void	CTextDrawDIB32::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateText();
	m_dib.BltFast(&t,lpDrawPos->left,lpDrawPos->top);

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}
// @yo2 0x0057d110 manual
void	CTextDrawDIB32A::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateTextA();
	m_dib.BltFast(&t,lpDrawPos->left,lpDrawPos->top);

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}
// @yo2 0x0057d270 manual
void	CTextDrawDIB32AA::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateTextAA();
	m_dib.BltFast(&t,lpDrawPos->left,lpDrawPos->top);

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}

// @yo2 0x0057d3d0 review
void	CTextDrawDIB32::OnDrawSprite(SSprite*lpSp,int x,int y){
	if (lpSp->bFast){
		m_dib.BltFast((CDIB32*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	} else {
		m_dib.Blt((CDIB32*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	}
}

// @yo2 0x0057d450 feat
void	CTextDrawDIB32A::OnDrawSprite(SSprite*lpSp,int x,int y){
	if (lpSp->bFast){
		int x2 = x + lpSp->nOx;
		int y2 = y + lpSp->nOy;
		m_dib.BltFast((CDIB32*)lpSp->lpPlane,x2,y2,&lpSp->rcRect);
		RECT rc;
		::SetRect(&rc,x2,y2,
			x2 + lpSp->rcRect.right - lpSp->rcRect.left,
			y2 + lpSp->rcRect.bottom - lpSp->rcRect.top
		);
		m_dib.AddColorFast(0xff000000,&rc); // 最上位だけ潰す＾＾
		//	こういう転送作れって話もある...（いずれ作る＾＾；）
	} else {
		//	こういう転送作れって話もある...（いずれ作る＾＾；）
		int x2 = x + lpSp->nOx;
		int y2 = y + lpSp->nOy;
		//	転送元スプライト、潰してしもてええかな？＾＾；
		CDIB32Effect::Effect(
			((CDIB32*)lpSp->lpPlane),
			CDIB32MaskMSB(((CDIB32*)lpSp->lpPlane)->GetColorKey()),
			&lpSp->rcRect
		); // カラーキーに応じて最上位だけ潰す＾＾
		m_dib.Blt((CDIB32*)lpSp->lpPlane,x2,y2,&lpSp->rcRect);
	}
}

#endif

#ifdef USE_DirectDraw
void	CTextDrawPlane::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextPlane t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
//	t.SetVertical(IsVertical());	//　縦書きには対応してません^^;
	t.UpdateText();
	m_plane.BltFast(&t,lpDrawPos->left,lpDrawPos->top);

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}

void	CTextDrawPlane::OnDrawSprite(SSprite*lpSp,int x,int y){
	if (lpSp->bFast){
		m_plane.BltFast((CPlane*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	} else {
		m_plane.Blt((CPlane*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	}
}
#endif

#ifdef USE_FastDraw
// @yo2 0x0057d780 manual
void	CTextDrawFastPlane::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateText();
	m_plane.Blt((CDIB32*)&t,lpDrawPos->left,lpDrawPos->top);
		//	CDIB32 ⇔ CFastPlaneはサポートされている！

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}
// @yo2 0x0057d8e0 manual
void	CTextDrawFastPlaneA::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateTextA();
	m_plane.Blt((CDIB32*)&t,lpDrawPos->left,lpDrawPos->top);
		//	CDIB32 ⇔ CFastPlaneはサポートされている！

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}
// @yo2 0x0057da40 manual
void	CTextDrawFastPlaneAA::OnDrawText(const CTextDrawContext& context,DWORD dwMoji,LPRECT lpDrawPos)
{
	CTextDIB32 t;
	SetContext(*t.GetFont(),context,(LPWSTR)&dwMoji);	//	[Konami] wide
	t.SetVertical(IsVertical());	//　縦書きかどうかを設定
	t.UpdateTextAA();
	m_plane.Blt((CDIB32*)&t,lpDrawPos->left,lpDrawPos->top);
		//	CDIB32 ⇔ CFastPlaneはサポートされている！

	//	RECTの最終調整
	int sx, sy;
	t.GetSize(sx,sy);
	lpDrawPos->right = lpDrawPos->left + sx;
	lpDrawPos->bottom = lpDrawPos->top + sy;
}

// @yo2 0x0057e350 cg
void	CTextDrawFastPlane::OnDrawSprite(SSprite*lpSp,int x,int y){
	if (lpSp->bFast){
		m_plane.BltFast((CFastPlane*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	} else {
		m_plane.Blt((CFastPlane*)lpSp->lpPlane,x + lpSp->nOx,y + lpSp->nOy,&lpSp->rcRect);
	}
}

// @yo2 0x0057e3d0 cg
void	CTextDrawFastPlaneA::OnDrawSprite(SSprite*lpSp,int x,int y){

	if (lpSp->bFast){
		int x2 = x + lpSp->nOx;
		int y2 = y + lpSp->nOy;
		m_plane.BltFast((CFastPlane*)lpSp->lpPlane,x2,y2,&lpSp->rcRect);
		//	BltFastは、非Alphaサーフェース to Alphaサーフェースをサポートしている！
	/*
		RECT rc;
		::SetRect(&rc,x2,y2,
			x2 + lpSp->rcRect.right - lpSp->rcRect.left,
			y2 + lpSp->rcRect.bottom - lpSp->rcRect.top
		);
		m_plane.AddColorFast(0xff000000,&rc); // 最上位だけ潰す＾＾
		//	こういう転送作れって話もある...（いずれ作る＾＾；）
	*/
	} else {
		//	こういう転送作れって話もある...（いずれ作る＾＾；）
		int x2 = x + lpSp->nOx;
		int y2 = y + lpSp->nOy;
		/*
		//	転送元スプライト、潰してしもてええかな？＾＾；
		CDIB32Effect::Effect(
			((CFastPlane*)lpSp->lpPlane),
			CDIB32MaskMSB(((CDIB32*)lpSp->lpPlane)->GetColorKey()),
			&lpSp->rcRect
		); // カラーキーに応じて最上位だけ潰す＾＾
		*/
		m_plane.Blt((CFastPlane*)lpSp->lpPlane,x2,y2,&lpSp->rcRect);
		//	Bltは、非Alphaサーフェース to Alphaサーフェースをサポートしている！
	}
}

#endif

/////////////////////////////////////////////////////////////////////////////

