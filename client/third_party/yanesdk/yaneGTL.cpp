#include "stdafx.h"
#include "yaneGTL.h"

BYTE	CFastPlaneBlendTable::abyMulTable[256*256];
BYTE	CFastPlaneBlendTable::abyMulTable2[256*256];
#ifdef _USE_SIGNED_TABLE
BYTE	CFastPlaneBlendTable::abySignedMulTable[2*256*256];
#endif
WORD	CFastPlaneBlendTable::awdMulTableRGB565[65536*16];
WORD	CFastPlaneBlendTable::awdMulTableRGB555[65536*16];
/*
WORD	CFastPlaneBlendTable::awdAddTableRGB565[65536*8];
WORD	CFastPlaneBlendTable::awdAddTableRGB555[65536*8];
WORD	CFastPlaneBlendTable::awdSubTableRGB565[65536*8];
WORD	CFastPlaneBlendTable::awdSubTableRGB555[65536*8];
*/
BYTE	CFastPlaneBlendTable::abyConvertTable555[32768];
	//	これで遅ければ、32bppに対しても、こういうのを用意するが．．．

// @yo2 0x00532ba0 cg
void	CFastPlaneBlendTable::InitTable()
	{
		{
			for(int i=0;i<256;i++){
				for(int j=0;j<256;j++){
					abyMulTable[i + (j<<8)] = (BYTE)(i*j/255);
					//	このnarrowing変換がオーバーフローしないことは、
					//	255*255/255 == 255であることから明らか。
					abyMulTable2[i + (j<<8)] = (BYTE)(i*(255-j)/255);

				#ifdef _USE_SIGNED_TABLE
					//	x*y/255のxが正の時
					abySignedMulTable[(i+255) + (j<<9)] = abyMulTable[i + (j<<8)];
				#endif
				}
			}
		}
		#ifdef _USE_SIGNED_TABLE
		{
			for(int i=1;i<256;i++){
				for(int j=0;j<256;j++){
					//	x*y/255のxが負の時
					//	9bit符号付き整数の減算は、8bit符号無し整数の加算に帰着する
					abySignedMulTable[(-i)+255 + (j<<9)] = (~abyMulTable[i + (j<<8)])+1;	//	2の補数を取る
				}
			}
		}
		#endif

		{
			//	for rgb565 & argb3565
			for(int a=0;a<16;a++){
			 int a255 = a*255/7;
			 int a5 = a255 >> 3;
			 int a6 = a255 >> 2;
			 for(int r=0;r<32;r++){
			  for(int g=0;g<64;g++){
			   for(int b=0;b<32;b++){
					DWORD dw = b + (g<<5) + (r<<11) + (a<<16);
					WORD data;
					data= b*a/15 + (g*a/15 << 5) + (r*a/15 <<11);
					awdMulTableRGB565[dw] = data;

/*
	//	飽和加算および減算のテーブル化はやんぺー＾＾；

					//	こんなところにif書くなってか＾＾；
					if (a<8) {
						data = ((b+a5>31)?31:b+a5) + (((g+a6>63)?63:g+a6)<<5) + (((r+a5)>31?31:r+a5)<<11);
						awdAddTableRGB565[dw] = data;
						data = ((b<a5)?0:b-a5) + (((g<a6)?0:g-a6)<<5) + (((r<a5)?0:r-a5)<<11);
						awdSubTableRGB565[dw] = data;
					}
*/

			   }
			  }
			 }
			}
		}
		{
			//	for rgb555 & argb3555
			for(int a=0;a<16;a++){
			 int a255 = a*255/7;
			 int a5 = a255 >> 3;
			 int a6 = a255 >> 2;
			 for(int r=0;r<32;r++){
			  for(int g=0;g<32;g++){
			   for(int b=0;b<32;b++){
					DWORD dw =	b + (g<<5) + (r<<10) + (a<<16);
					WORD  data;
					data = b*a/15 + (g*a/15 << 5) + (r*a/15 <<10);
					awdMulTableRGB555[dw		  ] = data;
					awdMulTableRGB555[dw + (1<<15)] = data; // 不届きなビデオカード対策＾＾；
					//	↑こいつは、本当は、この半分で良いのだが、
					//	最上位が不定になっている可能性があるので、ビットマスクを
					//	とるのがだるいので、これでいってまう！＾＾；

/*
	//	飽和加算のテーブル化はやんぺー（笑）

					//	こんなところにif書くなってか＾＾；
					if (a<8) {
						data = ((b+a5>31)?31:b+a5) + (((g+a6>63)?63:g+a6)<<5) + (((r+a5)>31?31:r+a5)<<11);
						awdAddTableRGB555[dw] = data;
						awdAddTableRGB555[dw + (1<<15)] = data; // 不届きなビデオカード対策＾＾；
						data = ((b<a5)?0:b-a5) + (((g<a6)?0:g-a6)<<5) + (((r<a5)?0:r-a5)<<11);
						awdSubTableRGB555[dw] = data;
						awdSubTableRGB555[dw + (1<<15)] = data; // 不届きなビデオカード対策＾＾；
					}
*/

			   }
			  }
			 }
			}
		}
	}

