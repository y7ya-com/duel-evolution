#ifndef __yaneMovieBase_h__
#define __yaneMovieBase_h__

#include "yaneSoundBase.h"

#ifdef USE_FastDraw
class CFastPlane;
#else
  #ifdef USE_DirectDraw
class CPlane;
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

#ifdef USE_DIB32
class CDIB32;
#endif

class CMovieBase : public CSoundBase {
public:
	CMovieBase(void){};
	virtual ~CMovieBase(){};

	// CMovieBase
	virtual void	SetPos(int x,int y)= 0;
//	virtual void	SetVisible(bool bFlag)=0;
	virtual bool*	GetVisible(void)=0;
#ifdef USE_FastDraw
    virtual CFastPlane* GetFastPlane(void)=0;
#else
  #ifdef USE_DirectDraw
	virtual CPlane*	GetPlane(void)=0;
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
      
#ifdef USE_DIB32
	virtual CDIB32*	GetDIB(void)=0;
#endif
	virtual void	SetSurfaceSize(int x,int y,bool bResize) = 0;
//	virtual void	SetAspect(bool b)=0;
	virtual bool*	GetAspect(void)=0;
	virtual bool*	GetCenter(void)=0;

	virtual bool	IsAudio(void)=0;
	virtual bool	IsVideo(void)=0;

	/* ‚â‚Á‚Ï‚è‚¢‚ç‚È‚¢‚©‚È
	virtual void	SetMute(bool bf)=0;
	virtual void	SetAudioOutput(bool bFlag)= 0;
	virtual bool	IsAudioOutput(void)= 0;
	*/


};

// •K—v‚È‚¢‚Æ‚ÍŽv‚¤‚ª‚Æ‚è‚ ‚¦‚¸
class CMovieNull : public CMovieBase {
public:
	// @yo2 0x00543700 vt
	virtual LRESULT Open(LPCTSTR pFileName) { return 0; }
	// @yo2 0x00543720 vt
	virtual LRESULT Close(void)	 { return 0; }
	// @yo2 0x00543740 vt
	virtual LRESULT Play(void)	 { return 0; }
	// @yo2 0x00543760 vt
	virtual LRESULT Replay(void) { return 0; }
	// @yo2 0x00543780 vt
	virtual LRESULT Stop(void)	 { return 0; }
	// @yo2 0x005437a0 vt
	virtual LRESULT Pause(void)	 { return 0; }
	// @yo2 0x005437c0 vt
	virtual bool IsPlay(void)	 { return false; }
	// @yo2 0x005437e0 vt
	virtual bool IsLoopPlay(void){ return m_bLoop; }// ’Ç‰Á
	// @yo2 0x00543800 vt
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0) { m_bLoop=bLoop; m_lLoopPos=lLoopPos; return 0; }	// [Konami] added lLoopPos
	// @yo2 0x00543830 vt
	virtual LONG	GetCurrentPos(void) { return -1; }
	// @yo2 0x00543850 vt
	virtual LRESULT SetCurrentPos(LONG lPos){ return -1;}

	// @yo2 0x00543870 vt
	virtual LRESULT	SetVolume(LONG lv){ return -1;}	// [portable] LONG as in CSoundBase (long is 64-bit off Windows, so this did not override)
	// @yo2 0x00543890 vt
	virtual LONG	GetVolume(void) { return DSBVOLUME_MIN;}
//	virtual void	SetMute(bool bf){}
	// @yo2 0x005438b0 vt
	virtual LONG	GetLength(void){ return -1;}
	
	// @yo2 0x005438d0 vt
	virtual void	SetPos(int x,int y){};
//	virtual void	SetVisible(bool bFlag){};
	// @yo2 0x005438f0 vt
	virtual bool*	GetVisible(void) {return NULL;}
//	virtual void	SetAudioOutput(bool bFlag){};
//	virtual bool	IsAudioOutput(void) { return false;}
#ifdef USE_FastDraw
    // @yo2 0x00543910 vt
    virtual CFastPlane* GetFastPlane(void) { return NULL; }
#else
  #ifdef USE_DirectDraw
	virtual CPlane*	GetPlane(void) { return NULL;}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
      
#ifdef USE_DIB32
	// @yo2 0x00543930 vt
	virtual CDIB32* GetDIB(void) { return NULL;} 
#endif
	// @yo2 0x00543950 vt
	virtual void	SetSurfaceSize(int x,int y,bool bResize){};
	// @yo2 0x00543970 vt
	virtual bool*	GetAspect(void){ return NULL;};
	// @yo2 0x00543990 vt
	virtual bool*	GetCenter(void){ return NULL;};
	// @yo2 0x005439b0 vt
	virtual bool	IsVideo(void) { return false;}
	// @yo2 0x005439d0 vt
	virtual bool	IsAudio(void) { return false;}

	CMovieNull(void) { 
		m_bLoop = false;
//		m_bAudioOutput = false;
	}
	// @yo2 0x00543a20 vt
	virtual ~CMovieNull(){};

protected:
	bool m_bLoop;
	LONG m_lLoopPos;	// [Konami] added (name is ours; not initialized by the constructor)
//	bool m_bAudioOutput;
};


#endif
