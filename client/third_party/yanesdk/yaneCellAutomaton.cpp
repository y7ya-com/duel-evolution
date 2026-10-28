#include "stdafx.h"

#ifdef USE_DIB32

#include "yaneCellAutomaton.h"

// @yo2 0x00433870 review
void CCellAutomaton::UpFade(CDIB32* lpSrc,LPRECT lpRect){

	RECT r = lpSrc->GetClipRect(lpRect);
	DWORD* lpSurface = lpSrc->GetPtr();
	LONG lPitch		 = lpSrc->GetRect()->right;

	for(int y=r.top;y<r.bottom-1;y++){
		DWORD *p = lpSurface + y*lPitch + r.left + 1;	//	+1は、1ドット内側から、の意味
		for(int x=r.left+1;x<r.right-1;x++){
			*(p++) = ((*(p+lPitch-1)&0xfefefe) + (*(p+lPitch+1)&0xfefefe))>>1;
			//	セルの左下と右下の点の平均を与える
		}
	}
}

// @yo2 0x00433960 review
void CCellAutomaton::DownFade(CDIB32* lpSrc,LPRECT lpRect){

	RECT r = lpSrc->GetClipRect(lpRect);
	DWORD* lpSurface = lpSrc->GetPtr();
	LONG lPitch		 = lpSrc->GetRect()->right;

	for(int y=r.bottom-1;y>r.top;y--){
		DWORD *p = lpSurface + y*lPitch + r.left + 1;	//	+1は、1ドット内側から、の意味
		for(int x=r.left+1;x<r.right-1;x++){
			*(p++) = ((*(p-lPitch-1)&0xfefefe) + (*(p-lPitch+1)&0xfefefe))>>1;
			//	セルの左上と右上の点の平均を与える
		}
	}
}

// @yo2 0x00433a80 review
void CCellAutomaton::RightFade(CDIB32* lpSrc,LPRECT lpRect){

	RECT r = lpSrc->GetClipRect(lpRect);
	DWORD* lpSurface = lpSrc->GetPtr();
	LONG lPitch		 = lpSrc->GetRect()->right;

	//	この処理だと、キャッシュに入らないので辛い。
	//	事前に再配置したほうがよさげ．．

	for(int x=r.right-1;x>r.left;x--){
		DWORD *p = lpSurface + x + lPitch*(r.top+1);	//	+lPitchは、1ドット内側から、の意味
		for(int y=r.top+1;y<r.bottom-1;y++){
			*p = ((*(p-lPitch-1)&0xfefefe) + (*(p+lPitch-1)&0xfefefe))>>1;
			p+=lPitch;
			//	セルの左上と左下の点の平均を与える
		}
	}
}

// @yo2 0x00433b60 review
void CCellAutomaton::LeftFade(CDIB32* lpSrc,LPRECT lpRect){

	RECT r = lpSrc->GetClipRect(lpRect);
	DWORD* lpSurface = lpSrc->GetPtr();
	LONG lPitch		 = lpSrc->GetRect()->right;

	//	この処理だと、キャッシュに入らないので辛い。
	//	事前に再配置したほうがよさげ．．

	for(int x=r.left;x<r.right-1;x++){
		DWORD *p = lpSurface + x + lPitch*(r.top+1);	//	+lPitchは、1ドット内側から、の意味
		for(int y=r.top+1;y<r.bottom-1;y++){
			*p = ((*(p-lPitch+1)&0xfefefe) + (*(p+lPitch+1)&0xfefefe))>>1;
			p+=lPitch;
			//	セルの右上と右下の点の平均を与える
		}
	}
}

#endif // USE_DIB32
