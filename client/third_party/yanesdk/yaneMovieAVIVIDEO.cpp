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
#include "yaneDirectDraw.h"
#include "yaneFastDraw.h"
#include "yaneDIBDraw.h"


#define sign(val) (val>0?1:(val<0?-1:0))	//	符号を返す * yane

const int nBufferTime = 4;

CMovieAVIVIDEO::CMovieAVIVIDEO(CMovieAVI* p){
	m_pAvi = p;
	m_bVisible = false;	//	これはp->m_bVisibleでなくて可？
	m_bVideoStream = false;
	m_hDrawDib = NULL;
	m_pAviFile	= NULL;
	m_pAviStreamVideo = NULL;
	m_pGetFrame = NULL;

	m_dwPosition = 0;
	m_bPause = 0;
	m_lPreFrame = 0;
	m_lNowFrame = 0;

	m_bNowPlay=false;
	m_bOpen = false;
	m_bVisible = true;
	m_bLoopPlay = false;
	m_lWidth = 0;
	m_lHeight = 0;
	m_bFirstPlane = false;

}

CMovieAVIVIDEO::~CMovieAVIVIDEO(){
	Close();
}



LRESULT CMovieAVIVIDEO::OpenVideoStream(PAVIFILE pAviFile){
	if ( pAviFile == NULL ) return -1;
	HRESULT	hr;
	m_bVideoStream = false;

	hr = AVIFileGetStream(pAviFile,&m_pAviStreamVideo,streamtypeVIDEO,0);
	if ( m_pAviStreamVideo == NULL ){
		return -1;
	}

	LONG lStart = AVIStreamStart(m_pAviStreamVideo);
	m_pGetFrame = AVIStreamGetFrameOpen( m_pAviStreamVideo,NULL);
	// 非圧縮なaviだとここでエラー。AVIStreamGetFrameOpenはdecompress必要ないとNULL。
	LPBITMAPINFOHEADER pBitmapInfoHeader;
	pBitmapInfoHeader = (LPBITMAPINFOHEADER)AVIStreamGetFrame( m_pGetFrame , lStart);
	m_lWidth = pBitmapInfoHeader->biWidth;
	m_lHeight = pBitmapInfoHeader->biHeight;

	m_hDrawDib=DrawDibOpen();

	if ( m_hDrawDib == NULL ) {
		Err.Out("CMovieAVI: DrawDibOpen Error");
		return -1;
	}
#ifdef USE_FastDraw
    	m_Plane.SetSystemMemoryUse(true);
	if ( m_Plane.CreateSurface(m_lWidth,m_lHeight) ) return -1;
#else
  #ifdef USE_DirectDraw
	m_Plane.SetSystemMemoryUse(true);
	if ( m_Plane.CreateSurface(m_lWidth,m_lHeight) ) return -1;
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw
      
#ifdef USE_DIB32
	m_Dib.UseDIBSection(true);
	if ( m_Dib.CreateSurface(m_lWidth,m_lHeight) ) return -1;
#endif

	m_bVisible = true;
	m_bVideoStream = true;

	// AVIの長さ等
	m_lAviLength = AVIStreamLength(m_pAviStreamVideo);
	if ( m_lAviLength == -1 ){
		Err.Out("CMovieAVI::Open サイズが異常");
		return -1;
	}
	hr = AVIStreamInfo(m_pAviStreamVideo,&m_AviStreamInfo,sizeof(AVISTREAMINFO));
	m_AviFrameRatio = m_AviStreamInfo.dwRate / m_AviStreamInfo.dwScale;
	m_AviFrameRatio2 = (double) m_AviStreamInfo.dwRate / m_AviStreamInfo.dwScale / 1000;


	return 0;

}

