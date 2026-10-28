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
#endif //end USE_DirectDraw

#ifndef USE_MovieAVI_Draw
#undef USE_MovieAVI
#endif


#ifdef USE_MovieAVI

#include <msacm.h>
#include "yaneMovie.h"
#include "yaneMovieAVI.h"

#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す * yane

const int nBufferTime = 4;

CMovieAVIAUDIO::CMovieAVIAUDIO(CMovieAVI *p){
	m_pAvi = p;
	m_bAudioStream = false;
	m_pAviStreamAudio = NULL;
	m_hNotificationEvent=CreateEvent(NULL,FALSE,FALSE,NULL);
	m_bPause = 0;
	m_bLoopPlay = false;
	m_bAudioOutput = true;
	m_lpDSBuffer = NULL;
	m_hAcmStream=NULL;
	m_dwBuddyBufferSizeMax=0;
	m_dwBuddyLength=0;
	m_nBuddyIndex=0;
	m_dwMinimumDst=0;

	m_dwBlockAlignedBufferSize=0;
	m_dwSoundSrcBufferMax=0;
	m_bUseACM=true;
	m_lpBuddyBuffer = NULL;
	m_lpSoundSrcBuffer = NULL;

	m_dwPreWritePos=0;
	m_dwBufferSize=0;
	m_dwBufferWritePos=0;
	m_dwDiffer=0;
	m_dwTotalWrittenBytes=0;
	m_dwPreReadStreamFrame=0;

	m_dwNowTime = 0;
	AVIFileInit();
	CDirectSound::AddRef();
	m_lpCDirectSound = CDirectSound::GetCDirectSound();
}

CMovieAVIAUDIO::~CMovieAVIAUDIO(){
	Close();
	CDirectSound::DelRef();
	AVIFileExit();
}



LRESULT	CMovieAVIAUDIO::OpenAudioStream(PAVIFILE pAviFile){
	if ( pAviFile == NULL ) return -1;
	HRESULT	hr;
	m_bAudioStream = false;
	// AUDIOストリームを得る
	hr = AVIFileGetStream(pAviFile,&m_pAviStreamAudio,streamtypeAUDIO,0);

	if ( m_pAviStreamAudio == NULL ){
		Err.Out("CMovieAVIAUDIO::OpenAudioStrema not found AudioStrema");
		return -1;
	}
	// ストリームの最初のポジションをとる
	LONG lStart = AVIStreamStart(m_pAviStreamAudio);
	LONG lFormat = 0;
	// フォーマットサイズの空読み
	hr = AVIStreamReadFormat(m_pAviStreamAudio,lStart,NULL,&lFormat);
	LPBYTE lpFormat = new BYTE[lFormat];
	// フォーマットの取得
	hr = AVIStreamReadFormat(m_pAviStreamAudio,lStart,lpFormat,&lFormat);
	// MP3等拡張されたWAVEFORMATもあるので安易にWAVEFORMATEXにコピーしてはいけない
	m_lpwfxSrcFormat.Add(lpFormat);

/*
// 生ならACM使わなくてもいいのだが、面倒なのでどちらにしても使う
	if ( lpwfxSrcFormat->wFormatTag == WAVE_FORMAT_PCM){
		m_bUseACM = false;
	}else{
		m_bUseACM = true;
	}
*/
	return 0;
}

