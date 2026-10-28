#include "stdafx.h"

#ifdef USE_DIB32

#include "yaneDIB32.h"
#include "yaneDIBitmap.h"
#include "yaneGraphicLoader.h"
#include "yaneCPUID.h"
#include "yanePlane.h"
#include "yaneFile.h"
#include "yaneSinTable.h"
#include "yaneLZSS.h"
#include "yaneAppManager.h"

#ifndef _MSC_VER
#ifndef YANE_ASM_PORTABLE_HELPERS
#define YANE_ASM_PORTABLE_HELPERS
// [portable] helpers for the C equivalents of the MSVC inline asm in this file (not in yo2.exe).
// Each "#else" branch below is a 1:1 translation of the asm above it: DWORD locals stand for
// the 32-bit registers, yane_q for the MMX registers, yane_fl for the CF/ZF/SF flags that the
// asm actually tests, and labels/goto for its jumps. Register values are 32-bit addresses.
#include <string.h>
typedef unsigned long long yane_q;
struct yane_fl { int cf, zf, sf; };
#ifndef YANE_R2P
#define YANE_R2P(r) ((BYTE*)(size_t)(DWORD)(r))		//	register value -> address
#endif
#ifndef YANE_P2R
#define YANE_P2R(p) ((DWORD)(size_t)(p))			//	address -> register value
#endif
//	C variable <-> 32-bit register (pointers are stored as their 32-bit address)
template<class T> static inline DWORD yane_ld(const T& v) { return (DWORD)v; }
template<class T> static inline DWORD yane_ld(T* const& v) { return YANE_P2R(v); }
template<class T> static inline void yane_st(T& v, DWORD r) { v = (T)r; }
template<class T> static inline void yane_st(T*& v, DWORD r) { v = (T*)YANE_R2P(r); }
//	memory access (unaligned, aliasing-safe)
static inline DWORD yane_rd32(const void* p) { DWORD v; memcpy(&v, p, 4); return v; }
static inline void yane_wr32(void* p, DWORD v) { memcpy(p, &v, 4); }
static inline yane_q yane_rd64(const void* p) { yane_q v; memcpy(&v, p, 8); return v; }
static inline void yane_wr64(void* p, yane_q v) { memcpy(p, &v, 8); }
#define YANE_RD32(a)	yane_rd32(YANE_R2P(a))
#define YANE_WR32(a,v)	yane_wr32(YANE_R2P(a), (v))
#define YANE_RD64(a)	yane_rd64(YANE_R2P(a))
#define YANE_WR64(a,v)	yane_wr64(YANE_R2P(a), (v))
//	integer instructions that set flags (only used where a later jump reads the flags)
static inline void yane_logic(DWORD r, yane_fl& f) { f.cf = 0; f.zf = (r == 0); f.sf = (int)(r >> 31); }
static inline void yane_add(DWORD& d, DWORD s, yane_fl& f) { DWORD a = d; d = a + s; f.cf = (d < a); f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline void yane_sub(DWORD& d, DWORD s, yane_fl& f) { f.cf = (d < s); d -= s; f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline void yane_cmp(DWORD d, DWORD s, yane_fl& f) { yane_sub(d, s, f); }
static inline void yane_inc(DWORD& d, yane_fl& f) { ++d; f.zf = (d == 0); f.sf = (int)(d >> 31); }		//	CF unchanged
static inline void yane_dec(DWORD& d, yane_fl& f) { --d; f.zf = (d == 0); f.sf = (int)(d >> 31); }		//	CF unchanged
static inline void yane_neg(DWORD& d, yane_fl& f) { f.cf = (d != 0); d = 0 - d; f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline DWORD yane_sarv(DWORD d, int n) { return (d & 0x80000000) ? ~(~d >> n) : (d >> n); }
static inline DWORD yane_rorv(DWORD d, int n) { return (d >> n) | (d << (32 - n)); }
static inline DWORD yane_rolv(DWORD d, int n) { return (d << n) | (d >> (32 - n)); }
//	shifts: n is 1..31 (the translator drops count-0 shifts, which change nothing)
static inline void yane_shl(DWORD& d, int n, yane_fl& f) { f.cf = (int)((d >> (32 - n)) & 1); d <<= n; f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline void yane_shr(DWORD& d, int n, yane_fl& f) { f.cf = (int)((d >> (n - 1)) & 1); d >>= n; f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline void yane_sar(DWORD& d, int n, yane_fl& f) { f.cf = (int)((d >> (n - 1)) & 1); d = yane_sarv(d, n); f.zf = (d == 0); f.sf = (int)(d >> 31); }
static inline void yane_ror(DWORD& d, int n, yane_fl& f) { d = yane_rorv(d, n); f.cf = (int)(d >> 31); }		//	ZF/SF unchanged
static inline void yane_rol(DWORD& d, int n, yane_fl& f) { d = yane_rolv(d, n); f.cf = (int)(d & 1); }		//	ZF/SF unchanged
//	MUL: EDX:EAX = EAX * s (unsigned) / IDIV: EAX = EDX:EAX / s, EDX = remainder (signed, truncating)
static inline void yane_mul(DWORD& eax, DWORD& edx, DWORD s) { yane_q p = (yane_q)eax * s; eax = (DWORD)p; edx = (DWORD)(p >> 32); }
static inline void yane_idiv(DWORD& eax, DWORD& edx, DWORD s) {
	long long n = (long long)(((yane_q)edx << 32) | eax), d = (long long)(int)s;
	eax = (DWORD)(n / d); edx = (DWORD)(n % d);
}
static inline DWORD yane_bswap(DWORD d) { return (d >> 24) | ((d >> 8) & 0xff00) | ((d << 8) & 0xff0000) | (d << 24); }
//	MMX (lane-wise on a 64-bit value; byte/word/dword lanes are little-endian like MMX registers)
static inline yane_q yane_paddusb(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 64; i += 8) { unsigned s = (unsigned)((a >> i) & 0xff) + (unsigned)((b >> i) & 0xff); r |= (yane_q)(s > 0xff ? 0xff : s) << i; }
	return r;
}
static inline yane_q yane_psubusb(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 64; i += 8) { int s = (int)((a >> i) & 0xff) - (int)((b >> i) & 0xff); r |= (yane_q)(s < 0 ? 0 : s) << i; }
	return r;
}
static inline yane_q yane_paddw(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 64; i += 16) r |= (yane_q)((unsigned)((a >> i) + (b >> i)) & 0xffff) << i;
	return r;
}
static inline yane_q yane_psubw(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 64; i += 16) r |= (yane_q)((unsigned)((a >> i) - (b >> i)) & 0xffff) << i;
	return r;
}
static inline yane_q yane_paddd(yane_q a, yane_q b) {
	return (yane_q)(DWORD)((DWORD)a + (DWORD)b) | ((yane_q)(DWORD)((DWORD)(a >> 32) + (DWORD)(b >> 32)) << 32);
}
static inline yane_q yane_pmullw(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 64; i += 16) r |= (yane_q)(((unsigned)((a >> i) & 0xffff) * (unsigned)((b >> i) & 0xffff)) & 0xffff) << i;
	return r;
}
static inline yane_q yane_pcmpeqd(yane_q a, yane_q b) {
	return ((DWORD)a == (DWORD)b ? (yane_q)0xffffffffUL : 0) | ((DWORD)(a >> 32) == (DWORD)(b >> 32) ? (yane_q)0xffffffffUL << 32 : 0);
}
static inline yane_q yane_packuswb(yane_q a, yane_q b) {	//	signed words of a (low half) and b (high half) -> unsigned saturated bytes
	yane_q r = 0;
	for (int i = 0; i < 8; i++) {
		int w = (int)(short)(unsigned short)(((i < 4 ? a : b) >> ((i & 3) * 16)) & 0xffff);
		r |= (yane_q)(w < 0 ? 0 : (w > 0xff ? 0xff : w)) << (i * 8);
	}
	return r;
}
static inline yane_q yane_punpcklbw(yane_q a, yane_q b) {	//	interleave the low 4 bytes of a and b
	yane_q r = 0;
	for (int i = 0; i < 4; i++) r |= (((a >> (i * 8)) & 0xff) << (i * 16)) | (((b >> (i * 8)) & 0xff) << (i * 16 + 8));
	return r;
}
static inline yane_q yane_punpcklwd(yane_q a, yane_q b) {
	yane_q r = 0;
	for (int i = 0; i < 2; i++) r |= (((a >> (i * 16)) & 0xffff) << (i * 32)) | (((b >> (i * 16)) & 0xffff) << (i * 32 + 16));
	return r;
}
static inline yane_q yane_punpckldq(yane_q a, yane_q b) { return (a & 0xffffffffUL) | (b << 32); }
static inline yane_q yane_psrlw(yane_q a, yane_q n) {
	if (n > 15) return 0;
	yane_q r = 0;
	for (int i = 0; i < 64; i += 16) r |= (((a >> i) & 0xffff) >> n) << i;
	return r;
}
static inline yane_q yane_psrld(yane_q a, yane_q n) {
	if (n > 31) return 0;
	return (yane_q)((DWORD)a >> n) | ((yane_q)((DWORD)(a >> 32) >> n) << 32);
}
#endif
#endif

///////////////////////////////////////////////////////////////////////////////
//	CDIBBaseの代理母

// @yo2 0x00435870 review
CDIB32::CDIB32(){
	//	Pentium用のコードをデバッグするときは、これを有効にする
	//	m_lpDIB.Add(new CDIB32P5); return ;

	switch (CCPUID::GetID()){
	case 1:
	case 2:
		m_lpDIB.Add(new CDIB32P5);	 break;
	case 3:
		m_lpDIB.Add(new CDIB32PMMX); break;
	case 4:
		m_lpDIB.Add(new CDIB32P6);	 break;
	default:
		WARNING(true,"CPUID調査に失敗"); break;
	}
}

// @yo2 0x00436660 vt
CDIB32::~CDIB32(){
	m_lpDIB.Delete();
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00436720 cg
LRESULT CDIB32Base::CreateSurface(int nSizeX,int nSizeY){
	LRESULT hr;
	hr = InnerCreateSurface(nSizeX,nSizeY);
	if (hr) return hr;
	return Clear();
}

// @yo2 0x00436760 feat
LRESULT CDIB32Base::InnerCreateSurface(int nSizeX,int nSizeY){

	Release();	//	確保していたDIBを解放

	if (nSizeX<=0 || nSizeY<=0) {
		WARNING(true,"CDIB32Base::CreateSurfaceでサイズがおかしい");
		return 1;		//	invalid rect...こんなんで渡すなよー＾＾
	}

	if (m_bUseDIBSection) {
		//	DIBSectionに頼る場合
		BITMAPINFO bmi;
		bmi.bmiHeader.biSize		= sizeof(BITMAPINFOHEADER);
		bmi.bmiHeader.biWidth		=  nSizeX;
		bmi.bmiHeader.biHeight		= -nSizeY;
		bmi.bmiHeader.biPlanes		= 1;
		bmi.bmiHeader.biBitCount	= 32;
		bmi.bmiHeader.biCompression	= BI_RGB /* BI_BITFIELDS */ ;

		HDC hdc = ::GetDC(NULL); // hWndのほうがええんか？
		m_hBitmap = ::CreateDIBSection(hdc /* NULL */, &bmi , DIB_RGB_COLORS, (void**)&m_lpdwSrc, NULL, 0 );
		::ReleaseDC(NULL,hdc);

		//	この第１パラメータは、NULLというのはまずくないか？
		//	GetDC(NULL)にするか、それとも事前に32bppで初期化された
		//	DCを使うべきのような、、
		if (m_hBitmap==NULL) return 1;
		m_hDC = ::CreateCompatibleDC(NULL);
		::SelectObject(m_hDC,m_hBitmap);

/*
	このNULLのCompatibleDCを作ってるのがいかんのやな、、、
	NULLはＢＧ画面を意味するのだが、
	現在の画面解像度の影響をモロに受けるわけで、
	そのDCとコンパチということは、、すなわちこのDCは、Deviceに対して
	Independenctでも何でも無いってことやがな．．

	ちゅーことは、画面解像度の変更イベントの発生に際して、このへんハンドルを
	とりなおす処理が必要になってくるわけや。それが嫌なら、こんなコンパチブルなDCなんか作らんことや。
	ちゅーても、どうしようも無いんやけどな。
	しゃーないから、そないするか、、みたいな、、
*/

	} else {
		//	内部でDIBを作る場合
		int nAlign = 8;
		//	やっぱメモリもったいないから8固定にしとこっと:p
		/*
		if (CCPUID::GetID()<=3) {
			nAlign = 8;		//	Plain Pentium,MMX PentiumはQWORDでアラインする
		} else {
			nAlign = 32;	//	Pentium Pro以降は32バイトでアラインする
		}
		*/
		m_lpdwSrcOrg	= new BYTE[4 * nSizeX * nSizeY + (nAlign-1)];
		m_lpdwSrc		= (DWORD*)(((DWORD)m_lpdwSrcOrg + (nAlign-1)) & ~(nAlign-1));
	}

	//	Rectサイズの設定
	::SetRect(&m_rcRect,0,0,nSizeX,nSizeY);
	m_lPitch = m_rcRect.right << 2;

	//	各ラインの先頭アドレステーブルを用意
	m_lpdwLineStart.resize(nSizeY);
	{
		DWORD* lpdw = m_lpdwSrc;
		for(int i=0;i<nSizeY;i++){
			m_lpdwLineStart[i] = lpdw;
			lpdw = (DWORD*)((BYTE*)lpdw + m_lPitch);
		}
	}

	m_vFastPlaneInfo.Init((void*)m_lpdwSrc,m_lPitch,m_rcRect);

	return 0;
}

// @yo2 0x00436910 tight
LRESULT CDIB32Base::Resize(int nSizeX,int nSizeY){
	//	サイズが違うならばRecreate
	if (m_rcRect.right!=nSizeX || m_rcRect.bottom!=nSizeY) {
		return CreateSurface(nSizeX,nSizeY);
	}
	return 0;
}

// @yo2 0x00436950 cg
LPRECT	CDIB32Base::GetRect(){
	//	このプレーンのサーフェース矩形取得
	return &m_rcRect;
}

// @yo2 0x00436970 cg
RECT	CDIB32Base::GetClipRect(LPRECT lpRect){
	RECT r;
	if(lpRect == NULL){
		r = m_rcRect;
	} else {
		r = *lpRect;
	}

	// クリッピングする
	LPRECT lpClip = &m_rcRect;

	if (lpClip->left > r.left)	{ r.left   = lpClip->left;	 }
	if (lpClip->right< r.right) { r.right  = lpClip->right;	 }
	if (lpClip->top	 > r.top)	{ r.top	   = lpClip->top;	 }
	if (lpClip->bottom<r.bottom){ r.bottom = lpClip->bottom; }

	//	invalid rect,but..
	//	if (r.left >= r.right || r.top	>= r.bottom) return 1;

	return r;
}

///////////////////////////////////////////////////////////////////////////////

// @yo2? 0x00436a00 order
void	CDIB32Base::UseDIBSection(bool bUseDIB){
	m_bUseDIBSection = bUseDIB;
}

//	CreateDIBSectionを使うときに限り、以下の関数が使用可能
// @yo2 0x00436a20 review
HDC		CDIB32Base::GetDC(void){
	return m_hDC;
}
// @yo2 0x00436a40 review
HBITMAP	CDIB32Base::GetHBITMAP(void){
	return m_hBitmap;
}

#ifdef USE_DirectDraw
//	HDC取得(解放は不要。LoadかCreateSurfaceしたあとは解放するまで取得可能)
LRESULT	CDIB32Base::BltToPlane(CPlane*lpDstPlane,int x,int y,LPRECT lpSrcRect,LPRECT lpClipRect){
	WARNING(!m_bUseDIBSection,"CDIB32Base::BltToPlaneの呼び出において、UseDIBSection(true)されていなかった");
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BltToPlaneでm_lpdwSrc == NULL");

	//	generic clipping algorithm by yaneurao.

	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL) {
		m_rcSrcRect = m_rcRect;
	} else {
		m_rcSrcRect = *lpSrcRect;
	}

	//	クリップ領域
	LPRECT lpClip;
	RECT	rcClip;
	if (lpClipRect == NULL){
		int sx,sy;
		lpDstPlane->GetSize(sx,sy);
		::SetRect(&rcClip,0,0,sx,sy);
		lpClip = &rcClip;
	} else {
		lpClip = lpClipRect;

		/*	//	めんどくせーまっいっか～＾＾
		WARNING ( lpClip->left	< p->m_rcRect.left	|| lpClip->top	  < p->m_rcRect.top
			||	  lpClip->right > p->m_rcRect.right || lpClip->bottom > p->m_rcRect.bottom,
			"CDib32Base::Clippingでクリップ矩形が転送先サーフェースからはみ出している");
		*/
	}

	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		//LPRECT lpDstRect2 = lpDstPlane->GetRect();	// CPlaneにはGetRectが無い…
		int sx,sy;  lpDstPlane->GetSize(sx,sy);
		int t;
		//--- 修正 '02/04/08  by ENRA ---
		// 勝手に0にしたらあかんかった^^;;
		// うーん、0以下になることってあり得るんやろか
		if (lpClip->left<0)	{ lpClip->left = 0; }
		if (lpClip->top <0)	{ lpClip->top  = 0; }
		//-------------------------------
		t = lpClip->right  - sx;
		if (t>0)	{ lpClip->right  = sx; }
		t = lpClip->bottom - sy;
		if (t>0)	{ lpClip->bottom = sy; }
	}
	//-------------------------------

	// クリッピングする
	// this clipping algorithm is thought by yaneurao(M.Isozaki)
	int sx = m_rcSrcRect.right - m_rcSrcRect.left;
	int sy = m_rcSrcRect.bottom - m_rcSrcRect.top;
	::SetRect(&m_rcDstRect,x,y,x+sx,y+sy);

	int t;
	t = lpClip->left-x;
	if (t>0)	{ m_rcSrcRect.left += t;	m_rcDstRect.left = lpClip->left; }
	t = lpClip->top -y;
	if (t>0)	{ m_rcSrcRect.top  += t;	m_rcDstRect.top	 = lpClip->top;	 }
	t = x+sx-lpClip->right;
	if (t>0)	{ m_rcSrcRect.right -= t;	m_rcDstRect.right = lpClip->right; }
	t = y+sy-lpClip->bottom;
	if (t>0)	{ m_rcSrcRect.bottom -= t;	m_rcDstRect.bottom = lpClip->bottom; }

	//	invalid rect ?
	if (m_rcSrcRect.left >= m_rcSrcRect.right ||
		m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	HDC hDstDC= lpDstPlane->GetDC();
	if (hDstDC == NULL) return 2;	//	これ失敗するか～

	LRESULT lr = ::BitBlt(hDstDC,m_rcDstRect.left,m_rcDstRect.top
		,m_rcSrcRect.right - m_rcSrcRect.left,m_rcSrcRect.bottom - m_rcSrcRect.top
		,GetDC(),m_rcSrcRect.left,m_rcSrcRect.top,SRCCOPY)?0:1;

	lpDstPlane->ReleaseDC();

	return lr;
}

LRESULT	CDIB32Base::BltFromPlane(CPlane*lpSrcPlane,int x,int y,LPRECT lpSrcRect,LPRECT lpClipRect){
	WARNING(!m_bUseDIBSection,"BltFromPlane::BltFromPlaneの呼び出において、UseDIBSection(true)されていなかった");
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BltFromPlaneでm_lpdwSrc == NULL");

	//	generic clipping algorithm by yaneurao.

	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL) {
		int sx,sy;
		lpSrcPlane->GetSize(sx,sy);
		::SetRect(&m_rcSrcRect,0,0,sx,sy);
	} else {
		m_rcSrcRect = *lpSrcRect;
	}

	//	クリップ領域
	LPRECT lpClip;
	if (lpClipRect == NULL){
		lpClip = &m_rcRect;
	} else {
		lpClip = lpClipRect;

		/*	//	まあいっか～みたいな＾＾
		WARNING ( lpClip->left	< p->m_rcRect.left	|| lpClip->top	  < p->m_rcRect.top
			||	  lpClip->right > p->m_rcRect.right || lpClip->bottom > p->m_rcRect.bottom,
			"CDib32Base::Clippingでクリップ矩形が転送先サーフェースからはみ出している");
		*/
	}

	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		LPRECT lpDstRect2 = &m_rcRect;		// 転送先は自分
		int t;
		//--- 修正 '02/04/08  by ENRA ---
		// 勝手に0にしたらあかんかった^^;;
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


	// クリッピングする
	// this clipping algorithm is thought by yaneurao(M.Isozaki)
	int sx = m_rcSrcRect.right - m_rcSrcRect.left;
	int sy = m_rcSrcRect.bottom - m_rcSrcRect.top;
	::SetRect(&m_rcDstRect,x,y,x+sx,y+sy);

	int t;
	t = lpClip->left-x;
	if (t>0)	{ m_rcSrcRect.left += t;	m_rcDstRect.left = lpClip->left; }
	t = lpClip->top -y;
	if (t>0)	{ m_rcSrcRect.top  += t;	m_rcDstRect.top	 = lpClip->top;	 }
	t = x+sx-lpClip->right;
	if (t>0)	{ m_rcSrcRect.right -= t;	m_rcDstRect.right = lpClip->right; }
	t = y+sy-lpClip->bottom;
	if (t>0)	{ m_rcSrcRect.bottom -= t;	m_rcDstRect.bottom = lpClip->bottom; }
	//	invalid rect ?
	if (m_rcSrcRect.left >= m_rcSrcRect.right ||
		m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	HDC hSrcDC= lpSrcPlane->GetDC();
	if (hSrcDC == NULL) return 2;	//	これ失敗するか～

	LRESULT lr = ::BitBlt(GetDC(),m_rcDstRect.left,m_rcDstRect.top
		,m_rcSrcRect.right - m_rcSrcRect.left,m_rcSrcRect.bottom - m_rcSrcRect.top
		,hSrcDC,m_rcSrcRect.left,m_rcSrcRect.top,SRCCOPY)?0:1;

	lpSrcPlane->ReleaseDC();

	return lr;
}
#endif
///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00436a60 vt
LRESULT CDIB32Base::Load(string BitmapFileName,bool bLoadPalette){
	Release();	//	確保していたDIBを解放

#ifdef USE_YGA
	//	ygaフォーマット(yaneurao graphic format with alpha)
	string suffix;
	suffix = CFile::GetSuffixOf(BitmapFileName);
	CFile::ToLower(suffix);
	if (suffix=="yga"){
		LRESULT lr = InnerLoadYGA(BitmapFileName);
		if (lr==0) {
			SetColorKey(0,0);
			//	ygaはパレットを含まない
			m_bLoadBitmap = true;
			m_bYGA = true;
		}
		return lr;
	}
#endif

	if (m_bUseDIBSection){
		LRESULT lr = InnerLoad(BitmapFileName);
		if (lr==0) {
			SetColorKey(0,0);
			if (bLoadPalette) {
				if (CAppManager::GetMyDIBDraw()->GetPalette()->Get(GetDC())==0)
					CAppManager::GetMyDIBDraw()->RealizePalette();
			}
			m_bLoadBitmap = true;
		}
		return lr;
	}

	CDIBitmap dib;
	//	32Bppで作っておかないとコピーメモリーで済まない
	if (dib.Load(BitmapFileName,32)!=0) return 1;

	LONG x,y;
	if (dib.GetSize(x,y)!=0) return 2;

	InnerCreateSurface(x,y);

	HDC hdc = dib.GetDC();
	if (hdc==NULL) return 3;

	//	パレットも読み込みしとこ～っと＾＾；
	if (bLoadPalette) {
		if (CAppManager::GetMyDIBDraw()->GetPalette()->Get(GetDC())==0)
			CAppManager::GetMyDIBDraw()->RealizePalette();
	}

	DWORD* lpdw = GetPtr();
	/*
	for(int j=0;j<y;j++){
		for(int i=0;i<x;i++){
			COLORREF color = ::GetPixel(hdc,i,j);
			DWORD	 dwPixel;
			//	下位からRGBになっているのをBGRにする
			_asm {
				mov	  eax,color
				bswap eax
				shr	  eax,8
				mov	  dwPixel,eax
			}
			*(lpdw++) = dwPixel;
			//*(lpdw++) = color;
		}
	}
	*/
	DWORD*	lpdwSrc = (DWORD*)dib.GetPtr();
	::CopyMemory(lpdw,lpdwSrc,x*y << 2);

	//	何と、これでは最上位バイトが不定。とほほ～だね＾＾；
	ClearMSByte();

	m_bLoadBitmap = true;
	SetColorKey(0,0);

	return 0;
}

// @yo2 0x00436f40 cg
LRESULT CDIB32Base::InnerLoad(string BitmapFileName){
	//	DIBSectionを使っているとき用
	//	CDIBitmapからパクリ＾＾
	CFile file;
	file.Read(BitmapFileName);

	auto_ptrEx<CGraphicLoader> gl(CGraphicLoader::GetPrototypeFactory()->CreateInstance());
	if (gl->LoadPicture(file)) return 1;

	LONG x,y;
	if (gl->GetSize(x,y)) return 2;
	if (InnerCreateSurface(x,y)) return 3;
	if (gl->Render(GetPtr(),/* GetPitch()*/ GetRect()->right * 4)==0) return 0;
//		//	このサーフェースのポインタ渡してレンダリングできれば、それでもＯｋ

	if (gl->Render(GetDC())) return 4;

	//	何と、これでは最上位バイトが不定。とほほ～だね＾＾；
	ClearMSByte();

	return 0;
}

// @yo2 0x00437280 cg
void	CDIB32Base::ClearMSByte() {
	//	何と、これでは最上位バイトが不定。とほほ～だね＾＾；
	DWORD *p = GetPtr();
	int len = GetRect()->right * GetRect()->bottom;
	while( len-- ) *p++ &= 0x00FFFFFF;
}

#ifdef USE_YGA
// @yo2 0x004372f0 tight
LRESULT	CDIB32Base::InnerLoadYGA(string BitmapFileName){
	CFile file;
	if (file.Read(BitmapFileName)!=0) return 1;

	BYTE* lpSrc = (BYTE*)file.GetMemory();
	SYPGHeader& header = *(SYPGHeader*)lpSrc;

	if (InnerCreateSurface(header.dwSizeX,header.dwSizeY)!=0) return 2;
	if (!header.bCompress) {
		//	非圧縮転送
		::CopyMemory(GetPtr(),lpSrc+sizeof(SYPGHeader),header.dwOriginalSize);
	} else {
		// 圧縮されているので解凍しながらの転送
		CLZSS lzss;
		BYTE* lpDst = (BYTE*)GetPtr();
		if (lzss.Decode(lpSrc+sizeof(SYPGHeader),lpDst
			,header.dwOriginalSize,false)!=0) return 3;
	}
	return 0;
};
#endif

// @yo2 0x00437560 feat
LRESULT CDIB32Base::Save(string BitmapFileName,LPRECT lpRect){
	//	ファイルとして書き出す
	if (m_lpdwSrc == NULL) return 0;

	if (lpRect==NULL) lpRect = &m_rcRect;

	//	α値は未使用なので32bppではなく24bppで十分！

	int sx = lpRect->right	- lpRect->left;
	int sy = lpRect->bottom - lpRect->top;

	CDIBitmap dib;
	dib.CreateSurface(sx,sy);

	HDC hdc = dib.GetDC();
	if (hdc==NULL) return 1;

	HDC hdcsrc = GetDC();
	if (hdcsrc!=NULL) {
		//	BitBlt使えるときは使ったほうがいいような気がする＾＾
		if (!::BitBlt(hdc,0,0,sx,sy
		,hdcsrc,lpRect->left,lpRect->top,SRCCOPY))
			return 2;
	} else {
		//	イメージ転送なりり！
		for(int j=0,y=lpRect->top;y<lpRect->bottom;y++,j++){
			for(int i=0,x=lpRect->left;x<lpRect->right;x++,i++){
				DWORD dwPixel = GetPixel(x,y);
				//	保存やねんから、まあ、ちょっとぐらい遅くてもええかな？
				//	下位からRGBになっているのをBGRにする
#ifdef _MSC_VER
				_asm {
					mov		eax,dwPixel
					bswap	eax
					shr		eax,8
					mov		dwPixel,eax
				}
#else
				// [portable] C equivalent of the asm above (not in yo2.exe)
				{
					DWORD eax;
					eax = yane_ld(dwPixel);
					eax = yane_bswap(eax);
					eax >>= 8;
					yane_st(dwPixel, eax);
				}
#endif
				::SetPixel(hdc,i,j,dwPixel);
			}
		}
	}
	LRESULT lr = dib.Save(BitmapFileName);

	return lr;
}

#ifdef USE_YGA
// @yo2 0x00437870 tight
LRESULT CDIB32Base::SaveYGA(string BitmapFileName,LPRECT lpRect, bool bCompress ){

	if (lpRect!=NULL) return 1; // 未サポート(近々サポートする)

	//	圧縮を掛けて、ヘッダー情報を付与する
	CLZSS lzss; BYTE* lpDst; DWORD dwDstSize; bool bDelete;
	DWORD nSize = GetRect()->right * GetRect()->bottom * 4;
	if (! bCompress || lzss.Encode((BYTE*)GetPtr(),lpDst,nSize,dwDstSize)!=0 ) {
		// 圧縮しない or 圧縮かからんわーい
		lpDst = (BYTE*)GetPtr();
		dwDstSize = nSize;
		bDelete = false;
	} else {
		bDelete = true;
	}

	//	ヘッダーの設定
	SYPGHeader header;
	header.dwSizeX = GetRect()->right;
	header.dwSizeY = GetRect()->bottom;
	header.bCompress = (DWORD) bDelete;
	header.dwOriginalSize  = nSize;
	header.dwCompressSize = dwDstSize;

	nSize = sizeof(SYPGHeader) + dwDstSize;
	auto_array<BYTE> writebuf(nSize);
	::CopyMemory(writebuf,&header,sizeof(SYPGHeader));
	::CopyMemory(writebuf+sizeof(SYPGHeader),lpDst,dwDstSize);	
	if (bDelete) DELETEPTR_SAFE(lpDst);

	CFile f;
	return f.Write(BitmapFileName,(void*)(BYTE*)writebuf,nSize);
}
#endif

// @yo2 0x00437b10 feat
LRESULT CDIB32Base::Release(){
	if (m_hDC!=NULL){
		::DeleteDC(m_hDC);
		m_hDC = NULL;
	}
	if (m_hBitmap!=NULL){
		::DeleteObject(m_hBitmap);
		m_hBitmap = NULL;
		m_lpdwSrcOrg = NULL;
		m_lpdwSrc = NULL;
	} else {
		DELETEPTR_SAFE(m_lpdwSrcOrg);
		m_lpdwSrc = NULL;
	}
	m_lpdwLineStart.clear();
	m_bLoadBitmap = false;
	m_bYGA = false;

	m_vFastPlaneInfo.SetInit(false);

	ZERO(m_rcRect);
	return 0;
}

// @yo2 0x00437bb0 cg
bool	CDIB32Base::IsLoad(void) const {
	return m_bLoadBitmap;
}

// @yo2 0x00437bd0 review
void CDIB32Base::SetFillColor(DWORD dwDIB32RGB) {
	m_dwFillColor = dwDIB32RGB;
}

