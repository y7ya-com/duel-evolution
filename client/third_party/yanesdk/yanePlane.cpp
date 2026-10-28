
#include "stdafx.h"

#ifdef USE_DirectDraw

#include "yanePlane.h"
#include "yaneWindow.h"
#include "yaneDirectDraw.h"
#include "yaneGraphicLoader.h"
#include "yaneDIBitmap.h"
#include "yaneDIB32.h"
#include "yaneAppManager.h"
#include "yaneAppInitializer.h"

//////////////////////////////////////////////////////////////////////////////
//	メモリチェック機構（'00/09/09追加）
//
//		CPlaneのうち、ビデオメモリをlockする転送（CPlaneの拡縮ｏｒブレンド系）は、
//		lockしたビデオメモリ外の領域にアクセスしていても、メモリエラーにはならない
//		ので、メモリチェック機構が必要である。
//
//		以下のVRAM_MEMORY_CHECKのdefineを有効にすると、強力なメモリチェックを行なう。
//		（もちろん、その分遅くなる）
//		挙動がおかしければdebug時に使って確認してみると良い。

#ifdef _DEBUG
		#define VRAM_MEMORY_CHECK
	//	↑このdefineを有効にする
#endif

//////////////////////////////////////////////////////////////////////////////

//	static members..
set<CPlane*>	CPlane::m_lpPlaneList;

//////////////////////////////////////////////////////

CPlane::CPlane(void){
	m_nSizeX	=	0;
	m_nSizeY	=	0;
	m_lpSurface	=	NULL;
	m_lpPalette	=	NULL;
	m_nSurfaceRef=	0;

	ResetColorKey();
	m_hDC		=	NULL;
	m_bUseSystemMemory	= false;
	m_bOwnerDraw=	false;
	m_bBitmap	=	false;
	m_bHybrid	=	false;	//	これがtrueであればSurfaceのduplicateはしない
	
	m_FillColor	=	0;
	m_dwFillColor=	0;
	
	//	本来、この部分、他スレッドからの排他制御しないといけないが
	//	マルチスレッド非対応ということで...
	m_lpPlaneList.insert(this);
}

CPlane::~CPlane(){
	m_lpPlaneList.erase(this);
	Release();
}

void	CPlane::ReleaseDDSurface(void){
	//	参照カウントつきのリリース
	if (m_lpSurface!=NULL || m_lpPalette!=NULL) {
		WARNING(m_nSurfaceRef==0,"CPlane::ReleaseDDSurfaceで参照カウント異常")
		if (--m_nSurfaceRef==0){
			RELEASE_SAFE(m_lpSurface);
			RELEASE_SAFE(m_lpPalette);
		} else {
			//	共有しているサーフェースを探して、その参照カウントを引き下げる
			for (set<CPlane*>::iterator it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
				if ((*it!=this) && ((*it)->m_lpSurface == m_lpSurface)) {
					(*it)->m_nSurfaceRef--;
				}
			}
			//	他のプレーンがまだ使っているので解放はしない
			m_lpSurface = NULL;
			m_lpPalette = NULL;
		}
	}
	m_nSurfaceRef = 0;
}

LRESULT	CPlane::Release(void){
	ReleaseDDSurface();
	m_szBitmapFile.erase();
	m_szBitmapFile2.erase();
	m_nSizeX	=	0;
	m_nSizeY	=	0;
	m_bOwnerDraw=	false;	//	ここで戻しておけばＯＫ
	m_bBitmap	=	false;	//	ここで戻しておけばＯＫ
	return 0;
}

void	CPlane::GetSize(int &x,int &y){
	x = m_nSizeX;
	y = m_nSizeY;
}

//	サーフェースのロストに対する復帰処理
LRESULT	CPlane::Restore(void){
	LRESULT lr = 0;
	if (m_lpSurface!=NULL){
		if ((!m_lpSurface->IsLost()) && (!m_bUseSystemMemory)) return 0;	//	Lostしてないよー
		//	⇒システムメモリ上のサーフェースは、ロストしない＾＾；
		//	ので、ロストしていなくとも、ロストしたとして扱う必要がある
		//	実際のところ、ビデオメモリに確保したつもりが、システムメモリに
		//	確保されていて、ロストしないってことがありうるのだが．．
		//	そのへんは無視。文句あるならCFastPlane使ってちょ＾＾；

		//	ビットマップファイルならばそれを復元する
		if (m_bBitmap){
			if (m_bBitmapW){
				if (GetBpp()==8) {
					lr = InnerLoad(m_szBitmapFile,m_bLoadPalette);
				} else {
					lr = InnerLoad(m_szBitmapFile2,m_bLoadPalette);
				}
			} else {
				lr = InnerLoad(m_szBitmapFile,m_bLoadPalette);
			}
		}
		//	現在の画面モードに合わせてFillColorを設定しなおす
		SetFillColor(m_FillColor);
		//	オーナードローならば、それを復元する
		if (m_bOwnerDraw) {
			lr |= OnDraw();	//	委譲する
		}
	}
	return lr;
}

LRESULT CPlane::RestoreAll(void){ // 全プレーンのリロード
	for (set<CPlane*>::iterator it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
		//	パレットのリアライズを先行して行なう
		if ((*it)->m_bLoadPalette) {
			(*it)->Restore();	//	こいつがパレットのリアライズを行なう
		}
	}
	
	//	ToDo : ここでパレットのフラッシュを行なわなくてはならない

	for (it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
		(*it)->Restore();
	}
	//	とりあえず画面表示しないといけない＾＾
	return 0;
}

LRESULT	CPlane::OnDraw(void){
	return 0;
}

void	CPlane::ResetColorKey(void){
	m_bUsePosColorKey	= true;
	m_nCX = m_nCY = 0;
}

LRESULT CPlane::Load(string szBitmapFileName,bool bLoadPalette){
	ResetColorKey();
	m_bBitmapW = false;
	m_szBitmapFile = szBitmapFileName;
	m_bLoadPalette = bLoadPalette;
	// あとでRestoreできるようにファイル名を格納しておく。
	return InnerLoad(szBitmapFileName,bLoadPalette);
}

LRESULT CPlane::LoadW(string szBitmapFileName256,string szBitmapFileNameElse
	,bool bLoadPalette){
	ResetColorKey();
	m_bBitmapW = true;
	m_szBitmapFile = szBitmapFileName256;
	m_szBitmapFile2 = szBitmapFileNameElse;
	m_bLoadPalette = bLoadPalette;
	// あとでRestoreできるようにファイル名を格納しておく。
	if (GetBpp()==8) {
		return InnerLoad(szBitmapFileName256,bLoadPalette);
	} else {
		return InnerLoad(szBitmapFileNameElse,bLoadPalette);
	}
}

//	ファイル名を返す
string	CPlane::GetFileName(void) const{
	if (m_bBitmapW && !(GetBpp()==8)) {
		return m_szBitmapFile2;
	}
	return m_szBitmapFile;
}

bool CPlane::CheckDuplicate(string szFileName){
	//	他のサーフェースから複製可能か調べ、複製可能であれば行なう
	if (m_bHybrid) return false;	//	ハイブリッドプレーンならば複製はしない

	return false;

	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();
	if (lpDraw==NULL) return false;	//	なんじゃそりゃ＾＾

	ReleaseDDSurface();
//	RELEASE_SAFE(m_lpSurface);	//	自分のサーフェース解放してから..

	for (set<CPlane*>::iterator it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
		if ((*it!=this) && (*it)->IsLoaded()
			&& ((*it)->GetFileName() == szFileName) && (!(*it)->m_bHybrid)){
//			if (lpDraw->DuplicateSurface((*it)->m_lpSurface,&m_lpSurface)==DD_OK){
				//	サーフェース情報等すべてコピーする。
				m_nSizeX			= (*it)->m_nSizeX;
				m_nSizeY			= (*it)->m_nSizeY;

				//	いくつかのパラメータをセットする
				m_bBitmap	=	true;
				SetColorKey();	//	デュプリ相手先のカラーキー情報を潰すことになるが．．

				//	自前で参照カウントを調べる
				m_lpSurface			= (*it)->m_lpSurface;
				m_lpPalette			= (*it)->m_lpPalette;
				m_nSurfaceRef		= (*it)->m_nSurfaceRef;

				//	共有しているサーフェースを探して、その参照カウントを引き上げる(自分も含む)
				for (set<CPlane*>::iterator it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
					if ((*it)->m_lpSurface == m_lpSurface) {
						(*it)->m_nSurfaceRef++;
					}
				}

				return true;	//	duplicate終了！
//			}
		}
	}
	return false;
}

////////////////////////////////////////////////////////////////////////////////////

void	CPlane::ClearMSB(void){

	/*
		驚くべきことに、アイオーデータのGA-SV4シリーズでは、
		32bppモードにおいて、Clearで完全にメモリ領域は０になっているのに、
		RenderでゴミがMSBに書き込まれる。この画像読み込みは、HDC間接で
		書き込んでいるわけで、HDCの構造体に嘘が含まれているということになる。
		そこで画像読み込み後、MSBをクリアするが、HDCを取得して描画するごとに
		嘘が乗り上げてくるということを意味する。これは、ひどいです。
		これ以上は、ビデオカード側のドライバのバグだと言えます。

													やねうらお '00/10/04
	*/

	if (GetBpp()==32){
		DDSURFACEDESC dddesc;
		ZERO(dddesc);
		dddesc.dwSize = sizeof(dddesc);
		LRESULT hres;
		while ((hres = GetSurface()->Lock(NULL, &dddesc, 0, NULL)) == DDERR_WASSTILLDRAWING)
		;
		if (hres !=DD_OK){
			Err.Out("CPlane::ClearMSBでSurfaceのLockに失敗");
		}
		if ((dddesc.ddpfPixelFormat.dwRGBBitCount)==32) {
			LONG lPitch	 = dddesc.lPitch;
			DWORD RMask, GMask, BMask,RGBMask;
			RMask = dddesc.ddpfPixelFormat.dwRBitMask;
			GMask = dddesc.ddpfPixelFormat.dwGBitMask;
			BMask = dddesc.ddpfPixelFormat.dwBBitMask;
			RGBMask = RMask | GMask | BMask;
			//	RGBMask以外は0にする。

			for(int y=0;y<dddesc.dwHeight;y++){
				DWORD *p	= (DWORD*)((BYTE*)dddesc.lpSurface + dddesc.lPitch * y);
				for(int x=0;x<dddesc.dwWidth;x++){
					*p = *p & RGBMask;
					p++;
				}
			}
			GetSurface()->Unlock(NULL);
		}
	}
}

