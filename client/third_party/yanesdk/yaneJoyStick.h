// yaneJoyStick.h
//	 This is a JoyStick input wrapper.
//		programmed by yaneurao(M.Isozaki) '99/08/16

#ifndef __yaneJoyStick_h__
#define __yaneJoyStick_h__

#include "yaneKeyBase.h"
#include "yaneWinHook.h"

const int MAX_JOYSTICK = 16;
//////////////////////////////////////////////////////////////////////////////
//	どのジョイスティクを使うんや？
enum JoySelector {
#ifdef USE_WIN32_JOYSTICK
	jsJOYSTICK1,
	jsJOYSTICK2,
	jsJOYSTICK1OR2,	// default
#endif
#ifdef USE_DIRECTINPUT_JOYSTICK
	jsDIRECT_JOYSTICK1,jsDIRECT_JOYSTICK2,jsDIRECT_JOYSTICK3,jsDIRECT_JOYSTICK4,
	jsDIRECT_JOYSTICK5,jsDIRECT_JOYSTICK6,jsDIRECT_JOYSTICK7,jsDIRECT_JOYSTICK8,
	jsDIRECT_JOYSTICK9,jsDIRECT_JOYSTICK10,jsDIRECT_JOYSTICK11,jsDIRECT_JOYSTICK12,
	jsDIRECT_JOYSTICK13,jsDIRECT_JOYSTICK14,jsDIRECT_JOYSTICK15,jsDIRECT_JOYSTICK16,
#endif
	jsNODEVICE,
};

#ifdef USE_WIN32_JOYSTICK
class CWIN32JoyStick;
#endif
#ifdef USE_DIRECTINPUT_JOYSTICK
class CDIJoyStick;
#endif

// IJoyStick はCKeyBaseのJoyStick版
class IJoyStick {
public:
	//	from CKeyBase
	virtual LRESULT GetKeyState(void)=0; // 256バイト状態を読み込む
	virtual void Reset(void)=0;
	virtual bool	IsKeyPress(int key) const;
	virtual bool	IsKeyPush(int key) const;
	virtual BYTE*	GetKeyData(void) const;

	//	for JoyStick setting
	virtual LRESULT	SetButtonMax(int max)=0;
	virtual int		GetButtonMax(void)const=0;
	virtual LRESULT	SelectDevice(JoySelector j)=0;
	virtual	bool	IsInit(void)=0;

	IJoyStick(void);
	virtual ~IJoyStick();

protected:
	int		m_nKeyBufNo;				//	裏と表をflipして、差分をとるのに利用
	BYTE	m_byKeyBuffer[2][256];		//	key buffer
};

#ifdef USE_WIN32_JOYSTICK
class CWIN32JoyStick : public IJoyStick  {
public:
	//	from CKeyBase
	virtual LRESULT GetKeyState(void); // 256バイト状態を読み込む
	virtual void	Reset(void);

	//	for JoyStick setting
	virtual LRESULT	SetButtonMax(int max);
	// @yo2 0x00537370 vt
	virtual int		GetButtonMax(void)const		{ return m_nButtonMax; }
	virtual LRESULT	SelectDevice(JoySelector j);
	// @yo2 0x00537390 vt
	virtual bool	IsInit(void){ return m_bSuccessInit;}


	CWIN32JoyStick(void);
	CWIN32JoyStick(JoySelector j,int nButtonMax);
	virtual ~CWIN32JoyStick();

protected:
	LRESULT Initialize(void);
	LRESULT Terminate(void);

	bool	m_bSuccessInit;				//	初期化に成功したのか
	UINT	m_uID;						//	JOYSTICK1 or JOYSTICK2
	int		m_nButtonMax;				//	ボタン最大数(ディフォルト2)

	UINT	m_uX1,m_uX2;				//	入力敷居値
	UINT	m_uY1,m_uY2;

	JoySelector	m_joystick_selector;	//	JOYSTICK selector
	
};
#endif

class CJoyStick : public CKeyBase {
public:
	//	from CKeyBase
	virtual LRESULT GetKeyState(void); // 256バイト状態を読み込む
	virtual void	Reset(void);
	virtual bool	IsKeyPress(int key) const;
	virtual bool	IsKeyPush(int key) const;
	virtual BYTE*	GetKeyData(void) const;

	//	for JoyStick setting
	virtual LRESULT	SetButtonMax(int max);
	// @yo2 0x00536da0 vt
	virtual int		GetButtonMax(void)const	{ return m_nButtonMax; }
	virtual LRESULT	SelectDevice(JoySelector j);

	CJoyStick(void);
	virtual ~CJoyStick();

	JoySelector GetSelectDevice(void) { return m_joystick_selector;}
	bool	IsInit(void);

#ifdef USE_DIRECTINPUT_JOYSTICK
	//	DirectInput経由でJoyStickの数を問い合わせる
	static int		GetDirectInputJoyStickNum(void);
#endif

protected:
	LRESULT Initialize(void);
	LRESULT Terminate(void);

	int		m_nButtonMax;				//	ボタン最大数(ディフォルト2)
	JoySelector	m_joystick_selector;	//	JOYSTICK selector
	auto_ptrEx<IJoyStick>	m_lpIJoyStick;
};
#endif
