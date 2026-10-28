// AVIStream関数によるムービー再生
// 2001/3/13
// kaine 
//
// サウンド再生はkmLongSound から引用


#include "stdafx.h"
#undef USE_MovieAVI_Draw

#ifdef USE_FastDraw
#define USE_MovieAVI_Draw 1
#else
  #ifdef USE_DirectDraw
  #define USE_MovieAVI_Draw 1
  #else
	#ifdef USE_DIB32
	#define USE_MovieAVI_Draw 1
	#endif //end USE_DIB32        
  #endif //end USE_FastDraw
#endif  //end USE_DirectDraw

#ifndef USE_MovieAVI_Draw
#undef USE_MovieAVI
#endif

#ifdef USE_MovieAVI

#include <msacm.h>
#include "yaneMovie.h"
#include "yaneMovieAVI.h"

#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す * yane

const int nBufferTime = 2;

CMovieAVI::CMovieAVI(void){

	m_bVisible=false;
	m_bVideoStream = false;
	m_bAudioStream = false;
	m_pAviFile	= NULL;
//	m_pAviStreamVideo = NULL;
//	m_pAviStreamAudio = NULL;

	m_dwPosition = 0;
	m_bPause = 0;
	m_lPreFrame = 0;
	m_lNowFrame = 0;

	m_bNowPlay=false;
	m_bOpen = false;
	m_bVisible = true;
	m_bLoopPlay = false;
//	m_bAudioOnly = false;
//	m_bAudioOutput = true;

	m_bAspect = false;
	m_bResize = false;
	m_bCenter = false;

	m_lWidth = 0;
	m_lHeight = 0;
	m_lVolume = 0;
//	m_bFirstPlane = false;
	m_dwNowTime = 0;
	m_FTimer.Add();
	AVIFileInit();
}

CMovieAVI::~CMovieAVI(){
	Close();
	AVIFileExit();
}


LRESULT CMovieAVI::OpenAviStream(void){
	HRESULT hr;
	if ( m_FileName.empty() ) return -1;
	hr = AVIFileOpen(&m_pAviFile,m_FileName.c_str(),OF_READ | OF_SHARE_DENY_NONE,NULL);
	return hr;
}

