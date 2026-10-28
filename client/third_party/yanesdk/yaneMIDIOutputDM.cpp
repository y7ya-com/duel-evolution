
#include "stdafx.h"

#ifdef USE_MIDIOutputDM

#include "yaneMIDIOutputDM.h"
#include "yaneFile.h"
#include "yaneCOMBase.h"
#include "yaneDirectSound.h"

#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す * yane

///////////////////////////////////////////////////////////////////////////////
bool CDirectMusic::m_bFirst = true;
bool CDirectMusic::m_bCanUseDirectMusic = true;
int		CDirectMusic::m_nRef = 0;
auto_ptrEx<CDirectMusic> CDirectMusic::m_lpCDirectMusic;

bool	CDirectMusic::CanUseDirectMusic(void) const {
	return m_bCanUseDirectMusic;
}

CDirectMusic::CDirectMusic(void){
	HRESULT hr;

	//	DirectMusicが使えるかを返す
	CCOMBase::AddRef();
	if (m_bFirst) {
		m_bFirst = false;
		hr = ::CoCreateInstance(CLSID_DirectMusicPerformance,NULL,CLSCTX_INPROC,
			IID_IDirectMusicPerformance,(void**)&m_lpDMPerf);
		if (FAILED(hr)) {
			m_bCanUseDirectMusic = false;
			m_lpDMPerf = NULL;	//	NULLを保証する
			goto ErrEnd;
		}

		//	さらにDirectSoundから初期化する
		CDirectSound::AddRef();
		m_lpDMusic = NULL;	//	これをやっておかないとbugる。
							//	返し値のために渡す変数の初期化を要求するだなんて、
							//	とんでもないぞ>DirectMusic
		hr = m_lpDMPerf->Init(  &m_lpDMusic /* NULL*/,CDirectSound::GetDirectSound(),NULL);
		if (FAILED(hr)) {
			m_bCanUseDirectMusic = false;
			m_lpDMusic = NULL;	//	NULLを保証する
			CDirectSound::DelRef();
			goto ErrEnd;
		}

		//	ただし、ポート（シンセサイザ）の選択は行なう
		hr = m_lpDMPerf->AddPort(NULL);
		//	上のm_lpDMusicを受けている場合は、そいつから作ったポートでなければならない
		if (FAILED(hr)) {
//			m_bCanUseDirectMusic = false;
			//	サードパーティ製のソフトシンセはディフォルトで
			//	選択されることは無いのでこの場合、失敗する
//			goto ErrEnd;
		//	だけどドンマイ（笑）
		}

		hr = ::CoCreateInstance(CLSID_DirectMusicLoader,NULL,CLSCTX_INPROC,
			IID_IDirectMusicLoader,(void**)&m_lpDMLoader);

		if (FAILED(hr)) {
			m_bCanUseDirectMusic = false;
			m_lpDMLoader = NULL;
			CDirectSound::DelRef();
			goto ErrEnd;
		}

		//	メモリ再生を行なうのでセグメントのキャッシュ設定を切る
		//	これを切ってもバグるようだ＾＾；
		m_lpDMLoader->EnableCache(GUID_DirectMusicAllTypes, false);
		m_lpDMLoader->EnableCache(CLSID_DirectMusicSegment, false);

		//	すべてのテストに合格したときのみtrueにする
		m_bCanUseDirectMusic = true;
	}

ErrEnd:;
}

CDirectMusic::~CDirectMusic(){
	RELEASE_SAFE(m_lpDMLoader);
	
	if (m_bCanUseDirectMusic) {
		CDirectSound::DelRef();
	}

	//		m_lpDMusic->Release();

	if (m_lpDMPerf!=NULL){
		m_lpDMPerf->CloseDown();
		m_lpDMPerf->Release();
	}
	CCOMBase::Release();
}

///////////////////////////////////////////////////////////////////////////////

CMIDIOutputDM::CMIDIOutputDM(void)
{
	CDirectMusic::AddRef();
	m_lpDMSegment = NULL;
	m_lpDMSegmentState = NULL;
	m_bPaused = 0;
	m_bLoopPlay = false;
	m_mtPosition = 0;
}

CMIDIOutputDM::~CMIDIOutputDM()
{
	Close();
	CDirectMusic::DelRef();
}

