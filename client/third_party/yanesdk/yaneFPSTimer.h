// yaneFPSTimer.h
//
//	正確かつ無駄なくウェイトを掛ける
//
//	SetFPSでFPSをセットして、あとは、描画前後にでも、Wait()するだけで良い。
//

#ifndef __yaneFPSTimer_h__
#define __yaneFPSTimer_h__

class CFPSTimer {
public:
	void SetFPS(DWORD fps);	 //	 FPSの設定（イニシャライズを兼ねる）
	DWORD GetFPS(void);		 //	 FPSの取得
	DWORD GetRealFPS(void);	 //	 FPSの取得（測定値）
	DWORD GetCPUPower(void); //	 CPU稼動率の取得（測定値）
	DWORD GetSkipFrame(void) const;
	void ResetTimer(void);	 //	 待ち時間の端数のリセット（普通、使う必要はない）
	void WaitFrame(void);	 //	 １フレーム分の時間が来るまで待つ
	bool ToBeSkip(void) const;	 //	 次のフレームをスキップすべきか？

	void ResetElapseTimeCounter(void);	// 消費時間のリセット
	DWORD GetElapseTimeCounter(void);	// 消費時間の取得
	void ResetCallCounter(void);  // 呼出しカウンタのリセット
	DWORD GetCallCounter(void);	  // 呼出しカウンタの取得

	CFPSTimer(void);
	~CFPSTimer();

protected:
	DWORD m_dwFPS;		  //  FPS(ディフォルトで60)
	DWORD m_dwFPSWait;	  // =1000*0x10000/FPS; // 60FPSに基づくウェイト
	DWORD m_dwLastDraw;	  // 前回の描画時刻
	DWORD m_dwFPSWaitTT;  // 前回発生した端数時間の保持のため
	DWORD m_dwElapsedTime;	  // 前回リセットされてからElapseされた時間
	int	  m_nUnuseSleep;	  // Wait関数内でSleepを利用するか
	DWORD m_dwDrawTime[32];	   // FPS測定用の描画時間計算用
	DWORD m_dwElapseTime[32];  // CPU Power測定用
	DWORD m_nDrawCount;		   // （ここ32回の呼出し時間の平均からFPSを求める）
	DWORD m_dwCallCount;	// WaitFrameを呼び出された回数

	bool	m_bFrameSkip;		 //	次のフレームはスキップするのか？
	DWORD	m_dwFrameSkipCounter; // 　フレームスキップカウンタ
	DWORD	m_dwFrameSkipCounterN; // 計測中のフレームスキップカウンタ
};

#endif
