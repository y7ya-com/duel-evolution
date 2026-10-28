// yaneSound.cpp
//	 re-programmed by yaneurao(M.Isozaki) '99/07/07

#include "stdafx.h"
#include "yaneSound.h"
#include "yaneFile.h"		//	Wave読み込みに使う
#include "yaneAcm.h"		//	非標準WAVEの読み込みのための使う
#include "yaneTimer.h"

#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す

	//////////////////////////////////////////////////////////////////////////

CSoundPtrArray		CSound::m_lpaSound;

	//////////////////////////////////////////////////////////////////////////

// @yo2 0x0056c0b0 review
LRESULT	CSound::SetFormat(int type){				//	プライマリサウンドバッファの周波数変更
	if (GetDirectSound()==NULL) return 1;
	return GetCDirectSound()->SetFormat(type);
}

	//////////////////////////////////////////////////////////////////////////

// @yo2 0x0056c0e0 review
CSound::CSound(void){
	CDirectSound::AddRef();
	//	初期化失敗してるか？
	if (GetDirectSound() == NULL) {
		//	だめだこりゃ:p
	}

	m_lpDSBuffer = NULL;
	m_bPaused = 0;			//	参照カウント方式
	m_nAvgBytesPerSec = 0;

	m_lpaSound.insert(this);	//	チェインにインスタンス追加

	// default factory
	m_lpReaderFactory.Add();

	// デフォルトでループしない
	m_bLoop = false;
	m_lLoopPos = 0;			//	[Konami] added
	m_dwLoopStartPos = 0;	//	[Konami] added
}

// @yo2 0x0056c580 vt
CSound::~CSound(){
	Release();
	m_lpaSound.erase(this);
	CDirectSound::DelRef();
}

	//////////////////////////////////////////////////////////////////////////
