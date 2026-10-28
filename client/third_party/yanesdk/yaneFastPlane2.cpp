
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

//////////////////////////////////////////////////////////////////////////////
//	プレーン間転送系の実装(functorによる実装)
//////////////////////////////////////////////////////////////////////////////
// @yo2 0x004577d0 cg
LRESULT CFastPlane::BltFast(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	if (Lock()!=0) return 1;
	if (lpSrc==NULL||lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	BltFastだけは、AutoRestoreで使用するため、
	//	ほぼすべての変換をサポート！

	switch (nS2){
	case 3:
		switch (nS1){
		//	RGB565 ->565
		case 3: {
			CFastPlaneEffect::BltDouble(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneXRGB8888(),	//	DWORD扱いする
				CFastPlaneXRGB8888(),	//	DWORD扱いする
				CFastPlaneCopySrc(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565->RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565->XRGB8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB565 -> ARGB4565はサポート
		case 10: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
		//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;
	case 4:
		switch (nS1){
		//	RGB555 -> 8bpp はサポート
		case 2: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneBytePal(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB555 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		case 4: {
			CFastPlaneEffect::BltDouble(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneXRGB8888(),	//	DWORD扱いする
				CFastPlaneXRGB8888(),	//	DWORD扱いする
				CFastPlaneCopySrc(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB555->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB555->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	RGB555->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB555->XRGB8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		case 11: {
		//	RGB555 -> ARGB4555はサポート
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;
	case 5:
		switch (nS1){
		//	RGB888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	RGB888->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888->XRGB8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;
	case 6:
		switch (nS1){
		//	BGR888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	BGR888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	BGR888->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	BGR888->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	BGR888->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	BGR888->XRGB8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	BGR -> ABGRサポート
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;
	case 7:
		switch (nS1){
		//	XRGB8888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XRGB8888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XRGB8888->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XRGB8888->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	XRGB8888->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XRGB8888->XRGB8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;
	case 8:
		switch (nS1){
		//	XBGR8888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XBGR8888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XBGR8888->RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XBGR8888->BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	XBGR8888->XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	XBGR8888->XBGR8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		//	BGR->ABGRサポート
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break;}
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;

	//	αサーフェース間の変換
	case 10:
		switch (nS1){
		//	ARGB4565 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> XBGR8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> ARGB4565
		case 10: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> ARGB4555
		case 11: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> ARGB8888
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4565 -> ABGR8888
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;

	case 11:
		switch (nS1){
		//	ARGB4555 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> XBGR8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> ARGB4565
		case 10: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> ARGB4555
		case 11: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> ARGB8888
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB4555 -> ABGR8888
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;

	case 12:
		switch (nS1){
		//	ARGB8888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> XBGR8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> ARGB4565
		case 10: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> ARGB4555
		case 11: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> ARGB8888
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ARGB8888 -> ABGR8888
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;

	case 13:
		switch (nS1){
		//	ABGR8888 -> RGB565
		case 3: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> RGB555
		case 4: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> RGB888
		case 5: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> BGR888
		case 6: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> XRGB8888
		case 7: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> XBGR8888
		case 8: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> ARGB4565
		case 10: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> ARGB4555
		case 11: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> ARGB8888
		case 12: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		//	ABGR8888 -> ABGR8888
		case 13: {
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
			break; }
		default:
			//	残念ながら非サポートでした＾＾；
			lpSrc->Unlock();
			Unlock();
			return 2;
		} break;

	//	このソースサーフェースタイプはなんやねん？
	default:
		//	残念ながら非サポートでした＾＾；
		lpSrc->Unlock();
		Unlock();
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x0045bd70 cg
LRESULT		CFastPlane::Clear(LPRECT lpRect){

/*
	if (nS1 < 10){
		//	DirectDrawSurfaceならば、DirectDrawの機能でクリアする
		//	（そのほうがDWORDアクセスされるので速い？）
		if (m_lpSurface==NULL) return -1;
		DDBLTFX fx = { sizeof(fx) };
		fx.dwFillColor = m_dwFillColor;
		return m_lpSurface->Blt(lpRect,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
  }
	//	メモリ上であるならば、自前でクリアしたほうが速いぞ＾＾；
	
*/

	if (Lock()!=0) return 1;
	int nS1 = GetSurfaceType();

	switch( nS1 ) {
		//	256色非対応。
		//	実際は、256色ならば、EffectQuadみたいなルーチンを使用すべき
	case 3: {
		CFastPlaneRGB565 rgb;
		rgb.SetRGB((WORD)m_dwFillColor);
		CFastPlaneXRGB8888 rgb2;
		rgb2.SetRGB(rgb.GetRGB_DWORD());

		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),	//	DWORD扱い
			CFastPlaneFillColor<CFastPlaneRGB565>(rgb),
			CFastPlaneFillColor<CFastPlaneXRGB8888>(rgb2),
			lpRect); } break;
	case 4: {
		CFastPlaneRGB555 rgb;
		CFastPlaneXRGB8888 rgb2;
		rgb.SetRGB((WORD)m_dwFillColor);
		rgb2.SetRGB(rgb.GetRGB_DWORD());
		CFastPlaneEffect::EffectDouble(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),	//	DWORD扱い
			CFastPlaneFillColor<CFastPlaneRGB555>(rgb),
			CFastPlaneFillColor<CFastPlaneXRGB8888>(rgb2),
			lpRect); } break;
	case 5: {
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(m_dwFillColor);
		CFastPlaneEffect::Effect(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneRGB888>(rgb),
			lpRect); } break;
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(m_dwFillColor);
		CFastPlaneEffect::Effect(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneBGR888>(rgb),
			lpRect); } break;
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(m_dwFillColor);
		CFastPlaneEffect::Effect(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneXRGB8888>(rgb),
			lpRect); } break;
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(m_dwFillColor);
		CFastPlaneEffect::Effect(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneXBGR8888>(rgb),
			lpRect); } break;

	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(m_dwFillColor);
		rgb.SetA(0);
		//	これで消しておかないとクリアしていることにならない..
		//	だから、これでは仕様が異なるのかも知れないが．．
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneARGB4565>(rgb),
			lpRect); } break;
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(m_dwFillColor);
		rgb.SetA(0);
		CFastPlaneEffect::Effect(
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneARGB4555>(rgb),
			lpRect); } break;
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(m_dwFillColor);
		rgb.SetA(0);
		CFastPlaneEffect::Effect(
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneARGB8888>(rgb),
			lpRect); } break;
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(m_dwFillColor);
		rgb.SetA(0);
		CFastPlaneEffect::Effect(
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneFillColor<CFastPlaneABGR8888>(rgb),
			lpRect); } break;
	}

	Unlock();
	return 0;
}

//
//	以下は、上のソースのコピペ
//	^^^^^^^^^^^^^^^^^^^^^^^^^^

// @yo2 0x0045c540 review
LRESULT CFastPlane::Blt(CFastPlane* lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }	

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {

		//	特別サポート！＾＾；
		//	αサーフェースからの転送
		//	αプレーンとの親和性
		if (nS1==3 && nS2==10) {
			CFastPlaneARGB4565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneARGB4565>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneARGB4555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneARGB4555>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==5 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==6 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==7 && nS2==12){
			CFastPlaneARGB8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneARGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS1==8 && nS2==13){
			CFastPlaneABGR8888 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneABGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}
		
		//	おまけでサポート＾＾；
		//	αサーフェースへの転送

		//	RGB565 -> ARGB4565はサポート
		ef (nS2==3 && nS1==10){
			CFastPlaneRGB565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB565>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		}ef(nS2==4 && nS1==11){
		//	RGB555 -> ARGB4555はサポート
			CFastPlaneRGB555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Blt(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB555>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect);
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		}ef(nS1==12){
			switch (nS2){
			case 5: {
				CFastPlaneRGB888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 6: {
				CFastPlaneBGR888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 7: {
				CFastPlaneXRGB8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 8: {
				CFastPlaneXBGR8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			default:
				//	残念ながら非サポートでした＾＾；
				lpSrc->Unlock();
				Unlock();
				return 2;
			}
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ABGR8888はサポート
		}ef(nS1==13){
			switch (nS2){
			case 5: {
				CFastPlaneRGB888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 6: {
				CFastPlaneBGR888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 7: {
				CFastPlaneXRGB8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			case 8: {
				CFastPlaneXBGR8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Blt(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
				x,y,lpSrcRect,lpDstSize,lpClipRect); break;
					}
			default:
				//	残念ながら非サポートでした＾＾；
				lpSrc->Unlock();
				Unlock();
				return 2;
			}
		} else {
			//	残念ながら非サポートでした＾＾；
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
			CFastPlaneCopySrcColorKey<CFastPlaneRGB565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
/*
		CFastPlaneRGB565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneRGB565565 rgb2;
		rgb2.SetRGBWORD(lpSrc->GetColorKey());
		CFastPlaneEffect::BltDouble(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneRGB565565(),
			CFastPlaneRGB565565(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB565>(rgb),
			CFastPlaneCopySrcColorKeyDouble<CFastPlaneRGB565565>(rgb2),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
*/
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB4565>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB4555>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneABGR8888>(rgb),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

//	CDIB32　⇔　CFastPlaneへの変換もサポートする
// @yo2 0x0045e5e0 review
LRESULT		CFastPlane::Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (!lpSrc->GetPlaneInfo()->IsInit()) return 1;
	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
	switch (nS1) {
	//	転送先がα無しなので、転送元であるDIBをα無しサーフェースと仮定して変換コピー
	case 3:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 4:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 5:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 6:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 7:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 8:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;

		//	転送先がα付きなので、転送元であるDIBをα付きサーフェースと仮定して変換コピー
	case 10:
		if (lpSrc->IsYGA()){
			CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		} else {
			CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 11:
		if (lpSrc->IsYGA()){
			CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		} else {
			CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 12:
		if (lpSrc->IsYGA()){
			CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		} else {
			CFastPlaneEffect::Blt(	//	まんまコピっとけ！
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	case 13:
		if (lpSrc->IsYGA()){
			CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		} else {
			CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
		}
	}
	Unlock();

	return 0;
}

// @yo2 0x0045f260 cg
LRESULT		CFastPlane::BltTo(CDIB32*lpDst,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	if (Lock()!=0) return 1;

	if (!lpDst->GetPlaneInfo()->IsInit()) { Unlock(); return 1;}

	int nS1 = GetSurfaceType();
	switch (nS1) {
	//	転送先がα無しなので、転送元であるDIBをα無しサーフェースと仮定して変換コピー
	case 3:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 4:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 5:
		CFastPlaneEffect::Blt(
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 6:
		CFastPlaneEffect::Blt(
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 7:
		CFastPlaneEffect::Blt(
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 8:
		CFastPlaneEffect::Blt(
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneXRGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;

	//	転送先がα付きなので、転送元であるDIBをα付きサーフェースと仮定して変換コピー
	case 10:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneARGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 11:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneARGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 12:
		CFastPlaneEffect::Blt(	//	まんまコピっとけ！
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneARGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	case 13:
		CFastPlaneEffect::Blt(
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneARGB8888(),lpDst->GetPlaneInfo(),
			CFastPlaneCopySrc(),
			x,y,lpSrcRect,lpDstSize,lpClipRect); break;
	}
	Unlock();

	return 0;
}


#endif // USE_DirectDraw
