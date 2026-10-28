//
// yaneMIDIOutput.h
//
//		generic MIDI wrapper	programmed by yaneurao(M.Isozaki) '00/09/09
//

#ifndef __yaneMIDIOutput_h__
#define __yaneMIDIOutput_h__

#include "yaneSoundBase.h"	//	MIDI出力基底クラス

class CMIDIOutput : public CSoundBase {
public:
	CMIDIOutput(void);
	virtual ~CMIDIOutput();

	// @yo2 0x0053f570 vt
	virtual LRESULT Open(LPCTSTR pFileName) { return m_lpSound->Open(pFileName); }
	// @yo2 0x0053f590 vt
	virtual LRESULT Close(void) { return m_lpSound->Close();  }
	// @yo2 0x0053f5b0 vt
	virtual LRESULT Play(void)	{ return m_lpSound->Play();   }
	// @yo2 0x0053f5d0 vt
	virtual LRESULT Replay(void){ return m_lpSound->Replay(); }
	// @yo2 0x0053f5f0 vt
	virtual LRESULT Stop(void)	{ return m_lpSound->Stop();   }
	// @yo2 0x0053f610 vt
	virtual LRESULT Pause(void) { return m_lpSound->Pause();  }
	// @yo2 0x0053f630 vt
	virtual bool IsPlay(void)	{ return m_lpSound->IsPlay(); }
	// @yo2 0x0053f650 vt
	virtual bool IsLoopPlay(void){ return m_lpSound->IsLoopPlay(); }// 追加
	// @yo2 0x0053f670 vt
	virtual LRESULT SetLoopMode(bool bLoop, LONG lLoopPos=0) { return m_lpSound->SetLoopMode(bLoop, lLoopPos); }	// [Konami] added lLoopPos
	// @yo2 0x0053f6a0 vt
	virtual LONG	GetCurrentPos(void) { return m_lpSound->GetCurrentPos(); }
	// @yo2 0x0053f6c0 vt
	virtual LONG	GetLength(void) { return m_lpSound->GetLength();}
	// @yo2 0x0053f6e0 vt
	virtual LRESULT SetCurrentPos(LONG lPos){ return m_lpSound->SetCurrentPos(lPos);}
	// @yo2 0x0053f700 vt
	virtual LRESULT SetVolume(LONG volume){ return m_lpSound->SetVolume(volume);}
	// @yo2 0x0053f720 vt
	virtual LONG	GetVolume(void){ return m_lpSound->GetVolume();}

	//	0:NULL device , 1:CMIDIOutputMM(廃止('01/02/04)) , 2:CMIDIOutputMCI
	//	3:CMIDIOutputDM
	static	void	SelectDevice(int nDevice);
	static	int		GetDevice(void) { return m_nMIDIType;}

protected:
	auto_ptrEx<CSoundBase>	m_lpSound;

private:
	static bool m_bFirst;		//	最初の一回か？
	static bool m_bMIDINoDevice;	//	MIDIデバイスの有無(m_bFirst==falseになってから有効)
	static int m_nMIDIType;		//	0 : NULL device
								//	1:CMIDIOutputMM(廃止('01/02/04))
								//	2:CMIDIOutputMCI
								//	3:CMIDIOutputDM
	static void	CreateInstance(CMIDIOutput* t);
	static void	MIDITest(void);
	static set<CMIDIOutput*>	m_lpaMIDIList;	//	全インスタンスへのチェイン
};

#endif