//	ビットマップの内部的なロード。格納ファイル名には影響しない
LRESULT	CPlane::InnerLoad(string szFileName,bool bLoadPalette){
//	m_bOwnerDraw=	false;
	m_bBitmap	=	false;

	//	Duplicateで済むか？
	if (CheckDuplicate(szFileName)) return 0;

	CFile file;
	if (file.Read(szFileName)) return 1;
	
	auto_ptrEx<CGraphicLoader> gl(CGraphicLoader::GetPrototypeFactory()->CreateInstance());
	if (gl->LoadPicture(file)) return 2;

	LONG sx,sy;
	if (gl->GetSize(sx,sy)) return 3;
	if (InnerCreateSurface(sx,sy)) return 4;

	HDC hdc = GetDC();
	if (hdc == NULL) return 5;
	if (gl->Render(hdc)) { ReleaseDC(); return 6; }
	ReleaseDC();
	if (gl->ReleasePicture()) return 7;

	ClearMSB();

	SetColorKey();	//	復帰．．．

	m_bBitmap	=	true;
	return 0;
}

HDC CPlane::GetDC(void){
	if (m_hDC!=NULL) {
		Err.Out("CPlane::EndPaintが呼び出されていないのにBeginPaintが呼び出された");
		return NULL;
	}
	if (m_lpSurface==NULL) return NULL;
	if (m_lpSurface->GetDC(&m_hDC)!=DD_OK) return NULL;
	return m_hDC;
}

void CPlane::ReleaseDC(void){
	if (m_hDC==NULL) {
		Err.Out("CPlane::BeginPaintが呼び出されていないのにEndPaintが呼び出された");
		return ;
	}
	if (m_lpSurface==NULL) return ;
	if (m_lpSurface->ReleaseDC(m_hDC)!=DD_OK) return ;
	m_hDC = NULL;
}

LRESULT	CPlane::Save(LPSTR szFileName,LPRECT lpRect){

	HDC hdc = GetDC();
	if (hdc == NULL) return 1;

	RECT rc;
	if (lpRect==NULL) {
		::SetRect(&rc,0,0,m_nSizeX,m_nSizeY);
		lpRect = &rc;
	}

	CDIBitmap dib;
	if (dib.Load(hdc,lpRect)) { ReleaseDC(); return 2;}
	ReleaseDC();
	if (dib.Save(szFileName)) { return 3;}

	return 0;
}

LRESULT CPlane::InnerCreateSurface(int sx,int sy){
//	サイズ指定でプレーン作成
//	RELEASE_SAFE(m_lpSurface);
	ReleaseDDSurface();

	DDSURFACEDESC ddsd;
	ZERO(ddsd);
	ddsd.dwSize = sizeof(ddsd);
	ddsd.dwFlags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH;

	//	強制的にシステムメモリを使うオプション
	if (m_bUseSystemMemory) {
		ddsd.ddsCaps.dwCaps = DDSCAPS_OFFSCREENPLAIN | DDSCAPS_SYSTEMMEMORY;
	} else {
		ddsd.ddsCaps.dwCaps = DDSCAPS_OFFSCREENPLAIN;
	}

	// サイズを保存しておく
	m_nSizeX = ddsd.dwWidth	 = sx;
	m_nSizeY = ddsd.dwHeight = sy;

	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;
	if (lpDraw->CreateSurface(&ddsd,&m_lpSurface,NULL)!=DD_OK){
		Err.Out("CPlane::CreateSurfaceのCreateSurfaceに失敗");
		return 2; // あじゃー
	}

	m_nSurfaceRef = 1;	//	参照カウントの設定＾＾

	Clear();	//	念のためクリアしておく(最上位を0にするため)
	return 0;
}

LRESULT CPlane::CreateSurface(int sx,int sy,bool bYGA){
	//	普通にCreateSurfaceすると、それは間違いなくオーナードロープレーンである
	m_bOwnerDraw	= false;
	m_bBitmap		= false;
	ResetColorKey();
	if (bYGA) return -1;	//	YGAサーフェースなんぞ言うものは無い
	LRESULT lr = InnerCreateSurface(sx,sy);
	if (lr) return lr;
	SetColorKey();
	m_bOwnerDraw	= true;

	//	CreateSurfaceしてるんだから、FillColorはリセットすべき '00/09/09
	SetFillColor(0);

	return 0;
}

//	プライマリサーフェースの生成
LRESULT	CPlane::CreatePrimary(bool& bUseFlip,int nSx,int nSy){
	Release();
	ResetColorKey();
	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;
	if (!CAppManager::GetMyDirectDraw()->IsFullScreen()) bUseFlip = false;

sur_retry: ;
	DDSURFACEDESC ddsd;
	ZERO(ddsd);
	ddsd.dwSize = sizeof(ddsd);

	if (bUseFlip) {
		ddsd.dwFlags = DDSD_CAPS | DDSD_BACKBUFFERCOUNT;
		ddsd.ddsCaps.dwCaps = DDSCAPS_PRIMARYSURFACE
			| DDSCAPS_FLIP
			| DDSCAPS_COMPLEX;
		ddsd.dwBackBufferCount = 1;
	} else {
		ddsd.dwFlags = DDSD_CAPS;
		ddsd.ddsCaps.dwCaps = DDSCAPS_PRIMARYSURFACE;
	}
	if (lpDraw->CreateSurface(&ddsd,&m_lpSurface,NULL)!=DD_OK){
		Err.Out("CPlane::CreatePrimaryに失敗");
		if (bUseFlip) {
			bUseFlip=false;
			// Flipping Surfaceはビデオメモリ上に配置する必要があるため、
			// Createにミスしたとも考えられる
			goto sur_retry;
		}
		return 1; // あじゃー
	}
	//	ここでコピーしておく
	if (nSx && nSy) {
		m_nSizeX = nSx; m_nSizeY = nSy;	//	サイズはこれを採用
	} else {
		CAppManager::GetMyDirectDraw()->GetSize(m_nSizeX,m_nSizeY);
	}

	m_nSurfaceRef = 1;		//	参照カウント足しておかないとうまく解放されない
	m_bOwnerDraw = true;	//	これをOnにしないとRestoreされてしまう
	return 0;
}

//	セカンダリサーフェースの生成
LRESULT CPlane::CreateSecondary(CPlane*lpPrimary,bool& bUseFlip){
	Release();
	ResetColorKey();

	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;

sur_retry: ;
	if (bUseFlip) {
		// flipを使う以上、システムメモリにバッファを確保するのはまずい．．．
		DDSCAPS ddscaps;		
		ZERO(ddscaps);	//	いらないけど一応ね
		if (m_bUseSystemMemory) {
			ddscaps.dwCaps = DDSCAPS_BACKBUFFER | DDSCAPS_SYSTEMMEMORY;
		} else {
			ddscaps.dwCaps = DDSCAPS_BACKBUFFER;
		}
		if (lpPrimary->GetSurface()->GetAttachedSurface(&ddscaps,&m_lpSurface)!=DD_OK){
			Err.Out("CPlane::CreateSecondaryのGetAttachedSurfaceに失敗");
			// ほやから言わんこっちゃない！
			bUseFlip = false;
			goto sur_retry;
		}
		lpPrimary->GetSize(m_nSizeX,m_nSizeY);
	} else {
		DDSURFACEDESC ddsd;
		ZERO(ddsd);
		ddsd.dwSize = sizeof(ddsd);
		ddsd.dwFlags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH;
		if (m_bUseSystemMemory) {		
			ddsd.ddsCaps.dwCaps = DDSCAPS_OFFSCREENPLAIN | DDSCAPS_SYSTEMMEMORY;
		} else {
			ddsd.ddsCaps.dwCaps = DDSCAPS_OFFSCREENPLAIN;
		}
		lpPrimary->GetSize(m_nSizeX,m_nSizeY);
		ddsd.dwWidth  = m_nSizeX;
		ddsd.dwHeight = m_nSizeY;
		if (lpDraw->CreateSurface(&ddsd,&m_lpSurface,NULL)!=DD_OK){
			Err.Out("CPlane::CreateSecondaryに失敗");
			return 1; // あじゃー
		}
	}

	//	一応クリアしとこか...
	Clear();

	m_nSurfaceRef = 1;		//	参照カウント足しておかないとうまく解放されない
	m_bOwnerDraw = true;
	return 0;
}

///////////////////////////////////////////////////////////////////////////////

LPDIRECTDRAWSURFACE CPlane::GetSurface(void){
	return m_lpSurface;
}

LPDIRECTDRAWPALETTE CPlane::GetPalette(void){
	return m_lpPalette;
}