//*/--- 修正 '02/01/10  by ENRA ---
// @yo2 0x0056c740 vt
LRESULT CSound::Load(string filename){
	DWORD dwDataLen = 0;
	
//	m_bLoop = false;	// なんでリセットするんやヽ(`Д´)ノ '02/03/03  by ENRA

	// この関数、DirectSoundのなかで、いっちゃん手間なんちゃう？
	if (GetDirectSound() == NULL) return 1;	// お疲れさん！

	Release(); // まずは、解放しようね！
	m_szFileName.erase();
	if (filename.empty()) return 0;

	//	すでに同名のファイルを読み込んでいるならば...Duplicateする
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){

		if (*it!=this && (*it)->m_szFileName == filename) {
//			DWORD dwStatus;
//			(*it)->m_lpDSBuffer->GetStatus(&dwStatus);
//			if (dwStatus & DSBSTATUS_BUFFERLOST) continue;	// lostしてるんで次！

			//	LostしていてもDuplicateすべき?
			(*it)->Restore();	//	こっちを復帰させて...

			if (GetDirectSound()->DuplicateSoundBuffer((*it)->m_lpDSBuffer,&m_lpDSBuffer)==DS_OK) {
				m_szFileName = filename;
				m_nAvgBytesPerSec = (*it)->m_nAvgBytesPerSec;	//	これもコピー:p
				return 0;
			} else {
				return 1;
			}
		}
	}

	// Factoryあらへんやん(;´Д`)
	if(m_lpReaderFactory==NULL){ m_lpReaderFactory.Add(); }
	// オープンできるやつおるかー？
	mtknLib::IkmPCMstream* pReader = m_lpReaderFactory->CreateReader(filename.c_str());
	if (pReader==NULL) {
		Err.Out("CSound::Load " + filename + "のファイル読み込み時のエラー");
		return 1; // ファイル読み込みエラー
	}

	// 必要なバッファ長を得る
	dwDataLen = pReader->GetPCMLength();

	// やっとこDirectSoundの初期化
	DSBUFFERDESC  dsbdDesc;
	ZeroMemory(&dsbdDesc, sizeof(DSBUFFERDESC));
	dsbdDesc.dwSize = sizeof(DSBUFFERDESC);
	dsbdDesc.dwFlags = DSBCAPS_CTRLVOLUME | DSBCAPS_CTRLFREQUENCY; // ボリュームだけで結構！！
	// dsbdDesc.dwFlags = DSBCAPS_LOCSOFTWARE;
	// 大量のデータを扱う場合、ソフトメモリでやったほうが問題が少ないのだが
	// （ハードウェアにあるとかえってミキシングに時間がかかる可能性がある）
	// 音質が悪くなる可能性あり。
	// あと、ボリュームコントロール能力を持たせておく必要あり。
	// ハードウェアバッファがコントロール能力を持つと、
	// 処理に時間がかかるかも...

	// | DSBCAPS_GETCURRENTPOSITION2;
	// これを入れると、演奏中かどうかのステータスが少し遅くなるので
	// ステータスを見ての連続再生ができなくなる！

	// | DSBCAPS_GLOBALFOCUS
	// こいつを入れると、BackGroundでも音が鳴り続ける

	dsbdDesc.dwBufferBytes = dwDataLen;
	dsbdDesc.lpwfxFormat = pReader->GetFormat();

	// DirectSoundバッファの作成
	if (GetDirectSound()->CreateSoundBuffer(&dsbdDesc,&m_lpDSBuffer, NULL) != DS_OK){
		//	周波数変更のコントロールがまずかったんか？
		dsbdDesc.dwFlags = DSBCAPS_CTRLVOLUME; // ボリュームだけならどうよ！？
		if (GetDirectSound()->CreateSoundBuffer(&dsbdDesc,&m_lpDSBuffer, NULL) != DS_OK){
			Err.Out("CSound::LoadのCreateSoundBuffer()で失敗！");
			return 7;
		}
	}

	// DirectSoundバッファをLock
	BYTE* lpDSBuffData;
	HRESULT hr;
	hr = m_lpDSBuffer->Lock(0, dwDataLen, (void**)&lpDSBuffData,
		&dwDataLen, NULL, 0, 0);
		// これは、実は、失敗することは多々有るのだ:p

	if (hr==DSERR_BUFFERLOST){
		m_lpDSBuffer->Restore(); // これでオッケ!（笑）
		hr = m_lpDSBuffer->Lock(0, dwDataLen, (void**)&lpDSBuffData,
			&dwDataLen, NULL, 0, 0);
		// んで、もっかいリトライするの！！
	}

	if (hr!=DS_OK) {
		// これでダメなら、メモリ足りんのちゃう？
		Err.Out("CSound::LoadのLock()に失敗！");
		return 8;
	}

	// ファイルを展開
	pReader->SetLoop(false);
	pReader->Read(lpDSBuffData, dsbdDesc.dwBufferBytes);
	// DLLから出張中なのでsmart_ptrは使っちゃだめだめ。
	pReader->DeleteSelf();  pReader=NULL;

	// DirectSoundバッファのUnlock...
	if (m_lpDSBuffer->Unlock(lpDSBuffData, dwDataLen, NULL, 0)
		!= DS_OK) {
		// こんなんふつー、失敗するかぁ...どないせーちゅーんじゃ
		Err.Out("CSound::LoadのUnlock()に失敗！");
		return 10;
	}

	//	秒間の再生秒数
	WAVEFORMATEX wfe;
	if( (m_lpDSBuffer->GetFormat( &wfe, sizeof(wfe), NULL )) == DS_OK &&
		(wfe.nAvgBytesPerSec)){
		m_nAvgBytesPerSec = wfe.nAvgBytesPerSec;
	} else {
		//	おかしいなぁ。これエラーになるんかい？
		m_nAvgBytesPerSec = 0;
	}

	m_szFileName = filename;
	m_lLength = LONG(((DWORDLONG)dwDataLen * 1000) / m_nAvgBytesPerSec);

	return 0;
}
//-------------------------------*/
/*--- 削除 '02/01/10  by ENRA ---
LRESULT CSound::Load(string filename){
	DWORD dwDataLen = 0;
	LPVOID pWaveData = NULL;
	WAVEFORMATEX  *pWFormat=NULL;
	
	m_bLoop = false;

	// この関数、DirectSoundのなかで、いっちゃん手間なんちゃう？
	if (GetDirectSound() == NULL) return 1;	// お疲れさん！

	Release(); // まずは、解放しようね！
	m_szFileName.erase();
	if (filename.empty()) return 0;

	//	すでに同名のファイルを読み込んでいるならば...Duplicateする
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){

		if (*it!=this && (*it)->m_szFileName == filename) {
//			DWORD dwStatus;
//			(*it)->m_lpDSBuffer->GetStatus(&dwStatus);
//			if (dwStatus & DSBSTATUS_BUFFERLOST) continue;	// lostしてるんで次！

			//	LostしていてもDuplicateすべき?
			(*it)->Restore();	//	こっちを復帰させて...

			if (GetDirectSound()->DuplicateSoundBuffer((*it)->m_lpDSBuffer,&m_lpDSBuffer)==DS_OK) {
				m_szFileName = filename;
				m_nAvgBytesPerSec = (*it)->m_nAvgBytesPerSec;	//	これもコピー:p
				return 0;
			} else {
				return 1;
			}
		}
	}

	CFile file;
	if (file.Read(filename)) {
		Err.Out("CSound::Load " + filename + "のファイル読み込み時のエラー");
		return 1; // ファイル読み込みエラー
	}
	
	// WAVEFORMATEX構造体を得る
	// この形式でwaveデータを獲得しなくては！（大変かも）

	// データは、メモリ上、f.fileadrからf.filesize分だけある。
	MMIOINFO mmio; // メモリファイルをmmioOpenするのだ！！(C)yaneurao
	ZeroMemory(&mmio,sizeof(mmio));
	mmio.pchBuffer = (LPSTR)file.GetMemory();	// こいつにファイルバッファadr
	mmio.fccIOProc = FOURCC_MEM;				// メモリから！
	mmio.cchBuffer = file.GetSize();			// こいつにファイルサイズ
	// mmio.adwInfo	  = 0;			// バッファは増えなくていいんだってば！

	CAcm	acm;		//	acm変換の準備
	// やっとオープンできる。（先は長いぞー）
	HMMIO hmmio = mmioOpen(NULL,&mmio,MMIO_READ);
	if (hmmio==NULL) {
		Err.Out("CSound::Load : mmioOpenの失敗");
		return 2;
	}

	MMCKINFO ciPC,ciSC; // 親チャンクとサブチャンク
	ciPC.fccType = mmioFOURCC('W','A','V','E');
	if (mmioDescend(hmmio,(LPMMCKINFO)&ciPC,NULL,MMIO_FINDRIFF)){
		mmioClose(hmmio,0);
		//	ひょっとしてmp3か？
		if (acm.Open((BYTE*)file.GetMemory(),file.GetSize())==0) goto OPEN_MP3;
		Err.Out("CSound::Load : Waveファイルでない");
		return 3;
	}
	ciSC.ckid = mmioFOURCC('f','m','t',' ');
	if (mmioDescend(hmmio,&ciSC,&ciPC,MMIO_FINDCHUNK)){
		Err.Out("CSound::Load : fmtチャンクが指定できない");
		mmioClose(hmmio,0);
		return 4;
	}

	//	ここで、if (pWFormat->wFormatTag !=WAVE_FORMAT_PCM){
	//	とやって、標準WAVE以外のファイルをはじくことは出来るが、
	//	標準WAVEファイルでない場合は、CODECを呼び出すようにしてみる。

	// メモリ上にあるのだから、Readする必要はない。
	// このポインタさえ得られれば良い。
	// 現在位置から相対シークで0移動すれば
	// GetCurrentPosition的なことが可能となる
	// そいつに先頭アドレスを加算すればＯＫ。

	pWFormat = (WAVEFORMATEX*)
		((BYTE*)file.GetMemory() + mmioSeek(hmmio,0,SEEK_CUR));
	//	(C) yaneurao

	mmioAscend(hmmio,&ciSC,0); // fmtサブチャンク外部へ移動
	ciSC.ckid = mmioFOURCC('d','a','t','a');
	if (mmioDescend(hmmio,&ciSC,&ciPC,MMIO_FINDCHUNK)){
		Err.Out("CSound::Load : データチャンクに行けない");
		mmioClose(hmmio,0);
		return 5;
	}

	// さっきと同じ手法でデータへのポインタを得る
	dwDataLen = ciSC.cksize; // データサイズ
	pWaveData = (LPVOID)
		((BYTE*)file.GetMemory() + mmioSeek(hmmio,0,SEEK_CUR));
	// (C) yaneurao
	mmioClose(hmmio,0);
	// CloseしてもメモリはGlobalAllocで固定メモリに割り当てられている
	// ので問題ない。

	// これで、pWFormat,pWaveData,dwDataLenを獲得できた！

OPEN_MP3:;	//	MP3を直接オープンしたときはここに飛ぶ:p

	// やっとこDirectSoundの初期化
	DSBUFFERDESC  dsbdDesc;
	ZeroMemory(&dsbdDesc, sizeof(DSBUFFERDESC));
	dsbdDesc.dwSize = sizeof(DSBUFFERDESC);
	dsbdDesc.dwFlags = DSBCAPS_CTRLVOLUME | DSBCAPS_CTRLFREQUENCY; // ボリュームだけで結構！！
	// dsbdDesc.dwFlags = DSBCAPS_LOCSOFTWARE;
	// 大量のデータを扱う場合、ソフトメモリでやったほうが問題が少ないのだが
	// （ハードウェアにあるとかえってミキシングに時間がかかる可能性がある）
	// 音質が悪くなる可能性あり。
	// あと、ボリュームコントロール能力を持たせておく必要あり。
	// ハードウェアバッファがコントロール能力を持つと、
	// 処理に時間がかかるかも...

	// | DSBCAPS_GETCURRENTPOSITION2;
	// これを入れると、演奏中かどうかのステータスが少し遅くなるので
	// ステータスを見ての連続再生ができなくなる！

	// | DSBCAPS_GLOBALFOCUS
	// こいつを入れると、BackGroundでも音が鳴り続ける

	//	標準WAVEファイルではない→CODECを呼びに行く
	if (acm.IsOpen()) {	//	既にMP3ファイルをオープンしている
		dwDataLen	= acm.GetSize();	//	acmから変換後のサイズを得る
		pWFormat	= acm.GetFormat();	//	acmから変換後のフォーマットを得る
	} else
	if (pWFormat->wFormatTag !=WAVE_FORMAT_PCM){
		if (acm.Open(pWFormat,pWaveData,dwDataLen)!=0){
			Err.Out("CSound::非対応のWAVE FORMAT");	
			return 6;
		};
		dwDataLen	= acm.GetSize();	//	acmから変換後のサイズを得る
		pWFormat	= acm.GetFormat();	//	acmから変換後のフォーマットを得る
	}

	dsbdDesc.dwBufferBytes = dwDataLen; // これね！
	dsbdDesc.lpwfxFormat = pWFormat;	// これね！

	// DirectSoundバッファの作成
	if (GetDirectSound()->CreateSoundBuffer(&dsbdDesc,&m_lpDSBuffer, NULL) != DS_OK){
		//	周波数変更のコントロールがまずかったんか？
		dsbdDesc.dwFlags = DSBCAPS_CTRLVOLUME; // ボリュームだけならどうよ！？
		if (GetDirectSound()->CreateSoundBuffer(&dsbdDesc,&m_lpDSBuffer, NULL) != DS_OK){
			Err.Out("CSound::LoadのCreateSoundBuffer()で失敗！");
			return 7;
		}
	}

	// DirectSoundバッファをLock
	BYTE* lpDSBuffData;
	LRESULT hr;
	hr = m_lpDSBuffer->Lock(0, dwDataLen, (void**)&lpDSBuffData,
		&dwDataLen, NULL, 0, 0);
		// これは、実は、失敗することは多々有るのだ:p

	if (hr==DSERR_BUFFERLOST){
		m_lpDSBuffer->Restore(); // これでオッケ!（笑）
		hr = m_lpDSBuffer->Lock(0, dwDataLen, (void**)&lpDSBuffData,
			&dwDataLen, NULL, 0, 0);
		// んで、もっかいリトライするの！！
	}

	if (hr!=DS_OK) {
		// これでダメなら、メモリ足りんのちゃう？
		Err.Out("CSound::LoadのLock()に失敗！");
		return 8;
	}

	if (acm.IsOpen()) {
		//	acmを使うならば、acmにLockしたバッファポインタを渡して
		//	直接そこに変換してもらう。（なんでみんなそうせーへんの？）
		if (acm.Convert(lpDSBuffData)!=0) {
			Err.Out("CSound::Acmでの変換に失敗");
			return 9;
		};
	} else {
		// WaveDataをDirectSoundバッファに転送
		CopyMemory(lpDSBuffData,(LPVOID)pWaveData,dwDataLen);
	}

	// DirectSoundバッファのUnlock...
	if (m_lpDSBuffer->Unlock(lpDSBuffData, dwDataLen, NULL, 0)
		!= DS_OK) {
		// こんなんふつー、失敗するかぁ...どないせーちゅーんじゃ
		Err.Out("CSound::LoadのUnlock()に失敗！");
		return 10;
	}

	//	秒間の再生秒数
	WAVEFORMATEX wfe;
	if( (m_lpDSBuffer->GetFormat( &wfe, sizeof(wfe), NULL )) == DS_OK &&
		(wfe.nAvgBytesPerSec)){
		m_nAvgBytesPerSec = wfe.nAvgBytesPerSec;
	} else {
		//	おかしいなぁ。これエラーになるんかい？
		m_nAvgBytesPerSec = 0;
	}

	m_szFileName = filename;
	m_lLength = LONG(((DWORDLONG)dwDataLen * 1000) / m_nAvgBytesPerSec);

	return 0;
}
//-------------------------------*/