// @yo2 0x00532f00 feat
void	CFastPlaneBlendTable::OnChangePalette(){
	HDC hdc = ::GetDC(NULL);
	if (hdc==NULL) return ;
	PALETTEENTRY pal[256];
	int nPal = GetSystemPaletteEntries(hdc,0,256,&pal[0]);
	//	パレットは256,16,4,2であることもありうる
	ReleaseDC(NULL,hdc);
	//	非256色モードでは、無視する
	if (nPal == 0) return ;

	for(int r=0;r<32;r++){
	 for(int g=0;g<32;g++){
	  for(int b=0;b<32;b++){
		DWORD dw =	b + (g<<5) + (r<<10);
		BYTE byR=(r << 3),byG=(g << 3),byB=(b << 3);
		BYTE nNearest=0;
		int nMinDistance=INT_MAX;
		for(int i=0;i<nPal;i++){
			BYTE byR2 = pal[i].peRed;
			BYTE byG2 = pal[i].peGreen;
			BYTE byB2 = pal[i].peBlue;

			//	線形距離で考えると？
			int nDistance =
				abs(byR-byR2) + abs(byG-byG2) + abs(byB-byB2);

			if (nDistance < nMinDistance){
				nMinDistance = nDistance;
				nNearest = (BYTE) i;
			}
		}
		abyConvertTable555[dw] = nNearest;
	  }
	 }
	}
}

///////////////////////////////////////////////////////////////////////////////

//	クリッパー
// @yo2 0x005330c0 feat
LRESULT CFastPlaneEffect::Clipping(CFastPlaneInfo*lpDstInfo,CFastPlaneInfo*lpSrcInfo,int x,int y
		, CFastPlaneEffectClipper* lpClipper,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
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
		rcSrcRect = *(lpSrcInfo->GetRect());
	} else {
		rcSrcRect = *lpSrcRect;
	}
	nSsizeX = rcSrcRect.right - rcSrcRect.left;
	nSsizeY = rcSrcRect.bottom - rcSrcRect.top;

	if (lpDstSize==NULL) {
//		rcDstRect = *(lpDstInfo->GetRect());
		//	lpDstSize == NULLのときは、
		//	Srcからの等倍の転送
		::SetRect(&rcDstRect,x,y,x+nSsizeX,y+nSsizeY);
	} else {
		::SetRect(&rcDstRect,x,y,x+lpDstSize->cx,y+lpDstSize->cy);
	}
	nDsizeX = rcDstRect.right - rcDstRect.left;
	nDsizeY = rcDstRect.bottom - rcDstRect.top;

	//	クリップ領域
	if (lpClipRect == NULL){
		rcClipRect = *(lpDstInfo->GetRect());
	} else {
		rcClipRect = *lpClipRect;
	}
	LPRECT lpClip = &rcClipRect;

	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		LPRECT lpDstRect2 = lpDstInfo->GetRect();
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
		if (t>0)	{ rcSrcRect.left += t;	rcDstRect.left	= lpClip->left; }
		t = lpClip->top -y;
		if (t>0)	{ rcSrcRect.top	 += t;	rcDstRect.top	= lpClip->top;	 }
		t = x+sx-lpClip->right;
		if (t>0)	{ rcSrcRect.right -= t;	rcDstRect.right	= lpClip->right; }
		t = y+sy-lpClip->bottom;
		if (t>0)	{ rcSrcRect.bottom -= t; rcDstRect.bottom = lpClip->bottom; }

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
		"CFastPlaneEffect::Clippingで転送元サーフェースの指定がサーフェースからはみ出している");
*/
	// clip end

	return 0;
}
