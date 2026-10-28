#include "stdafx.h"
#include "yaneSpriteEx.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00571ba0 review
void	CSpriteEx::Blt(CMapLayer*lpMap){
	lpMap->Blt(this);
}

// @yo2 0x00571bd0 review
void	CSpriteEx::Blt(CMapLayer*lpMap,int x,int y){
	lpMap->Blt(this,x,y);
}

// @yo2 0x00571c10 review
void	CSpriteEx::BltFix(CMapLayer*lpMap){
	lpMap->BltFix(this);
}

// @yo2 0x00571c40 review
void	CSpriteEx::BltFix(CMapLayer*lpMap,int x,int y){
	lpMap->BltFix(this,x,y);
}

// @yo2 0x00571c70 review
void	CSpriteEx::BltOnce(CMapLayer*lpMap,int x,int y){
	lpMap->BltOnce(this,x,y);
}

//////////////////////////////////////////////////////////////////////////////

#ifdef USE_DirectDraw
void	CSpriteEx::Blt(CDirectDraw*lpDraw,LPRECT lpClip){
	lpDraw->Blt(this,lpClip);
}

void	CSpriteEx::Blt(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->Blt(this,x,y,lpClip);
}

void	CSpriteEx::BltFix(CDirectDraw*lpDraw,LPRECT lpClip){
	lpDraw->BltFix(this,lpClip);
}

void	CSpriteEx::BltFix(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->BltFix(this,x,y,lpClip);
}

void	CSpriteEx::BltOnce(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->BltFix(this,x,y,lpClip);
}
#endif

//////////////////////////////////////////////////////////////////////////////
#ifdef USE_DIB32
// @yo2 0x00571ca0 review
void	CSpriteEx::Blt(CDIBDraw*lpDraw,LPRECT lpClip){
	lpDraw->Blt(this,lpClip);
}

// @yo2 0x00571ce0 review
void	CSpriteEx::Blt(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->Blt(this,x,y,lpClip);
}

// @yo2 0x00571d20 review
void	CSpriteEx::BltFix(CDIBDraw*lpDraw,LPRECT lpClip){
	lpDraw->BltFix(this,lpClip);
}

// @yo2 0x00571d50 review
void	CSpriteEx::BltFix(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->BltFix(this,x,y,lpClip);
}
// @yo2 0x00571d80 review
void	CSpriteEx::BltOnce(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip){
	lpDraw->BltFix(this,x,y,lpClip);
}
#endif
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00571db0 review
void	CSpriteEx::Blt(CPlaneBase*lpPlane,LPRECT lpClip){
	int x,y;
	GetPos(x,y);
	Blt(lpPlane,x,y,lpClip);
}

// @yo2 0x00571de0 review
void	CSpriteEx::Blt(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip){
	BltFix(lpPlane,x,y,lpClip);
	IncMotion();
}

// @yo2 0x00571e20 review
void	CSpriteEx::BltFix(CPlaneBase*lpPlane,LPRECT lpClip){
	int x,y;
	GetPos(x,y);
	BltFix(lpPlane,x,y,lpClip);
}

// @yo2 0x00571e50 review
void	CSpriteEx::BltFix(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip){
	//	有効か？
	if (!IsEnable()) return ;

	//	CDirectDrawで描画する場合Layer無視
	SSprite* lpSS = GetSSprite();

	int ox,oy;
	GetOffset(ox,oy);
	ox+=x+lpSS->nOx;
	oy+=y+lpSS->nOy;

	//	そのまま委譲してまうとすっか～
	if (!lpSS->bFast) {
		lpPlane->Blt(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	} else {
		lpPlane->BltFast(lpSS->lpPlane,ox,oy,&lpSS->rcRect,NULL,lpClip);
	}
}

// @yo2 0x00571f10 review
void	CSpriteEx::BltOnce(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip){
	BltFix(lpPlane,x,y,lpClip);
	
	//	ケツになっていたら、それ以上は加算しない
	int n=GetMotion();
	IncMotion();
	if (GetMotion()==0) {
		SetMotion(n);
	}
}
//////////////////////////////////////////////////////////////////////////////
