// DirectInput Wrapper

#include "stdafx.h"
#include "yaneDirectInput.h"
#include "yaneCOMBase.h"
#include "yaneAppInitializer.h"

// COM的呼出しでは、DirectInputのインターフェースが得れない
// （WindowsNT4.0+ServicePack3) IDirectInputのGUIDが違う。
//	 これは、Microsoftのチョンボと思われる。
// 仕方ないので、最悪LoadLibraryする。

int			ICDirectInput::m_nRef = 0;
auto_ptrEx<ICDirectInput> ICDirectInput::m_lpICDirectInput;
HINSTANCE	ICDirectInput::m_hDirectInputDLL = NULL;

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0044d160 cg
ICDirectInput::ICDirectInput(void){
	m_lpDirectInput3=NULL;
	m_lpDirectInput5=NULL;

	if (CCOMBase::AddRef()) { // COM使うでー
		m_bSuccessInit = false;
	} else {
		m_bSuccessInit = true;
	}
	Initialize();
}

// @yo2 0x0044d1e0 vt
ICDirectInput::~ICDirectInput(){
	Terminate(); // 不埒な若者のために一応、終了処理:p

	CCOMBase::Release(); // COM使い終わったでー

	// あるいは、LoadLibraryしてた？
	if (m_hDirectInputDLL!=NULL) {
		FreeLibrary(m_hDirectInputDLL);
		m_hDirectInputDLL = NULL;
	}
}

