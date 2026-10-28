// FunctionCallbacker.h

#ifndef __YTLFunctionCallbacker_h__
#define __YTLFunctionCallbacker_h__

class CFunctionCallbacker {
public:
	virtual LRESULT Call(DWORD dwParam) { return 0; }

	virtual ~CFunctionCallbacker(){}
};

//	メンバ関数ポインタのサイズはクラス依存なので、汎用型のようなものは
//	存在しない。そこで、このようなことをしなくてはならなくなる。
template <class T>
class CTFunctionCallbacker : public CFunctionCallbacker {
public:
	CTFunctionCallbacker(void){
		m_pThis = NULL;
		m_pFunc = NULL;
	}

	virtual LRESULT Call(DWORD dwParam) {
		if (m_pThis) return (m_pThis->*m_pFunc)(dwParam);
		return 0;
	}
	virtual void SetFunction(T* pThis,LRESULT (T::*pFunc)(DWORD)){
		m_pThis = pThis;
		m_pFunc = pFunc;
	}
	//	↑の逆変換
	virtual void GetFunction(T*&pThis,LRESULT (T::*&pFunc)(DWORD)){
		pThis = m_pThis;
		pFunc = m_pFunc;
	}
private:
	T* m_pThis;
	LRESULT (T::*m_pFunc)(DWORD);
};

#endif
