//
//	CDIB32 Effect and its functor
//		programmed by yaneurao(M.Isozaki) '00/01/16
//

#ifdef USE_DIB32

#ifndef __yaneDIB32Effect_h__
#define __yaneDIB32Effect_h__

#include "yaneDIB32.h"

//////////////////////////////////////////////////////////////////////////////
//	Effectのためのfunctor
//////////////////////////////////////////////////////////////////////////////

//	コピーするだけのfunctor
class CDIB32CpySrcToDst {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = src;
	}
};
//	RGBを反転させるfunctor
class CDIB32Flush {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = src ^ 0xffffff;	//	下位24ビットxorをかける
	}
};

//	青をAlphaに持って行くためのfunctor
class CDIB32BlueToAlpha {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = (src & 0xffffff) + ((src & 0xff)<<24);
	}
};
//	緑をAlphaに持って行くためのfunctor
class CDIB32GreenToAlpha {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = (src & 0xffffff) + ((src & 0xff00)<<16);
	}
};
//	赤をAlphaに持って行くためのfunctor
class CDIB32RedToAlpha {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = (src & 0xffffff) + ((src & 0xff0000)<<8);
	}
};
//	明るさをAlphaに持って行くためのfunctor
//		これにより、いわゆるstencil luminanceが実現できる
class CDIB32BrightnessToAlpha {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD r,g,b,a;
		r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		a = (r + b + g) / 3;
		//	↑あまり正確ではない
		dst = (src & 0xffffff) + (a<<24);
	}
};
//	正確な明るさをAlphaに持って行くためのfunctor
class CDIB32StrictBrightnessToAlpha {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD r,g,b,a;
		r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		//	alpha = r*0.3 + g*0.59 + b*.11
		//		  == (r*77 + g*151 + b*28)>>8
		a = (r*77 + b*151 + g*28) & 0xff00;
		dst = (src & 0xffffff) + (a<<16);
	}
};
//	gray scaleに持って行くためのfunctor
class CDIB32BrightnessToRGB {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD r,g,b,a;
		r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		a = (r + b + g) / 3;
		//	↑あまり正確ではない
		dst = a + (a<<8) + (a<<16);
	}
};
//	正確な明るさを計算しgray scaleに持って行くためのfunctor
class CDIB32StrictBrightnessToRGB {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD r,g,b,a;
		r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		//	alpha = r*0.3 + g*0.59 + b*.11
		//		  == (r*77 + g*151 + b*28)>>8
		a = ((r*77 + b*151 + g*28) & 0xff00)>>8;
		dst = a + (a<<8) + (a<<16);
	}
};

//	青からgray scaleに持って行くためのfunctor
class CDIB32BlueToRGB {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD b;
	//	r = (src & 0xff0000) >> 16;
	//	g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		dst = b + (b<<8) + (b<<16);
	}
};
//	緑からgray scaleに持って行くためのfunctor
class CDIB32GreenToRGB {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD g;
	//	r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
	//	b = (src & 0x0000ff);
		dst = g + (g<<8) + (g<<16);
	}
};
//	赤からgray scaleに持って行くためのfunctor
class CDIB32RedToRGB {
public:
	inline void operator ()(DWORD& dst,DWORD& src) const {
		int r;
		r = (src & 0xff0000) >> 16;
	//	g = (src & 0x00ff00) >> 8;
	//	b = (src & 0x0000ff);
		dst = r + (r<<8) + (r<<16);
	}
};
//	α値を特定の値にするfunctor
class CDIB32SetAlpha {
public:
	CDIB32SetAlpha(int nAlpha) : m_nAlpha(nAlpha) {}
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = (src & 0xffffff) + (((DWORD)m_nAlpha)<<24);
	}
private:
	int		m_nAlpha;
};
//	RGBAを特定の値にするfunctor
class CDIB32SetRGBA {
public:
	CDIB32SetRGBA(DWORD dwRGBA) : m_dwRGBA(dwRGBA) {}
	inline void operator ()(DWORD& dst,DWORD& src) const {
		dst = m_dwRGBA;	//	Srcは関係ねー＾＾；
	}
private:
	DWORD		m_dwRGBA;
};

//	セピア調にするfunctor
class CDIB32Sepia {
public:
	CDIB32Sepia(int nLevel,DWORD dwRGB) {
	//	0<nLevel<=256		 ←　これを0から256にトランジットする。
	//	dwRGBの色に近づける　←　これをセピア色に設定する。
	//	そうすれば、徐々にセピア色になる
		m_nLevel = nLevel;
		m_nR = (dwRGB & 0xff0000) >> 16;
		m_nG = (dwRGB & 0x00ff00) >> 8;
		m_nB = (dwRGB & 0x0000ff);
	}
	inline void operator ()(DWORD& dst,DWORD& src) const {
		DWORD r,g,b,a;
		r = (src & 0xff0000) >> 16;
		g = (src & 0x00ff00) >> 8;
		b = (src & 0x0000ff);
		a = (r + b + g) / 3;
		//	↑あまり正確ではない
		//	この明るさ×dwRGBを、もとの色とをnLevel : 256-nLevelでブレンドする
		// a * m_dwRGB * nLevel + (r,g,b) * (256-nLevel)

		DWORD nL  = a * m_nLevel >> 8;
//		DWORD nL2 = a * (256-m_nLevel) >> 8;
		DWORD nL2 = 256-m_nLevel; // こっちが正しい＾＾；
		DWORD r2,g2,b2;
		r2 = (m_nR * nL + r * nL2)>>8;
		g2 = (m_nG * nL + g * nL2)>>8;
		b2 = (m_nB * nL + b * nL2)>>8;
		//	これで合成する
		dst = (r2 << 16) + (g2 << 8) + b2;
	}
private:
	int			m_nR,m_nG,m_nB;
	int			m_nLevel;
};