////////////////
//	オープン
///////////////
LRESULT CMIDIOutputDM::Open(LPCTSTR pName)
{
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;

	Close();

	//	元のファイルを読み込み
	if(m_File.Read((LPSTR)pName)!=0)	{
		Err.Out("CMIDIOutputDM::Openで読み込むファイルが無い"+string(pName));
		return 1;
	}

/*	ダメかも＾＾；
	//	こうすれば、前回のメモリが解放される前に新しいメモリがnewされる
	//	ことが保証される。すなわち、前回再生したものとは違うメモリアドレスが
	//	渡ることが保証される
	auto_array<BYTE> cache(m_File.GetSize());
	::CopyMemory((void*)cache,m_File.GetMemory(),m_File.GetSize());
	Err.Out((int)(BYTE*)cache);
	m_alpMIDICache = cache;	//	破壊的コピー
*/

/*
	//	仕方ないのでテンポラリファイルを生成
	if (m_File.CreateTemporary()!=0)	{
		Err.Out("CMIDIOutputDM::OpenでCreateTemporaryに失敗");
		return 2;
	}
*/

	DMUS_OBJECTDESC desc;
	desc.dwSize = sizeof(DMUS_OBJECTDESC);
	desc.guidClass = CLSID_DirectMusicSegment;
	desc.pbMemData = (BYTE*)m_File.GetMemory(); // (BYTE*)m_alpMIDICache;
	desc.llMemLength = m_File.GetSize();
	desc.dwValidData = DMUS_OBJ_CLASS | DMUS_OBJ_MEMORY | DMUS_OBJ_LOADED;

/*
	#define MULTI_TO_WIDE( x,y )	MultiByteToWideChar( CP_ACP, MB_PRECOMPOSED, y, -1, x, _MAX_PATH );
	WCHAR	szFilename[_MAX_PATH];
	MULTI_TO_WIDE(szFilename,CFile::MakeFullName(m_File.GetName()).c_str());
	::wcscpy( desc.wszFileName,szFilename);				// ファイルを指定
	desc.dwValidData = DMUS_OBJ_CLASS | DMUS_OBJ_FILENAME;	// 構造体内の有効な情報を示すフラグを設定
*/

	HRESULT hr;
	hr = GetDirectMusic()->GetDirectMusicLoader()->GetObject(
			&desc,IID_IDirectMusicSegment,(void**)&m_lpDMSegment);
	if (FAILED(hr)){
		m_lpDMSegment = NULL;
		return 2;
	}
	hr = m_lpDMSegment->SetParam(GUID_StandardMIDIFile,0xffffffff,0,0,
		(void*)GetDirectMusic()->GetDirectMusicPerformance());
	if (FAILED(hr)) return 3;
	hr = m_lpDMSegment->SetParam(GUID_Download,0xffffffff,0,0,
		(void*)GetDirectMusic()->GetDirectMusicPerformance());
	if (FAILED(hr)) return 4;

	return 0;
}

//////////
//	クローズ
//////////
LRESULT CMIDIOutputDM::Close(void)
{
	m_File.Close();	//	delete temporary file
	Stop();	// stopしないとCloseできないよーん

	RELEASE_SAFE(m_lpDMSegmentState);

	if (m_lpDMSegment!=NULL) {
		//	参照の解放
		//	GetDirectMusic()->GetDirectMusicLoader()->ReleaseObject((IDirectMusicObject*)m_lpDMSegment);
		//	これが無いとバグる＾＾；
		GetDirectMusic()->GetDirectMusicLoader()->ClearCache(CLSID_DirectMusicSegment);

		//	DLSのアンロード
		m_lpDMSegment->SetParam(GUID_Unload,0xffffffff,0,0,(void*)GetDirectMusic()->GetDirectMusicPerformance());
		m_lpDMSegment->Release();
	}

	return 0;
}

//////////
//	演奏処理
/////////

LRESULT CMIDIOutputDM::Play(void)
{
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;
	if (m_lpDMSegment==NULL) return -2;

	m_bPaused = 0;

	Stop();

	//	再生開始
	if (!m_bLoopPlay) {
		m_lpDMSegment->SetRepeats(0);	//	繰り返さない
	} else {
		m_lpDMSegment->SetRepeats(-1);	//	回数∞
	}
	m_mtPosition = 0;
	m_lpDMSegment->SetStartPoint(m_mtPosition);

	HRESULT hr = GetDirectMusic()->GetDirectMusicPerformance()->PlaySegment(
		m_lpDMSegment,DMUS_SEGF_DEFAULT,0,&m_lpDMSegmentState);

	if (FAILED(hr)) return 1;

	return 0;
}

LRESULT CMIDIOutputDM::Replay(void)
{
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;
	if (m_lpDMSegment==NULL) return -2;

	if (m_bPaused==0) return 0;		//	pauseしてへんて！
	if (--m_bPaused!=0) return 0;	//	参照カウント方式

	//	なぜか再生中なので何もせずに帰る
	if (IsPlay()) return 0;

	Stop();

	//	再生再開
	m_lpDMSegment->SetStartPoint(m_mtPosition);	//	m_mtPositionは前回Pauseした位置
	if (!m_bLoopPlay) {
		m_lpDMSegment->SetRepeats(0);	//	繰り返さない
	} else {
		m_lpDMSegment->SetRepeats(-1);	//	回数∞
	}
	HRESULT hr = GetDirectMusic()->GetDirectMusicPerformance()->PlaySegment(
		m_lpDMSegment,DMUS_SEGF_DEFAULT,0,&m_lpDMSegmentState);

	if (FAILED(hr)) return 1;

	m_bPaused = 0;
	return 0;
}

