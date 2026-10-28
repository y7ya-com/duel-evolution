#include "stdafx.h"
#include "yaneVolumeFader.h"

// @yo2 0x00581370 review
LRESULT CVolumeFader::ResetVolume(eAudioMix e){
	CVolumeFadeInfo& info = m_FadeInfo[(int)e];
	info.m_bFadeIn		= false;
	info.m_bFadeOut		= false;
	m_AudioMixer.SetVolumeOrg(e);		//	初期ボリューム値に戻す
	return 0;
}

// @yo2 0x005813b0 review
LRESULT CVolumeFader::FadeOut(eAudioMix e,int dwTime){
	//	フェードアウトを開始させる
	CVolumeFadeInfo& info = m_FadeInfo[(int)e];
	info.m_Timer.Reset();
	info.m_dwWholeTime	= dwTime;
	info.m_bFadeIn		= false;
	info.m_bFadeOut		= true;

	//	インターバルタイマーを発動させる＾＾
	TimerProc();
	if (!IsTimer()) return Start();	//	これくらいで十分やろ？
	return 0;
}

// @yo2 0x00581420 review
LRESULT CVolumeFader::FadeIn(eAudioMix e,int dwTime){
	//	フェードインを開始させる
	CVolumeFadeInfo& info = m_FadeInfo[(int)e];
	info.m_Timer.Reset();
	info.m_dwWholeTime	= dwTime;
	info.m_bFadeIn		= true;
	info.m_bFadeOut		= false;

	//	インターバルタイマーを発動させる＾＾
	TimerProc();
	if (!IsTimer()) return Start();	//	これくらいで十分やろ？
	return 0;
}

// @yo2? 0x00581490 order
void	CVolumeFader::StopFade(void){
	Stop();
	for(int i=0;i<4;i++){
		m_FadeInfo[i].m_bFadeIn	 = false;
		m_FadeInfo[i].m_bFadeOut = false;
	}
}

// @yo2 0x005814d0 vt
void	CVolumeFader::TimerProc(void){
	if (!m_AudioMixer.IsSuccessInit()) return ;

	int nReset = 0;
	for (int i=0;i<4;i++){
		CVolumeFadeInfo& info = m_FadeInfo[i];
		if (info.m_bFadeIn) {
			double d = (double)info.m_Timer.Get() / info.m_dwWholeTime;
			if (d>1) { d=1; info.m_bFadeIn = false; }
			m_AudioMixer.SetVolumeRel((eAudioMix)i,d,0);
		} else if (info.m_bFadeOut){
			double d = (double)info.m_Timer.Get() / info.m_dwWholeTime;
			if (d>1) { d=1; info.m_bFadeOut = false; }
			d = 1-d;
			m_AudioMixer.SetVolumeRel((eAudioMix)i,d,0);
		} else {
			nReset++;
		}
	}
	//	すべてのフェードが終わっているか？
	if (nReset==4) Stop();	//	タイマーの停止
}

// @yo2 0x00581630 review
bool CVolumeFader::IsFade(eAudioMix e) const {
	return m_FadeInfo[(int)e].m_bFadeIn || m_FadeInfo[(int)e].m_bFadeOut;
}
