#ifndef __yaneMovieDS_h__
#define __yaneMovieDS_h__

#ifndef USE_DirectDraw
#ifndef USE_FastDraw
#undef USE_MovieDS
#endif //end USE_FastDraw
#endif //end USE_DirectDraw

#ifndef USE_DIB32
#undef USE_MovieDS
#endif

#include "yaneMovieBase.h"
#include "yaneDirectDraw.h"
#include "yanePlane.h"
#include "yaneFastDraw.h"
#include "yaneFastPlane.h"
#include "yaneLayer.h"
#include "yaneFile.h"
#include "YTL/smart_ptr.h"

//#include <dshow.h>
#include <amstream.h>
#pragma comment(lib,"amstrmid.lib")
#include <control.h>
#pragma comment(lib,"strmiids.lib")

//	DirectShow wrapper
class CDirectShow {
public:
	CDirectShow(void);
	virtual ~CDirectShow();

	static bool	CanUseDirectShow(void){ return m_bCanUseDirectShow;} //	DirectShowが使えるかを返す

	IAMMultiMediaStream*	GetDirectShowAMMultiMediaStream(void) { return m_pAMMultiMediaStream;}

//	void RenderStreamToPlane ( CPlane*plane );

private:
//	static bool	m_bFirst;
	static bool m_bCanUseDirectShow;

	IAMMultiMediaStream*	m_pAMMultiMediaStream;

};

#ifdef USE_MovieDS

class CMovieDS : public CMovieBase , public CLayer {
public:
	CMovieDS(void);
	virtual ~CMovieDS();

public:
	bool	CanUseDirectShow(void){
		return GetDirectShow()->CanUseDirectShow();
	}

	// DirectShow
	virtual LRESULT Open(LPCTSTR pFileName);
	virtual LRESULT Close(void);
	virtual LRESULT Play(void);
	virtual LRESULT Replay(void);
	virtual LRESULT Stop(void);
	virtual LRESULT Pause(void){ return Stop(); }
	virtual bool IsPlay(void);
	virtual bool IsLoopPlay(void) { return m_bLoopPlay; }// 追加
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0);	// [Konami] signature follows CSoundBase (CMovieDS is compiled out; lLoopPos unused)
	virtual LONG	GetCurrentPos(void);
	virtual LRESULT SetCurrentPos(LONG lPos);

	virtual LONG	GetLength(void);

	virtual LRESULT	SetVolume(long lv);
	virtual LONG	GetVolume(void);
//	virtual void	SetMute(bool bf){ SetAudioOutput(!bf); }

//	virtual void	GetVisible(bool bFlag){ m_bVisible = bFlag;}
	virtual bool*	GetVisible(void) {return &m_bVisible;}

	virtual void	SetPos(int x,int y);
//	virtual void	SetAudioOutput(bool bFlag);
//	virtual bool	IsAudioOutput(void) { return m_bAudioOutput;}
//	virtual void	SetAspect(bool b){ m_bAspect = b;}
	virtual bool*	GetAspect(void){ return &m_bAspect;}
	virtual bool*	GetCenter(void){ return &m_bCenter;}
	virtual bool	IsVideo(void) { return m_bVideo;}
	virtual bool	IsAudio(void) { return m_bAudio;}
#ifdef USE_FastDraw
    virtual CFastPlane* GetFastPlane(void);
#else
  #ifdef USE_DirectDraw
	virtual	CPlane*	GetPlane(void);//{ return &m_Plane;}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
      
#ifdef USE_DIB32
	virtual CDIB32* GetDIB(void);//{ return &m_Dib;}
#endif
	virtual void	SetSurfaceSize(int w,int h,bool bResize){ 
		if ( w > 0 ) m_lPWidth = w;
		if ( h > 0 ) m_lPHeight = h;
		m_bResize = bResize;}
	void	SetColorKey(bool bFlag){ m_bColorKey = bFlag; }

protected:
	CDirectShow* GetDirectShow(void){ return m_lpCDirectShow;}
	// Layer
	virtual	void	InnerOnDraw(CPlaneBase*lpDraw);

#ifdef USE_FastDraw
    CFastPlane m_Plane;
    CFastPlane m_BackPlane;	// Sample用のバックバッファ
    virtual void	OnDraw(CFastDraw*lpDraw);
#else
  #ifdef USE_DirectDraw
	CPlane	m_Plane;
	CPlane	m_BackPlane;	// Sample用のバックバッファ
	virtual void	OnDraw(CDirectDraw*lpDraw);
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

#ifdef USE_DIB32
	virtual void	OnDraw(CDIBDraw*lpDraw);
	CDIB32	m_Dib;
#endif
//	virtual void ThreadProc();

	HRESULT	Initialize(void);
	HRESULT CreateMedia(void);
	HRESULT	CreateMediaSurface(void);

	bool	m_bVisible;
	int		m_nX,m_nY;
	bool	m_bColorKey;
	bool	m_bOpen;
	bool	m_bAspect;

	CFile	m_File;
	wstring	m_FileName;
	int	m_bPause;
	DWORD		m_dwPosition;
	bool	m_bLoopPlay;
	bool	m_bCanUseDirectShow;
	bool	m_bAudioOutput;
	LONG	m_lWidth,m_lHeight;
	LONG	m_lPWidth,m_lPHeight;
	bool	m_bResize;
	bool	m_bCenter;
	LONG	m_lVolume;

	bool	m_bVideo,m_bAudio;

	STREAM_TIME	m_PauseTime,m_StreamTime;

	IAMMultiMediaStream*		m_pAMMultiMediaStream;
	IMultiMediaStream*			m_pMultiMediaStream;
	IMediaStream*				m_pMediaStream;
	IDirectDrawMediaStream*		m_pDDStream;
	IDirectDrawStreamSample*	m_pDDStreamSample;
//	IStreamSample*				m_pStreamSample;
//	LPDIRECTDRAWSURFACE			m_pDDSurface;	// 元画像
//	IMediaStreamFilter*		m_pMediaStreamFilter;
//	IMultiMediaStream*	m_pAMultiMediaStream;
//	IMediaStream*		m_pAMediaStream;

//	IAudioMediaStream*	m_pAudioMediaStream;
//	IAudioStreamSample*	m_pAudioStreamSample;
//	IAudioData*			m_pAudioData;
	IBasicAudio*		m_pBasicAudio;
//	IBasicVideo*	m_pBasicVideo;
//	IVideoWindow*	m_pVideoWindow;
//	IGraphBuilder*	m_pGraphBuilder;

	bool	m_bAudioOnly;

	auto_ptrEx<CDirectShow>		m_lpCDirectShow;
};

#endif
#endif