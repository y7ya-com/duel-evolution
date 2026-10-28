//
//	CPlaneTransiter
//

#ifndef __yanePlaneTransiter_h__
#define __yanePlaneTransiter_h__

#include "yaneInteriorCounter.h"
#include "yanePlaneBase.h"

//	座標・ブレンド比率のシフト・大きさ・移動速度等を統括的に管理する
class CPlaneTransiter {
public:
	//	コンスト＆デスト
	CPlaneTransiter(){}
	virtual ~CPlaneTransiter() {}

	virtual void	Inc();					//	次の位置に遷移
	CPlaneTransiter& operator++() { Inc(); return (*this); }
	CPlaneTransiter operator++(int) { CPlaneTransiter _Tmp = *this; Inc(); return (_Tmp); }
	//	↑後ろ２つはvirtualでなくともIncがvirtualなのでＯＫ。
	//	ただし、最後のはCPlaneTransiterにコピーしているところが
	//	派生クラスでこれをやると危ないのだが…

	virtual void	Dec();		//	減算
	CPlaneTransiter& operator--() { Dec(); return (*this); }
	CPlaneTransiter operator--(int) { CPlaneTransiter _Tmp = *this; Dec(); return (_Tmp); }

	//	設定／取得
	virtual CInteriorCounter* GetX() { return& m_nX; }		//	座標
	virtual CInteriorCounter* GetY() { return& m_nY; }
	virtual CInteriorCounter* GetT() { return& m_nT; }		//	不透明度
	virtual CInteriorCounter* GetR() { return& m_nR; }		//	拡大縮小比率
	virtual int*			  GetB() { return& m_nB; }		//	ベース位置

	virtual void SetPlane(CPlaneBase*p){ m_lpPlane = p;}
	virtual CPlaneBase* GetPlane(){ return m_lpPlane;}

	bool	IsEnd() { return (m_nX.IsEnd() == m_nY.IsEnd() == true) ;} 

	//	これで一発表示
	virtual void	OnDraw(CPlaneBase*);	//	ここに表示する。

private:
	CInteriorCounter	m_nX,m_nY;		//	座標
	CInteriorCounter	m_nT;			//	不透明度（ブレンド比率0-256）
	CInteriorCounter	m_nR;			//	拡大縮小比率(これを256で等倍)
	int		m_nB;						//	ベース位置(0:画像中心 1:左上 2:右上 3:左下 4:右下)

	//	回転角，エフェクト等もサポートしたいのだが…

	smart_ptr<CPlaneBase>	m_lpPlane;
};

#endif
