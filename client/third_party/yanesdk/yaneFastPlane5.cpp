
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
#include "yaneSinTable.h"

// Sinテーブル
static const CSinTable gSinTable;

// 追加 START 02/02/17
//
//	以下は、CFastPlane::Bltのコピペ
//	^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// 呼び出す関数を CFastPlaneEffect::Blt → CFastPlaneEffect::Morph にし、引数を変更しただけ
// @yo2 0x004efe00 cg
LRESULT CFastPlane::MorphBlt(CFastPlane* lpSrc,LPPOINT lpSrcPoint, LPPOINT lpDstPoint,LPRECT lpClipRect, bool bContinual, int nPoints){
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {

		//	特別サポート！＾＾；
		//	αサーフェースからの転送
		//	αプレーンとの親和性
		//-------------------------
		//	修正 '02/05/09  by ENRA
		//	・α→非αからの転送の際は、functorにCFastPlaneCopyMulを使うようにした
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Morph(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Morph(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Morph(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Morph(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Morph(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Morph(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopyMul(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}
		
		//	おまけでサポート＾＾；
		//	αサーフェースへの転送

		//	RGB565 -> ARGB4565はサポート
		ef (nS2==3 && nS1==10){
			CFastPlaneRGB565 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Morph(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB565>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS2==4 && nS1==11){
		//	RGB555 -> ARGB4555はサポート
			CFastPlaneRGB555 rgb;
			rgb.SetRGB(lpSrc->GetColorKey());
			CFastPlaneEffect::Morph(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB555>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		}ef(nS1==12){
			switch (nS2){
			case 5: {
				CFastPlaneRGB888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 6: {
				CFastPlaneBGR888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 7: {
				CFastPlaneXRGB8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 8: {
				CFastPlaneXBGR8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
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
				CFastPlaneEffect::Morph(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 6: {
				CFastPlaneBGR888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 7: {
				CFastPlaneXRGB8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 8: {
				CFastPlaneXBGR8888 rgb;
				rgb.SetRGB(lpSrc->GetColorKey());
				CFastPlaneEffect::Morph(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
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
		CFastPlaneEffect::Morph(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB565>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 4: {
		CFastPlaneRGB555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB555>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 5:	{
		CFastPlaneRGB888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneRGB888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 6: {
		CFastPlaneBGR888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneBGR888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 7: {
		CFastPlaneXRGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneXRGB8888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 8: {
		CFastPlaneXBGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneXBGR8888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 10: {
		CFastPlaneARGB4565 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB4565>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 11: {
		CFastPlaneARGB4555 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB4555>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 12: {
		CFastPlaneARGB8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneARGB8888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 13: {
		CFastPlaneABGR8888 rgb;
		rgb.SetRGB(lpSrc->GetColorKey());
		CFastPlaneEffect::Morph(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrcColorKey<CFastPlaneABGR8888>(rgb),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}
// 追加 E N D 02/02/17
// @yo2 0x004f1c20 cg
LRESULT CFastPlane::MorphBltFast(CFastPlane* lpSrc,LPPOINT lpSrcPoint, LPPOINT lpDstPoint,LPRECT lpClipRect, bool bContinual, int nPoints){
	if (Lock()!=0) return 1;
	if (lpSrc->Lock()!=0) { Unlock(); return 1; }

	int nS1 = GetSurfaceType();
	int nS2 = lpSrc->GetSurfaceType();

	//	異なるサーフェース間の転送は基本的にサポートしない！
	if (nS1!=nS2) {

		//	特別サポート！＾＾；
		//	αサーフェースからの転送
		//	αプレーンとの親和性
		//-------------------------
		if (nS1==3 && nS2==10) {
			CFastPlaneEffect::Morph(
				CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==4 && nS2==11) {
			CFastPlaneEffect::Morph(
				CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==5 && nS2==12){
			CFastPlaneEffect::Morph(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneRGB888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==6 && nS2==13){
			CFastPlaneEffect::Morph(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneBGR888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==7 && nS2==12){
			CFastPlaneEffect::Morph(
				CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXRGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS1==8 && nS2==13){
			CFastPlaneEffect::Morph(
				CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneXBGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}
		
		//	おまけでサポート＾＾；
		//	αサーフェースへの転送

		//	RGB565 -> ARGB4565はサポート
		ef (nS2==3 && nS1==10){
			CFastPlaneEffect::Morph(
				CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4565(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		}ef(nS2==4 && nS1==11){
		//	RGB555 -> ARGB4555はサポート
			CFastPlaneEffect::Morph(
				CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB4555(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
		//	RGB888/BGR888/XRGB8888/ARGB8888 -> ARGB8888はサポート
		}ef(nS1==12){
			switch (nS2){
			case 5: {
				CFastPlaneEffect::Morph(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 6: {
				CFastPlaneEffect::Morph(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 7: {
				CFastPlaneEffect::Morph(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 8: {
				CFastPlaneEffect::Morph(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneARGB8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
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
				CFastPlaneEffect::Morph(
				CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 6: {
				CFastPlaneEffect::Morph(
				CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 7: {
				CFastPlaneEffect::Morph(
				CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
					}
			case 8: {
				CFastPlaneEffect::Morph(
				CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
				CFastPlaneABGR8888(),GetPlaneInfo(),
				CFastPlaneCopySrc(),
				lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
				break;
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
		CFastPlaneEffect::Morph(
			CFastPlaneRGB565(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 4: {
		CFastPlaneEffect::Morph(
			CFastPlaneRGB555(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 5:	{
		CFastPlaneEffect::Morph(
			CFastPlaneRGB888(),lpSrc->GetPlaneInfo(),
			CFastPlaneRGB888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 6: {
		CFastPlaneEffect::Morph(
			CFastPlaneBGR888(),lpSrc->GetPlaneInfo(),
			CFastPlaneBGR888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
		}
	case 7: {
		CFastPlaneEffect::Morph(
			CFastPlaneXRGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXRGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 8: {
		CFastPlaneEffect::Morph(
			CFastPlaneXBGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneXBGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 10: {
		CFastPlaneEffect::Morph(
			CFastPlaneARGB4565(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 11: {
		CFastPlaneEffect::Morph(
			CFastPlaneARGB4555(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 12: {
		CFastPlaneEffect::Morph(
			CFastPlaneARGB8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	case 13: {
		CFastPlaneEffect::Morph(
			CFastPlaneABGR8888(),lpSrc->GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),
			lpSrcPoint,lpDstPoint,lpClipRect,bContinual,nPoints);
			break;
			}
	}

	lpSrc->Unlock();
	Unlock();

	return 0;
}

// @yo2 0x004f25f0 feat
LRESULT CFastPlane::RotateBlt(CFastPlane* lpSrc, int x,int y, int nAngle,int nRate,int nType, LPRECT lpSrcRect, LPRECT lpClipDstRect)
{
	int sx,sy;	//	転送元サイズ
	if (lpSrcRect==NULL) {
		lpSrcRect = lpSrc->GetPlaneInfo()->GetRect();
		lpSrc->GetSize(sx,sy);
	} else {
		sx = lpSrcRect->right  - lpSrcRect->left;
		sy = lpSrcRect->bottom - lpSrcRect->top;
	}

	// for zero devide exception
	if(nRate==0) return 0;
	int dx,dy;	//	転送先サイズ
	dx = ::MulDiv(sx,nRate,1<<16);
	dy = ::MulDiv(sy,nRate,1<<16);
	// dx==0 or dx==0 だと Morphできない
	if(dx==0||dy==0) return 0;

	int px,py;	//	回転中心
	switch (nType){
	case 0: px = x;			py = y;			break;	//	左上
	case 1: px = x+dx;		py = y;			break;	//	右上
	case 2: px = x;			py = y+dy;		break;	//	左下
	case 3: px = x+dx;		py = y+dy;		break;	//	右上
	case 4: px = x+(dx>>1);	py = y+(dy>>1);	break;	//	画像中心
	}
//	px+=x; py+=y;

	POINT aSrcPoint[4];
	aSrcPoint[0].x = lpSrcRect->left;
	aSrcPoint[0].y = lpSrcRect->top;
	aSrcPoint[1].x = lpSrcRect->right - 1;
	aSrcPoint[1].y = lpSrcRect->top;
	aSrcPoint[2].x = lpSrcRect->right - 1;
	aSrcPoint[2].y = lpSrcRect->bottom - 1;
	aSrcPoint[3].x = lpSrcRect->left;
	aSrcPoint[3].y = lpSrcRect->bottom - 1;

	POINT aDstPoint[4];
	const LONG nSin = gSinTable.Sin(nAngle);
	const LONG nCos = gSinTable.Cos(nAngle);
//	nAngle = -nAngle;	//	y軸は下にとるので回転方向は逆になる
//	for(int i=0;i<4;i++){
		//	(px,py)中心の回転なので、(px,py)を原点に平行移動させて、
		//	原点中心に回転させたあと、(px,py)だけ平行移動
//	aDstPoint[0].x = x;		aDstPoint[0].y = y;
//	aDstPoint[1].x = x+dx;	aDstPoint[1].y = y;
//	aDstPoint[2].x = x+dx;	aDstPoint[2].y = y+dy;
//	aDstPoint[3].x = x;		aDstPoint[3].y = y+dy;
	{
		const int ax0 = x - px;
		const int ay0 = y - py;
		aDstPoint[0].x = ((ax0 * nCos - ay0 * nSin)>>16)+px;
		aDstPoint[0].y = ((ax0 * nSin + ay0 * nCos)>>16)+py;
		const int ax1 = x+dx - px;
		const int ay1 = y - py;
		aDstPoint[1].x = ((ax1 * nCos - ay1 * nSin)>>16)+px;
		aDstPoint[1].y = ((ax1 * nSin + ay1 * nCos)>>16)+py;
		const int ax2 = x+dx - px;
		const int ay2 = y+dy - py;
		aDstPoint[2].x = ((ax2 * nCos - ay2 * nSin)>>16)+px;
		aDstPoint[2].y = ((ax2 * nSin + ay2 * nCos)>>16)+py;
		const int ax3 = x - px;
		const int ay3 = y+dy - py;
		aDstPoint[3].x = ((ax3 * nCos - ay3 * nSin)>>16)+px;
		aDstPoint[3].y = ((ax3 * nSin + ay3 * nCos)>>16)+py;
	}
//	}

	return MorphBlt(lpSrc, aSrcPoint, aDstPoint, lpClipDstRect, false, 4);
}

// @yo2 0x004f2900 feat
LRESULT CFastPlane::RotateBltFast(CFastPlane* lpSrc, int x,int y, int nAngle,int nRate,int nType, LPRECT lpSrcRect, LPRECT lpClipDstRect)
{
	int sx,sy;	//	転送元サイズ
	if (lpSrcRect==NULL) {
		lpSrcRect = lpSrc->GetPlaneInfo()->GetRect();
		lpSrc->GetSize(sx,sy);
	} else {
		sx = lpSrcRect->right  - lpSrcRect->left;
		sy = lpSrcRect->bottom - lpSrcRect->top;
	}

	// for zero devide exception
	if(nRate==0) return 0;
	int dx,dy;	//	転送先サイズ
	dx = ::MulDiv(sx,nRate,1<<16);
	dy = ::MulDiv(sy,nRate,1<<16);
	// dx==0 or dx==0 だと Morphできない
	if(dx==0||dy==0) return 0;

	int px,py;	//	回転中心
	switch (nType){
	case 0: px = x;			py = y;			break;	//	左上
	case 1: px = x+dx;		py = y;			break;	//	右上
	case 2: px = x;			py = y+dy;		break;	//	左下
	case 3: px = x+dx;		py = y+dy;		break;	//	右上
	case 4: px = x+(dx>>1);	py = y+(dy>>1);	break;	//	画像中心
	}
//	px+=x; py+=y;

	POINT aSrcPoint[4];
	aSrcPoint[0].x = lpSrcRect->left;
	aSrcPoint[0].y = lpSrcRect->top;
	aSrcPoint[1].x = lpSrcRect->right - 1;
	aSrcPoint[1].y = lpSrcRect->top;
	aSrcPoint[2].x = lpSrcRect->right - 1;
	aSrcPoint[2].y = lpSrcRect->bottom - 1;
	aSrcPoint[3].x = lpSrcRect->left;
	aSrcPoint[3].y = lpSrcRect->bottom - 1;

	POINT aDstPoint[4];
	const LONG nSin = gSinTable.Sin(nAngle);
	const LONG nCos = gSinTable.Cos(nAngle);
//	nAngle = -nAngle;	//	y軸は下にとるので回転方向は逆になる
//	for(int i=0;i<4;i++){
		//	(px,py)中心の回転なので、(px,py)を原点に平行移動させて、
		//	原点中心に回転させたあと、(px,py)だけ平行移動
//	aDstPoint[0].x = x;		aDstPoint[0].y = y;
//	aDstPoint[1].x = x+dx;	aDstPoint[1].y = y;
//	aDstPoint[2].x = x+dx;	aDstPoint[2].y = y+dy;
//	aDstPoint[3].x = x;		aDstPoint[3].y = y+dy;
	{
		const int ax0 = x - px;
		const int ay0 = y - py;
		aDstPoint[0].x = ((ax0 * nCos - ay0 * nSin)>>16)+px;
		aDstPoint[0].y = ((ax0 * nSin + ay0 * nCos)>>16)+py;
		const int ax1 = x+dx - px;
		const int ay1 = y - py;
		aDstPoint[1].x = ((ax1 * nCos - ay1 * nSin)>>16)+px;
		aDstPoint[1].y = ((ax1 * nSin + ay1 * nCos)>>16)+py;
		const int ax2 = x+dx - px;
		const int ay2 = y+dy - py;
		aDstPoint[2].x = ((ax2 * nCos - ay2 * nSin)>>16)+px;
		aDstPoint[2].y = ((ax2 * nSin + ay2 * nCos)>>16)+py;
		const int ax3 = x - px;
		const int ay3 = y+dy - py;
		aDstPoint[3].x = ((ax3 * nCos - ay3 * nSin)>>16)+px;
		aDstPoint[3].y = ((ax3 * nSin + ay3 * nCos)>>16)+py;
	}
//	}

	return MorphBltFast(lpSrc, aSrcPoint, aDstPoint, lpClipDstRect, false, 4);
}

#endif // USE_DirectDraw