// @yo2 0x0056ce10 vt
LRESULT CSound::Release(void){
	if (m_lpDSBuffer!= NULL) {
		if (IsPlay()) Stop();
		// 再生中ならとめんといかんよ！ （一応ね）
		RELEASE_SAFE(m_lpDSBuffer);
		m_szFileName.erase();
	}
	return 0;
}

// @yo2 0x0056cf50 vt
LRESULT CSound::Restore(void){
	if (!m_szFileName.empty()) {// それって読み込んでないんちゃうん？
		DWORD dwStatus;
		if (m_lpDSBuffer==NULL) return 1;
		m_lpDSBuffer->GetStatus(&dwStatus);
		if (!(dwStatus & DSBSTATUS_BUFFERLOST)) return 0; // Lostしてないやん？
	}

	RELEASE_SAFE(m_lpDSBuffer); // 一回、解放してまうほうがてっとり早い！

	string string;
	string = m_szFileName; // コピーして渡さんとReleaseされちゃう:p
	return Load(string);
}


// @yo2 0x0056d0c0 vt
LRESULT CSound::Play(void) {

	m_bPaused = 0;
	if (m_lpDSBuffer==NULL) return 1; // バッファも用意せんと呼ぶなっちゅーに！
	
	// 再生中なら、止めてでも再生しなおす。
	DWORD dwStatus;
	// 本来なら、演奏中なら止めずにカレントポジションだけ変更しておけば
	// 良いはずなのだが、その瞬間にPLAYが終了するという可能性もある。
	// （なんか、DirectSoundのバグのような気もしなくもない）

	// そこで、カレントポジションを先頭に戻して、プレイが止まって
	// いれば、再生というアルゴリズムに変更する。
	
	m_lpDSBuffer->SetCurrentPosition(0);
	// 頭に戻してからのほーがPlay判定正確やね (C) yaneurao
	m_lpDSBuffer->GetStatus(&dwStatus);
	if (dwStatus & DSBSTATUS_PLAYING) {		
		m_lpDSBuffer->Stop(); // 突然止めたら少しノイズ入るけどな。仕方ないわな。
		m_lpDSBuffer->SetCurrentPosition(0);
	}

	if (m_bLoop) {	//	ループ再生に対応するのだ:p
		if (m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING)==DSERR_BUFFERLOST){
		// えらいこっちゃ。バッファLOSTしちょる。restoreするナリ！
			return Restore();
		}
		//	[Konami] added: start the looping playback from m_dwLoopStartPos
		if (m_dwLoopStartPos > 0) {
			m_lpDSBuffer->SetCurrentPosition(m_dwLoopStartPos);
		}
	} else {
		if (m_lpDSBuffer->Play(0,0,0)==DSERR_BUFFERLOST){
		// えらいこっちゃ。バッファLOSTしちょる。restoreするナリ！
			return Restore();
		}
	}
	return 0;
}

	//////////////////////////////////////////////////////////////////////////

