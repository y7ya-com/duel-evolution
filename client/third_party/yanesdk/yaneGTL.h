#ifndef __yaneGTL_h__
#define __yaneGTL_h__
//////////////////////////////////////////////////////////////////////////////
//	yaneGTL.h
//		Graphic Template Library
//			for CFastPlane & CDIB32 & CPlane...
//
//			Programmed by yaneurao(M.Isozaki) '01/10/01-'01/11/12
//			Special thanks to Hideo Ikeuchi
//
//		何も考えずに書きつづけてたら、たいへんデカくなってしまった。
//		おかげで、コンパイルオプションに /Zm200というようにしてヒープを確保しないと
//		いけなくなってしまった(ρ_；)ﾉ
//
//////////////////////////////////////////////////////////////////////////////
#include "yaneFastPlaneInfo.h"

#define _USE_SIGNED_TABLE	//	32/24bppで、x∈[-255,255]中の[-255,-1]を補数表現したテーブルを使う。
							//	dst = αsrc+(1-α)dst = dst+α(src-dst) と変形出来るので速い！

/*
	命名規則
		１０進数の数字と同じく、左側に上位ビットを書く。

		XRGB8888
		とあれば、上位からX,R,G,Bときて、
		それぞれが8,8,8,8ビットであることを意味します。
*/

class CFastPlaneBytePal;	// 2:	1バイトパレット(not supported)
class CFastPlaneRGB565;		// 3:	通常16bit
class CFastPlaneRGB555;		// 4:	通常15bit
class CFastPlaneRGB888;		// 5:	通常24bit
class CFastPlaneBGR888;		// 6:		逆バージョン
class CFastPlaneXRGB8888;	// 7:	通常32bit		//	CDIB32もこれ
class CFastPlaneXBGR8888;	// 8:		逆バージョン
class CFastPlaneARGB4565;	// 10:	Alpha付き16bit+alpha // RGB565でYGAを読み込むときはこれ
class CFastPlaneARGB4555;	// 11:	Alpha付き15bit+alpha // RGB555でYGAを読み込むときはこれ
	//	⇒　少し無駄ではあるが、αを４ビットに制限することにより、
	//	テーブル化された、高速なブレンドを提供できる
class CFastPlaneARGB8888;	// 12:	Alpha付き32bit	//	CDIB32でYGAを読み込んだときもこれ
class CFastPlaneABGR8888;	// 13:	Alpha付き32bit逆順

//	気が向けばサポート＾＾；
class CFastPlaneRGB565565;	//	倍サイズのコピーをサポートしているRGB565
class CFastPlaneRGB555555;	//	倍サイズのコピーをサポートしているRGB555

//	高精度の画像処理のために、RGBをdoubleやWORDで持っているような
//	ピクセルフォーマットとについても取り扱いたいのだが、そのへんは、
//	のちのちの拡張ということにしよう．．

//////////////////////////////////////////////////////////////////////////////
//	半透明の計算のための乗算テーブル
//////////////////////////////////////////////////////////////////////////////

class CFastPlaneBlendTable {
public:
	//	このクラス、２ＭＢのテーブルを用意するのだ＾＾；
	//	いまどきのマシンなら、どってこと無いよね？？＾＾；；

	static BYTE	abyMulTable[256*256];	//	[x * y / 255] (x∈[0,255])
	static BYTE	abyMulTable2[256*256];	//	[x * (255-y) / 255] (x∈[0,255])
								//	=> [x][y]を[x + (y << 8)]とアクセスすること！
#ifdef _USE_SIGNED_TABLE
	static BYTE	abySignedMulTable[2*256*256];	//	[x * y / 255] (x∈[-255,255])
								//	=> [x][y]を[(x+255) + (y << 9)]とアクセスすること！
#endif
	//	16ビット半透明テーブル
	static	WORD awdMulTableRGB565[65536*16]; // [RGB(16)* α(4bit)]
	static	WORD awdMulTableRGB555[65536*16]; // [RGB(15)* α(4bit)]
			//	↑こいつは、本当は、この半分で良いのだが、
			//	最上位が不定になっている可能性があるので、ビットマスクを
			//	とるのがだるいので、これでいってまう！＾＾；

/*
	//	これ、やんぺー（笑）

	//	16ビット飽和加算テーブル
	static	WORD awdAddTableRGB565[65536*8]; // [RGB(16)* 飽和値(4bit)]
	static	WORD awdAddTableRGB555[65536*8]; // [RGB(15)* 飽和値(4bit)]
	//	16ビット飽和減算テーブル
	static	WORD awdSubTableRGB565[65536*8]; // [RGB(16)* 飽和値(4bit)]
	static	WORD awdSubTableRGB555[65536*8]; // [RGB(15)* 飽和値(4bit)]
*/

	//	RGB555⇒256Color変換テーブル
	static	BYTE abyConvertTable555[32768];

	//	上記のテーブルのための初期化関数。CFastDrawが初期化する。
	static void InitTable();

	//	パレットが変更になったときに呼び出して、abyConvertTable555を初期化すべし！
	static void OnChangePalette();
};

class CFastPlaneBytePal /* 8ビットPalette */ {
public:
	BYTE GetR() const { return 0; }	//	パレット参照して返すべきなのか？
	void SetR(BYTE r) { _rgb = r; }
	BYTE GetG() const { return 0; }
	void SetG(BYTE g) { _rgb = g; }
	BYTE GetB() const { return 0; }
	void SetB(BYTE b) { _rgb = b; }

	//	dummyでも用意しておかないと、重乗算オペレータがうまく動かない
	DWORD GetA() const { return 255; }
	void SetA(BYTE b) { }

	void SetRGB(BYTE r,BYTE g,BYTE b) { }	// not supported
	void SetRGB(BYTE rgb) { _rgb = rgb; }
	BYTE GetRGB() const { return _rgb; }

	void	Clear() { _rgb = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneBytePal& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneBytePal& operator = (const CFastPlaneBytePal &src){
		_rgb = src._rgb;
		return *this;
	}

	//	RGB555との変換子
	inline CFastPlaneBytePal& operator = (const CFastPlaneRGB555 &src);

	//	乗算オペレータ
	template <class X>
	CFastPlaneBytePal& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
		WORD alpha8 = ((WORD)src.GetA()) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneBytePal& operator *= (DWORD alpha){
		WORD alpha8 = ((WORD)alpha) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8]
		);
		return *this;
	}

	//	重乗算オペレータ
	template <class X>
	CFastPlaneBytePal& dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		WORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + ((WORD)src.GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	//	飽和加算オペレータ
	template <class X>
	CFastPlaneBytePal& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneBytePal& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneBytePal& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和減算
	CFastPlaneBytePal& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

private:
	BYTE _rgb;
};

class CFastPlaneRGB555 /* 16ビットRGB 555 */ {
public:
	BYTE GetR() const { return (_rgb & 0x7c00) >> (10-3); }
	void SetR(BYTE r) { _rgb = (_rgb & ~(0x7c00+0x8000)) | ((WORD)(r&0xf8)<<(10-3)); }
	BYTE GetG() const { return (_rgb & 0x03e0) >> (5-3); }
	void SetG(BYTE g) { _rgb = (_rgb & ~(0x03e0+0x8000)) | ((WORD)(g&0xfc)<<(5-3)); }
	BYTE GetB() const { return (_rgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgb = (_rgb & ~(0x001f+0x8000)) | (b >> 3); }
		//	+0x8000は、上位１ビットにゴミが乗り上げると嫌なので、リセットしている

	//	dummyでも用意しておかないと、重乗算オペレータがうまく動かない
	DWORD GetA() const { return 255; }
	void SetA(BYTE b) { }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _rgb = ((WORD)(r&0xf8)<<(10-3)) | ((WORD)(g&0xf8)<<(5-3)) | (b >> 3); }
	void SetRGB(WORD rgb) { _rgb = rgb; }
	//	数字をダイレクトに渡すときに、(WORD)0 のようにキャストしないと
	//	いけないっちゅーのも、なんだかダサい気がするのだが．．

	WORD GetRGB() const { return _rgb; }
	//	倍サイズにして返す
	DWORD GetRGB_DWORD() const { return	((DWORD)_rgb << 16) | (DWORD)_rgb; }

	void	Clear() { _rgb = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneRGB555& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneRGB555& operator = (const CFastPlaneRGB555 &src){
		_rgb = src._rgb;
		return *this;
	}
	//	乗算オペレータ
	template <class X>
	CFastPlaneRGB555& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
		WORD alpha8 = ((WORD)src.GetA()) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
/*	//	これは、テーブルにより高速化される：
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneRGB555& operator *= (DWORD alpha){
		WORD alpha8 = ((WORD)alpha) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8]
		);
		return *this;
	}
*/
	//	重乗算オペレータ
	template <class X>
	CFastPlaneRGB555& dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		if ( GetRGB()==src.GetRGB() ) return *this;

		WORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + ((WORD)src.GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}

	//	親和性のあるプレーンのためにalpha特化された転送
	inline CFastPlaneRGB555& operator *= (const CFastPlaneARGB4555 &src);
	inline CFastPlaneRGB555& operator *= (DWORD alpha);
	inline CFastPlaneRGB555&  dmul (const CFastPlaneARGB4555 &src,DWORD alpha);
	//	自分自身に対する、重乗算も、当然必要...
	inline CFastPlaneRGB555&  dmul (const CFastPlaneRGB555 &src,DWORD alpha){
		if ( GetRGB()==src.GetRGB() ) return *this;

		DWORD alpha16_2e = ((DWORD)(alpha&0xf0)) << (4+8); // 4 bitのみ生き
		DWORD alpha16_2i = alpha16_2e ^ 0xf0000; // α 4 bitを反転
		_rgb =
			  CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16_2e]
			+ CFastPlaneBlendTable::awdMulTableRGB555[	  _rgb + alpha16_2i];
		return *this;
	}
	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneRGB555&  dmul (const CFastPlaneARGB4555 &src,DWORD srcalpha,DWORD dstalpha);
	inline CFastPlaneRGB555&  dmul (const CFastPlaneRGB555 &src,DWORD srcalpha,DWORD dstalpha){
		DWORD alpha16_2e = ((DWORD)(srcalpha&0xf0)) << (4+8); // 4 bitのみ生き
		DWORD alpha16_2i = ((DWORD)(dstalpha&0xf0)) << (4+8);
		_rgb =
			  CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16_2e]
			+ CFastPlaneBlendTable::awdMulTableRGB555[	  _rgb + alpha16_2i];
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneRGB555& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}

	//	自分との加算は、最適化されたルーチン
	//		RGB555 satulation add (C)さ～
	CFastPlaneRGB555& operator += (const CFastPlaneRGB555& src){
		WORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0x7bde)) & 0x8420;
		c = ((c >> 5) + 0x3def) ^ 0x3def;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneRGB555& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneRGB555& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//		RGB555 satulation sub (C)さ～
	CFastPlaneRGB555& operator -= (const CFastPlaneRGB555& src){
		WORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0x7bde)) & 0x8420;
		c = (( c >> 5) + 0x3def) ^ 0x3def;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}

	//	定数飽和減算
	CFastPlaneRGB555& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	ARGB4555との親和性
	inline CFastPlaneRGB555& operator += (const CFastPlaneARGB4555& src);
	inline CFastPlaneRGB555& operator -= (const CFastPlaneARGB4555& src);

private:
	WORD _rgb;
};

class CFastPlaneRGB565 /* 16ビットRGB 565 */ {
public:
	BYTE GetR() const { return (_rgb & 0xf800) >> (11-3); }
	void SetR(BYTE r) { _rgb = (_rgb & ~0xf800) | (((WORD)(r&0xf8))<<(11-3)); }
	BYTE GetG() const { return (_rgb & 0x07e0) >> (6-3); }
	void SetG(BYTE g) { _rgb = (_rgb & ~0x07e0) | (((WORD)(g&0xfc))<<(6-3)); }
	BYTE GetB() const { return (_rgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgb = (_rgb & ~0x001f) | (b >> 3); }

	//	dummyでも用意しておかないと、重乗算オペレータがうまく動かない
	DWORD GetA() const { return 255; }
	void SetA(BYTE b) { }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _rgb = (WORD)(((DWORD)(r&0xf8)<<(11-3)) | ((DWORD)(g&0xfc)<<(6-3)) | (b >> 3)); }
	void SetRGB(WORD rgb) { _rgb = rgb; }
	WORD GetRGB() const { return _rgb; }

	//	倍サイズにして返す
	DWORD GetRGB_DWORD() const { return	((DWORD)_rgb << 16) | (DWORD)_rgb; }

	void	Clear() { _rgb = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneRGB565& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneRGB565& operator = (const CFastPlaneRGB565 &src){
		_rgb = src._rgb;
		return *this;
	}

	//	乗算オペレータ
	template <class X>
	CFastPlaneRGB565& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
		const DWORD alpha8 = ((DWORD)src.GetA()) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}

/*	//	これは、テーブルにより高速化される：
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneRGB565& operator *= (DWORD alpha){
		WORD alpha8 = ((WORD)alpha) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8]
		);
		return *this;
	}
*/

	//	重乗算オペレータ
	template <class X>
	CFastPlaneRGB565&  dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		if ( GetRGB()==src.GetRGB() ) return *this;

		const DWORD alpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}

	//	親和性のあるプレーンのためにalpha特化された転送
	inline CFastPlaneRGB565& operator *= (const CFastPlaneARGB4565 &src);
	inline CFastPlaneRGB565& operator *= (DWORD alpha);
	inline CFastPlaneRGB565&  dmul (const CFastPlaneARGB4565 &src,DWORD alpha);
	//	自分自身に対する、重乗算も、当然必要...
	inline CFastPlaneRGB565&  dmul (const CFastPlaneRGB565 &src,DWORD alpha){
		if ( GetRGB()==src.GetRGB() ) return *this;

		DWORD alpha16_2e = ((DWORD)(alpha&0xf0)) << (4+8); // 4 bitのみ生き
		DWORD alpha16_2i = alpha16_2e ^ 0xf0000; // α 4 bitを反転
		_rgb =
			  CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16_2e]
			+ CFastPlaneBlendTable::awdMulTableRGB565[	  _rgb + alpha16_2i];
		return *this;
	}

	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneRGB565&  dmul (const CFastPlaneARGB4565 &src,DWORD srcalpha,DWORD dstalpha);
	//	自分自身に対する、重乗算も、当然必要...
	inline CFastPlaneRGB565&  dmul (const CFastPlaneRGB565 &src,DWORD srcalpha,DWORD dstalpha){
		DWORD alpha16_2e = ((DWORD)(srcalpha&0xf0)) << (4+8); // 4 bitのみ生き
		DWORD alpha16_2i = ((DWORD)(dstalpha&0xf0)) << (4+8); // 4 bitのみ生き
		_rgb =
			  CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16_2e]
			+ CFastPlaneBlendTable::awdMulTableRGB565[	  _rgb + alpha16_2i];
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneRGB565& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}

	//	自分との加算は、最適化されたルーチン
	//		RGB565 satulation add (C)さ～ & やねうらお
	CFastPlaneRGB565& operator += (const CFastPlaneRGB565& src){
		WORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();

		c = ((c0 & c1) + (((c0 ^ c1) & 0xf7de) >> 1)) & 0x8410;
		//	↑この部分、(C)やねうらお
		c = (((((short)(c + 0x3df0)) >> 5) & 0xfbff) + 0x200)^0x3ef;

/*	//	これはやねうらおがさ～さんのを改造したもの
						---------------R ----G-----B-----
						0123012301230123 0123012301230123
add eax, 0x001f7be0		----------Rrrrrr GggggBbbbbb-----
shr eax, 6				---------------- RrrrrrGggggBbbbb b
and eax, 0x0000fbff		---------------- Rrrrr-GggggBbbbb
add eax, 0x00000200		---------------- RrrrrGgggggBbbbb
xor eax, 0x00007bef		---------------- RRRRRGGGGGGBBBBB
		//	マスクが１つずれることに留意せよ
		c = (((((c + 0x1f7be0)) >> 6) & 0xfbff) + 0x200)^0x7bef;
*/

		SetRGB((c0 + c1 - c) | c);
		return *this;
	}

/*
さ～さんが考えた、RGB565用のビットマスク。

Ｃレベルでの記述およびDWORD/QWORD対応可です。
-------------------------------------------------------------------
[WORD版]

					R----G-----B----
add eax, 0x3df0		RGggggBbbbbb----
sar eax, 5			RRRRRRGggggBbbbb b
and eax, 0xfbff		RRRRR-GggggBbbbb
add eax, 0x0200		RRRRRGgggggBbbbb
xor eax, 0x03ef		RRRRRGGGGGGBBBBB


[DWORD版]

						R----G-----B---- R----G-----B----
add eax, 0x3df7bdf0		RGggggBbbbbbRrrr rGggggBbbbbb----
sar eax, 5				RRRRRRGggggBbbbb bRrrrrGggggBbbbb b
and eax, 0xfbff7bff		RRRRR-GggggBbbbb -Rrrr-GggggBbbbb
add eax, 0x02004200		RRRRRGgggggBbbbb RrrrrGgggggBbbbb
xor eax, 0x03ef7bef		RRRRRGGGGGGBBBBB RRRRRGGGGGGBBBBB

-------------------------------------------------------------------

*/

	//	定数飽和加算
	CFastPlaneRGB565& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}


	//	飽和減算オペレータ
	template <class X>
	CFastPlaneRGB565& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}

	//		RGB565 satulation sub (C)さ～ & やねうらお
	CFastPlaneRGB565& operator -= (const CFastPlaneRGB565& src){
		WORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		//	アセンブラでcy使って記述できれば良いのだが...
//		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xf7de)) & 0x10820;
		//	↑この部分、(C)やねうらお

		c = ((~c0 & c1) + (((~c0 ^ c1) & 0xf7de) >> 1)) & 0x8410;
		c = (((((short)(c + 0x3df0)) >> 5) & 0xfbff) + 0x200)^0x3ef;
	
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}

	//	定数飽和加算
	CFastPlaneRGB565& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	ARGB4565との親和性
	inline CFastPlaneRGB565& operator += (const CFastPlaneARGB4565& src);
	inline CFastPlaneRGB565& operator -= (const CFastPlaneARGB4565& src);

private:
	WORD _rgb;
};

class CFastPlaneARGB4565 /* 16ビットRGB 565 + A4ビット == 24ビット独自ARGB */ {
public:
	BYTE GetR() const { return (_rgb & 0xf800) >> (11-3); }
	void SetR(BYTE r) { _rgb = (_rgb & ~0xf800) | (((WORD)(r&0xf8))<<(11-3)); }
	BYTE GetG() const { return (_rgb & 0x07e0) >> (6-3); }
	void SetG(BYTE g) { _rgb = (_rgb & ~0x07e0) | (((WORD)(g&0xfc))<<(6-3)); }
	BYTE GetB() const { return (_rgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgb = (_rgb & ~0x001f) | (b >> 3); }
	DWORD GetA() const { return _a << 4; }
	void SetA(BYTE a) { _a	 = a >> 4; }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _rgb = ((WORD)(r&0xf8)<<(11-3)) | ((WORD)(g&0xfc)<<(6-3)) | (b >> 3); }
	void SetRGB(WORD rgb) { _rgb = rgb; _a = 15; }
	WORD GetRGB() const { return _rgb; }