LRESULT CPlane::SetSystemMemoryUse(bool bEnable){
	m_bUseSystemMemory = bEnable;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

LRESULT CPlane::SetColorKey(void){
	if (m_bUsePosColorKey) {	// 位置指定型透過キー
		if (SetColorKey(m_nCX,m_nCY)) {
			Err.Out("CPlane::位置指定型透過キーの設定に失敗");
			// エラーとはせず
		}
	} else {	// 色指定型透過キー
	// ディフォルトでは、とりあえずrgb = 0を透過キーとして設定
	// （不要のときはBlt時に透過キーを無視するものを使えば良い）
		if (SetColorKey(m_ColorKey)) {
			Err.Out("CPlane::色指定型透過キーの設定に失敗");
			// エラーとはせず
		}
	}
	return 0;
}

LRESULT CPlane::SetColorKey(int r,int g,int b){
	return SetColorKey(RGB(r,g,b));
}

LRESULT CPlane::SetColorKey(COLORREF rgb)
{
	if (m_lpSurface==NULL) return -1;

	DDCOLORKEY			ddck;

	ddck.dwColorSpaceLowValue  = DDColorMatch(m_lpSurface,rgb); // サーフェース上のどの点か調べる
	ddck.dwColorSpaceHighValue = ddck.dwColorSpaceLowValue;

	m_bUsePosColorKey = false;
	m_ColorKey = rgb;	// これ保存しとかんと復帰でけへん:p

	return m_lpSurface->SetColorKey(DDCKEY_SRCBLT, &ddck);
}

DWORD CPlane::DDColorMatch(LPDIRECTDRAWSURFACE pdds, COLORREF rgb)
{
	// ddutil.cppを参考にしてはいるが、DirectDrawPaletteは、GDIを経由しないため
	// GDIのGetPixelで嘘が返ってくることがある。
	HDC hdc;
	DWORD dw = CLR_INVALID;
	DDSURFACEDESC ddsd;
	LRESULT hres;
	DWORD dwRGB;

	// ２５６色モードのために、あらかじめLOCKして値を保存する
	ddsd.dwSize = sizeof(ddsd);
	while ((hres = pdds->Lock(NULL, &ddsd, 0, NULL)) == DDERR_WASSTILLDRAWING)
	;

	if (hres == DD_OK) {
		dwRGB = *(DWORD *)ddsd.lpSurface;
		pdds->Unlock(NULL);
	}

	//	GDIでSetPixelして、そいつを直にLockして読み込むことでパレットの割り当て状況を知る

	if (rgb != CLR_INVALID && pdds->GetDC(&hdc) == DD_OK){
		::SetPixel(hdc, 0, 0, rgb);				// set our value
		pdds->ReleaseDC(hdc);
	}

	ddsd.dwSize = sizeof(ddsd);
	while ((hres = pdds->Lock(NULL, &ddsd, 0, NULL)) == DDERR_WASSTILLDRAWING)
	;

	if (hres == DD_OK) {
		dw	= *(DWORD *)ddsd.lpSurface;						// get DWORD
		if(ddsd.ddpfPixelFormat.dwRGBBitCount < 32)
			dw &= (1 << ddsd.ddpfPixelFormat.dwRGBBitCount)-1;	// mask it to bpp
		*(DWORD *)ddsd.lpSurface = dwRGB;

		//	しかしこれでは、32bppにおける最上位バイトが不定であるボードなどでは抜き色を
		//	誤る可能性がある...(ビデオカードのbug)	fixed by やねうらお ('00/08/02)

		if (ddsd.ddpfPixelFormat.dwRGBBitCount != 8){
			//	しかし256色モードでは、RGBマスクは嘘になるのだ＾＾;
			//		fixed by JesterSera ('01/02/22)
			DWORD RMask = ddsd.ddpfPixelFormat.dwRBitMask;
			DWORD GMask = ddsd.ddpfPixelFormat.dwGBitMask;
			DWORD BMask = ddsd.ddpfPixelFormat.dwBBitMask;
			DWORD RGBMask = RMask | GMask | BMask;
			dw &= RGBMask;
		}

		pdds->Unlock(NULL);
	} else {
		Err.Out("DDColorMatch::Surfaceのロックに失敗...");
	}

	return dw;
}

LRESULT CPlane::SetColorKey(int x,int y){	// (x,y)の点を透過キーに設定する
	if (m_lpSurface==NULL) return -1;

	DDCOLORKEY			ddck;

	ddck.dwColorSpaceLowValue  = DDGetPixel(m_lpSurface,x,y);
	ddck.dwColorSpaceHighValue = ddck.dwColorSpaceLowValue;

	m_bUsePosColorKey = true;
	m_nCX = x;	// これ保存しとかんと復帰でけへん
	m_nCY = y;

	return m_lpSurface->SetColorKey(DDCKEY_SRCBLT, &ddck);
}

DWORD CPlane::DDGetPixel(LPDIRECTDRAWSURFACE pdds,int x,int y){ // 特定の点の色を調べる
	// 直にSurfaceをLock
	DDSURFACEDESC dddesc;
	ZERO(dddesc);
	dddesc.dwSize = sizeof(dddesc);
	if (pdds->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::DDGetPixelでSurfaceのLockに失敗");
		return CLR_INVALID;
	}

	//	前を引き継ぐので範囲外チェックがまず必要
	if (x<0 || x>=dddesc.dwWidth || y<0 || y>=dddesc.dwHeight){
		pdds->Unlock(NULL);
		return CLR_INVALID;
	}

	int bpp;
	bpp = dddesc.ddpfPixelFormat.dwRGBBitCount;

	void *p = dddesc.lpSurface;
	LONG lPitch	 = dddesc.lPitch;

	DWORD dw;
	switch (bpp) {
	case 8:
		dw = *((BYTE*)p + x + y * lPitch);
		break;
	case 16:
		dw = *(WORD*)((BYTE*)p + x*2 + y * lPitch);
		break;
	case 24:
		//	これがメモリ保護違反になりうる
		//	dw = *(DWORD*)((BYTE*)p + x*3 + y * lPitch) & 0xffffff;
		{
			BYTE* lp = (BYTE*)p + x*3 + y * lPitch;
			dw = (DWORD)*lp + (((DWORD)lp[1])<<8) + (((DWORD)lp[2])<<16);
		}
		break;
	case 32:
		dw = *(DWORD*)((BYTE*)p + x*4 + y * lPitch);
		break;
	default:
		dw = CLR_INVALID; // unsupported!!
	}

	//	しかしこれでは、32bppにおける最上位バイトが不定であるボードなどでは抜き色を
	//	誤る可能性がある...(ビデオカードのbug)	fixed by やねうらお ('00/10/02)
	if (bpp != 8){
		//	256色モードでは、RGBマスクは嘘になるのだ＾＾;
		//		fixed by JesterSera ('01/01/19)
		DWORD RMask = dddesc.ddpfPixelFormat.dwRBitMask;
		DWORD GMask = dddesc.ddpfPixelFormat.dwGBitMask;
		DWORD BMask = dddesc.ddpfPixelFormat.dwBBitMask;
		DWORD RGBMask = RMask | GMask | BMask;
		if (dw!=CLR_INVALID){
			dw &= RGBMask;
		}
	}

	pdds->Unlock(NULL);

	return dw;
}

LRESULT		CPlane::SetFillColor(COLORREF c){
	if (m_lpSurface==NULL) return -1;
	m_FillColor = c;
	m_dwFillColor = DDColorMatch(m_lpSurface,c);
	if (m_dwFillColor == CLR_INVALID) return 1;
	return 0;
}

DWORD		CPlane::GetFillColor(void){
	return m_dwFillColor;
}

LRESULT		CPlane::Clear(LPRECT lpRect){
	if (m_lpSurface==NULL) return -1;
	DDBLTFX fx;
	ZERO(fx);
	fx.dwSize = sizeof(fx);
	fx.dwFillColor = m_dwFillColor;
	return m_lpSurface->Blt(lpRect,NULL,NULL,DDBLT_COLORFILL|DDBLT_WAIT,&fx);
}

//////////////////////////////////////////////////////////////////////////////

// ディスプレイの色数を調べるのにGetDisplayModeは使ってはいけない
int		CPlane::GetBpp(void){
	return CBppManager::GetBpp();
}

void	CPlane::InnerGetBpp(void) {
	CBppManager::Reset();
}

void	CPlane::SwapPlane(CPlane*lpPlane){
	//	一時的に入れ替えるのだ＾＾
	Swap(m_nSizeX,lpPlane->m_nSizeX);
	Swap(m_nSizeY,lpPlane->m_nSizeY);
	Swap(m_lpSurface,lpPlane->m_lpSurface);
}

//////////////////////////////////////////////////////////////////////////////
//	CPlane <--> CDIB32
#ifdef USE_DIB32

LRESULT		CPlane::Blt(CDIB32*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipRect){
	if (m_lpSurface==NULL) return -1;
	return lpSrc->BltToPlane(this,x,y,lpSrcRect,lpClipRect);
}

LRESULT		CPlane::BltTo(CDIB32*lpDst,int x,int y,LPRECT lpSrcRect,LPRECT lpClipRect){
	if (m_lpSurface==NULL) return -1;
	return lpDst->BltFromPlane(this,x,y,lpSrcRect,lpClipRect);
}

#endif
//////////////////////////////////////////////////////////////////////////////
//	プレーン間転送系の実装
//////////////////////////////////////////////////////////////////////////////

//	general clipping algorithms by yaneurao(M.Isozaki)
// たかだか矩形をBltするのにClipperなんてしゃらくせー！
// 手動でClipしたほーがよっぽど速い！(BltFast使えるし)
// 自前で転送するほうがDirectDrawClipperよりよっぽど速い
// 転送先Rectの算出
#define DRAW_CLIPPER \
	RECT clip;									\
	if (lpClipDstRect==NULL){					\
		::SetRect(&clip,0,0,m_nSizeX,m_nSizeY);	\
	} else {									\
		clip = *lpClipDstRect;					\
	}											\
	RECT sr;									\
	if (lpSrcRect==NULL){						\
		::SetRect(&sr,0,0,lpSrc->m_nSizeX,lpSrc->m_nSizeY);	\
	} else {									\
		sr = *lpSrcRect;						\
	}											\
	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();	\
	if (lpDraw==NULL) return 1;									\
	if (m_lpSurface==NULL) return 2;							\
	LPDIRECTDRAWSURFACE lpSrcSurface = lpSrc->GetSurface();		\
	if (lpSrcSurface==NULL) return 3;							\
	int x2,y2;													\
	x2 = x + sr.right - sr.left; /* x + Width  */				\
	y2 = y + sr.bottom - sr.top; /* y + Height */				\
	if (x2<clip.left || y2<clip.top								\
		|| x>=clip.right || y>=clip.bottom) return 0;  /* 画面外 */ \
	int t;														\
	t = clip.left-x;										\
	if (t>0)	{ sr.left	+= t;	x = clip.left;	}		\
	t = clip.top -y;										\
	if (t>0)	{ sr.top	+= t;	y = clip.top;	}		\
	t = x2-clip.right;										\
	if (t>0)	{ sr.right	-= t;	x2= clip.right;	}		\
	t = y2-clip.bottom;										\
	if (t>0)	{ sr.bottom	-= t;	y2= clip.bottom;}		\
	if (sr.right<=sr.left || sr.bottom<=sr.top) return 0;	// invalid rect
//	ここまで
////////////////////////////////////////////////////////////////////

LRESULT		CPlane::Blt(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipDstRect){
// 矩形の転送。ただし、この転送元矩形は点(lpSrcRect->right,lpSrcRect->bottom)は含まないことに注意！
	if (m_lpSurface==NULL) return -1;
	
	DRAW_CLIPPER;

	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::Bltの転送が転送元矩形外から行なわれています");
	return m_lpSurface->BltFast(x,y,lpSrcSurface,&sr,DDBLTFAST_WAIT | DDBLTFAST_SRCCOLORKEY);
}

LRESULT		CPlane::BltFast(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPRECT lpClipDstRect){
// 矩形の転送。ただし、この転送元矩形は点(lpSrcRect->right,lpSrcRect->bottom)は含まないことに注意！
	if (m_lpSurface==NULL) return -1;

	DRAW_CLIPPER;

	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BltFastの転送が転送元矩形外から行なわれています");
	return m_lpSurface->BltFast(x,y,lpSrcSurface,&sr,DDBLTFAST_WAIT);
}

LRESULT		CPlane::BlendBlt(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	if (m_lpSurface==NULL) return -1;

	DRAW_CLIPPER;

	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BlendBltの転送が転送元矩形外から行なわれています");

	//	ブレンド比率の上界チェック
	WARNING(ar+br>256,"CPlane::BlendBltのar+brが上界を越えています");
	WARNING(ag+bg>256,"CPlane::BlendBltのag+bgが上界を越えています");
	WARNING(ab+bb>256,"CPlane::BlendBltのab+bbが上界を越えています");

	DWORD	dwColorKey;
	DDCOLORKEY	ddck;
	if (lpSrcSurface->GetColorKey(DDCKEY_SRCBLT, &ddck)==DD_OK) {;	// 透過キーを得る
		dwColorKey =	ddck.dwColorSpaceLowValue;
	} else {
		dwColorKey = CLR_INVALID; // おかしいやないか
	}

	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BlendBltでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);
	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BlendBltでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitch	 = dddesc.lPitch;
	LONG lPitch2 = dddesc2.lPitch;

	switch (dddesc.ddpfPixelFormat.dwRGBBitCount) {
	case 4:	//	16色非対応
	case 8:	//	256色非対応
		break;

	case 16: { // 65536色モード
		WORD RMask, GMask, BMask,RGBMask;

		RMask = (WORD)dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = (WORD)dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = (WORD)dddesc.ddpfPixelFormat.dwBBitMask;
		RGBMask = RMask | GMask | BMask;

		WORD *p	 = (WORD*)dddesc.lpSurface;
		WORD *p2 = (WORD*)dddesc2.lpSurface;

		p  = (WORD*)((BYTE*)p +(lPitch *y));	// セカンダリの転送開始y座標
		p2 = (WORD*)((BYTE*)p2+(lPitch2*sr.top)) + sr.left - x;	// こうやね

		for(int y3=y;y3<y2;y3++) {
			for (int x3=x;x3<x2;x3++) {
				WORD pixel, px,px2;

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
				px2= p2[x3];
				if ((px2&RGBMask)!=(dwColorKey&RGBMask)
					|| (dwColorKey==CLR_INVALID)){	// 転送元カラーキー

#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
					px = p [x3];
					pixel  = ((WORD)((((px2&RMask)*ar)+((px&RMask)*br))>>8)&RMask);
					pixel |= ((WORD)((((px2&GMask)*ag)+((px&GMask)*bg))>>8)&GMask);
					pixel |= ((WORD)((((px2&BMask)*ab)+((px&BMask)*bb))>>8)&BMask);
					p[x3] = pixel;
				}
			}
			p  = (WORD*)((BYTE*)p +lPitch ); // １ラスタ分の増量
			p2 = (WORD*)((BYTE*)p2+lPitch2);
			// BYTEにキャストしておかないと計算間違う:p
		}
	} break;

	case 24: {
		BYTE *p	 = (BYTE*)dddesc.lpSurface;
		BYTE *p2 = (BYTE*)dddesc2.lpSurface;

		p  = (BYTE*)p +(lPitch*y);	// セカンダリの転送開始y座標
		p2 = (BYTE*)p2+(lPitch2*sr.top) + (sr.left - x)*3; // こうやね

		int ox=x*3,ox2=x2*3;

		BYTE r,g,b;
		r = dwColorKey & 0xff;
		g = (dwColorKey >> 8) & 0xff;
		b = (dwColorKey >> 16) & 0xff;
		for(int y3=y;y3<y2;y3++) {
			for (int x3=ox;x3<ox2;) {

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
				if (p2[x3]!=r || p2[x3+1]!=g || p2[x3+2]!=b ||
					(dwColorKey==CLR_INVALID)) {
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
					p[x3] = ((p2[x3]*ar)+(p[x3]*br))>>8; x3++;
					p[x3] = ((p2[x3]*ag)+(p[x3]*bg))>>8; x3++;
					p[x3] = ((p2[x3]*ab)+(p[x3]*bb))>>8; x3++;
				} else {
					x3+=3;
				}
			}
			p  = (BYTE*)(p +lPitch ); // １ラスタ分の増量
			p2 = (BYTE*)(p2+lPitch2);
			// BYTEにキャストしておかないと計算間違う:p
		}
	} break;

	case 32: {
		DWORD RMask, GMask, BMask,RGBMask;

		RMask = dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = dddesc.ddpfPixelFormat.dwBBitMask;
		RGBMask = RMask | GMask | BMask;

		DWORD *p  = (DWORD*)dddesc.lpSurface;
		DWORD *p2 = (DWORD*)dddesc2.lpSurface;

		p  = (DWORD*)((BYTE*)p +(lPitch *y));	// セカンダリの転送開始y座標
		p2 = (DWORD*)((BYTE*)p2+(lPitch2*sr.top)) + sr.left - x; // こうやね

		for(int y3=y;y3<y2;y3++) {
			for (int x3=x;x3<x2;x3++) {
				DWORD pixel, px,px2;

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
				px2 = p2[x3];
				if ((px2&RGBMask)!=(dwColorKey&RGBMask)
					|| (dwColorKey==CLR_INVALID)){

#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltの違反");
			break;
		}
	}
#endif
					px	= p [x3];
					// 桁あふれ起こすかー？シャレならんなぁ...
					// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
					pixel  = (DWORD)((((DWORDLONG)(px2&RMask)*ar)+((DWORDLONG)(px&RMask)*br))>>8)&RMask;
					pixel |= (DWORD)((((DWORDLONG)(px2&GMask)*ag)+((DWORDLONG)(px&GMask)*bg))>>8)&GMask;
					pixel |= (DWORD)((((DWORDLONG)(px2&BMask)*ab)+((DWORDLONG)(px&BMask)*bb))>>8)&BMask;
					p[x3]  = pixel;
				}
			}
			p  = (DWORD*)((BYTE*)p + lPitch); // １ラスタ分の増量
			p2 = (DWORD*)((BYTE*)p2+lPitch2);
		}

	} break; // end case
	} // end switch
	lpSrcSurface->Unlock(NULL);
	m_lpSurface->Unlock(NULL);

	return 0;
}

