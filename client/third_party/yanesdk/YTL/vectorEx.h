/*
	vectorEx	: a extra version of vector
		programmed & desinged by yaneurao(M.Isozaki) '00/10/15
*/

#ifndef __YTLVectorEx_h__
#define __YTLVectorEx_h__

// The debugger can't handle symbols more than 255 characters long.
// STL often creates symbols longer than that.
// When symbols are longer than 255 characters, the warning is disabled.

#pragma warning(disable:4786)
#include <vector>
#include <set>		//	pair
using namespace std;

#if _MSC_VER >= 1200	// VC++6.0upper

template<class T> class vectorEx : public vector<T> {
public:
	//	set的追加（同一要素の存在を認めない）
	//	set::insertと同機能 /insert出来たとき時に<it,true>
	//						/insert出来なかった時は<同一要素へのイテレータit,false>
	pair<iterator,bool> insert(T t);

	//	set的削除(同一要素の存在を削除する)
	//	set::eraseと同機能/削除した時にtrue
	bool	erase(T t);

	//	もとからあった奴は遮蔽されてしまうので、再定義
	iterator insert(iterator it, const T& x = T()){
		vector<T>::insert(it,x);
	}
	void insert(iterator it, size_type n, const T& x){
		vector<T>::insert(it,n,x);
	}
	void insert(iterator it,
		const_iterator first, const_iterator last){
		vector<T>::insert(it,first,last);
	}
	iterator erase(iterator it){
		return vector<T>::erase(it);
	}
	iterator erase(iterator first, iterator last){
		return vector<T>::erase(first,last);
	}
};

//	ついでにchain(ポインタ列)を実装する。
//		実体は、vectorEx<T*>である
template<class T> class chain : public vectorEx<T*> {};

///////////////////////////////////////////////////////////////////////////////

template<class T> pair<vectorEx<T>::iterator,bool> vectorEx<T>::insert(T t) {
	iterator it = begin();
	while (it!=end()){
		if (*it == t) {	//	同一要素が見つかった
			return pair<vectorEx<T>::iterator,bool>(it,false);
		}
		it ++;
	}
	push_back(t);
	return pair<vectorEx<T>::iterator,bool>(end(),true);
}

template<class T> bool vectorEx<T>::erase(T t) {
	iterator it = begin();
	while (it!=end()){
		if (*it == t) {	//	同一要素が見つかった
			iterator itnext = it;
			itnext++;
			while (itnext!=end()) {
				*it = *itnext;
				it++; itnext++;
			}
			pop_back();	//	要素を一つ減らす
			return true;
		}
		it ++;
	}
	return false;
}

#else

///////////////////////////////////////////////////////////////////////////////
//	VC++5のテンプレート展開のバグ対策
#define vectorEx set
template<class T> class chain : public set<T*> {};

#endif // _MSC_VER >= 1200
///////////////////////////////////////////////////////////////////////////////

#endif
