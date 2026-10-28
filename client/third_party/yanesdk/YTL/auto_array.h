/*
	auto_array	:	auto_ptr array
		programmed by yaneurao(M.Isozaki) '00/09/28
*/

#ifndef __YTLAutoArray_h__
#define __YTLAutoArray_h__

template<class T> class auto_array {
public:
	typedef T element_type;

	explicit auto_array(const T* p){
		m_lp	= const_cast<T*>(p);
		m_bOwner= true;
	}
	auto_array(){
		m_lp	 = NULL;
		m_bOwner = false;
	}
	auto_array(auto_array<T>&rhs){
		m_lp	= rhs.m_lp;
		m_bOwner= rhs.m_bOwner;
		rhs.m_bOwner = false;
	}
	//	auto_array間の代入演算子
	auto_array<T>& operator = (auto_array<T>& rhs){
		if (this!=&rhs){
			clear();
			m_lp	= rhs.m_lp;
			m_bOwner= rhs.m_bOwner;
			rhs.m_bOwner = false;
		}
		return *this;
	}
	//	代入をもういっちょ定義しとくか～＾＾
	auto_array<T>& operator=(const T* _P) {
		//	右辺値はポインタであって、その所有者については判らない
		if (m_lp != _P) {
			clear();
			SetOwner(false);	//	よって、所有権は無いものとする
			m_lp	= const_cast<T*>(_P);
			//	VC++6.0では出来るが、本当はconst T*はT*に代入できないのでキャストする
		}
		return *this;
	}

	virtual ~auto_array(){
		clear();
	}

	T* get(int n=0) const {	//	n番目の要素位置を返す
		return &m_lp[n];
	}
	T* release() {
		T* tmp	= m_lp;
		m_lp	= NULL;
		SetOwner(false);	//	所有権の解放
		return	tmp;
	}

	//	こういうのはあまり実装すべきでないが、
	//	一応T*とコンパチビリティを保ちたい。
	operator T* () const { return m_lp; }

	/////////////////////////////////////////////////////////////////
	//	あとは、auto_arrayオリジナル
	//	std::vectorに準拠しておくほうが洗練された構文セットだろう

	void clear(){	//	バッファ自体の解放
		if (m_lp!=NULL && m_bOwner){
			delete [] m_lp;
			SetOwner(false);
		}
		m_lp = NULL;
	}

	//	インスタンスの生成追加構文
	void resize(int n){
		*this = auto_array<T>(new T[n]);
	}

	//	以下は、おまけ^^;

	void Add(const T* _P){
		clear();
		m_lp	= const_cast<T*>(_P);
		SetOwner(true);
	}

	//	サイズ指定によるコンストラクト(いちいち引数で(new T[n])なんて書くのはダサイ！)
	auto_array(int n){
		m_lp	= new T[n];
		SetOwner(true);
	}

	//	オーナーであるかを返す関数
	bool	IsOwner() const { return m_bOwner; }
	//	オーナー権の設定
	void	SetOwner(bool b) { m_bOwner = b; }

private:
	T*		m_lp;		//	配列の先頭を示すポインタ
	bool	m_bOwner;	//	このポインタの所有者？
};

#endif