// @yo2 0x00437bf0 review
LRESULT CDIB32Base::Clear(DWORD dwDIB32RGB,LPRECT lpRect){
	if (m_lpdwSrc == NULL) return 1;	//	なんや？確保されとらんで^^

	if (dwDIB32RGB == CLR_INVALID) {
		dwDIB32RGB = m_dwFillColor;
	}
	
	if (lpRect==NULL) {
	//	画面全体に対するオペレーションかいな...
		LONG lSize = m_rcRect.right * m_rcRect.bottom;
		DWORD* lpdwSrc = m_lpdwSrc;
#ifdef _MSC_VER
		_asm {
			cld		//	for stosd ahead
			mov		ecx,lSize
			mov		eax,dwDIB32RGB
			mov		edi,lpdwSrc
			rep		stosd
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ecx, edi;
			ecx = yane_ld(lSize);
			eax = yane_ld(dwDIB32RGB);
			edi = yane_ld(lpdwSrc);
			for (; ecx != 0; --ecx) { YANE_WR32(edi, eax); edi += 4; }
		}
#endif
	} else {
		//	矩形に対するオペレーションかいな...
		int sx = lpRect->left, ex = lpRect->right,
			sy = lpRect->top , ey = lpRect->bottom;

		//	一応、範囲外かどうかチェックしとこか...
		WARNING(sx<m_rcRect.left || ex>m_rcRect.right
			||	sy<m_rcRect.top	 || ey>m_rcRect.bottom ,
			"CDIB32::Clearの矩形が範囲外");

		BYTE* lpby = (BYTE*)(m_lpdwSrc + sx + sy*m_rcRect.right);
		LONG lSize	= ex-sx;

		for(int y=sy;y<ey;y++) {
#ifdef _MSC_VER
			_asm {
				//	for文はdirection flagに関与しないだろうが、
				//	一応、ループ毎に設定しておくか...
				cld		//	for stosd ahead
				mov		ecx,lSize
				mov		eax,dwDIB32RGB
				mov		edi,lpby
				rep		stosd
			}
#else
			// [portable] C equivalent of the asm above (not in yo2.exe)
			{
				DWORD eax, ecx, edi;
				ecx = yane_ld(lSize);
				eax = yane_ld(dwDIB32RGB);
				edi = yane_ld(lpby);
				for (; ecx != 0; --ecx) { YANE_WR32(edi, eax); edi += 4; }
			}
#endif
			lpby += m_lPitch;
		}
	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// 透過キー設定関連
// @yo2 0x00437cd0 review
LRESULT CDIB32Base::SetColorKey(DWORD dwDIB32RGB){
	// 特定の色を転送のときの透過キーに設定する
	m_dwColorKey = dwDIB32RGB & 0xffffff;		//	念のためマスク掛けておく。
	return 0;	//	失敗はありえない
}

// @yo2 0x00437d00 review
LRESULT CDIB32Base::SetColorKey(int r,int g,int b){
	m_dwColorKey = DIB32RGB(r,g,b) & 0xffffff;
	return 0;
}

// @yo2 0x00437d40 review
LRESULT CDIB32Base::SetColorKey(int x,int y){		// (x,y)の点を透過キーに設定する
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SetColorKeyでm_lpdwSrc == NULL");
	if (x<m_rcRect.left || x>=m_rcRect.right
		 || y<m_rcRect.top || y>=m_rcRect.bottom)
		return 1;	//	範囲オーバーしている

	m_dwColorKey = GetPixel(x,y) & 0xffffff;	//	念のためマスク掛けておく。
	return 0;
}

// @yo2 0x00437db0 review
DWORD	CDIB32Base::GetColorKey(void){
	return m_dwColorKey;
}

///////////////////////////////////////////////////////////////////////////////
//	ピクセル操作系

// @yo2 0x00437dd0 vt
int	CDIB32Base::GetPixelAlpha(int x,int y){
	if (IsYGA()) {
		return GetPixel(x,y) >> 24;
	} else {
		//	範囲外ならば 0 となみす。
		if (x<0 || y<0 || x>=m_rcRect.right || y>=m_rcRect.bottom) return 0;

		DWORD dw = GetPixel(x,y);
		//	これが抜き色ならば、0。非抜き色ならば255とみなす
		if (GetColorKey() == dw) {
			return 0;
		}
		return 255;
	}
}


// @yo2 0x00437e60 cg
DWORD	CDIB32Base::GetPixel(int x,int y) {
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::GetPixelでm_lpdwSrc == NULL");
	//	安全のため＾＾；
	if (x<0 || y<0 || x>=m_rcRect.right || y>=m_rcRect.bottom) return 0;

	return *(m_lpdwSrc+x+y*m_rcRect.right);
}
// @yo2 0x00437eb0 review
void	CDIB32Base::SetPixel(int x,int y,DWORD dwDIB32RGB) {
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SetPixelでm_lpdwSrc == NULL");
	//	安全のため＾＾；
	if (x<0 || y<0 || x>=m_rcRect.right || y>=m_rcRect.bottom) return ;

	*(m_lpdwSrc+x+y*m_rcRect.right)= dwDIB32RGB;
}
// @yo2 0x00437f00 review
void	CDIB32Base::GetSize(int& sx,int& sy) {
	//	WARNING(m_lpdwSrc == NULL,"CDIB32Base::GetSizeでm_lpdwSrc == NULL");

	//	読み込んでいないときは(0,0)が返るように変更
	if (m_lpdwSrc == NULL) {
		sx = sy = 0;
	} else {
		sx = m_rcRect.right;
		sy = m_rcRect.bottom;
	}
}
// @yo2 0x00437f50 cg
DWORD*	CDIB32Base::GetPtr() {
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::GetPtrでm_lpdwSrc == NULL");
	return m_lpdwSrc;
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00437f70 review
CDIB32Base::CDIB32Base(void) {
	m_lpdwSrcOrg = NULL;	//	メモリは確保しとらんもんねー＾＾
	m_lpdwSrc	 = NULL;
	m_hBitmap	 = NULL;
	m_bUseDIBSection = false;
	m_hDC = NULL;			//	いつから忘れてたんや... ('00/09/19)
	m_dwColorKey = 0;		//	忘れてたわ＾＾；
	m_bLoadBitmap = false;
	m_dwFillColor = 0;		//	Clear色
	m_bYGA	= false;		//	ディフォルトでfalse
	ZERO(m_rcRect);			//	サイズはこれから換算するんで初期値は０
}

// @yo2 0x00438010 vt
CDIB32Base::~CDIB32Base(){
	Release();
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00438060 feat
LRESULT CDIB32Base::Clipping(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();

	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL) {
		m_rcSrcRect = p->m_rcRect;
	} else {
		m_rcSrcRect = *lpSrcRect;
	}

	//	クリップ領域
	LPRECT lpClip;
	if (lpClipRect == NULL){
		lpClip = &m_rcRect;
	} else {
		lpClip = lpClipRect;

//		WARNING ( lpClip->left	< m_rcRect.left	|| lpClip->top	  < m_rcRect.top
//			||	  lpClip->right > m_rcRect.right || lpClip->bottom > m_rcRect.bottom,
//			"CDib32Base::Clippingでクリップ矩形が転送先サーフェースからはみ出している");
	}

	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		LPRECT lpDstRect2 = &m_rcRect;		// 転送先は自分
		int t;
		//--- 修正 '02/04/08  by ENRA ---
		// 勝手に0にしたらあかんかった^^;;
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

	if ((lpDstSize==NULL)  ||
		((lpDstSize->cx == (m_rcSrcRect.right - m_rcSrcRect.left)) &&
		 (lpDstSize->cy == (m_rcSrcRect.bottom - m_rcSrcRect.top)))) {
		//	等倍の転送？
		m_bActualSize = true;

		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)
		int sx = m_rcSrcRect.right - m_rcSrcRect.left;
		int sy = m_rcSrcRect.bottom - m_rcSrcRect.top;
		::SetRect(&m_rcDstRect,x,y,x+sx,y+sy);

		int t;
		t = lpClip->left-x;
		if (t>0)	{ m_rcSrcRect.left += t;	m_rcDstRect.left = lpClip->left; }
		t = lpClip->top -y;
		if (t>0)	{ m_rcSrcRect.top  += t;	m_rcDstRect.top	 = lpClip->top;	 }
		t = x+sx-lpClip->right;
		if (t>0)	{ m_rcSrcRect.right -= t;	m_rcDstRect.right = lpClip->right; }
		t = y+sy-lpClip->bottom;
		if (t>0)	{ m_rcSrcRect.bottom -= t;	m_rcDstRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	} else {
		//	非等倍の転送？

		m_bActualSize = false;
		::SetRect(&m_rcDstRect,x,y,x+lpDstSize->cx,y+lpDstSize->cy);

		//	ブレゼンハムの初期値を計算する

		//	Initial(x,y) = -Dst size(x,y)
		m_nInitialX = m_rcDstRect.left - m_rcDstRect.right;
		m_nInitialY = m_rcDstRect.top  - m_rcDstRect.bottom;

		m_nStepX	= (m_rcSrcRect.right  - m_rcSrcRect.left) ;
		m_nStepY	= (m_rcSrcRect.bottom - m_rcSrcRect.top ) ;

		m_nCmpX = - (m_nInitialX);
		m_nCmpY = - (m_nInitialY);

		// invalid rect
		if (m_nCmpX == 0 || m_nCmpY == 0) return 1;

		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)

		//	ミラー時と非ミラー時でブレゼンハムの初期値が違う
		int t;
		t = lpClip->left-m_rcDstRect.left;
		if (t>0)	{
			m_nInitialX+=t*m_nStepX;	//	実際にブレゼンハムしてみる
			if (m_nInitialX > 0){
				int s = m_nInitialX / m_nCmpX + 1;
				m_rcSrcRect.left += s;	//	not mirror!
				m_nInitialX		-= s*m_nCmpX;
			}
			m_rcDstRect.left   = lpClip->left;
		}
		t = lpClip->top -m_rcDstRect.top;
		if (t>0)	{
			m_nInitialY+=t*m_nStepY;	//	実際にブレゼンハムしてみる
			if (m_nInitialY > 0){
				int s = m_nInitialY / m_nCmpY +1;
				m_rcSrcRect.top += s;
				m_nInitialY		-= s*m_nCmpY;
			}
			m_rcDstRect.top = lpClip->top;
		}
		t = m_rcDstRect.right-lpClip->right;
		if (t>0)	{
			m_rcDstRect.right  = lpClip->right;
/*
			int nInitialX = m_nInitialX;
			nInitialX+=(m_rcDstRect.right-m_rcDstRect.left)*m_nStepX;	//	実際にブレゼンハムしてみる
			if (nInitialX > 0){
				int s = nInitialX / m_nCmpX + 1;
				m_rcSrcRect.right = m_rcSrcRect.left + s;
			}
		} else {
			m_rcSrcRect.right--;
*/		}
		//	srcRectの算出。dstのはみ出し分だけ控えるのだが、t*m_nStepX/m_nCmpをroundupする必要あり。

		t = m_rcDstRect.bottom-lpClip->bottom;
		if (t>0)	{ /*m_rcSrcRect.bottom -= t;*/	m_rcDstRect.bottom = lpClip->bottom;}

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom ||
			m_rcDstRect.left >= m_rcDstRect.right ||
			m_rcDstRect.top	 >= m_rcDstRect.bottom) return 1;

		//	m_nStepX < m_nCmpXを保証する。
		m_nStepsX = m_nStepX/m_nCmpX;
		m_nStepX -= m_nCmpX*m_nStepsX;

		m_nStepsY = m_nStepY/m_nCmpY;
		m_nStepY -= m_nCmpY*m_nStepsY;

		// どこで１を引くのか分からないので、ここで引くのだ☆ By Tia
		m_nInitialX--;
		m_nInitialY--;
	}

	WARNING ( m_rcSrcRect.left	< p->m_rcRect.left	|| m_rcSrcRect.top	   < p->m_rcRect.top
		||	  m_rcSrcRect.right > p->m_rcRect.right || m_rcSrcRect.bottom  > p->m_rcRect.bottom,
		"CDib32Base::Clippingで転送元サーフェースの指定がサーフェースからはみ出している");

	return 0;
}

// @yo2 0x004384e0 feat
LRESULT CDIB32Base::ClippingM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();

	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL) {
		m_rcSrcRect = p->m_rcRect;
	} else {
		m_rcSrcRect = *lpSrcRect;
		if (m_rcSrcRect.left > m_rcSrcRect.right) {
			return 1;	//	invalid rect
		}
	}

	//	クリップ領域
	LPRECT lpClip;
	if (lpClipRect == NULL){
		lpClip = &m_rcRect;
	} else {
		lpClip = lpClipRect;

//		WARNING ( lpClip->left	< m_rcRect.left	 || lpClip->top	   < m_rcRect.top
//			||	  lpClip->right > m_rcRect.right || lpClip->bottom > m_rcRect.bottom,
//			"CDib32Base::Clippingでクリップ矩形が転送先サーフェースからはみ出している");
	}

	//--- 追加 '02/03/04  by ENRA ---
	{	// クリップRectは、転送先Rectに内包されないといけない
		// しかしClipRectが的はずれな所にあった場合の処理はどうしよう…
		LPRECT lpDstRect2 = &m_rcRect;		// 転送先は自分
		int t;
		//--- 修正 '02/04/08  by ENRA ---
		// 勝手に0にしたらあかんかった^^;;
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


	if ((lpDstSize==NULL)  ||
		((lpDstSize->cx == (m_rcSrcRect.right - m_rcSrcRect.left)) &&
		 (lpDstSize->cy == (m_rcSrcRect.bottom - m_rcSrcRect.top)))) {
		//	等倍の転送？
		m_bActualSize = true;

		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)
		int sx = m_rcSrcRect.right - m_rcSrcRect.left;
		int sy = m_rcSrcRect.bottom - m_rcSrcRect.top;
		::SetRect(&m_rcDstRect,x,y,x+sx,y+sy);

		int t;
		t = lpClip->left-x;
		if (t>0)	{ m_rcSrcRect.right -= t;	m_rcDstRect.left = lpClip->left; }
		t = lpClip->top -y;
		if (t>0)	{ m_rcSrcRect.top  += t;	m_rcDstRect.top	 = lpClip->top;	 }
		t = x+sx-lpClip->right;
		if (t>0)	{ m_rcSrcRect.left += t;	m_rcDstRect.right = lpClip->right; }
		t = y+sy-lpClip->bottom;
		if (t>0)	{ m_rcSrcRect.bottom -= t;	m_rcDstRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	} else {
		//	非等倍の転送？

		m_bActualSize = false;
		::SetRect(&m_rcDstRect,x,y,x+lpDstSize->cx,y+lpDstSize->cy);

		//	ブレゼンハムの初期値を計算する

		//	Initial(x,y) = -Dst size(x,y)
		m_nInitialX = m_rcDstRect.left - m_rcDstRect.right;
		m_nInitialY = m_rcDstRect.top  - m_rcDstRect.bottom;

		m_nStepX	= (m_rcSrcRect.right  - m_rcSrcRect.left) << 1;
		m_nStepY	= (m_rcSrcRect.bottom - m_rcSrcRect.top ) << 1;

		m_nCmpX = - (m_nInitialX << 1);
		m_nCmpY = - (m_nInitialY << 1);

		// invalid rect
		if (m_nCmpX == 0 || m_nCmpY == 0) return 1;

		// クリッピングする
		// this clipping algorithm is thought by yaneurao(M.Isozaki)

		//	ミラー時と非ミラー時でブレゼンハムの初期値が違う
		int t;
		t = lpClip->left-m_rcDstRect.left;
		if (t>0)	{
			m_nInitialX+=t*m_nStepX;	//	実際にブレゼンハムしてみる
			if (m_nInitialX > 0){
				int s = m_nInitialX / m_nCmpX +1;
				//	ミラーのときは、SrcRectはrightからスキャンしてね
				m_rcSrcRect.right -= s; // mirror!
//				m_rcSrcRect.left += s;	// mirror!
				m_nInitialX		-= s*m_nCmpX;
			}
			m_rcDstRect.left   = lpClip->left;
		}
		t = lpClip->top -m_rcDstRect.top;
		if (t>0)	{
			m_nInitialY+=t*m_nStepY;	//	実際にブレゼンハムしてみる
			if (m_nInitialY > 0){
				int s = m_nInitialY / m_nCmpY +1;
				m_rcSrcRect.top += s;
				m_nInitialY		-= s*m_nCmpY;
			}
			m_rcDstRect.top = lpClip->top;
		}
		t = m_rcDstRect.right-lpClip->right;
		if (t>0)	{
			m_rcDstRect.right  = lpClip->right;
/*
			int nInitialX = m_nInitialX;
			nInitialX+=(m_rcDstRect.right-m_rcDstRect.left)*m_nStepX;	//	実際にブレゼンハムしてみる
			if (nInitialX > 0){
				int s = nInitialX / m_nCmpX + 1;
				m_rcSrcRect.left = m_rcSrcRect.right - s;
			}
*/		}

		t = m_rcDstRect.bottom-lpClip->bottom;
		if (t>0)	{ /*m_rcSrcRect.bottom -= t;*/	m_rcDstRect.bottom = lpClip->bottom;}

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom ||
			m_rcDstRect.left >= m_rcDstRect.right ||
			m_rcDstRect.top	 >= m_rcDstRect.bottom) return 1;

		//	m_nStepX < m_nCmpXを保証する。
		m_nStepsX = m_nStepX/m_nCmpX;
		m_nStepX -= m_nCmpX*m_nStepsX;

		m_nStepsY = m_nStepY/m_nCmpY;
		m_nStepY -= m_nCmpY*m_nStepsY;

		// どこで１を引くのか分からないので、ここで引くのだ☆ By Tia
		m_nInitialX--;
		m_nInitialY--;
	}

	WARNING ( m_rcSrcRect.left	< p->m_rcRect.left	|| m_rcSrcRect.top	  < p->m_rcRect.top
		||	  m_rcSrcRect.right > p->m_rcRect.right || m_rcSrcRect.bottom > p->m_rcRect.bottom,
		"CDib32Base::Clippingで転送元サーフェースの指定がサーフェースからはみ出している");

	return 0;
}

// @yo2 0x00438980 vt
LRESULT CDIB32Base::BltNatural(CDIB32* lpDIBSrc32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	//	これは、手動ポリもーフィズムのための仕掛けである＾＾；
	if (!lpDIBSrc32->IsYGA()) {
		//	通常転送
		return Blt(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	} else {
		//	ブレンド転送
		return BlendBltFastAlpha(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
}

// @yo2 0x004389f0 vt
LRESULT CDIB32Base::BltNatural(CDIB32* lpDIBSrc32,int x,int y,int nFade,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect){
	//	これは、手動ポリもーフィズムのための仕掛けである＾＾；
	if (nFade==0) return 0;
	//	通常表示やん．．
	if (nFade==256) {
		return BltNatural(lpDIBSrc32,x,y,lpSrcRect,lpDstSize,lpClipRect);
	}
	
	DWORD dw = PlaneRGB(nFade,nFade,nFade);
	if (!lpDIBSrc32->IsYGA()) {
		//	通常転送
		return BlendBlt(lpDIBSrc32,x,y,0xffffff-dw,dw,lpSrcRect,lpDstSize,lpClipRect);
	} else {
		//	ブレンド転送
		return BlendBltFastAlpha(lpDIBSrc32,x,y,0xffffff-dw,dw,lpSrcRect,lpDstSize,lpClipRect);
	}
}
///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00438ad0 vt
LRESULT CDIB32P5::ShadeOff(LPRECT lpSrcRect){

	//	easy clipping
	RECT rc;
	if (lpSrcRect == NULL){
		rc = m_rcRect;
	} else {
		rc = *lpSrcRect;
	}
	if (rc.left	  < m_rcRect.left)	{ rc.left	= m_rcRect.left; }
	if (rc.top	  < m_rcRect.top)	{ rc.top	= m_rcRect.top;	}
	if (rc.right  > m_rcRect.right)	{ rc.right	= m_rcRect.right;}
	if (rc.bottom > m_rcRect.bottom){ rc.bottom = m_rcRect.bottom;}

	if (rc.left >= rc.right || rc.top >= rc.bottom) return 1;	//	invalid rect

	int sx = rc.right  - rc.left;
	int sy = rc.bottom - rc.top;

	if (sx<=3 || sy<=3) return 2; // too small area..

	//	自分がプロットした点に騙されてはいけない。
	//	このため、ここでは遅延書き込みを行なう。
	auto_array<DWORD> lpDst(sx);
	DWORD pixel;
	int i,y;
	for (y = rc.top ; y < rc.bottom-1 ; y++ ){
		DWORD* lpSrc	= m_lpdwSrc+(rc.left  )+(y	)*m_rcRect.right;
		DWORD* lpUp		= m_lpdwSrc+(rc.left  )+(y-1)*m_rcRect.right;
		DWORD* lpDown	= m_lpdwSrc+(rc.left  )+(y+1)*m_rcRect.right;
		DWORD* lpLeft	= m_lpdwSrc+(rc.left-1)+(y	)*m_rcRect.right;
		DWORD* lpRight	= m_lpdwSrc+(rc.left+1)+(y	)*m_rcRect.right;

		if (y==rc.top){
			//	上端
			::CopyMemory(lpDst,lpSrc,sx*sizeof(DWORD));
			continue;
		}

		//	左端
		pixel = (*lpUp&0xfff8f8f8) + (*(lpDown++)&0xfff8f8f8) + ((*(lpRight++)&0xfff8f8f8)<<1) + ((*(lpSrc++)&0xfff8f8f8)<<2);
		*(lpUp++) = lpDst[0];		//	遅延書き込み
		lpLeft++;
		lpDst[0] = pixel >> 3;
		//	中央
		for (i = 1 ; i < sx-1 ; i++ ){
			pixel = (*lpUp&0xfff8f8f8) + (*(lpDown++)&0xfff8f8f8) + (*(lpLeft++)&0xfff8f8f8) + (*(lpRight++)&0xfff8f8f8) + ((*(lpSrc++)&0xfff8f8f8)<<2);
			*(lpUp++) = lpDst[i];		//	遅延書き込み
			lpDst[i] = pixel >> 3;
		}
		//	右端
		pixel = (*lpUp&0xfff8f8f8) + (*(lpDown++)&0xfff8f8f8) + ((*(lpLeft++)&0xfff8f8f8)<<1) + ((*(lpSrc++)&0xfff8f8f8)<<2);
		lpRight++;
		*(lpUp++) = lpDst[i];		//	遅延書き込み
		lpDst[i] = pixel >> 3;

	}
	DWORD* lpSrc	= m_lpdwSrc+(rc.left  )+( y-1 )*m_rcRect.right;
	::CopyMemory(lpSrc,lpDst,sx*sizeof(DWORD));					//	遅延バッファのワンライン
	::CopyMemory(lpSrc+m_rcRect.right,lpDst,sx*sizeof(DWORD));	//	最後のワンラインはごまかす＾＾；
	return 0;
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00438e70 vt
LRESULT CDIB32P5::MosaicEffect(int d, LPRECT lpRect){
	//　プレーンに対してモザイクをかける機能		added '99/12/1
	//	d :	量子化レベル
	if (d==0) return -2;	//	これで落ちるのはまずかろう...

	RECT r = GetClipRect(lpRect);
	LONG lPitch	 = GetRect()->right;
	DWORD* pSurface = GetPtr();

	for(int y=r.top;y<r.bottom;y+=d){
		int d2;		//	下端の端数
		if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
		for(int x=r.left;x<r.right;x+=d){
			int d1;	//	右端の端数
			if (x+d>r.right) d1=r.right-x; else d1=d;
			
			DWORD *p,*p2;
			p = pSurface + y*lPitch + x;
			DWORD c;	// 代表点の色
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
	return 0;
}

// @yo2 0x00438ff0 vt
LRESULT CDIB32P5::FlushEffect(LPRECT lpRect){
	//	プレーンに対してネガポジ反転させる機能		added '99/12/1

	RECT r = GetClipRect(lpRect);
	LONG lPitch	 = GetRect()->right;
	DWORD* pSurface = GetPtr();

	for(int y=r.top;y<r.bottom;y++){
		DWORD *p = pSurface + y*lPitch + r.left;
		for(int x=r.left;x<r.right;x++){
			*(p++) ^= 0xffffff;	//	下位24ビットに対してxorするだけ:p
		}
	}

	return 0;
}

// @yo2 0x004390b0 vt
LRESULT CDIB32P5::FadeEffect(int nFade,LPRECT lpRect){
	//	プレーンのブライトネスを落とす機能	added '00/10/03
	//	手抜きだけど、それなりに速いので、いいやー＾＾；

	RECT r = GetClipRect(lpRect);
	LONG lPitch	 = GetRect()->right;
	DWORD* pSurface = GetPtr();

	static DWORD dwTable[256];
	static int nSelectTable = -1;
	if (nSelectTable != nFade){
	//	テーブルの作りなおし
		DWORD dwCount = 0;
		for(int i=0;i<256;++i,dwCount+=nFade)
			dwTable[i] = dwCount >> 8;
		nSelectTable = nFade;
	}

	for(int y=r.top;y<r.bottom;y++){
		DWORD *p = pSurface + y*lPitch + r.left;
		for(int x=r.left;x<r.right;x++){
			DWORD dwPixel = *p;
			dwPixel =  (dwTable[dwPixel & 0xff	  ])
					+  (dwTable[(dwPixel>>8)&0xff ]<<8 )
					+  (dwTable[(dwPixel>>16)&0xff]<<16);
			*(p++) = dwPixel;
		}
	}

	return 0;
}

///////////////////////////////////////////////////////////////////////////////
//	各CPUごとのルーチン(assisted by Tia Deen)

////////////////////////////////////////////////////////////////////////////
//	Pentium用のルーチン
////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////
//	ミラー無し矩形転送
////////////////////////////////////////////////////////////////////
//////////////////////////////////////
//	Blt
//	抜き色有りの転送
//////////////////////////////////////
// @yo2 0x004391f0 vt
LRESULT CDIB32P5::Blt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::Bltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::Bltでp->GetPtr() == NULL");

// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;
	DWORD	lPitchSrc = p->m_lPitch;
	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth =	  m_lPitch - (nWidth<<2);									// ASMで使用する 1ラインのバイト数の設定
	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
		DWORD		colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV		ECX, nWidth
			MOV		EDX, nHeight

			MOV		EDI, lpDst
			MOV		ESI, lpSrc

			MOV		EBX, colKey				// UnPair

		LoopX_1:	// 5(4)クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			CMP		EAX, EBX
			JE		Skip_1

			MOV		[EDI], EAX				// UnPair

		Skip_1:
			ADD		EDI, 4										// EDIを先に進める
			DEC		ECX

			JNZ		LoopX_1					// UnPair

			MOV		ECX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			DEC		EDX

			JNZ		LoopX_1					// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_fl f;
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			ebx = yane_ld(colKey);
		LoopX_1:
			eax = YANE_RD32(esi);
			esi += 4;
			yane_cmp(eax, ebx, f);
			if (f.zf) goto Skip_1;
			YANE_WR32(edi, eax);
		Skip_1:
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_1;
			ecx = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopX_1;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:有	 --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;
		BYTE*	lpSrcBack;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;
		LoopY_2:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_2: // 7(6)クロック･サイクル
			MOV		EAX, [ESI]									// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			CMP		EAX, colKey
			JE		SkipColKey_2

			MOV		[EDI], EAX				// UnPair

		SkipColKey_2:
			ADD		EDI, 4					// UnPair			// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_2										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_2:
			DEC		i
			JNZ		LoopX_2

			MOV		ESI, lpSrcBack;								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_2					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			SUB		EDX, EY2				// UnPair			// Yの補正
			
		SkipY_2:
			DEC		j
			JNZ		LoopY_2
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_2:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_2:
			eax = YANE_RD32(esi);
			esi += yane_ld(AddSrcPixel);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_2;
			YANE_WR32(edi, eax);
		SkipColKey_2:
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_2;
			esi += 4;
			ecx -= yane_ld(EX2);
		SkipX_2:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_2;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_2;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_2:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_2;
		}
#endif
	} // if

	
	return 0;
} // Blt


//////////////////////////////////////
//	BltFast
//	抜き色無しの転送
//////////////////////////////////////
// @yo2 0x00439410 vt
LRESULT CDIB32P5::BltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BltFastでm_lpdwSrc == NULL");
	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BltFastでp->GetPtr() == NULL");

// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);				// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, nHeight
			MOV		ECX, nWidth

			CLD								// UnPair			// ディレクション クリア

		LoopX_3: // ???クロック･サイクル
			REP		MOVSD

			MOV		ECX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			DEC		EDX

			JNZ		LoopX_3					// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
		LoopX_3:
			for (; ecx != 0; --ecx) { YANE_WR32(edi, YANE_RD32(esi)); esi += 4; edi += 4; }
			ecx = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopX_3;
		}
#endif
	} // if
// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:有	 --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		int		i, j;
		BYTE*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;
		

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_5:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX									// EY = InitializeX;

		LoopX_5: // 5クロック･サイクル
			MOV		EAX, [ESI]									// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			MOV		[EDI], EAX
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_5										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_5:
			DEC		i
			JNZ		LoopX_5

			MOV		ESI, lpSrcBack								// Srcをラインの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_5					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc			// 1ライン分加算して、次の行へ
			SUB		EDX, EY2									// Yの補正

		SkipY_5:
			DEC		j
			JNZ		LoopY_5
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_5:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_5:
			eax = YANE_RD32(esi);
			esi += yane_ld(AddSrcPixel);
			YANE_WR32(edi, eax);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_5;
			esi += 4;
			ecx -= yane_ld(EX2);
		SkipX_5:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_5;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_5;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_5:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_5;
		}
#endif
	} // if

	
	return 0;
} // BltFast


//////////////////////////////////////
//	BlendBltHalf
//	抜き色有りの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x00439610 vt
LRESULT CDIB32P5::BlendBltHalf(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltHalfでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltHalfでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		EDI, lpDst
			MOV		ESI, lpSrc

			MOV		i, EAX
			MOV		j, EBX

		LoopX_6:	// 11(4)クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			CMP		EAX, colKey
			JE		Skip_6

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			MOV		EDX, EBX
			AND		EAX, EBX

			XOR		ECX, EDX				// UnPair

			SHR		ECX, 1
			MOV		EBX, Mask7f

			AND		ECX, EBX				// UnPair

			ADD		EAX, ECX				// UnPair

			MOV		[EDI], EAX				// UnPair

		Skip_6:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_6					// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_6
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_6:
			eax = YANE_RD32(esi);
			esi += 4;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto Skip_6;
			ebx = YANE_RD32(edi);
			ecx = eax;
			edx = ebx;
			eax &= ebx;
			ecx ^= edx;
			ecx >>= 1;
			ebx = yane_ld(Mask7f);
			ecx &= ebx;
			eax += ecx;
			YANE_WR32(edi, eax);
		Skip_6:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_6;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_6;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:有	 1:1ブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_7:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_7: // 12(6)クロック･サイクル
			MOV		EAX, [ESI]				// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_7

			MOV		EBX, [EDI]				// UnPair

			XOR		EAX, EBX				// UnPair

			SHR		EAX, 1					// UnPair

			AND		EAX, Mask7f
			AND		EBX, [ESI]

			ADD		EAX, EBX				// UnPair

			MOV		[EDI], EAX				// UnPair

		SkipColKey_7:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_7										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_7:
			DEC		i
			JNZ		LoopX_7

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_7					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc			// 1ライン分加算して、次の行へ
			SUB		EDX, EY2									// Yの補正
		SkipY_7:
			DEC		j
			JNZ		LoopY_7
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_7:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_7:
			eax = YANE_RD32(esi);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_7;
			ebx = YANE_RD32(edi);
			eax ^= ebx;
			eax >>= 1;
			eax &= yane_ld(Mask7f);
			ebx &= YANE_RD32(esi);
			eax += ebx;
			YANE_WR32(edi, eax);
		SkipColKey_7:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_7;
			esi += 4;
			ecx -= yane_ld(EX2);
		SkipX_7:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_7;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_7;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_7:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_7;
		}
#endif
	} // if

	
	return 0;
} // BlendBltHalf


//////////////////////////////////////
//	BlendBltFastHalf
//	抜き色無しの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x00439870 vt
LRESULT CDIB32P5::BlendBltFastHalf(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltFastHalfでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltFastHalfでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);				// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		EDI, lpDst
			MOV		ESI, lpSrc

			MOV		i, EAX
			MOV		j, EBX

		LoopX_8:	// 8クロック･サイクル
			MOV		EAX, [ESI]
			MOV		EBX, [EDI]

			MOV		ECX, EAX
			AND		EAX, EBX

			XOR		ECX, EBX
			ADD		ESI, 4

			SHR		ECX, 1
			MOV		EBX, Mask7f

			AND		ECX, EBX				// UnPair

			ADD		EAX, ECX				// UnPair

			MOV		[EDI], EAX
			ADD		EDI, 4										// EDIを先に進める

			DEC		i
			JNZ		LoopX_8

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_8
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_8:
			eax = YANE_RD32(esi);
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			esi += 4;
			ecx >>= 1;
			ebx = yane_ld(Mask7f);
			ecx &= ebx;
			eax += ecx;
			YANE_WR32(edi, eax);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_8;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_8;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:有	 1:1ブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_9:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_9: // 10クロック･サイクル
			MOV		EAX, [ESI]				// UnPair			// ピクセルのコピー
			
			MOV		EBX, [EDI]				// UnPair

			XOR		EAX, EBX				// UnPair

			SHR		EAX, 1					// UnPair

			AND		EAX, Mask7f
			AND		EBX, [ESI]

			ADD		EAX, EBX				// UnPair

			MOV		[EDI], EAX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_9										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_9:
			DEC		i
			JNZ		LoopX_9

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算
		
			JNB		SkipY_9					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc			// 1ライン分加算して、次の行へ
			SUB		EDX, EY2									// Yの補正

		SkipY_9:
			DEC		j
			JNZ		LoopY_9
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_9:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_9:
			eax = YANE_RD32(esi);
			ebx = YANE_RD32(edi);
			eax ^= ebx;
			eax >>= 1;
			eax &= yane_ld(Mask7f);
			ebx &= YANE_RD32(esi);
			eax += ebx;
			YANE_WR32(edi, eax);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_9;
			esi += 4;
			ecx -= yane_ld(EX2);
		SkipX_9:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_9;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_9;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_9:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_9;
		}
#endif
	} // if

	
	return 0;
} // BlendBltFastHalf


//////////////////////////////////////
//	BlendBlt
//	抜き色有りのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x00439ac0 vt
LRESULT CDIB32P5::BlendBlt(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		bgRateDst, EAX

			MOV		rRate, EBX				// UnPair

		LoopX_10: // 35クロック･サイクル (MULを 9クロックと数えると59クロック)
			MOV		EAX, [ESI]
			ADD		ESI, 4

			CMP		EAX, colKey
			JE		SkipColKey_10

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

			MUL		bgRateDst				// UnPair			//	間違ってた byTia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_10:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_10				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_10
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(bgRateDst, eax);
			yane_st(rRate, ebx);
		LoopX_10:
			eax = YANE_RD32(esi);
			esi += 4;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_10;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_10:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_10;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_10;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		rRate, EBX

			MOV		bgRateDst, EAX
			MOV		EDI, lpDst

			MOV		ESI, lpSrc
			MOV		EAX, EIY

			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_11:
			MOV		EAX, EIX				// UnPair
			MOV		lpSrcBack, ESI

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_11: // 34クロック･サイクル (MULを 9クロックと数えると58クロック)
			MOV		EAX, [ESI]									// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			CMP		EAX, colKey
			JE		SkipColKey_11

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_11:
			ADD		EDI, 4										// Dstを次に進める
			MOV		EAX, EX

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_11										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_11:
			DEC		i
			JNZ		LoopX_11

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_11										// if ( EY >= 0 )

			ADD		ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正
		SkipY_11:
			DEC		j
			JNZ		LoopY_11
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(rRate, ebx);
			yane_st(bgRateDst, eax);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			eax = yane_ld(EIY);
			yane_st(nEYCnt, eax);
		LoopY_11:
			eax = yane_ld(EIX);
			yane_st(lpSrcBack, esi);
			yane_st(nEXCnt, eax);
		LoopX_11:
			eax = YANE_RD32(esi);
			esi += yane_ld(AddSrcPixel);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_11;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_11:
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_11;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_11:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_11;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_11;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_11:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_11;
		}
