#include "stdafx.h"

#include "yaneBGMLoader.h"
#include "yaneSoundBase.h"
#include "yaneMIDIOutput.h"
#include "yaneSound.h"
#include "yaneStreamSound.h"
#include "yaneFile.h"

//	MIDIなんかまだ使うの？もうええやんって気がする...^^;

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0042e4c0 review
CBGMLoader::CBGMLoader(const smart_ptr<CVolumeFader>& v){
	m_nPlayNo		= -1;		//	not play
	m_nPauseNo		= -1;		//	not play
	m_bCancel		= false;
	m_bStreamSound	= false;	//	default: non-stream sound play
	m_bBGMLoop		= true;
	if (!v) {
		m_vVolumeFader.Add();		//	faderを一応追加。
	} else {
		m_vVolumeFader = v;
	}

	//	デフォルトのPCMReaderFactoryを生成
	m_lpReaderFactory.Add();

	m_vListener.Add();
}

// @yo2 0x0042ecd0 vt
CBGMLoader::~CBGMLoader(){
}

//////////////////////////////////////////////////////////////////////////////

//	ひとつの要素に読み込み／解放
// @yo2 0x0042eee0 vt
LRESULT CBGMLoader::InnerLoad(int nNo){

	CSoundBase* lp;
	if (m_lpbMIDI[nNo]) {
		lp = new CMIDIOutput;
	} else {
		if (!m_bStreamSound) {
			lp = new CSound;
			// Factoryをセットする。
			((CSound*)lp)->SetReaderFactory(m_lpReaderFactory);
		} else {
#ifdef USE_StreamSound
			lp = new CStreamSound;
			// Factoryをセットする。
			((CStreamSound*)lp)->SetReaderFactory(m_lpReaderFactory);
#endif
		}
	}
	m_lpSound[nNo].Add(lp);
	m_lpSound[nNo]->Open(m_lpSLOAD_CACHE[nNo].lpszFilename);	//	ファイルも読み込む＾＾；

	//	この関数を手動で実装するのならば、
	//	このとき、読み込みフラグも（手動で）更新しなくてはならない(fixed '01/04/05)
	m_lpbLoad[nNo] = true;

	return 0;
}

// @yo2 0x0042fdb0 vt
LRESULT CBGMLoader::InnerRelease(int nNo){
	m_lpSound[nNo].Delete();
	//	再生中のを停止させるのならば...
	if (m_nPlayNo == nNo) m_nPlayNo = -1;
	return 0;
}

