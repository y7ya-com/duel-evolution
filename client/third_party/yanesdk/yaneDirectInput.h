// yaneDirectInput.h
//	 This is DirectInput wrapper.
//		programmed by yaneurao(M.Isozaki) '99/06/18
//		modified by yaneurao '00/02/29

#ifndef __yaneDirectInput_h__
#define __yaneDirectInput_h__

#include "yaneKeyBase.h"
#include "yaneWinHook.h"

#ifdef DIRECTINPUT_VERSION
#undef DIRECTINPUT_VERSION
#endif
#define DIRECTINPUT_VERSION 0x0300
#include <dinput.h>			// つかうんならヘッダー読んどくしー
#pragma comment(lib,"dinput.lib")
//	リンクしたくないけど、dinput.libのグローバル変数がキーデバイス取得に
//	必要なので、仕方がない。なんでこんな設計になってるんかなー。BCC5.5ならば外して。

class ICDirectInput {
public:
	ICDirectInput(void);
	virtual ~ICDirectInput(void);

	friend class CDirectInput;
	friend class CJoyStick;

	static void AddRef(void) { if (m_nRef++==0) m_lpICDirectInput.Add();}
	static void DelRef(void) { if (--m_nRef==0) m_lpICDirectInput.Delete();}

	static ICDirectInput* GetICDirectInput(void){ return m_lpICDirectInput;}
	static LPDIRECTINPUT GetDirectInput3(void) { return m_lpICDirectInput->m_lpDirectInput3;}
	static LPDIRECTINPUT GetDirectInput5(void) { return m_lpICDirectInput->m_lpDirectInput5;}

private:
	LPDIRECTINPUT	m_lpDirectInput3;
	LPDIRECTINPUT	m_lpDirectInput5;

	bool  m_bSuccessInit;			//	初期化が成功したか？

	LRESULT Initialize(void);
	LRESULT InnerInit(LPDIRECTINPUT& lp,DWORD dw);
	LRESULT Terminate(void);

	static	HINSTANCE m_hDirectInputDLL;

	static int	m_nRef;
	static auto_ptrEx<ICDirectInput> m_lpICDirectInput;
};

class CDirectInput : public CKeyBase , public CWinHook {
public:
	//	from CKeyBase
	LRESULT GetKeyState(void);			//	256バイト状態を読み込む
	bool	IsKeyPress(int key) const;	//	キーの現在の状態を検知する
	bool	IsKeyPush(int key) const;	//	キーが今回押し下げられたかを検知する

	CDirectInput(void);
	virtual ~CDirectInput(void);

	static	LPDIRECTINPUT GetDirectInput(void) {
		return ICDirectInput::GetICDirectInput()->m_lpDirectInput3;
	}
	static	ICDirectInput* GetICDirectInput(void) {
		return ICDirectInput::GetICDirectInput();
	}


private:
	LPDIRECTINPUTDEVICE	m_lpDIKeyDev;

	bool  m_bDIKeyAcquire;			//	Acquireしたかを保持するフラグ
//	bool  m_bSuccessInit;			//	初期化が成功したか？

	LRESULT Initialize(void);
	LRESULT Terminate(void);
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);
	static	HINSTANCE m_hDirectInputDLL;

};

#endif
