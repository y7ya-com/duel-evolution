
#include "stdafx.h"
#include "yanePlaneEffectBlt.h"
#include "yanePlaneBase.h"
#include "yaneSinTable.h"
#include <math.h>		//	sqrt

///////////////////////////////////////////////////////////////////////////////
//	class CPlaneFadeBlt

// @yo2 0x00545410 feat
LRESULT	CPlaneFadeBlt::FadeBlt(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y){
	int sx,sy;
	lpPlane->GetSize(sx,sy);

	//	全ラスタが普通ならば通常転送で解決する
	bool bNormal = true;
	int i;
	for(i=0;i<sy;i++){
		if (i+y < 0) continue;	//	upper cliping
		if (i+y > 480) break;	//	lower cliping
		if ((m_nFadeTable[i+y]!=256) || (m_nRasterTable[i+y]!=0)){
			bNormal = false;
			break;
		}
	}
	if (bNormal) {
		return lpDraw->Blt(lpPlane,x,y);
	}
	//	全ラスタが0か？
	for(i=0;i<sy;i++){
		if (i+y < 0) continue;	//	upper cliping
		if (i+y > 480) break;	//	lower cliping
		if (m_nFadeTable[i+y]==0) {
			bNormal = false;
			break;
		}
	}
	if (bNormal){
		return 0;
	}
	for(i=0;i<sy;i++){
		if (i+y < 0) continue;	//	upper cliping
		if (i+y > 480) break;	//	lower cliping

		int nFade = m_nFadeTable[i+y];
		RECT rcSrc;
		::SetRect(&rcSrc,0,i,sx,i+1);	//	ワンラスタ
		if (nFade==0) {
			continue;
		};
		if (nFade==256) {
			lpDraw->Blt(lpPlane,x+m_nRasterTable[i+y],y+i,&rcSrc);
			continue;
		}
		lpDraw->BlendBlt(lpPlane,x+m_nRasterTable[i+y],y+i,nFade,&rcSrc);
//		lpDraw->BlendBlt(lpPlane,x+m_nRasterTable[i+y],y+i,PlaneRGB(255-nFade,255-nFade,255-nFade),PlaneRGB(nFade,nFade,nFade),&rcSrc);
	}
	return 0;
}

// @yo2 0x005455f0 review
CPlaneFadeBlt::CPlaneFadeBlt(void){
	for(int i=0;i<480;i++){
		m_nFadeTable[i] = 256;
	}
	ZERO(m_nRasterTable);
}

// @yo2 0x00545660 vt
CPlaneFadeBlt::~CPlaneFadeBlt(){
}

///////////////////////////////////////////////////////////////////////////////
//
//		トランジション系の関数
//
///////////////////////////////////////////////////////////////////////////////
//--- 修正 '01/11/29  by ENRA  ---
// nTransMode=2の時、byFadeRateを有効にした
//--------------------------------
//--- 修正 '02/02/01  by ENRA  ---
// クリッピングが出来るようにした
// クロストランジションを出来るだけサポートした
//--------------------------------

//	コールバック用関数
vector< smart_ptr<CPlaneTransBltListener> > CPlaneTransBlt::m_avListener;

//	まずは、マクロ類から

//	通常転送
#define CheckNormal \
	if (nPhase <= 0) return 0;				\
	if (nPhase >= 256) {					\
		switch (nTransMode) {				\
		case 0 :return lpDraw->BltFast(lpPlane,x,y,NULL,NULL,lpDstClipRect);\
		case 1 :return lpDraw->Blt(lpPlane,x,y,NULL,NULL,lpDstClipRect);\
		case 2 :return lpDraw->BlendBltFastAlpha(lpPlane,x,y,byFadeRate,NULL,NULL,lpDstClipRect); \
		case 3 :return lpDraw->BltNatural(lpPlane,x,y,NULL,NULL,lpDstClipRect); \
		}									\
	}										\
	int sx,sy;								\
	lpPlane->GetSize(sx,sy);


//	普通にBltするマクロ
#define BLT(dst,src) {\
	switch (nTransMode) {				\
	case 0 :dst ->BltFast(src,x,y,NULL,NULL,lpDstClipRect); break; \
	case 1 :dst ->Blt(src,x,y,NULL,NULL,lpDstClipRect); break;\
	case 2 :dst ->BlendBltFastAlpha(src,x,y,byFadeRate,NULL,NULL,lpDstClipRect); break;\
	case 3 :dst ->BltNatural(src,x,y,NULL,NULL,lpDstClipRect); break;\
	}				\
					}

//	水平ラインを転送するマクロ
#define BLTHLINE(p) {\
	RECT rc;								\
	::SetRect(&rc,0,p,sx,p+1);				\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x,y+p,&rc,NULL,lpDstClipRect); break;\
	case 1 : lpDraw->Blt(lpPlane,x,y+p,&rc,NULL,lpDstClipRect); break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x,y+p,byFadeRate,&rc,NULL,lpDstClipRect); break;\
	case 3 : lpDraw->BltNatural(lpPlane,x,y+p,&rc,NULL,lpDstClipRect); break;\
	}										\
					}

//	水平ラインpをnドット目からkドット転送するマクロ
#define BLTHLINE2(p,n,k) {\
	RECT rc;									\
	int k2,n2;									\
	k2 = k;										\
	n2 = n;										\
	if (n2+k2>sx) { k2=sx-n2; }					\
	if (n2<0) { k2+=n2; n2=0; if (k2<0) k2=0;}	\
	::SetRect(&rc,n2,p,n2+k2,p+1);				\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+n2,y+p,&rc,NULL,lpDstClipRect); break;\
	case 1 : lpDraw->Blt(lpPlane,x+n2,y+p,&rc,NULL,lpDstClipRect); break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+n2,y+p,byFadeRate,&rc,NULL,lpDstClipRect); break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+n2,y+p,&rc,NULL,lpDstClipRect); break;\
	}										\
					}

//	垂直ラインを転送するマクロ
#define BLTVLINE(p) {\
	RECT rc;							\
	::SetRect(&rc,p,0,p+1,sy);			\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+p,y,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+p,y,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+p,y,byFadeRate,&rc,NULL,lpDstClipRect); break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+p,y,&rc,NULL,lpDstClipRect); break;\
	}										\
					}

//	水平ラインをずらして転送するマクロ
#define BLTHLINEOFFSET(p,ox) {\
	RECT rc;								\
	::SetRect(&rc,0,p,sx,p+1);				\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+ox,y+p,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+ox,y+p,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+ox,y+p,byFadeRate,&rc,NULL,lpDstClipRect); break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+ox,y+p,&rc,NULL,lpDstClipRect); break;\
	}										\
					}

//	矩形を転送するマクロ(Clipあり)
#define BLTRECT(_x,_y,_sx,_sy) {\
	RECT rc;									\
	int	sx2,sy2;								\
	sx2=_sx; sy2=_sy;							\
	int x2,y2;									\
	x2 = _x; y2=_y;								\
	if(x2<0) { x2=0; }							\
	if(y2<0) { y2=0; }							\
	if(x2+sx2 > sx) { sx2 = sx-x2; }			\
	if(y2+sy2 > sy) { sy2 = sy-y2; }			\
	::SetRect(&rc,x2,y2,x2+sx2,y2+sy2);			\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+x2,y+y2,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+x2,y+y2,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+x2,y+y2,byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+x2,y+y2,&rc,NULL,lpDstClipRect);break;\
	}										\
					}