LRESULT		CPlane::BlendBltFast(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPRECT lpClipDstRect){
	if (m_lpSurface==NULL) return -1;

	DRAW_CLIPPER;

	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BlendBltの転送が転送元矩形外から行なわれています");

	//	ブレンド比率の上界チェック
	WARNING(ar+br>256,"CPlane::BlendBltのar+brが上界を越えています");
	WARNING(ag+bg>256,"CPlane::BlendBltのag+bgが上界を越えています");
	WARNING(ab+bb>256,"CPlane::BlendBltのab+bbが上界を越えています");

	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BlendBltでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);
	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BlendBltでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitch	 = dddesc.lPitch;
	LONG lPitch2 = dddesc2.lPitch;

	switch (dddesc.ddpfPixelFormat.dwRGBBitCount) {
	case 4:	//	16色非対応
	case 8:	//	256色非対応
		break;

	case 16: { // 65536色モード
		WORD RMask, GMask, BMask,RGBMask;

		RMask = (WORD)dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = (WORD)dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = (WORD)dddesc.ddpfPixelFormat.dwBBitMask;
		RGBMask = RMask | GMask | BMask;

		WORD *p	 = (WORD*)dddesc.lpSurface;
		WORD *p2 = (WORD*)dddesc2.lpSurface;

		p  = (WORD*)((BYTE*)p +(lPitch *y));	// セカンダリの転送開始y座標
		p2 = (WORD*)((BYTE*)p2+(lPitch2*sr.top)) + sr.left - x;	// こうやね

		for(int y3=y;y3<y2;y3++) {
			for (int x3=x;x3<x2;x3++) {
				WORD pixel, px,px2;

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif
				px2= p2[x3];

//				if ((px2&RGBMask)!=(dwColorKey /* &RGBMask*/ )
//					/* || (dwColorKey==CLR_INVALID)*/ ){	// 転送元カラーキー
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif
					px = p [x3];
					pixel  = ((WORD)((((px2&RMask)*ar)+((px&RMask)*br))>>8)&RMask);
					pixel |= ((WORD)((((px2&GMask)*ag)+((px&GMask)*bg))>>8)&GMask);
					pixel |= ((WORD)((((px2&BMask)*ab)+((px&BMask)*bb))>>8)&BMask);
					p[x3] = pixel;
//				}
			}
			p  = (WORD*)((BYTE*)p +lPitch ); // １ラスタ分の増量
			p2 = (WORD*)((BYTE*)p2+lPitch2);
			// BYTEにキャストしておかないと計算間違う:p
		}
	} break;

	case 24: {
		BYTE *p	 = (BYTE*)dddesc.lpSurface;
		BYTE *p2 = (BYTE*)dddesc2.lpSurface;

		p  = (BYTE*)p +(lPitch*y);	// セカンダリの転送開始y座標
		p2 = (BYTE*)p2+(lPitch2*sr.top) + (sr.left - x)*3; // こうやね

		int ox=x*3,ox2=x2*3;

//		BYTE r,g,b;
//		r = dwColorKey & 0xff;
//		g = (dwColorKey >> 8) & 0xff;
//		b = (dwColorKey >> 16) & 0xff;
		for(int y3=y;y3<y2;y3++) {
			for (int x3=ox;x3<ox2;) {
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif

#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif
//				if (p2[x3]!=r || p2[x3+1]!=g || p2[x3+2]!=b
//					/* || (dwColorKey==CLR_INVALID) */ ) {
					p[x3] = ((p2[x3]*ar)+(p[x3]*br))>>8; x3++;
					p[x3] = ((p2[x3]*ag)+(p[x3]*bg))>>8; x3++;
					p[x3] = ((p2[x3]*ab)+(p[x3]*bb))>>8; x3++;
//				} else {
//					x3+=3;
//				}
			}
			p  = (BYTE*)(p +lPitch ); // １ラスタ分の増量
			p2 = (BYTE*)(p2+lPitch2);
			// BYTEにキャストしておかないと計算間違う:p
		}
	} break;

	case 32: {
		DWORD RMask, GMask, BMask,RGBMask;

		RMask = dddesc.ddpfPixelFormat.dwRBitMask;
		GMask = dddesc.ddpfPixelFormat.dwGBitMask;
		BMask = dddesc.ddpfPixelFormat.dwBBitMask;
		RGBMask = RMask | GMask | BMask;

		DWORD *p  = (DWORD*)dddesc.lpSurface;
		DWORD *p2 = (DWORD*)dddesc2.lpSurface;

		p  = (DWORD*)((BYTE*)p +(lPitch *y));	// セカンダリの転送開始y座標
		p2 = (DWORD*)((BYTE*)p2+(lPitch2*sr.top)) + sr.left - x; // こうやね

		for(int y3=y;y3<y2;y3++) {
			for (int x3=x;x3<x2;x3++) {
				DWORD pixel, px,px2;
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(&p2[x3]) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrc->m_nSizeX || y>=lpSrc->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif
				px2 = p2[x3];
//				if ((px2&RGBMask)!=(dwColorKey /* &RGBMask */ )
//					/* || (dwColorKey==CLR_INVALID) */ ){
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(&p[x3]) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastの違反");
			break;
		}
	}
#endif
					px	= p [x3];
					// 桁あふれ起こすかー？シャレならんなぁ...
					// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
					pixel  = (DWORD)((((DWORDLONG)(px2&RMask)*ar)+((DWORDLONG)(px&RMask)*br))>>8)&RMask;
					pixel |= (DWORD)((((DWORDLONG)(px2&GMask)*ag)+((DWORDLONG)(px&GMask)*bg))>>8)&GMask;
					pixel |= (DWORD)((((DWORDLONG)(px2&BMask)*ab)+((DWORDLONG)(px&BMask)*bb))>>8)&BMask;
					p[x3]  = pixel;
//				}
			}
			p  = (DWORD*)((BYTE*)p + lPitch); // １ラスタ分の増量
			p2 = (DWORD*)((BYTE*)p2+lPitch2);
		}

	} break; // end case
	} // end switch
	lpSrcSurface->Unlock(NULL);
	m_lpSurface->Unlock(NULL);

	return 0;
}


