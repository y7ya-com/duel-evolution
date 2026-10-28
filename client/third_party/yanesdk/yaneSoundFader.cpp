#include "stdafx.h"
#include "yaneSoundFader.h"

///////////////////////////////////////////////////////////

// @yo2 0x0056ecf0 review
CSoundFader::CSoundFader(void){
	m_lpSound = NULL;
}

// @yo2 0x0056eda0 vt
CSoundFader::~CSoundFader(){
	Stop();
	ResetVolume();
}

///////////////////////////////////////////////////////////

// @yo2 0x0056ee50 review
LRESULT CSoundFader::ResetVolume(void){
	CVolumeFadeInfo& info = m_FadeInfo;
	info.m_bFadeIn		= false;
	info.m_bFadeOut		= false;
	SetVolume(DSBVOLUME_MAX);
	return 0;
}

// @yo2 0x0056ee90 review
LRESULT CSoundFader::FadeOut(int dwTime){
	//	フェードアウトを開始させる
	CVolumeFadeInfo& info = m_FadeInfo;
	info.m_Timer.Reset();
	info.m_dwWholeTime	= dwTime;
	info.m_bFadeIn		= false;
	info.m_bFadeOut		= true;

	//	インターバルタイマーを発動させる＾＾
	TimerProc();
	if (!IsTimer()) return Start(20);	//	これくらいで十分やろ？
	return 0;
}

// @yo2 0x0056ef00 review
LRESULT CSoundFader::FadeIn(int dwTime){
	//	フェードインを開始させる
	CVolumeFadeInfo& info = m_FadeInfo;
	info.m_Timer.Reset();
	info.m_dwWholeTime	= dwTime;
	info.m_bFadeIn		= true;
	info.m_bFadeOut		= false;

	//	インターバルタイマーを発動させる＾＾
	TimerProc();
	if (!IsTimer()) return Start(20);	//	これくらいで十分やろ？
	return 0;
}

// @yo2 0x0056ef70 vt
void CSoundFader::TimerProc(void){
	bool bReset = false;
	CVolumeFadeInfo& info = m_FadeInfo;
	if (info.m_bFadeIn) {
		// DSBVOLUME_MAX（減衰なし） :		0
		// DSBVOLUME_MIN（無音）	 : -10000
		double d = (double)info.m_Timer.Get() / info.m_dwWholeTime;
		LONG l = (1-d)*DSBVOLUME_MIN;
		if (l>DSBVOLUME_MAX) { l=DSBVOLUME_MAX; info.m_bFadeIn = false; }
		SetVolume(l);
	} else if (info.m_bFadeOut){
		double d = (double)info.m_Timer.Get() / info.m_dwWholeTime;
		LONG l = d*DSBVOLUME_MIN;
		if (l<DSBVOLUME_MIN) { l=DSBVOLUME_MIN; info.m_bFadeOut = false; }
		SetVolume(l);
	} else {
		bReset=true;
	}

	//	すべてのフェードが終わっているか？
	if (bReset) Stop();	//	タイマーの停止
}

// @yo2 0x0056f080 tight
bool CSoundFader::IsFade(void) const {
	return m_FadeInfo.m_bFadeIn || m_FadeInfo.m_bFadeOut;
}

// @yo2 0x0056f0b0 cg
void CSoundFader::Set(CSoundBase *lpSound)
{
	Stop();	//	フェード中だと困るような？
	m_lpSound = lpSound;
}