//	矩形をオフセットして転送するマクロ(Clipあり)
#define BLTRECTOFFSET(_x,_y,_sx,_sy,_ox,_oy) {\
	RECT rc;									\
	int	sx2 = _sx, sy2 = _sy;					\
	int x2 = _x, y2 = _y;						\
	if(x2<0) { x2=0; }							\
	if(y2<0) { y2=0; }							\
	if(x2+sx2 > sx) { sx2 = (sx)-(x2); }		\
	if(y2+sy2 > sy) { sy2 = (sy)-(y2); }		\
	::SetRect(&rc,x2,y2,(x2)+(sx2),(y2)+(sy2));	\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,(x)+(x2)+(_ox),(y)+(y2)+(_oy),&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,(x)+(x2)+(_ox),(y)+(y2)+(_oy),&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,(x)+(x2)+(_ox),(y)+(y2)+(_oy),byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,(x)+(x2)+(_ox),(y)+(y2)+(_oy),&rc,NULL,lpDstClipRect);break;\
	}										\
					}

//	ご近所の矩形を転送するマクロ
#define BLTRECTNEIGHBOR(_x,_y,_sx,_sy,level) {\
	RECT rc;									\
	int	sx2,sy2;								\
	sx2=_sx; sy2=_sy;							\
	if(_x+sx2 > sx) { sx2 = sx-_x; }			\
	if(_y+sy2 > sy) { sy2 = sy-_y; }			\
	int ox,oy;									\
	ox = rand() % level; oy = rand() % level;	\
	if (ox+_x+sx2 > sx) ox=0;					\
	if (oy+_y+sy2 > sy) oy=0;					\
	::SetRect(&rc,_x+ox,_y+oy,_x+sx2+ox,_y+sy2+oy);\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+_x,y+_y,byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	}										\
				}

//	点を転送するマクロ（遅い）
#define BLTPSET(_x,_y) {\
	RECT rc;									\
	::SetRect(&rc,_x,_y,_x+1,_y+1);				\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+_x,y+_y,byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+_x,y+_y,&rc,NULL,lpDstClipRect);break;\
	}										\
				}

//	水平ラインを上下にずらして転送するマクロ
#define BLTHLINEFROM(p,oy) {\
	RECT rc;							\
	::SetRect(&rc,0,p,sx,p+1);			\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x,y+oy,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x,y+oy,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x,y+oy,byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x,y+oy,&rc,NULL,lpDstClipRect);break;\
	}										\
				}

//	垂直ラインを左右にずらして転送するマクロ
#define BLTVLINEFROM(p,ox) {\
	RECT rc;							\
	::SetRect(&rc,p,0,p+1,sy);			\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+ox,y,&rc,NULL,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+ox,y,&rc,NULL,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+ox,y,byFadeRate,&rc,NULL,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+ox,y,&rc,NULL,lpDstClipRect);break;\
	}										\
				}

//	水平ラインを横にrx分ストレッチして転送するマクロ
#define BLTHLINEST(p,rx) {\
	RECT rc;													\
	::SetRect(&rc,0,p,sx,p+1);									\
	SIZE sz = { (LONG)((rx)*sx),1 };							\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x-(int)((sx>>1)*(rx-1)),y+p,&rc,&sz,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x-(int)((sx>>1)*(rx-1)),y+p,&rc,&sz,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x-(int)((sx>>1)*(rx-1)),y+p,byFadeRate,&rc,&sz,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x-(int)((sx>>1)*(rx-1)),y+p,&rc,&sz,lpDstClipRect);break;\
	}										\
				}

//	垂直ラインを縦にry分ストレッチして転送するマクロ
#define BLTVLINEST(p,ry) {\
	RECT rc;													\
	::SetRect(&rc,p,0,p+1,sy);									\
	SIZE sz = { 1,(LONG)((ry)*sy) };							\
	switch (nTransMode) {					\
	case 0 : lpDraw->BltFast(lpPlane,x+p,y-(int)((sy>>1)*(ry-1)),&rc,&sz,lpDstClipRect);break;\
	case 1 : lpDraw->Blt(lpPlane,x+p,y-(int)((sy>>1)*(ry-1)),&rc,&sz,lpDstClipRect);break;\
	case 2 : lpDraw->BlendBltFastAlpha(lpPlane,x+p,y-(int)((sy>>1)*(ry-1)),byFadeRate,&rc,&sz,lpDstClipRect);break;\
	case 3 : lpDraw->BltNatural(lpPlane,x+p,y-(int)((sy>>1)*(ry-1)),&rc,&sz,lpDstClipRect);break;\
	}										\
				}