////////////////////////////////////////////////////////////////////
//	拡縮込みの転送ルーチン
//		programmed by Tia Deen

//////////////////////////////////////////////////////////////////
#define DRAW_CLIPPER_R \
	RECT clip;													\
	if (lpClipDstRect==NULL){									\
		::SetRect(&clip,0,0,m_nSizeX,m_nSizeY);					\
	} else {													\
		clip = *lpClipDstRect;									\
	}															\
	RECT sr;													\
	if (lpSrcRect==NULL){										\
		::SetRect(&sr,0,0,lpSrc->m_nSizeX,lpSrc->m_nSizeY);		\
	} else {													\
		sr	= *lpSrcRect;										\
	}															\
	RECT dr;													\
	if (lpDstSize==NULL){										\
		/* lpDstSize==NULLならば、dstプレーン全域が対象	 */		\
		::SetRect(&dr,0,0,m_nSizeX,m_nSizeY);					\
	} else {													\
		::SetRect( &dr,x,y,x+lpDstSize->cx,y+lpDstSize->cy );	\
	}															\
	LPDIRECTDRAW lpDraw = CAppManager::GetMyDirectDraw()->GetDDraw();	\
	if (lpDraw==NULL) return 1;									\
	if (m_lpSurface==NULL) return 2;							\
	LPDIRECTDRAWSURFACE lpSrcSurface = lpSrc->GetSurface();		\
	if (lpSrcSurface==NULL) return 3;							\
	/*	ブレゼンハムの初期値を計算する */						\
	int		nInitialX, nInitialY;		/* -DX :　εの初期値 = -DX*/			\
	int		nStepsX,	 nStepsY;		/* SrcXの一回の加算量(整数部)*/			\
	int		nStepX,	 nStepY;			/* SX :　ε+=SX	 */					\
	int		nCmpX,	 nCmpY;				/* DX :　ε>0ならばε-=DXしてね*/	\
	nInitialX = (dr.left - dr.right);							\
	nInitialY = (dr.top	- dr.bottom);							\
	nStepX	= (sr.right	 - sr.left) ;							\
	nStepY	= (sr.bottom - sr.top ) ;							\
	nCmpX = - (nInitialX );										\
	nCmpY = - (nInitialY );										\
	/* invalid rect */											\
	if (nCmpX == 0 || nCmpY == 0) return 4;						\
		/* クリッピングする */									\
		/* this clipping algorithm is thought by yaneurao(M.Isozaki) */	\
		int t;													\
		t = clip.left-dr.left;									\
		if (t>0)	{											\
			nInitialX+=t*nStepX;								\
			if (nInitialX > 0){									\
				int s = nInitialX / nCmpX +1;					\
				sr.left += s;									\
				nInitialX		-= s*nCmpX;						\
			}													\
			dr.left	  = clip.left;								\
		}														\
		t = clip.top -dr.top;									\
		if (t>0)	{											\
			nInitialY+=t*nStepY;								\
			if (nInitialY > 0){									\
				int s = nInitialY / nCmpY +1;					\
				sr.top += s;									\
				nInitialY		-= s*nCmpY;						\
			}													\
			dr.top	= clip.top;									\
		}														\
		t = dr.right-clip.right;								\
		if (t>0)	{											\
			dr.right  = clip.right;								\
/*			int nInitialX2 = nInitialX;							\
			nInitialX2+=(dr.right-dr.left)*nStepX;				\
			if (nInitialX2 > 0){								\
				int s = nInitialX2 / nCmpX + 1;					\
				sr.right = sr.left + s;							\
			}													\
		} else {												\
			sr.right--;											\
*/		}														\
																\
		t = dr.bottom-clip.bottom;								\
		if (t>0)	{ /*m_rcSrcRect.bottom -= t;*/	dr.bottom = clip.bottom;}	\
		/*	invalid rect ? */									\
		if (sr.left >= sr.right ||								\
			sr.top	 >= sr.bottom ||							\
			dr.left >= dr.right ||								\
			dr.top	 >= dr.bottom) return 4;					\
		/*	nStepX < nCmpXを保証する。 */						\
		nStepsX = nStepX/nCmpX;									\
		nStepX -= nCmpX*nStepsX;								\
		nStepsY = nStepY/nCmpY;									\
		nStepY -= nCmpY*nStepsY;								\
		/* どこで１を引くのか分からないので、ここで引くのだ☆ By Tia */\
		nInitialX--;											\
		nInitialY--;											\

// クリッパーはここまで
////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////
//	BltR
//	カラーキー有り、拡縮有り転送
//////////////////////////////////////////////
LRESULT		CPlane::BltR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect)
{
	if (m_lpSurface==NULL) return -1;

	{int		nSsizeX, nSsizeY, nDsizeX, nDsizeY;
	if (lpSrcRect==NULL) {
		nSsizeX = lpSrc->m_nSizeX;
		nSsizeY = lpSrc->m_nSizeY;
	} else {
		nSsizeX = lpSrcRect->right - lpSrcRect->left;
		nSsizeY = lpSrcRect->bottom - lpSrcRect->top;
	}
	if (lpDstSize==NULL) {
		nDsizeX = m_nSizeX;
		nDsizeY = m_nSizeY;
	} else {
		nDsizeX = lpDstSize->cx;
		nDsizeY = lpDstSize->cy;
	}
	if ((nSsizeX == nDsizeX) && (nSsizeY == nDsizeY))
		return CPlane::Blt(lpSrc, x, y, lpSrcRect, lpClipDstRect);
	}
// 初期設定
	// クリッピング処理
	DRAW_CLIPPER_R;
	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BltRの転送が転送元矩形外から行なわれています");

	// カラーキーの取得
	DWORD	dwColorKey;
	DDCOLORKEY	ddck;
	if (lpSrcSurface->GetColorKey(DDCKEY_SRCBLT, &ddck)==DD_OK) {;	// 透過キーを得る
		dwColorKey =	ddck.dwColorSpaceLowValue;
	} else {
		dwColorKey = CLR_INVALID; // おかしいやないか
		//	これ...
	}

	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);
	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitchDst = dddesc.lPitch;
	LONG lPitchSrc = dddesc2.lPitch;

#ifdef VRAM_MEMORY_CHECK
	CPlane* lpSrcOrg = lpSrc;	//	保存しとかなきゃ＾＾；
#endif	

	switch ( dddesc.ddpfPixelFormat.dwRGBBitCount )
	{
		case 4:
			break;

		case 8:
		{
			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;								// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth);							// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			BYTE	nAddPixel = 1;
			BYTE	AddSrcPixel = nStepsX;
			BYTE	AddWidthSrc2 = sr.right - sr.left;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;

			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch);
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
					BYTE	src = *lpSrc;
					// カラーキーか否かの判定
					if ( (src != dwColorKey) || (dwColorKey == CLR_INVALID) ) {
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch);
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
						*lpDst = src;
					}
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 16:
		{
			WORD RGBMask = (WORD)dddesc.ddpfPixelFormat.dwRBitMask |
						   (WORD)dddesc.ddpfPixelFormat.dwGBitMask |
						   (WORD)dddesc.ddpfPixelFormat.dwBBitMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<1);					// ASMで使用する 1ラインのバイト数の設定
			WORD*	lpSrc = (WORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<1)+sr.top*lPitchSrc );	// クリッピング部分のカット
			WORD*	lpDst = (WORD*)((BYTE*)dddesc.lpSurface + (dr.left<<1)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			WORD	nAddPixel = 1 << 1;
			WORD	AddSrcPixel = nStepsX << 1;
			WORD	AddWidthSrc2 = (sr.right - sr.left)<<1;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		colKey = dwColorKey /* & RGBMask*/ ;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				WORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
					WORD	src = *lpSrc;
					// カラーキーか否かの判定
					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) ){
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
						*lpDst = src;
					}
					lpSrc = (WORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (WORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (WORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (WORD*)((BYTE*)lpSrcBack + nAddSrcHeight );		// Xループで進んだ分戻し、y軸の整数部を加算する (Thanks for Tear.)
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (WORD*)((BYTE*)lpSrc + lPitchSrc );			// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (WORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
		case 24:
		{
			BYTE r,g,b;
			b =	 dwColorKey		   & 0xff;
			g = (dwColorKey >> 8 ) & 0xff;
			r = (dwColorKey >> 16) & 0xff;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;							// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth*3);						// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left*3)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left*3)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 * 3;
			DWORD	AddSrcPixel = nStepsX * 3;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)*3;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
					BYTE	srcB, srcG, srcR;
					srcB = *lpSrc;
					srcG = *(lpSrc+1);
					srcR = *(lpSrc+2);
					// カラーキーか否かの判定
					if ( srcR != r || srcG != g || srcB != b || dwColorKey == CLR_INVALID )
					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
						*lpDst	   = srcB;
						*(lpDst+1) = srcG;
						*(lpDst+2) = srcR;
					}
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 32:
		{
			DWORD RGBMask = dddesc.ddpfPixelFormat.dwRBitMask |
							dddesc.ddpfPixelFormat.dwGBitMask |
							dddesc.ddpfPixelFormat.dwBBitMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
			DWORD*	lpSrc = (DWORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<2)+sr.top*lPitchSrc );	// クリッピング部分のカット
			DWORD*	lpDst = (DWORD*)((BYTE*)dddesc.lpSurface + (dr.left<<2)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 << 2;
			DWORD	AddSrcPixel = nStepsX << 2;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)<<2;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		colKey = dwColorKey /* & RGBMask*/ ;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				DWORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
					DWORD	src = *lpSrc;
					// カラーキーか否かの判定
					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) ){
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltRの違反");
			break;
		}
	}
