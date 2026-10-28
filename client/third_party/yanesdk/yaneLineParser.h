//
//	yaneLineParser.h
//

#ifndef __yaneLineParser_h__
#define __yaneLineParser_h__

class CLineParser {
public:

	void	SetLine( LPSTR lpszStr );				//	1ラインの文字列をセットする
	bool	IsMatch( LPSTR lpszCmpStr );			//	指定した文字列と等しいか否かを返す
	LRESULT	GetNum( int& nNo );						//	数値を得る
	LRESULT	GetStr( string& str );					//	"..."で囲まれた文字列を得る

	static void	ConvertCR(LPSTR);					//	「\n」を'\n'に変換

	CLineParser( void );							//	コンストラクタ
	virtual	~CLineParser();							//	デストラクタ

protected:
	void	Garbage( void );						//	ゴミつめ
	LPSTR	m_lpszReadData;							//	1ラインを読み込んだデータ
};

#endif
