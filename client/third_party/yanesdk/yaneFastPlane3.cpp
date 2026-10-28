
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

//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
// @yo2 0x0047d270 vt
LRESULT CFastPlane::BlendBltFast(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送はサポートしない！
	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlpha(byFadeRate),
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
	case 3:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 4:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 5:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 6:
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 7:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 8:
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 10:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 11:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 12:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 13:
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	}
	//	CFastPlaneRGB565() というのは、テンポラリオブジェクトを生成するだけなのだが、
	//	これは最適化により削除される。結局メンバ関数テンプレートを実体化するための手段である。

	lpSrc->Unlock();
	Unlock();

	return 0;
}

//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
// @yo2 0x0047e290 vt
LRESULT CFastPlane::BlendBlt(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

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
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB4565>(rgb,byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB4555>(rgb,byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB8888>(rgb,byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneABGR8888>(rgb,byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB8888>(rgb,byFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneABGR8888>(rgb,byFadeRate),
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
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneRGB565>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneRGB555>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneRGB888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneBGR888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneXRGB8888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneXBGR8888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB4565>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB4555>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneARGB8888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKey<CFastPlaneABGR8888>(rgb,byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

//	―――αβ転送

//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
// @yo2 0x0047f6e0 vt
LRESULT CFastPlane::BlendBltFastAB(CFastPlane* lpSrc,int x,int y,BYTE bySrcFadeRate,BYTE byDstFadeRate
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送はサポートしない！
	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
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
	case 3:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 4:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 5:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 6:
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 7:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 8:
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 10:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 11:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 12:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 13:
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaAB(bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	}
	//	CFastPlaneRGB565() というのは、テンポラリオブジェクトを生成するだけなのだが、
	//	これは最適化により削除される。結局メンバ関数テンプレートを実体化するための手段である。

	lpSrc->Unlock();
	Unlock();

	return 0;
}

//	ブレンド転送、ブレンド比率固定系(CFastPlaneのみ特化されたルーチン有り)
// @yo2 0x00480b20 vt
LRESULT CFastPlane::BlendBltAB(CFastPlane* lpSrc,int x,int y,BYTE bySrcFadeRate,BYTE byDstFadeRate
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

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
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB4565>(rgb,bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB4555>(rgb,bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB8888>(rgb,bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneABGR8888>(rgb,bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB8888>(rgb,bySrcFadeRate,byDstFadeRate),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneABGR8888>(rgb,bySrcFadeRate,byDstFadeRate),
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
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneRGB565>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneRGB555>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneRGB888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneBGR888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneXRGB8888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneXBGR8888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB4565>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB4555>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneARGB8888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneBlendMulAlphaSrcColorKeyAB<CFastPlaneABGR8888>(rgb,bySrcFadeRate,byDstFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}


//	α付き画像転送系(ただしCDIB32,CFastPlaneでしか実装されておらず)
// @yo2 0x00482170 vt
LRESULT CFastPlane::BlendBltFastAlpha(CFastPlane* lpSrc,int x,int y
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	α付きサーフェースから、α無しサーフェースへの転送しかサポートしない！
	//	α無しから、α付きへは、Blt,BltFastでいいでしょ
	//	α付きサーフェースからα付きサーフェースへの転送もサポートしとこっかな．．
	if (((nS1==3 || nS1==10) && nS2==10) ||
		((nS1==4 || nS1==11) && nS2==11) ||
		((nS1==5 || nS1==7 || nS1==12)&&(nS2==12))||
		((nS1==6 || nS1==8 || nS1==13)&&(nS2==13))
		) {
		//	ok , surface with alpha to normal surface
	} else {
		lpSrc->Unlock();
		Unlock();
		return 2;
	}

	switch( nS1 ) {
	case 3: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMul(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}

	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaToAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaToAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaToAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlphaToAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x00482a10 vt
LRESULT CFastPlane::FadeAlphaBlt(CFastPlane* lpSrc,int x,int y,BYTE byFadeRate
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	α付きサーフェースから、α無しサーフェースへの転送しかサポートしない！
	if ((nS1==3 && nS2==10) ||
		(nS1==4 && nS2==11) ||
		((nS1==5 || nS1==7)&&(nS2==12))||
		((nS1==6 || nS1==8)&&(nS2==13))
		) {
	} else {
		lpSrc->Unlock();
		Unlock();
		return 2;
	}

	switch( nS1 ) {
	case 3:	{
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 4: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 8: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopyMulAlpha(byFadeRate),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}

	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

//	Mosaic（そのプレーンに対するエフェクト）
// @yo2 0x00483130 vt
LRESULT CFastPlane::MosaicEffect(int d, LPRECT lpRect){
	if (d==0) return 1;

	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
	case 3: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneRGB565(),GetPlaneInfo(),d,
			lpRect); } break;
	case 4: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneRGB555(),GetPlaneInfo(),d,
			lpRect); } break;
	case 5: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneRGB888(),GetPlaneInfo(),d,
			lpRect); } break;
	case 6: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneBGR888(),GetPlaneInfo(),d,
			lpRect); } break;
	case 7: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneXRGB8888(),GetPlaneInfo(),d,
			lpRect); } break;
	case 8: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneXBGR8888(),GetPlaneInfo(),d,
			lpRect); } break;

	case 10: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneARGB4565(),GetPlaneInfo(),d,
			lpRect); } break;
	case 11: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneARGB4555(),GetPlaneInfo(),d,
			lpRect); } break;
	case 12: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneARGB8888(),GetPlaneInfo(),d,
			lpRect); } break;
	case 13: {
		CFastPlaneEffect::EffectMosaic(
			CFastPlaneABGR8888(),GetPlaneInfo(),d,
			lpRect); } break;
	}

	Unlock();
	return 0;
}