///////////////////////////////////////////////////////////////////////////////
// @yo2 0x00545780 cg
LRESULT CPlaneTransBlt::Blt(int nTransNo,CPlaneBase*lpDst,CPlaneBase*lpSrc,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){	//	番号で呼び出せるのだ
	static LRESULT (*FuncList[])(CPlaneBase*,CPlaneBase*,int,int,int,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect) = {	// [portable] no default arguments on a function-pointer type (MSVC allowed them; the one call passes all 8)
		CPlaneTransBlt::MirrorBlt1,	//	一応０でも呼び出しておく
		CPlaneTransBlt::MirrorBlt1,	//	1
		CPlaneTransBlt::MirrorBlt2,
		CPlaneTransBlt::MirrorBlt3,
		CPlaneTransBlt::MirrorBlt4,
		CPlaneTransBlt::CutInBlt1,
		CPlaneTransBlt::CutInBlt2,
		CPlaneTransBlt::CutInBlt3,
		CPlaneTransBlt::CutInBlt4,
		CPlaneTransBlt::CutInBlt5,
		CPlaneTransBlt::CutInBlt6,	//	10
		CPlaneTransBlt::CutInBlt7,
		CPlaneTransBlt::CutInBlt8,
		CPlaneTransBlt::CutInBlt9,
		CPlaneTransBlt::CutInBlt10,
		CPlaneTransBlt::CutInBlt11,
		CPlaneTransBlt::CutInBlt12,
		CPlaneTransBlt::CutInBlt13,
		CPlaneTransBlt::CutInBlt14,
		CPlaneTransBlt::CutInBlt15,
		CPlaneTransBlt::CutInBlt16,	//	20
		CPlaneTransBlt::CutInBlt17,
		CPlaneTransBlt::CutInBlt18,
		CPlaneTransBlt::CutInBlt19,
		CPlaneTransBlt::WaveBlt1,
		CPlaneTransBlt::WaveBlt2,
		CPlaneTransBlt::WaveBlt3,
		CPlaneTransBlt::WaveBlt4,
		CPlaneTransBlt::CircleBlt1,
		CPlaneTransBlt::CircleBlt2,
		CPlaneTransBlt::CircleBlt3,	// 30
		CPlaneTransBlt::CircleBlt4,
		CPlaneTransBlt::CircleBlt5,
		CPlaneTransBlt::RectBlt1,
		CPlaneTransBlt::RectBlt2,
		CPlaneTransBlt::RectBlt3,
		CPlaneTransBlt::BlindBlt1,
		CPlaneTransBlt::BlindBlt2,
		CPlaneTransBlt::BlindBlt3,
		CPlaneTransBlt::BlindBlt4,
		CPlaneTransBlt::BlindBlt5,	// 40
		CPlaneTransBlt::BlindBlt6,
		CPlaneTransBlt::BlindBlt7,
		CPlaneTransBlt::BlindBlt8,
		CPlaneTransBlt::BlindBlt9,
		CPlaneTransBlt::BlindBlt10,
		CPlaneTransBlt::WhorlBlt1,
		CPlaneTransBlt::WhorlBlt2,
		CPlaneTransBlt::WhorlBlt3,
		CPlaneTransBlt::WhorlBlt4,
		CPlaneTransBlt::WhorlBlt5,	// 50
		CPlaneTransBlt::WhorlBlt6,
		CPlaneTransBlt::WhorlBlt7,
		CPlaneTransBlt::WhorlBlt8,
		CPlaneTransBlt::BlendBlt1,
		CPlaneTransBlt::DiagonalDiffusionBlt,
		CPlaneTransBlt::DiffusionCongeriesBlt1,
		CPlaneTransBlt::DiffusionCongeriesBlt2,
		CPlaneTransBlt::DiffusionCongeriesBlt3,
		CPlaneTransBlt::SquashBlt,
		CPlaneTransBlt::ForwardRollBlt,	// 60
		CPlaneTransBlt::RotationBlt1,
		CPlaneTransBlt::RotationBlt2,
		CPlaneTransBlt::RotationBlt3,
		CPlaneTransBlt::RotationBlt4,
		CPlaneTransBlt::EnterUpBlt1,
		CPlaneTransBlt::EnterUpBlt2,
		CPlaneTransBlt::CellGatherBlt1,
		CPlaneTransBlt::CellGatherBlt2,
		CPlaneTransBlt::MosaicBlt1,
		CPlaneTransBlt::FlushBlt1,		//	70
		CPlaneTransBlt::SlitCurtainBlt1,
		CPlaneTransBlt::SlitCurtainBlt2,
		CPlaneTransBlt::SlitCurtainBlt3,
		CPlaneTransBlt::SlitCurtainBlt4,
		CPlaneTransBlt::SlitCurtainBlt5,
		CPlaneTransBlt::SlitCurtainBlt6,
		CPlaneTransBlt::SlitCurtainBlt7,
		CPlaneTransBlt::SlitCurtainBlt8,
		CPlaneTransBlt::TensileBlt1,
		CPlaneTransBlt::TensileBlt2,	// 80
		CPlaneTransBlt::TensileBlt3,
		CPlaneTransBlt::TensileBlt4,
	//	上のがトランジション系Blt
	};

//	WARNING(nTransNo >= NELEMS(FuncList) ,"CPlaneTransBlt::Bltで範囲外");
	//	これエラーではなく、不正終了としてリターンするほうがいい。

	//	マイナスの値の場合は、ユーザー登録関数
	if (nTransNo<0) {
		nTransNo = -nTransNo-1;
		int n = GetBltListener()->size();
		if (nTransNo < n){
			return (*GetBltListener())[nTransNo]->Blt(lpDst,lpSrc,x,y,nPhase,nTransMode,byFadeRate,lpDstClipRect);
		} else {
			return 1;	//　範囲外
		}
	}else{
		// クロストランジションをサポートする場合はここにcaseを書く
		switch(nTransNo){
		case  5:	// CutInBlt1
		case  7:	// CutInBlt3
			if(nPhase>256){
				nPhase = 512-nPhase;
			} break;
		case  8:	// CutInBlt4
		case  9:	// CutInBlt5
		case 10:	// CutInBlt6
		case 11:	// CutInBlt7
			if(nPhase>256){
				nTransNo = nTransNo - 2*(nTransNo&1) + 1;
				nPhase = 512-nPhase;
			} break;
		case 13:	// CutInBlt9
		case 14:	// CutInBlt10
		case 15:	// CutInBlt11
		case 16:	// CutInBlt12
			if(nPhase>256){
				nTransNo = 16-nTransNo+13;
				nPhase = 512-nPhase;
			} break;
		case 17:	// CutInBlt13
		case 18:	// CutInBlt14
		case 19:	// CutInBlt15
		case 20:	// CutInBlt16
		case 21:	// CutInBlt17
			if(nPhase>256){
				nPhase = 512-nPhase;
			} break;
		case 22:	// CutInBlt18
		case 23:	// CutInBlt19
			if(nPhase>256){
				nTransNo = nTransNo - 2*(nTransNo&1) + 1;
				nPhase = 512 - nPhase;
			} break;
		case 26:	// WaveBlt3
		case 27:	// WaveBlt4
		case 36:	// BlindBlt1
		case 37:	// BlindBlt2
		case 38:	// BlindBlt3
		case 39:	// BlindBlt4
		case 40:	// BlindBlt5
		case 41:	// BlindBlt6
		case 42:	// BlindBlt7
		case 43:	// BlindBlt8
		case 44:	// BlindBlt9
		case 45:	// BlindBlt10
			if(nPhase>256){
				nTransNo = nTransNo - 2*(nTransNo&1) + 1;
				nPhase = 512 - nPhase;
			} break;
		case 54:	// BlendBlt1
		case 55:	// DiagonalDiffusionBlt
		case 56:	// DiffusionCongeriesBlt1
		case 57:	// DiffusionCongeriesBlt2
		case 58:	// DiffusionCongeriesBlt3
		case 59:	// SquashBlt
		case 60:	// ForwardRollBlt
		case 67:	// CellGatherBlt1
		case 68:	// CellGatherBlt2
			if(nPhase>256){
				nPhase = 512-nPhase;
			} break;
		case 71:	// SlitCurtainBlt1
		case 72:	// SlitCurtainBlt2
		case 73:	// SlitCurtainBlt3
		case 74:	// SlitCurtainBlt4
		case 75:	// SlitCurtainBlt5
		case 76:	// SlitCurtainBlt6
		case 77:	// SlitCurtainBlt7
		case 78:	// SlitCurtainBlt8
			if(nPhase>256){
				nTransNo = nTransNo + 2*(nTransNo&1) - 1;
				nPhase = 512 - nPhase;
			} break;
		default:
			// クロストランジション非対応
			if(nPhase>256) nPhase = 0;
		}
	}

	if (nTransNo >= NELEMS(FuncList)) return 1; // 範囲外

	return FuncList[nTransNo](lpDst,lpSrc,x,y,nPhase,nTransMode,byFadeRate,lpDstClipRect);
}

// @yo2 0x005459e0 review
LRESULT CPlaneTransBlt::MirrorBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int px=0;px<sx;px++){
		BLTVLINEFROM(px,sx-px-1);
	}
	return 0;
}
// @yo2 0x00545c60 review
LRESULT CPlaneTransBlt::MirrorBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		BLTHLINEFROM(py,sy-py-1);
	}
	return 0;
}
// @yo2 0x00545ee0 review
LRESULT CPlaneTransBlt::MirrorBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	double phase;
	phase = (double)(256-nPhase) / 256;
	for(int py=0;py<sy;py++){
		BLTHLINEST(py,1+ (2 * st.Sin(256*py/sy) * phase)/65536);
	}
	return 0;
}
// @yo2 0x005462f0 review
LRESULT CPlaneTransBlt::MirrorBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	double phase;
	phase = (double)(256-nPhase) / 256;
	for(int px=0;px<sx;px++){
		BLTVLINEST(px,1+ (2 * st.Sin(256*px/sx) * phase)/65536);
	}
	return 0;
}

// @yo2 0x00546700 review
LRESULT CPlaneTransBlt::CutInBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		int r,r2;	//	ずれ幅
		r2 = 256-nPhase;	//	ずれ幅
		r = (rand() % r2) - (r2>>1);
		BLTHLINEOFFSET(py,r);
	}
	return 0;
}

