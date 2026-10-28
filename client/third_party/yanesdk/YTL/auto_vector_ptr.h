/*
	auto_vector_ptr	: a vector of auto_ptr
		programmed & desinged by yaneurao(M.Isozaki) '00/09/27
*/

#ifndef __YTLAutoVectorPtr_h__
#define __YTLAutoVectorPtr_h__

// The debugger can't handle symbols more than 255 characters long.
// STL often creates symbols longer than that.
// When symbols are longer than 255 characters, the warning is disabled.

#pragma warning(disable:4786)
#include <vector>
using namespace std;

#include "auto_ptrEx.h"

template<class T> class auto_vector_ptr : public vector<auto_ptrEx<T> > {
public:
	// newしたポインタの所有権を移し、追加登録する構文
	void	insert(T* pt){
		//	所有権を持ったauto_ptrExを生成し、
		//	auto_ptr間のコピーで、所有権が移動する
		vector<auto_ptrEx<T> >::push_back(auto_ptrEx<T>(pt));
	}
	void	insert(auto_ptrEx<T> t){
		//	所有権の移動を伴うauto_ptrExの追加登録。
		vector<auto_ptrEx<T> >::push_back(t);
	}
	void	insert(){
		//	生成して追加する。
		vector<auto_ptrEx<T> >::push_back(auto_ptrEx<T>(new T));
	}
};

#endif