#endif
	} // if

	
	return 0;
} // BlendBlt


//////////////////////////////////////
//	BlendBltFast
//	抜き色無しのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x00439f50 vt
LRESULT CDIB32P5::BlendBltFast(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		bgRateDst, EAX

			MOV		rRate, EBX				// UnPair

		LoopX_12: // 34クロック･サイクル (MULを 9クロックと数えると59クロック)
			MOV		EAX, [ESI]
			ADD		ESI, 4

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_12				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_12
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(bgRateDst, eax);
			yane_st(rRate, ebx);
		LoopX_12:
			eax = YANE_RD32(esi);
			esi += 4;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_12;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_12;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		rRate, EBX

			MOV		bgRateDst, EAX
			MOV		EDI, lpDst

			MOV		ESI, lpSrc
			MOV		EAX, EIY

			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_13:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_13: // 37クロック･サイクル (MULを 9クロックと数えると61クロック)
			MOV		EAX, [ESI]									// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// Dstを次に進める
			MOV		EAX, EX

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_13										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_13:
			DEC		i
			JNZ		LoopX_13

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_13									// if ( EY >= 0 )

			ADD		ESI, lPitchSrc				// 1ライン分加算して、次の行へ
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正

		SkipY_13:
			DEC		j
			JNZ		LoopY_13
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(rRate, ebx);
			yane_st(bgRateDst, eax);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			eax = yane_ld(EIY);
			yane_st(nEYCnt, eax);
		LoopY_13:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_13:
			eax = YANE_RD32(esi);
			esi += yane_ld(AddSrcPixel);
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_13;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_13:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_13;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_13;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_13:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_13;
		}
#endif
	} // if

	
	return 0;
} // BlendBltFast


//////////////////////////////////////
//	AddColorBlt
//	抜き色有りのAddブレンド転送
//////////////////////////////////////
// @yo2 0x0043a3b0 vt
LRESULT CDIB32P5::AddColorBlt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::AddColorBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::AddColorBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_14: // 15クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			CMP		EAX, colKey
			JE		SkipColKey_14

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI-4]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_14:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_14				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_14
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_14:
			eax = YANE_RD32(esi);
			esi += 4;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_14;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi - 4);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_14:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_14;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_14;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_15:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_15: // 19(8)クロック･サイクル
			MOV		EAX, [ESI]				// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_15

			MOV		EBX, [EDI]				// UnPair
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_15:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_15										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_15:
			DEC		i
			JNZ		LoopX_15

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_15									// if ( EY >= 0 )

			ADD		ESI, lPitchSrc							// 1ライン分加算して、次の行へ
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正

		SkipY_15:
			DEC		j
			JNZ		LoopY_15
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_15:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_15:
			eax = YANE_RD32(esi);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_15;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_15:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_15;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_15:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_15;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_15;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_15:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_15;
		}
#endif
	} // if

	
	return 0;
} // AddColorBlt


//////////////////////////////////////
//	AddColorBltFast
//	抜き色無しのAddブレンド転送
//////////////////////////////////////
// @yo2 0x0043a680 vt
LRESULT CDIB32P5::AddColorBltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::AddColorBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::AddColorBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_16: // 14クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI-4]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_16				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_16
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_16:
			eax = YANE_RD32(esi);
			esi += 4;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi - 4);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_16;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_16;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:有	 ADDブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_17:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_17: // 18クロック･サイクル
			MOV		EAX, [ESI]				// UnPair			// ピクセルのコピー

			MOV		EBX, [EDI]				// UnPair
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_17										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_17:
			DEC		i
			JNZ		LoopX_17

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_17										// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正
		SkipY_17:
			DEC		j
			JNZ		LoopY_17
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_17:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_17:
			eax = YANE_RD32(esi);
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_17;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_17:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_17;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_17;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_17:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_17;
		}
#endif
	} // if

	
	return 0;
} // AddColorBltFast


//////////////////////////////////////
//	SubColorBlt
//	抜き色有りのSubブレンド転送
//////////////////////////////////////
// @yo2 0x0043a930 vt
LRESULT CDIB32P5::SubColorBlt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SubColorBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::SubColorBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_18: // 16クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			CMP		EAX, colKey
			JE		SkipColKey_18

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI-4]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

		SkipColKey_18:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_18				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_18
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_18:
			eax = YANE_RD32(esi);
			esi += 4;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_18;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi - 4);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
		SkipColKey_18:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_18;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_18;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:無   拡縮:有	 SUBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_19:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_19: // 20(8)クロック･サイクル
			MOV		EAX, [ESI]				// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_19

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

		SkipColKey_19:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_19										// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_19:
			DEC		i
			JNZ		LoopX_19

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_19									// if ( EY >= 0 )

			ADD		ESI, lPitchSrc							// 1ライン分加算して、次の行へ
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正
	
		SkipY_19:
			DEC		j
			JNZ		LoopY_19
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_19:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_19:
			eax = YANE_RD32(esi);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_19;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
		SkipColKey_19:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_19;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_19:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_19;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_19;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_19:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_19;
		}
#endif
	} // if

	
	return 0;
} // SubColorBlt


//////////////////////////////////////
//	SubColorBltFast
//	抜き色無しのSubブレンド転送
//////////////////////////////////////
// @yo2 0x0043ac00 vt
LRESULT CDIB32P5::SubColorBltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SubColorBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::SubColorBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_20: // 15クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI-4]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_20				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_20
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_20:
			eax = YANE_RD32(esi);
			esi += 4;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi - 4);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_20;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_20;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:有	 SUBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_21:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_21: // 19クロック･サイクル
			MOV		EAX, [ESI]									// ピクセルのコピー

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_21									// if ( EX >= 0)

			ADD		ESI, 4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_21:
			DEC		i
			JNZ		LoopX_21

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_21										// if ( EY >= 0 )

			ADD		ESI, lPitchSrc							// 1ライン分加算して、次の行へ
			MOV		EAX, EY2

			SUB		nEYCnt, EAX									// Yの補正

		SkipY_21:
			DEC		j
			JNZ		LoopY_21
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_21:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_21:
			eax = YANE_RD32(esi);
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_21;
			esi += 4;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_21:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_21;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_21;
			esi += yane_ld(lPitchSrc);
			eax = yane_ld(EY2);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_21:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_21;
		}
#endif
	} // if


	return 0;
} // SubColorBltFast


////////////////////////////////////////////////////////////////////
//	ミラー有り矩形転送
////////////////////////////////////////////////////////////////////
//////////////////////////////////////
//	BltM
//	抜き色有りの転送
//////////////////////////////////////
// @yo2 0x0043aec0 vt
LRESULT CDIB32P5::BltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ECX, nWidth
			MOV		EDX, nHeight

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EBX, colKey				// UnPair

		LoopY_1:

		LoopX_1:	// 5(4)クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			CMP		EAX, EBX
			JE		Skip_1

			MOV		[EDI], EAX				// UnPair

		Skip_1:
			ADD		EDI, 4										// EDIを先に進める
			DEC		ECX

			JNZ		LoopX_1					// UnPair

			MOV		ECX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			DEC		EDX

			JNZ		LoopY_1					// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_fl f;
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			ebx = yane_ld(colKey);
		LoopY_1:
		LoopX_1:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			yane_cmp(eax, ebx, f);
			if (f.zf) goto Skip_1;
			YANE_WR32(edi, eax);
		Skip_1:
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_1;
			ecx = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_1;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:有	 --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;
		BYTE*	lpSrcBack;
		DWORD	lPitchSrc =	 p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_2:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_2: // 7(6)クロック･サイクル
			MOV		EAX, [ESI-4]								// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			CMP		EAX, colKey
			JE		SkipColKey_2

			MOV		[EDI], EAX				// UnPair

		SkipColKey_2:
			ADD		EDI, 4					// UnPair			// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_2										// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_2:
			DEC		i
			JNZ		LoopX_2

			MOV		ESI, lpSrcBack;								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_2					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			SUB		EDX, EY2									// Yの補正

		SkipY_2:
			DEC		j
			JNZ		LoopY_2
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_2:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_2:
			eax = YANE_RD32(esi - 4);
			esi += yane_ld(AddSrcPixel);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_2;
			YANE_WR32(edi, eax);
		SkipColKey_2:
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_2;
			esi += 0xFFFFFFFC;
			ecx -= yane_ld(EX2);
		SkipX_2:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_2;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_2;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_2:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_2;
		}
#endif
	} // if


	return 0;
} // BltM


//////////////////////////////////////
//	BltFastM
//	抜き色無しの転送
//////////////////////////////////////
// @yo2 0x0043b0e0 vt
LRESULT CDIB32P5::BltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, nHeight
			MOV		ECX, nWidth

		LoopX_3: // 3クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			MOV		[EDI], EAX 
			ADD		EDI, 4

			DEC		ECX
			JNZ		LoopX_3

			MOV		ECX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			DEC		EDX

			JNZ		LoopX_3					// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ecx, edx, esi, edi;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
		LoopX_3:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			YANE_WR32(edi, eax);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_3;
			ecx = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopX_3;
		}
#endif
	} // if
// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:有	 --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_4:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_4: // 5クロック･サイクル
			MOV		EAX, [ESI-4]								// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			MOV		[EDI], EAX
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_4										// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_4:
			DEC		i
			JNZ		LoopX_4

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_4					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			SUB		EDX, EY2									// Yの補正

		SkipY_4:
			DEC		j
			JNZ		LoopY_4
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_4:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_4:
			eax = YANE_RD32(esi - 4);
			esi += yane_ld(AddSrcPixel);
			YANE_WR32(edi, eax);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_4;
			esi += 0xFFFFFFFC;
			ecx -= yane_ld(EX2);
		SkipX_4:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_4;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_4;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_4:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_4;
		}
#endif
	} // if

	
	return 0;
} // BltFastM


//////////////////////////////////////
//	BlendBltHalfM
//	抜き色有りの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x0043b300 vt
LRESULT CDIB32P5::BlendBltHalfM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltHalfMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltHalfMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		EDI, lpDst
			MOV		ESI, lpSrc

			MOV		i, EAX
			MOV		j, EBX

		LoopY_5:

		LoopX_5:	// 11(4)クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			CMP		EAX, colKey
			JE		Skip_5

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			MOV		EDX, EBX
			AND		EAX, EBX

			XOR		ECX, EDX				// UnPair

			SHR		ECX, 1
			MOV		EBX, Mask7f

			AND		ECX, EBX				// UnPair

			ADD		EAX, ECX				// UnPair

			MOV		[EDI], EAX				// UnPair

		Skip_5:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_5					// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopY_5
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopY_5:
		LoopX_5:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto Skip_5;
			ebx = YANE_RD32(edi);
			ecx = eax;
			edx = ebx;
			eax &= ebx;
			ecx ^= edx;
			ecx >>= 1;
			ebx = yane_ld(Mask7f);
			ecx &= ebx;
			eax += ecx;
			YANE_WR32(edi, eax);
		Skip_5:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_5;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_5;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:有	 1:1ブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_6:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_6: // 12(6)クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_6

			MOV		EBX, [EDI]				// UnPair

			XOR		EAX, EBX				// UnPair

			SHR		EAX, 1					// UnPair

			AND		EAX, Mask7f
			AND		EBX, [ESI-4]

			ADD		EAX, EBX				// UnPair

			MOV		[EDI], EAX				// UnPair

		SkipColKey_6:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_6										// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_6:
			DEC		i
			JNZ		LoopX_6

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_6					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			SUB		EDX, EY2									// Yの補正

		SkipY_6:
			DEC		j
			JNZ		LoopY_6
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_6:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_6:
			eax = YANE_RD32(esi - 4);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_6;
			ebx = YANE_RD32(edi);
			eax ^= ebx;
			eax >>= 1;
			eax &= yane_ld(Mask7f);
			ebx &= YANE_RD32(esi - 4);
			eax += ebx;
			YANE_WR32(edi, eax);
		SkipColKey_6:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_6;
			esi += 0xFFFFFFFC;
			ecx -= yane_ld(EX2);
		SkipX_6:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_6;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_6;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_6:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_6;
		}
#endif
	} // if

	
	return 0;
} // BlendBltHalfM


//////////////////////////////////////
//	BlendBltFastHalfM
//	抜き色無しの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x0043b560 vt
LRESULT CDIB32P5::BlendBltFastHalfM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltFastHalfMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltFastHalfMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		EDI, lpDst
			MOV		ESI, lpSrc

			MOV		i, EAX
			MOV		j, EBX

		LoopX_7:	// 8クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair
			ADD		ESI, -4

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			AND		EAX, EBX
			XOR		ECX, EBX

			SHR		ECX, 1
			MOV		EBX, Mask7f

			AND		ECX, EBX				// UnPair

			ADD		EAX, ECX				// UnPair

			MOV		[EDI], EAX
			ADD		EDI, 4										// EDIを先に進める

			DEC		i
			JNZ		LoopX_7

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_7
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_7:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			ecx = eax;
			ebx = YANE_RD32(edi);
			eax &= ebx;
			ecx ^= ebx;
			ecx >>= 1;
			ebx = yane_ld(Mask7f);
			ecx &= ebx;
			eax += ecx;
			YANE_WR32(edi, eax);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_7;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_7;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:有	 1:1ブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EDX, EIY				// UnPair			// EX = InitializeY;

		LoopY_8:
			MOV		lpSrcBack, ESI
			MOV		ECX, EIX				// UnPair			// EY = InitializeX;

		LoopX_8: // 10クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair			// ピクセルのコピー

			MOV		EBX, [EDI]				// UnPair

			XOR		EAX, EBX				// UnPair

			SHR		EAX, 1					// UnPair

			AND		EAX, Mask7f
			AND		EBX, [ESI-4]

			ADD		EAX, EBX				// UnPair

			MOV		[EDI], EAX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			ADD		ECX, EX										// Xの増分を加算
			JNB		SkipX_8										// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			SUB		ECX, EX2									// Xの補正

		SkipX_8:
			DEC		i
			JNZ		LoopX_8

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			ADD		EDX, EY										// Yの増分を加算

			JNB		SkipY_8					// UnPair			// if ( EY >= 0 )

			ADD		ESI, lPitchSrc
			SUB		EDX, EY2									// Yの補正

		SkipY_8:
			DEC		j
			JNZ		LoopY_8
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			edx = yane_ld(EIY);
		LoopY_8:
			yane_st(lpSrcBack, esi);
			ecx = yane_ld(EIX);
		LoopX_8:
			eax = YANE_RD32(esi - 4);
			ebx = YANE_RD32(edi);
			eax ^= ebx;
			eax >>= 1;
			eax &= yane_ld(Mask7f);
			ebx &= YANE_RD32(esi - 4);
			eax += ebx;
			YANE_WR32(edi, eax);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(ecx, yane_ld(EX), f);
			if (!f.cf) goto SkipX_8;
			esi += 0xFFFFFFFC;
			ecx -= yane_ld(EX2);
		SkipX_8:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_8;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			yane_add(edx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_8;
			esi += yane_ld(lPitchSrc);
			edx -= yane_ld(EY2);
		SkipY_8:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_8;
		}
#endif
	} // if


	return 0;
} // BlendBltHalfM


//////////////////////////////////////
//	BlendBltM
//	抜き色有りのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043b7c0 vt
LRESULT CDIB32P5::BlendBltM(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		bgRateDst, EAX

			MOV		rRate, EBX				// UnPair

		LoopX_9: // 35クロック･サイクル (MULを 9クロックと数えると59クロック)
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			CMP		EAX, colKey
			JE		SkipColKey_9

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

//			MUL		bgRateSrc				// UnPair
			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_9:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_9				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_9
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(bgRateDst, eax);
			yane_st(rRate, ebx);
		LoopX_9:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_9;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_9:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_9;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_9;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		rRate, EBX

			MOV		bgRateDst, EAX
			MOV		EDI, lpDst

			MOV		ESI, lpSrc
			MOV		EAX, EIY

			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_10:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_10: // 34クロック･サイクル (MULを 9クロックと数えると58クロック)
			MOV		EAX, [ESI-4]								// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			CMP		EAX, colKey
			JE		SkipColKey_10

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

//			MUL		bgRateSrc				// UnPair
			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_10:
			ADD		EDI, 4										// Dstを次に進める
			MOV		EAX, EX

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_10									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_10:
			DEC		i
			JNZ		LoopX_10

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_10									// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_10:
			DEC		j
			JNZ		LoopY_10
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(rRate, ebx);
			yane_st(bgRateDst, eax);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			eax = yane_ld(EIY);
			yane_st(nEYCnt, eax);
		LoopY_10:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_10:
			eax = YANE_RD32(esi - 4);
			esi += yane_ld(AddSrcPixel);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_10;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_10:
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_10;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_10:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_10;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_10;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_10:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_10;
		}
#endif
	} // if

	
	return 0;
} // BlendBltM


//////////////////////////////////////
//	BlendBltFastM
//	抜き色無しのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043bc50 vt
LRESULT CDIB32P5::BlendBltFastM(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::BlendBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::BlendBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		i, j;

				nSrcWidth = nSrcWidth +	 p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		bgRateDst, EAX

			MOV		rRate, EBX				// UnPair

		LoopX_11: // 34クロック･サイクル (MULを 9クロックと数えると59クロック)
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

//			MUL		bgRateSrc				// UnPair
			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_11				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_11
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(bgRateDst, eax);
			yane_st(rRate, ebx);
		LoopX_11:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_11;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_11;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	bgRateSrc;
		DWORD	bgRateDst;
		DWORD	rRate;
		DWORD	SrcBackup;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EAX, dwSrcRGBRate
			MOV		ECX, dwDstRGBRate

			MOV		EBX, EAX
			MOV		EDX, ECX

			ROR		EAX, 8										// αＲＧＢをＢαＲＧにする
			AND		EBX, 0x00ff0000								// src:０Ｒ００にするためにマスクを取る

			AND		EAX, 0xff0000ff								// Ｂ００Ｇにするためにマスクを取る
			AND		ECX, 0x00ff0000								// dst:０Ｒ００にするためにマスクを取る

			SHR		EBX, 16
			MOV		bgRateSrc, EAX

			SHL		ECX, 8
			MOV		EAX, EDX

			ROR		EAX, 8
			OR		EBX, ECX									// dＲ００sＲになった

			AND		EAX, 0xff0000ff
			MOV		rRate, EBX

			MOV		bgRateDst, EAX
			MOV		EDI, lpDst

			MOV		ESI, lpSrc
			MOV		EAX, EIY

			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_12:
			MOV		lpSrcBack, ESI
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_12: // 37クロック･サイクル (MULを 9クロックと数えると61クロック)
			MOV		EAX, [ESI-4]								// ピクセルのコピー
			ADD		ESI, AddSrcPixel							// 整数部の加算

			MOV		ECX, [EDI]				// 2
			MOV		EBX, EAX				// 1

			ROR		EAX, 8					// 1				// αＲＧＢをＢαＲＧにする
			AND		ECX, 0x00ff0000			// 2				// ０Ｒ００にするためにマスクを取る

			SHL		ECX, 8					// 2
			AND		EBX, 0x00ff0000			// 1				// ０Ｒ００にするためにマスクを取る

			SHR		EBX, 16					// 1
			AND		EAX, 0xff0000ff			// 1				// Ｂ００Ｇにするためにマスクを取る

			MUL		bgRateSrc				// UnPair

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			OR		EBX, ECX									// dR００sRができた

			MOV		ECX, EAX									// Srcの0x0000GGBBができた
			MOV		EAX, EBX

			MUL		rRate					// UnPair			// EAX:SrcのＲ、EDX:DstのＲ

			AND		EAX, 0x0000ff00			// 1
			MOV		EBX, [EDI]				// 2

			SHL		EAX, 8					// 1
			AND		EDX, 0xff000000			// 3

			ROR		EBX, 8					// 2				// αＲＧＢをＢαＲＧにする
			OR		EAX, ECX				// 1				// Srcの0x00RRGGBBの完成

			SHR		EDX, 8					// 3
			MOV		SrcBackup, EAX			// 1

			MOV		ECX, EDX				// 3
			AND		EBX, 0xff0000ff			// 2				// Ｂ００Ｇにするためにマスクを取る

			MOV		EAX, EBX				// 2// UnPair

//			MUL		bgRateSrc				// UnPair
			MUL		bgRateDst				// UnPair			//	間違ってた by Tia

			SHR		EDX, 24
			AND		EAX, 0x0000ff00

			OR		EAX, EDX
			MOV		EBX, SrcBackup

			OR		EAX, ECX				// UnPair			// Dstの0x00RRGGBBの完成

			// ---------- サチュレーションADD ------------
			MOV		EDX, EAX									// DSTの保存
			MOV		ECX, EAX

			AND		EAX, EBX				// UnPair			// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask
			
			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, SrcBackup

			ADD		EAX, Mask7f									// + 0x7f7f7f
			MOV		ECX, EDX

			XOR		EAX, Mask7f									//	^ 0x7f7f7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - c)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// Dstを次に進める
			MOV		EAX, EX

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_12									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_12:
			DEC		i
			JNZ		LoopX_12

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_12										// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_12:
			DEC		j
			JNZ		LoopY_12
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			eax = yane_ld(dwSrcRGBRate);
			ecx = yane_ld(dwDstRGBRate);
			ebx = eax;
			edx = ecx;
			eax = yane_rorv(eax, 8);
			ebx &= 0x00FF0000;
			eax &= 0xFF0000FF;
			ecx &= 0x00FF0000;
			ebx >>= 16;
			yane_st(bgRateSrc, eax);
			ecx <<= 8;
			eax = edx;
			eax = yane_rorv(eax, 8);
			ebx |= ecx;
			eax &= 0xFF0000FF;
			yane_st(rRate, ebx);
			yane_st(bgRateDst, eax);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			eax = yane_ld(EIY);
			yane_st(nEYCnt, eax);
		LoopY_12:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
			yane_st(nEXCnt, eax);
		LoopX_12:
			eax = YANE_RD32(esi - 4);
			esi += yane_ld(AddSrcPixel);
			ecx = YANE_RD32(edi);
			ebx = eax;
			eax = yane_rorv(eax, 8);
			ecx &= 0x00FF0000;
			ecx <<= 8;
			ebx &= 0x00FF0000;
			ebx >>= 16;
			eax &= 0xFF0000FF;
			yane_mul(eax, edx, yane_ld(bgRateSrc));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx |= ecx;
			ecx = eax;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(rRate));
			eax &= 0x0000FF00;
			ebx = YANE_RD32(edi);
			eax <<= 8;
			edx &= 0xFF000000;
			ebx = yane_rorv(ebx, 8);
			eax |= ecx;
			edx >>= 8;
			yane_st(SrcBackup, eax);
			ecx = edx;
			ebx &= 0xFF0000FF;
			eax = ebx;
			yane_mul(eax, edx, yane_ld(bgRateDst));
			edx >>= 24;
			eax &= 0x0000FF00;
			eax |= edx;
			ebx = yane_ld(SrcBackup);
			eax |= ecx;
			edx = eax;
			ecx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = yane_ld(SrcBackup);
			eax += yane_ld(Mask7f);
			ecx = edx;
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_12;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_12:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_12;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_12;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_12:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_12;
		}
#endif
	} // if

	
	return 0;
} // BlendBltFastM


//////////////////////////////////////
//	AddColorBltM
//	抜き色有りのAddブレンド転送
//////////////////////////////////////
// @yo2 0x0043c0e0 vt
LRESULT CDIB32P5::AddColorBltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::AddColorBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::AddColorBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_13: // 15クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			CMP		EAX, colKey
			JE		SkipColKey_13

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_13:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_13				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_13
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_13:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_13;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_13:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_13;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_13;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:有	 RGBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_14:
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p
			MOV		lpSrcBack, ESI

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_14: // 19(8)クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_14

			MOV		EBX, [EDI]				// UnPair
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI-4]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

		SkipColKey_14:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_14									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_14:
			DEC		i
			JNZ		LoopX_14

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_14										// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_14:
			DEC		j
			JNZ		LoopY_14
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_14:
			eax = yane_ld(EIX);
			yane_st(lpSrcBack, esi);
			yane_st(nEXCnt, eax);
		LoopX_14:
			eax = YANE_RD32(esi - 4);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_14;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi - 4);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
		SkipColKey_14:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_14;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_14:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_14;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_14;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_14:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_14;
		}
#endif
	} // if

	
	return 0;
} // AddColorBltM


//////////////////////////////////////
//	AddColorBltFastM
//	抜き色無しのAddブレンド転送
//////////////////////////////////////
// @yo2 0x0043c3b0 vt
LRESULT CDIB32P5::AddColorBltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::AddColorBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::AddColorBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_15: // 14クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_15				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_15
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_15:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_15;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_15;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:有	 ADDブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_16:
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p
			MOV		lpSrcBack, ESI

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_16: // 18クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair			// ピクセルのコピー

			MOV		EBX, [EDI]
			MOV		ECX, EAX

			AND		EAX, EBX									// (src&dst)
			XOR		ECX, EBX									// (src^dst)

			SHL		EAX, 1										// <<1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			MOV		EBX, [ESI-4]

			ADD		EAX, Mask7f									// + Mask7f
			MOV		ECX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			ADD		EBX, ECX									// src + dst

			SUB		EBX, EAX				// UnPair			// ( - mask)

			OR		EBX, EAX				// UnPair			// () | mask

			MOV		[EDI], EBX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_16									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_16:
			DEC		i
			JNZ		LoopX_16

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_16										// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_16:
			DEC		j
			JNZ		LoopY_16
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_16:
			eax = yane_ld(EIX);
			yane_st(lpSrcBack, esi);
			yane_st(nEXCnt, eax);
		LoopX_16:
			eax = YANE_RD32(esi - 4);
			ebx = YANE_RD32(edi);
			ecx = eax;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			ebx = YANE_RD32(esi - 4);
			eax += yane_ld(Mask7f);
			ecx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ebx += ecx;
			ebx -= eax;
			ebx |= eax;
			YANE_WR32(edi, ebx);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_16;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_16:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_16;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_16;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_16:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_16;
		}
#endif
	} // if

	
	return 0;
} // AddColorBltFastM


//////////////////////////////////////
//	SubColorBltM
//	抜き色有りのSubブレンド転送
//////////////////////////////////////
// @yo2 0x0043c680 vt
LRESULT CDIB32P5::SubColorBltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SubColorBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::SubColorBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_17: // 16クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			CMP		EAX, colKey
			JE		SkipColKey_17

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

		SkipColKey_17:
			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_17				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_17
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_17:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_17;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
		SkipColKey_17:
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_17;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_17;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:有   ミラー:有   拡縮:有	 SUBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX				// UnPair			// EY = InitializeY;

		LoopY_18:
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p
			MOV		lpSrcBack, ESI

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_18: // 20(8)クロック･サイクル
			MOV		EAX, [ESI-4]			// UnPair			// ピクセルのコピー

			CMP		EAX, colKey
			JE		SkipColKey_18

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI-4]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

		SkipColKey_18:
			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_18									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_18:
			DEC		i
			JNZ		LoopX_18

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_18										// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_18:
			DEC		j
			JNZ		LoopY_18
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_18:
			eax = yane_ld(EIX);
			yane_st(lpSrcBack, esi);
			yane_st(nEXCnt, eax);
		LoopX_18:
			eax = YANE_RD32(esi - 4);
			yane_cmp(eax, yane_ld(colKey), f);
			if (f.zf) goto SkipColKey_18;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi - 4);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
		SkipColKey_18:
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_18;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_18:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_18;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_18;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_18:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_18;
		}
#endif
	} // if

	
	return 0;
} // SubColorBltM


//////////////////////////////////////
//	SubColorBltFastM
//	抜き色無しのSubブレンド転送
//////////////////////////////////////
// @yo2 0x0043c950 vt
LRESULT CDIB32P5::SubColorBltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32Base::SubColorBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32Base::SubColorBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;


	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, lpDst

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_19: // 15クロック･サイクル
			MOV		EAX, [ESI-4]
			ADD		ESI, -4

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

			ADD		EDI, 4										// EDIを先に進める
			DEC		i

			JNZ		LoopX_19				// UnPair

			MOV		EAX, nWidth
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			ADD		ESI, nSrcWidth								// 次ラインへの移動
			MOV		i, EAX

			DEC		j
			JNZ		LoopX_19
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_19:
			eax = YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
			edi += 4;
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_19;
			eax = yane_ld(nWidth);
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_19;
		}
#endif
	}// if
// -----------	 Pentium   カラーキー:無   ミラー:有   拡縮:有	 SUBブレンド:有	  --------------
	else
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;

		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		nEXCnt, nEYCnt;
		int		i, j;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV		EAX, nHeight
			MOV		EBX, nWidth

			MOV		j, EAX
			MOV		i, EBX

			MOV		EDI, lpDst
			MOV		EAX, EIY

			MOV		ESI, lpSrc
			MOV		nEYCnt, EAX									// EY = InitializeY;

		LoopY_20:
			MOV		EAX, EIX				// UnPair			// ペアにならないけど・・・まぁ、yループ毎だからいっか:p
			MOV		lpSrcBack, ESI

			MOV		nEXCnt, EAX				// UnPair			// EX = InitializeX;

		LoopX_20: // 19クロック･サイクル
			MOV		EAX, [ESI-4]								// ピクセルのコピー

			MOV		ECX, EAX
			MOV		EBX, [EDI]

			NOT		EBX						// UnPair

			AND		EAX, EBX									// (src & ~dst)
			XOR		ECX, EBX									// (src ^ ~dst)

			SHL		EAX, 1										// << 1
			AND		ECX, feMask									// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f									// + Mask7f
			MOV		EBX, [EDI]

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		ECX, [ESI-4]

			OR		EBX, EAX									// dst | c
			OR		ECX, EAX									// src | c

			SUB		EBX, ECX				// UnPair			// () - ()

			MOV		[EDI], EBX				// UnPair

			ADD		ESI, AddSrcPixel							// 整数部の加算
			ADD		EDI, 4										// Dstを次に進める

			MOV		EAX, EX					// UnPair

			ADD		nEXCnt, EAX									// Xの増分を加算
			JNB		SkipX_20									// if ( EX >= 0)

			ADD		ESI, -4										// Srcを次に進める
			MOV		EAX, EX2

			SUB		nEXCnt, EAX				// UnPair			// Xの補正

		SkipX_20:
			DEC		i
			JNZ		LoopX_20

			MOV		ESI, lpSrcBack								// Srcの先頭に戻す
			ADD		EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV		EAX, nWidth
			ADD		ESI, AddWidthSrc							// 整数部の加算 '00.09.12.byTia

			MOV		i, EAX
			MOV		EAX, EY										// Yの増分を加算

			ADD		nEYCnt, EAX									// Yの増分を加算
			JNB		SkipY_20										// if ( EY >= 0 )

			MOV		EAX, EY2									// Yの補正
			ADD		ESI, lPitchSrc								// クリップした領域分を飛ばす

			SUB		nEYCnt, EAX				// UnPair			// Yの補正

		SkipY_20:
			DEC		j
			JNZ		LoopY_20
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, esi, edi;
			DWORD t;
			yane_fl f;
			eax = yane_ld(nHeight);
			ebx = yane_ld(nWidth);
			yane_st(j, eax);
			yane_st(i, ebx);
			edi = yane_ld(lpDst);
			eax = yane_ld(EIY);
			esi = yane_ld(lpSrc);
			yane_st(nEYCnt, eax);
		LoopY_20:
			eax = yane_ld(EIX);
			yane_st(lpSrcBack, esi);
			yane_st(nEXCnt, eax);
		LoopX_20:
			eax = YANE_RD32(esi - 4);
			ecx = eax;
			ebx = YANE_RD32(edi);
			ebx = ~ebx;
			eax &= ebx;
			ecx ^= ebx;
			eax <<= 1;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			ebx = YANE_RD32(edi);
			eax ^= yane_ld(Mask7f);
			ecx = YANE_RD32(esi - 4);
			ebx |= eax;
			ecx |= eax;
			ebx -= ecx;
			YANE_WR32(edi, ebx);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			eax = yane_ld(EX);
			t = yane_ld(nEXCnt); yane_add(t, eax, f); yane_st(nEXCnt, t);
			if (!f.cf) goto SkipX_20;
			esi += 0xFFFFFFFC;
			eax = yane_ld(EX2);
			yane_st(nEXCnt, yane_ld(nEXCnt) - eax);
		SkipX_20:
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_20;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			eax = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_st(i, eax);
			eax = yane_ld(EY);
			t = yane_ld(nEYCnt); yane_add(t, eax, f); yane_st(nEYCnt, t);
			if (!f.cf) goto SkipY_20;
			eax = yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
			yane_st(nEYCnt, yane_ld(nEYCnt) - eax);
		SkipY_20:
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopY_20;
		}
#endif
	} // if

	
	return 0;
} // SubColorBltFastM


