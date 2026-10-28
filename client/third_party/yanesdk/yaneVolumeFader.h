//	yaneVolumeFader.h :
//		programmed by yaneurao '00/03/12
//

#ifndef __yaneVolumeFader_h__
#define __yaneVolumeFader_h__

#include "yaneAudioMixer.h"
#include "yaneAppIntervalTimer.h"
#include "yaneTimer.h"

class CVolumeFader : public CAppIntervalTimer {
public:
	LRESULT ResetVolume(eAudioMix e);			//	初期ボリューム値に戻す

	////////////////////////////////////////////////////////////////////////
	// dwTime[ms]後にボリュームのフェードは完了する
	LRESULT FadeOut(eAudioMix e,int dwTime);	//	フェードアウトを開始させる
	LRESULT FadeIn(eAudioMix e,int dwTime);		//	フェードインを開始させる
	bool	IsFade(eAudioMix e)const;			//	フェード中なのか？

	void	StopFade(void);						//	フェードを停止

protected:
	class CVolumeFadeInfo {
	public:
		CTimer		m_Timer;		//	FadeのためのTimer
		DWORD		m_dwWholeTime;	//	Fadeを開始から終了させるまでの時間
		bool		m_bFadeIn;		//	FadeIn中なのか?
		bool		m_bFadeOut;		//	FadeOut中なのか?

		CVolumeFadeInfo(void) {
			m_bFadeIn = m_bFadeOut = false;
		}
	};

	CAudioMixer		m_AudioMixer;
	CVolumeFadeInfo	m_FadeInfo[4];

	virtual void TimerProc(void);	//	コールバックされる関数
};

#endif
