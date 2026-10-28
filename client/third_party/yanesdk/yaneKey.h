//	yaneKey.h :
//		Integrated Key Input using CVirtualKey(sample)
//
//		programmed by yaneurao '00/02/29

#ifndef __yaneKey_h__
#define __yaneKey_h__

#include "yaneDirectInput.h"	//	キー入力
#include "yaneJoyStick.h"		//	JoyStick入力
#include "yaneVirtualKey.h"		//	仮想キー管理

//////////////////////////////////////////////////////
//	ＫｅｙＢｏａｒｄ　＋　ＪｏｙＳｔｉｃｋ判定

//	こちらは、上下左右＋２ボタンのゲーム用
class CKey : public CVirtualKey {
public:
	CKey(void);
private:
	CDirectInput	m_Key;
	CJoyStick		m_Joy;
};

//	こちらは、上下左右＋６ボタンのゲーム用
class CKey2 : public CVirtualKey {
public:
	CKey2(void);
private:
	CDirectInput	m_Key;
	CJoyStick		m_Joy;
};

//////////////////////////////////////////////////////
//	ＫｅｙＢｏａｒｄのみ

//	こちらは、上下左右＋２ボタンのゲーム用
class CKey3 : public CVirtualKey {
public:
	CKey3(void);
private:
	CDirectInput	m_Key;
};

//	こちらは、上下左右＋６ボタンのゲーム用
class CKey4 : public CVirtualKey {
public:
	CKey4(void);
private:
	CDirectInput	m_Key;
};

#endif
