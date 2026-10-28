//
//		GUI的ボタンクラス
//
//		programmed by yaneurao(M.Isozaki) '01/02/09-'01/02/26
//

#ifndef __yaneGUIParts_h__
#define __yaneGUIParts_h__

#include "yanePlaneTransiter.h"

class CPlaneBase;
class CMouseEx;

//////////////////////////////////////////////////////////////////////////////

//	GUI部品　基底クラス
class IGUIParts {
public:
	IGUIParts(){ m_nX = m_nY = m_nXOffset = m_nYOffset = 0; }
	// @yo2 0x005342b0 vt
	virtual ~IGUIParts() {}

	//	座標の設定
	// @yo2 0x00534350 vt
	virtual void	SetXY(int x,int y) { m_nX = x; m_nY = y; }
	// @yo2 0x00534380 vt
	virtual void	GetXY(int&x,int&y) { x = m_nX; y = m_nY; }
	// @yo2 0x005343b0 vt
	virtual void	SetXYOffset(int x,int y) { m_nXOffset = x; m_nYOffset = y; }
	// @yo2 0x005343e0 vt
	virtual void	GetXYOffset(int&x,int&y) { x = m_nXOffset; y = m_nYOffset; }

	//	実際の使用は、毎フレームこれを呼び出す
	//	CMouseExは、外部でflushしていると仮定している
	// @yo2 0x00534410 vt
	virtual LRESULT OnDraw(CPlaneBase*lp){
		LRESULT l = 0;
		l |= OnSimpleMove(lp);
		l |= OnSimpleDraw(lp);
		return l;
	}

	// @yo2 0x00534450 vt
	virtual LRESULT OnSimpleMove(CPlaneBase*){return 0;}// イベント処理のみ
	// @yo2 0x00534470 vt
	virtual LRESULT OnSimpleDraw(CPlaneBase*){return 0;}// 描画のみ

	//	マウスの設定
	// @yo2 0x00534610 vt
	virtual void	SetMouse(smart_ptr<CMouseEx> pv) { Reset(); m_pvMouse = pv; }
	// @yo2 0x005345a0 vt
	virtual smart_ptr<CMouseEx> GetMouse() { return m_pvMouse; }

protected:
	virtual void Reset() {}		//	状態のリセット
	smart_ptr<CMouseEx>			m_pvMouse;

	//	描画座標
	int			m_nX;
	int			m_nXOffset;
	int			m_nY;
	int			m_nYOffset;
};

//////////////////////////////////////////////////////////////////////////////

#endif

