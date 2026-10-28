#include "stdafx.h"
#include "yaneStringScanner.h"
#include  <mbctype.h> // _ismbblead

bool	CStringScanner::IsToken(LPCSTR &lp,LPCSTR lp2){
// マルチバイトを意識する必要はない
	if (lp2==NULL) return false;

	LPCSTR lpx = lp;
	//	ここで、スペース、タブを飛ばして良いと思われる
	SkipSpace(lpx);
	while (true){
		if (*lp2=='\0') {
			//	すべて一致した！
			lp = lpx;	// ポインタを進める！
			return true;
		}
		if (toupper(*(lpx++))!=toupper(*(lp2++))) return false;	//	ダメじゃん...
	}
}

// [Konami] added: WCHAR version. Unlike the CHAR version it does not
//	skip leading spaces.
// @yo2 0x005755a0 manual
bool	CStringScanner::IsToken(LPCWSTR &lp,LPCWSTR lp2){
	if (lp2==NULL) return false;

	LPCWSTR lpx = lp;
	while (true){
		if (*lp2==L'\0') {
			//	すべて一致した！
			lp = lpx;	// ポインタを進める！
			return true;
		}
		if (toupper(*(lpx++))!=toupper(*(lp2++))) return false;	//	ダメじゃん...
	}
}

LRESULT	CStringScanner::SkipTo(LPCSTR &pSrcStr, LPCSTR pTokenStr){
// マルチバイトを意識する必要がある→対応^^
	LPCSTR pSrcStr_org = pSrcStr;
	bool bKanji = false;
	while (true){
		if (bKanji) {	// ２バイト文字の２バイト目や
			bKanji = false;
			pSrcStr++;
		}
		if (_ismbblead(*pSrcStr)) {	// ２バイト文字の１バイト目や
			bKanji = true;
		}
		if (*pSrcStr=='\0') { //	EOFに出くわした！
			pSrcStr = pSrcStr_org;
			return 1;
		}

		//	if (IsToken(lp,lp2)) break;	//	これ、インライン展開したほうがいいなぁ...
		//	遅そうなので↑を手動でインライン展開する＾＾；
		{
			LPCSTR lp1 = pSrcStr;
			LPCSTR lp2 = pTokenStr;
			while (true){
				if (*lp2=='\0') {
					pSrcStr = lp1;	// ポインタを進める！
					return 0;	//	一致したんで終了
				}
				if (*(lp1++)!=*(lp2++)) break;	//	ダメじゃん...
			}
		}
		pSrcStr++;
	}
	return 0;
}

// [Konami] added: WCHAR version. Note: the lead-byte test looks at the
//	low byte of the WCHAR (_ismbblead), and then skips one extra WCHAR.
// @yo2 0x00575620 manual
LRESULT	CStringScanner::SkipTo(LPCWSTR &pSrcStr, LPCWSTR pTokenStr){
	LPCWSTR pSrcStr_org = pSrcStr;
	bool bKanji = false;
	while (true){
		if (bKanji) {	// ２バイト文字の２バイト目や
			bKanji = false;
			pSrcStr++;
		}
		if (_ismbblead(*pSrcStr)) {	// ２バイト文字の１バイト目や
			bKanji = true;
		}
		if (*pSrcStr==L'\0') { //	EOFに出くわした！
			pSrcStr = pSrcStr_org;
			return 1;
		}
		{
			LPCWSTR lp1 = pSrcStr;
			LPCWSTR lp2 = pTokenStr;
			while (true){
				if (*lp2==L'\0') {
					pSrcStr = lp1;	// ポインタを進める！
					return 0;	//	一致したんで終了
				}
				if (*(lp1++)!=*(lp2++)) break;	//	ダメじゃん...
			}
		}
		pSrcStr++;
	}
	return 0;
}

