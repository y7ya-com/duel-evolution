
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

//////////////////////////////////////////////////////////////////////////////

//	static members..
set<CFastPlane*>	CFastPlane::m_lpPlaneList;

//////////////////////////////////////////////////////

// @yo2 0x00452120 review
CFastPlane::CFastPlane(){
	m_nSizeX	=	0;
	m_nSizeY	=	0;
	m_lpSurface	=	NULL;
	m_lpPalette	=	NULL;

	ResetColorKey();
	m_hDC		=	NULL;

	//	システムメモリ上に確保するのだ！
	m_bUseSystemMemory	=	true;

	m_FillColor		=	0;
	m_dwFillColor	=	0;

	m_nSurfaceType	=	0;
	m_bYGA			= false;
	m_bYGAUse		= false;
	m_bMySurface	= false;
	m_bSecondary256 = false;
	//	256色モードならば、通常RGB555のサーフェースを作成するのだが、
	//	セカンダリだけは256色サーフェース
	m_bLoad256		= false;
	m_bSecondary256DIB=false;

	//	RGB555のMySurfaceに対して、DIB Sectionを使用するのか？
	m_hBitmap		= NULL;
	m_hDC			= NULL;

	//	本来、この部分、他スレッドからの排他制御しないといけないが
	//	マルチスレッド非対応ということで...
	m_lpPlaneList.insert(this);

	//	自動修復サーフェース
	m_bAutoRestore = false;
}

// @yo2 0x00452760 vt
CFastPlane::~CFastPlane(){
	m_lpPlaneList.erase(this);
	Release();
}

// @yo2 0x00452870 vt
LRESULT	CFastPlane::Release(){
	//	owner create surface
	//	256色モードの仮想セカンダリはDIBとして作成してたんか？
	if (m_hBitmap){
		m_bMySurface = false;
		if (m_hDC!=NULL){
			::DeleteDC(m_hDC);
			m_hDC = NULL;
		}
		if (m_hBitmap!=NULL){
			::DeleteObject(m_hBitmap);
			m_hBitmap = NULL;
		}
	}

	if (m_bMySurface) {
		if (m_nSurfaceType== 4) {
			CFastPlaneRGB555* pwd = (CFastPlaneRGB555*)GetPlaneInfo()->GetPtr();
			delete [] pwd;
		}ef(m_nSurfaceType==10) {
			CFastPlaneARGB4565* pwd = (CFastPlaneARGB4565*)GetPlaneInfo()->GetPtr();
			delete [] pwd;
		}ef(m_nSurfaceType==11) {
			CFastPlaneARGB4555* pwd = (CFastPlaneARGB4555*)GetPlaneInfo()->GetPtr();
			delete [] pwd;
		}ef(m_nSurfaceType==12) {
			CFastPlaneARGB8888* pdw = (CFastPlaneARGB8888*)GetPlaneInfo()->GetPtr();
			delete [] pdw;
		}ef(m_nSurfaceType==13) {
			CFastPlaneABGR8888* pdw = (CFastPlaneABGR8888*)GetPlaneInfo()->GetPtr();
			delete [] pdw;
		}else{
			WARNING(true,"CFastPlane::Releaseで不明サーフェースのリリース");
		}
		m_bMySurface = false;
	}

	RELEASE_SAFE(m_lpSurface);
	RELEASE_SAFE(m_lpPalette);
	m_szBitmapFile.erase();
	m_nSizeX	=	0;
	m_nSizeY	=	0;
	m_nSurfaceType = 0;
	m_bLoad256	= false;
	GetPlaneInfo()->SetInit(false);	//	サーフェース情報も初期化
	return 0;
}

// @yo2 0x00452a20 vt
void	CFastPlane::GetSize(int &x,int &y){
	x = m_nSizeX;
	y = m_nSizeY;
}

