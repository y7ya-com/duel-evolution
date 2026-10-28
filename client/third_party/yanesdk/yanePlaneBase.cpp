#include "stdafx.h"
#include "yanePlaneBase.h"
#include "yanePlane.h"
#include "yaneFastPlane.h"
#include "yaneDIB32.h"
#include "yaneAppManager.h"

smart_ptr<CPlaneBaseFactory> CPlaneBase::m_pvPlaneFactory;

// @yo2 0x00544d80 cg
CPlaneBase* CPlaneBase::CreatePlane(void){
//	生成関数。現在CDirectDrawを使っているのかCDIBDrawを使っているのかに応じて
//	CPlane,CDIB32,CFastPlaneを生成する。

	//	もしFactoryが設定されていれば、これで生成する
	if (m_pvPlaneFactory!=NULL)
		return m_pvPlaneFactory->Create();

	switch(CAppManager::GetDrawType()){
#ifdef USE_DirectDraw
	case 1: return new CPlane;
#endif

#ifdef USE_DIB32
	case 2: return new CDIB32;
#endif

#ifdef USE_FastDraw
	case 3: return new CFastPlane;
#endif
	}
	return NULL; // error..
}

// @yo2 0x00544e70 vt
LRESULT CPlaneBase::BltNaturalPos(CPlaneBase* lpSrc,int x,int y,int nMode,int nFade){
	//	nMode == ベース位置(0:画像中心 1:左上 2:右上 3:左下 4:右下)
	if (lpSrc==NULL) return -1;

	//	サイズ取得
	int sx,sy;
	lpSrc->GetSize(sx,sy);

	switch (nMode){	//	フェードレベル
	case 0: return BltNatural(lpSrc,x-(sx>>1),y-(sy>>1)	,nFade);
	case 1: return BltNatural(lpSrc,x	,y				,nFade);
	case 2: return BltNatural(lpSrc,x-sx,y				,nFade);
	case 3: return BltNatural(lpSrc,x	,y-sy			,nFade);
	case 4: return BltNatural(lpSrc,x-sx,y-sy			,nFade);
	}
	return -2;	//	なんや？nMode範囲外
}

///////////////////////////////////////////////////////////////////////
//	サーフェースのバックアップを作成して返す
// @yo2 0x00544fe0 manual
smart_ptr<CPlaneBase> CPlaneBase::GetBackup(void){
	smart_ptr<CPlaneBase> vPlane(CreatePlane(),true);
	int sx,sy;
	GetSize(sx,sy);
	vPlane->CreateSurface(sx,sy);
	vPlane->BltFast(this,0,0);
	return vPlane;
}

///////////////////////////////////////////////////////////////////////
#ifdef USE_DirectDraw
CPlaneBase* CPlaneBaseFactoryForCPlane::Create() { return new CPlane; }
#endif

#ifdef USE_FastDraw
// @yo2 0x00545160 manual
CPlaneBase* CPlaneBaseFactoryForCFastPlane::Create() { return new CFastPlane; }
#endif

#ifdef USE_DIB32
// @yo2 0x005451e0 manual
CPlaneBase* CPlaneBaseFactoryForCDIB32::Create() { return new CDIB32; }
#endif