//	↑の、一致時に一致するまでにスキップした文字列を文字バッファにコピーする版
// @yo2 0x005756b0 review
LRESULT	CStringScanner::SkipTo2(LPCSTR &pSrcStr, LPCSTR pTokenStr, LPSTR pSkipedStr){
// マルチバイトを意識する必要がある→対応^^
	LPCSTR pSrcStr_org = pSrcStr;
	bool bKanji = false;
	while (true){
		if (bKanji) {	// ２バイト文字の２バイト目や
			bKanji = false;
			pSrcStr++;
		}
		if (_ismbblead(*pSrcStr)) {	// ２バイト文字の１バイト目や
			bKanji = true;
		}
		if (*pSrcStr=='\0') { //	EOFに出くわした！
			pSrcStr = pSrcStr_org;
			return 1;
		}

		//	if (IsToken(lp,lp2)) break;	//	これ、インライン展開したほうがいいなぁ...
		//	遅そうなので↑を手動でインライン展開する＾＾；
		{
			LPCSTR lp1 = pSrcStr;
			LPCSTR lp2 = pTokenStr;
			while (true){
				if (*lp2=='\0') {
					{	//	文字バッファにコピーしておく。
						const int nSize = pSrcStr - pSrcStr_org;	// トークンの前まで
						::CopyMemory(pSkipedStr,pSrcStr_org,nSize);
						pSkipedStr[nSize] = '\0';
					}
					pSrcStr = lp1;	// ポインタを進める！
					return 0;	//	一致したんで終了
				}
				if (*(lp1++)!=*(lp2++)) break;	//	ダメじゃん...
			}
		}
		pSrcStr++;
	}
	return 0;
}

// [Konami] added: WCHAR version. Note: as in the exe, CopyMemory copies
//	nSize BYTES although nSize counts WCHARs (only half of the skipped text
//	is copied before the terminator is written at pSkipedStr[nSize]).
// @yo2 0x00575770 manual
LRESULT	CStringScanner::SkipTo2(LPCWSTR &pSrcStr, LPCWSTR pTokenStr, LPWSTR pSkipedStr){
	LPCWSTR pSrcStr_org = pSrcStr;
	bool bKanji = false;
	while (true){
		if (bKanji) {	// ２バイト文字の２バイト目や
			bKanji = false;
			pSrcStr++;
		}
		if (_ismbblead(*pSrcStr)) {	// ２バイト文字の１バイト目や
			bKanji = true;
		}
		if (*pSrcStr==L'\0') { //	EOFに出くわした！
			pSrcStr = pSrcStr_org;
			return 1;
		}
		{
			LPCWSTR lp1 = pSrcStr;
			LPCWSTR lp2 = pTokenStr;
			while (true){
				if (*lp2==L'\0') {
					{	//	文字バッファにコピーしておく。
						const int nSize = pSrcStr - pSrcStr_org;	// トークンの前まで
						::CopyMemory(pSkipedStr,pSrcStr_org,nSize);
						pSkipedStr[nSize] = L'\0';
					}
					pSrcStr = lp1;	// ポインタを進める！
					return 0;	//	一致したんで終了
				}
				if (*(lp1++)!=*(lp2++)) break;	//	ダメじゃん...
			}
		}
		pSrcStr++;
	}
	return 0;
}

// @yo2 0x00575840 review
LRESULT CStringScanner::SkipSpace(LPCSTR &lp){
// マルチバイトを意識する必要はない
	//	スペース、タブ、改行を切り詰める
	while (*lp==0x0a || *lp==0x0d || *lp==' ' || *lp=='\t'){
		lp++;
	}
	if (*lp=='\0') return 1;
	return 0;
}

// [Konami] added: WCHAR version
// @yo2 0x00575880 manual
LRESULT CStringScanner::SkipSpace(LPCWSTR &lp){
	while (*lp==0x0a || *lp==0x0d || *lp==L' ' || *lp==L'\t'){
		lp++;
	}
	if (*lp==L'\0') return 1;
	return 0;
}

// @yo2 0x005758d0 review
LRESULT CStringScanner::SkipSpace2(LPCSTR &lp){
// マルチバイトを意識する必要はない
	//	スペース、タブ、カンマ、改行を切り詰める
	//	csv読み込みに使うと便利
	while (*lp==0x0a || *lp==0x0d || *lp==' ' || *lp=='\t' || *lp==','){
		lp++;
	}
	if (*lp=='\0') return 1;
	return 0;
}

// [Konami] added: WCHAR version
// @yo2 0x00575910 manual
LRESULT CStringScanner::SkipSpace2(LPCWSTR &lp){
	while (*lp==0x0a || *lp==0x0d || *lp==L' ' || *lp==L'\t' || *lp==L','){
		lp++;
	}
	if (*lp==L'\0') return 1;
	return 0;
}