// @yo2 0x005469c0 review
LRESULT CPlaneTransBlt::CutInBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int level;
	if (nPhase<128) level = 10; else if (nPhase<200) level = 6;
	else if(nPhase<230) level = 4; else level = 2;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= nPhase){
				BLTRECT(px,py,4,2);
			} else {
				BLTRECTNEIGHBOR(px,py,4,2,level);	//	近所のやつをBlt
			}
		}
	}
	return 0;
}
// @yo2 0x00546ef0 review
LRESULT CPlaneTransBlt::CutInBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= nPhase){
				BLTRECT(px,py,4,2);
			}
		}
	}
	return 0;
}
// @yo2 0x00547230 review
LRESULT CPlaneTransBlt::CutInBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= (nPhase<<1) + ((sy-py-1)<<8)/sy - 256){
				BLTRECT(px,py,4,2);
			}
		}
	}
	return 0;
}
// @yo2 0x00547580 review
LRESULT CPlaneTransBlt::CutInBlt5(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= (nPhase<<1) + (py<<8)/sy - 256){
				BLTRECT(px,py,4,2);
			}
		}
	}
	return 0;
}
// @yo2 0x005478d0 review
LRESULT CPlaneTransBlt::CutInBlt6(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= (nPhase<<1) + ((sx-px-1)<<8)/sx - 256){
				BLTRECT(px,py,4,2);
			}
		}
	}
	return 0;
}
// @yo2 0x00547c20 review
LRESULT CPlaneTransBlt::CutInBlt7(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			if ((rand()&255) <= (nPhase<<1) + (px<<8)/sx - 256){
				BLTRECT(px,py,4,2);
			}
		}
	}
	return 0;
}
// @yo2 0x00547f70 review
LRESULT CPlaneTransBlt::CutInBlt8(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	if (sy>sx) sm=sy; else sm=sx;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	BLTRECT((sx>>1)-(sr>>1),(sy>>1)-(sr>>1),sr,sr);
	return 0;
}
// @yo2 0x00548260 review
LRESULT CPlaneTransBlt::CutInBlt9(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	if (sy>sx) sm=sy; else sm=sx;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	BLTRECT(0,0,sr,sr);
	return 0;
}
// @yo2 0x005484e0 review
LRESULT CPlaneTransBlt::CutInBlt10(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	if (sy>sx) sm=sy; else sm=sx;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	BLTRECT(sx-sr,0,sr,sr);
	return 0;
}
// @yo2 0x00548780 review
LRESULT CPlaneTransBlt::CutInBlt11(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	if (sy>sx) sm=sy; else sm=sx;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	BLTRECT(0,sy-sr,sr,sr);
	return 0;
}
// @yo2 0x00548a30 review
LRESULT CPlaneTransBlt::CutInBlt12(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	if (sy>sx) sm=sy; else sm=sx;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	BLTRECT(sx-sr,sy-sr,sr,sr);
	return 0;
}
// @yo2 0x00548d00 review
LRESULT CPlaneTransBlt::CutInBlt13(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// start size
	sr = (sx * nPhase) >> 8;
	for(int py=0;py<sy;py+=2){
		BLTRECT(0,py,sr,1); // クリップ付きHLINE
		BLTRECT(sx-sr-1,py+1,sx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x00549110 review
LRESULT CPlaneTransBlt::CutInBlt14(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// start size
	sr = (sy * nPhase) >> 8;
	for(int px=0;px<sx;px+=2){
		BLTRECT(px,0,1,sr); // クリップ付きVLINE
		BLTRECT(px+1,sy-sr-1,1,sy); // クリップ付きVLINE
	}
	return 0;
}
// @yo2 0x00549540 review
LRESULT CPlaneTransBlt::CutInBlt15(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// start size
	sr = (sx * nPhase) >> 7;
	for(int py=0;py<sy;py+=4){
		BLTRECT(0,py,sr,1);			// クリップ付きHLINE
		BLTRECT(sx-sr-1,py+2,sx,1);	// クリップ付きHLINE
	}
	if (nPhase > 128) {
		for(int py=0;py<sy;py+=4){
			sr = (sx * (nPhase-128)) >> 7;
			BLTRECT(0,py+1,sr,1);		// クリップ付きHLINE
			BLTRECT(sx-sr-1,py+3,sx,1); // クリップ付きHLINE
		}
	}
	return 0;
}
// @yo2 0x00549c50 review
LRESULT CPlaneTransBlt::CutInBlt16(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// start size
	sr = (sy * nPhase) >> 7;
	for(int px=0;px<sx;px+=4){
		BLTRECT(px,0,1,sr);			// クリップ付きVLINE
		BLTRECT(px+2,sy-sr-1,1,sy);	// クリップ付きVLINE
	}
	if (nPhase > 128) {
		for(int px=0;px<sx;px+=4){
			sr = (sy * (nPhase-128)) >> 7;
			BLTRECT(px+1,0,1,sr);		// クリップ付きVLINE
			BLTRECT(px+3,sy-sr-1,1,sy); // クリップ付きVLINE
		}
	}
	return 0;
}
// @yo2 0x0054a360 review
LRESULT CPlaneTransBlt::CutInBlt17(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=2){
			if ((rand()&255) <=
				sr-sqrt((px*2-sx)*(px*2-sx)+(py*2-sy)*(py*2-sy)))
			{
				BLTRECT(px,py,2,2);
			}
		}
	}
	return 0;
}
// @yo2 0x0054a700 review
LRESULT CPlaneTransBlt::CutInBlt18(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// rest size
	sr = (sy * nPhase) >> 8;
	BLTRECT(0,0,sx,sr);
	BLTHLINEOFFSET(sr,-sx/9);
	BLTHLINEOFFSET(sr+1,sx/9);
	BLTHLINEOFFSET(sr+2,-sx*2/9);
	BLTHLINEOFFSET(sr+3,sx*2/9);
	BLTHLINEOFFSET(sr+4,-sx/3);
	BLTHLINEOFFSET(sr+5,sx/3);
	return 0;
}
// @yo2 0x0054b2b0 review
LRESULT CPlaneTransBlt::CutInBlt19(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sr;	// rest size
	sr = sy - ((sy * nPhase) >> 8);
	BLTRECT(0,sr,sx,sy-sr);
	BLTHLINEOFFSET(sr-1,-sx/9);
	BLTHLINEOFFSET(sr-2,sx/9);
	BLTHLINEOFFSET(sr-3,-sx*2/9);
	BLTHLINEOFFSET(sr-4,sx*2/9);
	BLTHLINEOFFSET(sr-5,-sx/3);
	BLTHLINEOFFSET(sr-6,sx/3);
	return 0;
}

// @yo2? 0x0054beb0 order
LRESULT CPlaneTransBlt::BlindBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int px=0;px<sx;px++){
		if ((px & 7) <= (nPhase >> 5)) {
			BLTVLINE(px);
		}
	}
	return 0;
}
// @yo2 0x0054c130 review
LRESULT CPlaneTransBlt::BlindBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int px=0;px<sx;px++){
		if ((7-(px & 7)) <= (nPhase >> 5)) {
			BLTVLINE(px);
		}
	}
	return 0;
}
// @yo2 0x0054c3b0 review
LRESULT CPlaneTransBlt::BlindBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int px=0;px<sx;px++){
		if ((px & 15) <= (nPhase >> 4)) {
			BLTVLINE(px);
		}
	}
	return 0;
}
// @yo2 0x0054c630 review
LRESULT CPlaneTransBlt::BlindBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int px=0;px<sx;px++){
		if ((15-(px & 15)) <= (nPhase >> 4)) {
			BLTVLINE(px);
		}
	}
	return 0;
}
// @yo2 0x0054c8b0 review
LRESULT CPlaneTransBlt::BlindBlt5(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		if ((py & 7) <= (nPhase >> 5)) {
			BLTHLINE(py);
		}
	}
	return 0;
}
// @yo2 0x0054cb30 review
LRESULT CPlaneTransBlt::BlindBlt6(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		if ((7-(py & 7)) <= (nPhase >> 5)) {
			BLTHLINE(py);
		}
	}
	return 0;
}
// @yo2 0x0054cdb0 review
LRESULT CPlaneTransBlt::BlindBlt7(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		if ((py & 15) <= (nPhase >> 4)) {
			BLTHLINE(py);
		}
	}
	return 0;
}
// @yo2 0x0054d030 review
LRESULT CPlaneTransBlt::BlindBlt8(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	for(int py=0;py<sy;py++){
		if ((15-(py & 15)) <= (nPhase >> 4)) {
			BLTHLINE(py);
		}
	}
	return 0;
}
// @yo2 0x0054d2b0 review
LRESULT CPlaneTransBlt::BlindBlt9(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int phase;
	phase = nPhase >> 5;
	for(int py=0;py<sy;py++){
		for(int px=-(py % 7);px<sx;px+=8){
			BLTHLINE2(py,px,phase);
		}
	}
	return 0;
}
// @yo2 0x0054d5c0 review
LRESULT CPlaneTransBlt::BlindBlt10(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py++){
		for(int px=-(py % 15);px<sx;px+=16){
			BLTHLINE2(py,px,phase);
		}
	}
	return 0;
}
// @yo2 0x0054d8d0 review
LRESULT CPlaneTransBlt::RectBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int phase;
	phase = nPhase >> 6;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			BLTRECT(px,py,phase,phase);
		}
	}
	return 0;
}
// @yo2 0x0054dbe0 review
LRESULT CPlaneTransBlt::RectBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int phase;
	phase = nPhase >> 5;
	for(int py=0;py<sy;py+=8){
		for(int px=0;px<sx;px+=8){
			BLTRECT(px,py,phase,phase);
		}
	}
	return 0;
}
// @yo2 0x0054def0 review
LRESULT CPlaneTransBlt::RectBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=16){
		for(int px=0;px<sx;px+=16){
			BLTRECT(px,py,phase,phase);
		}
	}
	return 0;
}
// @yo2 0x0054e200 review
LRESULT CPlaneTransBlt::CircleBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = (int)(sqrt(sx*sx/4+sy*sy)*2);
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	int ssy,py;
	ssy = 0;
	for(py=0;py<(sr>>1);py++,ssy++){
		int px,rx;
		rx = (int)(sqrt(sr*sr/4-ssy*ssy)*2);
		px = (sx>>1)-(rx>>1);
		BLTRECT(px,py,rx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x0054e560 review
LRESULT CPlaneTransBlt::CircleBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = (int)(sqrt(sx*sx/4+sy*sy)*2);
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	int ssy,py;
	ssy = 0;
	for(py=sy;py>sy-(sr>>1);py--,ssy++){
		int px,rx;
		rx = (int)(sqrt(sr*sr/4-ssy*ssy)*2);
		px = (sx>>1)-(rx>>1);
		BLTRECT(px,py,rx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x0054e8f0 review
LRESULT CPlaneTransBlt::CircleBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = (int)(sqrt(sx*sx+sy*sy/4)*2);
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	int ssy,py;
	ssy =-(sr >> 1);
	for(py=(sy>>1)-(sr>>1);py<((sy>>1)+(sr>>1));py++,ssy++){
		int px,rx;
		rx = (int)(sqrt(sr*sr/4-ssy*ssy));
		px = 0;
		BLTRECT(px,py,rx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x0054ec50 review
LRESULT CPlaneTransBlt::CircleBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = (int)(sqrt(sx*sx+sy*sy/4)*2);
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	int ssy,py;
	ssy =-(sr >> 1);
	for(py=(sy>>1)-(sr>>1);py<((sy>>1)+(sr>>1));py++,ssy++){
		int px,rx;
		rx = (int)(sqrt(sr*sr/4-ssy*ssy));
		px = sx-rx;
		BLTRECT(px,py,rx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x0054efe0 review
LRESULT CPlaneTransBlt::CircleBlt5(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = (sm * nPhase) >> 8;
	int ssy,py;
	ssy =-(sr >> 1);
	for(py=(sy>>1)-(sr>>1);py<((sy>>1)+(sr>>1));py++,ssy++){
		int px,rx;
		rx = (int)(sqrt(sr*sr/4-ssy*ssy)*2); // bug-fixed '00/02/24
		px = (sx>>1)-(rx>>1);
		BLTRECT(px,py,rx,1); // クリップ付きHLINE
	}
	return 0;
}
// @yo2 0x0054f340 review
LRESULT CPlaneTransBlt::WhorlBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 0, 1, 2, 3,
		11,12,13, 4,
		10,15,14, 5,
		 9, 8, 7, 6
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py++){
		for(int px=0;px<sx;px++){
			if (uzu[(px & 3)+((py & 3)<<2) & 15] <= phase){
				BLTPSET(px,py);
			}
		}
	}
	return 0;
}
// @yo2 0x0054f610 review
LRESULT CPlaneTransBlt::WhorlBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 6, 7, 8, 9,
		 5, 0, 1,10,
		 4, 3, 2,11,
		15,14,13,12
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py++){
		for(int px=0;px<sx;px++){
			if (uzu[(px & 3)+((py & 3)<<2) & 15] <= phase){
				BLTPSET(px,py);
			}
		}
	}
	return 0;
}
// @yo2 0x0054f8e0 review
LRESULT CPlaneTransBlt::WhorlBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 0, 1, 2, 3,
		11,12,13, 4,
		10,15,14, 5,
		 9, 8, 7, 6
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=2){
			if (uzu[((px>>1) & 3)+(((py>>1) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,2,2);
			}
		}
	}
	return 0;
}
// @yo2 0x0054fc30 review
LRESULT CPlaneTransBlt::WhorlBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 6, 7, 8, 9,
		 5, 0, 1,10,
		 4, 3, 2,11,
		15,14,13,12
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=2){
			if (uzu[((px>>1) & 3)+(((py>>1) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,2,2);
			}
		}
	}
	return 0;
}
// @yo2 0x0054ff80 review
LRESULT CPlaneTransBlt::WhorlBlt5(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 0, 1, 2, 3,
		11,12,13, 4,
		10,15,14, 5,
		 9, 8, 7, 6
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			if (uzu[((px>>2) & 3)+(((py>>2) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,4,4);
			}
		}
	}
	return 0;
}
// @yo2 0x005502d0 review
LRESULT CPlaneTransBlt::WhorlBlt6(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 6, 7, 8, 9,
		 5, 0, 1,10,
		 4, 3, 2,11,
		15,14,13,12
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			if (uzu[((px>>2) & 3)+(((py>>2) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,4,4);
			}
		}
	}
	return 0;
}
// @yo2 0x00550620 review
LRESULT CPlaneTransBlt::WhorlBlt7(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 0, 1, 2, 3,
		11,12,13, 4,
		10,15,14, 5,
		 9, 8, 7, 6
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=8){
		for(int px=0;px<sx;px+=8){
			if (uzu[((px>>3) & 3)+(((py>>3) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,8,8);
			}
		}
	}
	return 0;
}
// @yo2 0x00550970 review
LRESULT CPlaneTransBlt::WhorlBlt8(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static int uzu[16] = {
		 6, 7, 8, 9,
		 5, 0, 1,10,
		 4, 3, 2,11,
		15,14,13,12
	};
	int phase;
	phase = nPhase >> 4;
	for(int py=0;py<sy;py+=8){
		for(int px=0;px<sx;px+=8){
			if (uzu[((px>>3) & 3)+(((py>>3) & 3)<<2) & 15] <= phase){
				BLTRECT(px,py,8,8);
			}
		}
	}
	return 0;
}
// @yo2 0x00550cc0 review
LRESULT CPlaneTransBlt::WaveBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	for(int py=0;py<sy;py++){
		BLTHLINEOFFSET(py,(int) (st.Cos(py) * ((255-nPhase)*2) >> 16));
	}
	return 0;
}
// @yo2 0x00551040 review
LRESULT CPlaneTransBlt::WaveBlt2(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	for(int py=0;py<sy;py++){
		BLTHLINEOFFSET(py,(int) (st.Cos(py+256) * ((255-nPhase)*2) >> 16));
	}
	return 0;
}
// @yo2 0x005513d0 review
LRESULT CPlaneTransBlt::WaveBlt3(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	for(int py=0;py<sy;py++){
		BLTHLINEOFFSET(py,(int) (st.Cos(py<<3) * (255-nPhase) >> 16));
	}
	return 0;
}
// @yo2 0x00551740 review
LRESULT CPlaneTransBlt::WaveBlt4(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	static CSinTable st;
	for(int py=0;py<sy;py++){
		BLTHLINEOFFSET(py,(int) (st.Cos((py<<3)+256) * (255-nPhase) >> 16));
	}
	return 0;
}

// @yo2? 0x00551ac0 order
LRESULT CPlaneTransBlt::BlendBlt1(CPlaneBase*lpDraw,CPlaneBase*lpPlane,int x,int y,int nPhase,int nTransMode,BYTE byFadeRate,LPRECT lpDstClipRect){
	CheckNormal;
	switch (nTransMode) {
	case 0 :return lpDraw->BlendBltFast(lpPlane,x,y,nPhase,NULL,NULL,lpDstClipRect);
//	case 0 :return lpDraw->BlendBltFast(lpPlane,x,y,PlaneRGB(256-nPhase,256-nPhase,256-nPhase),PlaneRGB(nPhase,nPhase,nPhase));
	case 1 :return lpDraw->BlendBlt(lpPlane,x,y,nPhase,NULL,NULL,lpDstClipRect);
//	case 1 :return lpDraw->BlendBlt(lpPlane,x,y,PlaneRGB(256-nPhase,256-nPhase,256-nPhase),PlaneRGB(nPhase,nPhase,nPhase));
//	case 2 :return lpDraw->FadeBltAlpha(lpPlane,x,y,nPhase); //	遅いから、こんなん使わんといてやー
	case 2 :return lpDraw->BlendBltFastAlpha(lpPlane,x,y,nPhase,NULL,NULL,lpDstClipRect);
//	case 3 :return -1; // not supported
	case 3 :return lpDraw->BltNatural(lpPlane,x,y,nPhase,NULL,NULL,lpDstClipRect);
	default: return -1;
	}
}

///////////////////////////////////////////////////////////////////////////////
// BYTE byFadeRateを追加 '01/11/29	by enra
// ところでint nTransMode /* = false */って？？
// なんでbooleanが出てくんの？消しました。
// @yo2 0x00551cd0 feat
LRESULT CPlaneTransBlt::MosaicBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;

	nPhase = ((255 - nPhase) >> 2) + 1;
	BLT(lpDraw, lpPlane);
	RECT rc;
	::SetRect(&rc, x, y, x + sx, y + sy);
	if(lpDstClipRect!=NULL){
		RECT rc2;
		::IntersectRect(&rc2, &rc, lpDstClipRect);
		return lpDraw->MosaicEffect(nPhase, &rc2);	//	転送矩形にモザイクをかける
	}
	return lpDraw->MosaicEffect(nPhase, &rc);	//	転送矩形にモザイクをかける
}

// @yo2 0x00551f50 feat
LRESULT CPlaneTransBlt::FlushBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;

	BLT(lpDraw, lpPlane);
	RECT rc;
	::SetRect(&rc, x, y, x + sx, y + sy);
	if(lpDstClipRect!=NULL){
		RECT rc2;
		::IntersectRect(&rc2, &rc, lpDstClipRect);
		return lpDraw->FlushEffect(&rc2);	//	転送矩形にモザイクをかける
	}

	return lpDraw->FlushEffect(&rc);	//	転送矩形にモザイクをかける
}

