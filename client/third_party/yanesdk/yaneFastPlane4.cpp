
#include "stdafx.h"

#ifdef USE_FastDraw

#include "yaneFastPlane.h"
#include "yaneWindow.h"
#include "yaneDirectDraw.h"
#include "yaneGraphicLoader.h"
#include "yaneDIBitmap.h"
#include "yaneDIB32.h"
#include "yaneAppManager.h"
#include "yaneAppInitializer.h"
#include "yaneGTL.h"

////////////////////////////////////////////////////////////////////////////
//
//	CFastPlaneの目玉、加色／減色合成系
//		α付きサーフェースからの転送もサポートしているので、
//		ここのをコピペすると良い＾＾；
////////////////////////////////////////////////////////////////////////////

// @yo2 0x004af290 vt
LRESULT CFastPlane::AddColorFast(COLORREF clAddRGB,LPRECT lpRect){
	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
		//	Alpha surfaceのサポートいるんか？＾＾；
	case 3: {
		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),
			CFastPlaneConstAdd<CFastPlaneRGB565>(clAddRGB),
			CFastPlaneConstAdd<CFastPlaneRGB565565>(clAddRGB),
			lpRect); } break;
	case 4: {
		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),
			CFastPlaneConstAdd<CFastPlaneRGB555>(clAddRGB),
			CFastPlaneConstAdd<CFastPlaneRGB555555>(clAddRGB),
			lpRect); } break;
	case 5: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneConstAdd<CFastPlaneRGB888>(clAddRGB),
			lpRect); } break;
	case 6: {
		CFastPlaneEffect::Effect(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneConstAdd<CFastPlaneBGR888>(clAddRGB),
			lpRect); } break;
	case 7: {
		CFastPlaneEffect::Effect(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneConstAdd<CFastPlaneXRGB8888>(clAddRGB),
			lpRect); } break;
	case 8: {
		CFastPlaneEffect::Effect(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneConstAdd<CFastPlaneXBGR8888>(clAddRGB),
			lpRect); } break;
	}

	Unlock();
	return 0;
}

// @yo2 0x004afa10 vt
LRESULT CFastPlane::SubColorFast(COLORREF clSubRGB,LPRECT lpRect){
	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
	case 3: {
		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),
			CFastPlaneConstSub<CFastPlaneRGB565>(clSubRGB),
			CFastPlaneConstSub<CFastPlaneRGB565565>(clSubRGB),
			lpRect); } break;
	case 4: {
		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),
			CFastPlaneConstSub<CFastPlaneRGB555>(clSubRGB),
			CFastPlaneConstSub<CFastPlaneRGB555555>(clSubRGB),
			lpRect); } break;
	case 5: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneConstSub<CFastPlaneRGB888>(clSubRGB),
			lpRect); } break;
	case 6: {
		CFastPlaneEffect::Effect(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneConstSub<CFastPlaneBGR888>(clSubRGB),
			lpRect); } break;
	case 7: {
		CFastPlaneEffect::Effect(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneConstSub<CFastPlaneXRGB8888>(clSubRGB),
			lpRect); } break;
	case 8: {
		CFastPlaneEffect::Effect(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneConstSub<CFastPlaneXBGR8888>(clSubRGB),
			lpRect); } break;
	}

	Unlock();
	return 0;
}

// @yo2 0x004aff90 vt
LRESULT CFastPlane::AddColorBltFast(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyAdd(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),	//	倍サイズのfunctor
			CFastPlaneRGB565565(),
			CFastPlaneCopyAdd(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),	//	倍サイズのfunctor
			CFastPlaneRGB555555(),
			CFastPlaneCopyAdd(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAdd(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b0ea0 vt
LRESULT CFastPlane::AddColorBlt(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneARGB4565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB4565>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB4555>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyAddSrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneRGB565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneRGB565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneRGB555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneRGB888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneBGR888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneXRGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneXBGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB4565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB4555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneARGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddSrcColorKey<CFastPlaneABGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b2290 vt
LRESULT CFastPlane::AddColorAlphaBltFast(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (alpha==255){
		return AddColorBltFast(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),	//	倍サイズのfunctor
			CFastPlaneRGB565565(),
			CFastPlaneCopyAddMulConst(alpha),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),	//	倍サイズのfunctor
			CFastPlaneRGB555555(),
			CFastPlaneCopyAddMulConst(alpha),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b35c0 vt
LRESULT CFastPlane::SubColorBltFast(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySub(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),
			CFastPlaneRGB565565(),
			CFastPlaneCopySub(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),
			CFastPlaneRGB555555(),
			CFastPlaneCopySub(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySub(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b44e0 vt
LRESULT CFastPlane::SubColorBlt(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneARGB4565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneARGB4565>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneARGB4555>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySubSrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneRGB565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneRGB565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneRGB555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneRGB888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneBGR888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneXRGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneXBGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneARGB4565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneARGB4555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneARGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubSrcColorKey<CFastPlaneABGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b58d0 vt
LRESULT CFastPlane::SubColorAlphaBltFast(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (alpha==255){
		return SubColorBltFast(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConst(alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),
			CFastPlaneRGB565565(),
			CFastPlaneCopySubMulConst(alpha),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneRGB555555(),
			CFastPlaneRGB555555(),
			CFastPlaneCopySubMulConst(alpha),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConst(alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}


// @yo2 0x004b6c00 vt
LRESULT CFastPlane::AddColorAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (alpha==255){
		return AddColorBlt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneARGB4565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB4565>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB4555>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneRGB565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneRGB565>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneRGB555>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneRGB888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneBGR888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneXRGB8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneXBGR8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB4565>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB4555>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyAddMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004b8130 vt
LRESULT CFastPlane::SubColorAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE alpha,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect) {
	if (alpha==255){
		return SubColorBlt(lpSrc,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneARGB4565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB4565>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB4555>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		} else {
			//	not supported
			lpSrc->Unlock();
			Unlock();		
			return 2;
		}
		lpSrc->Unlock();
		Unlock();		
		return 0;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneRGB565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneRGB565>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneRGB555>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneRGB888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneBGR888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneXRGB8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneXBGR8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB4565>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB4555>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneARGB8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySubMulConstSrcColorKey<CFastPlaneABGR8888>(rgb,alpha),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}


//	ブライトネスを下げる(nFadeRateが255 == 100%)
// @yo2 0x004b9660 cg
LRESULT		CFastPlane::FadeEffect(BYTE nFadeRate,LPRECT lpRect){
	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
	case 3: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 4: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 5: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 6: {
		CFastPlaneEffect::Effect(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 7: {
		CFastPlaneEffect::Effect(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 8: {
		CFastPlaneEffect::Effect(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 10: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 11: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 12: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	case 13: {
		CFastPlaneEffect::Effect(
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneConstMul(nFadeRate),
			lpRect); } break;
	}

	Unlock();
	return 0;
}

#endif