LRESULT	CStringScanner::GetStrNum(LPCSTR &lp,int& nRate){
// マルチバイトを意識する必要がある→未対応--;
	//	"+1"という文字列ならばnRateには1が返る
	if (SkipSpace(lp)!=0) return -1;	//	ダメやん

	if (*lp!='"') return 3;	//	おかしーやん！
	lp++;
	nRate = 0;
	int nSign = 1;
	if (*lp=='+') { lp++; }
	ef (*lp=='-') { nSign = -1; lp++; }
	LRESULT lr = 1;
	while (*lp>='0' && *lp<='9') {
		lr = 0;
		nRate = nRate*10+(*lp-'0');
		lp++;
	}
	nRate *= nSign;
	if (*lp!='"') return 3; // 閉じてないやん
	lp++;
	return lr;
}

// [Konami] added: WCHAR version
// @yo2 0x00575960 manual
LRESULT	CStringScanner::GetStrNum(LPCWSTR &lp,int& nRate){
	if (SkipSpace(lp)!=0) return -1;	//	ダメやん

	if (*lp!=L'"') return 3;	//	おかしーやん！
	lp++;
	nRate = 0;
	int nSign = 1;
	if (*lp==L'+') { lp++; }
	ef (*lp==L'-') { nSign = -1; lp++; }
	LRESULT lr = 1;
	while (*lp>=L'0' && *lp<=L'9') {
		lr = 0;
		nRate = nRate*10+(*lp-L'0');
		lp++;
	}
	nRate *= nSign;
	if (*lp!=L'"') return 3; // 閉じてないやん
	lp++;
	return lr;
}

// @yo2 0x00575a40 review
LRESULT	CStringScanner::GetNum(LPCSTR &lp,int& nVal){
// マルチバイトを意識する必要がある→未対応--;
	//	+1という文字列ならばnValには1が返る

	if (SkipSpace(lp)!=0) return -1;	//	ダメやん

	nVal = 0;
	int nSign = 1;
	if (*lp=='+') { lp++; }
	ef (*lp=='-') { nSign = -1; lp++; }
	LRESULT lr = 1;
	while (*lp>='0' && *lp<='9') {
		lr = 0;
		nVal = nVal*10+(*lp-'0');
		lp++;
	}
	nVal *= nSign;
	return lr;
}

// [Konami] added: WCHAR version
// @yo2 0x00575ae0 manual
LRESULT	CStringScanner::GetNum(LPCWSTR &lp,int& nVal){
	if (SkipSpace(lp)!=0) return -1;	//	ダメやん

	nVal = 0;
	int nSign = 1;
	if (*lp==L'+') { lp++; }
	ef (*lp==L'-') { nSign = -1; lp++; }
	LRESULT lr = 1;
	while (*lp>=L'0' && *lp<=L'9') {
		lr = 0;
		nVal = nVal*10+(*lp-L'0');
		lp++;
	}
	nVal *= nSign;
	return lr;
}

LRESULT CStringScanner::GetStrColor(LPCSTR &lp,COLORREF& nFontColor){
// マルチバイトを意識する必要がある→未対応--;
	// "#ff0000"という文字列ならばRGB(255,0,0)が返る
	if (SkipSpace(lp)!=0) return -1;

	if (*lp!='"') return 3;	//	おかしーやん！
	lp++;
	if (*lp!='#') return 3; // #しかサポートしてないのさっ＾＾；
	lp++;
	LRESULT lr = 1;
	DWORD dw = 0;
	while ((*lp>='0' && *lp<='9')||(*lp>='a' && *lp<='f')||(*lp>='A' && *lp<='F')){
		lr = 0;
		int c;
		if (*lp>='0' && *lp<='9') {
			c = *lp - '0';
		} else {
			c = toupper(*lp) - 'A'+10;
		}
		dw = (dw << 4) + c;
		lp++;
	}
	if (*lp!='"') return 3; // 閉じてないやん
	lp++;
	//	RGBは転置＝天地する
	nFontColor = ((dw & 0xff)<<16) + (dw & 0xff00) + ((dw & 0xff0000)>>16);
	return lr;
}

