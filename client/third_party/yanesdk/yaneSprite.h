//	yaneChara.h :
//
//		Simple Sprite Manager
//		programmed by yaneurao '00/07/20
//
//		スプライトとは、「プレーンにおける矩形」の集合として
//		定義できる論理構造であって、描画とは切り離して考えるべき
//
//		よって、このクラスは描画に関することを行なわない
//

#ifndef __yaneSprite_h__
#define __yaneSprite_h__

#include "yanePlaneBase.h"

//	スプライト構造体(SSprite)
class SSprite {
public:
	CPlaneBase*	lpPlane;	//	プレーン
	RECT	rcRect;		//	矩形
	// ---------- 使いたければ以下のを使ってもいい ----------
	int		nOx,nOy;	//	転送オフセット
	int		nHeight;	//	ベースライン算出用
	bool	bFast;		//	抜き色無し転送か？

	//	補助
	void	SetPlane(CPlaneBase*lp);	//	プレーン全域を一つのSSpriteとする
};


//	スプライト(SSpriteの集合)
class CSpriteBase {
public:
	void	SetSprite(SSprite*);	//	スプライトを定義する lpPlane==NULLになるまで有効
	void	SetSpriteAdd(SSprite*);	//	スプライトをSSprite１つだけ追加定義する
	void	Clear(void);			//	スプライト定義のクリア

	SSprite*	GetSSprite(int nAnimation);	//　スプライトナンバーを指定してそのSSpriteを得る
	int		GetAnimationMax(void);	//	アニメーション枚数の取得

	CSpriteBase(void);
	virtual ~CSpriteBase();

protected:
	vector<SSprite>	m_Animation;
};

//	スプライト(CSpriteBaseのアニメーションカウンタ付きのもの)
class CSprite {
public:
	void	SetSprite(CSpriteBase*lpSpriteBase);	//	スプライトベースの設定

	void	SetDirection(int nDirection);			//	方向設定
	int		GetDirection(void);						//	方向取得

	void	SetOffset(int nOffsetX,int nOffsetY);	//　追加オフセット量を定義する（初期値(0,0)）
	void	GetOffset(int& nOffsetX,int& nOffsetY);	//　追加オフセット量を取得する

	void	SetLayer(int nLayer) { m_nLayer = nLayer; }
	int		GetLayer(void) { return m_nLayer; }

	void	SetMotion(int n) { m_nAnimation=n; }
	int		GetMotion(void) { return m_nAnimation; }
	void	IncMotion(void);	//	アニメーションカウンタを進める
	bool	IsEnd(void) { return m_lpSprite->GetAnimationMax()-1==m_nAnimation; }

	void	SetHeight(int nHeight) { m_nHeight=nHeight; }
	int		GetHeight(void) { return m_nHeight; }

	//	現在のDirection,AnimationカウンタのSSpriteを取得
	SSprite* GetSSprite(void);

	void	Enable(bool bEnable) { m_bVisible = bEnable; }
	bool	IsEnable(void) { return m_bVisible; }

	void	SetPos(int x,int y) { m_nX = x; m_nY = y; }
	void	GetPos(int&x,int&y) { x=m_nX; y=m_nY; }

	CSprite(void);
	virtual ~CSprite();

protected:
	CSpriteBase* m_lpSpriteBase;	//	ベーススプライト
	int		m_nDirection;		//	向いている方向
	CSpriteBase* m_lpSprite;		//	スプライト(m_lpSpriteBase+m_nDirection)
	int		m_nAnimation;		//	アニメーションカウンタ
	int		m_nX,m_nY;			//	表示位置
	int		m_nOx,m_nOy;		//	オフセット座標
	int		m_nLayer;			//	レイヤ
	int		m_nHeight;			//	高さ(キャラのベースライン算出のため)
	bool	m_bVisible;			//	表示・非表示
};

#endif
