// yaneDIB32Effect.cpp
// kaine
// 2001/3/7

#include "stdafx.h"

#ifdef USE_DIB32			//	CDIB32,CDIBDrawを使うか
#include "yaneDIB32Effect.h"

// @yo2 0x00448b70 feat
LRESULT CDIB32Effect::Clipping( CDIB32*lpDstDIB,CDIB32*lpSrcDIB,
				 int x,int y, CDIB32EffectClipper* lpClipper,
				 LPRECT lpSrcRect,
				 LPSIZE lpDstSize,
				 LPRECT lpClipRect){
	int		nSsizeX, nSsizeY, nDsizeX, nDsizeY;
	RECT rcSrcRect,rcDstRect,rcClipRect;
	int		nInitialX;	//	-DX　 :　εの初期値 = -DX
	int		nStepX;		//	 2*SX :　ε+=2*SX
	int		nCmpX;		//	 2*DX :　ε>0ならばε-=2*DXしてね
	int		nStepsX;	//	 SrcXの一回の加算量(整数部)
	int		nInitialY;
	int		nStepY;
	int		nCmpY;
	int		nStepsY;

	if (lpSrcRect==NULL) {
		rcSrcRect = *(lpSrcDIB->GetRect());
	} else {
		rcSrcRect = *lpSrcRect;
	}
	nSsizeX = rcSrcRect.right - rcSrcRect.left;
	nSsizeY = rcSrcRect.bottom - rcSrcRect.top;

	if (lpDstSize==NULL) {
		//	lpDstSize == NULLのときは、
		//	Srcからの等倍の転送
		::SetRect(&rcDstRect,x,y,x+nSsizeX,y+nSsizeY);
//		rcDstRect = *(lpDstDIB->GetRect());
	} else {
		::SetRect(&rcDstRect,x,y,x+lpDstSize->cx,y+lpDstSize->cy);
	}
	nDsizeX = rcDstRect.right - rcDstRect.left;
	nDsizeY = rcDstRect.bottom - rcDstRect.top;

	//	クリップ領域
	if (lpClipRect == NULL){
		int sx,sy;
		lpDstDIB->GetSize(sx,sy);
		::SetRect(&rcClipRect,0,0,sx,sy);		// fix
	} else {
		rcClipRect = *lpClipRect;
	}
	LPRECT lpClip = &rcClipRect;
	
	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		LPRECT lpDstRect2 = lpDstDIB->GetRect();
		int t;
		//--- 修正 '02/04/08  by ENRA ---
		// 勝手に０にしたらあかんかった^^;;
		t = lpClip->left  - lpDstRect2->left;
		if (t<0)	{ lpClip->left  = lpDstRect2->left; }
		t = lpClip->top - lpDstRect2->top;
		if (t<0)	{ lpClip->top = lpDstRect2->top; }
		//-------------------------------
		t = lpClip->right  - lpDstRect2->right;
		if (t>0)	{ lpClip->right  = lpDstRect2->right; }
		t = lpClip->bottom - lpDstRect2->bottom;
		if (t>0)	{ lpClip->bottom = lpDstRect2->bottom; }
	}
	//-------------------------------

	if ( (nSsizeX == nDsizeX) && (nSsizeY == nDsizeY)){
		lpClipper->bActualSize = true;
		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)
		int sx = rcSrcRect.right - rcSrcRect.left;
		int sy = rcSrcRect.bottom - rcSrcRect.top;
		::SetRect(&rcDstRect,x,y,x+sx,y+sy);

		int t;
		t = lpClip->left-x;
		if (t>0)	{ rcSrcRect.left += t;	rcDstRect.left = lpClip->left; }
		t = lpClip->top -y;
		if (t>0)	{ rcSrcRect.top	 += t;	rcDstRect.top	 = lpClip->top;	 }
		t = x+sx-lpClip->right;
		if (t>0)	{ rcSrcRect.right -= t;	rcDstRect.right = lpClip->right; }
		t = y+sy-lpClip->bottom;
		if (t>0)	{ rcSrcRect.bottom -= t;	rcDstRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (rcSrcRect.left >= rcSrcRect.right ||
			rcSrcRect.top	 >= rcSrcRect.bottom) return 1;

	}else{ 
		//	非等倍の転送？
		lpClipper->bActualSize = false;
		int dx = rcDstRect.right - rcDstRect.left;
		int dy = rcDstRect.bottom - rcDstRect.top;
		::SetRect(&rcDstRect,x,y,x+dx,y+dy);

		//	ブレゼンハムの初期値を計算する

		//	Initial(x,y) = -Dst size(x,y)
		nInitialX = rcDstRect.left - rcDstRect.right;
		nInitialY = rcDstRect.top  - rcDstRect.bottom;

		nStepX	= (rcSrcRect.right	- rcSrcRect.left) ;
		nStepY	= (rcSrcRect.bottom - rcSrcRect.top ) ;

		nCmpX = - (nInitialX);
		nCmpY = - (nInitialY);

		// invalid rect
		if (nCmpX == 0 || nCmpY == 0) return 1;

		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)

		//	ミラー時と非ミラー時でブレゼンハムの初期値が違う
		int t;
		t = lpClip->left-rcDstRect.left;
		if (t>0)	{
			nInitialX+=t*nStepX;	//	実際にブレゼンハムしてみる
			if (nInitialX > 0){
				int s = nInitialX / nCmpX + 1;
				rcSrcRect.left += s;	//	not mirror!
				nInitialX		-= s*nCmpX;
			}
			rcDstRect.left	 = lpClip->left;
		}
		t = lpClip->top -rcDstRect.top;
		if (t>0)	{
			nInitialY+=t*nStepY;	//	実際にブレゼンハムしてみる
			if (nInitialY > 0){
				int s = nInitialY / nCmpY +1;
				rcSrcRect.top += s;
				nInitialY		-= s*nCmpY;
			}
			rcDstRect.top = lpClip->top;
		}
		t = rcDstRect.right-lpClip->right;
		if (t>0)	{
			rcDstRect.right	 = lpClip->right;
		}
		//	srcRectの算出。dstのはみ出し分だけ控えるのだが、t*m_nStepX/m_nCmpをroundupする必要あり。

		t = rcDstRect.bottom-lpClip->bottom;
		if (t>0)	{ /*rcSrcRect.bottom -= t;*/
			rcDstRect.bottom = lpClip->bottom;}

		//	invalid rect ?
		if (rcSrcRect.left >= rcSrcRect.right ||
			rcSrcRect.top	 >= rcSrcRect.bottom ||
			rcDstRect.left >= rcDstRect.right ||
			rcDstRect.top	 >= rcDstRect.bottom) return 1;

		//	m_nStepX < m_nCmpXを保証する。
		nStepsX = nStepX/nCmpX;
		nStepX -= nCmpX*nStepsX;

		nStepsY = nStepY/nCmpY;
		nStepY -= nCmpY*nStepsY;

		// どこで１を引くのか分からないので、ここで引くのだ☆ By Tia
		nInitialX--;
		nInitialY--;

		lpClipper->nCmpX = nCmpX;
		lpClipper->nCmpY = nCmpY;
		lpClipper->nInitialX = nInitialX;
		lpClipper->nInitialY = nInitialY;
		lpClipper->nStepsX = nStepsX;
		lpClipper->nStepsY = nStepsY;
		lpClipper->nStepX = nStepX;
		lpClipper->nStepY = nStepY;
	}
	lpClipper->rcDstRect = rcDstRect;
	lpClipper->rcSrcRect = rcSrcRect;
	lpClipper->rcClipRect = rcClipRect;
/*
	WARNING ( rcSrcRect.left	< p->m_rcRect.left	|| m_rcSrcRect.top	   < p->m_rcRect.top
		||	  rcSrcRect.right > p->m_rcRect.right || m_rcSrcRect.bottom	 > p->m_rcRect.bottom,
		"CDIB32Effect::Clippingで転送元サーフェースの指定がサーフェースからはみ出している");
*/
	// clip end

	return 0;

}

#endif // USE_DIB32			//	CDIB32,CDIBDrawを使うか