///////////////////////////////////////////////////////////////////////////////
//	Thanks ! > TearDrop_Stone

// スリットカーテントランジション。
// @yo2 0x005521b0 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt1(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper1(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, 16, lpDstClipRect);
}
// @yo2 0x00552200 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt2(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper1(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, 16, lpDstClipRect);
}
// @yo2 0x00552250 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt3(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper1(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, 8, lpDstClipRect);
}
// @yo2 0x005522a0 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt4(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper1(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, 8, lpDstClipRect);
}
// @yo2 0x005522f0 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt5(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper2(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, 16, lpDstClipRect);
}
// @yo2 0x00552340 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt6(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper2(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, 16, lpDstClipRect);
}
// @yo2 0x00552390 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt7(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper2(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, 8, lpDstClipRect);
}
// @yo2 0x005523e0 cg
LRESULT CPlaneTransBlt::SlitCurtainBlt8(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return BltTransHelper2(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, 8, lpDstClipRect);
}

// 引き伸ばしトランジション。
// @yo2 0x00552430 cg
LRESULT CPlaneTransBlt::TensileBlt1(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return TensileBltHelper1(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, lpDstClipRect);
}
// @yo2 0x00552480 cg
LRESULT CPlaneTransBlt::TensileBlt2(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return TensileBltHelper1(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, lpDstClipRect);
}
// @yo2 0x005524d0 cg
LRESULT CPlaneTransBlt::TensileBlt3(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return TensileBltHelper2(pSrc, pDest, x, y, nPhase, true, nTransMode, byFadeRate, lpDstClipRect);
}
// @yo2 0x00552520 cg
LRESULT CPlaneTransBlt::TensileBlt4(CPlaneBase* pDest, CPlaneBase* pSrc,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	return TensileBltHelper2(pSrc, pDest, x, y, nPhase, false, nTransMode, byFadeRate, lpDstClipRect);
}