LRESULT CMovieAVIVIDEO::Close(void){
	Stop();

	*m_pAvi->GetVisible() = false;
	m_bOpen = false;
	m_bNowPlay = false;
	if ( m_pAviStreamVideo != NULL ){
		AVIStreamRelease(m_pAviStreamVideo);
		m_pAviStreamVideo = NULL;
	}
	if ( m_hDrawDib != NULL ){
		DrawDibClose(m_hDrawDib);
		m_hDrawDib = NULL;
	}
	if ( m_pGetFrame != NULL ) {
		AVIStreamGetFrameClose(m_pGetFrame);
		m_pGetFrame = NULL;
	}

	return 0;
}
LRESULT CMovieAVIVIDEO::Play(void){
	HRESULT hr=0;

	Stop();

//	m_FTimer.Reset();
	m_lOffsetTime = 0;
//	bool bF = IsThreadValid();
	m_bPause = 0;
	m_bNowPlay=true;
//	if ( !IsThreadExecute() ) 
//		CreateThread();

	return 0;
}
LRESULT CMovieAVIVIDEO::Replay(void){
	if ( m_pAviStreamVideo == NULL	) return -1;
	if ( m_bPause==0) return 0;
	if ( --m_bPause!=0) return 0;

	if ( IsPlay() ) return 0;
	HRESULT hr=0;

	m_lOffsetTime = m_lPauseTime;

	Stop();


	m_bPause = 0;
	m_bNowPlay = true;
//	if ( !IsThreadExecute() ) CreateThread();

	return 0;
}
LRESULT CMovieAVIVIDEO::Stop(void){
	if ( m_pAviStreamVideo == NULL ) return -1;
	HRESULT hr=0;

	m_bPause += sign(m_bPause);
	if ( !IsPlay() ) return 0;

	m_bPause = 1;

	// 現在位置の保存
//	m_lPauseTime = m_FTimer.Get();
	m_bNowPlay = false;

//	if ( IsThreadExecute() ){
//		StopThread();
//	}

	return 0;
}
LRESULT CMovieAVIVIDEO::Pause(void){
	Stop();
	return 0;
}
bool CMovieAVIVIDEO::IsPlay(void){
	return	m_bNowPlay;

}
/*
LRESULT CMovieAVIVIDEO::SetLoopMode(bool bLoop){
	if ( m_bLoopPlay == bLoop ) return 1;

	m_bLoopPlay = bLoop;
	return 0;
}
*/
/*
LONG	CMovieAVIVIDEO::GetCurrentPos(void){
return 0;
}
*/

void	CMovieAVIVIDEO::SetPos(int x,int y){
	m_nX = x;
	m_nY = y;
}

LRESULT CMovieAVIVIDEO::UpdatePlane(void){
	HRESULT hr=0;
	if ( !m_bVisible ) return 0; 
	LONG lNowFrame;
	LONG lTime = m_pAvi->GetCurrentPos();
	lNowFrame = AVIStreamTimeToSample(m_pAviStreamVideo,lTime);
	m_lNowFrame = lNowFrame;
	LONG l = lNowFrame - m_lPreFrame;
	m_lPreFrame = lNowFrame;
	if ( l == 0 ) return 0;

	HDC hDc=NULL;

#ifdef USE_MovieAVI_DirectDraw
        hDc = m_Plane.GetDC();
#endif
#ifdef USE_MovieAVI_DIB32
	hDc = m_Dib.GetDC();
#endif
	if ( hDc == NULL ){
		Err.Out("CPlaneAVI: GetDC error");
		return 1;
	}

	CTimer tm;
	tm.Reset();
	LPBITMAPINFOHEADER pBMIH;
	pBMIH = (LPBITMAPINFOHEADER)AVIStreamGetFrame(m_pGetFrame,lNowFrame);
	hr = DrawDibDraw(m_hDrawDib,hDc,
		0,0,m_lWidth,m_lHeight,pBMIH,NULL,
				0,0,-1,-1,0 );
//	Err.Out("tm:%d",tm.Get());
/*
#ifdef _DEBUG
	char	buf[256];
	sprintf(buf,"sec:%04d/%04d frame:%04d/%04d", 
		(long) ( lNowFrame / m_AviFrameRatio) , 
		(long) ( m_lAviLength / m_AviFrameRatio ) ,
		(long)lNowFrame , (long)m_lAviLength );
	::TextOut(hDc,0,m_lHeight-20,buf,strlen(buf));
#endif
*/
#ifdef USE_MovieAVI_DirectDraw
        m_Plane.ReleaseDC();
#endif
#ifdef USE_MovieAVI_DIB32
	m_Dib.ReleaseDC();
#endif
	m_bFirstPlane = true;
	return 0;
}