	void	Clear() { _rgb = 0; _a = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneARGB4565& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		_a = 15;	//	α非サポートプレーンからのコピーなので、αを設定しておかねばならない！
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	//		⇒こいつは、αもコピーするので注意せよ
	CFastPlaneARGB4565& operator = (const CFastPlaneARGB4565 &src){
		_rgb = src._rgb;
		_a	 = src._a;
		return *this;
	}
	//	α無しサーフェースからのコピー
	CFastPlaneARGB4565& operator = (const CFastPlaneRGB565 &src){
		_rgb = src.GetRGB();
		_a	 = 15;	//	15とはαの最大値
		return *this;
	}
	//	α込みのプレーンからのコピー
	inline CFastPlaneARGB4565& operator = (const CFastPlaneARGB8888 &src);
	inline CFastPlaneARGB4565& operator = (const CFastPlaneABGR8888 &src);
	inline CFastPlaneARGB4565& operator = (const CFastPlaneARGB4555 &src);

	//	α⇒αサーフェースへ、α以外のみコピー
	CFastPlaneARGB4565& CopyWithoutAlpha(const CFastPlaneARGB4565 &src){
		_rgb = src._rgb;
		return *this;
	}
	//	α値の反転
	CFastPlaneARGB4565& FlushAlpha(const CFastPlaneARGB4565 &src){
		_a = 15-src._a;
		return *this;
	}

	//	乗算オペレータ
	template <class X>
	CFastPlaneARGB4565& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
		WORD alpha8 = ((WORD)src.GetA()) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneARGB4565& operator *= (DWORD alpha){
		WORD alpha8 = ((WORD)alpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneARGB4565&	 dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		WORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + ((WORD)src.GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	template <class X>
	CFastPlaneARGB4565&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		WORD srcalpha8 = CFastPlaneBlendTable::abyMulTable[srcalpha + ((WORD)src.GetA() << 8)];
		WORD dstalpha8 = CFastPlaneBlendTable::abyMulTable[dstalpha + ((WORD)	 GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8]
		);
		return *this;
	}

	CFastPlaneARGB4565&	 MulAlphaToAlpha(const CFastPlaneARGB4565&src){
/*
	PhotoShop的レイヤ合成
		新しいα  = αsrc + (1-αsrc)×αdst
		新しいRGB =	 (RGBSrc×αsrc　＋　RGBDst×(1-αsrc)×αdst)/(αsrc + αdst)
		⇒　これを、二つに分けると、
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = ((1-αsrc)×αdst) / (αsrc + αdst)
		として、RGBSrc×αsrc' + RGBDst×αdst'
*/
		BYTE nAlphaSrc = src.GetA();
		BYTE nAlphaDst = GetA();
		BYTE nNewBeta = (CFastPlaneBlendTable::abyMulTable[(15*16-(nAlphaSrc)) + (nAlphaDst << 8)]);
		BYTE nNewAlpha = nAlphaSrc + nNewBeta;
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = βdst / (αsrc + αdst)
		SetA(nNewAlpha);

		int nAlpha = nAlphaSrc + nNewBeta;
		if (nAlpha != 0) {
		//	こいつがゼロのときは、RGBを計算するに値しない
			BYTE nAlphaSrcD = (nAlphaSrc*15) / nAlpha;
			BYTE nAlphaDstD = (nNewBeta*15) / nAlpha;
			//	0～15にスケーリングして、ブレンドテーブルを利用する

			//	上のパラメータでブレンドする
			DWORD alpha16e = ((DWORD)(nAlphaSrcD)) << (8+8); // 4 bit
			DWORD alpha16i = ((DWORD)(nAlphaDstD)) << (8+8); // α 4 bitを反転
			_rgb = CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16e] +
				   CFastPlaneBlendTable::awdMulTableRGB565[	   _rgb + alpha16i];
			//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		}
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneARGB4565& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneARGB4565& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}
	//	飽和減算オペレータ
	template <class X>
	CFastPlaneARGB4565& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和減算
	CFastPlaneARGB4565& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

//private:
	WORD _rgb;
	BYTE _a;	//	実際には、こいつの4ビットしか使わない
};

class CFastPlaneARGB4555 /* 16ビットRGB 555 + A4ビット == 24ビット独自ARGB */ {
public:
	BYTE GetR() const { return (_rgb & 0x7c00) >> (10-3); }
	void SetR(BYTE r) { _rgb = (_rgb & ~0x7c00) | ((WORD)(r&0xf8)<<(10-3)); }
	BYTE GetG() const { return (_rgb & 0x03e0) >> (5-3); }
	void SetG(BYTE g) { _rgb = (_rgb & ~0x03e0) | ((WORD)(g&0xf8)<<(5-3)); }
	BYTE GetB() const { return (_rgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgb = (_rgb & ~0x001f) | (b >> 3); }
	DWORD GetA() const { return _a << 4; }
	void SetA(BYTE a) { _a	 = a >> 4; }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _rgb = ((WORD)(r&0xf8)<<(10-3)) | ((WORD)(g&0xf8)<<(5-3)) | (b >> 3); }
	void SetRGB(WORD rgb) { _rgb = rgb; _a = 15; }
	WORD GetRGB() const { return _rgb; }

	void	Clear() { _rgb = 0; _a = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneARGB4555& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		_a = 15;	//	α非サポートプレーンからのコピーなので、αを設定しておかねばならない！
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	//		⇒こいつは、αもコピーするので注意せよ
	CFastPlaneARGB4555& operator = (const CFastPlaneARGB4555 &src){
		_rgb = src._rgb;
		_a	 = src._a;
		return *this;
	}
	//	α無しサーフェースからのコピー
	CFastPlaneARGB4555& operator = (const CFastPlaneRGB555 &src){
		_rgb = src.GetRGB();
		_a	 = 15;	//	15とはαの最大値
		return *this;
	}
	//	α込みのプレーンからのコピー
	inline CFastPlaneARGB4555& operator = (const CFastPlaneARGB8888 &src);
	inline CFastPlaneARGB4555& operator = (const CFastPlaneABGR8888 &src);
	inline CFastPlaneARGB4555& operator = (const CFastPlaneARGB4565 &src);

	//	α⇒αサーフェースへ、α以外のみコピー
	CFastPlaneARGB4555& CopyWithoutAlpha(const CFastPlaneARGB4555 &src){
		_rgb = src._rgb;
		return *this;
	}
	//	α値の反転
	CFastPlaneARGB4555& FlushAlpha(const CFastPlaneARGB4555 &src){
		_a = 15-src._a;
		return *this;
	}

	//	乗算オペレータ
	template <class X>
	CFastPlaneARGB4555& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
		WORD alpha8 = ((WORD)src.GetA()) << 8;
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneARGB4555& operator *= (DWORD alpha){
		WORD alpha8 = ((WORD)alpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneARGB4555&	 dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		WORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + ((WORD)src.GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8]
		);
		return *this;
	}
	template <class X>
	CFastPlaneARGB4555&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		WORD srcalpha8 = CFastPlaneBlendTable::abyMulTable[srcalpha + ((WORD)src.GetA() << 8)];
		WORD dstalpha8 = CFastPlaneBlendTable::abyMulTable[dstalpha + ((WORD)	 GetA() << 8)];
		SetRGB(
			CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8],
			CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8]
		);
		return *this;
	}

	CFastPlaneARGB4555&	 MulAlphaToAlpha(const CFastPlaneARGB4555&src){
/*
	PhotoShop的レイヤ合成
		新しいα  = αsrc + (1-αsrc)×αdst
		新しいRGB =	 (RGBSrc×αsrc　＋　RGBDst×αdst)/(αsrc + αdst)
		⇒　これを、二つに分けると、
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = αdst / (αsrc + αdst)
		として、RGBSrc×αsrc' + RGBDst×αdst'
*/
		BYTE nAlphaSrc = src.GetA();
		BYTE nAlphaDst = GetA();
		BYTE nNewBeta = (CFastPlaneBlendTable::abyMulTable[(15*16-(nAlphaSrc)) + (nAlphaDst << 8)]);
		BYTE nNewAlpha = nAlphaSrc + nNewBeta;
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = βdst / (αsrc + αdst)
		SetA(nNewAlpha);

		int nAlpha = nAlphaSrc + nNewBeta;
		if (nAlpha != 0) {
		//	こいつがゼロのときは、RGBを計算するに値しない
			BYTE nAlphaSrcD = (nAlphaSrc*15) / nAlpha;
			BYTE nAlphaDstD = (nNewBeta*15) / nAlpha;
			//	0～15にスケーリングして、ブレンドテーブルを利用する

			//	上のパラメータでブレンドする
			DWORD alpha16e = ((DWORD)(nAlphaSrcD)) << (8+8); // 4 bit
			DWORD alpha16i = ((DWORD)(nAlphaDstD)) << (8+8); // α 4 bitを反転

			_rgb = CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16e] +
				   CFastPlaneBlendTable::awdMulTableRGB555[	   _rgb + alpha16i];
			//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		}
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneARGB4555& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneARGB4555& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}
	//	飽和減算オペレータ
	template <class X>
	CFastPlaneARGB4555& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和減算
	CFastPlaneARGB4555& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

//private:
	WORD _rgb;
	BYTE _a;	//	実際には、こいつの4ビットしか使わない
};

class CFastPlaneRGB888 /* 24ビットRGB 888 通常、これのはず.. */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	//	dummyでも用意しておかないと、重乗算オペレータがうまく動かない
	DWORD GetA() const { return 255; }
	void SetA(BYTE b) { }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; }
	void SetRGB(DWORD rgb) {	*(WORD*)(&_b) = rgb & 0xffff;
								*((BYTE*)(&_b)+2) = rgb >> 16;
	}
	DWORD GetRGB() const {
		return *(DWORD*)(&_b) & 0xffffff;
		//	↑これ、オーバーアクセスしているが、
		//	ワークが奇数バイトであることは無いのか？
		//	もしそうならば、上のにしてやれば、１０％ぐらい効率が変わるのだが．．
		//	⇒サーフェースをこっそり偶数ドットで確保するように変更
//		return *(WORD*)(&_b) | (((DWORD)_r) << 16);
	}
	void	Clear() { *(WORD*)(&_b) = 0; *((BYTE*)(&_b)+2)=0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneRGB888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneRGB888& operator = (const CFastPlaneRGB888 &src){
		_r = src._r;
		_g = src._g;
		_b = src._b;
		return *this;
	}
	//	乗算オペレータ
	template <class X>
	CFastPlaneRGB888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneRGB888& operator *= (DWORD alpha){
		DWORD alpha8 = ((DWORD)alpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneRGB888&  dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneRGB888&  dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
		DWORD srcalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[srcalpha + ((DWORD)src.GetA() << 8)] << 8;
		DWORD dstalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[dstalpha + ((DWORD)	   GetA() << 8)] << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		SetRGB(r,g,b);
		return *this;
	}
	inline CFastPlaneRGB888&  dmul (const CFastPlaneRGB888 &src,DWORD alpha){
//*
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = alpha << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = alpha << 8;
		// SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
/*/
		//	自前計算だとこういう方法もある（Pen4のSDRAMではこっちの方が速度が出る。DDRなら逆効果。）
		const DWORD a = alpha+1;
		if ( a!=1 ) {
			const DWORD& src_rgb = *(DWORD*)(&src._b);
			DWORD& dst_rgb = *(DWORD*)(&_b);
			dst_rgb = (dst_rgb&0xff000000) | (( (( (src_rgb&0x00ff00ff)*a+(dst_rgb&0x00ff00ff)*(256-a) )&0xff00ff00)
					+(( (src_rgb&0x0000ff00)*a+(dst_rgb&0x0000ff00)*(256-a) )&0x00ff0000)
					)>>8);
		}
//*/
		return *this;
	}
	inline CFastPlaneRGB888&  dmul (const CFastPlaneRGB888 &src,DWORD srcalpha,DWORD dstalpha){
		DWORD srcalpha8 = ((DWORD)srcalpha) << 8;
		DWORD dstalpha8 = ((DWORD)dstalpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		SetRGB(r,g,b);
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneRGB888& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との加算は、最適化されたルーチン
	//		RGB888 satulation add (C)さ～
	CFastPlaneRGB888& operator += (const CFastPlaneRGB888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneRGB888& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneRGB888& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との減算は、最適化されたルーチン
	//		RGB888 satulation sub (C)さ～
	CFastPlaneRGB888& operator -= (const CFastPlaneRGB888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}
	//	定数飽和減算
	CFastPlaneRGB888& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}
	//	親和性のあるα付きプレーンとの飽和加算、減算
	inline CFastPlaneRGB888& operator += (const CFastPlaneARGB8888& src);
	inline CFastPlaneRGB888& operator -= (const CFastPlaneARGB8888& src);

private:
	BYTE _b,_g,_r;
};

class CFastPlaneBGR888 /* 24ビットRGB 888 逆バージョン */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	//	dummyでも用意しておかないと、重乗算オペレータがうまく動かない
	DWORD GetA() const { return 255; }
	void SetA(BYTE b) { }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; }
	void SetRGB(DWORD rgb) {	*(WORD*)(&_r) = rgb & 0xffff;
								*((BYTE*)(&_r)+2) = rgb >> 16;
	}
	DWORD GetRGB() const {
		return *(DWORD*)(&_r) & 0xffffff;
		//	↑これ、オーバーアクセスしているが、
		//	ワークが奇数バイトであることは無いのか？
		//	もしそうならば、上のにしてやれば、２０％ぐらい効率が変わるのだが．．
		//	⇒サーフェースをこっそり偶数ドットで確保するように変更
//		return *(WORD*)(&_r) | (((DWORD)_b) << 16);
	}
	void	Clear() { *(WORD*)(&_r) = 0; *((BYTE*)(&_r)+2)=0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneBGR888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneBGR888& operator = (const CFastPlaneBGR888 &src){
		_r = src._r;
		_g = src._g;
		_b = src._b;
		return *this;
	}
	//	乗算オペレータ
	template <class X>
	CFastPlaneBGR888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneBGR888& operator *= (DWORD alpha){
		DWORD alpha8 = ((DWORD)alpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneBGR888&  dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneBGR888&  dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
		DWORD srcalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[srcalpha + ((DWORD)src.GetA() << 8)] << 8;
		DWORD dstalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[dstalpha + ((DWORD)	   GetA() << 8)] << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		SetRGB(r,g,b);
		return *this;
	}
	inline CFastPlaneBGR888&  dmul (const CFastPlaneBGR888 &src,DWORD alpha){
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = alpha << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) - _r];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) - _g];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) - _b];
	#else
		if ( GetRGB()==src.GetRGB() ) return *this;
		const DWORD alpha8 = alpha << 8;
		// SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	inline CFastPlaneBGR888&  dmul (const CFastPlaneBGR888 &src,DWORD srcalpha,DWORD dstalpha){
		DWORD srcalpha8 = ((DWORD)srcalpha) << 8;
		DWORD dstalpha8 = ((DWORD)dstalpha) << 8;
		BYTE r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		BYTE g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		BYTE b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		SetRGB(r,g,b);
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneBGR888& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との加算は、最適化されたルーチン
	//		RGB888 satulation add (C)さ～
	CFastPlaneBGR888& operator += (const CFastPlaneBGR888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneBGR888& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneBGR888& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との減算は、最適化されたルーチン
	//		RGB888 satulation sub (C)さ～
	CFastPlaneBGR888& operator -= (const CFastPlaneBGR888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}
	//	定数飽和減算
	CFastPlaneBGR888& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}
	inline CFastPlaneBGR888& operator += (const CFastPlaneABGR8888& src);
	inline CFastPlaneBGR888& operator -= (const CFastPlaneABGR8888& src);

private:
	BYTE _r,_g,_b;	//	逆順
};

class CFastPlaneXRGB8888 /* 32ビットXRGB 8888 X:=ゴミビット 通常これのはず */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	DWORD GetA() const { return 255; }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; _dummy=0; }
	//	aはゴミ埋めないべき

	void SetRGB(DWORD rgb) { *(DWORD*)(&_b) = rgb; }	//	ゴミ乗ってもええわ
	//DWORD GetRGB() const { return *(DWORD*)(&_b) & 0xffffff; }
		//	↑念のため、
		//	上位バイトにゴミが乗り上げているという最悪の事態を考慮している
		//	（しかし、そんなビデオカードは、はよ捨てなはれ！ヽ(`Д´)ノ）
	//	⇒　しかし、CFastPlaneXRGB8888を用意したときにうまく動かないので
	//		必ずClear()を呼び出すようにしないと．．
	DWORD GetRGB() const { return *(DWORD*)(&_b); }
