// yaneMIDIInput.h
//	 This is a MIDI input wrapper.
//		programmed by yaneurao(M.Isozaki) '99/08/26
//		modified by yaneurao '00/03/12

#ifndef __yaneMIDIInput_h__
#define __yaneMIDIInput_h__

#include "yaneKeyBase.h"

#define MAX_MIDI_CH 8		//	8チャンネルで十分？

class CMIDIInput : public CKeyBase {
public:
	//	from CKeyBase
	LRESULT GetKeyState(void); // 256バイト状態を読み込む
	BYTE	GetVelocity(int key)const { return m_byKeyBuffer[m_nKeyBufNo][key]; }

	CMIDIInput(void);
	virtual ~CMIDIInput(void);

	//////////////////////////////////////////////////////////////////
protected:
	//	MIDI入力コールバック関数
	static void CALLBACK MidiInProc(HMIDIIN hMidiIn, WORD wMsg, DWORD dwInstance,
						   DWORD dwParam1, DWORD dwParam2);

	HMIDIIN hMidiIn[MAX_MIDI_CH];
	int		nNumDevices;
	BYTE	m_byKeyBuffer2[256];	//	real time key buffer for MidiInProc
	bool	m_bSuccessInit;

private:
	LRESULT Initialize(void);
	LRESULT Terminate(void);
};

#endif
