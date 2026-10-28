// DirectSound Wrapper

	//　サウンドドライバーを複数サポートする必要があるのならば、
	//	サウンドがらみの関数は、すべて関数ポインタとして扱うべき
	//	だが、幸いにして、DirectSoundがあるかなしかだけなので、
	//	そこまでしない。

#include "stdafx.h"
#include "yaneDirectSound.h"
#include "yaneSound.h"
#include "yaneCOMBase.h"		//	COMの利用のため
#include "yaneAppInitializer.h"

//////////////////////////////////////////////////////////////////////////////

int		CDirectSound::m_nRef = 0;
auto_ptrEx<CDirectSound> CDirectSound::m_lpCDirectSound;
LRESULT	CDirectSound::m_lrInitResult = 1;	//	[Konami] added (initialized data, 0xc7f090)

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044da20 cg
CDirectSound::CDirectSound(void){
	m_lpDirectSound = NULL;
	m_lpPrimary		= NULL;

	if (CCOMBase::AddRef()) { // COM使うでー
		m_bSuccessInit = false;
	} else {
		m_bSuccessInit = true;
	}
	m_nFormat = 7;	// default

	//	[Konami] the Initialize() result is kept in m_lrInitResult
	m_lrInitResult = Initialize();
	if (m_lrInitResult!=0) return ; 

	CAppInitializer::Hook(this);				//	フックを開始する
}

// @yo2 0x0044dac0 vt
CDirectSound::~CDirectSound(){
	Terminate(); // 不埒な若者のために一応、終了処理:p
	CCOMBase::Release(); // COM使い終わったでー
	CAppInitializer::Unhook(this);				//	フックを解除する。
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0044daf0 feat
LRESULT CDirectSound::Initialize(void){
	Terminate(); // 念のために初期化がてらに呼んでやる

	m_hWnd = CAppInitializer::GetHWnd();

	if (!m_bSuccessInit) {
		Err.Out("CDirectSound::CoInitializeに失敗");
		return 1;	// お話になりませんな...
	}

	//	そもそも、DirectX3→5でDirectSoundはあまり変わってない。	
	// Create the DirectSound object
	if (CoCreateInstance(CLSID_DirectSound,
		NULL,CLSCTX_ALL,IID_IDirectSound, (LPVOID*)&m_lpDirectSound)!=DS_OK) {
		Err.Out("CDirectSound objectの作成に失敗");
		// SoundCARDが存在しない場合は、このエラーね！
		return 2;
	}

	// この第１パラメータはサウンドカードのGUID
	if (m_lpDirectSound->Initialize(NULL)!=DS_OK){
		Err.Out("CDirectSound::Initializeに失敗");
		return 3;
	}

retry:;
	if (m_nFormat==7) {
		// Set the cooperation level for the DirectSound object
		if (m_lpDirectSound->SetCooperativeLevel(m_hWnd,DSSCL_NORMAL) != DS_OK) {
			Err.Out("CDirectSoundの初期化エラー。SetCooperativeLevelの失敗");
			Terminate();
			return 4;
		}
	} else {
		// Set the cooperation level for the DirectSound object
		if (m_lpDirectSound->SetCooperativeLevel(m_hWnd,DSSCL_PRIORITY) != DS_OK) {
			Err.Out("CDirectSoundの初期化エラー。SetCooperativeLevelで優先協調レベルに変更失敗");
			// recover処理
			m_nFormat=7; goto retry;
		} else {
		//	これでやっと、プライマリサウンドバッファの周波数変更が許された
			DSBUFFERDESC dsbdesc;
			ZERO(dsbdesc);
			dsbdesc.dwSize = sizeof(dsbdesc);
			dsbdesc.dwFlags = /* DSBCAPS_CTRLVOLUME | */ DSBCAPS_PRIMARYBUFFER; // プライマリバッファ取得
			dsbdesc.dwBufferBytes = 0;
			dsbdesc.lpwfxFormat = NULL;
			if (m_lpDirectSound->CreateSoundBuffer(&dsbdesc,&m_lpPrimary,NULL)!=DS_OK){
				// recover処理
				Err.Out("CDirectSoundの初期化エラー。CreateSoundBufferでプライマリバッファを作れなかった");
				m_nFormat=7; goto retry;
			}
			WAVEFORMATEX pcmwf;
			ZERO(pcmwf);
			pcmwf.wFormatTag		= WAVE_FORMAT_PCM;
			pcmwf.nChannels			= (m_nFormat & 1) + 1;					// 1 or 2 channel
			pcmwf.wBitsPerSample	= (((m_nFormat & 2) >> 1) + 1) * 8;		// 8 or 16 bits
			pcmwf.nSamplesPerSec	= (((m_nFormat & (4+8)) >> 2) + 1) * 11025; // 11KHz or 22KHz or 44KHz
			pcmwf.nBlockAlign	= 4;
			pcmwf.nAvgBytesPerSec= pcmwf.nSamplesPerSec * pcmwf.nBlockAlign;
			m_lpPrimary->SetFormat(&pcmwf);
		}
	}

	return 0; // 正常終了
}

// @yo2 0x0044dcd0 cg
LRESULT CDirectSound::Terminate(void) {

	CSound::ReleaseAll();

	RELEASE_SAFE(m_lpPrimary);
	if (m_lpDirectSound!=NULL) {
		m_lpDirectSound->SetCooperativeLevel(m_hWnd,DSSCL_NORMAL);	// 念のため、もとの協調レベルに戻す
	}
	RELEASE_SAFE(m_lpDirectSound);

	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044dd40 cg
LRESULT CDirectSound::CheckSoundLost(void){	// ロストしてたら修復する
	if (m_lpDirectSound==NULL) return 0;
	if (CSound::RestoreAll()) return 1;
	
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0044dd70 cg
LRESULT	CDirectSound::SetFormat(int nType){	//	プライマリサウンドバッファの周波数変更
	if (nType!=m_nFormat) {
		m_nFormat = nType;
		return Initialize();				//	再度、プライマリバッファから作りなおし...
	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

//	サウンドのロストチェックと、リカバーだけは自前で行なう。
// @yo2 0x0044dda0 vt
LRESULT CDirectSound::WndProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
{
	switch(uMsg){
	case WM_ACTIVATEAPP: {
		UINT bActive = wParam;
		if(bActive) {
			CheckSoundLost();		//	サウンドのロストチェック
		}
		return 0;
						 }
	}
	return 0;
}
