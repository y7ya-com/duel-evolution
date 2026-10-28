#ifndef __yaneMovie_h__
#define __yaneMovie_h__



#include "yaneMovieBase.h"

class CMovie : public CMovieBase {
public:
	CMovie(void);
	virtual ~CMovie();

	// CSoundBase Ç∆ã§í 
	// @yo2 0x005432c0 vt
	virtual LRESULT Open(LPCTSTR pFileName) { return m_lpMovie->Open(pFileName); }
	// @yo2 0x005432e0 vt
	virtual LRESULT Close(void) { return m_lpMovie->Close();  }
	// @yo2 0x00543300 vt
	virtual LRESULT Play(void)	{ return m_lpMovie->Play();   }
	// @yo2 0x00543320 vt
	virtual LRESULT Replay(void){ return m_lpMovie->Replay(); }
	// @yo2 0x00543340 vt
	virtual LRESULT Stop(void)	{ return m_lpMovie->Stop();   }
	// @yo2 0x00543360 vt
	virtual LRESULT Pause(void) { return m_lpMovie->Pause();  }
	// @yo2 0x00543380 vt
	virtual bool IsPlay(void)	{ return m_lpMovie->IsPlay(); }
	// @yo2 0x005433a0 vt
	virtual bool IsLoopPlay(void) { return m_lpMovie->IsLoopPlay(); }
	// @yo2 0x005433c0 vt
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0) { return m_lpMovie->SetLoopMode(bLoop, lLoopPos); }	// [Konami] added lLoopPos
	// @yo2 0x005433f0 vt
	virtual LONG	GetCurrentPos(void) { return m_lpMovie->GetCurrentPos(); }
	// @yo2 0x00543410 vt
	virtual LRESULT	SetCurrentPos(LONG lPos){ return m_lpMovie->SetCurrentPos(lPos);}

	// @yo2 0x00543430 vt
	virtual LRESULT	SetVolume(LONG lv){ return m_lpMovie->SetVolume(lv);}
	// @yo2 0x00543450 vt
	virtual LONG	GetVolume(void) { return m_lpMovie->GetVolume();}
//	virtual void	SetMute(bool bf){ m_lpMovie->SetMute(bf);}
	// @yo2 0x00543470 vt
	virtual LONG	GetLength(void){ return m_lpMovie->GetLength();}
	// CMovieBase 
//	virtual void	SetAspect(bool b){ m_lpMovie->SetAspect(b);}
	// @yo2 0x00543490 vt
	virtual bool*	GetAspect(void){ return m_lpMovie->GetAspect();}
	// @yo2 0x005434b0 vt
	virtual void	SetPos(int x,int y){ m_lpMovie->SetPos(x,y);}
//	virtual void	SetAudioOutput(bool bFlag){ m_lpMovie->SetAudioOutput(bFlag);}
//	virtual bool	IsAudioOutput(void) { return m_lpMovie->IsAudioOutput();}
//	virtual void	SetVisible(bool bFlag){ m_lpMovie->SetVisible(bFlag);}
	// @yo2 0x005434e0 vt
	virtual bool*	GetVisible(void) {return m_lpMovie->GetVisible();}
	// @yo2 0x00543500 vt
	virtual bool*	GetCenter(void) { return m_lpMovie->GetCenter();}
	// @yo2 0x00543520 vt
	virtual bool	IsVideo(void) { return m_lpMovie->IsVideo();}
	// @yo2 0x00543540 vt
	virtual bool	IsAudio(void) { return m_lpMovie->IsAudio();}
#ifdef USE_FastDraw
    // @yo2 0x00543560 vt
    virtual CFastPlane* GetFastPlane(void){ return m_lpMovie->GetFastPlane();}
#else 
  #ifdef USE_DirectDraw
      virtual CPlane*	GetPlane(void){ return m_lpMovie->GetPlane();}
  #endif // end USE_DirectDraw
#endif//end USE_FastDraw

#ifdef USE_DIB32
	// @yo2 0x00543580 vt
	virtual CDIB32*	GetDIB(void){ return m_lpMovie->GetDIB();}
#endif
	// @yo2 0x005435a0 vt
	virtual void	SetSurfaceSize(int w,int h,bool bResize=false){ m_lpMovie->SetSurfaceSize(w,h,bResize);}

protected:
	auto_ptrEx<CMovieBase>	m_lpMovie;
private:
	static void	CreateInstance(CMovie* t);

	static int m_nMovieType;	
								//	0 : çƒê∂ÇµÇ»Ç¢?
								//	1 : DirectShow
								//	2 :	AVIStream
								//	3 : MCI
};								


#endif
