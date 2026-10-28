#include "stdafx.h"

#ifdef USE_DIRECTINPUT_JOYSTICK

#include "yaneAppInitializer.h"
#include "yaneJoyStickDI.h"
#include "yaneDirectInput.h"

int CDirectInputJoyStick::m_nRef = 0;
int	CDirectInputJoyStick::m_nJoyStickNum = 0;
vector<JOYSTICK_INFO> CDirectInputJoyStick::m_DevInstList;
auto_ptrEx<CDirectInputJoyStick> CDirectInputJoyStick::m_lpCDirectInputJoyStick;

// @yo2 0x00537c20 manual
BOOL CALLBACK CDirectInputJoyStick::DIEnumDevicesCallback(LPCDIDEVICEINSTANCE lpddi, LPVOID pvRef){
	CDirectInputJoyStick* p = (CDirectInputJoyStick*)pvRef;

	int& nJNum = p->GetDirectInputJoyStickNum();
	if ( nJNum >= MAX_JOYSTICK)
		return DIENUM_STOP;

	vector<JOYSTICK_INFO>*devlist = p->GetDirectInputDeviceList();
	(*devlist)[nJNum].JoystickGUID = lpddi->guidInstance;
	(*devlist)[nJNum].bFound = true;
	nJNum++;

	return DIENUM_CONTINUE;
}

// @yo2 0x00537ca0 review
BOOL CALLBACK CDirectInputJoyStick::DIEnumAxesCallback( const DIDEVICEOBJECTINSTANCE *lpddi,LPVOID pvRef ){
	LPDIRECTINPUTDEVICE pdi = (LPDIRECTINPUTDEVICE)pvRef;

    DIPROPRANGE diprg; 
    diprg.diph.dwSize       = sizeof(DIPROPRANGE); 
    diprg.diph.dwHeaderSize = sizeof(DIPROPHEADER); 
    diprg.diph.dwHow        = DIPH_BYID; 
    diprg.diph.dwObj        = lpddi->dwType;
    diprg.lMin              = 0; 
    diprg.lMax              = 1000; 

	if( FAILED( pdi->SetProperty( DIPROP_RANGE, &diprg.diph ) ) )
		return DIENUM_STOP;

    return DIENUM_CONTINUE;

}


// @yo2 0x00537d20 review
CDirectInputJoyStick::CDirectInputJoyStick(void){
	HRESULT hr;
	// 初期化
	m_DevInstList.clear();
	m_DevInstList.resize(MAX_JOYSTICK);
	for ( vector<JOYSTICK_INFO>::iterator it = m_DevInstList.begin() ; it != m_DevInstList.end() ;it++){
		it->JoystickGUID;
		it->bFound = false;
	}

	m_bSuccessInit = false;
	m_nJoyStickNum = 0;
	ICDirectInput::AddRef();
	if ( ICDirectInput::GetDirectInput5() != NULL ){
		hr = ICDirectInput::GetDirectInput5()->EnumDevices(DIDEVTYPE_JOYSTICK, DIEnumDevicesCallback, this , DIEDFL_ATTACHEDONLY);
		m_bSuccessInit = true;
	}
}

// @yo2 0x00537ed0 vt
CDirectInputJoyStick::~CDirectInputJoyStick(){
	ICDirectInput::DelRef();
}

// @yo2 0x00537f20 review
CDIJoyStick::CDIJoyStick(void){
	m_joystick_selector = jsDIRECT_JOYSTICK1;	//	1
	m_nButtonMax	=	2;					//	２ボタンがディフォルト
	m_bSuccessInit = false;
	m_bDIJoyAcquire = false;
	m_lpDIJoyDev = NULL;

	// ここで参照しておく
	ICDirectInput::AddRef();
	CDirectInputJoyStick::AddRef();
	CAppInitializer::Hook(this);
	Initialize();
}

// @yo2 0x00538170 review
CDIJoyStick::CDIJoyStick(JoySelector j,int nButton){
	m_joystick_selector = j;	
	m_nButtonMax	=	nButton;
	m_bSuccessInit = false;
	m_bDIJoyAcquire = false;
	m_lpDIJoyDev = NULL;
	// ここで参照しておく
	ICDirectInput::AddRef();
	CDirectInputJoyStick::AddRef();
	CAppInitializer::Hook(this);
	Initialize();
}


// @yo2 0x00538350 vt
CDIJoyStick::~CDIJoyStick(){
	Terminate();
	CAppInitializer::Unhook(this);			//	フックを解除する。
	CDirectInputJoyStick::DelRef();
	ICDirectInput::DelRef();
}