LRESULT CMovieAVIAUDIO::Close(void){
	Stop();

	if ( m_pAviStreamAudio != NULL ){
		AVIStreamRelease(m_pAviStreamAudio);
		m_pAviStreamAudio = NULL;
	}
	if ( m_hAcmStream != NULL ){
		acmStreamClose(m_hAcmStream,NULL);
		m_hAcmStream = NULL;
	}
	if ( m_lpDSBuffer != NULL ){
		m_lpDSBuffer->Stop();
		m_lpDSBuffer->Release();
		m_lpDSBuffer = NULL;
	}


	if ( m_lpSoundSrcBuffer != NULL ){
		GlobalFree(m_lpSoundSrcBuffer);
		m_lpSoundSrcBuffer = NULL;
	}
	if ( m_lpBuddyBuffer != NULL ){
		GlobalFree(m_lpBuddyBuffer);
		m_lpBuddyBuffer = NULL;
	}


	return 0;
}
LRESULT CMovieAVIAUDIO::Play(void){
	HRESULT hr=0;

	Stop();

//	m_lpTimer->Reset();
//	m_lOffsetTime = 0;
	m_bPause = 0;
	m_bNowPlay = true;

	if ( m_lpDSBuffer != NULL ){
		StartUpSoundBuffer();
		m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING);
	}
	if ( !IsThreadExecute() ) 
		CreateThread();

	return 0;
}
LRESULT CMovieAVIAUDIO::Replay(void){
	if ( m_pAviStreamAudio == NULL ) return -1;
	if ( m_bPause==0) return 0;
	if ( --m_bPause!=0) return 0;

	if ( IsPlay() ) return 0;
	HRESULT hr=0;

//	m_lOffsetTime = m_lPauseTime;

	Stop();

	m_bPause = 0;
	m_bNowPlay = true;

	if ( m_lpDSBuffer != NULL ){
		StartUpSoundBuffer(m_pAvi->GetCurrentPos());
		m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING);
	}
	if ( !IsThreadExecute() ) 
		CreateThread();


	return 0;
}
LRESULT CMovieAVIAUDIO::Stop(void){
	if ( m_pAviStreamAudio == NULL ) return -1;
	HRESULT hr=0;

	m_bPause += sign(m_bPause);
	if ( !IsPlay() ) return 0;

	m_bPause = 1;

	// 現在位置の保存
//	m_lPauseTime = m_pAvi->GetCurrentPos();

	if ( m_lpDSBuffer != NULL ){
		m_lpDSBuffer->Stop();
	}

	if ( m_hNotificationEvent ){
		InvalidateThread();
		PulseEvent(m_hNotificationEvent);
	}

	if ( IsThreadExecute() ){
		StopThread();
	}

	m_bNowPlay = false;

	return 0;
}
LRESULT CMovieAVIAUDIO::Pause(void){
	Stop();
	return 0;
}
bool CMovieAVIAUDIO::IsPlay(void){
	return m_bNowPlay;

}
LRESULT CMovieAVIAUDIO::SetLoopMode(bool bLoop){
	if ( m_bLoopPlay == bLoop ) return 1;
	m_bLoopPlay = bLoop;
	return 0;
}

LRESULT CMovieAVIAUDIO::SetVolume(LONG lVolume){
	if ( m_lpDSBuffer == NULL ) return -1;
	return m_lpDSBuffer->SetVolume(lVolume);
}

LONG CMovieAVIAUDIO::GetVolume(void){
	if ( m_lpDSBuffer == NULL ) return DSBVOLUME_MIN;
	LONG v;
	m_lpDSBuffer->GetVolume(&v);
	return v;
}

LRESULT CMovieAVIAUDIO::SetCurrentPos(LONG lPos){
	Pause();
//	m_lPauseTime = lPos;
	Replay();
	return 0;
}

///////////////////////////////////////////////////////////////