LRESULT CMovieAVI::Open(LPCTSTR pFileName){
	if ( pFileName == NULL ) return -1;
	HRESULT hr;

	Close();	

	m_FileName = CFile::MakeFullName(pFileName);

	hr = OpenAviStream();
	if ( hr != 0 ) {
		Err.Out("CMovieAVI::Open AviFile Open Error");
		return -1;
	}

	m_pAviVIDEO.Add(new CMovieAVIVIDEO(this) );
	m_pAviAUDIO.Add(new CMovieAVIAUDIO(this) );

	// エラーでも気にしない
	hr = m_pAviVIDEO->OpenVideoStream(m_pAviFile);
	if ( hr == 0 ){
		m_bVideo = true;
		m_pAviVIDEO->SetTimer(m_FTimer);
	}

	// エラーでも気にしない
	hr = m_pAviAUDIO->OpenAudioStream(m_pAviFile);
	if ( hr == 0 ){
		m_bAudio = true;
		hr = m_pAviAUDIO->InitAudioStream();
		m_pAviAUDIO->SetTimer(m_FTimer);
	}


	PAVISTREAM pavi = m_pAviVIDEO->GetVideoStream();
	if ( pavi == NULL ){
		m_pAviAUDIO->GetAudioStream();
	}
	if ( pavi == NULL ){
		Err.Out("CMovieAVI::Open StreamOpenError");
		return -1;
	}

	hr = AVIStreamInfo(pavi,&m_AviStreamInfo,sizeof(AVISTREAMINFO));
	m_AviFrameRatio = (double)m_AviStreamInfo.dwRate / m_AviStreamInfo.dwScale;
	m_AviFrameRatio2 = (double) m_AviStreamInfo.dwRate / m_AviStreamInfo.dwScale / 1000;

	// AVIの長さ等
	m_lAviLength = m_AviStreamInfo.dwLength / m_AviFrameRatio * 1000;
	if ( m_lAviLength == -1 ){
		Err.Out("CMovieAVI::Open サイズが異常");
		return -1;
	}


	// 受け取っていたパラメータをそれぞれに投げる
	{
		if ( m_pAviVIDEO != NULL ){
			m_pAviVIDEO->SetPos(m_nX,m_nY);
			m_pAviVIDEO->SetSurfaceSize(m_lPWidth,m_lPHeight,m_bResize);
		}
		if ( m_pAviAUDIO != NULL ){
			m_pAviAUDIO->SetVolume(m_lVolume);
		}
	}

	m_bOpen = true;
	return 0;
}
LRESULT CMovieAVI::Close(void){
	Stop();

	*GetVisible()=false;
	m_bOpen = false;
	m_bNowPlay = false;
	m_bVideo = false;
	m_bAudio = false;

	m_pAviVIDEO.Delete();
	m_pAviAUDIO.Delete();
	if ( m_pAviFile != NULL ){
		AVIFileRelease(m_pAviFile);
		m_pAviFile = NULL;
	}

	return 0;
}
LRESULT CMovieAVI::Play(void){
	HRESULT hr=0;

	Stop();

//	bool bF = IsThreadValid();
	m_bPause = 0;
	m_bNowPlay = true;
	m_FTimer->Reset();	// 一応リセット
	m_lOffsetTime = 0;
	m_pAviAUDIO->Play();
	m_pAviVIDEO->Play();
//	m_FTimer->Reset();	// もう一回リセットしておかないとずれがひどい

	return 0;
}
LRESULT CMovieAVI::Replay(void){
//	if ( m_pAviStreamVideo == NULL && m_pAviStreamAudio == NULL ) return -1;
	if ( m_bPause==0) return 0;
	if ( --m_bPause!=0) return 0;

	if ( IsPlay() ) return 0;
	HRESULT hr=0;

	m_lOffsetTime = m_lPauseTime;

	Stop();

	m_bPause = 0;
	m_bNowPlay = true;
	m_FTimer->Reset();
//	m_FTimer->Restart();
	m_pAviVIDEO->Replay();
	m_pAviAUDIO->Replay();

	return 0;
}
LRESULT CMovieAVI::Stop(void){
//	if ( m_pAviStreamVideo == NULL && m_pAviStreamAudio == NULL ) return -1;
	HRESULT hr=0;

	m_bPause += sign(m_bPause);
	if ( !IsPlay() ) return 0;

	m_bPause = 1;

	// 現在位置の保存
	m_FTimer->Pause();
	m_lPauseTime = GetCurrentPos();
	m_bNowPlay = false;

	m_pAviAUDIO->Stop();
	m_pAviVIDEO->Stop();

	return 0;
}
LRESULT CMovieAVI::Pause(void){
	Stop();
	return 0;
}
bool CMovieAVI::IsPlay(void){
	return	m_bNowPlay;
}
LRESULT CMovieAVI::SetLoopMode(bool bLoop){
	if ( m_bLoopPlay == bLoop ) return 1;
	m_bLoopPlay = bLoop;
	return 0;
}

LONG	CMovieAVI::GetCurrentPos(void){
	return m_FTimer->Get()+m_lOffsetTime;
}

LRESULT CMovieAVI::SetCurrentPos(LONG lPos){
	m_lOffsetTime = lPos - m_FTimer->Get() ;
	m_lPauseTime = m_lOffsetTime;
//	m_FTimer->Reset();
	if ( m_pAviAUDIO != NULL ) m_pAviAUDIO->SetCurrentPos(m_lOffsetTime);
	return 0;
}

LONG CMovieAVI::GetLength(void){
	return m_lAviLength;
}

void	CMovieAVI::SetPos(int x,int y){
	m_nX = x;
	m_nY = y;
	if ( m_pAviVIDEO != NULL ) {
		m_pAviVIDEO->SetPos(x,y);
	}
}

LRESULT CMovieAVI::SetVolume(LONG lv){
	m_lVolume = lv;
	if ( m_pAviAUDIO == NULL ) return -1;
	return m_pAviAUDIO->SetVolume(lv);
}

LONG CMovieAVI::GetVolume(void){
	if ( m_pAviAUDIO == NULL ) return m_lVolume;
	return m_pAviAUDIO->GetVolume();
}

#endif