////////////////////////////////////////////////////////////////////
//	このプレーンに対するエフェクト
////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////
//	AddColorFast
//	抜き色無しのADDブレンド転送 (同プレーン)
//////////////////////////////////////////////////
// @yo2 0x0043cc20 vt
LRESULT CDIB32P5::AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect)
{
// クリッピング等の処理
	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL)
	{
		m_rcSrcRect = m_rcRect;
	}
	else
	{
		m_rcSrcRect = *lpSrcRect;
		if ( m_rcSrcRect.left > m_rcSrcRect.right )
		{
			return 1;	// invalid rect
		}
	}
	//	クリップ領域
	LPRECT lpClip;
	lpClip = &m_rcRect;

		// クリッピングする
		// this yaneurao clipping algorithm is changed by tia
		int t;
		t = lpClip->left  - m_rcSrcRect.left;
		if ( t > 0 ) { m_rcSrcRect.left = lpClip->left; }
		t = lpClip->top	  - m_rcSrcRect.top;
		if ( t > 0 ) { m_rcSrcRect.top = lpClip->top; }
		t = m_rcSrcRect.right - lpClip->right;
		if ( t > 0 ) { m_rcSrcRect.right = lpClip->right; }
		t = m_rcSrcRect.bottom - lpClip->bottom;
		if ( t > 0 ) { m_rcSrcRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcSrcRect.right - m_rcSrcRect.left;
	int		nHeight = m_rcSrcRect.bottom - m_rcSrcRect.top;
	DWORD	nAddSrcWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
	DWORD*	lpSrc = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcSrcRect.left<<2) + m_rcSrcRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, dwAddRGB

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_16: // 14クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			MOV		EBX, EDI
			MOV		ECX, EAX

			MOV		EDX, EAX
			AND		EAX, EBX									// (src&dst)

			SHL		EAX, 1										// <<1
			XOR		ECX, EBX									// (src^dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8										//	(c >> 8)
			ADD		EAX, Mask7f									// + Mask7f

			ADD		EDX, EBX									// src + dst

			XOR		EAX, Mask7f				// UnPair			// ^ Mask7f

			SUB		EDX, EAX				// UnPair			// ( - mask)

			OR		EDX, EAX				// UnPair			// () | mask

			MOV		[ESI-4], EDX			// UnPair

			DEC		i
			JNZ		LoopX_16

			MOV		EAX, nWidth
			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす

			MOV		i, EAX
			DEC		j

			JNZ		LoopX_16				// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(dwAddRGB);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_16:
			eax = YANE_RD32(esi);
			esi += 4;
			ebx = edi;
			ecx = eax;
			edx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			edx += ebx;
			eax ^= yane_ld(Mask7f);
			edx -= eax;
			edx |= eax;
			YANE_WR32(esi - 4, edx);
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_16;
			eax = yane_ld(nWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_16;
		}
#endif

	
	return 0;
} // AddColorFast

//////////////////////////////////////////////////
//	SubColorFast
//	抜き色無しのSubブレンド転送 (同プレーン)
//////////////////////////////////////////////////
// @yo2 0x0043cde0 vt
LRESULT CDIB32P5::SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect)
{
// クリッピング等の処理
	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL)
	{
		m_rcSrcRect = m_rcRect;
	}
	else
	{
		m_rcSrcRect = *lpSrcRect;
		if ( m_rcSrcRect.left > m_rcSrcRect.right )
		{
			return 1;	// invalid rect
		}
	}
	//	クリップ領域
	LPRECT lpClip;
	lpClip = &m_rcRect;

		// クリッピングする
		// this yaneurao clipping algorithm is changed by tia
		int t;
		t = lpClip->left  - m_rcSrcRect.left;
		if ( t > 0 ) { m_rcSrcRect.left = lpClip->left; }
		t = lpClip->top	  - m_rcSrcRect.top;
		if ( t > 0 ) { m_rcSrcRect.top = lpClip->top; }
		t = m_rcSrcRect.right - lpClip->right;
		if ( t > 0 ) { m_rcSrcRect.right = lpClip->right; }
		t = m_rcSrcRect.bottom - lpClip->bottom;
		if ( t > 0 ) { m_rcSrcRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcSrcRect.right - m_rcSrcRect.left;
	int		nHeight = m_rcSrcRect.bottom - m_rcSrcRect.top;
	DWORD	nAddSrcWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
	DWORD*	lpSrc = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcSrcRect.left<<2) + m_rcSrcRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 Pentium   カラーキー:無   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
		DWORD	feMask = 0x00fefefe;
		DWORD	ovMask = 0x01010100;
		DWORD	Mask7f = 0x007f7f7f;
		int		i, j;


#ifdef _MSC_VER
		_asm
		{
			MOV		ESI, lpSrc
			MOV		EDI, dwSubRGB

			MOV		EAX, nWidth
			MOV		EBX, nHeight

			MOV		i, EAX
			MOV		j, EBX

		LoopX_20: // 15クロック･サイクル
			MOV		EAX, [ESI]
			ADD		ESI, 4

			MOV		ECX, EAX
			MOV		EBX, EDI

			NOT		EBX						// UnPair

			MOV		EDX, EAX
			AND		EAX, EBX									// (src & ~dst)

			SHL		EAX, 1										// << 1
			XOR		ECX, EBX									// (src ^ ~dst)

			AND		ECX, feMask				// UnPair			// & feMask

			ADD		EAX, ECX				// UnPair			// ()+()

			AND		EAX, ovMask				// UnPair			// & ovMask

			SHR		EAX, 8					// UnPair			//	(c >> 8)

			ADD		EAX, Mask7f				// UnPair			// + Mask7f

			XOR		EAX, Mask7f									// ^ Mask7f
			MOV		EBX, EDI

			OR		EBX, EAX									// dst | c
			OR		EDX, EAX									// src | c

			SUB		EBX, EDX				// UnPair			// () - ()

			MOV		[ESI-4], EBX			// UnPair

			DEC		i
			JNZ		LoopX_20

			MOV		EAX, nWidth
			ADD		ESI, nAddSrcWidth							// クリップした領域分を飛ばす

			MOV		i, EAX
			DEC		j

			JNZ		LoopX_20				// UnPair
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(dwSubRGB);
			eax = yane_ld(nWidth);
			ebx = yane_ld(nHeight);
			yane_st(i, eax);
			yane_st(j, ebx);
		LoopX_20:
			eax = YANE_RD32(esi);
			esi += 4;
			ecx = eax;
			ebx = edi;
			ebx = ~ebx;
			edx = eax;
			eax &= ebx;
			eax <<= 1;
			ecx ^= ebx;
			ecx &= yane_ld(feMask);
			eax += ecx;
			eax &= yane_ld(ovMask);
			eax >>= 8;
			eax += yane_ld(Mask7f);
			eax ^= yane_ld(Mask7f);
			ebx = edi;
			ebx |= eax;
			edx |= eax;
			ebx -= edx;
			YANE_WR32(esi - 4, ebx);
			t = yane_ld(i); yane_dec(t, f); yane_st(i, t);
			if (!f.zf) goto LoopX_20;
			eax = yane_ld(nWidth);
			esi += yane_ld(nAddSrcWidth);
			yane_st(i, eax);
			t = yane_ld(j); yane_dec(t, f); yane_st(j, t);
			if (!f.zf) goto LoopX_20;
		}
#endif

	
	return 0;
} // SubColorFast


////////////////////////////////////////////////////////////////////////////
//	PentiumMMX用のルーチン
////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////
//	ミラー無し矩形転送
////////////////////////////////////////////////////////////////////
//////////////////////////////////////
//	Blt
//	抜き色有りの転送
//////////////////////////////////////
// @yo2 0x0043cfa0 vt
LRESULT CDIB32PMMX::Blt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::Bltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::Bltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;
	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM1, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM1			// UnPair			// ColKey

		LoopY_1:
			SHR			ECX, 1
			JNB			Skip_1									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (src ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// src ^ ()
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_1

		Skip_1:
			SHR			ECX, 1
			JNB			LoopX_1									//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM2, [EDI]
			MOVQ		MM1, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (src ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// src ^ ()
			ADD			EDI, 8

			ADD			ESI, 8				// UnPair

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_1

		LoopX_1: // 12クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			MOVQ		MM1, MM0			// 1

			MOVQ		MM4, MM3			// 2
			PCMPEQD		MM1, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000

			MOVQ		MM2, [EDI]			// 1
			PCMPEQD		MM4, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000

			MOVQ		MM5, [EDI+8]		// 2
			PXOR		MM2, MM0			// 1				// (Src ^ Dst)

			PXOR		MM5, MM3			// 2				// (Src ^ Dst)
			PAND		MM2, MM1			// 1				// & mask

			PAND		MM5, MM4			// 2				// &mask
			PXOR		MM0, MM2			// 1				// Src ^ ()

			PXOR		MM3, MM5			// 2				// Src ^ ()
			ADD			ESI, 16

			MOVQ		[EDI], MM0			// UnPair

			MOVQ		[EDI+8], MM3		// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_1				// UnPair

		EndLoop_1:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_1				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
		LoopY_1:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_1;
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_1;
		Skip_1:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_1;
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm1 = mm0;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_1;
		LoopX_1:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm1 = mm0;
			mm4 = mm3;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 = YANE_RD64(edi);
			mm4 = yane_pcmpeqd(mm4, mm7);
			mm5 = YANE_RD64(edi + 8);
			mm2 ^= mm0;
			mm5 ^= mm3;
			mm2 &= mm1;
			mm5 &= mm4;
			mm0 ^= mm2;
			mm3 ^= mm5;
			esi += 16;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_1;
		EndLoop_1:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_1;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:有	 --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD	lPitchSrc = p->m_lPitch;
		DWORD*	lpSrcBack;
	
#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			MOVD		MM7, colKey								//	カラーキーを設定する
			PXOR		MM1, MM1

			MOVQ		MM2, MM7
			PXOR		MM0, MM0

			PUNPCKLDQ	MM7, MM2								// ColKey
			MOV			ECX, nWidth

			MOV			EDX, nHeight
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_2:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX								// nExCnt = EIX;

		LoopX_2: // 10クロック･サイクル
			MOVD		MM2, [ESI]			// UnPair			// *lpDst = *lpSrc;

			MOVD		MM4, [EDI]
			MOVQ		MM3, MM2

			PCMPEQD		MM3, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM4, MM2								// (Src ^ Dst)

			PAND		MM4, MM3								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM2, MM4								// Src ^ ()
			ADD			EDI, 4									// lpDst++;

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_2									// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_2:
			MOVD		[EDI-4], MM2		// UnPair

			DEC			ECX
			JNZ			LoopX_2

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_2									// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_2:
			DEC			EDX
			JNZ			LoopY_2

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm7;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm7 = (yane_q)yane_ld(colKey);
			mm1 = 0;
			mm2 = mm7;
			mm0 = 0;
			mm7 = yane_punpckldq(mm7, mm2);
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_2:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_2:
			mm2 = (yane_q)YANE_RD32(esi);
			mm4 = (yane_q)YANE_RD32(edi);
			mm3 = mm2;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm4 ^= mm2;
			mm4 &= mm3;
			esi += yane_ld(AddSrcPixel);
			mm2 ^= mm4;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_2;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_2:
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_2;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_2;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_2:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_2;
		}
#endif
	} // if


	return 0;
} // Blt


//////////////////////////////////////
//	BltFast
//	抜き色無しの転送
//////////////////////////////////////
// @yo2 0x0043d290 vt
LRESULT CDIB32PMMX::BltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

		LoopY_3:
			SHR			ECX, 1
			JNB			Skip_3									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI], MM0			// UnPair
			
			ADD			EDI, 4
			OR			ECX, ECX

			JZ			EndLoop_3			// UnPair

		Skip_3:
			SHR			ECX, 1
			JNB			LoopX_3									//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI], MM0			// UnPair

			ADD			EDI, 8
			OR			ECX, ECX

			JZ			EndLoop_3			// UnPair

		LoopX_3: // 6クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM3, [ESI+8]		// UnPair

			MOVQ		[EDI], MM0			// UnPair

			MOVQ		[EDI+8], MM3		// UnPair

			ADD			ESI, 16
			ADD			EDI, 16

			DEC			ECX
			JNZ			LoopX_3

		EndLoop_3:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_3				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm3;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
		LoopY_3:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_3;
			mm0 = (yane_q)YANE_RD32(esi);
			esi += 4;
			YANE_WR32(edi, (DWORD)mm0);
			edi += 4;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_3;
		Skip_3:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_3;
			mm0 = YANE_RD64(esi);
			esi += 8;
			YANE_WR64(edi, mm0);
			edi += 8;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_3;
		LoopX_3:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			esi += 16;
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_3;
		EndLoop_3:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_3;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:有	 --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			PXOR		MM1, MM1
			PXOR		MM0, MM0

			MOV			ECX, nWidth
			MOV			EDX, nHeight

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_4:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_4: // 7クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair			// *lpDst = *lpSrc;

			ADD			EDI, 4									// lpDst++;
			ADD			ESI, AddSrcPixel							// 整数部の加算

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_4									// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_4:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_4

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_4									// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値
		SkipY_4:
			DEC			EDX
			JNZ			LoopY_4

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm1 = 0;
			mm0 = 0;
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_4:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_4:
			mm0 = (yane_q)YANE_RD32(esi);
			edi += 4;
			esi += yane_ld(AddSrcPixel);
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_4;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_4:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_4;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_4;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_4:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_4;
		}
#endif
	} // if

	
	return 0;
} // BltFast


//////////////////////////////////////
//	BlendBltHalf
//	抜き色有りの1：1転送
//////////////////////////////////////
// @yo2 0x0043d4c0 vt
LRESULT CDIB32PMMX::BlendBltHalf(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltHalfでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltHalfでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f
			MOVD		MM7, colKey								// カラーキーを設定する

			MOV			EDI, lpDst
			MOVQ		MM1, MM7

			MOV			ESI, lpSrc
			PUNPCKLDQ	MM7, MM1								// ColKey

		LoopY_5:
			SHR			ECX, 1
			JNB			Skip_5									//	偶数か否かの判定
			// Step1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM3, MM0

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3			// UnPair			// () & mask

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_5

		Skip_5:
			SHR			ECX, 1
			JNB			LoopX_5								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM1, [EDI]
			MOVQ		MM3, MM0

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3			// UnPair			// () & mask

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_5

		LoopX_5: // 18クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			MOVQ		MM2, MM0			// 1

			MOVQ		MM1, [EDI]			// 1
			MOVQ		MM5, MM3			// 2

			MOVQ		MM4, [EDI+8]		// 2
			PAND		MM0, MM1			// 1

			PAND		MM3, MM4			// 2
			PXOR		MM2, MM1			// 1

			PXOR		MM5, MM4			// 2
			PSRLD		MM2, 1				// 1

			PSRLD		MM5, 1				// 2
			PAND		MM2, MM6			// 1

			PAND		MM5, MM6			// 2
			PADDD		MM0, MM2			// 1

			MOVQ		MM2, [ESI]			// 1
			PADDD		MM3, MM5			// 2

			MOVQ		MM5, [ESI+8]		// 2
			PCMPEQD		MM2, MM7			// 1				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			PCMPEQD		MM5, MM7			// 2				//	抜き色とSrcの比較･･･True:MM3=0xffffffffffffffff False:MM3=0
			PXOR		MM1, MM0			// 1				// (P ^ Dst)

			PXOR		MM4, MM3			// 2				// (P ^ Dst)
			PAND		MM1, MM2			// 1				// () & mask

			PAND		MM4, MM5			// 2				// () & mask
			PXOR		MM0, MM1			// 1				// P ^ ()

			PXOR		MM3, MM4			// 2				// P ^ ()
			ADD			ESI, 16

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_5				// UnPair

		EndLoop_5:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_5				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
		LoopY_5:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_5;
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			mm0 ^= mm1;
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_5;
		Skip_5:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_5;
			mm0 = YANE_RD64(esi);
			mm1 = YANE_RD64(edi);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			mm0 ^= mm1;
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_5;
		LoopX_5:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm2 = mm0;
			mm1 = YANE_RD64(edi);
			mm5 = mm3;
			mm4 = YANE_RD64(edi + 8);
			mm0 &= mm1;
			mm3 &= mm4;
			mm2 ^= mm1;
			mm5 ^= mm4;
			mm2 = yane_psrld(mm2, 1);
			mm5 = yane_psrld(mm5, 1);
			mm2 &= mm6;
			mm5 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm2 = YANE_RD64(esi);
			mm3 = yane_paddd(mm3, mm5);
			mm5 = YANE_RD64(esi + 8);
			mm2 = yane_pcmpeqd(mm2, mm7);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm1 ^= mm0;
			mm4 ^= mm3;
			mm1 &= mm2;
			mm4 &= mm5;
			mm0 ^= mm1;
			mm3 ^= mm4;
			esi += 16;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_5;
		EndLoop_5:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_5;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:有	 1:1ブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f
			MOVD		MM7, colKey								// カラーキーを設定する

			MOV			EDI, lpDst
			MOVQ		MM1, MM7

			MOV			ESI, lpSrc
			PUNPCKLDQ	MM7, MM1								// ColKey

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_6:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_6: // 15クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM3, MM0

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3								// () & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_6									// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_6:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_6

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_6									// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値
		SkipY_6:
			DEC			EDX
			JNZ			LoopY_6

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm6, mm7;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
			ebx = yane_ld(EIY);
		LoopY_6:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_6:
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm1;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_6;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_6:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_6;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_6;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_6:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_6;
		}
#endif
	} // if

	
	return 0;
} // BlendBltHalf


//////////////////////////////////////
//	BlendBltFastHalf
//	抜き色無しの1：1転送
//////////////////////////////////////
// @yo2 0x0043d850 vt
LRESULT CDIB32PMMX::BlendBltFastHalf(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltFastHalfでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltFastHalfでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);			// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f

			MOV			ESI, lpSrc
			MOV			EDI, lpDst

		LoopY_7:
			SHR			ECX, 1
			JNB			Skip_7									//	偶数か否かの判定
			// Step1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM2, MM0

			MOVQ		MM3, MM1
			PAND		MM0, MM1

			PXOR		MM2, MM3			// UnPair

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_7			// UnPair

		Skip_7:
			SHR			ECX, 1
			JNB			LoopX_7								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM1, [EDI]
			MOVQ		MM2, MM0

			MOVQ		MM3, MM1
			PAND		MM0, MM1

			PXOR		MM2, MM3			// UnPair

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_7

		LoopX_7: // 13クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			MOVQ		MM2, MM0			// 1

			MOVQ		MM1, [EDI]			// 1
			MOVQ		MM4, MM3			// 2

			MOVQ		MM5, [EDI+8]		// 2
			PAND		MM0, MM1			// 1

			PAND		MM3, MM5			// 2
			PXOR		MM2, MM1			// 1

			PXOR		MM4, MM5			// 2
			PSRLD		MM2, 1				// 1

			PSRLD		MM4, 1				// 2
			PAND		MM2, MM6			// 1

			PAND		MM4, MM6			// 2
			PADDD		MM0, MM2			// 1

			PADDD		MM3, MM4			// 2
			ADD			ESI, 16

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_7			// UnPair

		EndLoop_7:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_7			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
		LoopY_7:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_7;
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm2 = mm0;
			mm3 = mm1;
			mm0 &= mm1;
			mm2 ^= mm3;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_7;
		Skip_7:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_7;
			mm0 = YANE_RD64(esi);
			mm1 = YANE_RD64(edi);
			mm2 = mm0;
			mm3 = mm1;
			mm0 &= mm1;
			mm2 ^= mm3;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_7;
		LoopX_7:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm2 = mm0;
			mm1 = YANE_RD64(edi);
			mm4 = mm3;
			mm5 = YANE_RD64(edi + 8);
			mm0 &= mm1;
			mm3 &= mm5;
			mm2 ^= mm1;
			mm4 ^= mm5;
			mm2 = yane_psrld(mm2, 1);
			mm4 = yane_psrld(mm4, 1);
			mm2 &= mm6;
			mm4 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm3 = yane_paddd(mm3, mm4);
			esi += 16;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_7;
		EndLoop_7:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_7;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:有	 1:1ブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f
			MOV			EDI, lpDst

			MOV			ESI, lpSrc
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_8:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_8: // 12クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM2, MM0

			MOVQ		MM3, MM1
			PAND		MM0, MM1

			PXOR		MM2, MM3			// UnPair

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6					
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PADDD		MM0, MM2
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_8									// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_8:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_8

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_8									// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_8:
			DEC			EDX
			JNZ			LoopY_8

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm6;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			ebx = yane_ld(EIY);
		LoopY_8:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_8:
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm2 = mm0;
			mm3 = mm1;
			mm0 &= mm1;
			mm2 ^= mm3;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			esi += yane_ld(AddSrcPixel);
			mm0 = yane_paddd(mm0, mm2);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_8;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_8:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_8;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_8;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_8:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_8;
		}
#endif
	} // if


	return 0;
} // BlendBltFastHalf


//////////////////////////////////////
//	BlendBlt
//	抜き色有りのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043db50 vt
LRESULT CDIB32PMMX::BlendBlt(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
						   ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM1, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM1			// UnPair			// ColKey
			PXOR		MM0, MM0

			PXOR		MM1, MM1
			PXOR		MM4, MM4

			MOVD		MM2, dwSrcRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM3, MM4

		LoopY_9:
			SHR			ECX, 1
			JNB			LoopX_9								//	偶数か否かの判定
			// Step1
			MOVD		MM0, [ESI]			// 1// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM5, MM0

			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので
			MOVQ		MM6, MM1

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			PCMPEQD		MM5, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4			// UnPair

			PXOR		MM6, MM0			// UnPair			// (P ^ Dst)

			PAND		MM6, MM5			// UnPair			// & mask

			PXOR		MM0, MM6								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0

			OR			ECX, ECX
			JZ			EndLoop_9

		LoopX_9: // 22クロック･サイクル(乗算が 3クロックで 30クロック)
			// Step2
			MOVD		MM0, [ESI]			// 1// UnPair

			MOVD		MM5, [ESI+4]		// 2
			PUNPCKLBW	MM0, MM4			// 1				// WORD単位で乗算するので

			MOVD		MM1, [EDI]			// 1
			PUNPCKLBW	MM5, MM4			// 2				// WORD単位で乗算するので

			PMULLW		MM0, MM2			// 1
			PUNPCKLBW	MM1, MM4			// 1

			MOVD		MM6, [EDI+4]		// 2
			PMULLW		MM1, MM3			// 1

			PUNPCKLBW	MM6, MM4			// 2
			PMULLW		MM5, MM2			// 2

			PMULLW		MM6, MM3			// 2
			NOP			// PMULストール回避

			PADDUSB		MM0, MM1			// 1// UnPair

			PSRLW		MM0, 8				// 1// UnPair

			PACKUSWB	MM0, MM4			// 1
			PADDUSB		MM5, MM6			// 2

			MOVD		MM6, [ESI]			// 1
			PSRLW		MM5, 8				// 2

			MOVD		MM1, [EDI]			// 1
			PACKUSWB	MM5, MM4			// 2

			PCMPEQD		MM6, MM7			// 1				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			PXOR		MM1, MM0			// 1				// (P ^ Dst)

			PAND		MM1, MM6			// 1//UnPair		// & mask

			MOVD		MM6, [ESI+4]		// 2
			PXOR		MM0, MM1			// 1				// P ^ ()

			MOVD		MM1, [EDI+4]		// 2
			PCMPEQD		MM6, MM7			// 2				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			PXOR		MM1, MM5			// 2// UnPair		// (P ^ Dst)

			PAND		MM1, MM6			// 2				// & mask
			ADD			EDI, 8

			PXOR		MM5, MM1			// 2				// P ^ ()
			ADD			ESI, 8

			MOVD		[EDI-8], MM0		// 1// UnPair

			MOVD		[EDI-4], MM5		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_9

		EndLoop_9:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_9				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
			mm0 = 0;
			mm1 = 0;
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm3 = yane_punpcklbw(mm3, mm4);
		LoopY_9:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_9;
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = mm0;
			mm0 = yane_punpcklbw(mm0, mm4);
			mm6 = mm1;
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm6 ^= mm0;
			mm6 &= mm5;
			mm0 ^= mm6;
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_9;
		LoopX_9:
			mm0 = (yane_q)YANE_RD32(esi);
			mm5 = (yane_q)YANE_RD32(esi + 4);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = yane_punpcklbw(mm5, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm6 = (yane_q)YANE_RD32(edi + 4);
			mm1 = yane_pmullw(mm1, mm3);
			mm6 = yane_punpcklbw(mm6, mm4);
			mm5 = yane_pmullw(mm5, mm2);
			mm6 = yane_pmullw(mm6, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm5 = yane_paddusb(mm5, mm6);
			mm6 = (yane_q)YANE_RD32(esi);
			mm5 = yane_psrlw(mm5, 8);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = yane_packuswb(mm5, mm4);
			mm6 = yane_pcmpeqd(mm6, mm7);
			mm1 ^= mm0;
			mm1 &= mm6;
			mm6 = (yane_q)YANE_RD32(esi + 4);
			mm0 ^= mm1;
			mm1 = (yane_q)YANE_RD32(edi + 4);
			mm6 = yane_pcmpeqd(mm6, mm7);
			mm1 ^= mm5;
			mm1 &= mm6;
			edi += 8;
			mm5 ^= mm1;
			esi += 8;
			YANE_WR32(edi - 8, (DWORD)mm0);
			YANE_WR32(edi - 4, (DWORD)mm5);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_9;
		EndLoop_9:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_9;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:有	 RGBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f
			MOVD		MM7, colKey								// カラーキーを設定する

			MOV			EDI, lpDst
			MOVQ		MM1, MM7

			MOV			ESI, lpSrc
			PUNPCKLDQ	MM7, MM1								// ColKey

			PXOR		MM0, MM0
			PXOR		MM1, MM1

			MOVD		MM2, dwSrcRGBRate
			PXOR		MM4, MM4

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			PUNPCKLBW	MM3, MM4
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_10:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_10: // 18クロック･サイクル(乗算が 3クロックで 22クロック)
			MOVD		MM0, [ESI]			// 1// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM5, MM0

			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので
			MOVQ		MM6, MM1

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			PCMPEQD		MM5, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4			// UnPair

			PXOR		MM6, MM0			// UnPair			// (P ^ Dst)

			PAND		MM6, MM5								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM6								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_10								// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_10:
			MOVD		[EDI-4], MM0

			DEC			ECX
			JNZ			LoopX_10

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_10								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値
		SkipY_10:
			DEC			EDX
			JNZ			LoopY_10

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
			mm0 = 0;
			mm1 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm4 = 0;
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = yane_punpcklbw(mm3, mm4);
			ebx = yane_ld(EIY);
		LoopY_10:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_10:
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = mm0;
			mm0 = yane_punpcklbw(mm0, mm4);
			mm6 = mm1;
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm6 ^= mm0;
			mm6 &= mm5;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm6;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_10;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_10:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_10;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_10;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_10:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_10;
		}
#endif
	} // if

	
	return 0;
} // BlendBlt


//////////////////////////////////////
//	BlendBltFast
//	抜き色無しのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043dee0 vt
LRESULT CDIB32PMMX::BlendBltFast(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
								 ,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc +(m_rcDstRect.left<<2)+m_rcDstRect.top*   m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

			PXOR		MM0, MM0
			PXOR		MM1, MM1

			MOVD		MM2, dwSrcRGBRate
			PXOR		MM4, MM4

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			PUNPCKLBW	MM3, MM4			// UnPair

		LoopY_11:
			SHR			ECX, 1
			JNB			LoopX_11								//	偶数か否かの判定
			// Step1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			NOP

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_11

		LoopX_11: // 16クロック･サイクル(乗算が 3クロックで 24クロック)
			// Step2
			MOVD		MM0, [ESI]			// 1// UnPair

			MOVD		MM5, [ESI+4]		// 2
			PUNPCKLBW	MM0, MM4			// 1				// WORD単位で乗算するので

			MOVD		MM1, [EDI]			// 1
			PMULLW		MM0, MM2			// 1

			MOVD		MM6, [EDI+4]		// 2
			PUNPCKLBW	MM1, MM4			// 1

			PMULLW		MM1, MM3			// 1// UnPair
			PUNPCKLBW	MM5, MM4			// 2				// WORD単位で乗算するので

			PMULLW		MM5, MM2			// 2
			PUNPCKLBW	MM6, MM4			// 2

			PMULLW		MM6, MM3			// 2
			NOP			// PMULストール回避

			PADDUSB		MM0, MM1			// 1// UnPair

			PSRLW		MM0, 8				// 1// UnPair

			PACKUSWB	MM0, MM4			// 1
			PADDUSB		MM5, MM6			// 2

			PSRLW		MM5, 8				// 2// UnPair

			PACKUSWB	MM5, MM4			// 2
			ADD			ESI, 8

			MOVD		[EDI], MM0			// 1

			MOVD		[EDI+4], MM5		// 2// UnPair

			ADD			EDI, 8
			DEC			ECX

			JNZ			LoopX_11			// UnPair

		EndLoop_11:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_11			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			mm0 = 0;
			mm1 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm4 = 0;
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = yane_punpcklbw(mm3, mm4);
		LoopY_11:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_11;
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_11;
		LoopX_11:
			mm0 = (yane_q)YANE_RD32(esi);
			mm5 = (yane_q)YANE_RD32(esi + 4);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm0 = yane_pmullw(mm0, mm2);
			mm6 = (yane_q)YANE_RD32(edi + 4);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm1 = yane_pmullw(mm1, mm3);
			mm5 = yane_punpcklbw(mm5, mm4);
			mm5 = yane_pmullw(mm5, mm2);
			mm6 = yane_punpcklbw(mm6, mm4);
			mm6 = yane_pmullw(mm6, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm5 = yane_paddusb(mm5, mm6);
			mm5 = yane_psrlw(mm5, 8);
			mm5 = yane_packuswb(mm5, mm4);
			esi += 8;
			YANE_WR32(edi, (DWORD)mm0);
			YANE_WR32(edi + 4, (DWORD)mm5);
			edi += 8;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_11;
		EndLoop_11:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_11;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:有	 RGBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM1, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM1								// 0x007f7f7f
			MOV			EDI, lpDst

			MOV			ESI, lpSrc
			PXOR		MM0, MM0

			PXOR		MM1, MM1
			PXOR		MM4, MM4

			MOVD		MM2, dwSrcRGBRate
			MOV			EBX, EIY								// nEyCnt = EIY;

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			PUNPCKLBW	MM3, MM4			// UnPair

		LoopY_12:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_12: // 14クロック･サイクル(乗算が 3クロックで 18クロック)
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM1, [EDI]
			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			NOP

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PACKUSWB	MM0, MM4
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_12								// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_12:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_12

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_12								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_12:
			DEC			EDX
			JNZ			LoopY_12

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm6;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm1 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm1);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			mm0 = 0;
			mm1 = 0;
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			ebx = yane_ld(EIY);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = yane_punpcklbw(mm3, mm4);
		LoopY_12:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_12:
			mm0 = (yane_q)YANE_RD32(esi);
			mm1 = (yane_q)YANE_RD32(edi);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			esi += yane_ld(AddSrcPixel);
			mm0 = yane_packuswb(mm0, mm4);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_12;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_12:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_12;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_12;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_12:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_12;
		}
#endif
	} // if

	
	return 0;
} // BlendBltFast


//////////////////////////////////////
//	AddColorBlt
//	抜き色有りのADDブレンド転送
//////////////////////////////////////
// @yo2 0x0043e1e0 vt
LRESULT CDIB32PMMX::AddColorBlt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::AddColorBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::AddColorBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2)+m_rcDstRect.top*	m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM1, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM1			// UnPair			// ColKey

		LoopY_13:
			SHR			ECX, 1
			JNB			Skip_13									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PADDUSB		MM0, MM2
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// UnPair			// (P ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_13

		Skip_13:
			SHR			ECX, 1
			JNB			LoopX_13								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM2, [EDI]
			MOVQ		MM1, MM0

			PADDUSB		MM0, MM2
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// UnPair			// (P ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_13

		LoopX_13: // 13クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1//UnPair

			MOVQ		MM3, [ESI+8]		// 2
			MOVQ		MM1, MM0			// 1

			MOVQ		MM2, [EDI]			// 1
			MOVQ		MM5, MM3			// 2

			MOVQ		MM4, [EDI+8]		// 2
			PADDUSB		MM0, MM2			// 1

			PADDUSB		MM3, MM4			// 2
			PXOR		MM2, MM0			// 1				// (src ^ dst)

			PXOR		MM4, MM3			// 2				// (src ^ dst)
			PCMPEQD		MM1, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000

			PCMPEQD		MM5, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000
			PAND		MM2, MM1			// 1				// & mask

			PAND		MM4, MM5			// 2				// & mask
			PXOR		MM0, MM2			// 1				// src ^ ()

			PXOR		MM3, MM4			// 2				// src ^ ()
			ADD			EDI, 16

			ADD			ESI, 16				// AGI回避

			MOVQ		[EDI-16], MM0		// 1// UnPair

			MOVQ		[EDI-8], MM3		// 2// UnPair
			
			DEC			ECX
			JNZ			LoopX_13

		EndLoop_13:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_13			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
		LoopY_13:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_13;
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_13;
		Skip_13:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_13;
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_13;
		LoopX_13:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm1 = mm0;
			mm2 = YANE_RD64(edi);
			mm5 = mm3;
			mm4 = YANE_RD64(edi + 8);
			mm0 = yane_paddusb(mm0, mm2);
			mm3 = yane_paddusb(mm3, mm4);
			mm2 ^= mm0;
			mm4 ^= mm3;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm2 &= mm1;
			mm4 &= mm5;
			mm0 ^= mm2;
			mm3 ^= mm4;
			edi += 16;
			esi += 16;
			YANE_WR64(edi - 16, mm0);
			YANE_WR64(edi - 8, mm3);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_13;
		EndLoop_13:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_13;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	nAddPixel = 1 << 2;	   // 本当はミラーと分けたので数値を直書きできるんだけれど・・・ま、いっか:p
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			MOVD		MM7, colKey								//	カラーキーを設定する
			PXOR		MM1, MM1

			MOVQ		MM2, MM7
			PXOR		MM0, MM0

			PUNPCKLDQ	MM7, MM2								// ColKey
			MOV			ECX, nWidth

			MOV			EDX, nHeight
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_14:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_14: // 11クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PADDUSB		MM0, MM2
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// UnPair			// (P ^ dst)

			PAND		MM2, MM1								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_14								// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_14:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_14

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_14								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc					// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_14:
			DEC			EDX
			JNZ			LoopY_14

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm7;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm7 = (yane_q)yane_ld(colKey);
			mm1 = 0;
			mm2 = mm7;
			mm0 = 0;
			mm7 = yane_punpckldq(mm7, mm2);
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_14:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_14:
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm2;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_14;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_14:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_14;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_14;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_14:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_14;
		}
