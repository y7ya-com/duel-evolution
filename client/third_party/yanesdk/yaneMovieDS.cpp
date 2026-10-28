// DirectShowによるムービー再生
// 2001/3/8
// kaine 

#include "stdafx.h"


#ifndef USE_DirectDraw
#ifndef USE_FastDraw
#undef USE_MovieDS
#endif //end USE_FastDraw
#endif //end USE_DirectDraw


#include "yaneCOMBase.h"

#include "yaneMovie.h"
#include "yaneMovieDS.h"
#include "yaneDirectDraw.h"
#include "yaneFastDraw.h"
#include "yaneDIBDraw.h"

#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す * yane

bool CDirectShow::m_bCanUseDirectShow = false;

// @yo2 0x00543bb0 feat
CDirectShow::CDirectShow(void){
	HRESULT	hr;

	CCOMBase::AddRef();

	hr = ::CoCreateInstance(CLSID_AMMultiMediaStream,NULL, 
		CLSCTX_INPROC_SERVER,IID_IAMMultiMediaStream, (void **)&m_pAMMultiMediaStream);
	if ( FAILED(hr) ){
		m_bCanUseDirectShow = false;
		m_pAMMultiMediaStream = NULL;
		goto ErrEnd;
	}

	m_bCanUseDirectShow = true;

ErrEnd:;
}

// @yo2 0x00543c50 vt
CDirectShow::~CDirectShow(){
	RELEASE_SAFE(m_pAMMultiMediaStream);
	CCOMBase::Release();
}

#ifdef USE_MovieDS


CMovieDS::CMovieDS(void){
	m_pAMMultiMediaStream = NULL;
	m_pMultiMediaStream = NULL;
	m_pMediaStream = NULL;
	m_pDDStream = NULL;
	m_pDDStreamSample = NULL;
//	m_pMediaStreamFilter = NULL;
	m_pBasicAudio = NULL;

	// DirectShowのインスタンス生成
	m_lpCDirectShow.Add();
	m_bCanUseDirectShow = CDirectShow::CanUseDirectShow();

	m_pAMMultiMediaStream = m_lpCDirectShow->GetDirectShowAMMultiMediaStream();

	m_bOpen		= false;
	m_bLoopPlay = false;
//	m_bAudioOnly = false;

//	m_bVisible = true;
	m_bVisible = false;	//	こっちにしとく？
//	m_bAudioOutput = true;

	m_dwPosition = 0;
	m_lVolume = 0;
	m_bPause = 0;
	m_nX = m_nY = 0;
	m_lWidth = m_lHeight = 0;
	m_lPWidth= m_lPHeight = 0;
	m_bAspect = false;
	m_bResize = false;
	m_bCenter = false;
	m_PauseTime = m_StreamTime = 0;
}

CMovieDS::~CMovieDS(){
	Close();
}

LRESULT CMovieDS::Initialize(void){
	HRESULT hr;

	hr = m_pAMMultiMediaStream->Initialize(STREAMTYPE_READ, 0, NULL);
	return hr;
}

LRESULT CMovieDS::CreateMedia(void){
	HRESULT hr;
	// Videoは標準で作成
	hr = m_pAMMultiMediaStream->AddMediaStream( CDirectDrawBase::GetDirectDrawPtr() , &MSPID_PrimaryVideo, 0, NULL);
	
	// Audioはいらなきゃ作らない
	hr = m_pAMMultiMediaStream->AddMediaStream( NULL, &MSPID_PrimaryAudio, AMMSF_ADDDEFAULTRENDERER, NULL);

	hr = m_pAMMultiMediaStream->QueryInterface(IID_IMultiMediaStream, (void**)&m_pMultiMediaStream);

	hr = m_pMultiMediaStream->GetMediaStream(MSPID_PrimaryVideo, &m_pMediaStream);
	return hr;
}

