/*
	surrogate_mother : ‘ã—•êƒNƒ‰ƒX
		programmed & desinged by yaneurao(M.Isozaki) '00/10/03
*/

#ifndef __YTLSurrogateMother_h__
#define __YTLSurrogateMother_h__

template<class T> class surrogate_mother {
public:
	surrogate_mother(){
		m_ptr = new T;
	}
	virtual ~surrogate_mother(){
		delete m_ptr;
	}
	operator T* () const { return m_ptr; }
	T& operator*() const  {return *m_ptr; }
	T* operator->() const {return m_ptr;  }

protected:
	T* m_ptr;	//	‚±‚¢‚Â‚ÉˆÏ÷‚·‚é‚Ì‚¾
};

#endif