// @yo2 0x0056d1a0 vt
LRESULT CSound::Stop(void)
{
	if (!IsPlay()) return 0; // もう止まってるっちゅーに！

	// ここに抜けてきたっちゅーことは、m_lpDSBuffer!=NULL
	//--- 追加 '02/02/27  by enra ---
	// すぐに止めるとノイズが出るのでボリュームを細工する
	const LONG now = GetVolume();
	const LONG step = (now/*<=0*/-DSBVOLUME_MIN/*=-10000*/)/25;
	CTimer vTimer;
	vTimer.Reset();
	for(int i=0; i<25; i=vTimer.Get()){
		// ちょっと誤差出るけど気にしないヽ(´▽｀)ノ
		SetVolume(now - step*i);
	}
	// 最後の仕上げ
	SetVolume(DSBVOLUME_MIN);
	// んで止める
	LRESULT ret = m_lpDSBuffer->Stop();
	// ボリュームを元に戻す
	SetVolume(now);
	//-------------------------------
	m_lpDSBuffer->SetCurrentPosition(0); // もどしとかな！

	return 0;
}

// @yo2 0x0056d2c0 vt
bool CSound::IsPlay(void)
// そのチャンネルが再生中ならtrue
{
	if (m_lpDSBuffer==NULL) return false; // バッファも用意せんと呼ぶなっちゅーに！
	
	DWORD dwStatus;
	m_lpDSBuffer->GetStatus(&dwStatus);
	return dwStatus & DSBSTATUS_PLAYING;
}