#endif
						*lpDst = src;
					}
					lpSrc = (DWORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (DWORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (DWORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (DWORD*)((BYTE*)lpSrcBack + nAddSrcHeight );	// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (DWORD*)((BYTE*)lpSrc + lPitchSrc );		// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (DWORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
	}
	lpSrcSurface->Unlock( NULL );
	m_lpSurface->Unlock( NULL );


	return 0;
} // BltR


//////////////////////////////////////////////
//	BltFastR
//	カラーキー無し、拡縮有り転送
//////////////////////////////////////////////
LRESULT		CPlane::BltFastR(CPlane*lpSrc,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect)
{
	if (m_lpSurface==NULL) return -1;

	{int		nSsizeX, nSsizeY, nDsizeX, nDsizeY;
	if (lpSrcRect==NULL) {
		nSsizeX = lpSrc->m_nSizeX;
		nSsizeY = lpSrc->m_nSizeY;
	} else {
		nSsizeX = lpSrcRect->right - lpSrcRect->left;
		nSsizeY = lpSrcRect->bottom - lpSrcRect->top;
	}
	if (lpDstSize==NULL) {
		nDsizeX = m_nSizeX;
		nDsizeY = m_nSizeY;
	} else {
		nDsizeX = lpDstSize->cx;
		nDsizeY = lpDstSize->cy;
	}
	if ((nSsizeX == nDsizeX) && (nSsizeY == nDsizeY))
		return CPlane::BltFast(lpSrc, x, y, lpSrcRect, lpClipDstRect);
	}
// 初期設定
	// クリッピング処理
	DRAW_CLIPPER_R;
	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BltFastRの転送が転送元矩形外から行なわれています");


	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);

	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);

	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitchDst = dddesc.lPitch;
	LONG lPitchSrc = dddesc2.lPitch;

#ifdef VRAM_MEMORY_CHECK
	CPlane* lpSrcOrg = lpSrc;	//	保存しとかなきゃ＾＾；
#endif	

	switch ( dddesc.ddpfPixelFormat.dwRGBBitCount )
	{
		case 4:
			break;

		case 8:
		{
			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;								// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth);							// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			BYTE	nAddPixel = 1;
			BYTE	AddSrcPixel = nStepsX;
			BYTE	AddWidthSrc2 = sr.right - sr.left;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;

			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch);
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch);
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
					*lpDst = *lpSrc;
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 16:
		{
			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<1);					// ASMで使用する 1ラインのバイト数の設定
			WORD*	lpSrc = (WORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<1)+sr.top*lPitchSrc );	// クリッピング部分のカット
			WORD*	lpDst = (WORD*)((BYTE*)dddesc.lpSurface + (dr.left<<1)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			WORD	nAddPixel = 1 << 1;
			WORD	AddSrcPixel = nStepsX << 1;
			WORD	AddWidthSrc2 = (sr.right - sr.left)<<1;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				WORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
					*lpDst = *lpSrc;
					lpSrc = (WORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (WORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (WORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (WORD*)((BYTE*)lpSrcBack + nAddSrcHeight );		// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (WORD*)((BYTE*)lpSrc + lPitchSrc );			// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (WORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
		case 24:
		{
			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;							// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth*3);						// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left*3)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left*3)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 * 3;
			DWORD	AddSrcPixel = nStepsX * 3;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)*3;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
					*lpDst	  = *lpSrc;
					*(lpDst+1) = *(lpSrc+1);
					*(lpDst+2) = *(lpSrc+2);
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 32:
		{
			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
			DWORD*	lpSrc = (DWORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<2)+sr.top*lPitchSrc );	// クリッピング部分のカット
			DWORD*	lpDst = (DWORD*)((BYTE*)dddesc.lpSurface + (dr.left<<2)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 << 2;
			DWORD	AddSrcPixel = nStepsX << 2;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)<<2;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				DWORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BltFastRの違反");
			break;
		}
	}
#endif
					*lpDst = *lpSrc;
					lpSrc = (DWORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (DWORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (DWORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (DWORD*)((BYTE*)lpSrcBack + nAddSrcHeight );	// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (DWORD*)((BYTE*)lpSrc + lPitchSrc );		// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (DWORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
	}
	lpSrcSurface->Unlock( NULL );
	m_lpSurface->Unlock( NULL );


	return 0;
} // BltFastR


//////////////////////////////////////////////
//	BlendBltR
//	カラーキー有無、拡縮有りブレンド転送
//////////////////////////////////////////////
LRESULT		CPlane::BlendBltR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect)
{
	if (m_lpSurface==NULL) return -1;

	{int		nSsizeX, nSsizeY, nDsizeX, nDsizeY;
	if (lpSrcRect==NULL) {
		nSsizeX = lpSrc->m_nSizeX;
		nSsizeY = lpSrc->m_nSizeY;
	} else {
		nSsizeX = lpSrcRect->right - lpSrcRect->left;
		nSsizeY = lpSrcRect->bottom - lpSrcRect->top;
	}
	if (lpDstSize==NULL) {
		nDsizeX = m_nSizeX;
		nDsizeY = m_nSizeY;
	} else {
		nDsizeX = lpDstSize->cx;
		nDsizeY = lpDstSize->cy;
	}
	if ((nSsizeX == nDsizeX) && (nSsizeY == nDsizeY))
		return CPlane::BlendBlt(lpSrc, x, y, ar, ag, ab, br, bg, bb, lpSrcRect, lpClipDstRect);
	}
// 初期設定
	// クリッピング処理
	DRAW_CLIPPER_R;
	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BlendBltRの転送が転送元矩形外から行なわれています");


	// カラーキーの取得
	DWORD	dwColorKey;
	DDCOLORKEY	ddck;
	if (lpSrcSurface->GetColorKey(DDCKEY_SRCBLT, &ddck)==DD_OK) {;	// 透過キーを得る
		dwColorKey =	ddck.dwColorSpaceLowValue;
	} else {
		dwColorKey = CLR_INVALID; // おかしいやないか
	}

	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);
	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitchDst = dddesc.lPitch;
	LONG lPitchSrc = dddesc2.lPitch;

#ifdef VRAM_MEMORY_CHECK
	CPlane* lpSrcOrg = lpSrc;	//	保存しとかなきゃ＾＾；
#endif	

	switch ( dddesc.ddpfPixelFormat.dwRGBBitCount )
	{
		// パレットは非サポート
		case 4:
		case 8:
			break;

		case 16:
		{
			WORD RMask, GMask, BMask,RGBMask;

			RMask = dddesc.ddpfPixelFormat.dwRBitMask;
			GMask = dddesc.ddpfPixelFormat.dwGBitMask;
			BMask = dddesc.ddpfPixelFormat.dwBBitMask;
			RGBMask = RMask | GMask | BMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<1);					// ASMで使用する 1ラインのバイト数の設定
			WORD*	lpSrc = (WORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<1)+sr.top*lPitchSrc );	// クリッピング部分のカット
			WORD*	lpDst = (WORD*)((BYTE*)dddesc.lpSurface + (dr.left<<1)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			WORD	nAddPixel = 1 << 1;
			WORD	AddSrcPixel = nStepsX << 1;
			WORD	AddWidthSrc2 = (sr.right - sr.left)<<1;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		colKey = dwColorKey /* & RGBMask */ ;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				WORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
					WORD	src = *lpSrc;
					// カラーキーか否かの判定
					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) )
					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
						// 桁あふれ起こすかー？シャレならんなぁ...
						// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
						WORD	pixel, dst;
						dst = *lpDst;
						pixel  = (WORD)((((src&RMask)*ar)+((dst&RMask)*br))>>8)&RMask;
						pixel |= (WORD)((((src&GMask)*ag)+((dst&GMask)*bg))>>8)&GMask;
						pixel |= (WORD)((((src&BMask)*ab)+((dst&BMask)*bb))>>8)&BMask;
						*lpDst = pixel;
					}
					lpSrc = (WORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (WORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (WORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (WORD*)((BYTE*)lpSrcBack + nAddSrcHeight );		// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (WORD*)((BYTE*)lpSrc + lPitchSrc );			// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (WORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
		case 24:
		{
			DWORD r,g,b;
			b =	 dwColorKey		   & 0xff;
			g = (dwColorKey >> 8 ) & 0xff;
			r = (dwColorKey >> 16) & 0xff;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth*3);					// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left*3)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left*3)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 * 3;
			DWORD	AddSrcPixel = nStepsX*3;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)*3;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
					DWORD	srcR, srcG, srcB;
					srcB =	*lpSrc;
					srcG = *(lpSrc+1);
					srcR = *(lpSrc+2);
					// カラーキーか否かの判定
					if ( srcR != r || srcG != g || srcB != b || dwColorKey == CLR_INVALID )
					{
						DWORD	dstR, dstG, dstB;
						dstB =	*lpDst;
						dstG = *(lpDst+1);
						dstR = *(lpDst+2);
						 *lpDst		= ((srcB*ab)+(dstB*bb))>>8;
						*(lpDst+1)	= ((srcG*ag)+(dstG*bg))>>8;
						*(lpDst+2)	= ((srcR*ar)+(dstR*br))>>8;
					}
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 32:
		{
			DWORD RMask, GMask, BMask,RGBMask;

			RMask = dddesc.ddpfPixelFormat.dwRBitMask;
			GMask = dddesc.ddpfPixelFormat.dwGBitMask;
			BMask = dddesc.ddpfPixelFormat.dwBBitMask;
			RGBMask = RMask | GMask | BMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
			DWORD*	lpSrc = (DWORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<2)+sr.top*lPitchSrc );	// クリッピング部分のカット
			DWORD*	lpDst = (DWORD*)((BYTE*)dddesc.lpSurface + (dr.left<<2)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 << 2;
			DWORD	AddSrcPixel = nStepsX << 2;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)<<2;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		colKey = dwColorKey /* & RGBMask*/ ;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				DWORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
					DWORD	src = *lpSrc;
					// カラーキーか否かの判定
					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) )
					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltRの違反");
			break;
		}
	}