// バッファは4sec 
LRESULT CMovieAVIAUDIO::InitAudioStream(void){
	HRESULT hr;
	// ACM の作成
	LPWAVEFORMATEX lpwfxSrcFormat = (LPWAVEFORMATEX)m_lpwfxSrcFormat.get();
	ZERO(m_wfxDstFormat);
	m_wfxDstFormat.wFormatTag = WAVE_FORMAT_PCM;
	hr = acmFormatSuggest(NULL, lpwfxSrcFormat , &m_wfxDstFormat,
						 sizeof(WAVEFORMATEX), ACM_FORMATSUGGESTF_WFORMATTAG);
	if ( hr !=0 ){
		Err.Out("CMovieAVIAUDIO::InitAudio acmFormatSuggest. No such ACM? %x",lpwfxSrcFormat->wFormatTag);
		return -1;	//	acm無いんとちゃう？
	}
	hr = acmStreamOpen(&m_hAcmStream, NULL, lpwfxSrcFormat, &m_wfxDstFormat,
					  NULL, NULL, NULL, ACM_STREAMOPENF_NONREALTIME);
	if ( hr !=0 ){
		Err.Out("CMovieAVIAUDIO::InitAudio acmStreamOpen. No such ACM? %x",lpwfxSrcFormat->wFormatTag);
		return false;	//	acmおかしんとちゃう？
	}
	DWORD newdest;
	hr  = acmStreamSize(m_hAcmStream,lpwfxSrcFormat->nBlockAlign,&newdest,ACM_STREAMSIZEF_SOURCE );
	if ( hr != 0 ){
		Err.Out("Minimun BUffer Unknowm.");
		m_dwMinimumDst = 0;
	}else{
		m_dwMinimumDst = newdest;
	}

	DWORD dwDstSize= m_wfxDstFormat.nSamplesPerSec 
					  * m_wfxDstFormat.nBlockAlign
					  * nBufferTime ;
	DWORD  dwSrcSize,dwNewDst;
	m_dwBlockAlignedBufferSize = 0;
	hr = acmStreamSize(m_hAcmStream, dwDstSize, &dwSrcSize,ACM_STREAMSIZEF_DESTINATION );
	if (hr ==0 ){
		hr = acmStreamSize(m_hAcmStream, dwSrcSize, &dwNewDst,ACM_STREAMSIZEF_SOURCE );
		if ( hr ==0 ){
			m_dwBlockAlignedBufferSize = dwNewDst;
		}
	}

	// DirectSoundBuffer の作成
	DSBUFFERDESC dsbdsc;
	ZERO(dsbdsc);
	dsbdsc.dwSize = sizeof(DSBUFFERDESC);
	dsbdsc.dwFlags = 
			DSBCAPS_CTRLVOLUME|
			DSBCAPS_CTRLPOSITIONNOTIFY |
			DSBCAPS_GLOBALFOCUS |
			DSBCAPS_GETCURRENTPOSITION2 |
			0;
	m_dwBufferSize = m_dwBlockAlignedBufferSize;
	dsbdsc.dwBufferBytes = m_dwBufferSize;
	dsbdsc.lpwfxFormat = &m_wfxDstFormat;
	hr = m_lpCDirectSound->m_lpDirectSound->CreateSoundBuffer(
		&dsbdsc,&m_lpDSBuffer, NULL);
	if ( FAILED(hr) ){
		m_lpDSBuffer = NULL;
		Err.Out("CMovieAVI: CreateSoundBuffer Error");
		return -1;
	}

	m_lpDSBuffer->AddRef();
	m_bCanUseNotify = false;
	return 0;
	int nDivNum = nBufferTime;
	if ( FAILED( m_lpDSBuffer->QueryInterface( IID_IDirectSoundNotify, (void**)&m_pDSNotify) )){
		m_bCanUseNotify = false;
	}
	m_aPosNotify.Add( new DSBPOSITIONNOTIFY[ nDivNum+1] );
	for (  int i = 0 ; i < nDivNum ; i++ ){
		m_aPosNotify.get(i)->dwOffset = m_dwBufferSize * (i+1)/ nDivNum;
		m_aPosNotify.get(i)->hEventNotify = m_hNotificationEvent;
	}
	m_aPosNotify.get(i-1)->dwOffset	 = m_dwBufferSize-1;
	
	m_aPosNotify.get(i)->dwOffset	 = DSBPN_OFFSETSTOP;
	m_aPosNotify.get(i)->hEventNotify = m_hNotificationEvent;

	if ( FAILED( m_pDSNotify->SetNotificationPositions( nDivNum +1, 
													   m_aPosNotify ) )) 
	{
		Err.Out("SLongSound::open IdirectSoundNotify Setに失敗");
		m_bCanUseNotify=false;
		return 0;
	}
	m_bCanUseNotify=true;



	m_bAudioStream = true;

	return 0;
}