/*
void CMovieAVIVIDEO::ThreadProc(void){
	while( IsThreadValid() ){
//		m_dwNowTime = m_FTimer.Get() + m_lOffsetTime;
//		UpdatePlane();
		Sleep(0);
	}
}
*/

#ifdef USE_FastDraw
CFastPlane*	CMovieAVIVIDEO::GetFastPlane(void){ 
	UpdatePlane();
#ifdef USE_MovieAVI_DIB32
    m_Plane.Blt(&m_Dib, 0, 0);
#endif
	return &m_Plane;
}

void CMovieAVIVIDEO::OnDraw(CFastDraw*lpDraw){
	if ( lpDraw == NULL ) return;
//	if ( !m_bFirstPlane ) return;
	HRESULT hr;
	if ( *m_pAvi->GetVisible() ){
		UpdatePlane();
#ifdef USE_MovieAVI_DIB32
            m_Plane.Blt(&m_Dib, 0, 0);
#endif
		LONG lCenterX,lCenterY;
		lCenterX = lCenterY = 0;
		LONG lWidth,lHeight;
		lWidth = m_lPWidth;
		lHeight = m_lPHeight;
		if ( m_bResize ){
			if ( *m_pAvi->GetAspect() ){
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
			if ( *m_pAvi->GetCenter() ){
				lCenterX = ( m_lPWidth - lWidth ) /2;
				lCenterY = ( m_lPHeight - lHeight ) /2;
			}
			// Resizeする
			RECT srcrc = { 0,0,m_lWidth,m_lHeight};
			RECT dstrc = { m_nX+lCenterX,m_nY+lCenterY,m_nX+lCenterX+lWidth,m_nY+lCenterY+lHeight};
			hr = lpDraw->GetSecondary()->GetSurface()->Blt(
				&dstrc,m_Plane.GetSurface(),
				&srcrc,DDBLT_WAIT,NULL);
		}else {
			if ( m_lWidth <= m_lPWidth && m_lHeight <= m_lPHeight ){
				// そのまま出力
				RECT srcrc = { 0,0,m_lWidth,m_lHeight};
				if (  *m_pAvi->GetCenter() ){
					lCenterX = ( m_lPWidth - m_lWidth ) /2;
					lCenterY = ( m_lPHeight - m_lHeight ) /2;
				}
				hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX+lCenterX,m_nY+lCenterY,m_Plane.GetSurface(),
					&srcrc,DDBLTFAST_WAIT);
			}else{
				lWidth = _MIN(m_lPWidth,m_lWidth);
				lHeight = _MIN(m_lPHeight,m_lHeight);
				// clip
				RECT srcrc = { 0,0,lWidth,lHeight};
				hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX,m_nY,m_Plane.GetSurface(),
					&srcrc,DDBLTFAST_WAIT);
			}
		}
	}
}
#else
  #ifdef USE_DirectDraw
CPlane*	CMovieAVIVIDEO::GetPlane(void){ 
	UpdatePlane();
  #ifdef USE_MovieAVI_DIB32
	m_Dib.BltToPlane(&m_Plane,0,0);
  #endif
	return &m_Plane;
}

