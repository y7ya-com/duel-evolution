// yaneDirectSound.h
//	 This is DirectSound wrapper.
//		programmed by yaneurao(M.Isozaki) '99/06/18
//				modified by yaneurao	  '00/03/02

#ifndef __yaneDirectSound_h__
#define __yaneDirectSound_h__

#include "yaneWinHook.h"

namespace mtknLib { class kmStreamSoundHelper;};

class CDirectSound : public CWinHook {
public:
	LRESULT	SetFormat(int nType);	//	プライマリサウンドバッファの周波数変更

	CDirectSound(void);
	virtual ~CDirectSound();

	friend class CSound;
	friend class mtknLib::kmStreamSoundHelper;
	friend class CMovieAVIAUDIO;

	//	こいつで参照カウントをとる
	static void AddRef(void) { if (m_nRef++==0) m_lpCDirectSound.Add(); }
	static void DelRef(void) { if (--m_nRef==0) m_lpCDirectSound.Delete(); }
	//	AddRefしたあとならば以下の関数が有効
	static CDirectSound* GetCDirectSound(void){ return m_lpCDirectSound; }
	static LPDIRECTSOUND GetDirectSound(void) { return m_lpCDirectSound->m_lpDirectSound; }

	//	[Konami] added: result of the last Initialize() run by the constructor (1 until then);
	//	read by game code (0 = DirectSound OK). Name is ours.
	static LRESULT	m_lrInitResult;

protected:

	LRESULT Initialize(void);
	LRESULT Terminate(void);

	LPDIRECTSOUND	m_lpDirectSound;
	LPDIRECTSOUNDBUFFER	m_lpPrimary;
	int				m_nFormat;		//	プライマリサウンドバッファの周波数

	HWND			m_hWnd;			//	保有しているウィンドゥハンドル
	bool			m_bSuccessInit;	//	初期化に成功したか

	LRESULT WndProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam);	//	override from CWinHook
	LRESULT CheckSoundLost(void);	// ロストしてたら修復する
	//	ただし、再生ポイントまでは修正できない（仕方がない）ので注意が必要
	//	このチェックはWM_ACTIVATEAPPに応じて呼び出す！

	static int		m_nRef;
	static auto_ptrEx<CDirectSound> m_lpCDirectSound;
};

#endif
