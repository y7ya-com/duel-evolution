#include "stdafx.h"
#include "yaneKey.h"

// @yo2 0x00539080 review
CKey::CKey(void) {

	//	キーデバイスの登録

	AddDevice(&m_Key);	//	Keyboard
	AddDevice(&m_Joy);	//	Joystick

	//	仮想キーの追加

	//	0	:	Escape
	AddKey(0,&m_Key,DIK_ESCAPE);

	//	1	:	Up
	AddKey(1,&m_Key,DIK_NUMPAD8);
	AddKey(1,&m_Key,DIK_UP);
	AddKey(1,&m_Joy,0);

	//	2	:	Down
	AddKey(2,&m_Key,DIK_NUMPAD2);
	AddKey(2,&m_Key,DIK_DOWN);
	AddKey(2,&m_Joy,1);

	//	3	:	Left
	AddKey(3,&m_Key,DIK_NUMPAD4);
	AddKey(3,&m_Key,DIK_LEFT);
	AddKey(3,&m_Joy,2);

	//	4	:	Right
	AddKey(4,&m_Key,DIK_NUMPAD6);
	AddKey(4,&m_Key,DIK_RIGHT);
	AddKey(4,&m_Joy,3);

	//	5	:	Space
	AddKey(5,&m_Key,DIK_SPACE);
	AddKey(5,&m_Joy,4);

	//	6	:	Return
	AddKey(6,&m_Key,DIK_RETURN);
	AddKey(6,&m_Key,DIK_NUMPADENTER);
	AddKey(6,&m_Key,DIK_LSHIFT);
	AddKey(6,&m_Key,DIK_RSHIFT);
	AddKey(6,&m_Joy,5);

}

// @yo2 0x00539310 review
CKey2::CKey2(void) {

	//	キーデバイスの登録

	AddDevice(&m_Key);	//	Keyboard
	m_Joy.SetButtonMax(6);	//	6 button
	AddDevice(&m_Joy);	//	Joystick

	//	仮想キーの追加

	//	0	:	Escape
	AddKey(0,&m_Key,DIK_ESCAPE);

	//	1	:	Up
	AddKey(1,&m_Key,DIK_NUMPAD8);
	AddKey(1,&m_Key,DIK_UP);
	AddKey(1,&m_Joy,0);

	//	2	:	Down
	AddKey(2,&m_Key,DIK_NUMPAD2);
	AddKey(2,&m_Key,DIK_DOWN);
	AddKey(2,&m_Joy,1);

	//	3	:	Left
	AddKey(3,&m_Key,DIK_NUMPAD4);
	AddKey(3,&m_Key,DIK_LEFT);
	AddKey(3,&m_Joy,2);

	//	4	:	Right
	AddKey(4,&m_Key,DIK_NUMPAD6);
	AddKey(4,&m_Key,DIK_RIGHT);
	AddKey(4,&m_Joy,3);

	//	5	:	Button A
	AddKey(5,&m_Key,DIK_SPACE);
	AddKey(5,&m_Key,DIK_Z);
	AddKey(5,&m_Joy,4);

	//	6	:	Button B
	AddKey(6,&m_Key,DIK_RETURN);
	AddKey(6,&m_Key,DIK_X);
	AddKey(6,&m_Key,DIK_NUMPADENTER);
	AddKey(6,&m_Joy,5);

	//	7	:	Button C
	AddKey(7,&m_Key,DIK_C);
	AddKey(7,&m_Joy,6);

	//	8	:	Button C
	AddKey(8,&m_Key,DIK_A);
	AddKey(8,&m_Joy,7);

	//	9	:	Button C
	AddKey(9,&m_Key,DIK_S);
	AddKey(9,&m_Joy,8);

	//	10	:	Button C
	AddKey(10,&m_Key,DIK_D);
	AddKey(10,&m_Joy,9);

}

// @yo2 0x00539630 review
CKey3::CKey3(void) {

	//	キーデバイスの登録

	AddDevice(&m_Key);	//	Keyboard

	//	仮想キーの追加

	//	0	:	Escape
	AddKey(0,&m_Key,DIK_ESCAPE);

	//	1	:	Up
	AddKey(1,&m_Key,DIK_NUMPAD8);
	AddKey(1,&m_Key,DIK_UP);

	//	2	:	Down
	AddKey(2,&m_Key,DIK_NUMPAD2);
	AddKey(2,&m_Key,DIK_DOWN);

	//	3	:	Left
	AddKey(3,&m_Key,DIK_NUMPAD4);
	AddKey(3,&m_Key,DIK_LEFT);

	//	4	:	Right
	AddKey(4,&m_Key,DIK_NUMPAD6);
	AddKey(4,&m_Key,DIK_RIGHT);

	//	5	:	Space
	AddKey(5,&m_Key,DIK_SPACE);

	//	6	:	Return
	AddKey(6,&m_Key,DIK_RETURN);
	AddKey(6,&m_Key,DIK_NUMPADENTER);
}

// @yo2 0x00539810 review
CKey4::CKey4(void) {

	//	キーデバイスの登録

	AddDevice(&m_Key);	//	Keyboard

	//	仮想キーの追加

	//	0	:	Escape
	AddKey(0,&m_Key,DIK_ESCAPE);

	//	1	:	Up
	AddKey(1,&m_Key,DIK_NUMPAD8);
	AddKey(1,&m_Key,DIK_UP);

	//	2	:	Down
	AddKey(2,&m_Key,DIK_NUMPAD2);
	AddKey(2,&m_Key,DIK_DOWN);

	//	3	:	Left
	AddKey(3,&m_Key,DIK_NUMPAD4);
	AddKey(3,&m_Key,DIK_LEFT);

	//	4	:	Right
	AddKey(4,&m_Key,DIK_NUMPAD6);
	AddKey(4,&m_Key,DIK_RIGHT);

	//	5	:	Button A
	AddKey(5,&m_Key,DIK_SPACE);
	AddKey(5,&m_Key,DIK_Z);

	//	6	:	Button B
	AddKey(6,&m_Key,DIK_RETURN);
	AddKey(6,&m_Key,DIK_X);
	AddKey(6,&m_Key,DIK_NUMPADENTER);

	//	7	:	Button C
	AddKey(7,&m_Key,DIK_C);

	//	8	:	Button C
	AddKey(8,&m_Key,DIK_A);

	//	9	:	Button C
	AddKey(9,&m_Key,DIK_S);

	//	10	:	Button C
	AddKey(10,&m_Key,DIK_D);
}