// @yo2 0x0056d2f0 vt
LRESULT CSound::Pause(void)
 // 特定チャンネルのpause
{
	m_bPaused += sign(m_bPaused);	//	必殺技:p
	if (!IsPlay()) {
		return 0; // もう終わってるっちゅーに！
	}
	//	再生中のをpauseしたんならば
	m_bPaused = 1;

	// ここに抜けてきたっちゅーことは、m_lpDSBuffer!=NULL
	return m_lpDSBuffer->Stop();
}

// @yo2 0x0056d340 vt
LRESULT CSound::Replay(void)
// pauseで止めていた、そのチャンネルの再生を再開。
{
	if (!m_bPaused) return 0; // pauseしてへんて！
	
	if (--m_bPaused==0) {	//	参照カウント方式
		if (m_bLoop) {	//	ループ再生に対応するのだ:p
			return m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING);
		} else {
			return m_lpDSBuffer->Play(0,0,0);
		}
	}
	return 0;
}

// @yo2 0x0056d390 vt
LRESULT CSound::SetVolume(LONG volume)
{
	if (m_lpDSBuffer==NULL) return 1; // 不正でっせー

	// 範囲外のエラーチェックせーへんから、勝手にやってやー
	return m_lpDSBuffer->SetVolume(volume);

	// DSBVOLUME_MAX（減衰なし） :		0
	// DSBVOLUME_MIN（無音）	 : -10000
	// の間で指定するのよん。
}

