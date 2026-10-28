
#include "stdafx.h"
#include <limits.h>
#include "yaneMorpher.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00540970 review
CMorpher::CMorpher(void){
}

// @yo2 0x005409f0 review
CMorpher::~CMorpher(){
	Release();
}

// @yo2 0x00540bb0 review
void	CMorpher::SetDiv(int nSizeX,int nSizeY,int nXDiv,int nYDiv){
	Release();
	m_lpPointSrc.resize((nXDiv+1)*(nYDiv+1));
	m_lpPointDst.resize((nXDiv+1)*(nYDiv+1));
	m_nXDiv = nXDiv;
	m_nYDiv = nYDiv;
	m_nSizeX = nSizeX;
	m_nSizeY = nSizeY;
}

// @yo2 0x00540c20 review
void	CMorpher::GetDiv(int&nSizeX,int&nSizeY,int&nXDiv,int&nYDiv){
	nXDiv = m_nXDiv;
	nYDiv = m_nYDiv;
	nSizeX = m_nSizeX;
	nSizeY = m_nSizeY;
}

// @yo2 0x00540c60 review
void	CMorpher::Set(int nSrcX,int nSrcY,int nDstX,int nDstY){
	m_MorphCalc.Set(nSrcX,nSrcY,nDstX,nDstY);
}

// @yo2 0x00540c90 review
void	CMorpher::SetRev(int nDstX,int nDstY,int nSrcX,int nSrcY){
	m_MorphCalc.Set(nSrcX,nSrcY,nDstX,nDstY);
}

// @yo2 0x00540cc0 review
void	CMorpher::Calc(void){
	//	計算するのだ＾＾
	WARNING(m_lpPointSrc==NULL,"CMorpher::SetDivせずにCalcが呼び出された");
	POINT* lpPoint = m_lpPointSrc;
	POINT* lpPoint2 = m_lpPointDst;
	for(int y=0;y<=m_nYDiv;y++){
		for(int x=0;x<=m_nXDiv;x++){
			int ix,iy;
			int px = x*(m_nSizeX-1)/m_nXDiv;
			int py = y*(m_nSizeY-1)/m_nYDiv;
			m_MorphCalc.Get(px,py,ix,iy);
			lpPoint->x = ix;
			lpPoint->y = iy;
			lpPoint2->x = px;
			lpPoint2->y = py;
			lpPoint++;
			lpPoint2++;
		}
	}
}