//	Flush （そのプレーンに対するエフェクト）
// @yo2 0x004836f0 vt
LRESULT CFastPlane::FlushEffect(LPRECT lpRect){

	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
	case 3: {
		//	XRGB8888で２倍でやろうにも、Aが反転しない＾＾；
		CFastPlaneEffect::Effect(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 4: {
		//	555のflushを２倍でやるには、xorは0x7fff7fffでなければならない。
		CFastPlaneEffect::Effect(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 5: {
		CFastPlaneEffect::Effect(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 6: {
		CFastPlaneEffect::Effect(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 7: {
		CFastPlaneEffect::Effect(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 8: {
		CFastPlaneEffect::Effect(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;

	case 10: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 11: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 12: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	case 13: {
		CFastPlaneEffect::Effect(
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneFlush(),
			lpRect); } break;
	}

	Unlock();
	return 0;
}

// @yo2 0x00483b90 vt
LRESULT CFastPlane::BltToAlpha(CFastPlane* lpSrc,int nSrcMin,int nSrcMax,int nDstMin,int nDstMax,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	転送先がα付きでなければサポートしない！
	switch (nS1){
	case 10:
		if (nS2==3) {	// 10(ARGB4565) ← 3(RGB565)
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==10){
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		break;
	case 11:
		if (nS2==4) {
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==11){
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		break;
	case 12:
		if (nS2==7||nS2==12) {
			CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef (nS2==5){
			CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		break;
	case 13:
		if (nS2==8||nS2==13) {
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef (nS2==6) {
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneBltToAlpha(nSrcMin,nSrcMax,nDstMin,nDstMax),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		break;
	}

	lpSrc->Unlock();
	Unlock();

	return 0;

}

//	αサーフェース⇒αサーフェースへα値以外をコピーする
// @yo2 0x00484850 vt
LRESULT CFastPlane::BltFastWithoutAlpha(CFastPlane* lpSrc,int x,int y
	,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	同一αサーフェース間のα異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {
		lpSrc->Unlock();
		Unlock();		
		return 2;
	}

	switch (nS1){
	case 10: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopyWithoutAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break; }
	case 11: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopyWithoutAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break; }
	case 12: {
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopyWithoutAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break; }
	case 13: {
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopyWithoutAlpha(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break; }
	default:{	//	not support
		lpSrc->Unlock();
		Unlock();
		return 3;
		}
	}

	lpSrc->Unlock();
	Unlock();
	return 0;
}

//	α値を反転させる（αサーフェースに対してのみ有効）
// @yo2 0x00484d50 cg
LRESULT		CFastPlane::FlushAlpha(LPRECT lpRect){

	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch( nS1 ) {

	case 10: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneFlushAlpha(),
			lpRect); } break;
	case 11: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneFlushAlpha(),
			lpRect); } break;
	case 12: {
		CFastPlaneEffect::Effect(
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneFlushAlpha(),
			lpRect); } break;
	case 13: {
		CFastPlaneEffect::Effect(
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneFlushAlpha(),
			lpRect); } break;
	default:
		Unlock();
		return 2;	//	not supported!
	}

	Unlock();
	return 0;
}

// -------	任意のα値を持つマスクテーブルを使用した転送
// @yo2 0x00485070 vt
LRESULT		CFastPlane::BltMask16(CFastPlane*lpSrc,int x,int y,BYTE* abyAlphaTable,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect){
return 0;
}

// @yo2 0x00485090 vt
LRESULT CFastPlane::BltFastMask16(CFastPlane* lpSrc,int x,int y,BYTE* abyAlphaTable,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	if (nS1!=nS2) {
		if (nS2==10 && nS1==3){
			//	ARGB4565 ->565
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==11 && nS1==4){
			//	ARGB4555 ->555
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==12 && nS1==5){
			//	ARGB8888 ->888
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==13 && nS1==6){
			//	ABGR8888 ->888
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==12 && nS1==7){
			//	ARGB8888 ->8888
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==13 && nS1==8){
			//	ARGB8888 ->8888
			CFastPlaneEffect::BltSrcXY(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcMask16dmul(abyAlphaTable),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}else{
			lpSrc->Unlock();
			Unlock();
			return 1;	//	not supported
		}
		lpSrc->Unlock();
		Unlock();
		return 0;	//	not supported
	}
	switch (nS2){
	case 3: {
		//	RGB565 ->565
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	case 4: {
		//	RGB555 ->555
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	case 5: {
		//	RGB888 ->888
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	case 6: {
		//	BGR888 ->888
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	case 7: {
		//	XRGB888 ->888
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	case 8: {
		//	XBGR888 ->888
		CFastPlaneEffect::BltSrcXY(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrcMask16dmul(abyAlphaTable),
			x,y,lpSrcRect,lpDstSize,lpClipRect);
		break; }
	}

	lpSrc->Unlock();
	Unlock();
	return 0;
}


#endif // USE_DirectDraw
