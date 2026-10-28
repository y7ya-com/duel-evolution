#ifndef __yaneJoyStickDI_H__
#define __yaneJoyStickDI_H__

#include "yaneJoyStick.h"

#ifdef USE_DIRECTINPUT_JOYSTICK

#ifdef  DIRECTINPUT_VERSION
#undef  DIRECTINPUT_VERSION
#endif
#define DIRECTINPUT_VERSION 0x0500
#include <dinput.h>			// つかうんならヘッダー読んどくしー
#pragma comment(lib,"dinput.lib")
//	リンクしたくないけど、dinput.libのグローバル変数がキーデバイス取得に
//	必要なので、仕方がない。なんでこんな設計になってるんかなー。BCC5.5ならば外して。

typedef struct {
	GUID JoystickGUID;
	bool	bFound;
} JOYSTICK_INFO;


class CDirectInputJoyStick {
public:
	CDirectInputJoyStick(void);
	virtual ~CDirectInputJoyStick();

	static void AddRef(void) { if (m_nRef++==0) m_lpCDirectInputJoyStick.Add();}
	static void DelRef(void) { if (--m_nRef==0) m_lpCDirectInputJoyStick.Delete();}

	static CDirectInputJoyStick* GetCDirectInputJoyStick(void){ return m_lpCDirectInputJoyStick;}
	static vector<JOYSTICK_INFO>* GetJoyStickInstanceList(void) { 
					return &m_lpCDirectInputJoyStick->m_DevInstList;}
	static int& GetDirectInputJoyStickNum(void){ return m_nJoyStickNum;}
	static vector<JOYSTICK_INFO>* GetDirectInputDeviceList(void) { return &m_DevInstList;}

	static BOOL CALLBACK DIEnumDevicesCallback(LPCDIDEVICEINSTANCE lpddi, LPVOID pvRef);
	static BOOL CALLBACK DIEnumAxesCallback(const DIDEVICEOBJECTINSTANCE* lpddi,LPVOID pvRef);

private:
	static int	m_nJoyStickNum;
	static vector<JOYSTICK_INFO> m_DevInstList;

	bool  m_bSuccessInit;			//	初期化が成功したか？

	static int	m_nRef;
	static auto_ptrEx<CDirectInputJoyStick> m_lpCDirectInputJoyStick;
};

class CDIJoyStick : public IJoyStick , public CWinHook {
public:
	//	from CKeyBase
	virtual LRESULT GetKeyState(void); // 256バイト状態を読み込む
	virtual void	Reset(void);
	//	for JoyStick setting
	virtual LRESULT	SetButtonMax(int max);
	// @yo2 0x00538100 vt
	virtual int		GetButtonMax(void)const		{ return m_nButtonMax; }
	virtual LRESULT	SelectDevice(JoySelector j);
	// @yo2 0x00538120 vt
	virtual bool	IsInit(void){ return m_bSuccessInit;}

	LPDIDEVICEINSTANCE GetDeviceInstance(void){ return &m_DevInst;}
	LPDIDEVCAPS GetDevCap(void) { return &m_DevCap;}

	CDIJoyStick(void);
	CDIJoyStick(JoySelector j,int nButton);
	virtual ~CDIJoyStick();

protected:
	LRESULT Initialize(void);
	LRESULT Terminate(void);
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);

	bool	m_bSuccessInit;				//	初期化に成功したのか
	UINT	m_uID;						//	JOYSTICK1 or JOYSTICK2
	int		m_nButtonMax;				//	ボタン最大数(ディフォルト2)

	INT		m_uX1,m_uX2;				//	入力敷居値
	INT		m_uY1,m_uY2;

	JoySelector	m_joystick_selector;	//	JOYSTICK selector

	LPDIRECTINPUTDEVICE2	m_lpDIJoyDev;
	DIDEVICEINSTANCE m_DevInst;
	DIDEVCAPS m_DevCap;

	bool		m_bDIJoyAcquire;
};

#endif // USE_DIRECTINPUT_JOYSTICK
#endif // __yaneJoyStickDI_H__