// 引き伸ばしトランジションの実体
// @yo2 0x00552570 review
LRESULT CPlaneTransBlt::TensileBltHelper1(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
										   int nPhase, bool Direction, int nTransMode,	BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CPlaneBase *lpDraw=pDest,*lpPlane=pSrc;	//	もうええやん＾＾；
	CheckNormal;

	int i, j;
	int dx, dy;
	pDest->GetSize(dx, dy);

	RECT rc;
	SIZE sz;
	sz.cy = sy;
	rc.top = 0;
	rc.bottom = sy;
	// すでに表示されている部分が存在するはずだから、
	// そこを表示
	i = (nPhase * sx) / 256;
	if(Direction){
		rc.right = sx;
		rc.left = rc.right - i;
	}else{
		rc.left = 0;
		rc.right = i;
	}
	if(rc.left != rc.right){
		switch (nTransMode) {
		case 0 :pDest->BltFast(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		case 1 :pDest->Blt(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		case 2 :pDest->BlendBltFastAlpha(pSrc,x + rc.left, y, byFadeRate, &rc,NULL,lpDstClipRect); break;
		case 3 :pDest->BltNatural(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		}
	}
	// 次に表示されるべき部分は引き伸ばされる。
	if(Direction){
		i = 0;
		j = rc.right = rc.left;
		j += x;
		rc.left--;
	}else{
		i = rc.right + x;
		rc.left = rc.right;
		rc.right++;
		j = dx - rc.left - x;
	}
	// 引き伸ばされるべき部分を横に拡大する。FPS が怖いけどね。
	sz.cx = j;
	if(rc.left < 0)
		rc.left = 0;
	if(rc.right > sx)
		rc.right = sx;
	switch (nTransMode) {
	case 0 :pDest->BltFast(pSrc,i, y, &rc, &sz,lpDstClipRect); break;
	case 1 :pDest->Blt(pSrc,i, y, &rc, &sz,lpDstClipRect); break;
	case 2 :pDest->BlendBltFastAlpha(pSrc,i, y, byFadeRate, &rc, &sz,lpDstClipRect); break;
	case 3 :pDest->BltNatural(pSrc,i, y, &rc, &sz,lpDstClipRect); break;
	}
	return 0;
}
// @yo2 0x00552930 review
LRESULT CPlaneTransBlt::TensileBltHelper2(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
										   int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CPlaneBase *lpDraw=pDest,*lpPlane=pSrc;	//	もうええやん＾＾；
	CheckNormal;

	int i, j;
	int dx, dy;
	pDest->GetSize(dx, dy);

	SIZE sz;
	RECT rc;
	sz.cx = sx;
	rc.left = 0;
	rc.right = sx;
	// すでに表示されている部分が存在するはずだから、
	// そこを表示
	i = (nPhase * sy) / 256;
	if(Direction){
		rc.bottom = sy;
		rc.top = rc.bottom - i;
	}else{
		rc.top = 0;
		rc.bottom = i;
	}
	switch (nTransMode) {
	case 0 :pDest->BltFast(pSrc,x, y + rc.top, &rc,NULL,lpDstClipRect); break;
	case 1 :pDest->Blt(pSrc,x, y + rc.top, &rc,NULL,lpDstClipRect); break;
	case 2 :pDest->BlendBltFastAlpha(pSrc,x, y + rc.top, byFadeRate, &rc,NULL,lpDstClipRect); break;
	case 3 :pDest->BltNatural(pSrc,x, y + rc.top, &rc,NULL,lpDstClipRect); break;
	}

	// 次に表示されるべき部分は引き伸ばされる。
	if(rc.top < 0 || rc.bottom > sy)
		return 0;
	if(Direction){
		i = 0;
		j = rc.bottom = rc.top;
		j += y;
		rc.top--;
	}else{
		i = rc.bottom + y;
		rc.top = rc.bottom;
		rc.bottom++;
		j = dy - rc.top - y;
	}
	// 引き伸ばされるべき部分を縦に拡大する。FPS が怖いけどね。
	sz.cy = j;
	if(rc.top < 0)
		rc.top = 0;
	if(rc.bottom > sy)
		rc.bottom = sy;
	switch (nTransMode) {
	case 0 :pDest->BltFast(pSrc,x, i, &rc, &sz,lpDstClipRect); break;
	case 1 :pDest->Blt(pSrc,x, i, &rc, &sz,lpDstClipRect); break;
	case 2 :pDest->BlendBltFastAlpha(pSrc,x, i, byFadeRate, &rc, &sz,lpDstClipRect); break;
	case 3 :pDest->BltNatural(pSrc,x, i, &rc, &sz,lpDstClipRect); break;
	}

	return 0;
}

// 左右からのカーテン。
// @yo2 0x00552d20 review
LRESULT CPlaneTransBlt::BltTransHelper1(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
										int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,
										int WidthNum,LPRECT lpDstClipRect)
{
	CPlaneBase *lpDraw=pDest,*lpPlane=pSrc;	//	もうええやん＾＾；
	CheckNormal;

	const int ColumnNum = (sx + WidthNum + 1) / WidthNum;
	const int c = (nPhase * (ColumnNum + WidthNum)) / 256;
	int i, j;
	RECT rc;

	rc.top = 0;
	rc.bottom = sy;
	for(i = 0; i < ColumnNum && i < c; ++i){
		j = c - i;
		if(j > WidthNum)
			j = WidthNum;
		rc.left = i * WidthNum;
		if(Direction){
			rc.right = rc.left + j;
		}else{
			rc.right = sx - rc.left;
			rc.left = rc.right - j;
		}
		if(rc.right > sx)
			rc.right = sx - 1;
		if(rc.left < 0)
			rc.left = 0;
		switch (nTransMode) {
		case 0 :pDest->BltFast(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		case 1 :pDest->Blt(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		case 2 :pDest->BlendBltFastAlpha(pSrc,x + rc.left, y, byFadeRate, &rc,NULL,lpDstClipRect); break;
		case 3 :pDest->BltNatural(pSrc,x + rc.left, y, &rc,NULL,lpDstClipRect); break;
		}
	}

	return 0;
}
// 上下のカーテン。
// @yo2 0x00553040 review
LRESULT CPlaneTransBlt::BltTransHelper2(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
										int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,
										int WidthNum,LPRECT lpDstClipRect)
{
	CPlaneBase *lpDraw=pDest,*lpPlane=pSrc;	//	もうええやん＾＾；
	CheckNormal;

	const int ColumnNum = (sy + WidthNum + 1) / WidthNum;
	const int c = (nPhase * (ColumnNum + WidthNum)) / 256;
	int i, j;
	RECT rc;

	rc.left = 0;
	rc.right = sx;
	for(i = 0; i < ColumnNum && i < c; ++i){
		j = c - i;
		if(j > WidthNum)
			j = WidthNum;
		rc.top = i * WidthNum;
		if(Direction){
			rc.bottom = rc.top + j;
		}else{
			rc.bottom = sy - rc.top;
			rc.top = rc.bottom - j;
		}
		if(rc.bottom > sy)
			rc.bottom = sy - 1;
		if(rc.top < 0)
			rc.top = 0;
		switch (nTransMode) {
		case 0 :pDest->BltFast(pSrc, x, y + rc.top, &rc,NULL,lpDstClipRect); break;
		case 1 :pDest->Blt(pSrc, x, y + rc.top, &rc,NULL,lpDstClipRect); break;
		case 2 :pDest->BlendBltFastAlpha(pSrc, x, y + rc.top, byFadeRate, &rc,NULL,lpDstClipRect); break;
		case 3 :pDest->BltNatural(pSrc, x, y + rc.top, &rc,NULL,lpDstClipRect); break;
		}
	}

	return 0;
}

///////////////////////////////////////////////////////////////////////////////
//　テーブルの作成

auto_ptrEx<CSinTable>						CPlaneTransBlt::m_sin_table;
auto_ptrEx<CPlaneTransBlt::BltTransTable>	CPlaneTransBlt::m_blt_table;

// @yo2 0x005534a0 cg
void CPlaneTransBlt::MakeBltTable(){
	if (m_sin_table==NULL){
		m_sin_table.Add();
	}
	if (m_blt_table==NULL){
		m_blt_table.Add();
	}
}

// @yo2 0x005534e0 review
CPlaneTransBlt::BltTransTable::BltTransTable()
{
	::srand(NULL);	//	randomize（固定型）
	for(int i = 0; i < 256; i++){
		RandTable[i] = rand() & 255;
	}
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00553520 review
LRESULT CPlaneTransBlt::DiagonalDiffusionBlt(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
											 int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			BLTRECTOFFSET(px,py,4,2,(sr*m_blt_table->RandTable[(px+py)&0xff])>>8,(sr*m_blt_table->RandTable[(px+py+1)&0xff])>>8);
		}
	}

	return 0;
}

// @yo2 0x005539a0 review
LRESULT CPlaneTransBlt::DiffusionCongeriesBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			int ex,ey;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			int r;
			r = sqrt(ex*ex + ey*ey);
			if (r!=0) {
				ex = (ex<<8) / r;
				ey = (ey<<8) / r;
			}
			BLTRECTOFFSET(px,py,4,2,(sr*ex*m_blt_table->RandTable[(px+py*13)&0xff])>>16,(sr*ey*m_blt_table->RandTable[(px+py*19+1)&0xff])>>16);
		}
	}

	return 0;
}

// @yo2 0x00553ef0 review
LRESULT CPlaneTransBlt::DiffusionCongeriesBlt2(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=2){
			int ex,ey;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			int r;
			r = sqrt(ex*ex + ey*ey);
			if (r!=0) {
				ex = (ex<<8) / r;
				ey = (ey<<8) / r;
			}
			BLTRECTOFFSET(px,py,2,2,(sr*ex*m_blt_table->RandTable[(px+py*13)&0xff])>>16,(sr*ey*m_blt_table->RandTable[(px+py*19+1)&0xff])>>16);
		}
	}

	return 0;
}