// [Konami] added: WCHAR version
// @yo2 0x00575ba0 manual
LRESULT CStringScanner::GetStrColor(LPCWSTR &lp,COLORREF& nFontColor){
	if (SkipSpace(lp)!=0) return -1;

	if (*lp!=L'"') return 3;	//	おかしーやん！
	lp++;
	if (*lp!=L'#') return 3; // #しかサポートしてないのさっ＾＾；
	lp++;
	LRESULT lr = 1;
	DWORD dw = 0;
	while ((*lp>=L'0' && *lp<=L'9')||(*lp>=L'a' && *lp<=L'f')||(*lp>=L'A' && *lp<=L'F')){
		lr = 0;
		int c;
		if (*lp>=L'0' && *lp<=L'9') {
			c = *lp - L'0';
		} else {
			c = toupper(*lp) - 'A'+10;
		}
		dw = (dw << 4) + c;
		lp++;
	}
	if (*lp!=L'"') return 3; // 閉じてないやん
	lp++;
	//	RGBは転置＝天地する
	nFontColor = ((dw & 0xff)<<16) + (dw & 0xff00) + ((dw & 0xff0000)>>16);
	return lr;
}

string CStringScanner::GetStr(LPCSTR &lp,CHAR c){
// マルチバイトを意識する必要がある→対応^^
	//	cに遭遇するところまでの文字列を返す
	string str;
	bool bKanji=false;
	while (true) {
		if (bKanji) {
			str += *(lp++);
			bKanji = false;
			continue;
		}
		if ( *lp==c || *lp=='\0' ) break;
		if (_ismbblead(*lp)) { bKanji = true; }		// MultiByte
		str += *(lp++);
	}
	return str;
}

// [Konami] added: WCHAR version (the lead-byte test uses the low byte)
// @yo2 0x00575ce0 manual
wstring CStringScanner::GetStr(LPCWSTR &lp,WCHAR c){
	wstring str;
	bool bKanji=false;
	while (true) {
		if (bKanji) {
			str += *(lp++);
			bKanji = false;
			continue;
		}
		if ( *lp==c || *lp==L'\0' ) break;
		if (_ismbblead(*lp)) { bKanji = true; }		// MultiByte
		str += *(lp++);
	}
	return str;
}

// @yo2 0x00575f10 review
string CStringScanner::GetStr(LPCSTR &lp){
// マルチバイトを意識する必要がある→対応^^
	//	スペース、タブ、改行に遭遇するところまでの文字列を返す
	string str;
	bool bKanji=false;
	while (true) {
		CHAR c = *lp;
		if (bKanji) {
			str += c;
			bKanji = false;
			lp++;
			continue;
		}
		if (c==' ' || c=='\t' || c=='\0' || c=='\n' || c=='\r') break;
		if (_ismbblead(c)) { bKanji = true; }		// MultiByte
		str += c;
		lp++;
	}
	return str;
}

// @yo2? 0x00576110 order
string CStringScanner::GetStrFileName(LPCSTR &lp){
// マルチバイトを意識する必要がある→未対応--;
	//	タブ、改行に遭遇するところまでの文字列を返す
	string str;
	while (true) {
		CHAR c = *lp;
		if (c=='\t' || c=='\0' || c=='\n') break;
		str += c;
		lp++;
	}
	return str;
}

// @yo2 0x00576250 review
string CStringScanner::GetNextStr(LPCSTR &lp){
// マルチバイトを意識する必要がある→対応^^
	//	スペース、タブ、改行に遭遇するところまでの文字列を返す
	bool bKanji=false;
	string str;
	if (SkipSpace(lp)!=0) return str;	//	ダメね～＾＾；

	bool bDC = (*lp == '"');	//	ダブルコーテで始まってるか？
	if (bDC) lp++;

	while (true) {
		CHAR c = *lp;
		if (bKanji) {
			bKanji = false;
			str += c;
			lp++;
			continue;
		}
		if (bDC) {	//	ダブルコーテスタートならばスペース，タブは無視
			if (c=='"' ) { lp++;break;};
			if (c=='\0') break;
		} else {
			if (c==' ' || c=='\t' || c=='\0' || c=='\n' || c=='\r') break;
		}
		if (_ismbblead(c)) { bKanji = true; }		// MultiByte
		str += c;
		lp++;
	}
	return str;
}

// [Konami] added: WCHAR version. It returns a narrow string built from the
//	low byte of each WCHAR (CHAR c = (CHAR)*lp), like GetNextMoji.
// @yo2 0x005764a0 manual
string CStringScanner::GetNextStr(LPCWSTR &lp){
	bool bKanji=false;
	string str;
	if (SkipSpace(lp)!=0) return str;	//	ダメね～＾＾；

	bool bDC = (*lp == L'"');	//	ダブルコーテで始まってるか？
	if (bDC) lp++;

	while (true) {
		CHAR c = (CHAR)*lp;
		if (bKanji) {
			bKanji = false;
			str += c;
			lp++;
			continue;
		}
		if (bDC) {	//	ダブルコーテスタートならばスペース，タブは無視
			if (c=='"' ) { lp++;break;};
			if (c=='\0') break;
		} else {
			if (c==' ' || c=='\t' || c=='\0' || c=='\n' || c=='\r') break;
		}
		if (_ismbblead(c)) { bKanji = true; }		// MultiByte
		str += c;
		lp++;
	}
	return str;
}