//	//	やっぱ、大丈夫や。HDC経由でrenderingしたときは、MSBクリアしてしもたる！
	void	Clear() { *(DWORD*)(&_b) = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneXRGB8888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	inline CFastPlaneXRGB8888& operator = (const CFastPlaneXRGB8888 &src){
		*(DWORD*)(&_b) = *(DWORD*)(&src._b);
		return *this;
	}
	//	乗算オペレータ
	template <class X>
	CFastPlaneXRGB8888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	inline CFastPlaneXRGB8888& operator *= (DWORD alpha){
		const DWORD alpha8 = alpha << 8;
		// SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneXRGB8888&	 dmul (const X &src, DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneXRGB8888&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		const DWORD srcalpha8 = CFastPlaneBlendTable::abyMulTable[srcalpha + (src.GetA() << 8)] << 8;
		const DWORD dstalpha8 = CFastPlaneBlendTable::abyMulTable[dstalpha + (	  GetA() << 8)] << 8;
		// SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}
	inline CFastPlaneXRGB8888&	dmul (const CFastPlaneXRGB8888 &src, DWORD alpha){
//*
	#ifdef _USE_SIGNED_TABLE
		//SetRGB(r,g,b);
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = alpha << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = alpha << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
	#endif
/*/
		//	自前計算だとこういう方法もある（Pen4のSDRAMではこっちの方が速度が出る。DDRなら逆効果。）
		const DWORD a = alpha+1;
		if ( a!=1 ) {
			const DWORD& src_rgb = *(DWORD*)(&src._b);
			DWORD& dst_rgb = *(DWORD*)(&_b);
			dst_rgb = ( (( (src_rgb&0x00ff00ff)*a+(dst_rgb&0x00ff00ff)*(256-a) )&0xff00ff00)
					+(( (src_rgb&0x0000ff00)*a+(dst_rgb&0x0000ff00)*(256-a) )&0x00ff0000)
					)>>8;
		}
//*/
		return *this;
	}
	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneXRGB8888&	dmul (const CFastPlaneXRGB8888 &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		const DWORD srcalpha8 = srcalpha << 8;
		const DWORD dstalpha8 = dstalpha << 8;
		// SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneXRGB8888& operator += (const X &src){
		DWORD r = GetR() + src.GetR();
		if (r>0xff) r=0xff;
		DWORD g = GetG() + src.GetG();
		if (g>0xff) g=0xff;
		DWORD b = GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との加算は、最適化されたルーチン
	//		RGB888 satulation add (C)さ～
	CFastPlaneXRGB8888& operator += (const CFastPlaneXRGB8888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneXRGB8888& add (BYTE r,BYTE g,BYTE b){
//		WORD r2 = (WORD)GetR() + r;
//		if (r2>0xff) r2=0xff;
//		WORD g2 = (WORD)GetG() + g;
//		if (g2>0xff) g2=0xff;
//		WORD b2 = (WORD)GetB() + b;
//		if (b2>0xff) b2=0xff;
//		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = (r<<16)|(g<<8)|b;
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneXRGB8888& operator -= (const X &src){
		DWORD r = GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		DWORD g = GetG() - src.GetG();
		if (g>0xff) g=0;
		DWORD b = GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との減算は、最適化されたルーチン
	//		RGB888 satulation sub (C)さ～
	CFastPlaneXRGB8888& operator -= (const CFastPlaneXRGB8888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}
	//	定数飽和減算
	CFastPlaneXRGB8888& sub (BYTE r,BYTE g,BYTE b){
//		WORD r2 = (WORD)GetR() - r;
//		if (r2>0xff) r2=0;
//		WORD g2 = (WORD)GetG() - g;
//		if (g2>0xff) g2=0;
//		WORD b2 = (WORD)GetB() - b;
//		if (b2>0xff) b2=0;
//		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = (r<<16)|(g<<8)|b;
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}

	//	親和性のあるα付きプレーンとの飽和加算、減算
	inline CFastPlaneXRGB8888& operator += (const CFastPlaneARGB8888& src);
	inline CFastPlaneXRGB8888& operator -= (const CFastPlaneARGB8888& src);

private:
	BYTE _b,_g,_r,_dummy;
};

class CFastPlaneXBGR8888 /* 32ビットXRGB 8888 X:=ゴミビット 逆バージョン */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	DWORD GetA() const { return 255; }

	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; _dummy=0; }
	//	aはゴミ埋めないべき

	void SetRGB(DWORD rgb) { *(DWORD*)(&_r) = rgb; }
//	DWORD GetRGB() const { return *(DWORD*)(&_r) & 0xffffff; }
		//	↑念のため、
		//	上位バイトにゴミが乗り上げているという最悪の事態を考慮している
		//	（しかし、そんなビデオカードは、はよ捨てなはれ！ヽ(`Д´)ノ）
	DWORD GetRGB() const { return *(DWORD*)(&_r); }
	//	やっぱ、大丈夫や。HDC経由でrenderingしたときは、MSBクリアしてしもたる！
	void	Clear() { *(DWORD*)(&_r) = 0; }

	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneXBGR8888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	CFastPlaneXBGR8888& operator = (const CFastPlaneXBGR8888 &src){
		*(DWORD*)(&_r) = *(DWORD*)(&src._r);
		return *this;
	}
	//	乗算オペレータ
	template <class X>
	CFastPlaneXBGR8888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneXBGR8888& operator *= (DWORD alpha){
		DWORD alpha8 = ((DWORD)alpha) << 8;
		// メンバ関数経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneXBGR8888&	 dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneXBGR8888&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD srcalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[srcalpha + ((DWORD)src.GetA() << 8)] << 8;
		DWORD dstalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[dstalpha + ((DWORD)	   GetA() << 8)] << 8;
		// メンバ関数経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}
	inline CFastPlaneXBGR8888&	dmul (const CFastPlaneXBGR8888 &src,DWORD alpha){
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = alpha << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_dummy = 0;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = alpha << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneXBGR8888&	dmul (const CFastPlaneXBGR8888 &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD srcalpha8 = (DWORD)srcalpha << 8;
		DWORD dstalpha8 = (DWORD)dstalpha << 8;
		// メンバ関数経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_dummy = 0;
		//SetRGB(r,g,b);
		return *this;
	}

	//	飽和加算オペレータ
	template <class X>
	CFastPlaneXBGR8888& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との加算は、最適化されたルーチン
	//		RGB888 satulation add (C)さ～
	CFastPlaneXBGR8888& operator += (const CFastPlaneXBGR8888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
//		SetRGB((c0 + c1 - c) | c);
		*(DWORD*)(&_r) = ((c0 + c1 - c) | c);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneXBGR8888& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneXBGR8888& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	自分との減算は、最適化されたルーチン
	//		RGB888 satulation sub (C)さ～
	CFastPlaneXBGR8888& operator -= (const CFastPlaneXBGR8888& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0xfefefe)) & 0x1010100;
		c = ((c >> 8) + 0x7f7f7f) ^ 0x7f7f7f;
//		SetRGB((c0 | c) - (c1 | c));
		*(DWORD*)(&_r) = ((c0 | c) - (c1 | c));
		return *this;
	}
	//	定数飽和減算
	CFastPlaneXBGR8888& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	親和性のあるα付きプレーンとの飽和加算、減算
	inline CFastPlaneXBGR8888& operator += (const CFastPlaneABGR8888& src);
	inline CFastPlaneXBGR8888& operator -= (const CFastPlaneABGR8888& src);

private:
	BYTE _r,_g,_b,_dummy;	//	逆なのだ
};

class CFastPlaneARGB8888 /* 32ビットARGB 8888 A:=Alpha */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	//		⇒ 255にしたほうが良いのだろうか？
	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; _a=255; }

	//		このセットは、nativeなのでalpha値は、無視する。
	void SetRGB(DWORD rgb) { *(DWORD*)(&_b) = rgb; }
	DWORD GetRGB() const { return *(DWORD*)(&_b) & 0xffffff; }

	DWORD GetA() const { return _a; }
	void SetA(BYTE a) { _a = a; }

	void	Clear() { *(DWORD*)(&_b) = 0; }
	
	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneARGB8888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		// SetRGBでセットされるから無駄 by ENRA
		//_a = 255;	//	α非サポートプレーンからのコピーなので、αを設定しておかねばならない！
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	//		⇒　このコピーにおいて、α値もコピーされることに留意せよ
	CFastPlaneARGB8888& operator = (const CFastPlaneARGB8888 &src){
		*(DWORD*)(&_b) = *(DWORD*)(&src._b);
		return *this;
	}
	inline CFastPlaneARGB8888& operator = (const CFastPlaneARGB4565 &src);
	inline CFastPlaneARGB8888& operator = (const CFastPlaneARGB4555 &src);
	inline CFastPlaneARGB8888& operator = (const CFastPlaneABGR8888 &src);

	//	α⇒αサーフェースへ、α以外のみコピー
	CFastPlaneARGB8888& CopyWithoutAlpha(const CFastPlaneARGB8888 &src){
		*(DWORD*)(&_b) =
			(*(DWORD*)(&src._b) & 0xffffff) | (*(DWORD*)(&_b) & 0xff000000);
		return *this;
	}
	//	α値の反転
	CFastPlaneARGB8888& FlushAlpha(const CFastPlaneARGB8888 &src){
		_a = ~src._a;
		return *this;
	}

	//	乗算オペレータ
	template <class X>
	CFastPlaneARGB8888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_a = 255;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneARGB8888& operator *= (DWORD alpha){
		DWORD alpha8 = ((DWORD)alpha) << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneARGB8888&	 dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_a = 255;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneARGB8888&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD srcalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[srcalpha + ((DWORD)src.GetA() << 8)] << 8;
		DWORD dstalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[dstalpha + ((DWORD)	   GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_a = 255;
		//SetRGB(r,g,b);
		return *this;
	}

	CFastPlaneARGB8888&	 MulAlphaToAlpha(const CFastPlaneARGB8888&src){
/*
	PhotoShop的レイヤ合成
		新しいα  = αsrc + (1-αsrc)×αdst
		新しいRGB =	 (RGBSrc×αsrc　＋　RGBDst×αdst)/(αsrc + αdst)
		⇒　これを、二つに分けると、
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = αdst / (αsrc + αdst)
		として、RGBSrc×αsrc' + RGBDst×αdst'
*/
		DWORD nAlphaSrc = src.GetA();
		DWORD nAlphaDst = GetA();
		DWORD nNewBeta = (CFastPlaneBlendTable::abyMulTable[(255-(nAlphaSrc)) + (nAlphaDst << 8)]);
		DWORD nNewAlpha = nAlphaSrc + nNewBeta;
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = βdst / (αsrc + αdst)
		SetA(nNewAlpha);

		int nAlpha = nAlphaSrc + nNewBeta;
		if (nAlpha != 0) {
		//	こいつがゼロのときは、RGBを計算するに値しない
			DWORD nAlphaSrcD8 = ((nAlphaSrc*255) / nAlpha) << 8;
			DWORD nAlphaDstD8 = ((nNewBeta*255) / nAlpha) << 8;

			//	上のパラメータでブレンドする
			//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
			_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetR() + nAlphaDstD8];
			_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetG() + nAlphaDstD8];
			_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetB() + nAlphaDstD8];
			_a = 255;
			//SetRGB(r,g,b);
		}
		return *this;
	}

	//	飽和加算オペレータ
	//		⇒　この飽和加算において、α値は無視されることに留意せよ
	template <class X>
	CFastPlaneARGB8888& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneARGB8888& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneARGB8888& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和減算
	CFastPlaneARGB8888& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

private:
	BYTE _b,_g,_r,_a;
};

class CFastPlaneABGR8888 /* 32ビットABGR 8888 A:=Alpha */{
public:
	BYTE GetR() const { return _r; }
	void SetR(BYTE r) { _r = r; }
	BYTE GetG() const { return _g; }
	void SetG(BYTE g) { _g = g; }
	BYTE GetB() const { return _b; }
	void SetB(BYTE b) { _b = b; }

	//		⇒ 255にしたほうが良いのだろうか？
	void SetRGB(BYTE r,BYTE g,BYTE b) { _r=r; _g=g; _b=b; _a=255; }

	//		このセットは、nativeなのでalpha値は、無視する。
	void SetRGB(DWORD rgb) { *(DWORD*)(&_r) = rgb; }
	DWORD GetRGB() const { return *(DWORD*)(&_r) & 0xffffff; }

	DWORD GetA() const { return _a; }
	void SetA(BYTE a) { _a = a; }

	void	Clear() { *(DWORD*)(&_r) = 0; }
	
	//	変換子
	//		超手抜き実装だけど、変換子、存在しないよりずっとマシでしょ．．
	template <class X>
	CFastPlaneABGR8888& operator = (const X &src){
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		// SetRGBでセットされるから無駄 by ENRA
		//_a = 255;	//	α非サポートプレーンからのコピーなので、αを設定しておかねばならない！
		return *this;
	}
	//	コピーコンストラクタは、別途用意
	//		⇒　このコピーにおいて、α値もコピーされることに留意せよ
	CFastPlaneABGR8888& operator = (const CFastPlaneABGR8888 &src){
		*(DWORD*)(&_r) = *(DWORD*)(&src._r);
		return *this;
	}
	inline CFastPlaneABGR8888& operator = (const CFastPlaneARGB4565 &src);
	inline CFastPlaneABGR8888& operator = (const CFastPlaneARGB4555 &src);
	inline CFastPlaneABGR8888& operator = (const CFastPlaneARGB8888 &src);

	//	α⇒αサーフェースへ、α以外のみコピー
	CFastPlaneABGR8888& CopyWithoutAlpha(const CFastPlaneABGR8888 &src){
		*(DWORD*)(&_r) =
			(*(DWORD*)(&src._r) & 0xffffff) | (*(DWORD*)(&_r) & 0xff000000);
		return *this;
	}
	//	α値の反転
	CFastPlaneABGR8888& FlushAlpha(const CFastPlaneABGR8888 &src){
		_a = ~ src._a;
		return *this;
	}

	//	乗算オペレータ
	template <class X>
	CFastPlaneABGR8888& operator *= (const X &src){
	//	転送元のalpha値でblendすると仮定
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = src.GetA() << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_a = 255;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = src.GetA() << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
	#endif
	}
	//	上記の乗算オペレータの定数バージョン
	CFastPlaneABGR8888& operator *= (DWORD alpha){
		DWORD alpha8 = ((DWORD)alpha) << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
		return *this;
	}
	//	重乗算オペレータ
	template <class X>
	CFastPlaneABGR8888&	 dmul (const X &src,DWORD alpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
	#ifdef _USE_SIGNED_TABLE
		//	dst = dst + α(src-dst)　のアルゴリズムに変更 '02/07/17  by ENRA
		//	9bit符号付き減算を、補数を使って8bit符号無し加算に帰着させているのだヽ(´▽｀)ノ
		const DWORD alpha9 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 9;
		_r += CFastPlaneBlendTable::abySignedMulTable[(src.GetR() - GetR() + 255) + alpha9];
		_g += CFastPlaneBlendTable::abySignedMulTable[(src.GetG() - GetG() + 255) + alpha9];
		_b += CFastPlaneBlendTable::abySignedMulTable[(src.GetB() - GetB() + 255) + alpha9];
		_a = 255;
	#else
		if ( (GetRGB()&0xffffff)==(src.GetRGB()&0xffffff) ) return *this;
		const DWORD alpha8 = CFastPlaneBlendTable::abyMulTable[alpha + (src.GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetR() + alpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetG() + alpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + alpha8] + CFastPlaneBlendTable::abyMulTable2[ GetB() + alpha8];
		_a = 255;
		//SetRGB(r,g,b);
	#endif
		return *this;
	}
	template <class X>
	CFastPlaneABGR8888&	 dmul (const X &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD srcalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[srcalpha + ((DWORD)src.GetA() << 8)] << 8;
		DWORD dstalpha8 = (DWORD)CFastPlaneBlendTable::abyMulTable[dstalpha + ((DWORD)	   GetA() << 8)] << 8;
		//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
		_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetR() + dstalpha8];
		_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetG() + dstalpha8];
		_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + srcalpha8] + CFastPlaneBlendTable::abyMulTable[ GetB() + dstalpha8];
		_a = 255;
		//SetRGB(r,g,b);
		return *this;
	}

	CFastPlaneABGR8888&	 MulAlphaToAlpha(const CFastPlaneABGR8888&src){
/*
	PhotoShop的レイヤ合成
		新しいα  = αsrc + (1-αsrc)×αdst
		新しいRGB =	 (RGBSrc×αsrc　＋　RGBDst×αdst)/(αsrc + αdst)
		⇒　これを、二つに分けると、
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = αdst / (αsrc + αdst)
		として、RGBSrc×αsrc' + RGBDst×αdst'
*/
		DWORD nAlphaSrc = src.GetA();
		DWORD nAlphaDst = GetA();
		DWORD nNewBeta = (CFastPlaneBlendTable::abyMulTable[(255-(nAlphaSrc)) + (nAlphaDst << 8)]);
		DWORD nNewAlpha = nAlphaSrc + nNewBeta;
		//	αsrc' = αsrc / (αsrc + αdst)
		//	αdst' = βdst / (αsrc + αdst)
		SetA(nNewAlpha);

		int nAlpha = nAlphaSrc + nNewBeta;
		if (nAlpha != 0) {
		//	こいつがゼロのときは、RGBを計算するに値しない
			DWORD nAlphaSrcD8 = ((nAlphaSrc*255) / nAlpha) << 8;
			DWORD nAlphaDstD8 = ((nNewBeta*255) / nAlpha) << 8;

			//	上のパラメータでブレンドする
			//	SetRGB()経由だと何故か遅い '02/03/15  by ENRA
			_r = CFastPlaneBlendTable::abyMulTable[src.GetR() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetR() + nAlphaDstD8];
			_g = CFastPlaneBlendTable::abyMulTable[src.GetG() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetG() + nAlphaDstD8];
			_b = CFastPlaneBlendTable::abyMulTable[src.GetB() + nAlphaSrcD8] + CFastPlaneBlendTable::abyMulTable[ GetB() + nAlphaDstD8];
			_a = 255;
			//SetRGB(r,g,b);
		}
		return *this;
	}

	//	飽和加算オペレータ
	//		⇒　この飽和加算において、α値は無視されることに留意せよ
	template <class X>
	CFastPlaneABGR8888& operator += (const X &src){
		WORD r = (WORD)GetR() + src.GetR();
		if (r>0xff) r=0xff;
		WORD g = (WORD)GetG() + src.GetG();
		if (g>0xff) g=0xff;
		WORD b = (WORD)GetB() + src.GetB();
		if (b>0xff) b=0xff;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和加算
	CFastPlaneABGR8888& add (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() + r;
		if (r2>0xff) r2=0xff;
		WORD g2 = (WORD)GetG() + g;
		if (g2>0xff) g2=0xff;
		WORD b2 = (WORD)GetB() + b;
		if (b2>0xff) b2=0xff;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

	//	飽和減算オペレータ
	template <class X>
	CFastPlaneABGR8888& operator -= (const X &src){
		WORD r = (WORD)GetR() - src.GetR();
		if (r>0xff) r=0;	//	これ、オーバーフローしてる
		WORD g = (WORD)GetG() - src.GetG();
		if (g>0xff) g=0;
		WORD b = (WORD)GetB() - src.GetB();
		if (b>0xff) b=0;
		SetRGB((BYTE)r,(BYTE)g,(BYTE)b);
		return *this;
	}
	//	定数飽和減算
	CFastPlaneABGR8888& sub (BYTE r,BYTE g,BYTE b){
		WORD r2 = (WORD)GetR() - r;
		if (r2>0xff) r2=0;
		WORD g2 = (WORD)GetG() - g;
		if (g2>0xff) g2=0;
		WORD b2 = (WORD)GetB() - b;
		if (b2>0xff) b2=0;
		SetRGB((BYTE)r2,(BYTE)g2,(BYTE)b2);
		return *this;
	}

private:
	BYTE _r,_g,_b,_a;	//	これがARGB8888と逆順になるだけ
};

//////////////////////////////////////////////////////////////////////////////
//	倍サイズでのコピーのためのクラス
//////////////////////////////////////////////////////////////////////////////

//	倍サイズのコピーをサポートしているRGB565
class CFastPlaneRGB565565 {
public:
	void SetRGB(DWORD rgb) { _rgbrgb = rgb; }
	DWORD GetRGB() const { return _rgbrgb; }
	//	WORDで二つ設定
	void SetRGBWORD(WORD rgb) { _rgbrgb = rgb + (rgb<<16); }

	//	getterは、下位のみを返す。setterは、上位にもセットする
	BYTE GetR() const { return (_rgbrgb & 0xf800) >> (11-3); }
	void SetR(BYTE r) { _rgbrgb = (_rgbrgb & ~0xfffff800) | (((DWORD)(r&0xf8))<<(11-3)); _rgbrgb += _rgbrgb<<16; }
	BYTE GetG() const { return (_rgbrgb & 0x07e0) >> (6-3); }
	void SetG(BYTE g) { _rgbrgb = (_rgbrgb & ~0xffff07e0) | (((DWORD)(g&0xfc))<<(6-3)); _rgbrgb += _rgbrgb<<16; }
	BYTE GetB() const { return (_rgbrgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgbrgb = (_rgbrgb & ~0xffff001f) | (b >> 3); _rgbrgb += _rgbrgb<<16; }

	//	コピーコンストラクタは、別途用意
	CFastPlaneRGB565565& operator = (const CFastPlaneRGB565565 &src){
		_rgbrgb = src._rgbrgb;
	}

	//	---- 欲しいのは、限定的な機能のみ

	//	自分との加算は、最適化されたルーチン
	//		RGB565 satulation add (C)さ～ & やねうらお
	CFastPlaneRGB565565& operator += (const CFastPlaneRGB565565& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();

		c = ((c0 & c1) + (((c0 ^ c1) & 0xf7def7de) >> 1)) & 0x84108410;
		//	↑この部分、(C)やねうらお
		c = (((((long)(c + 0x3df7bdf0)) >> 5) & 0xfbff7bff) + 0x2004200)^0x3ef7bef;

/*
[DWORD版]

							R----G-----B---- R----G-----B----
	add eax, 0x3df7bdf0		RGggggBbbbbbRrrr rGggggBbbbbb----
	sar eax, 5				RRRRRRGggggBbbbb bRrrrrGggggBbbbb b
	and eax, 0xfbff7bff		RRRRR-GggggBbbbb -Rrrr-GggggBbbbb
	add eax, 0x02004200		RRRRRGgggggBbbbb RrrrrGgggggBbbbb
	xor eax, 0x03ef7bef		RRRRRGGGGGGBBBBB RRRRRGGGGGGBBBBB
*/

		SetRGB((c0 + c1 - c) | c);
		return *this;
	}

	//	自分との加算は、最適化されたルーチン
	//		RGB565565 satulation sub (C)さ～ & やねうらお
	CFastPlaneRGB565565& operator -= (const CFastPlaneRGB565565& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();

		c = ((~c0 & c1) + (((~c0 ^ c1) & 0xf7def7de) >> 1)) & 0x84108410;
		//	↑この部分、(C)やねうらお
		c = (((((long)(c + 0x3df7bdf0)) >> 5) & 0xfbff7bff) + 0x2004200)^0x3ef7bef;

		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}

	CFastPlaneRGB565565& operator *= (DWORD alpha){
		DWORD alpha16 = ((DWORD)(alpha&0xf0)) << (4+8); // 4 bitのみ生き
		_rgbrgb =		 CFastPlaneBlendTable::awdMulTableRGB565[(_rgbrgb & 0xffff) + alpha16]
			+	 ((DWORD)CFastPlaneBlendTable::awdMulTableRGB565[(_rgbrgb >> 16)	+ alpha16] << 16);
		return *this;
	}

private:
	DWORD _rgbrgb;
};

//	倍サイズのコピーをサポートしているRGB555
class CFastPlaneRGB555555{
public:
	void SetRGB(DWORD rgb) { _rgbrgb = rgb; }
	DWORD GetRGB() const { return _rgbrgb; }
	//	WORDで二つ設定
	void SetRGBWORD(WORD rgb) { _rgbrgb = rgb + (rgb<<16); }

	//	getterは、下位のみを返す。setterは、上位にもセットする
	BYTE GetR() const { return (_rgbrgb & 0x7c00) >> (10-3); }
	void SetR(BYTE r) { _rgbrgb = (_rgbrgb & ~(0xffff7c00+0x8000)) | ((DWORD)(r&0xf8)<<(10-3)); _rgbrgb += _rgbrgb<<16; }
	BYTE GetG() const { return (_rgbrgb & 0x03e0) >> (5-3); }
	void SetG(BYTE g) { _rgbrgb = (_rgbrgb & ~(0xffff03e0+0x8000)) | ((DWORD)(g&0xfc)<<(5-3)); _rgbrgb += _rgbrgb<<16; }
	BYTE GetB() const { return (_rgbrgb & 0x001f) << 3; }
	void SetB(BYTE b) { _rgbrgb = (_rgbrgb & ~(0xffff001f+0x8000)) | (b >> 3); _rgbrgb += _rgbrgb<<16; }

	//	コピーコンストラクタは、別途用意
	CFastPlaneRGB555555& operator = (const CFastPlaneRGB555555 &src){
		_rgbrgb = src._rgbrgb;
	}
	//	自分との加算は、最適化されたルーチン
	//		RGB555555 satulation add (C)さ～ & やねうらお
	CFastPlaneRGB555555& operator += (const CFastPlaneRGB555555& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((c0 & c1) << 1) + ((c0 ^ c1) & 0x7bde7bde)) & 0x84208420;
		c = ((c >> 5) + 0x3def3def) ^ 0x3def3def;
		SetRGB((c0 + c1 - c) | c);
		return *this;
	}
	//		RGB555 satulation sub (C)さ～
	CFastPlaneRGB555555& operator -= (const CFastPlaneRGB555555& src){
		DWORD c, c0,c1;
		c0 = GetRGB();
		c1 = src.GetRGB();
		c = (((~c0 & c1) << 1) + ((~c0 ^ c1) & 0x7bde7bde)) & 0x84208420;
		c = (( c >> 5) + 0x3def3def) ^ 0x3def3def;
		SetRGB((c0 | c) - (c1 | c));
		return *this;
	}
	CFastPlaneRGB555555& operator *= (DWORD alpha){
		DWORD alpha16 = ((DWORD)(alpha&0xf0)) << (4+8); // 4 bitのみ生き
		_rgbrgb =		 CFastPlaneBlendTable::awdMulTableRGB555[(_rgbrgb & 0xffff) + alpha16]
			+	 ((DWORD)CFastPlaneBlendTable::awdMulTableRGB555[(_rgbrgb >> 16)	+ alpha16] << 16);
		return *this;
	}

private:
	DWORD _rgbrgb;
};

//////////////////////////////////////////////////////////////////////////////

//	特殊化された、非テンプレートタイプの変換子

	inline CFastPlaneBytePal& CFastPlaneBytePal::operator = (const CFastPlaneRGB555 &src){
/*
		//	RGB各２ビットから、システムカラーへの変換テーブル
		//	本当は、こいつをRGB555に対して用意すれば良いのたが
		//	面倒なので、もうこれで良い＾＾；
		//	ある意味、これは気休めに過ぎない。
		static BYTE abyTable[4*4*4] = {
			0,0,  1,249,		// RGB 000,100,200,300
			0,0,  1,249,		// RGB 010,110,210,310
			2,2,  3,251,		// RGB 020,120,220,320
			2,2,251,251,		// RGB 030,130,230,330
			0,0,  1,249,		// RGB 001,101,201,301
			0,0,  1,  9,		// RGB 011,111,211,311
			2,2,  3,251,		// RGB 021,121,221,321
			2,2,251,251,		// RGB 031,131,231,331
			4,4,  5,  5,		// RGB 002,102,202,302
			4,4,  5,253,		// RGB 012,112,212,312
			6,6,  7,255,		// RGB 022,122,222,322
			254,254,255,255,	// RGB 032,132,232,332
			255,252,253,253,	// RGB 003,103,203,303
			4,4,5,253,			// RGB 013,113,213,313
			254,254,255,255,	// RGB 023,123,223,323
			254,254,255,255,	// RGB 033,133,233,333
		};
		SetRGB(abyTable[
			((src.GetR()&0xc0) >> 6) |
			((src.GetG()&0xc0) >> 4) |
			((src.GetB()&0xc0) >> 2)
		]);
*/
		//	変換テーブルにおまかせ！
		SetRGB(CFastPlaneBlendTable::abyConvertTable555[src.GetRGB()]);
		return *this;
	}

//	for RGB565

	//	親和性のあるプレーンのためにalpha特化された転送
	inline CFastPlaneRGB565& CFastPlaneRGB565::operator *= (const CFastPlaneARGB4565 &src)
	{
	//	転送元のalpha値でblendすると仮定
		DWORD alpha16e	= ((DWORD)src._a) << 16; // 4 bit
		DWORD alpha16i = alpha16e ^ 0xf0000; // α 4 bitを反転
		_rgb =	 CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16e] +
				 CFastPlaneBlendTable::awdMulTableRGB565[	 _rgb + alpha16i];
		//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		return *this;
	}
	inline CFastPlaneRGB565& CFastPlaneRGB565::operator *= (DWORD alpha)
	{
		DWORD alpha16 = ((DWORD)(alpha&0xe0)) << (4+8); // 4 bitのみ生き
		_rgb =	 CFastPlaneBlendTable::awdMulTableRGB565[_rgb + alpha16];
		//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		return *this;
	}
	inline CFastPlaneRGB565&  CFastPlaneRGB565::dmul (const CFastPlaneARGB4565 &src,DWORD alpha)
	{
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD alpha16 = CFastPlaneBlendTable::abyMulTable[(DWORD)(src._a << 4) + (alpha << 8)] & 0xf0;
		DWORD alpha16e = (alpha16) << (8+4);   // 4 bit
		DWORD alpha16i = alpha16e ^ 0xf0000;   // α 4 bitを反転
		_rgb =
			 CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16e] +
			 CFastPlaneBlendTable::awdMulTableRGB565[	 _rgb + alpha16i];
		return *this;
	}
	//	α込みのプレーンからのコピー
	inline CFastPlaneARGB4565& CFastPlaneARGB4565::operator = (const CFastPlaneARGB8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB4565& CFastPlaneARGB4565::operator = (const CFastPlaneABGR8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB4565& CFastPlaneARGB4565::operator = (const CFastPlaneARGB4555 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}

//	for RGB555

	//	親和性のあるプレーンのためにalpha特化された転送
	inline CFastPlaneRGB555& CFastPlaneRGB555::operator *= (const CFastPlaneARGB4555 &src)
	{
	//	転送元のalpha値でblendすると仮定
		DWORD alpha16e = ((DWORD)src._a) << 16; // 4 bit
		DWORD alpha16i = alpha16e ^ 0xf0000; // α 4 bitを反転
		_rgb = CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16e] +
			   CFastPlaneBlendTable::awdMulTableRGB555[	   _rgb + alpha16i];
		//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		return *this;
	}
	inline CFastPlaneRGB555& CFastPlaneRGB555::operator *= (DWORD alpha)
	{
		DWORD alpha16 = ((DWORD)(alpha&0xf0)) << (4+8); // 4 bitのみ生き
		_rgb =	 CFastPlaneBlendTable::awdMulTableRGB555[_rgb + alpha16];
		//	↑これだけでブレンド完了するんかー、、すごいなー＾＾；
		// _rgb = rgb & 0x7fff; // 一応、最上位をマスクせにゃ．．
		return *this;
	}
	inline CFastPlaneRGB555&  CFastPlaneRGB555::dmul (const CFastPlaneARGB4555 &src,DWORD alpha)
	{
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD alpha16 = CFastPlaneBlendTable::abyMulTable[(DWORD)(src._a << 4) + (alpha << 8)] & 0xf0;
		DWORD alpha16e = (alpha16) << (8+4);   // 4 bit
		DWORD alpha16i = alpha16e ^ 0xf0000;   // α 4 bitを反転
		_rgb =
			 CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16e] +
			 CFastPlaneBlendTable::awdMulTableRGB555[	 _rgb + alpha16i];
		return *this;
	}

	//	α込みのプレーンからのコピー
	inline CFastPlaneARGB4555& CFastPlaneARGB4555::operator = (const CFastPlaneARGB8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB4555& CFastPlaneARGB4555::operator = (const CFastPlaneABGR8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB4555& CFastPlaneARGB4555::operator = (const CFastPlaneARGB4565 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}

	//	α込みのプレーンからのコピー
	inline CFastPlaneARGB8888& CFastPlaneARGB8888::operator = (const CFastPlaneARGB4565 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB8888& CFastPlaneARGB8888::operator = (const CFastPlaneABGR8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneARGB8888& CFastPlaneARGB8888::operator = (const CFastPlaneARGB4555 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}

	//	α込みのプレーンからのコピー
	inline CFastPlaneABGR8888& CFastPlaneABGR8888::operator = (const CFastPlaneARGB4565 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneABGR8888& CFastPlaneABGR8888::operator = (const CFastPlaneARGB4555 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}
	inline CFastPlaneABGR8888& CFastPlaneABGR8888::operator = (const CFastPlaneARGB8888 &src)
	{
		SetRGB(src.GetR(),src.GetG(),src.GetB());
		SetA(src.GetA());
		return *this;
	}

	inline CFastPlaneRGB555& CFastPlaneRGB555::operator += (const CFastPlaneARGB4555& src){
		CFastPlaneRGB555 tmp = *(CFastPlaneRGB555*)(&src);
		tmp *= src.GetA();
		*this += tmp;
		return *this;
	}
	inline CFastPlaneRGB565& CFastPlaneRGB565::operator += (const CFastPlaneARGB4565& src){
		CFastPlaneRGB565 tmp = *(CFastPlaneRGB565*)(&src);
		tmp *= src.GetA();
		*this += tmp;
		return *this;
	}
	inline CFastPlaneRGB888& CFastPlaneRGB888::operator += (const CFastPlaneARGB8888& src){
		CFastPlaneRGB888 tmp = *(CFastPlaneRGB888*)(&src);
		tmp *= src.GetA();
		*this += tmp;
		return *this;
	}
	inline CFastPlaneBGR888& CFastPlaneBGR888::operator += (const CFastPlaneABGR8888& src){
		CFastPlaneBGR888 tmp = *(CFastPlaneBGR888*)(&src);
		tmp *= src.GetA();
		*this += tmp;
		return *this;
	}
	inline CFastPlaneXRGB8888& CFastPlaneXRGB8888::operator += (const CFastPlaneARGB8888& src){
		CFastPlaneXRGB8888 tmp = *(CFastPlaneXRGB8888*)(&src);
		tmp *= src.GetA();
		//	最上位は、飽和加算の過程でマスクされる
		*this += tmp;
		return *this;
	}
	inline CFastPlaneXBGR8888& CFastPlaneXBGR8888::operator += (const CFastPlaneABGR8888& src){
		CFastPlaneXBGR8888 tmp = *(CFastPlaneXBGR8888*)(&src);
		tmp *= src.GetA();
		//	最上位は、飽和加算の過程でマスクされる
		*this += tmp;
		return *this;
	}
	inline CFastPlaneRGB555& CFastPlaneRGB555::operator -= (const CFastPlaneARGB4555& src){
		CFastPlaneRGB555 tmp = *(CFastPlaneRGB555*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}
	inline CFastPlaneRGB565& CFastPlaneRGB565::operator -= (const CFastPlaneARGB4565& src){
		CFastPlaneRGB565 tmp = *(CFastPlaneRGB565*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}
	inline CFastPlaneRGB888& CFastPlaneRGB888::operator -= (const CFastPlaneARGB8888& src){
		CFastPlaneRGB888 tmp = *(CFastPlaneRGB888*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}
	inline CFastPlaneBGR888& CFastPlaneBGR888::operator -= (const CFastPlaneABGR8888& src){
		CFastPlaneBGR888 tmp = *(CFastPlaneBGR888*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}
	inline CFastPlaneXRGB8888& CFastPlaneXRGB8888::operator -= (const CFastPlaneARGB8888& src){
		CFastPlaneXRGB8888 tmp = *(CFastPlaneXRGB8888*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}
	inline CFastPlaneXBGR8888& CFastPlaneXBGR8888::operator -= (const CFastPlaneABGR8888& src){
		CFastPlaneXRGB8888 tmp = *(CFastPlaneXRGB8888*)(&src);
		tmp *= src.GetA();
		*this -= tmp;
		return *this;
	}

	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneRGB565&  CFastPlaneRGB565::dmul (const CFastPlaneARGB4565 &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD alpha16s = CFastPlaneBlendTable::abyMulTable[(DWORD)(src._a << 4) + (srcalpha << 8)] & 0xf0;
		DWORD alpha16e = (alpha16s) << (8+4);	// 4 bit
		//	αdst = max( 'cause RGB565)
		DWORD alpha16d = CFastPlaneBlendTable::abyMulTable[(DWORD)(	   15 << 4) + (dstalpha << 8)] & 0xf0;
		DWORD alpha16i = (alpha16d) << (8+4);	// 4 bit
		_rgb =
			 CFastPlaneBlendTable::awdMulTableRGB565[src._rgb + alpha16e] +
			 CFastPlaneBlendTable::awdMulTableRGB565[	 _rgb + alpha16i];
		return *this;
	}
	//	こちらは、dst = αsrc×src + αdst×dst
	inline CFastPlaneRGB555&  CFastPlaneRGB555::dmul (const CFastPlaneARGB4555 &src,DWORD srcalpha,DWORD dstalpha){
	//	転送元のalpha値でblendすると仮定
	//	このオペレータは、そいつにさらに、減衰率alphaを掛ける
		DWORD alpha16s = CFastPlaneBlendTable::abyMulTable[(DWORD)(src._a << 4) + (srcalpha << 8)] & 0xf0;
		DWORD alpha16e = (alpha16s) << (8+4);	// 4 bit
		//	αdst = max( 'cause RGB555)
		DWORD alpha16d = CFastPlaneBlendTable::abyMulTable[(DWORD)(	   15 << 4) + (dstalpha << 8)] & 0xf0;
		DWORD alpha16i = (alpha16d) << (8+4);	// 4 bit
		_rgb =
			 CFastPlaneBlendTable::awdMulTableRGB555[src._rgb + alpha16e] +
			 CFastPlaneBlendTable::awdMulTableRGB555[	 _rgb + alpha16i];
		return *this;
	}

//////////////////////////////////////////////////////////////////////////////
//	CFastPlane間の転送のための関数オブジェクト
//////////////////////////////////////////////////////////////////////////////

//	転送元からのコピーのためのfunctor
class CFastPlaneCopySrc {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst = src;
	}
};

//	転送元からの加色コピーのためのfunctor
class CFastPlaneCopyAdd {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst += src;
	}
};

//	転送元からの減色コピーのためのfunctor
class CFastPlaneCopySub {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst -= src;
	}
};

//	転送元からの乗算コピーのためのfunctor
class CFastPlaneCopyMul {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst *= src;
	}
};

//	転送元からの乗算コピーのためのfunctor
//	（αサーフェースからαサーフェースへのPhotoShopレイヤ的合成）
class CFastPlaneCopyMulAlphaToAlpha {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.MulAlphaToAlpha(src);
/*
	PhotoShopレイヤ的合成
		新しいα  = αsrc + (1-αsrc)×αdst
		新しいRGB =	 (RGBSrc×αsrc　＋　RGBDst×αdst)/(αsrc + αdst)
*/
	}
};

//	転送元からの除算コピーのためのfunctor
class CFastPlaneCopyDiv {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst /= src;
	}
};

//	転送元から減衰率指定付のブレンド転送のためのfunctor
class CFastPlaneCopyMulAlpha {
public:
	CFastPlaneCopyMulAlpha(DWORD alpha) : _alpha(alpha){};// { _alpha=alpha; }
	//	↑ここで指定するのは、減衰率

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.dmul(src,_alpha);
	}

private:
	const DWORD	_alpha;
};

//	転送元から減衰率指定付のブレンド転送のためのfunctor
class CFastPlaneCopyMulAlphaAB {
public:
	CFastPlaneCopyMulAlphaAB(DWORD srcalpha,DWORD dstalpha) {
		_srcalpha=srcalpha;
		_dstalpha=dstalpha;
	}
	//	↑ここで指定するのは、減衰率

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.dmul(src,_srcalpha,_dstalpha);
	}

private:
	DWORD	_srcalpha;
	DWORD	_dstalpha;
};


//	転送元からの定数倍加色コピーのためのfunctor
class CFastPlaneCopyAddMulConst {
public:
	CFastPlaneCopyAddMulConst(DWORD alpha) : _alpha(alpha) {}
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		_SRC tmp = src;
		tmp *= _alpha;
		dst += tmp;
//		dst += (_SRC(src)*=_alpha);
	}

private:
	DWORD	_alpha;
};

//	転送元からの抜き色つき定数倍加色コピーのためのfunctor
template <class _TYPE>
class CFastPlaneCopyAddMulConstSrcColorKey {
public:
	CFastPlaneCopyAddMulConstSrcColorKey(_TYPE rgb,DWORD alpha) : _alpha(alpha) { _colorkey = rgb; }
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB()){
			_SRC tmp = src;
			tmp *= _alpha;
			dst += tmp;
		}
	}