LRESULT CMIDIOutputDM::Stop(void)
{
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;

	m_bPaused += sign(m_bPaused);	//	必殺技:p
	if (!IsPlay()) return 0;			//	すでに停止している

	//	再生中のをpauseしたならば
	m_bPaused = 1;

	//	現在の状態読み出して停止
	if (m_lpDMSegment!=NULL && m_lpDMSegmentState!=NULL) {
		GetDirectMusic()->GetDirectMusicPerformance()->Stop(m_lpDMSegment,m_lpDMSegmentState,0,0);
		if (FAILED(m_lpDMSegmentState->GetSeek(&m_mtPosition))) {	//	m_mtPositionは前回Pauseした位置
			m_mtPosition = 0;
		}
		RELEASE_SAFE(m_lpDMSegmentState);
	}

	return 0;
}

LONG	CMIDIOutputDM::GetCurrentPos(void){
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;

	if (m_lpDMSegmentState==NULL) return -2;

	// 現在の再生ポジションを得る
	MUSIC_TIME mt;
	if (FAILED(m_lpDMSegmentState->GetSeek(&mt))) return -3;
	//	↑ここで得たのは、テンポによる相対時刻なので↓で変換してやる必要がある

	REFERENCE_TIME rt;
	if (FAILED(GetDirectMusic()->GetDirectMusicPerformance()->MusicToReferenceTime(
		mt,&rt))) return -4;
	REFERENCE_TIME rt2;
	if (FAILED(GetDirectMusic()->GetDirectMusicPerformance()->MusicToReferenceTime(
		0,&rt2))) return -4;
	rt-=rt2;	//	恐ろしいことに、ベースからの値ではないので
				//	このような補正項が必要になるDirectMusicのバグのような気がしなくもない。

	return rt/10000;	//	これで[ms]単位（REFERENCE_TIMEは分解能ありすぎ！（笑））
}

LRESULT CMIDIOutputDM::SetCurrentPos(LONG lPos){
	HRESULT hr;
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;
	if ( m_lpDMSegment == NULL ) return -1;
	MUSIC_TIME mt;
	LONG lLen = GetLength();
	hr = m_lpDMSegment->GetLength(&mt);

//	なんでだめなんだろう…
//	REFERENCE_TIME rt = lPos*10000;
//	hr = GetDirectMusic()->GetDirectMusicPerformance()->ReferenceToMusicTime(rt,&mt);
	Pause();
	//m_mtPosition;
	m_mtPosition = (DWORDLONG) lPos * mt / lLen;
	Replay();

	return 0;
}

LRESULT CMIDIOutputDM::SetVolume(LONG volume){
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;
	LONG v = volume;
	GetDirectMusic()->GetDirectMusicPerformance()->SetGlobalParam(GUID_PerfMasterVolume,&v,sizeof(v));
	return 0;
}


LONG	CMIDIOutputDM::GetVolume(void)
{
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;
	LONG v;
	GetDirectMusic()->GetDirectMusicPerformance()->GetGlobalParam(GUID_PerfMasterVolume,(LPVOID)&v,sizeof(v));
	return v;
}

LRESULT CMIDIOutputDM::SetLoopMode(bool bLoop){
	m_bLoopPlay = bLoop;
	return 0;
}

bool CMIDIOutputDM::IsPlay(void){
	if (!GetDirectMusic()->CanUseDirectMusic()) return false;
	if (m_lpDMSegmentState==NULL) return false;
	return GetDirectMusic()->GetDirectMusicPerformance()->IsPlaying(m_lpDMSegment,m_lpDMSegmentState)==S_OK;
}

LRESULT	CMIDIOutputDM::LoopPlay(void){
	if (m_bLoopPlay) {
		return Play();
	} else {
		return Stop();
	}
}

LONG	CMIDIOutputDM::GetLength(void){
	if (!GetDirectMusic()->CanUseDirectMusic()) return -1;

	if (m_lpDMSegment==NULL) return -2;

	MUSIC_TIME mt;
	if ( FAILED(m_lpDMSegment->GetLength(&mt))) return -3;

	REFERENCE_TIME rt;
	if (FAILED(
		GetDirectMusic()->GetDirectMusicPerformance()->MusicToReferenceTime(mt,&rt)
		)) return -4;
	REFERENCE_TIME rt2;
	if (FAILED(GetDirectMusic()->GetDirectMusicPerformance()->MusicToReferenceTime(
		0,&rt2))) return -4;
	rt-=rt2;
	return rt/10000;
}

//////////////////////////////////////////////////////////////////////////////

#endif