// @yo2 0x0056d3c0 vt
LONG CSound::GetVolume(void) 
// 取得は、特定チャンネルに対してしかできない...
{
	if (m_lpDSBuffer==NULL) return 1; // 不正でっせー
	LONG volume;
	if ((m_lpDSBuffer->GetVolume(&volume))!=DS_OK){
		Err.Out("CSound::GetVolumeに失敗");
		return 0; // volumeはDSBVOLUME_MAXを返しとこか?
	}
	return volume;
}

// @yo2 0x0056d400 tight
LONG CSound::GetPosition(void) {

	if (m_lpDSBuffer==NULL ) return -1;
	if (m_nAvgBytesPerSec==0) return -1;	//	Loadの情報取得で失敗している
	
	DWORD pos, dm;
	if( (m_lpDSBuffer->GetCurrentPosition( &pos, &dm )) != DS_OK ) return -1;
	return LONG(((DWORDLONG) pos*1000 ) / m_nAvgBytesPerSec);
	//	DWORDLONGにキャストしないと溢れちゃう:p
}

// @yo2 0x0056d490 vt
LRESULT CSound::SetCurrentPos(LONG lPos){
	if (m_lpDSBuffer==NULL ) return -1;
	if (m_nAvgBytesPerSec==0) return -1;	//	Loadの情報取得で失敗している

	DWORD pos;
	pos = lPos * m_nAvgBytesPerSec / 1000;
//	Err.Out("pos %d",pos);
	return m_lpDSBuffer->SetCurrentPosition(pos);
}