private:
	DWORD	_alpha;
	_TYPE	_colorkey;
};


//	転送元からの定数倍減色コピーのためのfunctor
class CFastPlaneCopySubMulConst {
public:
	CFastPlaneCopySubMulConst(DWORD alpha) : _alpha(alpha) {}
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		_SRC tmp = src;
		tmp *= _alpha;
		dst -= tmp;
	}

private:
	DWORD	_alpha;
};

//	転送元からの抜き色つき定数倍減色コピーのためのfunctor
template <class _TYPE>
class CFastPlaneCopySubMulConstSrcColorKey {
public:
	CFastPlaneCopySubMulConstSrcColorKey(_TYPE rgb,DWORD alpha) : _alpha(alpha) { _colorkey = rgb; }
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB()){
			_SRC tmp = src;
			tmp *= _alpha;
			dst -= tmp;
		}
	}

private:
	DWORD	_alpha;
	_TYPE	_colorkey;
};


//	埋めるFillColor
template <class _DST>
class CFastPlaneFillColor {
public:
	CFastPlaneFillColor(const _DST fill) { _fill=fill; }
	//	↑ここで指定するのは、減衰率

	inline void operator () (_DST& dst,_DST& src) const {
		dst = _fill;
	}

private:
	_DST	_fill;
};

//	最上位をクリアする
class CFastPlaneClearAlpha {
public:
	template <class _DST>
	inline void operator () (_DST& dst,_DST& src) const {
		dst.SetA(0);
	}
};

//	RGB値の反転
class CFastPlaneFlush {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.SetRGB (src.GetRGB() ^ 0xffffff);
	}
	inline void operator () (CFastPlaneRGB565& dst,CFastPlaneRGB565 & src) const {
		dst.SetRGB (src.GetRGB() ^ 0xffff);
	}
	inline void operator () (CFastPlaneRGB555& dst,CFastPlaneRGB555 & src) const {
		dst.SetRGB (src.GetRGB() ^ 0x7fff);
	}
	inline void operator () (CFastPlaneBytePal& dst,CFastPlaneBytePal & src) const {
		dst.SetRGB (src.GetRGB() ^ 0xff);
	}
};

//	転送元カラーキー付きコピーのためのfunctor
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneCopySrcColorKey {
public:
	CFastPlaneCopySrcColorKey(_TYPE rgb){ _colorkey = rgb; }
	//	必ずDWORD形で渡すようにすれば、RGBの変換子が不要になるのだが、
	//	そうすると、RGBがDWORD長以上のピクセルフォーマットに対応できない

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst = src;
	}
private:
	_TYPE	_colorkey;
};

/*
	//	作ったけど、遅かった＾＾；；

//	転送元カラーキー付きコピーのためのfunctor
//		RGB565565,RGB555555のためのコピーfunctor
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneCopySrcColorKeyDouble {
public:
	CFastPlaneCopySrcColorKeyDouble(_TYPE rgb){ _colorkey = rgb; }

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		DWORD dwSrc = src.GetRGB();
		DWORD dwColorKey = _colorkey.GetRGB();
		DWORD dw = dwSrc ^ dwColorKey;

		//	ビット演算によるコピー (C) やねうらお

		//	下のみか？上のみか？あるいは両方か？
		dw = (((dw & 0x7fff7fff) + 0x7fff7fff) | dw) & 0x80008000;
		//	この部分、RGB555555ならば、単に
		//	(dw + 0x7fff7fff) & 0x80008000で済むのだが、、

		//	マスク生成
		dw = ((dw >> 15) + 0x7fff7fff) ^ 0x7fff7fff;

		DWORD dwDst = dst.GetRGB();
		dst.SetRGB( (dwSrc & dw) | (dwDst & ~dw));

	}
private:
	_TYPE	_colorkey;
};
*/

//	転送元カラーキー付きコピーのためのfunctor
//		(Srcがα付き画像ならば、alpha付きの転送となる)
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneBlendSrcColorKey {
public:
	CFastPlaneBlendSrcColorKey(const _TYPE dw): _colorkey(dw){}

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst *= src;
	}
private:
	_TYPE	_colorkey;
};

//	転送元カラーキー付きブレンドコピーのためのfunctor
//		α付き画像のフェード化転送に使う
//		(Srcがα付きのコンテナならば、alpha付きの転送となるが、
//		Srcがα付きのコンテナでなければ、alphaは付かない。単なる半透明）
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneBlendMulAlphaSrcColorKey {
public:
	CFastPlaneBlendMulAlphaSrcColorKey(const _TYPE dw,const DWORD byRate): _colorkey(dw),_nRate(byRate){}

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst.dmul(src,_nRate);
	}
private:
	const _TYPE	_colorkey;
	const DWORD	_nRate;	//	半透明比率
};

//	↑上のの、αβブレンド版
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneBlendMulAlphaSrcColorKeyAB {
public:
	CFastPlaneBlendMulAlphaSrcColorKeyAB(_TYPE dw,DWORD bySrcRate,DWORD byDstRate): _colorkey(dw),_nSrcRate(bySrcRate),_nDstRate(byDstRate){}

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst.dmul(src,_nSrcRate,_nDstRate);
	}
private:
	_TYPE	_colorkey;
	DWORD	_nSrcRate;	//	転送元半透明比率
	DWORD	_nDstRate;	//	転送先半透明比率
};


//	転送元カラーキー付きAddColorのためのfunctor
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneCopyAddSrcColorKey {
public:
	CFastPlaneCopyAddSrcColorKey(const _TYPE dw){ _colorkey = dw; }

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst += src;
	}
private:
	_TYPE	_colorkey;
};

//	転送元カラーキー付きAddColorのためのfunctor
template <class _TYPE>
	//	_TYPE　⇒　WORD,DWORD,..
class CFastPlaneCopySubSrcColorKey {
public:
	CFastPlaneCopySubSrcColorKey(const _TYPE dw){ _colorkey = dw; }

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst -= src;
	}
private:
	_TYPE	_colorkey;
};


//	Blueを、αに突っ込むときに、リニアなマッピングを行なう
class CFastPlaneBltToAlpha {
public:
	CFastPlaneBltToAlpha(int nSrcMin,int nSrcMax,int nDstMin,int nDstMax){
		//	マッピングテーブルは毎回作りなおす
		int i,j;
		for(i=0;(i<=nSrcMin) && (i<256);++i){
			_abyTable[i] = (BYTE)nDstMin;
		}

		//	範囲外に対する処理の改善
		i = nSrcMin+1; if (i<0) { i=0; }
		for(j=1,i=nSrcMin+1;(i<nSrcMax) && (i<256);++i,++j) {

			//	nSrcMin == nSrcMaxであることはありえない
			//	(ループ条件 nSrcMin+1 ～ nSrcMax-1までなので)
			int n = (nDstMin + j * (nDstMax-nDstMin) / (nSrcMax - nSrcMin));

			if (n <0) n = 0; ef ( n>255) n = 255;
			_abyTable[i] = n;
		}
		i = nSrcMax; if (i<0) i=0;
		for(;i<256;++i)
			_abyTable[i] = (BYTE)nDstMax;
	}

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.SetA(_abyTable[src.GetB()]);
	}
private:
	BYTE _abyTable[256];
};

//	転送元からの定数加色のためのfunctor
template <class _TYPE>
class CFastPlaneConstAdd {
public:
	CFastPlaneConstAdd(COLORREF rgb){
		_rgb.SetR(rgb	  & 0xff);
		_rgb.SetG((rgb>>8) & 0xff);
		_rgb.SetB((rgb>>16)& 0xff);
	}

	template <class _DST>
	inline void operator () (_DST& dst,_DST& src) const {
		dst += _rgb;
	}
	_TYPE _rgb;
};

//	転送元からの減色コピーのためのfunctor
template <class _TYPE>
class CFastPlaneConstSub {
public:
	CFastPlaneConstSub(COLORREF rgb){
		_rgb.SetR(rgb	  & 0xff);
		_rgb.SetG((rgb>>8) & 0xff);
		_rgb.SetB((rgb>>16)& 0xff);
	}

	template <class _DST>
	inline void operator () (_DST& dst,_DST& src) const {
		dst -= _rgb;
	}
	_TYPE _rgb;
};

//	転送元からの定数乗算コピーのためのfunctor
class CFastPlaneConstMul {
public:
	CFastPlaneConstMul(DWORD nRate): _nRate(nRate) {}

	template <class _DST>
	inline void operator () (_DST& dst,_DST& src) const {
		dst *= _nRate;
	}
	DWORD _nRate;
};

//	α以外のコピーのためのfunctor
class CFastPlaneCopyWithoutAlpha {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.CopyWithoutAlpha(src);
	}
};

//	α値を反転させる
class CFastPlaneFlushAlpha {
public:
	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src) const {
		dst.FlushAlpha(src);
	}
};

//////////////////////////////////////////////////////////////////////////////
//	(CSrc*,CDst*,nSrcX,nSrcY)を要求するタイプの転送functor
//////////////////////////////////////////////////////////////////////////////

//	転送元からのコピーのためのfunctor
//		CFastPlane::BltFastAlphaMask16の転送に使う
class CFastPlaneCopySrcMask16dmul {
public:
	CFastPlaneCopySrcMask16dmul(BYTE*abyAlphaTable) : _abyAlphaTable(abyAlphaTable) {}

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src,int nSrcX,int nSrcY) const {
		dst.dmul(src,_abyAlphaTable[(nSrcX & 0xf) + ((nSrcY & 0xf)<<4)]);
			//	↑この乗算は定義されているはず．．
	}
	BYTE *_abyAlphaTable;	//	16*16 = 256サイズ
};

//	転送元カラーキー付きコピーのためのfunctor
//		CFastPlane::BltAlphaMask16の転送に使う
template <class _TYPE>
class CFastPlaneCopySrcColorKeyMask16dmul {
public:
	CFastPlaneCopySrcColorKeyMask16dmul(_TYPE rgb,BYTE *abyAlphaTable) : _abyAlphaTable(abyAlphaTable){ _colorkey = rgb; }
	//	必ずDWORD形で渡すようにすれば、RGBの変換子が不要になるのだが、
	//	そうすると、RGBがDWORD長以上のピクセルフォーマットに対応できない

