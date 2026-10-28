//
//	yaneSequencer.h :
//
//		タイミングを取りながら
//		プログラムを処理するためのアシストクラス
//
//		programmed by yaneurao '00/02/29
//

#ifndef __yaneSequencer_h__
#define __yaneSequencer_h__

class CSequenceInfo {
public:
	int		m_nStart;		//	この値から
	int		m_nEnd;			//	この値までの範囲ならば
	int		m_nData;		//	この値を返す。さもなくばNULL

	//	STLの比較のためのoperator
	bool	operator <(const CSequenceInfo& x) const;
};
//	int は　符号つき３２ビットと仮定している。

class CSequencer {
public:
	LRESULT Add(int start,int end,int data);	//	追加
	LRESULT Add(int start,int data);			//	追加
	LRESULT Del(int start,int end,int data);	//	削除


	void Clear(void);		//	全削除

	LRESULT	Get(int pos,int& data,int &diff);
	//	posの値に対応するデータについて問い合わせる。
	//	見つかったときにはdataにその値、diffにstartからの増量が入る。
protected:
	set<CSequenceInfo>	m_oSequenceList;
};

#endif