LRESULT CMovieDS::CreateMediaSurface(void){
	HRESULT hr;
	// VideoPlaneの設定
	hr = m_pMediaStream->QueryInterface(IID_IDirectDrawMediaStream, (void **)&m_pDDStream);

	DDSURFACEDESC ddsdesc;
	ZERO(ddsdesc);
	ddsdesc.dwSize = sizeof(ddsdesc);
	hr = m_pDDStream->GetFormat(&ddsdesc,NULL,NULL,NULL);
	m_lWidth = ddsdesc.dwWidth;
	m_lHeight = ddsdesc.dwHeight;
	RECT rc;
	::SetRect(&rc,0,0,ddsdesc.dwWidth,ddsdesc.dwHeight);

#ifdef USE_FastDraw
	// システムメモリじゃないとリストアが…
	// これだけのためにCPlaneの派生クラスを用意すべきなのか。
	m_Plane.SetSystemMemoryUse(true);
            if ( (rc.right - rc.left > 0) && (rc.bottom - rc.top > 0) ){
                m_Plane.CreateSurface(m_lWidth,m_lHeight);

		hr = m_pDDStream->CreateSample(
			m_Plane.GetSurface() ,	&rc,
//DDSFF_PROGRESSIVERENDER
					DDSFF_PROGRESSIVERENDER ,&m_pDDStreamSample);
//		m_pDDStreamSample->GetSurface(&m_pDDSurface,&rc);
#else
  #ifdef USE_DirectDraw
	// システムメモリじゃないとリストアが…
	// これだけのためにCPlaneの派生クラスを用意すべきなのか。
	m_Plane.SetSystemMemoryUse(true);
	if ( (rc.right - rc.left > 0) && (rc.bottom - rc.top > 0) ){
		m_Plane.CreateSurface(m_lWidth,m_lHeight);

		hr = m_pDDStream->CreateSample(
			m_Plane.GetSurface() ,	&rc,
//DDSFF_PROGRESSIVERENDER
					DDSFF_PROGRESSIVERENDER ,&m_pDDStreamSample);
//		m_pDDStreamSample->GetSurface(&m_pDDSurface,&rc);
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
                  
#ifdef USE_DIB32
		m_Dib.UseDIBSection(true);
		m_Dib.CreateSurface(m_lWidth,m_lHeight);
#endif
		m_bVisible = true;
		m_bVideo = true;
	}else{
		m_bVideo = false;
		m_bVisible = false;
	}

	return 0;
}


LRESULT CMovieDS::Open(LPCTSTR pFileName){
	HRESULT hr;
	if ( pFileName == NULL ) return -1;

	Close();	

	string strTName,strFName;
	strTName = pFileName;
	strFName = CFile::MakeFullName(strTName);
	char	szFileName[MAX_PATH];
	ZERO(szFileName);
	lstrcpy(szFileName,strFName.c_str());
	WCHAR	wFile[MAX_PATH];
#ifndef UNICODE
	MultiByteToWideChar(CP_ACP, 0, szFileName, -1, wFile, MAX_PATH);
#else
	lstrcpy(wFile, szFileName);
#endif
	m_FileName.erase();
	m_FileName = wFile;

	hr = Initialize();

	if ( !m_bCanUseDirectShow ) return -1;

	if ( m_pAMMultiMediaStream == NULL ) return -1;

	hr = CreateMedia();
	// ファイルオープン
	hr = m_pAMMultiMediaStream->OpenFile( m_FileName.c_str() , 0 );
	if ( hr != 0 ) {
		Close();
		Err.Out("メディアファイルが開けない %s",pFileName);
		return -1;
	}
	hr = CreateMediaSurface();

//	hr = m_pAMMultiMediaStream->GetFilter(&m_pMediaStreamFilter);

	IGraphBuilder *	pGB;
	hr = m_pAMMultiMediaStream->GetFilterGraph(&pGB);

	FILTER_INFO Info;
	ZERO(Info);

//	  MultiByteToWideChar(CP_ACP, 0, "IID_IBasicAudio", -1, Info.achName, MAX_FILTER_NAME);
//	hr = m_pMediaStreamFilter->QueryFilterInfo(&Info);
//	IBasicAudio*	m_pBA;

//	hr = Info.pGraph->QueryInterface(IID_IBasicAudio,(void**)&pBA);
	hr = pGB->QueryInterface(IID_IBasicAudio,(void**)&m_pBasicAudio);
	if ( m_pBasicAudio != NULL ){
		m_bAudio = true;
	}else{
		m_bAudio = false;
	}

	
//	この辺取得できない。最悪。
//	hr = pGB->QueryInterface(IID_IBasicVideo,(void**)&m_pBasicVideo);
//	hr = pGB->QueryInterface(IID_IVideoWindow,(void**)&m_pVideoWindow);
	
//	RECT rc;
//	SetRect(&rc,0,0,320/2,240/2);
//	long w,h;
//	hr = m_pBasicVideo->AddRef();
//	hr = m_pBasicVideo->GetVideoSize(&w,&h);
//	hr = m_pBasicVideo->SetSourcePosition(0,0,320/2,240/2);
//	long l;
//	hr = m_pVideoWindow->get_Left(&l);
//	hr = pVW->get_Left(&l);
	
	pGB->Release();
	
	m_bOpen = true;
	return 0;
}

LRESULT CMovieDS::Close(void){
	Stop();

	*GetVisible() = false;
	m_bOpen = false;
	m_bVideo = false;
	m_bAudio = false;

	if ( m_pDDStreamSample != NULL ){
		m_pDDStreamSample->CompletionStatus(COMPSTAT_NOUPDATEOK	 | COMPSTAT_WAIT | COMPSTAT_ABORT ,INFINITE);
	}
	RELEASE_SAFE(m_pDDStreamSample);
	RELEASE_SAFE(m_pDDStream);
	RELEASE_SAFE(m_pBasicAudio);
	RELEASE_SAFE(m_pMediaStream);
	RELEASE_SAFE(m_pMultiMediaStream);

	return 0;
}

LRESULT CMovieDS::Play(void){
	HRESULT hr;
	if ( m_pMultiMediaStream == NULL ) return -1;

	Stop();

	hr = m_pMultiMediaStream->Seek(0);
	hr = m_pMultiMediaStream->SetState(STREAMSTATE_RUN);

//	bool bF = IsThreadValid();
//	if ( !IsThreadExecute() ) 
//		CreateThread();

	m_bPause = 0;
	return 0;
}

LRESULT CMovieDS::Replay(void){
	if ( m_pMultiMediaStream == NULL ) return -1;
	if ( m_bPause==0) return 0;
	if ( --m_bPause!=0) return 0;

	if ( IsPlay() ) return 0;
	HRESULT hr;
	STREAM_TIME pTime = m_PauseTime;

	Stop();

	hr = m_pMultiMediaStream->Seek(pTime);

//	if ( !IsThreadExecute() ) CreateThread();
	hr = m_pMultiMediaStream->SetState(STREAMSTATE_RUN);

	m_bPause = 0;
	return 0;
}

LRESULT CMovieDS::Stop(void){
	HRESULT hr;
	if ( m_pMultiMediaStream == NULL ) return -1;

	m_bPause += sign(m_bPause);
	if ( !IsPlay() ) return -1; // 再生してないよ？

	m_bPause = 1;

	// 現在位置の保存
	m_pMultiMediaStream->GetTime(&m_PauseTime);

//	if ( IsThreadExecute() ){
//		StopThread();
//	}
	hr = m_pMultiMediaStream->SetState(STREAMSTATE_STOP);

	return 0;
}

bool	CMovieDS::IsPlay(void){
	HRESULT	hr;
	if ( m_pMultiMediaStream == NULL ) return false;
	
	STREAM_STATE state;
	hr = m_pMultiMediaStream->GetState(&state);

	if ( state == STREAMSTATE_RUN )
		return true;
	else 
		return false;
}


LRESULT CMovieDS::SetLoopMode(bool bLoop, LONG lLoopPos){	// [Konami] signature only (compiled out in this build)
	if ( m_bLoopPlay == bLoop ) return 1;

	m_bLoopPlay = bLoop;
	return 0;
}

LONG	CMovieDS::GetCurrentPos(void){
	if ( m_pMultiMediaStream == NULL ) return -1;

	STREAM_TIME stime;
	m_pMultiMediaStream->GetTime(&stime);

	return stime/10000;
}

LONG	CMovieDS::GetVolume(void){
	HRESULT hr;
	if ( m_pBasicAudio == NULL ) return -1;
	LONG volume;
	hr = m_pBasicAudio->get_Volume(&volume);

	return volume;
}

LRESULT	CMovieDS::SetVolume(long volume){
	HRESULT hr;
	if ( m_pBasicAudio == NULL ) return -1;
	hr = m_pBasicAudio->put_Volume(volume);
	// MAX 0;
	// MIN -10000;
	if ( hr == 0 ) m_lVolume = volume;
	return hr;
}

// 実装してみたが、このへんはアプリに任せた方がいいと思うのでやめ
/*
void	CMovieDS::SetAudioOutput(bool bFlag){ 
	HRESULT hr;
	if ( m_bAudioOutput == bFlag ) return;
	m_bAudioOutput = bFlag;
	// すでにOpenしてるか？
	if ( !m_bAudioOutput ){
		if ( m_bOpen && m_pBasicAudio != NULL ){
			hr = m_pBasicAudio->get_Volume(&m_lVolume);
			hr = m_pBasicAudio->put_Volume(DSBVOLUME_MIN);
		}
	}else{
		if ( m_bOpen && m_pBasicAudio != NULL ){
			hr = m_pBasicAudio->put_Volume(m_lVolume);
		}
	}
}
*/

LRESULT	CMovieDS::SetCurrentPos(LONG lSeek){
	if ( m_pMultiMediaStream == NULL ) return -1;
	HRESULT hr;
	STREAM_TIME stime,sstime;
	STREAM_STATE state;
	hr = m_pMultiMediaStream->GetState(&state);
	hr = m_pMultiMediaStream->GetTime(&stime);
	sstime = (DWORDLONG)lSeek * 10000;
	hr = m_pMultiMediaStream->SetState(STREAMSTATE_STOP);
//	hr = m_pMultiMediaStream->Seek(0);
	hr = m_pMultiMediaStream->Seek(sstime);
	m_pMultiMediaStream->GetTime(&m_PauseTime);
	if ( hr != S_OK ){
//		Err.Out("CMovieDS::Seek Error %d",sstime);
//		hr = m_pMultiMediaStream->Seek(stime);
	}
	hr = m_pMultiMediaStream->SetState(state);
//	hr = m_pMultiMediaStream->SetState(STREAMSTATE_RUN);

	return hr;
}

LONG	CMovieDS::GetLength(void){
	HRESULT hr;
	if ( m_pMultiMediaStream == NULL ) return -1;

	STREAM_TIME stime;
	hr = m_pMultiMediaStream->GetDuration(&stime);

	return stime/10000;

}

void	CMovieDS::SetPos(int x,int y){
	m_nX = x;
	m_nY = y;
}

#ifdef USE_FastDraw
CFastPlane*	CMovieDS::GetFastPlane(void){
	HRESULT hr;
	if ( !m_bVideo ) return NULL;
	if ( IsPlay() ){
		hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
		if(hr==MS_S_ENDOFSTREAM) {
			Stop();// 最後まで行ったので止める
			return &m_Plane;// 一応 Plane 返しとく
		}
	}
	return &m_Plane;
}


// 動画レイヤー
void CMovieDS::OnDraw(CFastDraw*lpDraw){
	HRESULT hr;
	if ( lpDraw == NULL ) return;
	if ( m_bVideo ){
		if ( m_bVisible ) {
			LPDIRECTDRAWSURFACE lpSurface;
			hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
			if(hr==MS_S_ENDOFSTREAM) {
				Stop();// 最後まで行ったので止める
				return;
			}
			lpSurface = m_Plane.GetSurface();
			LONG lCenterX,lCenterY;
			lCenterX = lCenterY = 0;
			LONG lWidth,lHeight;
			lWidth = m_lPWidth;
			lHeight = m_lPHeight;
			if ( m_bResize ){
				if ( m_bAspect ){
					// 出力先	m_lPWidth,m_lPHeight
					// 元		m_lWidth,m_lHeight
					double aspect = (double)m_lWidth/m_lHeight;
					double dW,dH;
					dW = m_lPHeight * aspect;
					if ( dW > m_lPWidth ){
						dH = m_lPWidth * m_lHeight/m_lWidth;
						lHeight = dH;
					}else{
						lWidth = dW;
					}
				}
				if ( m_bCenter ){
					lCenterX = ( m_lPWidth - lWidth ) /2;
					lCenterY = ( m_lPHeight - lHeight ) /2;
				}
				// Resizeする
				RECT srcrc = { 0,0,m_lWidth,m_lHeight};
				RECT dstrc = { m_nX+lCenterX,m_nY+lCenterY,m_nX+lCenterX+lWidth,m_nY+lCenterY+lHeight};
				hr = lpDraw->GetSecondary()->GetSurface()->Blt(
					&dstrc,lpSurface,
					&srcrc,DDBLT_WAIT,NULL);
			}else {
				if ( m_lWidth <= m_lPWidth && m_lHeight <= m_lPHeight ){
					// そのまま出力
					RECT srcrc = { 0,0,m_lWidth,m_lHeight};
//					RECT dstrc = { 0,0,m_lWidth,m_lHeight};
					if ( m_bCenter ){
						lCenterX = ( m_lPWidth - m_lWidth ) /2;
						lCenterY = ( m_lPHeight - m_lHeight ) /2;
					}
					hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
						m_nX+lCenterX,m_nY+lCenterY,lpSurface,
						&srcrc,DDBLTFAST_WAIT);
				}else{
					lWidth = _MIN(m_lPWidth,m_lWidth);
					lHeight = _MIN(m_lPHeight,m_lHeight);

//					Err.Out("clip %d,%d",m_lPWidth,m_lPHeight);
					RECT srcrc = { 0,0,lWidth,lHeight};
//					RECT dstrc = { m_nX,m_nY,m_nX+m_lPWidth,m_nY+m_lPHeight};
					hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX,m_nY,lpSurface,
					&srcrc,DDBLTFAST_WAIT);
				}
			}
		}
	}
}
#else
  #ifdef USE_DirectDraw