//	bmdさんの提案
// @yo2 0x0056d4e0 vt
LONG CSound::GetFrequency(void){

	if(m_lpDSBuffer==NULL) return -1; // バッファも用意せんと呼ぶなっちゅーに！

	DWORD dwFreq;
	if( m_lpDSBuffer->GetFrequency( &dwFreq ) != DS_OK ) return -2;
	return( (LONG)dwFreq );
}

// @yo2 0x0056d520 vt
LRESULT CSound::SetFrequency( DWORD freq )
{
	if(m_lpDSBuffer==NULL) return 1; // バッファも用意せんと呼ぶなっちゅーに！
	if((DSBFREQUENCY_MIN<=freq && freq<=DSBFREQUENCY_MAX) || freq==DSBFREQUENCY_ORIGINAL)
		if( m_lpDSBuffer->SetFrequency( freq ) == DS_OK ) return 0;
	return 2;
}

//////////////////////////////////////////////////////////////////////////////
//	questさん提案

// @yo2 0x0056d570 review
LONG CSound::GetPos(void) {	//	絶対位置をそのまま返す

	if (m_lpDSBuffer==NULL ) return -1;
	if (m_nAvgBytesPerSec==0) return -1;	//	LoadWaveFileの情報取得で失敗している
	
	DWORD pos, dm;
	if( (m_lpDSBuffer->GetCurrentPosition( &pos, &dm )) != DS_OK ) return -1;
	return pos;
}

/*
LRESULT CSound::SetPos( DWORD pos )
{
	if(m_lpDSBuffer==NULL) return 1; 
	if( m_lpDSBuffer->SetCurrentPosition( pos ) != DS_OK ) return 2;
	return 0;
}
*/

// @yo2 0x0056d5e0 review
LRESULT CSound::Play( DWORD pos )
{
	m_bPaused = 0;
	if (m_lpDSBuffer==NULL) return 1; // バッファも用意せんと呼ぶなっちゅーに！
	
	// 再生中なら、止めてでも再生しなおす。
	DWORD dwStatus;
	m_lpDSBuffer->SetCurrentPosition(pos);
	// 頭に戻してからのほーがPlay判定正確やね (C) yaneurao
	m_lpDSBuffer->GetStatus(&dwStatus);
	if (dwStatus & DSBSTATUS_PLAYING) {		
		m_lpDSBuffer->Stop(); // 突然止めたら少しノイズ入るけどな。仕方ないわな。
		m_lpDSBuffer->SetCurrentPosition(pos);
	}

	if (m_bLoop) {	//	ループ再生に対応するのだ:p
		if (m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING)==DSERR_BUFFERLOST){
		// えらいこっちゃ。バッファLOSTしちょる。restoreするナリ！
			return Restore();
		}
	} else {
		if (m_lpDSBuffer->Play(0,0,0)==DSERR_BUFFERLOST){
		// えらいこっちゃ。バッファLOSTしちょる。restoreするナリ！
			return Restore();
		}
	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//	全インスタンスに対する操作
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0056d6b0 cg
LRESULT CSound::ReleaseAll(void){
	if (m_lpaSound.empty()) return 0;
	
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->Release();
	}
	return 0;
}

// @yo2 0x0056d740 review
LRESULT	CSound::RestoreAll(void){
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->Restore();
	}
	return 0;
}

// @yo2 0x0056d7c0 review
LRESULT	CSound::SetVolumeAll(LONG volume){	// [portable] LONG as in the header (long is 64-bit off Windows)
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->SetVolume(volume);
	}
	return 0;
}

// @yo2 0x0056d850 review
void	CSound::StopAll(void){
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->Stop();
	}
}

// @yo2 0x0056d8d0 review
void	CSound::PauseAll(void){
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->Pause();
	}
}

// @yo2 0x0056d950 review
void	CSound::ReplayAll(void){
	for (set<CSound*>::iterator it=m_lpaSound.begin();it!=m_lpaSound.end();it++){
		(*it)->Replay();
	}
}

// @yo2 0x0056d9d0 vt
LRESULT	CSound::SetLoopMode(bool bLoop, LONG lLoopPos){	//	[Konami] added lLoopPos
	m_bLoop = bLoop;
	m_lLoopPos = lLoopPos;	//	[Konami] added
	return 0;
}