// @yo2 0x00554440 review
LRESULT CPlaneTransBlt::DiffusionCongeriesBlt3(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int nP = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			int ex,ey;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			int r;
			r = sqrt(ex*ex + ey*ey);
			if (r!=0) {
				ex = (ex<<8) / r;
				ey = (ey<<8) / r;
			}
			BLTRECTOFFSET(px,py,4,2
				,((sr*ex*m_blt_table->RandTable[(px+py*13)&0xff]  )>>16)*m_sin_table->Cos(nP) >>16
				,((sr*ey*m_blt_table->RandTable[(px+py*19+1)&0xff])>>16)*m_sin_table->Sin(nP) >>16
			);
		}
	}

	return 0;
}

// @yo2 0x00554aa0 review
LRESULT CPlaneTransBlt::SquashBlt(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int nP = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			int ex,ey;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			int r;
			r = sqrt(ex*ex + ey*ey);
			if (r!=0) {
				ex = ((ex<<8)*m_sin_table->Sin(nP) >>16) / r;
				ey = ((ey<<8)*m_sin_table->Cos(nP) >>16) / r;
			}
			BLTRECTOFFSET(px,py,4,2,(sr*ex) >> 8,(sr*ey) >> 8);
		}
	}

	return 0;
}

// @yo2 0x00554f00 feat
LRESULT CPlaneTransBlt::ForwardRollBlt(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int nP = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=4){
			int ex,ey;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			ex *= m_sin_table->Cos(nP>>2);
			ey *= m_sin_table->Sin(nP);
			BLTRECTOFFSET(px,py,4,2,::MulDiv(sr,ex,1<<24),::MulDiv(sr,ey,1<<24));
		}
	}

	return 0;
}