#endif
	} // if

	
	return 0;
} // AddColorBlt


//////////////////////////////////////
//	AddColorBltFast
//	抜き色無しのADDブレンド転送
//////////////////////////////////////
// @yo2 0x0043e4e0 vt
LRESULT CDIB32PMMX::AddColorBltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::AddColorBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::AddColorBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2)+m_rcDstRect.top*	m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			ESI, lpSrc
			MOV			EDI, lpDst

		LoopY_15:
			SHR			ECX, 1
			JNB			Skip_15									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PADDUSB		MM0, MM2
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_15

		Skip_15:
			SHR			ECX, 1
			JNB			LoopX_15								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM2, [EDI]			// UnPair

			PADDUSB		MM0, MM2
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_15

		LoopX_15: // 9クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM2, [EDI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			PADDUSB		MM0, MM2			// 1

			MOVQ		MM5, [EDI+8]		// 2// UnPair

			PADDUSB		MM3, MM5			// 2
			ADD			ESI, 16

			MOVQ		[EDI], MM0			// UnPair

			MOVQ		[EDI+8], MM3		// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_15			// UnPair

		EndLoop_15:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_15			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm2, mm3, mm5;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
		LoopY_15:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_15;
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm0 = yane_paddusb(mm0, mm2);
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_15;
		Skip_15:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_15;
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm0 = yane_paddusb(mm0, mm2);
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_15;
		LoopX_15:
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm3 = YANE_RD64(esi + 8);
			mm0 = yane_paddusb(mm0, mm2);
			mm5 = YANE_RD64(edi + 8);
			mm3 = yane_paddusb(mm3, mm5);
			esi += 16;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_15;
		EndLoop_15:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_15;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	nAddPixel = 1 << 2;	   // 本当はミラーと分けたので数値を直書きできるんだけれど・・・ま、いっか:p
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;


#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			PXOR		MM1, MM1
			PXOR		MM0, MM0

			MOV			ECX, nWidth
			MOV			EDX, nHeight

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_16:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_16: // 8クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PADDUSB		MM0, MM2
			ADD			ESI, AddSrcPixel						// 整数部の加算

			ADD			EDI, 4
			ADD			EAX, EX									// EX += 2*DX;

			JNB			SkipX_16			// UnPair			// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_16:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_16

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
	
			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_16								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_16:
			DEC			EDX
			JNZ			LoopY_16

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm1 = 0;
			mm0 = 0;
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_16:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_16:
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm0 = yane_paddusb(mm0, mm2);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_16;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_16:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_16;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_16;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_16:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_16;
		}
#endif
	} // if


	return 0;
} // AddColorBltFast


//////////////////////////////////////
//	SubColorBlt
//	抜き色有りのSUBブレンド転送
//////////////////////////////////////
// @yo2 0x0043e740 vt
LRESULT CDIB32PMMX::SubColorBlt(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::SubColorBltでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::SubColorBltでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2)+m_rcDstRect.top*	m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM1, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM1			// UnPair			// ColKey

		LoopY_17:
			SHR			ECX, 1
			JNB			Skip_17									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			MOVQ		MM1, MM2
			PSUBUSB		MM2, MM0

			PCMPEQD		MM0, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM1, MM2								// (P ^ dst)

			PAND		MM1, MM0			// UnPair			// & mask

			PXOR		MM2, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_17

		Skip_17:
			SHR			ECX, 1
			JNB			LoopX_17									//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM2, [EDI]			// UnPair

			MOVQ		MM1, MM2
			PSUBUSB		MM2, MM0

			PCMPEQD		MM0, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM1, MM2								// (P ^ dst)

			PAND		MM1, MM0			// UnPair			// & mask

			PXOR		MM2, MM1								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_17

		LoopX_17: // 13クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM2, [EDI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			MOVQ		MM1, MM2			// 1

			MOVQ		MM4, [EDI+8]		// 2
			PSUBUSB		MM2, MM0			// 1

			MOVQ		MM5, MM4			// 2
			PSUBUSB		MM4, MM3			// 2

			PCMPEQD		MM0, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000
			PCMPEQD		MM3, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM1, MM2			// 1				// (P ^ dst)
			PXOR		MM5, MM4			// 2				// (P ^ dst)

			PAND		MM1, MM0			// 1				// & mask
			PAND		MM5, MM3			// 2				// & mask

			PXOR		MM2, MM1			// 1				// P ^ ()
			ADD			EDI, 16

			PXOR		MM4, MM5			// 2				// P ^ ()
			ADD			ESI, 16

			MOVQ		[EDI-16], MM2		// 1// UnPair

			MOVQ		[EDI-8], MM4		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_17

		EndLoop_17:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_17			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm1 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm1);
		LoopY_17:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_17;
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm0 = yane_pcmpeqd(mm0, mm7);
			mm1 ^= mm2;
			mm1 &= mm0;
			mm2 ^= mm1;
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_17;
		Skip_17:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_17;
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm1 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm0 = yane_pcmpeqd(mm0, mm7);
			mm1 ^= mm2;
			mm1 &= mm0;
			mm2 ^= mm1;
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_17;
		LoopX_17:
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm3 = YANE_RD64(esi + 8);
			mm1 = mm2;
			mm4 = YANE_RD64(edi + 8);
			mm2 = yane_psubusb(mm2, mm0);
			mm5 = mm4;
			mm4 = yane_psubusb(mm4, mm3);
			mm0 = yane_pcmpeqd(mm0, mm7);
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm1 ^= mm2;
			mm5 ^= mm4;
			mm1 &= mm0;
			mm5 &= mm3;
			mm2 ^= mm1;
			edi += 16;
			mm4 ^= mm5;
			esi += 16;
			YANE_WR64(edi - 16, mm2);
			YANE_WR64(edi - 8, mm4);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_17;
		EndLoop_17:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_17;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:無   拡縮:有	 SUBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	nAddPixel = 1 << 2;	   // 本当はミラーと分けたので数値を直書きできるんだけれど・・・ま、いっか:p
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			MOVD		MM7, colKey								//	カラーキーを設定する
			PXOR		MM1, MM1

			MOVQ		MM2, MM7
			PXOR		MM0, MM0

			PUNPCKLDQ	MM7, MM2								// ColKey
			MOV			ECX, nWidth

			MOV			EDX, nHeight
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_18:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_18: // 11クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			MOVQ		MM1, MM2
			PSUBUSB		MM2, MM0

			PCMPEQD		MM0, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM1, MM2								// (P ^ dst)

			PAND		MM1, MM0								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM2, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_18								// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_18:
			MOVD		[EDI-4], MM2		// UnPair

			DEC			ECX
			JNZ			LoopX_18

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_18								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc						// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_18:
			DEC			EDX
			JNZ			LoopY_18

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm7;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm7 = (yane_q)yane_ld(colKey);
			mm1 = 0;
			mm2 = mm7;
			mm0 = 0;
			mm7 = yane_punpckldq(mm7, mm2);
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_18:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_18:
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm0 = yane_pcmpeqd(mm0, mm7);
			mm1 ^= mm2;
			mm1 &= mm0;
			esi += yane_ld(AddSrcPixel);
			mm2 ^= mm1;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_18;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_18:
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_18;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_18;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_18:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_18;
		}
#endif
	} // if

	
	return 0;
} // SubColorBlt


//////////////////////////////////////
//	SubColorBltFast
//	抜き色無しのSUBブレンド転送
//////////////////////////////////////
// @yo2 0x0043ea40 vt
LRESULT CDIB32PMMX::SubColorBltFast(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::SubColorBltFastでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::SubColorBltFastでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( Clipping( lpDIB32, x, y, lpSrcRect, lpDstSize,	 lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nAddSrcWidth = p->m_lPitch - ((m_rcSrcRect.right - m_rcSrcRect.left)<<2);	// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);										// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc +(m_rcSrcRect.left<<2)+m_rcSrcRect.top*p->m_lPitch );		// クリッピング部分のカット
	DWORD*	lpDst = (DWORD*)((BYTE*)   m_lpdwSrc + (m_rcDstRect.left<<2)+m_rcDstRect.top*	m_lPitch );		// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			ESI, lpSrc
			MOV			EDI, lpDst

		LoopY_19:
			SHR			ECX, 1
			JNB			Skip_19								//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PSUBUSB		MM2, MM0
			ADD			EDI, 4

			ADD			ESI, 4				// AGI回避

			MOVD		[EDI-4], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_19

		Skip_19:
			SHR			ECX, 1
			JNB			LoopX_19								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			MOVQ		MM2, [EDI]			// UnPair

			PSUBUSB		MM2, MM0
			ADD			EDI, 8

			ADD			ESI, 8				// AGI回避

			MOVQ		[EDI-8], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_19

		LoopX_19: // 9クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM2, [EDI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			PSUBUSB		MM2, MM0			// 1

			MOVQ		MM5, [EDI+8]		// 2// UnPair

			PSUBUSB		MM5, MM3			// 2
			ADD			ESI, 16

			MOVQ		[EDI], MM2			// UnPair

			MOVQ		[EDI+8], MM5		// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_19			// UnPair

		EndLoop_19:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_19			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm2, mm3, mm5;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
		LoopY_19:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_19;
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm2 = yane_psubusb(mm2, mm0);
			edi += 4;
			esi += 4;
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_19;
		Skip_19:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_19;
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm2 = yane_psubusb(mm2, mm0);
			edi += 8;
			esi += 8;
			YANE_WR64(edi - 8, mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_19;
		LoopX_19:
			mm0 = YANE_RD64(esi);
			mm2 = YANE_RD64(edi);
			mm3 = YANE_RD64(esi + 8);
			mm2 = yane_psubusb(mm2, mm0);
			mm5 = YANE_RD64(edi + 8);
			mm5 = yane_psubusb(mm5, mm3);
			esi += 16;
			YANE_WR64(edi, mm2);
			YANE_WR64(edi + 8, mm5);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_19;
		EndLoop_19:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_19;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:有	 SUBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	nAddPixel = 1 << 2;	   // 本当はミラーと分けたので数値を直書きできるんだけれど・・・ま、いっか:p
		DWORD	AddSrcPixel = 4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			PXOR		MM1, MM1
			PXOR		MM0, MM0

			MOV			ECX, nWidth
			MOV			EDX, nHeight

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_20:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_20: // 8クロック･サイクル
			MOVD		MM0, [ESI]			// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PSUBUSB		MM2, MM0
			ADD			ESI, AddSrcPixel						// 整数部の加算

			ADD			EDI, 4				// UnPair

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_20								// if ( EX >= 0)

			ADD			ESI, 4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_20:
			MOVD		[EDI-4], MM2		// UnPair

			DEC			ECX
			JNZ			LoopX_20

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY									// Yの増分
			JNB			SkipY_20								// if ( EY >= 0 )

			ADD			ESI, lPitchSrc					// 1ライン分加算して、次の行へ
			SUB			EBX, EY2								// Yの補正値

		SkipY_20:
			DEC			EDX
			JNZ			LoopY_20

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm1 = 0;
			mm0 = 0;
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_20:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_20:
			mm0 = (yane_q)YANE_RD32(esi);
			mm2 = (yane_q)YANE_RD32(edi);
			mm2 = yane_psubusb(mm2, mm0);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_20;
			esi += 4;
			eax -= yane_ld(EX2);
		SkipX_20:
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_20;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_20;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_20:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_20;
		}
#endif
	} // if


	return 0;
} // SubColorBltFast


////////////////////////////////////////////////////////////////////
//	ミラー有り矩形転送
////////////////////////////////////////////////////////////////////
//////////////////////////////////////
//	Blt
//	抜き色有りの転送
//////////////////////////////////////
// @yo2 0x0043eca0 vt
LRESULT CDIB32PMMX::BltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0			// UnPair			// ColKey

		LoopY_1:
			SHR			ECX, 1
			JNB			Skip_1									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (src ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// src ^ ()
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_1

		Skip_1:
			SHR			ECX, 1
			JNB			LoopX_1									//	4の倍数か否かの判定
			// Step2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [ESI-8]		// UnPair

			MOVQ		MM2, [EDI]
			PUNPCKLDQ	MM0, MM1								// ソースの 2ピクセルをミラーする

			MOVQ		MM1, MM0			// UnPair

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (src ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// src ^ ()
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_1

		LoopX_1: // 15クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM1, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM1			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM4, [ESI-16]		// 2
			MOVQ		MM1, MM0			// 1

			MOVQ		MM2, [EDI]			// 1
			PUNPCKLDQ	MM3, MM4			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM5, [EDI+8]		// 2
			MOVQ		MM4, MM3			// 2

			PCMPEQD		MM1, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000
			PCMPEQD		MM4, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// 1				// (src ^ dst)
			PXOR		MM5, MM3			// 2				// (src ^ dst)

			PAND		MM2, MM1			// 1				// & mask
			PAND		MM5, MM4			// 2				// & mask

			PXOR		MM0, MM2			// 1				// src ^ ()
			PXOR		MM3, MM5			// 2				// src ^ ()

			ADD			ESI, -16			// AGI回避

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_1				// UnPair

		EndLoop_1:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_1				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
		LoopY_1:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_1;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_1;
		Skip_1:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_1;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm2 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm1);
			mm1 = mm0;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_1;
		LoopX_1:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm1);
			mm4 = (yane_q)YANE_RD32(esi - 16);
			mm1 = mm0;
			mm2 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm4);
			mm5 = YANE_RD64(edi + 8);
			mm4 = mm3;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm4 = yane_pcmpeqd(mm4, mm7);
			mm2 ^= mm0;
			mm5 ^= mm3;
			mm2 &= mm1;
			mm5 &= mm4;
			mm0 ^= mm2;
			mm3 ^= mm5;
			esi += 0xFFFFFFF0;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_1;
		EndLoop_1:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_1;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:有	 --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			ECX, nWidth

			MOVQ		MM0, MM7
			MOV			EDX, nHeight

			PUNPCKLDQ	MM7, MM0								// ColKey
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_2:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_2: // 10クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (src ^ dst)

			PAND		MM2, MM1								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM2								// src ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_2									// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_2:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_2

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_2										// if ( EY >= 0 )

			ADD			ESI, lPitchSrc
			SUB			EBX, EY2									// Yの補正

		SkipY_2:
			DEC			EDX
			JNZ			LoopY_2

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm7;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			mm7 = (yane_q)yane_ld(colKey);
			ecx = yane_ld(nWidth);
			mm0 = mm7;
			edx = yane_ld(nHeight);
			mm7 = yane_punpckldq(mm7, mm0);
			ebx = yane_ld(EIY);
		LoopY_2:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_2:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm2;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_2;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_2:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_2;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_2;
			esi += yane_ld(lPitchSrc);
			ebx -= yane_ld(EY2);
		SkipY_2:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_2;
		}
#endif
	} // if


	return 0;
} // BltM


//////////////////////////////////////
//	BltFastM
//	抜き色無しの転送
//////////////////////////////////////
// @yo2 0x0043efa0 vt
LRESULT CDIB32PMMX::BltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整

// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:無	 --------------
	if ( m_bActualSize == true )
	{
				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

		LoopY_3:
			SHR			ECX, 1
			JNB			Skip_3									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI], MM0			// UnPair

			ADD			EDI, 4
			OR			ECX, ECX

			JZ			EndLoop_3			// UnPair

		Skip_3:
			SHR			ECX, 1
			JNB			LoopX_3									//	4の倍数か否かの判定
			// Step2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [ESI-8]		// UnPair

			PUNPCKLDQ	MM0, MM1								// ソースの 2ピクセルをミラーする
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI], MM0			// UnPair

			OR			ECX, ECX
			JZ			EndLoop_3

		LoopX_3: // 9クロック･サイクル							// もうちょっとアンロールしたいけど・・・ま、いっか:p
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM1, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM1			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM4, [ESI-16]		// 2// UnPair

			PUNPCKLDQ	MM3, MM4			// 2				// ソースの 2ピクセルをミラーする
			ADD			ESI, -16

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_3				// UnPair

		EndLoop_3:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_3				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm3, mm4;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
		LoopY_3:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_3;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			esi += 0xFFFFFFFC;
			YANE_WR32(edi, (DWORD)mm0);
			edi += 4;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_3;
		Skip_3:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_3;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm0 = yane_punpckldq(mm0, mm1);
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_3;
		LoopX_3:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm1);
			mm4 = (yane_q)YANE_RD32(esi - 16);
			mm3 = yane_punpckldq(mm3, mm4);
			esi += 0xFFFFFFF0;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_3;
		EndLoop_3:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_3;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:有	 --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			ESI, lpSrc
			MOV			EDI, lpDst

			MOV			ECX, nWidth
			MOV			EDX, nHeight

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_4:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_4: // 7クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			ADD			ESI, AddSrcPixel						// 整数部の加算
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_4									// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_4:
			MOVD		[EDI-4], MM0			// UnPair

			DEC			ECX
			JNZ			LoopX_4

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_4										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_4:
			DEC			EDX
			JNZ			LoopY_4

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0;
			yane_fl f;
			esi = yane_ld(lpSrc);
			edi = yane_ld(lpDst);
			ecx = yane_ld(nWidth);
			edx = yane_ld(nHeight);
			ebx = yane_ld(EIY);
		LoopY_4:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_4:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_4;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_4:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_4;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_4;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_4:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_4;
		}
#endif
	} // if


	return 0;
} // BltFastM


//////////////////////////////////////
//	BlendBltHalfM
//	抜き色有りの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x0043f210 vt
LRESULT CDIB32PMMX::BlendBltHalfM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltHalfMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltHalfMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;
		DWORD	Mask7f = 0x007f7f7f;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM0, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM0								// 0x007f7f7f
			MOVD		MM7, colKey								// カラーキーを設定する

			MOV			EDI, lpDst
			MOVQ		MM0, MM7

			MOV			ESI, lpSrc
			PUNPCKLDQ	MM7, MM0								// ColKey

		LoopY_5:
			SHR			ECX, 1
			JNB			Skip_5									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM3, MM0

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3			// UnPair			// () & mask

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_5

		Skip_5:
			SHR			ECX, 1
			JNB			LoopX_5									//	4の倍数か否かの判定
			// Step2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [ESI-8]		// UnPair

			MOVQ		MM1, [EDI]
			PUNPCKLDQ	MM0, MM2								// ソースの 2ピクセルをミラーする

			MOVQ		MM3, MM0			// UnPair

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3			// UnPair			// () & mask

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_5

		LoopX_5: // 24クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM2, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM2			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM5, [ESI-16]		// 2// UnPair

			MOVQ		MM1, [EDI]			// 1
			PUNPCKLDQ	MM3, MM5			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM4, [EDI+8]		// 2
			MOVQ		MM2, MM0			// 1

			MOVQ		MM5, MM3			// 2
			PAND		MM0, MM1			// 1

			PAND		MM3, MM4			// 2
			PXOR		MM2, MM1			// 1

			PXOR		MM5, MM4			// 2
			PSRLD		MM2, 1				// 1

			PSRLD		MM5, 1				// 2
			PAND		MM2, MM6			// 1

			PAND		MM5, MM6			// 2
			PADDD		MM0, MM2			// 1

			MOVD		MM2, [ESI-4]		// 1
			PADDD		MM3, MM5			// 2

			MOVD		MM5, [ESI-8]		// 1// UnPair

			PUNPCKLDQ	MM2, MM5			// 1				// ソースの 2ピクセルをミラーする
			PXOR		MM1, MM0			// 1				// (P ^ Dst)

			MOVD		MM5, [ESI-12]		// 2
			PCMPEQD		MM2, MM7			// 1				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			PAND		MM1, MM2			// 1				// () & mask
			PXOR		MM4, MM3			// 2				// (P ^ Dst)

			MOVD		MM2, [ESI-16]		// 2
			PXOR		MM0, MM1			// 1				// P ^ ()

			PUNPCKLDQ	MM5, MM2			// 2// UnPair		// ソースの 2ピクセルをミラーする

			PCMPEQD		MM5, MM7			// 2// UnPair		//	抜き色とSrcの比較･･･True:MM3=0xffffffffffffffff False:MM3=0
			
			PAND		MM4, MM5			// 2				// () & mask
			ADD			EDI, 16

			PXOR		MM3, MM4			// 2				// P ^ ()
			ADD			ESI, -16

			MOVQ		[EDI-16], MM0		// 1// UnPair

			MOVQ		[EDI-8], MM3		// 2// UnPair
			
			DEC			ECX
			JNZ			LoopX_5

		EndLoop_5:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_5				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm0 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm0);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
		LoopY_5:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_5;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			mm0 ^= mm1;
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_5;
		Skip_5:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_5;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(esi - 8);
			mm1 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm2);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			mm0 ^= mm1;
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_5;
		LoopX_5:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm2);
			mm5 = (yane_q)YANE_RD32(esi - 16);
			mm1 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm5);
			mm4 = YANE_RD64(edi + 8);
			mm2 = mm0;
			mm5 = mm3;
			mm0 &= mm1;
			mm3 &= mm4;
			mm2 ^= mm1;
			mm5 ^= mm4;
			mm2 = yane_psrld(mm2, 1);
			mm5 = yane_psrld(mm5, 1);
			mm2 &= mm6;
			mm5 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm2 = (yane_q)YANE_RD32(esi - 4);
			mm3 = yane_paddd(mm3, mm5);
			mm5 = (yane_q)YANE_RD32(esi - 8);
			mm2 = yane_punpckldq(mm2, mm5);
			mm1 ^= mm0;
			mm5 = (yane_q)YANE_RD32(esi - 12);
			mm2 = yane_pcmpeqd(mm2, mm7);
			mm1 &= mm2;
			mm4 ^= mm3;
			mm2 = (yane_q)YANE_RD32(esi - 16);
			mm0 ^= mm1;
			mm5 = yane_punpckldq(mm5, mm2);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm4 &= mm5;
			edi += 16;
			mm3 ^= mm4;
			esi += 0xFFFFFFF0;
			YANE_WR64(edi - 16, mm0);
			YANE_WR64(edi - 8, mm3);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_5;
		EndLoop_5:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_5;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:有	 1:1ブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM0, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM0								// 0x007f7f7f
			MOVD		MM7, colKey								// カラーキーを設定する

			MOV			EDI, lpDst
			MOVQ		MM0, MM7

			MOV			ESI, lpSrc
			PUNPCKLDQ	MM7, MM0								// ColKey

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_6:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_6: // 15クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM3, MM0

			PCMPEQD		MM3, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2			// UnPair

			PXOR		MM1, MM0			// UnPair			// (P ^ Dst)

			PAND		MM1, MM3								// () & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM1								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_6									// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_6:
			MOVD		[EDI-4], MM0			// UnPair

			DEC			ECX
			JNZ			LoopX_6

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_6										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_6:
			DEC			EDX
			JNZ			LoopY_6

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm6, mm7;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm0 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm0);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
			ebx = yane_ld(EIY);
		LoopY_6:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_6:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm3 = mm0;
			mm3 = yane_pcmpeqd(mm3, mm7);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm1 ^= mm0;
			mm1 &= mm3;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm1;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_6;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_6:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_6;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_6;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_6:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_6;
		}
#endif
	} // if


	return 0;
} // BlendBltHalfM


//////////////////////////////////////
//	BlendBltFastHalfM
//	抜き色無しの１：１ブレンド転送
//////////////////////////////////////
// @yo2 0x0043f5d0 vt
LRESULT CDIB32PMMX::BlendBltFastHalfM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltFastHalfMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltFastHalfMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:無	 1:1ブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	Mask7f = 0x007f7f7f;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM0, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM0								// 0x007f7f7f
			MOV			EDI, lpDst

			MOV			ESI, lpSrc			// UnPair

		LoopY_7:
			SHR			ECX, 1
			JNB			Skip_7									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_7

		Skip_7:
			SHR			ECX, 1
			JNB			LoopX_7									//	4の倍数か否かの判定
			// Step2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [ESI-8]		// UnPair

			MOVQ		MM1, [EDI]
			PUNPCKLDQ	MM0, MM2								// ソースの 2ピクセルをミラーする

			MOVQ		MM2, MM0			// UnPair
			PAND		MM0, MM1

			PXOR		MM2, MM1			// UnPair

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6			// UnPair

			PADDD		MM0, MM2
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_7

		LoopX_7: // 16クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM2, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM2			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM5, [ESI-16]		// 2// UnPair

			MOVQ		MM1, [EDI]			// 1
			PUNPCKLDQ	MM3, MM5			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM4, [EDI+8]		// 2
			MOVQ		MM2, MM0			// 1

			MOVQ		MM5, MM3			// 2
			PAND		MM0, MM1			// 1

			PAND		MM3, MM4			// 2
			PXOR		MM2, MM1			// 1

			PXOR		MM5, MM4			// 2
			PSRLD		MM2, 1				// 1

			PSRLD		MM5, 1				// 2
			PAND		MM2, MM6			// 1

			PAND		MM5, MM6			// 2
			PADDD		MM0, MM2			// 1

			PADDD		MM3, MM5			// 2
			ADD			ESI, -16

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3	// 2// UnPair
			
			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_7				// UnPair

		EndLoop_7:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_7				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm0 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm0);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
		LoopY_7:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_7;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_7;
		Skip_7:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_7;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(esi - 8);
			mm1 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm2);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_7;
		LoopX_7:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm2);
			mm5 = (yane_q)YANE_RD32(esi - 16);
			mm1 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm5);
			mm4 = YANE_RD64(edi + 8);
			mm2 = mm0;
			mm5 = mm3;
			mm0 &= mm1;
			mm3 &= mm4;
			mm2 ^= mm1;
			mm5 ^= mm4;
			mm2 = yane_psrld(mm2, 1);
			mm5 = yane_psrld(mm5, 1);
			mm2 &= mm6;
			mm5 &= mm6;
			mm0 = yane_paddd(mm0, mm2);
			mm3 = yane_paddd(mm3, mm5);
			esi += 0xFFFFFFF0;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_7;
		EndLoop_7:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_7;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:有	 1:1ブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	Mask7f = 0x007f7f7f;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOVD		MM6, Mask7f
			MOV			EDX, nHeight

			MOVQ		MM0, MM6
			MOV			ECX, nWidth

			PUNPCKLDQ	MM6, MM0								// 0x007f7f7f
			MOV			EDI, lpDst

			MOV			ESI, lpSrc
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_8:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_8: // 11クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM2, MM0

			PAND		MM0, MM1
			PXOR		MM2, MM1

			PSRLD		MM2, 1				// UnPair

			PAND		MM2, MM6
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PADDD		MM0, MM2
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_8									// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_8:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_8

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_8										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_8:
			DEC			EDX
			JNZ			LoopY_8

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm6;
			yane_fl f;
			mm6 = (yane_q)yane_ld(Mask7f);
			edx = yane_ld(nHeight);
			mm0 = mm6;
			ecx = yane_ld(nWidth);
			mm6 = yane_punpckldq(mm6, mm0);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			ebx = yane_ld(EIY);
		LoopY_8:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_8:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm2 = mm0;
			mm0 &= mm1;
			mm2 ^= mm1;
			mm2 = yane_psrld(mm2, 1);
			mm2 &= mm6;
			esi += yane_ld(AddSrcPixel);
			mm0 = yane_paddd(mm0, mm2);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_8;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_8:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_8;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_8;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_8:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_8;
		}
#endif
	} // if


	return 0;
} // BlendBltFastHalfM


