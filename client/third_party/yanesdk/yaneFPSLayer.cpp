#include "stdafx.h"

#include "yaneFPSLayer.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x005301e0 review
CFPSLayer::CFPSLayer(CFPSTimer*lpFpsTimer){
	m_lpFpsTime = lpFpsTimer;
	m_Font.SetSize(25);
	m_Font.SetColor(RGB(128,192,128));
	m_Font.SetBackColor(RGB(64,128,64));
	m_bSkipFrameDraw = false;
}

// @yo2 0x005302d0 vt
CFPSLayer::~CFPSLayer(){
}

// @yo2 0x00530350 vt
void	CFPSLayer::OnDraw(HDC hdc){
	CHAR	buf[64];
	int nRealFps = m_lpFpsTime->GetRealFPS();
	int nFps = m_lpFpsTime->GetFPS();
	int nSkip = m_lpFpsTime->GetSkipFrame();

	//	max fpsのときに数字がブレて表示されるのを補整
/*
	if ((nRealFps == nFps -1) && (nRealFps>=1)){
		//	１だけ少ないのは、許容誤差
		nRealFps = nFps;
	} else
*/
	if (nRealFps > nFps) {
		//	設定されたFpsからオーバーシュートしている
		nRealFps = nFps;
	}

	if (!m_bSkipFrameDraw){
		::wsprintf(buf,"FPS:%d/%d",nRealFps,nFps);
	} else {
		::wsprintf(buf,"FPS:%d/%d(SkipFrame %d)",nRealFps,nFps,nSkip);
	}
	//	[Konami] CFont takes wide strings: convert before SetText
	WCHAR	wbuf[512];
	::mbstowcs(wbuf,buf,64);
	m_Font.SetText(wbuf);
	m_Font.OnDraw(hdc,m_nX,m_nY);
}

//////////////////////////////////////////////////////////////////////////////
