// yaneSound.h
//	 This is DirectSoundBuffer wrapper.
//		programmed by yaneurao(M.Isozaki) '99/07/07
//		reprogrammed by yaneurao '00/03/04

#ifndef __yaneSound_h__
#define __yaneSound_h__

class CSound;
typedef set<CSound*> CSoundPtrArray;		// チェイン

#include "yaneDirectSound.h"
#include "yaneSoundBase.h"
#include "enraPCMReaderFactory.h"

//	このクラスは、メインウィンドゥを保有するスレッドから
//	作成／消滅させること！

class CSound : public CSoundBase {
public:
	//	CSoundBase member function..
	// @yo2 0x0056c240 vt
	virtual LRESULT Open(LPCTSTR pFileName) { return Load(pFileName); }
	// @yo2 0x0056c370 vt
	virtual LRESULT Close(void)	{ return Release(); }
	virtual LRESULT Play(void);			// 再生
			LRESULT Play(DWORD);		// 再生（指定位置から）
	virtual LRESULT Replay(void);		// pauseで止めていた再生を再開。
	virtual LRESULT Stop(void);			// 停止
	virtual LRESULT Pause(void);		// 再生のpause
	virtual bool	IsPlay(void);	// 再生中ならtrue
	// @yo2 0x0056c390 vt
	virtual bool	IsLoopPlay(void) { return m_bLoop; }// 追加
	virtual LRESULT	SetLoopMode(bool bLoop, LONG lLoopPos=0); // ループで再生するか	// [Konami] added lLoopPos
	virtual LONG	GetCurrentPos(void) { return GetPosition(); }
	virtual LRESULT SetCurrentPos(LONG lPos);	// [ms]
	// @yo2 0x0056c3d0 vt
	virtual LONG	GetLength(void) { return m_lLength;}
	virtual LRESULT SetVolume(LONG volume); // このチャンネルに対するヴォリューム
	virtual LONG	GetVolume(void);	// 取得は、特定チャンネルに対してしかできない...

	// CSound
	virtual LRESULT Load(string filename);
	virtual LRESULT Release(void);			// Waveの解放
	virtual LRESULT Restore(void);			// 保持しているファイル名に従い読み直し

	virtual LONG	GetFrequency(void);			//	再生周波数の設定
	virtual LRESULT SetFrequency( DWORD freq );	//	再生周波数の取得

	LONG	GetPosition(void);			//	現在の再生箇所取得[ms]
	LONG	GetPos(void);				//	現在の再生ポジション取得

	//////////////////////////////////////////////////////////////////

	static	LRESULT	SetFormat(int nType);	//	プライマリサウンドバッファの周波数変更

	CSound(void);
	virtual ~CSound();

	//////////////////////////////////////////////////////////////////////////

	// 現存するCSoundインスタンスすべてにアクセスするためのチェイン
	static CSoundPtrArray	m_lpaSound;

	static LRESULT ReleaseAll(void);			// 全インスタンスのWaveの解放	
	static LRESULT RestoreAll(void);			// 全インスタンスのReload
	static LRESULT SetVolumeAll(LONG volume);	// 全チャンネルに対するヴォリューム
	static void	StopAll(void);					// 全インスタンスのStop
	static void	PauseAll(void);					// 全インスタンスの再生pause
	static void	ReplayAll(void);				// 全インスタンスpauseで止めていた再生を再開

	//////////////////////////////////////////////////////////////////////////

//	virtual LRESULT Play(void)	{ return Play(); }
//	virtual LRESULT Replay(void){ return Replay(); }
//	virtual LRESULT Stop(void)	{ return Stop(); }
//	virtual LRESULT Pause(void)	{ return Pause(); }
//	virtual bool IsPlay(void)	{ return IsPlay(); }
//	virtual LRESULT SetLoopMode(bool bLoop) { return SetLoopMode(bLoop); }

	static	LPDIRECTSOUND GetDirectSound(void) {
		return CDirectSound::GetCDirectSound()->m_lpDirectSound;
	}
	static	CDirectSound* GetCDirectSound(void) {
		return CDirectSound::GetCDirectSound();
	}

	//--- 追加 '02/01/10  by enra ---
	// @yo2 0x0056c3f0 vt
	virtual void SetReaderFactory(smart_ptr<CPCMReaderFactory> p)
	{
		m_lpReaderFactory = p;
	}
	// @yo2 0x0056c4e0 vt
	virtual smart_ptr<CPCMReaderFactory> GetReaderFactory(void)
	{
		return m_lpReaderFactory;
	}
	//-------------------------------

protected:
	LPDIRECTSOUNDBUFFER m_lpDSBuffer;			//	セカンダリバッファ
	string	m_szFileName;						//	WAVEファイルの名前
	int		m_bPaused;							//	サウンドpause中か？
	bool	m_bLoop;							//	ループモードで再生するのか？
	LONG	m_lLoopPos;							//	[Konami] added: set by SetLoopMode, never read (name is ours)
	DWORD	m_nAvgBytesPerSec;					//	秒間のデータバイト数（再生位置算出用）
	LONG	m_lLength;
	//	CDirectSoundは必要になった時点で動的に生成する（解放はしない）
	//	もし、m_lpCDirectSound!=NULLで、m_lpCDirectSound->m_lpDirectSound==NULLであれば、
	//	DirectSoundのCOMインターフェース生成に失敗した≒サウンドカードが無効であるという
	//	ことを意味する。

	//--- 追加 '02/01/10  by enra ---
	smart_ptr<CPCMReaderFactory> m_lpReaderFactory;
	//-------------------------------
	DWORD	m_dwLoopStartPos;	//	[Konami] added: Play() moves a looping buffer here after starting it
								//	(name is ours; only ever 0 inside yaneSDK)
};

#endif
