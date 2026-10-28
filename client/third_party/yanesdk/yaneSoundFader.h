//	yaneSoundFader.h :
//		programmed by yaneurao '00/08/20
//

#ifndef __yaneSoundFader_h__
#define __yaneSoundFader_h__

#include "yaneIntervalTimer.h"
#include "yaneTimer.h"
#include "yaneSound.h"

class CSoundFader : public CIntervalTimer {
public:
	void	Set(CSoundBase*lpSound=NULL);			//	対象とするCSoundを設定する
	//	lpSound==NULLならば、すべてのCSoundクラスが対象となる。

	LRESULT ResetVolume(void);					//	初期ボリューム値に戻す
	LRESULT FadeOut(int dwTime);				//	フェードアウトを開始させる
	LRESULT FadeIn(int dwTime);					//	フェードインを開始させる
	// dwTime[ms]後にボリュームのフェードは完了する

	bool	IsFade(void)const;					//	フェード中なのか？

	CSoundFader(void);
	virtual ~CSoundFader();

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
	} m_FadeInfo;

	CSoundBase*		m_lpSound;			//	Fadeされるサウンド

	void	SetVolume(DWORD dw) {
		if (m_lpSound!=NULL) {
			m_lpSound->SetVolume(dw);
		} else {
			//	CSoundだけとは限らないのだが...
			CSound::SetVolumeAll(dw);
		}
	}

	virtual void TimerProc(void);	//	コールバックされる関数
};

#endif
