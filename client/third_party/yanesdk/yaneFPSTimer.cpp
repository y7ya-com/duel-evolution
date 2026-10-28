#include "stdafx.h"

#include "yaneFPSTimer.h"
#include "yaneTimer.h"

// @yo2 0x00530480 review
CFPSTimer::CFPSTimer(void) {
	SetFPS(60); // ディフォルト値の設定

	// timeGetTimeの周期を上げるか？（ＮＴでは1msが保証されていない）
	// まあ、最悪、影響の有りそうなのは、DrawSceneだけなんだけど...
}

// @yo2 0x005304a0 review
CFPSTimer::~CFPSTimer() {
	//	デストラクタでは特に処理はしない
}

// @yo2 0x005304c0 cg
void CFPSTimer::SetFPS(DWORD fps){ // FPS値
	ResetTimer();
	ResetElapseTimeCounter();

	m_dwCallCount = 0;
	m_nUnuseSleep = 0;
	m_nDrawCount  = 0;

	m_dwFPS = fps;
	if (fps==0) {	// non-wait mode
		return ;
	}
	
	// １フレームごとに何ms待つ必要があるのか？×0x10000[ms]
	m_dwFPSWait = (1000*0x10000)/m_dwFPS;
	
	// こいつは、dwFPSWaitの小数以下を16ビットの精度で保持するためにある
	m_dwFPSWaitTT = 0; //　今回の時間はゼロ(cf.DrawFlip)

}

// @yo2 0x00530510 tight
DWORD CFPSTimer::GetFPS(void) {
	return m_dwFPS;
}

// @yo2 0x00530530 feat
void CFPSTimer::ResetTimer(void){
	m_dwLastDraw = CTimeBase::timeGetTime(); // 前回描画時間は、ここで設定
	m_bFrameSkip = false;
	m_dwFrameSkipCounter = 0;
	m_dwFrameSkipCounterN = 0;
}

// @yo2 0x00530580 review
void CFPSTimer::ResetElapseTimeCounter(void){	 // FPSTimeカウンタのリセット
	m_dwElapsedTime = 0;
}

// @yo2 0x005305a0 review
DWORD CFPSTimer::GetElapseTimeCounter(void){	 // FPSTimeカウンタの取得
	return m_dwElapsedTime;
}

// @yo2 0x005305c0 review
void CFPSTimer::ResetCallCounter(void){	  // 呼出しカウンタのリセット
	m_dwCallCount = 0;
}

// @yo2 0x005305e0 review
DWORD CFPSTimer::GetCallCounter(void){	 // 呼出しカウンタの取得
	return m_dwCallCount;
}
// ---------------------------------------------------------------------------

