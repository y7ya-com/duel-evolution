// MIDI input Wrapper

#include "stdafx.h"
#include "yaneMIDIInput.h"

//////////////////////////////////////////////////////////////////////////////
// bufferのflip! (C)yaneurao
#define FlipKeyBuffer(var) \
	var = 1 - var;
//////////////////////////////////////////////////////////////////////////////

// @yo2? 0x0053e510 order
CMIDIInput::CMIDIInput(void) { Initialize(); }
// @yo2 0x0053e5b0 vt
CMIDIInput::~CMIDIInput() { Terminate(); }

// @yo2 0x0053e620 feat
LRESULT CMIDIInput::Initialize(void){	// 初期化処理
	//--- 修正 '02/03/23  by ENRA ---
	// 以下３つの順番がおかしかった（先にTerminateしてた）
	m_bSuccessInit	=	false;
	Terminate(); // 終了処理によって初期化（念のため）
	ZERO(m_byKeyBuffer2);
	//-------------------------------

	nNumDevices = midiInGetNumDevs();

	if (nNumDevices <0) return 1;
	// 取得できんかったらこの関数自体はエラー 

	for(int i=0;(i < nNumDevices) && (i<MAX_MIDI_CH);i++){
		midiInOpen((LPHMIDIIN)&hMidiIn[i],i
			,(DWORD_PTR)MidiInProc,(DWORD_PTR)this,CALLBACK_FUNCTION);	// [portable] DWORD_PTR (= DWORD on Win32)
		// どのチャンネルの信号もみんな平等に扱おうよ！
		if (hMidiIn[i])
			midiInStart(hMidiIn[i]);
	}

	m_bSuccessInit	=	true;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0053e6e0 feat
LRESULT CMIDIInput::Terminate(void){ // 終了処理
	if (m_bSuccessInit) {
		for(int i=0;(i < nNumDevices) && (i<MAX_MIDI_CH);i++){
			midiInStop(hMidiIn[i]);
			midiInReset(hMidiIn[i]);
			midiInClose(hMidiIn[i]);
		}
	}
	return 0; // 正常終了
}
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053e760 tight
void CALLBACK CMIDIInput::MidiInProc(HMIDIIN hMidiIn, WORD wMsg, DWORD dwInstance,
						   DWORD dwParam1, DWORD dwParam2)
{
// Note OnとOffでm_byKeyBuffer2を変更
	CMIDIInput* myclass = (CMIDIInput*) dwInstance;

	int Status = dwParam1 & 0xf0;			// Status
	int Key = (dwParam1 >> 8) & 0xff;		// data1
	int Velocity = (dwParam1 >> 16) & 0xff; // data2

	switch (wMsg){
	case MIM_DATA:
		switch (Status) {
		case 0x90:
			// Note On or Off
			myclass->m_byKeyBuffer2[Key] = Velocity;
			break;
		case 0x80:
			// これがNote Offで有り得る
			myclass->m_byKeyBuffer2[Key] = 0;
			break;
		case 0xb0:
			if (Key == 0x43)	  myclass->m_byKeyBuffer2[253] = Velocity; // left pedal
			else if (Key == 0x42) myclass->m_byKeyBuffer2[254] = Velocity; // middle pedal
			else if (Key == 0x40) myclass->m_byKeyBuffer2[255] = Velocity; // right pedal
			break;
		}

	// 他のメッセージは無視しちゃる！
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053e820 vt
LRESULT CMIDIInput::GetKeyState(void){

	if (!m_bSuccessInit) return 1;	//	きみぃ、そもそも初期化失敗しとるがに..
	FlipKeyBuffer(m_nKeyBufNo);

	// ２５６バイト現在の状態として取得！
	CopyMemory((LPVOID)&(m_byKeyBuffer[m_nKeyBufNo][0]),
			(LPVOID)&(m_byKeyBuffer2[0]),256);

	return 0;
}