CPlane*	CMovieDS::GetPlane(void){
	HRESULT hr;
	if ( !m_bVideo ) return NULL;
	if ( IsPlay() ){
		hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
		if(hr==MS_S_ENDOFSTREAM) {
			Stop();// 最後まで行ったので止める
			return &m_Plane;// 一応 Plane 返しとく
		}
	}
	return &m_Plane;
}


// 動画レイヤー
void CMovieDS::OnDraw(CDirectDraw*lpDraw){
	HRESULT hr;
	if ( lpDraw == NULL ) return;
	if ( m_bVideo ){
		if ( m_bVisible ) {
			LPDIRECTDRAWSURFACE lpSurface;
			hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
			if(hr==MS_S_ENDOFSTREAM) {
				Stop();// 最後まで行ったので止める
				return;
			}
			lpSurface = m_Plane.GetSurface();
			LONG lCenterX,lCenterY;
			lCenterX = lCenterY = 0;
			LONG lWidth,lHeight;
			lWidth = m_lPWidth;
			lHeight = m_lPHeight;
			if ( m_bResize ){
				if ( m_bAspect ){
					// 出力先	m_lPWidth,m_lPHeight
					// 元		m_lWidth,m_lHeight
					double aspect = (double)m_lWidth/m_lHeight;
					double dW,dH;
					dW = m_lPHeight * aspect;
					if ( dW > m_lPWidth ){
						dH = m_lPWidth * m_lHeight/m_lWidth;
						lHeight = dH;
					}else{
						lWidth = dW;
					}
				}
				if ( m_bCenter ){
					lCenterX = ( m_lPWidth - lWidth ) /2;
					lCenterY = ( m_lPHeight - lHeight ) /2;
				}
				// Resizeする
				RECT srcrc = { 0,0,m_lWidth,m_lHeight};
				RECT dstrc = { m_nX+lCenterX,m_nY+lCenterY,m_nX+lCenterX+lWidth,m_nY+lCenterY+lHeight};
				hr = lpDraw->GetSecondary()->GetSurface()->Blt(
					&dstrc,lpSurface,
					&srcrc,DDBLT_WAIT,NULL);
			}else {
				if ( m_lWidth <= m_lPWidth && m_lHeight <= m_lPHeight ){
					// そのまま出力
					RECT srcrc = { 0,0,m_lWidth,m_lHeight};
//					RECT dstrc = { 0,0,m_lWidth,m_lHeight};
					if ( m_bCenter ){
						lCenterX = ( m_lPWidth - m_lWidth ) /2;
						lCenterY = ( m_lPHeight - m_lHeight ) /2;
					}
					hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
						m_nX+lCenterX,m_nY+lCenterY,lpSurface,
						&srcrc,DDBLTFAST_WAIT);
				}else{
					lWidth = _MIN(m_lPWidth,m_lWidth);
					lHeight = _MIN(m_lPHeight,m_lHeight);

//					Err.Out("clip %d,%d",m_lPWidth,m_lPHeight);
					RECT srcrc = { 0,0,lWidth,lHeight};
//					RECT dstrc = { m_nX,m_nY,m_nX+m_lPWidth,m_nY+m_lPHeight};
					hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX,m_nY,lpSurface,
					&srcrc,DDBLTFAST_WAIT);
				}
			}
		}
	}
}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

