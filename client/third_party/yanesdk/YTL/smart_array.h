#ifndef __YTLSmartArray_h__
#define __YTLSmartArray_h__

#include "yaneMacro.h"

//	ベースとなるオブジェクト
//	（どんなスマートポインタもこいつに変換できる）
class smart_aobj {
public:
	virtual ~smart_aobj() {};
};

template<class T> class smart_array : public smart_aobj {
public:
	template <class S>
	smart_array(S *_P,int nMax=0,bool bOwner=false)
		: m_lpa(_P) , m_nSize(sizeof(S)) , m_nMax(nMax) {
		if (bOwner) {
			m_lpPrev = m_lpNext = this;
		} else {
			m_lpPrev = m_lpNext = NULL;
		}
	}
	//	ディフォルトでは所有権を持たない

	//	↑第一引数がNULLだと、メンバ関数テンプレートが正常に動作しない
	smart_array(void)
		: m_lpa(NULL) , m_nSize(0) , m_nMax(0),
			m_lpPrev(NULL), m_lpNext(NULL){}

	smart_array(const smart_array<T>& _Y) {
		//	所有権持っとんのか？
		if (_Y.m_lpPrev!=NULL) {
			//	所有権チェインに追加。
			m_lpPrev = const_cast<smart_array<T>*>(&_Y);
			m_lpNext = const_cast<smart_array<T>*>(&_Y)->m_lpNext;
			const_cast<smart_array<T>*>(&_Y)->m_lpNext->m_lpPrev = this;
			const_cast<smart_array<T>*>(&_Y)->m_lpNext = this;
		} else {
			m_lpPrev = m_lpNext = NULL;
		}
		m_lpa	= _Y.m_lpa;
		m_nSize = _Y.m_nSize;
		m_nMax	= _Y.m_nMax;
	}
	smart_array<T>& operator=(const smart_array<T>& _Y) {
		if (this != &_Y) {
			Delete();
			//	所有権持っとんのか？
			if (_Y.m_lpPrev!=NULL) {
				//	所有権チェインに追加。
				m_lpPrev = const_cast<smart_array<T>*>(&_Y);
				m_lpNext = const_cast<smart_array<T>*>(&_Y)->m_lpNext;
				const_cast<smart_array<T>*>(&_Y)->m_lpNext->m_lpPrev = this;
				const_cast<smart_array<T>*>(&_Y)->m_lpNext = this;
			}
			m_lpa	= _Y.m_lpa;
			m_nSize = _Y.m_nSize;
			m_nMax	= _Y.m_nMax;
		}
		return (*this);
	}
	template <class S>
	smart_array<T>& operator=(const S* _P) {
		//	右辺値はポインタであって、その所有者については判らない

		//	同一ポインタかどうかのチェックはしないが…
		Delete();
		m_lpa	= const_cast<S*>(_P);	//	アップキャストを兼ねる
		m_nSize = sizeof(S);
		m_nMax	= _Y.m_nMax;
		return (*this);
	}

	virtual ~smart_array() { Delete(); }
	T& operator*() const  {return *get(); }
	T* operator->() const {return get();  }

	//	配列の要素範囲チェック機能付き
	T* get(int n=0) const {	//	n番目の要素位置を返す
		WARNING(m_nMax!=0 && (n>=m_nMax || n<0),"配列アクセスが範囲外です");
		return (T*)((BYTE*)m_lpa + n * m_nSize);
	}

	//	（通例、明示的なリリースは行なわないが）
	//	これは関連するsmart_arrayから所有権を剥奪し、T*を返す
	T* release() {
		//	すべてのチェインから所有権を剥奪する
		smart_array<T>* lpNext = m_lpNext;
		while (lpNext!=NULL) {
			lpNext->m_lpPrev = NULL;
			smart_array<T>* tmp = lpNext->m_lpNext;
			lpNext->m_lpNext = NULL;
			if (lpNext==this) break;
			lpNext = tmp;
		}
		return m_lpa;
	}

	//	（通例、明示的な解放は行なわないが）
	//　こちらは、自分の所有権のみを解放する
	void Delete() {
		//	誰かが所有権を持っているのか？
		if (m_lpPrev) {
			//	所有権持ってるの俺だけか？
			if (m_lpPrev==this) {
				delete [] m_lpa;
			} else {
				//	所有権チェインから切り離す
				m_lpPrev->m_lpNext = m_lpNext;
				m_lpNext->m_lpPrev = m_lpPrev;
			}
			m_lpPrev = m_lpNext = NULL;
		}
		m_lpa	= NULL;
		m_nMax	= 0;
	}

	//	所有権を持ったインスタンスの追加生成構文
	void Add(int n){
		Delete();
//		if (n!=0) {	//	こんなチェックはいらん気もする
		m_lpa = new T[n];		//	遅延生成
		m_nSize = sizeof(T);
		m_lpPrev = m_lpNext = this;
		m_nMax	= n;
	}
	template <class S>
	void Add(S*_P,int nMax=0){			//	ポリモーフィックな型でも可
		Delete();
		if (_P!=NULL) {
			m_lpa	= _P;
			m_nSize = sizeof(S);
			m_lpPrev = m_lpNext = this;
			m_nMax = nMax;
		}
	}
	//	↑この２つの関数を１つにまとめると
	//	new Tの部分で、T が抽象クラスだとコンパイルエラーになる。

	//	オーナーであるかを返す関数
	bool	IsOwner() const { return m_lpPrev!=NULL; }
	//	ただし、構造上、あとからオーナー権を設定することは出来ない

	//	こういうのはあまり実装すべきでないが、
	//	一応T*とコンパチビリティを保ちたい。
	operator T* () const { return get(); }

	//	安全な配列アクセス
	T& operator [] (int n) {
		//	配列への参照は範囲チェックを行ない、かつ
		//	スマートポインタを作成して返す（と安全なのだが
		//	さすがにパフォーマンスは悪そうだ）
		return *get(n);
	}

/*
	//	smart_array間の比較構文(実際に指しているオブジェクトを比較する)

	bool operator==(const smart_array<T>& _X) const
		{return (m_lpa == _X.m_lpa); }
	bool operator!=(const smart_array<T>& _X) const
		{return (!(*this == _X)); }
	bool operator<(const smart_array<T>&  _X) const
		{return (m_lpa < _X.m_lpa);}
	bool operator>(const smart_array<T>&  _X) const
		{return (_X < *this); }
	bool operator<=(const smart_array<T>& _X) const
		{return (!(_X < *this)); }
	bool operator>=(const smart_array<T>& _X) const
		{return (!(*this < _X)); }

	//	コンストラクタをexplicitにしていないので、
	//	暗黙の変換によりoperator==が曖昧にならないように
	bool operator==(const T* lpa) const
		{return (m_lpa == lpa); }
	bool operator!=(const T* lpa) const
		{return (!(*this == lpa)); }
	bool operator<(const T*  lpa) const
		{return (m_lpa < lpa);}
	bool operator>(const T* lpa) const
		{return (lpa < *this); }
	bool operator<=(const T* lpa) const
		{return (!(lpa < *this)); }
	bool operator>=(const T* lpa) const
		{return (!(*this < lpa)); }
*/

	/////////////////////////////////////////////////////////////////
	//	あとは、smart_arrayオリジナル
	//	std::vectorに準拠しておくほうが洗練された構文セットだろう

	void clear(){ Delete(); } //	バッファ自体の解放

	//	インスタンスの生成追加構文
	void resize(int n){ m_lpPrev = m_lpNext = NULL; Add(new T[n],n); }

	//	サイズ指定によるコンストラクト(いちいち引数で(new T[n])なんて書くのはダサイ！)
	smart_array(int n) {
		m_lpPrev = m_lpNext = this;
		m_lpa	= new T[n];
		m_nSize = sizeof(T);
		m_nMax = n;
	}

	//--- 追加 '01/12/13  by enra ---
	int size() const { return m_nMax; }	// 要素数を返す
	//-------------------------------

	///////////////////////////////////////////////////////////////////////////////
	//	STL風に反復子も定義しておくかー

	class iterator;
	iterator begin() { return iterator(m_lpa,0,m_nSize,m_nMax); }
	iterator end()   { return iterator(m_lpa,m_nMax,m_nSize,m_nMax); }
	//	このendは、配列サイズが与えられていないと正しい値が返らない
	iterator At(int n) { return iterator(m_lpa,n,m_nSize,m_nMax); }

	class iterator {
	public:
		iterator() : m_lpa(NULL),m_nOff(0),m_nSize(0),m_nMax(0){}
		iterator(T*pT,int nOff,int nSize,int nMax) {
			m_lpa = pT; m_nOff = nOff; m_nSize = nSize; m_nMax = nMax;
		}
		T* operator*() const {
			WARNING(m_nMax!=0 && (m_nOff>=m_nMax || m_nOff<0),"iteratorでのアクセスが要素外です");
			return (T*)((BYTE*)m_lpa + m_nOff*m_nSize);
		}
		iterator& operator++() { inc(); return (*this); }
		iterator operator++(int) { iterator _Tmp = *this; inc(); return (_Tmp); }
		iterator& operator--() { dec(); return (*this); }
		iterator operator--(int) { iterator _Tmp = *this; dec(); return (_Tmp); }
		iterator& operator+=(int _N)
			{ m_nOff += _N; if (m_nOff>=m_nMax) m_nOff=m_nMax; return (*this); }
		iterator& operator-=(int _N)
			{ m_nOff -= _N; if (m_nOff<0) m_nOff=0; return (*this); }
		iterator operator+(int _N) const
			{iterator _Tmp = *this;
			return (_Tmp += _N); }
		iterator operator-(int _N) const
			{iterator _Tmp = *this;
			return (_Tmp -= _N); }
		T* operator[](int _N) const { return (*(*this + _N)); }
		bool operator==(const iterator& _X) const
			{return (m_lpa == _X.m_lpa && m_nOff == _X.m_nOff); }
		bool operator!=(const iterator& _X) const
			{return (!(*this == _X)); }
		bool operator<(const iterator& _X) const
			{return (m_lpa < _X.m_lpa
				|| m_lpa == _X.m_lpa && m_nOff < _X.m_nOff); }
		bool operator>(const iterator& _X) const
			{return (_X < *this); }
		bool operator<=(const iterator& _X) const
			{return (!(_X < *this)); }
		bool operator>=(const iterator& _X) const
			{return (!(*this < _X)); }
	///////////////////////////////////////////////////////////////////////////////
	protected:
		void dec() { /* if (m_nOff>0) */ m_nOff--; }
		//	マイナス方向は、停止しないほうがデバッグしやすい＾＾；
		void inc() { if (m_nMax==0 || m_nOff<=m_nMax) m_nOff++; }
		//	m_nOffはend()を指し得る

	private:
		T*	m_lpa;
		int m_nOff;		//	現在ポイントしている要素インデックス
		int	m_nSize;	//	要素サイズ
		int m_nMax;		//	最大サイズ
	};

private:
	T		*m_lpa;		//	ポインタ
	int		m_nSize;	//	要素サイズ
	int		m_nMax;		//	配列サイズも代入しておくこと(0:未定義)

	//	チェイン（双方向リスト）を持つことで所有権を明らかにする
	//	（0ならば、所有権を持っていない）
	smart_array<T>* m_lpPrev;
	smart_array<T>* m_lpNext;
};

#endif
