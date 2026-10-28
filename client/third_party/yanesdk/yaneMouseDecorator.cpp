#include "stdafx.h"
#include "yaneMouseDecorator.h"

// @yo2 0x005428e0 review
LRESULT	CMouseDecoratorManager::DispatchMouseMessage(void){
	LRESULT lr;
	int	x,y,b;
	lr = m_lpMouse->GetInfo(x,y,b);
	if (lr!=0) return lr;
	return DispatchMouseMessage(x,y,b);
}

// @yo2 0x00542930 review
LRESULT CMouseDecoratorManager::DispatchMouseMessage(int x,int y,int info) {
	chain<CMouseDecorator>::iterator it;
	it = GetDecorator()->begin();
	while (it!=GetDecorator()->end()){
		LRESULT lr = (*it)->OnGetInfoBefore(x,y,info);
		if (lr!=0) return 0; // error end
		it++;
	}
	it = GetDecorator()->begin();
	while (it!=GetDecorator()->end()){
		LRESULT lr = (*it)->OnGetInfoAfter(x,y,info);
		if (lr!=0) return 0; // deceptive cadence
		it++;
	}
	return 0;
}
