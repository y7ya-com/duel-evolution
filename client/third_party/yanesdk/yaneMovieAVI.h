#ifndef __yaneMovieAVI_h__
#define __yaneMovieAVI_h__

#undef USE_MovieAVI_Draw

#ifdef USE_FastDraw
#define USE_MovieAVI_Draw 1
#else
  #ifdef USE_DirectDraw
  #define USE_MovieAVI_Draw 1
  #else
    #ifdef USE_DIB32
    #define USE_MovieAVI_Draw 1
    #endif //end USE_DIB32
  #endif //end USE_FastDraw
#endif  //end USE_DirectDraw

#ifndef USE_MovieAVI_Draw
#undef USE_MovieAVI
#endif

#ifdef USE_MovieAVI

#pragma comment(lib,"vfw32.lib")
#include <vfw.h>
#pragma comment(lib,"msacm32.lib")
#include <msacm.h>

#include "yaneMovieBase.h"
#include "yaneDirectDraw.h"
#include "yanePlane.h"
#include "yaneDIB32.h"
#include "yaneDIBDraw.h"
#include "yaneLayer.h"
#include "yaneThread.h"
#include "yaneFile.h"
#include "yaneTimer.h"
#include "yaneDirectSound.h"
#include "mtknlongsound.h"

class CMovieAVI;
class CMovieAVIVIDEO;
class CMovieAVIAUDIO;

class CMovieAVIAUDIO : public CThread {
public:
	CMovieAVIAUDIO(CMovieAVI* p);
	virtual ~CMovieAVIAUDIO();

public:
	virtual LRESULT Close(void);
	virtual LRESULT Play(void);
	virtual LRESULT Replay(void);
	virtual LRESULT Stop(void);
	virtual LRESULT Pause(void);
	virtual bool	IsPlay(void);
	virtual LRESULT SetLoopMode(bool bLoop);
	virtual LRESULT	SetCurrentPos(LONG lSeek);//{};

//	virtual void	SetPos(int x,int y);
//	virtual void	Seek(LONG lSeek){};

	virtual void	SetAudioOutput(bool bFlag){};
	virtual bool	IsAudioOutput(void) { return m_bAudioOutput;}

	LRESULT SetVolume(LONG lVolume);
	LONG	GetVolume(void);

	LRESULT	OpenAudioStream(PAVIFILE p);
	LRESULT	InitAudioStream(void);

	PAVISTREAM	GetAudioStream(void){ return m_pAviStreamAudio;}

	void	SetTimer(smart_ptr<CTimer> lpTimer){ m_lpTimer = lpTimer;}

protected:
	virtual void ThreadProc();
	LRESULT	UpdateSound(void);


	DWORD	ReadSoundStream( LPBYTE lpDS , DWORD dwLength);
	DWORD	UpdateDirectSound(DWORD dwSize);
	DWORD	InnerReadSoundStream( LPBYTE lpDS,DWORD dwSize);
	DWORD	ConvertSoundStream(LPVOID srcBuf, DWORD srcSize, LPVOID lpDestBuf, DWORD destSize);
	DWORD	SoundStreamCopy(LPBYTE& lp,DWORD& dw);
	bool	StartUpSoundBuffer(LONG pos=0);	// ‚ ‚ç‚©‚¶‚ß“Ç‚Ü‚¹‚é

	smart_ptr<CTimer>	m_lpTimer;

	CMovieAVI*	m_pAvi;

// Sound

	PAVISTREAM	m_pAviStreamAudio;
	IDirectSoundBuffer*	m_lpDSBuffer;
	IDirectSoundNotify *m_pDSNotify;
	HANDLE m_hNotificationEvent;

	CDirectSound*	m_lpCDirectSound;
	auto_array<BYTE>	m_lpwfxSrcFormat;
	auto_array<DSBPOSITIONNOTIFY> m_aPosNotify;
	WAVEFORMATEX	m_wfxDstFormat;
	HACMSTREAM		m_hAcmStream;
	DWORD			m_dwBuddyLength;
	int				m_nBuddyIndex;
	DWORD			m_dwMinimumDst;

	DWORD			m_dwBlockAlignedBufferSize;
	WAVEFORMATEX	m_wfxFormat;