DWORD	CMovieAVIAUDIO::ConvertSoundStream(LPVOID lpSrc,DWORD dwSrcSize,LPVOID lpDst,DWORD dwDstSize){
	HRESULT hr;
	if ( m_hAcmStream == NULL ) return 0;
	ACMSTREAMHEADER	acmheader;		//	header of acmStream
	ZeroMemory(&acmheader,sizeof(acmheader));
	acmheader.cbStruct		=	sizeof(acmheader);
	acmheader.pbSrc			=	(BYTE*)lpSrc;
	acmheader.cbSrcLength	=	dwSrcSize;
	acmheader.pbDst			=	(BYTE*)lpDst;		//	ここにコピーしたいねん！
	acmheader.cbDstLength	=	dwDstSize;

	hr = acmStreamPrepareHeader(m_hAcmStream,&acmheader,NULL);
	if ( hr !=0 ) {
		Err.Out("CMovieAVIAUDIO::ConverSoundStream acmPrepareHeaderで失敗:%x",GetLastError());
		return 0;	//	勘弁して～（笑）
	}
	hr = acmStreamConvert(m_hAcmStream,&acmheader,ACM_STREAMCONVERTF_BLOCKALIGN );
	if ( hr != 0){
		Err.Out("CMovieAVIAUDIO::ConverSoundStream acmStreamConvertで失敗:%x",GetLastError());
		return 0;	//	ダメじゃん（笑）
	}	
	hr =acmStreamUnprepareHeader(m_hAcmStream,&acmheader,NULL);
	if ( hr !=0){
		Err.Out("CMovieAVIAUDIO::ConverSoundStream acmUnprepareHeaderで失敗:%x",GetLastError());
		return 0;	//	ダメじゃん（笑）
	}

//	f->seek(acmheader.cbSrcLengthUsed - srcSize);

	if( acmheader.cbDstLengthUsed == 0 )
	{
		FillMemory( (BYTE*)lpDst + acmheader.cbDstLengthUsed, 
					dwDstSize  - acmheader.cbDstLengthUsed, 
					(BYTE)(m_wfxDstFormat.wBitsPerSample == 8 ? 128 : 0 ) 
					);
		return dwDstSize;
	}

	return acmheader.cbDstLengthUsed;
}

// 今度こそAVIから読む
DWORD	CMovieAVIAUDIO::InnerReadSoundStream( LPBYTE lpDst,DWORD dwDstSize){
	HRESULT hr;
	if ( m_pAviStreamAudio == NULL ) return 0;
	DWORD dwNowFrame = m_dwPreReadStreamFrame;
	// せめてものスキップ処理
	// DirectSoundBufferに書き込むサイズから時間を導いて、
	// 今書き込むデータがいつ再生されるかは判断できるが、
	// そもそも再生の時点で絵とどこまで同期がとれてるかも怪しいので見送り
	// 4secは大きいかもしれないが。
	// 今の時間からのサンプル数
	DWORD dwTimeFrame = AVIStreamTimeToSample(m_pAviStreamAudio,m_dwNowTime);
	// 遅れてるようなら飛ばす
//	dwNowFrame = max(dwTimeFrame,dwNowFrame);
	DWORD dwEndFrame = AVIStreamEnd(m_pAviStreamAudio);
	LONG lLength=0;
	LONG lSample=0;
	// 読めるだけ読む
	hr = AVIStreamRead(m_pAviStreamAudio,dwNowFrame,dwEndFrame ,
	                            lpDst,dwDstSize,&lLength,&lSample);
	//	ここまでよんだ
	m_dwPreReadStreamFrame = lSample + dwNowFrame;
	if ( dwEndFrame == dwNowFrame ) m_bEnd = true;
//	Err.Out("now:%d\tfram:%d\tsam:%d\tlen:%d\tdst:%d",dwNowFrame,dwTimeFrame,lSample,lLength,dwDstSize);
	return lLength;
}

