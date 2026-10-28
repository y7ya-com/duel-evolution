// yaneCDDA.h
//	CDDA wrapper
//
//		programmed by yaneurao(M.Isozaki) '99/07/08
//

#ifndef __yaneCDDA_h__
#define __yaneCDDA_h__

#include "yaneWinHook.h"

class CCDDA : public CWinHook {
public:
	//////////////////////////////////////////////////////////////////

	LRESULT	Open(string szDriveName="");//	CD初期化。呼び出すとCD回るよ:p
	//	ドライブ名の指定も出来る。例）Open("g"); // G Drive

	LRESULT	Close(void);		//	CD使用終了。CDの回転は止まる。

	//////////////////////////////////////////////////////////////////

	LRESULT	Stop(void);			//	再生停止
	LRESULT	Pause(void);		//	Pause
	LRESULT	Replay(void);		//	Pauseでいったん停止させていたものを再開

	LRESULT Play(void);			//	頭から再生

	int		GetPlayTrack(void);			//	現在再生中のトラックを返す
	LRESULT PlayPrev(bool bEndless=true);	//	前のトラックを再生
	LRESULT PlayNext(bool bEndless=true);	//	次のトラックを再生

	LRESULT Play(int);			//	曲番号を選択して再生
	LRESULT Play(int,int);		//	２トラック間の再生

	LRESULT PlayDW(DWORD,DWORD,bool bReplay=false); // ２ポジション間の再生（）

	LRESULT PlayDW(DWORD dwPos,bool bReplay); // 位置を指定して、そこからそのトラックのみを再生。
	LRESULT PlayDWToEnd(DWORD dwPos,bool bReplay); // 位置を指定して、そこから終了トラックの最後まで再生

	LRESULT	GetCurrentPos(DWORD &dw);	//	現在の再生ポジションを得る
										//	[MSF]
										//  0x0FSM の順に並ぶ
	bool	IsPlay(void) const;			//	演奏中なのか？
	void	SetLoopMode(bool bLoop, LONG lLoopPos=0);	//	ループで再生するか	// [Konami] added lLoopPos

	int		GetSongMax(void) ;		//	曲数の取得(Openしていることが必要)

	LRESULT	Eject(bool bEject);			//	CDのEjectを行なう。

	bool	IsOpen(void){ return m_bOpen;}
	virtual LRESULT ConvertToMealTime(DWORD dwPos,int& nTrack,int&nHour,int&nMin,int&nSec,int&nMS);
	virtual LRESULT ConvertFromMealTime(DWORD& dwPos,int nTrack,int nHour,int nMin,int nSec,int nMS);

	//////////////////////////////////////////////////////////////////

	// これで足りんかったら知らん:p
	int		m_nSongMax;					//	曲数
	DWORD	m_dwSongLength[100];		//	曲の長さ（[0]は全曲の長さ)
	DWORD	m_dwSongStart[100];			//	曲の開始ポジション

	//////////////////////////////////////////////////////////////////

	CCDDA(void);
	virtual ~CCDDA();

//////////////////////////////////////////////////////////////////////////////
protected:
	HWND	m_hWnd;			//	MM_MCINOTIFY通知が来る
	UINT	m_uDeviceID;	//	CDのデバイスID
	bool	m_bOpen;		//	オープン中か？(この間、ＣＤは回りっぱなし)

	bool	m_bLoopPlay;	//	Loop再生するのか？
	DWORD	m_nStartPos;	//	Loop再生の開始位置
	DWORD	m_nEndPos;		//	Loop再生の終了位置
	LONG	m_lLoopPos;		//	[Konami] added: set by SetLoopMode, never read (name is ours)
	LRESULT	LoopPlay(void);	//	LoopPlay用

	DWORD	m_nPausePos;	//	Pauseポジション
	int		m_bPaused;		//	Pause中なのか？
	bool	m_bNowPlay;		//	現在Play中なのか？
	string	m_szDriveName;	//	ドライブ名

	LONG ConvertToSecond(DWORD dwPos);	// [MSF] -> [Sec]
	
	LRESULT PlayDW2(DWORD,DWORD,bool bReplay=false); // ２ポジション間の再生

	// override from CWinHook
	LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);
};

#endif