//////////////////////////////////////
//	BlendBltM
//	抜き色有りのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043f910 vt
LRESULT CDIB32PMMX::BlendBltM(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
							,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0								// ColKey
			PXOR		MM4, MM4

			MOVD		MM2, dwSrcRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM3, MM4

		LoopY_9:
			SHR			ECX, 1
			JNB			LoopX_9									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM5, MM0

			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので
			MOVQ		MM6, MM1

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			PCMPEQD		MM5, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4			// UnPair

			PXOR		MM6, MM0			// UnPair			// (P ^ Dst)

			PAND		MM6, MM5			// UnPair			// & mask

			PXOR		MM0, MM6								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0

			OR			ECX, ECX
			JZ			EndLoop_9

		LoopX_9:// 22クロック･サイクル (PMULが 3クロックだと 30クロック)
			// Step2
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM5, [ESI-8]		// 2
			PUNPCKLBW	MM0, MM4			// 1				// WORD単位で乗算するので

			MOVD		MM1, [EDI]			// 1
			PUNPCKLBW	MM5, MM4			// 2				// WORD単位で乗算するので

			PMULLW		MM0, MM2			// 1
			PUNPCKLBW	MM1, MM4			// 1

			MOVD		MM6, [EDI+4]		// 2
			PMULLW		MM1, MM3			// 1

			PUNPCKLBW	MM6, MM4			// 2
			PMULLW		MM5, MM2			// 2

			PMULLW		MM6, MM3			// 2
			NOP			// PMULストール回避

			PADDUSB		MM0, MM1			// 1// UnPair

			PSRLW		MM0, 8				// 1// UnPair

			PACKUSWB	MM0, MM4			// 1
			PADDUSB		MM5, MM6			// 2

			MOVD		MM6, [ESI-4]		// 1
			PSRLW		MM5, 8				// 2

			MOVD		MM1, [EDI]			// 1
			PACKUSWB	MM5, MM4			// 2

			PCMPEQD		MM6, MM7			// 1				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0
			PXOR		MM1, MM0			// 1				// (P ^ Dst)

			PAND		MM1, MM6			// 1//UnPair		// & mask

			MOVD		MM6, [ESI-8]		// 2
			PXOR		MM0, MM1			// 1				// P ^ ()

			MOVD		MM1, [EDI+4]		// 2
			PCMPEQD		MM6, MM7			// 2				//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			PXOR		MM1, MM5			// 2// UnPair		// (P ^ Dst)

			PAND		MM1, MM6			// 2				// & mask
			ADD			EDI, 8

			PXOR		MM5, MM1			// 2				// P ^ ()
			ADD			ESI, -8

			MOVD		[EDI-8], MM0			// 1// UnPair

			MOVD		[EDI-4], MM5		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_9

		EndLoop_9:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_9				// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm3 = yane_punpcklbw(mm3, mm4);
		LoopY_9:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_9;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = mm0;
			mm0 = yane_punpcklbw(mm0, mm4);
			mm6 = mm1;
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm6 ^= mm0;
			mm6 &= mm5;
			mm0 ^= mm6;
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_9;
		LoopX_9:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm5 = (yane_q)YANE_RD32(esi - 8);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = yane_punpcklbw(mm5, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm6 = (yane_q)YANE_RD32(edi + 4);
			mm1 = yane_pmullw(mm1, mm3);
			mm6 = yane_punpcklbw(mm6, mm4);
			mm5 = yane_pmullw(mm5, mm2);
			mm6 = yane_pmullw(mm6, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm5 = yane_paddusb(mm5, mm6);
			mm6 = (yane_q)YANE_RD32(esi - 4);
			mm5 = yane_psrlw(mm5, 8);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = yane_packuswb(mm5, mm4);
			mm6 = yane_pcmpeqd(mm6, mm7);
			mm1 ^= mm0;
			mm1 &= mm6;
			mm6 = (yane_q)YANE_RD32(esi - 8);
			mm0 ^= mm1;
			mm1 = (yane_q)YANE_RD32(edi + 4);
			mm6 = yane_pcmpeqd(mm6, mm7);
			mm1 ^= mm5;
			mm1 &= mm6;
			edi += 8;
			mm5 ^= mm1;
			esi += 0xFFFFFFF8;
			YANE_WR32(edi - 8, (DWORD)mm0);
			YANE_WR32(edi - 4, (DWORD)mm5);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_9;
		EndLoop_9:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_9;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:有	 RGBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0								// ColKey
			PXOR		MM4, MM4

			MOVD		MM2, dwSrcRGBRate
			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので

			MOVD		MM3, dwDstRGBRate
			PUNPCKLBW	MM3, MM4

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_10:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_10: // 18クロック･サイクル (PMULが 3クロックだと 22クロック)
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			MOVQ		MM5, MM0

			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので
			MOVQ		MM6, MM1

			PUNPCKLBW	MM1, MM4
			PMULLW		MM0, MM2

			PMULLW		MM1, MM3
			PCMPEQD		MM5, MM7								//	抜き色とSrcの比較･･･True:MM0=0xffffffffffffffff False:MM0=0

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4			// UnPair

			PXOR		MM6, MM0			// UnPair			// (P ^ Dst)

			PAND		MM6, MM5								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM6								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_10								// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_10:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_10

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_10									// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_10:
			DEC			EDX
			JNZ			LoopY_10

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm3 = yane_punpcklbw(mm3, mm4);
			ebx = yane_ld(EIY);
		LoopY_10:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_10:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = mm0;
			mm0 = yane_punpcklbw(mm0, mm4);
			mm6 = mm1;
			mm1 = yane_punpcklbw(mm1, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_pmullw(mm1, mm3);
			mm5 = yane_pcmpeqd(mm5, mm7);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm6 ^= mm0;
			mm6 &= mm5;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm6;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_10;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_10:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_10;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_10;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_10:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_10;
		}
#endif
	} // if

	
	return 0;
} // BlendBltM


//////////////////////////////////////
//	BlendBltFastM
//	抜き色無しのRGBブレンド転送
//////////////////////////////////////
// @yo2 0x0043fc70 vt
LRESULT CDIB32PMMX::BlendBltFastM(CDIB32* lpDIB32,int x,int y,DWORD dwDstRGBRate,DWORD dwSrcRGBRate
								,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::BlendBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::BlendBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:無	 RGBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

			PXOR		MM4, MM4
			MOVD		MM2, dwSrcRGBRate

			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので
			MOVD		MM3, dwDstRGBRate

			PUNPCKLBW	MM3, MM4			// UnPair

		LoopY_11:
			SHR			ECX, 1
			JNB			LoopX_11								//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので

			PMULLW		MM0, MM2
			PUNPCKLBW	MM1, MM4

			PMULLW		MM1, MM3
			NOP

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8				// UnPair

			PACKUSWB	MM0, MM4			// UnPair
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0

			OR			ECX, ECX
			JZ			EndLoop_11

		LoopX_11:// 15クロック･サイクル (PMULが 3クロックだと 23クロック)
			// Step2
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM5, [ESI-8]		// 2
			PUNPCKLBW	MM0, MM4			// 1				// WORD単位で乗算するので

			MOVD		MM1, [EDI]			// 1
			PUNPCKLBW	MM5, MM4			// 2				// WORD単位で乗算するので

			PMULLW		MM0, MM2			// 1
			PUNPCKLBW	MM1, MM4			// 1

			MOVD		MM6, [EDI+4]		// 2
			PMULLW		MM1, MM3			// 1

			PUNPCKLBW	MM6, MM4			// 2
			PMULLW		MM5, MM2			// 2

			PMULLW		MM6, MM3			// 2
			NOP			// PMULストール回避

			PADDUSB		MM0, MM1			// 1// UnPair

			PSRLW		MM0, 8				// 1// UnPair

			PACKUSWB	MM0, MM4			// 1
			PADDUSB		MM5, MM6			// 2

			PSRLW		MM5, 8				// 2
			ADD			EDI, 8

			PACKUSWB	MM5, MM4			// 2
			ADD			ESI, -8

			MOVD		[EDI-8], MM0			// 1// UnPair

			MOVD		[EDI-4], MM5		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_11

		EndLoop_11:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_11			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm3 = yane_punpcklbw(mm3, mm4);
		LoopY_11:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_11;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm1 = yane_pmullw(mm1, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_11;
		LoopX_11:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm5 = (yane_q)YANE_RD32(esi - 8);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm5 = yane_punpcklbw(mm5, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm6 = (yane_q)YANE_RD32(edi + 4);
			mm1 = yane_pmullw(mm1, mm3);
			mm6 = yane_punpcklbw(mm6, mm4);
			mm5 = yane_pmullw(mm5, mm2);
			mm6 = yane_pmullw(mm6, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			mm0 = yane_packuswb(mm0, mm4);
			mm5 = yane_paddusb(mm5, mm6);
			mm5 = yane_psrlw(mm5, 8);
			edi += 8;
			mm5 = yane_packuswb(mm5, mm4);
			esi += 0xFFFFFFF8;
			YANE_WR32(edi - 8, (DWORD)mm0);
			YANE_WR32(edi - 4, (DWORD)mm5);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_11;
		EndLoop_11:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_11;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:有	 RGBブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

			PXOR		MM4, MM4
			MOVD		MM2, dwSrcRGBRate

			PUNPCKLBW	MM2, MM4								// WORD単位で乗算するので
			MOVD		MM3, dwDstRGBRate

			PUNPCKLBW	MM3, MM4
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_12:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_12: // 14クロック･サイクル (PMULが 3クロックだと 18クロック)
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [EDI]
			PUNPCKLBW	MM0, MM4								// WORD単位で乗算するので

			PMULLW		MM0, MM2
			PUNPCKLBW	MM1, MM4

			PMULLW		MM1, MM3			// UnPair
			NOP

			NOP			// PMULストール回避 (2命令追加)
			NOP

			NOP
			NOP

			PADDUSB		MM0, MM1			// UnPair

			PSRLW		MM0, 8
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PACKUSWB	MM0, MM4
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_12								// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_12:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_12

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_12										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_12:
			DEC			EDX
			JNZ			LoopY_12

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			mm4 = 0;
			mm2 = (yane_q)yane_ld(dwSrcRGBRate);
			mm2 = yane_punpcklbw(mm2, mm4);
			mm3 = (yane_q)yane_ld(dwDstRGBRate);
			mm3 = yane_punpcklbw(mm3, mm4);
			ebx = yane_ld(EIY);
		LoopY_12:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_12:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(edi);
			mm0 = yane_punpcklbw(mm0, mm4);
			mm0 = yane_pmullw(mm0, mm2);
			mm1 = yane_punpcklbw(mm1, mm4);
			mm1 = yane_pmullw(mm1, mm3);
			mm0 = yane_paddusb(mm0, mm1);
			mm0 = yane_psrlw(mm0, 8);
			esi += yane_ld(AddSrcPixel);
			mm0 = yane_packuswb(mm0, mm4);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_12;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_12:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_12;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_12;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_12:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_12;
		}
#endif
	} // if

	
	return 0;
} // BlendBltFastM


//////////////////////////////////////
//	AddColorBltM
//	抜き色有りのADDブレンド転送
//////////////////////////////////////
// @yo2 0x0043ff70 vt
LRESULT CDIB32PMMX::AddColorBltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::AddColorBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::AddColorBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0			// UnPair			// ColKey

		LoopY_13:
			SHR			ECX, 1
			JNB			Skip_13									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PADDUSB		MM0, MM2
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// UnPair			// (P ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_13

		Skip_13:
			SHR			ECX, 1
			JNB			LoopX_13								//	4の倍数か否かの判定
			// Step	2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM3, [ESI-8]		// UnPair

			MOVQ		MM2, [EDI]
			PUNPCKLDQ	MM0, MM3								// ソースの 2ピクセルをミラーする

			MOVQ		MM1, MM0
			PADDUSB		MM0, MM2

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM2, MM0								// (P ^ dst)

			PAND		MM2, MM1			// UnPair			// & mask

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_13

		LoopX_13:// 16クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM6, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM6			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM6, [ESI-16]		// 2
			MOVQ		MM1, MM0			// 1

			MOVQ		MM2, [EDI]			// 1
			PUNPCKLDQ	MM3, MM6			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM5, [EDI+8]		// 2
			MOVQ		MM4, MM3			// 2

			PADDUSB		MM0, MM2			// 1
			PADDUSB		MM3, MM5			// 2

			PCMPEQD		MM1, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000
			PCMPEQD		MM4, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// 1				// (P ^ dst)
			PXOR		MM5, MM3			// 2				// (P ^ dst)

			PAND		MM2, MM1			// 1				// & mask
			PAND		MM5, MM4			// 2				// & mask

			PXOR		MM0, MM2			// 1				// P ^ ()
			PXOR		MM3, MM5			// 2				// P ^ ()

			ADD			ESI, -16			// AGI回避

			MOVQ		[EDI], MM0			// 1// UnPair

			MOVQ		[EDI+8], MM3		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_13			// UnPair

		EndLoop_13:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_13			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
		LoopY_13:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_13;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_13;
		Skip_13:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_13;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm3 = (yane_q)YANE_RD32(esi - 8);
			mm2 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm3);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			mm0 ^= mm2;
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_13;
		LoopX_13:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm6 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm6);
			mm6 = (yane_q)YANE_RD32(esi - 16);
			mm1 = mm0;
			mm2 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm6);
			mm5 = YANE_RD64(edi + 8);
			mm4 = mm3;
			mm0 = yane_paddusb(mm0, mm2);
			mm3 = yane_paddusb(mm3, mm5);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm4 = yane_pcmpeqd(mm4, mm7);
			mm2 ^= mm0;
			mm5 ^= mm3;
			mm2 &= mm1;
			mm5 &= mm4;
			mm0 ^= mm2;
			mm3 ^= mm5;
			esi += 0xFFFFFFF0;
			YANE_WR64(edi, mm0);
			YANE_WR64(edi + 8, mm3);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_13;
		EndLoop_13:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_13;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0								// ColKey
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_14:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_14: // 11クロック･サイクル
			MOVD		MM0, [ESI-4]			// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			PADDUSB		MM0, MM2
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM2, MM0			// UnPair			// (P ^ dst)

			PAND		MM2, MM1								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM0, MM2								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_14								// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_14:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_14

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_14										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_14:
			DEC			EDX
			JNZ			LoopY_14

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
			ebx = yane_ld(EIY);
		LoopY_14:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_14:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm0 = yane_paddusb(mm0, mm2);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm2 ^= mm0;
			mm2 &= mm1;
			esi += yane_ld(AddSrcPixel);
			mm0 ^= mm2;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_14;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_14:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_14;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_14;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_14:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_14;
		}
#endif
	} // if


	return 0;
} // AddColorBltM


//////////////////////////////////////
//	AddColorBltFastM
//	抜き色無しのADDブレンド転送
//////////////////////////////////////
// @yo2 0x00440280 vt
LRESULT CDIB32PMMX::AddColorBltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::AddColorBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::AddColorBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:無	 ADDブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

		LoopY_15:
			SHR			ECX, 1
			JNB			Skip_15									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PADDUSB		MM0, MM2
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_15

		Skip_15:
			SHR			ECX, 1
			JNB			LoopX_15									//	4の倍数か否かの判定
			// Step	2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM3, [ESI-8]		// UnPair

			MOVQ		MM2, [EDI]
			PUNPCKLDQ	MM0, MM3								// ソースの 2ピクセルをミラーする

			PADDUSB		MM0, MM2
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM0		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_15

		LoopX_15:// 11クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM6, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM6			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM6, [ESI-16]		// 2// UnPair

			MOVQ		MM2, [EDI]		// 1
			PUNPCKLDQ	MM3, MM6			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM5, [EDI+8]		// 2
			PADDUSB		MM0, MM2			// 1

			PADDUSB		MM3, MM5			// 2
			ADD			EDI, 16

			ADD			ESI, -16			// AGI回避

			MOVQ		[EDI-16], MM0		// 1// UnPair

			MOVQ		[EDI-8], MM3		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_15

		EndLoop_15:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_15			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm2, mm3, mm5, mm6;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
		LoopY_15:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_15;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm0 = yane_paddusb(mm0, mm2);
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_15;
		Skip_15:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_15;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm3 = (yane_q)YANE_RD32(esi - 8);
			mm2 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm3);
			mm0 = yane_paddusb(mm0, mm2);
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm0);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_15;
		LoopX_15:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm6 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm6);
			mm6 = (yane_q)YANE_RD32(esi - 16);
			mm2 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm6);
			mm5 = YANE_RD64(edi + 8);
			mm0 = yane_paddusb(mm0, mm2);
			mm3 = yane_paddusb(mm3, mm5);
			edi += 16;
			esi += 0xFFFFFFF0;
			YANE_WR64(edi - 16, mm0);
			YANE_WR64(edi - 8, mm3);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_15;
		EndLoop_15:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_15;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;
		
#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_16:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_16: // 8クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PADDUSB		MM0, MM2
			ADD			ESI, AddSrcPixel						// 整数部の加算

			ADD			EDI, 4
			ADD			EAX, EX									// EX += 2*DX;
			
			JNB			SkipX_16			// UnPair			// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_16:
			MOVD		[EDI-4], MM0		// UnPair

			DEC			ECX
			JNZ			LoopX_16

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_16										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_16:
			DEC			EDX
			JNZ			LoopY_16

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm2;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			ebx = yane_ld(EIY);
		LoopY_16:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_16:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm0 = yane_paddusb(mm0, mm2);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_16;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_16:
			YANE_WR32(edi - 4, (DWORD)mm0);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_16;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_16;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_16:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_16;
		}
#endif
	} // if


	return 0;
} // AddColorBltFastM


//////////////////////////////////////
//	SubColorBltM
//	抜き色有りのSUBブレンド転送
//////////////////////////////////////
// @yo2 0x00440520 vt
LRESULT CDIB32PMMX::SubColorBltM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::SubColorBltMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::SubColorBltMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
		DWORD	colKey = p->m_dwColorKey;

				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0			// UnPair			// ColKey

		LoopY_17:
			SHR			ECX, 1
			JNB			Skip_17									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			MOVQ		MM3, MM2
			PSUBUSB		MM2, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM3, MM2								// (P ^ dst)

			PAND		MM3, MM1			// UnPair			// & mask

			PXOR		MM2, MM3								// P ^ ()
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_17

		Skip_17:
			SHR			ECX, 1
			JNB			LoopX_17								//	4の倍数か否かの判定
			// Step	2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [ESI-8]		// UnPair

			MOVQ		MM2, [EDI]
			PUNPCKLDQ	MM0, MM1								// ソースの 2ピクセルをミラーする

			MOVQ		MM1, MM0
			MOVQ		MM3, MM2

			PSUBUSB		MM2, MM0
			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000

			PXOR		MM3, MM2			// UnPair			// (P ^ dst)

			PAND		MM3, MM1			// UnPair			// & mask

			PXOR		MM2, MM3								// P ^ ()
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_17

		LoopX_17:// 17クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM1, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM1			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM4, [ESI-16]		// 2
			MOVQ		MM1, MM0			// 1

			MOVQ		MM2, [EDI]			// 1
			PUNPCKLDQ	MM3, MM4			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM5, [EDI+8]		// 2
			MOVQ		MM4, MM3			// 2

			MOVQ		MM6, MM2			// 1
			PSUBUSB		MM2, MM0			// 1

			PCMPEQD		MM1, MM7			// 1				// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM6, MM2			// 1				// (P ^ dst)

			PAND		MM6, MM1			// 1				// & mask
			PSUBUSB		MM5, MM3			// 2

			PXOR		MM2, MM6			// 1				// P ^ ()
			PCMPEQD		MM4, MM7			// 2				// ColKey:0xffffffff NonColKey:0x00000000

			MOVQ		MM6, [EDI+8]		// 2// UnPair

			PXOR		MM6, MM5			// 2// UnPair		// (P ^ dst)

			PAND		MM6, MM4			// 2				// & mask
			ADD			EDI, 16

			PXOR		MM5, MM6			// 2				// P ^ ()
			ADD			ESI, -16			// AGI回避

			MOVQ		[EDI-16], MM2		// 1// UnPair

			MOVQ		[EDI-8], MM5		// 2// UnPair

			DEC			ECX
			JNZ			LoopX_17

		EndLoop_17:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_17			// UnPair
	
			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5, mm6, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
		LoopY_17:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_17;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm3 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm3 ^= mm2;
			mm3 &= mm1;
			mm2 ^= mm3;
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_17;
		Skip_17:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_17;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm2 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm1);
			mm1 = mm0;
			mm3 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm3 ^= mm2;
			mm3 &= mm1;
			mm2 ^= mm3;
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_17;
		LoopX_17:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm1);
			mm4 = (yane_q)YANE_RD32(esi - 16);
			mm1 = mm0;
			mm2 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm4);
			mm5 = YANE_RD64(edi + 8);
			mm4 = mm3;
			mm6 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm6 ^= mm2;
			mm6 &= mm1;
			mm5 = yane_psubusb(mm5, mm3);
			mm2 ^= mm6;
			mm4 = yane_pcmpeqd(mm4, mm7);
			mm6 = YANE_RD64(edi + 8);
			mm6 ^= mm5;
			mm6 &= mm4;
			edi += 16;
			mm5 ^= mm6;
			esi += 0xFFFFFFF0;
			YANE_WR64(edi - 16, mm2);
			YANE_WR64(edi - 8, mm5);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_17;
		EndLoop_17:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_17;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:有   ミラー:有   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD	colKey = p->m_dwColorKey;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOVD		MM7, colKey								//	カラーキーを設定する
			MOV			EDI, lpDst

			MOVQ		MM0, MM7
			MOV			ESI, lpSrc

			PUNPCKLDQ	MM7, MM0								// ColKey
			MOV			EBX, EIY								// nEyCnt = EIY;

		LoopY_18:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_18: // 11クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]
			MOVQ		MM1, MM0

			MOVQ		MM3, MM2
			PSUBUSB		MM2, MM0

			PCMPEQD		MM1, MM7								// ColKey:0xffffffff NonColKey:0x00000000
			PXOR		MM3, MM2								// (P ^ dst)

			PAND		MM3, MM1								// & mask
			ADD			ESI, AddSrcPixel						// 整数部の加算

			PXOR		MM2, MM3								// P ^ ()
			ADD			EDI, 4

			ADD			EAX, EX									// EX += 2*DX;
			JNB			SkipX_18								// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_18:
			MOVD		[EDI-4], MM2		// UnPair

			DEC			ECX
			JNZ			LoopX_18

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_18										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_18:
			DEC			EDX
			JNZ			LoopY_18

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm7;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			mm7 = (yane_q)yane_ld(colKey);
			edi = yane_ld(lpDst);
			mm0 = mm7;
			esi = yane_ld(lpSrc);
			mm7 = yane_punpckldq(mm7, mm0);
			ebx = yane_ld(EIY);
		LoopY_18:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_18:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm1 = mm0;
			mm3 = mm2;
			mm2 = yane_psubusb(mm2, mm0);
			mm1 = yane_pcmpeqd(mm1, mm7);
			mm3 ^= mm2;
			mm3 &= mm1;
			esi += yane_ld(AddSrcPixel);
			mm2 ^= mm3;
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_18;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_18:
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_18;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_18;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_18:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_18;
		}
#endif
	} // if


	return 0;
} // SubColorBltM


//////////////////////////////////////
//	SubColorBltFastM
//	抜き色無しのSUBブレンド転送
//////////////////////////////////////
// @yo2 0x00440840 vt
LRESULT CDIB32PMMX::SubColorBltFastM(CDIB32* lpDIB32,int x,int y,LPRECT lpSrcRect,LPSIZE lpDstSize,LPRECT lpClipRect)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32PMMX::SubColorBltFastMでm_lpdwSrc == NULL");

	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32PMMX::SubColorBltFastMでp->GetPtr() == NULL");


// クリッピング等の処理
	// 転送範囲なしの時は、このまま帰る
	if ( ClippingM( lpDIB32, x, y, lpSrcRect, lpDstSize,  lpClipRect ) != 0 )
		return 0;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcDstRect.right - m_rcDstRect.left;
	int		nHeight = m_rcDstRect.bottom - m_rcDstRect.top;

	DWORD	nSrcWidth = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;	// 転送する横幅の計算
	DWORD	nAddSrcWidth = p->m_lPitch - nSrcWidth;					// クリッピングして飛ばす分の算出
	DWORD	nAddDstWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定

	DWORD*	lpSrc = (DWORD*)((BYTE*)p->m_lpdwSrc + (m_rcSrcRect.right<<2) + m_rcSrcRect.top*p->m_lPitch);
	DWORD*	lpDst = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcDstRect.left<<2) + m_rcDstRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:無	 SUBブレンド:有	  --------------
	if ( m_bActualSize == true )
	{
				nSrcWidth = nSrcWidth + p->m_lPitch;				// 次ラインへの移動距離 = 転送する横幅 + Srcの全横幅


#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

		LoopY_19:
			SHR			ECX, 1
			JNB			Skip_19								//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PSUBUSB		MM2, MM0
			ADD			EDI, 4

			ADD			ESI, -4				// AGI回避

			MOVD		[EDI-4], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_19

		Skip_19:
			SHR			ECX, 1
			JNB			LoopX_19								//	4の倍数か否かの判定
			// Step	2
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM1, [ESI-8]		// UnPair

			MOVQ		MM2, [EDI]
			PUNPCKLDQ	MM0, MM1								// ソースの 2ピクセルをミラーする

			PSUBUSB		MM2, MM0
			ADD			EDI, 8

			ADD			ESI, -8				// AGI回避

			MOVQ		[EDI-8], MM2		// UnPair

			OR			ECX, ECX
			JZ			EndLoop_19

		LoopX_19:// 11クロック･サイクル
			// Step4
			MOVD		MM0, [ESI-4]		// 1// UnPair

			MOVD		MM1, [ESI-8]		// 1// UnPair

			MOVD		MM3, [ESI-12]		// 2
			PUNPCKLDQ	MM0, MM1			// 1				// ソースの 2ピクセルをミラーする

			MOVD		MM4, [ESI-16]		// 2// UnPair

			MOVQ		MM2, [EDI]			// 1
			PUNPCKLDQ	MM3, MM4			// 2				// ソースの 2ピクセルをミラーする

			MOVQ		MM5, [EDI+8]		// 2
			PSUBUSB		MM2, MM0			// 1

			PSUBUSB		MM5, MM3			// 1
			ADD			ESI, -16			// AGI回避

			MOVQ		[EDI], MM2			// 1// UnPair

			MOVQ		[EDI+8], MM5		// 2// UnPair

			ADD			EDI, 16
			DEC			ECX

			JNZ			LoopX_19			// UnPair

		EndLoop_19:
			ADD			EDI, nAddDstWidth						// Dstの先頭を次のラインに移動させる
			ADD			ESI, nSrcWidth							// 次ラインへの移動

			MOV			ECX, nWidth								//	ECXの更新
			DEC			EDX

			JNZ			LoopY_19			// UnPair

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi, edi;
			yane_q mm0, mm1, mm2, mm3, mm4, mm5;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
		LoopY_19:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_19;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm2 = yane_psubusb(mm2, mm0);
			edi += 4;
			esi += 0xFFFFFFFC;
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_19;
		Skip_19:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_19;
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm2 = YANE_RD64(edi);
			mm0 = yane_punpckldq(mm0, mm1);
			mm2 = yane_psubusb(mm2, mm0);
			edi += 8;
			esi += 0xFFFFFFF8;
			YANE_WR64(edi - 8, mm2);
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_19;
		LoopX_19:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm1 = (yane_q)YANE_RD32(esi - 8);
			mm3 = (yane_q)YANE_RD32(esi - 12);
			mm0 = yane_punpckldq(mm0, mm1);
			mm4 = (yane_q)YANE_RD32(esi - 16);
			mm2 = YANE_RD64(edi);
			mm3 = yane_punpckldq(mm3, mm4);
			mm5 = YANE_RD64(edi + 8);
			mm2 = yane_psubusb(mm2, mm0);
			mm5 = yane_psubusb(mm5, mm3);
			esi += 0xFFFFFFF0;
			YANE_WR64(edi, mm2);
			YANE_WR64(edi + 8, mm5);
			edi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_19;
		EndLoop_19:
			edi += yane_ld(nAddDstWidth);
			esi += yane_ld(nSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_19;
		}
#endif
	} // if
// -----------	 MMX   カラーキー:無   ミラー:有   拡縮:有	 ADDブレンド:有	  --------------
	else if ( 1 )
	{
		DWORD	AddSrcPixel = -4 * m_nStepsX;
//		DWORD	AddWidthSrc = ((p->m_rcRect.right - p->m_rcRect.left)<<2) * m_nStepsY;
		DWORD	AddWidthSrc = p->m_lPitch * m_nStepsY;
//		DWORD	AddWidthSrc2 = (m_rcSrcRect.right - m_rcSrcRect.left)<<2;
		int		EIX= m_nInitialX;
		int		EIY= m_nInitialY;
		int		EX = m_nStepX;
		int		EY = m_nStepY;
		int		EX2= m_nCmpX;
		int		EY2= m_nCmpY;
		DWORD*	lpSrcBack;
		DWORD	lPitchSrc = p->m_lPitch;

#ifdef _MSC_VER
		_asm
		{
			MOV			EDX, nHeight
			MOV			ECX, nWidth

			MOV			EDI, lpDst
			MOV			ESI, lpSrc

			MOV			EBX, EIY			// UnPair			// nEyCnt = EIY;

		LoopY_20:
			MOV			lpSrcBack, ESI
			MOV			EAX, EIX			// UnPair			// nExCnt = EIX;

		LoopX_20: // 8クロック･サイクル
			MOVD		MM0, [ESI-4]		// UnPair

			MOVD		MM2, [EDI]			// UnPair

			PSUBUSB		MM2, MM0
			ADD			ESI, AddSrcPixel						// 整数部の加算

			ADD			EDI, 4
			ADD			EAX, EX									// EX += 2*DX;

			JNB			SkipX_20			// UnPair			// if ( EX >= 0)

			ADD			ESI, -4									// lpSrc++;
			SUB			EAX, EX2								// Xの補正値

		SkipX_20:
			MOVD		[EDI-4], MM2		// UnPair

			DEC			ECX
			JNZ			LoopX_20

			MOV			ESI, lpSrcBack							// Srcの先頭に戻す
			ADD			EDI, nAddDstWidth							// Dstの先頭を次のラインに移動させる

			MOV			ECX, nWidth
			ADD			ESI, AddWidthSrc						// 整数部の加算 '00.09.12.byTia

			ADD			EBX, EY										// Yの増分を加算
			JNB			SkipY_20										// if ( EY >= 0 )

			SUB			EBX, EY2									// Yの補正
			ADD			ESI, lPitchSrc								// クリップした領域分を飛ばす

		SkipY_20:
			DEC			EDX
			JNZ			LoopY_20

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			yane_q mm0, mm2;
			yane_fl f;
			edx = yane_ld(nHeight);
			ecx = yane_ld(nWidth);
			edi = yane_ld(lpDst);
			esi = yane_ld(lpSrc);
			ebx = yane_ld(EIY);
		LoopY_20:
			yane_st(lpSrcBack, esi);
			eax = yane_ld(EIX);
		LoopX_20:
			mm0 = (yane_q)YANE_RD32(esi - 4);
			mm2 = (yane_q)YANE_RD32(edi);
			mm2 = yane_psubusb(mm2, mm0);
			esi += yane_ld(AddSrcPixel);
			edi += 4;
			yane_add(eax, yane_ld(EX), f);
			if (!f.cf) goto SkipX_20;
			esi += 0xFFFFFFFC;
			eax -= yane_ld(EX2);
		SkipX_20:
			YANE_WR32(edi - 4, (DWORD)mm2);
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_20;
			esi = yane_ld(lpSrcBack);
			edi += yane_ld(nAddDstWidth);
			ecx = yane_ld(nWidth);
			esi += yane_ld(AddWidthSrc);
			yane_add(ebx, yane_ld(EY), f);
			if (!f.cf) goto SkipY_20;
			ebx -= yane_ld(EY2);
			esi += yane_ld(lPitchSrc);
		SkipY_20:
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_20;
		}
#endif
	} // if



	return 0;
} // SubColorBltFastM


////////////////////////////////////////////////////////////////////
//	このプレーンに対するエフェクト
////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////
//	AddColorFast
//	抜き色無しのADDブレンド転送 (同プレーン)
//////////////////////////////////////////////////
// @yo2 0x00440ae0 vt
LRESULT CDIB32PMMX::AddColorFast(DWORD dwAddRGB,LPRECT lpSrcRect)
{
// クリッピング等の処理
	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL)
	{
		m_rcSrcRect = m_rcRect;
	}
	else
	{
		m_rcSrcRect = *lpSrcRect;
		if ( m_rcSrcRect.left > m_rcSrcRect.right )
		{
			return 1;	// invalid rect
		}
	}
	//	クリップ領域
	LPRECT lpClip;
	lpClip = &m_rcRect;

		// クリッピングする
		// this yaneurao clipping algorithm is changed by tia
		int t;
		t = lpClip->left  - m_rcSrcRect.left;
		if ( t > 0 ) { m_rcSrcRect.left = lpClip->left; }
		t = lpClip->top	  - m_rcSrcRect.top;
		if ( t > 0 ) { m_rcSrcRect.top = lpClip->top; }
		t = m_rcSrcRect.right - lpClip->right;
		if ( t > 0 ) { m_rcSrcRect.right = lpClip->right; }
		t = m_rcSrcRect.bottom - lpClip->bottom;
		if ( t > 0 ) { m_rcSrcRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcSrcRect.right - m_rcSrcRect.left;
	int		nHeight = m_rcSrcRect.bottom - m_rcSrcRect.top;
	DWORD	nAddSrcWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
	DWORD*	lpSrc = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcSrcRect.left<<2) + m_rcSrcRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 ADDブレンド:有	  --------------
#ifdef _MSC_VER
		_asm
		{
			MOVD		MM2, dwAddRGB
			MOV			EDX, nHeight

			MOVQ		MM0, MM2
			MOV			ECX, nWidth

			PUNPCKLDQ	MM2, MM0
			MOV			ESI, lpSrc

		LoopY_21:
			SHR			ECX, 1
			JNB			Skip_21									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			PADDUSB		MM0, MM2
			NOP			// AGI回避

			NOP								// UnPair

			MOVD		[ESI], MM0			// UnPair

			ADD			ESI, 4				// UnPair

			OR			ECX, ECX
			JZ			EndLoop_21

		Skip_21:
			SHR			ECX, 1
			JNB			LoopX_21								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			PADDUSB		MM0, MM2
			NOP			// AGI回避

			NOP								// UnPair

			MOVQ		[ESI], MM0			// UnPair

			ADD			ESI, 8				// UnPair

			OR			ECX, ECX
			JZ			EndLoop_21

		LoopX_21: // 7クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			PADDUSB		MM0, MM2			// 1

			PADDUSB		MM3, MM2			// 2// AGI回避
			
			MOVQ		[ESI], MM0			// UnPair

			MOVQ		[ESI+8], MM3		// UnPair

			ADD			ESI, 16
			DEC			ECX

			JNZ			LoopX_21			// UnPair

		EndLoop_21:
			ADD			ESI, nAddSrcWidth						// クリップした領域分を飛ばす
			MOV			ECX, nWidth								//	ECXの更新

			DEC			EDX
			JNZ			LoopY_21

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi;
			yane_q mm0, mm2, mm3;
			yane_fl f;
			mm2 = (yane_q)yane_ld(dwAddRGB);
			edx = yane_ld(nHeight);
			mm0 = mm2;
			ecx = yane_ld(nWidth);
			mm2 = yane_punpckldq(mm2, mm0);
			esi = yane_ld(lpSrc);
		LoopY_21:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_21;
			mm0 = (yane_q)YANE_RD32(esi);
			mm0 = yane_paddusb(mm0, mm2);
			YANE_WR32(esi, (DWORD)mm0);
			esi += 4;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_21;
		Skip_21:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_21;
			mm0 = YANE_RD64(esi);
			mm0 = yane_paddusb(mm0, mm2);
			YANE_WR64(esi, mm0);
			esi += 8;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_21;
		LoopX_21:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm0 = yane_paddusb(mm0, mm2);
			mm3 = yane_paddusb(mm3, mm2);
			YANE_WR64(esi, mm0);
			YANE_WR64(esi + 8, mm3);
			esi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_21;
		EndLoop_21:
			esi += yane_ld(nAddSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_21;
		}
#endif


	return 0;
} // AddColorFast