// 読む準備
DWORD	CMovieAVIAUDIO::ReadSoundStream(LPBYTE lpDst ,DWORD dwDstSize){
	if ( lpDst == NULL ) return 0;
	if ( m_hAcmStream == NULL ) return 0;

	DWORD dwCopySize = SoundStreamCopy( lpDst,dwDstSize );

	if ( dwDstSize == 0 ) return dwCopySize;

	HRESULT hr;
	DWORD dwActualRead,dwConvSize;
	DWORD dwReadCompressSize;

	if ( m_dwMinimumDst > dwDstSize ){
		hr = acmStreamSize(m_hAcmStream, m_dwMinimumDst, &dwReadCompressSize, 
									ACM_STREAMSIZEF_DESTINATION ) ;
		if ( hr !=0 ){
			Err.Out("CMovieAVIAUDIO::ReadSoundStream StreamSize Failed:%d (min:%d)",dwDstSize,m_dwMinimumDst);
			return 0;
		}
		// バッファサイズが越えてないかチェック
		DWORD dwBuddyBufferSizeMax = m_dwBuddyBufferSizeMax;
		m_dwBuddyBufferSizeMax = max( m_dwMinimumDst , dwBuddyBufferSizeMax);
		if ( m_dwBuddyBufferSizeMax > dwBuddyBufferSizeMax ){
			if ( m_lpBuddyBuffer == NULL )
				m_lpBuddyBuffer = GlobalAlloc( GMEM_FIXED, m_dwBuddyBufferSizeMax);
			else
				m_lpBuddyBuffer = GlobalReAlloc( m_lpBuddyBuffer, m_dwBuddyBufferSizeMax, GMEM_MOVEABLE);
		}
		// バッファサイズが越えてないかチェック
		DWORD dwSoundSrcBufferMax = m_dwSoundSrcBufferMax;
		m_dwSoundSrcBufferMax = max( dwReadCompressSize , dwSoundSrcBufferMax);
		if ( m_dwSoundSrcBufferMax > dwSoundSrcBufferMax ){
			if ( m_lpSoundSrcBuffer == NULL )
				m_lpSoundSrcBuffer = GlobalAlloc( GMEM_FIXED, m_dwSoundSrcBufferMax);
			else
				m_lpSoundSrcBuffer = GlobalReAlloc( m_lpSoundSrcBuffer, m_dwSoundSrcBufferMax, GMEM_MOVEABLE);
		}
		// AVIのストリームからの読み込み
		dwActualRead = InnerReadSoundStream( (LPBYTE)m_lpSoundSrcBuffer , dwReadCompressSize );
		if ( dwActualRead != dwReadCompressSize && m_bLoopPlay ){
			// ループ
		}
		// 変換
		m_dwBuddyLength = ConvertSoundStream( m_lpSoundSrcBuffer , dwActualRead,m_lpBuddyBuffer,m_dwMinimumDst );
		m_nBuddyIndex = 0;
		return SoundStreamCopy(lpDst,dwDstSize);
	}

	hr = acmStreamSize(m_hAcmStream, dwDstSize,&dwReadCompressSize,
					  ACM_STREAMSIZEF_DESTINATION );
	if ( hr != 0 ){
			Err.Out("CMovieAVIAUDIO::ReadSoundStream StreamSize Failed:%d (min:%d)",dwDstSize,m_dwMinimumDst);
			return 0;
	}
	DWORD dwSoundSrcBufferMax = m_dwSoundSrcBufferMax;
	m_dwSoundSrcBufferMax = max( dwReadCompressSize , dwSoundSrcBufferMax);
	if ( m_dwSoundSrcBufferMax > dwSoundSrcBufferMax ){
		if ( m_lpSoundSrcBuffer == NULL )
			m_lpSoundSrcBuffer = GlobalAlloc( GMEM_FIXED, m_dwSoundSrcBufferMax);
		else
			m_lpSoundSrcBuffer = GlobalReAlloc( m_lpSoundSrcBuffer, m_dwSoundSrcBufferMax, GMEM_MOVEABLE);
	}
				
	// AVIのストリームからの読み込み
	dwActualRead = InnerReadSoundStream( (LPBYTE)m_lpSoundSrcBuffer , dwReadCompressSize );
	// 変換
	dwConvSize = ConvertSoundStream( m_lpSoundSrcBuffer , dwActualRead,lpDst,dwDstSize );

	if ( dwActualRead != dwReadCompressSize && m_bLoopPlay ){
		// ループ
		//f->seekToTop();
		return dwConvSize + this->ReadSoundStream(lpDst + dwConvSize,  dwDstSize - dwConvSize);
	}
	return dwConvSize;
}

DWORD CMovieAVIAUDIO::SoundStreamCopy( LPBYTE& lpDst, DWORD &dwDstSize){
	if ( lpDst == NULL ) return 0;
	DWORD dwCopySize = min(m_dwBuddyLength,dwDstSize);
	if ( dwCopySize != 0 ){
//		Err.Out("msg: use BuddyBuff %d/%d byte.",dwCopySize,m_dwBuddyLength);
		memcpy(lpDst,(LPBYTE)m_lpBuddyBuffer+m_nBuddyIndex,dwCopySize);
		lpDst+= dwCopySize;
		dwDstSize -= dwCopySize;
		m_dwBuddyLength -= dwCopySize;
		m_nBuddyIndex += dwCopySize;
		if ( m_dwBuddyLength == 0 ){
			m_nBuddyIndex = 0;
		}
	}
	return dwCopySize;
}

bool	CMovieAVIAUDIO::StartUpSoundBuffer(LONG lPos){	// [ms]
//	m_lpDSBuffer->Stop();
	m_lpDSBuffer->SetCurrentPosition(0);
	m_dwPreWritePos = 0;
	DWORD dwLen = m_dwBufferSize / 8 * 7;
	m_dwPreReadStreamFrame = AVIStreamTimeToSample(m_pAviStreamAudio,lPos);
//	SetCurrentPosition(pos);
	DWORD dwRead = UpdateDirectSound(dwLen);

	m_dwTotalWrittenBytes += dwRead;

	return true;
}