// DIBに描画遅い
// それほどテストしていないのでエラーでるかも…
#ifdef USE_DIB32

CDIB32* CMovieDS::GetDIB(void){
	HRESULT hr;
	if ( !m_bVideo ) return NULL;
	if ( IsPlay() ){
		hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
		if(hr==MS_S_ENDOFSTREAM) {
			Stop();// 最後まで行ったので止める
			return &m_Dib;// 一応 DIB 返しとく
		}
#ifdef USE_FastDraw
            m_Plane.BltTo(&m_Dib, 0, 0);
#else 
  #ifdef USE_DirectDraw
            m_Dib.BltFromPlane(&m_Plane,0,0);
  #endif //end USE_DirectDraw 
#endif//end USE_FastDraw
        }
	return &m_Dib;
}


void CMovieDS::OnDraw(CDIBDraw*lpDraw){
	HRESULT hr;
	if ( lpDraw == NULL ) return;
	if ( m_bVideo ){
		if ( m_bVisible ) {
	
			hr = m_pDDStreamSample->Update( 0,NULL,0,NULL);
			if(hr==MS_S_ENDOFSTREAM) {
				Stop();// 最後まで行ったので止める
				return;
			}
#ifdef USE_FastDraw
                    m_Plane.BltTo(&m_Dib, 0, 0);
#else 
  #ifdef USE_DirectDraw
                    m_Dib.BltFromPlane(&m_Plane,0,0);
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

			LONG lCenterX,lCenterY;
			lCenterX = lCenterY = 0;
			LONG lWidth,lHeight;
			lWidth = m_lPWidth;
			lHeight = m_lPHeight;
			if ( m_bResize ){
				if ( m_bAspect ){
					// 出力先	m_lPWidth,m_lPHeight
					// 元		m_lWidth,m_lHeight
					double aspect = (double)m_lWidth/m_lHeight;
					double dW,dH;
					dW = m_lPHeight * aspect;
					if ( dW > m_lPWidth ){
						dH = m_lPWidth * m_lHeight/m_lWidth;
						lHeight = dH;
					}else{
						lWidth = dW;
					}
				}
				if ( m_bCenter ){
					lCenterX = ( m_lPWidth - lWidth ) /2;
					lCenterY = ( m_lPHeight - lHeight ) /2;
				}
				// Resizeする
				RECT srcrc = { 0,0,m_lWidth,m_lHeight};
//				RECT dstrc = { m_nX+lCenterX,m_nY+lCenterY,m_nX+lCenterX+lWidth,m_nY+lCenterY+lHeight};
				SIZE dsts = { lWidth,lHeight};
//				hr = lpDraw->BltFastR(&m_Plane,m_nX,m_nY,&srcrc,&dsts);
				lpDraw->BltFast(&m_Dib,m_nX+lCenterX,m_nY+lCenterY,&srcrc,&dsts);
			}else {
				if ( m_lWidth <= m_lPWidth && m_lHeight <= m_lPHeight ){
					// そのまま出力
					RECT srcrc = { 0,0,m_lWidth,m_lHeight};
//					RECT dstrc = { 0,0,m_lWidth,m_lHeight};
					if ( m_bCenter ){
						lCenterX = ( m_lPWidth - m_lWidth ) /2;
						lCenterY = ( m_lPHeight - m_lHeight ) /2;
					}
					hr = lpDraw->BltFast(&m_Dib,m_nX+lCenterX,m_nY+lCenterY,&srcrc);
				}else{
					// clip
					RECT srcrc = { 0,0,m_lPWidth,m_lPHeight};
//					RECT dstrc = { m_nX,m_nY,m_nX+m_lPWidth,m_nY+m_lPHeight};
					hr = lpDraw->BltFast(&m_Dib,m_nX,m_nY,&srcrc);

				}
			}
		}
	}
}
#endif

void CMovieDS::InnerOnDraw(CPlaneBase*lpDraw){
// する事は特にない
}
#endif