//////////////////////////////////////////////////
//	SubColorFast
//	抜き色無しのSubブレンド転送 (同プレーン)
//////////////////////////////////////////////////
// @yo2 0x00440ca0 vt
LRESULT CDIB32PMMX::SubColorFast(DWORD dwSubRGB,LPRECT lpSrcRect)
{
// クリッピング等の処理
	//	ソース矩形がNULLならば、全域
	if (lpSrcRect==NULL)
	{
		m_rcSrcRect = m_rcRect;
	}
	else
	{
		m_rcSrcRect = *lpSrcRect;
		if ( m_rcSrcRect.left > m_rcSrcRect.right )
		{
			return 1;	// invalid rect
		}
	}
	//	クリップ領域
	LPRECT lpClip;
	lpClip = &m_rcRect;

		// クリッピングする
		// this yaneurao clipping algorithm is changed by tia
		int t;
		t = lpClip->left  - m_rcSrcRect.left;
		if ( t > 0 ) { m_rcSrcRect.left = lpClip->left; }
		t = lpClip->top	  - m_rcSrcRect.top;
		if ( t > 0 ) { m_rcSrcRect.top = lpClip->top; }
		t = m_rcSrcRect.right - lpClip->right;
		if ( t > 0 ) { m_rcSrcRect.right = lpClip->right; }
		t = m_rcSrcRect.bottom - lpClip->bottom;
		if ( t > 0 ) { m_rcSrcRect.bottom = lpClip->bottom; }

		//	invalid rect ?
		if (m_rcSrcRect.left >= m_rcSrcRect.right ||
			m_rcSrcRect.top	 >= m_rcSrcRect.bottom) return 1;

	// 転送先の横幅と縦幅の設定
	int		nWidth = m_rcSrcRect.right - m_rcSrcRect.left;
	int		nHeight = m_rcSrcRect.bottom - m_rcSrcRect.top;
	DWORD	nSubSrcWidth = m_lPitch - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
	DWORD*	lpSrc = (DWORD*)((BYTE*)m_lpdwSrc + (m_rcSrcRect.left<<2) + m_rcSrcRect.top*m_lPitch );	// 指定されたx,yの位置調整


// -----------	 MMX   カラーキー:無   ミラー:無   拡縮:無	 Subブレンド:有	  --------------
#ifdef _MSC_VER
		_asm
		{
			MOVD		MM2, dwSubRGB
			MOV			EDX, nHeight

			MOVQ		MM0, MM2
			MOV			ECX, nWidth

			PUNPCKLDQ	MM2, MM0
			MOV			ESI, lpSrc

		LoopY_21:
			SHR			ECX, 1
			JNB			Skip_21									//	偶数か否かの判定
			// Step	1
			MOVD		MM0, [ESI]			// UnPair

			PSUBUSB		MM0, MM2
			NOP			// AGI回避

			NOP								// UnPair

			MOVD		[ESI], MM0			// UnPair

			ADD			ESI, 4				// UnPair

			OR			ECX, ECX
			JZ			EndLoop_21

		Skip_21:
			SHR			ECX, 1
			JNB			LoopX_21								//	4の倍数か否かの判定
			// Step2
			MOVQ		MM0, [ESI]			// UnPair

			PSUBUSB		MM0, MM2
			NOP			// AGI回避

			NOP								// UnPair

			MOVQ		[ESI], MM0			// UnPair

			ADD			ESI, 8				// UnPair

			OR			ECX, ECX
			JZ			EndLoop_21

		LoopX_21: // 7クロック･サイクル
			// Step4
			MOVQ		MM0, [ESI]			// 1// UnPair

			MOVQ		MM3, [ESI+8]		// 2
			PSUBUSB		MM0, MM2			// 1

			PSUBUSB		MM3, MM2			// 2// AGI回避
			
			MOVQ		[ESI], MM0			// UnPair

			MOVQ		[ESI+8], MM3		// UnPair

			ADD			ESI, 16
			DEC			ECX

			JNZ			LoopX_21			// UnPair

		EndLoop_21:
			ADD			ESI, nSubSrcWidth						// クリップした領域分を飛ばす
			MOV			ECX, nWidth								//	ECXの更新

			DEC			EDX
			JNZ			LoopY_21

			EMMS
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD ecx, edx, esi;
			yane_q mm0, mm2, mm3;
			yane_fl f;
			mm2 = (yane_q)yane_ld(dwSubRGB);
			edx = yane_ld(nHeight);
			mm0 = mm2;
			ecx = yane_ld(nWidth);
			mm2 = yane_punpckldq(mm2, mm0);
			esi = yane_ld(lpSrc);
		LoopY_21:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto Skip_21;
			mm0 = (yane_q)YANE_RD32(esi);
			mm0 = yane_psubusb(mm0, mm2);
			YANE_WR32(esi, (DWORD)mm0);
			esi += 4;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_21;
		Skip_21:
			yane_shr(ecx, 1, f);
			if (!f.cf) goto LoopX_21;
			mm0 = YANE_RD64(esi);
			mm0 = yane_psubusb(mm0, mm2);
			YANE_WR64(esi, mm0);
			esi += 8;
			yane_logic(ecx, f);
			if (f.zf) goto EndLoop_21;
		LoopX_21:
			mm0 = YANE_RD64(esi);
			mm3 = YANE_RD64(esi + 8);
			mm0 = yane_psubusb(mm0, mm2);
			mm3 = yane_psubusb(mm3, mm2);
			YANE_WR64(esi, mm0);
			YANE_WR64(esi + 8, mm3);
			esi += 16;
			yane_dec(ecx, f);
			if (!f.zf) goto LoopX_21;
		EndLoop_21:
			esi += yane_ld(nSubSrcWidth);
			ecx = yane_ld(nWidth);
			yane_dec(edx, f);
			if (!f.zf) goto LoopY_21;
		}
#endif


	return 0;
} // SubColorFast

//////////////////////////////////////
//	Ｍｏｒｐｈ
//////////////////////////////////////
//	スキャン及び出力用の開始点（Ｓｘ，Ｓｙ）とＵＶステップ量（Ｐｘ，Ｐｙ）構造体
//			アセンブラでの場合ここに最初U,Vの終点座標差をＣ言語側で求めて
//			かいておく。そして割り算やって格納
struct StartAndStep	{
	int		nStartX;
	int		nStartY;
	int		nStepUX;
	int		nStepUY;
	int		nStepVX;
	int		nStepVY;
};
//	４点のポイントアクセス用列挙体
enum Point { A, B, C, D, POINT_NUM };
//	出力先のソート用構造体
struct	DstSort {
	Point	p;
	int		x;
	int		y;
};
static int pointsort(const void* element1, const void* element2)
{
	int		iRes;
	iRes = (static_cast<const DstSort*> (element1))->y - (static_cast<const DstSort*> (element2))->y;
	if (iRes == 0) {
		return (static_cast<const DstSort*> (element1))->x - (static_cast<const DstSort*> (element2))->x;
	} else {
		return iRes;
	}
}

// @yo2 0x00440e60 vt
LRESULT CDIB32P5::MorphBlt(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip)
{
	if (lpSrcRect==NULL) {
		lpSrcRect = lpDIB32->GetRect();
	}

	//	ＲＥＣＴ－＞ＰＯＩＮＴ変換
	POINT	lpSrcPoint[4];
	lpSrcPoint[0].x = lpSrcRect->left;
	lpSrcPoint[0].y = lpSrcRect->top;
	lpSrcPoint[1].x = lpSrcRect->right - 1;
	lpSrcPoint[1].y = lpSrcRect->top;
	lpSrcPoint[2].x = lpSrcRect->left;
	lpSrcPoint[2].y = lpSrcRect->bottom - 1;
	lpSrcPoint[3].x = lpSrcRect->right - 1;
	lpSrcPoint[3].y = lpSrcRect->bottom - 1;
	return CDIB32P5::MorphBlt(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, false);
}

// @yo2 0x00440f00 vt
LRESULT CDIB32P5::MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip)
{
	if (lpDstRect==NULL){
		lpDstRect = GetRect();
	}

	//	ＲＥＣＴ－＞ＰＯＩＮＴ変換
	POINT	lpDstPoint[4];
	lpDstPoint[0].x = lpDstRect->left;
	lpDstPoint[0].y = lpDstRect->top;
	lpDstPoint[1].x = lpDstRect->right - 1;
	lpDstPoint[1].y = lpDstRect->top;
	lpDstPoint[2].x = lpDstRect->left;
	lpDstPoint[2].y = lpDstRect->bottom - 1;
	lpDstPoint[3].x = lpDstRect->right - 1;
	lpDstPoint[3].y = lpDstRect->bottom - 1;
	return CDIB32P5::MorphBlt(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, true);
}

// @yo2 0x00440fa0 vt
LRESULT CDIB32P5::MorphBlt(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip, bool bContinual)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32P5::MorphBltでm_lpdwSrc == NULL");
	{
	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32P5::MorphBltでp->GetPtr() == NULL");
	}

	//	クリップ領域変換
	if (lpClip == NULL) {
		lpClip = GetRect();
	}
	//	スキャン・出力用開始点とＵＶステップバッファ
	StartAndStep lpScanSS[3], lpPutSS[3];
	//	ｌｍｎ各成分におけるスキャン側(Sx,Sy)-(Ex,Ey)を割るための出力Ｙ長さ
	int	lpnScanU[3], lpnScanV[3];
	//	スキャンする４点の頂点連結バッファ
	static const Point	lpPointConnect[POINT_NUM][3] = {
		//	 A			  B			   C			D
		{ B, C, D }, { A, D, C }, { A, D, B }, { B, C, A }
	};
	//	出力四角形の頂点Ｙ方向ソート結果格納バッファ
	DstSort	lpDstSort[POINT_NUM];
	for (int i = A; i < POINT_NUM; i++) {
		lpDstSort[i].p = static_cast<Point> (i);
		lpDstSort[i].x = (lpDstPoint + i)->x;
		lpDstSort[i].y = (lpDstPoint + i)->y;
	}
	//	出力ポイントをＹ方向順にする。
	qsort(lpDstSort, POINT_NUM, sizeof(lpDstSort[0]), pointsort);
	//	出力するｌｍｎ成分ｙ方向カウンタバッファ
	int			lpPutCount[3];
	lpPutCount[0] = lpDstSort[1].y - lpDstSort[0].y;
	lpPutCount[1] = lpDstSort[2].y - lpDstSort[1].y;
	lpPutCount[2] = lpDstSort[3].y - lpDstSort[2].y;
	
	//	頂点出力データ読み出してセット
	lpPutSS[0].nStartX = lpDstSort[0].x;
	lpPutSS[0].nStartY = lpDstSort[0].y;
	//	頂点からのUV線求める
	Point	point0 = lpDstSort[0].p;
	Point	point1 = lpPointConnect[lpDstSort[0].p][0];
	Point	point2 = lpPointConnect[lpDstSort[0].p][1];
	int nVect = (((lpDstPoint + point2)->x - (lpDstPoint + point0)->x) *
				  ((lpDstPoint + point1)->y - (lpDstPoint + point0)->y)) -
				(((lpDstPoint + point2)->y - (lpDstPoint + point0)->y) *
				 ((lpDstPoint + point1)->x - (lpDstPoint + point0)->x));
	Point	pointU, pointV, pointExc;
	if (0 > nVect) {
		pointV = lpPointConnect[lpDstSort[0].p][0];
		pointU = lpPointConnect[lpDstSort[0].p][1];
	} else {
		pointU = lpPointConnect[lpDstSort[0].p][0];
		pointV = lpPointConnect[lpDstSort[0].p][1];
	}
	pointExc = lpPointConnect[lpDstSort[0].p][2];
	//	最初の頂点からのｌ処理値求めてセット
	lpnScanU[0] = (lpDstPoint + pointU)->y - lpDstSort[0].y;
	lpnScanV[0] = (lpDstPoint + pointV)->y - lpDstSort[0].y;
	lpPutSS[0].nStepUX = lpDstSort[0].x - (lpDstPoint + pointU)->x;
	lpPutSS[0].nStepVX = lpDstSort[0].x - (lpDstPoint + pointV)->x;
	lpScanSS[0].nStartX = (lpSrcPoint + lpDstSort[0].p)->x;
	lpScanSS[0].nStartY = (lpSrcPoint + lpDstSort[0].p)->y;
	lpScanSS[0].nStepUX = lpScanSS[0].nStartX - (lpSrcPoint + pointU)->x;
	lpScanSS[0].nStepUY = lpScanSS[0].nStartY - (lpSrcPoint + pointU)->y;
	lpScanSS[0].nStepVX = lpScanSS[0].nStartX - (lpSrcPoint + pointV)->x;
	lpScanSS[0].nStepVY = lpScanSS[0].nStartY - (lpSrcPoint + pointV)->y;
	if ((lpDstSort[1].p != pointU) && (lpDstSort[1].p != pointV))
		return 0;
	//	ｍ処理値求めてセット
	if (lpDstSort[1].p == pointU) {
		lpnScanU[1] = (lpDstPoint + pointExc)->y - lpDstSort[1].y;
		lpnScanV[1] = 0;
		lpPutSS[1].nStepUX = lpDstSort[1].x - (lpDstPoint + pointExc)->x;
		lpPutSS[1].nStepVX = 0;
		lpScanSS[1].nStartX = (lpSrcPoint + pointU)->x;
		lpScanSS[1].nStartY = (lpSrcPoint + pointU)->y;
		lpScanSS[1].nStepUX = lpScanSS[1].nStartX - (lpSrcPoint + pointExc)->x;
		lpScanSS[1].nStepUY = lpScanSS[1].nStartY - (lpSrcPoint + pointExc)->y;
		lpScanSS[1].nStepVX = 0;
		lpScanSS[1].nStepVY = 0;
		if (lpDstSort[2].p == pointV) {
			lpnScanU[2] = 0;
			lpnScanV[2] = (lpDstPoint + pointExc)->y - lpDstSort[2].y;
			lpPutSS[2].nStepUX = 0;
			lpPutSS[2].nStepVX = lpDstSort[2].x - (lpDstPoint + pointExc)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointV)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointV)->y;
			lpScanSS[2].nStepUX = 0;
			lpScanSS[2].nStepUY = 0;
			lpScanSS[2].nStepVX = lpScanSS[2].nStartX - (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStepVY = lpScanSS[2].nStartY - (lpSrcPoint + pointExc)->y;
		} else {
			lpnScanV[2] = 0;
			lpnScanU[2] = (lpDstPoint + pointV)->y - lpDstSort[2].y;
			lpPutSS[2].nStepVX = 0;
			lpPutSS[2].nStepUX = lpDstSort[2].x - (lpDstPoint + pointV)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointExc)->y;
			lpScanSS[2].nStepVX = 0;
			lpScanSS[2].nStepVY = 0;
			lpScanSS[2].nStepUX = lpScanSS[2].nStartX - (lpSrcPoint + pointV)->x;
			lpScanSS[2].nStepUY = lpScanSS[2].nStartY - (lpSrcPoint + pointV)->y;
		}
	} else {
		lpnScanU[1] = 0;
		lpnScanV[1] = (lpDstPoint + pointExc)->y - lpDstSort[1].y;
		lpPutSS[1].nStepUX = 0;
		lpPutSS[1].nStepVX = lpDstSort[1].x - (lpDstPoint + pointExc)->x;
		lpScanSS[1].nStartX = (lpSrcPoint + pointV)->x;
		lpScanSS[1].nStartY = (lpSrcPoint + pointV)->y;
		lpScanSS[1].nStepUX = 0;
		lpScanSS[1].nStepUY = 0;
		lpScanSS[1].nStepVX = lpScanSS[1].nStartX - (lpSrcPoint + pointExc)->x;
		lpScanSS[1].nStepVY = lpScanSS[1].nStartY - (lpSrcPoint + pointExc)->y;
		if (lpDstSort[2].p == pointU) {
			lpnScanV[2] = 0;
			lpnScanU[2] = (lpDstPoint + pointExc)->y - lpDstSort[2].y;
			lpPutSS[2].nStepVX = 0;
			lpPutSS[2].nStepUX = lpDstSort[2].x - (lpDstPoint + pointExc)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointU)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointU)->y;
			lpScanSS[2].nStepVX = 0;
			lpScanSS[2].nStepVY = 0;
			lpScanSS[2].nStepUX = lpScanSS[2].nStartX - (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStepUY = lpScanSS[2].nStartY - (lpSrcPoint + pointExc)->y;
		} else {
			lpnScanU[2] = 0;
			lpnScanV[2] = (lpDstPoint + pointU)->y - lpDstSort[2].y;
			lpPutSS[2].nStepUX = 0;
			lpPutSS[2].nStepVX = lpDstSort[2].x - (lpDstPoint + pointU)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointExc)->y;
			lpScanSS[2].nStepUX = 0;
			lpScanSS[2].nStepUY = 0;
			lpScanSS[2].nStepVX = lpScanSS[2].nStartX - (lpSrcPoint + pointU)->x;
			lpScanSS[2].nStepVY = lpScanSS[2].nStartY - (lpSrcPoint + pointU)->y;
		}
	}
	//	スキャンライン中の（Ｓｘ，Ｓｙ）－（Ｅｘ，Ｅｙ）の位置と
	//	スキャンラインの変化ステップ
	int		nScanStepSX, nScanStepSY, nScanStepEX, nScanStepEY;
	int		nScanLineSX, nScanLineSY, nScanLineEX, nScanLineEY;
	int		nScanLineStepX, nScanLineStepY;
	//	出力ラインの（Ｓｘ，Ｙｎ）－（Ｅｘ，Ｙｎ）
	int		nPutStepSX, nPutStepEX;
	int		nPutLineSX, nPutLineEX;
	int		nPutLineLeng;
	//	出力バッファベースアドレス
	CDIB32Base*	p = lpDIB32->GetDIB32BasePtr();
	DWORD*		lpDstBase = (DWORD*)((BYTE*)m_lpdwSrc + (lpPutSS[0].nStartY * m_lPitch) - m_lPitch );
	DWORD*		lpSrcBase = p->m_lpdwSrc;
	DWORD*		lpSrcEnd =	(DWORD*)((BYTE*)(p->m_lpdwSrc) + p->m_lPitch * m_rcRect.bottom);
	DWORD		lSrcPitch = p->m_lPitch;
	DWORD		lDstPitch = m_lPitch;
	DWORD**		lplpLineStart = p->m_lpdwLineStart;
	DWORD		ColKey	= p->m_dwColorKey;
	DWORD		SrcClip = 0;
	//	スキャン・出力のクリッピング領域
	DWORD*		lpDstStart = (DWORD*)((BYTE*)m_lpdwSrc + (lpClip->top * m_lPitch));
	DWORD*		lpDstEnd = (DWORD*)((BYTE*)m_lpdwSrc + (lpClip->bottom * m_lPitch));
	DWORD*		lpDstLineStart = lpDstBase + lpClip->left;
	DWORD*		lpDstLineEnd = lpDstBase + lpClip->right;
	int			nSrcSX = p->m_rcRect.left;
	int			nSrcSY = p->m_rcRect.top;
	int			nSrcEX = p->m_rcRect.right;
	int			nSrcEY = p->m_rcRect.bottom;
	DWORD		nPutLineAdj = (bContinual ? 0 : 1 << 20);
	//	アセンブラでのバックアップワーク
	DWORD		nScanPointX, nScanPointY;
	//	ｌ成分処理
		nScanStepSX = lpScanSS[0].nStepUX; //  / lpnScanU[0]
		nScanStepSY = lpScanSS[0].nStepUY; //  / lpnScanU[0]
		nScanStepEX = lpScanSS[0].nStepVX; //  / lpnScanV[0]
		nScanStepEY = lpScanSS[0].nStepVY; //  / lpnScanV[0]
		nScanLineSX = lpScanSS[0].nStartX;
		nScanLineSY = lpScanSS[0].nStartY;
		nScanLineEX = lpScanSS[0].nStartX;
		nScanLineEY = lpScanSS[0].nStartY;
		nPutStepSX = lpPutSS[0].nStepUX;	// / lpnScanU[0]
		nPutStepEX = lpPutSS[0].nStepVX;	// / lpnScanV[0]
		if (lpPutCount[0]) {
			nPutLineSX = lpPutSS[0].nStartX;
			nPutLineEX = lpPutSS[0].nStartX;
		} else {
			nPutLineSX = lpPutSS[0].nStartX;
			nPutLineEX = lpPutSS[0].nStartX - lpPutSS[0].nStepVX;
		}
#ifdef _MSC_VER
		_asm {
			sal		nPutLineSX,20
			mov		edi,lpDstBase

			sal		nPutLineEX,20
			mov		esi,lpSrcBase
			////////////////////////////////
			or		lpnScanU[0*4],0
			jz		conv_skip5
			
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nPutStepSX,eax
conv_skip5:
			or		lpnScanV[0*4],0
			jz		conv_skip6
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nPutStepEX,eax
conv_skip6:
			or		lpPutCount[0*4],0
			jz		end_ly1
			//	ｙ方向ループ
loop_ly1:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX

			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX

			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			add		lpDstLineEnd,ecx

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX

			mov		nPutLineSX,ebx
			sub		ecx,edx

			and		ebx,0xfff00000
			mov		nPutLineEX,ecx

			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip1				// キャリーだと、正-負の計算に、キャリーを使用するので、
			js		line_skip1				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip1

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip1

			cmp		edi,lpDstEnd
			jnc		line_skip1

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start1

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start1:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip1
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip1
dst_clip1:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip2:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop1

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip1
			jmp		dst_clip2
line_loop1:
			// this loop changed by tia
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		line_skip2

			cmp		eax,nSrcSY
			jc		line_skip2
			
			cmp		ebx,nSrcEX
			jnc		line_skip2
			
			cmp		eax,nSrcEY
			jnc		line_skip2
			
			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX

			cmp		edx,ColKey
			jz		ckey_skip1

			mov		[edi],edx
ckey_skip1:	sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop1

			jmp		line_skip1
line_skip2:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			//	出力位置移動
			add		edi,4
			dec		ecx
			jnz		line_loop1
line_skip1:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[0]
			jnz		loop_ly1
end_ly1:
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			yane_st(nPutLineSX, yane_ld(nPutLineSX) << 20);
			edi = yane_ld(lpDstBase);
			yane_st(nPutLineEX, yane_ld(nPutLineEX) << 20);
			esi = yane_ld(lpSrcBase);
			t = yane_rd32((BYTE*)&lpnScanU + 0) | 0; yane_wr32((BYTE*)&lpnScanU + 0, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip5;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nPutStepSX, eax);
		conv_skip5:
			t = yane_rd32((BYTE*)&lpnScanV + 0) | 0; yane_wr32((BYTE*)&lpnScanV + 0, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip6;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nPutStepEX, eax);
		conv_skip6:
			t = yane_rd32((BYTE*)&lpPutCount + 0) | 0; yane_wr32((BYTE*)&lpPutCount + 0, t);
			yane_logic(t, f);
			if (f.zf) goto end_ly1;
		loop_ly1:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			yane_st(nPutLineSX, ebx);
			ecx -= edx;
			ebx &= 0xFFF00000;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip1;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip1;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip1;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip1;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start1;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start1:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip1;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip1;
		dst_clip1:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip2:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop1;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip1;
			goto dst_clip2;
		line_loop1:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto line_skip2;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto line_skip2;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto line_skip2;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto line_skip2;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			yane_cmp(edx, yane_ld(ColKey), f);
			if (f.zf) goto ckey_skip1;
			YANE_WR32(edi, edx);
		ckey_skip1:
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop1;
			goto line_skip1;
		line_skip2:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop1;
		line_skip1:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 0); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 0, t);
			if (!f.zf) goto loop_ly1;
		end_ly1:
			;
		}
#endif
		//	ｍ成分処理
		if (lpnScanU[1]) {
			nScanStepSX = lpScanSS[1].nStepUX; //  / lpnScanU[1]
			nScanStepSY = lpScanSS[1].nStepUY; //  / lpnScanU[1]
			nScanLineSX = lpScanSS[1].nStartX;
			nScanLineSY = lpScanSS[1].nStartY;
			nPutStepSX = lpPutSS[1].nStepUX;	// / lpnScanU[1]
		}
		if (lpnScanV[1]) {
			nScanStepEX = lpScanSS[1].nStepVX; //  / lpnScanV[1]
			nScanStepEY = lpScanSS[1].nStepVY; //  / lpnScanV[1]
			nScanLineEX = lpScanSS[1].nStartX;
			nScanLineEY = lpScanSS[1].nStartY;
			nPutStepEX = lpPutSS[1].nStepVX;	// / lpnScanV[1]
		}
#ifdef _MSC_VER
		_asm {
			or		lpnScanU[1*4],0
			jz		conv_skip1
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nPutStepSX,eax
conv_skip1:
			or		lpnScanV[1*4],0
			jz		conv_skip2
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nPutStepEX,eax
conv_skip2:
			or		lpPutCount[1*4],0
			jz		end_ly2
			//	ｙ方向ループ
loop_ly2:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX
			
			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX

			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			add		lpDstLineEnd,ecx

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX

			mov		nPutLineSX,ebx
			sub		ecx,edx

			and		ebx,0xfff00000
			mov		nPutLineEX,ecx

			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip3
			js		line_skip3				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip3

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip3

			cmp		edi,lpDstEnd
			jnc		line_skip3

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start2

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start2:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip3
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip3
dst_clip3:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip4:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop2

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip3
			jmp		dst_clip4
line_loop2:
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		line_skip4

			cmp		eax,nSrcSY
			jc		line_skip4
			
			cmp		ebx,nSrcEX
			jnc		line_skip4
			
			cmp		eax,nSrcEY
			jnc		line_skip4
			
			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX

			cmp		edx,ColKey
			jz		ckey_skip2

			mov		[edi],edx
ckey_skip2:	sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop2

			jmp		line_skip3
line_skip4:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			//	出力位置移動
			add		edi,4
			dec		ecx
			jnz		line_loop2
line_skip3:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[1 * 4]
			jnz		loop_ly2
end_ly2:
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			edi = yane_ld(lpDstBase);	// EDI carried over from the previous _asm block, which always leaves EDI == lpDstBase
			t = yane_rd32((BYTE*)&lpnScanU + 4) | 0; yane_wr32((BYTE*)&lpnScanU + 4, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip1;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nPutStepSX, eax);
		conv_skip1:
			t = yane_rd32((BYTE*)&lpnScanV + 4) | 0; yane_wr32((BYTE*)&lpnScanV + 4, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip2;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nPutStepEX, eax);
		conv_skip2:
			t = yane_rd32((BYTE*)&lpPutCount + 4) | 0; yane_wr32((BYTE*)&lpPutCount + 4, t);
			yane_logic(t, f);
			if (f.zf) goto end_ly2;
		loop_ly2:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			yane_st(nPutLineSX, ebx);
			ecx -= edx;
			ebx &= 0xFFF00000;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip3;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip3;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip3;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip3;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start2;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start2:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip3;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip3;
		dst_clip3:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip4:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop2;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip3;
			goto dst_clip4;
		line_loop2:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto line_skip4;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto line_skip4;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto line_skip4;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto line_skip4;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			yane_cmp(edx, yane_ld(ColKey), f);
			if (f.zf) goto ckey_skip2;
			YANE_WR32(edi, edx);
		ckey_skip2:
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop2;
			goto line_skip3;
		line_skip4:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop2;
		line_skip3:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 4); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 4, t);
			if (!f.zf) goto loop_ly2;
		end_ly2:
			;
		}
#endif
		//	ｍ成分処理
	if (lpPutCount[2]) {
		if (lpnScanU[2]) {
			nScanStepSX = lpScanSS[2].nStepUX; //  / lpnScanU[2]
			nScanStepSY = lpScanSS[2].nStepUY; //  / lpnScanU[2]
			nScanLineSX = lpScanSS[2].nStartX;
			nScanLineSY = lpScanSS[2].nStartY;
			nPutStepSX = lpPutSS[2].nStepUX;	// / lpnScanU[2]
		}
		if (lpnScanV[2]) {
			nScanStepEX = lpScanSS[2].nStepVX; //  / lpnScanV[2]
			nScanStepEY = lpScanSS[2].nStepVY; //  / lpnScanV[2]
			nScanLineEX = lpScanSS[2].nStartX;
			nScanLineEY = lpScanSS[2].nStartY;
			nPutStepEX = lpPutSS[2].nStepVX;	// / lpnScanV[2]
		}
#ifdef _MSC_VER
		_asm {
			or		lpnScanU[2*4],0
			jz		conv_skip3
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nPutStepSX,eax
conv_skip3:
			or		lpnScanV[2*4],0
			jz		conv_skip4
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nPutStepEX,eax
conv_skip4:
			//	ｙ方向ループ
loop_ly3:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX
			
			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX

			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			add		lpDstLineEnd,ecx

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX

			mov		nPutLineSX,ebx
			sub		ecx,edx

			and		ebx,0xfff00000
			mov		nPutLineEX,ecx

			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip5
			js		line_skip5				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip5

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip5

			cmp		edi,lpDstEnd
			jnc		line_skip5

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start3

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start3:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip5
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip5
dst_clip5:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip6:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop3

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip5
			jmp		dst_clip6
line_loop3:
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		line_skip6

			cmp		eax,nSrcSY
			jc		line_skip6
			
			cmp		ebx,nSrcEX
			jnc		line_skip6
			
			cmp		eax,nSrcEY
			jnc		line_skip6
			
			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX
			
			cmp		edx,ColKey
			jz		ckey_skip3

			mov		[edi],edx
ckey_skip3:	sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop3

			jmp		line_skip5
line_skip6:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			//	出力位置移動
			add		edi,4
			dec		ecx
			jnz		line_loop3
line_skip5:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[2 * 4]
			jnz		loop_ly3
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			edi = yane_ld(lpDstBase);	// EDI carried over from the previous _asm block, which always leaves EDI == lpDstBase
			t = yane_rd32((BYTE*)&lpnScanU + 8) | 0; yane_wr32((BYTE*)&lpnScanU + 8, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip3;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nPutStepSX, eax);
		conv_skip3:
			t = yane_rd32((BYTE*)&lpnScanV + 8) | 0; yane_wr32((BYTE*)&lpnScanV + 8, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip4;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nPutStepEX, eax);
		conv_skip4:
		loop_ly3:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			yane_st(nPutLineSX, ebx);
			ecx -= edx;
			ebx &= 0xFFF00000;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip5;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip5;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip5;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip5;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start3;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start3:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip5;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip5;
		dst_clip5:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip6:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop3;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip5;
			goto dst_clip6;
		line_loop3:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto line_skip6;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto line_skip6;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto line_skip6;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto line_skip6;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			yane_cmp(edx, yane_ld(ColKey), f);
			if (f.zf) goto ckey_skip3;
			YANE_WR32(edi, edx);
		ckey_skip3:
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop3;
			goto line_skip5;
		line_skip6:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop3;
		line_skip5:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 8); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 8, t);
			if (!f.zf) goto loop_ly3;
		}
#endif
	}
	return 0;
}


// @yo2 0x00441e70 vt
LRESULT CDIB32P5::MorphBltFast(CDIB32* lpDIB32, LPRECT lpSrcRect, LPPOINT lpDstPoint, LPRECT lpClip)
{
	if (lpSrcRect==NULL) {
		lpSrcRect = lpDIB32->GetRect();
	}
	//	ＲＥＣＴ－＞ＰＯＩＮＴ変換
	POINT	lpSrcPoint[4];
	lpSrcPoint[0].x = lpSrcRect->left;
	lpSrcPoint[0].y = lpSrcRect->top;
	lpSrcPoint[1].x = lpSrcRect->right;
	lpSrcPoint[1].y = lpSrcRect->top;
	lpSrcPoint[2].x = lpSrcRect->left;
	lpSrcPoint[2].y = lpSrcRect->bottom;
	lpSrcPoint[3].x = lpSrcRect->right;
	lpSrcPoint[3].y = lpSrcRect->bottom;
	return CDIB32P5::MorphBltFast(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, false);
}

// @yo2 0x00441f10 vt
LRESULT CDIB32P5::MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPRECT lpDstRect, LPRECT lpClip)
{
	//	ＲＥＣＴ－＞ＰＯＩＮＴ変換
	POINT	lpDstPoint[4];
	lpDstPoint[0].x = lpDstRect->left;
	lpDstPoint[0].y = lpDstRect->top;
	lpDstPoint[1].x = lpDstRect->right;
	lpDstPoint[1].y = lpDstRect->top;
	lpDstPoint[2].x = lpDstRect->left;
	lpDstPoint[2].y = lpDstRect->bottom;
	lpDstPoint[3].x = lpDstRect->right;
	lpDstPoint[3].y = lpDstRect->bottom;
	return CDIB32P5::MorphBltFast(lpDIB32, lpSrcPoint, lpDstPoint, lpClip, true);
}

