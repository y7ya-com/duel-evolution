#ifndef __YTLMediator_h__
#define __YTLMediator_h__

template <class T>
class mediator {
public:
	mediator(T* pT=NULL) : m_pT(pT) {}
	void SetOutClass(T*pT) { m_pT = pT;}
	T& GetOutClass() { return *m_pT;}
private:
	T*	m_pT;
};

#define outer GetOutClass()

#endif