// @yo2 0x00530600 feat
void CFPSTimer::WaitFrame(void){	  // (C)yaneurao 1998-1999
	DWORD t = CTimeBase::timeGetTime(); // 現在時刻

	//	スキップレートカウンタ
	if (m_dwFPS!=0 && ((m_dwCallCount % m_dwFPS) == 0)) {
		m_dwFrameSkipCounter = m_dwFrameSkipCounterN;
		m_dwFrameSkipCounterN = 0;
	}

	m_dwDrawTime[m_nDrawCount & 31] = t;  // Drawした時間を記録することでFPSを算出する手助けにする
	if (++m_nDrawCount == 64) m_nDrawCount = 32;
	// 8に戻すことによって、0～15なら、まだ16フレームの描画が終わっていないため、
	// FPSの算出が出来ないことを知ることが出来る。

	m_dwCallCount++; // こいつをFPS測定に使うことが出来る。

	// かなり厳粛かつ正確かつ効率良く時間待ちをするはず。
	if (m_dwFPS == 0) {
		m_dwElapseTime[m_nDrawCount & 31] = 0;
		return ; // Non-wait mode
	}

	m_dwFPSWaitTT = (m_dwFPSWaitTT & 0xffff) + m_dwFPSWait; // 今回の待ち時間を計算
	// m_dwFPSWaitは、待ち時間の小数以下を１６ビットの精度で持っていると考えよ
	// これにより、double型を持ち出す必要がなくなる。

	DWORD dwWait = m_dwFPSWaitTT >> 16; // 結局のところ、今回は何ms待つねん？

	// １フレーム時間を経過しちょる。ただちに描画しなちゃい！
	DWORD dwElp = (DWORD)(t - m_dwLastDraw); // 前回描画からいくら経過しとんねん？
	if (dwElp>=dwWait) { // 過ぎてるやん！過ぎてる分、250msまでやったら次回に持ち越すで！
		DWORD dwDelay = dwElp-dwWait;

		//	250以上遅れていたら、フレームスキップしない（初期化のため）
		//	そして、遅れ時間は0として扱う
		if (dwDelay >= 250) {
			dwDelay = 0;
		}

		//	２フレームの描画時間以上ならば次フレームをスキップする
		m_bFrameSkip =	(dwDelay >= dwWait*3);
		if (m_bFrameSkip) m_dwFrameSkipCounterN++;

		if (dwDelay < 250) { t -= dwDelay; } else { t -= 250; }
		// 今回の描画時刻を偽ることで、次回の描画開始時刻を早める

		m_dwLastDraw = t;
		m_dwElapseTime[m_nDrawCount & 31] = 0;
		return ;
	}

	// ほな、時間を潰すとすっか！

	m_dwElapsedTime += dwElp; // 時間待ちした分として計上
	m_dwElapseTime[m_nDrawCount & 31] = dwElp;

	m_bFrameSkip = false;	//	次はフレームスキップしない

/*
	// まだ時間はたっぷりあるのか？
	// 4ms以上消費する必要があるのならば、Sleepする
	// いまdwWait>dwElpなのでdwWait-dwElp>=0と考えて良い
	if (dwWait-dwElp >= 4) {
		if (m_nUnuseSleep) {
			m_nUnuseSleep--;
		} else {
			::Sleep(dwWait-dwElp-3);
		}
	}

	// 95/98/NTで測定したところSleep(1);で1ms単位でスリープするのは可能
	// ただし、実装系依存の可能性もあるのでSleepの精度は3ms以内と仮定	

	if ((CTimeBase::timeGetTime()-m_dwLastDraw)>=dwWait) {
	// やっべー！！寝過ごしとるやんけ！！（笑）
		m_nUnuseSleep = 60; // 60フレーム間Sleep使うんはやめ...
		// しかし、なんちゅー神経質なプログラムなんや...
		m_dwLastDraw += dwWait; // 寝過ごしてもーたけど無視や:p
		return ;
	}

	while ((CTimeBase::timeGetTime()-m_dwLastDraw)<dwWait) ;
	// ループで時間を潰す（あまり好きじゃないけど）
*/
	//	⇒　というか、他のスレッドが、Sleepやメッセージ処理を行なわない
	//	場合、そのスレッドから強制的に次のスレッドに切り替えられるのは
	//	20ms(だったかな？)後であるからして..そのへんを考慮すると...
	//	常にスリープ使う実装でもいいような気がする...
	::Sleep(dwWait-dwElp);


	// これで、時間つぶし完了！

	m_dwLastDraw += dwWait; // ぴったりで描画が完了した仮定する。（端数を持ち込まないため）
}

// @yo2 0x00530790 review
bool	CFPSTimer::ToBeSkip(void) const {
	return m_bFrameSkip;
}

// @yo2 0x005307b0 review
DWORD CFPSTimer::GetSkipFrame(void) const {
	return m_dwFrameSkipCounter;
}

// @yo2 0x005307d0 review
DWORD CFPSTimer::GetRealFPS(void) {	//	FPSの取得（測定値）

	if (m_nDrawCount < 16) return 0; // まだ16フレーム計測していない
	if (m_nDrawCount < 32) {
		DWORD t = m_dwDrawTime[(m_nDrawCount-1)]	// 前回時間
			-	m_dwDrawTime[(m_nDrawCount-16)];	// 15回前の時間
		if (t==0) {
			return 0;	//	測定不能
		}	
		return (1000*15+t/2)/t;
		// 平均から算出して値を返す（端数は四捨五入する）
	}
		DWORD t = m_dwDrawTime[(m_nDrawCount-1) & 31] // 前回時間
			-	m_dwDrawTime[m_nDrawCount & 31];	 // 31回前の時間
		if (t==0) {
			return 0;	//	測定不能
		}	
		return (1000*31+t/2)/t;
}

// @yo2 0x00530850 review
DWORD CFPSTimer::GetCPUPower(void) {	 //	 CPU Powerの取得（測定値）

	if (m_nDrawCount < 16) return 0; // まだ16フレーム計測していない
	DWORD t=0;
	for(int i=0;i<16;i++) 
		t += m_dwElapseTime[i]; // ここ16フレーム内でFPSした時間
	// return 1-t/(1000*16/m_dwFPS)[%] ; // FPSノルマから算出して値を返す
	return 100-(t*m_dwFPS/160);
}