// @yo2 0x00441f90 vt
LRESULT CDIB32P5::MorphBltFast(CDIB32* lpDIB32, LPPOINT lpSrcPoint, LPPOINT lpDstPoint, LPRECT lpClip, bool bContinual)
{
	WARNING(m_lpdwSrc == NULL,"CDIB32P5::MorphBltFastでm_lpdwSrc == NULL");
	{
	CDIB32Base* p = lpDIB32->GetDIB32BasePtr();
	WARNING(p == NULL || p->GetPtr() == NULL,"CDIB32P5::MorphBltFastでp->GetPtr() == NULL");
	}

	//	クリップ領域変換
	if (lpClip == NULL) {
		lpClip = &m_rcRect;
	}
	//	スキャン・出力用開始点とＵＶステップバッファ
	StartAndStep lpScanSS[3], lpPutSS[3];
	//	ｌｍｎ各成分におけるスキャン側(Sx,Sy)-(Ex,Ey)を割るための出力Ｙ長さ
	int	lpnScanU[3], lpnScanV[3];
	//	スキャンする４点の頂点連結バッファ
	static const Point	lpPointConnect[POINT_NUM][3] = {
		//	 A			  B			   C			D
		{ B, C, D }, { A, D, C }, { A, D, B }, { B, C, A }
	};
	//	出力四角形の頂点Ｙ方向ソート結果格納バッファ
	DstSort	lpDstSort[POINT_NUM];
	for (int i = A; i < POINT_NUM; i++) {
		lpDstSort[i].p = static_cast<Point> (i);
		lpDstSort[i].x = (lpDstPoint + i)->x;
		lpDstSort[i].y = (lpDstPoint + i)->y;
	}
	//	出力ポイントをＹ方向順にする。
	qsort(lpDstSort, POINT_NUM, sizeof(lpDstSort[0]), pointsort);
	//	出力するｌｍｎ成分ｙ方向カウンタバッファ
	int			lpPutCount[3];
	lpPutCount[0] = lpDstSort[1].y - lpDstSort[0].y;
	lpPutCount[1] = lpDstSort[2].y - lpDstSort[1].y;
	lpPutCount[2] = lpDstSort[3].y - lpDstSort[2].y;
	
	//	頂点出力データ読み出してセット
	lpPutSS[0].nStartX = lpDstSort[0].x;
	lpPutSS[0].nStartY = lpDstSort[0].y;
	//	頂点からのUV線求める
	Point	point0 = lpDstSort[0].p;
	Point	point1 = lpPointConnect[lpDstSort[0].p][0];
	Point	point2 = lpPointConnect[lpDstSort[0].p][1];
	int nVect = (((lpDstPoint + point2)->x - (lpDstPoint + point0)->x) *
				  ((lpDstPoint + point1)->y - (lpDstPoint + point0)->y)) -
				(((lpDstPoint + point2)->y - (lpDstPoint + point0)->y) *
				 ((lpDstPoint + point1)->x - (lpDstPoint + point0)->x));
	Point	pointU, pointV, pointExc;
	if (0 > nVect) {
		pointV = lpPointConnect[lpDstSort[0].p][0];
		pointU = lpPointConnect[lpDstSort[0].p][1];
	} else {
		pointU = lpPointConnect[lpDstSort[0].p][0];
		pointV = lpPointConnect[lpDstSort[0].p][1];
	}
	pointExc = lpPointConnect[lpDstSort[0].p][2];
	//	最初の頂点からのｌ処理値求めてセット
	lpnScanU[0] = (lpDstPoint + pointU)->y - lpDstSort[0].y;
	lpnScanV[0] = (lpDstPoint + pointV)->y - lpDstSort[0].y;
	lpPutSS[0].nStepUX = lpDstSort[0].x - (lpDstPoint + pointU)->x;
	lpPutSS[0].nStepVX = lpDstSort[0].x - (lpDstPoint + pointV)->x;
	lpScanSS[0].nStartX = (lpSrcPoint + lpDstSort[0].p)->x;
	lpScanSS[0].nStartY = (lpSrcPoint + lpDstSort[0].p)->y;
	lpScanSS[0].nStepUX = lpScanSS[0].nStartX - (lpSrcPoint + pointU)->x;
	lpScanSS[0].nStepUY = lpScanSS[0].nStartY - (lpSrcPoint + pointU)->y;
	lpScanSS[0].nStepVX = lpScanSS[0].nStartX - (lpSrcPoint + pointV)->x;
	lpScanSS[0].nStepVY = lpScanSS[0].nStartY - (lpSrcPoint + pointV)->y;
	if ((lpDstSort[1].p != pointU) && (lpDstSort[1].p != pointV))
		return 0;
	//	ｍ処理値求めてセット
	if (lpDstSort[1].p == pointU) {
		lpnScanU[1] = (lpDstPoint + pointExc)->y - lpDstSort[1].y;
		lpnScanV[1] = 0;
		lpPutSS[1].nStepUX = lpDstSort[1].x - (lpDstPoint + pointExc)->x;
		lpPutSS[1].nStepVX = 0;
		lpScanSS[1].nStartX = (lpSrcPoint + pointU)->x;
		lpScanSS[1].nStartY = (lpSrcPoint + pointU)->y;
		lpScanSS[1].nStepUX = lpScanSS[1].nStartX - (lpSrcPoint + pointExc)->x;
		lpScanSS[1].nStepUY = lpScanSS[1].nStartY - (lpSrcPoint + pointExc)->y;
		lpScanSS[1].nStepVX = 0;
		lpScanSS[1].nStepVY = 0;
		if (lpDstSort[2].p == pointV) {
			lpnScanU[2] = 0;
			lpnScanV[2] = (lpDstPoint + pointExc)->y - lpDstSort[2].y;
			lpPutSS[2].nStepUX = 0;
			lpPutSS[2].nStepVX = lpDstSort[2].x - (lpDstPoint + pointExc)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointV)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointV)->y;
			lpScanSS[2].nStepUX = 0;
			lpScanSS[2].nStepUY = 0;
			lpScanSS[2].nStepVX = lpScanSS[2].nStartX - (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStepVY = lpScanSS[2].nStartY - (lpSrcPoint + pointExc)->y;
		} else {
			lpnScanV[2] = 0;
			lpnScanU[2] = (lpDstPoint + pointV)->y - lpDstSort[2].y;
			lpPutSS[2].nStepVX = 0;
			lpPutSS[2].nStepUX = lpDstSort[2].x - (lpDstPoint + pointV)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointExc)->y;
			lpScanSS[2].nStepVX = 0;
			lpScanSS[2].nStepVY = 0;
			lpScanSS[2].nStepUX = lpScanSS[2].nStartX - (lpSrcPoint + pointV)->x;
			lpScanSS[2].nStepUY = lpScanSS[2].nStartY - (lpSrcPoint + pointV)->y;
		}
	} else {
		lpnScanU[1] = 0;
		lpnScanV[1] = (lpDstPoint + pointExc)->y - lpDstSort[1].y;
		lpPutSS[1].nStepUX = 0;
		lpPutSS[1].nStepVX = lpDstSort[1].x - (lpDstPoint + pointExc)->x;
		lpScanSS[1].nStartX = (lpSrcPoint + pointV)->x;
		lpScanSS[1].nStartY = (lpSrcPoint + pointV)->y;
		lpScanSS[1].nStepUX = 0;
		lpScanSS[1].nStepUY = 0;
		lpScanSS[1].nStepVX = lpScanSS[1].nStartX - (lpSrcPoint + pointExc)->x;
		lpScanSS[1].nStepVY = lpScanSS[1].nStartY - (lpSrcPoint + pointExc)->y;
		if (lpDstSort[2].p == pointU) {
			lpnScanV[2] = 0;
			lpnScanU[2] = (lpDstPoint + pointExc)->y - lpDstSort[2].y;
			lpPutSS[2].nStepVX = 0;
			lpPutSS[2].nStepUX = lpDstSort[2].x - (lpDstPoint + pointExc)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointU)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointU)->y;
			lpScanSS[2].nStepVX = 0;
			lpScanSS[2].nStepVY = 0;
			lpScanSS[2].nStepUX = lpScanSS[2].nStartX - (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStepUY = lpScanSS[2].nStartY - (lpSrcPoint + pointExc)->y;
		} else {
			lpnScanU[2] = 0;
			lpnScanV[2] = (lpDstPoint + pointU)->y - lpDstSort[2].y;
			lpPutSS[2].nStepUX = 0;
			lpPutSS[2].nStepVX = lpDstSort[2].x - (lpDstPoint + pointU)->x;
			lpScanSS[2].nStartX = (lpSrcPoint + pointExc)->x;
			lpScanSS[2].nStartY = (lpSrcPoint + pointExc)->y;
			lpScanSS[2].nStepUX = 0;
			lpScanSS[2].nStepUY = 0;
			lpScanSS[2].nStepVX = lpScanSS[2].nStartX - (lpSrcPoint + pointU)->x;
			lpScanSS[2].nStepVY = lpScanSS[2].nStartY - (lpSrcPoint + pointU)->y;
		}
	}
	//	スキャンライン中の（Ｓｘ，Ｓｙ）－（Ｅｘ，Ｅｙ）の位置と
	//	スキャンラインの変化ステップ
	int		nScanStepSX, nScanStepSY, nScanStepEX, nScanStepEY;
	int		nScanLineSX, nScanLineSY, nScanLineEX, nScanLineEY;
	int		nScanLineStepX, nScanLineStepY;
	//	出力ラインの（Ｓｘ，Ｙｎ）－（Ｅｘ，Ｙｎ）
	int		nPutStepSX, nPutStepEX;
	int		nPutLineSX, nPutLineEX;
	int		nPutLineLeng;
	//	出力バッファベースアドレス
	CDIB32Base*	p = lpDIB32->GetDIB32BasePtr();
	DWORD*		lpDstBase = (DWORD*)((BYTE*)m_lpdwSrc + (lpPutSS[0].nStartY * m_lPitch) - m_lPitch );	
	DWORD*		lpSrcBase = p->m_lpdwSrc;
	DWORD		lSrcPitch = p->m_lPitch;
	DWORD		lDstPitch = m_lPitch;
	DWORD**		lplpLineStart = p->m_lpdwLineStart;
	DWORD*		lpSrcEnd =	(DWORD*)((BYTE*)(p->m_lpdwSrc) + p->m_lPitch * m_rcRect.bottom);	
	//	スキャン・出力のクリッピング領域
	DWORD*		lpDstStart = (DWORD*)((BYTE*)m_lpdwSrc + (lpClip->top * m_lPitch));		
	DWORD*		lpDstEnd = (DWORD*)((BYTE*)m_lpdwSrc + (lpClip->bottom * m_lPitch));	
	DWORD*		lpDstLineStart = lpDstBase + lpClip->left;
	DWORD*		lpDstLineEnd = lpDstBase + lpClip->right;
	int			nSrcSX = p->m_rcRect.left;
	int			nSrcSY = p->m_rcRect.top;
	int			nSrcEX = p->m_rcRect.right;
	int			nSrcEY = p->m_rcRect.bottom;
	DWORD		nPutLineAdj = (bContinual ? 0 : 1 << 20);
	DWORD		SrcClip = 0;
	//	アセンブラでのバックアップワーク
	DWORD		nScanPointX, nScanPointY;
	//	ｌ成分処理
		nScanStepSX = lpScanSS[0].nStepUX; //  / lpnScanU[0]
		nScanStepSY = lpScanSS[0].nStepUY; //  / lpnScanU[0]
		nScanStepEX = lpScanSS[0].nStepVX; //  / lpnScanV[0]
		nScanStepEY = lpScanSS[0].nStepVY; //  / lpnScanV[0]
		nScanLineSX = lpScanSS[0].nStartX;
		nScanLineSY = lpScanSS[0].nStartY;
		nScanLineEX = lpScanSS[0].nStartX;
		nScanLineEY = lpScanSS[0].nStartY;
		nPutStepSX = lpPutSS[0].nStepUX;	// / lpnScanU[0]
		nPutStepEX = lpPutSS[0].nStepVX;	// / lpnScanV[0]
		if (lpPutCount[0]) {
			nPutLineSX = lpPutSS[0].nStartX;
			nPutLineEX = lpPutSS[0].nStartX;
		} else {
			nPutLineSX = lpPutSS[0].nStartX;
			nPutLineEX = lpPutSS[0].nStartX - lpPutSS[0].nStepVX;
		}
#ifdef _MSC_VER
		_asm {
			sal		nPutLineSX,20
			mov		edi,lpDstBase

			sal		nPutLineEX,20
			mov		esi,lpSrcBase
			////////////////////////////////
			or		lpnScanU[0*4],0
			jz		conv_skip5
			
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[0*4]
			mov		nPutStepSX,eax
conv_skip5:
			or		lpnScanV[0*4],0
			jz		conv_skip6
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[0*4]
			mov		nPutStepEX,eax
conv_skip6:
			or		lpPutCount[0*4],0
			jz		end_ly1
			//	ｙ方向ループ
loop_ly1:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX
			
			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			add		lpDstLineEnd,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX
			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			mov		nPutLineSX,ebx
			and		ebx,0xfff00000

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX
			sub		ecx,edx
			mov		nPutLineEX,ecx
			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip1				// キャリーだと、正-負の計算に、キャリーを使用するので、
			js		line_skip1				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip1

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip1

			cmp		edi,lpDstEnd
			jnc		line_skip1

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start1

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start1:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip1
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip1
dst_clip1:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip2:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop1

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip1
			jmp		dst_clip2
line_loop1:
			// this loop changed by tia
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		ckey_skip1

			cmp		eax,nSrcSY
			jc		ckey_skip1
			
			cmp		ebx,nSrcEX
			jnc		ckey_skip1
			
			cmp		eax,nSrcEY
			jnc		ckey_skip1

			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX

			mov		[edi],edx
			sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop1

			jmp		line_skip1
ckey_skip1:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			
			add		edi,4

			dec		ecx
			jnz		line_loop1
			jmp		line_skip1
/*	使ってないby Tia
line_skip2:	
			mov		edx,eax
			mov		esi,lplpLineStart

			sar		edx,20

			mov		esi,[esi+4*edx]
			mov		edx,ebx

			sar		edx,20

			mov		edx,[esi+4*edx]

			mov		[edi],edx
			add		edi,4

			dec		ecx
			jnz		line_skip2
*/
line_skip1:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[0]
			jnz		loop_ly1
end_ly1:
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			yane_st(nPutLineSX, yane_ld(nPutLineSX) << 20);
			edi = yane_ld(lpDstBase);
			yane_st(nPutLineEX, yane_ld(nPutLineEX) << 20);
			esi = yane_ld(lpSrcBase);
			t = yane_rd32((BYTE*)&lpnScanU + 0) | 0; yane_wr32((BYTE*)&lpnScanU + 0, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip5;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 0));
			yane_st(nPutStepSX, eax);
		conv_skip5:
			t = yane_rd32((BYTE*)&lpnScanV + 0) | 0; yane_wr32((BYTE*)&lpnScanV + 0, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip6;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 0));
			yane_st(nPutStepEX, eax);
		conv_skip6:
			t = yane_rd32((BYTE*)&lpPutCount + 0) | 0; yane_wr32((BYTE*)&lpPutCount + 0, t);
			yane_logic(t, f);
			if (f.zf) goto end_ly1;
		loop_ly1:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(nPutLineSX, ebx);
			ebx &= 0xFFF00000;
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			ecx -= edx;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip1;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip1;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip1;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip1;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start1;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start1:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip1;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip1;
		dst_clip1:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip2:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop1;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip1;
			goto dst_clip2;
		line_loop1:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto ckey_skip1;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto ckey_skip1;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto ckey_skip1;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto ckey_skip1;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			YANE_WR32(edi, edx);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop1;
			goto line_skip1;
		ckey_skip1:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop1;
			goto line_skip1;
		line_skip1:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 0); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 0, t);
			if (!f.zf) goto loop_ly1;
		end_ly1:
			;
		}
#endif


		//	ｍ成分処理
		if (lpnScanU[1]) {
			nScanStepSX = lpScanSS[1].nStepUX; //  / lpnScanU[1]
			nScanStepSY = lpScanSS[1].nStepUY; //  / lpnScanU[1]
			nScanLineSX = lpScanSS[1].nStartX;
			nScanLineSY = lpScanSS[1].nStartY;
			nPutStepSX = lpPutSS[1].nStepUX;	// / lpnScanU[1]
		}
		if (lpnScanV[1]) {
			nScanStepEX = lpScanSS[1].nStepVX; //  / lpnScanV[1]
			nScanStepEY = lpScanSS[1].nStepVY; //  / lpnScanV[1]
			nScanLineEX = lpScanSS[1].nStartX;
			nScanLineEY = lpScanSS[1].nStartY;
			nPutStepEX = lpPutSS[1].nStepVX;	// / lpnScanV[1]
		}
#ifdef _MSC_VER
		_asm {
			or		lpnScanU[1*4],0
			jz		conv_skip1
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[1*4]
			mov		nPutStepSX,eax
conv_skip1:
			or		lpnScanV[1*4],0
			jz		conv_skip2
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[1*4]
			mov		nPutStepEX,eax
conv_skip2:
			or		lpPutCount[1*4],0
			jz		end_ly2
			//	ｙ方向ループ
loop_ly2:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX
			
			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX

			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			add		lpDstLineEnd,ecx

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX

			mov		nPutLineSX,ebx
			sub		ecx,edx

			and		ebx,0xfff00000
			mov		nPutLineEX,ecx

			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip3
			js		line_skip3				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip3

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip3

			cmp		edi,lpDstEnd
			jnc		line_skip3

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start2

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start2:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip3
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip3
dst_clip3:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip4:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop2

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip3
			jmp		dst_clip4
line_loop2:
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		line_skip4

			cmp		eax,nSrcSY
			jc		line_skip4
			
			cmp		ebx,nSrcEX
			jnc		line_skip4
			
			cmp		eax,nSrcEY
			jnc		line_skip4
			
			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX

			mov		[edi],edx
			sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop2

			jmp		line_skip3
line_skip4:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			//	出力位置移動
			add		edi,4
			dec		ecx
			jnz		line_loop2
line_skip3:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[1 * 4]
			jnz		loop_ly2
end_ly2:
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			edi = yane_ld(lpDstBase);	// EDI carried over from the previous _asm block, which always leaves EDI == lpDstBase
			t = yane_rd32((BYTE*)&lpnScanU + 4) | 0; yane_wr32((BYTE*)&lpnScanU + 4, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip1;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 4));
			yane_st(nPutStepSX, eax);
		conv_skip1:
			t = yane_rd32((BYTE*)&lpnScanV + 4) | 0; yane_wr32((BYTE*)&lpnScanV + 4, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip2;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 4));
			yane_st(nPutStepEX, eax);
		conv_skip2:
			t = yane_rd32((BYTE*)&lpPutCount + 4) | 0; yane_wr32((BYTE*)&lpPutCount + 4, t);
			yane_logic(t, f);
			if (f.zf) goto end_ly2;
		loop_ly2:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			yane_st(nPutLineSX, ebx);
			ecx -= edx;
			ebx &= 0xFFF00000;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip3;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip3;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip3;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip3;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start2;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start2:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip3;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip3;
		dst_clip3:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip4:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop2;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip3;
			goto dst_clip4;
		line_loop2:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto line_skip4;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto line_skip4;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto line_skip4;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto line_skip4;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			YANE_WR32(edi, edx);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop2;
			goto line_skip3;
		line_skip4:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop2;
		line_skip3:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 4); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 4, t);
			if (!f.zf) goto loop_ly2;
		end_ly2:
			;
		}
#endif

		
		//	ｍ成分処理
	if (lpPutCount[2]) {
		if (lpnScanU[2]) {
			nScanStepSX = lpScanSS[2].nStepUX; //  / lpnScanU[2]
			nScanStepSY = lpScanSS[2].nStepUY; //  / lpnScanU[2]
			nScanLineSX = lpScanSS[2].nStartX;
			nScanLineSY = lpScanSS[2].nStartY;
			nPutStepSX = lpPutSS[2].nStepUX;	// / lpnScanU[2]
		}
		if (lpnScanV[2]) {
			nScanStepEX = lpScanSS[2].nStepVX; //  / lpnScanV[2]
			nScanStepEY = lpScanSS[2].nStepVY; //  / lpnScanV[2]
			nScanLineEX = lpScanSS[2].nStartX;
			nScanLineEY = lpScanSS[2].nStartY;
			nPutStepEX = lpPutSS[2].nStepVX;	// / lpnScanV[2]
		}
#ifdef _MSC_VER
		_asm {
			or		lpnScanU[2*4],0
			jz		conv_skip3
			//	データの固定小数変換
			mov		eax, nScanStepSX
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nScanStepSX, eax
			///////////////////////////////
			mov		eax, nScanStepSY
			mov		edx, eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nScanStepSY, eax
			//////////////////////////////
			sal		nScanLineSX,20
			sal		nScanLineSY,20
			/////////////////////////////
			mov		eax,nPutStepSX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanU[2*4]
			mov		nPutStepSX,eax
conv_skip3:
			or		lpnScanV[2*4],0
			jz		conv_skip4
			///////////////////////////////
			mov		eax,nScanStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nScanStepEX, eax
			///////////////////////////////
			mov		eax,nScanStepEY
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nScanStepEY,eax
			//////////////////////////////
			sal		nScanLineEX,20
			sal		nScanLineEY,20
			////////////////////////////
			mov		eax,nPutStepEX
			mov		edx,eax
			sar		edx,31
			sal		eax,20
			idiv	lpnScanV[2*4]
			mov		nPutStepEX,eax
conv_skip4:
			//	ｙ方向ループ
loop_ly3:
			//	スキャン開始終了位置更新
			mov		eax,nScanStepSX
			mov		ebx,nScanLineSX

			mov		edx,nScanStepSY
			sub		ebx,eax

			mov		ecx,nScanLineSY
			mov		nScanLineSX,ebx

			sub		ecx,edx
			mov		eax,nScanStepEX
			
			mov		nScanLineSY,ecx
			mov		ebx,nScanLineEX
			
			sub		ebx,eax
			mov		ecx,nScanLineEY
			
			mov		edx,nScanStepEY
			sub		ecx,edx
			
			mov		nScanLineEX,ebx
			mov		nScanLineEY,ecx
			
			//	出力ベースライン更新＆出力ライン更新
			add		edi,lDstPitch
			mov		ecx,lDstPitch

			mov		lpDstBase,edi
			add		lpDstLineStart,ecx

			mov		eax,nPutStepSX
			mov		ebx,nPutLineSX

			sub		ebx,eax				//	EDI + (EBX >> 20) << 4が書き込み開始位置
			add		lpDstLineEnd,ecx

			mov		edx,nPutStepEX
			mov		ecx,nPutLineEX

			mov		nPutLineSX,ebx
			sub		ecx,edx

			and		ebx,0xfff00000
			mov		nPutLineEX,ecx

			and		ecx,0xfff00000

			sub		ecx,ebx				//	ECXにスキャンライン長(12:20)

			mov		nPutLineLeng, ecx
//			jc		line_skip5
			js		line_skip5				// 符号を見て飛ぶようにに変更した '00.10.3.

			sar		ecx,20

			jz		line_skip5

			cmp		edi,lpDstStart		//	出力ライン範囲チェック
			jc		line_skip5

			cmp		edi,lpDstEnd
			jnc		line_skip5

			sar		ebx,20-2

			add		edi,ebx				//	edi＜－出力開始アドレス
			//	スキャンライン移動比率を求める
			cmp		ecx,1
			jbe		dclip_start3

			mov		eax, nPutLineAdj

			sub		nPutLineLeng,eax
			mov		eax,nScanLineSX

			mov		ebx,nScanLineEX

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20
	
			sar		edx,12

			idiv	nPutLineLeng

			mov		nScanLineStepX,eax
			
			mov		eax,nScanLineSY
			mov		ebx,nScanLineEY

			sub		eax,ebx

			mov		edx,eax

			sal		eax,20

			sar		edx,12

			idiv	nPutLineLeng
			mov		nScanLineStepY,eax
dclip_start3:										//	出力の右クリッピング
			lea		ebx,[edi+ecx*4]					//	bx <- 出力終了アドレス
			sub		ebx,lpDstLineEnd
			jbe		dst_clip5
			sar		ebx,2
			sub		ecx,ebx
			jbe		line_skip5
dst_clip5:
			//	スキャン開始位置取り出し	
			mov		ebx,nScanLineSX
			mov		eax,nScanLineSY
dst_clip6:											//	出力の左クリッピング
			cmp		edi,lpDstLineStart
			jnc		line_loop3

			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY

			add		edi,4
			dec		ecx
			jz		line_skip5
			jmp		dst_clip6
line_loop3:
			mov		nScanPointX,ebx
			mov		nScanPointY,eax

			sar		eax,20
			mov		esi,lplpLineStart

			sar		ebx,20

			cmp		ebx,nSrcSX
			jc		line_skip6

			cmp		eax,nSrcSY
			jc		line_skip6
			
			cmp		ebx,nSrcEX
			jnc		line_skip6
			
			cmp		eax,nSrcEY
			jnc		line_skip6
			
			mov		esi,[esi+4*eax]
			mov		eax,nScanPointY

			mov		edx,[esi+4*ebx]
			mov		ebx,nScanPointX

			mov		[edi],edx
			sub		ebx,nScanLineStepX

			sub		eax,nScanLineStepY
			add		edi,4

			dec		ecx
			jnz		line_loop3

			jmp		line_skip5
line_skip6:	mov		eax,nScanPointY
			mov		ebx,nScanPointX
			//	スキャン位置移動
			sub		ebx,nScanLineStepX
			sub		eax,nScanLineStepY
			//	出力位置移動
			add		edi,4
			dec		ecx
			jnz		line_loop3
line_skip5:
			mov		edi,lpDstBase
			//	ラインカウンタデクリメント
			dec		lpPutCount[2 * 4]
			jnz		loop_ly3
		}
#else
		// [portable] C equivalent of the asm above (not in yo2.exe)
		{
			DWORD eax, ebx, ecx, edx, esi, edi;
			DWORD t;
			yane_fl f;
			edi = yane_ld(lpDstBase);	// EDI carried over from the previous _asm block, which always leaves EDI == lpDstBase
			t = yane_rd32((BYTE*)&lpnScanU + 8) | 0; yane_wr32((BYTE*)&lpnScanU + 8, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip3;
			eax = yane_ld(nScanStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nScanStepSX, eax);
			eax = yane_ld(nScanStepSY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nScanStepSY, eax);
			yane_st(nScanLineSX, yane_ld(nScanLineSX) << 20);
			yane_st(nScanLineSY, yane_ld(nScanLineSY) << 20);
			eax = yane_ld(nPutStepSX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanU + 8));
			yane_st(nPutStepSX, eax);
		conv_skip3:
			t = yane_rd32((BYTE*)&lpnScanV + 8) | 0; yane_wr32((BYTE*)&lpnScanV + 8, t);
			yane_logic(t, f);
			if (f.zf) goto conv_skip4;
			eax = yane_ld(nScanStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nScanStepEX, eax);
			eax = yane_ld(nScanStepEY);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nScanStepEY, eax);
			yane_st(nScanLineEX, yane_ld(nScanLineEX) << 20);
			yane_st(nScanLineEY, yane_ld(nScanLineEY) << 20);
			eax = yane_ld(nPutStepEX);
			edx = eax;
			edx = yane_sarv(edx, 31);
			eax <<= 20;
			yane_idiv(eax, edx, yane_rd32((BYTE*)&lpnScanV + 8));
			yane_st(nPutStepEX, eax);
		conv_skip4:
		loop_ly3:
			eax = yane_ld(nScanStepSX);
			ebx = yane_ld(nScanLineSX);
			edx = yane_ld(nScanStepSY);
			ebx -= eax;
			ecx = yane_ld(nScanLineSY);
			yane_st(nScanLineSX, ebx);
			ecx -= edx;
			eax = yane_ld(nScanStepEX);
			yane_st(nScanLineSY, ecx);
			ebx = yane_ld(nScanLineEX);
			ebx -= eax;
			ecx = yane_ld(nScanLineEY);
			edx = yane_ld(nScanStepEY);
			ecx -= edx;
			yane_st(nScanLineEX, ebx);
			yane_st(nScanLineEY, ecx);
			edi += yane_ld(lDstPitch);
			ecx = yane_ld(lDstPitch);
			yane_st(lpDstBase, edi);
			yane_st(lpDstLineStart, yane_ld(lpDstLineStart) + ecx);
			eax = yane_ld(nPutStepSX);
			ebx = yane_ld(nPutLineSX);
			ebx -= eax;
			yane_st(lpDstLineEnd, yane_ld(lpDstLineEnd) + ecx);
			edx = yane_ld(nPutStepEX);
			ecx = yane_ld(nPutLineEX);
			yane_st(nPutLineSX, ebx);
			ecx -= edx;
			ebx &= 0xFFF00000;
			yane_st(nPutLineEX, ecx);
			ecx &= 0xFFF00000;
			yane_sub(ecx, ebx, f);
			yane_st(nPutLineLeng, ecx);
			if (f.sf) goto line_skip5;
			yane_sar(ecx, 20, f);
			if (f.zf) goto line_skip5;
			yane_cmp(edi, yane_ld(lpDstStart), f);
			if (f.cf) goto line_skip5;
			yane_cmp(edi, yane_ld(lpDstEnd), f);
			if (!f.cf) goto line_skip5;
			ebx = yane_sarv(ebx, 18);
			edi += ebx;
			yane_cmp(ecx, 1, f);
			if ((f.cf || f.zf)) goto dclip_start3;
			eax = yane_ld(nPutLineAdj);
			yane_st(nPutLineLeng, yane_ld(nPutLineLeng) - eax);
			eax = yane_ld(nScanLineSX);
			ebx = yane_ld(nScanLineEX);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepX, eax);
			eax = yane_ld(nScanLineSY);
			ebx = yane_ld(nScanLineEY);
			eax -= ebx;
			edx = eax;
			eax <<= 20;
			edx = yane_sarv(edx, 12);
			yane_idiv(eax, edx, yane_ld(nPutLineLeng));
			yane_st(nScanLineStepY, eax);
		dclip_start3:
			ebx = edi + ecx*4;
			yane_sub(ebx, yane_ld(lpDstLineEnd), f);
			if ((f.cf || f.zf)) goto dst_clip5;
			ebx = yane_sarv(ebx, 2);
			yane_sub(ecx, ebx, f);
			if ((f.cf || f.zf)) goto line_skip5;
		dst_clip5:
			ebx = yane_ld(nScanLineSX);
			eax = yane_ld(nScanLineSY);
		dst_clip6:
			yane_cmp(edi, yane_ld(lpDstLineStart), f);
			if (!f.cf) goto line_loop3;
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (f.zf) goto line_skip5;
			goto dst_clip6;
		line_loop3:
			yane_st(nScanPointX, ebx);
			yane_st(nScanPointY, eax);
			eax = yane_sarv(eax, 20);
			esi = yane_ld(lplpLineStart);
			ebx = yane_sarv(ebx, 20);
			yane_cmp(ebx, yane_ld(nSrcSX), f);
			if (f.cf) goto line_skip6;
			yane_cmp(eax, yane_ld(nSrcSY), f);
			if (f.cf) goto line_skip6;
			yane_cmp(ebx, yane_ld(nSrcEX), f);
			if (!f.cf) goto line_skip6;
			yane_cmp(eax, yane_ld(nSrcEY), f);
			if (!f.cf) goto line_skip6;
			esi = YANE_RD32(esi + eax*4);
			eax = yane_ld(nScanPointY);
			edx = YANE_RD32(esi + ebx*4);
			ebx = yane_ld(nScanPointX);
			YANE_WR32(edi, edx);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop3;
			goto line_skip5;
		line_skip6:
			eax = yane_ld(nScanPointY);
			ebx = yane_ld(nScanPointX);
			ebx -= yane_ld(nScanLineStepX);
			eax -= yane_ld(nScanLineStepY);
			edi += 4;
			yane_dec(ecx, f);
			if (!f.zf) goto line_loop3;
		line_skip5:
			edi = yane_ld(lpDstBase);
			t = yane_rd32((BYTE*)&lpPutCount + 8); yane_dec(t, f); yane_wr32((BYTE*)&lpPutCount + 8, t);
			if (!f.zf) goto loop_ly3;
		}
#endif
	}
	return 0;
}

////////////////////////////////////////////////////////////////////
//	RotateBlt

// @yo2 0x00442e10 vt
LRESULT CDIB32P5::RotateBlt(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType,LPRECT lpClip){
	int sx,sy;	//	転送元サイズ
	if (lpSrcRect==NULL) {
		lpDIB32->GetSize(sx,sy);
	} else {
		sx = lpSrcRect->right - lpSrcRect->left;
		sy = lpSrcRect->bottom - lpSrcRect->top;
	}
	int dx,dy;	//	転送先サイズ
	dx = ::MulDiv(sx,nRate,1<<16);
	dy = ::MulDiv(sy,nRate,1<<16);
	int px,py;	//	回転中心
	switch (nType){
	case 0: px = 0;		py = 0;		break;	//	左上
	case 1: px = dx;	py = 0;		break;	//	右上
	case 2: px = 0;		py = dy;	break;	//	左下
	case 3: px = dx;	py = dy;	break;	//	右上
	case 4: px = dx>>1; py = dy>>1;	break;	//	画像中心
	}
	px+=x; py+=y;
	POINT point[4];
	point[0].x = x;		point [0].y = y;
	point[1].x = x+dx;	point [1].y = y;
	point[2].x = x;		point [2].y = y+dy;
	point[3].x = x+dx;	point [3].y = y+dy;
	static CSinTable st;
	nAngle = -nAngle;	//	y軸は下にとるので回転方向は逆になる
	for(int i=0;i<4;++i){
		//	(px,py)中心の回転なので、(px,py)を原点に平行移動させて、原点中心に回転させたあと、(px,py)だけ平行移動
		int ax = point[i].x-px , ay = point[i].y-py;
		point[i].x	=  ((ax * st.Cos(nAngle) - ay * st.Sin(nAngle))>>16)+px;
		point[i].y	=  ((ax * st.Sin(nAngle) + ay * st.Cos(nAngle))>>16)+py;
	}
	return MorphBlt(lpDIB32,lpSrcRect,&point[0],lpClip);
}

// @yo2 0x00443060 vt
LRESULT CDIB32P5::RotateBltFast(CDIB32* lpDIB32,LPRECT lpSrcRect,int x,int y,int nAngle,int nRate,int nType,LPRECT lpClip){
	int sx,sy;	//	転送元サイズ
	if (lpSrcRect==NULL) {
		lpDIB32->GetSize(sx,sy);
	} else {
		sx = lpSrcRect->right - lpSrcRect->left;
		sy = lpSrcRect->bottom - lpSrcRect->top;
	}
	int dx,dy;	//	転送先サイズ
	dx = ::MulDiv(sx,nRate,1<<16);
	dy = ::MulDiv(sy,nRate,1<<16);
	int px,py;	//	回転中心
	switch (nType){
	case 0: px = 0;		py = 0;		break;	//	左上
	case 1: px = dx;	py = 0;		break;	//	右上
	case 2: px = 0;		py = dy;	break;	//	左下
	case 3: px = dx;	py = dy;	break;	//	右上
	case 4: px = dx>>1; py = dy>>1;	break;	//	画像中心
	}
	px+=x; py+=y;
	POINT point[4];
	point[0].x = x;		point [0].y = y;
	point[1].x = x+dx;	point [1].y = y;
	point[2].x = x;		point [2].y = y+dy;
	point[3].x = x+dx;	point [3].y = y+dy;
	static CSinTable st;
	nAngle = -nAngle;	//	y軸は下にとるので回転方向は逆になる
	for(int i=0;i<4;++i){
		//	(px,py)中心の回転なので、(px,py)を原点に平行移動させて、原点中心に回転させたあと、(px,py)だけ平行移動
		int ax = point[i].x-px , ay = point[i].y-py;
		point[i].x	=  ((ax * st.Cos(nAngle) - ay * st.Sin(nAngle))>>16)+px;
		point[i].y	=  ((ax * st.Sin(nAngle) + ay * st.Cos(nAngle))>>16)+py;
	}
	return MorphBltFast(lpDIB32,lpSrcRect,&point[0],lpClip);
}

#endif