LRESULT	CMovieAVIAUDIO::UpdateSound(void){
	if ( m_lpDSBuffer == NULL ) return -1;
//	m_bEnd = false;
	DWORD dwPlayPos,dwWritePos;
	DWORD dwUsedSize;

	m_lpDSBuffer->GetCurrentPosition(&dwPlayPos, &dwWritePos );

	if ( dwWritePos == m_dwPreWritePos ){
		if ( m_bCanUseNotify ){
			Sleep(50);
		}else{
			Sleep(500);
		}
		return 0;
	}

	if ( dwWritePos > m_dwPreWritePos )
		// 循環してない
			dwUsedSize = dwWritePos - m_dwPreWritePos;
		else
		// 循環した
			dwUsedSize = m_dwBufferSize + dwWritePos - m_dwPreWritePos;

	if ( dwPlayPos > m_dwBufferWritePos &&
		m_dwBufferWritePos + dwUsedSize > dwPlayPos )
		dwUsedSize = dwPlayPos - m_dwBufferWritePos;

//	Err.Out("Use:%d",dwUsedSize);

	m_dwPreWritePos = dwWritePos;

	LONG dwWritten = UpdateDirectSound(dwUsedSize);

//	if ( dwWritten == 0 ) Stop();
//	if ( m_bEnd ) Stop();
	m_dwTotalWrittenBytes+= dwWritten;
	return 0;
}

DWORD CMovieAVIAUDIO::UpdateDirectSound(DWORD dwSize){
	DWORD dwUpdateSize = dwSize;
	dwUpdateSize += m_dwDiffer;
	m_dwDiffer = 0;
	
	if( m_dwBufferWritePos + dwUpdateSize > m_dwBufferSize ){
		DWORD dwNewSize = m_dwBufferSize - m_dwBufferWritePos;
		m_dwDiffer = dwUpdateSize - dwNewSize;
		dwUpdateSize = dwNewSize;
	}
	
	BYTE* lpDSBuffData;
	DWORD dwBufferLength;
	
	//ロック
	LRESULT hr;
	hr = m_lpDSBuffer->Lock( m_dwBufferWritePos, dwUpdateSize ,
								(void**)&lpDSBuffData , &dwBufferLength,
								NULL, 0, 0 );
	if (hr==DSERR_BUFFERLOST){
		m_lpCDirectSound->CheckSoundLost(); 
		m_lpDSBuffer->Restore();
		hr = m_lpDSBuffer->Lock( m_dwBufferWritePos, dwUpdateSize,
			(void**)&lpDSBuffData , &dwBufferLength,
			NULL,0,
			0L );
	}
	
	if FAILED(hr) {
		Err.Out("Lock Fail");
		m_lpDSBuffer->Stop();
		return 8;
	}
	// 読み込み
	DWORD dwRead = ReadSoundStream( lpDSBuffData , dwBufferLength );
	
//	if ( dwRead == 0 ) { m_lpDSBuffer->Stop();return -1; }
	// かえる準備
	if FAILED(hr=m_lpDSBuffer->Unlock(	lpDSBuffData, dwBufferLength, 
		NULL,0 ) ) {
		Err.Out("CSound::LoadWaveのUnlock()に失敗！%x",hr);
		return 10;
	}
	m_dwBufferWritePos += dwRead;
	m_dwBufferWritePos %= m_dwBufferSize;
	//様々な要因により読み込みきれなかった分は先送りする
	if(dwRead < dwUpdateSize)
		m_dwDiffer= dwUpdateSize - dwRead;
	
	m_dwTotalWrittenBytes += dwRead;
	
	//	Loop
	//	if ( written == 0 ){
	
	return 0;
}

void CMovieAVIAUDIO::ThreadProc(void){
	if ( m_bCanUseNotify ){
		while( IsThreadValid() ){
			m_dwNowTime = m_lpTimer->Get();
			UpdateSound();
			WaitForSingleObject(m_hNotificationEvent, INFINITE);
		}
	}else{
		while( IsThreadValid() ){
			m_dwNowTime = m_lpTimer->Get();
			UpdateSound();
		}
	}
}



#endif
