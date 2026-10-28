// yaneError.h	:
//	エラーログ出力用クラス
//
//	programmed by yaneurao		'99/06/21
//	reprogrammed by yaneurao	'00/02/25
//

#ifndef __yaneError_h__
#define __yaneError_h__

#ifdef _DEBUG // debugシンボルが定義されているなら、エラー出力！
  #undef USE_ErrorLog
  #define USE_ErrorLog
#endif

#ifdef USE_ErrorLog

class CErrorLog {					//	デバッグ用エラーログ出力
public:
	virtual LRESULT	Out(string);			//	内部エラー出力用。
	virtual LRESULT	Out(int);				//	内部エラー出力用。
	virtual LRESULT __cdecl Out(LPSTR fmt, ... ); // 内部エラー出力用
	virtual LRESULT	SelectDevice(int);		//	エラーログ出力先。(0:なし 1:File)
	virtual string	GetError(void) const;			//	前回エラー出力したものを取得する。

	CErrorLog(void);
	virtual ~CErrorLog();

protected:
	int		m_nDevice;			//	出力先デバイス
	string	m_oErrorMes;		//	前回出力のエラーメッセージ
};

#else	// USE_ErrorLog || _DEBUG
//	空のクラス定義にする

class CErrorLog {					//	デバッグ用エラーログ出力
public:
	LRESULT	Out(string){ return 0; }
	LRESULT	Out(int){ return 0; }
	LRESULT __cdecl Out(LPSTR fmt, ... ){ return 0;}
	LRESULT	SelectDevice(int){ return 0;}
	string	GetError(void) const{ return string("");}
};

#endif  // USE_ErrorLog || _DEBUG

extern CErrorLog Err;			//	こいつから出力する

#endif