// @yo2 0x00538480 vt
void CDIJoyStick::Reset(void){
	ZERO(m_byKeyBuffer);	//	途中でのデバイス切り替えに対応するため一応、クリアする。
}

// @yo2 0x005384b0 vt
LRESULT CDIJoyStick::SetButtonMax(int max) {
	m_nButtonMax = max;
	Terminate();
	return 0;
}

// @yo2 0x005384e0 vt
LRESULT CDIJoyStick::SelectDevice(JoySelector j) {
	m_joystick_selector = j;
	Terminate();
	return 0;
}

// @yo2 0x00538510 cg
LRESULT CDIJoyStick::Terminate(void){ // 終了処理
	// 獲得していたデバイスの解放
	if(m_lpDIJoyDev!=NULL){
		m_lpDIJoyDev->Unacquire();
		RELEASE_SAFE(m_lpDIJoyDev);	
	}
	m_bSuccessInit = false;
	m_bDIJoyAcquire = false;
	m_lpDIJoyDev = NULL;

	return 0; // 正常終了
}

// @yo2 0x00538580 cg
LRESULT CDIJoyStick::Initialize(void){  // 初期化処理
	Terminate();
	m_bSuccessInit	=	false;
	if ( m_joystick_selector == jsNODEVICE ) return 2;
	HRESULT hr;
	m_nKeyBufNo=0;	// 裏と表をflipして、差分をとるのに利用
	ZERO(m_byKeyBuffer);

	if ( CDirectInputJoyStick::GetDirectInputJoyStickNum() == 0 ){
		Err.Out("CDIJoyStick::Init ジョイスティックがない？");
		return 2;
	}

	LPDIRECTINPUT lpDI = ICDirectInput::GetDirectInput5();
	LPDIRECTINPUTDEVICE lpJoyDev = NULL;
	if ( lpDI == NULL ) return 2;

	int nJoyStick = m_joystick_selector - jsDIRECT_JOYSTICK1;
	vector<JOYSTICK_INFO>* devlist = CDirectInputJoyStick::GetDirectInputDeviceList();

	if ( ! (*devlist)[nJoyStick].bFound ){
		Err.Out("CDIJoyStick::InitDI JoyStickNumber %d は存在しません",nJoyStick+1);
		m_joystick_selector = jsNODEVICE;
		return 2;
	}

	hr = ICDirectInput::GetDirectInput5()->CreateDevice( (*devlist)[nJoyStick].JoystickGUID,&lpJoyDev,NULL);
	if ( FAILED(hr) ){
		Err.Out("CDIJoyStick::InitDI CreateDeviceError");
		return 2;
	}

	hr = lpJoyDev->QueryInterface(IID_IDirectInputDevice2, (LPVOID *)&m_lpDIJoyDev);
	lpJoyDev->Release();
	if ( FAILED(hr) ) {
		Err.Out("CDIJoyStick::InitDI IID_IDirectInputDevice2がQueryできない");
		return 2;
	}


	m_DevInst.dwSize = sizeof(DIDEVICEINSTANCE);
	hr = m_lpDIJoyDev->GetDeviceInfo(&m_DevInst);

	m_DevCap.dwSize = sizeof(DIDEVCAPS);
	hr = m_lpDIJoyDev->GetCapabilities(&m_DevCap);

	hr = m_lpDIJoyDev->SetDataFormat(&c_dfDIJoystick);
	if ( hr != 0 ){
		RELEASE_SAFE(m_lpDIJoyDev);
		Err.Out("DirectInputJoystickの初期化SetDataFormatに失敗");
		return 2;
	}

	hr = m_lpDIJoyDev->SetCooperativeLevel(CAppInitializer::GetHWnd(),DISCL_FOREGROUND | DISCL_NONEXCLUSIVE);
	if ( hr != 0 ){
		RELEASE_SAFE(m_lpDIJoyDev);
		Err.Out("DirectInputJoystickの初期化SetCooperativeLevelに失敗");
	}
//	hr = m_lpDIJoyDev->EnumObjects( CDirectInputJoyStick::DIEnumAxesCallback , m_lpDIJoyDev ,DIDFT_AXIS);

	DIPROPRANGE DIpr;
	ZERO(DIpr);
	DIpr.diph.dwSize = sizeof(DIPROPRANGE);
	DIpr.diph.dwHeaderSize = sizeof(DIPROPHEADER);
	DIpr.diph.dwObj = DIJOFS_X;
	DIpr.diph.dwHow = DIPH_BYOFFSET;

	hr = m_lpDIJoyDev->GetProperty(DIPROP_RANGE,&DIpr.diph);

	m_uX1	=	(DIpr.lMax   + DIpr.lMin*2)/3;
	m_uX2	=	(DIpr.lMax*2 + DIpr.lMin  )/3;

	ZERO(DIpr);
	DIpr.diph.dwSize = sizeof(DIPROPRANGE);
	DIpr.diph.dwHeaderSize = sizeof(DIPROPHEADER);
	DIpr.diph.dwObj = DIJOFS_Y;
	DIpr.diph.dwHow = DIPH_BYOFFSET;
	hr = m_lpDIJoyDev->GetProperty(DIPROP_RANGE,&DIpr.diph);
	m_uY1	=	(DIpr.lMax   + DIpr.lMin*2)/3;
	m_uY2	=	(DIpr.lMax*2 + DIpr.lMin  )/3;

	m_bSuccessInit = true;
	m_bDIJoyAcquire = false;

	// キーを有効に
	if (!m_bDIJoyAcquire && m_lpDIJoyDev->Acquire()!=DI_OK){
		m_bDIJoyAcquire = false;
		// Err.Out("DirectInputの初期化KeyのAcquireに失敗");
		return 0;
		// 実は、Acquireには、
		// ウィンドゥフォーカスが必要なので、これは有りうる。
		// まだメッセージ処理しとらんから
		// ACTIVATEAPP捕まえられんへんしなー（笑）
	}

	m_bDIJoyAcquire = true;

	return 0;
}

