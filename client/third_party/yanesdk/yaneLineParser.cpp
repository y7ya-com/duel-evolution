////////////////////////////////////////////////////////////////////////
// CLineParser.cpp

#include "stdafx.h"
#include "yaneLineParser.h"

// @yo2 0x0053a3c0 review
CLineParser::CLineParser( void ) {
	m_lpszReadData = NULL;										// 1ラインを読み込んだデータ
}

// @yo2 0x0053a410 vt
CLineParser::~CLineParser() {
}

// @yo2 0x0053a430 review
void	CLineParser::SetLine( LPSTR lpszStr ){
	m_lpszReadData = lpszStr;
}

// @yo2 0x0053a450 review
bool	CLineParser::IsMatch( LPSTR lpszCmpStr ) {

	if ( m_lpszReadData == NULL ) return false;

	Garbage();				//	ゴミを削除する

	LPSTR lpOrg = m_lpszReadData;
	while ( true ) {
		if ( *lpszCmpStr == '\0' ) return true;
		if ( ::toupper( *(lpszCmpStr++) ) != ::toupper( *(m_lpszReadData++) ) ) {	//	指定した文字列と等しいか否かの判定
			m_lpszReadData = lpOrg;
			return false;
		}
	}
}


// @yo2 0x0053a4e0 review
LRESULT		CLineParser::GetNum( int& nNo )
{
	if ( m_lpszReadData == NULL ) return 1;

	int		c;
	int		nRetNum = 0;
	bool	bSigned = false;

	Garbage();

	// 『0～9』か『-』を探す
	// 最初が『-』か『0～9』以外の時はGetNum失敗
	c = *m_lpszReadData;
	if ( (c < '0' || c > '9') && (c != '-') ) return 1;

	if (c=='-') {
		bSigned = true;
		m_lpszReadData++;
	}

	while ( true ) {
		c = *m_lpszReadData;
		if ( (c >= '0') && (c <= '9') ) {
			nRetNum = nRetNum*10 + (c -'0');	//	文字列を数値にして、桁を上げる
		} else {
			break;
		}
		m_lpszReadData++;
	}

	if ( bSigned )												//	符号がマイナスか否かの判定
		nRetNum = -nRetNum;

	nNo = nRetNum;												//	結果を渡す
	return 0;
} // GetNum


// @yo2 0x0053a580 review
LRESULT		CLineParser::GetStr( string& str )
{
	if ( m_lpszReadData == NULL ) return 1;

	Garbage();
	
	// 『"』を探す
	// 最初が『"』以外の時はGetStr失敗
	if ( *m_lpszReadData!= '\"' ) return 2;

	m_lpszReadData++;

	// "から"までの文字列を渡す
	// 終了の『"』を探す
	CHAR	szStr[256];
	int		k=0;
	while (true) {
		int c = *(m_lpszReadData++);
		if (c=='\0') return 3;	//	unexpectedly terminate
		
		if (c=='\"') {
			szStr[k] = '\0';
			break;
		} else {
			szStr[k] = c;
		}
		k++;
	}

	str = (LPSTR) szStr;
	return 0;
} // GetStr


/////////////////////////////////////////

// @yo2 0x0053a710 cg
void	CLineParser::Garbage( void ) {
	// ゴミ以外が見つかるまでループする
	// ゴミ指定文字 『 (Space)』『	(Tab)』『,』
	while ( true )
	{
		int c = *m_lpszReadData;
		if ( c != ' ' && c != '\t' && c != ',' ) break;
		m_lpszReadData++;
	}
}

// @yo2 0x0053a740 review
void	CLineParser::ConvertCR(LPSTR lpsz){
	LPSTR lp = lpsz;
	for(;;) {
		*lpsz = *lp;
		if (*lpsz == '\0') break;
		if((*lp == '\\') && (*(lp+1)=='n')) {
			*lpsz = '\n';
			lpsz++;
			lp+=2;
			continue;
		}
		lpsz++;
		lp++;
	}
}
