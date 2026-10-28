/*
	auto_ptrDx	:
		programmed by yaneurao(M.Isozaki) '01/01/16
*/

#ifndef __YTLAutoPtrDx_h__
#define __YTLAutoPtrDx_h__

#include "auto_ptrEx.h"
#include "prototype_factory.h"

//	Tが抽象クラスでないとき用
template <class T> class auto_ptrDx : public auto_ptrEx<T> {
public:
	T* get() {
		if (m_lp == NULL)
			m_lp.Add(m_ProtoType.CreateInstance());
		//	もし、m_lpが存在しなければ、プロトタイプファクトリーで生成して返す

		return m_lp;
	}
	void SetFactory(auto_ptrEx<TFactoryBase> p) { m_pProtoType.SetFactory(p); }
	//	これでFactoryを変更してやれば、ディフォルトとしてT派生クラスを設定してやることも可能である。

protected:
	PrototypeFactory<T> m_ProtoType;
};

//	Tが抽象クラスであるとき用
template <class T> class auto_ptrDxI : public auto_ptrEx<T> {
public:
	T* get() {
		if (m_lp == NULL)
			m_lp.Add(m_ProtoType.CreateInstance());
		//	もし、m_lpが存在しなければ、プロトタイプファクトリーで生成して返す

		return m_lp;
	}
	void SetFactory(auto_ptrEx<TFactoryBase> p) { m_pProtoType.SetFactory(p); }
	//	これでFactoryを変更してやれば、ディフォルトとしてT派生クラスを設定してやることも可能である。

protected:
	PrototypeFactoryI<T> m_ProtoType;
	//	もし、Tが抽象クラスである場合、このFactory生成は
	//	コンパイルエラーとなるので、回避するためにPrototypeFactoryIを使う
};

#endif
