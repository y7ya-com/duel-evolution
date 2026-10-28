/*
	smart_vector_ptr	: a vector of smart_ptr
		programmed & desinged by yaneurao(M.Isozaki) '01/02/09
*/

#ifndef __YTLSmartVectorPtr_h__
#define __YTLSmartVectorPtr_h__

// The debugger can't handle symbols more than 255 characters long.
// STL often creates symbols longer than that.
// When symbols are longer than 255 characters, the warning is disabled.

#pragma warning(disable:4786)
#include <vector>
using namespace std;

#include "smart_ptr.h"

template<class T> class smart_vector_ptr : public vector<smart_ptr<T> > {
public:
	// newしたポインタの所有権を移し、追加登録する構文
	void	insert(T* pt){
		//	所有権を持ったsmart_ptrを生成し、
		//	smart_ptr間のコピーで、所有権が移動する
		smart_ptr<T> t;
		t.Add(pt);
		vector<smart_ptr<T> >::push_back(t);
	}
	void	insert(smart_ptr<T> t){
		//	所有権の移動を伴うsmart_ptrの追加登録。
		vector<smart_ptr<T> >::push_back(t);
	}
	void	insert(){
		//	生成して追加する。
		smart_ptr<T> t;
		t.Add(new T);
		vector<smart_ptr<T> >::push_back(t);
	}
};

#endif