//	サーフェースのロストに対する復帰処理
// @yo2 0x00452a50 vt
LRESULT	CFastPlane::Restore(){
	LRESULT lr = 0;
	int nType = GetSurfaceType();
	if (nType!=0){	//	Surfaceが存在するかどうかは、こいつで判定する必要がある
		//	システムメモリ上のサーフェースはLostしないのだが＾＾；
		//	現在の画面bppと異なるサーフェースならば、解体して作りなおす必要がある
		bool bRestore = false;
		if (m_lpSurface!=NULL && m_lpSurface->IsLost()) {
			//	&& 論理演算子は、左から右への評価を保証するし、
			//	VCの最適化により、左が成立時に右が評価されないのも保証される
			bRestore = true;
		} else {
		//	現在の画面bppとコンパチで無いサーフェースならばリストアする
			int nType2 = CAppManager::GetMyFastDraw()->GetPrimary()->GetSurfaceType();
			switch (nType2){
			case 2:	//	256色のときは、RGB555とみなす
				if (nType==2 && m_bSecondary256) break; // 256色用セカンダリやん？
				if (nType==4 || nType == 11) break;
				bRestore = true; break;
			case 3:
				if (nType==3 || nType == 10) break;
				bRestore = true; break;
			case 4:
				//	256色モードの時に読み込んだビットマップなんか信用できない
				if (m_bLoad256 && IsLoaded()) {
					bRestore = true; break;
				}
				if (nType==4 || nType == 11) break;
				bRestore = true; break;
			case 5:
			case 6:
			case 7:
			case 8:
				if (nType==nType2 || nType == 12) break;
				bRestore = true; break;
			}
		}

		if (bRestore){
			if (m_bAutoRestore){
			//	自動修復サーフェースならば、サーフェースを作成後、そいつをコピー
				LRESULT lrErr = 0;
				if (m_nSizeX!=0 && m_nSizeY!=0){
					CFastPlane plane;
					plane.CreateSurface(m_nSizeX,m_nSizeY,IsYGA());
					lrErr = plane.BltFast(this,0,0);
					// この変換可能やったか？
					if (lrErr==0){
						InnerCreateSurface(m_nSizeX,m_nSizeY,m_bYGA,m_bSecondary256);
						lrErr = BltFast(&plane,0,0);
					}
				}
				//	転送に失敗したら、しゃーないから自前でリストアしてんか．．
				if (lrErr!=0) goto RestoreRetry;

				//	現在の画面モードに合わせてFillColor,ColorKeyを設定しなおす
				SetFillColor(m_FillColor);		
				SetColorKey();// カラーキーも復帰 by れむ
			} else {
RestoreRetry:;
				//	ビットマップファイルならばそれを復元する
				if (IsLoaded()){
					string szBitmap;
					szBitmap = m_szBitmapFile;
					lr = InnerLoad(szBitmap,m_bLoadPalette);
					//	InnerLoadするときに解体されるので、
					//	m_szBitmapFileも、ここで設定する
					m_szBitmapFile = szBitmap;
				} else {
					//	本当は、このとき、変換子を用意して変換ほうが良い
					//	しかし、復元のすべての組み合わせは膨大である．．
					//	一度、ARGB8888に変換して、そこからターゲット型に
					//	戻せば、そうでも無いのだが．．

					if (m_nSizeX!=0 && m_nSizeY!=0){
						//	とりあえず、サーフェース作りなおしとくか．．
						InnerCreateSurface(m_nSizeX,m_nSizeY,m_bYGA,m_bSecondary256);
					}
				}
				//	現在の画面モードに合わせてFillColor,ColorKeyを設定しなおす
				SetFillColor(m_FillColor);		
				SetColorKey();// カラーキーも復帰 by れむ
				//	オーナードローかも知れないので、それを復元する
				lr |= OnDraw();	//	委譲する
			}
		}
	}
	return lr;
}