#endif
						// 桁あふれ起こすかー？シャレならんなぁ...
						// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
						DWORD	pixel, dst;
						dst = *lpDst;
						pixel = (DWORD)((((DWORDLONG)(src&RMask)*ar)+((DWORDLONG)(dst&RMask)*br))>>8)&RMask;
						pixel |= (DWORD)((((DWORDLONG)(src&GMask)*ag)+((DWORDLONG)(dst&GMask)*bg))>>8)&GMask;
						pixel |= (DWORD)((((DWORDLONG)(src&BMask)*ab)+((DWORDLONG)(dst&BMask)*bb))>>8)&BMask;
						*lpDst = pixel;
					}
					lpSrc = (DWORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (DWORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (DWORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (DWORD*)((BYTE*)lpSrcBack + nAddSrcHeight );	// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (DWORD*)((BYTE*)lpSrc + lPitchSrc );		// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (DWORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
	}
	lpSrcSurface->Unlock( NULL );
	m_lpSurface->Unlock( NULL );


	return 0;
} // BlendBltR



//////////////////////////////////////////////
//	BlendBltFastR
//	カラーキー有無、拡縮有りブレンド転送
//////////////////////////////////////////////
LRESULT		CPlane::BlendBltFastR(CPlane*lpSrc,int x,int y,int ar,int ag,int ab,int br,int bg,int bb,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipDstRect)
{
	if (m_lpSurface==NULL) return -1;

	{int		nSsizeX, nSsizeY, nDsizeX, nDsizeY;
	if (lpSrcRect==NULL) {
		nSsizeX = lpSrc->m_nSizeX;
		nSsizeY = lpSrc->m_nSizeY;
	} else {
		nSsizeX = lpSrcRect->right - lpSrcRect->left;
		nSsizeY = lpSrcRect->bottom - lpSrcRect->top;
	}
	if (lpDstSize==NULL) {
		nDsizeX = m_nSizeX;
		nDsizeY = m_nSizeY;
	} else {
		nDsizeX = lpDstSize->cx;
		nDsizeY = lpDstSize->cy;
	}
	if ((nSsizeX == nDsizeX) && (nSsizeY == nDsizeY))
		return CPlane::BlendBltFast(lpSrc, x, y, ar, ag, ab, br, bg, bb, lpSrcRect, lpClipDstRect);
	}
// 初期設定
	// クリッピング処理
	DRAW_CLIPPER_R;
	WARNING(sr.left<0 || sr.right>lpSrc->m_nSizeX || sr.top<0 || sr.bottom>lpSrc->m_nSizeY,
		"CPlane::BlendBltRの転送が転送元矩形外から行なわれています");

	// DstSurfaceのlock
	DDSURFACEDESC dddesc;
	ZERO(dddesc); // 一応ね
	dddesc.dwSize = sizeof(dddesc);
	if (m_lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 2;
	}

	// SrcSurfaceのlock
	DDSURFACEDESC dddesc2;
	ZERO(dddesc2);
	dddesc2.dwSize = sizeof(dddesc2);
	if (lpSrcSurface->Lock(NULL,&dddesc2,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::BltRでSurfaceのLockに失敗");
		return 3;
	}

	// 1ラスタ分の増量
	LONG lPitchDst = dddesc.lPitch;
	LONG lPitchSrc = dddesc2.lPitch;
	
#ifdef VRAM_MEMORY_CHECK
	CPlane* lpSrcOrg = lpSrc;	//	保存しとかなきゃ＾＾；
#endif	

	switch ( dddesc.ddpfPixelFormat.dwRGBBitCount )
	{
		// パレットは非サポート
		case 4:
		case 8:
			break;

		case 16:
		{
			WORD RMask, GMask, BMask,RGBMask;

			RMask = dddesc.ddpfPixelFormat.dwRBitMask;
			GMask = dddesc.ddpfPixelFormat.dwGBitMask;
			BMask = dddesc.ddpfPixelFormat.dwBBitMask;
			RGBMask = RMask | GMask | BMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<1);					// ASMで使用する 1ラインのバイト数の設定
			WORD*	lpSrc = (WORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<1)+sr.top*lPitchSrc );	// クリッピング部分のカット
			WORD*	lpDst = (WORD*)((BYTE*)dddesc.lpSurface + (dr.left<<1)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			WORD	nAddPixel = 1 << 1;
			WORD	AddSrcPixel = nStepsX << 1;
			WORD	AddWidthSrc2 = (sr.right - sr.left)<<1;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
//			int		colKey = dwColorKey & RGBMask;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				WORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{

#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/2;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
					WORD	src = *lpSrc;
					// カラーキーか否かの判定
//					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) )
//					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/2;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
						// 桁あふれ起こすかー？シャレならんなぁ...
						// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
						WORD	pixel, dst;
						dst = *lpDst;
						pixel  = (WORD)((((src&RMask)*ar)+((dst&RMask)*br))>>8)&RMask;
						pixel |= (WORD)((((src&GMask)*ag)+((dst&GMask)*bg))>>8)&GMask;
						pixel |= (WORD)((((src&BMask)*ab)+((dst&BMask)*bb))>>8)&BMask;
						*lpDst = pixel;
//					}
					lpSrc = (WORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (WORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (WORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (WORD*)((BYTE*)lpSrcBack + nAddSrcHeight );		// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (WORD*)((BYTE*)lpSrc + lPitchSrc );			// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (WORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
		case 24:
		{
//			DWORD r,g,b;
//			b =	 dwColorKey		   & 0xff;
//			g = (dwColorKey >> 8 ) & 0xff;
//			r = (dwColorKey >> 16) & 0xff;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth*3);					// ASMで使用する 1ラインのバイト数の設定
			BYTE*	lpSrc = (BYTE*)dddesc2.lpSurface +(sr.left*3)+sr.top*lPitchSrc;	// クリッピング部分のカット
			BYTE*	lpDst = (BYTE*)dddesc.lpSurface + (dr.left*3)+dr.top*lPitchDst;	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 * 3;
			DWORD	AddSrcPixel = nStepsX*3;
			DWORD	AddWidthSrc = lPitchSrc * nStepsY;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)*3;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				BYTE*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/3;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
					DWORD	srcR, srcG, srcB;
					srcB =	*lpSrc;
					srcG = *(lpSrc+1);
					srcR = *(lpSrc+2);
					// カラーキーか否かの判定
//					if ( srcR != r || srcG != g || srcB != b || dwColorKey == CLR_INVALID )
//					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/3;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
						DWORD	dstR, dstG, dstB;
						dstB =	*lpDst;
						dstG = *(lpDst+1);
						dstR = *(lpDst+2);
						 *lpDst		= ((srcB*ab)+(dstB*bb))>>8;
						*(lpDst+1)	= ((srcG*ag)+(dstG*bg))>>8;
						*(lpDst+2)	= ((srcR*ar)+(dstR*br))>>8;
//					}
					lpSrc = lpSrc + AddSrcPixel;						// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = lpSrc + nAddPixel;						// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = lpDst + nAddPixel;
				}
				lpSrc = lpSrcBack + nAddSrcHeight;						// Xループで進んだ分戻し、y軸の整数部を加算する
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc += lPitchSrc;									// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst += nAddDstWidth;
			}
			break;
		}
		case 32:
		{
			DWORD RMask, GMask, BMask,RGBMask;

			RMask = dddesc.ddpfPixelFormat.dwRBitMask;
			GMask = dddesc.ddpfPixelFormat.dwGBitMask;
			BMask = dddesc.ddpfPixelFormat.dwBBitMask;
			RGBMask = RMask | GMask | BMask;

			// 転送先の横幅と縦幅の設定
			int		nWidth = dr.right - dr.left;
			int		nHeight = dr.bottom - dr.top;

			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
			DWORD*	lpSrc = (DWORD*)((BYTE*)dddesc2.lpSurface +(sr.left<<2)+sr.top*lPitchSrc );	// クリッピング部分のカット
			DWORD*	lpDst = (DWORD*)((BYTE*)dddesc.lpSurface + (dr.left<<2)+dr.top*lPitchDst );	// 指定されたx,yの位置調整

			DWORD	nAddPixel = 1 << 2;
			DWORD	AddSrcPixel = nStepsX << 2;
			DWORD	AddWidthSrc2 = (sr.right - sr.left)<<2;
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
//			int		colKey = dwColorKey & RGBMask;
			int		i, j;
			int		nExCnt, nEyCnt;


			nEyCnt = EIY;
			for ( j = 0 ; j < nHeight ; j++ )
			{
				DWORD*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nWidth ; i++ )
				{
#ifdef VRAM_MEMORY_CHECK
	{	//	src check
		LONG dwByte = (BYTE*)(lpSrc) - (BYTE*)dddesc2.lpSurface;
		int	y = dwByte / dddesc2.lPitch;
		int x = (dwByte % dddesc2.lPitch)/4;
		if (dwByte<0 || x>=lpSrcOrg->m_nSizeX || y>=lpSrcOrg->m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
					DWORD	src = *lpSrc;
					// カラーキーか否かの判定
//					if ( ((src & RGBMask) != colKey) || (dwColorKey == CLR_INVALID) )
//					{
#ifdef VRAM_MEMORY_CHECK
	{	//	dst check
		LONG dwByte = (BYTE*)(lpDst) - (BYTE*)dddesc.lpSurface;
		int	y = dwByte / dddesc.lPitch;
		int x = (dwByte % dddesc.lPitch)/4;
		if (dwByte<0 || x>=m_nSizeX || y>=m_nSizeY) {
			lpSrcSurface->Unlock(NULL);
			m_lpSurface->Unlock(NULL);
			WARNING(true,"CPlane::BlendBltFastRの違反");
			break;
		}
	}
#endif
						// 桁あふれ起こすかー？シャレならんなぁ...
						// DWORDLONGを持ち出すのはちょっと大人げないような気もするけど:p
						DWORD	pixel, dst;
						dst = *lpDst;
						pixel = (DWORD)((((DWORDLONG)(src&RMask)*ar)+((DWORDLONG)(dst&RMask)*br))>>8)&RMask;
						pixel |= (DWORD)((((DWORDLONG)(src&GMask)*ag)+((DWORDLONG)(dst&GMask)*bg))>>8)&GMask;
						pixel |= (DWORD)((((DWORDLONG)(src&BMask)*ab)+((DWORDLONG)(dst&BMask)*bb))>>8)&BMask;
						*lpDst = pixel;
//					}
					lpSrc = (DWORD*)((BYTE*)lpSrc + AddSrcPixel);		// 整数部の加算
					nExCnt += EX;										// Xの増分
					if ( nExCnt >= 0 )
					{
						lpSrc = (DWORD*)((BYTE*)lpSrc + nAddPixel);		// 次のピクセルにする
						nExCnt -= EX2;									// Xの補正値
					}
					lpDst = (DWORD*)((BYTE*)lpDst + nAddPixel );
				}
				lpSrc = (DWORD*)((BYTE*)lpSrcBack + nAddSrcHeight );	// Xループで進んだ分戻し、y軸の整数部を加算する1
				nEyCnt += EY;											// Yの増分
				if ( nEyCnt >= 0 )
				{
					lpSrc = (DWORD*)((BYTE*)lpSrc + lPitchSrc );		// クリッピングで飛ばす分を足して、次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}
				lpDst = (DWORD*)((BYTE*)lpDst + nAddDstWidth );
			}
			break;
		}
	}
	lpSrcSurface->Unlock( NULL );
	m_lpSurface->Unlock( NULL );


	return 0;
} // BlendBltFastR

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

//	Mosaic（そのプレーンに対するエフェクト）
LRESULT CPlane::MosaicEffect(int d, LPRECT lpRect){
	//　プレーンに対してモザイクをかける機能
	//	d :	量子化レベル
	LPDIRECTDRAWSURFACE lpSurface = GetSurface();

	if (m_lpSurface	 ==NULL) return -1;
	//	手抜きでクリップしていないので…

	if (d==0) return -2;	//	これで落ちるのはまずかろう...

	RECT r;
	if(lpRect == NULL){
		::SetRect(&r,0,0,m_nSizeX,m_nSizeY);
	}else{
		r = *lpRect;
	}

	// クリッピングする
	RECT rcClip;
	::SetRect(&rcClip,0,0,m_nSizeX,m_nSizeY);
	LPRECT lpClip = &rcClip;
	if (lpClip->left > r.left)	{ r.left   = lpClip->left;	 }
	if (lpClip->right< r.right) { r.right  = lpClip->right;	 }
	if (lpClip->top	 > r.top)	{ r.top	   = lpClip->top;	 }
	if (lpClip->bottom<r.bottom){ r.bottom = lpClip->bottom; }
	if (r.left >= r.right || r.top	>= r.bottom) return 1;

	//	lock the surface...
	DDSURFACEDESC dddesc;
	ZERO(dddesc);
	dddesc.dwSize = sizeof(dddesc);
	if (lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::MosaicBltでSurfaceのLockに失敗");
		return 1;
	}

	// 1ラスタ分の増量
	LONG lPitch	 = dddesc.lPitch;

	switch (dddesc.ddpfPixelFormat.dwRGBBitCount) {
	case 8:	{	// 256色モード
		for(int y=r.top;y<r.bottom;y+=d){
			int d2;		//	下端の端数
			if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
			for(int x=r.left;x<r.right;x+=d){
				int d1;	//	右端の端数
				if (x+d>r.right) d1=r.right-x; else d1=d;

				BYTE *p,*p2;
				p = (BYTE*)dddesc.lpSurface + y*lPitch + x;
				BYTE c;	// 代表点の色
				c = *p;
				for(int py=0;py<d2;py++){
					p2 = p;
					for(int px=0;px<d1;px++){
						*(p++) = c;
					}
					p = p2 + lPitch;	//	next line
				}
			}
		}
		break;
			}
	case 16: {	// 65536色モード
		for(int y=r.top;y<r.bottom;y+=d){
			int d2;		//	下端の端数
			if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
			for(int x=r.left;x<r.right;x+=d){
				int d1;	//	右端の端数
				if (x+d>r.right) d1=r.right-x; else d1=d;

				WORD *p,*p2;
				p = (WORD*)((BYTE*)dddesc.lpSurface + y*lPitch) + x;
				WORD c;	// 代表点の色
				c = *p;
				for(int py=0;py<d2;py++){
					p2 = p;
					for(int px=0;px<d1;px++){
						*(p++) = c;
					}
					p = (WORD*)((BYTE*)p2 + lPitch);	//	next line
				}
			}
		}
		break;
			 }
	case 24: {	//	full color
		for(int y=r.top;y<r.bottom;y+=d){
			int d2;		//	下端の端数
			if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
			for(int x=r.left;x<r.right;x+=d){
				int d1;	//	右端の端数
				if (x+d>r.right) d1=r.right-x; else d1=d;

				BYTE *p,*p2;
				p = (BYTE*)dddesc.lpSurface + y*lPitch + x*3;
				BYTE c1,c2,c3;	// 代表点の色
				c1 = *p; c2 = *(p+1); c3 = *(p+2);
				for(int py=0;py<d2;py++){
					p2 = p;
					for(int px=0;px<d1;px++){	//	３回かいとけ～
						*(p++) = c1;
						*(p++) = c2;
						*(p++) = c3;
					}
					p = p2 + lPitch;	//	next line
				}
			}
		}
		break;
			 }
	case 32: {	//	true color
		for(int y=r.top;y<r.bottom;y+=d){
			int d2;		//	下端の端数
			if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
			for(int x=r.left;x<r.right;x+=d){
				int d1;	//	右端の端数
				if (x+d>r.right) d1=r.right-x; else d1=d;

				DWORD *p,*p2;
				p = (DWORD*)((BYTE*)dddesc.lpSurface + y*lPitch) + x;
				DWORD c;	// 代表点の色
				c = *p;
				for(int py=0;py<d2;py++){
					p2 = p;
					for(int px=0;px<d1;px++){
						*(p++) = c;
					}
					p = (DWORD*)((BYTE*)p2 + lPitch);	//	next line
				}
			}
		}
		break;
			}
	} // end switch
	lpSurface->Unlock(NULL);
	return 0;
}

//	Flush （そのプレーンに対するエフェクト）
LRESULT CPlane::FlushEffect(LPRECT lpRect){
	//	プレーンに対してネガポジ反転させる機能
	LPDIRECTDRAWSURFACE lpSurface = GetSurface();

	if (lpSurface	 ==NULL) return -1;
	//	手抜きでクリップしていないので…

	RECT r;
	if(lpRect == NULL){
		::SetRect(&r,0,0,m_nSizeX,m_nSizeY);
	}else{
		r = *lpRect;
	}

	// クリッピングする
	RECT rcClip;
	::SetRect(&rcClip,0,0,m_nSizeX,m_nSizeY);
	LPRECT lpClip = &rcClip;
	if (lpClip->left > r.left)	{ r.left   = lpClip->left;	 }
	if (lpClip->right< r.right) { r.right  = lpClip->right;	 }
	if (lpClip->top	 > r.top)	{ r.top	   = lpClip->top;	 }
	if (lpClip->bottom<r.bottom){ r.bottom = lpClip->bottom; }
	if (r.left >= r.right || r.top	>= r.bottom) return 1;

	//	lock the surface...
	DDSURFACEDESC dddesc;
	ZERO(dddesc);
	dddesc.dwSize = sizeof(dddesc);
	if (lpSurface->Lock(NULL,&dddesc,
		DDLOCK_WAIT|DDLOCK_SURFACEMEMORYPTR,NULL)!=DD_OK){
		Err.Out("CPlane::FlushBltでSurfaceのLockに失敗");
		return 1;
	}

	// 1ラスタ分の増量
	LONG lPitch	 = dddesc.lPitch;

	switch (dddesc.ddpfPixelFormat.dwRGBBitCount) {
	case 8:	{	// 256色モード
		for(int y=r.top;y<r.bottom;y++){
			BYTE *p;
			p = (BYTE*)dddesc.lpSurface + y*lPitch + r.left;
			for(int x=r.left;x<r.right;x++){
				*(p++) ^= 0xff;	//	xorするだけ:p
			}
		}
		break;
			}
	case 16: {	// 65536色モード
		for(int y=r.top;y<r.bottom;y++){
			WORD *p;
			p = (WORD*)((BYTE*)dddesc.lpSurface + y*lPitch) + r.left;
			for(int x=r.left;x<r.right;x++){
				*(p++) ^= 0xffff;	//	xorするだけ:p
			}
		}
		break;
			 }
	case 24: {	//	full color
		for(int y=r.top;y<r.bottom;y++){
			BYTE *p;
			p = (BYTE*)dddesc.lpSurface + y*lPitch + r.left*3;
			for(int x=r.left;x<r.right;x++){	//	3回かいとけ～:p
				*(p++) ^= 0xff;	//	xorするだけ:p
				*(p++) ^= 0xff;
				*(p++) ^= 0xff;
			}
		}
		break;
			 }
	case 32: {	//	true color
		for(int y=r.top;y<r.bottom;y++){
			DWORD *p;
			p = (DWORD*)((BYTE*)dddesc.lpSurface + y*lPitch) + r.left;
			for(int x=r.left;x<r.right;x++){
				*(p++) ^= 0xffffff;	//	下位24ビットに対してxorするだけ:p
			}
		}
		break;
			}
	} // end switch
	lpSurface->Unlock(NULL);
	return 0;
}

#endif // USE_DirectDraw
