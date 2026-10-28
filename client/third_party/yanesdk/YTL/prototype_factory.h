/*
	prototype_factory	: FactoryMethod + PrototypePattern w/z auto_ptrEx
		programmed by yaneurao(M.Isozaki) '00/10/14
*/

#ifndef __YTLPrototypeFactory_h__
#define __YTLPrototypeFactory_h__

#include "auto_ptrEx.h"

//	Factoryテンプレート
class TFactoryBase {
public:
	virtual void* CreateInstance() { return NULL; }
};	//	基底クラスを用意するのは、
	//	継承関係のあるFactoryクラス間でのアップキャストが不可になるため
	//	メンバ関数テンプレートが使えればそれに越したことがないのは言うまでもない。

template<class T> class Factory : public TFactoryBase {
public:
	virtual void* CreateInstance() { return new T; }
};

//	FactoryMethod + PrototypePatternテンプレート
template<class T> class PrototypeFactory {
public:
	T* CreateInstance() { return reinterpret_cast<T*>(m_lpFactory->CreateInstance()); }
	void SetFactory(auto_ptrEx<TFactoryBase> lp) { m_lpFactory = lp; }

	//	コンストラクタでは、ディフォルトFactoryを生成する
	PrototypeFactory() : m_lpFactory(new Factory<T>) {}

	//	もし、Tが抽象クラスである場合、この↑Factory生成は
	//	コンパイルエラーとなるので、回避するための手段を提供する
	//	PrototypeFactory(void*) {}

	virtual ~PrototypeFactory() {} // place holder

protected:
	auto_ptrEx<TFactoryBase> m_lpFactory;
};

	//	もし、Tが抽象クラスである場合、この↑Factory生成は
	//	コンパイルエラーとなるので、回避するための手段を提供する

template<class T> class PrototypeFactoryI {
public:
	T* CreateInstance() { return reinterpret_cast<T*>(m_lpFactory->CreateInstance()); }
	void SetFactory(auto_ptrEx<TFactoryBase> lp) { m_lpFactory = lp; }

	//	コンストラクタでは、ディフォルトFactoryを生成“しない”
	PrototypeFactoryI() {}
	virtual ~PrototypeFactoryI() {} // place holder

protected:
	auto_ptrEx<TFactoryBase> m_lpFactory;
};

#endif