// @yo2 0x00452fd0 cg
LRESULT CFastPlane::RestoreAll(void){ // 全プレーンのリロード
	set<CFastPlane*>::iterator it;	// [portable] MSVC6 for-scope: it is used after the loop
	for (it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
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

// [Konami] added: total memory (bytes) used by the surfaces of all live CFastPlanes (name is ours)
// @yo2 0x004530b0 tight
int CFastPlane::GetTotalSurfaceSize(void){
	int nTotal = 0;
	for (set<CFastPlane*>::iterator it=m_lpPlaneList.begin();it!=m_lpPlaneList.end();it++){
		int sx,sy;
		(*it)->GetSize(sx,sy);
		switch ((*it)->m_nSurfaceType){
		case 3:  nTotal += sx*sy*2; break;
		case 4:  nTotal += sx*sy*2; break;
		case 5:
		case 11: nTotal += sx*sy*3; break;
		case 6:
		case 10: nTotal += sx*sy*3; break;
		case 7:
		case 13: nTotal += sx*sy*4; break;
		case 8:  nTotal += sx*sy*4; break;
		case 12: nTotal += sx*sy*4; break;
		}
	}
	return nTotal;
}

// @yo2 0x00453220 vt
void	CFastPlane::ResetColorKey(void){
	m_bUsePosColorKey	= true;
	m_nCX = m_nCY = 0;
	m_dwColorKey	=	0;
}

// @yo2 0x00453240 vt
LRESULT CFastPlane::Load(string szBitmapFileName,bool bLoadPalette){
	ResetColorKey();
	// あとでRestoreできるようにファイル名を格納しておく。
	LRESULT lr = InnerLoad(szBitmapFileName,bLoadPalette);
	if (lr==0) {
		//	読み込めたときにのみ更新する
		m_szBitmapFile = szBitmapFileName;
		m_bLoadPalette = bLoadPalette;
		//	↑こいつの初期化は、InnerLoadから呼び出されるRelease()で行なわれる
	}
	return lr;
}

//	ファイル名を返す
// @yo2 0x00453460 manual
string	CFastPlane::GetFileName() const{
	return m_szBitmapFile;
}

// @yo2 0x004535e0 cg
COLORREF	CFastPlane::GetPixel(int x,int y){
	if (Lock()!=0) return 0;
	CFastPlaneInfo& v = *GetPlaneInfo();

	//	範囲外？
	if (x<0 || y<0 || x>=v.GetRect()->right || y>=v.GetRect()->bottom) {
		Unlock();
		return CLR_INVALID;
	}

	COLORREF rgb;
	int nType = GetSurfaceType();
	switch (nType) {
	case 2: {
		CFastPlaneBytePal* p = (CFastPlaneBytePal*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneBytePal));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 3: {
		CFastPlaneRGB565* p = (CFastPlaneRGB565*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB565));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 4: {
		CFastPlaneRGB555* p = (CFastPlaneRGB555*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB555));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 5: {
		CFastPlaneRGB888* p = (CFastPlaneRGB888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 6: {
		CFastPlaneBGR888* p = (CFastPlaneBGR888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneBGR888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 7: {
		CFastPlaneXRGB8888* p = (CFastPlaneXRGB8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneXRGB8888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 8: {
		CFastPlaneXBGR8888* p = (CFastPlaneXBGR8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneXBGR8888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 10: {
		CFastPlaneARGB4565* p = (CFastPlaneARGB4565*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB4565));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 11: {
		CFastPlaneARGB4555* p = (CFastPlaneARGB4555*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB4555));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 12: {
		CFastPlaneARGB8888* p = (CFastPlaneARGB8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB8888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	case 13: {
		CFastPlaneABGR8888* p = (CFastPlaneABGR8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB8888));
		rgb = RGB(p->GetR(),p->GetG(),p->GetB()); break; }
	default:	//	なんや、、不明サーフェースか．．
		rgb = 0; break;
	}

	Unlock();
	return rgb;
}

// @yo2 0x004538f0 cg
DWORD		CFastPlane::GetMatchColor(COLORREF rgb){
	if (rgb == CLR_INVALID) return CLR_INVALID;
	//	こんな実装でもしゃーないわな．．

	DWORD dw;

	int nType = GetSurfaceType();
	switch (nType) {
	case 2:
		//	こんなん無理なんやよねー
		break;
	case 3: {
		CFastPlaneRGB565 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 4: {
		CFastPlaneRGB555 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 5: {
		CFastPlaneRGB888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 6: {
		CFastPlaneBGR888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 7: {
		CFastPlaneXRGB8888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 8: {
		CFastPlaneXBGR8888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 10: {
		CFastPlaneARGB4565 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 11: {
		CFastPlaneARGB4555 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 12: {
		CFastPlaneARGB8888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	case 13: {
		CFastPlaneABGR8888 p;
		p.SetRGB(rgb & 0xff,(rgb>>8) & 0xff,(rgb>>16)& 0xff);
		dw = p.GetRGB(); break; }
	default:	//	なんや、、不明サーフェースか．．
		dw = CLR_INVALID; break;
	}

	return dw;
}

// @yo2 0x00453ad0 vt
int		CFastPlane::GetPixelAlpha(int x,int y){
	if (Lock()!=0) return 0;

	CFastPlaneInfo& v = *GetPlaneInfo();

	//	範囲外？
	if (x<0 || y<0 || x>=v.GetRect()->right || y>=v.GetRect()->bottom) {
		Unlock();
		return 0;
	}

	int alpha;
	int nType = GetSurfaceType();

	switch (nType) {
	case 10:
		alpha = ((CFastPlaneARGB4565*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB4565)))->GetA();
		break;
	case 11:
		alpha = ((CFastPlaneARGB4555*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB4555)))->GetA();
		break;
	case 12:
		alpha = ((CFastPlaneARGB8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB8888)))->GetA();
		break;
	case 13:
		alpha = ((CFastPlaneABGR8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneARGB8888)))->GetA();
		break;

	//	上記以外なので、抜き色かどうかを見て、抜き色と同じならばalpha有りと見なして良いのでは？
	case 3:
		alpha = ((CFastPlaneRGB565*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB565)))->GetRGB()!=m_dwColorKey?255:0;
		break;
	case 4:
		alpha = ((CFastPlaneRGB555*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB555)))->GetRGB()!=m_dwColorKey?255:0;
		break;
	case 5:
		alpha = ((CFastPlaneRGB888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneRGB888)))->GetRGB()!=m_dwColorKey?255:0;
		break;
	case 6:
		alpha = ((CFastPlaneBGR888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneBGR888)))->GetRGB()!=m_dwColorKey?255:0;
		break;
	case 7:
		alpha = ((CFastPlaneXRGB8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneXRGB8888)))->GetRGB()!=m_dwColorKey?255:0;
		break;
	case 8:
		alpha = ((CFastPlaneXBGR8888*)((BYTE*)v.GetPtr() + v.GetPitch() * y + x * sizeof(CFastPlaneXBGR8888)))->GetRGB()!=m_dwColorKey?255:0;
		break;

	default:
		alpha = 255; break;
	}

	Unlock();
	return alpha;
}

////////////////////////////////////////////////////////////////////////////////////

//	ビットマップの内部的なロード。格納ファイル名には影響しない
// @yo2 0x00453ca0 vt
LRESULT	CFastPlane::InnerLoad(string szFileName,bool bLoadPalette){
	//	#notdefined#ならば、正常終了したとして帰る
	if (szFileName == "#notdefined#"){
		return 0;
	}

	//	Duplicateで済むか？
	//	if (CheckDuplicate(szFileName)) return 0;

#ifdef USE_YGA
	//	ygaフォーマット(yaneurao graphic format with alpha)
	string suffix;
	suffix = CFile::GetSuffixOf(szFileName);
	CFile::ToLower(suffix);
	if (suffix=="yga"){
		LRESULT lr = InnerLoadYGA(szFileName);
		if (lr==0) {
			SetColorKey(0,0);
			//	ygaはパレットを含まない
			m_bYGA = true;
		}
		return lr;
	}
#endif

	if (!m_bYGAUse) {		
		//	SurfaceがDDSurfaceならば、自前でLoad出来るのだが..
		//	２５６色モードでは、自前でサーフェース生成しているので．．

		//	やねうらおメモ '01/11/02
		//	⇒DirectDrawSurfaceのHDCはIDirectDrawが生成されたときのものに
		//	なるので、このソースでは256色モードで起動すると、うまく動かないのだ．．
		if (CAppManager::GetMyFastDraw()->GetPrimary()->GetSurfaceType()!=2){
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
			//	DirectDrawSurfaceの上位バイト潰すふとどきなビデオカードがある＾＾；
			ClearMSB();
		} else {
			//	256色モード時のRGB555サーフェース
			//	DirectDrawSurfaceでは無いのでDIB経由でLoad
			CDIB32 dib;
			dib.UseDIBSection(true);
			LRESULT lr = dib.Load(szFileName);
			if (lr!=0) return lr;
			int sx,sy;
			dib.GetSize(sx,sy);
			if (InnerCreateSurface(sx,sy,false)) return 4;
			//	dib -> α付きサーフェースへのコピーもサポートされている！！
			Blt(&dib,0,0);
			//	このとき読み込んだビットマップは、他の画面モードに移行したときにリストアすべき
			m_bLoad256 = true;
		}
		m_bYGA = false;
		SetColorKey();	//	復帰．．．
	} else {
		//	YGA画像を読み込むとき
		CDIB32 dib;
		dib.UseDIBSection(true);
		LRESULT lr = dib.Load(szFileName);
		if (lr!=0) return lr;
		int sx,sy;
		dib.GetSize(sx,sy);
		if (InnerCreateSurface(sx,sy,true)) return 4;
		*dib.GetYGA() = true;	// [Konami] added: treat the loaded DIB as YGA so Blt copies its alpha
		Blt(&dib,0,0);
		//	dib -> α付きサーフェースへのコピーもサポートされている！！
		m_bYGA = true;

		SetColorKey();	//	復帰．．．
	}

	return 0;
}

// @yo2 0x00454680 cg
void	CFastPlane::ClearMSB(){
	//	ビデオカードのバグ対策で最上位バイトを潰す
	if (Lock()!=0) return ;

	int nType = GetSurfaceType();
	if (nType == 7 || nType == 8){
		CFastPlaneEffect::Effect(
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneClearAlpha(),
			NULL);
	}

	Unlock();
}

#ifdef USE_YGA
//	YGA画像の読み込み用
// @yo2 0x004547a0 cg
LRESULT	CFastPlane::InnerLoadYGA(string szBitmapFileName){
	//	面倒なのでDIB32に読み込ませて、それを転送してやる＾＾；
	CDIB32 dib;
	dib.UseDIBSection(true);
	LRESULT lr = dib.Load(szBitmapFileName);
	if (lr!=0) return lr;
	int sx,sy;
	dib.GetSize(sx,sy);
	InnerCreateSurface(sx,sy,true);	// YGA Surface
	if (Lock()!=0) return 1;

	int nS1 = GetSurfaceType();
//	int nS2 = 12;	//	ARGB8888
	
	if (!dib.GetPlaneInfo()->IsInit()) { Unlock(); return 1;}

	switch (nS1) {
	case 10:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),dib.GetPlaneInfo(),
			CFastPlaneARGB4565(),GetPlaneInfo(),
			CFastPlaneCopySrc(),0,0); break;
	case 11:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),dib.GetPlaneInfo(),
			CFastPlaneARGB4555(),GetPlaneInfo(),
			CFastPlaneCopySrc(),0,0); break;
	case 12:
		CFastPlaneEffect::Blt(	//	まんまコピっとけ！
			CFastPlaneARGB8888(),dib.GetPlaneInfo(),
			CFastPlaneARGB8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),0,0); break;
	case 13:
		CFastPlaneEffect::Blt(
			CFastPlaneARGB8888(),dib.GetPlaneInfo(),
			CFastPlaneABGR8888(),GetPlaneInfo(),
			CFastPlaneCopySrc(),0,0); break;
	}
	Unlock();
	return 0;
};
#endif

// @yo2 0x00454e20 cg
HDC CFastPlane::GetDC(){
	if (m_hBitmap!=NULL){
		return m_hDC;
	}
	
	if (m_hDC!=NULL) {
		Err.Out("CFastPlane::EndPaintが呼び出されていないのにBeginPaintが呼び出された");
		return NULL;
	}
	if (m_lpSurface==NULL) return NULL;
	if (m_lpSurface->GetDC(&m_hDC)!=DD_OK) return NULL;
	return m_hDC;
}

// @yo2 0x00454e70 cg
void CFastPlane::ReleaseDC(){
	if (m_hBitmap!=NULL){
		return ;
	}

	if (m_hDC==NULL) {
		Err.Out("CFastPlane::BeginPaintが呼び出されていないのにEndPaintが呼び出された");
		return ;
	}
	if (m_lpSurface==NULL) return ;
	if (m_lpSurface->ReleaseDC(m_hDC)!=DD_OK) return ;
	m_hDC = NULL;
}

// @yo2 0x00454eb0 feat
LRESULT	CFastPlane::Save(LPSTR szFileName,LPRECT lpRect){

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

// @yo2 0x00455030 feat
LRESULT CFastPlane::InnerCreateMySurface(int sx,int sy,int nSurfaceType){
	//	現在サポートしているのは、RGB555と、ARGB4565,ARGB555,ARGB8888,ABGR8888のみ

	m_nSizeX = sx; m_nSizeY = sy;
	RECT rc;
	::SetRect(&rc,0,0,m_nSizeX,m_nSizeY);

	switch (nSurfaceType){
	case 4:	{ //	RGB555を作成
		CFastPlaneRGB555* lpSurface;
		if (m_bSecondary256DIB){
			//	256色用の仮想セカンダリであるならば、DIBSectionで作っておく
			//	(HDCを取得できるようにするため)
			BITMAPINFO bmi;
			ZERO(bmi);
			bmi.bmiHeader.biSize		= sizeof(BITMAPINFOHEADER);
			bmi.bmiHeader.biWidth		=  m_nSizeX;
			bmi.bmiHeader.biHeight		= -m_nSizeX;
			bmi.bmiHeader.biPlanes		= 1;
			bmi.bmiHeader.biBitCount	= 16;
			bmi.bmiHeader.biCompression	= BI_RGB;
			HDC hdc = ::GetDC(NULL); // hWndのほうがええんか？
			m_hBitmap = ::CreateDIBSection(hdc /* NULL*/, &bmi , DIB_RGB_COLORS, (void**)&lpSurface, NULL, 0 );
			//	↑これで作られるDIBはRGB555のようだが？
			::ReleaseDC(NULL,hdc);
			if (m_hBitmap==NULL) return 1;
			m_hDC = ::CreateCompatibleDC(NULL);
//			m_hDC = ::CreateCompatibleDC(::GetDC(NULL));
			::SelectObject(m_hDC,m_hBitmap);
		} else {
			lpSurface = new CFastPlaneRGB555[m_nSizeX * m_nSizeY];
		}
		GetPlaneInfo()->Init((void*)lpSurface,m_nSizeX*sizeof(CFastPlaneRGB555),rc);
		break;
				}
	case 10:	{ //	ARGB4565を作成
		CFastPlaneARGB4565* lpSurface = new CFastPlaneARGB4565[m_nSizeX * m_nSizeY];
		GetPlaneInfo()->Init((void*)lpSurface,m_nSizeX*sizeof(CFastPlaneARGB4565),rc);
		break;
				}
	case 11: { //	ARGB4555を作成
		CFastPlaneARGB4555* lpSurface = new CFastPlaneARGB4555[m_nSizeX * m_nSizeY];
		GetPlaneInfo()->Init((void*)lpSurface,m_nSizeX*sizeof(CFastPlaneARGB4555),rc);
		break;
				}
	case 12:	//	ARGB8888
			{ //	ARGB8888を作成
		CFastPlaneARGB8888* lpSurface = new CFastPlaneARGB8888[m_nSizeX * m_nSizeY];
		GetPlaneInfo()->Init((void*)lpSurface,m_nSizeX*sizeof(CFastPlaneARGB8888),rc);
		break;
				}
	case 13:	//	ABGR8888
			{ //	ABGR8888を作成
		CFastPlaneABGR8888* lpSurface = new CFastPlaneABGR8888[m_nSizeX * m_nSizeY];
		GetPlaneInfo()->Init((void*)lpSurface,m_nSizeX*sizeof(CFastPlaneABGR8888),rc);
		break;
				}
	default:
		return 1;	//	サポートしてへんで＾＾；
	}

	m_bYGA = (nSurfaceType>=10);

	m_nSurfaceType = nSurfaceType;
	GetPlaneInfo()->SetSurfaceType(m_nSurfaceType);
	m_bMySurface = true; // 自分でnewしたサーフェースであることを意味するマーカー
	Clear();
	return 0;
}

// @yo2 0x00455230 vt
LRESULT CFastPlane::InnerCreateSurface(int sx,int sy,bool bYGA,bool bSecondary256){
	Release();

	if (sx==0 || sy==0) {
		return 1;	//	こんなサーフェース、勘弁してくれー＾＾；
	}

	//	現在の画面モードに応じたものにする必要あり
	int nType = CAppManager::GetMyFastDraw()->GetPrimary()->GetSurfaceType();

	if (!bYGA) {
		//	YGA画像では無いので無条件でDirectDrawSurface
		//	ただし、8bppのときは、RGB555のサーフェースを作る
		if (nType == 2 && !bSecondary256) {
			return InnerCreateMySurface(sx,sy,4);
		} else {
			if (bSecondary256) m_bSecondary256 = true;
			//	このサーフェースは、256色セカンダリ
		}

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

		//	RGB888で、奇数バイトで終わっているとやらしいので、
		//	余分に確保するようにする。dWidthが奇数ならば偶数で確保するようにする
		if (GetBpp()==24 && ((ddsd.dwWidth & 1)==1)){
			ddsd.dwWidth++;	//	強制的に偶数バイトにアライン
		}

		LPDIRECTDRAW lpDraw = CAppManager::GetMyFastDraw()->GetDDraw();
		if (lpDraw==NULL) return 1;
		if (lpDraw->CreateSurface(&ddsd,&m_lpSurface,NULL)!=DD_OK){
			Err.Out("CFastPlane::InnerCreateSurfaceのCreateSurfaceに失敗");
			return 2; // あじゃー
		}

		UpdateSurfaceInfo();

		//	m_nSurfaceRef = 1;	//	参照カウントの設定＾＾
		Clear();	//	念のためクリアしておく(最上位を0にするため)
	} else {
		//	ＹＧＡ画像なので、現在の画面モードに応じたものにする必要あり
		int nType = CAppManager::GetMyFastDraw()->GetPrimary()->GetSurfaceType();
		switch (nType){
		case 3:	 //	ARGB4565を作成
			return InnerCreateMySurface(sx,sy,10);
			break;

		case 2:	 // ⇒8bppのときは、RGB555なので、それに対するYGAはARGB4555
		case 4:	 //	ARGB4555を作成
			return InnerCreateMySurface(sx,sy,11);
			break;

		//	RGB順ならばARGB8888でええんちゃう？
		case 5:	//	RGB888
		case 7:	//	XRGB8888
			return InnerCreateMySurface(sx,sy,12);
			break;
		//	BGR順ならば飽和加算のこととか考えてABGR8888にしとこか？
		case 6:	//	BGR888
		case 8:	//	XBGR8888
			return InnerCreateMySurface(sx,sy,13);
			break;
		}

		//	クリアしておかないとαにゴミが残ったままになる．．＾＾；
		Clear();
	}

	m_bYGA = bYGA;
	return 0;
}

// @yo2 0x00455460 vt
LRESULT CFastPlane::CreateSurface(int sx,int sy,bool bYGA){
	//	普通にCreateSurfaceすると、それは間違いなくオーナードロープレーンである
//	m_bOwnerDraw	= false;
//	m_bBitmap		= false;
	ResetColorKey();
	LRESULT lr = InnerCreateSurface(sx,sy,bYGA || m_bYGAUse);
	if (lr) return lr;
	SetColorKey();
//	m_bOwnerDraw	= true;

	//	CreateSurfaceしてるんだから、FillColorはリセットすべき '00/09/09
	SetFillColor(0);

	return 0;
}

//	プライマリサーフェースの生成
// @yo2 0x004554e0 cg
LRESULT	CFastPlane::CreatePrimary(bool& bUseFlip,int nSx,int nSy){
	Release();
	ResetColorKey();
	LPDIRECTDRAW lpDraw = CAppManager::GetMyFastDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;
	if (!CAppManager::GetMyFastDraw()->IsFullScreen()) bUseFlip = false;

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
		Err.Out("CFastPlane::CreatePrimaryに失敗");
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
		CAppManager::GetMyFastDraw()->GetSize(m_nSizeX,m_nSizeY);
	}

	UpdateSurfaceInfo();

	if (m_nSurfaceType == 2) {
		//	8bppやったら、これセカンダリ256同様、
		//	256色モードやけど、RGB555では無く、8bppとして用意された
		//	特殊なサーフェースとして申請する
		m_bSecondary256 = true;
	}

//	m_nSurfaceRef = 1;		//	参照カウント足しておかないとうまく解放されない
//	m_bOwnerDraw = true;	//	これをOnにしないとRestoreされてしまう
	return 0;
}

//	セカンダリサーフェースの生成
// @yo2 0x00455640 cg
LRESULT CFastPlane::CreateSecondary(CFastPlane*lpPrimary,bool& bUseFlip){
	Release();
	ResetColorKey();

	LPDIRECTDRAW lpDraw = CAppManager::GetMyFastDraw()->GetDDraw();
	if (lpDraw==NULL) return 1;

	//	↓flipルーチン書きかけ！未サポート！
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
			Err.Out("CFastPlane::CreateSecondaryのGetAttachedSurfaceに失敗");
			// ほやから言わんこっちゃない！
			bUseFlip = false;
			goto sur_retry;
		}
		lpPrimary->GetSize(m_nSizeX,m_nSizeY);
		//	一応クリアしとこか...
		Clear();
		//	サーフェースのチェック＆更新
		UpdateSurfaceInfo();
	} else {
		int nSizeX,nSizeY;
		lpPrimary->GetSize(nSizeX,nSizeY);
		if (InnerCreateSurface(nSizeX,nSizeY)!=0){
			Err.Out("CFastPlane::CreateSecondaryに失敗");
			return 0;
		}
		//	UpdateとClearは、InnerCreateSurfaceが面倒を見る
	}

//	m_nSurfaceRef = 1;		//	参照カウント足しておかないとうまく解放されない
//	m_bOwnerDraw = true;
	return 0;
}

///////////////////////////////////////////////////////////////////////////////
//	新しくサーフェースを作ったときには、この関数を呼び出すこと！
// @yo2 0x00455730 feat
LRESULT	CFastPlane::UpdateSurfaceInfo(){
	m_nSurfaceType = CDirectDrawSurfaceManager::GetSurfaceType(GetSurface());

	//	実際にLock作業が必要である
	DDSURFACEDESC ddsd = { sizeof (ddsd) };
	LRESULT hres;
	ddsd.dwSize = sizeof(ddsd);
	while ((hres = GetSurface()->Lock(NULL, &ddsd, 0, NULL)) == DDERR_WASSTILLDRAWING)
		;
	if (hres != DD_OK) {
		GetPlaneInfo()->SetInit(false);
		return 1;	//	Lockに失敗
	}
	RECT rc;
	::SetRect(&rc,0,0,m_nSizeX,m_nSizeY);
	GetPlaneInfo()->Init(ddsd.lpSurface,ddsd.lPitch,rc);

	//	unlockを忘れると大変なことに＾＾；
	GetSurface()->Unlock(NULL);
	return 0;
}

// @yo2 0x00455860 cg
LPDIRECTDRAWSURFACE CFastPlane::GetSurface(){
	return m_lpSurface;
}

// @yo2 0x00455880 review
LPDIRECTDRAWPALETTE CFastPlane::GetPalette(){
	return m_lpPalette;
}


// @yo2 0x004558a0 review
LRESULT CFastPlane::SetSystemMemoryUse(bool bEnable){
	m_bUseSystemMemory = bEnable;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x004558c0 review
LRESULT CFastPlane::SetColorKey(){
	if (m_bUsePosColorKey) {	// 位置指定型透過キー
		if (SetColorKey(m_nCX,m_nCY)) {
			Err.Out("CFastPlane::位置指定型透過キーの設定に失敗");
			// エラーとはせず
		}
	} else {	// 色指定型透過キー
	// ディフォルトでは、とりあえずrgb = 0を透過キーとして設定
	// （不要のときはBlt時に透過キーを無視するものを使えば良い）
		if (SetColorKey(m_ColorKey)) {
			Err.Out("CFastPlane::色指定型透過キーの設定に失敗");
			// エラーとはせず
		}
	}
	return 0;
}

// @yo2 0x00455900 vt
LRESULT CFastPlane::SetColorKey(COLORREF rgb)
{
	m_bUsePosColorKey = false;
	m_ColorKey = rgb;	// これ保存しとかんと復帰でけへん:p

//	if (m_lpSurface==NULL) return -1;

	//	設定保存しとかな．．
	//	m_dwColorKey = DDColorMatch(m_lpSurface,rgb);
	//	↑これ、仮想サーフェースに対してうまく動かない．．

	DWORD dwColorKey = GetMatchColor(rgb);
	//	↑現在のサーフェースに応じて、変換する
	if (dwColorKey == CLR_INVALID) return -1;

	m_dwColorKey = dwColorKey;

	return 0;
}

// @yo2 0x00455940 vt
LRESULT CFastPlane::SetColorKey(int x,int y){	// (x,y)の点を透過キーに設定する
	//	設定保存しとかな．．
	m_bUsePosColorKey = true;
	m_nCX = x;	// これ保存しとかんと復帰でけへん
	m_nCY = y;

	DWORD dwColorKey = GetMatchColor(GetPixel(x,y));
	if (dwColorKey == CLR_INVALID) return -1;
	m_dwColorKey = dwColorKey;

	return 0;
}


// @yo2 0x00455990 cg
LRESULT		CFastPlane::SetFillColor(COLORREF c){
	if (m_lpSurface==NULL) return -1;
	m_FillColor = c;
	m_dwFillColor = GetMatchColor(c);
	if (m_dwFillColor == CLR_INVALID) return 1;
	return 0;
}

// @yo2 0x004559e0 review
DWORD		CFastPlane::GetFillColor(void){
	return m_dwFillColor;
}

//////////////////////////////////////////////////////////////////////////////

// ディスプレイの色数を調べるのにGetDisplayModeは使ってはいけない
int		CFastPlane::GetBpp(void){
	return CBppManager::GetBpp();
}

// @yo2 0x00455a20 manual
void	CFastPlane::InnerGetBpp() {
	CBppManager::Reset();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00455a40 cg
LRESULT CFastPlane::Lock(){
	//	この関数を呼び出すと、GetPlaneInfoが正しい値を返す
	//	Surfaceを本当にロックしているとは限らない
	CFastPlaneInfo& vInfo = *GetPlaneInfo();
	WARNING(vInfo.IsLocked(),"CFastPlane::Lockで多重Lock");	

	//	Surfaceは健在か？
//	if (GetSurface()==NULL) return 1;
	//	↑CFastPlaneInfoが管轄しているので、これは不要

	if (vInfo.IsInit() && m_bUseSystemMemory){
		//	システムメモリを使用している？
		//	ならばたとえDirectDrawSurfaceであってもLockする必要は無し！
		//	（と考えて良いのだろうか？）
	} else {
		if (GetSurface()==NULL) return 1;
		//	なんでこれがDirectDrawSurfaceと違うんやろか．．

		//	１．vInfoが初期化されていない．．
		//	おそらく、サーフェース生成直後のLockに失敗している
		//	２．ビデオメモリ上に確保されている
		//	実際にLock作業が必要である
		DDSURFACEDESC ddsd = { sizeof (ddsd) };
		LRESULT hres;
		ddsd.dwSize = sizeof(ddsd);
		while ((hres = GetSurface()->Lock(NULL, &ddsd, 0, NULL)) == DDERR_WASSTILLDRAWING)
			;
		if (hres != DD_OK) {
			return 1;	//	Lockに失敗
		}
		vInfo.SetLock(true);
		vInfo.SetPtr(ddsd.lpSurface);

		vInfo.SetPitch(ddsd.lPitch);
			//	ピッチは、最初のLock以降変わらないと思われるが、
			//	何らかの理由で、ビデオメモリ上のサーフェースが別の場所に
			//	こっそり移動しないとも限らない
	}
	return 0;
}

// @yo2 0x00455b20 cg
LRESULT	CFastPlane::Unlock(){
	//	Lockしたものは、これで解放する

	//	DirectDrawSurfaceをLockしとったんか？
	if (GetPlaneInfo()->IsLocked()){
		//	しとったみたいなので、解放
		GetPlaneInfo()->SetLock(false);		
		GetSurface()->Unlock(NULL);
	} else {
	}

	return 0;
}


#endif // USE_DirectDraw