	DWORD	m_dwPreWritePos;
	DWORD	m_dwBufferSize;
	DWORD	m_dwBufferWritePos;
	DWORD	m_dwDiffer;
	DWORD	m_dwTotalWrittenBytes;
	DWORD	m_dwPreReadStreamFrame;
	bool	m_bAudioStream;
	bool	m_bCanUseNotify;
	LPVOID		m_lpBuddyBuffer;
	LPVOID		m_lpSoundSrcBuffer;
	DWORD		m_dwBuddyBufferSizeMax;
	DWORD		m_dwSoundSrcBufferMax;
	bool		m_bUseACM;
	bool		m_bAudioOutput;
	bool		m_bLoopPlay;
	int		m_bPause;
	bool	m_bNowPlay;
	DWORD	m_dwNowTime;
	LONG	m_lPauseTime,m_lOffsetTime;
	LONG	m_lNowFrame,m_lPreFrame;
	bool	m_bEnd;


};

class CMovieAVIVIDEO : /*public CThread ,*/ public CLayer {
public:
	CMovieAVIVIDEO(CMovieAVI*p);
	virtual ~CMovieAVIVIDEO();

public:
	virtual LRESULT Close(void);
	virtual LRESULT Play(void);
	virtual LRESULT Replay(void);
	virtual LRESULT Stop(void);
	virtual LRESULT Pause(void);
	virtual bool IsPlay(void);
//	virtual bool IsLoopPlay(void);
//	virtual LRESULT SetLoopMode(bool bLoop);
//	virtual LONG	GetCurrentPos(void);

//	virtual void	SetVisible(bool bFlag){ m_bVisible = bFlag;}
//	virtual bool	IsVisible(void) {return m_bVisible;}
//	virtual bool*	GetVisible(void) { return &m_bVisible;}

	virtual void	SetPos(int x,int y);
//	virtual void	Seek(LONG lSeek){};

	void	SetTimer(smart_ptr<CTimer> lpTimer){ m_lpTimer = lpTimer;}

#ifdef USE_FastDraw
    CFastPlane* GetFastPlane(void);
#else
  #ifdef USE_DirectDraw
	CPlane*	GetPlane(void);//{ return &m_Plane;}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

#ifdef USE_DIB32
	CDIB32* GetDIB(void);//{ return &m_Dib;}
#endif
	void	SetSurfaceSize(int w,int h,bool bResize){ m_lPWidth = w;m_lPHeight = h;m_bResize = bResize;}

	PAVISTREAM	GetVideoStream(void){ return m_pAviStreamVideo;}

	LRESULT OpenVideoStream(PAVIFILE p);
protected:
//	virtual void ThreadProc();
	LRESULT UpdatePlane(void);
	// Layer
	virtual	void	InnerOnDraw(CPlaneBase*lpDraw);

#ifdef USE_FastDraw
	virtual void	OnDraw(CFastDraw*lpDraw);
	CFastPlane	m_Plane;
#else
  #ifdef USE_DirectDraw
	virtual void	OnDraw(CDirectDraw*lpDraw);
	CPlane	m_Plane;
  #endif//end USE_DirectDraw
#endif //end USE_FastDraw

#ifdef USE_DIB32
	virtual void	OnDraw(CDIBDraw*lpDraw);
	CDIB32	m_Dib;
#endif

	smart_ptr<CTimer>	m_lpTimer;

	CMovieAVI*	m_pAvi;


	PAVIFILE	m_pAviFile;
	PAVISTREAM	m_pAviStreamVideo;
	BITMAPINFOHEADER *m_lpBitmapInfo;
	PGETFRAME	m_pGetFrame;
//	AVISTREAMINFO m_AviInfo; 
	DWORD	m_dwPosition;
	LONG	m_lPauseTime,m_lOffsetTime;
	LONG	m_lNowFrame,m_lPreFrame;
	int		m_bPause;
	bool	m_bVisible;
	bool	m_bVideoStream;
	bool	m_bNowPlay;
	bool	m_bOpen;
	bool	m_bLoopPlay;
	LONG	m_lWidth,m_lHeight;
	bool	m_bFirstPlane;
	LONG	m_lPWidth,m_lPHeight;
	LONG	m_lPWidth2,m_lPHeight2;
	bool	m_bResize;

	AVISTREAMINFO m_AviStreamInfo;
	LONG	m_lAviLength;
	LONG	m_lAviNowFrame;
	double	m_AviFrameRatio,m_LocalFrameRatio;
	double	m_AviFrameRatio2;