// @yo2 0x00540da0 review
void	CMorpher::Release(void){
	m_lpPointSrc.clear();
	m_lpPointDst.clear();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00540df0 review
void	CMorpherCalc::Clear(void){
	//	設定した対応点集合のクリア
	m_nDstX.clear();
	m_nDstY.clear();
	m_nSrcX.clear();
	m_nSrcY.clear();
}

//	転送元と、転送先の対応点集合
// @yo2 0x00540ec0 manual
void	CMorpherCalc::Set(int nSrcX,int nSrcY,int nDstX,int nDstY){
	m_nSrcX.push_back(nSrcX);
	m_nSrcY.push_back(nSrcY);
	m_nDstX.push_back(nDstX);
	m_nDstY.push_back(nDstY);
}

// @yo2 0x005410e0 manual
void	CMorpherCalc::SetRev(int nDstX,int nDstY,int nSrcX,int nSrcY){
	m_nSrcX.push_back(nSrcX);
	m_nSrcY.push_back(nSrcY);
	m_nDstX.push_back(nDstX);
	m_nDstY.push_back(nDstY);
}

//	simple morphing alogorithm thought by yaneurao(M.Isozaki)

//	転送先の点を与えて、転送元の点を取得する
// @yo2 0x00541300 review
void	CMorpherCalc::Get(int nDstX,int nDstY,int &nSrcX,int &nSrcY){
	//	与えられた点の近傍3点を取得
	//		m_nSrcX.size()>=3と仮定
	
	const int PMAX = 5;	//	近傍検索数

	int	nNear[PMAX];	//	インデックスだけ記憶＾＾
	int	nDist[PMAX]	  = { INT_MAX,INT_MAX,INT_MAX,INT_MAX,INT_MAX  };	//	距離の２乗

	for(int n=0;n<m_nSrcX.size();n++){
		int nDistance = (nDstX - m_nDstX[n])*(nDstX - m_nDstX[n])
						+ (nDstY - m_nDstY[n])*(nDstY - m_nDstY[n]);
		if (nDistance <nDist[PMAX-1]) {	//	一番遠いエントリより近いか？
			for(int i=0;i<PMAX;i++){
				if (nDistance < nDist[i]){	//	insertする
					for(int j=PMAX-1;j>i;j--){	//	ひとつ下にずらす
						nNear[j] = nNear[j-1];
						nDist[j] = nDist[j-1];
					}
					nNear[i] = n;
					nDist[i] = nDistance;
					break;
				}
			}
		}
	}
	WARNING(nDist[2] == INT_MAX,"CMorpherCalc::Getで近傍３点が求まっていない");
	//	UVベクトルに分解
	//		a U + b V = Z	(a,b定数, U,V,Zはベクトル)
	//
	//		[U V](a) = Z  よって (a) = [U V]^-1・Z
	//			 (b)			 (b)
	//	ただし、
	//	３点が同一直線上にあるとU,Vベクタは一次独立でないので
	//	係数a,bは求まらない。
	//	そのときは、PMAXまで次候補を探すのだ～＾＾
	int nLast = 2;
	int a,b,c,d;	//	[U V]の行列要素
	int det;
retry:;
	a = m_nDstX[nNear[1]] - m_nDstX[nNear[0]];
	c = m_nDstY[nNear[1]] - m_nDstY[nNear[0]];
	b = m_nDstX[nNear[nLast]] - m_nDstX[nNear[0]];
	d = m_nDstY[nNear[nLast]] - m_nDstY[nNear[0]];
	det = a*d - b*c;
	if (det==0) {	//	nNear[nLast]を破棄して、再検索＾＾
		if (++nLast == PMAX) {
			WARNING(nDist[2] == INT_MAX,"CMorpherCalc::Getで近傍PMAX点はすべて同一直線上");
			return ;
		}
		goto retry;
	}
	int e,f;
	e = nDstX - m_nDstX[nNear[0]];
	f = nDstY - m_nDstY[nNear[0]];

	double u,v;
	u = ((double)(d*e - b*f)) / det;
	v = ((double)(a*f - c*e)) / det;
	//	↑逆行列を左辺から掛けただけね

	//	さきほどの転送先近傍３点に対応する転送元近傍３点を抽出
	nSrcX = (m_nSrcX[nNear[1]]	   - m_nSrcX[nNear[0]])*u
		+	(m_nSrcX[nNear[nLast]] - m_nSrcX[nNear[0]])*v
		+	 m_nSrcX[nNear[0]];
	nSrcY = (m_nSrcY[nNear[1]]	   - m_nSrcY[nNear[0]])*u
		+	(m_nSrcY[nNear[nLast]] - m_nSrcY[nNear[0]])*v
		+	 m_nSrcY[nNear[0]];
}

//////////////////////////////////////////////////////////////////////////////
//	実用クラス
//
#ifdef USE_DIB32

// @yo2 0x005415d0 review
void	CDIB32Morph::SetDiv(int nSizeX,int nSizeY,int nXDiv,int nYDiv){
	m_Morph.SetDiv(nSizeX,nSizeY,nXDiv,nYDiv);	//	正計算
	m_MorphRev.SetDiv(nSizeX,nSizeY,nXDiv,nYDiv);	//	逆計算
}

// @yo2 0x00541620 review
void	CDIB32Morph::Release(void){
	m_Morph.Release();
	m_MorphRev.Release();
}

// @yo2 0x00541650 review
void	CDIB32Morph::Set(int nSrcX1,int nSrcY1,int nSrcX2,int nSrcY2){
	m_Morph.Set(nSrcX1,nSrcY1,nSrcX2,nSrcY2);		//	正計算
	m_MorphRev.SetRev(nSrcX1,nSrcY1,nSrcX2,nSrcY2);	//	逆計算
}

// @yo2 0x005416a0 review
void	CDIB32Morph::Calc(void){
	m_Morph.Calc();
	m_MorphRev.Calc();
}

//	lpSrc1からlpSrc2へモーフィング。nPhaseは0-256,lpTemporaryはSecondaryと同サイズ確保してね。
// @yo2 0x005416d0 review
void	CDIB32Morph::OnDraw(CDIB32* lpSecondary,CDIB32* lpSrc1,CDIB32* lpSrc2,CDIB32 *lpTemporary,int nPhase){
	if (nPhase == 0){
		lpSecondary->Blt(lpSrc1,0,0);
	} ef (nPhase == 256){
		lpSecondary->Blt(lpSrc2,0,0);
	} else {
		InnerOnDraw(lpTemporary,lpSrc1,&m_Morph,256-nPhase);
		InnerOnDraw(lpSecondary,lpSrc2,&m_MorphRev,nPhase);
		lpSecondary->BlendBltFast(lpTemporary,0,0
			,DIB32RGB(nPhase&255,nPhase&255,nPhase&255)
			,DIB32RGB(256-nPhase&255,256-nPhase&255,256-nPhase&255));
	}
}

// @yo2 0x005417e0 feat
void	CDIB32Morph::InnerOnDraw(CDIB32* lpTarget,CDIB32* lpSrc,CMorpher* lpMorph,int nPhase){

	POINT* lpPoint;
	POINT* lpPoint2;
	POINT point_d[4];	//	転送先ポイント
	POINT point_s[4];	//	転送元ポイント

	lpPoint = lpMorph->GetPointSrc();
	lpPoint2= lpMorph->GetPointDst();

	int nXDiv,nYDiv,nSizeX,nSizeY;
	lpMorph->GetDiv(nSizeX,nSizeY,nXDiv,nYDiv);

	int x,y;
	for(y=0;y<nYDiv;y++){
		for(x=0;x<nXDiv;x++){
			int p = x + y*11;
			point_s[0] = lpPoint[p];
			point_s[1] = lpPoint[p+1];
			point_s[2] = lpPoint[p+11];
			point_s[3] = lpPoint[p+12];
			point_d[0].x = x*(nSizeX-1)/nXDiv;
			point_d[0].y = y*(nSizeY-1)/nYDiv;				
			point_d[1].x = (x+1)*(nSizeX-1)/nXDiv;
			point_d[1].y = point_d[0].y;
			point_d[2].x = point_d[0].x;
			point_d[2].y = (y+1)*(nSizeY-1)/nYDiv;
			point_d[3].x = point_d[1].x;
			point_d[3].y = point_d[2].y;
			// 内分点を取る
			for(int ii=0;ii<4;ii++){
				point_s[ii].x = (point_d[ii].x*nPhase + point_s[ii].x*(256-nPhase))>>8;
				point_s[ii].y = (point_d[ii].y*nPhase + point_s[ii].y*(256-nPhase))>>8;
			}
			RECT rc;
			::SetRect(&rc,point_d[0].x,point_d[0].y,point_d[3].x,point_d[3].y);
			lpTarget->MorphBltFast(lpSrc,point_s,&rc);
		}
	}
}
#endif // #ifdef USE_DIB32
