//
// yaneSoundBase.h
//
//		MIDI,WAVE出力基底クラス
//

#ifndef __yaneSoundBase_h__
#define __yaneSoundBase_h__

/////////////////////////////////////////////////////////////////////////////
class CSoundBase {
public:
	CSoundBase(void) {}
	// @yo2 0x0053fc10 vt
	virtual ~CSoundBase() {}

	virtual LRESULT Open(LPCTSTR pFileName) = 0;
	virtual LRESULT Close(void) = 0;
	virtual LRESULT Play(void)	= 0;
	virtual LRESULT Replay(void) = 0;
	virtual LRESULT Stop(void)	= 0;
	virtual LRESULT Pause(void) = 0;
	virtual bool IsPlay(void) = 0;
	virtual bool IsLoopPlay(void) = 0;// 追加
	// [Konami] added lLoopPos (name is ours): loop restart position, stored by every implementation
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0) = 0;
	virtual LONG	GetCurrentPos(void) = 0;
	virtual LRESULT	SetCurrentPos(LONG lPos) = 0;	// [ms]
	virtual LONG	GetLength(void) = 0; // 曲長を得る [ms]
	virtual LRESULT SetVolume(LONG volume)=0; // このチャンネルに対するヴォリューム
	virtual LONG	GetVolume(void)=0;	// 取得は、特定チャンネルに対してしかできない...

	virtual LRESULT ConvertToMealTime(LONG nPos,int&nHour,int&nMin,int&nSec,int&nMS);
	virtual LRESULT ConvertFromMealTime(LONG&nPos,int nHour,int nMin,int nSec,int nMS);
};

//	俗に言うNULL DEVICE。
//	MIDIの付いていない環境では、これでをアップキャストして使えば良い
class CSoundNullDevice : public CSoundBase {
public:
	// @yo2 0x0053fa10 vt
	virtual LRESULT Open(LPCTSTR pFileName) { return 0; }
	// @yo2 0x0053fa30 vt
	virtual LRESULT Close(void)	 { return 0; }
	// @yo2 0x0053fa50 vt
	virtual LRESULT Play(void)	 { return 0; }
	// @yo2 0x0053fa70 vt
	virtual LRESULT Replay(void) { return 0; }
	// @yo2 0x0053fa90 vt
	virtual LRESULT Stop(void)	 { return 0; }
	// @yo2 0x0053fab0 vt
	virtual LRESULT Pause(void)	 { return 0; }
	// @yo2 0x0053fad0 vt
	virtual bool IsPlay(void)	 { return false; }
	// @yo2 0x0053faf0 vt
	virtual bool IsLoopPlay(void){ return m_bLoop; }
	// @yo2 0x0053fb10 vt
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0) { m_bLoop=bLoop; m_lLoopPos=lLoopPos; return 0; }	// [Konami] added lLoopPos
	// @yo2 0x0053fb40 vt
	virtual LONG	GetCurrentPos(void) { return -1; }
	// @yo2 0x0053fb60 vt
	virtual LRESULT	SetCurrentPos(LONG lPos) { return -1;}
	// @yo2 0x0053fb80 vt
	virtual LONG	GetLength(void){ return -1;}
	// @yo2 0x0053fba0 vt
	virtual LRESULT SetVolume(LONG volume){ return -1;}
	// @yo2 0x0053fbc0 vt
	virtual LONG	GetVolume(void){ return DSBVOLUME_MIN;}

	CSoundNullDevice(void) { m_bLoop = false; }

protected:
	bool m_bLoop;
	LONG m_lLoopPos;	// [Konami] added (name is ours; not initialized by the constructor)
};

#endif
