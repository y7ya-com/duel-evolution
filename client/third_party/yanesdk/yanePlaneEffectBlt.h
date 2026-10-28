//
//	effect系のblt
//

#ifndef __yanePlaneEffectBlt_h__
#define __yanePlaneEffectBlt_h__

#include "yaneSinTable.h"
class CPlaneBase;

/////////////////////////////////////////////////////////////////
//	スクロール文字用（『Revolution』のオープニングで使用）

class CPlaneFadeBlt {
public:
	LRESULT	FadeBlt(CPlaneBase*,CPlaneBase*,int x,int y);

	int*	GetFadeTable(void)	 { return& m_nFadeTable[0];	  }
	int*	GetRasterTable(void) { return& m_nRasterTable[0]; }

	CPlaneFadeBlt(void);
	virtual ~CPlaneFadeBlt();

protected:
	int		m_nFadeTable[480];			//	各ラスターのFade値(0-256)を設定
	int		m_nRasterTable[480];		//	各ラスターのラスターずらし値を設定
};

/////////////////////////////////////////////////////////////////
//	トランジション系のgeneric blter

//	リスナ
class CPlaneTransBltListener {
public:
	virtual LRESULT Blt(CPlaneBase*lpDst,CPlaneBase*lpSrc,int x,int y,int nPhase,int nTransMode=0,BYTE byFadeRate=255,LPRECT lpDstClipRect=NULL) = 0;
	virtual ~CPlaneTransBltListener() {}
};

#define TransBltFunc(FuncName) \
LRESULT FuncName(CPlaneBase*lpDst,CPlaneBase*lpSrc,int x,int y,int nPhase,int nTransMode=0,BYTE byFadeRate=255,LPRECT lpDstClipRect=NULL);
	//	nTransMode : 0 == ヌキなし	1==ヌキ有り	 2==α付き画像(CDIB32限定)
	//				 3 == BltNaturalでの転送

class CPlaneTransBlt {
public:
	static LRESULT Blt(int nTransNo,CPlaneBase*lpDst,CPlaneBase*lpSrc,int x,int y,int nPhase,int nTransMode=0,BYTE byFadeRate=255,LPRECT lpDstClipRect=NULL);	//	番号で呼び出せるのだ

	static TransBltFunc(MirrorBlt1);	// 左右ミラー
	static TransBltFunc(MirrorBlt2);	// 上下ミラー
	static TransBltFunc(MirrorBlt3);	// 横太り
	static TransBltFunc(MirrorBlt4);	// 縦太り

	static TransBltFunc(CutInBlt1);	// 水平ランダムラスタ
	static TransBltFunc(CutInBlt2);	// 矩形ランダム
	static TransBltFunc(CutInBlt3);	// 4*2ドット矩形 ランダムフェード
	static TransBltFunc(CutInBlt4);	// 4*2ドット矩形 ランダム フェード上から
	static TransBltFunc(CutInBlt5);	// 4*2ドット矩形 ランダム フェード下から
	static TransBltFunc(CutInBlt6);	// 4*2ドット矩形 ランダム フェード左から
	static TransBltFunc(CutInBlt7);	// 4*2ドット矩形 ランダム フェード右から
	static TransBltFunc(CutInBlt8);	// 中央から矩形
	static TransBltFunc(CutInBlt9);	// 左上から矩形
	static TransBltFunc(CutInBlt10);// 右上から矩形
	static TransBltFunc(CutInBlt11);// 左下から矩形
	static TransBltFunc(CutInBlt12);// 左右てれこで出現
	static TransBltFunc(CutInBlt13);// 上下てれこで出現
	static TransBltFunc(CutInBlt14);// 左右てれこ２段で出現
	static TransBltFunc(CutInBlt15);// 上下てれこ２段で出現
	static TransBltFunc(CutInBlt16);// 中央からランダムフェード 4*2矩形
	static TransBltFunc(CutInBlt17);// 中央からランダムフェード 2*2矩形
	static TransBltFunc(CutInBlt18);// シャッフリング上から下へ
	static TransBltFunc(CutInBlt19);// シャッフリング下から上へ

	static TransBltFunc(WaveBlt1);	// 波Blt
	static TransBltFunc(WaveBlt2);	// 波Blt 180位相違い
	static TransBltFunc(WaveBlt3);	// 小波Blt
	static TransBltFunc(WaveBlt4);	// 小波Blt 180位相違い

	static TransBltFunc(WhorlBlt1);	// うずまき 外から
	static TransBltFunc(WhorlBlt2);	// うずまき 内から
	static TransBltFunc(WhorlBlt3);	// うずまき 外から 2*2
	static TransBltFunc(WhorlBlt4);	// うずまき 内から 2*2
	static TransBltFunc(WhorlBlt5);	// うずまき 外から 4*4
	static TransBltFunc(WhorlBlt6);	// うずまき 内から 4*4
	static TransBltFunc(WhorlBlt7);	// うずまき 外から 8*8
	static TransBltFunc(WhorlBlt8);	// うずまき 内から 8*8

	static TransBltFunc(CircleBlt1);	// 上から円
	static TransBltFunc(CircleBlt2);	// 下から円
	static TransBltFunc(CircleBlt3);	// 左から円
	static TransBltFunc(CircleBlt4);	// 右から円
	static TransBltFunc(CircleBlt5);	// 中央から円