	template <class _DST,class _SRC>
	inline void operator () (_DST& dst,_SRC& src,int nSrcX,int nSrcY) const {
		if (src.GetRGB() != _colorkey.GetRGB())
			dst.dmul(src,_abyAlphaTable[(nSrcX & 0xf) + ((nSrcY & 0xf)<<4)]);
			//	↑この乗算は定義されているはず．．
	}
private:
	_TYPE	_colorkey;
	BYTE *_abyAlphaTable;	//	16*16 = 256サイズ
};

//////////////////////////////////////////////////////////////////////////////
//	転送のためのfunctor
//////////////////////////////////////////////////////////////////////////////

class CFastPlaneEffect {
public:
	//	メンバ関数テンプレートサポートしてんねやろな…

	//	---- そのプレーンに対するEffectをかける関数
	// @yo2 0x00475850 template Effect (arity)
	// @yo2 0x004759b0 template Effect (arity)
	// @yo2 0x00475a90 template Effect (arity)
	// @yo2 0x00475b70 template Effect (arity)
	// @yo2 0x00475cb0 template Effect (arity)
	// @yo2 0x00475df0 template Effect (arity)
	// @yo2 0x00475ed0 template Effect (arity)
	// @yo2 0x004a4920 template Effect
	// @yo2 0x004a4b00 template Effect
	// @yo2 0x004a4ce0 template Effect
	// @yo2 0x004a4dd0 template Effect
	// @yo2 0x004a4ec0 template Effect
	// @yo2 0x004a5050 template Effect
	// @yo2 0x004a51e0 template Effect
	// @yo2 0x004a5350 template Effect
	// @yo2 0x004a7c90 template Effect
	// @yo2 0x004a7dc0 template Effect
	// @yo2 0x004b9b40 template Effect
	// @yo2 0x004b9b80 template Effect
	// @yo2 0x004b9ec0 template Effect (arity)
	// @yo2 0x004ba2d0 template Effect (arity)
	// @yo2 0x004ba6e0 template Effect (arity)
	// @yo2 0x004baa30 template Effect (arity)
	// @yo2 0x004bb0a0 template Effect (arity)
	// @yo2 0x004bb4a0 template Effect (arity)
	// @yo2 0x004bb8a0 template Effect (arity)
	// @yo2 0x004bbc00 template Effect (arity)
	// @yo2 0x004ec980 template Effect
	// @yo2 0x004ecca0 template Effect
	// @yo2 0x004ecfc0 template Effect
	// @yo2 0x004ed300 template Effect
	// @yo2 0x004ed640 template Effect
	// @yo2 0x004edac0 template Effect
	// @yo2 0x004edf40 template Effect
	// @yo2 0x004ee280 template Effect
	template <class SrcClass,class EffectFunctor>
	static LRESULT Effect(SrcClass _src,CFastPlaneInfo* pInfo,EffectFunctor f,LPRECT lpRect=NULL){
		WARNING(pInfo->GetPtr() == NULL,"CFastPlaneEffect::EffectでpInfo->GetPtr() == NULL");
		RECT r = pInfo->GetClipRect(lpRect);
		LONG lPitch	 = pInfo->GetPitch();
		SrcClass* pSurface = (SrcClass*)pInfo->GetPtr();

		//	8ループ展開
		int nLoop8 = (r.right - r.left);
		//	8ループ余り
		int nLoop8mod = nLoop8 & 7;
		nLoop8 >>= 3;

		for(int y=r.top;y<r.bottom;y++){
			SrcClass *p = (SrcClass *)((BYTE*)pSurface + y*lPitch + r.left*sizeof(SrcClass));

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
			}
		}
		return 0;
	}

	//	---- そのプレーンに対してMosaicをかける関数
	//	（こんな関数作りたく無いんだが．．）
	// @yo2 0x004a3eb0 template EffectMosaic
	// @yo2 0x004a4060 template EffectMosaic
	// @yo2 0x004a41d0 template EffectMosaic
	// @yo2 0x004a4340 template EffectMosaic
	// @yo2 0x004a44c0 template EffectMosaic
	// @yo2 0x004a4640 template EffectMosaic
	// @yo2 0x004a47b0 template EffectMosaic
	template <class SrcClass>
	static LRESULT EffectMosaic(SrcClass _src,CFastPlaneInfo* pInfo,int nMosaicLevel,LPRECT lpRect=NULL){
		WARNING(pInfo->GetPtr() == NULL,"CFastPlaneEffect::EffectでpInfo->GetPtr() == NULL");
		RECT r = pInfo->GetClipRect(lpRect);
		LONG lPitch	 = pInfo->GetPitch();
		SrcClass* pSurface = (SrcClass*)pInfo->GetPtr();

		int d = nMosaicLevel;
		for(int y=r.top;y<r.bottom;y+=d){
			int d2;		//	下端の端数
			if (y+d>r.bottom) d2=r.bottom-y; else d2=d;
			for(int x=r.left;x<r.right;x+=d){
				int d1;	//	右端の端数
				if (x+d>r.right) d1=r.right-x; else d1=d;
				
				SrcClass *p,*p2;
				p = (SrcClass*)((BYTE*)pSurface + y*lPitch + x * sizeof(SrcClass));
				SrcClass c;	// 代表点の色
				c = *p;
				for(int py=0;py<d2;py++){
					p2 = p;
					for(int px=0;px<d1;px++){
						*(p++) = c;
					}
					p = (SrcClass*)((BYTE*)p2 + lPitch);	//	next line
				}
			}
		}

		return 0;
	}

	//	---- 転送のときになんやかやする関数
	// @yo2 0x00423a40 template Blt
	// @yo2 0x00435e80 template Blt
	// @yo2 0x004432b0 template Blt
	// @yo2 0x00454dd0 template Blt
	// @yo2 0x00456890 template Blt
	// @yo2 0x00456e60 template Blt
	// @yo2 0x004571b0 template Blt
	// @yo2 0x0045f9e0 template Blt (arity)
	// @yo2 0x0045ff00 template Blt
	// @yo2 0x00460440 template Blt (arity)
	// @yo2 0x00460980 template Blt (arity)
	// @yo2 0x00460d20 template Blt (arity)
	// @yo2 0x00461270 template Blt (arity)
	// @yo2 0x004617b0 template Blt (arity)
	// @yo2 0x00461bc0 template Blt (arity)
	// @yo2 0x00462010 template Blt
	// @yo2 0x004624f0 template Blt (arity)
	// @yo2 0x004629c0 template Blt (arity)
	// @yo2 0x00462ea0 template Blt (arity)
	// @yo2 0x004633f0 template Blt (arity)
	// @yo2 0x00463930 template Blt (arity)
	// @yo2 0x00463d80 template Blt (arity)
	// @yo2 0x00464190 template Blt
	// @yo2 0x00464670 template Blt (arity)
	// @yo2 0x00464b40 template Blt (arity)
	// @yo2 0x00465020 template Blt (arity)
	// @yo2 0x004654f0 template Blt (arity)
	// @yo2 0x00465a30 template Blt (arity)
	// @yo2 0x00465f70 template Blt
	// @yo2 0x004663a0 template Blt
	// @yo2 0x004667d0 template Blt
	// @yo2 0x00466b20 template Blt
	// @yo2 0x00466ff0 template Blt
	// @yo2 0x004674d0 template Blt (arity)
	// @yo2 0x00467a10 template Blt (arity)
	// @yo2 0x00467f50 template Blt (arity)
	// @yo2 0x00468380 template Blt (arity)
	// @yo2 0x004687b0 template Blt
	// @yo2 0x00468c90 template Blt (arity)
	// @yo2 0x00468fe0 template Blt (arity)
	// @yo2 0x004694c0 template Blt (arity)
	// @yo2 0x00469990 template Blt (arity)
	// @yo2 0x00469f10 template Blt (arity)
	// @yo2 0x0046a490 template Blt (arity)
	// @yo2 0x0046a9b0 template Blt (arity)
	// @yo2 0x0046aed0 template Blt (arity)
	// @yo2 0x0046b400 template Blt (arity)
	// @yo2 0x0046b930 template Blt (arity)
	// @yo2 0x0046bcf0 template Blt (arity)
	// @yo2 0x0046c310 template Blt
	// @yo2 0x0046c8d0 template Blt (arity)
	// @yo2 0x0046cea0 template Blt (arity)
	// @yo2 0x0046d420 template Blt (arity)
	// @yo2 0x0046d9a0 template Blt (arity)
	// @yo2 0x0046dec0 template Blt (arity)
	// @yo2 0x0046e3e0 template Blt (arity)
	// @yo2 0x0046e920 template Blt (arity)
	// @yo2 0x0046ee60 template Blt (arity)
	// @yo2 0x0046f5d0 template Blt (arity)
	// @yo2 0x0046f990 template Blt
	// @yo2 0x0046ff50 template Blt (arity)
	// @yo2 0x00470520 template Blt (arity)
	// @yo2 0x00470a60 template Blt (arity)
	// @yo2 0x00470fa0 template Blt (arity)
	// @yo2 0x004713d0 template Blt (arity)
	// @yo2 0x00471800 template Blt (arity)
	// @yo2 0x00471ce0 template Blt (arity)
	// @yo2 0x004721b0 template Blt
	// @yo2 0x00472780 template Blt (arity)
	// @yo2 0x00472cc0 template Blt (arity)
	// @yo2 0x00473200 template Blt (arity)
	// @yo2 0x00473630 template Blt (arity)
	// @yo2 0x00473a60 template Blt (arity)
	// @yo2 0x00473f40 template Blt (arity)
	// @yo2 0x00474410 template Blt (arity)
	// @yo2 0x004749f0 template Blt (arity)
	// @yo2 0x00474fd0 template Blt
	// @yo2 0x00475500 template Blt (arity)
	// @yo2 0x00475fb0 template Blt
	// @yo2 0x00476510 template Blt
	// @yo2 0x00476920 template Blt
	// @yo2 0x00476d30 template Blt
	// @yo2 0x00477290 template Blt
	// @yo2 0x004777c0 template Blt
	// @yo2 0x00477c70 template Blt
	// @yo2 0x00478120 template Blt
	// @yo2 0x00478690 template Blt
	// @yo2 0x00478bd0 template Blt
	// @yo2 0x00479080 template Blt
	// @yo2 0x00479550 template Blt
	// @yo2 0x00479900 template Blt
	// @yo2 0x00479cb0 template Blt
	// @yo2 0x0047a190 template Blt
	// @yo2 0x0047a670 template Blt
	// @yo2 0x0047aa00 template Blt
	// @yo2 0x0047ad90 template Blt
	// @yo2 0x0047b1e0 template Blt
	// @yo2 0x0047b630 template Blt
	// @yo2 0x0047ba60 template Blt
	// @yo2 0x0047be90 template Blt
	// @yo2 0x0047c3e0 template Blt
	// @yo2 0x0047c930 template Blt
	// @yo2 0x0047ce00 template Blt
	// @yo2 0x0047ce50 template Blt
	// @yo2 0x0047cea0 template Blt
	// @yo2 0x0047cee0 template Blt
	// @yo2 0x0047cf20 template Blt
	// @yo2 0x0047d0a0 template Blt
	// @yo2 0x0047d1d0 template Blt
	// @yo2 0x0047d220 template Blt
	// @yo2 0x0047e190 template Blt
	// @yo2 0x0047e210 template Blt
	// @yo2 0x00484760 template Blt
	// @yo2 0x00486010 template Blt
	// @yo2 0x00486040 template Blt
	// @yo2 0x004866d0 template Blt
	// @yo2 0x00486f70 template Blt
	// @yo2 0x00487810 template Blt
	// @yo2 0x00488030 template Blt
	// @yo2 0x00488850 template Blt
	// @yo2 0x00488ed0 template Blt
	// @yo2 0x00489550 template Blt
	// @yo2 0x00489d50 template Blt
	// @yo2 0x0048a5d0 template Blt
	// @yo2 0x0048ae30 template Blt
	// @yo2 0x0048b680 template Blt
	// @yo2 0x0048bff0 template Blt
	// @yo2 0x0048c990 template Blt
	// @yo2 0x0048d1b0 template Blt
	// @yo2 0x0048d9d0 template Blt
	// @yo2 0x0048e140 template Blt
	// @yo2 0x0048e8e0 template Blt
	// @yo2 0x0048f080 template Blt
	// @yo2 0x0048f760 template Blt
	// @yo2 0x0048fe40 template Blt
	// @yo2 0x00490640 template Blt
	// @yo2 0x00490d10 template Blt
	// @yo2 0x00491500 template Blt
	// @yo2 0x00491d00 template Blt
	// @yo2 0x004924f0 template Blt
	// @yo2 0x00492ce0 template Blt
	// @yo2 0x00493480 template Blt
	// @yo2 0x00493c20 template Blt
	// @yo2 0x00494310 template Blt
	// @yo2 0x004949f0 template Blt
	// @yo2 0x004950f0 template Blt
	// @yo2 0x00495630 template Blt
	// @yo2 0x00495b70 template Blt
	// @yo2 0x00496320 template Blt
	// @yo2 0x00496ab0 template Blt
	// @yo2 0x00497200 template Blt
	// @yo2 0x00497950 template Blt
	// @yo2 0x004981a0 template Blt
	// @yo2 0x00498a10 template Blt
	// @yo2 0x00499120 template Blt
	// @yo2 0x00499840 template Blt
	// @yo2 0x00499f60 template Blt
	// @yo2 0x0049a670 template Blt
	// @yo2 0x0049ad80 template Blt
	// @yo2 0x0049b430 template Blt
	// @yo2 0x0049bae0 template Blt
	// @yo2 0x0049c280 template Blt
	// @yo2 0x0049ca20 template Blt
	// @yo2 0x0049d0e0 template Blt
	// @yo2 0x0049d7b0 template Blt
	// @yo2 0x0049dfc0 template Blt
	// @yo2 0x0049e7d0 template Blt
	// @yo2 0x0049ef00 template Blt
	// @yo2 0x0049f630 template Blt
	// @yo2 0x0049fba0 template Blt
	// @yo2 0x004a03e0 template Blt
	// @yo2 0x004a0c20 template Blt
	// @yo2 0x004a1430 template Blt
	// @yo2 0x004a1c50 template Blt
	// @yo2 0x004a25c0 template Blt
	// @yo2 0x004a2f30 template Blt
	// @yo2 0x004a36f0 template Blt
	// @yo2 0x004a54c0 template Blt
	// @yo2 0x004a5910 template Blt
	// @yo2 0x004a5d60 template Blt
	// @yo2 0x004a61b0 template Blt
	// @yo2 0x004a6590 template Blt
	// @yo2 0x004a6950 template Blt
	// @yo2 0x004a6d30 template Blt
	// @yo2 0x004a7110 template Blt
	// @yo2 0x004a7470 template Blt
	// @yo2 0x004a7880 template Blt
	// @yo2 0x004add20 template Blt
	// @yo2 0x004addb0 template Blt
	// @yo2 0x004ade40 template Blt
	// @yo2 0x004adf00 template Blt
	// @yo2 0x004adf90 template Blt
	// @yo2 0x004ae020 template Blt
	// @yo2 0x004ae0f0 template Blt
	// @yo2 0x004ae180 template Blt
	// @yo2 0x004ae210 template Blt
	// @yo2 0x004ae2f0 template Blt
	// @yo2 0x004bbf60 template Blt (arity)
	// @yo2 0x004bc850 template Blt (arity)
	// @yo2 0x004bd140 template Blt (arity)
	// @yo2 0x004bd910 template Blt (arity)
	// @yo2 0x004beb40 template Blt (arity)
	// @yo2 0x004bf210 template Blt (arity)
	// @yo2 0x004bf8e0 template Blt (arity)
	// @yo2 0x004bfe80 template Blt (arity)
	// @yo2 0x004c0420 template Blt (arity)
	// @yo2 0x004c0ce0 template Blt (arity)
	// @yo2 0x004c15d0 template Blt (arity)
	// @yo2 0x004c1d00 template Blt (arity)
	// @yo2 0x004c2430 template Blt
	// @yo2 0x004c2ba0 template Blt
	// @yo2 0x004c3230 template Blt
	// @yo2 0x004c38b0 template Blt
	// @yo2 0x004c3e90 template Blt
	// @yo2 0x004c44d0 template Blt
	// @yo2 0x004c4c50 template Blt
	// @yo2 0x004c53d0 template Blt
	// @yo2 0x004c59c0 template Blt
	// @yo2 0x004c5fb0 template Blt
	// @yo2 0x004c6690 template Blt
	// @yo2 0x004c6dc0 template Blt
	// @yo2 0x004c7440 template Blt
	// @yo2 0x004c7ac0 template Blt (arity)
	// @yo2 0x004c8350 template Blt (arity)
	// @yo2 0x004c8c30 template Blt (arity)
	// @yo2 0x004ca1a0 template Blt (arity)
	// @yo2 0x004caa10 template Blt (arity)
	// @yo2 0x004cb280 template Blt (arity)
	// @yo2 0x004cba40 template Blt (arity)
	// @yo2 0x004cc1e0 template Blt (arity)
	// @yo2 0x004cca20 template Blt (arity)
	// @yo2 0x004cd250 template Blt (arity)
	// @yo2 0x004cda10 template Blt (arity)
	// @yo2 0x004ce170 template Blt (arity)
	// @yo2 0x004cea00 template Blt (arity)
	// @yo2 0x004cf290 template Blt (arity)
	// @yo2 0x004cfa30 template Blt (arity)
	// @yo2 0x004d0d20 template Blt (arity)
	// @yo2 0x004d1420 template Blt (arity)
	// @yo2 0x004d1b20 template Blt (arity)
	// @yo2 0x004d20f0 template Blt (arity)
	// @yo2 0x004d26c0 template Blt (arity)
	// @yo2 0x004d2f20 template Blt (arity)
	// @yo2 0x004d37b0 template Blt (arity)
	// @yo2 0x004d3e80 template Blt (arity)
	// @yo2 0x004d4550 template Blt
	// @yo2 0x004d4cc0 template Blt
	// @yo2 0x004d5350 template Blt
	// @yo2 0x004d5a10 template Blt
	// @yo2 0x004d60a0 template Blt
	// @yo2 0x004d6770 template Blt
	// @yo2 0x004d6f10 template Blt
	// @yo2 0x004d76b0 template Blt
	// @yo2 0x004d7cd0 template Blt
	// @yo2 0x004d82f0 template Blt
	// @yo2 0x004d89c0 template Blt
	// @yo2 0x004d90a0 template Blt
	// @yo2 0x004d96e0 template Blt
	// @yo2 0x004d9d20 template Blt (arity)
	// @yo2 0x004da560 template Blt (arity)
	// @yo2 0x004dadf0 template Blt (arity)
	// @yo2 0x004dc390 template Blt (arity)
	// @yo2 0x004dcbb0 template Blt (arity)
	// @yo2 0x004dd3d0 template Blt (arity)
	// @yo2 0x004ddb90 template Blt (arity)
	// @yo2 0x004de3b0 template Blt (arity)
	// @yo2 0x004deb60 template Blt (arity)
	// @yo2 0x004df300 template Blt (arity)
	// @yo2 0x004dfab0 template Blt (arity)
	// @yo2 0x004e0210 template Blt
	// @yo2 0x004e0a20 template Blt
	// @yo2 0x004e1210 template Blt
	// @yo2 0x004e19d0 template Blt
	// @yo2 0x004e2000 template Blt
	// @yo2 0x004e2610 template Blt
	// @yo2 0x004e2ed0 template Blt
	// @yo2 0x004e3790 template Blt
	// @yo2 0x004e3f30 template Blt
	// @yo2 0x004e46b0 template Blt
	// @yo2 0x004e4e60 template Blt
	// @yo2 0x004e5650 template Blt
	// @yo2 0x004e5e20 template Blt
	// @yo2 0x004e65d0 template Blt
	// @yo2 0x004e6de0 template Blt
	// @yo2 0x004e75d0 template Blt
	// @yo2 0x004e7d90 template Blt
	// @yo2 0x004e83d0 template Blt
	// @yo2 0x004e89f0 template Blt
	// @yo2 0x004e92b0 template Blt
	// @yo2 0x004e9b70 template Blt
	// @yo2 0x004ea310 template Blt
	// @yo2 0x004eaa90 template Blt
	// @yo2 0x004eb230 template Blt
	// @yo2 0x004eba00 template Blt
	// @yo2 0x004ec1d0 template Blt
	// @yo2 0x004ee5c0 template Blt
	// @yo2 0x004ee650 template Blt
	// @yo2 0x004ee6e0 template Blt
	// @yo2 0x004eeb40 template Blt
	// @yo2 0x004eebe0 template Blt
	// @yo2 0x004eec70 template Blt
	// @yo2 0x004ef0e0 template Blt
	// @yo2 0x004ef200 template Blt
	// @yo2 0x004ef320 template Blt
	// @yo2 0x004ef460 template Blt
	// @yo2 0x004ef590 template Blt
	// @yo2 0x004ef6b0 template Blt
	template <class SrcClass,class DstClass,class BltFunctor>
	static LRESULT Blt(SrcClass _src,CFastPlaneInfo* lpSrcInfo,DstClass _dst
	,CFastPlaneInfo* lpDstInfo,BltFunctor f,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){

		WARNING(lpSrcInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpSrcInfo->GetPtr() == NULL");
		WARNING(lpDstInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpDstInfo->GetPtr() == NULL");

		//	LONG lPitch	 = pInfo->GetPitch();
		//	DWORD* pSurface = pInfo->GetPtr();

		//	CDIB32Base* srcp = lpSrcDIB->GetDIB32BasePtr();
		//	CDIB32Base* dstp = lpDstDIB->GetDIB32BasePtr();

		// クリッピング等の処理
		// 転送範囲なしの時は、このまま帰る
		CFastPlaneEffectClipper clip;
		if ( Clipping( lpDstInfo , lpSrcInfo , x, y, &clip,lpSrcRect, lpDstSize, lpClipRect ) != 0 ) return 1;

		RECT rcSrcRect = clip.rcSrcRect;
		RECT rcDstRect = clip.rcDstRect;
//		RECT rcClipRect = clip.rcClipRect;
		
		// 転送先の横幅と縦幅の設定
		int		nDstWidth = rcDstRect.right - rcDstRect.left;
		int		nDstHeight = rcDstRect.bottom - rcDstRect.top;
		int		nSrcWidth = rcSrcRect.right - rcSrcRect.left;
		LONG	lPitchSrc = lpSrcInfo->GetPitch();
		LONG	lPitchDst = lpDstInfo->GetPitch();
		LONG	nAddSrcWidth = lpSrcInfo->GetPitch() - (nSrcWidth * sizeof(SrcClass));	// クリッピングして飛ばす分の算出
		LONG	nAddDstWidth = lpDstInfo->GetPitch() - (nDstWidth * sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
		SrcClass*	lpSrc = (SrcClass*)((BYTE*)lpSrcInfo->GetPtr() +(rcSrcRect.left*sizeof(SrcClass))+rcSrcRect.top*lPitchSrc );		// クリッピング部分のカット
		DstClass*	lpDst = (DstClass*)((BYTE*)lpDstInfo->GetPtr() +(rcDstRect.left*sizeof(DstClass))+rcDstRect.top*lPitchDst );		// 指定されたx,yの位置調整

		if ( clip.bActualSize ){
			//等倍

			//	'01/10/05	やねうらお改造
			//	8ループ展開
			int nLoop8 = nDstWidth;
			//	8ループ余り
			int nLoop8mod = nLoop8 & 7;
			nLoop8 >>= 3;

			nAddSrcWidth+=nLoop8mod*sizeof(SrcClass);
			nAddDstWidth+=nLoop8mod*sizeof(DstClass);

			for(int y=0;y<nDstHeight;y++){
				int n;	// [portable] MSVC6 for-scope: n is used after the loop
				for(n=0;n<nLoop8;n++){
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
				//	lpDst+=nLoop8mod; lpSrc+=nLoop8mod;
				//	↑これは、下のnAddDst/SrcWidthに事前加算してある！

				lpDst = (DstClass*) ( (LPBYTE)lpDst+nAddDstWidth);
				lpSrc = (SrcClass*) ( (LPBYTE)lpSrc+nAddSrcWidth);
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
			DWORD	AddSrcPixel = sizeof(SrcClass) * nStepsX;
			DWORD	AddWidthSrc = lpSrcInfo->GetPitch() * nStepsY;
			DWORD	nAddSrcHeight= lpSrcInfo->GetPitch() * nStepsY;						// y軸の整数部で加算される値
//			DWORD	nAddDstWidth = lpDstInfo->GetPitch() - (nWidth*sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;
			nEyCnt = EIY;
			for ( j = 0 ; j < nDstHeight ; j++ )
			{
				nEyCnt += EY;											// 転送元Yの小数部の加算
				if ( nEyCnt >= 0 )
				{
					lpSrc = (SrcClass*)((BYTE*)lpSrc + lPitchSrc );		// 転送元Yを次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}

				SrcClass*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nDstWidth ; i++ )
				{
					nExCnt += EX;		// 転送元のXの小数部の加算
					if ( nExCnt >= 0 )
					{
						lpSrc++;
						nExCnt -= EX2;	// Xの補正値
					}

					f(lpDst[i],*lpSrc);
					// 転送元のXの整数部の加算
					lpSrc = (SrcClass*)((BYTE*)lpSrc + AddSrcPixel);

//					lpDst++;			//	転送先のXを加算
				}
				lpSrc = (SrcClass*)((BYTE*)lpSrcBack + nAddSrcHeight );	// 転送元Xループで進んだ分戻し、y軸の整数部を加算する
				lpDst = (DstClass*)((BYTE*)lpDst + lPitchDst );		//	転送先の整数部の加算
			}
		}
		
		return 0;
	}

	//	---- そのプレーンに対するEffectをかける関数
	//	倍コピーサポート版
	// @yo2 0x004b9bc0 template EffectDouble (arity)
	// @yo2 0x004bad80 template EffectDouble (arity)
	template <class SrcClass,class SrcClass2
		,class EffectFunctor,class EffectFunctor2>
	static LRESULT EffectDouble(SrcClass _src,CFastPlaneInfo* pInfo
		,SrcClass2 _src2,EffectFunctor f,EffectFunctor2 f2,LPRECT lpRect=NULL){
		WARNING(pInfo->GetPtr() == NULL,"CFastPlaneEffect::EffectでpInfo->GetPtr() == NULL");
		RECT r = pInfo->GetClipRect(lpRect);
		LONG lPitch	 = pInfo->GetPitch();
		SrcClass* pSurface = (SrcClass*)pInfo->GetPtr();

		//	8ループ展開
		int nLoop8 = (r.right - r.left);
		//	左のDWORD境界
		bool bAlignFalse = (r.left & 1)!=0;
		if (bAlignFalse) nLoop8--;
		//	8ループ余り / 2
		int nLoop8mod = nLoop8 & 7;
		nLoop8 >>= 3;
		//	右のDWORD境界
		bool bAlignFalse2 = (nLoop8mod & 1)!=0;
		nLoop8mod >>= 1;

		for(int y=r.top;y<r.bottom;y++){
			SrcClass *p = (SrcClass *)((BYTE*)pSurface + y*lPitch + r.left*sizeof(SrcClass));

			//	端のWORDのみを先行して処理
			if (bAlignFalse) {
				f(*p,*p);
				p++;
			}

			//　一回の転送ごとに、ループのエンドチェックが必要だとしたら、割に合わない
			int n;	// [portable] MSVC6 for-scope: n is used after the loop
			for(n=0;n<nLoop8;n++){
				//	転送元から転送先へ、この関数エフェクトをかけながら転送
				f2(*(SrcClass2*)(p	),*(SrcClass2*)(p  ));
				f2(*(SrcClass2*)(p+2),*(SrcClass2*)(p+2));
				f2(*(SrcClass2*)(p+4),*(SrcClass2*)(p+4));
				f2(*(SrcClass2*)(p+6),*(SrcClass2*)(p+6));
				p+=8;
			}
			//	余剰分を、転送
			for (n=0;n<nLoop8mod;n++){
				f2(*(SrcClass2*)(p	),*(SrcClass2*)(p  ));
				p+=2;
			}
			//	端のWORDのみを処理
			if (bAlignFalse2) {
				f(*p,*p);
//				p++;
			}
		}
		return 0;
	}

	//	---- 転送のときになんやかやする関数
	//	倍コピーサポート版
	// @yo2 0x004c9430 template BltDouble (arity)
	// @yo2 0x004c9ae0 template BltDouble (arity)
	// @yo2 0x004db600 template BltDouble (arity)
	// @yo2 0x004dbcb0 template BltDouble (arity)
	template <class SrcClass,class DstClass,class SrcClass2,class DstClass2,class BltFunctor,class BltFunctor2>
	static LRESULT BltDouble(
		SrcClass _src,CFastPlaneInfo* lpSrcInfo,
		DstClass _dst,CFastPlaneInfo* lpDstInfo,
		SrcClass2 _src2,
		DstClass2 _dst2,
		BltFunctor f,
		BltFunctor2 f2,
		int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){

		WARNING(lpSrcInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpSrcInfo->GetPtr() == NULL");
		WARNING(lpDstInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpDstInfo->GetPtr() == NULL");

		//	LONG lPitch	 = pInfo->GetPitch();
		//	DWORD* pSurface = pInfo->GetPtr();

		//	CDIB32Base* srcp = lpSrcDIB->GetDIB32BasePtr();
		//	CDIB32Base* dstp = lpDstDIB->GetDIB32BasePtr();

		// クリッピング等の処理
		// 転送範囲なしの時は、このまま帰る
		CFastPlaneEffectClipper clip;
		if ( Clipping( lpDstInfo , lpSrcInfo , x, y, &clip,lpSrcRect, lpDstSize, lpClipRect ) != 0 ) return 1;
		
		RECT rcSrcRect = clip.rcSrcRect;
		RECT rcDstRect = clip.rcDstRect;
//		RECT rcClipRect = clip.rcClipRect;
		
		// 転送先の横幅と縦幅の設定
		int		nDstWidth = rcDstRect.right - rcDstRect.left;
		int		nDstHeight = rcDstRect.bottom - rcDstRect.top;
		int		nSrcWidth = rcSrcRect.right - rcSrcRect.left;
		LONG	lPitchSrc = lpSrcInfo->GetPitch();
		LONG	lPitchDst = lpDstInfo->GetPitch();
		LONG	nAddSrcWidth = lpSrcInfo->GetPitch() - (nSrcWidth * sizeof(SrcClass));	// クリッピングして飛ばす分の算出
		LONG	nAddDstWidth = lpDstInfo->GetPitch() - (nDstWidth * sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
		SrcClass*	lpSrc = (SrcClass*)((BYTE*)lpSrcInfo->GetPtr() +(rcSrcRect.left*sizeof(SrcClass))+rcSrcRect.top*lPitchSrc );		// クリッピング部分のカット
		DstClass*	lpDst = (DstClass*)((BYTE*)lpDstInfo->GetPtr() +(rcDstRect.left*sizeof(DstClass))+rcDstRect.top*lPitchDst );		// 指定されたx,yの位置調整

		if ( clip.bActualSize ){
			//等倍

			//	'01/10/05	やねうらお改造
			//	8ループ展開
			int nLoop8 = nDstWidth;
			//	DWORD境界
			bool bAlignFalse = (rcDstRect.left & 1)!=0;
			if (bAlignFalse) nLoop8--;
			//	8ループ余り / 2
			int nLoop8mod = nLoop8 & 7;
			nLoop8 >>= 3;
			//	右のDWORD境界
			bool bAlignFalse2 = (nLoop8mod & 1)!=0;
			nLoop8mod >>= 1;

			for(int y=0;y<nDstHeight;y++){

				//	端のWORDのみを先行して処理
				if (bAlignFalse) {
					f(*lpDst,*lpSrc);
					lpDst++; lpSrc++;
				}
				//	DWORD単位でコピー
				int n;	// [portable] MSVC6 for-scope: n is used after the loop
				for(n=0;n<nLoop8;n++){
					//	転送元から転送先へ、この関数エフェクトをかけながら転送
					f2(*(DstClass2*)(lpDst	),*(SrcClass2*)(lpSrc  ));
					f2(*(DstClass2*)(lpDst+2),*(SrcClass2*)(lpSrc+2));
					f2(*(DstClass2*)(lpDst+4),*(SrcClass2*)(lpSrc+4));
					f2(*(DstClass2*)(lpDst+6),*(SrcClass2*)(lpSrc+6));
					lpDst+=8; lpSrc+=8;
/*
				//	↑のコードはレジスタ割付が阻害されそうなので、
				//	どちらが速いかは微妙なところ．．

					f2(*(DstClass2*)(lpDst	),*(SrcClass2*)(lpSrc));
					lpDst+=2; lpSrc+=2;
					f2(*(DstClass2*)(lpDst)	 ,*(SrcClass2*)(lpSrc));
					lpDst+=2; lpSrc+=2;
					f2(*(DstClass2*)(lpDst)	 ,*(SrcClass2*)(lpSrc));
					lpDst+=2; lpSrc+=2;
					f2(*(DstClass2*)(lpDst)	 ,*(SrcClass2*)(lpSrc));
					lpDst+=2; lpSrc+=2;
*/
				}
				//	余剰分を、転送
				for (n=0;n<nLoop8mod;n++){
					f2(*(DstClass2*)(lpDst	),*(SrcClass2*)(lpSrc  ));
					lpDst+=2; lpSrc+=2;
				}
				//	端のWORDのみを処理
				if (bAlignFalse2) {
					f(*lpDst,*lpSrc);
					lpDst++; lpSrc++;
				}
				//	上記のインクリメント群はさらに最適化の余地があるが、
				//	面倒なので、これぐらいでええやろ．．
				lpDst = (DstClass*) ( (LPBYTE)lpDst+nAddDstWidth);
				lpSrc = (SrcClass*) ( (LPBYTE)lpSrc+nAddSrcWidth);
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
			DWORD	AddSrcPixel = sizeof(SrcClass) * nStepsX;
			DWORD	AddWidthSrc = lpSrcInfo->GetPitch() * nStepsY;
			DWORD	nAddSrcHeight= lpSrcInfo->GetPitch() * nStepsY;						// y軸の整数部で加算される値
//			DWORD	nAddDstWidth = lpDstInfo->GetPitch() - (nWidth*sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;
			nEyCnt = EIY;
			for ( j = 0 ; j < nDstHeight ; j++ )
			{
				nEyCnt += EY;											// 転送元Yの小数部の加算
				if ( nEyCnt >= 0 )
				{
					lpSrc = (SrcClass*)((BYTE*)lpSrc + lPitchSrc );		// 転送元Yを次のラインにする
					nEyCnt -= EY2;										// Yの補正値
				}

				SrcClass*	lpSrcBack = lpSrc;
				nExCnt = EIX;
				for ( i = 0 ; i < nDstWidth ; i++ )
				{
					nExCnt += EX;		// 転送元のXの小数部の加算
					if ( nExCnt >= 0 )
					{
						lpSrc++;
						nExCnt -= EX2;	// Xの補正値
					}

					f(lpDst[i],*lpSrc);
					// 転送元のXの整数部の加算
					lpSrc = (SrcClass*)((BYTE*)lpSrc + AddSrcPixel);

//					lpDst++;			//	転送先のXを加算
				}
				lpSrc = (SrcClass*)((BYTE*)lpSrcBack + nAddSrcHeight );	// 転送元Xループで進んだ分戻し、y軸の整数部を加算する
				lpDst = (DstClass*)((BYTE*)lpDst + lPitchDst );		//	転送先の整数部の加算
			}
		}
		
		return 0;
	}

	//	---- ｎ角形→ｎ角形へ転送する関数
	// @yo2 0x004f2c10 template Morph
	// @yo2 0x004f3c30 template Morph
	// @yo2 0x004f4c70 template Morph
	// @yo2 0x004f5cb0 template Morph
	// @yo2 0x004f6cf0 template Morph
	// @yo2 0x004f7d30 template Morph
	// @yo2 0x004f8cf0 template Morph
	// @yo2 0x004f9cb0 template Morph
	// @yo2 0x004facc0 template Morph
	// @yo2 0x004fbcd0 template Morph
	// @yo2 0x004fccf0 template Morph
	// @yo2 0x004fdd10 template Morph
	// @yo2 0x004fed20 template Morph
	// @yo2 0x004ffd30 template Morph
	// @yo2 0x00500d50 template Morph
	// @yo2 0x00501d70 template Morph
	// @yo2 0x00502d90 template Morph
	// @yo2 0x00503db0 template Morph
	// @yo2 0x00504da0 template Morph
	// @yo2 0x00505d90 template Morph
	// @yo2 0x00506db0 template Morph
	// @yo2 0x00507dd0 template Morph
	// @yo2 0x00508db0 template Morph
	// @yo2 0x00509d90 template Morph
	// @yo2 0x0050ad80 template Morph
	// @yo2 0x0050bd70 template Morph
	// @yo2 0x0050cd60 template Morph
	// @yo2 0x0050dd50 template Morph
	// @yo2 0x0050ed10 template Morph
	// @yo2 0x0050fcd0 template Morph
	// @yo2 0x00510cc0 template Morph
	// @yo2 0x00511cb0 template Morph
	// @yo2 0x00512c90 template Morph
	// @yo2 0x00513c70 template Morph
	// @yo2 0x00514c50 template Morph
	// @yo2 0x00515c30 template Morph
	// @yo2 0x00516c20 template Morph
	// @yo2 0x00517c10 template Morph
	// @yo2 0x00518bf0 template Morph
	// @yo2 0x00519bd0 template Morph
	// @yo2 0x0051abc0 template Morph
	// @yo2 0x0051bbb0 template Morph
	// @yo2 0x0051cb90 template Morph
	// @yo2 0x0051db70 template Morph
	// @yo2 0x0051eb40 template Morph
	// @yo2 0x0051fb10 template Morph
	// @yo2 0x00520af0 template Morph
	// @yo2 0x00521ad0 template Morph
	// @yo2 0x00522ac0 template Morph
	// @yo2 0x00523ab0 template Morph
	// @yo2 0x00524a90 template Morph
	template <class SrcClass,class DstClass,class BltFunctor>
	static LRESULT Morph(
		SrcClass		_src,				// 転送元プレーンのクラス
		CFastPlaneInfo*	lpSrcInfo,			// 転送元プレーンの情報
		DstClass		_dst,				// 転送先プレーンのクラス
		CFastPlaneInfo*	lpDstInfo,			// 転送先プレーンの情報
		BltFunctor		f,					// エフェクトのfunctor
		LPPOINT			lpSrcPoint,			// 転送元ｎ角形のｎ点(右まわりor 左まわり)の構造体
		LPPOINT			lpDstPoint,			// 転送先                      //
//		LPRECT			lpClipRect=NULL,	// クリッピングする転送先矩形(NULLならクリッピングなし)
		LPRECT			lpClipRect=NULL,	// クリッピングする転送先矩形(NULLならDestのRect全域)
		bool			bContinual=false,	// 隣り合わせにモーフィング転送した時の繋ぎ目を調整
		int				nAngle=4			// アングル数
		)
	{
		WARNING(lpSrcInfo->GetPtr() == NULL,"CFastPlaneEffect::MorphでlpSrcInfo->GetPtr() == NULL");
		WARNING(lpDstInfo->GetPtr() == NULL,"CFastPlaneEffect::MorphでlpDstInfo->GetPtr() == NULL");

		//--- 追加 '02/03/06  by ENRA ---
		// 下のコードだと、DstPointがDstRectからはみでてたら
		// オーバーアクセスするじゃん(;´Д`)
		if (lpClipRect==NULL) lpClipRect = lpDstInfo->GetRect();
		//-------------------------------

		#define POINT_SHIFT ( 20 )                 // 小数点以下のbit数
		#define POINT_ONE   ( 1<<POINT_SHIFT )     // 固定小数点の世界での 1, インクリメント時に使う
		#define POINT_HALF  ( 1<<(POINT_SHIFT-1) ) // 固定小数点の世界での 0.5, 四捨五入に使う

		// 始点と終点を持った構造体
		typedef struct {
			POINT	Start;
			POINT	End;
		} LINE;

		// 至るところで出てくるカウンタ
		int i;

		///////////////////////////////////////////////////////////////////////
		// 転送先の頂点列より、一番左上の点と、一番右下の点の配列番号を求める
		///////////////////////////////////////////////////////////////////////

		// 転送先頂点列のうち一番左上の(y座標が小さい)点と、一番右下の(y座標が大きい)点の配列番号を求める
		// 例) 4角形を考えると、y座標の大小関係が lpDstPoint[3] < lpDstPoint[1] < lpDstPoint[2] < lpDstPoint[0] だった場合
		// DstMinYIdx = 3 : 一番上にある点(top)
		// DstMaxYIdx = 0 : 一番下にある点(bottom)
		// となる。

		//[A1]
		// 今までの最小の点と y座標が等しく
		// x座標が今までの点より小さかったら(より左上にあったら)
		// この点を新たに最小の点とする

		//[A2]
		// 今までの最大の点と y座標が等しく
		// x座標が今までの点より大きかったら(より右下にあったら)
		// この点を新たに最大の点とする

		// ひとまず、lpDstPoint[0] が(有り得ないけど)最大の点でもあり、最小の点でもあるものとする
		int   MinIdx=0;                // 一番左上にある頂点の配列番号
		int   MaxIdx=0;                // 一番右下にある頂点の配列番号
		POINT MinPoint=lpDstPoint[0];  // このポイントには一番左上にある点が入ることになる
		POINT MaxPoint=lpDstPoint[0];  // このポイントには一番右上にある点が入ることになる

		// しらみつぶしに転送先頂点列を見ていく
		for( i=1; i<nAngle; i++ ){
			// 最小の点を探す
			if( lpDstPoint[i].y < MinPoint.y ){
				// 今までの最小の点より小さい点だったら、この点を新たに最小の点とする
				MinIdx = i;
				MinPoint = lpDstPoint[i];
				continue; // これが最小の点なら、最大の点にはなり得ない
			}
			else if( lpDstPoint[i].y == MinPoint.y && lpDstPoint[i].x < MinPoint.x ){
				// [A1]
				MinIdx = i;
				MinPoint = lpDstPoint[i];
				continue; // これが最小の点なら、最大の点にはなり得ない
			}

			// 最大の点を探す
			if( MaxPoint.y < lpDstPoint[i].y ){
				// 今までの最大の点より 大きい点だったら
				MaxIdx = i;
				MaxPoint = lpDstPoint[i];
			}
			else if( MaxPoint.y == lpDstPoint[i].y && MaxPoint.x < lpDstPoint[i].x ){
				// [A2]
				MaxIdx = i;
				MaxPoint = lpDstPoint[i];
			}

		}

		WARNING( MinIdx < 0,"CFastPlaneEffect::Morphで MinIdx < 0");
		WARNING( MaxIdx < 0,"CFastPlaneEffect::Morphで MaxIdx < 0");
		WARNING( nAngle <= MinIdx ,"CFastPlaneEffect::Morphで nAngle <= MinIdx");
		WARNING( nAngle <= MaxIdx ,"CFastPlaneEffect::Morphで nAngle <= MaxIdx");

		///////////////////////////////////////////////////////////////////////
		// 外積の計算
		///////////////////////////////////////////////////////////////////////

		// 一番小さい y座標の頂点(top)と、その前後の頂点
		// ( top が lpDstPoint[2] だったら lpDstPoint[1] と lpDstPoint[3] )
		// で構成されるベクトル同士の外積をとる

		int PrevIdx=MinIdx-1; // 一番最小の頂点の配列番号の前の配列番号 (=MinIdx-1)
		int NextIdx=MinIdx+1; // 一番最小の頂点の配列番号の次の配列番号 (=MinIdx+1)

		// もし最小の頂点の配列番号が 0 だったら一つ前は最後の配列番号
		if( MinIdx == 0 ){
			PrevIdx = nAngle-1;
		}
		// もし最小の頂点の配列番号が nAngle-1 だったら一つ次は最初の配列番号
		if( MinIdx == nAngle-1 ){
			NextIdx = 0;
		}

		// 外積計算
		int nVec = (lpDstPoint[PrevIdx].x - lpDstPoint[MinIdx].x)
		           * (lpDstPoint[NextIdx].y - lpDstPoint[MinIdx].y)
		           -
		           (lpDstPoint[NextIdx].x - lpDstPoint[MinIdx].x)
		           * (lpDstPoint[PrevIdx].y - lpDstPoint[MinIdx].y);

		///////////////////////////////////////////////////////////////////////
		// 左側にある線と右側にある線の始終点を求めていく
		///////////////////////////////////////////////////////////////////////

		// この外積が負なら左回り。つまり・・・
		// lpDstPoint[top] -> lpDstPoint[top+1] -> ... -> lpDstPoint[bottom-1] -> lpDstPoint[bottom]
		// という頂点列で結ばれる線は左(LeftLine)にあり、
		// lpDstPoint[top] -> lpDstPoint[top-1] -> ... -> lpDstPoint[bottom+1] -> lpDstPoint[bottom]
		// という頂点列で結ばれる線は右(RightLine)にある。
		// 当然、この外積が負なら右回り。つまり・・・左回りの逆 (^^;
		// ちなみに、転送は左の線から始まり右の線に向かって(x座標方向に)進む

		// 左側、右側の線の数
		int nLeftLine=0, nRightLine=0;

		// 頂点列を結んだ線を作る時に始点側、終点側の配列番号となる変数
		int StartIdx, EndIdx;

		// 転送先の頂点列で上辺、もしくは底辺が、水平になっていたときに
		// その水平の線はカウントしない様にする
		int LeftMaxIdx=MaxIdx, RightMinIdx=MinIdx;

		// 左側右側の線で、その中には始点と終点の座標を代入していく
		// 線の本数を数えた後に new でメモリを確保する
		LINE *LeftDstLine, *RightDstLine, *LeftSrcLine, *RightSrcLine;

		if( nVec > 0 ){ // 左回り

			// 底辺が水平だったら(MaxIdxの1つ前の配列番号の y座標と等しいかったら)
			// 最後の左側の線はカウントしない
			if( MaxIdx == 0 ){
				if( lpDstPoint[MaxIdx].y == lpDstPoint[nAngle-1].y ){
					LeftMaxIdx = nAngle - 1;
				}
			}
			else{
				if( lpDstPoint[MaxIdx].y == lpDstPoint[MaxIdx-1].y ){
					LeftMaxIdx = MaxIdx - 1;
				}
			}

			// 左側にある線の数を数える
			for( i=MinIdx; i!=LeftMaxIdx; ){
				if( ++i == nAngle ){ // 一番最後の配列を超えてしまったら
					i=0; // 最初に戻す
				}
				nLeftLine++;
			}

			// 上辺が水平だったら(MinIdxの1つ前の配列番号の y座標と等しいかったら)
			// 最初の右側の線はカウントしない
			if( MinIdx == 0 ){
				if( lpDstPoint[MinIdx].y == lpDstPoint[nAngle-1].y ){
					RightMinIdx = nAngle - 1;
				}
			}
			else{
				if( lpDstPoint[MinIdx].y == lpDstPoint[MinIdx-1].y ){
					RightMinIdx = MinIdx - 1;
				}
			}

			// 右側にある線の数を数える
			for( i=RightMinIdx; i!=MaxIdx; ){
				if( --i == -1 ){  // 最初の頂点の1つ前は無いので
					i=nAngle - 1; // 最後の頂点に
				}
				nRightLine++;
			}

			// 転送先、転送元の右側の線と、左側の線のバッファを確保
			LeftDstLine  = new LINE[nLeftLine+1];
			RightDstLine = new LINE[nRightLine+1];
			LeftSrcLine  = new LINE[nLeftLine+1];
			RightSrcLine = new LINE[nRightLine+1];

			// 左側の線の始終点を代入していく
			for( i=0, EndIdx=MinIdx; EndIdx!=LeftMaxIdx ; i++ ){
				StartIdx = EndIdx++;

				if( EndIdx == nAngle ){
					EndIdx = 0;
				}

				// 転送先、転送元の左側の線の始終点を代入していく
				LeftDstLine[i].Start = lpDstPoint[StartIdx];
				LeftDstLine[i].End   = lpDstPoint[EndIdx];
				LeftSrcLine[i].Start = lpSrcPoint[StartIdx];
				LeftSrcLine[i].End   = lpSrcPoint[EndIdx];
			}

			// 右側の線の始終点を代入していく
			for( i=0, EndIdx=RightMinIdx; EndIdx!=MaxIdx ; i++ ){
				StartIdx = EndIdx--; // i は終点側の配列番号

				if( EndIdx == -1 ){
					EndIdx = nAngle-1;
				}

				// 転送先、転送元の右側の線の始終点を代入していく
				RightDstLine[i].Start = lpDstPoint[StartIdx];
				RightDstLine[i].End   = lpDstPoint[EndIdx];
				RightSrcLine[i].Start = lpSrcPoint[StartIdx];
				RightSrcLine[i].End   = lpSrcPoint[EndIdx];
			}

		}
		else{ // 右回り

			// 上辺が水平だったら(MinIdxの1つ次の配列番号の y座標と等しいかったら)
			// 最初の右側の線はカウントしない
			if( MinIdx == nAngle - 1 ){
				if( lpDstPoint[MinIdx].y == lpDstPoint[0].y ){
					RightMinIdx = 0;
				}
			}
			else{
				if( lpDstPoint[MinIdx].y == lpDstPoint[MinIdx+1].y ){
					RightMinIdx = MinIdx + 1;
				}
			}

			// 右側にある線の数を数える
			for( i=RightMinIdx; i!=MaxIdx; ){
				if( ++i == nAngle ){ // 一番最後の配列を超えてしまったら
					i=0; // 最初に戻す
				}
				nRightLine++;
			}

			// 底辺が水平だったら(MaxIdxの1つ次の配列番号の y座標と等しいかったら)
			// 最後の左側の線はカウントしない
			if( MaxIdx == nAngle - 1 ){
				if( lpDstPoint[MaxIdx].y == lpDstPoint[0].y ){
					LeftMaxIdx = 0;
				}
			}
			else{
				if( lpDstPoint[MaxIdx].y == lpDstPoint[MaxIdx+1].y ){
					LeftMaxIdx = MaxIdx + 1;
				}
			}

			// 左側にある線の数を数える
			for( i=MinIdx; i!=LeftMaxIdx; ){
				if( --i == -1 ){ // 最初の頂点の1つ前は無いので
					i=nAngle - 1;    // 最後の頂点に
				}
				nLeftLine++;
			}

			// 転送先、転送元の右側の線と、左側の線のバッファを確保
			LeftDstLine  = new LINE[nLeftLine+1];
			RightDstLine = new LINE[nRightLine+1];
			LeftSrcLine  = new LINE[nLeftLine+1];
			RightSrcLine = new LINE[nRightLine+1];

			// 右側の線の始終点を代入していく
			for( i=0, EndIdx=RightMinIdx; EndIdx!=MaxIdx ; i++ ){
				StartIdx = EndIdx++;

				if( EndIdx == nAngle ){
					EndIdx = 0;
				}

				// 転送先、転送元の線の始終点を代入していく
				RightDstLine[i].Start = lpDstPoint[StartIdx];
				RightDstLine[i].End   = lpDstPoint[EndIdx];
				RightSrcLine[i].Start = lpSrcPoint[StartIdx];
				RightSrcLine[i].End   = lpSrcPoint[EndIdx];
			}

			// 左側の線の始終点を代入していく
			for( i=0, EndIdx=MinIdx; EndIdx!=LeftMaxIdx ; i++ ){
				StartIdx = EndIdx--;

				if( EndIdx == -1 ){
					EndIdx = nAngle-1;
				}

				// 転送先、転送元の線の始終点を代入していく
				LeftDstLine[i].Start = lpDstPoint[StartIdx];
				LeftDstLine[i].End   = lpDstPoint[EndIdx];
				LeftSrcLine[i].Start = lpSrcPoint[StartIdx];
				LeftSrcLine[i].End   = lpSrcPoint[EndIdx];
			}

		}

		// スキャンラインが一番下の座標と一致した時の対策
		RightDstLine[nRightLine] = RightDstLine[nRightLine-1];
		RightSrcLine[nRightLine] = RightSrcLine[nRightLine-1];
		LeftDstLine[nLeftLine]   = LeftDstLine[nLeftLine-1];
		LeftSrcLine[nLeftLine]   = LeftSrcLine[nLeftLine-1];

		///////////////////////////////////////////////////////////////////////
		// 転送ループスタート
		///////////////////////////////////////////////////////////////////////

		// [D1]
		// 転送先の左側の線の始点がスキャンラインと重ならなかった場合
		// たいがいはこっちなので if 文の条件をこっちを先にもってきたため
		// 変な if 文の条件式だが勘弁してくれ～ (^^;

		// [D2]
		// 左側の線が今のスキャンラインと重なってたら左側の線が重なった回数インクリメント
		// ちなみに1回目のループ(nScanY = 最小のy座標の時ね)は絶対に通るハズ

		// [D3]
		// 転送先のスキャンラインが次の行に行った時に
		// 転送先の左側のアクティブラインに対応する転送元のアクティブラインの始終点の x座標、y座標がどれだけ増加するか
		// = (転送元の今のラインの x座標の始終点の距離) / (転送先のアクティブラインの y座標の始終点の距離 + (1 or 0) )
		// = (転送元の今のラインの y座標の始終点の距離) / (転送先のアクティブラインの y座標の始終点の距離 + (1 or 0) )
		// bContinual = true だった場合は、n等分するために1を加える。
		// デフォルトは n-1等分となる。

		// [D4]
		// 転送先の右側の線の始点がスキャンラインと重ならなかった場合
		// たいがいはこっちなので if 文の条件をこっちを先にもってきたため
		// 変な if 文の条件式だが勘弁してくれ～ (^^;

		// [D5]
		// 右側の線が今のスキャンラインと重なってたら、右側の線が重なった回数インクリメント
		// ちなみにこれも1回目のループ(nScanY = 最小のy座標の時ね)は絶対に通るハズ

		// [D6]
		// 転送先のスキャンラインが次の行に行った時に
		// 転送先の右側のアクティブラインに対応する転送元のアクティブラインの始終点の x座標、y座標がどれだけ増加するか
		// = (転送元の今のラインの x座標の始終点の距離) / (転送先のアクティブラインの y座標の始終点の距離 + (1 or 0) )
		// = (転送元の今のラインの y座標の始終点の距離) / (転送先のアクティブラインの y座標の始終点の距離 + (1 or 0) )
		// bContinual = true だった場合は、n等分するために1を加える。
		// デフォルトは n-1等分となる。

		// [D7]
		// 転送元のスキャンライン(の傾き)を求める。つまり、
		// 転送先の左側のアクティブラインの交点に対応した転送元の点を始点とし、
		// 転送先の右側のアクティブラインの交点に対応した転送元の点を終点とした線を求める。
		// 転送先の x座標がインクリメントされるたびに転送元スキャンラインの (x,y)座標がどれだけ増加するか
		// = (転送元の今のラインの x座標の始終点の距離) / (転送先のアクティブラインの x座標の始終点の距離)
		// = (転送元の今のラインの y座標の始終点の距離) / (転送先のアクティブラインの 「x」座標の始終点の距離)
		// もし x座標の始終点の距離が「0」だったら、それは(一番上、もしくは一番下の)頂点なので、
		// 転送元スキャンラインの傾きも「0」とする
		// 始めは (lRightDstCrsPntX - lLeftDstCrsPntX)>>POINT_SHIFT としていたのだが、これだとダメ

		// [D8]
		// lpSrcBefore に足し算していく移動量を計算する変数を初期化
		// クリッピング領域が指定されていれば、転送前に増加分を加える
		// 元々この座標には四捨五入用の POINT_HALF が加味されているのでここでは 0 とする

		// [D9]
		// 左側のアクティブライン上の点(スキャンラインと左側の線の交点の x座標)から
		// 右側のアクティブライン上の点(スキャンラインと右側の線の交点の x座標)へ x座標をインクリメントしながら転送
		// 転送先のスキャンポインタ自体をインクリメントせず、配列インデックスでアクセス

		// [D10]
		// クリッピング領域が指定されているかどうかによって、転送開始点、終了点を求める
		// 指定されていなければ(=NULL)スキャンラインとアクティブラインの交点をそのまま用いる。
		// クリッピング領域が指定されていれば、ケースバイケースの始終点を求めていく。
		// クリッピングのパターンは以下の6通りが考えられる
		// [ : lpClipRect->left
		// ] : lpCliprect->right
		//
		//          転送先スキャンラインの
		//       左端                     右端
		//        ↓                       ↓
		//(1)  [  ---------------------------  ]   左端から右端まで全部転送
		//(2) [   ]--------------------------      転送無し
		//(3)     ---------------------------[   ] 転送無し
		//(4)     [-----------]--------------      左端から ] まで転送
		//(5)     ------[----------]---------      [ から ] まで転送
		//(6)     ------------[-------------- ]    [ から右端まで転送
		//
		// ちなみに上図の「---------」は転送先スキャンラインを表しいて、
		// 左端が lLeftDstCrsPntX で、右端が lRightDstCrsPntX である。
		// これらは固定小数点として使用しているので、
		// それに合わせてクリッピング領域を指すRECT構造体(lpClipRect)も固定小数点として使用する
		// それらをループ中に毎回毎回シフト演算するのはなんなので、
		// 各々を予め固定小数点化しておいた変数(lRectL, lRectR)を使用する。

		// [D11]
		// 転送先スキャンラインの x座標がインクリメントされるたびに、
		// 転送元スキャンラインがどれだけ増加するか( x座標増加量, y座標増加量 )を求める
		// bContinualフラグが true だったら n 等分
		// bContinualフラグが false だったら n-1 等分 となる。
		// 始めは
		// lSrcScanStepX = ( lRightSrcPntX - lLeftSrcPntX ) / ( DstDx + nContinual );
		// だったがこれではダメ

		// [D12]
		// クリッピング領域の指定によって、転送するy座標の判定を行う
		// 指定されていれば、与点列との大小関係を比較する。
		// クリッピング矩形の上端を top、下端から -1 したところを bot
		// 与点列の y座標の最小点(一番上にある点)を min、最大点(一番下にある点)を max とすると
		//
		// 1. top < bot < min < max , 転送領域無し
		// 2. top < min < bot < max , 開始点:min 終了点:bot
		// 3. top < min < max < bot , 開始点:min 終了点:max
		// 4. min < top < bot < max , 開始点:top 終了点:bot
		// 5. min < top < max < bot , 開始点:top 終了点:max
		// 6. min < max < top < bot , 転送領域無し
		//
		// 開始点が top だった場合は、その座標までスキャンラインを進めるので、
		// アクティブラインを求めて、ポインタを進めなければならない。
		// 終了点はただ単に nEndY にセットするだけ
		// ちなみに、この if文で せっかくクリッピング領域が NULL かどうかの判定をしているので、
		// 矩形の左端と右端を固定小数点化も同時にやっておく

		// 転送元、転送先のプレーンの情報GET
		LONG		lPitchSrc = lpSrcInfo->GetPitch();
		LONG		lPitchDst = lpDstInfo->GetPitch();

		// 転送元、転送先のスキャンポインタ
		// 転送元は毎ループ毎に一番左上の点(原点)からの移動分を計算する
		// 転送先はまず転送開始y座標まで移動させ、その後は一行分インクリメントしていく
		SrcClass*	lpSrc;
		DstClass*	lpDst;
		// 転送元のスキャンポインタを移動させる時に毎回 GetPtr() を呼ぶのもなんなので・・・
		SrcClass*	lpSrcLeftTop = (SrcClass*)lpSrcInfo->GetPtr();
		// スキャンポインタの転送直前のポインタを覚えておけば、これに増加分(Step)を足せばOK
		SrcClass*   lpSrcBefore;
//		DstClass*   lpDstBefore; // でもこっちは使わなくてもOK

		// 転送先の左側、右側の各線の始点(y座標値としては終点より小さいはず)がスキャンラインと重なった回数
		// この回数が、今まさにスキャン中の線(アクティブライン)の配列番号で、つまり、
		// LeftSrcLine[nLeftCrsCnt-1] と RightSrcLine[nLeftCrcCnt-1] の間でスキャン中ということ
		int nLeftCrsCnt = 0, nRightCrsCnt = 0;

		// 転送フラグ bContinual によって 等分方法を変更
		// スキャンラインの ( 終点座標値 - 始点座標値 ) をそのまま用いると n-1 等分になるので、
		// true の時に 1、false の時 0 とすれば、この nContinual を加えると
		// true:n等分, false:(n-1)等分 となる
		// 転送先の図形が矩形の場合のみ true を指定できる。通常は false。
		int nContinual = (bContinual ? 1 : 0);

		// 転送先のアクティブラインとスキャンラインとが交わってる左側と右側、各々の交点の x座標
		// これに x方向のステップ値を加えていけば、ライン上の点を求めるのが楽
		// 固定小数点として使用する。
		LONG lLeftDstCrsPntX, lRightDstCrsPntX;

		// これがそのステップ値(=dx/dy)である
		LONG lLeftDstStepX, lRightDstStepX;

		// 転送先のアクティブラインとスキャンラインとの交点に対応する転送元の座標値
		// 転送先がインクリメントされると、この座標値にステップ値を足せばOK
		// 固定小数点として使用
		LONG lLeftSrcPntX, lRightSrcPntX, lLeftSrcPntY, lRightSrcPntY;

		// これがそのステップ値(=dy/dx)
		// 転送先のスキャンラインのインクリメントにより、転送元のラインがどれだけ増加するか
		// 固定小数点として使用
		LONG lLeftSrcStepX, lRightSrcStepX, lLeftSrcStepY, lRightSrcStepY;

		// 転送元のスキャンラインのステップ値
		// 転送元のスキャンラインの始点(lLeftSrcPntX, lLeftSrcPntY)を初期点として
		// このステップ値を加えていき、終点(lRightSrcPntX, lRightSrcPntY)までたどり着く
		// 固定小数点として使用
		LONG lSrcScanStepX, lSrcScanStepY;

		// 転送先の増加量 dx , dy
		LONG DstDx, DstDy;

		// 転送元スキャンポインタを移動させるのに使用する変数
		LONG lSrcScanPntX, lSrcScanPntY;

		// 引数として入力されたクリッピング領域を指すRECT構造体を固定小数点化したもの
		LONG lRectL, lRectR; // 左辺と右辺の x座標だけが必要

		// 転送先のスキャンラインの座標値
		LONG nScanX, nScanY; // ループ時に使用する
		LONG nEndX,  nEndY;  // 終了座標値、クリッピングの有る無しによって変わるから

		// [D12]
		if( lpClipRect == NULL ){ // クリッピング無しだった

			nScanY = lpDstPoint[MinIdx].y;
			nEndY  = lpDstPoint[MaxIdx].y;
		}
		else{ // クリッピング指定

			// まず、固定小数点化、RECTの右端は点に合わせて「-1」しているのに注意
			lRectL = (lpClipRect->left        << POINT_SHIFT) + POINT_HALF;
			lRectR = (( lpClipRect->right-1 ) << POINT_SHIFT) + POINT_HALF;
			// 無いとは思うけど、一応矩形の左右チェック
			WARNING( lRectR < lRectL ,"CFastPlaneEffect::Morphで 矩形 lpClipRectの left と right が逆さま");

			// うじゃうじゃ見にくいので一時的に使用
			LONG min = lpDstPoint[MinIdx].y;
			LONG max = lpDstPoint[MaxIdx].y;
			LONG top = lpClipRect->top;        
			LONG bot = lpClipRect->bottom - 1; // RECT構造体とPOINTを比較するため -1 する

			// 無いとは思うけど、一応矩形の上下チェック
			WARNING( bot < top,"CFastPlaneEffect::Morphで 矩形 lpClipRectの top と bottom が逆さま");

			if( bot < min || max < top ){ // 上記 1. or 6.
				return 0; // 転送領域ありまへんで～
			}

			// 転送開始点を求める
			if( top <= min ){ // 上記 2. or 3.
				nScanY = min;
			}
			else{ // 上記 4. or 5.
				nScanY = top;

				// この場合はスキャンポインタを (top-1) まで進めないといけない
				top--; // 毎回 top-1 をするのはめんどくさいので

				// まず、転送先の y座標 (top-1) と交わる線は左側、右側それぞれ何番目の線か(=何回頂点と重なったか)を求める

				for( nLeftCrsCnt++; nLeftCrsCnt<nLeftLine; nLeftCrsCnt++ ){ // まずは左側の線は何番目か
					if( LeftDstLine[nLeftCrsCnt-1].Start.y <= top && top < LeftDstLine[nLeftCrsCnt-1].End.y ){
						break;
					}
				}

				for( nRightCrsCnt++; nRightCrsCnt<nRightLine; nRightCrsCnt++ ){ // 次に右側の線は何番目か
					if( RightDstLine[nRightCrsCnt-1].Start.y <= top && top < RightDstLine[nRightCrsCnt-1].End.y ){
						break;
					}
				}

				// その求まった線の始終点より傾き(dx/dy)を求めて、((top-1) - その線の始点)*(dx/dy)により x座標を求める
				// また転送先の線番号に対応した転送元の線も同様に (top-1) の時の x座標、y座標を求める

				// まずは左側 (コメントは下のループで同じ事をしてるので、そちらを参照
				lLeftDstCrsPntX = (LeftDstLine[nLeftCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				DstDy = LeftDstLine[nLeftCrsCnt-1].End.y - LeftDstLine[nLeftCrsCnt-1].Start.y;
				WARNING( DstDy == 0 , "CFastPlaneEffect::Morphで 左側の線に水平な線発見" );
				lLeftDstStepX = ( (LeftDstLine[nLeftCrsCnt-1].End.x - LeftDstLine[nLeftCrsCnt-1].Start.x) << POINT_SHIFT )
				                / ( DstDy );
				lLeftSrcPntX = (LeftSrcLine[nLeftCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				lLeftSrcPntY = (LeftSrcLine[nLeftCrsCnt-1].Start.y << POINT_SHIFT) + POINT_HALF;
				lLeftSrcStepX= ( (LeftSrcLine[nLeftCrsCnt-1].End.x - LeftSrcLine[nLeftCrsCnt-1].Start.x) << POINT_SHIFT )
				               / ( DstDy + nContinual );
				lLeftSrcStepY= ( (LeftSrcLine[nLeftCrsCnt-1].End.y - LeftSrcLine[nLeftCrsCnt-1].Start.y) << POINT_SHIFT)
				               / ( DstDy + nContinual );

				int dy = top - LeftDstLine[nLeftCrsCnt-1].Start.y; // 何回ステップ値を足せばいいか
				lLeftDstCrsPntX += lLeftDstStepX * dy; // 転送先左側 x座標
				lLeftSrcPntX    += lLeftSrcStepX * dy; // 転送元左側 x座標
				lLeftSrcPntY    += lLeftSrcStepY * dy; // 転送元左側 y座標

				// 次に右側 (コメントは同様に以下のループを参照)
				lRightDstCrsPntX = (RightDstLine[nRightCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				DstDy = RightDstLine[nRightCrsCnt-1].End.y - RightDstLine[nRightCrsCnt-1].Start.y;
				WARNING( DstDy == 0 , "CFastPlaneEffect::Morphで 右側の線に水平な線発見" );
				lRightDstStepX = ( (RightDstLine[nRightCrsCnt-1].End.x - RightDstLine[nRightCrsCnt-1].Start.x) << POINT_SHIFT )
				                 / ( DstDy );
				lRightSrcPntX = (RightSrcLine[nRightCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				lRightSrcPntY = (RightSrcLine[nRightCrsCnt-1].Start.y << POINT_SHIFT) + POINT_HALF;
				lRightSrcStepX = ( (RightSrcLine[nRightCrsCnt-1].End.x - RightSrcLine[nRightCrsCnt-1].Start.x) << POINT_SHIFT )
				                 / ( DstDy + nContinual );
				lRightSrcStepY = ( (RightSrcLine[nRightCrsCnt-1].End.y - RightSrcLine[nRightCrsCnt-1].Start.y) << POINT_SHIFT )
				                 / ( DstDy + nContinual );

				dy = top - RightDstLine[nRightCrsCnt-1].Start.y; // 何回ステップ値を足せばいいか
				lRightDstCrsPntX += lRightDstStepX * dy; // 転送先右側 x座標
				lRightSrcPntX    += lRightSrcStepX * dy; // 転送元右側 x座標
				lRightSrcPntY    += lRightSrcStepY * dy; // 転送元右側 y座標

			}

			// 転送終了点を求める
			if( max <= bot ){ // 上記 3. or 5.
				nEndY = max;
			}
			else{ // 上記 2. or 4.
				nEndY = bot;
			}
		}

		// 転送先スキャンポインタをスキャン開始ラインの先頭に移動
		lpDst = (DstClass*)((BYTE*)lpDstInfo->GetPtr()+(lPitchDst * nScanY) );

		// 転送先のスキャンラインを1行分進めていく(つまり y座標をインクリメントしていく)
		for( ; nScanY <= nEndY; nScanY++ ){

			if( !( LeftDstLine[nLeftCrsCnt].Start.y == nScanY ) ){ // [D1]

				// 転送先の左側のアクティブラインとスキャンラインの交点の x座標を求める
				lLeftDstCrsPntX += lLeftDstStepX;

				// 転送先の左側のアクティブラインに対応する転送元のアクティブラインのスキャン開始座標を求める
				lLeftSrcPntX += lLeftSrcStepX;
				lLeftSrcPntY += lLeftSrcStepY;

				// 転送元のスキャンポインタを移動 オーバーフローするかもしれないので、先にシフト演算
				lpSrc = (SrcClass*)( (BYTE*)lpSrcLeftTop
				                     + (lLeftSrcPntY >> POINT_SHIFT) * lPitchSrc
				                     + (lLeftSrcPntX >> POINT_SHIFT) * sizeof(SrcClass) );

			}
			else{ // [D2]

				nLeftCrsCnt++; // 重なった回数インクリメント

				// 初期値として転送先の左側のアクティブラインの始点の x座標を代入
				// 四捨五入するために固定小数点の世界での 0.5 を足しておく
				lLeftDstCrsPntX = (LeftDstLine[nLeftCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;

				// 今の左側のアクティブラインの傾き y座標が1つ増える毎に x座標がどれだけ増加するか(=dx/dy)
				// 傾きが正の場合と負の場合での場合分けが必要!!←実は要らなかった (^^;
				DstDy = LeftDstLine[nLeftCrsCnt-1].End.y - LeftDstLine[nLeftCrsCnt-1].Start.y;
				WARNING( DstDy == 0 , "CFastPlaneEffect::Morphで 左側の線に水平な線発見" );

				lLeftDstStepX = ( (LeftDstLine[nLeftCrsCnt-1].End.x - LeftDstLine[nLeftCrsCnt-1].Start.x) << POINT_SHIFT )
				                / ( DstDy );

				// 初期値として、転送先の左側のアクティブラインに対応した転送元のラインの始点 x座標値、y座標値を代入
				lLeftSrcPntX = (LeftSrcLine[nLeftCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				lLeftSrcPntY = (LeftSrcLine[nLeftCrsCnt-1].Start.y << POINT_SHIFT) + POINT_HALF;

				// [D3]
				lLeftSrcStepX= ( (LeftSrcLine[nLeftCrsCnt-1].End.x - LeftSrcLine[nLeftCrsCnt-1].Start.x) << POINT_SHIFT )
				               / ( DstDy + nContinual );
				lLeftSrcStepY= ( (LeftSrcLine[nLeftCrsCnt-1].End.y - LeftSrcLine[nLeftCrsCnt-1].Start.y) << POINT_SHIFT)
				               / ( DstDy + nContinual );

				// スキャンポインタを転送元のアクティブラインの始点にセット
				lpSrc = (SrcClass*)( (BYTE*)lpSrcLeftTop
				                     + LeftSrcLine[nLeftCrsCnt-1].Start.y * lPitchSrc
				                     + LeftSrcLine[nLeftCrsCnt-1].Start.x * sizeof(SrcClass) );
			}

			if( ! (RightDstLine[nRightCrsCnt].Start.y == nScanY ) ){ // [D4]

				// 転送先の右側のアクティブラインとスキャンラインの交点の x座標を求める
				lRightDstCrsPntX += lRightDstStepX;

				// 転送先の右側のアクティブラインに対応する転送元のアクティブラインのスキャン終了座標を求める
				lRightSrcPntX += lRightSrcStepX;
				lRightSrcPntY += lRightSrcStepY;

			}
			else{ // [D5]

				nRightCrsCnt++; // 重なった回数インクリメント

				// 初期値として転送先の右側のアクティブラインの始点の x座標を代入
				lRightDstCrsPntX = (RightDstLine[nRightCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;

				// 次の頂点までのy座標の距離を計算
				DstDy = RightDstLine[nRightCrsCnt-1].End.y - RightDstLine[nRightCrsCnt-1].Start.y;
				WARNING( DstDy == 0 , "CFastPlaneEffect::Morphで 右側の線に水平な線発見" );

				// 今の右側のアクティブラインの傾き y座標が1つ増える毎に x座標がどれだけ増加するか(=dx/dy)
				lRightDstStepX = ( (RightDstLine[nRightCrsCnt-1].End.x - RightDstLine[nRightCrsCnt-1].Start.x) << POINT_SHIFT )
				                 / ( DstDy );

				// 初期値として、転送先の右側のアクティブラインに対応した転送元のラインの始点 x座標値、y座標値を代入
				lRightSrcPntX = (RightSrcLine[nRightCrsCnt-1].Start.x << POINT_SHIFT) + POINT_HALF;
				lRightSrcPntY = (RightSrcLine[nRightCrsCnt-1].Start.y << POINT_SHIFT) + POINT_HALF;

				// [D6]
				lRightSrcStepX = ( (RightSrcLine[nRightCrsCnt-1].End.x - RightSrcLine[nRightCrsCnt-1].Start.x) << POINT_SHIFT )
				                 / ( DstDy + nContinual );
				lRightSrcStepY = ( (RightSrcLine[nRightCrsCnt-1].End.y - RightSrcLine[nRightCrsCnt-1].Start.y) << POINT_SHIFT )
				                 / ( DstDy + nContinual );
			}

			// [D7]
			DstDx = (lRightDstCrsPntX>>POINT_SHIFT) - (lLeftDstCrsPntX>>POINT_SHIFT);
			WARNING( DstDx < 0 , "CFastPlaneEffect::Morphで スキャンラインの x座標が右左逆" );

			if( DstDx != 0 ){ // 頂点じゃなかった

				// [D11]
				lSrcScanStepX = ( ( (lRightSrcPntX>>POINT_SHIFT) - (lLeftSrcPntX>>POINT_SHIFT) ) << POINT_SHIFT )
				                / ( DstDx + nContinual );
				lSrcScanStepY = ( ( (lRightSrcPntY>>POINT_SHIFT) - (lLeftSrcPntY>>POINT_SHIFT) ) << POINT_SHIFT )
				                / ( DstDx + nContinual );
			}
			else{ // 頂点だった(頂点じゃなくても頂点に極近傍だったらこっちになる)

				lSrcScanStepX = lSrcScanStepY = 0; // どうせ一回しか転送ループを回らないので 0にしておいてもいいでしょう
			}

			lpSrcBefore  = lpSrc; // 次のポインタに移る時に楽する様に転送元の始点のポインタを覚えておく
			lSrcScanPntX = lSrcScanPntY = 0; // [D8]

			// [D10]
			if( lpClipRect == NULL ){ // クリップ領域が無かった

				// 固定小数点→整数
				nScanX = lLeftDstCrsPntX  >> POINT_SHIFT; // 転送開始座標値
				nEndX  = lRightDstCrsPntX >> POINT_SHIFT; // 転送終了座標値

			}
			else{ // クリッピング領域が指定されていたので転送部分を求める

				if( lRectR < lLeftDstCrsPntX || lRightDstCrsPntX < lRectL ){ // 上図 (2) or (3)
					// 転送領域ありまへん～、転送先のスキャンポインタを次の行にして次の行へ向かうべ
					lpDst = (DstClass*)((BYTE*)lpDst + lPitchDst );
					continue;
				}

				// 転送開始 x座標値を求める
				if( lRectL <= lLeftDstCrsPntX ){ // 上図 (1) or (4)
					nScanX = lLeftDstCrsPntX >> POINT_SHIFT;
				}
				else{ // 上図 (5) or (6)
					nScanX = lpClipRect->left;

					// 転送元のスキャンポインタを移動せにゃならん
					int dx = (lRectL - lLeftDstCrsPntX) >> POINT_SHIFT; // 移動分

					lSrcScanPntX = lSrcScanStepX * dx; // 移動分に増加量をかけて
					lSrcScanPntY = lSrcScanStepY * dx; // 転送元開始点を求める

					// 転送元のスキャンポインタを転送開始点へ移動
					lpSrc = (SrcClass*) ((BYTE*)lpSrcBefore
					                    + (lSrcScanPntY >> POINT_SHIFT) * lPitchSrc
					                    + (lSrcScanPntX >> POINT_SHIFT) * sizeof(SrcClass) );
				}

				// 転送終了 x座標値を求める
				if( lRightDstCrsPntX <= lRectR ){ // 上図 (1) or (6)
					nEndX = lRightDstCrsPntX >> POINT_SHIFT;
				}
				else{ // 上図 (4) or (5)
					nEndX = lpClipRect->right-1; // 矩形の右端は -1 しとかにゃならん
				}


			}

			for( ; nScanX <= nEndX; nScanX++ ){ // [D9]

				f(lpDst[nScanX],*lpSrc); // 転送

				lSrcScanPntX += lSrcScanStepX; // 転送元のスキャンポインタの
				lSrcScanPntY += lSrcScanStepY; // 次の座標値までの相対距離

				// 転送元のスキャンポインタを増加 オーバーフローするかもしれないので先にシフト演算
				lpSrc = (SrcClass*) ((BYTE*)lpSrcBefore
				                    + (lSrcScanPntY >> POINT_SHIFT) * lPitchSrc
				                    + (lSrcScanPntX >> POINT_SHIFT) * sizeof(SrcClass) );

			} // 転送先スキャンラインの x座標インクリメントループ

			lpDst = (DstClass*)((BYTE*)lpDst + lPitchDst ); // 転送先のスキャンポインタを次の行に

		} // 転送先スキャンラインの y座標インクリメントループ

		delete [] LeftDstLine;
		delete [] RightDstLine;
		delete [] LeftSrcLine;
		delete [] RightSrcLine;

		return 0;

	}

	//	Bltと同じだが、functorに転送元の(x,y)も渡す
	//	---- 転送のときになんやかやする関数
	// @yo2 0x004a7ef0 template BltSrcXY
	// @yo2 0x004a8870 template BltSrcXY
	// @yo2 0x004a91d0 template BltSrcXY
	// @yo2 0x004a9b80 template BltSrcXY
	// @yo2 0x004aa550 template BltSrcXY
	// @yo2 0x004aae80 template BltSrcXY
	// @yo2 0x004ab7b0 template BltSrcXY
	// @yo2 0x004ac1f0 template BltSrcXY
	// @yo2 0x004ac9a0 template BltSrcXY
	// @yo2 0x004ad370 template BltSrcXY
	// @yo2 0x004ae320 template BltSrcXY
	// @yo2 0x004ae3b0 template BltSrcXY
	template <class SrcClass,class DstClass,class BltFunctor>
	static LRESULT BltSrcXY(SrcClass _src,CFastPlaneInfo* lpSrcInfo,DstClass _dst
	,CFastPlaneInfo* lpDstInfo,BltFunctor f,int x,int y,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL){

		WARNING(lpSrcInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpSrcInfo->GetPtr() == NULL");
		WARNING(lpDstInfo->GetPtr() == NULL,"CFastPlaneEffect::BltでlpDstInfo->GetPtr() == NULL");

		//	LONG lPitch	 = pInfo->GetPitch();
		//	DWORD* pSurface = pInfo->GetPtr();

		//	CDIB32Base* srcp = lpSrcDIB->GetDIB32BasePtr();
		//	CDIB32Base* dstp = lpDstDIB->GetDIB32BasePtr();

		// クリッピング等の処理
		// 転送範囲なしの時は、このまま帰る
		CFastPlaneEffectClipper clip;
		if ( Clipping( lpDstInfo , lpSrcInfo , x, y, &clip,lpSrcRect, lpDstSize, lpClipRect ) != 0 ) return 1;
		
		RECT rcSrcRect = clip.rcSrcRect;
		RECT rcDstRect = clip.rcDstRect;
//		RECT rcClipRect = clip.rcClipRect;
		
		// 転送先の横幅と縦幅の設定
		int		nDstWidth = rcDstRect.right - rcDstRect.left;
		int		nDstHeight = rcDstRect.bottom - rcDstRect.top;
		int		nSrcWidth = rcSrcRect.right - rcSrcRect.left;
		LONG	lPitchSrc = lpSrcInfo->GetPitch();
		LONG	lPitchDst = lpDstInfo->GetPitch();
		LONG	nAddSrcWidth = lpSrcInfo->GetPitch() - (nSrcWidth * sizeof(SrcClass));	// クリッピングして飛ばす分の算出
		LONG	nAddDstWidth = lpDstInfo->GetPitch() - (nDstWidth * sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
		SrcClass*	lpSrc = (SrcClass*)((BYTE*)lpSrcInfo->GetPtr() +(rcSrcRect.left*sizeof(SrcClass))+rcSrcRect.top*lPitchSrc );		// クリッピング部分のカット
		DstClass*	lpDst = (DstClass*)((BYTE*)lpDstInfo->GetPtr() +(rcDstRect.left*sizeof(DstClass))+rcDstRect.top*lPitchDst );		// 指定されたx,yの位置調整

		if ( clip.bActualSize ){
			//等倍

			//	'01/10/05	やねうらお改造
			//	8ループ展開
			int nLoop8 = nDstWidth;
			//	8ループ余り
			int nLoop8mod = nLoop8 & 7;
			nLoop8 >>= 3;

			nAddSrcWidth+=nLoop8mod*sizeof(SrcClass);
			nAddDstWidth+=nLoop8mod*sizeof(DstClass);

			int nSrcY = rcSrcRect.top;

			for(int y=0;y<nDstHeight;y++){
				int nSrcX = rcSrcRect.left;
				int n;	// [portable] MSVC6 for-scope: n is used after the loop
				for(n=0;n<nLoop8;n++){
					//	転送元から転送先へ、この関数エフェクトをかけながら転送
					f(lpDst[0],lpSrc[0],nSrcX+0,nSrcY);
					f(lpDst[1],lpSrc[1],nSrcX+1,nSrcY);
					f(lpDst[2],lpSrc[2],nSrcX+2,nSrcY);
					f(lpDst[3],lpSrc[3],nSrcX+3,nSrcY);
					f(lpDst[4],lpSrc[4],nSrcX+4,nSrcY);
					f(lpDst[5],lpSrc[5],nSrcX+5,nSrcY);
					f(lpDst[6],lpSrc[6],nSrcX+6,nSrcY);
					f(lpDst[7],lpSrc[7],nSrcX+7,nSrcY);
					lpDst+=8; lpSrc+=8; nSrcX+=8;
				}
				//	余剰分を、転送
				for (n=0;n<nLoop8mod;n++){
					f(lpDst[n],lpSrc[n],nSrcX+n,nSrcY);
				}
				//	ループの外でインクリメントしたほうが、速い！
				//	lpDst+=nLoop8mod; lpSrc+=nLoop8mod;
				//	↑これは、下のnAddDst/SrcWidthに事前加算してある！

				lpDst = (DstClass*) ( (LPBYTE)lpDst+nAddDstWidth);
				lpSrc = (SrcClass*) ( (LPBYTE)lpSrc+nAddSrcWidth);
				nSrcY++;
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
			DWORD	AddSrcPixel = sizeof(SrcClass) * nStepsX;
			DWORD	AddWidthSrc = lpSrcInfo->GetPitch() * nStepsY;
			DWORD	nAddSrcHeight= lpSrcInfo->GetPitch() * nStepsY;						// y軸の整数部で加算される値
//			DWORD	nAddDstWidth = lpDstInfo->GetPitch() - (nWidth*sizeof(DstClass));	// ASMで使用する 1ラインのバイト数の設定
			int		EIX= nInitialX;
			int		EIY= nInitialY;
			int		EX = nStepX;
			int		EY = nStepY;
			int		EX2= nCmpX;
			int		EY2= nCmpY;
			int		i, j;
			int		nExCnt, nEyCnt;
			nEyCnt = EIY;

			int nSrcY = rcSrcRect.top;

			for ( j = 0 ; j < nDstHeight ; j++ )
			{
				nEyCnt += EY;											// 転送元Yの小数部の加算
				if ( nEyCnt >= 0 )
				{
					lpSrc = (SrcClass*)((BYTE*)lpSrc + lPitchSrc );		// 転送元Yを次のラインにする
					nSrcY ++;
					nEyCnt -= EY2;										// Yの補正値
				}

				SrcClass*	lpSrcBack = lpSrc;
				int nSrcX = rcSrcRect.left;
				nExCnt = EIX;

				for ( i = 0 ; i < nDstWidth ; i++ )
				{
					nExCnt += EX;		// 転送元のXの小数部の加算
					if ( nExCnt >= 0 )
					{
						lpSrc++;
						nSrcX++;
						nExCnt -= EX2;	// Xの補正値
					}

					f(lpDst[i],*lpSrc,nSrcX,nSrcY);
					// 転送元のXの整数部の加算
					lpSrc = (SrcClass*)((BYTE*)lpSrc + AddSrcPixel);
					nSrcX += nStepsX;

//					lpDst++;			//	転送先のXを加算
				}
				lpSrc = (SrcClass*)((BYTE*)lpSrcBack + nAddSrcHeight );	// 転送元Xループで進んだ分戻し、y軸の整数部を加算する
				nSrcY += nStepsY;

				lpDst = (DstClass*)((BYTE*)lpDst + lPitchDst );		//	転送先の整数部の加算
			}
		}
		
		return 0;
	}


protected:
	class CFastPlaneEffectClipper {
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

	static LRESULT Clipping(CFastPlaneInfo*lpDstInfo,CFastPlaneInfo*lpSrcInfo,int x,int y
		, CFastPlaneEffectClipper* lpClipper,LPRECT lpSrcRect=NULL,LPSIZE lpDstSize=NULL,LPRECT lpClipRect=NULL);

	//	気が向いたら関数追加するかもね。（しないかもね＾＾；）
};

#endif	//	__yaneGTL_h__
