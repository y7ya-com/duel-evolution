#ifdef USE_MIDIOutputMCI
// yaneMIDIOutputMCI.h
//
//		MIDI出力を、MCIを使って行なう実装例。
//

#ifndef __yaneMIDIOutputMCI_h__
#define __yaneMIDIOutputMCI_h__

#include "yaneSoundBase.h"
#include "yaneFile.h"
#include "yaneWinHook.h"

class CMIDIOutputMCI : public CSoundBase, public CWinHook {
public:
	CMIDIOutputMCI(void);
	virtual ~CMIDIOutputMCI();

	virtual LRESULT Open(LPCTSTR pFileName);
	virtual LRESULT Close(void);
	virtual LRESULT Play(void);
	virtual LRESULT Replay(void);
	virtual LRESULT Stop(void);
	virtual LRESULT Pause(void){ return Stop(); }
	virtual bool IsPlay(void);
	virtual bool IsLoopPlay(void){ return m_bLoopPlay; }// 追加
	virtual LRESULT SetLoopMode(bool bLoop);
	virtual LONG	GetCurrentPos(void);
	virtual LONG	SetCurrentPos(LONG lPos);
	virtual LONG	GetLength(void);	// [ms]
	virtual LRESULT SetVolume(LONG volume) {return -1;}	// not implement
	virtual LONG	GetVolume(void) {return 0;}			// not implement

protected:
	LRESULT	InnerOpen(void);	//	MCIをオープンする

	CFile	m_File;
	DWORD	m_dwPosition;
	DWORD	m_wDeviceID;		//	WORDとして使うギミック
	int		m_bPaused;
	LONG	m_lLength;

	LRESULT	LoopPlay(void);	//	LoopPlay用
	bool	m_bLoopPlay;	//	Loop再生するのか？
	bool	m_bNowPlay;		//	現在再生中か

	// override from CWinHook
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);
};

#endif

#endif // USE_MIDIOutputMCI

