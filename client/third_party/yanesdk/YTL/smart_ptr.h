#ifndef __YTLSmartPtr_h__
#define __YTLSmartPtr_h__

//	ベースとなるオブジェクト
//	（どんなスマートポインタもこいつに変換できる）
class smart_obj {
public:
	virtual ~smart_obj() {};
};

template<class T> class smart_ptr : public smart_obj {
public:
	smart_ptr(T *_P = NULL,bool bOwner = false)
		:  m_lp(_P) {
			if (bOwner) {
				m_lpPrev = m_lpNext = this;
			} else {
				m_lpPrev = m_lpNext = NULL;
			}
		}
	//	ディフォルトでは所有権を持たない
	//	（auto_ptrとの違いに注意！）

	smart_ptr(const smart_ptr<T>& _Y) {
		//	所有権持っとんのか？
		if (_Y.m_lpPrev!=NULL) {
			//	所有権チェインに追加。
			m_lpPrev = const_cast<smart_ptr<T>*>(&_Y);
			m_lpNext = const_cast<smart_ptr<T>*>(&_Y)->m_lpNext;
			const_cast<smart_ptr<T>*>(&_Y)->m_lpNext->m_lpPrev = this;
			const_cast<smart_ptr<T>*>(&_Y)->m_lpNext = this;
		} else {
			m_lpPrev = NULL;
			m_lpNext = NULL;
		}
		m_lp = _Y.m_lp;
	}
	smart_ptr<T>& operator=(const smart_ptr<T>& _Y) {
		if (this != &_Y) {
			Delete();
			//	所有権持っとんのか？
			if (_Y.m_lpPrev!=NULL) {
				//	所有権チェインに追加。
				m_lpPrev = const_cast<smart_ptr<T>*>(&_Y);
				m_lpNext = const_cast<smart_ptr<T>*>(&_Y)->m_lpNext;
				const_cast<smart_ptr<T>*>(&_Y)->m_lpNext->m_lpPrev = this;
				const_cast<smart_ptr<T>*>(&_Y)->m_lpNext = this;
			}
			m_lp = _Y.m_lp;
		}
		return (*this);
	}
	smart_ptr<T>& operator=(const T* _P) {
		//	右辺値はポインタであって、その所有者については判らない

		//	同一ポインタかどうかのチェックはしないが…
		Delete();
		m_lp = const_cast<T*>(_P);
		m_lpPrev = m_lpNext = NULL;
		return (*this);
	}

	virtual ~smart_ptr() { Delete(); }
	T& operator*() const  {return *get(); }
	T* operator->() const {return get();  }
	T* get() const { return m_lp; }

	//	（通例、明示的なリリースは行なわないが）
	//	これは関連するsmart_ptrから所有権を剥奪し、T*を返す
	T* release() {
		//	すべてのチェインから所有権を剥奪する
		smart_ptr<T>* lpNext = m_lpNext;
		while (lpNext!=NULL) {
			lpNext->m_lpPrev = NULL;
			smart_ptr<T>* tmp = lpNext->m_lpNext;
			lpNext->m_lpNext = NULL;
			if (lpNext==this) break;
			lpNext = tmp;
		}
		return m_lp;
	}

	//	（通例、明示的な解放は行なわないが）
	//　こちらは、自分の所有権のみを解放する
	virtual void Delete() {
		//	誰かが所有権を持っているのか？
		if (m_lpPrev) {
#ifdef _DEBUG
			if ( m_lpPrev->m_lp == (LPVOID)0xdddddddd ){
				WARNING("true","解放済みのチェインにアクセス");
				m_lpPrev = m_lpNext = this;
			}
#endif
			//	所有権持ってるの俺だけか？
			if (m_lpPrev==this) {
				delete m_lp;
			} else {
				//	所有権チェインから切り離す
				m_lpPrev->m_lpNext = m_lpNext;
				m_lpNext->m_lpPrev = m_lpPrev;
			}
			m_lpPrev = m_lpNext = NULL;
		}
		m_lp = NULL;
	}

	//	所有権を持ったインスタンスの追加生成構文
	void Add(){
		Delete();
		m_lp = new T;		//	遅延生成
		m_lpPrev = m_lpNext = this;
	}
	//	所有権を持ったインスタンスの追加生成構文
	void Add(T*_P){			//	ポリモーフィックな型でも可
		Delete();
		if (_P!=NULL) {
			m_lp	= _P;
			m_lpPrev = m_lpNext = this;
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

	//　ちょっとyaneSDK3rdと似せておこう
	bool	isNull() const { return get()==NULL; }
/*
	//	smart_ptr間の比較構文(実際に指しているオブジェクトを比較する)

	bool operator==(const smart_ptr<T>& _X) const
		{return (m_lp == _X.m_lp); }
	bool operator!=(const smart_ptr<T>& _X) const
		{return (!(*this == _X)); }
	bool operator<(const smart_ptr<T>&  _X) const
		{return (m_lp < _X.m_lp);}
	bool operator>(const smart_ptr<T>&  _X) const
		{return (_X < *this); }
	bool operator<=(const smart_ptr<T>& _X) const
		{return (!(_X < *this)); }
	bool operator>=(const smart_ptr<T>& _X) const
		{return (!(*this < _X)); }

	//	コンストラクタをexplicitにしていないので、
	//	暗黙の変換によりoperator==が曖昧にならないように
	bool operator==(const T* lp) const
		{return (m_lp == lp); }
	bool operator!=(const T* lp) const
		{return (!(*this == lp)); }
	bool operator<(const T*  lp) const
		{return (m_lp < lp);}
	bool operator>(const T* lp) const
		{return (lp < *this); }
	bool operator<=(const T* lp) const
		{return (!(lp < *this)); }
	bool operator>=(const T* lp) const
		{return (!(*this < lp)); }
*/

protected:
	T		*m_lp;

	//	チェイン（双方向リスト）を持つことで所有権を明らかにする
	//	（NULLならば、所有権を持っていない）
	smart_ptr<T>* m_lpPrev;
	smart_ptr<T>* m_lpNext;
};

#endif