LRESULT CStringScanner::GetNumFromCsv(LPCSTR &lp,int& nVal,bool b){
// マルチバイトを意識する必要がある→未対応--;
	//	カンマ、スペースを無視しながら数値を読み込むのだ
	if ( !b ){
		if (SkipSpace2(lp)!=0) return 1;
		if (GetNum(lp,nVal)!=0) return 2;
	}else{
		if ( *lp==',' || *lp== '\t' ) {
			lp++;
			nVal = 0;
		}else{
			LRESULT lr = GetNum(lp,nVal);
			if ( *lp==',' || *lp== '\t' ) {
				lp++;
			}
			if ( lr != 0 ) return 2;
		}
	}
	
	return 0;
}


// [Konami] added: WCHAR version
// @yo2 0x005766f0 manual
LRESULT CStringScanner::GetNumFromCsv(LPCWSTR &lp,int& nVal,bool b){
	if ( !b ){
		if (SkipSpace2(lp)!=0) return 1;
		if (GetNum(lp,nVal)!=0) return 2;
	}else{
		if ( *lp==L',' || *lp== L'\t' ) {
			lp++;
			nVal = 0;
		}else{
			LRESULT lr = GetNum(lp,nVal);
			if ( *lp==L',' || *lp== L'\t' ) {
				lp++;
			}
			if ( lr != 0 ) return 2;
		}
	}

	return 0;
}

string CStringScanner::GetStrFromCsv(LPCSTR &lp){
// マルチバイトを意識する必要がある→対応^^
	string str;
	str = GetStr(lp,',');
	SkipTo(lp,",");
	return str;
}


// [Konami] added: WCHAR version
// @yo2 0x005767b0 manual
wstring CStringScanner::GetStrFromCsv(LPCWSTR &lp){
	wstring str;
	str = GetStr(lp,L',');
	SkipTo(lp,L",");
	return str;
}