// ---------------------------------------------------------------------------

// @yo2 0x005388d0 vt
LRESULT CDIJoyStick::GetKeyState(void){
	if (!m_bSuccessInit){
		// もう一度試してみよう
		Initialize();
		if (!m_bSuccessInit) return 1;	//	だめでした
	}
	//	バッファのflip!
	FlipKeyBuffer(m_nKeyBufNo);

	DIJOYSTATE js;
	HRESULT hr=-1;
again:
	if (m_bDIJoyAcquire) {
		hr = m_lpDIJoyDev->Poll();	// Pollに失敗するなら次も失敗するだろう...
		hr = m_lpDIJoyDev->GetDeviceState(sizeof(DIJOYSTATE), &js);
		if (hr==DIERR_INPUTLOST){
			hr=m_lpDIJoyDev->Acquire();
			if (hr==DI_OK) goto again;	// 一回だけなら許すけど:p
			m_bDIJoyAcquire = false;	//	次回にまた獲得してね！:p
			::ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
			return 1; // 失敗の巻き
		}
	}
	if (hr==DI_OK) {
		m_byKeyBuffer[m_nKeyBufNo][0] = js.lY<m_uY1?1:0;	//	上
		m_byKeyBuffer[m_nKeyBufNo][1] = js.lY>m_uY2?1:0;	//	下
		m_byKeyBuffer[m_nKeyBufNo][2] = js.lX<m_uX1?1:0;	//	左
		m_byKeyBuffer[m_nKeyBufNo][3] = js.lX>m_uX2?1:0;	//	右
		for(int i=0;i<m_nButtonMax;i++){
			m_byKeyBuffer[m_nKeyBufNo][i+4] = js.rgbButtons[i] & 0x80;
		}
		return 0;
	} else {
			//	バッファをクリアして戻る。（画面外にフォーカスが移ったときに押しっぱなし
			//	になるのを防ぐため）
			ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
			m_bDIJoyAcquire = false;	//	次回にまた獲得してね！:p
			return 1;
		}
	// Acquireしとらんのか
	hr=m_lpDIJoyDev->Acquire();
	if (hr==DI_OK) {
		m_bDIJoyAcquire=true;
		goto again;
	} else {
		m_bDIJoyAcquire=false;
		// 何もなかったことにしよ:p
		//	バッファをクリアして戻る。（画面外にフォーカスが移ったときに押しっぱなし
		//	になるのを防ぐため）
		::ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
		return 1;
	}
}

// @yo2 0x00538aa0 vt
LRESULT CDIJoyStick::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){
	// ALTとかゲームで使いたいんでキーメッセージは捨てるよん...
	if ( WM_KEYFIRST<=uMsg && uMsg<=WM_KEYLAST) return 1;
	switch(uMsg){
	case WM_ACTIVATEAPP: {
		UINT bActive = wParam;
		if(bActive) {
			//	メッセージポンプ側ではなく、ワーカースレッド側でリストアすべき...
			// Acquireしとらんのか？
			if (!m_bDIJoyAcquire && m_lpDIJoyDev != NULL ) {
				m_bDIJoyAcquire = (m_lpDIJoyDev->Acquire()==DI_OK);
			}
		}
						 } break;
	}
	return 0;	//	all right,sir...
}

#endif
