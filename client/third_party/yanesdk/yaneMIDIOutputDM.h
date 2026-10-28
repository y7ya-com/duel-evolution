#ifdef USE_MIDIOutputDM
// yaneMIDIOutputDM.h
//
//		MIDI出力を、DirectMusicを使って行なう実装例。
//
//		DirectMusicを使うには、DirectX6以降が必要なので注意！
//

#ifndef __yaneMIDIOutputDM_h__
#define __yaneMIDIOutputDM_h__

#include "yaneSoundBase.h"
#include "yaneFile.h"

#include <dmusicc.h>	//	directX6 以降のSDKが必要にょ
#include <dmusici.h>

//	DirectMusic wrapper
class CDirectMusic {
public:
	CDirectMusic(void);
	virtual ~CDirectMusic();

	// CDirectSoundと同じく、参照カウント方式で管理する
	//	こいつで参照カウントをとる
	static void AddRef(void) { if (m_nRef++==0) m_lpCDirectMusic.Add(); }
	static void DelRef(void) { if (--m_nRef==0){ m_lpCDirectMusic.Delete(); m_bFirst = true;}}
	//	AddRefしたあとならば以下の関数が有効
	static CDirectMusic* GetCDirectMusic(void){ return m_lpCDirectMusic; }

	bool	CanUseDirectMusic(void) const;	//	DirectMusicが使えるかを返す

//	IDirectMusic* GetDirectMusic(void) { return m_lpDMusic; }
	//	↑こいつを実際に使うことは有り得ない（と思う）

	IDirectMusicPerformance* GetDirectMusicPerformance(void) { return m_lpDMPerf; }
	IDirectMusicLoader* GetDirectMusicLoader(void) { return m_lpDMLoader; }

private:
	static bool	m_bFirst;
	static bool m_bCanUseDirectMusic;

	IDirectMusicPerformance* m_lpDMPerf;
	IDirectMusic* m_lpDMusic;
	IDirectMusicLoader* m_lpDMLoader;

	static int		m_nRef;
	static auto_ptrEx<CDirectMusic> m_lpCDirectMusic;
};

class CMIDIOutputDM : public CSoundBase {
public:
	CMIDIOutputDM(void);
	virtual ~CMIDIOutputDM();

	bool	CanUseDirectMusic(void){
		//	DirectMusicが使えるかを返す
		return GetDirectMusic()->CanUseDirectMusic();
	}

	//	override from CSoundBase
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
	virtual LRESULT	SetCurrentPos(LONG lPos);
	virtual LONG	GetLength(void);
	virtual LRESULT SetVolume(LONG volume); 
	virtual LONG	GetVolume(void);

protected:
	LRESULT	InnerOpen(void);	//	DirectMusicをオープンする

	CFile	m_File;
	MUSIC_TIME m_mtPosition;	//	Pause時間
	int		m_bPaused;

	LRESULT	LoopPlay(void);	//	LoopPlay用
	bool	m_bLoopPlay;	//	Loop再生するのか？
	LONG	m_lLength;

	//	再生するセグメント
	IDirectMusicSegment* m_lpDMSegment;
	//	再生セグメントのステータス
	IDirectMusicSegmentState* m_lpDMSegmentState;
	CDirectMusic* GetDirectMusic(void) { return CDirectMusic::GetCDirectMusic(); }

	//	メモリ再生は、同じアドレスを指定するとキャッシュが有効になってしまって、
	//	次の曲が再生されないのでその対策(thanks > DEARNA)
	//	auto_array<BYTE> m_alpMIDICache;
};

#endif

#endif // USE_MIDIOutputDM