//	m_nMax分だけ配列を確保／解放
// @yo2 0x0042fe20 vt
void	CBGMLoader::InnerCreate(void){
	m_lpSound.resize(m_nMax);
}
// @yo2 0x0042ff60 vt
void	CBGMLoader::InnerDelete(void){
	m_lpSound.clear();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00430000 cg
CSoundBase*	CBGMLoader::GetSound(int nNo){
	//	サウンドバッファ取得
	if (m_lpSound[nNo]==NULL) InnerLoad(nNo);
	m_lpnStaleTime[nNo] = 0;	//	使用したでフラグをＯｎ＾＾；
	return m_lpSound[nNo];
}

// @yo2 0x00430050 vt
LRESULT	CBGMLoader::Set(SLOAD_CACHE*lpsc){
	CLoadCache::Set(lpsc);
	int nMax = GetMax();
	if (nMax == 0) return 1; // なんやねーんそれ＾＾
	m_lpbMIDI.resize(nMax);
	for(int i=0;i<nMax;i++){
		string suffix;
		suffix = CFile::GetSuffixOf(lpsc[i].lpszFilename);
		CFile::ToLower(suffix);
		if (suffix=="mid"){
			m_lpbMIDI[i] = true;
		} else {
			m_lpbMIDI[i] = false;
		}
	}	//	To be MIDI or not to be MIDI...That is a question.
	return 0;
}

// @yo2 0x00430300 review
void	CBGMLoader::Load(int nBGMNo){
	if (m_bCancel) return ;
	GetSound(nBGMNo);	//	これで読み込むのだ＾＾；
}

// @yo2 0x00430330 review
void	CBGMLoader::Play(int nBGMNo){
//	if (m_bCancel) return ;					// キャンセルでも、Noなどは設定しないといけない
	if (m_nPlayNo == nBGMNo) { return; }	// 同じ番号なら帰る
	Stop();	//	停止させる
	GetSound(nBGMNo)->SetLoopMode(true);	//	BGMなのでループ再生
	m_bBGMLoop = true;
	m_nPlayNo = nBGMNo;

	if (m_bCancel) return ;
	GetListener()->OnPlay(nBGMNo);
	GetSound(nBGMNo)->Play();
}

// @yo2 0x00430470 review
void	CBGMLoader::PlayN(int nBGMNo){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない
	Stop();	//	一度停止させる
	GetSound(nBGMNo)->SetLoopMode(true);	//	BGMなのでループ再生
	m_bBGMLoop = true;
	m_nPlayNo = nBGMNo;

	if (m_bCancel) return ;	
	GetListener()->OnPlay(nBGMNo);
	GetSound(nBGMNo)->Play();
}

// @yo2 0x004305a0 review
void	CBGMLoader::PlayOnce(int nBGMNo){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない
	if (m_nPlayNo == nBGMNo) {
		return ;
	}
	Stop();	//	停止させる
	GetSound(nBGMNo)->SetLoopMode(false);	//	BGMだけどなぜか非ループ再生
	m_bBGMLoop = false;
	m_nPlayNo = nBGMNo;

	if (m_bCancel) return ;
	GetListener()->OnPlay(nBGMNo);
	GetSound(nBGMNo)->Play();
}

// @yo2 0x004306d0 review
void	CBGMLoader::PlayOnceN(int nBGMNo){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない
	Stop();	//	一度停止させる
	GetSound(nBGMNo)->SetLoopMode(false);	//	BGMだけどなぜか非ループ再生
	m_bBGMLoop = false;
	m_nPlayNo = nBGMNo;
	
	if (m_bCancel) return ;
	GetListener()->OnPlay(nBGMNo);
	GetSound(nBGMNo)->Play();
}

// @yo2 0x00430800 review
void	CBGMLoader::Stop(void){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない
	m_nPauseNo = -1;	//	止められたのだから、Pauseフラグは消去
	if (m_nPlayNo==-1) return ;

	GetSound(m_nPlayNo)->Stop();
		//	Timer等を解放しないと、次のMIDI再生で引っ掛かる。
	m_vVolumeFader->StopFade();
	m_nPlayNo = -1;	// not play..
}

// @yo2 0x00430850 review
void	CBGMLoader::Pause(void){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない
	if (m_nPlayNo==-1) return ;

	GetSound(m_nPlayNo)->Pause();
		//	Timer等を解放しないと、次のMIDI再生で引っ掛かる。
	m_vVolumeFader->StopFade();
	m_nPauseNo = m_nPlayNo;	//	Pauseしたよーん
	m_nPlayNo = -1;			// not play..
}

// @yo2 0x004308a0 review
void	CBGMLoader::Replay(void){
//	if (m_bCancel) return ;					// キャンセルでも、内部状態は設定しないといけない

	WARNING(m_nPlayNo!=-1 || m_nPauseNo==-1
		,"CBGMLoader::ReplayがPauseせずに呼び出された");

	m_nPlayNo  = m_nPauseNo;
	m_nPauseNo = -1;

	if (m_bCancel) return ;
	GetSound(m_nPlayNo)->Replay();
	GetListener()->OnReplay(m_nPlayNo);
}

// @yo2 0x004309b0 review
LONG	CBGMLoader::GetCurrentPos(void){
	//	現在の再生位置取得([sec])
	if (m_bCancel) return -1;

	if (m_nPlayNo == -1) return -1;
	return GetSound(m_nPlayNo)->GetCurrentPos();
}

// @yo2 0x004309f0 review
int		CBGMLoader::GetPlayNo(void){
	return m_nPlayNo;
}

// @yo2 0x00430a10 vt
void	CBGMLoader::IncStaleTime(void){
	for(int i=0;i<m_nMax;++i){
		if (!IsPlay(i)) m_lpnStaleTime[i]++;
	}
}

// @yo2 0x00430a50 cg
bool	CBGMLoader::IsPlay(int nNo){
	//	サウンドは再生中なのか？
	WARNING(nNo >= m_nMax,"CBGMLoader::IsPlayで範囲外");

	if (!m_lpbLoad[nNo]) {	return false; }
	return m_lpSound[nNo]->IsPlay();
}

// @yo2 0x00430a90 review
bool	CBGMLoader::IsLoopPlay(void) {
	return m_bBGMLoop;
}