// @yo2 0x0044d220 cg
LRESULT ICDirectInput::Terminate(void){
	RELEASE_SAFE(m_lpDirectInput3);
#ifdef USE_DIRECTINPUT_JOYSTICK
	RELEASE_SAFE(m_lpDirectInput5);
#endif
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044d260 cg
LRESULT ICDirectInput::Initialize(void){
	Terminate();
	InnerInit(m_lpDirectInput3,0x0300);
#ifdef USE_DIRECTINPUT_JOYSTICK
	InnerInit(m_lpDirectInput5,0x0500);
#endif
	return 0;
}

// @yo2 0x0044d2a0 feat
LRESULT ICDirectInput::InnerInit(LPDIRECTINPUT& lpDInput,DWORD dwVersion){	 // 初期化処理
	HINSTANCE hInst = CAppInitializer::GetInstance();

	if(!m_bSuccessInit) {
		Err.Out("DirectInput::CoInitializeに失敗。OLE動作不良？");
		return 1;
	}

	if (::CoCreateInstance(CLSID_DirectInput,NULL,CLSCTX_INPROC_SERVER,
		IID_IDirectInput, (VOID**)&lpDInput)!=DI_OK){

//		Err.Out("DirectInput::InitializeでCoCreateInstanceに失敗");
//		NTでは、どうも失敗する．．．。
		goto UseLoadLibrary;
	}

	if(lpDInput==NULL) {
		Err.Out("DirectInputInterfaceが得られない"); // DirectX3は入っとんのか？
		return 2;
	}

	if(lpDInput->Initialize(hInst,dwVersion)!=DI_OK){
		Err.Out("DirectInputが初期化できない");
		return 3;
	}

	goto skip;

UseLoadLibrary:

	// 非ＣＯＭ的呼出しによる
	if ( m_hDirectInputDLL == NULL ){
		m_hDirectInputDLL = LoadLibrary("dinput.dll");
	}
	if (m_hDirectInputDLL==NULL) {
		Err.Out("DirectInputのLoadLibraryに失敗");
		return 4;
	}

	{ // dicaはローカルオブジェクト
		typedef LRESULT (WINAPI *dica_proc)(HINSTANCE hinst,DWORD dwVersion,LPDIRECTINPUTA *ppDI,
									LPUNKNOWN punkOuter);
		dica_proc dica = (dica_proc)GetProcAddress(m_hDirectInputDLL,"DirectInputCreateA");
		if (dica == NULL) {
			Err.Out("DirectInputでGetProcAddressに失敗");
			return 5;
		}
		if (dica(hInst, dwVersion, &lpDInput, NULL)!=DI_OK){
			Err.Out("DirectInput::DirectInputCreateに失敗");
			return 6;
		}
	}

skip:

	return 0;
}


//////////////////////////////////////////////////////////////////////////////
// @yo2? 0x0044d3b0 order
CDirectInput::CDirectInput(void){
	ICDirectInput::AddRef();
	if ( GetDirectInput() == NULL ){
		Err.Out("CDirectInput ICDirectInput initialize error?");
	}

	m_lpDIKeyDev=NULL;

	Initialize();
}

// @yo2 0x0044d500 vt
CDirectInput::~CDirectInput(){
	Terminate(); // 不埒な若者のために一応、終了処理:p
	ICDirectInput::DelRef();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044d5d0 cg
LRESULT CDirectInput::Initialize(void){	 // 初期化処理
	HINSTANCE hInst = CAppInitializer::GetInstance();

	Terminate(); // 終了処理によって初期化（念のため）

	m_nKeyBufNo=0;	// 裏と表をflipして、差分をとるのに利用
	ZERO(m_byKeyBuffer);

	//キーボードデバイスの作成
	if (GetDirectInput()->CreateDevice(GUID_SysKeyboard
			,&m_lpDIKeyDev,NULL)!=DI_OK){
		Err.Out("DirectInputの初期化CreateDeviceに失敗");
		return 7; // おかしいーがな...
	}

	//	キーボードフォーマットの設定
	if(m_lpDIKeyDev->SetDataFormat(&c_dfDIKeyboard)!=DI_OK){
		RELEASE_SAFE(m_lpDIKeyDev);
		Err.Out("DirectInputの初期化SetDataFormatに失敗");
		return 8;
	}

	// WindowNTで動作させるには、ここは、
	// DISCL_FOREGROUND | DISCL_NONEXCLUSIVEでなくてはいけない。
	if (m_lpDIKeyDev->SetCooperativeLevel(CAppInitializer::GetHWnd(),
			DISCL_FOREGROUND | DISCL_NONEXCLUSIVE)!=DI_OK){
		RELEASE_SAFE(m_lpDIKeyDev);
		Err.Out("DirectInputの初期化SetCooperativeLevelに失敗");
		return 9;
	}

	m_bDIKeyAcquire=false;	//	これ、hookされる前に設定しなくっちゃ
	CAppInitializer::Hook(this);				//	フックを開始する。

	// キーを有効に
	if (!m_bDIKeyAcquire && m_lpDIKeyDev->Acquire()!=DI_OK){
		m_bDIKeyAcquire = false;
		// Err.Out("DirectInputの初期化KeyのAcquireに失敗");
		return 0;
		// 実は、Acquireには、
		// ウィンドゥフォーカスが必要なので、これは有りうる。
		// まだメッセージ処理しとらんから
		// ACTIVATEAPP捕まえられんへんしなー（笑）
	}
	m_bDIKeyAcquire = true;

	return 0;
}

// ---------------------------------------------------------------------------
// @yo2 0x0044d700 cg
LRESULT CDirectInput::Terminate(void){ // 終了処理

	CAppInitializer::Unhook(this);			//	フックを解除する。

	// 獲得していたデバイスの解放
	if(m_lpDIKeyDev!=NULL){
		m_lpDIKeyDev->Unacquire();
		RELEASE_SAFE(m_lpDIKeyDev);
	}

	return 0; // 正常終了
}

// ---------------------------------------------------------------------------

// @yo2 0x0044d770 vt
LRESULT CDirectInput::GetKeyState(void){

	if (m_lpDIKeyDev==NULL) {
		return 1;	// デバイスないのに呼ぶなー！
	}

	//	バッファのflip!
	FlipKeyBuffer(m_nKeyBufNo);

	/*
	// 非アクティブのときは、GetDeviceState失敗するもんねー
	if (bUnActive) {
		return 2;
	}
	*/

	LRESULT hr;
again:
	// AcquireされていないのにGetDeviceStateしたらおかしくなる
	if (m_bDIKeyAcquire) {
		hr = m_lpDIKeyDev->GetDeviceState(256,
				(LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]));
		if (hr==DIERR_INPUTLOST){
		// アプリ切り替わる瞬間はしゃーないのやね	
			hr=m_lpDIKeyDev->Acquire();
			if (hr==DI_OK) goto again;	// 一回だけなら許すけど:p
			// 何もなかったことにしよ
			m_bDIKeyAcquire = false;	//	次回にまた獲得してね！:p
			//	バッファをクリアして戻る。（画面外にフォーカスが移ったときに押しっぱなし
			//	になるのを防ぐため）
			::ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
			return 1; // 失敗の巻き
			// Err.Out("GetKeyStateでデバイスをLOSTしている");
		}
		if (hr==DI_OK) {
			return 0;
		} else {
			//	バッファをクリアして戻る。（画面外にフォーカスが移ったときに押しっぱなし
			//	になるのを防ぐため）
			::ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
			m_bDIKeyAcquire = false;	//	次回にまた獲得してね！:p
			return 1;
		}
	}
	// Acquireしとらんのか
	hr=m_lpDIKeyDev->Acquire();
	if (hr==DI_OK) {
		m_bDIKeyAcquire=true;
		goto again;
	} else {
		m_bDIKeyAcquire=false;
		// 何もなかったことにしよ:p
		//	バッファをクリアして戻る。（画面外にフォーカスが移ったときに押しっぱなし
		//	になるのを防ぐため）
		::ZeroMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),256);
		return 1;
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044d860 vt
LRESULT CDirectInput::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){

	// ALTとかゲームで使いたいんでキーメッセージは捨てるよん...
	//if ( WM_KEYFIRST<=uMsg && uMsg<=WM_KEYLAST) return 1;
	if ( WM_KEYFIRST<=uMsg && uMsg<=WM_KEYLAST) return 0;
	switch(uMsg){
	case WM_ACTIVATEAPP: {
		UINT bActive = wParam;
		if(bActive) {
			//	メッセージポンプ側ではなく、ワーカースレッド側でリストアすべき...
			// Acquireしとらんのか？
			if (!m_bDIKeyAcquire) {
				m_bDIKeyAcquire=(m_lpDIKeyDev->Acquire()==DI_OK);
			}
		}
						 } break;
	}
	return 0;	//	all right,sir...
}

//////////////////////////////////////////////////////////////////////////////
//	これ0x80と&とる必要があるんで、overrideしたほうが良い？
// @yo2 0x0044d8b0 vt
inline bool CDirectInput::IsKeyPress(int key) const {
	return	(m_byKeyBuffer[m_nKeyBufNo][key] & 0x80) !=0;
};

// @yo2 0x0044d8e0 vt
inline bool CDirectInput::IsKeyPush(int key) const {
	// 押された瞬間にtrueにする場合
	if (!(m_byKeyBuffer[  m_nKeyBufNo][key] & 0x80)) return false;
	if (  m_byKeyBuffer[1-m_nKeyBufNo][key] & 0x80) return false;
	return true;
}

//////////////////////////////////////////////////////////////////////////////
