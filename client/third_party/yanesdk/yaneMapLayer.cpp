
#include "stdafx.h"
#include "yanePlane.h"
#include "yaneDIB32.h"
#include "yaneDirectDraw.h"
#include "yaneMapLayer.h"
#include "yaneMapIO.h"
#include "yaneAppManager.h"

//	Layer
//		0,1,2	:	下レイヤの下に描画
//		3		:	下レイヤとブレンドされるレイヤ
//		4,5,6	:	下レイヤより上、中レイヤより下に描画
//		7,8,9	:	中レイヤとブレンドされるレイヤ
//		10		:	中レイヤより上、上レイヤより下
//		11		:	上チップより上

//	立ち位置でのソート用
static int map_compare( const void *lpCMapChara1, const void *lpCMapChara2 )
{
   return (((SSprite*)lpCMapChara1)->nOy ) -  (((SSprite*)lpCMapChara2)->nOy);
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053ca90 feat
CMapLayer::CMapLayer(void){
	m_nMapX	  = m_nMapY	  = 0;
	m_nMapCX  = m_nMapCY  = 1;	// ０割エラー出たらシャレならんので（笑）
	ResetMapChara();
	::SetRect(&m_rcDraw,0,0,640,480);	//	一応、ディフォルトでは全域
	SetPos(0,0);
	m_bInvalid	= false;
	::SetRect(&m_rcClear,0,0,0,0);

	if (CAppManager::IsDirectDraw()) {
#ifdef USE_DirectDraw
		for(int i=0;i<32;i++){
			m_MapPlane[i] = new CPlane;
		}
#endif
	} else {
		for(int i=0;i<32;i++){
			m_MapPlane[i] = 
#ifdef USE_DIB32
			new CDIB32;
#else
			NULL;
#endif
		}
	}
}

// @yo2 0x0053cc20 vt
CMapLayer::~CMapLayer(){
	m_MapData.clear();
	for(int i=0;i<32;i++){
		DELETE_SAFE(m_MapPlane[i]);
	}
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053cd10 tight
void	CMapLayer::SetMapChipSize(int x,int y){
	// マップチップのサイズ設定
	m_nMapCX = x;
	m_nMapCY = y;
}

// @yo2 0x0053cd40 cg
void	CMapLayer::SetMapSize(int x,int y){
	// マップ全体のサイズ設定
	m_MapData.resize(x*y);		//	CMapChipのコンストラクタが働いて初期化してくれているはず
	m_nMapX = x;
	m_nMapY = y;
}

// @yo2 0x0053cd80 review
void	CMapLayer::GetMapSize(int &x,int &y){
	x = m_nMapX;
	y = m_nMapY;
}

// @yo2 0x0053cdb0 review
CMapChip*	CMapLayer::GetMapChip(int x,int y){
	if (x<0 || y<0 || x>=m_nMapX || y>=m_nMapY) return NULL;
	return m_MapData + x + m_nMapX * y;
}

// @yo2 0x0053ce20 review
void	CMapLayer::GetMapArea(int &x,int &y){
	//	マップ全体のドット数を得る
	x = m_nMapX * m_nMapCX;
	y = m_nMapY * m_nMapCY;
}

// @yo2 0x0053ce60 review
void	CMapLayer::ResizeMap(int x,int y){
	// 出来る限り、いまのマップを温存してサイズ変更。
	auto_array<CMapChip> lpdwData(x*y);

	for(int j=0;j<y;j++){
		for(int i=0;i<x;i++){
			if (i<m_nMapX && j<m_nMapY) {
				lpdwData[i + j*x] = m_MapData[i + j*m_nMapX];	//	fixed '00/01/03
			} else {
				/*	//	マップエディタの仕様によるが…
				lpdwData[i + j*x].chip[0] = -1;
				lpdwData[i + j*x].chip[1] = -1;
				lpdwData[i + j*x].chip[2] = -1;
				lpdwData[i + j*x].chip[3] = -1;
				lpdwData[i + j*x].hit = -1;
				*/
			}
		}
	}

	m_MapData = lpdwData;	// ポインタすり替え！
	m_nMapX = x;			// リサイズされたサイズを反映
	m_nMapY = y;
}

// @yo2 0x0053cff0 review
void	CMapLayer::InvalidateWall(bool b){
	m_bInvalid = b;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053d010 cg
void	CMapLayer::ResetMapChara(void) {
	ZERO(m_nMapChara);
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053d040 vt
void	CMapLayer::OnDraw(CPlaneBase*lpDraw){
	OnPaint0(lpDraw);		//	クリッピング
	OnPaint1(lpDraw);		//	下レイヤ
	OnPaint2(lpDraw);		//	中レイヤ
	OnPaint3(lpDraw);		//	上レイヤ
}

//	クリッピングを行なわない（マップのキャプチャー用）
// @yo2 0x0053d080 vt
void	CMapLayer::OnDraw2(CPlaneBase*lpDraw){
	//	キャラクターレイヤブレンドカウンタをリセット
	ZERO(m_nMapChara2);

	OnPaint1(lpDraw);		//	下レイヤ
	OnPaint2(lpDraw);		//	中レイヤ
	OnPaint3(lpDraw);		//	上レイヤ
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053d0d0 cg
void	CMapLayer::OnPaint0(CPlaneBase*lpDraw){
	//	クリッピング
	int	msx,msy;	//	マップサイズ取得
	GetMapArea(msx,msy);
	int scx,scy;
	scx = m_rcDraw.right-m_rcDraw.left;
	scy = m_rcDraw.bottom-m_rcDraw.top;
	if (msx<scx || msy<scy) {	//	マップサイズのほうが小さい？
		lpDraw->ClearRect(&m_rcDraw);	//	画面クリア
	}
	//	はみ出ている分を押し戻す
	if (m_nX<0) {
		m_nX = 0;
	} else if (m_nX+scx > msx) {
		m_nX = msx - scx;
	}
	if (m_nY<0) {
		m_nY = 0;
	} else if (m_nY+scy > msy) {
		m_nY = msy - scy;
	}

	//	キャラクターレイヤブレンドカウンタをリセット
	ZERO(m_nMapChara2);
}

//	下レイヤ
// @yo2 0x0053d1c0 feat
void	CMapLayer::OnPaint1(CPlaneBase*lpDraw){
	OnPaintLayer(lpDraw,0,2);
//		0,1,2	:	下レイヤの下に描画
	OnSortLayer(3);

	// マップチップ位置算出
	int MX,MY,SX;	// マップチップ番号の算出
	int x=0,y=0;	//	忘れてたにょ:p
	WORD chip;		//	temporary
	int cx,cy;		//	cx,cy
	RECT r;			//	rect

	//	マイナスの場合、まずいが、そのチェックはしてあるので構わない
	SX = m_nX / m_nMapCX;
	MY = m_nY / m_nMapCY;

	for(y = m_rcDraw.top-(m_nY % m_nMapCY) ; y<m_rcDraw.bottom ; y+=m_nMapCY){
		MX = SX;
		for(x = m_rcDraw.left -(m_nX % m_nMapCX) ; x<m_rcDraw.right ; x+=m_nMapCX){
			if (MX>=0 && MX<m_nMapX && MY>=0 && MY<m_nMapY){
				CMapChip* lpChip = &m_MapData[MX + MY*m_nMapX];
				if ((chip = lpChip->chip[0])!=0xffff){ // -1ならば配置されていない
					cx = (chip & 0xff)*m_nMapCX;	// 下位8ビットがマップチップのＸ座標
					cy = (chip >> 8	 )*m_nMapCY;

					WARNING (cx>=640 || cy>=480 , "CMapLayer::OnPaint1でマップのソースが範囲外");
					
					::SetRect(&r,cx,cy,cx+m_nMapCX,cy+m_nMapCY);
					lpDraw->BltFast(lpChip->plane[0],x,y,&r,NULL,&m_rcDraw);
				}
			}
			MX++;
		}
//		3		:	下レイヤとブレンドされるレイヤ
		for(int i=3;i<=3;i++){
			int& p = m_nMapChara2[i];
			for(;p!=m_nMapChara[i];p++){
				SSprite* lpSS = &m_MapChara[i][p];
				int cry = lpSS->nOy;
				//	整順されているから、このチェックはこれで良い
				if (/* (y < cry) && */ (cry <= y+m_nMapCY)) {
					if (lpSS->bFast) {
						lpDraw->BltFast(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
					} else {
						lpDraw->Blt(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
					}
				} else {
					break;	//	もう嫌（笑）
				}
			}
		}

		MY++;
	}
	OnPaintLayer(lpDraw,4,6);
}

//	中レイヤ
// @yo2 0x0053d470 feat
void	CMapLayer::OnPaint2(CPlaneBase*lpDraw){
//		4,5,6	:	下レイヤより上、中レイヤより下に描画

	OnSortLayer(7,9);

	// マップチップ位置算出
	int MX,MY,SX;	// マップチップ番号の算出
	int x=0,y=0;	//	忘れてたにょ:p
	WORD chip;		//	temporary
	int cx,cy;		//	cx,cy
	RECT r;			//	rect

	//	マイナスの場合、まずいが、そのチェックはしてあるので構わない
	SX = m_nX / m_nMapCX;
	MY = m_nY / m_nMapCY;

	for(y = m_rcDraw.top-(m_nY % m_nMapCY) ; y<m_rcDraw.bottom ; y+=m_nMapCY){
		MX = SX;
		for(x = m_rcDraw.left -(m_nX % m_nMapCX) ; x<m_rcDraw.right ; x+=m_nMapCX){
			if (MX>=0 && MX<m_nMapX && MY>=0 && MY<m_nMapY){
				CMapChip* lpChip = &m_MapData[MX + MY*m_nMapX];
				if ((chip = lpChip->chip[1])!=0xffff){ // -1ならば配置されていない
					cx = (chip & 0xff)*m_nMapCX;	// 下位8ビットがマップチップのＸ座標
					cy = (chip >> 8	 )*m_nMapCY;

					WARNING (cx>=640 || cy>=480 , "CMapLayer::OnPaint2でマップのソースが範囲外");

					::SetRect(&r,cx,cy,cx+m_nMapCX,cy+m_nMapCY);
					lpDraw->Blt(lpChip->plane[1],x,y,&r,NULL,&m_rcDraw);
				}
			}
			MX++;
		}

//		7,8,9	:	中レイヤとブレンドされるレイヤ
		for(int i=7;i<=9;i++){
			int& p = m_nMapChara2[i];
			for(;p!=m_nMapChara[i];p++){
				SSprite* lpSS = &m_MapChara[i][p];
				int cry = lpSS->nOy;
				//	整順されているから、このチェックはこれで良い
				if (/* (y < cry) && */ (cry <= y+m_nMapCY)) {
					if (lpSS->bFast) {
						lpDraw->BltFast(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
					} else {
						lpDraw->Blt(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
					}
				} else {
					break;	//	もう嫌（笑）
				}
			}
		}

		MY++;
	}

	for(int i=7;i<=9;i++){
		int& p = m_nMapChara2[i];
		for(;p!=m_nMapChara[i];p++){
			SSprite* lpSS = &m_MapChara[i][p];
			int cry = lpSS->nOy;
			//	整順されているから、このチェックはこれで良い
			if (/* (y < cry) && */ (cry <= y+m_nMapCY + 64 /* 64ドット下まで潜って調べる */)) {
				if (lpSS->bFast) {
					lpDraw->BltFast(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
				} else {
					lpDraw->Blt(lpSS->lpPlane,lpSS->nOx,lpSS->nOy + lpSS->nHeight,&lpSS->rcRect,NULL,&m_rcDraw);
				}
			} else {
				break;	//	もう嫌（笑）
			}
		}
	}

//		10		:	中レイヤより上、上レイヤより下
	OnPaintLayer(lpDraw,10);

}

//	上レイヤ
// @yo2 0x0053d800 feat
void	CMapLayer::OnPaint3(CPlaneBase*lpDraw){

	// マップチップ位置算出
	int MX,MY,SX;	// マップチップ番号の算出
	int x=0,y=0;	//	忘れてたにょ:p
	WORD chip;		//	temporary
	int cx,cy;		//	cx,cy
	RECT r;			//	rect

	//	マイナスの場合、まずいが、そのチェックはしてあるので構わない
	SX = m_nX / m_nMapCX;
	MY = m_nY / m_nMapCY;

	for(y = m_rcDraw.top-(m_nY % m_nMapCY) ; y<m_rcDraw.bottom ; y+=m_nMapCY){
		MX = SX;
		for(x = m_rcDraw.left -(m_nX % m_nMapCX) ; x<m_rcDraw.right ; x+=m_nMapCX){
			if (MX>=0 && MX<m_nMapX && MY>=0 && MY<m_nMapY){
				CMapChip* lpChip = &m_MapData[MX + MY*m_nMapX];
				if ((chip = lpChip->chip[2])!=0xffff){ // -1ならば配置されていない
					cx = (chip & 0xff)*m_nMapCX;	// 下位8ビットがマップチップのＸ座標
					cy = (chip >> 8	 )*m_nMapCY;
					
					WARNING (cx>=640 || cy>=480 , "CMapLayer::OnPaint3でマップのソースが範囲外");

					::SetRect(&r,cx,cy,cx+m_nMapCX,cy+m_nMapCY);
					lpDraw->Blt(lpChip->plane[2],x,y,&r,NULL,&m_rcDraw);
				}
			}
			MX++;
		}
		MY++;
	}

	OnPaintLayer(lpDraw,11);
//		11		:	上チップより上

	//	デバッグ用クリア矩形
	if (m_rcClear.left || m_rcClear.top ||
		m_rcClear.right || m_rcClear.bottom){
		RECT cl;
		::SetRect(&cl,m_rcClear.left-m_nX,m_rcClear.top-m_nY,
			m_rcClear.right-m_nX,m_rcClear.bottom-m_nY);
		lpDraw->ClearRect(&cl);
	}
}

//////////////////////////////////////////////////////////////////////////////

//	StartLayerからEndLayerまでをPaintする。
//	EndLayerは含む。ディフォルトではnEndLayer==nStartLayer
// @yo2 0x0053da50 cg
void	CMapLayer::OnPaintLayer(CPlaneBase*lpDraw,int nStartLayer,int nEndLayer){
	if (nEndLayer==-1) nEndLayer=nStartLayer;

	int ox = m_rcDraw.left	- m_nX;
	int oy = m_rcDraw.top	- m_nY;
	
	for (int nLayer=nStartLayer;nLayer<=nEndLayer;nLayer++){
		for(int i=0;i<m_nMapChara[nLayer];i++){
			SSprite* lpSS = &m_MapChara[nLayer][i];
			if (lpSS->bFast) {
				lpDraw->BltFast(lpSS->lpPlane,lpSS->nOx + ox,lpSS->nOy + lpSS->nHeight + oy,&lpSS->rcRect,NULL,&m_rcDraw);
			} else {
				lpDraw->Blt(lpSS->lpPlane,lpSS->nOx + ox,lpSS->nOy + lpSS->nHeight + oy,&lpSS->rcRect,NULL,&m_rcDraw);
			}
		}
	}
}

// @yo2 0x0053dbb0 cg
void	CMapLayer::OnSortLayer(int nStartLayer,int nEndLayer){
	if (nEndLayer==-1) nEndLayer=nStartLayer;

	//	ブレンド表示するとき前後関係がおかしくなるから立ち位置でソートする
	for(int nLayer=nStartLayer;nLayer<=nEndLayer;nLayer++){
		for(int i=0;i<m_nMapChara[nLayer];i++){
			m_MapChara[nLayer][i].nOx += (m_rcDraw.left - m_nX);

			//	あとでnHeight足す(C)yaneurao
			m_MapChara[nLayer][i].nOy += (m_rcDraw.top	- m_nY) /* - m_nMapCY */;
																//	位置補正項
			m_MapChara[nLayer][i].nHeight += 0 /* m_nMapCY*/ ;
		}
		::qsort((LPVOID)&m_MapChara[nLayer][0],m_nMapChara[nLayer],sizeof(SSprite),map_compare);
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053dca0 cg
void	CMapLayer::SetPos(int x,int y){			//	表示エリア左上の来るべき仮想スクリーン座標
	m_nX	=	x;
	m_nY	=	y;
}

// @yo2 0x0053dcd0 review
void	CMapLayer::GetPos(int &x,int &y){			//	表示エリア左上の来るべき仮想スクリーン座標
	x		=	m_nX;
	y		=	m_nY;
}

// @yo2 0x0053dd00 review
void	CMapLayer::SetView(LPRECT lpRect){		//	描画エリア
	if (lpRect==NULL) return ;
	m_rcDraw = *lpRect;
}

// @yo2 0x0053dd40 review
LPRECT	CMapLayer::GetView(void){				//	↑の取得
	return &m_rcDraw;
}

// @yo2 0x0053dd60 cg
void	CMapLayer::Release(void){
	//	マップと従属プレーンの解放
	m_MapData.clear();
	for(int i=0;i<32;i++){
		m_MapPlane[i]->Release();
	}
}

// @yo2 0x0053ddd0 feat
LRESULT	CMapLayer::Load(LPSTR szFileName){		//	マップの読み込み
	Release();
	SetPos(0,0);	//	一応リセットしておく
	
	CMapIO map;
	if (map.Read(szFileName)!=0) return 1;
	
	TMap* lpMap = map.GetMap();
	m_nMapX	 =lpMap->Header.dwMapX;
	m_nMapY	 =lpMap->Header.dwMapY;
	m_nMapCX = lpMap->Header.dwMapCX;
	m_nMapCY = lpMap->Header.dwMapCY;

	SetMapSize(m_nMapX,m_nMapY);
	for(int i=0;i<32;i++){
		CHAR szFile[256];
		int nBank = lpMap->Header.dwBankNo[i];
		if (nBank!=0) {
			::wsprintf(szFile,"bank/bank%.3d.bmp",nBank);
			m_MapPlane[i]->Load(szFile);
		}
	}
	for(int y=0;y<m_nMapY;y++){
		for(int x=0;x<m_nMapX;x++){
			int nPos = x + y*m_nMapX;
			m_MapData[nPos].chip[0] = lpMap->Chip[nPos].dwDownchip;
			m_MapData[nPos].chip[1] = lpMap->Chip[nPos].dwMiddlechip;
			m_MapData[nPos].chip[2] = lpMap->Chip[nPos].dwUpperchip;
			//	プレーンへのポインタも事前に代入
			m_MapData[nPos].plane[0] = m_MapPlane[lpMap->Chip[nPos].nBankNo[0]];
			m_MapData[nPos].plane[1] = m_MapPlane[lpMap->Chip[nPos].nBankNo[1]];
			m_MapData[nPos].plane[2] = m_MapPlane[lpMap->Chip[nPos].nBankNo[2]];

			//	床判定もこいつが担う
			m_MapData[nPos].hit		 = lpMap->Chip[nPos].hit;
		}
	}

	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053e0c0 review
bool	CMapLayer::IsWall(int x,int y){			//	(x,y)は床か？
	if (m_bInvalid) return false;
	
	WARNING(m_MapData==NULL,"CMapLayer::IsWallでm_MapData==NULL");
	if (x<0 || y<0 || x>=m_nMapX || y>=m_nMapY) return true;
	return (m_MapData[x + y*m_nMapX].hit /* & MAP_ALL_WALL */ ) != 0;	
}

// @yo2 0x0053e140 review
DWORD*	CMapLayer::GetWall(int x,int y){
	WARNING(m_MapData==NULL,"CMapLayer::IsWallでm_MapData==NULL");

	//	(x,y)の床情報へのポインタを直接得る
	static DWORD dummy;
	if (m_bInvalid) {
		dummy = 0x00000000;	//	ウソのポインタを用意
		return &dummy;
	}
	
	if (x<0 || y<0 || x>=m_nMapX || y>=m_nMapY) {
		dummy = 0xffffffff;	//	ウソのポインタを用意
		return &dummy;
	}
	return &m_MapData[x + y*m_nMapX].hit;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053e1d0 review
void	CMapLayer::BltFix(CSprite*lpSprite,int x,int y){
	//	(x,y)に描画
	
	//	有効か？
	if (!lpSprite->IsEnable()) return ;

	//	レイヤ取得
	int	nLayer = lpSprite->GetLayer();

	SSprite* lpSS = lpSprite->GetSSprite();

	WARNING(nLayer<0||nLayer>=MAPLAYER_MAX,"CMapLayer::BltFixでLayer違反");
	int& nCount = m_nMapChara[nLayer];
	WARNING(nCount==MAPCHARA_MAX,"CMapLayer::BltFixでキャラオーバー");
	SSprite& mc = m_MapChara[nLayer][nCount];

	mc = *lpSS;
	int ox,oy;
	lpSprite->GetOffset(ox,oy);
	mc.nOx	+=	x+ox;
	//	あとでnHeight足す(C)yaneurao
	int t = mc.nOy - lpSprite->GetHeight();
	mc.nOy	=	y + oy + lpSprite->GetHeight();
	mc.nHeight = t;
	
	nCount++;
}

// @yo2 0x0053e2b0 review
void	CMapLayer::BltOnce(CSprite*lpSprite,int x,int y){
	BltFix(lpSprite,x,y);
	
	//	ケツになっていたら、それ以上は加算しない
	int n=lpSprite->GetMotion();
	lpSprite->IncMotion();
	if (lpSprite->GetMotion()==0) {
		lpSprite->SetMotion(n);
	}
}

//////////////////////////////////////////////////////////////////////////////
