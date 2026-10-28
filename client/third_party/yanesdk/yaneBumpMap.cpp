#include "stdafx.h"
#include "yaneBumpMap.h"
#include "yaneDIB32.h"
#include <math.h>

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00431ac0 manual
void	CBumpMap::Resize(int x,int y){
	int nSize = x*y;
	WARNING(nSize==0,"CBumpMap::ResizeでSizeが0になっている");
	m_alpBumpMapTable.resize(nSize);
	m_alpBumpMapTableStart.resize(nSize);
	for (int i=0;i<y;i++){
		m_alpBumpMapTableStart[i] = &m_alpBumpMapTable[i*x];
	}

	m_nSizeX = x;
	m_nSizeY = y;
}

// @yo2 0x00431b50 manual
SBumpMapChip* CBumpMap::GetTable(void){
	return &m_alpBumpMapTable[0];
}

// @yo2 0x00431b70 manual
SBumpMapChip** CBumpMap::GetStartTable(void){
	return &m_alpBumpMapTableStart[0];
}

// @yo2 0x00431b90 review
void	CBumpMap::GetSize(int&x,int&y){
	x = m_nSizeX;
	y = m_nSizeY;
}

///////////////////////////////////////////////////////////////////////////////

#ifdef USE_DIB32

// @yo2 0x00431bc0 vt
LRESULT	CDIB32P5::BumpMapBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect /*=NULL*/,LPRECT lpClipRect /*= NULL*/){
	//	未実装

	return 0;
}

// @yo2 0x00431be0 vt
LRESULT CDIB32P5::BumpMapFastBlt(CDIB32* lpSrc,CBumpMap* lpBumpMap,int x,int y,LPRECT lpSrcRect /*=NULL*/,LPRECT lpClipRect /*= NULL*/){
	//	bump mapper : programmed by yaneurao (M.Isozaki) '00/10/06

	int ox,oy;
	if (lpSrcRect == NULL) {
		ox = oy = 0;
	} else {
		ox = lpSrcRect->left;
		oy = lpSrcRect->top;
	}

	if (Clipping(lpSrc,x,y,lpSrcRect,NULL,lpClipRect)!=0) return 0;
	//	m_rcSrcRect.leftとm_rcDstRectに結果が返ってくる

	int xxs = m_rcDstRect.left;
	int xxe = m_rcDstRect.right;
	int yys = m_rcDstRect.top;
	int yye = m_rcDstRect.bottom;

	DWORD**		lplpSrcStart = lpSrc->GetDIB32BasePtr()->m_lpdwLineStart;	//	ソースのラインテーブル
	DWORD**		lplpDstStart = m_lpdwLineStart;			//	デストのラインテーブル

	int psx = m_rcSrcRect.left;
	int psy = m_rcSrcRect.top;

	SBumpMapChip** lplpBumpTableStart	= lpBumpMap->GetStartTable();

	int	msx = ox - psx;
	int	msy = oy - psy;

	for(int py=yys,sy=psy;py<yye;++py,++sy,++msy){
		DWORD *pDst = lplpDstStart[py] + xxs;
		SBumpMapChip* pBp = lplpBumpTableStart[msy] + msx;
		for(int px=xxs,sx=psx;px<xxe;++px,++sx){
			// ソースは(sx,sx)ところが、これのbump table(*pBp)を見て、
			//	その変移量だけ変化させたポイントを取得
			//	(sx + pBp->x , sy + pBp->y)
			*(pDst++) = *(lplpSrcStart[sy + pBp->y] + (sx + pBp->x));
			//				↑こいつがソース範囲外であるかどうかはチェックしなくて良い
			pBp++;
		}
	}
	return 0;
}

#endif

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00431db0 review
void CBumpEffecter::LensEffect1(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate){
	if (nRate==0) return ; // だめ＾＾；

	//	凸レンズ
	lpBumpMap->Resize(nSizeX,nSizeY);
	SBumpMapChip* lpMC = lpBumpMap->GetTable();

	for(int y=0;y<nSizeY;++y){
		for(int x=0;x<nSizeX;++x){
			int ox = x-nSizeX/2;
			int oy = y-nSizeY/2;
			int d = ox*ox + oy*oy;
			if (d < nSizeX*nSizeY/4){
			//	円の内側？
				//	距離に反比例した屈折ファクター
				double r = sqrt(d);
				ox = (int)(-ox/nRate);
				oy = (int)(-oy/nRate);
			} else {
			//	円の外側ならば屈折なし
				ox = 0;
				oy = 0;
			}
			lpMC[x+y*nSizeX].x = ox;
			lpMC[x+y*nSizeX].y = oy;
		}
	}
}

// @yo2 0x00431ee0 review
void CBumpEffecter::SwirlEffect1(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate){
	//	渦巻き(外から)

	lpBumpMap->Resize(nSizeX,nSizeY);
	SBumpMapChip* lpMC = lpBumpMap->GetTable();

	for(int y=0;y<nSizeY;++y){
		for(int x=0;x<nSizeX;++x){
			int ox = x-nSizeX/2;
			int oy = y-nSizeY/2;
			int d = ox*ox + oy*oy;
			if (d < nSizeX*nSizeY/4){
			//	円の内側？
				//	距離に反比例したねじれファクター
				int oxx = ox;
				int oyy = oy;
				double r = sqrt(d);
				double bend = r/nRate;
				int pxx = (int)(cos(bend) * oxx - sin(bend) * oyy);
				int pyy = (int)(sin(bend) * oxx + cos(bend) * oyy);
				ox = pxx-ox;
				oy = pyy-oy;
			} else {
			//	円の外側ならばねじれなし
				ox = 0;
				oy = 0;
			}
			lpMC[x+y*nSizeX].x = ox;
			lpMC[x+y*nSizeX].y = oy;
		}
	}
}

// @yo2 0x00432070 review
void CBumpEffecter::SwirlEffect2(CBumpMap*lpBumpMap,int nSizeX,int nSizeY,int nRate){
	//	渦巻き(内から)

	lpBumpMap->Resize(nSizeX,nSizeY);
	SBumpMapChip* lpMC = lpBumpMap->GetTable();
	int nMax = max(nSizeX/2,nSizeY/2);

	for(int y=0;y<nSizeY;++y){
		for(int x=0;x<nSizeX;++x){
			int ox = x-nSizeX/2;
			int oy = y-nSizeY/2;
			int d = ox*ox + oy*oy;
			if (d < nSizeX*nSizeY/4){
			//	円の内側？
				//	距離に反比例したねじれファクター
				int oxx = ox;
				int oyy = oy;
				double r = nMax-sqrt(d);
				double bend = (r/nMax)*nRate;
				int pxx = (int)(cos(bend) * oxx - sin(bend) * oyy);
				int pyy = (int)(sin(bend) * oxx + cos(bend) * oyy);
				ox = pxx-ox;
				oy = pyy-oy;
			} else {
			//	円の外側ならばねじれなし
				ox = 0;
				oy = 0;
			}
			lpMC[x+y*nSizeX].x = ox;
			lpMC[x+y*nSizeX].y = oy;
		}
	}
}
