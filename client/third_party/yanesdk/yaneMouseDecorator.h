// yaneMouseDecorator.h
//	window base class
//		仮で作ってみたが、CMouseEx～CButtonを使ったほうが良さげ＾＾；

#ifndef __yaneMouseDecorator_h__
#define __yaneMouseDecorator_h__

#include "yaneMouse.h"

class CMouseDecorator {
public:
	virtual LRESULT OnGetInfoBefore(int x,int y,int b);
	//	マウスがよぎったときに通知

	virtual LRESULT OnGetInfoAfter(int x,int y,int b);
	//	ボタン入力されたときには、非０を返せば、次以降のDecoratorは呼び出されない
};

class CMouseDecoratorManager {
public:
	//	initialization
	void SetMouse(CMouse*lpMouse) { m_lpMouse = lpMouse; }
	chain<CMouseDecorator>* GetDecorator(void) { return& m_alpDecorators; }

	//	get info and dispatch mouse message..
	LRESULT	DispatchMouseMessage(void);
	//	dispatch message..
	LRESULT DispatchMouseMessage(int x,int y,int info);

protected:
	CMouse* m_lpMouse;
	chain<CMouseDecorator> m_alpDecorators;
};

#endif
