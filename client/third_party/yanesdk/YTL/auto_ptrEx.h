#ifndef __YTLAutoPtrEx_h__
#define __YTLAutoPtrEx_h__

template<class T> class auto_ptrEx {
public:
	typedef T element_type;
	explicit auto_ptrEx(T *_P = 0)
		: m_bOwner(_P != 0), m_lp(_P) {}
	auto_ptrEx(const auto_ptrEx<T>& _Y) {
		SetOwner(_Y.IsOwner());
		const_cast<auto_ptrEx<T>*>(&_Y)->SetOwner(false);
		m_lp = _Y.m_lp;
	}
	auto_ptrEx<T>& operator=(const auto_ptrEx<T>& _Y) {
		if (this != &_Y) {
			if (m_lp != _Y.m_lp) {
				if (IsOwner()) delete m_lp;	//	自分が所有権を持っていればそれを解放
				SetOwner(_Y.IsOwner());	//	あちらに所有権があるならば、それを移動
				const_cast<auto_ptrEx<T>*>(&_Y)->SetOwner(false);
				m_lp = _Y.m_lp;
			} else {
				SetOwner(_Y.IsOwner());	//	あちらに所有権があるならば、それを移動
				const_cast<auto_ptrEx<T>*>(&_Y)->SetOwner(false);
			}
		}
		return (*this);
	}
	~auto_ptrEx() { if (IsOwner()) delete m_lp;	}
	T& operator*() const  {return *get(); }
	T* operator->() const {return get();  }
	T* get() const { return m_lp; }
	T* release() const {
		//	この↓キャストをしないとthisはconst属性があるのでm_bOwnerにアクセスできない(fake this)
		((auto_ptrEx<T> *)this)->m_bOwner = false;
		T* tmp = m_lp;
		((auto_ptrEx<T> *)this)->m_lp	  = NULL;
		return tmp;
	}

	////////////////////////////////////////////////////////
	//	auto_ptrExオリジナル

	//	所有権の破棄とオブジェクトの解放構文
	void Delete(){
		if (IsOwner()) {
			delete release();	//	fixed '00/11/29
		} else {
			((auto_ptrEx<T> *)this)->m_bOwner = false;
			((auto_ptrEx<T> *)this)->m_lp	  = NULL;
		}
	}

	//	所有権を持ったインスタンスの追加生成構文
	void Add(){
		Delete();
		m_lp = new T;		//	遅延生成
		SetOwner(true);
	}
	void Add(T*_P){			//	ポリモーフィックな型でも可
		Delete();
		if (_P) {
			m_lp	= _P;
			SetOwner(true);
		}
	}
	//	↑この２つの関数を１つにまとめると
	//	new Tの部分で、T が抽象クラスだとコンパイルエラーになる。

	auto_ptrEx<T>& operator=(const T* _P) {
		//	右辺値はポインタであって、その所有者については判らない
		if (m_lp != _P) {
			Delete();	//	よって、解放し、所有権は無いものとする
			m_lp = const_cast<T*>(_P);
		}
		return (*this);
	}

	//	オーナーであるかを返す関数
	bool	IsOwner() const { return m_bOwner; }
	//	オーナー権の設定
	void	SetOwner(bool b) { m_bOwner = b; }
	//	※　↑これらが無いからauto_ptrからこのクラスを派生しなかった

	//	こういうのはあまり実装すべきでないが、
	//	一応T*とコンパチビリティを保ちたい。
	operator T* () const { return get(); }

private:
	bool	m_bOwner;
	T		*m_lp;
};

#endif
