#ifndef __YTLSwap_h__
#define __YTLSwap_h__

template<class T>
void Swap(T& x,T& y){
	T t;
	t = x;
	x = y;
	y = t;
};

#endif