// @yo2 0x00576910 cg
void	CStringScanner::Replace(string& buf,LPCSTR pSrc,LPCSTR pDst,bool bCaseSensitive){
// マルチバイトを意識する必要がある→対応^^
	//	string中に含まれるpSrcと一致する部分をpDstに置換する
	//	日本語対応。bCaseSensitive==trueのときは、
	//	アルファベットの大文字小文字を区別する。

	//	置換文字列が空？
	if (buf.empty()) return ;

	//	置換ソースが空白？
	if (*pSrc == '\0') return ; // これはあかんやろ．．
	
	LPCSTR pSz = buf.c_str();
	LPCSTR pSzOrg = pSz; // オリジナルポジション
	while (*pSz!='\0'){
		//	大文字と小文字を区別するとき
		if ((bCaseSensitive && *pSz == *pSrc) ||
			(!bCaseSensitive && toupper(*pSz)==toupper(*pSrc))){
			//	先頭が一致したんで、そこから先も一致するか調べるにゅ
			LPCSTR p1 = pSz+1;
			LPCSTR p2 = pSrc+1;
			while(true) {
				if (*p2=='\0'){
				//	一致しちゃった＾＾；
					goto Found;
				}
				//	大文字と小文字を区別するとき
				if (bCaseSensitive){
					if (*p1!=*p2) break;
					p1++; p2++;
				} else {
				//	大文字と小文字を区別しないとき
					int c = *p1;
					if (toupper(c)!=toupper(*p2)) break;
					if (_ismbblead(c)){
						p1++; p2++;
						if (*p1!=*p2) break;
						//	漢字コードの２バイト目にはCaseInsensitivityを適用しない
						p1++; p2++;
					} else {
						p1++; p2++;
					}
				}
			}
		}
		//	マルチバイト対策
		if (_ismbblead(*pSz)){
			pSz+=2;
		} else {
			pSz++;
		}
	}
	return ;

Found:;
	vector <int> an;
	an.push_back(pSz-pSzOrg); //	現在位置(0オリジン)
	int nL1 = ::strlen(pSrc);
	int nL2 = ::strlen(pDst);
	pSz+= nL1; // 一致した文字列分だけ加算

	//	さらに検索を続ける
	while (*pSz!=0){
		//	大文字と小文字を区別するとき
		if ((bCaseSensitive && *pSz == *pSrc) ||
			(!bCaseSensitive && toupper(*pSz)==toupper(*pSrc))){
			//	先頭が一致したんで、そこから先も一致するか調べるにゅ
			LPCSTR p1 = pSz+1;
			LPCSTR p2 = pSrc+1;
			while(true) {
				if (*p2=='\0'){
				//	一致しちゃった＾＾；
					an.push_back(pSz-pSzOrg); //	現在位置(0オリジン)
					pSz+= nL1; // 一致した文字列分だけ加算
					goto SearchNext;
				}
				//	大文字と小文字を区別するとき
				if (bCaseSensitive){
					if (*p1!=*p2) break;
					p1++; p2++;
				} else {
				//	大文字と小文字を区別しないとき
					int c = *p1;
					if (toupper(c)!=toupper(*p2)) break;
					if (_ismbblead(c)){
						p1++; p2++;
						if (*p1!=*p2) break;
						//	漢字コードの２バイト目にはCaseInsensitiveを適用しない
						p1++; p2++;
					} else {
						p1++; p2++;
					}
				}
			}
		}
		//	マルチバイト対策
		if (_ismbblead(*pSz)){
			pSz+=2;
		} else {
			pSz++;
		}
SearchNext:;
	}

	//	実際の縮小拡大作業
	int n = pSz-pSzOrg; // 元の文字列長
	int m = an.size();
	int nL = n + m*(nL2-nL1) + 1; // 置換する数×１つあたりの変位 + 1(終端のNULL)
	LPSTR pTmp = new CHAR[nL];
	//	nL1==nL2のときは、このバッファ作成作業ははしょれるのだが、
	//	string::c_strは、constなバッファなため、変更は許されていない
	LPSTR pTmpt = pTmp;
	pSz = pSzOrg;
	int k=0;
	for(int i=0;i<n;i++){
		if ((k<m) && (i==an[k])){ // if の評価順は左からと仮定している
			LPCSTR pDstt = pDst;
			while (*pDstt!='\0'){
				*(pTmpt++) = *(pDstt++);
			}
			i += nL1-1;
			pSz += nL1; // ソース分加算
			k++;
		} else {
			*(pTmpt++) = *(pSz++);
		}
	}
	*pTmpt = '\0'; // 終端文字
	buf = pTmp; // 文字列の代入作業
	delete [] pTmp;
}

// @yo2 0x00576dc0 cg
void	CStringScanner::NumToString(LONGLONG l,string& s){
// マルチバイトを意識する必要はない
	if (l==0) {
		s = "0";
		return ;
	}
	bool bMinus;
	if (l<0) {
		bMinus = true;
		l = -l;
	} else {
		bMinus = false;
	}
	s.erase();
	while (l!=0){
		s = (CHAR)((l%10) + '0') + s;
		//	もう少し洗練されたコードも書けるのだが..
		l/=10;
	}
	if (bMinus) {
		s = '-' + s;
	}
}

// @yo2 0x00577060 cg
LRESULT	 CStringScanner::StringToNum(string s,LONGLONG& l){
// マルチバイトを意識する必要はない
	LPCSTR psz = s.c_str();
	bool bMinus;
	if (*psz == '-') {
		psz++;
		bMinus = true;
	} else {
		bMinus = false;
	}
	l=0;
	bool bFirst = true;
	while (true){
		CHAR c = *psz;
		if (c>='0' && c<='9'){
			l = l*10 + c-'0';
			bFirst = false;
		} else {
			if (bFirst){
			//	数値代入を１度も行なっていない
				return 1; // error
			}
			break;
		}
		psz++;
	}
	if (bMinus) l=-l;
	return 0;
}

// @yo2 0x00577190 review
void CStringScanner::NumToStringZ(LONGLONG l,string& s,int n){
// マルチバイトを意識する必要はない
	NumToString(l,s);
	int nLength = s.length();
	if (nLength < n){
		//	長さが足りないので、左の桁にゼロを追加。
		string t;
		for(int i=nLength;i<n;i++){ t+='0'; }
		s = t+s;
	} ef (nLength > n){
		//	長すぎるので、左の桁をカットする（そんな必要無いんか？）
		s = s.substr(nLength-n,n);
	}
}