//	抜き色でなければ、最上位をffにするfunctor
class CDIB32MaskMSB {
public:
	CDIB32MaskMSB(DWORD dwColorKey){
		m_dwColorKey = dwColorKey;
	}
	inline void operator ()(DWORD& dst,DWORD& src) const {
		if ((src & 0xffffff) !=	 m_dwColorKey) {
			dst = (src & 0xffffff) | 0xff000000;
		}
	}
protected:
	DWORD	m_dwColorKey;
};

//////////////////////////////////////////////////////////////////////////////

class CDIB32Effect {
public:
	//	メンバ関数テンプレートサポートしてんねやろな…

	//	---- そのプレーンに対するEffectをかける関数
	// @yo2 0x0057d740 template Effect
	template <class EffectFunctor>
	static LRESULT Effect(CDIB32*lpSrcDIB,EffectFunctor f,LPRECT lpRect=NULL){
		WARNING(lpSrcDIB->GetPtr() == NULL,"CDIB32Effect::EffectでlpDIB->GetPtr() == NULL");
		RECT r = lpSrcDIB->GetClipRect(lpRect);
		LONG lPitch	 = lpSrcDIB->GetRect()->right;
		DWORD* pSurface = lpSrcDIB->GetPtr();

		//	'01/10/05	やねうらお改造
		//	8ループ展開
		int nLoop8 = (r.right - r.left);
		//	8ループ余り
		int nLoop8mod = nLoop8 & 7;
		nLoop8 >>= 3;

		for(int y=r.top;y<r.bottom;y++){
			DWORD *p = pSurface + y*lPitch + r.left;

			//　一回の転送ごとに、ループのエンドチェックが必要だとしたら、割に合わない
			int n;	// [portable] MSVC6 for-scope: n is used after the loop
			for(n=0;n<nLoop8;n++){
				//	転送元から転送先へ、この関数エフェクトをかけながら転送
				f(p[0],p[0]);
				f(p[1],p[1]);
				f(p[2],p[2]);
				f(p[3],p[3]);
				f(p[4],p[4]);
				f(p[5],p[5]);
				f(p[6],p[6]);
				f(p[7],p[7]);
				p+=8;
			}
			//	余剰分を、転送
			for (n=0;n<nLoop8mod;n++){
				f(p[n],p[n]);
				p++;
			}
		}
		return 0;
	}

	//	---- 抜き色に対してfunctorを適用する
	template <class EffectFunctor>
	static void EffectColorKey(CDIB32*lpSrcDIB,EffectFunctor f){
		DWORD dw = lpSrcDIB->GetColorKey();
		f(dw,dw);
		lpSrcDIB->SetColorKey(dw);
	}

