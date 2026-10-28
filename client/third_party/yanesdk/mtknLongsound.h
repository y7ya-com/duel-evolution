#pragma once

class CDirectSound;
#include "enraPCMReaderFactory.h"
class CPCMReaderFactory;
namespace mtknLib {
class IkmLongSound 
{
public:
	//--- èCê≥ '02/01/03  by enra ---
	virtual bool open(const char *filename, bool isLoop=true)=0;
	virtual bool play()=0;
	//-------------------------------
	virtual bool stop(bool doFadeOut=false)=0;

	// í«â¡
	virtual bool	isplay(void)=0;
	virtual LONG	GetFrequency(void) = 0;
	virtual LRESULT	SetFrequency( DWORD freq ) = 0;

	// by kaine
	virtual LONG	GetLength(void)=0;	// [ms]
	virtual LONG	GetVolume(void)=0;
	virtual LRESULT SetVolume(LONG volume)=0;

	//--- èCê≥ '02/01/03  by enra ---
	virtual LONG	GetCurrentPos(void)=0;		// [ms]
	//	virtual LONG getCurrentPosition(void)=0;	// byte
	//-------------------------------
	virtual const WAVEFORMATEX *getFormat() const=0;
	static IkmLongSound *create();

	virtual ~IkmLongSound(){}

	//--- çÌèú '02/01/05  by enra ---
	//	virtual bool pause(void)=0;// çÌèú
	//	virtual bool resume()=0;// èCê≥
	//	virtual LRESULT SetCurrentPos(LONG lPos)=0;	// [ms]
	//-------------------------------

	//--- í«â¡ '01/11/19  by enra ---
	virtual int close()=0;
	virtual void SetFactory(smart_ptr<CPCMReaderFactory> pv)=0;
	virtual smart_ptr<CPCMReaderFactory> GetFactory(void)=0;
	virtual void SetOffset(LONG lPos)=0;
	virtual LONG GetOffset(void)=0;
	//-------------------------------

	//--- í«â¡ '02/01/07  by enra ---
	virtual void SetLoop(bool bLoop, LONG lLoopPos=0)=0;	// [Konami] added lLoopPos (name is ours)
	virtual bool IsLoop(bool bLoop)=0;
	//-------------------------------

};
};