	HDRAWDIB	m_hDrawDib;
};


class CMovieAVI : public CMovieBase {
public:
	CMovieAVI(void);
	virtual ~CMovieAVI();

public:
	// CSoundBase
	virtual LRESULT Open(LPCTSTR pFileName);
	virtual LRESULT Close(void);
	virtual LRESULT Play(void);
	virtual LRESULT Replay(void);
	virtual LRESULT Stop(void);
	virtual LRESULT Pause(void);
	virtual bool IsPlay(void);
	virtual bool IsLoopPlay(void) { return m_bLoopPlay; }// ’Ç‰Á
	virtual LRESULT SetLoopMode(bool bLoop);
	virtual LONG	GetCurrentPos(void);
	virtual LRESULT	SetCurrentPos(LONG lSeek);
	virtual LONG	GetLength(void);
	virtual LRESULT	SetVolume(LONG lv);
	virtual LONG	GetVolume(void);

	// CMovieBase
//	virtual void	SetMute(bool bf){}
//	virtual void	SetVisible(bool bFlag){ m_bVisible = bFlag;}
//	virtual void	SetAudioOutput(bool bFlag){};
//	virtual bool	IsAudioOutput(void) { return m_bAudioOutput;}
//	virtual void	SetAspect(bool b){ m_bAspect = b;}

	virtual bool*	GetAspect(void){ return &m_bAspect;}
	virtual bool*	GetVisible(void) {return &m_bVisible;}
	virtual bool*	GetCenter(void){ return &m_bCenter;}
	virtual bool	IsVideo(void) { return m_bVideo;}
	virtual bool	IsAudio(void) { return m_bAudio;}

	virtual void	SetPos(int x,int y);
#ifdef USE_FastDraw
	virtual CFastPlane*	GetFastPlane(void){ 
		if ( m_pAviVIDEO != NULL ){
			return m_pAviVIDEO->GetFastPlane();
		}else { 
			return NULL;
		}
	}
#else
  #ifdef USE_DirectDraw
	virtual CPlane*	GetPlane(void){ 
		if ( m_pAviVIDEO != NULL ){
			return m_pAviVIDEO->GetPlane();
		}else { 
			return NULL;
		}
	}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
      
#ifdef USE_DIB32
	virtual CDIB32* GetDIB(void){
		if ( m_pAviVIDEO != NULL ) {
			return m_pAviVIDEO->GetDIB();
		}else{
			return NULL;
		}
	}
#endif
	virtual void SetSurfaceSize(int w,int h,bool bResize){
		if ( w > 0 ) m_lPWidth = w;
		if ( h > 0 ) m_lPHeight = h;
		m_bResize = bResize;
		if ( m_pAviVIDEO != NULL ){
			m_pAviVIDEO->SetSurfaceSize(m_lPWidth,m_lPHeight,m_bResize);
		}
	}



//	CDIB32* GetDIB(void){ return &m_Dib;}

protected:

	LRESULT OpenAviStream(void);

	auto_ptrEx<CMovieAVIVIDEO>	m_pAviVIDEO;
	auto_ptrEx<CMovieAVIAUDIO>	m_pAviAUDIO;

	string		m_FileName;
	smart_ptr<CTimer>	m_FTimer;

	PAVIFILE	m_pAviFile;
	bool	m_bVideoStream;
	bool	m_bAudioStream;

	AVISTREAMINFO m_AviStreamInfo;
	LONG	m_lAviLength;
	LONG	m_lAviNowFrame;
	double	m_AviFrameRatio,m_LocalFrameRatio;
	double	m_AviFrameRatio2;

	DWORD	m_dwNowTime;
	LONG	m_lPauseTime,m_lOffsetTime;
	LONG	m_lNowFrame,m_lPreFrame;

	bool	m_bOpen;
	int		m_bPause;
	LONG	m_lWidth,m_lHeight;
	bool	m_bAspect;
	bool	m_bCenter;

	bool	m_bVideo,m_bAudio;

	DWORD	m_dwPosition;
	bool	m_bLoopPlay;
	bool	m_bAudioOutput;
	bool	m_bNowPlay;
	bool	m_bAudioOnly;
	bool	m_bVisible;
	int		m_nX,m_nY;
	LONG	m_lPWidth,m_lPHeight;
	bool	m_bResize;
	LONG	m_lVolume;
};

#endif
#endif