//
//	シリアライズ用クラス
//			programmed by yaneurao	'01/07/16
//
//		ひとつのシリアライズ関数で、ストリームへの保存／復元を
//		兼用するあたりが、新たな発明のような気もするのだが、
//		そうでも無いのだろうか．．＾＾；
//

#ifndef __yaneSerialize_h__
#define __yaneSerialize_h__

//	シリアライズ用アーカイブクラス
class CSerialize;	// [portable] a friend declaration does not declare the name for g++

class CArchive {
public:
	friend class CSerialize;

	virtual ~CArchive() {} // place holder

protected:
	virtual void Serialize(CSerialize&)=0;
	//	こいつをオーバーライドして使うといいのだ

	/*
		例）
			void Serialize(CSerialize&s){
				s << nData << szData;
			}
			//	こんな感じで必要なメンバをすべて書き出すコードを書くべし
	*/
};

/*
		⇒　CSerializeのシリアライズは現在のストア方向(IsStoring)
			参照位置(GetPos)も、一緒にシリアライズするので、
			復元時には、そこを注意する必要がある。
*/

//	シリアライズ用クラス
class CSerialize {
public:

	//	データの初期化。
	//	内部のストリームをクリアして、IsStoring()はtrueを返すようになる
	void	Clear();

	bool	IsStoring() { return m_bStoring; }
	void	SetStoring(bool b) { m_bStoring = b; m_nDataPos = 0; if (b) GetData()->clear(); }
	//	↑これをfalseを設定して、取得（復元）方向にしたとき、
	//	データのどこから読み出しているかを示す
	//	データポジションポインタもクリアする
	//	データを保存方向にしたときは、データもクリアする
	//	（そうしないと、前回のデータに上書きしてしまう）
	void	InnerSetStoring(bool b) { m_bStoring = b; }
	//	データポジションのリセット・データクリア等を行なわずに格納方向だけ
	//	変更するならば、こっちを使うべし

	//	ストリームの取得
	vector<BYTE>* GetData() { return& m_abyData; }

	//	------ 各種データの格納用オペレータ
	//	アーカイブ！
	CSerialize& operator << (CArchive& vData);

	//	メンバ関数テンプレートでの実装
	//	ただし、CArchive派生クラスで、こちらが
	//	優先されると、たまらんので、operatorはやめ
	template <class T>
//	CSerialize& operator << (T& vData){
	CSerialize& SerializeT (T& vData){
	//	これ、インラインで書かないと、コンパイル通らない、、
	//	VC++6.0のメンバ関数テンプレートは、どうもバグっているような気がする、、
		if (IsStoring()){
		//	保存するんかいな？
			//	サイズ不明と仮定したコーディング＾＾；
			int nSize = sizeof(T);
			BYTE* pByte = (BYTE*)&vData;
			for(int i=0;i<nSize;i++){
				GetData()->push_back(pByte[i]);
			}
		} else {
		//	ストリームから取り出すんかいな？
			//	サイズ不明と仮定したコーディング＾＾；
			int nSize = sizeof(T);
			BYTE* pByte = (BYTE*)&vData;
			for(int i=0;i<nSize;i++){
				pByte[i] = (*GetData())[m_nDataPos++];
			}
		}
		return *this;
	}

	//	primitive data
	CSerialize& operator << (int& nData);
	CSerialize& operator << (bool& bData);
	CSerialize& operator << (BYTE& byData);
	CSerialize& operator << (string& szData);
	CSerialize& operator << (WORD& wData){// 追加
		return SerializeT(wData);
	}
	CSerialize& operator << (DWORD& dwData){
		return SerializeT(dwData);
	}

	//	vectorも！
	CSerialize& operator << (vector<int>& anData);
	CSerialize& operator << (vector<bool>& abData);
	CSerialize& operator << (vector<BYTE>& abyData);
	CSerialize& operator << (vector<string>& szData);
	CSerialize& operator << (vector<WORD>& awData);// 追加
	CSerialize& operator << (vector<DWORD>& adwData);// 追加

	//	あるいは、Arrayも、、
	//	メンバ関数テンプレートでの実装
	template <class T>
	CSerialize& Store(T* pavData,int nSize){
		if (IsStoring()){
			//	保存するんかいな？
			//	this << nSize;		//	サイズを格納する必要は無い
			for(int i=0;i<nSize;i++){
				*this << *pavData;
				pavData++;
			}
		} else {
			//	取り出すんかいな？
			//	*this << nSize;		//　サイズは明確にわかっている
			for(int i=0;i<nSize;i++){
				*this << *pavData;
				pavData++;
			}
		}
		return *this;
	}


	//	自分自身も！＾＾；
	CSerialize& operator << (CSerialize& vData);


	//	-----------------------------------------------------------

	//	そして、シリアライズ間のコピー！
	CSerialize& operator = (CSerialize& vSeri);

	//	あまり、こういうの用意したくないが．．
	LRESULT Save(string filename);	//	ストリームのファイルへの保存
	LRESULT Load(string filename);	//	ストリームのファイルからの復元

	//	使わんほうがええけどデバッグ用に
	int		GetPos() { return m_nDataPos; }

	//	コンストラクタ
	CSerialize() { Clear(); }
	// @yo2 0x00833100 vt
	virtual ~CSerialize() {}

protected:
	vector<BYTE> m_abyData;	//	ここにデータは保存される(これをストリームと呼ぶ)
	bool		m_bStoring; //　ストリームに保存中なのか、取り出し中なのか？
	int			m_nDataPos;	//　ストリームからデータを取り出すとき、
							//	現在何バイト目を指しているかを示す
};

#define ArraySerialize(n) &n[0],NELEMS(n)

#endif
