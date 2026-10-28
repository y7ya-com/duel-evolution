// yaneLayer.h
//	yaneWinHookからの改変:p
//	
//	'00/08/04	sohei

#ifndef __yaneLayer_h__
#define __yaneLayer_h__

#ifdef USE_DirectDraw
class CDirectDraw;
#endif

#ifdef USE_FastDraw
class CFastDraw;
#endif

#ifdef USE_DIB32
class CDIBDraw;
#endif

#ifdef USE_SAVER
class CSaverDraw;
#endif

class CPlaneBase;

//	CLayerは、コンストラクタで自動登録，デストラクタで自動削除
class CLayerBase {
public:
#ifdef USE_DirectDraw
	virtual	void	OnDraw(CDirectDraw*lpDraw);
#endif

#ifdef USE_FastDraw
	virtual	void	OnDraw(CFastDraw*lpDraw);
#endif

#ifdef USE_DIB32
	virtual	void	OnDraw(CDIBDraw*lpDraw);
#endif

#ifdef USE_SAVER
	virtual	void	OnDraw(CSaverDraw*lpDraw);
#endif

	// @yo2 0x00539c80 vt
	virtual	void	OnDraw(HDC) { }

	void	SetPos(int x,int y)	  { m_nX = x; m_nY = y; }	//	ポジション指定
	void	GetPos(int& x,int& y) { x = m_nX; y = m_nY; }	//	ポジション取得
	void	Enable(bool bEnable) { m_bEnable = bEnable; }	//	描画を有効にする（ディフォルトで有効）
	bool	IsEnable() { return m_bEnable; }

	CLayerBase();
	virtual ~CLayerBase();

protected:
	// @yo2 0x0052e270 vt
	virtual void	InnerOnDraw(CPlaneBase*) { }
	int		m_nX,m_nY;	//	オフセット座標
	bool	m_bEnable;
};

class CLayer : public CLayerBase {
public:
	CLayer();
	virtual ~CLayer();
};

class CAfterLayer : public CLayerBase {
public:
	CAfterLayer();
	virtual ~CAfterLayer();
};

class CHDCLayer : public CLayerBase {
public:
	CHDCLayer();
	virtual ~CHDCLayer();
};

class CLayerList {
public:
	void	Add(CLayerBase*);			//	自分自身をフックに加える
	void	Del(CLayerBase*);			//	自分自身をフックから外す
	void	Clear();					//	すべてをクリアする
	bool	IsEmpty();					//	空であるか？

	//	メッセージのDispatcher
#ifdef USE_DirectDraw
	void	OnDraw(CDirectDraw*);
#endif

#ifdef USE_FastDraw
	void	OnDraw(CFastDraw*);
#endif

#ifdef USE_DIB32
	void	OnDraw(CDIBDraw*);
#endif

#ifdef USE_SAVER
	void	OnDraw(CSaverDraw*);
#endif

	void	OnDraw(HDC);

protected:
	list<CLayerBase*>	m_LayerPtrList;	//	フックリスト
};

#endif
