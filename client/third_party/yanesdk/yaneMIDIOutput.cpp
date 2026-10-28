//
//	MIDI統括クラス。
//

#include "stdafx.h"
#include "yaneMIDIOutput.h"
#include "yaneSoundBase.h"
#include "yaneMIDIOutputMCI.h"
#include "yaneMIDIOutputDM.h"

#pragma comment(lib,"winmm.lib")
#include <mmsystem.h>

//	0 : NULL device 1:CMIDIOutputMM 2:CMIDIOutputMCI 3:CMIDIOutputDM
int CMIDIOutput::m_nMIDIType =
#ifdef USE_MIDIOutputDM
		3;		//	DirectMusicが使えるならばDirectMusicで再生
#else
 #ifdef USE_MIDIOutputMCI
		2;		//	ダメならでMCI再生
 #else
//   #ifdef USE_MIDIOutputMM
//	廃止('01/02/04)
//		1;		//	MM再生
//   #else
		0;		//	no-device
//   #endif
 #endif
#endif

bool CMIDIOutput::m_bFirst=true;			//	最初の一回か？
bool CMIDIOutput::m_bMIDINoDevice = false;	//	MIDIデバイスの有無(m_bFirst==falseになってから有効)
set<CMIDIOutput*> CMIDIOutput::m_lpaMIDIList;

//	CMIDIOutputBaseの代理母
// @yo2 0x0053f430 review
CMIDIOutput::CMIDIOutput(void){
	MIDITest();
	CreateInstance(this);
	m_lpaMIDIList.insert(this);
}

// @yo2 0x0053f770 vt
CMIDIOutput::~CMIDIOutput(){
	m_lpaMIDIList.erase(this);
}

//	これでデバイスセレクトが出来るようにする。
// @yo2 0x0053f860 cg
void	CMIDIOutput::SelectDevice(int nDevice){
	if (m_bFirst) {
		m_nMIDIType = nDevice;
		return ; // インスタンスが無いのだから、これでＯＫ
	}

	//	デバイスが無ければ生成しない
	if (m_bMIDINoDevice) {
		return ;
	}

	if (m_nMIDIType != nDevice){
		m_nMIDIType = nDevice;

		//	全インスタンスを生成しなおす！
		//	（本当は、このとき再生フラグ等までコピーすべきだが）
		for (set<CMIDIOutput*>::iterator it = m_lpaMIDIList.begin();
			it!=m_lpaMIDIList.end();it++){
			CreateInstance(*it);	//	これでうまくいくんかな？＾＾；
		}
	}
}

//	MIDIデバイスのテストコード
// @yo2 0x0053f920 feat
void	CMIDIOutput::MIDITest(void){
	if (m_bFirst) {	//	MIDIデバイス有るんかい？
		m_bFirst = false;

		//	試しにオープンしてみる
		HMIDIOUT hMidi;
		if (::midiOutOpen(&hMidi,MIDI_MAPPER,NULL,NULL,CALLBACK_NULL) == MMSYSERR_NOERROR){
			::midiOutClose(hMidi);
		} else {
			m_nMIDIType = 0;	//	だめじゃん＾＾；
			m_bMIDINoDevice = true;
		}

	}
}

// @yo2 0x0053f990 review
void	CMIDIOutput::CreateInstance(CMIDIOutput* t){
	switch (m_nMIDIType) {
	case 0 : t->m_lpSound.Add(new CSoundNullDevice); break;
#ifdef USE_MIDIOutputMM
//	case 1 : m_lpSound.Add(new CMIDIOutputMM); break;
//	廃止('01/02/04)
#endif
#ifdef USE_MIDIOutputMCI
	case 2 : t->m_lpSound.Add(new CMIDIOutputMCI); break;
#endif
#ifdef USE_MIDIOutputDM
	case 3 : {
		t->m_lpSound.Add(new CMIDIOutputDM);
		if (!((CMIDIOutputDM*)(CSoundBase*)t->m_lpSound)->CanUseDirectMusic())

		#ifdef USE_MIDIOutputMCI
			t->m_lpSound.Add(new CMIDIOutputMCI);		// DirectMusicが使えない環境なのでMCIで再生
			//	これは破壊的コピー
		#else
			t->m_lpSound.Add(new CSoundNullDevice);	//	DirectMusicが使えなくて、
													//	かつMCIは使わないとのことなので再生しない
			//	これは破壊的コピー
		#endif

		break;
			 }
#endif
	default: WARNING(true,"CMIDIOutput::CMIDIOutputで存在しないデバイスの生成");
	}
}
