//
//	infomation for CFastPlane
//

#ifndef __yaneFastPlaneInfo_h__
#define __yaneFastPlaneInfo_h__

#if defined(USE_FastDraw) || defined(USE_DIB32)

////////////////////////////////////////////////////////////////////////////
//	Lockしたときのサーフェース情報を保持するための構造体
////////////////////////////////////////////////////////////////////////////
class CFastPlaneInfo {
public:
	////////////////////////////////////////////////////
	//	初期化関数
	////////////////////////////////////////////////////

	void	Init(void* lpSurfacePtr,LONG lPitch,const RECT&rcRect,int nSurfaceType = 0){
		m_lpSurface = lpSurfacePtr; m_lPitch = lPitch; m_rcRect = rcRect;
		m_bInit		= true;	m_nSurfaceType = nSurfaceType;
	}
	bool	IsInit() const { return m_bInit; }
	void	SetInit(bool b) { m_bInit = b; }

	////////////////////////////////////////////////////
	//	property...
	////////////////////////////////////////////////////

	//	サーフェースの左上のポインタの設定／取得
	void*	GetPtr() const { return m_lpSurface; }
	void	SetPtr(void*lpSurface){ m_lpSurface=lpSurface; }

	//	サーフェースのラスタピッチ
	LONG	GetPitch() const { return m_lPitch; }
	void	SetPitch(LONG lPitch) { m_lPitch = lPitch; }

	//	サーフェースの広さを示す矩形設定／取得
	LPRECT	GetRect() { return& m_rcRect; }	//	サーフェースのサイズ
	void	SetRect(const RECT&rc) { m_rcRect = rc; }

	//	ビデオメモリ上のDirectDrawSurfaceをLockしとるんか？
	//	（システムメモリ上のDirectDrawSurfaceならば、これを無視して、直接読み書きしてまう！）
	bool	IsLocked() const { return m_bLock; }			//	lockされているか？
	void	SetLock(bool bLock) { m_bLock = bLock; }//	lockされているかの情報を設定する

	//	CDIB32のGetClipRectと同じ意味
	RECT	GetClipRect(LPRECT lpRect);

	//	SurfaceType(CFastPlane::GetSurfaceTypeと同じ意味)
	int		GetSurfaceType() const { return m_nSurfaceType; }
	void	SetSurfaceType(int n) { m_nSurfaceType = n; }

	CFastPlaneInfo(){
		m_bInit			= false; // 初期化されてまへんInit()してくらはい
		m_bLock			= false;
		m_lpSurface		= NULL;
		m_nSurfaceType	=	0;
	}
private:
	bool	m_bInit;			//	初期化済みか？
	void*	m_lpSurface;		//	このサーフェースの左上のピクセルのポインタ
	LONG	m_lPitch;			//	このサーフェースのピッチ
								//	（次のラスターまでのバイト数）
	RECT	m_rcRect;			//	このサーフェースのサイズ
	bool	m_bLock;			//	ロック中か？
	int		m_nSurfaceType;		//	サーフェースの種類もここに保持しておこう
	//	この数字の意味は、CFastPlane::GetSurfaceTypeと同様
};

#endif	// defined(USE_FastDraw) || defined(USE_DIB32)

#endif	// ifdef __yaneFastPlaneInfo_h__
