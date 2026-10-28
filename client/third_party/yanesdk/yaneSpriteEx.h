//
//	CSpriteEx.h
//
//		CMapLayer,CDirectDraw‚É•`‰æ‚·‚é—p
//

#ifndef __yaneSpriteEx_h__
#define __yaneSpriteEx_h__

#include "yaneSprite.h"
#include "yaneMapLayer.h"
#include "yanePlaneBase.h"
#include "yaneDirectDraw.h"
#include "yaneDIBDraw.h"

class CSpriteEx : public CSprite {
public:
	void	Blt(CMapLayer*lpMap);
	void	Blt(CMapLayer*lpMap,int x,int y);
	void	BltFix(CMapLayer*lpMap);
	void	BltFix(CMapLayer*lpMap,int x,int y);
	void	BltOnce(CMapLayer*lpMap,int x,int y);

#ifdef USE_DirectDraw
	void	Blt(CDirectDraw*lpDraw,LPRECT lpClip=NULL);
	void	Blt(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
	void	BltFix(CDirectDraw*lpDraw,LPRECT lpClip=NULL);
	void	BltFix(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
	void	BltOnce(CDirectDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
#endif

#ifdef USE_DIB32
	void	Blt(CDIBDraw*lpDraw,LPRECT lpClip=NULL);
	void	Blt(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
	void	BltFix(CDIBDraw*lpDraw,LPRECT lpClip=NULL);
	void	BltFix(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
	void	BltOnce(CDIBDraw*lpDraw,int x,int y,LPRECT lpClip=NULL);
#endif

//	CDIB32,CPlane‚É‘Î‚µ‚Ä‚àŽg‚¦‚é‚æ‚¤‚É‚±‚ê‚ð’Ç‰Á('01/01/07)
	void	Blt(CPlaneBase*lpPlane,LPRECT lpClip=NULL);
	void	Blt(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip=NULL);
	void	BltFix(CPlaneBase*lpPlane,LPRECT lpClip=NULL);
	void	BltFix(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip=NULL);
	void	BltOnce(CPlaneBase*lpPlane,int x,int y,LPRECT lpClip=NULL);
};

#endif