// @yo2 0x005553b0 review
LRESULT CPlaneTransBlt::RotationBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
						  int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int ph = (256-nPhase) << 1;
	for(int py=0;py<sy;py+=2){
		for(int px=0;px<sx;px+=2){
			int ex,ey,ex2,ey2;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			ex2 = (ex * m_sin_table->Cos(ph)>>16)	- (ey * m_sin_table->Sin(ph)>>16);
			ey2 = (ex * m_sin_table->Sin(ph)>>16)	+ (ey * m_sin_table->Cos(ph)>>16);
			BLTRECTOFFSET(px,py,2,2,-ex + ex2,-ey + ey2);
		}
	}

	return 0;
}

// @yo2 0x005557e0 review
LRESULT CPlaneTransBlt::RotationBlt2(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					 int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int ph = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			int ex,ey,ex2,ey2;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			ex2 = (ex * m_sin_table->Cos(ph)>>16)	- (ey * m_sin_table->Sin(ph)>>16);
			ey2 = (ex * m_sin_table->Sin(ph)>>16)	+ (ey * m_sin_table->Cos(ph)>>16);
			BLTRECTOFFSET(px,py,4,4,-ex + ex2,-ey + ey2);
		}
	}

	return 0;
}

// @yo2 0x00555c10 review
LRESULT CPlaneTransBlt::RotationBlt3(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					 int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int ph = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=8){
		for(int px=0;px<sx;px+=8){
			int ex,ey,ex2,ey2;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			ex2 = (ex * m_sin_table->Cos(ph)>>16)	- (ey * m_sin_table->Sin(ph)>>16);
			ey2 = (ex * m_sin_table->Sin(ph)>>16)	+ (ey * m_sin_table->Cos(ph)>>16);
			BLTRECTOFFSET(px,py,8,8,-ex + ex2,-ey + ey2);
		}
	}

	return 0;
}

// @yo2 0x00556040 review
LRESULT CPlaneTransBlt::RotationBlt4(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					 int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int sm;	// max size
	sm = sx+sy;
	int sr;	// rest size
	sr = sm - ((sm * nPhase) >> 8);

	int ph = (256-nPhase)<<1;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			int ex,ey,ex2,ey2;	//	画像中心からピクセルの方向を示す単位ベクトル*256倍
			ex = px - sx/2;
			ey = py - sy/2;
			ex2 = (ex * m_sin_table->Cos(ph)>>16)	- (ey * m_sin_table->Sin(ph)>>16);
			ey2 = (ex * m_sin_table->Sin(ph)>>16)	+ (ey * m_sin_table->Cos(ph)>>16);
			int r;
			r = sqrt(ex*ex + ey*ey);
			if (r!=0) {
				ex = (ex<<8) / r;
				ey = (ey<<8) / r;
			}
			BLTRECTOFFSET(px,py,4,4
				,-ex + ex2 + (((sr*ex*m_blt_table->RandTable[(px+py*13)&0xff])>>16)	 *m_sin_table->Cos(ph)>>16)
				,-ey + ey2 + (((sr*ey*m_blt_table->RandTable[(px+py*19+1)&0xff])>>16)*m_sin_table->Sin(ph)>>16)
			);
		}
	}

	return 0;
}

// @yo2 0x00556700 review
LRESULT CPlaneTransBlt::EnterUpBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					 int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	for(int py=0;py<sy;py+=8){
		for(int px=0;px<sx;px+=8){
			int hy;
			hy = (nPhase + (m_blt_table->RandTable[((px>>3)+py*13)&255] >> 1))>>4;
			hy -= 8;
			if (hy>0) {
				if (hy>8) hy = 8;
				BLTRECTOFFSET(px,py,8,hy,0,8-hy);
			}
		}
	}

	return 0;
}

// @yo2 0x00556aa0 review
LRESULT CPlaneTransBlt::EnterUpBlt2(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	for(int py=0;py<sy;py+=16){
		for(int px=0;px<sx;px+=16){
			int hy;
			hy = (nPhase + (m_blt_table->RandTable[((px>>3)+py*13)&255] >> 1))>>3;
			hy -= 16;
			if (hy>0) {
				if (hy>16) hy = 16;
				BLTRECTOFFSET(px,py,16,hy,0,16-hy);
			}
		}
	}

	return 0;
}

// @yo2 0x00556e40 review
LRESULT CPlaneTransBlt::CellGatherBlt1(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int ph;
	ph = (nPhase >> 1) + 1;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			int oox,ooy;
			oox = m_blt_table->RandTable[((px>>2)+(py>>2)*13)&255] - 128;
			ooy = m_blt_table->RandTable[((px>>2)+(py>>2)*19)&255] - 128;
			oox = oox / ph;
			ooy = ooy / ph;
			BLTRECTOFFSET(px,py,4,4,oox,ooy);
		}
	}

	return 0;
}

// @yo2 0x00557220 review
LRESULT CPlaneTransBlt::CellGatherBlt2(CPlaneBase* lpDraw, CPlaneBase* lpPlane,
					   int x, int y, int nPhase, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect)
{
	CheckNormal;
	MakeBltTable();

	int ph;
	ph = 256-nPhase;
	for(int py=0;py<sy;py+=4){
		for(int px=0;px<sx;px+=4){
			int oox,ooy;
			oox = m_blt_table->RandTable[((px>>2)+(py>>2)*13)&255] - 128;
			ooy = m_blt_table->RandTable[((px>>2)+(py>>2)*19)&255];
			oox = oox * ph >> 11;
			ooy = ooy * ph >> 11;
			BLTRECTOFFSET(px,py,4,4,oox,ooy);
		}
	}

	return 0;
}

