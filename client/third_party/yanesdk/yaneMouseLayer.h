
#ifndef __yaneMouseLayer_h__
#define __yaneMouseLayer_h__

#include "yaneLayer.h"
#include "yanePlaneBase.h"
#include "yaneDirectDraw.h"
#include "yaneDIBDraw.h"

class CMouseLayer : public CAfterLayer {
public:
	void	Enable(bool bEnable); // 有効にする
	bool	IsEnable() const { return m_bEnable; }
	void	SetPlane(smart_ptr<CPlaneBase> v,int x=0,int y=0);

	CMouseLayer(smart_ptr<CPlaneBase> v,int x=0,int y=0);
	CMouseLayer();
	virtual ~CMouseLayer();

	//--- 追加 '02/02/01  by ENRA ---
	const RECT& GetLastDrawRect() { return m_LastDrawRect; }
	//-------------------------------

protected:
	void	InnerShowCursor(bool bShow);
	virtual void	InnerOnDraw(CPlaneBase*);
	bool	m_bEnable;		//	有効なのか？
	bool	m_bShow;		//	表示するのか？
	smart_ptr<CPlaneBase> m_vPlane;
	HWND	m_hWnd;
	//--- 追加 '02/02/01  by ENRA ---
	RECT	m_LastDrawRect;
	int		m_nHeight;
	int		m_nWidth;
	//-------------------------------
};

#endif