	//	---- 転送のときになんやかやする関数
	template <class BltFunctor>
	static LRESULT Blt(CDIB32*lpDstDIB,CDIB32*lpSrcDIB,BltFunctor f,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){
		if ( lpDstDIB == NULL ) return 1;
		if ( lpSrcDIB == NULL ) return 1;
		CDIB32Base* srcp = lpSrcDIB->GetDIB32BasePtr();
		WARNING( srcp == NULL || srcp->GetPtr() == NULL,"CDIB32Effect::Bltでsrcp->GetPtr() == NULL");
		CDIB32Base* dstp = lpDstDIB->GetDIB32BasePtr();
		WARNING( dstp == NULL || dstp->GetPtr() == NULL,"CDIB32Effect::Bltでdstp->GetPtr() == NULL");
		// クリッピング等の処理
		// 転送範囲なしの時は、このまま帰る
		CDIB32EffectClipper clip;

/*
		//	DstSize⇒Rectに変換しとこか...(yane)
		LPRECT lpDstRect;
		RECT rcDstRct;
		if (lpDstSize==NULL) {
			lpDstRect = NULL;
		} else {
			lpDstRect = &rcDstRct;
			::SetRect(&rcDstRct,0,0,lpDstSize->cx,lpDstSize->cy);
		}
*/

		if ( Clipping( lpDstDIB , lpSrcDIB, x, y, &clip,lpSrcRect, lpDstSize, lpClipRect ) != 0 ) return 1;
		
		RECT rcSrcRect = clip.rcSrcRect;
		RECT rcDstRect = clip.rcDstRect;
//		RECT rcClipRect = clip.rcClipRect;
		
		// 転送先の横幅と縦幅の設定
		int		nWidth = rcDstRect.right - rcDstRect.left;
		int		nHeight = rcDstRect.bottom - rcDstRect.top;
		int		nSrcWidth = rcSrcRect.right - rcSrcRect.left;
		DWORD	lPitchSrc = srcp->m_lPitch;
		DWORD	lPitchDst = dstp->m_lPitch;
		DWORD	nAddSrcWidth = srcp->m_lPitch - (nSrcWidth <<2);	// クリッピングして飛ばす分の算出
		DWORD	nAddDstWidth = dstp->m_lPitch - (nWidth<<2);									// ASMで使用する 1ラインのバイト数の設定
		DWORD*	lpSrc = (DWORD*)((BYTE*)srcp->m_lpdwSrc +(rcSrcRect.left<<2)+rcSrcRect.top*srcp->m_lPitch );		// クリッピング部分のカット
		DWORD*	lpDst = (DWORD*)((BYTE*)dstp->m_lpdwSrc +(rcDstRect.left<<2)+rcDstRect.top*dstp->m_lPitch );		// 指定されたx,yの位置調整
		
		if ( clip.bActualSize ){
			//等倍

			//	'01/10/05	やねうらお改造
			//	8ループ展開
			int nLoop8 = /*(rcClipRect.right - rcClipRect.left)*/ nWidth;
			//	8ループ余り
			int nLoop8mod = nLoop8 & 7;
			nLoop8 >>= 3;

			for(int y=0;y<nHeight;y++){
//			for(int y=rcClipRect.top;y<rcClipRect.bottom;y++){
/*
				for(int x=rcClipRect.left; x < rcClipRect.right; x++){
					//	転送元から転送先へ、この関数エフェクトをかけながら転送
					f(*lpDst,*lpSrc);	//	functor is greatest..
					lpDst++;lpSrc++;
				}
*/
				for(int n=0;n<nLoop8;n++){
					//	転送元から転送先へ、この関数エフェクトをかけながら転送
					f(lpDst[0],lpSrc[0]);
					f(lpDst[1],lpSrc[1]);
					f(lpDst[2],lpSrc[2]);
					f(lpDst[3],lpSrc[3]);
					f(lpDst[4],lpSrc[4]);
					f(lpDst[5],lpSrc[5]);
					f(lpDst[6],lpSrc[6]);
					f(lpDst[7],lpSrc[7]);
					lpDst+=8; lpSrc+=8;
				}
				//	余剰分を、転送
				for (n=0;n<nLoop8mod;n++){
					f(lpDst[n],lpSrc[n]);
				}
				//	ループの外でインクリメントしたほうが、速い！
				lpDst+=nLoop8mod; lpSrc+=nLoop8mod;

				lpDst = (DWORD*) ( (LPBYTE)lpDst+nAddDstWidth);
				lpSrc = (DWORD*) ( (LPBYTE)lpSrc+nAddSrcWidth);
			}
		}else{
			// 非等倍
			int		nInitialX = clip.nInitialX ;	//	-DX　 :　εの初期値 = -DX
			int		nStepX = clip.nStepX;		//	 2*SX :　ε+=2*SX
			int		nCmpX = clip.nCmpX;		//	 2*DX :　ε>0ならばε-=2*DXしてね
			int		nStepsX = clip.nStepsX;	//	 SrcXの一回の加算量(整数部)
			int		nInitialY = clip.nInitialY;
			int		nStepY = clip.nStepY;
			int		nCmpY = clip.nCmpY;
			int		nStepsY = clip.nStepsY;
			DWORD	AddSrcPixel = 4 * nStepsX;
			DWORD	AddWidthSrc = srcp->m_lPitch * nStepsY;
			DWORD	nAddPixel = 1 << 2;
			DWORD	nAddSrcHeight= lPitchSrc * nStepsY;						// y軸の整数部で加算される値
			DWORD	nAddDstWidth = lPitchDst - (nWidth<<2);					// ASMで使用する 1ラインのバイト数の設定
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
					f(*lpDst,*lpSrc);
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
		}
		
		return 0;
	}

protected:
	class CDIB32EffectClipper {
	public:
		bool	bActualSize;
		RECT	rcSrcRect;
		RECT	rcDstRect;
		RECT	rcClipRect;
		// Bresenham
		int		nInitialX;	//	-DX　 :　εの初期値 = -DX
		int		nStepX;		//	 2*SX :　ε+=2*SX
		int		nCmpX;		//	 2*DX :　ε>0ならばε-=2*DXしてね
		int		nStepsX;	//	 SrcXの一回の加算量(整数部)
		int		nInitialY;
		int		nStepY;
		int		nCmpY;
		int		nStepsY;
	};

	static LRESULT Clipping(CDIB32*lpDstDIB,CDIB32*lpSrcDIB,int x,int y, CDIB32EffectClipper* lpClipper,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	//	気が向いたら関数追加するかもね。（しないかもね＾＾；）
};

#endif	// ifdef __yaneDIB32Effect.h
#endif	// ifdef USE_DIB32