	static TransBltFunc(RectBlt1);	// 矩形型 4ドット
	static TransBltFunc(RectBlt2);	// 矩形型 8ドット
	static TransBltFunc(RectBlt3);	// 矩形型 16ドット
	
	static TransBltFunc(BlindBlt1);	// 縦割りBlt左から8ドット
	static TransBltFunc(BlindBlt2);	// 縦割りBlt右から8ドット
	static TransBltFunc(BlindBlt3);	// 縦割りBlt左から16ドット
	static TransBltFunc(BlindBlt4);	// 縦割りBlt右から16ドット
	static TransBltFunc(BlindBlt5);	// 横割りBlt上から8ドット
	static TransBltFunc(BlindBlt6);	// 横割りBlt下から8ドット
	static TransBltFunc(BlindBlt7);	// 横割りBlt上から16ドット
	static TransBltFunc(BlindBlt8);	// 横割りBlt下から16ドット
	static TransBltFunc(BlindBlt9);	// 右斜め割りBlt 8ドット
	static TransBltFunc(BlindBlt10);// 右斜め割りBlt 16ドット

	static TransBltFunc(BlendBlt1);	// 普通のBlendBlt

	//	Thanks ! > TearDrop_Stone

	static TransBltFunc(MosaicBlt1);// モザイク
	static TransBltFunc(FlushBlt1);	// ネガポジ反転
	static TransBltFunc(SlitCurtainBlt1);	// 左からカーテン。16 dot。
	static TransBltFunc(SlitCurtainBlt2);	// 右からカーテン。16 dot。
	static TransBltFunc(SlitCurtainBlt3);	// 左からカーテン。8 dot。
	static TransBltFunc(SlitCurtainBlt4);	// 右からカーテン。8 dot。
	static TransBltFunc(SlitCurtainBlt5);	// 上からのカーテン。16 dot。
	static TransBltFunc(SlitCurtainBlt6);	// 下からのカーテン。16 dot。
	static TransBltFunc(SlitCurtainBlt7);	// 上からのカーテン。8 dot。
	static TransBltFunc(SlitCurtainBlt8);	// 下からのカーテン。8 dot。
	static TransBltFunc(TensileBlt1);		// 画面左端から引き伸ばされ->元の画像。
	static TransBltFunc(TensileBlt2);		// 画面右端から引き伸ばされ->元の画像。
	static TransBltFunc(TensileBlt3);		// 上端から引き伸ばし->元画像。
	static TransBltFunc(TensileBlt4);		// 下端から引き伸ばし->元画像。

	// yaneSDK1stであったやつ
	static TransBltFunc(DiagonalDiffusionBlt);		// 斜めに消えていく
	static TransBltFunc(DiffusionCongeriesBlt1);	// ランダム拡散からの集積 4*2
	static TransBltFunc(DiffusionCongeriesBlt2);	// ランダム拡散からの集積 2*2
	static TransBltFunc(DiffusionCongeriesBlt3);	// ランダム拡散からの集積
	static TransBltFunc(SquashBlt);					// ぐちゃつぶれ
	static TransBltFunc(ForwardRollBlt);			// 前方回転
	static TransBltFunc(RotationBlt1);				// 画面中心回転
	static TransBltFunc(RotationBlt2);				// 画面中心回転
	static TransBltFunc(RotationBlt3);				// 画面中心回転
	static TransBltFunc(RotationBlt4);				// 画面中心回転
	static TransBltFunc(EnterUpBlt1);				// 8*8 分割下からIn
	static TransBltFunc(EnterUpBlt2);				// 16*16 分割下からIn
	static TransBltFunc(CellGatherBlt1);			// じゃみじゃみ１
	static TransBltFunc(CellGatherBlt2);			// じゃみじゃみ２

//	static TransBltFunc(WaveFadeIn1);				// ゆらめきながらFadeIn

	static vector< smart_ptr<CPlaneTransBltListener> >* GetBltListener(){
		return &m_avListener;
	}

protected:
	//	コールバック用関数
	static vector< smart_ptr<CPlaneTransBltListener> > m_avListener;

	//	SlitCurtainBltとTensileBltのアシスト関数
	static LRESULT BltTransHelper1(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
									int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,
									int WidthNum,LPRECT lpDstClipRect);
	static LRESULT BltTransHelper2(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
									int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,
									int WidthNum,LPRECT lpDstClipRect);
	static LRESULT TensileBltHelper1(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
									 int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect);
	static LRESULT TensileBltHelper2(CPlaneBase* pSrc, CPlaneBase* pDest, int x, int y,
									 int nPhase, bool Direction, int nTransMode, BYTE byFadeRate,LPRECT lpDstClipRect);


	//	ランダム化の必要なもの
	static void MakeBltTable();

	class BltTransTable {
	public:
		BltTransTable();
		BYTE   RandTable[256];	//	モザイク用ランダムパターン
	};

	static auto_ptrEx<CSinTable>		m_sin_table;
	static auto_ptrEx<BltTransTable>	m_blt_table;

};

/////////////////////////////////////////////////////////////////

#endif