void CMovieAVIVIDEO::OnDraw(CDirectDraw*lpDraw){
	if ( lpDraw == NULL ) return;
//	if ( !m_bFirstPlane ) return;
	HRESULT hr;
	if ( *m_pAvi->GetVisible() ){
		UpdatePlane();
#ifdef USE_MovieAVI_DIB32
		m_Dib.BltToPlane(&m_Plane,0,0);
#endif
		LONG lCenterX,lCenterY;
		lCenterX = lCenterY = 0;
		LONG lWidth,lHeight;
		lWidth = m_lPWidth;
		lHeight = m_lPHeight;
		if ( m_bResize ){
			if ( *m_pAvi->GetAspect() ){
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
			if ( *m_pAvi->GetCenter() ){
				lCenterX = ( m_lPWidth - lWidth ) /2;
				lCenterY = ( m_lPHeight - lHeight ) /2;
			}
			// Resizeする
			RECT srcrc = { 0,0,m_lWidth,m_lHeight};
			RECT dstrc = { m_nX+lCenterX,m_nY+lCenterY,m_nX+lCenterX+lWidth,m_nY+lCenterY+lHeight};
			hr = lpDraw->GetSecondary()->GetSurface()->Blt(
				&dstrc,m_Plane.GetSurface(),
				&srcrc,DDBLT_WAIT,NULL);
		}else {
			if ( m_lWidth <= m_lPWidth && m_lHeight <= m_lPHeight ){
				// そのまま出力
				RECT srcrc = { 0,0,m_lWidth,m_lHeight};
				if (  *m_pAvi->GetCenter() ){
					lCenterX = ( m_lPWidth - m_lWidth ) /2;
					lCenterY = ( m_lPHeight - m_lHeight ) /2;
				}
				hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX+lCenterX,m_nY+lCenterY,m_Plane.GetSurface(),
					&srcrc,DDBLTFAST_WAIT);
			}else{
				lWidth = _MIN(m_lPWidth,m_lWidth);
				lHeight = _MIN(m_lPHeight,m_lHeight);
				// clip
				RECT srcrc = { 0,0,lWidth,lHeight};
				hr = lpDraw->GetSecondary()->GetSurface()->BltFast(
					m_nX,m_nY,m_Plane.GetSurface(),
					&srcrc,DDBLTFAST_WAIT);
			}
		}
	}
}
  #endif //end USE_DirectDraw
#endif //end USE_FastDraw

#ifdef USE_DIB32
CDIB32* CMovieAVIVIDEO::GetDIB(void){
	UpdatePlane();
#ifdef USE_MovieAVI_DirectDraw
  #ifdef USE_FastDraw
      m_Plane.BltTo(&m_Dib, 0, 0);
  #else
    #ifdef USE_DirectDraw
      m_Dib.BltFromPlane(&m_Plane,0,0);
    #endif //end USE_DirectDraw
  #endif //end USE_FastDraw
#endif
	return &m_Dib;
}

void CMovieAVIVIDEO::OnDraw(CDIBDraw*lpDraw){
	HRESULT hr;
	if ( lpDraw == NULL ) return;
	if ( *m_pAvi->GetVisible() ){
		UpdatePlane();
#ifdef USE_MovieAVI_DirectDraw
  #ifdef USE_FastDraw
      m_Plane.BltTo(&m_Dib, 0, 0);
  #else
     #ifdef USE_DirectDraw
      m_Dib.BltFromPlane(&m_Plane,0,0);
     #endif //end USE_DirectDraw
  #endif //end USE_FastDraw
#endif

		LONG lCenterX,lCenterY;
		lCenterX = lCenterY = 0;
		LONG lWidth,lHeight;
		lWidth = m_lPWidth;
		lHeight = m_lPHeight;
		if ( m_bResize ){
			if ( *m_pAvi->GetAspect() ){
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
			if ( *m_pAvi->GetCenter() ){
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
				if ( *m_pAvi->GetCenter() ){
					lCenterX = ( m_lPWidth - m_lWidth ) /2;
					lCenterY = ( m_lPHeight - m_lHeight ) /2;
				}
				lpDraw->BltFast(&m_Dib,m_nX+lCenterX,m_nY+lCenterY,&srcrc);
			}else{
				// clip
				RECT srcrc = { 0,0,m_lPWidth,m_lPHeight};
				//					RECT dstrc = { m_nX,m_nY,m_nX+m_lPWidth,m_nY+m_lPHeight};
				hr = lpDraw->BltFast(&m_Dib,m_nX,m_nY,&srcrc);
				
			}
		}
	}
}
#endif

// する事は特にない
void CMovieAVIVIDEO::InnerOnDraw(CPlaneBase*lpDraw){
}
#endif
